import type {VisualAService,VisualAction,VisualImage} from '../../domain/visualA';
import type {CommandMeta} from '../../domain/models';
import {ServiceError} from '../../domain/service';
import {object,parseSnapshot,text} from './dto';
import {visualState,visualReceipt,visualImage} from './visualAProjection';
import {VisualAJournal,bytesBase64,base64Bytes,type VisualPending} from './visualAJournal';
import {originalHash} from './intakeProjection';
export interface VisualTransport {
 baseUrl:string;fetchImpl?:typeof fetch;headers:()=>Promise<Record<string,string>>;
 journal:VisualAJournal;authorize:(route:string)=>void;guard:()=>void;changed:()=>void;
 error:(response:Response|null)=>Promise<ServiceError>;
}
export class HttpVisualAService implements VisualAService {
 private busy=false;
 constructor(private options:VisualTransport){}
 pending=()=>this.busy||this.options.journal.read()!==null;
 private path(id:string,route:string){return `${this.options.baseUrl.replace(/\/$/,'')}/projects/${encodeURIComponent(id)}/${route}`;}
 private async request(id:string,route:string,init:RequestInit={}){let response:Response;try{response=await(this.options.fetchImpl??fetch)(this.path(id,route),{...init,headers:{...await this.options.headers(),...init.headers}});}catch{throw await this.options.error(null);}if(!response.ok)throw await this.options.error(response);return response;}
 async get(id:string){const response=await this.request(id,'visual-workflow');return visualState(await response.json(),id);}
 async image(id:string,image:VisualImage){const response=await this.request(id,`visual-images/${encodeURIComponent(image.imageId)}`),bytes=new Uint8Array(await response.arrayBuffer());if(response.headers.get('Content-Type')!==image.mediaType||bytes.length!==image.byteLength||await originalHash(bytes)!==image.sha256)throw new ServiceError('validation','原图片字节与登记身份不一致，未展示。');return new Blob([bytes],{type:image.mediaType});}
 async act(id:string,action:VisualAction,meta:CommandMeta){const pending={projectId:id,route:action.route,body:JSON.stringify({commandId:meta.commandId,expectedRevision:meta.expectedRevision,...action.input}),mediaType:'application/json',rawBase64:null};const value=await this.send(pending);const data=visualState(value,id);return {data,revision:data.revision,commandId:meta.commandId,replayed:object(object(value).receipt).replayed===true};}
 async upload(id:string,file:File,description:string,meta:CommandMeta){if(!['image/png','image/jpeg'].includes(file.type)||file.size>8*1024*1024||!file.size||!description.trim())throw new ServiceError('validation','请选择 8MiB 内 PNG/JPEG 原图并写明来源与使用限制。');const bytes=new Uint8Array(await file.arrayBuffer()),body=JSON.stringify({commandId:meta.commandId,expectedRevision:meta.expectedRevision,originalFilename:file.name,description,sha256:await originalHash(bytes)});if(bytesBase64(new TextEncoder().encode(body)).length>2048)throw new ServiceError('validation','图片名称或说明过长，未发送。');const value=await this.send({projectId:id,route:'visual-image-uploads',body,mediaType:file.type,rawBase64:bytesBase64(bytes)}),p=parseSnapshot(value);return {data:visualImage(object(value).asset),revision:p.revision,commandId:meta.commandId,replayed:object(value).replayed===true};}
 async retry(){const p=this.options.journal.read();if(!p)throw new ServiceError('validation','没有待核对的视觉提交。');await this.send(p);}
 private async send(p:VisualPending){
  if(this.busy)throw new ServiceError('validation','视觉提交正在处理中。');this.options.authorize(p.route);this.options.guard();
  if(new TextEncoder().encode(p.body).length>128*1024)throw new ServiceError('validation','视觉请求超出大小限制。');
  this.options.journal.begin(p);this.busy=true;
  try{const response=await this.request(p.projectId,p.route,{method:'POST',headers:{'Content-Type':p.mediaType,...(p.rawBase64===null?{}:{'X-Workbench-Image-Meta':bytesBase64(new TextEncoder().encode(p.body))})},body:p.rawBase64===null?p.body:base64Bytes(p.rawBase64)}),value:unknown=await response.json(),body=object(JSON.parse(p.body));
   if(p.rawBase64===null){visualReceipt(value,p.projectId,p.route,body);visualState(value,p.projectId);}else{const root=object(value),snapshot=parseSnapshot(value),image=visualImage(root.asset);if(snapshot.id!==p.projectId||root.revision!==snapshot.revision||typeof root.replayed!=='boolean'||image.sha256!==body.sha256||!snapshot.imageAssets.some(a=>a.id===image.imageId&&a.sha256===image.sha256))throw new ServiceError('response_lost','上传回执待核对，请保留原图请求。',{outcomeUnknown:true,retryable:true});const saved=Object.values(snapshot.processedCommands).some(x=>{try{const c=object(JSON.parse(text(x)));return c.kind==='register-image'&&JSON.stringify(c.visualUpload)===p.body&&object(c.asset).id===image.imageId;}catch{return false;}});if(!saved)throw new ServiceError('response_lost','上传原请求尚未核对。',{outcomeUnknown:true,retryable:true});await this.image(p.projectId,image);}
   this.options.journal.clear();this.options.changed();return value;
  }finally{this.busy=false;}
 }
}
