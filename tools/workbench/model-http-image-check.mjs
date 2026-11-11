import {inspectImage,IMAGE_LIMITS} from './image-evidence.mjs';
const chunks=[];
let length=0;
try {
  for await(const chunk of process.stdin){
    length+=chunk.length;
    if(length>IMAGE_LIMITS.bytes)throw new Error('size');
    chunks.push(chunk);
  }
  const result=await inspectImage(Buffer.concat(chunks,length));
  process.stdout.write(JSON.stringify(result));
} catch {
  process.exitCode=1;
}
