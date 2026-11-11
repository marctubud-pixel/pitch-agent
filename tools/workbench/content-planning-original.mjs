import {constants} from 'node:fs';
import {mkdir,lstat,open,realpath} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {contentPlanningManifest} from './complete-content.mjs';
import {requirePlanningAuthority} from './content-planning-authority.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';

export const CONTENT_PLANNING_MAX_BYTES=8*1024*1024;
const syncDirectory=async path=>{const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}};
function pathFor(executionRoot,root) {
 need(/^content-[a-f0-9]{64}$/.test(root.id),'CONTENT_PLANNING_PATH_INVALID','Server-selected content root identity required');
 return join(executionRoot,'content-planning',root.id,'manifest.json');
}
async function safeBase(executionRoot) {
 need(resolve(executionRoot)===executionRoot&&await realpath(executionRoot)===executionRoot,'CONTENT_PLANNING_PATH_INVALID','Canonical managed execution root required');
 let path=sep;
 for(const part of executionRoot.split(sep).filter(Boolean)){path=join(path,part);const info=await lstat(path);need(info.isDirectory()&&!info.isSymbolicLink(),'CONTENT_PLANNING_PATH_INVALID','Managed authority refuses symlink components');}
}
export async function persistContentPlanningOriginal(project,root,{executionRoot}) {
 const authority=requirePlanningAuthority(root,contentPlanningManifest(project,root));
 need(authority.ref.byteLength<=CONTENT_PLANNING_MAX_BYTES,'CONTENT_PLANNING_TOO_LARGE','Canonical manifest exceeds the frozen finite byte ceiling');
 await safeBase(executionRoot);
 const parent=join(executionRoot,'content-planning'),folder=join(parent,root.id),path=pathFor(executionRoot,root);
 for(const directory of [parent,folder]){try{await mkdir(directory,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}const info=await lstat(directory);need(info.isDirectory()&&!info.isSymbolicLink(),'CONTENT_PLANNING_PATH_INVALID','Managed authority directory must be regular and server selected');await syncDirectory(directory);}
 try{const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o400);try{await file.writeFile(authority.text,'utf8');await file.sync();}finally{await file.close();}}catch(error){if(error.code!=='EEXIST')throw error;}
 await syncDirectory(folder);await syncDirectory(parent);await syncDirectory(executionRoot);
 return reopenContentPlanningOriginal(project,root,{executionRoot});
}
export async function reopenContentPlanningOriginal(project,root,{executionRoot}) {
 await safeBase(executionRoot);
 const authority=requirePlanningAuthority(root,contentPlanningManifest(project,root));
 need(authority.ref.byteLength<=CONTENT_PLANNING_MAX_BYTES,'CONTENT_PLANNING_TOO_LARGE','Bounded canonical manifest required');
 const bytes=await readManagedLayoutBytes(executionRoot,pathFor(executionRoot,root),CONTENT_PLANNING_MAX_BYTES);
 need(bytes.length===authority.ref.byteLength&&bytes.equals(Buffer.from(authority.text)),'CONTENT_PLANNING_ORIGINAL_CHANGED','Canonical immutable planning original changed or disappeared');
 return authority;
}
