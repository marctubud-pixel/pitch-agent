import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {join} from 'node:path';
import {mkdir,writeFile,open} from 'node:fs/promises';
import {appendFileSync,readFileSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {STRATEGY_CREATIVE_PROTOCOL,CREATIVE_PROTOCOL,CREATIVE_ROLES,COPY_CREATIVE_PROTOCOL} from './creative-panel.mjs';
import {panelFixtureOutput,syntheticOwnerOutput,syntheticStrategy,syntheticCopy} from './owner-edge-fixtures.mjs';
import {referenceProductionFixture} from './reference-dossier-fixtures.mjs';
import {REFERENCE_DOSSIER_PROTOCOL} from './reference-dossier.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
let ledger;
export function configureLedger(path){ledger=path;}
export function entries(){return existsSync(ledger)?readFileSync(ledger,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];}
export function save(path,value){const fd=openSync(path,'wx');try{writeFileSyncCompat(fd,JSON.stringify(value,null,2));fsyncSync(fd);}finally{closeSync(fd);}}
import {writeFileSync as writeFileSyncCompat} from 'node:fs';
export function entry(request){
 const previous=entries();if(previous.length>=29||previous.some(row=>row.runId===request.runId))throw Error('Local provider budget or repeat refusal');
 const fd=openSync(ledger,'a',0o600);try{writeFileSyncCompat(fd,JSON.stringify({count:previous.length+1,runId:request.runId,phase:'entered',status:'unknown'})+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 if(request.images?.length)throw Error('This regression permits text only');
}
export async function textReceipt(root,request,output){
 if(request.images?.length)throw Error('This regression permits text only');
 const packet=JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema}),folder=join(root,'provider-originals',request.runId);
 await mkdir(folder,{recursive:true});
 const paths=Object.fromEntries(['input','schema','stdout','stderr','output','receipt'].map(name=>[name,join(folder,name+'.json')]));
 const threadId=randomUUID(),responseText=JSON.stringify(output),stamp=new Date().toISOString();
 const receipt={runId:request.runId,provider:'codex-cli',providerRequestId:threadId,threadId,model:'synthetic',requestedModel:'synthetic',reportedModel:null,usage:{input_tokens:0,cached_input_tokens:0,output_tokens:0},cost:null,paths,inputPacketHash:hash(packet),contextHash:hash(packet),startedAt:stamp,finishedAt:stamp,exitCode:0,signal:null,reason:null,error:null};
 for(const [path,bytes] of [[paths.input,packet],[paths.schema,JSON.stringify(request.outputSchema)],[paths.stdout,JSON.stringify({type:'thread.started',thread_id:threadId})+'\n'+JSON.stringify({type:'turn.completed',usage:receipt.usage})+'\n'],[paths.stderr,'Local deterministic test. No external provider.'],[paths.output,responseText],[paths.receipt,JSON.stringify(receipt)]]){const file=await open(path,'wx');try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}}
 const directory=await open(folder,'r');try{await directory.sync();}finally{await directory.close();}
 return {...receipt,responseText,parsedOutput:output,schemaValidated:false};
}
export async function prepareStrategy({store,root,mode='auto',gates=[],handler,existing=false,initialBindings={},initialProviders={},providerId='synthetic'}){
 const human={actorType:'human',actorId:'synthetic-human',runId:'human-run',contextId:'human-context'},calls=[];
 const send=(c,context=human)=>store.command('p',{...c,commandId:randomUUID(),expectedRevision:store.read('p').revision},context);
 if(!existing){store.create({id:'p',name:'Synthetic owner edge only',brief:'Explore a packaging creative hypothesis. No factual product or audience promises.',mode,humanGates:gates},human);send({kind:'confirm-task-card',taskCardId:'p:scope:1'});
 const raw=JSON.stringify({title:'Synthetic research',sections:[],claims:[]},null,2),path=join(root,'research.json');await writeFile(path,raw);
 send({kind:'request-stage',stage:'research',jobId:'research'});send({kind:'complete-stage',jobId:'research',artifactId:'research',payloadRef:path,contentHash:hash(raw)},{actorType:'agent',actorId:'research-author',runId:'research-run',contextId:'research-context'});
 for(const side of ['producer','consumer'])send({kind:'acknowledge-handoff',artifactId:'research',side,nextStage:'strategy'},{actorType:'agent',actorId:side==='producer'?'research-author':'strategy-owner',runId:randomUUID(),contextId:randomUUID()});send({kind:'release-stage',artifactId:'research'});}
 const roles=['strategy','copy','verification','correction_review','creative_director',...CREATIVE_ROLES.strategy.flatMap(r=>[`creative_score_${r}`,`creative_opposition_${r}`])],bindings=Object.fromEntries(roles.map(role=>[role,{providerId,model:'synthetic',role:role==='verification'?'evidence-reviewer':role+'-lead'}]));Object.assign(bindings,initialBindings);
 const provider={model:'synthetic',execute:async request=>{entry(request);
   const input=JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));calls.push({request,input});
   const fixed=Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([,v])=>v.enum).map(([k,v])=>[k,v.enum[0]]));
   let output=input.envelope?syntheticOwnerOutput(input):input.phase?panelFixtureOutput(input):request.outputSchema.properties.outputKind?(request.outputSchema.properties.outputKind.enum[0]==='copy'?syntheticCopy:request.outputSchema.properties.strategyContractVersion?syntheticStrategyV2(input):syntheticStrategy):{...fixed,results:[],wholeTextScan:{status:'complete',creativeClaimKeys:(input.claimManifest??[]).filter(c=>c.claim.kind==='creative').map(c=>c.claimKey),omissions:[],mismatchedCreative:[],operationalAssertions:[]},limitations:['Synthetic review only.']};
   if(handler)output=await handler(input,request,output);
   return textReceipt(root,request,output);
 }};
 const calibration=join(root,`calibration-${providerId}.json`);await writeFile(calibration,'synthetic calibration');
 const creativeCalibrations=[{protocolVersion:STRATEGY_CREATIVE_PROTOCOL,stage:'strategy',role:'strategy',providerId,model:'synthetic',evidenceRef:calibration,evidenceHash:hash('synthetic calibration')}];
 const providers={...initialProviders,[providerId]:provider},makeExecutor=()=>createExecutor({store,rootDir:root,providers,bindings,creativeCalibrations});const executor=makeExecutor();
 const generated=await executor.execute('p',executor.enqueue('p','strategy'));if(generated.status!=='succeeded')throw new Error(JSON.stringify(generated.error));const artifactId=store.read('p').activeByStage.strategy;
 const verified=await executor.execute('p',await executor.enqueueVerification('p',artifactId));if(verified.status!=='succeeded')throw new Error(JSON.stringify(verified.error));
 await executor.enqueueCreativePanel('p',{artifactId,commandId:randomUUID(),expectedRevision:store.read('p').revision});
 for(let i=0;i<8;i++){const jobs=executor.advanceCreativePanels('p');if(!jobs.length)break;for(const id of jobs){const job=await executor.execute('p',id);if(job.status!=='succeeded')throw new Error(JSON.stringify(job.error));}}
 return {store,root,calls,executor,makeExecutor,artifactId,send,human,bindings,providers,creativeCalibrations,request:()=>({artifactId,commandId:randomUUID(),expectedRevision:store.read('p').revision})};

}

