import {syntheticStrategyV2,strategySubjectEvidence} from './strategy-fixtures.mjs';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {STRATEGY_CREATIVE_PROTOCOL,CREATIVE_PROTOCOL,CREATIVE_ROLES,COPY_CREATIVE_PROTOCOL,creativeHash} from './creative-panel.mjs';
import {bootstrapOwnerCopy} from './owner-edge-fixtures.mjs';
export const context=(name,type='agent')=>({actorId:name,actorType:type,runId:name+'-run',contextId:name+'-context',parentRunIds:[],ancestorActorIds:[],inputPacketHash:'fixture',exposedReviewIds:[],authorRecommendations:[],priorScores:[]});
export const human=context('human','human');
export const stageDraft=stage=>{const draft=({outputKind:stage,status:'draft',title:'得闲社交包装',summary:'用包装把轻松社交说明白',sections:[{heading:'目标',body:'先识别白酒，再传递轻松社交',evidenceIds:[]}],claims:[],gaps:['度数未定'],...(stage==='copy'?{directions:[{id:'steady',title:'得闲一起坐坐',slogan:'得闲，坐一桌',rationale:'延续相聚表达',differentiation:'桌面圆形',evidenceIds:[]},{id:'product',title:'把得闲带上',slogan:'得闲，随手有约',rationale:'突出便携轮廓',differentiation:'提手结构',evidenceIds:[]},{id:'user',title:'今晚不赶场',slogan:'得闲，慢慢聊',rationale:'突出相处时间',differentiation:'余白时间',evidenceIds:[]}]}:{})});if(stage==='copy')draft.directions.forEach((d,i)=>Object.assign(d,{supportingCopy:['延续相聚时刻，让一桌朋友坐得更近。','用包装提手组织随手带上的表达。','把聊天的时间留给此刻的朋友。'][i],creativeExplanation:'把标题与支撑文字串成完整表达，不认证市场效果。'}));return draft;};
export function panelFixtureOutput(input){
 const common={protocolVersion:input.protocolVersion??CREATIVE_PROTOCOL,panelId:input.panelId,phase:input.phase,role:input.role,panelPacketHash:input.panelPacketHash};
 const evidence=i=>input.subjects[i].strategy?strategySubjectEvidence(input.subjects[i],i):[...(input.subjects[i].title?[{location:`/subjects/${i}/title`,quote:input.subjects[i].title}]:[]),...(input.subjects[i].slogan?[{location:`/subjects/${i}/slogan`,quote:input.subjects[i].slogan}]:[]),...(input.subjects[i].supportingCopy?[{location:`/subjects/${i}/supportingCopy`,quote:input.subjects[i].supportingCopy}]:[])];
 if(input.phase.endsWith('first_read'))return {...common,readings:input.subjects.map((s,i)=>({subjectId:s.id,meaning:s.slogan??s.title,uncertainty:'需要后续判断',evidence:evidence(i)})),issues:[],limitations:['synthetic independent read']};
 if(input.phase==='score')return {...common,items:input.subjects.map((s,i)=>({subjectId:s.id,dimensions:input.dimensions.map(d=>({dimension:d,score:4,status:'scored',required:true,claimId:`${s.id}-${d}`,reason:'合成评分用于流程验证',evidence:evidence(i)})),verdict:'pass'})),groupComparisons:input.subjects.length===3?[['A','B'],['A','C'],['B','C']].map(pair=>({claimId:'pair-'+pair.join(''),pair,meaningDifference:'合成语义差异',expressionDifference:'合成表达差异',verdict:'distinct',evidence:pair.flatMap(id=>evidence(input.subjects.findIndex(s=>s.id===id)))})):[],issues:[],limitations:['synthetic scores not real quality evidence']};
 if(input.phase==='opposition')return {...common,challenges:[],limitations:['synthetic empty opposition']};
 const ids=input.reports.flatMap(x=>[...(x.report.issues??[]).map(i=>`${x.nodeKey}#${i.id}`),...(x.report.challenges??[]).map(i=>`${x.nodeKey}#${i.id}`)]);
 return {...common,adjudications:ids.map(challengeId=>({challengeId,disposition:'pending',reason:'需要修改',evidence:[],owner:'copy-lead'})),groupVerdict:'pass',reason:'合成裁定，不修改原分',limitations:['synthetic director']};
}
const quoted=prompt=>JSON.parse(prompt.slice(prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
export async function createPanelFixture(t,{stage='copy',calibrated=false,handler}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'creative-test-'))),dbPath=join(root,'db'),store=openStore(dbPath),calls=[];
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 store.create({id:'p',name:'Synthetic panel',brief:'得闲，25岁轻松社交，度数未定',mode:'assisted',humanGates:[stage]},human);
 const send=(c,ctx=human)=>store.command('p',{...c,commandId:randomUUID(),expectedRevision:store.read('p').revision},ctx);
 send({kind:'confirm-task-card',taskCardId:'p:scope:1'});
 async function imported(name,next){const draft={title:'合成上游',sections:[],claims:[]},raw=JSON.stringify(draft,null,2),path=join(root,name+'.json');await writeFile(path,raw);send({kind:'request-stage',stage:name,jobId:name});send({kind:'complete-stage',jobId:name,artifactId:name,payloadRef:path,contentHash:creativeHash(raw)},context(name+'-author'));if(name==='strategy'){send({kind:'assign-panel',artifactId:name,seats:[{role:'strategy',...context('manual-strategy')} ]});send({kind:'record-review',artifactId:name,reviewId:'manual-score',role:'strategy',verdict:'pass',findings:[]},context('manual-strategy'));send({kind:'record-review',artifactId:name,reviewId:'manual-opposition',role:'strategy',reviewType:'opposition',pairedReviewId:'manual-score',firstReadRef:'fixture',verdict:'pass',findings:[]},context('manual-opposition'));send({kind:'record-disposition',artifactId:name,outcome:'reject',reason:'fixture',evidenceRefs:['fixture']},context('manual-director'));}send({kind:'acknowledge-handoff',artifactId:name,side:'producer',nextStage:next},context(name+'-author'));send({kind:'acknowledge-handoff',artifactId:name,side:'consumer',nextStage:next},context(next+'-owner'));send({kind:'release-stage',artifactId:name});}
 await imported('research','strategy');
 const bindings=Object.fromEntries([stage,'creative_director',...CREATIVE_ROLES[stage].flatMap(r=>[`creative_score_${r}`,`creative_opposition_${r}`])].map(role=>[role,{providerId:'synthetic',model:'synthetic',role:role+'-lead'}]));
 const providers={synthetic:{model:'synthetic',execute:async request=>{const input=quoted(request.prompt);calls.push({request,input});const result=handler?await handler(input,request):input.phase?panelFixtureOutput(input):input.strategyBasis?syntheticStrategyV2(input):stageDraft(stage);return {runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:randomUUID(),inputPacketHash:creativeHash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(result),parsedOutput:result,cost:null,usage:{input_tokens:1}};}}};
 const evidence=join(root,'calibration.json');await writeFile(evidence,'synthetic calibration fixture, not real measurement');
 const creativeCalibrations=calibrated?CREATIVE_ROLES[stage].map(role=>({protocolVersion:stage==='copy'?COPY_CREATIVE_PROTOCOL:STRATEGY_CREATIVE_PROTOCOL,stage,role,providerId:'synthetic',model:'synthetic',evidenceRef:evidence,evidenceHash:creativeHash('synthetic calibration fixture, not real measurement')})):[];
 const bootstrap=stage==='copy'?await bootstrapOwnerCopy({store,root,bindings,providers}):null;
 const makeExecutor=()=>createExecutor({store,rootDir:root,bindings,providers,creativeCalibrations});let executor=makeExecutor();
 const stageJob=bootstrap?.jobId??executor.enqueue('p',stage);const generated=await executor.execute('p',stageJob);assert.equal(generated.status,'succeeded',JSON.stringify(generated.error));
 const artifactId=store.read('p').activeByStage[stage];
 return {root,dbPath,store,calls,bindings,providers,executor,makeExecutor,artifactId,send,request:()=>({artifactId,commandId:randomUUID(),expectedRevision:store.read('p').revision})};
}
