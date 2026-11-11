import {createHash} from 'node:crypto';
import {mkdir,open,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {inspectImage} from './image-evidence.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function readPinnedEditorResource({executionRoot,pin}){
 need(pin&&['brand','assets','font'].includes(pin.kind)&&typeof pin.path==='string'&&/^[a-f0-9]{64}$/.test(pin.sha256),'LOCAL_EDITOR_RESOURCE_PIN_REQUIRED');
 const limit=pin.kind==='font'?64*1024*1024:8*1024*1024,bytes=await readManagedLayoutBytes(executionRoot,pin.path,limit);
 need(bytes.length>0&&sha(bytes)===pin.sha256&&(pin.byteLength===undefined||Number.isSafeInteger(pin.byteLength)&&pin.byteLength===bytes.length),'LOCAL_EDITOR_RESOURCE_CHANGED');
 return {bytes,descriptor:{path:pin.path,sha256:pin.sha256,byteLength:bytes.length}};
}
export function inspectEditorFont(bytes){
 need(Buffer.isBuffer(bytes)&&bytes.length>=12,'LOCAL_EDITOR_FONT_FORMAT_UNSUPPORTED');
 const tag=bytes.subarray(0,4).toString('ascii');need(tag!=='ttcf','LOCAL_EDITOR_FONT_COLLECTION_UNSUPPORTED');
 const otf=tag==='OTTO',ttf=bytes.readUInt32BE(0)===0x00010000||tag==='true';need(otf||ttf,'LOCAL_EDITOR_FONT_FORMAT_UNSUPPORTED');
 const count=bytes.readUInt16BE(4);need(count>0&&count<=4096&&12+count*16<=bytes.length,'LOCAL_EDITOR_FONT_METADATA_INVALID');
 const tables=new Map();for(let n=0;n<count;n++){const i=12+n*16,name=bytes.subarray(i,i+4).toString('ascii'),offset=bytes.readUInt32BE(i+8),length=bytes.readUInt32BE(i+12);need(!tables.has(name)&&offset<=bytes.length&&length<=bytes.length-offset,'LOCAL_EDITOR_FONT_METADATA_INVALID');tables.set(name,{offset,length});}
 const head=tables.get('head'),name=tables.get('name'),maxp=tables.get('maxp');need(head?.length>=54&&name?.length>=6&&maxp?.length>=6&&bytes.readUInt32BE(head.offset+12)===0x5f0f3cf5&&bytes.readUInt16BE(maxp.offset+4)>0&&(otf?tables.has('CFF ')||tables.has('CFF2'):tables.has('glyf')&&tables.has('loca')),'LOCAL_EDITOR_FONT_METADATA_INVALID');
 const n=bytes.readUInt16BE(name.offset+2),strings=bytes.readUInt16BE(name.offset+4);need(n>0&&6+n*12<=name.length&&strings<=name.length,'LOCAL_EDITOR_FONT_METADATA_INVALID');let family=null;
 for(let index=0;index<n;index++){const start=name.offset+6+index*12,platform=bytes.readUInt16BE(start),nameId=bytes.readUInt16BE(start+6),length=bytes.readUInt16BE(start+8),offset=bytes.readUInt16BE(start+10);need(strings+offset+length<=name.length,'LOCAL_EDITOR_FONT_METADATA_INVALID');if(nameId!==1||length===0||length>4096||![0,3].includes(platform))continue;const text=Buffer.from(bytes.subarray(name.offset+strings+offset,name.offset+strings+offset+length));need(length%2===0,'LOCAL_EDITOR_FONT_METADATA_INVALID');family??=text.swap16().toString('utf16le').replace(/\0/g,'').trim();}
 need(typeof family==='string'&&family.length>0,'LOCAL_EDITOR_FONT_METADATA_REQUIRED');return {extension:otf?'.otf':'.ttf',family,tableCount:count};
}
export async function materializeTypedEditorResource({executionRoot,descriptor,kind,pythonBinary='python3'}){
 need(['font','image'].includes(kind)&&descriptor&&typeof descriptor.path==='string'&&Number.isSafeInteger(descriptor.byteLength)&&descriptor.byteLength>0&&descriptor.byteLength<=64*1024*1024&&/^[a-f0-9]{64}$/.test(descriptor.sha256),'LOCAL_EDITOR_RESOURCE_DESCRIPTOR_REQUIRED');
 const bytes=await readManagedLayoutBytes(executionRoot,descriptor.path,descriptor.byteLength);need(bytes.length===descriptor.byteLength&&sha(bytes)===descriptor.sha256,'LOCAL_EDITOR_RESOURCE_CHANGED');
 let inspection,extension;if(kind==='font'){inspection=inspectEditorFont(bytes);extension=inspection.extension;}else{inspection=await inspectImage(bytes,{pythonBinary});extension=inspection.mediaType==='image/png'?'.png':inspection.mediaType==='image/jpeg'?'.jpg':null;need(extension,'LOCAL_EDITOR_IMAGE_FORMAT_UNSUPPORTED');if(descriptor.width!==undefined)need(inspection.width===descriptor.width&&inspection.height===descriptor.height,'LOCAL_EDITOR_IMAGE_DIMENSIONS_CHANGED');}
 const base=await realpath(executionRoot),directory=join(base,'editor-resource-aliases');await mkdir(directory,{recursive:true});need(await realpath(directory)===directory,'LOCAL_EDITOR_TYPED_RESOURCE_PATH_CHANGED');const file=join(directory,descriptor.sha256+extension);
 try{const fd=await open(file,'wx',0o400);try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}const d=await open(dirname(file),'r');try{await d.sync();}finally{await d.close();}}catch(e){if(e.code!=='EEXIST')throw e;}
 const alias=await readManagedLayoutBytes(base,file,descriptor.byteLength);need(alias.length===bytes.length&&sha(alias)===descriptor.sha256,'LOCAL_EDITOR_TYPED_RESOURCE_CHANGED');
 const current=await readManagedLayoutBytes(base,descriptor.path,descriptor.byteLength);need(current.length===bytes.length&&sha(current)===descriptor.sha256,'LOCAL_EDITOR_RESOURCE_CHANGED');
 return {path:file,sha256:descriptor.sha256,byteLength:bytes.length,originalPath:descriptor.path,inspection,kind};
}
