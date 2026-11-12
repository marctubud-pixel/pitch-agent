import {ServiceError} from '../../domain/service';
import {object,text} from './dto';
export interface VisualPending {projectId:string;route:string;body:string;mediaType:string;rawBase64:string|null}
export class VisualAJournal {
 constructor(private key:()=>string,private storage:()=>Storage){}
 read():VisualPending|null {const raw=this.storage().getItem(this.key());if(!raw)return null;try{const p=object(JSON.parse(raw));if(!text(p.projectId)||!text(p.route)||!text(p.body)||!text(p.mediaType)||(p.rawBase64!==null&&typeof p.rawBase64!=='string'))throw Error();return {projectId:text(p.projectId),route:text(p.route),body:text(p.body),mediaType:text(p.mediaType),rawBase64:p.rawBase64};}catch{throw new ServiceError('validation','视觉待核请求损坏；请保留浏览器记录并停止提交。');}}
 begin(p:VisualPending){const prior=this.read();if(prior&&JSON.stringify(prior)!==JSON.stringify(p))throw new ServiceError('conflict','上次视觉提交仍待核对，请先核对原请求。');try{this.storage().setItem(this.key(),JSON.stringify(p));}catch{throw new ServiceError('validation','浏览器无法保留原图片与请求，本次未发送。');}}
 endRejected(p:VisualPending,diagnostic:{status:number;rejection:unknown;verifiedRevision:number;snapshotSha256:string}){
  if(JSON.stringify(this.read())!==JSON.stringify(p))throw new ServiceError('conflict','原待核请求已变化，未结束记录。');
  const key=this.key(),storage=this.storage(),commandId=text(object(JSON.parse(p.body)).commandId);
  // Archive the exact original bytes first. A quota or removal failure must keep the pending request.
  const archiveKey=`${key}:rejected:${encodeURIComponent(commandId)}:${crypto.randomUUID()}`;
  const archive=JSON.stringify({outcome:'confirmed_unrecorded_rejection',request:p,...diagnostic});
  storage.setItem(archiveKey,archive);
  if(storage.getItem(archiveKey)!==archive)throw new ServiceError('validation','拒绝诊断未能保存，原请求继续待核。');
  storage.removeItem(key);
  if(storage.getItem(key)!==null)throw new ServiceError('validation','原待核记录未能结束，请保留原请求。');
 }
 clear(){this.storage().removeItem(this.key());}
}
export function bytesBase64(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);}
export function base64Bytes(value:string){return Uint8Array.from(atob(value),x=>x.charCodeAt(0));}
