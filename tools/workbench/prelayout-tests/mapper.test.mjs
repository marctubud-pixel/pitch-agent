import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {mapNativeSources,literalIndex,deriveDeckProjection} from '../../../apps/workbench-preview/src/proposal/generic-deck/mapper.mjs';import {componentFixture} from './mapper-fixture.mjs';
import {inspectProposalDeckInput} from '../../../apps/workbench-preview/src/proposal/generic-deck/input.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('actual sealed185 retains all four original bodies, meaningful SIMPLE/copy leaves and byte spans; missing B refuses',async()=>{
 const d=JSON.parse(await readFile(new URL('./source-prefix.json',import.meta.url))),before=JSON.stringify(d),r=await mapNativeSources(d);
 assert.equal(r.kind,'missing_B');assert.equal(r.authority,'none');assert.equal(r.input,null);assert.equal(r.blockers[0].code,'MAPPER_B_FINAL_REQUIRED');assert.deepEqual(r.projection.strategy.map(b=>b.paragraphs.length),[2,1,1]);assert.deepEqual(r.projection.directions.map(d=>d.blocks.reduce((n,b)=>n+b.paragraphs.length,0)),[5,5,5]);
 const originals={brief:JSON.parse(d.verifiedPrefix.sources.task.originalText).brief,research:d.verifiedPrefix.sources.research.originalText,strategy:d.verifiedPrefix.sources.simple.originalText,copy:d.verifiedPrefix.sources.copy.originalText};
 for(const row of r.coverage){const bytes=Buffer.from(originals[row.stage]);assert.equal(sha(bytes),row.sourceSha256);assert.equal(bytes.subarray(row.byteSpan.start,row.byteSpan.end).toString(),row.byteSpan.token);assert.equal(JSON.parse(row.byteSpan.token),row.value);}
 assert.equal(JSON.stringify(d),before);
 const copy=JSON.parse(originals.copy);for(const [n,c] of copy.directions.entries())for(const key of ['title','slogan','supportingCopy','creativeExplanation','rationale','differentiation'])assert(r.projection.directions[n].blocks.some(b=>[...b.titleOrigins,...b.paragraphs.flatMap(p=>p.origins)].some(q=>q.pointer===`/directions/${n}/${key}`)));
 assert.equal(Object.hasOwn(r.projection,'charts'),false);assert.equal(r.projection.strategy[1].paragraphs.length,1);assert(r.coverage.filter(c=>c.stage==='strategy'&&(c.pointer.includes('/refs/'))).every(c=>!c.visible));
});
for(const type of ['packaging','kv'])test(`${type}: native target/view mapping needs no fake mockup; pure DTO never claims authority`,async()=>{
 const {mapped,diagnostic}=await componentFixture(type);assert.equal(mapped.authority,'none');assert.equal(mapped.input.images.length,3);assert.equal(mapped.input.relation.kind,'not_supplied');assert(mapped.input.images.every(i=>i.kind===type&&!Object.hasOwn(i,'role')));
 const inspected=await inspectProposalDeckInput(mapped.input,mapped.input.researchMethod);assert.equal(inspected.kind,'descriptors_checked');assert.equal(inspected.admission,'requires-native-source-receiver');
 assert.equal(mapped.input.sources.visual.original.originalText,diagnostic.sources.visual.originalText);for(const i of mapped.input.images){const target=diagnostic.targets.find(t=>t.targetId===i.targetId);assert.deepEqual(i.requiredViews,target.requiredViews);}
});
test('wrong original SHA, missing source, changed copy and missing view reject rather than filling from another case',async()=>{
 const {diagnostic}=await componentFixture();
 for(const slot of ['task','research','simple','copy','visual']){const d=structuredClone(diagnostic);d.sources[slot].originalText+=' ';await assert.rejects(mapNativeSources(d),{code:'MAPPER_SOURCE_BYTES_CHANGED'});}
 const missing=structuredClone(diagnostic);delete missing.sources.simple;await assert.rejects(mapNativeSources(missing),{code:'MAPPER_SOURCE_REQUIRED'});
 const d=structuredClone(diagnostic),v=JSON.parse(d.sources.visual.originalText);v.directions[0].approvedCopy.slogan+=' changed';d.sources.visual.originalText=JSON.stringify(v);d.sources.visual.sha256=sha(d.sources.visual.originalText);d.sources.visual.bytes=Buffer.byteLength(d.sources.visual.originalText);await assert.rejects(mapNativeSources(d),{code:'MAPPER_COPY_CHANGED'});
 const f=await componentFixture();f.mapped.input.images[0].requiredViews=['front'];assert.equal((await inspectProposalDeckInput(f.mapped.input,f.method)).kind,'incomplete');
});
test('JSON escape/surrogate/newline token spans bind to actual UTF8 original bytes',()=>{
 const text=' {"a/b":"  👩🏽‍💻 \\n \\"word\\"  ","nested":["\\u4e2d","x"]}';const rows=literalIndex(text);assert.equal(rows[0].pointer,'/a~1b');for(const row of rows)assert.equal(Buffer.from(text).subarray(row.start,row.end).toString(),row.token);
});
test('unknown meaningful source fields, missing target identity and altered media refuse explicitly',async()=>{
 const f=await componentFixture(),d=structuredClone(f.diagnostic),r=JSON.parse(d.sources.research.originalText);r.unclassifiedPublicStatement='unclassified content';d.sources.research.originalText=JSON.stringify(r);d.sources.research.sha256=sha(d.sources.research.originalText);d.sources.research.bytes=Buffer.byteLength(d.sources.research.originalText);await assert.rejects(mapNativeSources(d),{code:'MAPPER_UNSUPPORTED_FIELD'});
 const bad=structuredClone(f.diagnostic);delete bad.directionIds;await assert.rejects(mapNativeSources(bad),{code:'MAPPER_DIRECTIONS_REQUIRED'});
 const media=structuredClone(f.diagnostic);media.images[0].bytes++;await assert.rejects(mapNativeSources(media),{code:'MAPPER_IMAGE_CHANGED'});
 const extra=structuredClone(f.diagnostic);extra.targets.push({...extra.targets[0],targetId:'extra-unbound-target'});await assert.rejects(mapNativeSources(extra),{code:'MAPPER_TARGET_CHANGED'});
});
test('native typed research declarations/lexemes remain literal data pages and do not create charts or statistics',async()=>{
 const f=await componentFixture(),d=structuredClone(f.diagnostic),r=JSON.parse(d.sources.research.originalText);r.chartData={schema:'chart-data-v1',charts:[{chartId:'component-literal-record',title:{text:'Original source label'},series:[{name:{text:'Original series'},values:[{decimal:'2.5',lexeme:'2.50'}]}]}]};r.quantitativeClaims=[{chartId:'component-literal-record',claimIndex:0}];d.sources.research.originalText=JSON.stringify(r);d.sources.research.sha256=sha(d.sources.research.originalText);d.sources.research.bytes=Buffer.byteLength(d.sources.research.originalText);const mapped=await mapNativeSources(d);assert.equal(mapped.authority,'none');assert.equal(Object.hasOwn(mapped.projection,'charts'),false);assert(mapped.coverage.some(c=>c.visible&&c.value==='2.50'));assert.equal(mapped.input.sources.research.original.originalText,d.sources.research.originalText);
});
test('semantic policy keeps technical metadata in records and associates original judgment qualifiers, reuses exact source text and retains every distinct limit origin',async()=>{
 const d=JSON.parse(await readFile(new URL('./source-prefix.json',import.meta.url))),r=await mapNativeSources(d);
 assert.equal(r.coverage.filter(c=>c.visible).length,55);assert.equal(r.coverage.filter(c=>c.placement==='body').length,43);
 assert(r.coverage.filter(c=>c.stage==='strategy'&&c.pointer.includes('/refs/')).every(c=>!c.visible));
 assert(r.projection.research[0].paragraphs.some(p=>p.qualifiers.some(q=>q.pointer==='/claims/0/verification')));for(const b of r.projection.strategy)assert(b.paragraphs.some(p=>p.qualifiers.some(q=>q.pointer.endsWith('/kind'))));
 const scope=r.projection.limitations[0];assert.equal(scope.paragraphs.length,12);assert.equal(scope.paragraphs.reduce((n,p)=>n+p.origins.length,0),15);assert.equal(new Set(scope.paragraphs.map(p=>p.text)).size,scope.paragraphs.length);
 const shared=r.projection.brief.flatMap(b=>b.paragraphs).find(p=>p.origins.some(o=>o.stage==='copy'&&o.pointer==='/sections/0/body'));assert(shared.origins.some(o=>o.stage==='brief'&&o.pointer==='/fields/background'));
 for(const group of r.projection.directions)assert(group.blocks.some(b=>b.paragraphs.length===3));
});
test('explicit reference/handoff constraints remain visible with all origins while their technical reports stay recorded',async()=>{
 const f=await componentFixture(),d=structuredClone(f.diagnostic),v=JSON.parse(d.sources.visual.originalText);v.referenceQualifications={reports:[{id:'technical-record-only',rawReport:{limitations:['Do not copy the reference mark.'],prohibitedCopying:'Keep the reference label out.',providerPacket:'technical packet stays in records'}}]};v.refinementHandoffs=[{raw:{limitations:['Do not copy the reference mark.']}}];d.sources.visual.originalText=JSON.stringify(v);d.sources.visual.sha256=sha(d.sources.visual.originalText);d.sources.visual.bytes=Buffer.byteLength(d.sources.visual.originalText);
 const mapped=await mapNativeSources(d),scope=mapped.projection.limitations[0];assert.equal(scope.paragraphs.find(p=>p.text==='Do not copy the reference mark.').origins.length,2);assert(scope.paragraphs.some(p=>p.text==='Keep the reference label out.'));assert.equal(mapped.coverage.find(c=>c.value==='technical packet stays in records').visible,false);
});

