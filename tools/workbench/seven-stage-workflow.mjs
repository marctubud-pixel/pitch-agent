export const WORKFLOW_VERSION = 'proposal-seven-v1';
export const WORKFLOW_STAGES = Object.freeze(['brief', 'research', 'strategy', 'themes', 'visual', 'layout', 'delivery']);
const VISUAL_STEPS = Object.freeze(['references', 'sketch', 'visual']);
const RESEARCH_CHECKS = Object.freeze(['verification', 'readiness', 'delivery', 'acceptance', 'release', 'reader_loop']);
const BACKEND_STAGES = {research: 'research', strategy: 'strategy', themes: 'copy', visual: 'visual', layout: 'layout', delivery: 'final_review'};
function fail(code, message) {throw Object.assign(new Error(message), {code, status: 422});}
export function createWorkflow(version = WORKFLOW_VERSION) {
 if (version !== WORKFLOW_VERSION) fail('WORKFLOW_VERSION_UNSUPPORTED', 'Unsupported proposal workflow version');
 return Object.freeze({version, stages: WORKFLOW_STAGES, internalSteps: Object.freeze({visual: VISUAL_STEPS})});
}
export function requireResearchWorkflow(project) {
 const workflow = project?.workflow;
 if (!workflow) fail('SEVEN_STAGE_WORKFLOW_REQUIRED', 'Current seven-stage workflow is required');
 if (workflow.version !== WORKFLOW_VERSION || JSON.stringify(workflow.stages) !== JSON.stringify(WORKFLOW_STAGES)
   || JSON.stringify(workflow.internalSteps?.visual) !== JSON.stringify(VISUAL_STEPS)) fail('WORKFLOW_VERSION_UNSUPPORTED', 'Unsupported or malformed proposal workflow');
 return workflow;
}
export function assertWorkflowStage(project, backendStage) {
 if (!project?.workflow) return; // Existing snapshots retain their existing domain guards.
 requireResearchWorkflow(project);
 if (backendStage !== 'research') fail('SEVEN_STAGE_ROUTE_REQUIRED', 'This workflow currently permits research production only');
}
export function workflowView(project, {researchWorkflow} = {}) {
 let supported = false;
 try {requireResearchWorkflow(project); supported = true;} catch { /* Unknown and historical protocols stay read-only. */ }
 const activeTask = project.taskCards?.find(item => item.id === project.activeTaskCardId);
 const confirmed = Boolean(activeTask && project.confirmations?.some(item => item.taskCardId === activeTask.id));
 const artifactId = project.activeByStage?.research ?? null;
 const artifact = project.artifacts?.find(item => item.id === artifactId && item.stage === 'research');
 const current = Boolean(supported && confirmed && artifact && Array.isArray(artifact.inputVersionIds)
   && artifact.inputVersionIds.includes(activeTask.id)
   && !artifact.inputVersionIds.some(id => id !== activeTask.id && project.taskCards?.some(item => item.id === id)));
 const sameResearch = current && researchWorkflow?.artifactId === artifactId;
 const checks = RESEARCH_CHECKS.map(id => {
   const matches = sameResearch && Array.isArray(researchWorkflow.checks) ? researchWorkflow.checks.filter(item => item.id === id) : [];
   if (matches.length !== 1) return {id, passed: false, detail: 'Current native research check is missing or ambiguous'};
   return {...matches[0], id, passed: matches[0].passed === true};
 });
 const status = !supported ? 'historical' : !artifact ? 'not_started' : !current ? 'stale'
   : !checks[0].passed || !checks[1].passed || !checks[5].passed ? 'needs_verification'
   : !checks[2].passed ? 'awaiting_delivery' : !checks[3].passed ? 'awaiting_acceptance'
   : !checks[4].passed ? 'awaiting_release' : 'released';
 const stages = WORKFLOW_STAGES.map(stage => {
   if (stage === 'brief') return {stage, status: !supported ? 'historical' : confirmed ? 'complete' : 'in_progress', artifactId: activeTask?.id ?? null};
   if (stage === 'research') return {stage, status, artifactId};
   const id = project.activeByStage?.[BACKEND_STAGES[stage]] ?? null;
   return {stage, status: id ? 'historical' : 'not_started', artifactId: id};
 });
 return {version: project.workflow?.version ?? null, supported, stages,
   research: {artifactId, current, status, checks, canContinueToStrategy: false}, complete: false};
}
