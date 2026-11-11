import type {OriginalDocumentState,PdfTextStatus} from '../../domain/originalDocuments';
import {ServiceError} from '../../domain/service';
import {object,records,text,integer,type Snapshot} from './dto';
import {originalHash,registeredOriginals,bridgeStorageJob} from './intakeProjection';
const bad=():never=>{throw new ServiceError('response_lost','PDF解析记录与实际原件不一致，请保留原请求核对。',{outcomeUnknown:true});};
export async function originalDocumentState(value:unknown,p:Snapshot,documentId:string,capability:unknown):Promise<OriginalDocumentState>{
 try{
 const cap=object(capability),local=cap.localExtraction?object(cap.localExtraction):{},available=cap.localExtractionAvailable===true;
 const unavailableReason=available?null:local.configured===true?'已配置的本地解析器未通过当前环境能力检查，请检查工具运行与资源监测条件。':'尚未配置本地PDF解析器，请由本机管理员配置后重试。';
 const v=object(value),d=object(v.document),registered=registeredOriginals(p).find(r=>r.id===documentId),job=p.jobs.find(j=>j.documentId===documentId);
 if(!registered||!job||!bridgeStorageJob(p,job)||v.revision!==p.revision||d.id!==documentId||d.projectId!==p.id||d.sha256!==registered.sha256||d.taskCardId!==registered.taskCardId||d.taskCardHash!==registered.taskCardHash||v.scope!=='local_pdf_extraction'||v.modelReading!=='not_verified'||v.humanAdoption!=='not_verified'||d.modelReading!=='not_verified'||d.humanAdoption!=='not_verified')return bad();
 const card=p.cards.find(c=>c.id===p.activeTaskCardId),current=Boolean(card&&card.id===registered.taskCardId&&await originalHash(new TextEncoder().encode(JSON.stringify(card.original)))===registered.taskCardHash);
 if(d.isCurrent!==current||JSON.stringify(v.extractionRef)!==JSON.stringify(registered.document.extraction??null))return bad();
 let result:OriginalDocumentState['result']=null;
 if(v.extraction!==null){
  const x=object(v.extraction),ref=object(v.extractionRef),statuses:PdfTextStatus[]=['text_extracted','partial','no_text','password_required','invalid','limit_exceeded','failed'],status=statuses.find(s=>s===x.status);
  const bytes=new TextEncoder().encode(JSON.stringify(x));
  if(!status||x.protocol!=='pdf-extraction-v1'||x.rawHash!==registered.sha256||typeof x.text!=='string'||bytes.byteLength!==ref.byteLength||await originalHash(bytes)!==ref.sha256||await originalHash(new TextEncoder().encode(x.text))!==x.textHash||new TextEncoder().encode(x.text).byteLength>1024*1024)return bad();
  const pages=records(x.pages);if(pages.length>100)return bad();let offset=0;
  for(const [i,page]of pages.entries()){
   if(page.number!==i+1||typeof page.text!=='string'||page.textStartUtf16!==offset||page.textEndUtf16!==offset+page.text.length||await originalHash(new TextEncoder().encode(page.text))!==page.textHash||x.text.slice(offset,integer(page.textEndUtf16))!==page.text)return bad();offset=integer(page.textEndUtf16)+1;
  }
  if(pages.map(p=>p.text).join('\f')!==x.text||!Array.isArray(x.diagnostics)||x.diagnostics.some(d=>typeof d!=='string'))return bad();
  result={status,pages:pages.map(p=>({number:integer(p.number),text:text(p.text)})),diagnostics:x.diagnostics,identity:JSON.stringify(x.identity,null,2)};
 }else if(v.extractionRef!==null)return bad();
 return {projectId:p.id,revision:p.revision,documentId,taskCardId:registered.taskCardId,taskCardHash:registered.taskCardHash,current,available,unavailableReason,capabilityDiagnostic:available?null:text(local.reason)||null,jobStatus:text(job.status),result};
 }catch(error){if(error instanceof ServiceError&&error.outcomeUnknown)throw error;return bad();}
}
export function extractionReceipt(p:Snapshot,value:unknown,body:Record<string,unknown>){
 try{
 const v=object(value),receipt=object(v.receipt),job=p.jobs.find(j=>j.id===v.jobId&&j.documentId===body.documentId);
 let command:Record<string,unknown>;try{command=object(JSON.parse(text(p.processedCommands[text(body.commandId)])));}catch{return bad();}
 const request=object(command.request),expected=body.action==='retry_local'?{...body,jobId:job?.id}:body;
 if(!job||!bridgeStorageJob(p,job)||receipt.commandId!==body.commandId||typeof receipt.replayed!=='boolean'||command.kind!==(body.action==='retry_local'?'intake-retry-local':'intake-start')||Object.keys(request).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>request[k]!==v)||body.action==='extract'&&command.jobId!==job.id)return bad();
 if(['running','queued'].includes(text(job.status)))throw new ServiceError('response_lost','原本地解析仍待核对，请保留原请求；不会重复启动。',{outcomeUnknown:true});
 }catch(error){if(error instanceof ServiceError&&error.outcomeUnknown)throw error;return bad();}
}
