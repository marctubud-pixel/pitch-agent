import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptanceDeliveryApprovalBasis as basis} from './local-acceptance-coordinator.mjs';
const envelope=()=>({envelopeHash:'native-initial',source:{artifactId:'copy-1',contentHash:'original-bytes'},taskCardHash:'confirmed-task',manifest:{verifications:[{id:'v1'}],creativePanels:[{id:'panel-1'}]},upstreamOwnerReports:[{id:'owner-report'}],manualReferences:[]});
test('downstream reference additions do not require reapproving unchanged copy',()=>{
 const e=envelope(),updated={...e,envelopeHash:'native-new-reference-envelope',manualReferences:[{id:'new-local-reference'}]};
 assert.equal(basis(e),basis(updated));assert.notEqual(e.envelopeHash,updated.envelopeHash);
});
test('content, task, supporting review and upstream owner changes still expire approval',()=>{
 const e=envelope();
 for(const updated of [{...e,source:{...e.source,contentHash:'new-bytes'}},{...e,taskCardHash:'new-task'},{...e,manifest:{...e.manifest,verifications:[{id:'new-verification'}]}},{...e,manifest:{...e.manifest,creativePanels:[{id:'new-panel'}]}},{...e,upstreamOwnerReports:[{id:'new-owner-report'}]}])assert.notEqual(basis(e),basis(updated));
});
