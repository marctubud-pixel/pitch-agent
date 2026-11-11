import {reopenOrdinary,isOrdinaryHttp} from './ordinary-model.mjs';
import {open} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {parseCodexEvents} from './codex-provider.mjs';
import {dirname} from 'node:path';
import {readReferenceOriginalBytes,REFERENCE_ORIGINAL_LIMITS} from './reference-original.mjs';
import {referenceHash as hash,referenceRequire as need} from './reference-review.mjs';

export async function saveReferenceResult(path,value){
 const bytes=JSON.stringify(value,null,2),file=await open(path,'wx');
 try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
 const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
 return {path,byteLength:Buffer.byteLength(bytes),sha256:hash(bytes)};
}
export async function readReferenceResult(root,descriptor){
 need(descriptor&&Number.isSafeInteger(descriptor.byteLength)&&descriptor.byteLength<=REFERENCE_ORIGINAL_LIMITS.packetBytes,'INVALID_REFERENCE_RESULT','Bounded saved reference result required');
 const bytes=await readReferenceOriginalBytes(descriptor.path,{root,length:descriptor.byteLength,accounting:{reservedBytes:0,descriptorReads:0,actualBytes:0}});
 need(hash(bytes.toString('utf8'))===descriptor.sha256,'REFERENCE_CAPTURE_CHANGED','Saved reference result bytes changed');
 return bytes.toString('utf8');
}

export async function verifyReferenceProviderOriginal(root,receipt,call){
 if(isOrdinaryHttp(receipt)){need(call,'INVALID_EXECUTION_RECEIPT','Frozen reference request and packet required');await reopenOrdinary({...call,executionRoot:root,receipt});return;}
 need(receipt.provider==='codex-cli','INVALID_EXECUTION_RECEIPT','Unknown saved reference origin');
 const read=async path=>(await readReferenceOriginalBytes(path,{root,limit:REFERENCE_ORIGINAL_LIMITS.packetBytes,accounting:{reservedBytes:0,descriptorReads:0,actualBytes:0}})).toString('utf8');
 const input=await read(receipt.paths.input),disk=JSON.parse(await read(receipt.paths.receipt));
 const {responseText,parsedOutput,schemaValidated,...original}=receipt.providerExecution;
 need(hash(input)===receipt.inputPacketHash&&isDeepStrictEqual(disk,original),'REFERENCE_CAPTURE_CHANGED','Original provider input or terminal receipt changed');
 need((await read(receipt.paths.output))===receipt.responseText,'REFERENCE_CAPTURE_CHANGED','Original provider response bytes changed');
 const events=parseCodexEvents(await read(receipt.paths.stdout));
 need(events.completed&&!events.failed&&events.threadId===receipt.threadId,'INVALID_EXECUTION_RECEIPT','Original provider completion must be corroborated');
}
