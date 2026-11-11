import {pendingWriteAction} from './types';
import type { ProposalWriteMeta, StageId } from '../domain/proposal';
import { ServiceError, type WorkbenchService } from '../domain/service';
import type { Services } from '../services';
import { isDemoControls, type DemoControls } from '../services/demo';
import type { LocalTeamStore } from './LocalTeamStore';
import type { HumanActor, TeamAction } from './types';

function proposalMeta(meta: ProposalWriteMeta | undefined, actor: HumanActor, creating = false): ProposalWriteMeta {
  if (!meta && !creating) throw new ServiceError('validation', '操作缺少稿件版本，请刷新后重新提交。');
  return { expectedRevision: meta?.expectedRevision ?? 0, actor: { id: actor.id, name: actor.name, role: actor.role } };
}
function editAction(stage: StageId): TeamAction {
  if (stage === 'visual' || stage === 'layout') return { kind: 'edit_visual' };
  if (stage === 'brief') return { kind: 'edit_brief' };
  if (stage === 'research') return { kind: 'edit_research' };
  return { kind: 'edit_narrative' };
}

/** Explicit legacy entry points: adding a service method requires a typed policy choice. */
type ProtectedServices = Pick<Services, 'workbench' | 'intake' | 'assistant' | 'proposals'>;
export function protectServices(raw: ProtectedServices, store: LocalTeamStore): ProtectedServices {
  const service = raw.workbench;
  const uploadPolicy = raw.proposals.getBrandResourceUploadPolicy?.bind(raw.proposals);
  const recovery = service.briefRecovery;
  const reader = service.researchReader;
  const acquisition = service.researchAcquisition;
  const simple = service.simpleStrategy;
  const originals = service.originalDocuments;
  const recoveryAction = (): TeamAction => {
    const pending = recovery?.getPending();
    if (!pending) throw new ServiceError('validation', '没有待核对的简报提交。');
    return pendingWriteAction(pending.kind);
  };
  const briefRecovery = recovery ? {
    getPending: recovery.getPending,
    retry: () => store.run(recoveryAction(), () => recovery.retry()),
    acknowledge: () => {store.require(recoveryAction()); recovery.acknowledge();},
  } : undefined;
  const workbench: WorkbenchService = {
    get environment() { return service.environment; },
    briefRecovery,
    simpleStrategy:simple?{
      get:id=>simple.get(id),
      continue:(id,input,meta)=>store.run({kind:'workflow'},actor=>simple.continue(id,input,{...meta,actor})),
      verify:(id,input,meta)=>store.run({kind:'workflow'},actor=>simple.verify(id,input,{...meta,actor})),
      reconcile:(id,input,meta)=>store.run({kind:'workflow'},actor=>simple.reconcile(id,input,{...meta,actor})),
    }:undefined,
    researchAcquisition: acquisition ? {
      get:id=>acquisition.get(id),
      start:(id,input,meta)=>store.run({kind:'workflow'},actor=>acquisition.start(id,input,{...meta,actor})),
      step:(id,input,meta)=>store.run({kind:'workflow'},actor=>acquisition.step(id,input,{...meta,actor})),
      reconcile:(id,input,meta)=>store.run({kind:'workflow'},actor=>acquisition.reconcile(id,input,{...meta,actor})),
    }:undefined,
    originalDocuments: originals ? {
      get:(id,resourceId)=>originals.get(id,resourceId),
      extract:(id,input,meta)=>store.run({kind:'manage'},actor=>originals.extract(id,input,{...meta,actor})),
    }:undefined,
    researchReader: reader ? {
      excerpts: (id,artifactId) => reader.excerpts(id,artifactId),
      revise: (id,artifactId,meta) => store.run({kind:'workflow'},actor=>reader.revise(id,artifactId,{...meta,actor})),
      dispose: (id,input,meta) => store.run({kind:'edit_research'},actor=>reader.dispose(id,input,{...meta,actor})),
      get: id => reader.get(id),
      report: (id,reportId) => reader.report(id,reportId),
      register: (id,input,meta) => store.run({kind:'edit_research'},actor=>reader.register(id,input,{...meta,actor})),
      start: (id,input,meta) => store.run({kind:'workflow'},actor=>reader.start(id,input,{...meta,actor})),
      reconcile: (id,jobId,meta) => store.run({kind:'workflow'},actor=>reader.reconcile(id,jobId,{...meta,actor})),
    } : undefined,
    subscribe: (listener) => service.subscribe(listener), setLocale: (locale) => service.setLocale(locale),
    getCapabilities: () => service.getCapabilities(), listProjects: (query) => service.listProjects(query),
    getProjectOverview: (id) => service.getProjectOverview(id), getBriefHistory: (id) => service.getBriefHistory(id),
    getResearchWorkspace: (id) => service.getResearchWorkspace(id), listSources: (id, query) => service.listSources(id, query),
    listImages: (id) => service.listImages(id), getHandoffOverview: (id) => service.getHandoffOverview(id),
    listJobs: (id) => service.listJobs(id), listArtifacts: (id) => service.listArtifacts(id),
    getArtifact: (id, artifactId) => service.getArtifact(id, artifactId),
    getBriefAttachmentFile: (id, attachmentId) => service.getBriefAttachmentFile(id, attachmentId),
    createProject: (input, meta) => store.run({ kind: 'manage' }, (actor) => service.createProject(input, { ...meta, actor })),
    saveBrief: (id, input, meta) => store.run({ kind: 'edit_brief' }, (actor) => service.saveBrief(id, input, { ...meta, actor })),
    confirmBrief: (id, meta) => store.run({ kind: 'workflow' }, (actor) => service.confirmBrief(id, { ...meta, actor })),
    addSource: (id, input, meta) => store.run({ kind: 'edit_research' }, (actor) => service.addSource(id, input, { ...meta, actor })),
    linkSourceToClaim: (id, claimId, sourceId, meta) => store.run({ kind: 'edit_research' }, (actor) => service.linkSourceToClaim(id, claimId, sourceId, { ...meta, actor })),
    addClaim: (id, input, meta) => store.run({ kind: 'edit_research' }, (actor) => service.addClaim(id, input, { ...meta, actor })),
    uploadImage: (id, input, meta) => store.run({ kind: 'edit_visual' }, (actor) => service.uploadImage(id, input, { ...meta, actor })),
    requestObservation: (id, imageId, meta) => store.run({ kind: 'workflow' }, (actor) => service.requestObservation(id, imageId, { ...meta, actor })),
    reviewObservation: (id, input, meta) => store.run({ kind: 'workflow' }, (actor) => service.reviewObservation(id, input, { ...meta, actor })),
    generateResearch: (id, meta) => store.run({ kind: 'workflow' }, (actor) => service.generateResearch(id, { ...meta, actor })),
    startVerification: (id, meta) => store.run({ kind: 'workflow' }, (actor) => service.startVerification(id, { ...meta, actor })),
    startReadinessReview: (id, meta) => store.run({ kind: 'workflow' }, (actor) => service.startReadinessReview(id, { ...meta, actor })),
    recordHandoff: (id, input, meta) => store.run({ kind: 'workflow' }, (actor) => service.recordHandoff(id, input, { ...meta, actor })),
    releaseResearch: (id, meta) => store.run({ kind: 'workflow' }, (actor) => service.releaseResearch(id, { ...meta, actor })),
    continueToStrategy: (id, meta) => store.run({ kind: 'workflow' }, (actor) => service.continueToStrategy(id, { ...meta, actor })),
    retryJob: (id, jobId, meta) => store.run({ kind: 'workflow' }, (actor) => service.retryJob(id, jobId, { ...meta, actor })),
    reconcileJob: (id, jobId, meta) => store.run({ kind: 'workflow' }, (actor) => service.reconcileJob(id, jobId, { ...meta, actor })),
  };
  const demo = isDemoControls(service) ? service : null;
  const controls: DemoControls | null = demo ? {
    getDemoState: () => demo.getDemoState(),
    setScenario: (scenario) => { store.require({ kind: 'demo' }); demo.setScenario(scenario); },
    setDropNextResponse: (enabled) => { store.require({ kind: 'demo' }); demo.setDropNextResponse(enabled); },
    armConflict: () => { store.require({ kind: 'demo' }); demo.armConflict(); },
    resetDemoData: () => store.run({ kind: 'demo' }, () => demo.resetDemoData()),
  } : null;
  return {
    workbench: controls ? Object.assign(workbench, controls) : workbench,
    intake: {
      get simulated() { return raw.intake.simulated; },
      listSamples: () => raw.intake.listSamples(), getSampleFile: (id) => raw.intake.getSampleFile(id),
      extractText: (source, progress) => store.run({ kind: 'edit_brief' }, () => raw.intake.extractText(source, progress)),
      mapToTaskCard: (doc) => store.run({ kind: 'edit_brief' }, () => raw.intake.mapToTaskCard(doc)),
    },
    assistant: {
      get simulated() { return raw.assistant.simulated; }, get available() { return raw.assistant.available; },
      getConversation: (scope) => raw.assistant.getConversation(scope), suggestions: (scope, context) => raw.assistant.suggestions(scope, context),
      ask: (scope, question, context) => store.run({ kind: 'assistant' }, () => raw.assistant.ask(scope, question, context)),
      newConversation: (scope) => store.run({ kind: 'assistant' }, () => raw.assistant.newConversation(scope)),
      subscribe: (listener) => raw.assistant.subscribe(listener),
    },
    proposals: {
      get backing() { return raw.proposals.backing; },
      getBrandResourceUploadPolicy: uploadPolicy ? () => {store.require({kind: 'read'}); return uploadPolicy();} : undefined,
      ensureBrandResourceStorage: resources => store.run({ kind: 'manage' }, () => raw.proposals.ensureBrandResourceStorage(resources)),
      stageBrandResources: (input) => store.run({ kind: 'manage' }, () => raw.proposals.stageBrandResources(input)),
      getBrandResourceFile: (id, resourceId) => { store.require({ kind: 'read' }); return raw.proposals.getBrandResourceFile(id, resourceId); },
      listProposals: () => raw.proposals.listProposals(), getProposal: (id) => raw.proposals.getProposal(id),
      findByWorkbenchId: (id) => raw.proposals.findByWorkbenchId(id), subscribe: (listener) => raw.proposals.subscribe(listener),
      createProposal: (input, meta) => store.run({ kind: 'manage' }, (actor) => raw.proposals.createProposal(input, proposalMeta(meta, actor, true))),
      setMode: (id, mode, checkpoints, meta) => store.run({ kind: 'manage' }, (actor) => raw.proposals.setMode(id, mode, checkpoints, proposalMeta(meta, actor))),
      decide: (id, stage, input, meta) => store.run({ kind: 'decide', stage }, (actor) => raw.proposals.decide(id, stage, input, proposalMeta(meta, actor))),
      contribute: (id, stage, input, meta) => store.run(input.kind === 'comment' ? { kind: 'communicate' } : editAction(stage), (actor) => raw.proposals.contribute(id, stage, input, proposalMeta(meta, actor))),
      resolveContribution: (id, contributionId, input, meta) => store.run({ kind: 'communicate' }, async (actor) => {
        const proposal = await raw.proposals.getProposal(id);
        const contribution = proposal.contributions.find((item) => item.id === contributionId);
        if (!contribution) throw new ServiceError('not_found', '找不到此条意见。');
        store.require({ kind: 'decide', stage: contribution.stage });
        return raw.proposals.resolveContribution(id, contributionId, input, proposalMeta(meta, actor));
      }),
      editNarrative: (id, sectionId, text, meta) => store.run({ kind: 'edit_narrative' }, (actor) => raw.proposals.editNarrative(id, sectionId, text, proposalMeta(meta, actor))),
      chooseLayout: (id, style, meta) => store.run({ kind: 'edit_visual' }, (actor) => raw.proposals.chooseLayout(id, style, proposalMeta(meta, actor))),
    },
  };
}
