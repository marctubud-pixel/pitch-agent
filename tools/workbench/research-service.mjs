import {APPLICABILITY_PROTOCOL} from './research-applicability.mjs';
import {SEMANTIC_PROTOCOL} from './semantic-authority.mjs';
import {createExecutor} from './executor.mjs';
import {DomainError, inputsFor, researchWorkflowView} from './project.mjs';
import {registeredSources} from './research-sources.mjs';
import {readArtifactContent} from './artifact-content.mjs';
import {researchMethodIdentity} from './research-method.mjs';
import {requireResearchWorkflow} from './seven-stage-workflow.mjs';

const need = (value, code, message) => {if (!value) throw new DomainError(code, message);};
export function createResearchService({store, rootDir, executionAllowed = false, ...options}) {
  need(typeof rootDir === 'string' && rootDir.trim(), 'RESEARCH_ROOT_REQUIRED', '需要独立研究原件目录。');
  const {bindings = {}, providers = {}} = options;
  // Construction does not recover or scan jobs; execution below names one current job only.
  let semanticLease = null;
  if (executionAllowed && bindings.readiness && bindings.semantic) {
    const configuration={readinessBinding:bindings.readiness,challengeBinding:bindings.semantic,rubricVersion:SEMANTIC_PROTOCOL};
    semanticLease=store.semanticConfiguration()?store.attachSemanticConfiguration(configuration):store.registerSemanticConfiguration(configuration,{expectedEpoch:0});
  }
  const executor = executionAllowed ? createExecutor({store, rootDir, ...options, semanticLease}) : null;
  const configured = role => {const binding = bindings[role]; return Boolean(binding && providers[binding.providerId]?.model === binding.model);};
  const capability = () => ({configured: Boolean(executor) && ['research', 'verification', 'readiness', 'semantic', 'strategy'].every(configured), executionAllowed,
    method: researchMethodIdentity(), handoffAvailable:false, reason: !executionAllowed ? '真实研究执行尚未授权启用；可读取原件与登记来源。' : '研究、独立核验和负责人模型需全部配置，后续策略执行仍关闭。'});
  const project = id => {const p = store.read(id); requireResearchWorkflow(p); return p;};
  const ready = id => {const p = project(id); inputsFor(p, 'research'); need(capability().configured, 'RESEARCH_EXECUTION_UNAVAILABLE', capability().reason); return p;};
  const execute = async (id, jobId) => {
    const p = project(id), job = p.jobs.find(item => item.id === jobId);
    need(job && job.stage === 'research' && ['stage', 'verification', 'readiness', 'coverage_challenge', 'handoff'].includes(job.purpose ?? 'stage'), 'RESEARCH_ROUTE_REQUIRED', '只执行本次请求的研究任务。');
    if (job.status === 'queued') await executor.execute(id, jobId);
    return jobId;
  };
  return {
    capability,
    workflow: id => {const p = project(id); return executor ? executor.researchWorkflow(id) : researchWorkflowView(p);},
    content: (id, artifactId) => {const p = project(id), a = p.artifacts.find(item => item.id === artifactId); need(a?.stage === 'research', 'RESEARCH_ROUTE_REQUIRED', '本入口只读取研究原件。'); return readArtifactContent(p, artifactId, rootDir);},
    async generate(id, request) {
      const p = ready(id);
      const sourceRecords = registeredSources(p, request.sourceEntryIds, 'http://127.0.0.1');
      const jobId = executor.enqueue(id, 'research', {...request, sourceRecords});
      await execute(id, jobId); return {jobId};
    },
    async verify(id, request) {ready(id); const jobId = await executor.enqueueVerification(id, request.artifactId, request); await execute(id, jobId); return {jobId};},
    async assess(id, request) {
      const before=ready(id), derivedId=`${request.commandId}:semantic`;
      const prior=before.jobs.find(j=>j.task?.request?.commandId===derivedId);
      if(prior)need(prior.purpose==='coverage_challenge'&&prior.targetArtifactId===request.artifactId&&prior.task.request.artifactId===request.artifactId,'COMMAND_ID_REUSED','Derived semantic command belongs to a different task');
      else need(!Object.hasOwn(before.processedCommands,derivedId),'COMMAND_ID_REUSED','Derived semantic command is already in use');
      const jobId = await executor.enqueueReadiness(id, request.artifactId, {...request, protocolVersion: APPLICABILITY_PROTOCOL});
      await execute(id, jobId);
      const p=project(id), original=p.jobs.find(j=>j.id===jobId);
      if(original.status==='succeeded'){
        const commandId=derivedId, previous=p.jobs.find(j=>j.task?.request?.commandId===commandId);
        if(previous)need(previous.purpose==='coverage_challenge'&&previous.targetArtifactId===request.artifactId&&previous.task.request.artifactId===request.artifactId,'COMMAND_ID_REUSED','Derived semantic command belongs to a different task');
        const challengeId=previous?.id ?? await executor.enqueueSemanticChallenge(id,request.artifactId,{commandId,expectedRevision:p.revision});
        await execute(id,challengeId);
      }
      return {jobId};
    },
    async handoff(id, request, context) {ready(id); const receipt = await executor.recordResearchHandoff(id, request, context); if (receipt.jobId) await execute(id, receipt.jobId); return receipt;},
    async release(id, request, context) {ready(id); return executor.releaseResearch(id, request, context);},
  };
}
