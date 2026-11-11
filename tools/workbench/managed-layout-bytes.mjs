import {lstat,realpath,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,relative,sep,join} from 'node:path';
import {sketchRequire as need} from './sketch-authority.mjs';
const sameFile=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
export async function readManagedLayoutBytes(root,path,maxBytes=8*1024*1024){
 need(Number.isSafeInteger(maxBytes)&&maxBytes>0,'LAYOUT_MANAGED_BYTES_REQUIRED','Finite positive managed byte limit required');
 const base=await realpath(root),rel=relative(resolve(root),resolve(path));
 need(rel&&!rel.startsWith(`..${sep}`)&&rel!=='..'&&!rel.startsWith(sep),'LAYOUT_MANAGED_BYTES_REQUIRED','Original bounded bytes must stay in managed execution storage');
 const actual=join(base,rel),ancestors=[];
 let current=base;
 for(const part of rel.split(sep)){current=join(current,part);const info=await lstat(current);need(!info.isSymbolicLink(),'LAYOUT_SYMLINK_REFUSED','Managed layout input cannot follow a symlink');ancestors.push({path:current,info});}
 const info=ancestors.at(-1).info;
 need(info.isFile()&&Number.isSafeInteger(info.size)&&info.size<=maxBytes,'LAYOUT_MANAGED_BYTES_REQUIRED','Bounded regular managed file required');
 const handle=await open(actual,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const before=await handle.stat();
  need(before.isFile()&&sameFile(before,info),'LAYOUT_MANAGED_BYTES_CHANGED','Original managed file changed before read');
  const buffer=Buffer.alloc(before.size+1);let length=0;
  while(length<buffer.length){const result=await handle.read(buffer,length,buffer.length-length,null);if(result.bytesRead===0)break;length+=result.bytesRead;}
  const after=await handle.stat();
  need(length===before.size&&sameFile(before,after),'LAYOUT_MANAGED_BYTES_CHANGED','Original managed file changed during read');
  need(await realpath(root)===base,'LAYOUT_MANAGED_BYTES_CHANGED','Managed storage root changed during read');
  for(const entry of ancestors){const final=await lstat(entry.path);need(!final.isSymbolicLink(),'LAYOUT_SYMLINK_REFUSED','Managed layout input cannot follow a symlink');need(final.dev===entry.info.dev&&final.ino===entry.info.ino,'LAYOUT_MANAGED_BYTES_CHANGED','Managed path changed during read');}
  need(sameFile(after,await lstat(actual)),'LAYOUT_MANAGED_BYTES_CHANGED','Original managed file changed after read');
  return buffer.subarray(0,length);
 }finally{await handle.close();}
}
