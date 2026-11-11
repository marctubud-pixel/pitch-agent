import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {imageManifest} from './image-evidence.mjs';
import {STRATEGY_CREATIVE_PROTOCOL,CREATIVE_PROTOCOL,CREATIVE_ROLES} from './creative-panel.mjs';
import {createExecutor} from './executor.mjs';
import {panelFixtureOutput,syntheticOwnerOutput,syntheticStrategy,syntheticCopy} from './owner-edge-fixtures.mjs';
export {panelFixtureOutput,syntheticOwnerOutput,syntheticStrategy,syntheticCopy};
const hash=text=>createHash('sha256').update(text).digest('hex');
export async function prepareStrategy({store,root,mode='auto',gates=[],handler,existing=false,initialBindings={},initialProviders={},providerId='synthetic'}){
 const human={actorType:'human',actorId:'synthetic-human',runId:'human-run',contextId:'human-context'},calls=[];
 const send=(c,context=human)=>store.command('p',{...c,commandId:randomUUID(),expectedRevision:store.read('p').revision},context);
 if(!existing){store.create({id:'p',name:'Synthetic owner edge only',brief:'Explore a packaging creative hypothesis. No factual product or audience promises.',mode,humanGates:gates},human);send({kind:'confirm-task-card',taskCardId:'p:scope:1'});
 const raw=JSON.stringify({title:'Synthetic research',sections:[],claims:[]},null,2),path=join(root,'research.json');await writeFile(path,raw);
 send({kind:'request-stage',stage:'research',jobId:'research'});send({kind:'complete-stage',jobId:'research',artifactId:'research',payloadRef:path,contentHash:hash(raw)},{actorType:'agent',actorId:'research-author',runId:'research-run',contextId:'research-context'});
 for(const side of ['producer','consumer'])send({kind:'acknowledge-handoff',artifactId:'research',side,nextStage:'strategy'},{actorType:'agent',actorId:side==='producer'?'research-author':'strategy-owner',runId:randomUUID(),contextId:randomUUID()});send({kind:'release-stage',artifactId:'research'});}
 const roles=['strategy','copy','verification','correction_review','creative_director',...CREATIVE_ROLES.strategy.flatMap(r=>[`creative_score_${r}`,`creative_opposition_${r}`])],bindings=Object.fromEntries(roles.map(role=>[role,{providerId,model:'synthetic',role:role==='verification'?'evidence-reviewer':role+'-lead'}]));Object.assign(bindings,initialBindings);
 const provider={model:'synthetic',execute:async request=>{
   const input=JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));calls.push({request,input});
   const fixed=Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([,v])=>v.enum).map(([k,v])=>[k,v.enum[0]]));
   let output=input.envelope?syntheticOwnerOutput(input):input.phase?panelFixtureOutput(input):request.outputSchema.properties.outputKind?(request.outputSchema.properties.outputKind.enum[0]==='copy'?syntheticCopy:request.outputSchema.properties.strategyContractVersion?syntheticStrategyV2(input):syntheticStrategy):{...fixed,...(input.quantitativeManifest?{quantitativeResults:[]}:{}),results:[],wholeTextScan:{status:'complete',creativeClaimKeys:(input.claimManifest??[]).filter(c=>c.claim.kind==='creative').map(c=>c.claimKey),omissions:[],mismatchedCreative:[],operationalAssertions:[]},limitations:['Synthetic review only.']};
   if(handler)output=await handler(input,request,output);
   return diskReceipt(root,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(output),parsedOutput:output,cost:null});
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

export async function bootstrapOwnerCopy({store,root,bindings,providers}){
 const copyBinding=bindings.copy,original=providers[copyBinding.providerId];
 const wrapped={...providers,[copyBinding.providerId]:{...original,execute:async request=>{
  if(request.outputSchema.properties.protocolVersion?.enum[0]==='owner-edge-v1'){
   const packet=JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA'))),output=syntheticOwnerOutput(packet);
   return diskReceipt(root,request,{runId:request.runId,model:copyBinding.model,requestedModel:copyBinding.model,threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:request.runId,model:copyBinding.model,prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(output),parsedOutput:output,cost:null});
  }
  return original.execute(request);
 }}};
 const f=await prepareStrategy({store,root,existing:true,initialBindings:{copy:copyBinding},initialProviders:wrapped,providerId:'owner-fixture'});
 await f.executor.continueStrategy('p',f.request());
 for(let i=0;i<4;i++){for(const id of await f.executor.advanceOwnerEdges('p')){const job=store.read('p').jobs.find(j=>j.id===id);if(job.purpose==='owner_acceptance'){const result=await f.executor.execute('p',id);if(result.status!=='succeeded')throw new Error(JSON.stringify(result.error));}}}
 Object.assign(bindings,{strategy:f.bindings.strategy});Object.assign(providers,wrapped,{'owner-fixture':f.providers['owner-fixture']});
 const edge=store.read('p').ownerEdges.at(-1);if(!edge.commit)throw new Error('Synthetic owner edge did not commit');
 return {jobId:edge.commit.jobId,artifactId:f.artifactId,creativeCalibrations:f.creativeCalibrations};
}

export async function diskReceipt(root,request,receipt){
 const folder=join(root,'provider-'+request.runId);await mkdir(folder,{recursive:true});
 const paths=Object.fromEntries(['input','output','stdout','receipt'].map(name=>[name,join(folder,name+'.json')]));
 const images=request.images?.length?structuredClone(request.images):[];
 const input=JSON.stringify({runId:request.runId,model:receipt.model,prompt:request.prompt,outputSchema:request.outputSchema,...(images.length?{images:imageManifest(images,request.imageEnvelope)}:{}),...(request.imageEnvelope?{imageEnvelope:request.imageEnvelope}:{})});
 const disk={runId:receipt.runId,model:receipt.model,requestedModel:receipt.model,provider:'codex-cli',threadId:receipt.threadId,inputPacketHash:hash(input),paths,exitCode:0,signal:null,reason:null,error:null,...(images.length?{images}: {})};
 await writeFile(paths.input,input);await writeFile(paths.receipt,JSON.stringify(disk));await writeFile(paths.output,receipt.responseText);await writeFile(paths.stdout,JSON.stringify({type:'thread.started',thread_id:disk.threadId})+'\n'+JSON.stringify({type:'turn.completed'})+'\n');
 return {...disk,responseText:receipt.responseText,parsedOutput:receipt.parsedOutput,schemaValidated:false};
}
