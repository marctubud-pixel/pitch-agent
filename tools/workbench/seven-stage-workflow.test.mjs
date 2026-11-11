import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKFLOW_VERSION, WORKFLOW_STAGES, createWorkflow, requireResearchWorkflow, assertWorkflowStage, workflowView} from './seven-stage-workflow.mjs';
const project = () => ({workflow:createWorkflow(WORKFLOW_VERSION),activeTaskCardId:'brief-1',taskCards:[{id:'brief-1'}],confirmations:[],artifacts:[],activeByStage:{},jobs:[]});
const checks = () => ['verification','readiness','delivery','acceptance','release','reader_loop'].map(id=>({id,passed:true,detail:'Actual native check'}));
const research = p => {p.confirmations.push({taskCardId:'brief-1'});p.artifacts.push({id:'research-1',stage:'research',inputVersionIds:['brief-1']});p.activeByStage.research='research-1';return {artifactId:'research-1',checks:checks()};};
test('new workflow fixes seven business stages and separates visual substeps', () => {
 const p=project();
 assert.equal(p.workflow.version,'proposal-seven-v1');
 assert.deepEqual(WORKFLOW_STAGES,['brief','research','strategy','themes','visual','layout','delivery']);
 assert.deepEqual(p.workflow.stages,WORKFLOW_STAGES);
 assert.deepEqual(p.workflow.internalSteps.visual,['references','sketch','visual']);
 assert.equal(p.workflow.stages.includes('content_review'),false);
});
test('old snapshots keep existing stage guards but cannot enter the new research route', () => {
 const p=project();delete p.workflow;
 assert.doesNotThrow(()=>assertWorkflowStage(p,'layout'));
 assert.throws(()=>requireResearchWorkflow(p),{code:'SEVEN_STAGE_WORKFLOW_REQUIRED'});
 const view=workflowView(p);
 assert.equal(view.supported,false);assert.equal(view.research.status,'historical');
 assert.equal(view.complete,false);
});
test('unknown or malformed versions never become current seven-stage projects', () => {
 assert.throws(()=>createWorkflow('proposal-eight-v1'),{code:'WORKFLOW_VERSION_UNSUPPORTED'});
 for(const workflow of [{version:'proposal-eight-v1'}, {...createWorkflow(),stages:['brief','research','content_review']}]) {
  const p={...project(),workflow};
  assert.throws(()=>requireResearchWorkflow(p),{code:'WORKFLOW_VERSION_UNSUPPORTED'});
  assert.throws(()=>assertWorkflowStage(p,'research'),{code:'WORKFLOW_VERSION_UNSUPPORTED'});
  assert.equal(workflowView(p).supported,false);
 }
});
test('new projects expose research production only; downstream and old content review routes are refused', () => {
 const p=project();
 assert.equal(requireResearchWorkflow(p).version,WORKFLOW_VERSION);
 assert.doesNotThrow(()=>assertWorkflowStage(p,'research'));
 for(const stage of ['strategy','copy','references','sketch','visual','content_review','layout','final_review','unknown']) assert.throws(()=>assertWorkflowStage(p,stage),{code:'SEVEN_STAGE_ROUTE_REQUIRED'});
});
test('confirmation completes Brief only and never invents research results', () => {
 const p=project();
 assert.equal(workflowView(p).stages[0].status,'in_progress');
 p.confirmations.push({taskCardId:'brief-1'});
 const view=workflowView(p);
 assert.equal(view.stages[0].status,'complete');
 assert.equal(view.research.status,'not_started');
 assert.equal(view.research.checks.every(check=>check.passed===false),true);
});
test('a current artifact alone is not an independently checked or released research', () => {
 const p=project(), actual=research(p);
 assert.equal(workflowView(p).research.status,'needs_verification');
 for(const omission of ['verification','readiness','delivery','acceptance','release','reader_loop']) {
  const view=workflowView(p,{researchWorkflow:{...actual,checks:actual.checks.filter(check=>check.id!==omission)}});
  assert.notEqual(view.research.status,'released');
  assert.equal(view.research.checks.find(check=>check.id===omission).passed,false);
 }
 const duplicate={...actual,checks:[...actual.checks,{id:'release',passed:true}]};
 assert.notEqual(workflowView(p,{researchWorkflow:duplicate}).research.status,'released');
 const wrong={...actual,artifactId:'historical-research'};
 assert.equal(workflowView(p,{researchWorkflow:wrong}).research.checks.every(check=>check.passed===false),true);
});
test('native verification, delivery, acceptance and release remain distinct states', () => {
 const p=project(), actual=research(p);
 for(const [blocked,status] of [['verification','needs_verification'],['readiness','needs_verification'],['delivery','awaiting_delivery'],['acceptance','awaiting_acceptance'],['release','awaiting_release']]) {
  const checks=actual.checks.map(check=>({...check,passed:check.id!==blocked,detail:check.id===blocked?'Actual domain refusal':check.detail}));
  const view=workflowView(p,{researchWorkflow:{...actual,checks}});
  assert.equal(view.research.status,status);assert.equal(view.research.checks.find(check=>check.id===blocked).detail,'Actual domain refusal');
 }
 const view=workflowView(p,{researchWorkflow:actual});
 assert.equal(view.research.status,'released');
 assert.equal(view.research.canContinueToStrategy,false);assert.equal(view.complete,false);
 assert.deepEqual(view.stages.slice(2).map(stage=>stage.status),['not_started','not_started','not_started','not_started','not_started']);
});
test('changing the confirmed Brief invalidates research without deleting the historical artifact or checks', () => {
 const p=project(), actual=research(p), before=structuredClone(p);
 p.taskCards.push({id:'brief-2'});p.activeTaskCardId='brief-2';
 p.confirmations.push({taskCardId:'brief-2'});
 const snapshot=structuredClone(p), view=workflowView(p,{researchWorkflow:actual});
 assert.equal(view.research.status,'stale');assert.equal(view.research.current,false);
 assert.equal(view.research.artifactId,'research-1');assert.equal(view.research.checks.every(check=>!check.passed),true);
 assert.deepEqual(p,snapshot);assert.deepEqual(p.artifacts,before.artifacts);
});
test('old research remains historical even when supplied positive checks', () => {
 const p=project(), actual=research(p);delete p.workflow;
 const view=workflowView(p,{researchWorkflow:actual});
 assert.equal(view.research.artifactId,'research-1');assert.equal(view.research.status,'historical');
 assert.equal(view.research.checks.every(check=>!check.passed),true);
});