test('copy and B claims preserve original prose and judgment qualifiers; unclassifiable claim shapes refuse',async()=>{
 const f=await componentFixture(),d=structuredClone(f.diagnostic);
 const copy=JSON.parse(d.sources.copy.originalText),v=JSON.parse(d.sources.visual.originalText);copy.claims=[{text:'Original qualified statement.',kind:'assumption',verification:'pending',limitations:['Not yet researched.']},'Original string claim.'];v.directions[0].claims=copy.claims;
 for(const [slot,body]of [['copy',copy],['visual',v]]){d.sources[slot].originalText=JSON.stringify(body);d.sources[slot].sha256=sha(d.sources[slot].originalText);d.sources[slot].bytes=Buffer.byteLength(d.sources[slot].originalText);}
 const r=await mapNativeSources(d);for(const stage of ['copy','visual']){const rows=r.coverage.filter(x=>x.stage===stage&&x.value==='Original qualified statement.');assert.equal(rows.length,1);assert(r.coverage.some(x=>x.stage===stage&&x.value==='Original string claim.'&&x.placement==='body'));assert(rows.every(x=>x.placement==='body'));assert(r.coverage.some(x=>x.stage===stage&&x.value==='pending'&&x.placement==='qualifier'));}
 const bad=structuredClone(d),body=JSON.parse(bad.sources.copy.originalText);body.claims=[{unknownMeaningful:'Not classified'}];bad.sources.copy.originalText=JSON.stringify(body);bad.sources.copy.sha256=sha(bad.sources.copy.originalText);bad.sources.copy.bytes=Buffer.byteLength(bad.sources.copy.originalText);await assert.rejects(mapNativeSources(bad),{code:'MAPPER_CLAIM_SHAPE_REQUIRED'});
});

