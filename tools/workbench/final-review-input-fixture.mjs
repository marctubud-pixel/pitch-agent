import {sketchHash as digest} from './sketch-authority.mjs';
import {contentSourceLocations} from './complete-content.mjs';

const roles=['content','visual','brand','user','communication'];
const styles=['editorial','stage','evidence'];
const present=value=>({state:'present',value});
const clone=structuredClone;
const file=id=>({identity:id,originalPath:`/owned/${id}`,sha256:digest(id),mediaType:'image/png',bytes:100});
const dim=f=>present({width:10,height:10,boundSha256:f.sha256,boundBytes:f.bytes,evidenceIdentity:'synthetic-decoder'});

export function fixture({policy={humanGates:['final_review']},taskIdentity='task'}={}){
  const task={goal:'Owned proposal fixture'};
  const manuscript={schemaVersion:'complete-manuscript-v2',title:'标题 😀',narrativeBlocks:[{id:'b',kind:'source',text:'范围😀限定',originIds:['clause']}],
    pageIntents:[{id:'opening',central:{kind:'image',imageId:'art'},heroImageId:'art',blockIds:['b'],imageIds:['art'],allowedSplitAfterBlockIds:[]},
      {id:'closing',central:{kind:'text',exactText:'范围😀限定'},heroImageId:null,blockIds:['b'],imageIds:[],allowedSplitAfterBlockIds:[]}],
    clausePlacements:[],visibleObligations:[],directions:[],edits:[],sources:[],claims:[]};
  const clause={clauseId:'clause',content:{variant:'exact_string',text:'范围😀限定'}};
  const originals=[{identity:'report-a',version:'v1',raw:{findings:['first original']}},{identity:'report-b',version:'v1',raw:{findings:['second original']}}].map(r=>({...r,sha256:digest(r.raw)}));
  const occurrences=originals.map((r,i)=>({clauseId:'clause',occurrenceId:`o${i}`,originalContainerId:r.identity,originalContainerHash:r.sha256,originalPointer:'/findings/0',valueHash:digest(r.raw.findings[0]),sourceOwner:'reference-owner',
    applicability:{kind:'report',directionIds:['d'],useIds:['u']},scopeProof:{exact:'local'},disposition:'operative',dispositionProof:{raw:'owned'}}));
  const visibility={version:'content-visibility-v1',clauses:[clause],occurrences,archivedOccurrences:[],referenceUses:[],sourceReturns:[],fieldCoverage:[{host:'owned',complete:true}]};
  visibility.projectionHash=digest(visibility);
  const art=file('art');
  const source={schemaVersion:'content-source-v2',task,policy,strategy:{artifactId:'strategy',contentHash:'owned',content:{text:'strategy'}},copy:{artifactId:'copy',contentHash:'owned',content:{text:'copy'}},
    visual:{artifactId:'visual-ancestor',contentHash:'ancestry-only',payload:{directions:[{directionId:'d',targets:[{imageId:'art'}],preservedFindings:[{id:'retrospective'}]}]}},
    directionMap:[],sources:[{id:'citation',text:'exact source'}],claims:[],obligations:[{originId:'clause',artifactId:'visual-ancestor',pointer:'/visibility/clauses/0',owner:'content-author',kind:'qualification',value:clause}],
    images:[{imageId:'art',sha256:art.sha256,mediaType:art.mediaType,byteLength:art.bytes,width:10,height:10}],visibility,qualificationArchive:{records:[{id:'archive'}]},
    immutableBasis:{exact:'ancestry only'},processArchive:{privateHistory:'retained raw'},visualLeg:{old:'report'}};
  source.sourceHash=digest(source);
  const rows=contentSourceLocations({id:'content-root',task:{packetVersion:'content-packet-v3',source}});
  const acceptance={raw:{decision:'accept'}};
  const contract={artifactId:'content',rootJobId:'content-root',packetVersion:'content-packet-v3',sourceHash:source.sourceHash,projectionHash:visibility.projectionHash,manuscriptHash:digest(manuscript),manuscript,
    sourceLocationVersion:'content-source-location-v1',sourceLocations:rows,images:source.images,obligations:source.obligations,visibility,layoutAcceptance:acceptance};
  const manuscriptText=JSON.stringify(manuscript,null,2),ownerReports={producer:{raw:{decision:'accept'}},consumer:acceptance};
  const trusted={contract,source,contentHash:digest(manuscriptText),manuscriptText,ownerReports};
  const catalog={version:contract.sourceLocationVersion,rows,entries:rows.flatMap(r=>[{location:r.derived,value:clause,ancestryAnchor:r.ancestryAnchor},...r.originals.map((l,i)=>({location:l,value:originals[i].raw.findings[0],ancestryAnchor:r.ancestryAnchor}))])};
  const ledger={schemaVersion:'semantic-layout-v2',source,manuscript,sourceLocations:rows};
  const ledgerText=JSON.stringify(ledger);
  const assets={art:{file:'art',role:'art',source:{type:'owned',description:'Original artwork'}}};
  const assetsText=JSON.stringify({assets}),resource={kind:'assets',path:'/owned/assets.json',sha256:digest(assetsText),byteLength:Buffer.byteLength(assetsText)};
  const exactBinding={resources:[resource],projectId:'project',policy,contentArtifactId:'content',contentRootJobId:'content-root',contentHash:trusted.contentHash,manuscriptHash:contract.manuscriptHash,sourceHash:source.sourceHash,
    projectionHash:contract.projectionHash,ledgerHash:digest(ledgerText),ownerReportsHash:digest(ownerReports),imageInventory:source.images};
  const snapshot={schemaVersion:'final-review-input-v2',project:{id:'project',observedRevision:7},task:{identity:taskIdentity,exactTask:task},policy:{identity:'policy',exactPolicy:policy},
    content:{trusted,locations:catalog},layout:{assetsResource:present({resource,contentText:assetsText,parsed:{assets}}),rootJobId:'layout-root',bindingIdentity:digest(exactBinding),exactBinding,ledgerText,originalOwnerReports:ownerReports,originalJobs:[],originalAttempts:[],originalReceipts:[]},
    materials:[{identity:'art',kind:'source_image',sourceRow:source.images[0],file:present(art),dimensions:dim(art)}],
    owners:Object.fromEntries(['layoutProducer','finalConsumer','finalProducer','deliveryConsumer'].map(k=>[k,present({actorIdentity:k,assignmentIdentity:k,providerIdentity:'owned',modelIdentity:'owned'})])),
    history:{retained:{originalReports:originals,originalFindings:[],originalAttempts:[{id:'old-call',status:'succeeded',chargedCalls:3}],dispositions:[],predecessorInputIds:['old'],hosts:[]},completeness:present(true)},
    returnBindings:[],allowance:present({authorityIdentity:'owned',totalCalls:10000,reservedOtherCalls:4}),humanFinalGate:present({selected:true,policyIdentity:'policy',gate:'final_review'})};
  const evidence={domain:'content_location',location:rows[0].derived};
  snapshot.roleMaterialScopes=roles.map(role=>({role,applicability:present([{materialIdentity:'art',decision:present({required:['visual','brand'].includes(role),evidence:[evidence]})}])}));
  snapshot.editions=present(styles.map((style,s)=>{
    const slides=Array.from({length:s+2},(_,i)=>{
      const opening=i%2===0,refs=opening?{centralImageIntentId:'opening',blockIds:[],imageIds:['art'],sourceIds:[],claimOrigins:[],obligationOrigins:[]}:
        {centralMessageIntentId:'closing',blockIds:[],imageIds:[],sourceIds:[],claimOrigins:[],obligationOrigins:[]};
      const occurrenceId=`${style}-${i}-element`;
      const element={id:occurrenceId,occurrenceId,type:opening?'image':'text',...(opening?{assetId:'art'}:{sourceText:manuscript.narrativeBlocks[0].text}),contentRefs:refs};
      return {id:`${style}-slide-${i}`,originId:opening?'opening':'closing',elements:[{id:`decoration-${i}`,type:'shape'},element]};
    });
    const placements=slides.flatMap(slide=>slide.elements.filter(e=>e.contentRefs).map(e=>({intentId:slide.originId,slideId:slide.id,elementId:e.id,occurrenceId:e.occurrenceId,...e.contentRefs})));
    const raw={style,slides,placements,semanticContent:{source,manuscript},imageResources:{art:{file:art.originalPath,sha256:art.sha256,byteLength:art.bytes,width:10,height:10}},inputHashes:{assets:resource.sha256}};
    const layoutManifest={originalPath:`owned/${style}/layout.json`,sha256:digest(raw),bytes:100,raw};
    const pages=slides.map((slide,i)=>{const render=file(`${style}-page-${i}`);return {pageNumber:i+1,slideId:slide.id,rawSlide:slide,
      rawReviewPage:{page:i+1,dimensions:[10,10],image:{path:render.originalPath,sha256:render.sha256,bytes:render.bytes}},originalRender:render,dimensions:dim(render)};});
    const reviewRaw={pageCount:pages.length,pages:pages.map(p=>p.rawReviewPage)};
    return {style,originalExportJobId:`job-${style}`,originalAttemptId:`attempt-${style}`,originalWorker:{host:'owned',token:style},historicalExecution:{identity:'owned'},
      anchor:{originalPath:`owned/${style}/anchor`,sha256:digest(style),bytes:100,raw:{owned:true}},layoutManifest,
      reviewManifest:{originalPath:`owned/${style}/review.json`,sha256:digest(reviewRaw),bytes:100,raw:reviewRaw},deliveryDeck:file(`${style}-delivery.pptx`),nativeInputDeck:file(`${style}-input.pptx`),pdf:file(`${style}.pdf`),pages,
      placements:placements.map((p,i)=>({raw:p,native:{editionAttemptId:`attempt-${style}`,layoutManifestSha256:layoutManifest.sha256,slideIndex:i,slideId:p.slideId,elementIndex:1,elementId:p.elementId,occurrenceId:p.occurrenceId},provenance:[]}))};
  }));
  const transport={maxImages:4,maxBytes:400,maxPixels:400,maxImageBytes:100,maxImagePixels:100};
  const profile=(identity,pixels=true)=>({identity,providerIdentity:'owned',modelIdentity:'owned',operation:'final-review-v1',adapterEvidenceIdentity:'synthetic-adapter',
    contextEvidenceIdentity:'synthetic-context',transportEvidenceIdentity:'synthetic-transport',independentContextEvidenceIdentity:'synthetic-independent-context',
    context:{maxInputBytes:50000000,maxOutputBytes:1000},transport:pixels?clone(transport):null,reportBoundBytes:1000});
  const keys=['primary','blind','primarySynthesis','blindSynthesis','challenge'];
  const roleSeats=Object.fromEntries(roles.map(role=>[role,Object.fromEntries(keys.map(key=>[key,{assignmentIdentity:`${role}:${key}`,actorIdentity:`${role}:${key}`,
    profileIdentity:`${role}:${key}`}]))]));
  const profiles=roles.flatMap(role=>keys.map(key=>profile(`${role}:${key}`,key==='primary'||key==='blind')));
  profiles.push(profile('director',false),profile('owners',false));
  const configuration={schemaVersion:'final-review-configuration-v2',assignmentPolicy:{profiles,roles:roleSeats,
    director:{assignmentIdentity:'director',actorIdentity:'director',profileIdentity:'director'},
    ownerProfiles:Object.fromEntries(['layoutProducer','finalConsumer','finalProducer','deliveryConsumer'].map(k=>[k,'owners']))}};
  return {snapshot,configuration};
}
