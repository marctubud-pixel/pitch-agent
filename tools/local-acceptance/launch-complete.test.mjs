import test from 'node:test';
import assert from 'node:assert/strict';
import {completeLaunchOptions,guardCompletePipeline,closeCompleteOwned} from './launch-complete.mjs';
test('complete launcher requires explicit config and isolated literal loopback ports; low-space guard precedes admitted mutations',async()=>{
 assert.throws(()=>completeLaunchOptions({}),{code:'LOCAL_COMPLETE_NATIVE_CONFIG_PATH_REQUIRED'});
 const config={LOCAL_COMPLETE_NATIVE_CONFIG:'/trusted/native-config.json'},options=completeLaunchOptions(config,'/isolated');assert.deepEqual(options,{nativeConfigPath:'/trusted/native-config.json',dataRoot:'/isolated/.data/local-complete-acceptance',port:4450,imagePort:4451,host:'127.0.0.1'});
 for(const patch of [{LOCAL_COMPLETE_PORT:'4280'},{LOCAL_COMPLETE_PORT:'4380'},{LOCAL_COMPLETE_IMAGE_PORT:'4390'},{LOCAL_COMPLETE_IMAGE_PORT:'4450'},{LOCAL_COMPLETE_PORT:'0'},{LOCAL_COMPLETE_PORT:'abc'}])assert.throws(()=>completeLaunchOptions({...config,...patch}));
 let effects=0;const pipeline={create:()=>effects++,advance:()=>effects++,decide:()=>effects++,uploadReference:()=>effects++,submitReferenceMaterial:()=>effects++,withdrawReferenceMaterial:()=>effects++,read:()=> 'readonly'},guard=guardCompletePipeline(pipeline,async()=>{throw Object.assign(Error('low disk'),{code:'LOCAL_COMPLETE_DISK_HEADROOM'});});
 for(const method of ['create','advance','decide','uploadReference','submitReferenceMaterial','withdrawReferenceMaterial'])await assert.rejects(()=>guard[method](),{code:'LOCAL_COMPLETE_DISK_HEADROOM'});assert.equal(effects,0);assert.equal(guard.read(),'readonly');
});
test('startup cleanup closes every owned component despite failures and never closes unstarted listeners',async()=>{
 const sequence=[],owned={app:{server:{listening:true},close:async()=>{sequence.push('app');throw Error('close error');}},imageServer:{listening:true,close:cb=>{sequence.push('image');cb();}},pipeline:{close:()=>sequence.push('pipeline')},projectStore:{close:()=>sequence.push('project')},editableStore:{close:()=>sequence.push('editable')}};
 await assert.rejects(()=>closeCompleteOwned(owned),AggregateError);assert.deepEqual(sequence,['app','image','pipeline','project','editable']);
 await closeCompleteOwned({app:{server:{listening:false},close:()=>assert.fail('unstarted app')},imageServer:{listening:false,close:()=>assert.fail('unstarted image')}});
});