test('builder projection has one source: complete original input, independent of deleted or reattached caller diagnostics',async()=>{
 const f=await componentFixture(),expected=deriveDeckProjection(f.mapped.input);assert.deepEqual(expected.projection,f.mapped.projection);assert.deepEqual(expected.coverage,f.mapped.coverage);
 for(const change of [p=>{p.research.flatMap(b=>b.paragraphs).forEach(p=>p.qualifiers=[]);},p=>{const claim=p.research.flatMap(b=>b.paragraphs).find(p=>p.qualifiers.length);p.directions[0].blocks[0].paragraphs[0].qualifiers=claim.qualifiers;claim.qualifiers=[];},p=>{p.research=[];p.limitations=[];p.records=[];p.imageOrigins={};},p=>{p.directions[0].blocks[0].paragraphs[0].text='rewritten diagnostic';p.strategy[0].paragraphs[0].origins[0].byteSpan.start++;}]){const diagnostic=structuredClone(f.mapped);change(diagnostic.projection);assert.deepEqual(deriveDeckProjection(diagnostic.input),expected);}
 const verification=expected.coverage.find(c=>c.pointer==='/claims/0/verification'&&c.stage==='research');assert.equal(verification.placement,'qualifier');const claim=expected.projection.research.flatMap(b=>b.paragraphs).find(p=>p.origins.some(q=>q.pointer==='/claims/0/text'));assert.deepEqual(claim.qualifiers.map(q=>q.pointer),['/claims/0/kind','/claims/0/verification']);
});
test('legacy caller projection cannot be smuggled into the strict raw input boundary',async()=>{const f=await componentFixture();await assert.rejects(inspectProposalDeckInput({...f.mapped.input,projection:f.mapped.projection},f.method));});
