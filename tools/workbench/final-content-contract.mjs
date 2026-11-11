import path from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {contentContractForPacket,numericContract} from './content-contract-versions.mjs';
import {contentSourceLocations,validateManuscript} from './complete-content.mjs';
import {sketchHash as hash} from './sketch-authority.mjs';
import {quantitativeAssertionManifest} from './research-chart-data.mjs';
import {digest as chartDigest} from '../auto-layout/native-charts/chart-data.mjs';
import {normalizeManuscript} from '../auto-layout/semantic-input.mjs';
import {layoutJobInput} from './layout-boundary.mjs';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
export function finalContentTuple(contract,source) {
 const tuple=contentContractForPacket(contract?.packetVersion,source);
 need(tuple&&source?.schemaVersion===tuple.source&&contract?.manuscript?.schemaVersion===tuple.manuscript&&contract.sourceLocationVersion===tuple.location,'FINAL_CONTENT_TUPLE_INVALID');
 return tuple;
}
export function finalNumericContentBasis(contract,source,ledgerText,contentHash) {
 const tuple=finalContentTuple(contract,source);
 if(!numericContract(tuple))return null;
 const ledger=JSON.parse(ledgerText),m=contract.manuscript,{sourceHash,...body}=source;
 need(exact(ledger,['schemaVersion','source','manuscript','contentBinding','sourceLocationVersion','sourceLocations']),'FINAL_NUMERIC_LEDGER_SHAPE_CHANGED');
 need(hash(body)===sourceHash&&contract.sourceHash===sourceHash&&contract.projectionHash===source.visibility.projectionHash&&contract.manuscriptHash===hash(m),'FINAL_NUMERIC_CONTENT_CHANGED');
 validateManuscript(m,source);
 const rows=contentSourceLocations({id:contract.rootJobId,task:{packetVersion:tuple.packet,source}});
 need(equal(contract.sourceLocations,rows)&&ledger.sourceLocationVersion===tuple.location&&equal(ledger.sourceLocations,rows),'FINAL_NUMERIC_LOCATIONS_CHANGED');
 need(ledger.schemaVersion===tuple.semantic&&equal(ledger.source,source)&&equal(ledger.manuscript,m),'FINAL_NUMERIC_LEDGER_CHANGED');
 const binding={artifactId:contract.artifactId,rootJobId:contract.rootJobId,sourceEnvelopeId:`content-source-envelope:${contract.rootJobId}`,sourceHash,manuscriptHash:contract.manuscriptHash,projectionHash:contract.projectionHash};
 need(equal(ledger.contentBinding,binding),'FINAL_NUMERIC_LEDGER_BINDING_CHANGED');
 const assertions=source.researchChartAdmissions.map(a=>({artifactId:a.artifactId,admissionHash:a.admissionHash,manifest:a.raw===null?null:quantitativeAssertionManifest({chartData:a.raw,quantitativeClaims:a.quantitativeClaims},a.basis)}));
 return {schemaVersion:'final-numeric-content-basis-v1',tuple:{...tuple},contentHash,sourceHash,manuscriptHash:contract.manuscriptHash,ledgerHash:hash(ledgerText),sourceLocationsHash:hash(rows),quantitativeAssertionsHash:hash(assertions),chartPlacementsHash:hash(m.chartPlacements)};
}
export function finalRegisteredContentBasis(project,layoutRoot,content,sourceRoot) {
 const b=layoutRoot.task.binding,source=sourceRoot.task.source;
 const tuple=contentContractForPacket(sourceRoot.task.packetVersion,source);
 need(tuple,'FINAL_CONTENT_TUPLE_INVALID');
 if(!numericContract(tuple))return null;
 const author=project.jobs.filter(j=>j.contentRootJobId===sourceRoot.id&&j.nodeKey==='author');
 need(author.length===1&&author[0].contentReport?.valid&&author[0].contentReport.raw.decision==='accept','FINAL_NUMERIC_AUTHOR_REQUIRED');
 const m=author[0].contentReport.raw.manuscript,c={artifactId:content.id,rootJobId:sourceRoot.id,packetVersion:tuple.packet,sourceHash:source.sourceHash,projectionHash:source.visibility.projectionHash,manuscriptHash:content.completeContent.manuscriptHash,manuscript:m,sourceLocationVersion:tuple.location,sourceLocations:contentSourceLocations(sourceRoot)};
 const input=layoutJobInput(project,layoutRoot),text=input.manuscriptText;
 need(typeof text==='string'&&hash(text)===content.contentHash&&equal(JSON.parse(text),m)&&content.completeContent.packetVersion===tuple.packet&&content.completeContent.manuscriptVersion===tuple.manuscript,'FINAL_NUMERIC_AUTHOR_CHANGED');
 need(project.releases.some(r=>r.artifactId===content.id&&r.contentHash===content.contentHash&&r.sourceHash===source.sourceHash&&r.policyVersion===b.policy.version),'FINAL_CONTENT_RELEASE_REQUIRED');
 const basis=finalNumericContentBasis(c,source,input.ledgerText,content.contentHash);
 need(b.ledgerHash===basis.ledgerHash&&b.sourceHash===basis.sourceHash&&b.manuscriptHash===basis.manuscriptHash&&b.contentHash===basis.contentHash&&b.sourceLocationVersion===tuple.location,'FINAL_NUMERIC_BINDING_CHANGED');
 return basis;
}
export function finalNumericLocationValue(source,location) {
 const pointer=(value,p)=>p.split('/').slice(1).reduce((v,k)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],value);
 if(['prose_requirement','chart_requirement','effective_source_clause','content_source_value'].includes(location.kind))return pointer(source,location.pointer);
 const admission=source.researchChartAdmissions.find(a=>a.artifactId===location.artifactId);
 if(location.kind==='admission_value')return pointer(admission,location.pointer);
 if(location.kind==='source_span')return admission?.sourceBinding.mapping.find(r=>r.sourceId===location.sourceId)?.original.text.slice(location.start,location.end);
 if(location.kind==='contract_value')return source.chartContent.charts.flatMap(c=>c.requirements).find(r=>r.originId===location.originId)?.text;
 return undefined;
}
export function requireFinalNumericEdition(edition,ledgerText,bindingIdentity,{receipts=[],assets={}}={}) {
 const ledger=JSON.parse(ledgerText),lm=edition.layoutManifest.raw,proof=edition.numericProof;
 need(proof&&exact(proof,['ledger','coverage','nativeVerification','chartEvidence']),'FINAL_NUMERIC_NATIVE_PROOF_REQUIRED');
 const anchor=edition.anchor.raw,anchorText=edition.anchor.contentText;
 need(typeof anchorText==='string'&&hash(anchorText)===edition.anchor.sha256&&Buffer.byteLength(anchorText)===edition.anchor.bytes&&equal(JSON.parse(anchorText),anchor),'FINAL_NUMERIC_NATIVE_ANCHOR_CHANGED');
 const matchingReceipts=receipts.filter(r=>r.attemptId===edition.originalAttemptId);
 need(matchingReceipts.length===1&&matchingReceipts[0].anchorHash===edition.anchor.sha256&&matchingReceipts[0].anchorPath===edition.anchor.originalPath&&matchingReceipts[0].bindingHash===bindingIdentity&&matchingReceipts[0].style===edition.style,'FINAL_NUMERIC_NATIVE_RECEIPT_CHANGED');
 need(anchor.protocol==='project-native-proof-v2'&&anchor.bindingHash===bindingIdentity&&anchor.attemptId===edition.originalAttemptId&&anchor.style===edition.style,'FINAL_NUMERIC_NATIVE_BINDING_CHANGED');
 const record=(host,file)=>{
  const descriptors=anchor.files?.filter(f=>f.path===file)??[],descriptor=descriptors[0];
  need(exact(host,['originalPath','sha256','bytes','raw','contentText'])&&descriptors.length===1,'FINAL_NUMERIC_NATIVE_PROOF_SHAPE_CHANGED');
  need(typeof host?.contentText==='string'&&hash(host.contentText)===host.sha256&&Buffer.byteLength(host.contentText)===host.bytes&&equal(JSON.parse(host.contentText),host.raw)&&descriptor?.sha256===host.sha256&&descriptor.bytes===host.bytes&&host.originalPath===path.resolve(path.dirname(edition.anchor.originalPath),file),'FINAL_NUMERIC_NATIVE_ORIGINAL_CHANGED');
  return host.raw;
 };
 record(proof.ledger,'ledger.json');need(proof.ledger.contentText===ledgerText,'FINAL_NUMERIC_NATIVE_LEDGER_CHANGED');
 const coverage=record(proof.coverage,'output/build/object-coverage.json'),font=record(proof.nativeVerification,'native/verification.json'),chartEvidence=record(proof.chartEvidence,'output/build/native-chart-proof.json');
 need(equal(lm.semanticContent,normalizeManuscript(ledger,Object.fromEntries(Object.entries(lm.imageResources).map(([id,image])=>[id,{...assets[id],...image}]))))&&equal(lm.contentBinding,ledger.contentBinding)&&lm.inputHashes?.ledger===hash(ledgerText),'FINAL_NUMERIC_NATIVE_GRAPH_CHANGED');
 const program=chartEvidence.program;
 need(exact(chartEvidence,['program','manifest','proof'])&&exact(program,['schema','textPolicy','sourceHash','manuscriptHash','style','slideCount','slideSize','occurrences'])&&program.schema==='native-chart-occurrence-program-v2'&&['chart-metadata-lf-v1','chart-metadata-lf-v2'].includes(program.textPolicy)&&program.sourceHash===ledger.source.sourceHash&&program.manuscriptHash===ledger.contentBinding.manuscriptHash&&program.style===edition.style&&program.slideCount===lm.slides.length&&equal(program.slideSize,{width:lm.width,height:lm.height})&&Array.isArray(program.occurrences),'FINAL_NUMERIC_CHART_PROGRAM_CHANGED');
 need(exact(chartEvidence.manifest,['schema','programHash','emitted'])&&chartEvidence.manifest.schema==='native-chart-occurrence-manifest-v2'&&chartEvidence.manifest.programHash===chartDigest(program)&&chartEvidence.proof?.schema==='native-chart-occurrence-package-proof-v2'&&chartEvidence.proof.status==='passed'&&chartEvidence.proof.programHash===chartDigest(program)&&chartEvidence.proof.packageHash===edition.deliveryDeck.sha256,'FINAL_NUMERIC_CHART_PROGRAM_CHANGED');
 need(proof.chartEvidence.sha256===coverage.chartProofSha256&&chartDigest(program)===coverage.chartProgramHash&&/^[a-f0-9]{64}$/.test(coverage.chartProgramHash)&&font.expectation?.chartProgramHash===coverage.chartProgramHash&&equal(font.expectation.contentContract,ledger.source.contentContract),'FINAL_NUMERIC_CHART_PROGRAM_CHANGED');
 need(coverage.schemaVersion==='native-object-coverage-v3'&&font.schemaVersion==='native-font-verification.v4'&&coverage.semanticCoverageVersion==='native-object-coverage-v2'&&font.semanticFontVersion==='native-font-verification.v3'&&coverage.deckSha256===edition.deliveryDeck.sha256&&font.checkedDeckSha256===edition.deliveryDeck.sha256,'FINAL_NUMERIC_NATIVE_VERSION_CHANGED');
 const charts=lm.slides.flatMap(s=>s.elements.filter(e=>e.type==='chart').map(e=>({slide:s,element:e})));
 need(charts.length===ledger.manuscript.chartPlacements.length&&program.occurrences.length===charts.length,'FINAL_NUMERIC_CHART_PLACEMENT_CHANGED');
 for(const p of ledger.manuscript.chartPlacements){
  const expected=Object.fromEntries(['occurrenceId','artifactId','chartId','dataHash','admissionHash','pageIntentId'].map(k=>[k,p[k]]));
  const matches=charts.filter(({element})=>equal(element.chartRef,expected));
  need(matches.length===1&&matches[0].slide.originId===p.pageIntentId,'FINAL_NUMERIC_CHART_PLACEMENT_CHANGED');
  const {slide,element}=matches[0],occurrences=program.occurrences.filter(o=>o.authoredOccurrenceId===p.occurrenceId);
  const identity=Object.fromEntries(['artifactId','chartId','dataHash','admissionHash'].map(k=>[k,p[k]])),admission=ledger.source.researchChartAdmissions.find(a=>a.artifactId===p.artifactId&&a.admissionHash===p.admissionHash);
  need(occurrences.length===1&&equal(occurrences[0].identity,identity)&&occurrences[0].pageIntentId===p.pageIntentId&&occurrences[0].elementId===element.id&&occurrences[0].elementOccurrenceId===element.occurrenceId&&equal(occurrences[0].expectedChart,admission?.charts.find(c=>c.chartId===p.chartId&&c.dataHash===p.dataHash))&&occurrences[0].catalogDigest===admission?.catalogDigest&&occurrences[0].sourcesDigest===admission?.sourcesDigest&&equal(occurrences[0].placement,{slideNumber:lm.slides.indexOf(slide)+1,name:element.id,left:element.x,top:element.y,width:element.w,height:element.h}),'FINAL_NUMERIC_CHART_PROGRAM_CHANGED');
  const metadata=matches[0].slide.elements.filter(e=>e.contentRefs?.chartOccurrenceId===p.occurrenceId);
  need(equal(occurrences[0].metadata.map(r=>({elementId:r.elementId,elementOccurrenceId:r.elementOccurrenceId,text:r.text,sourceText:r.sourceText,wrapBreaks:r.wrapBreaks,contentRefs:r.contentRefs,geometry:r.geometry})),metadata.map(e=>({elementId:e.id,elementOccurrenceId:e.occurrenceId,text:e.text,sourceText:e.sourceText,wrapBreaks:e.wrapBreaks,contentRefs:e.contentRefs,geometry:{left:e.x,top:e.y,width:e.w,height:e.h}}))),'FINAL_NUMERIC_CHART_PROGRAM_CHANGED');
  for(const e of metadata){
   const refs=e.contentRefs.chartMetadata,block=ledger.manuscript.narrativeBlocks.find(b=>b.id===refs?.[0]?.blockId);
   need(block&&e.type==='text'&&e.sourceText===block.text&&refs.every(r=>r.blockId===block.id),'FINAL_NUMERIC_CHART_METADATA_CHANGED');
  }
  const refs=metadata.flatMap(e=>e.contentRefs.chartMetadata);
  need(refs.length===p.visibleBlockRefs.length&&p.visibleBlockRefs.every(r=>refs.filter(v=>equal(v,r)).length===1),'FINAL_NUMERIC_CHART_METADATA_CHANGED');
 }
}
