import {researchWorkflowWithReaderOriginals} from './research-reader-workflow.mjs';
import {APPLICABILITY_PROTOCOL} from './research-applicability.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {verifyResearchReaderOriginal} from './research-reader-original.mjs';
import {SEMANTIC_PROTOCOL} from './semantic-authority.mjs';
import {createExecutor} from './executor.mjs';
import {DomainError, inputsFor, researchWorkflowView, researchReaderTarget, researchQuestionRegistration} from './project.mjs';
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
  const researchConfigured=()=>Boolean(executor)&&['research','verification','readiness','semantic','strategy'].every(configured);
  const capability = () => ({configured: researchConfigured(), executionAllowed,
    reader: {configured: researchConfigured() && configured('reader'), scope:'saved-report-prose', recheckAvailable:researchConfigured()&&configured('reader')},
    method: researchMethodIdentity(), handoffAvailable:researchConfigured()&&configured('reader'), reason: !executionAllowed ? '真实研究执行尚未授权启用；可读取原件与登记来源。' : '研究、独立核验和负责人模型需全部配置，后续策略执行仍关闭。'});
  const project = id => {const p = store.read(id); requireResearchWorkflow(p); return p;};
  const ready = id => {const p = project(id); inputsFor(p, 'research'); need(capability().configured, 'RESEARCH_EXECUTION_UNAVAILABLE', capability().reason); return p;};
  const execute = async (id, jobId) => {
    const p = project(id), job = p.jobs.find(item => item.id === jobId);
    need(job && job.stage === 'research' && ['stage', 'verification', 'readiness', 'coverage_challenge', 'handoff', 'research_reader'].includes(job.purpose ?? 'stage'), 'RESEARCH_ROUTE_REQUIRED', '只执行本次请求的研究任务。');
    if (job.status === 'queued') await executor.execute(id, jobId);
    return jobId;
  };
  const resumeQueued = async (id, jobId, artifactId, role) => {
    const p = project(id), job = p.jobs.find(j => j.id === jobId);
    if (job.status !== 'queued' || job.attempts.length) return jobId;
    ready(id);
    need(configured(role), 'RESEARCH_READER_UNCONFIGURED', '独立读者尚未配置。');
    need(isDeepStrictEqual(job.binding, bindings[role]), 'RESEARCH_MODEL_BINDING_CHANGED', '原任务的模型绑定已改变，不能续执行。');
    const artifact = p.artifacts.find(a => a.id === artifactId);
    need(p.activeByStage.research === artifactId && artifact?.inputVersionIds.includes(p.activeTaskCardId), 'STALE_RESEARCH_READER', '历史研究任务不能续执行。');
    if (role === 'reader') researchReaderTarget(p, job);
    else {
      need(job.task.taskCardId === p.activeTaskCardId, 'STALE_RESEARCH_READER', '修订任务属于历史任务卡。');
      need(isDeepStrictEqual(job.task.researchMethod, researchMethodIdentity()) && isDeepStrictEqual(job.task.researchQuestionRegistration ?? null, researchQuestionRegistration(p)), 'RESEARCH_QUESTIONS_CHANGED', '修订任务的研究方法或问题计划已改变。');
    }
    return execute(id, jobId);
  };
  return {
    capability,
    async readerReport(id, reportId) {
      const p=project(id),report=(p.researchReaderReports??[]).find(r=>r.id===reportId);
      need(report,'NOT_FOUND','没有该项目的独立读者报告。');
      return {report,original:await verifyResearchReaderOriginal(p,report,{executionRoot:rootDir})};
    },
    registerQuestions(id, request, context) {
      const p=project(id);
      if(Object.hasOwn(p.processedCommands,request.commandId)){
        const prior=JSON.parse(p.processedCommands[request.commandId]);
        need(prior.kind==='register-research-questions'&&isDeepStrictEqual(prior.request,request),'COMMAND_ID_REUSED','问题登记命令属于另一份原始提交。');
        need(p.researchQuestionRegistrations?.some(r=>r.id===prior.registrationId),'RESEARCH_QUESTIONS_REQUIRED','原问题登记缺失。');
        return {registrationId:prior.registrationId};
      }
      inputsFor(p,'research');
      const registrationId=`questions-${createHash('sha256').update(JSON.stringify([id,request.commandId])).digest('hex')}`;
      store.command(id,{kind:'register-research-questions',registrationId,taskCardId:p.activeTaskCardId,method:researchMethodIdentity(),questions:request.questions,readerCount:request.readerCount,request:structuredClone(request),commandId:request.commandId,expectedRevision:request.expectedRevision},context);
      return {registrationId};
    },
    async readReport(id, request) {
      const p=project(id);
      if(p.jobs.some(j=>j.purpose==='research_reader'&&j.task?.request?.commandId===request.commandId)){
        const reader=executor??createExecutor({store,rootDir});
        const jobId=await reader.enqueueResearchReader(id,request.artifactId,request);
        return {jobId:await resumeQueued(id,jobId,request.artifactId,'reader')};
      }
      ready(id);need(capability().reader.configured,'RESEARCH_READER_UNCONFIGURED','独立读者尚未配置。');
      const jobId=await executor.enqueueResearchReader(id,request.artifactId,request);await execute(id,jobId);return {jobId};
    },
    async disposeReader(id,request,context) {project(id);const reader=executor??createExecutor({store,rootDir});return reader.recordResearchReaderDispositions(id,request,context);},
    async reconcileReader(id, request) {project(id); const reader=executor??createExecutor({store,rootDir});const job=await reader.reconcileResearchReader(id,request.jobId,request);return {jobId:job.id};},
    workflow: id => {const p = project(id); return executor ? executor.researchWorkflow(id) : researchWorkflowView(p);},
    workflowSnapshot: p => researchWorkflowWithReaderOriginals(p,researchWorkflowView(p,{bindings,providers}),{executionRoot:rootDir}),
    content: (id, artifactId) => {const p = project(id), a = p.artifacts.find(item => item.id === artifactId); need(a?.stage === 'research', 'RESEARCH_ROUTE_REQUIRED', '本入口只读取研究原件。'); return readArtifactContent(p, artifactId, rootDir);},
    async generate(id, request) {
      const p = ready(id);
      const sourceRecords = registeredSources(p, request.sourceEntryIds, 'http://127.0.0.1');
      const jobId = executor.enqueue(id, 'research', {...request, sourceRecords});
      await execute(id, jobId); return {jobId};
    },
    async revise(id,request) {
      const p=project(id);
      if(p.jobs.some(j=>j.task?.revisionRequest?.commandId===request.commandId)){
        const reader=executor??createExecutor({store,rootDir}),jobId=await reader.enqueueRevision(id,request);
        return {jobId:await resumeQueued(id,jobId,request.artifactId,'research')};
      }
      ready(id);const jobId=await executor.enqueueRevision(id,request);await execute(id,jobId);return {jobId};
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
