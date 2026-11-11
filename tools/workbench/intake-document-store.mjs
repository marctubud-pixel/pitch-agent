import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {open,mkdir,realpath,lstat,link,unlink} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';

export const digest=value=>createHash('sha256').update(typeof value==='string'||value instanceof Uint8Array?value:JSON.stringify(value)).digest('hex');
export const intakeError=(code,message,status=code==='NOT_FOUND'?404:['REVISION_CONFLICT','COMMAND_ID_REUSED'].includes(code)?409:422)=>Object.assign(new Error(message),{code,status});
export const requireIntake=(condition,code,message)=>{if(!condition)throw intakeError(code,message);};
export const DOCUMENT_LIMITS=Object.freeze({bytes:12*1024*1024,documents:20,packetBytes:2*1024*1024});
export async function checkedBytes(path,{maxBytes,sha256,byteLength}={}){
 requireIntake(await realpath(dirname(path))===dirname(path),'DOCUMENT_CORRUPT','Managed path ancestors changed');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const before=await handle.stat();
  requireIntake(before.isFile()&&before.size>=0&&before.size<=maxBytes&&(byteLength===undefined||before.size===byteLength),'DOCUMENT_CORRUPT','Managed file size or type changed');
  const bytes=Buffer.alloc(before.size+1);let offset=0;
  while(offset<bytes.length){const r=await handle.read(bytes,offset,Math.min(65536,bytes.length-offset),offset);if(!r.bytesRead)break;offset+=r.bytesRead;}
  const after=await handle.stat();
  requireIntake(offset===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs&&after.ctimeMs===before.ctimeMs,'DOCUMENT_CORRUPT','Managed file changed during read');
  const result=bytes.subarray(0,offset);
  requireIntake(sha256===undefined||digest(result)===sha256,'DOCUMENT_CORRUPT','Managed file hash changed');
  return result;
 }finally{await handle.close();}
}
export function createIntakeDocumentStore(rootDir){
 const root=resolve(rootDir);
 async function init(){
  await mkdir(root,{recursive:true,mode:0o700});
  requireIntake(await realpath(root)===root&&(await lstat(root)).isDirectory(),'DOCUMENT_CORRUPT','Managed store contains symlinks');
  for(const name of ['objects','results']){const path=join(root,name);await mkdir(path,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});requireIntake(await realpath(path)===path&&(await lstat(path)).isDirectory(),'DOCUMENT_CORRUPT','Managed store directory changed');}
 }
 async function save(directory,bytes){
  await init();const sha256=digest(bytes),path=join(root,directory,sha256),tmp=join(root,directory,`.write-${randomUUID()}`);
  const h=await open(tmp,'wx',0o400);
  try{await h.writeFile(bytes);await h.sync();try{await link(tmp,path);}catch(e){if(e.code!=='EEXIST')throw e;}}finally{await h.close();await unlink(tmp);}
  await checkedBytes(path,{maxBytes:Math.max(DOCUMENT_LIMITS.bytes,4*1024*1024),sha256,byteLength:bytes.length});
  const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
  return {sha256,byteLength:bytes.length};
 }
 return {
  async putOriginal(bytes){requireIntake(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=DOCUMENT_LIMITS.bytes,'INPUT_TOO_LARGE','Original must be within 12 MiB');return save('objects',bytes);},
  async readOriginal(raw){requireIntake(/^[a-f0-9]{64}$/.test(raw?.sha256),'DOCUMENT_CORRUPT','Managed original hash required');return checkedBytes(join(root,'objects',raw.sha256),{...raw,maxBytes:DOCUMENT_LIMITS.bytes});},
  async putResult(value){const bytes=Buffer.from(JSON.stringify(value));requireIntake(bytes.length<=4*1024*1024,'EXTRACTION_LIMIT_EXCEEDED','Result exceeds 4 MiB');return save('results',bytes);},
  async readResult(ref){requireIntake(/^[a-f0-9]{64}$/.test(ref?.sha256),'DOCUMENT_CORRUPT','Managed result hash required');return JSON.parse(await checkedBytes(join(root,'results',ref.sha256),{...ref,maxBytes:4*1024*1024}));},
 };
}
