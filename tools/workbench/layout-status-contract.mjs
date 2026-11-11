import {unresolvedLayoutJobs,unresolvedLayoutStatus} from './layout-boundary.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';
export function unresolvedLayoutResult(p){
 const jobs=unresolvedLayoutJobs(p);
 if(!jobs.length)return null;
 return {status:jobs.some(j=>j.status==='awaiting_reconciliation'||j.attempts?.some(a=>a.status==='awaiting_reconciliation'))?'awaiting_reconciliation':'blocked',reason:'LAYOUT_UNKNOWN_BLOCKS',unresolvedJobs:jobs.map(j=>({rootJobId:j.id,status:j.status,reason:j.error?.code??'LAYOUT_UNKNOWN_BLOCKS',attempts:(j.attempts??[]).filter(a=>unresolvedLayoutStatus(a.status)).map(a=>({attemptId:a.id,status:a.status,reason:a.error?.code??j.error?.code??'LAYOUT_UNKNOWN_BLOCKS'}))})),queuedJobIds:[],exportAvailable:false,finalAuthorityAvailable:false};
}
export async function verifyLayoutCurrent(store,content,id,input,verifyResources=async()=>{}){
 const revision=store.read(id).revision;
 need(typeof content?.verifyLayoutPreparation==='function','LAYOUT_CURRENT_AUTHORITY_UNAVAILABLE','Trusted current content reader required');
 await content.verifyLayoutPreparation(id,input);
 await verifyResources();
 need(store.read(id).revision===revision,'LAYOUT_STATUS_CHANGED','Project changed during current layout verification');
}
export function layoutCurrentFailure(error){
 const direct=['LAYOUT_CURRENT_AUTHORITY_UNAVAILABLE','LAYOUT_STATUS_CHANGED'].includes(error.code);
 return {status:error.issues||direct?'blocked':'stale',reason:error.issues||direct?(error.code??'LAYOUT_CURRENT_AUTHORITY_UNAVAILABLE'):'LAYOUT_BINDING_STALE',validationReason:error.code??'LAYOUT_BINDING_STALE',...(error.issues?{issues:error.issues}:{}),queuedJobIds:[],exportAvailable:false,finalAuthorityAvailable:false};
}
