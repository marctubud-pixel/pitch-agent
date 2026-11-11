import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLocalReferenceEvidence} from './local-reference-evidence.mjs';
const options={executionRoot:'/tmp/local-test',imageStore:{read(){throw Error('must not read unregistered image');}}};
test('reference completion cannot use an ordinary artifact or an unregistered dossier',async()=>{
 const p={activeByStage:{copy:'actual-copy'},artifacts:[{id:'invented-ref-artifact'}],referenceDossiers:[]};
 await assert.rejects(()=>verifyLocalReferenceEvidence(p,{dossierId:'invented',resultIds:['invented-ref-artifact']},options),{code:'ACCEPTANCE_REFERENCE_DOSSIER_REQUIRED'});
});
test('reference completion requires managed image reading and current copy identity',async()=>{
 await assert.rejects(()=>verifyLocalReferenceEvidence({},{}),{code:'ACCEPTANCE_REFERENCE_RESOURCES_REQUIRED'});
 const p={activeByStage:{copy:'current'},referenceDossiers:[{id:'d',envelope:{source:{source:{artifactId:'old'}}}}]};
 await assert.rejects(()=>verifyLocalReferenceEvidence(p,{dossierId:'d',resultIds:['d']},options),{code:'ACCEPTANCE_REFERENCE_COPY_CHANGED'});
});
test('a previous dossier for the same copy cannot substitute for the latest reference work',async()=>{
 const dossier=id=>({id,envelope:{source:{source:{artifactId:'current-copy'}}}});
 const p={activeByStage:{copy:'current-copy'},referenceDossiers:[dossier('previous'),dossier('latest')]};
 await assert.rejects(()=>verifyLocalReferenceEvidence(p,{dossierId:'previous',resultIds:['previous']},options),{code:'ACCEPTANCE_REFERENCE_NOT_LATEST'});
});
