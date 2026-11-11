import {STAGES} from './project.mjs';
import {validateAcquisitionConfiguration} from './research-acquisition.mjs';
import {validateResearchSearchProvider} from './research-search.mjs';
import {validateIntakeConfiguration} from './intake-pdf.mjs';
import {validateFinalReviewConfiguration} from './final-review-configuration.mjs';
import {open, constants} from 'node:fs/promises';
import {resolve,dirname,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createCodexProvider} from './codex-provider.mjs';
import {validateModelHttpConfiguration} from './model-http-authority.mjs';
import {loadImageProvider} from './image-api-provider.mjs';
import {validateReferenceConfiguration} from './reference-dossier.mjs';
import {validateSketchConfiguration} from './sketch-runtime.mjs';
import {validateSketchReviewConfiguration,REVIEW_ROLES} from './sketch-review-v2.mjs';
import {validateFinalVisualConfiguration} from './final-visual.mjs';
import {validateContentConfiguration} from './complete-content-runtime.mjs';
import {validateLayoutConfiguration} from './layout-boundary.mjs';
import {parseExecutionV2} from './native-tree-identity.mjs';
import {contentNodes} from './complete-content.mjs';
import {validateCreativeCalibrationConfiguration} from './creative-panel.mjs';
import {REFERENCE_DIMENSIONS} from './reference-review.mjs';
import {ConfigurationError,configNeed,configFields,configText,configPositive} from './configuration-values.mjs';

