import {digest,requireIntake,intakeError,DOCUMENT_LIMITS} from './intake-document-store.mjs';
import {cardHash} from './intake-contract.mjs';
const fieldLists={
 documents:['base64','originalFilename','commandId','expectedRevision'],
 'documents/url':['url','commandId','expectedRevision'],
 'task-card-extractions':['documentIds','baseTaskCardId','baseTaskCardHash','commandId','expectedRevision'],
 adoptions:['draftHash','baseTaskCardId','commandId','expectedRevision'],
 decisions:['taskCardHash','decisions','commandId','expectedRevision'],
 revisions:['taskCardHash','decisions','commandId','expectedRevision'],
 confirmations:['taskCardHash','decisionSetHash','commandId','expectedRevision'],
 'local-retries':['commandId','expectedRevision'],
 reconciliations:['attemptId','commandId','expectedRevision'],
};
export async function handleIntakeHttp({req,res,url,store,intake,schedule,jsonBody,response,fields,humanContext,projectResponse}){
 if(url.pathname==='/api/v1/intake/capabilities'&&req.method==='GET'){requireIntake(!url.search,'INVALID_REQUEST','Versioned intake routes do not accept query fields');response(res,200,await intake.capability());return true;}
 const match=/^\/api\/v1\/projects\/([A-Za-z0-9-]+)(?:\/(.*))?$/.exec(url.pathname);if(!match)return false;
 const projectId=match[1],path=match[2]??'',parts=path.split('/');
 const intakeGet=req.method==='GET'&&(!path||path==='documents'||path==='task-card-drafts'||path==='task-cards'||parts[0]==='documents'&&parts.length>=2&&parts.length<=3||parts[0]==='task-cards'&&parts.length===2||parts[0]==='jobs'&&parts.length===2);
 const intakePost=req.method==='POST'&&(path==='documents'||path==='documents/url'||path==='task-card-extractions'||parts.length===3&&parts[0]==='task-card-drafts'&&parts[2]==='adoptions'||parts.length===3&&parts[0]==='task-cards'&&['decisions','revisions','confirmations'].includes(parts[2])||parts.length===3&&parts[0]==='jobs'&&['local-retries','reconciliations'].includes(parts[2]));
 if(!intakeGet&&!intakePost)return false;
 let revision;
 if(!path&&req.method==='GET'&&url.search){
  const values=url.searchParams.getAll('revision');
  if(!([...url.searchParams.keys()].every(key=>key==='revision')&&values.length===1&&/^\d+$/.test(values[0])&&Number.isSafeInteger(Number(values[0]))))throw intakeError('INVALID_REQUEST','revision must be a nonnegative integer',400);
  revision=Number(values[0]);
 }else requireIntake(!url.search,'INVALID_REQUEST','Versioned intake routes do not accept query fields');
 const p=store.read(projectId,revision);
 if(req.method==='GET'){
  if(!path){response(res,200,await projectResponse(p,{historical:revision!==undefined}));return true;}
  if(path==='documents'){response(res,200,{documents:p.intakeDocuments??[]});return true;}
  if(parts[0]==='documents'&&parts[1]&&parts.length<=3){
   const d=p.intakeDocuments?.find(d=>d.id===parts[1]);requireIntake(d,'NOT_FOUND','Document is not registered in this project');
   if(parts[2]==='original'){const {bytes}=await intake.checkedDocument(projectId,d.id);res.writeHead(200,{'Content-Type':d.raw.mediaType,'Content-Length':bytes.length,'Content-Disposition':'attachment','ETag':`"${d.raw.sha256}"`});res.end(bytes);return true;}
   if(parts.length===2){const checked=d.raw?await intake.checkedDocument(projectId,d.id):null;response(res,200,{document:d,documentHash:digest(d),extraction:checked?.extraction??null});return true;}
  }
  if(path==='task-card-drafts'){response(res,200,{drafts:(p.intakeDrafts??[]).map(d=>({...d,draftHash:digest(d)}))});return true;}
  if(path==='task-cards'){response(res,200,{activeTaskCardId:p.activeTaskCardId,taskCards:p.taskCards.map(card=>({card,taskCardHash:cardHash(card),decisionSetHash:digest(card.decisions??[])})),confirmations:p.confirmations});return true;}
  if(parts[0]==='task-cards'&&parts.length===2){const card=p.taskCards.find(c=>c.id===parts[1]);requireIntake(card,'NOT_FOUND','Task card not found');await intake.verifyCard(projectId,card);response(res,200,{card,taskCardHash:cardHash(card),decisionSetHash:digest(card.decisions??[])});return true;}
  if(parts[0]==='jobs'&&parts.length===2){const job=p.jobs.find(j=>j.id===parts[1]&&j.purpose?.startsWith('intake_'));requireIntake(job,'NOT_FOUND','Intake job not found');response(res,200,{job});return true;}
 }
 if(req.method==='POST'){
  const key=Object.hasOwn(fieldLists,path)?path:parts[2],allowed=fieldLists[key];
  requireIntake(allowed,'NOT_FOUND','Unknown intake action');
  const body=await jsonBody(req,path==='documents'?4*Math.ceil(DOCUMENT_LIMITS.bytes/3)+8192:128*1024);fields(body,allowed);requireIntake(allowed.every(k=>Object.hasOwn(body,k)),'INVALID_REQUEST','Required action fields missing');
  let answer;
  if(path==='documents'){
   requireIntake(typeof body.originalFilename==='string'&&body.originalFilename.trim()&&body.originalFilename.length<=2000,'INVALID_REQUEST','Original filename required');
   requireIntake(typeof body.base64==='string'&&body.base64.length<=4*Math.ceil(DOCUMENT_LIMITS.bytes/3)&&/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64),'INVALID_REQUEST','Bounded canonical base64 required');const bytes=Buffer.from(body.base64,'base64');requireIntake(bytes.toString('base64')===body.base64,'INVALID_REQUEST','Canonical base64 required');const {base64,...request}=body;answer=await intake.upload(projectId,request,bytes);
  }else if(path==='documents/url')answer=await intake.capture(projectId,body);
  else if(path==='task-card-extractions')answer=await intake.requestExtraction(projectId,body);
  else if(parts.length===3&&parts[0]==='task-card-drafts'&&key==='adoptions')answer=await intake.humanAction(projectId,'intake-adopt',{...body,draftId:parts[1]},humanContext());
  else if(parts.length===3&&parts[0]==='task-cards'&&['decisions','revisions','confirmations'].includes(key))answer=await intake.humanAction(projectId,key==='confirmations'?'intake-confirm':'intake-decide',{...body,taskCardId:parts[1]},humanContext());
  else if(parts.length===3&&parts[0]==='jobs'&&key==='local-retries')answer=await intake.humanAction(projectId,'intake-retry-local',{...body,jobId:parts[1]},humanContext());
  else if(parts.length===3&&parts[0]==='jobs'&&key==='reconciliations')answer=await intake.reconcile(projectId,{...body,jobId:parts[1]},humanContext());
  else requireIntake(false,'NOT_FOUND','Unknown intake action');
  if(answer.jobId)schedule(projectId,answer.jobId);response(res,answer.jobId?202:200,{...answer,revision:store.read(projectId).revision});return true;
 }
 requireIntake(false,'NOT_FOUND','Unknown intake route');
}
