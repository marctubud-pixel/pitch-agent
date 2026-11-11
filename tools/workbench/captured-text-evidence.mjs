import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=message=>{throw Object.assign(Error(message),{code:'INVALID_CAPTURED_TEXT_EVIDENCE'});};
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function capturedTextRecord(project,captureId){
 const capture=project.sourceCaptures?.find(c=>c.id===captureId),r=capture?.record;
 if(!capture||capture.projectId!==project.id||capture.id!=='capture_'+capture.recordHash||!sha(capture.recordHash)||hash(JSON.stringify(r,null,2)+'\n')!==capture.recordHash)fail('Registered immutable capture required');
 const jobs=project.jobs.filter(j=>j.purpose==='source_capture'&&j.status==='succeeded'&&j.outputVersionIds?.includes(capture.id)&&j.task.url===r.requestedUrl&&j.attempts.some(a=>a.status==='succeeded'&&isDeepStrictEqual(a.acquisitionReceipt,{recordHash:capture.recordHash,recordPath:capture.recordPath,rawHash:r.raw?.sha256})));
 if(!jobs.length||r.httpStatus!==200||!['text/html','application/xhtml+xml'].includes(r.mimeType)||!['static-html-tokenizer-v1','static-html-tokenizer-v2'].includes(r.extraction?.method)||typeof r.extraction?.text!=='string'||!r.extraction.text.trim()||r.extraction.text.length>20000||!sha(r.raw?.sha256)||hash(r.extraction.text)!==r.extraction.textHash)fail('Successful bounded HTML text capture required');
 return {id:'captured-text_'+capture.recordHash,url:r.finalUrl,text:r.extraction.text,scopeRelation:'background',verification:'captured',reason:'Server-managed public page text; capture establishes bytes and attribution only, not authenticity, representativeness or factual truth.',managedCapture:{captureId:capture.id,recordHash:capture.recordHash,rawHash:r.raw.sha256,textHash:r.extraction.textHash}};
}
export function currentCapturedTextSources(project,sources){
 for(const source of sources??[])if(source?.managedCapture!==undefined||source?.id?.startsWith('captured-text_')){
  if(!isDeepStrictEqual(source,capturedTextRecord(project,source.managedCapture?.captureId)))fail('Captured text must match exact registered bytes and fixed source authority');
 }
}
export function validateCapturedTextShape(source){
 const m=source?.managedCapture;
 if(!source||Object.keys(source).sort().join('|')!==['id','url','text','scopeRelation','verification','reason','managedCapture'].sort().join('|')||!m||Object.keys(m).sort().join('|')!==['captureId','recordHash','rawHash','textHash'].sort().join('|')||m.captureId!=='capture_'+m.recordHash||!['recordHash','rawHash','textHash'].every(k=>sha(m[k]))||source.id!=='captured-text_'+m.recordHash||source.scopeRelation!=='background'||source.verification!=='captured'||typeof source.text!=='string'||!source.text.trim()||source.text.length>20000||hash(source.text)!==m.textHash||source.caseIdentity!==undefined||source.identityStatus!==undefined)fail('Captured text delta cannot carry case or verified authority');
 return source;
}