const validatedLaunchSettings=new WeakMap();
const freezeDeep=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const value of Object.values(x))freezeDeep(value);Object.freeze(x);}return x;};
export function assertValidatedLaunchSettings(settings){if(!validatedLaunchSettings.has(settings)||validatedLaunchSettings.get(settings)!==JSON.stringify(settings))throw Object.assign(Error('FINAL_OPERATION_VALIDATED_LAUNCH_REQUIRED'),{code:'FINAL_OPERATION_VALIDATED_LAUNCH_REQUIRED'});}
const legacyNames=['PORT','WORKBENCH_DB','WORKBENCH_EXECUTIONS','WORKBENCH_MODEL','WORKBENCH_IMAGE_CONFIG','WORKBENCH_MAX_CONCURRENT_JOBS'];
const genericKeys=['assistant','intake','research','strategy','copy','verification','readiness','semantic','observation','observation_review','case_identity','feedback_review','correction_review','creative_director',...['strategy','copy','brand','user','communication'].flatMap(r=>[`creative_score_${r}`,`creative_opposition_${r}`])];
const referenceKeys=['reference_director','reference_lead','reference_collector',...Object.keys(REFERENCE_DIMENSIONS).flatMap(r=>[`reference_score_${r}`,`reference_opposition_${r}`]),'reference_review_director'];
const contentKey=n=>n.key==='producer:strategy'?'strategy':n.key==='producer:copy'?'copy':`content_${n.key.replaceAll(':','_')}`;
const bindingKeys=[...genericKeys,'research_planner',...referenceKeys,'sketch','visual',...['sketch_review','final_visual'].flatMap(prefix=>[...REVIEW_ROLES.flatMap(r=>[`${prefix}_score_${r}`,`${prefix}_opposition_${r}`]),`${prefix}_director`]),...contentNodes().map(contentKey)];
const modules={intake:validateIntakeConfiguration,reference:validateReferenceConfiguration,sketch:validateSketchConfiguration,sketchReview:validateSketchReviewConfiguration,finalVisual:validateFinalVisualConfiguration,content:validateContentConfiguration,layout:validateLayoutConfiguration,finalReview:validateFinalReviewConfiguration};
const optionNames={intake:'intakeConfiguration',reference:'referenceConfiguration',sketch:'sketchConfiguration',sketchReview:'sketchReviewConfiguration',finalVisual:'finalVisualConfiguration',content:'contentConfiguration',layout:'layoutConfiguration',finalReview:'finalReviewConfiguration'};
const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v);
const pathAt=(base,value,pointer)=>{configNeed(configText(value),pointer);return resolve(base,value);};
function parseJson(bytes,pointer){
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ConfigurationError('INVALID_UTF8',pointer);}
 let at=0;const white=()=>{while(/\s/.test(text[at]??'')&&at<text.length)at++;};
 function string(){const start=at++;while(at<text.length){const ch=text[at++];if(ch==='"')return JSON.parse(text.slice(start,at));if(ch==='\\')at++;}throw new Error();}
 function value(depth){if(depth>64)throw new Error();white();if(text[at]==='{'){at++;white();const keys=new Set();if(text[at]==='}'){at++;return;}for(;;){white();if(text[at]!=='"')throw new Error();const key=string();if(keys.has(key))throw new ConfigurationError('DUPLICATE_JSON_MEMBER',pointer);keys.add(key);white();if(text[at++]!==':')throw new Error();value(depth+1);white();const ch=text[at++];if(ch==='}')return;if(ch!==',')throw new Error();}}
 else if(text[at]==='['){at++;white();if(text[at]===']'){at++;return;}for(;;){value(depth+1);white();const ch=text[at++];if(ch===']')return;if(ch!==',')throw new Error();}}
 else if(text[at]==='"')string();else{const start=at;while(at<text.length&&!/[\s,\]}]/.test(text[at]))at++;if(at===start)throw new Error();}}
 try{value(0);white();if(at!==text.length)throw new Error();return JSON.parse(text);}catch(error){if(error instanceof ConfigurationError)throw error;throw new ConfigurationError('MALFORMED_JSON',pointer);}
}
async function readJson(path,max,counter,pointer){
 let handle;try{
  handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const before=await handle.stat();
  configNeed(before.isFile()&&before.size>0&&before.size<=max,pointer,'CONFIGURATION_FILE_BOUNDS');
  configNeed(counter.bytes+before.size+1<=16*1024*1024,pointer,'CONFIGURATION_TOTAL_BOUNDS');counter.bytes+=before.size+1;
  const bytes=Buffer.alloc(before.size+1);let offset=0;
  while(offset<bytes.length){const r=await handle.read(bytes,offset,Math.min(65536,bytes.length-offset),offset);if(!r.bytesRead)break;offset+=r.bytesRead;}
  const after=await handle.stat();configNeed(offset===before.size&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,pointer,'CONFIGURATION_FILE_CHANGED');
  return parseJson(bytes.subarray(0,offset),pointer);
 }catch(error){if(error instanceof ConfigurationError)throw error;throw new ConfigurationError('CONFIGURATION_FILE_UNAVAILABLE',pointer);}finally{await handle?.close();}
}
function declaredModulePaths(name,c,base){
 const path=(v,p)=>pathAt(base,v,p);
 if(name==='intake')c.pythonBinary=path(c.pythonBinary,'/pythonBinary');
 if(name==='reference'){
  if(c.capability?.evidenceRef)c.capability.evidenceRef=path(c.capability.evidenceRef,'/capability/evidenceRef');
  for(const x of c.calibrations??[])if(x.evidenceRef)x.evidenceRef=path(x.evidenceRef,'/calibrations/evidenceRef');
 }
 for(const cap of [c.capability,...Object.values(c.capabilities??{})].filter(Boolean))for(const x of cap.evidence??[])x.path=path(x.path,'/evidence/path');
 if(name==='layout'){
  for(const r of c.resources??[])r.path=path(r.path,'/resources/path');
  const e=c.execution;if(e){for(const key of ['node','engine','nativeCheck','python','soffice','bash','nativeRuntime','presentationsSkill'])if(e[key])e[key]=path(e[key],`/execution/${key}`);
   for(const f of e.files??[])f.path=path(f.path,'/execution/files/path');
   for(const r of e.dependencyRoots??[])r.path=path(r.path,'/execution/dependencyRoots/path');
  }
 }
 return c;
}
function validateBinding(binding,providers,pointer){
 configFields(binding,['providerId','model','role'],pointer);configNeed(['providerId','model','role'].every(k=>configText(binding[k])),pointer);
 configNeed(Object.hasOwn(providers,binding.providerId)&&providers[binding.providerId].model===binding.model,pointer,'BINDING_MODEL_MISMATCH');
}
function validateAssignments(name,c,bindings){
 if(name==='sketchReview')for(const key of [...REVIEW_ROLES.flatMap(r=>[`sketch_review_score_${r}`,`sketch_review_opposition_${r}`]),'sketch_review_director','sketch','visual']){
  configNeed(c.capability.assignment.providerId===bindings[key].providerId&&c.capability.assignment.model===bindings[key].model,`/moduleConfigs/${name}/capability/assignment`,'BINDING_MODEL_MISMATCH');
 }
 if(name==='finalVisual')for(const [key,cap]of Object.entries(c.capabilities)){const b=bindings[key==='owner'?'visual':`final_visual_${key}`];configNeed(cap.assignment.providerId===b.providerId&&cap.assignment.model===b.model,`/moduleConfigs/${name}/capabilities/${key}`,'BINDING_MODEL_MISMATCH');}
 if(name==='content')for(const n of contentNodes()){const b=bindings[contentKey(n)],cap=c.capabilities[n.key];configNeed(cap.assignment.providerId===b.providerId&&cap.assignment.model===b.model,`/moduleConfigs/${name}/capabilities/${n.key}`,'BINDING_MODEL_MISMATCH');}
}
export async function loadLaunchSettings({configPath,legacySettings={}}={}){
 if(configPath===undefined)return {mode:'legacy',legacySettings:{...legacySettings}};
 configNeed(configText(configPath),'/WORKBENCH_CONFIG');
 for(const name of legacyNames)configNeed(!Object.hasOwn(legacySettings,name),`/environment/${name}`,'CONFLICTING_LEGACY_SETTING');
 const file=resolve(configPath),base=dirname(file),counter={bytes:0};const raw=await readJson(file,65536,counter,'/');
 configFields(raw,['schemaVersion','server','textProviders','bindings','creativeCalibrations','moduleConfigs','imageConfigPath','researchAcquisition','searchProviders']);configNeed(raw.schemaVersion==='workbench-launch-v1','/schemaVersion');
 configFields(raw.server,['port','dbPath','executionRoot','maxConcurrentJobs','uiPath','creationAuthorizedThrough'],'/server');
 const s=raw.server;configNeed(s.creationAuthorizedThrough===undefined||typeof s.creationAuthorizedThrough==='string'&&Object.hasOwn(STAGES,s.creationAuthorizedThrough),'/server/creationAuthorizedThrough');configNeed(Number.isSafeInteger(s.port)&&s.port>=1&&s.port<=65535,'/server/port');configNeed(Number.isSafeInteger(s.maxConcurrentJobs??2)&&(s.maxConcurrentJobs??2)>=1&&(s.maxConcurrentJobs??2)<=8,'/server/maxConcurrentJobs');
 s.dbPath=pathAt(base,s.dbPath,'/server/dbPath');s.executionRoot=pathAt(base,s.executionRoot,'/server/executionRoot');if(s.uiPath!==undefined)s.uiPath=pathAt(base,s.uiPath,'/server/uiPath');
 const providers=raw.textProviders??{};configFields(providers,Object.keys(providers),'/textProviders');
 for(const [id,p]of Object.entries(providers)){
  configNeed(safeId(id),'/textProviders');
  if(p?.adapter==='workbench-model-http-v1'){
   try{providers[id]=validateModelHttpConfiguration(p);}catch{throw new ConfigurationError('INVALID_MODEL_HTTP_CONFIGURATION',`/textProviders/${id}`);}
  }else{
   configFields(p,['adapter','model','binary','timeoutMs'],`/textProviders/${id}`);configNeed(p.adapter==='codex-cli',`/textProviders/${id}/adapter`,'UNKNOWN_PROVIDER_ADAPTER');configNeed(configText(p.model),`/textProviders/${id}/model`);if(p.binary!==undefined)configNeed(configText(p.binary)&&isAbsolute(p.binary),`/textProviders/${id}/binary`);if(p.timeoutMs!==undefined)configNeed(configPositive(p.timeoutMs),`/textProviders/${id}/timeoutMs`);
  }
 }
 const bindings=raw.bindings??{};configFields(bindings,bindingKeys,'/bindings');for(const [key,b]of Object.entries(bindings))validateBinding(b,providers,`/bindings/${key}`);
 const configs=raw.moduleConfigs??{};configFields(configs,Object.keys(modules),'/moduleConfigs');const loaded={};
 for(const [name,p]of Object.entries(configs)){if(p===null)continue;const f=pathAt(base,p,`/moduleConfigs/${name}`);try{
  const c=declaredModulePaths(name,await readJson(f,8*1024*1024,counter,`/moduleConfigs/${name}`),dirname(f));
  for(const requirement of modules[name](c)){const b=bindings[requirement.key];configNeed(b,`/bindings/${requirement.key}`,'MISSING_MODULE_BINDING');if(requirement.role)configNeed(b.role===requirement.role,`/bindings/${requirement.key}/role`,'BINDING_ROLE_MISMATCH');}
  if(name==='layout'&&c.execution){configNeed(c.execution.protocol==='project-native-execution-v2',`/moduleConfigs/${name}/execution`,'UNSUPPORTED_EXECUTION_CONFIGURATION');parseExecutionV2(c.execution);}
  validateAssignments(name,c,bindings);
  if(name==='finalReview')for(const profile of c.configuration.assignmentPolicy.profiles){configNeed(providers[profile.providerIdentity]?.model===profile.modelIdentity,`/moduleConfigs/${name}/configuration/assignmentPolicy/profiles`,'BINDING_MODEL_MISMATCH');configNeed(providers[profile.providerIdentity]?.adapter==='codex-cli',`/moduleConfigs/${name}/configuration/assignmentPolicy/profiles`,'FINAL_HTTP_ADAPTER_UNAVAILABLE');}
  loaded[name]=c;
 }catch(error){throw new ConfigurationError(error.code??'INVALID_MODULE_CONFIGURATION',`/moduleConfigs/${name}${error.pointer??''}`);}}
 const searchProviders=raw.searchProviders??{};configNeed(searchProviders&&typeof searchProviders==='object'&&!Array.isArray(searchProviders),'/searchProviders');
 for(const [id,c]of Object.entries(searchProviders)){configNeed(safeId(id),'/searchProviders');try{validateResearchSearchProvider(c);}catch(error){throw new ConfigurationError(error.code??'SEARCH_CONFIGURATION_INVALID',`/searchProviders/${id}`);}}
 let researchAcquisition;
 if(raw.researchAcquisition!==undefined){try{researchAcquisition=raw.researchAcquisition;for(const r of validateAcquisitionConfiguration(researchAcquisition))configNeed(bindings[r.key],`/bindings/${r.key}`,'MISSING_MODULE_BINDING');configNeed(searchProviders[researchAcquisition.searchProviderId],'/researchAcquisition/searchProviderId','MISSING_SEARCH_PROVIDER');}catch(error){throw new ConfigurationError(error.code??'ACQUISITION_CONFIGURATION_INVALID','/researchAcquisition');}}
 const calibrations=raw.creativeCalibrations??[];configNeed(Array.isArray(calibrations),'/creativeCalibrations');
 for(const c of calibrations){validateCreativeCalibrationConfiguration(c);if(c.evidenceRef)c.evidenceRef=pathAt(base,c.evidenceRef,'/creativeCalibrations/evidenceRef');}
 let imageConfig;
 if(raw.imageConfigPath!==undefined&&raw.imageConfigPath!==null){const p=pathAt(base,raw.imageConfigPath,'/imageConfigPath');imageConfig=await readJson(p,16384,counter,'/imageConfigPath');const probe=loadImageProvider({config:imageConfig,resolveCredential:()=>undefined});configNeed(probe.capability().configured,'/imageConfigPath','INVALID_IMAGE_CONFIGURATION');}
 const result={mode:'configured',server:s,textProviders:providers,...(researchAcquisition?{researchAcquisition,searchProviders}:{}),bindings,creativeCalibrations:calibrations,moduleConfigs:loaded,imageConfig,identity:{schemaVersion:raw.schemaVersion,sha256:createHash('sha256').update(JSON.stringify(raw)).digest('hex')},configurationBytes:counter.bytes};freezeDeep(result);validatedLaunchSettings.set(result,JSON.stringify(result));return result;
}
export function buildLaunchOptions(settings){
 if(settings.mode==='legacy'){
  const e=settings.legacySettings,port=Number(e.PORT??4181),maxConcurrentJobs=Number(e.WORKBENCH_MAX_CONCURRENT_JOBS??2);configNeed(Number.isInteger(port)&&port>=1&&port<=65535,'/PORT');configNeed(Number.isInteger(maxConcurrentJobs)&&maxConcurrentJobs>=1&&maxConcurrentJobs<=8,'/WORKBENCH_MAX_CONCURRENT_JOBS');
  const rootDir=resolve(e.WORKBENCH_EXECUTIONS??'.data/workbench-executions'),model=e.WORKBENCH_MODEL?.trim();
  const providers=model?{'codex-cli':createCodexProvider({model,rootDir:join(rootDir,'provider')})}:{};
  const bindings=model?Object.fromEntries(genericKeys.map(stage=>[stage,{providerId:'codex-cli',model,role:`${stage}-lead`}])):{};
  return {dbPath:e.WORKBENCH_DB,port,rootDir,providers,bindings,imageProvider:loadImageProvider({configPath:e.WORKBENCH_IMAGE_CONFIG}),maxConcurrentJobs};
 }
 configNeed(settings.mode==='configured','/mode');
 const providers=Object.fromEntries(Object.entries(settings.textProviders).map(([id,p])=>[id,p.adapter==='workbench-model-http-v1'?Object.freeze({adapter:p.adapter,model:p.model,operatorConfig:p}):createCodexProvider({model:p.model,...(p.binary?{binary:p.binary}:{}),...(p.timeoutMs?{timeoutMs:p.timeoutMs}:{}),rootDir:join(settings.server.executionRoot,'provider',id)})]));
 return {launchConfiguration:settings,creationAuthorizedThrough:settings.server.creationAuthorizedThrough??'research',dbPath:settings.server.dbPath,port:settings.server.port,rootDir:settings.server.executionRoot,maxConcurrentJobs:settings.server.maxConcurrentJobs??2,...(settings.server.uiPath?{uiPath:settings.server.uiPath}:{}),providers,...(settings.researchAcquisition?{researchAcquisitionConfiguration:settings.researchAcquisition,searchProviders:settings.searchProviders}:{}),bindings:settings.bindings,creativeCalibrations:settings.creativeCalibrations,...Object.fromEntries(Object.entries(settings.moduleConfigs).map(([k,v])=>[optionNames[k],v])),imageProvider:loadImageProvider({config:settings.imageConfig,resolveCredential:name=>process.env[name]})};
}
export function legacyLaunchEnvironment(env){return Object.fromEntries(legacyNames.filter(key=>Object.hasOwn(env,key)).map(key=>[key,env[key]]));}
