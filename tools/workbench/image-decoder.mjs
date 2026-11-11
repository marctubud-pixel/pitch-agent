import {mkdtemp,realpath,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectFileImage} from './image-file-decoder.mjs';
export async function inspectImage(bytes,{pythonBinary='python3'}={}){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>8*1024*1024)throw Error('Image bytes must be within 8 MiB');
 const snapshot=Buffer.from(bytes);
 const root=await realpath(await mkdtemp(join(tmpdir(),'proposal-image-decode-')));
 try{return await inspectFileImage(snapshot,{pythonBinary,decoderTempRoot:root});}
 finally{await rmdir(root);}
}
