import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const originalVisual=await import('./final-visual.mjs');
let pureVisual;
mock.module('./final-visual.mjs',{namedExports:{...originalVisual,
 requireFinalVisual(){assert.ok(pureVisual,'Only the explicitly frozen downstream visual fixture is replaced');return structuredClone(pureVisual.run);},
 finalPayload(){return structuredClone(pureVisual.payload);}
}});
const {actualNumericContentUpstream}=await import('./content-numeric-source-fixture.mjs');
const {NUMERIC_CONTENT_CONTRACT:contract,requireContentContract}=await import('./content-contract-versions.mjs');
const {contentSourceEnvelope,requireResearchChartAdmission}=await import('./project.mjs');
const {makeContentSource,makeProjectedContentSource,neutralContent,validateManuscript,validateLegacyManuscript,obligationText,contentRootId,contentSourceLocations,resolveContentSourceLocation,requireContentCurrent,contentRequest}=await import('./complete-content.mjs');
const {evidenceStateHash}=await import('./evidence-review.mjs');
const {ownerHash}=await import('./owner-edge.mjs');
const {sketchHash:hash}=await import('./sketch-authority.mjs');
const {deriveChartContent,contentChartObligations,validateContentAdmissions}=await import('./chart-content.mjs');
const clone=structuredClone;
function frozenPureVisual(p,copy){
 const directions=copy.directions.map((d,i)=>({directionId:d.id,approvedCopy:clone(d),explanation:'Pure visual fixture explanation.',presentationIntent:'Pure visual fixture intent.',claims:[],limitations:['Pure visual fixture. No executed final visual review.'],targets:[{imageId:`pure-image-${i}`,targetId:`pure-target-${i}`,sha256:hash(`pure-image-${i}`),mediaType:'image/png',byteLength:100,width:10,height:10}],preservedFindings:[]}));
 const payload={directions,sourceImages:[]},run={id:'pure-visual',source:{neutralReferences:{referenceBoundaries:[],referenceQualifications:[]}},reports:[{id:'pure-aggregate',nodeKey:'aggregate',phase:'aggregate',raw:{understanding:'Explicit frozen pure downstream fixture.',payload}}]};
 const project=clone(p);project.activeByStage.visual='pure-visual-artifact';project.artifacts.push({id:'pure-visual-artifact',stage:'visual',contentHash:hash(payload)});project.releases.push({artifactId:'pure-visual-artifact',policyVersion:project.policies.at(-1).version});project.jobs.push({id:'pure-visual-owner',finalVisualRunId:run.id,nodeKey:'aggregate',attempts:[]});
 pureVisual=Object.freeze({payload,run});return project;
}
function manuscript(source){
 const obligations=source.obligations.filter(o=>o.kind!=='qualification');
 const narrativeBlocks=obligations.filter(o=>o.kind!=='image').map((o,i)=>({id:`block-${i}`,kind:'source',text:obligationText(o),originIds:[o.originId]}));
 const page={id:'page-1',central:{kind:'text',exactText:narrativeBlocks[0].text.slice(0,100)},heroImageId:null,blockIds:narrativeBlocks.map(b=>b.id),imageIds:source.images.map(i=>i.imageId),allowedSplitAfterBlockIds:[]};
 return {schemaVersion:contract.manuscript,title:'Bounded content contract fixture',narrativeBlocks,directions:source.visual.payload.directions.map(d=>({directionId:d.directionId,rendererDirectionId:source.directionMap.find(x=>x.sourceDirectionId===d.directionId).rendererDirectionId,approvedCopy:d.approvedCopy,explanation:d.explanation,presentationIntent:d.presentationIntent,claims:d.claims,limitations:d.limitations,targets:d.targets})),claims:clone(source.claims),sources:clone(source.sources),visibleObligations:obligations.map(o=>({originId:o.originId,value:clone(o.value),blockIds:narrativeBlocks.filter(b=>b.originIds.includes(o.originId)).map(b=>b.id),imageIds:o.kind==='image'?[o.value.imageId]:[],pageIntentIds:['page-1']})),pageIntents:[page],edits:[],clausePlacements:[],chartPlacements:source.chartContent.charts.map((c,i)=>({occurrenceId:`chart-occurrence-${i}`,artifactId:c.artifactId,chartId:c.chartId,dataHash:c.dataHash,admissionHash:c.admissionHash,pageIntentId:page.id,visibleBlockRefs:c.requirements.map(r=>({originId:r.originId,blockId:narrativeBlocks.find(b=>b.originIds.includes(r.originId)).id,start:0,end:r.text.length}))}))};
}
const rehash=value=>{delete value.sourceHash;value.sourceHash=hash(value);return value;};
test('Unit2A public source, manuscript and exact locations on actual numeric upstream with an explicit pure visual fixture',{timeout:240000},async t=>{
 const saved=process.env.NUMERIC_CONTENT_EXECUTED_SNAPSHOT?JSON.parse(gunzipSync(await readFile(process.env.NUMERIC_CONTENT_EXECUTED_SNAPSHOT))):null;
 const f=saved?{...saved,calls:Array.from({length:saved.callCount}),root:saved.originalRoot,close:async()=>{}}:await actualNumericContentUpstream();t.after(f.close);console.log(saved?'Replaying preserved executed upstream snapshot. No new calls.':'Actual upstream and original readers complete.');
 const p=frozenPureVisual(f.p,f.ce.source.content),basis=contentSourceEnvelope(p,f.contents,{contract}),source=makeProjectedContentSource(p,basis),m=manuscript(source);
 const root={id:contentRootId(source.sourceHash,contract.packet),purpose:'complete_content_plan',attempts:[],task:{packetVersion:contract.packet,source,sourceContents:f.contents}};p.jobs.push(root);console.log('Public source and visibility projection complete.');
 await t.test('actual calls and full numerical/source/authority identities reach both full source and neutral model packet',()=>{
  assert.ok(f.calls.length>13);assert.equal(f.p.jobs.filter(j=>j.purpose?.startsWith('complete_content')).length,0);
  assert.deepEqual(basis.researchChartAdmissions,[f.admission]);assert.deepEqual(source.immutableBasis,basis);assert.equal(source.schemaVersion,contract.source);assert.deepEqual(source.contentContract,contract);
  const neutral=neutralContent(source);assert.deepEqual(neutral.researchChartAdmissions,[f.admission]);assert.deepEqual(neutral.chartContent,source.chartContent);assert.equal(neutral.chartDelivery,undefined);assert.deepEqual(neutral.chartDeliveryHashes,{strategy:f.se.envelopeHash,copy:f.ce.envelopeHash});assert.deepEqual(neutral.chartCreativeRestrictions,source.chartCreativeRestrictions);assert.equal(neutral.processArchive,undefined);
  const requirements=source.chartContent.charts[0].requirements;
  for(const word of ['unit','period','population','source','limitation'])assert.ok(requirements.some(r=>r.kind===word));
  for(const path of ['/authority/readiness/','/authority/handoffs/','/authority/declarations/'])assert.ok(requirements.some(r=>r.source.pointer.startsWith(path)));
  assert.ok(requirements.some(r=>r.source.kind==='content_source'&&r.source.pointer.startsWith('/chartDelivery/copy/upstreamOwnerReports/')));
  const copyOwner=requirements.filter(r=>r.source.pointer.startsWith('/chartDelivery/copy/upstreamOwnerReports/1/rawReport/limitations/'));assert.ok(copyOwner.length);assert.ok(copyOwner.every(r=>r.owner==='copy-lead'&&r.source.containerId===f.ce.upstreamOwnerReports[1].id));
  assert.equal(requireContentCurrent(p,root,contentSourceEnvelope),root);
  assert.deepEqual(validateManuscript(m,source),m);
 });
 await t.test('immutable source mutations, raw chart tampering, mixed tuple and legacy downgrade are rejected',()=>{
  for(const alter of [s=>s.researchChartAdmissions[0].raw.charts[0].series[0].values[0].decimal='9',s=>s.researchChartAdmissions[0].sourceBinding.mapping[0].original.text+='tamper',s=>s.researchChartAdmissions[0].sourceBinding.mapping[0].chartSourceId='forged',s=>s.researchChartAdmissions[0].admissionHash='0'.repeat(64),s=>s.researchChartAdmissions[0].quantitativeManifestHash='0'.repeat(64),s=>s.researchChartAdmissions[0].approved=true,s=>s.chartContent.charts[0].dataHash='0'.repeat(64),s=>s.chartCreativeRestrictions.pop(),s=>s.chartDelivery.copy.upstreamOwnerReports[0].rawReport.limitations.pop(),s=>s.immutableBasis.obligations.pop(),s=>s.visibility.fieldCoverage.pop(),s=>s.schemaVersion='content-source-v2']){
   const changed=clone(source);alter(changed);rehash(changed);assert.throws(()=>neutralContent(changed));assert.throws(()=>validateManuscript(m,changed));
  }
  for(const field of Object.keys(contract)){
   const changed={...contract,[field]:'wrong-version'};assert.throws(()=>requireContentContract(changed),{code:'CONTENT_CONTRACT_INVALID'});assert.throws(()=>contentSourceEnvelope(p,f.contents,{contract:changed}),{code:'CONTENT_CONTRACT_INVALID'});
  }
  assert.throws(()=>contentSourceEnvelope(p,f.contents),{code:'NUMERIC_CONTENT_CONTRACT_REQUIRED'});
  assert.throws(()=>makeContentSource(p,f.contents,f.se,f.ce,()=>{}),{code:'NUMERIC_CONTENT_CONTRACT_REQUIRED'});
  assert.throws(()=>validateLegacyManuscript(m,source),{code:'NUMERIC_CONTENT_CONTRACT_REQUIRED'});
  for(const field of ['contentContract','schemaVersion']){const changed=clone(source);delete changed[field];assert.throws(()=>validateManuscript(m,changed));}
  const stale=clone(p);stale.verifications[0].rawReport.quantitativeResults[0].outcome='unsupported';assert.throws(()=>requireContentCurrent(stale,root,contentSourceEnvelope));
  const raw=clone(f.admission);raw.raw.charts[0].series[0].values[0].decimal='9';const {admissionHash,...unsigned}=raw;raw.admissionHash=evidenceStateHash(unsigned);assert.throws(()=>validateContentAdmissions([raw]));
 });
 await t.test('every chart occurrence has exact local readable metadata and cannot carry editable arrays or approval flags',()=>{
  const attempts=[
   ['chart drop',x=>x.chartPlacements=[]],['null occurrence',x=>x.chartPlacements[0]=null],['metadata split',x=>x.pageIntents[0].allowedSplitAfterBlockIds=[x.chartPlacements[0].visibleBlockRefs[0].blockId]],['duplicate metadata',x=>x.chartPlacements[0].visibleBlockRefs[1]=clone(x.chartPlacements[0].visibleBlockRefs[0])],['raw arrays',x=>x.chartPlacements[0].values=[9]],['approved flag',x=>x.chartPlacements[0].approved=true],['duplicate occurrence',x=>x.chartPlacements.push(clone(x.chartPlacements[0]))],['wrong admission',x=>x.chartPlacements[0].admissionHash='0'.repeat(64)],['missing metadata',x=>x.chartPlacements[0].visibleBlockRefs.pop()],['wrong source origin',x=>x.chartPlacements[0].visibleBlockRefs[0].originId='invented'],['wrong UTF16',x=>x.chartPlacements[0].visibleBlockRefs[0].end--],['wrong page',x=>x.chartPlacements[0].pageIntentId='absent'],['hidden metadata',x=>x.narrativeBlocks.find(b=>b.id===x.chartPlacements[0].visibleBlockRefs[0].blockId).kind='notes'],['JSON dump',x=>x.narrativeBlocks.find(b=>b.id===x.chartPlacements[0].visibleBlockRefs[0].blockId).text=JSON.stringify(f.admission.raw)],['creative restriction missing',x=>{const id=source.chartContent.charts[0].requirements.find(r=>r.source.kind==='content_source').originId;x.chartPlacements[0].visibleBlockRefs=x.chartPlacements[0].visibleBlockRefs.filter(r=>r.originId!==id);}],
  ];
  for(const [label,alter] of attempts){const changed=clone(m);alter(changed);assert.throws(()=>validateManuscript(changed,source),undefined,label);}
  const duplicate=clone(m),first=duplicate.chartPlacements[0],second={...clone(first),occurrenceId:'second',pageIntentId:'page-2'};
  const blocks=first.visibleBlockRefs.map(ref=>{const b=clone(duplicate.narrativeBlocks.find(b=>b.id===ref.blockId));b.id+='-second';return b;});
  duplicate.narrativeBlocks.push(...blocks);second.visibleBlockRefs.forEach(ref=>ref.blockId+='-second');duplicate.chartPlacements.push(second);duplicate.pageIntents.push({id:'page-2',central:{kind:'text',exactText:blocks[0].text},heroImageId:null,blockIds:blocks.map(b=>b.id),imageIds:[],allowedSplitAfterBlockIds:[]});
  assert.deepEqual(validateManuscript(duplicate,source),duplicate);
  const wrongPage=clone(duplicate);wrongPage.chartPlacements[1].visibleBlockRefs[0].blockId=first.visibleBlockRefs[0].blockId;
  assert.throws(()=>validateManuscript(wrongPage,source),e=>e.code==='CONTENT_CHART_METADATA_PAGE'&&e.details.originId&&e.details.sourceOwner==='research-lead');
 });
 await t.test('original v2 claim, labels, images, narrative order, typed fields and sourceReturns remain enforced',()=>{
  for(const alter of [x=>x.claims.push({text:'invented'}),x=>x.sources[0].url='https://changed.invalid',x=>x.directions[0].approvedCopy.slogan='changed',x=>x.visibleObligations.pop(),x=>x.pageIntents[0].imageIds=[],x=>x.pageIntents[0].central={kind:'notes',exactText:'hidden'},x=>x.pageIntents[0].blockIds.reverse(),x=>x.edits.push({originId:source.obligations[0].originId,before:source.obligations[0].value,after:'a rewrite',reason:'invented'})]){const changed=clone(m);alter(changed);assert.throws(()=>validateManuscript(changed,source));}
  const changed=clone(source);changed.visibility.sourceReturns.push({owner:'reference-lead',pointer:'/issues/0'});const {projectionHash,...data}=changed.visibility;changed.visibility.projectionHash=hash(data);rehash(changed);assert.throws(()=>validateManuscript(m,changed),{code:'VISIBILITY_SOURCE_RETURN_REQUIRED'});
 });
 await t.test('server locations reconstruct exact immutable text, owner and source mapping and reject tampering',async()=>{
  const rows=contentSourceLocations(root);console.log(`Checking ${rows.length} server location rows.`);assert.ok(rows.length>source.chartContent.charts[0].requirements.length);
  const spans=rows.flatMap(r=>r.originals).filter(l=>l.kind==='source_span');assert.ok(spans.length>=10);
  assert.deepEqual(contentSourceLocations(root),rows);
  const representative=new Map(rows.flatMap(r=>[r.derived,...r.originals]).map(l=>[l.kind,l]));
  for(const prefix of ['/authority/verifications/','/authority/readiness/','/authority/handoffs/','/authority/declarations/','/chartDelivery/copy/upstreamOwnerReports/']){
   const location=rows.flatMap(r=>r.originals).find(l=>l.pointer?.startsWith(prefix));if(location)representative.set(prefix,location);
  }
  for(const location of representative.values()){
   const resolved=resolveContentSourceLocation(p,location,contentSourceEnvelope);assert.equal(hash(resolved.value),location.valueHash);assert.deepEqual(resolved.location,location);
  }
  const first=spans[0];for(const field of ['start','end','sourceId','chartSourceId','sourceHash','sourceRecordHash','admissionHash','rootJobId','valueHash','version']){const changed={...first,[field]:typeof first[field]==='number'?first[field]+1:'forged'};assert.throws(()=>resolveContentSourceLocation(p,changed,contentSourceEnvelope),undefined,field);}
  const badRoot=clone(root);badRoot.task.source.chartContent.charts[0].requirements[0].text='changed';assert.throws(()=>contentSourceLocations(badRoot));
 });
 await t.test('duplicate chart IDs and raw-null admissions retain exact pure downstream manuscript semantics',()=>{
  const pureSource=admissions=>{
   const next=clone(basis);next.researchChartAdmissions=admissions;
   for(const side of ['strategy','copy']){const envelope=next.chartDelivery[side];envelope.researchChartAdmissions=clone(admissions);delete envelope.envelopeHash;envelope.envelopeHash=ownerHash(envelope);}
   next.chartContent=deriveChartContent(admissions,next.chartCreativeRestrictions);next.obligations=[...next.obligations.filter(o=>o.kind!=='chart_metadata'),...contentChartObligations(next.chartContent)];rehash(next);return makeProjectedContentSource(p,next);
  };
  const second=clone(f.admission);second.artifactId+='-separate-pure-identity';const {admissionHash,...data}=second;second.admissionHash=evidenceStateHash(data);
  const duplicated=pureSource([f.admission,second]),dm=manuscript(duplicated);
  assert.equal(duplicated.chartContent.charts[0].chartId,duplicated.chartContent.charts[1].chartId);assert.notEqual(duplicated.chartContent.charts[0].artifactId,duplicated.chartContent.charts[1].artifactId);
  assert.deepEqual(validateManuscript(dm,duplicated),dm);
  dm.chartPlacements.pop();assert.throws(()=>validateManuscript(dm,duplicated),{code:'CONTENT_CHART_MISSING'});
  const empty={...clone(f.admission),raw:null,charts:[],quantitativeClaims:[],catalogDigest:null,sourcesDigest:null,quantitativeManifestHash:null};delete empty.admissionHash;empty.admissionHash=evidenceStateHash(empty);
  const noChart=pureSource([empty]);assert.deepEqual(noChart.chartContent.charts,[]);assert.deepEqual(validateManuscript(manuscript(noChart),noChart),manuscript(noChart));assert.equal(neutralContent(noChart).researchChartAdmissions[0].raw,null);
  const noTuple=clone(noChart);noTuple.schemaVersion='content-source-v2';assert.throws(()=>validateManuscript(manuscript(noChart),noTuple),{code:'CONTENT_CONTRACT_INVALID'});
 });
 await t.test('v4 known-kind projection preserves full original objects while actual three-style plans contain readable citations and no source-record dump',async()=>{
  const {numericManuscript}=await import('./content-numeric-runtime-fixture.mjs');
  const {normalizeManuscript}=await import('../auto-layout/semantic-input.mjs'),{planDeck}=await import('../auto-layout/layout.mjs');
  const manuscript=numericManuscript(source);validateManuscript(manuscript,source);assert.deepEqual(manuscript.sources,source.sources);assert.deepEqual(source.immutableBasis.sources,source.sources);
  for(const entry of source.proseProjection.entries){const original=source.immutableBasis.obligations[entry.originalObligationIndex];assert.equal(entry.originalValueHash,hash(original.value));assert.deepEqual(source.obligations.find(o=>o.originId===entry.originId).value,original.value);}
  const assets=Object.fromEntries(source.images.map(i=>[i.imageId,{...i,role:'art'}])),ledger={schemaVersion:contract.semantic,source,manuscript,contentBinding:{artifactId:'standalone-projection-probe',rootJobId:root.id,sourceHash:source.sourceHash,manuscriptHash:hash(manuscript)},sourceLocationVersion:contract.location,sourceLocations:contentSourceLocations(root)},input={semantic:normalizeManuscript(ledger,assets),assets,brand:{name:'Projection component fixture',font:{family:'Arial',files:['/System/Library/Fonts/Supplemental/Arial.ttf']},colors:{paper:'#ffffff',ink:'#111111',primary:'#112233',muted:'#444444',accent:'#bb9900'},minBodySize:22},cases:{},audience:{findings:[]}};
  for(const style of ['editorial','stage','evidence']){const plan=planDeck(input,style),body=plan.slides.flatMap(s=>s.elements.filter(e=>e.type==='text').map(e=>e.sourceText)).join('\n');for(const machine of ['scopeRelation background','verification captured','id s1','originKey','envelopeHash','admissionHash'])assert.ok(!body.includes(machine),machine);assert.ok(body.includes('https://example.test/blue'));assert.ok(body.includes('does not authenticate'));assert.equal(plan.slides.flatMap(s=>s.elements.filter(e=>e.type==='chart')).length,source.chartContent.charts.length);console.log(`Projection preflight ${style}: ${plan.slides.length} measured slides, exact chart metadata retained.`);}
  const changed=clone(manuscript),entry=source.proseProjection.entries.find(e=>e.kind==='source');changed.narrativeBlocks.find(b=>b.originIds.includes(entry.originId)).text+='\nid s1';assert.throws(()=>validateManuscript(changed,source),{code:'CONTENT_PROSE_BODY_CHANGED'});
  const location=contentSourceLocations(root).find(l=>l.originId===entry.originId);assert.equal(location.derived.kind,'prose_requirement');assert.deepEqual(resolveContentSourceLocation(p,location.originals[1],contentSourceEnvelope).value,source.sources[0]);
 });
 await t.test('runtime v4 emits only the exact numeric tuple and incomplete configuration remains unusable',async()=>{
  const request=contentRequest(p,root,{key:'producer:strategy',phase:'producer',role:'strategy',dependencies:[]});assert.equal(request.input.packetVersion,contract.packet);assert.equal(request.input.sourceLocations[0].derived.version,contract.location);
  const {createCompleteContentRuntime}=await import('./complete-content-runtime.mjs');
  const capability=createCompleteContentRuntime({store:{},root:f.root,providers:{},bindings:{},configuration:{packetVersion:contract.packet}}).capability();assert.equal(capability.configured,false);assert.equal(capability.executionIntegrated,true);
 });
 console.log(JSON.stringify({milestone:'Unit2A only',syntheticUpstreamCalls:f.calls.length,charts:source.chartContent.charts.length,requirements:source.chartContent.charts.reduce((n,c)=>n+c.requirements.length,0),locationRows:contentSourceLocations(root).length,actualVisual:false,runtimeV4:true}));
});
