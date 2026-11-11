import {sketchHash} from './sketch-authority.mjs';

const DOMAINS={artifacts:'artifact',jobs:'job',taskCards:'task_card',referenceDossiers:'reference_dossier',sketchGenerations:'sketch_generation',sketchReviewRuns:'sketch_review_run',finalVisualRuns:'final_visual_run',ownerEdges:'owner_edge'};
const REPORT_COLLECTIONS=new Set(['ownerReports','creativeReports','verifications','readinessReports','handoffReports','feedbackReviews','correctionReviews','observationReviews','caseIdentityReviews','imageObservations','reviews']);
const PROJECT_COLLECTIONS=new Set([...Object.keys(DOMAINS),...REPORT_COLLECTIONS,'confirmations','visualAuthorizations','policies','humanFeedback','sourceCaptures','imageAssets','readinessResolutions','panels','decisions','acknowledgments','releases','audit','creativePanels','ownerIntents','sketchReviewIntents','referenceIntents','referenceMaterials','sketchIntents','finalVisualIntents','finalVisualReturns','finalVisualRevisionRequests','contentIntents','contentVisibilityRevisionIntents','reconciliations','finalReviewSetups','finalReviewReservations']);
const OUTPUT_DOMAINS=new Set(['artifact','registered:sourceCaptures','registered:imageAssets']);
const FINDING_FIELDS=new Set(['findings','issues','challenges','necessaryConditions','unresolvedIssues','requiredChanges','blockers']);
const LIMITS=Object.freeze({nodes:8192,recordBytes:64*1024**2,serializedBytes:512*1024**2,milliseconds:60000});
const text=x=>typeof x==='string'&&x.length>0;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const escape=x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1');

