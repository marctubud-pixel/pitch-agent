import {REFERENCE_APPLICABILITY, referenceReviewNodes, referenceReviewInput, referenceReviewIssues, referenceQualifiedUses, referenceParetoFrontier, validateReferenceReviewOutput} from './reference-review.mjs';

const pixel = image => ({kind:'pixel',imageId:image.imageId,imageHash:image.sha256,region:[0,0,1,1],pointer:null,quote:null,observation:'Synthetic fixture observation; no actual aesthetic judgment.'});
const quote = (pointer,text) => ({kind:'pointer',imageId:null,imageHash:null,region:null,pointer,quote:text,observation:'Synthetic fixture text binding.'});

export function referenceReviewFixtureOutput(input) {
  const raw=Object.fromEntries(['protocolVersion','packetId','packetHash','phase','role','images'].map(key=>[key,structuredClone(input[key])]));
  raw.limitations=['Synthetic integration fixture; no provider, independent aesthetic calibration, consumer validation, or actual pixel inspection.'];
  if(input.phase.endsWith('first_read')) {
    raw.readings=input.images.map(image=>({imageId:image.imageId,meaning:'Synthetic neutral first read.',uncertainties:['Synthetic pixels have not been judged.'],evidence:[pixel(image)]}));
    raw.issues=[];
  } else if(input.phase==='score') {
    raw.evaluations=input.uses.map((use,index)=>({useId:use.id,dimensions:input.dimensions.map((dimension,dimensionIndex)=>{
      const applicable=REFERENCE_APPLICABILITY[use.applicabilityProfile][input.role].includes(dimension);
      const evidence=[pixel(input.images.find(image=>image.imageId===use.imageId))];
      if(input.role==='communication'&&use.kind==='component')evidence.push(quote(`/uses/${index}/prohibitedCopying`,use.prohibitedCopying));
      return {dimension,status:applicable?'scored':'not_applicable',score:applicable?4:null,reason:'Synthetic fixture only.',evidence};
    }),hardRejects:[],missingFields:[],decision:use.kind==='direction'?'advance_sketch':REFERENCE_APPLICABILITY[use.applicabilityProfile][input.role].length===0?'boundary_clear':'pass_component'}));
    raw.comparisons=input.scope==='candidates'?[]:input.uses.flatMap((a,index)=>input.uses.slice(index+1).map(b=>({pair:[a.id,b.id],judgment:input.scope==='overview'?'distinct':'compatible',reason:'Synthetic comparison only.',evidence:[pixel(input.images.find(image=>image.imageId===a.imageId)),pixel(input.images.find(image=>image.imageId===b.imageId))]})));
    raw.issues=[];
  } else if(input.phase==='opposition')raw.challenges=[];
  else {
    raw.adjudications=referenceReviewIssues(input.reports).map(issue=>({findingKey:issue.key,disposition:'rejected',reason:'Synthetic fixture disposition only.',evidence:[quote(`${issue.pointer}/impact`,issue.finding.impact),...issue.finding.evidence.filter(e=>e.kind==='pixel').map(e=>pixel(input.images.find(image=>image.imageId===e.imageId)))],owner:issue.finding.owner,acceptance:issue.finding.acceptance}));
    raw.selection=input.scope==='candidates'?(referenceParetoFrontier(referenceQualifiedUses(input.uses,input.reports),input.reports)[0]??null):null;
    raw.taskFitReason='Synthetic task-fit fixture; not an actual selection judgment.';
    raw.packageDecision=input.scope==='overview'?'distinct':'compatible';
    raw.evidence=input.images.map(pixel);
  }
  return raw;
}

export function referenceReviewFixtureReports(packet,{mutateReport=()=>{}}={}) {
  const reports=[];
  for(const node of referenceReviewNodes(packet.id)) {
    const input=referenceReviewInput(packet,node,reports),raw=referenceReviewFixtureOutput(input);
    mutateReport(raw,input);
    reports.push({nodeKey:node.key,rawReport:validateReferenceReviewOutput(raw,input)});
  }
  return reports;
}

export function referenceReviewFixturePacket({scope='candidates',kinds=['direction','direction']}={}) {
  return {id:'fixture_packet',scope,...(scope==='combination'?{packageRoles:{mainUseId:kinds.includes('direction')?`use_${kinds.indexOf('direction')}`:null,complementUseIds:kinds.flatMap((kind,i)=>kind==='component'?[`use_${i}`]:[]),backupUseIds:kinds.flatMap((kind,i)=>kind==='direction'&&i!==kinds.indexOf('direction')?[`use_${i}`]:[])}}:{}),images:kinds.map((_,index)=>({imageId:`image_${index}`,sha256:String(index+1).repeat(64),mediaType:'image/png',byteLength:100})),
    minimalFacts:{brief:'Synthetic packaging exploration.',scope},taskFacts:{brief:'Synthetic task facts.',restrictions:['No claims of market effect.']},
    uses:kinds.map((kind,index)=>({id:`use_${index}`,imageId:`image_${index}`,directionId:scope==='overview'?`direction_${index}`:'direction_one',kind,applicabilityProfile:kind==='direction'?'direction':'material_color_component',visibleRegion:'Central composition.',mechanism:'A visible contrast between material and label.',targetCarrier:'Bottle label.',translation:'Translate contrast to a clear brand relationship on the label.',comparisonScope:'The attached bounded comparison samples.',innovationHypothesis:'A testable composition difference within the declared samples.',prohibitedCopying:'Do not copy the full image, brand identity, or claim popularity or effect.',uncertainties:['Synthetic fixture only.']}))};
}
