import {realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {hostname} from 'node:os';
import {createHash} from 'node:crypto';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {recoveryHash,finalRecoveryBaseline,validateFinalRecoveryStart,assertFinalRecoveryPreserved} from './local-final-content-recovery.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=p=>p.path+'\0'+p.sha256+'\0'+p.byteLength;
async function checked(pin,max=64*1024*1024){
 need(pin&&typeof pin.path==='string'&&/^[a-f0-9]{64}$/.test(pin.sha256)&&Number.isSafeInteger(pin.byteLength)&&pin.byteLength>0&&pin.byteLength<=max,'FINAL_CONTINUATION_PIN_REQUIRED');
 need(await realpath(pin.path)===pin.path,'FINAL_CONTINUATION_PIN_CHANGED');const bytes=await readManagedLayoutBytes(dirname(pin.path),pin.path,pin.byteLength);need(bytes.length===pin.byteLength&&hash(bytes)===pin.sha256,'FINAL_CONTINUATION_PIN_CHANGED');return bytes;
}
function absent(pid){need(Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid,'FINAL_CONTINUATION_OWNER_INVALID');try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')return;throw e;}need(false,'FINAL_CONTINUATION_OWNER_LIVE');}
export async function readFinalContinuation({path,sha256,workRoot,moduleRoot,runnerPath}){
 need(typeof path==='string'&&/^[a-f0-9]{64}$/.test(sha256)&&await realpath(path)===path,'FINAL_CONTINUATION_REQUIRED');
 const bytes=await readManagedLayoutBytes(dirname(path),path,512*1024);need(hash(bytes)===sha256,'FINAL_CONTINUATION_CHANGED');const t=JSON.parse(bytes);
 need(t.protocol==='local-final-reader-continuation-v1'&&t.workRoot===workRoot&&t.moduleRoot===moduleRoot&&t.host===hostname(),'FINAL_CONTINUATION_IDENTITY_CHANGED');
 const bundle=JSON.parse(await checked(t.parentBundle,512*1024));need(bundle.protocol==='local-final-historical-parent-bundle-v1'&&bundle.caseId===t.caseId&&bundle.projectId===t.projectId&&bundle.workRoot===workRoot&&bundle.moduleRoot===moduleRoot&&bundle.executionAuthority===false,'FINAL_CONTINUATION_PARENT_CHANGED');
 need(bundle.oldMeta.path===join(workRoot,'FINAL_CONTENT_RUNNER_V2.json')&&bundle.oldIntent.path===join(workRoot,'final-content-v2-intent.json'),'FINAL_CONTINUATION_PARENT_CHANGED');
 const entries=new Map();for(const e of bundle.entries){need(!entries.has(key(e))&&e.archive.path===join(dirname(t.parentBundle.path),'parent-archives',e.sha256+'.bin')&&e.archive.sha256===e.sha256&&e.archive.byteLength===e.byteLength,'FINAL_CONTINUATION_ARCHIVE_CHANGED');entries.set(key(e),e);}
 const used=new Set();async function historical(pin){const e=entries.get(key(pin));need(e,'FINAL_CONTINUATION_ARCHIVE_MISSING');used.add(key(pin));return checked(e.archive);}
 const old=JSON.parse(await historical(bundle.oldMeta)),intent=JSON.parse(await historical(bundle.oldIntent)),parent=JSON.parse(await historical(bundle.parentTransition));
 await checked(bundle.oldMeta);await checked(bundle.oldIntent);await checked(bundle.parentTransition);
 const v1=JSON.parse(await historical(parent.oldMeta)),v1intent=JSON.parse(await historical(parent.oldIntent));await checked(parent.oldMeta);await checked(parent.oldIntent);
 need(parent.protocol==='local-final-reader-transition-v1'&&parent.caseId===t.caseId&&parent.projectId===t.projectId&&parent.workRoot===workRoot&&parent.moduleRoot===moduleRoot&&parent.host===t.host&&parent.priorActions>0&&parent.priorActions<100&&parent.baseline.projectId===parent.projectId&&v1.protocol==='local-final-content-plain-run-v1'&&v1intent.protocol===v1.protocol&&v1.host===t.host&&v1.currentStage==='visual'&&v1.status==='blocked'&&v1.state?.status==='blocked'&&v1.state?.reason==='LAYOUT_MANAGED_BYTES_REQUIRED'&&v1.writerPid===parent.previousPid&&v1.actionsTotal===parent.priorActions&&recoveryHash(v1.sourceIdentity)===recoveryHash(old.sourceIdentity)&&parent.configurationHash===t.configurationHash&&v1.lastRevision===parent.baseline.headRevision&&v1.baselineDecisionCount===parent.baseline.decisionCount&&v1.baselineDecisionCount===v1intent.baselineDecisionCount&&recoveryHash(v1.configuration)===recoveryHash(v1intent.configuration)&&recoveryHash(v1.codePins)===recoveryHash(v1intent.codePins)&&recoveryHash(v1.configuration)===parent.configurationHash&&recoveryHash(v1.sourceIdentity)===recoveryHash(v1intent.sourceIdentity),'FINAL_CONTINUATION_PARENT_CHANGED');
 need(old.protocol==='local-final-content-plain-run-v2'&&intent.protocol===old.protocol&&old.state?.status==='blocked'&&recoveryHash(old.sourceTransition)===recoveryHash(intent.sourceTransition)&&old.sourceTransition.previousPid===v1.writerPid&&old.status==='blocked'&&old.currentStage==='visual'&&old.state?.reason==='ARTIFACT_UNAVAILABLE'&&old.writerPid===t.previousPid&&old.host===t.host&&old.sourceIdentity.projectId===t.projectId&&old.sourceIdentity.caseId===t.caseId&&old.actionsTotal===20&&t.priorActions===old.actionsTotal&&intent.actionsTotal===parent.priorActions&&old.lastRevision===t.baseline.headRevision&&old.baselineDecisionCount===t.baseline.decisionCount&&old.baselineDecisionCount===intent.baselineDecisionCount&&recoveryHash(old.codePins)===recoveryHash(intent.codePins)&&recoveryHash(old.configuration)===t.configurationHash&&recoveryHash(old.configuration)===recoveryHash(intent.configuration)&&recoveryHash(old.sourceIdentity)===recoveryHash(intent.sourceIdentity)&&old.sourceTransition.path===bundle.parentTransition.path&&old.sourceTransition.sha256===bundle.parentTransition.sha256&&old.sourceTransition.priorActions===parent.priorActions,'FINAL_CONTINUATION_OLD_STATE_CHANGED');
 const parentAllowed=[join(moduleRoot,'final-visual-original.mjs'),runnerPath].sort();need(parent.changes?.length===2&&recoveryHash(parent.changes.map(c=>c.path).sort())===recoveryHash(parentAllowed)&&parent.addition.path===join(moduleRoot,'local-final-content-recovery.mjs'),'FINAL_CONTINUATION_PARENT_CHANGED');
 for(const p of [...old.codePins,...old.sourceIdentity.basePins,...v1.codePins,...parent.changes.flatMap(c=>[c.old,c.current]),parent.addition])await historical(p);
 need(entries.size===used.size,'FINAL_CONTINUATION_ARCHIVE_EXTRA');
 for(const p of v1.codePins){const c=parent.changes.find(c=>c.path===p.path);if(c)need(c.old.sha256===p.sha256&&c.old.byteLength===p.byteLength&&c.current.path===p.path&&c.current.sha256!==p.sha256&&old.codePins.some(q=>key(q)===key(c.current)),'FINAL_CONTINUATION_PARENT_CHANGED');else need(old.codePins.some(q=>key(q)===key(p)),'FINAL_CONTINUATION_PARENT_CHANGED');}
 need(parent.changes.every(c=>v1.codePins.some(p=>p.path===c.path))&&old.codePins.some(p=>key(p)===key(parent.addition)),'FINAL_CONTINUATION_PARENT_CHANGED');
 const allowed=[runnerPath,join(moduleRoot,'local-acceptance-final-visual-driver.mjs')].sort();need(t.changes?.length===2&&recoveryHash(t.changes.map(c=>c.path).sort())===recoveryHash(allowed),'FINAL_CONTINUATION_CODE_ALLOWLIST_CHANGED');
 for(const p of old.codePins){const c=t.changes.find(c=>c.path===p.path);if(c){need(key(c.old)===key(p)&&c.current.path===p.path&&c.current.sha256!==p.sha256,'FINAL_CONTINUATION_CODE_CHANGED');await historical(p);await checked(c.current);}else await checked(p);}
 need(t.changes.every(c=>old.codePins.some(p=>p.path===c.path))&&t.addition.path===join(moduleRoot,'local-final-content-continuation.mjs'),'FINAL_CONTINUATION_CODE_ALLOWLIST_CHANGED');await checked(t.addition);
 absent(v1.writerPid);absent(old.writerPid);need(t.baseline.projectId===t.projectId,'FINAL_CONTINUATION_BASELINE_CHANGED');
 return {path,sha256,transition:t,old,parentProfile:{transition:parent,old:v1}};
}
export async function validateFinalContinuationStart(profile,store,{identity,configuration,initial}){
 const {transition:t,old}=profile;need(recoveryHash(identity)===recoveryHash(old.sourceIdentity)&&recoveryHash(configuration)===t.configurationHash,'FINAL_CONTINUATION_CONFIG_CHANGED');
 await validateFinalRecoveryStart(profile.parentProfile,store,{identity,configuration,initial:false});
 const original=store.read(t.projectId,t.baseline.headRevision);need(recoveryHash(original)===t.baseline.headHash&&recoveryHash(finalRecoveryBaseline(original))===recoveryHash(t.baseline),'FINAL_CONTINUATION_HEAD_CHANGED');
 need(original.activeByStage.visual===t.visual.artifactId&&original.artifacts.some(a=>a.id===t.visual.artifactId&&a.contentHash===t.visual.contentHash)&&original.releases.some(r=>r.artifactId===t.visual.artifactId),'FINAL_CONTINUATION_VISUAL_CHANGED');
 const current=store.read(t.projectId);if(initial)need(recoveryHash(current)===t.baseline.headHash,'FINAL_CONTINUATION_HEAD_CHANGED');assertFinalRecoveryPreserved(current,t.baseline);return current;
}
export function assertFinalContinuationResume(meta,profile){
 const {transition:t}=profile;need(meta.protocol==='local-final-content-plain-run-v3'&&meta.sourceTransition?.path===profile.path&&meta.sourceTransition.sha256===profile.sha256&&meta.sourceTransition.priorActions===t.priorActions&&meta.baselineDecisionCount===t.baseline.decisionCount,'FINAL_CONTINUATION_RESUME_CHANGED');
 need(Number.isSafeInteger(meta.actionsTotal)&&meta.actionsTotal>=t.priorActions&&meta.actionsTotal<=100,'FINAL_CONTINUATION_COUNTER_CHANGED');need(meta.status!=='complete','FINAL_CONTINUATION_ALREADY_COMPLETE_USE_RESULT');
}