export function indexFinalHistoryRecords(project,{contentRootJobId,layoutRootJobId}={}) {
  const started=Date.now(),nodes=[],edges=[],reports=[],findings=[],targets=[],dispositions=[],artifactCandidates=[],returnRecords=[],externalWitnesses=[],missing=[],invalid=[];
  const maps=new Map(),records=[],byId=new Map(),reportByPointer=new Map();
  let serializedBytes=0;
  const issue=(kind,code,detail)=>{(kind==='missing'?missing:invalid).push({code,...detail});};
  const check=()=>{
    if(Date.now()-started>LIMITS.milliseconds)throw Object.assign(Error('Registered history indexing deadline'),{code:'FINAL_HISTORY_LIMIT'});
  };
  const serialize=value=>{
    check();const s=JSON.stringify(value);
    if(s===undefined||Buffer.byteLength(s)>LIMITS.recordBytes)throw Object.assign(Error('Registered history record limit'),{code:'FINAL_HISTORY_LIMIT'});
    serializedBytes+=Buffer.byteLength(s);
    if(serializedBytes>LIMITS.serializedBytes)throw Object.assign(Error('Registered history serialization allowance'),{code:'FINAL_HISTORY_LIMIT'});
    return s;
  };
  const add=(domain,value,pointer,{requiredId=false}={})=>{
    if(requiredId&&(!object(value)||!text(value.id))){issue('invalid','FINAL_HISTORY_RECORD_ID',{pointer,domain});return null;}
    const encoded=serialize(value),id=object(value)&&text(value.id)?value.id:`derived-pointer:${pointer}`;
    const recordHash=sketchHash(encoded),identity=JSON.stringify([domain,id,pointer]);
    const node={identity,domain,recordId:object(value)&&text(value.id)?value.id:null,originalPointer:pointer,recordHash,version:`derived-record-${recordHash}`,versionOrigin:'registered_record_hash'};
    if(nodes.length>=LIMITS.nodes)throw Object.assign(Error('Registered history node limit'),{code:'FINAL_HISTORY_LIMIT'});
    const key=JSON.stringify([domain,id]),prior=maps.get(key)??[];
    if(prior.length)issue('invalid','FINAL_HISTORY_DUPLICATE_ID',{domain,id,pointers:[...prior.map(x=>x.node.originalPointer),pointer]});
    const entry={node,value};maps.set(key,[...prior,entry]);nodes.push(node);records.push(entry);
    if(node.recordId){const entries=byId.get(node.recordId)??[];entries.push(entry);byId.set(node.recordId,entries);}
    return entry;
  };
  const report=(record,pointer,host)=>{
    const entry=add(`report:${host.domain}:${host.id??pointer}`,record,pointer,{requiredId:true});if(!entry)return;
    const raw=Object.hasOwn(record,'rawReport')?record.rawReport:Object.hasOwn(record,'raw')?record.raw:record;
    const encoded=serialize(raw),receipt=record.executionReceipt??record.receipt??null;
    const receiptText=receipt?serialize(receipt):null,receiptHash=receipt?sketchHash(typeof receipt==='string'?receipt:receiptText):null;
    const version=`derived-report-${sketchHash(serialize({recordHash:entry.node.recordHash,rawHash:sketchHash(typeof raw==='string'?raw:encoded),receiptHash,inputPacketHash:receipt?.inputPacketHash??null}))}`;
    const r={identity:record.id,version,versionOrigin:'registered_record_payload_receipt',representation:Object.hasOwn(record,'rawReport')||Object.hasOwn(record,'raw')?'stored_raw_report':'registered_projection',sha256:sketchHash(typeof raw==='string'?raw:encoded),raw:JSON.parse(encoded),originalRecordPointer:pointer,recordHash:entry.node.recordHash,host,receiptHash,inputPacketHash:receipt?.inputPacketHash??null,originalResponseText:receipt?.responseText??null};
    reports.push(r);reportByPointer.set(pointer,r);
    const payloadPointer=Object.hasOwn(record,'rawReport')?`${pointer}/rawReport`:Object.hasOwn(record,'raw')?`${pointer}/raw`:pointer;
    if(!object(raw))return;
    const fields=Object.entries(raw).filter(([field,values])=>Array.isArray(values)&&FINDING_FIELDS.has(field)).map(([field,values])=>({pointer:`/${escape(field)}`,values}));
    for(const [entryIndex,score] of (Array.isArray(raw.entries)?raw.entries:[]).entries())for(const field of ['findings','conditions'])if(Array.isArray(score?.[field]))fields.push({pointer:`/entries/${entryIndex}/${field}`,values:score[field]});
    for(const field of fields)for(const [index,payload] of field.values.entries()) {
      const originalFindingPointer=`${field.pointer}/${index}`,findingIdentity=`${record.id}@${version}#${originalFindingPointer}`;
      const finding={identity:findingIdentity,originalReportIdentity:r.identity,originalReportVersion:r.version,originalFindingPointer,originalProjectPointer:`${payloadPointer}${originalFindingPointer}`,exactOriginalPayload:JSON.parse(serialize(payload)),targetOccurrences:[],interpretation:'unclassified_original_report_field'};
      findings.push(finding);
      if(object(payload))for(const targetField of ['returnTargets','returnTarget','returnLocation'])if(Object.hasOwn(payload,targetField)) {
        const value=payload[targetField];
        if(targetField==='returnTargets'&&!Array.isArray(value)){issue('invalid','FINAL_HISTORY_TARGET_ARRAY',{pointer:`${finding.originalProjectPointer}/${targetField}`});continue;}
        const list=targetField==='returnTargets'?value:[value];
        for(const [targetIndex,rawTarget] of list.entries()) {
          const originalReportPointer=`${originalFindingPointer}/${targetField}${targetField==='returnTargets'?`/${targetIndex}`:''}`;
          const occurrence={identity:JSON.stringify([r.identity,r.version,originalReportPointer]),findingIdentity,reportIdentity:r.identity,reportVersion:r.version,targetField,targetIndex:finding.targetOccurrences.length,fieldIndex:targetIndex,originalReportPointer,originalProjectPointer:`${payloadPointer}${originalReportPointer}`,rawTarget:JSON.parse(serialize(rawTarget))};
          targets.push(occurrence);finding.targetOccurrences.push(occurrence.identity);
        }
      }
    }
    if(Array.isArray(raw.dispositions))for(const [index,value] of raw.dispositions.entries())dispositions.push({originalReportIdentity:r.identity,originalReportVersion:r.version,originalReportPointer:`/dispositions/${index}`,originalProjectPointer:`${payloadPointer}/dispositions/${index}`,value:JSON.parse(serialize(value))});
  };
  const get=(domain,id)=>maps.get(JSON.stringify([domain,id]))??[];
  const ref=(from,domain,id,pointer,expectedHash=null,rawHash=false)=>{
    if(id===undefined||id===null)return;
    if(!text(id)){issue('invalid','FINAL_HISTORY_REFERENCE_ID',{pointer,domain});return;}
    let candidates;
    if(domain==='input')candidates=[...get('artifact',id),...get('task_card',id)];
    else if(domain==='output')candidates=(byId.get(id)??[]).filter(x=>OUTPUT_DOMAINS.has(x.node.domain)||reportByPointer.has(x.node.originalPointer));
    else if(domain==='report')candidates=(byId.get(id)??[]).filter(x=>x.node.domain.startsWith('report:'));
    else candidates=get(domain,id);
    if(domain==='report'&&expectedHash!==null) {
      const matches=candidates.filter(x=>(rawHash?reportByPointer.get(x.node.originalPointer)?.sha256:x.node.recordHash)===expectedHash);
      if(candidates.length&&!matches.length){issue('invalid','FINAL_HISTORY_REFERENCE_HASH',{pointer,domain,targetId:id,expectedHash});return;}
      candidates=matches;
    }
    if(domain==='report'||domain==='output') {
      const originals=candidates.filter(x=>reportByPointer.get(x.node.originalPointer)?.representation==='stored_raw_report');
      if(originals.length)candidates=originals;
    }
    const unique=[...new Map(candidates.map(x=>[x.node.originalPointer,x])).values()];
    if(unique.length!==1){issue('missing',unique.length?'FINAL_HISTORY_AMBIGUOUS_REFERENCE':'FINAL_HISTORY_MISSING_REFERENCE',{pointer,domain,targetId:id});return;}
    const to=unique[0],actualHash=rawHash?reportByPointer.get(to.node.originalPointer)?.sha256:to.node.recordHash;
    if(expectedHash!==null&&expectedHash!==actualHash){issue('invalid','FINAL_HISTORY_REFERENCE_HASH',{pointer,domain,targetId:id,expectedHash,actualHash});return;}
    edges.push({from:from.node.identity,to:to.node.identity,originalPointer:pointer,targetDomain:domain,targetId:id,...(expectedHash!==null?{expectedHash}: {})});
  };
  const array=(value,pointer,required=false)=>{
    if(value===undefined){if(required)issue('missing','FINAL_HISTORY_ARRAY_REQUIRED',{pointer});return [];}
    if(!Array.isArray(value)){issue('invalid','FINAL_HISTORY_INVALID_ARRAY',{pointer});return [];}
    return value;
  };
  try {
    if(!object(project)||!text(project.id)||!Number.isSafeInteger(project.revision)||project.revision<0)throw Object.assign(Error('Observed project identity required'),{code:'FINAL_HISTORY_INVALID_PROJECT'});
    for(const key of ['artifacts','jobs','taskCards'])array(project[key],`/${key}`,true);
    for(const key of PROJECT_COLLECTIONS)if(!['artifacts','jobs','taskCards'].includes(key)&&Object.hasOwn(project,key)&&!Array.isArray(project[key]))issue('invalid','FINAL_HISTORY_INVALID_ARRAY',{pointer:`/${key}`});
    for(const [collection,rows] of Object.entries(project))if(Array.isArray(rows))for(const [index,value] of rows.entries())add(DOMAINS[collection]??`registered:${collection}`,value,`/${escape(collection)}/${index}`,{requiredId:['artifacts','jobs','taskCards'].includes(collection)});
    const primary=[...records];
    for(const entry of primary) {
      const {node,value}=entry;if(!object(value))continue;
      if(node.domain==='job') {
        for(const [i,attempt] of array(value.attempts,`${node.originalPointer}/attempts`,true).entries())add(`attempt:${value.id}`,attempt,`${node.originalPointer}/attempts/${i}`,{requiredId:true});
        if(value.contentReport!==undefined)report(value.contentReport,`${node.originalPointer}/contentReport`,{domain:'job',id:value.id});
      }
      if(['reference_dossier','sketch_review_run','final_visual_run'].includes(node.domain))for(const [i,r] of array(value.reports,`${node.originalPointer}/reports`,true).entries())report(r,`${node.originalPointer}/reports/${i}`,{domain:node.domain,id:value.id});
      const collection=node.originalPointer.split('/')[1];
      if(REPORT_COLLECTIONS.has(collection))report(value,node.originalPointer,{domain:node.domain,id:value.id??null});
    }
    const seeds=[['job',contentRootJobId,'/selection/contentRootJobId','complete_content_plan'],['job',layoutRootJobId,'/selection/layoutRootJobId','layout_export']];
    for(const [domain,id,pointer,purpose] of seeds){if(!text(id)||get(domain,id).length!==1)issue('missing','FINAL_HISTORY_SELECTED_ROOT_REQUIRED',{pointer,targetId:id});else if(get(domain,id)[0].value.purpose!==purpose)issue('invalid','FINAL_HISTORY_SELECTED_ROOT_TYPE',{pointer,targetId:id,expectedPurpose:purpose});}
    for(const entry of primary) {
      check();const {node,value:v}=entry,p=node.originalPointer;if(!object(v))continue;
      if(node.domain==='artifact') {
        for(const [i,id] of array(v.inputVersionIds,`${p}/inputVersionIds`,true).entries())ref(entry,'input',id,`${p}/inputVersionIds/${i}`);
        ref(entry,'artifact',v.revision?.revisionOf?.artifactId,`${p}/revision/revisionOf/artifactId`);
        ref(entry,'job',v.completeContent?.rootJobId,`${p}/completeContent/rootJobId`);
        ref(entry,'final_visual_run',v.finalVisual?.runId,`${p}/finalVisual/runId`);
        ref(entry,'sketch_generation',v.sketchGeneration?.generationId,`${p}/sketchGeneration/generationId`);
        ref(entry,'sketch_review_run',v.sketchGeneration?.reviewRunId,`${p}/sketchGeneration/reviewRunId`);
        artifactCandidates.push({artifactId:v.id,contentHash:v.contentHash??null,payloadRef:v.payloadRef??null,originalPointer:p,registeredVersion:node.version,requiresOriginalBytes:true});
      }
      if(node.domain==='job') {
        for(const [i,id] of array(v.inputVersionIds,`${p}/inputVersionIds`,true).entries())ref(entry,'input',id,`${p}/inputVersionIds/${i}`);
        for(const [i,id] of array(v.outputVersionIds,`${p}/outputVersionIds`,v.status==='succeeded').entries())ref(entry,'output',id,`${p}/outputVersionIds/${i}`);
        for(const [key,domain] of [['contentRootJobId','job'],['dossierId','reference_dossier'],['generationId','sketch_generation'],['reviewRunId','sketch_review_run'],['finalVisualRunId','final_visual_run'],['edgeId','owner_edge']])ref(entry,domain,v[key],`${p}/${key}`);
        ref(entry,'job',v.task?.rootJobId,`${p}/task/rootJobId`);ref(entry,'job',v.task?.predecessorRootJobId,`${p}/task/predecessorRootJobId`);
        const correction=v.task?.correction;ref(entry,'job',correction?.predecessorRootJobId,`${p}/task/correction/predecessorRootJobId`);
        for(const [i,old] of array(correction?.originalReports,`${p}/task/correction/originalReports`).entries()) {
          ref(entry,'job',old.jobId,`${p}/task/correction/originalReports/${i}/jobId`);
          const job=get('job',old.jobId)[0]?.value;
          if(job?.contentReport?.id!==old.reportId)issue('invalid','FINAL_HISTORY_REPORT_JOB_MISMATCH',{pointer:`${p}/task/correction/originalReports/${i}`,jobId:old.jobId,reportId:old.reportId});
          ref(entry,'report',old.reportId,`${p}/task/correction/originalReports/${i}/reportId`,old.reportHash??null);
        }
        const source=v.task?.source;
        for(const key of ['strategy','copy','visual'])ref(entry,'artifact',source?.[key]?.artifactId,`${p}/task/source/${key}/artifactId`);
        ref(entry,'job',source?.visualLeg?.jobId,`${p}/task/source/visualLeg/jobId`);
        for(const field of ['occurrences','archivedOccurrences'])for(const [i,o] of array(source?.visibility?.[field],`${p}/task/source/visibility/${field}`).entries()) {
          const boundary=`${source?.visual?.artifactId}/referenceBoundaries`;
          if(o.originalContainerId!==boundary)ref(entry,'report',o.originalContainerId,`${p}/task/source/visibility/${field}/${i}/originalContainerId`,o.originalContainerHash??null,true);
          else externalWitnesses.push({kind:'reference_boundaries',sourceJobId:v.id,containerId:o.originalContainerId,containerHash:o.originalContainerHash,originalPointer:`${p}/task/source/visibility/${field}/${i}`,requires:'resolveContentSourceLocation'});
        }
        for(const [i,key] of array(v.node?.dependencies,`${p}/node/dependencies`).entries()) {
          const scopes=['contentRootJobId','finalVisualRunId','reviewRunId','dossierId','generationId','panelId'].filter(field=>text(v[field]));
          if(!scopes.length){externalWitnesses.push({kind:'node_dependency',sourceJobId:v.id,nodeKey:key,originalPointer:`${p}/node/dependencies/${i}`,requires:'domain_specific_node_dependency_verification'});continue;}
          const jobs=(project.jobs??[]).filter(j=>scopes.every(field=>j[field]===v[field])&&j.nodeKey===key);
          if(jobs.length!==1)issue('missing','FINAL_HISTORY_NODE_DEPENDENCY',{pointer:`${p}/node/dependencies/${i}`,nodeKey:key,scope:Object.fromEntries(scopes.map(field=>[field,v[field]]))});
          else ref(entry,'job',jobs[0].id,`${p}/node/dependencies/${i}`);
        }
      }
      if(node.domain==='reference_dossier') {
        ref(entry,'reference_dossier',v.previousDossierId,`${p}/previousDossierId`);
        for(const [i,a] of array(v.priorChoiceHistory,`${p}/priorChoiceHistory`).entries())ref(entry,'reference_dossier',a.dossierId,`${p}/priorChoiceHistory/${i}/dossierId`);
        ref(entry,'artifact',v.envelope?.source?.source?.artifactId,`${p}/envelope/source/source/artifactId`);
        for(const field of ['machineReturns','previousReturns'])for(const [i,value] of array(v[field],`${p}/${field}`).entries())returnRecords.push({sourceDomain:node.domain,sourceId:v.id,originalPointer:`${p}/${field}/${i}`,value:JSON.parse(serialize(value))});
      }
      if(node.domain==='final_visual_run') {
        ref(entry,'final_visual_run',v.parentRunId,`${p}/parentRunId`);
        ref(entry,'artifact',v.source?.copyArtifactId,`${p}/source/copyArtifactId`);ref(entry,'artifact',v.source?.sketchArtifact?.id,`${p}/source/sketchArtifact/id`);
      }
      if(node.domain==='sketch_generation')ref(entry,'reference_dossier',v.source?.dossierId,`${p}/source/dossierId`);
      if(node.domain==='sketch_review_run')ref(entry,'sketch_generation',v.generationId,`${p}/generationId`);
      if(node.domain==='owner_edge')ref(entry,'artifact',v.envelope?.source?.artifactId,`${p}/envelope/source/artifactId`);
      if(node.domain==='registered:finalVisualReturns') {
        returnRecords.push({sourceDomain:node.domain,sourceId:v.id??null,originalPointer:p,value:JSON.parse(serialize(v))});
        ref(entry,'final_visual_run',v.parentRunId,`${p}/parentRunId`);
        ref(entry,'report',v.reportId,`${p}/reportId`,v.reportHash??null);
      }
    }
  } catch(error) {issue(error.code==='FINAL_HISTORY_LIMIT'?'missing':'invalid',error.code??'FINAL_HISTORY_INVALID_DATA',{message:error.message});}
  return {kind:invalid.length?'invalid_basis':missing.length?'blocked':'indexed',projectId:project?.id??null,observedRevision:project?.revision??null,nodes,edges,reportAnchors:reports,findingOccurrences:findings,targetOccurrences:targets,dispositions,artifactCandidates,returnRecords,externalWitnesses,missing,invalid,accounting:{nodes:nodes.length,serializedBytes},requires:['domain_specific_original_report_verification','original_artifact_byte_verification','return_target_address_resolution','role_material_obligation_interpretation'],limitations:['This is a registered-record index, not complete final history or factual approval.','Opaque registered collections retain record identity/hash only; their domain meaning is not inferred.','Derived record versions are hashes of originals, not fabricated stored ordinals.'],executionAvailable:false,finalAuthorityAvailable:false,deliveryAvailable:false};
}