export async function referenceFixture(t,{fixtureRoot,gates=[],budget,providerHandler,reviewOutput,duplicateImages=false}={}){
 const root=fixtureRoot;await mkdir(root,{recursive:true});const store=openStore(join(root,'db'));
 t.after(async()=>{store.close();});
 const initialBindings=Object.fromEntries(['copy','brand','user','communication'].flatMap(role=>[`creative_score_${role}`,`creative_opposition_${role}`]).map(role=>[role,{providerId:'synthetic',model:'synthetic',role:role+'-lead'}]));
 const f=await prepareStrategy({store,root,gates,initialBindings});
 await f.executor.continueStrategy('p',f.request());for(let i=0;i<5;i++)for(const id of await f.executor.advanceOwnerEdges('p')){const j=store.read('p').jobs.find(j=>j.id===id);const done=await f.executor.execute('p',j.id);if(done.status!=='succeeded')throw new Error(JSON.stringify(done.error));}
 const copyId=store.read('p').activeByStage.copy;
 const evidenceRef=join(root,'copy-calibration.json');await writeFile(evidenceRef,'synthetic development calibration');
 f.creativeCalibrations.push(...['copy','brand','user','communication'].map(role=>({protocolVersion:COPY_CREATIVE_PROTOCOL,stage:'copy',role,providerId:'synthetic',model:'synthetic',evidenceRef,evidenceHash:hash('synthetic development calibration')})));
 let executor=createExecutor({store,rootDir:root,bindings:f.bindings,providers:f.providers,creativeCalibrations:f.creativeCalibrations});
 const verified=await executor.execute('p',await executor.enqueueVerification('p',copyId));if(verified.status!=='succeeded')throw new Error(JSON.stringify(verified.error));
 await executor.enqueueCreativePanel('p',{artifactId:copyId,commandId:randomUUID(),expectedRevision:store.read('p').revision});
 for(let n=0;n<6;n++)for(const id of executor.advanceCreativePanels('p')){const result=await executor.execute('p',id);if(result.status!=='succeeded')throw new Error(JSON.stringify(result.error));}
 const calls=[],transportCalls=[],bindingNames=['reference_director','reference_lead','reference_collector','reference_review_director',...['visual','brand','user','communication'].flatMap(r=>[`reference_score_${r}`,`reference_opposition_${r}`])];
 for(const role of bindingNames)f.bindings[role]={providerId:'reference-synthetic',model:'synthetic',role:role==='reference_lead'?'references-lead':role};
 const configuration={capability:{transport:'experimental_public_http',status:'available',evidenceRef:'offline-development-fixture'},budget:budget??{maxModelCalls:129,maxSearchCalls:6},calibrations:[]};
 const inputOf=request=>JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
 const original=f.providers.synthetic.execute;
 const referenceExecute=async request=>{entry(request);const input=inputOf(request);if(input.protocolVersion!==REFERENCE_DOSSIER_PROTOCOL&&input.protocolVersion!=='reference-pixel-review-v1')return original(request);
   const call={input,request,started:performance.now()};calls.push(call);
   let output=input.protocolVersion===REFERENCE_DOSSIER_PROTOCOL?referenceProductionFixture(input):reviewOutput(input);
   if(providerHandler)output=await providerHandler(input,request,output);call.ended=performance.now();
   return textReceipt(root,request,output);
 };
 f.providers.synthetic={model:'synthetic',execute:referenceExecute};f.providers['reference-synthetic']={model:'synthetic',execute:referenceExecute};
 const acquisitionDependencies={lookup:async()=>{throw Error('Acquisition forbidden in this regression');},transport:async()=>{throw Error('Acquisition forbidden in this regression');}};
 const makeExecutor=()=>createExecutor({store,rootDir:root,bindings:f.bindings,providers:f.providers,creativeCalibrations:f.creativeCalibrations,referenceConfiguration:configuration,acquisitionDependencies});executor=makeExecutor();
 return {...f,copyId,executor,makeExecutor,configuration,acquisitionDependencies,calls,transportCalls,request:()=>({artifactId:copyId,commandId:randomUUID(),expectedRevision:store.read('p').revision})};
}
