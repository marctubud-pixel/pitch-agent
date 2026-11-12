import {sketchReadScope} from './sketchReadback';
import type {VisualWorkspace,VisualImage,VisualPhase} from '../../domain/visualA';
import {bridgeCopyJob} from './copyWorkflowProjection';
import {sha256} from './sha256';
import {ServiceError} from '../../domain/service';
import {object,records,text,parseSnapshot,integer,type Snapshot} from './dto';
import {sameAcquisitionValue as same} from './researchAcquisitionProjection';
const fail=():never=>{throw new ServiceError('response_lost','视觉原件、节点或版本对应关系待核，请保留原请求。',{outcomeUnknown:true,retryable:true});};
const need=(v:unknown)=>{if(!v)fail();};
const sha=(v:unknown)=>{need(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v));return text(v);};
function ids(v:unknown):string[]{if(!Array.isArray(v)||!v.every(x=>typeof x==='string'&&x.length>0)||new Set(v).size!==v.length)return fail();return v;}
function phase(v:unknown):VisualPhase{if(v==='references'||v==='sketch'||v==='sketch_review')return v;return fail();}
export function visualImage(v:unknown):VisualImage{const a=object(v),mediaType=a.mediaType;if(mediaType!=='image/png'&&mediaType!=='image/jpeg')return fail();need(text(a.imageId??a.id));return {imageId:text(a.imageId??a.id),sha256:sha(a.sha256),mediaType,width:integer(a.width),height:integer(a.height),byteLength:integer(a.byteLength)};}
export function visualState(value:unknown,id:string):VisualWorkspace{
 const root=object(value),p=parseSnapshot(value),raw=p.native??{},v=object(root.visual),cap=object(root.capability);
 const storage=object(cap.storage??{});if(cap.storage!==undefined)need(typeof storage.imageUpload==='boolean'&&typeof storage.referenceMaterials==='boolean');
 need(p.id===id&&p.workflowVersion==='proposal-seven-v1'&&root.revision===p.revision&&v.protocolVersion==='simple-visual-a-workspace-v1'&&cap.protocolVersion===v.protocolVersion&&v.taskCardId===p.activeTaskCardId&&v.qualityApproval===false&&cap.semanticApproval===false&&cap.unknownRecoverySupported===false);
 const copy=p.stages.find(s=>s.stage==='copy')?.activeArtifactId??null;need(v.copyArtifactId===copy);
 const ds=records(raw.referenceDossiers),gs=records(raw.sketchGenerations),rs=records(raw.sketchReviewRuns);
 const d=ds.filter(d=>object(object(object(d.envelope).source).source).artifactId===copy).at(-1)??null;
 const g=gs.filter(g=>object(g.source).dossierId===d?.id).at(-1)??null;
 const r=rs.filter(r=>r.generationId===g?.id).at(-1)??null;
 need(same(v.dossier,d)&&same(v.generation,g)&&same(v.reviewRun,r));
 const pending=records(v.pendingAdvances),unrecorded=records(v.unrecordedAdvances),completed=records(v.completedAdvances);
 const expectedPending=records(raw.visualHttpRequests).filter(r=>object(r.advance??{}).status==='pending').map(r=>({commandId:object(r.request).commandId,...object(r.target),status:'advance_pending'}));
 need(same(unrecorded,records(raw.visualHttpRequests).filter(r=>r.advanceProtocol!=='visual-a-durable-advance-v1').map(r=>({commandId:object(r.request).commandId,status:'advance_state_unrecorded'})))&&same(completed,records(raw.visualHttpRequests).filter(r=>object(r.advance??{}).status==='completed').map(r=>({commandId:object(r.request).commandId,progress:object(r.advance).progress}))));
 need(same(pending,expectedPending)&&(v.writesBlocked===undefined?pending.length===0:v.writesBlocked===(pending.length>0)));
 const expectedPhase=r?'sketch_review':g?'sketch':d?'references':null;
 need(v.phase===expectedPhase);
 const target=v.target===null?null:(()=>{const t=object(v.target),ph=phase(t.phase),source=ph==='references'?object(d?.envelope).envelopeHash:ph==='sketch'?object(g?.source).sourceHash:r?.sourceHash;need(ph===expectedPhase&&t.targetId===(r??g??d)?.id&&t.sourceHash===source&&t.copyArtifactId===copy);return {phase:ph,targetId:text(t.targetId),sourceHash:sha(t.sourceHash)};})();
 need(Boolean(target)===Boolean(expectedPhase));
 const belongs=(j:Record<string,unknown>)=>target?.phase==='references'?j.purpose==='reference'&&j.dossierId===target.targetId:target?.phase==='sketch'?['sketch_owner','sketch_plan','image_candidate'].includes(text(j.purpose))&&j.generationId===target.targetId:target?.phase==='sketch_review'?['sketch_review_v2','sketch_refinement_handoff'].includes(text(j.purpose))&&j.reviewRunId===target.targetId:false;
 const jobs=p.jobs.filter(belongs),queued=ids(v.queuedJobIds),unknown=records(v.unknownJobs).map(j=>text(j.jobId));
 need(same(queued,jobs.filter(j=>j.status==='queued'&&Array.isArray(j.attempts)&&j.attempts.length===0).map(j=>j.id))&&same(unknown,jobs.filter(j=>['running','awaiting_reconciliation'].includes(text(j.status))).map(j=>j.id)));
 const images=records(v.images).map(visualImage);need(images.length===p.imageAssets.length&&images.every(i=>p.imageAssets.some(a=>a.id===i.imageId&&a.sha256===i.sha256&&a.projectId===id&&a.mediaType===i.mediaType&&a.byteLength===i.byteLength&&a.width===i.width&&a.height===i.height)));
 const env=d?object(d.envelope):null,source=env?object(env.source):null;
 if(env){const {envelopeHash,...rest}=env;need(envelopeHash===sha256(JSON.stringify(rest)));const original=object(source?.source),artifact=p.artifacts.find(a=>a.id===copy);need(artifact&&original.contentHash===artifact.contentHash&&sha256(text(original.contentText))===artifact.contentHash);}
 const current=!source||same(source.taskCard,p.cards.find(c=>c.id===p.activeTaskCardId)?.original)&&same(source.policy,records(raw.policies).at(-1));
 const readonlyReference=records(object(root.view).references).find(x=>x.dossierId===d?.id&&x.artifactId===copy);
 const ref=v.referenceState===null?(readonlyReference??{}):object(v.referenceState);
 const choice=ref.humanChoice?object(ref.humanChoice):null;
 const choiceView=choice?{catalogHash:sha(choice.catalogHash),pending:choice.pendingCandidateCoverage!==false,editionHash:choice.activeEdition&&object(choice.activeEdition).status==='awaiting_adoption'?sha(object(choice.activeEdition).editionHash):null,directions:records(choice.directions).map(dir=>({directionId:text(dir.directionId),uses:records(dir.uses).map(use=>({id:text(use.id),imageId:text(object(use.image).imageId),kind:text(object(use.card).kind),note:text(object(use.card).borrowingNote)||text(object(use.card).mechanism),disabled:!Array.isArray(use.disabledReasons)||use.disabledReasons.length>0}))}))}:null;
 const content=source?object(object(source.source).content):{};
 const reports=[...records(d?.reports),...records(r?.reports)].map((report,i)=>({title:`原报告 ${i+1}`,body:JSON.stringify(report,null,2)}));
 const readback=sketchReadScope(p);if(readback.states.length)reports.push({title:'草图来源核验（只读）',body:JSON.stringify(readback.states.map(s=>({生成批次:s.generationId,读取状态:s.kind==='unresolved'?'原任务结果未知，已停止':s.kind==='native_source_qualified'?'后端已核当前来源及列明原件范围':'来源仍待核对',原因:s.reason,成稿记录:s.artifact==='metadata_only'?'仅登记信息，未核成稿文件':s.artifact==='absent'?'尚无成稿记录':'成稿记录待核',边界:'仅供阅读，不代表审美通过、人工批准或允许执行。'})),null,2)});
 if(v.reviewOutcome!==null)reports.push({title:'原生草图判断（非人类选案）',body:JSON.stringify(v.reviewOutcome,null,2)});
 return {storage:{imageUpload:storage.imageUpload===true,referenceMaterials:storage.referenceMaterials===true},advancePending:pending.length>0,unrecordedAdvances:unrecorded.length,advanceResults:completed.length?JSON.stringify(completed,null,2):null,projectId:id,revision:p.revision,copyArtifactId:copy,current,available:cap.executionAllowed===true&&(target?.phase==='references'?cap.referenceConfigured===true:target?.phase==='sketch'?cap.sketchConfigured===true:target?.phase==='sketch_review'?cap.reviewConfigured===true:cap.referenceConfigured===true),target,queuedJobIds:queued,unknownJobs:jobs.filter(j=>j.status==='awaiting_reconciliation').map(j=>text(j.id)),runningJobs:jobs.filter(j=>j.status==='running').map(j=>text(j.id)),progress:{referenceReports:records(d?.reports).length,referencePlanned:env?integer(object(env.expandedPlan).modelCalls):null,sketchImages:g?p.jobs.filter(j=>j.generationId===g.id&&j.purpose==='image_candidate'&&j.status==='succeeded').length:0,sketchPlanned:g?records(object(g.plan??{}).candidates).length:null,reviewReports:records(r?.reports).length,reviewPlanned:r?records(r.nodes).length:null},images,directions:records(content.directions).map(d=>({id:text(d.id),title:text(d.title)||text(d.slogan)})),referenceStatus:text(ref.status),referenceChoiceAppSupported:cap.referenceChoiceAppSupported===true,sketchAppSupported:cap.sketchAppSupported===true,referenceStateOriginal:Object.keys(ref).length?JSON.stringify(ref,null,2):null,selectionHash:typeof ref.selectionHash==='string'?sha(ref.selectionHash):null,dossierId:d?text(d.id):null,generationId:g?text(g.id):null,generationHash:g?sha(object(g.source).sourceHash):null,reports,choice:choiceView,materials:records(raw.referenceMaterials).filter(m=>m.artifactId===copy&&!m.removed).map(m=>({imageId:text(object(m.image).imageId),directionId:text(m.directionId),borrowingNote:text(m.borrowingNote)}))};
}
export function visualReceipt(value:unknown,id:string,route:string,body:Record<string,unknown>){
 const root=object(value),p=parseSnapshot(value),raw=p.native??{},receipt=object(root.receipt),isStep=route==='visual-workflow/step';
 need(p.id===id&&receipt.commandId===body.commandId&&typeof receipt.replayed==='boolean');
 const row=records(isStep?raw.visualHttpRequests:raw.visualHttpIntents).find(row=>object(row.request).commandId===body.commandId);
 need(row&&same(row.request,body));
 if(isStep)need(receipt.phase===body.phase&&receipt.targetId===body.targetId&&same(receipt.jobIds,body.jobIds));else need(row?.operation===route&&receipt.operation===route&&receipt.nativeCommandId===object(row?.nativeRequest).commandId);
 const ledger=Object.values(p.processedCommands).some(raw=>{try{const c=object(JSON.parse(text(raw)));return c.kind===(isStep?'visual-http-step':'visual-http-intent')&&same(c.request,body);}catch{return false;}});need(ledger);
 return receipt.replayed===true;
}

