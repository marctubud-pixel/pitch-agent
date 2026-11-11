import {MODEL_VIEW_CONTENT_CONTRACT,planningContentPacket} from './content-contract-versions.mjs';
import {readdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {sketchHash as hash,sketchRequire as need} from './sketch-authority.mjs';
import {CONTENT_RESOURCE_PROFILE as profile,requireContentBytes} from './content-resource-policy.mjs';

async function treeBytes(path,{depth=0,project=false}={}) {
 need(depth<=16,'CONTENT_RESOURCE_LIMIT','Managed original directory depth exceeds its finite ceiling');
 let info;try{info=await lstat(path);}catch(error){if(error.code==='ENOENT')return {bytes:0,files:0};throw error;}
 need(!info.isSymbolicLink(),'CONTENT_RESOURCE_LIMIT','Original accounting refuses symlinks');
 if(info.isFile()){requireContentBytes('originalFileBytes',info.size);return {bytes:info.size,files:1};}
 need(info.isDirectory(),'CONTENT_RESOURCE_LIMIT','Only regular managed originals can consume a reservation');
 const entries=await readdir(path,{withFileTypes:true});need(entries.length<=10000,'CONTENT_RESOURCE_LIMIT','Managed original directory entry ceiling exceeded');
 let bytes=0,files=0;
 for(const entry of entries){if(project&&depth===0&&/^(?:db(?:-|$)|.*\.sqlite(?:-|$))/.test(entry.name))continue;const result=await treeBytes(join(path,entry.name),{depth:depth+1,project});bytes+=result.bytes;files+=result.files;need(files<=100000&&bytes<=profile.projectOriginalBytes,'CONTENT_RESOURCE_LIMIT','Cumulative managed originals exceed their finite reservation');}
 return {bytes,files};
}
export async function admitContentOriginalRetention(project,root,{executionRoot,reserveAttempt=false}={}) {
 need(resolve(executionRoot)===executionRoot&&await realpath(executionRoot)===executionRoot,'CONTENT_RESOURCE_LIMIT','Canonical original storage root required');
 const total=await treeBytes(executionRoot,{project:true});
 let graphBytes=(await treeBytes(join(executionRoot,'content-planning',root.id))).bytes+(await treeBytes(join(executionRoot,root.id))).bytes;
 const attempts=[];
 for(const job of project.jobs.filter(j=>j.contentRootJobId===root.id))for(const attempt of job.attempts){
  need(typeof attempt.id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(attempt.id),'CONTENT_RESOURCE_LIMIT','Server attempt identity required for accounting');
  const wrapper=await treeBytes(join(executionRoot,attempt.id)),transport=await treeBytes(join(executionRoot,'ordinary-model-http',hash(attempt.id))),bytes=wrapper.bytes+transport.bytes;requireContentBytes('attemptOriginalBytes',bytes);graphBytes+=bytes;attempts.push({attemptId:attempt.id,bytes});
 }
 const consumed=project.jobs.filter(j=>j.contentRootJobId===root.id).reduce((sum,j)=>sum+j.attempts.filter(a=>a.dispatchStarted).length,0),reserve=reserveAttempt?Math.max(0,13-consumed)*profile.attemptOriginalBytes:0;
 requireContentBytes('graphOriginalBytes',graphBytes+reserve);const graphs=project.jobs.filter(j=>j.purpose==='complete_content_plan'&&planningContentPacket(j.task.packetVersion)).length;requireContentBytes('projectOriginalBytes',total.bytes+reserve+(reserveAttempt?Math.max(0,profile.maximumGraphs-graphs)*profile.graphOriginalBytes:0));
 return {projectBytes:total.bytes,graphBytes,attempts,files:total.files};
}
