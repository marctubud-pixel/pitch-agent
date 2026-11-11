import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,realpath,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadLaunchSettings,buildLaunchOptions,assertValidatedLaunchSettings} from './launch-config.mjs';
import {createCompleteContentRuntime} from './complete-content-runtime.mjs';
import {contentNodes,CONTENT_PROTOCOL} from './complete-content.mjs';
import {fixture as finalFixture} from './final-review-input-fixture.mjs';
const httpConfig=()=>({adapter:'workbench-model-http-v1',endpoint:'http://127.0.0.1:1/synthetic',model:'owned',serviceIdentity:'owned',authentication:{kind:'bearer-env',name:'OWNED_UNSET_SYNTHETIC_CREDENTIAL'},allowLoopbackHttp:true,timeoutMs:30000,maxRequestBytes:64*1024*1024,maxResponseBytes:16*1024*1024,maxOutputBytes:2*1024*1024,vision:true,envelopes:['complete-content-v1'],resourceProfile:'bounded-json-v1'});
async function fixture(){
 const root=await realpath(await mkdtemp('/private/tmp/composed-launch-http-')),file=join(root,'deployment.json');
 const raw={schemaVersion:'workbench-launch-v1',server:{port:4181,dbPath:'owned.sqlite',executionRoot:'executions'},textProviders:{owned:httpConfig()},bindings:{research:{providerId:'owned',model:'owned',role:'research-lead'}}};
 const load=async()=>{await writeFile(file,JSON.stringify(raw));return loadLaunchSettings({configPath:file});};
 return {root,file,raw,load};
}
test('ordinary HTTP launch preserves the owner configuration and validated immutable launch identity without reading credentials',async()=>{
 const f=await fixture();for(const bounded of [false,true]){
  if(!bounded)delete f.raw.textProviders.owned.resourceProfile;else f.raw.textProviders.owned.resourceProfile='bounded-json-v1';
  const settings=await f.load(),options=buildLaunchOptions(settings),provider=options.providers.owned;
  assertValidatedLaunchSettings(settings);assert(Object.isFrozen(settings));assert(Object.isFrozen(provider.operatorConfig));
  assert.equal(options.launchConfiguration,settings);assert.equal(provider.adapter,'workbench-model-http-v1');assert.equal(provider.model,'owned');assert.deepEqual(provider.operatorConfig,f.raw.textProviders.owned);assert.equal(provider.execute,undefined);
  assert.equal(JSON.parse(await readFile(f.file,'utf8')).textProviders.owned.authentication.name,'OWNED_UNSET_SYNTHETIC_CREDENTIAL');
 }
});
test('ordinary HTTP launch rejects unknown config, unsafe endpoint, secret values, protocol and resource drift before creating a provider',async()=>{
 const f=await fixture();const changes=[p=>p.endpoint='http://localhost:1/model',p=>p.endpoint='https://user:secret@example.invalid/model',p=>p.endpoint='https://example.invalid/model?secret=x',p=>p.allowLoopbackHttp=false,p=>p.authentication={kind:'bearer',token:'synthetic'},p=>p.authentication={kind:'bearer-env',name:'invalid name'},p=>p.resourceProfile='future-json',p=>p.envelopes.push('final-review-v1'),p=>p.maxOutputBytes=2*1024*1024+1,p=>p.headers={x:'custom'},p=>delete p.timeoutMs];
 for(const change of changes){f.raw.textProviders.owned=httpConfig();change(f.raw.textProviders.owned);await assert.rejects(f.load,{code:'INVALID_MODEL_HTTP_CONFIGURATION'});}
});
test('ordinary HTTP launch requires explicit configuration and preserves historical CLI and missing-provider behavior',async()=>{
 const f=await fixture();f.raw.textProviders.owned={adapter:'codex-cli',model:'owned'};const settings=await f.load(),options=buildLaunchOptions(settings);assert.equal(typeof options.providers.owned.execute,'function');assert.equal(options.providers.owned.model,'owned');assertValidatedLaunchSettings(settings);
 delete f.raw.textProviders.owned;await assert.rejects(f.load,{code:'BINDING_MODEL_MISMATCH'});f.raw.bindings={};assert.deepEqual(buildLaunchOptions(await f.load()).providers,{});
 const legacy=buildLaunchOptions(await loadLaunchSettings());assert.deepEqual(legacy.providers,{});assert.deepEqual(legacy.bindings,{});
});
test('loaded v5 and v6 content capabilities require the bounded ordinary adapter while legacy v3 remains configured',async()=>{
 const f=await fixture();const file=join(f.root,'content.json');f.raw.moduleConfigs={content:'content.json'};
 for(const packetVersion of ['content-packet-v3','content-packet-v5','content-packet-v6']){
  const capabilities={};f.raw.bindings={};
  for(const n of contentNodes()){
   const key=n.key==='producer:strategy'?'strategy':n.key==='producer:copy'?'copy':`content_${n.key.replaceAll(':','_')}`,role=n.key==='producer:strategy'?'strategy-lead':n.key==='producer:copy'?'copy-lead':n.role;
   f.raw.bindings[key]={providerId:'owned',model:'owned',role};
   capabilities[n.key]={operation:CONTENT_PROTOCOL,packetVersion,assignment:{providerId:'owned',model:'owned'},status:'configured_unverified',origin:'Owned test',version:'owned-v1',limitations:['No provider or quality verification'],maxImages:4,maxBytes:1048576,maxPixels:1048576,...(packetVersion==='content-packet-v3'?{}:{resourceProfile:'bounded-json-v1'})};
  }
  await writeFile(file,JSON.stringify({packetVersion,capabilities,allowance:{maxCalls:39,previousMaxCalls:13,origin:'Owned test',version:'owned-v1',reason:'Bounded local declaration'}}));
  const options=buildLaunchOptions(await f.load()),runtime=createCompleteContentRuntime({store:{},root:join(f.root,'executions'),providers:options.providers,bindings:options.bindings,configuration:options.contentConfiguration});
  assert.equal(runtime.capability().configured,true);assert.equal(runtime.capability().realQualityVerified,false);assert.equal(runtime.capability().editablePptIntegrated,false);
  if(packetVersion!=='content-packet-v3'){const bad={...options.providers,owned:{...options.providers.owned,operatorConfig:{...options.providers.owned.operatorConfig,resourceProfile:undefined}}};assert.equal(createCompleteContentRuntime({store:{},root:f.root,providers:bad,bindings:options.bindings,configuration:options.contentConfiguration}).capability().configured,false);}
 }
});
test('ordinary HTTP configuration cannot enable the separately pinned final-review adapter',async()=>{
 const f=await fixture(),original=finalFixture(),owners=Object.fromEntries(Object.entries(original.snapshot.owners).map(([key,row])=>[key,row.value]));
 const config={schemaVersion:'final-review-runtime-v1',configuration:original.configuration,owners,allowance:{authorityIdentity:'owned',totalCalls:1000,provenance:'Synthetic launch only'}};
 await writeFile(join(f.root,'final.json'),JSON.stringify(config));f.raw.moduleConfigs={finalReview:'final.json'};
 await assert.rejects(f.load,{code:'FINAL_HTTP_ADAPTER_UNAVAILABLE'});
 f.raw.textProviders.owned={adapter:'codex-cli',model:'owned'};assertValidatedLaunchSettings(await f.load());
});
