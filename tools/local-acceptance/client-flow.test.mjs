import test from 'node:test';
import assert from 'node:assert/strict';
import {runAcceptanceFlow,flowProgress,buildHumanDecision} from './client-flow.mjs';
const flow=(n,status='pending')=>({projectRevision:n,nextAction:{module:'references',status,evidenceHash:String(n)}});
test('sequential controller advances beyond the old64-step client limit',async()=>{
 let current=flow(0),active=0,peak=0;
 const result=await runAcceptanceFlow({readCurrent:()=>current,advance:async()=>{active++;peak=Math.max(peak,active);await Promise.resolve();current=current.projectRevision===79?{...flow(80),complete:true}:flow(current.projectRevision+1);active--;return current;}});
 assert.deepEqual(result,{reason:'complete',actions:80});assert.equal(peak,1);
});
test('human and reconciliation gates never dispatch or approve another action',async()=>{
 for(const [status,reason]of [['awaiting_user','human'],['awaiting_reconciliation','awaiting_reconciliation'],['blocked','blocked'],['failed','failed']]){
  let calls=0;const result=await runAcceptanceFlow({readCurrent:()=>flow(0,status),advance:async()=>{calls++;}});assert.deepEqual(result,{reason,actions:0});assert.equal(calls,0);
 }
});
test('unknown or missing server action state never dispatches a speculative operation',async()=>{
 for(const current of [flow(0,'unknown'),flow(0,'ready'),{projectRevision:0},null]){
  let calls=0;const result=await runAcceptanceFlow({readCurrent:()=>current,advance:async()=>{calls++;return flow(1);}});
  assert.deepEqual(result,{reason:'unrecognized_state',actions:0});assert.equal(calls,0);
 }
});
test('pause waits for the one in-flight action to resolve and does not abort or duplicate it',async()=>{
 let current=flow(0),stop=false,calls=0,release;
 const running=runAcceptanceFlow({readCurrent:()=>current,shouldStop:()=>stop,advance:async()=>{calls++;await new Promise(resolve=>{release=resolve;});current=flow(1);return current;}});
 stop=true;assert.equal(calls,1);release();assert.deepEqual(await running,{reason:'paused',actions:1});assert.equal(current.projectRevision,1);assert.equal(calls,1);
});
test('unchanged progress and safety exhaustion pause without manufacturing completion',async()=>{
 let current=flow(0),calls=0;
 assert.deepEqual(await runAcceptanceFlow({readCurrent:()=>current,advance:async()=>{calls++;return current;}}),{reason:'no_progress',actions:1});assert.equal(calls,1);
 assert.deepEqual(await runAcceptanceFlow({maxActions:3,readCurrent:()=>current,advance:async()=>current=flow(current.projectRevision+1)}),{reason:'action_limit',actions:3});assert.equal(current.complete,undefined);
 assert.equal(flowProgress({...current,advanceCommand:{id:'a'}}),flowProgress({...current,advanceCommand:{id:'b'}}));
});
test('a rejected network operation is not retried or counted as successful progression',async()=>{
 let calls=0;await assert.rejects(()=>runAcceptanceFlow({readCurrent:()=>flow(0),advance:async()=>{calls++;throw Error('network result unknown');}}),/network result unknown/);assert.equal(calls,1);
});
test('strategy revision sends the typed human contribution bound to the currently viewed basis',()=>{
 const current={nextAction:{module:'strategy',status:'awaiting_user',evidenceHash:'a'.repeat(64)}},before=structuredClone(current);
 const request=buildHumanDecision(current,{commandId:'user-revise',decision:'request_revision',comment:'保留轻松社交，不解释为低度酒。'});
 assert.deepEqual(request,{commandId:'user-revise',module:'strategy',expectedBasisHash:'a'.repeat(64),decision:'revise',comment:'保留轻松社交，不解释为低度酒。',contribution:{kind:'strategy_opinion',instructions:'保留轻松社交，不解释为低度酒。'}});
 assert.deepEqual(current,before);assert.equal(buildHumanDecision(current,{commandId:'approve',decision:'approve'}).contribution,undefined);
});
test('unconnected revision stages, empty opinions and unviewed bases cannot dispatch a fabricated contribution',()=>{
 const current={nextAction:{module:'strategy',status:'awaiting_user',evidenceHash:'a'.repeat(64)}};
 assert.throws(()=>buildHumanDecision(current,{commandId:'empty',decision:'revise',comment:' '}),/填写策略修改意见/);
 assert.throws(()=>buildHumanDecision({...current,nextAction:{...current.nextAction,module:'copy'}},{commandId:'copy',decision:'revise',comment:'不能猜测目标方向'}),/尚未接入/);
 assert.throws(()=>buildHumanDecision({...current,nextAction:{...current.nextAction,evidenceHash:undefined}},{commandId:'bad',decision:'approve'}),/刷新/);
 assert.throws(()=>buildHumanDecision({...current,nextAction:{...current.nextAction,status:'pending'}},{commandId:'premature',decision:'approve'}),/刷新/);
});
function copyFlow(){return {nextAction:{module:'copy',status:'awaiting_user',underlyingStatus:'complete',evidenceHash:'a'.repeat(64)},copyThemeInput:{kind:'copy_theme',expectedBasisHash:'a'.repeat(64),artifactId:'current-copy',contentHash:'b'.repeat(64),directions:[{id:'steady',title:'稳健',slogan:'当前稳健主题'},{id:'product',title:'品牌特征',slogan:'当前品牌主题'},{id:'user',title:'情绪',slogan:'当前用户主题'}],origin:'human-preference-not-evidence',factualAuthority:false}};}
test('copy theme submission explicitly selects a currently offered direction and retains the viewed basis',()=>{
 const flow=copyFlow(),before=structuredClone(flow);
 const request=buildHumanDecision(flow,{commandId:'human-theme',decision:'request_revision',comment:'保留品牌边界',directionId:'product',themeText:'新的品牌主题',intendedUse:'突出品牌特征，不改另两个方向'});
 assert.deepEqual(request,{commandId:'human-theme',module:'copy',expectedBasisHash:'a'.repeat(64),decision:'revise',comment:'保留品牌边界',contribution:{kind:'copy_theme',directionId:'product',text:'新的品牌主题',intendedUse:'突出品牌特征，不改另两个方向'}});
 assert.deepEqual(flow,before);
});
test('copy inputs cannot reuse a stale catalog, guess a direction, omit intent or escape a pending decision',()=>{
 const request={commandId:'scope',decision:'revise',directionId:'product',themeText:'新的主题',intendedUse:'明确展开方式'};
 assert.throws(()=>buildHumanDecision({...copyFlow(),copyThemeInput:{...copyFlow().copyThemeInput,expectedBasisHash:'c'.repeat(64)}},request),/过时/);
 assert.throws(()=>buildHumanDecision(copyFlow(),{...request,directionId:'missing'}),/明确选择/);
 assert.throws(()=>buildHumanDecision(copyFlow(),{...request,intendedUse:' '}),/希望如何展开|希望如何|填写主题文案/);
 const pending=copyFlow();pending.nextAction.status='awaiting_reconciliation';assert.throws(()=>buildHumanDecision(pending,request),/刷新/);
});
test('approving the current copy does not silently submit populated theme fields',()=>{
 const request=buildHumanDecision(copyFlow(),{commandId:'approve-copy',decision:'approve',directionId:'user',themeText:'这个输入不应自动采纳',intendedUse:'另一个意见'});
 assert.deepEqual(request,{commandId:'approve-copy',module:'copy',expectedBasisHash:'a'.repeat(64),decision:'approve',comment:''});
});