/** Initial manual reference plan only: 10 production nodes and 7 fixed 17-node panels. */
export function bridgeReferenceJob(p:Snapshot,j:Record<string,unknown>):boolean{
 if(p.workflowVersion!=='proposal-seven-v1'||j.stage!=='references'||j.purpose!=='reference')return false;
 try{const d=records(p.native?.referenceDossiers).find(d=>d.id===j.dossierId);if(!d)return false;
 const env=object(d.envelope),{envelopeHash,...data}=env,source=object(env.source),original=object(source.source),assignment=object(source.producerAssignment),producer=p.jobs.find(job=>job.id===assignment.jobId),task=object(j.task);
 const key=text(j.nodeKey),simple:Record<string,{binding:unknown;parentId:string}>={assignment:{binding:object(env.bindings).reference_director,parentId:text(d.id)},'copy-owner':{binding:assignment.binding,parentId:`${d.id}:assignment`},'reference-owner':{binding:object(env.bindings).reference_lead,parentId:`${d.id}:assignment`},plan:{binding:object(env.bindings).reference_lead,parentId:`${d.id}:assignment`}};
 let expected=simple[key],protocol='reference-dossier-v1';
 if(!expected&&/^(collector|merge)-[0-2]$/.test(key))expected={binding:object(env.bindings)[key.startsWith('collector')?'reference_collector':'reference_lead'],parentId:`${d.id}:plan`};
 const review=/^((?:candidate|combination)-[0-2]|overview):(visual|brand|user|communication):(first_read|opposition_first_read|score|opposition)$/.exec(key);
 if(!expected&&review){expected={binding:object(env.bindings)[`reference_${review[3].startsWith('opposition')?'opposition':'score'}_${review[2]}`],parentId:text(d.id)};protocol='reference-pixel-review-v1';}
 if(!expected&&/^(?:(?:candidate|combination)-[0-2]|overview):director$/.test(key)){expected={binding:object(env.bindings).reference_review_director,parentId:text(d.id)};protocol='reference-pixel-review-v1';}
 if(!expected)return false;
 const expectedTask={id:j.id,owner:object(expected.binding).role,parentId:expected.parentId,dossierId:d.id,nodeKey:key,envelopeHash,returnContract:{nodeKey:key,protocolVersion:protocol}};

 const artifact=p.artifacts.find(a=>a.id===original.artifactId),attempt=producer?records(producer.attempts).find(a=>a.id===assignment.attemptId):undefined;
 return d.protocolVersion==='reference-dossier-v1'&&env.protocolVersion==='reference-dossier-v1'&&source.kind==='copy-to-references'
  &&Array.isArray(env.directionIds)&&env.directionIds.length===3&&new Set(env.directionIds).size===3&&same(env.directionIds,records(object(original.content).directions).map(d=>d.id))
  &&same(JSON.parse(text(original.contentText)),original.content)
  &&Boolean(producer&&same(assignment.binding,producer.binding)&&attempt&&attempt.status==='succeeded'&&['actorId','runId','contextId'].every(k=>text(object(attempt.executor)[k])&&object(attempt.executor)[k]===object(assignment.author)[k])&&same(attempt.receipt,assignment.executionReceipt)&&artifact&&same(artifact.author,assignment.author)&&same(artifact.executionReceipt,assignment.executionReceipt))
  &&env.envelopeHash===sha256(JSON.stringify(data))&&env.configuration!==null&&object(env.configuration).discoveryMode==='manual_supplied'
  &&Boolean(producer&&bridgeCopyJob(p,producer)&&Array.isArray(producer.outputVersionIds)&&producer.outputVersionIds.includes(original.artifactId))
  &&p.artifacts.some(a=>a.id===original.artifactId&&a.contentHash===original.contentHash)&&sha256(text(original.contentText))===original.contentHash
  &&j.id===`${d.id}:${j.nodeKey}`&&j.targetArtifactId===original.artifactId&&same(j.inputVersionIds,[original.artifactId])
  &&same(j.binding,expected.binding)&&same(task,expectedTask);
 }catch{return false;}
}
