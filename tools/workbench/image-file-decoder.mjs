import {createHash,randomUUID} from 'node:crypto';
import {open,realpath,lstat,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {originalDecodeScript} from './image-decoder-script.mjs';
const LIMIT=8*1024*1024,sha=b=>createHash('sha256').update(b).digest('hex');
const fileScript=originalDecodeScript.replace('data = sys.stdin.buffer.read(8388609)',`import os, stat, hashlib
fd = 3
info = os.fstat(fd)
if not stat.S_ISREG(info.st_mode): raise ValueError('not a regular file')
os.lseek(fd, 0, os.SEEK_SET)
chunks = []
remaining = 8388609
while remaining:
    chunk = os.read(fd, remaining)
    if not chunk: break
    chunks.append(chunk)
    remaining -= len(chunk)
data = b''.join(chunks)
if hashlib.sha256(data).hexdigest() != sys.argv[1]: raise ValueError('image hash changed')`);
if(fileScript===originalDecodeScript)throw Error('decoder script mismatch');
export async function inspectFileImage(input,{pythonBinary='python3',decoderTempRoot,beforeSpawn}={}){
 if(!(input instanceof Uint8Array)||input.byteLength<1||input.byteLength>LIMIT)throw Error('Image bytes must be within 8 MiB');
 if(typeof decoderTempRoot!=='string'||!isAbsolute(decoderTempRoot)||await realpath(decoderTempRoot)!==decoderTempRoot)throw Error('Decoder directory must be canonical');
 const dirInfo=await lstat(decoderTempRoot);if(!dirInfo.isDirectory()||dirInfo.isSymbolicLink()||(dirInfo.mode&0o077)!==0||dirInfo.uid!==process.getuid())throw Error('Decoder directory must be private and owned');
 const bytes=Buffer.from(input),expected=sha(bytes),path=join(decoderTempRoot,'image-'+randomUUID()),handle=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);let original;
 try{
  original=await handle.stat();await handle.writeFile(bytes);await handle.sync();
  const verify=async()=>{const fd=await handle.stat(),named=await lstat(path);if(!fd.isFile()||named.isSymbolicLink()||!named.isFile()||fd.dev!==original.dev||fd.ino!==original.ino||named.dev!==original.dev||named.ino!==original.ino||fd.nlink!==1||fd.size!==bytes.length)throw Error('Decoder file identity changed');const buf=Buffer.alloc(bytes.length+1);let n=0;while(n<buf.length){const r=await handle.read(buf,n,buf.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}if(n!==bytes.length||sha(buf.subarray(0,n))!==expected)throw Error('Decoder file bytes changed');};
  await verify();if(beforeSpawn)await beforeSpawn({path});await verify();
  const result=await new Promise((resolve,reject)=>{const child=spawn(pythonBinary,['-c',fileScript,expected],{stdio:['ignore','pipe','pipe',handle.fd]});let output='',error='',settled=false;const timer=setTimeout(()=>child.kill('SIGKILL'),15000);child.stdout.on('data',b=>{output+=b;if(output.length>4096)child.kill('SIGKILL');});child.stderr.on('data',b=>{error=(error+b).slice(0,4096);});child.on('error',e=>{if(!settled){settled=true;clearTimeout(timer);reject(e);}});child.on('close',(code,signal)=>{if(settled)return;settled=true;clearTimeout(timer);if(code!==0)return reject(Error(`Image decoding failed: ${error.slice(-500)}${signal?' signal '+signal:''}`));try{resolve(JSON.parse(output));}catch{reject(Error('Invalid image decoder response'));}});});
  await verify();return result;
 }finally{try{const named=await lstat(path);if(original&&named.dev===original.dev&&named.ino===original.ino&&!named.isSymbolicLink())await unlink(path);}catch(e){if(e.code!=='ENOENT')throw e;}finally{await handle.close();}}
}
