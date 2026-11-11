import {object,records,text,type Snapshot} from './dto';
import {sameAcquisitionValue as same} from './researchAcquisitionProjection';
import {sha256} from './sha256';
const ROLES=['copy','brand','user','communication'];
const PHASES=['score_first_read','score','opposition_first_read','opposition'];
const KEYS=[...ROLES.flatMap(role=>PHASES.map(phase=>`${role}:${phase}`)),'director'];
const digest=(value:unknown)=>sha256(JSON.stringify(value));
function originalPanel(p:Snapshot,panel:Record<string,unknown>):boolean{
 return Object.values(p.processedCommands).some(raw=>{try{const c=object(JSON.parse(text(raw))),original=object(c.panel);return c.kind==='request-creative-panel'&&original.id===panel.id&&same(original.packet,panel.packet)&&original.packetHash===panel.packetHash&&same(original.nodes,panel.nodes);}catch{return false;}});
}
function inputFor(panel:Record<string,unknown>,node:Record<string,unknown>,reports:Record<string,unknown>[]):Record<string,unknown>{
 const packet=object(panel.packet),base={protocolVersion:packet.protocolVersion,panelId:panel.id,panelPacketHash:panel.packetHash,phase:node.phase,role:node.role,stage:packet.stage,subjects:packet.subjects};
 const predecessor=(key:string)=>{const matches=reports.filter(r=>r.panelId===panel.id&&r.nodeKey===key);if(matches.length!==1)throw Error('Missing unique original predecessor');return matches[0].rawReport;};
 if(node.phase==='score_first_read')return base;
 const contextual={...base,taskCard:packet.taskCard,sources:packet.sources,comparisonScope:'within_current_A_B_C_meaning_and_expression_mechanisms; market difference claims need supplied source text',upstreamConstraints:packet.upstreamConstraints,independentEvidenceReviews:packet.independentEvidenceReviews??[],dimensions:object(packet.dimensions)[text(node.role)]??[]};
 if(node.phase==='score')return {...contextual,firstRead:predecessor(`${node.role}:score_first_read`)};
 if(node.phase==='opposition_first_read')return contextual;
 if(node.phase==='opposition')return {...contextual,firstRead:predecessor(`${node.role}:opposition_first_read`),pairedScore:predecessor(`${node.role}:score`)};
 return {...contextual,reports:reports.filter(r=>r.panelId===panel.id&&r.phase!=='director').map(r=>({nodeKey:r.nodeKey,report:r.rawReport}))};
}
function panelValid(p:Snapshot,panel:Record<string,unknown>,parent:Record<string,unknown>):boolean{
 const packet=object(panel.packet),nodes=records(panel.nodes),raw=p.native??{},artifact=p.artifacts.find(a=>a.id===packet.artifactId),task=object(parent.task),card=records(raw.taskCards).find(c=>c.id===task.taskCardId);
 if(packet.protocolVersion!=='creative-copy-message-v3'||packet.stage!=='copy'||packet.copyContractVersion!=='copy-message-v2'||!artifact||artifact.stage!=='copy'||packet.contentHash!==artifact.contentHash||digest(packet)!==panel.packetHash||sha256(JSON.stringify(packet.content,null,2))!==packet.contentHash||!card||!same(packet.taskCard,card)||!same(packet.sources,object(object(artifact.technicalReceipts??{}).sourceCatalogue??{}).records??[])||!same(packet.upstreamConstraints,task.upstreamReviewConstraints)||!originalPanel(p,panel))return false;
 const edge=records(raw.ownerEdges).find(e=>e.id===task.ownerEdgeId);if(!edge||packet.policyVersion!==object(object(edge.envelope).policy).version)return false;
 const directions=records(object(packet.content).directions),subjects=directions.map((d,i)=>({id:['A','B','C'][i],slogan:d.slogan,supportingCopy:d.supportingCopy}));if(directions.length!==3||!same(packet.subjects,subjects))return false;
 if(nodes.length!==17||new Set(nodes.map(n=>n.key)).size!==17||new Set(nodes.map(n=>n.jobId)).size!==17||nodes.some(n=>!KEYS.includes(text(n.key))))return false;
 for(const node of nodes){const role=text(node.role),phase=text(node.phase),dependencies=phase==='score'?[`${role}:score_first_read`]:phase==='opposition'?[`${role}:opposition_first_read`,`${role}:score`]:phase==='director'?ROLES.map(r=>`${r}:opposition`):[];if(node.key!==(role==='director'&&phase==='director'?'director':`${role}:${phase}`)||!(role==='director'&&phase==='director'||ROLES.includes(role)&&PHASES.includes(phase))||!same(node.dependencies,dependencies))return false;}
 return true;
}
export function creativeReportBound(p:Snapshot,r:Record<string,unknown>):boolean{
 try{const panel=records(p.native?.creativePanels).find(x=>x.id===r.panelId),node=panel&&records(panel.nodes).find(n=>n.key===r.nodeKey),job=p.jobs.find(j=>j.id===r.jobId),report=object(r.rawReport);return Boolean(panel&&node&&job&&job.panelId===panel.id&&job.nodeKey===node.key&&job.id===node.jobId&&same(job.binding,node.binding)&&r.artifactId===object(panel.packet).artifactId&&r.role===node.role&&r.phase===node.phase&&report.panelId===panel.id&&report.panelPacketHash===panel.packetHash&&report.protocolVersion===object(panel.packet).protocolVersion&&report.role===node.role&&report.phase===node.phase&&sha256(JSON.stringify(r.rawReport,null,2))===r.reportHash); }catch{return false;}
}
export function bridgeCreativeCopyJob(p:Snapshot,job:Record<string,unknown>,parent:Record<string,unknown>):boolean{
 try{const panel=records(p.native?.creativePanels).find(x=>x.id===job.panelId);if(!panel||!panelValid(p,panel,parent)||object(panel.packet).artifactId!==job.targetArtifactId)return false;
 const node=records(panel.nodes).find(n=>n.key===job.nodeKey);if(!node||node.jobId!==job.id||!same(node.binding,job.binding))return false;
 const reports=records(p.native?.creativeReports).filter(r=>r.panelId===panel.id);if(new Set(reports.map(r=>r.nodeKey)).size!==reports.length||reports.some(r=>!creativeReportBound(p,r)))return false;
 return same(object(job.task).creativeInput,inputFor(panel,node,reports));
 }catch{return false;}
}
