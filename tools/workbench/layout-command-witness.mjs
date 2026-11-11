import {createHash} from 'node:crypto';
export const layoutFingerprintHash=raw=>createHash('sha256').update(raw,'utf8').digest('hex');
export function layoutCommandWitness(command,raw,history){
 const field=command.prepared?'prepared':'numericPreparation';
 return JSON.stringify({protocol:'layout-command-digest-v1',representation:'original_command_digest',kind:command.kind,commandId:command.commandId,revisionIntent:command.revisionIntent,[field]:{bindingHash:command[field]?.bindingHash},fingerprintSha256:layoutFingerprintHash(raw),...(history?{sourceRevision:history.sourceRevision,oldRawSha256:layoutFingerprintHash(raw)}:{})});
}
export function isLayoutCommandWitness(c){
 const field=c?.prepared?'prepared':'numericPreparation';
 const keys=['protocol','representation','kind','commandId','revisionIntent',field,'fingerprintSha256',...(Object.hasOwn(c??{},'sourceRevision')?['sourceRevision','oldRawSha256']:[])];
 return !!c&&c.protocol==='layout-command-digest-v1'&&c.representation==='original_command_digest'&&c.kind==='prepare-project-layout'&&typeof c.commandId==='string'&&typeof c.revisionIntent==='boolean'&&Object.keys(c).length===keys.length&&keys.every(k=>Object.hasOwn(c,k))&&Object.keys(c[field]??{}).length===1&&/^[a-f0-9]{64}$/.test(c[field]?.bindingHash??'')&&/^[a-f0-9]{64}$/.test(c.fingerprintSha256??'')&&(!Object.hasOwn(c,'sourceRevision')||(Number.isSafeInteger(c.sourceRevision)&&c.sourceRevision>0&&c.oldRawSha256===c.fingerprintSha256));
}
export function isFullLayoutRawCommand(c){
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(!object(c)||c.kind!=='prepare-project-layout'||typeof c.commandId!=='string'||!c.commandId.trim()||c.representation==='original_command_digest'||['fingerprintSha256','sourceRevision','oldRawSha256'].some(k=>Object.hasOwn(c,k)))return false;
 if(c.prepared&&!c.numericPreparation){const p=c.prepared;return object(p)&&object(p.binding)&&digest(p.bindingHash)&&typeof p.ledgerText==='string'&&p.ledgerText.length>0&&typeof p.manuscriptText==='string'&&p.manuscriptText.length>0&&object(p.ownerReports)&&object(p.ownerReports.producer)&&object(p.ownerReports.consumer);}
 const n=c.numericPreparation,execution=object(n)&&Object.hasOwn(n,'execution'),keys=execution?['bindingHash','renderer','resources','schemaVersion','execution']:['bindingHash','renderer','resources'];
 return !c.prepared&&object(n)&&Object.keys(n).length===keys.length&&keys.every(k=>Object.hasOwn(n,k))&&digest(n.bindingHash)&&object(n.renderer)&&typeof n.renderer.identity==='string'&&n.renderer.identity.length>0&&digest(n.renderer.closureHash)&&Array.isArray(n.resources)&&(!execution||(n.schemaVersion==='numeric-layout-preparation-v1'&&object(n.execution)));
}
export function layoutWitnessMatches(c,command,raw){
 if(!isLayoutCommandWitness(c)||command.kind!=='prepare-project-layout')return false;
 const expected=JSON.parse(layoutCommandWitness(command,raw));
 return c.commandId===expected.commandId&&c.revisionIntent===expected.revisionIntent&&c.fingerprintSha256===expected.fingerprintSha256&&JSON.stringify(c.prepared??c.numericPreparation)===JSON.stringify(expected.prepared??expected.numericPreparation)&&!!c.prepared===!!expected.prepared;
}
export function layoutWitnessBinding(c){if(c?.protocol==='layout-command-digest-v1'&&!isLayoutCommandWitness(c)&&!isFullLayoutRawCommand(c))throw Object.assign(Error('Invalid layout digest witness'),{code:'LAYOUT_COMMAND_WITNESS_INVALID'});return c?.prepared?.bindingHash??c?.numericPreparation?.bindingHash;}
