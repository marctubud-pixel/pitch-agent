import {mkdir,writeFile,lstat,realpath} from 'node:fs/promises';
import {dirname,join,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {layoutRendererIdentity,verifyLayoutRenderer} from './layout-renderer.mjs';
import {buildNativeExecutionV2} from './native-tree-identity.mjs';
import {verifyExecutionPins} from './layout-native-proof.mjs';
import {localLayoutBrand,localLayoutAssets,localLayoutConfiguration} from './local-acceptance-layout-driver.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const toolNames=['node','engine','nativeCheck','python','soffice','bash','nativeRuntime','presentationsSkill'];
export function localLayoutApplicationRequirements({source,caseId,requiredApplications}={}){
 need(['m6','dexian'].includes(caseId),'LOCAL_LAYOUT_CASE_REQUIRED');
 const targets=(source.visual.payload?.directions??source.visual.directions).flatMap(d=>d.targets);
 const selected=requiredApplications??source.task?.requiredApplications??targets.map(t=>({targetImageId:t.imageId,purpose:t.kind==='packaging'?'packaging-concept-board':'outdoor'}));
 need(Array.isArray(selected)&&selected.length>0&&targets.every(t=>selected.some(r=>r.targetImageId===t.imageId)),'LOCAL_LAYOUT_REQUIRED_APPLICATION_COVERAGE');
 if(source.task?.requiredApplications!==undefined)need(JSON.stringify(selected)===JSON.stringify(source.task.requiredApplications),'LOCAL_LAYOUT_TASK_APPLICATIONS_CHANGED');
 return structuredClone(selected);
}
export async function localLayoutToolStatus(tools){
 if(!tools||toolNames.some(k=>typeof tools[k]!=='string'||!isAbsolute(tools[k])))return {status:'not_configured',reason:'LOCAL_LAYOUT_NATIVE_TOOL_PATHS_REQUIRED',required:toolNames};
 for(const name of toolNames){try{const path=await realpath(tools[name]),info=await lstat(path);if(!(['nativeRuntime','presentationsSkill'].includes(name)?info.isDirectory():info.isFile())||['node','python','soffice','bash'].includes(name)&&(info.mode&0o111)===0)return {status:'not_configured',reason:'LOCAL_LAYOUT_NATIVE_TOOL_UNAVAILABLE',tool:name};}catch(e){if(e.code==='ENOENT')return {status:'not_configured',reason:'LOCAL_LAYOUT_NATIVE_TOOL_UNAVAILABLE',tool:name};throw e;}}
 return {status:'configured',paths:{...Object.fromEntries(await Promise.all(toolNames.map(async k=>[k,await realpath(tools[k])]))),extraFiles:tools.extraFiles??[],extraRoots:tools.extraRoots??[]}};
}
export async function freezeLocalLayoutFile({executionRoot,record,kind}){
 need(typeof record?.path==='string'&&isAbsolute(record.path)&&/^[a-f0-9]{64}$/.test(record.sha256)&&['image','font','mockup'].includes(kind),'LOCAL_LAYOUT_RESOURCE_RECORD_REQUIRED');
 need(await realpath(record.path)===record.path,'LOCAL_LAYOUT_RESOURCE_CANONICAL_REQUIRED');
 const bytes=await readManagedLayoutBytes(dirname(record.path),record.path,64*1024*1024);need(bytes.length>0&&sha(bytes)===record.sha256&&(record.byteLength===undefined||record.byteLength===bytes.length),'LOCAL_LAYOUT_RESOURCE_BYTES_CHANGED');
 const root=await realpath(executionRoot),directory=join(root,'local-layout-resources');await mkdir(directory,{recursive:true,mode:0o700});need(await realpath(directory)===directory,'LOCAL_LAYOUT_RESOURCE_CANONICAL_REQUIRED');
 const path=join(directory,record.sha256);try{await writeFile(path,bytes,{flag:'wx',mode:0o400});}catch(e){if(e.code!=='EEXIST')throw e;}
 need(sha(await readManagedLayoutBytes(root,path,64*1024*1024))===record.sha256,'LOCAL_LAYOUT_RESOURCE_BYTES_CHANGED');
 return {id:kind+'-'+record.sha256,kind,path,sha256:record.sha256,byteLength:bytes.length};
}
async function freezeJSON(executionRoot,kind,value){const root=await realpath(executionRoot),bytes=Buffer.from(JSON.stringify(value)),hash=sha(bytes),dir=join(root,'local-layout-resources');await mkdir(dir,{recursive:true,mode:0o700});const path=join(dir,kind+'-'+hash+'.json');try{await writeFile(path,bytes,{flag:'wx',mode:0o400});}catch(e){if(e.code!=='EEXIST')throw e;}need(sha(await readManagedLayoutBytes(root,path,8*1024*1024))===hash,'LOCAL_LAYOUT_RESOURCE_BYTES_CHANGED');return {id:kind,kind,path,sha256:hash,byteLength:bytes.length};}
export async function prepareLocalLayoutRuntime({executionRoot,caseId,packetVersion='content-packet-v3',source,manuscript,imageRecords,fontRecords,mockups=[],requiredApplications,tools}={}){
 const toolStatus=await localLayoutToolStatus(tools);if(toolStatus.status!=='configured')return toolStatus;
 need(isAbsolute(executionRoot)&&Array.isArray(fontRecords)&&fontRecords.length>0,'LOCAL_LAYOUT_RESOURCE_CONFIGURATION_REQUIRED');
 const requirements=localLayoutApplicationRequirements({source,caseId,requiredApplications});
 // Validate exact source identities/application coverage before copying any resource.
 const candidate=localLayoutAssets({source,manuscript,imageRecords,mockups,requiredApplications:requirements});
 await mkdir(executionRoot,{recursive:true,mode:0o700});const canonicalRoot=await realpath(executionRoot);need(resolve(executionRoot)===canonicalRoot,'LOCAL_LAYOUT_RESOURCE_CANONICAL_REQUIRED');
 const resources=[],byPath=new Map();
 async function freeze(record,kind){if(byPath.has(record.path)){const prior=byPath.get(record.path);need(prior.sha256===record.sha256,'LOCAL_LAYOUT_RESOURCE_BYTES_CHANGED');return prior;}const frozen=await freezeLocalLayoutFile({executionRoot:canonicalRoot,record,kind});resources.push(frozen);byPath.set(record.path,frozen);return frozen;}
 const fonts=[];for(const record of fontRecords)fonts.push((await freeze(record,'font')).path);
 for(const [id,asset]of Object.entries(candidate.assets)){
  const record=asset.role==='mockup'?mockups.find(m=>m.asset.id===id)?.asset:imageRecords.find(r=>(r.imageId??r.id)===id);need(record,'LOCAL_LAYOUT_RESOURCE_RECORD_REQUIRED');asset.file=(await freeze(record,asset.role==='mockup'?'mockup':'image')).path;
 }
 const unique=[...new Map(resources.map(r=>[r.path,r])).values()],brand=localLayoutBrand({caseId,fontFiles:fonts});
 unique.push(await freezeJSON(canonicalRoot,'brand',brand),await freezeJSON(canonicalRoot,'assets',candidate));
 const renderer=await layoutRendererIdentity();await verifyLayoutRenderer(renderer);
 const execution=await buildNativeExecutionV2(toolStatus.paths);await verifyExecutionPins(execution);
 const configuration=localLayoutConfiguration({packetVersion,source,renderer,resources:unique.map(({byteLength,...r})=>r),execution});
 return {status:'configured',...configuration,nativeExecutionAllowed:true,requiredApplications:requirements,syntheticOnly:true,realQualityVerified:false,finalAuthorityAvailable:false};
}
