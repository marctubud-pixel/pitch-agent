import {createHash} from 'node:crypto';
import {STAGES} from './project.mjs';
export const ASSISTANT_CONTEXT_BYTES=128*1024;
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v);
const fields=['id','stage','status','title','url','scopeRelation','verificationStatus','contentHash','excerpt','publisher','intendedUse','recordHash','sha256','text','claim','statement','supportStatus'];
export function assistantProjection(p,snapshotHash){
 const card=p.taskCards.find(c=>c.id===p.activeTaskCardId),registry=[],counts={};
 const coverage={mode:'bounded_recorded_metadata',complete:false,selectedRecords:0,totalRecords:0,omittedRecords:0,collections:counts,fieldTruncations:0,excludedFields:0,policyExclusions:['technicalReceipts except sourceCatalogue record metadata','raw payloads','original files','unselected record fields'],gateEvaluation:'not_performed',selectionOrder:'current brief, recorded stages, current artifacts, registered sources, other artifacts, reviews, handoffs, jobs, images, claims and artifact sources'};
 const represented=['id','revision','taskCards','confirmations','activeTaskCardId','activeByStage','releases','sourceEntries','sourceCaptures','artifacts','reviews','handoffReports','jobs','imageAssets'];
 const unrepresented=Object.keys(p).filter(key=>!represented.includes(key));
 coverage.recordCountScope='Enumerated view candidates only. taskCards counts only the active task card; stages counts synthetic recorded-state views. Other project collections and history are not reviewed.';
 coverage.fieldCountScope='Projected candidates only; omitted records are not field-reviewed.';
 coverage.unrepresentedTopLevelFields=unrepresented.slice(0,50);
 coverage.unrepresentedTopLevelFieldCount=unrepresented.length;
 let used=0;
 const bounded=(record,allowed=fields)=>{
  const value={},omittedFields=[],truncatedFields=[];
  for(const key of Object.keys(record??{})){
   if(!allowed.includes(key)){coverage.excludedFields++;if(omittedFields.length<24)omittedFields.push(key.slice(0,80));continue;}
   const v=record[key];
   if(typeof v==='string'){const limit=key==='brief'?8000:key==='excerpt'?2000:1000;value[key]=v.slice(0,limit);if(v.length>limit){truncatedFields.push(key);coverage.fieldTruncations++;}}
   else if(v===null||typeof v==='boolean'||typeof v==='number')value[key]=v;
   else {coverage.excludedFields++;omittedFields.push(key);}
  }
  return {...value,projection:{omittedFields,truncatedFields,complete:omittedFields.length===0&&truncatedFields.length===0}};
 };
 const add=(collection,id,kind,record,view,rawId,pointer)=>{
  const count=counts[collection]??={total:0,selected:0,omitted:0};count.total++;coverage.totalRecords++;
  if(registry.length>=200||!identifier(rawId)){count.omitted++;return;}
  const entry={id,kind,label:`${collection} ${rawId}`,projectId:p.id,sourcePointer:pointer,record,target:{view,params:{id:rawId,projectId:p.id}}};
  const size=Buffer.byteLength(JSON.stringify(entry));
  if(size+used>100*1024){count.omitted++;return;}
  used+=size;registry.push(entry);count.selected++;
 };
 add('taskCards',card.id,'brief_field',{...bounded(card,['id','brief','createdBy']),confirmed:p.confirmations.some(c=>c.taskCardId===card.id),knowledge:'recorded_input_not_source_verification'},'brief',card.id,`/taskCards/${p.taskCards.indexOf(card)}`);
 const stages=Object.keys(STAGES).map(stage=>{
  const job=p.jobs.findLast(j=>j.stage===stage&&(!j.purpose||j.purpose==='stage')),artifactId=p.activeByStage[stage]??null;
  const recordedRelease=p.releases.some(r=>r.artifactId===artifactId);
  const s={stage,status:job?.status??(artifactId?'artifact_recorded':'not_started'),activeArtifactId:artifactId,latestJobId:job?.id??null,releaseRecorded:recordedRelease,blockedReasons:job?.status==='blocked'?['RECORDED_JOB_BLOCKED']:[],gateEvaluation:'not_performed'};
  add('stages','stage:'+stage,'stage',s,'process',stage,`/activeByStage/${stage}`);return s;
 });
 const current=new Set(Object.values(p.activeByStage));
 const collections=[['artifacts','artifact','artifacts',true],['sourceEntries','source','sources'],['sourceCaptures','source','sources'],['artifacts','artifact','artifacts',false],['reviews','review','process'],['handoffReports','handoff','handoff'],['jobs','job','jobs'],['imageAssets','image','images']];
 for(const [collection,kind,view,active] of collections)for(const [i,r] of (p[collection]??[]).entries()){
  if(collection==='artifacts'&&current.has(r.id)!==active)continue;
  add(collection,collection+':'+r.id,kind,registry.length<200?bounded(r):{},view,r.id,`/${collection}/${i}`);
 }
 for(const [i,a]of p.artifacts.entries()){
  for(const [j,claim]of (a.claims??[]).entries())add('claims',`claim:${a.id}:${j}`,'claim',registry.length<200?{...bounded(typeof claim==='string'?{text:claim}:claim),artifactId:a.id,knowledge:'recorded_claim_not_independent_verification'}:{},'artifacts',a.id,`/artifacts/${i}/claims/${j}`);
  for(const [j,source]of (a.technicalReceipts?.sourceCatalogue?.records??[]).entries())add('artifactSources',`artifact-source:${a.id}:${source.id}`,'source',registry.length<200?{...bounded(source),artifactId:a.id,knowledge:'registered_source_not_authentication'}:{},'sources',source.id,`/artifacts/${i}/technicalReceipts/sourceCatalogue/records/${j}`);
 }
 coverage.selectedRecords=registry.length;coverage.omittedRecords=coverage.totalRecords-registry.length;
 const confirmedIndex=p.taskCards.findIndex(c=>c.id===p.confirmations.at(-1)?.taskCardId);
 const result={scope:{kind:'project',projectId:p.id},basedOn:{projectId:p.id,revision:p.revision,briefVersion:p.taskCards.indexOf(card)+1,briefConfirmed:p.confirmations.some(c=>c.taskCardId===card.id),taskCardId:card.id,taskCardHash:digest(card),confirmedBriefVersion:confirmedIndex<0?null:confirmedIndex+1,snapshotHash},coverage,registry,stages};
 if(Buffer.byteLength(JSON.stringify(result))>ASSISTANT_CONTEXT_BYTES)throw Object.assign(Error('ASSISTANT_CONTEXT_LIMIT'),{code:'ASSISTANT_CONTEXT_LIMIT'});
 return result;
}
