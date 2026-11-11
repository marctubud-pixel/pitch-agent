import {researchChartRestrictions,researchChartPermittedUses} from './research-chart-data.mjs';
import {syntheticStrategyV2,strategySubjectEvidence} from './strategy-fixtures.mjs';
import {strategyRestrictions} from './strategy-contract.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {STRATEGY_CREATIVE_PROTOCOL,CREATIVE_PROTOCOL,CREATIVE_ROLES} from './creative-panel.mjs';
import {createExecutor} from './executor.mjs';
export function panelFixtureOutput(input){
 const common={protocolVersion:input.protocolVersion??CREATIVE_PROTOCOL,panelId:input.panelId,phase:input.phase,role:input.role,panelPacketHash:input.panelPacketHash};
 const evidence=i=>input.subjects[i].strategy?strategySubjectEvidence(input.subjects[i],i):[...(input.subjects[i].title?[{location:`/subjects/${i}/title`,quote:input.subjects[i].title}]:[]),...(input.subjects[i].slogan?[{location:`/subjects/${i}/slogan`,quote:input.subjects[i].slogan}]:[]),...(input.subjects[i].supportingCopy?[{location:`/subjects/${i}/supportingCopy`,quote:input.subjects[i].supportingCopy}]:[])];
 if(input.phase.endsWith('first_read'))return {...common,readings:input.subjects.map((s,i)=>({subjectId:s.id,meaning:s.slogan??s.title,uncertainty:'需要后续判断',evidence:evidence(i)})),issues:[],limitations:['synthetic independent read']};
 if(input.phase==='score')return {...common,items:input.subjects.map((s,i)=>({subjectId:s.id,dimensions:input.dimensions.map(d=>({dimension:d,score:4,status:'scored',required:true,claimId:`${s.id}-${d}`,reason:'合成评分用于流程验证',evidence:evidence(i)})),verdict:'pass'})),groupComparisons:input.subjects.length===3?[['A','B'],['A','C'],['B','C']].map(pair=>({claimId:'pair-'+pair.join(''),pair,meaningDifference:'合成语义差异',expressionDifference:'合成表达差异',verdict:'distinct',evidence:pair.flatMap(id=>evidence(input.subjects.findIndex(s=>s.id===id)))})):[],issues:[],limitations:['synthetic scores not real quality evidence']};
 if(input.phase==='opposition')return {...common,challenges:[],limitations:['synthetic empty opposition']};
 const ids=input.reports.flatMap(x=>[...(x.report.issues??[]).map(i=>`${x.nodeKey}#${i.id}`),...(x.report.challenges??[]).map(i=>`${x.nodeKey}#${i.id}`)]);
 return {...common,adjudications:ids.map(challengeId=>({challengeId,disposition:'pending',reason:'需要修改',evidence:[],owner:'copy-lead'})),groupVerdict:'pass',reason:'合成裁定，不修改原分',limitations:['synthetic director']};
}
const hash=text=>createHash('sha256').update(text).digest('hex');
export const syntheticStrategy={outputKind:'strategy',status:'complete',title:'Synthetic bounded strategy',summary:'An exploratory visual direction.',sections:[{heading:'Direction',body:'Explore a quiet shared table as a creative hypothesis. Consumer preference remains unknown.',evidenceIds:[]}],claims:[],gaps:['No consumer validation.']};
export function syntheticOwnerOutput(input){
 const {envelope:e,side,ownerBinding,producerReport}=input;
 const inherited=[...(e.researchChartAdmissions??[]).flatMap(researchChartRestrictions),...(e.researchRestrictionManifest??[]).map(r=>({id:`research:${r.originKey}`,kind:'prohibitedInferences',text:r.prohibitedUse})),...(e.researchOperatorConstraints??[]).flatMap(c=>c.restrictions),...strategyRestrictions(e.source.content)];
 const lists=producerReport?Object.fromEntries(['permittedUses','prohibitedInferences','limitations'].map(k=>[k,producerReport[k]])):{permittedUses:[{id:'use',text:'Explore creative phrasing only.'}],prohibitedInferences:[{id:'no-preference',text:'Do not claim consumer preference.'}],limitations:[{id:'unknown',text:'Consumer preference is unknown.'}]};
 if(!producerReport){const numericalUses=(e.researchChartAdmissions??[]).map(researchChartPermittedUses).filter(uses=>uses!==null);if(numericalUses.length)lists.permittedUses=numericalUses[0].filter(text=>numericalUses.every(uses=>uses.includes(text))).map((text,i)=>({id:`numeric-use-${i}`,text}));for(const {kind,id,text} of inherited)lists[kind].push({id,text});if(e.researchOperatorConstraints?.length)lists.permittedUses=e.researchOperatorConstraints[0].permittedUses.filter(v=>e.researchOperatorConstraints.every(c=>c.permittedUses.includes(v))).map((text,i)=>({id:`use-${i}`,text}));}
 return {protocolVersion:'owner-edge-v1',envelopeHash:e.envelopeHash,side,ownerBinding,decision:'accept',understoodFindings:[{finding:'Creative hypothesis retains uncertainty.',refs:e.source.content.strategy?['/strategy/answer/text','/strategy/candidateCuts/0/proposition','/strategy/answer/limitations/0'].map(path=>({location:'/envelope/source/content'+path,quote:path.split('/').slice(1).reduce((v,k)=>v[k],e.source.content)})):[{location:'/envelope/source/content/sections/0/body',quote:e.source.content.sections[0].body}]}],...lists,restrictionDispositions:(producerReport?Object.values(lists).flat():inherited).map(r=>({restrictionId:r.id,disposition:'retained',text:r.text})),unresolvedIssues:[]};
}
export const syntheticCopy={...syntheticStrategy,outputKind:'copy',directions:['steady','product','user'].map((id,i)=>({id,title:['A quiet table','A carried invitation','A conversation break'][i],slogan:['Sit together','Bring a moment','Leave time to talk'][i],supportingCopy:['Leave space around the table for conversation.','Use a carried invitation as a creative metaphor.','Imagine a pause that makes room to talk.'][i],creativeExplanation:'A proposed creative mechanism, never an efficacy claim.',rationale:'Bounded exploratory phrasing.',differentiation:'Different expression mechanism '+i,evidenceIds:[]}))};
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
   return {runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(output),parsedOutput:output,cost:null};
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
   return {runId:request.runId,model:copyBinding.model,requestedModel:copyBinding.model,threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:request.runId,model:copyBinding.model,prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(output),parsedOutput:output,cost:null};
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
