import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSketchRunOptions,assertReferenceTerminal,assertLegacyReferenceTerminal,canRecoverSketchJob,sketchRunJobs,requireDeadOwner} from './local-sketch-runner.mjs';
test('runner requires existing case, explicit dead-owner identity and frozen image ceiling',()=>{
 const base={mode:'start',workRoot:'/private/tmp/existing',referencePid:123,imagePort:4391};
 assert.equal(validateSketchRunOptions(base).maxImageCalls,12);
 for(const patch of [{workRoot:'relative'},{referencePid:0},{imagePort:0},{maxImageCalls:9},{maxActions:151},{mode:'resume'}])assert.throws(()=>validateSketchRunOptions({...base,...patch}));
 assert.throws(()=>requireDeadOwner(process.pid),{code:'LOCAL_SKETCH_OWNER_PID_INVALID'});
});
test('reference self-reported complete alone cannot enter sketch',()=>{
 const meta={status:'complete',writerPid:123,state:{status:'complete',dossierId:'d'},projectId:'p',caseId:'m6',databasePath:'/db',imageRoot:'/im',executionRoot:'/ex',copyArtifactId:'copy'};
 const result={originalSourceUnchanged:true,modelCalls:129,projectId:'p',caseId:'m6',databasePath:'/db',imageRoot:'/im',executionRoot:'/ex',originalCopyArtifactId:'copy',dossierId:'d'};
 assertReferenceTerminal(meta,result,123);
 for(const patch of [{modelCalls:128},{originalSourceUnchanged:false},{dossierId:'other'},{caseId:'dexian'}])assert.throws(()=>assertReferenceTerminal(meta,{...result,...patch},123));
 assert.throws(()=>assertReferenceTerminal({...meta,status:'running'},result,123));
});
test('unknown calls require actual native recovery anchor, no blind redispatch',()=>{
 const job={status:'running',purpose:'image_candidate',attempts:[{}]};
 assert.equal(canRecoverSketchJob(job),false);
 assert.equal(canRecoverSketchJob({...job,attempts:[{responseEvidence:{path:'original'}}]}),true);
 assert.equal(canRecoverSketchJob({...job,purpose:'sketch_owner',attempts:[{receipt:{responseText:'not authoritative'}}]}),false);
 assert.equal(canRecoverSketchJob({...job,purpose:'sketch_review_v2',reviewRunId:'r',attempts:[{receipt:{responseText:'original'}}]}),true);
 assert.deepEqual(sketchRunJobs({jobs:[job,{purpose:'reference'},{purpose:'final_visual_image'}]}),[job]);
});

test('legacy test output requires actual retained manifest and terminal result, never fabricated RUNNER',()=>{
 const r={originalSourceUnchanged:true,modelCalls:129,selection:[{},{},{}]};
 assertLegacyReferenceTerminal([{path:'/upstream',sha256:'actual'}],r);
 assert.throws(()=>assertLegacyReferenceTerminal([],r));
 assert.throws(()=>assertLegacyReferenceTerminal([{}],{...r,modelCalls:128}));
 assert.throws(()=>validateSketchRunOptions({mode:'start',workRoot:'/tmp/case',referencePid:123,imagePort:4391,referenceFormat:'invented'}));
});
