import {parseExecutionV2} from './native-tree-identity.mjs';
import {NUMERIC_CONTENT_CONTRACT,numericContract,numericContentPacket,contentContractForPacket} from './content-contract-versions.mjs';
import {configFields,configNeed,configText,configDigest} from './configuration-values.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {sketchRequire as need} from './sketch-authority.mjs';
import {contentSourceLocations,completeContentLayoutContract} from './complete-content.mjs';

export const LAYOUT_PROTOCOL='project-layout-v1';
export const LAYOUT_PURPOSE='layout_export';
export const LAYOUT_STYLES=Object.freeze(['editorial','stage','evidence']);
export const LATER_FINAL_RESPONSIBILITIES=Object.freeze(['content','visual','brand','user','communication']);
export const layoutHash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const clone=structuredClone;
const checkedLayoutContracts=new WeakMap();
export function checkedLayoutContract(p,artifact,sourceBuilder){
 const contract=completeContentLayoutContract(p,artifact,sourceBuilder),fact=Object.freeze({});
 checkedLayoutContracts.set(fact,{project:p,artifactId:artifact.id,snapshotHash:layoutHash(p),contract:clone(contract)});
 return {contract,fact};
}
export function layoutIntent(request){
 need(request&&typeof request==='object'&&!Array.isArray(request)&&Object.keys(request).length===2&&Object.keys(request).every(k=>['commandId','expectedRevision'].includes(k))&&typeof request.commandId==='string'&&request.commandId.trim()&&request.commandId!=='__proto__'&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0,'INVALID_LAYOUT_INTENT','Only command identity and expected revision accepted');
}
export function freezeLayoutInput(p,trusted,configuration){
 const c=trusted.contract,s=trusted.source;
 const contract=contentContractForPacket(c?.packetVersion,s);
 need(contract,'LAYOUT_CONTENT_VERSION_REQUIRED','Exact supported content tuple required');
 const numeric=numericContract(contract);
 if(numeric&&configuration?.execution)parseExecutionV2(configuration.execution);
 need(configuration?.version==='project-layout-boundary-v1'&&configuration.semanticVersion===contract.semantic&&configuration.renderer?.identity&&/^[a-f0-9]{64}$/.test(configuration.renderer.closureHash),'LAYOUT_CONFIGURATION_REQUIRED','Exact versioned semantic renderer identity and closure hash required');
 need(c?.packetVersion===contract.packet&&s?.schemaVersion===contract.source&&c.manuscript?.schemaVersion===contract.manuscript,'LAYOUT_CONTENT_VERSION_REQUIRED','Exact v3 content source and v2 manuscript required');
 const {sourceHash,...body}=s;
 need(layoutHash(body)===sourceHash&&sourceHash===c.sourceHash&&layoutHash(c.manuscript)===c.manuscriptHash&&layoutHash(trusted.manuscriptText)===trusted.contentHash&&equal(JSON.parse(trusted.manuscriptText),c.manuscript),'LAYOUT_SOURCE_CHANGED','Literal approved manuscript bytes and full effective source required');
 need(equal(c.sourceLocations,contentSourceLocations({id:c.rootJobId,task:{packetVersion:c.packetVersion,source:s}})),'LAYOUT_SOURCE_LOCATION_CHANGED','Exact effective-source and original occurrence namespaces required');
 need(['producer','consumer'].every(side=>trusted.ownerReports?.[side]?.raw?.decision==='accept')&&equal(trusted.ownerReports.consumer,c.layoutAcceptance),'LAYOUT_OWNER_REPORTS_REQUIRED','Both original content-layout owner reports required');
 const required=[...new Set([...s.obligations.filter(o=>o.kind==='image').map(o=>o.value.imageId),...c.manuscript.pageIntents.flatMap(i=>i.imageIds)])];
 need(equal(required,c.requiredImageIds)&&required.every(id=>s.images.some(i=>i.imageId===id)),'LAYOUT_IMAGE_INVENTORY_CHANGED','Final obligations and authored image intents must resolve in the full process inventory');
 const ledger={schemaVersion:contract.semantic,source:clone(s),manuscript:clone(c.manuscript),contentBinding:{artifactId:c.artifactId,rootJobId:c.rootJobId,sourceEnvelopeId:`content-source-envelope:${c.rootJobId}`,sourceHash,manuscriptHash:c.manuscriptHash,projectionHash:c.projectionHash},sourceLocationVersion:c.sourceLocationVersion,sourceLocations:clone(c.sourceLocations)};
 const ledgerText=JSON.stringify(ledger);
 const binding={protocol:LAYOUT_PROTOCOL,projectId:p.id,taskCardId:p.activeTaskCardId,policy:clone(p.policies.at(-1)),contentArtifactId:c.artifactId,contentRootJobId:c.rootJobId,contentHash:trusted.contentHash,manuscriptHash:c.manuscriptHash,sourceHash,projectionHash:c.projectionHash,sourceLocationVersion:c.sourceLocationVersion,ledgerHash:layoutHash(ledgerText),ownerReportsHash:layoutHash(trusted.ownerReports),requiredImageIds:required,imageInventory:clone(s.images),renderer:clone(configuration.renderer),resources:clone(trusted.resources),...(configuration.execution?{execution:clone(configuration.execution)}:{}),styles:[...LAYOUT_STYLES]};
 return {binding,bindingHash:layoutHash(binding),ledgerText,manuscriptText:trusted.manuscriptText,ownerReports:clone(trusted.ownerReports)};
}
export function layoutJobInput(p,job){
 const task=job?.task;
 if(task&&!Object.hasOwn(task,'inputVersion')){
  need(task.input,'LAYOUT_INPUT_MISSING','Exact retained layout input required');
  return task.input;
 }
 need(task.inputVersion==='numeric-layout-input-ref-v1'&&task.binding&&!Object.hasOwn(task,'input'),'LAYOUT_INPUT_MISSING','Exact retained layout input required');
 const b=task.binding,root=p.jobs.find(j=>j.id===b.contentRootJobId),artifact=p.artifacts.find(a=>a.id===b.contentArtifactId);
 const author=p.jobs.find(j=>j.contentRootJobId===root?.id&&j.nodeKey==='author');
 const producer=p.jobs.find(j=>j.contentRootJobId===root?.id&&j.nodeKey==='layout:producer');
 const consumer=p.jobs.find(j=>j.contentRootJobId===root?.id&&j.nodeKey==='layout:consumer');
 const contract=root&&contentContractForPacket(root.task.packetVersion,root.task.source),manuscript=author?.contentReport?.raw?.manuscript;
 need(contract&&numericContentPacket(root.task.packetVersion)&&artifact?.completeContent?.rootJobId===root.id&&manuscript&&producer?.contentReport&&consumer?.contentReport,'LAYOUT_INPUT_MISSING','Original historical layout sources are required');
 const ledger={schemaVersion:contract.semantic,source:clone(root.task.source),manuscript:clone(manuscript),contentBinding:{artifactId:b.contentArtifactId,rootJobId:root.id,sourceEnvelopeId:`content-source-envelope:${root.id}`,sourceHash:b.sourceHash,manuscriptHash:b.manuscriptHash,projectionHash:b.projectionHash},sourceLocationVersion:b.sourceLocationVersion,sourceLocations:contentSourceLocations(root)};
 const input={binding:clone(b),bindingHash:task.bindingHash,ledgerText:JSON.stringify(ledger),manuscriptText:JSON.stringify(manuscript),ownerReports:{producer:clone(producer.contentReport),consumer:clone(consumer.contentReport)}};
 need(layoutHash(b)===input.bindingHash&&layoutHash(input.ledgerText)===b.ledgerHash&&layoutHash(input.manuscriptText)===b.contentHash&&layoutHash(input.ownerReports)===b.ownerReportsHash,'LAYOUT_BINDING_CHANGED','Historical input no longer matches its frozen binding');
 return input;
}
export function layoutPublicProject(p){
 if(!p.jobs.some(j=>j.purpose===LAYOUT_PURPOSE&&j.task?.inputVersion==='numeric-layout-input-ref-v1'))return p;
 const view={...p,jobs:p.jobs.map(j=>{
  if(j.purpose!==LAYOUT_PURPOSE||j.task?.inputVersion!=='numeric-layout-input-ref-v1')return j;
  const {inputVersion,...task}=j.task;
  return {...j,task:{...task,input:layoutJobInput(p,j)}};
 })};
 need(Buffer.byteLength(JSON.stringify(view))<=256*1024*1024,'LAYOUT_PUBLIC_RESPONSE_LIMIT','Public project response exceeds the bounded layout view');
 return view;
}
export function requireLayoutPreparationBinding(p,t){
 const b=t?.binding;
 need(b?.protocol===LAYOUT_PROTOCOL&&b.projectId===p.id&&b.taskCardId===p.activeTaskCardId&&equal(b.policy,p.policies.at(-1))&&b.contentArtifactId===p.activeByStage.content_review&&layoutHash(b)===t.bindingHash&&layoutHash(t.ledgerText)===b.ledgerHash&&layoutHash(t.manuscriptText)===b.contentHash&&layoutHash(t.ownerReports)===b.ownerReportsHash&&equal(b.styles,LAYOUT_STYLES),'LAYOUT_BINDING_CHANGED','Exact current immutable binding required');
}
export function requireLayoutPreparationCurrent(p,t,sourceBuilder,fact){
 requireLayoutPreparationBinding(p,t);
 const b=t.binding;
 const a=p.artifacts.find(a=>a.id===b.contentArtifactId),root=p.jobs.find(j=>j.id===b.contentRootJobId);
 const checked=fact&&checkedLayoutContracts.get(fact);
 if(fact)checkedLayoutContracts.delete(fact);
 need(!fact||checked?.project===p&&checked.artifactId===a?.id&&checked.snapshotHash===layoutHash(p),'LAYOUT_CONTRACT_FACT_INVALID','Only this exact unchanged project snapshot and artifact may reuse a checked layout contract');
 const contract=checked?.contract??completeContentLayoutContract(p,a,sourceBuilder);
 const producer=p.jobs.find(j=>j.contentRootJobId===root.id&&j.nodeKey==='layout:producer');
 need(equal(producer?.contentReport,t.ownerReports.producer),'LAYOUT_OWNER_REPORTS_REQUIRED','Exact original producing content owner report required');
 need(p.releases.some(r=>r.artifactId===a.id&&r.policyVersion===b.policy.version&&r.sourceHash===b.sourceHash),'LAYOUT_CONTENT_RELEASE_REQUIRED','Exact current released source required');
 need(contract.sourceHash===b.sourceHash&&contract.manuscriptHash===b.manuscriptHash&&equal(contract.layoutAcceptance,t.ownerReports.consumer),'LAYOUT_SOURCE_CHANGED','Original exact content contract required');
 need(a?.completeContent?.rootJobId===root?.id&&a?.contentHash===b.contentHash&&equal(root?.task.source,JSON.parse(t.ledgerText).source),'LAYOUT_SOURCE_CHANGED','Binding requires the exact current source root');
}
export const unresolvedLayoutStatus=status=>status==='running'||status==='awaiting_reconciliation';
export function unresolvedLayoutJobs(p){return p.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&(unresolvedLayoutStatus(j.status)||j.attempts?.some(a=>unresolvedLayoutStatus(a.status))));}
export function reduceLayoutPreparation(p,c,context,sourceBuilder){
 need(context.actorType==='agent','LAYOUT_TRUSTED_RUNTIME_REQUIRED','Trusted local preparation required');
 need(c.kind==='prepare-project-layout','LAYOUT_COMMAND_UNAVAILABLE','Only boundary preparation is implemented');
 let t=c.prepared;
 if(c.numericPreparation){
  const n=c.numericPreparation;
  const executionBound=n?.schemaVersion==='numeric-layout-preparation-v1';
  const fields=executionBound?['schemaVersion','bindingHash','renderer','resources','execution']:['bindingHash','renderer','resources'];
  need(c.prepared===undefined&&n&&typeof n==='object'&&!Array.isArray(n)&&Object.keys(n).length===fields.length&&fields.every(k=>Object.hasOwn(n,k)),'LAYOUT_NUMERIC_PREPARATION_INVALID','Exact compact numeric preparation required');
  if(executionBound)parseExecutionV2(n.execution);
  const artifact=p.artifacts.find(a=>a.id===p.activeByStage.content_review),contract=completeContentLayoutContract(p,artifact,sourceBuilder),root=p.jobs.find(j=>j.id===contract.rootJobId);
  need(numericContentPacket(contract.packetVersion),'LAYOUT_CONTENT_VERSION_REQUIRED','Numeric preparation requires exact numeric reviewed content');
  t=freezeLayoutInput(p,{contract,source:root.task.source,manuscriptText:JSON.stringify(contract.manuscript),contentHash:artifact.contentHash,ownerReports:{producer:p.jobs.find(j=>j.contentRootJobId===root.id&&j.nodeKey==='layout:producer').contentReport,consumer:contract.layoutAcceptance},resources:n.resources},{version:'project-layout-boundary-v1',semanticVersion:NUMERIC_CONTENT_CONTRACT.semantic,renderer:n.renderer,...(executionBound?{execution:n.execution}:{})});
  need(t.bindingHash===n.bindingHash,'LAYOUT_BINDING_CHANGED','Reconstructed exact numeric binding required');
 }else need(t&&JSON.parse(t.ledgerText).schemaVersion!==NUMERIC_CONTENT_CONTRACT.semantic,'LAYOUT_NUMERIC_COMPACT_COMMAND_REQUIRED','Numeric source must be reconstructed by the server');
 const b=t?.binding;requireLayoutPreparationCurrent(p,t,sourceBuilder);
 const prior=p.jobs.filter(j=>j.purpose===LAYOUT_PURPOSE&&j.task.binding).at(-1);
 const existing=p.jobs.find(j=>j.purpose===LAYOUT_PURPOSE&&j.task.bindingHash===t.bindingHash);
 if(existing){need(!unresolvedLayoutJobs(p).some(j=>j.id!==existing.id),'LAYOUT_UNKNOWN_BLOCKS','An unknown other original export cannot be bypassed by returning to a historical binding');return;}
 need(!prior||c.revisionIntent===true,'LAYOUT_REVISION_INTENT_REQUIRED','A changed binding requires explicit revision intent');
 if(prior)need(!unresolvedLayoutJobs(p).length,'LAYOUT_UNKNOWN_BLOCKS','Unknown original export cannot be bypassed by a new binding');
 const findings=[...(prior?.task.retainedFindings??[]),...(prior?.findings??[]),...(prior?.attempts??[]).flatMap(a=>a.findings??[])];
 p.jobs.push({id:`layout-${t.bindingHash}`,stage:'layout',purpose:LAYOUT_PURPOSE,status:'blocked',attempts:[],inputVersionIds:[b.contentArtifactId],outputVersionIds:[],task:{binding:clone(b),bindingHash:t.bindingHash,...(c.numericPreparation?{inputVersion:'numeric-layout-input-ref-v1'}:{input:clone(t)}),style:LAYOUT_STYLES[0],...(prior?{predecessorRootJobId:prior.id}:{}),retainedFindings:clone(findings)},error:{code:'LAYOUT_EXPORT_UNAVAILABLE',message:'Boundary prepared. Native export execution is not implemented.'}});
}

export function validateLayoutConfiguration(c) {
 configFields(c,['version','semanticVersion','renderer','resources','execution']);configNeed(c.version==='project-layout-boundary-v1'&&['semantic-layout-v2',NUMERIC_CONTENT_CONTRACT.semantic].includes(c.semanticVersion),'/version');
 configFields(c.renderer,['identity','closureHash'],'/renderer');configNeed(configText(c.renderer.identity)&&configDigest(c.renderer.closureHash),'/renderer');
 configNeed(Array.isArray(c.resources)&&c.resources.length>0&&new Set(c.resources.map(r=>r.id)).size===c.resources.length,'/resources');
 for(const r of c.resources){configFields(r,['id','kind','path','sha256'],'/resources');configNeed(['id','kind','path'].every(k=>configText(r[k]))&&configDigest(r.sha256),'/resources');}
 return [];
}
