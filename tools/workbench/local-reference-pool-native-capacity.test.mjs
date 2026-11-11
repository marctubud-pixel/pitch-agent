import test from 'node:test';import assert from 'node:assert/strict';
import {planReferencePool} from './local-reference-pool-plan.mjs';
import {referenceHash as hash} from './reference-review.mjs';
import {reduceReferenceCommand} from './reference-dossier.mjs';
import {REFERENCE_LIBRARY_DESCRIPTION} from './reference-library.mjs';
const sha=n=>n.toString(16).padStart(64,'0'),directionIds=['steady','product','user'],copyContents=JSON.stringify({directions:directionIds.map(id=>({id}))}),artifact={id:'copy',stage:'copy',contentHash:hash(copyContents)},catalogueDigest=sha(101),librarySlots=directionIds.flatMap((directionId,i)=>[0,1].map(n=>({directionId,entryId:directionId+n,asset:{sha256:sha(i*2+n+1),role:'same-use-master-kv'}})));
for(const count of [0,1,2,3])test(`native registration accepts planned pool with ${count} manual images without capacity waiver`,()=>{
 const p={id:'p',activeByStage:{copy:'copy'},artifacts:[artifact],imageAssets:[],referenceMaterials:[]};
 function add({imageHash,directionId,commandId,libraryEntry}){const asset={id:'img'+commandId,projectId:'p',sha256:imageHash,width:2,height:2,mediaType:'image/png',byteLength:12,provenance:libraryEntry?{sourcePageUrl:libraryEntry.sourceUrl,description:REFERENCE_LIBRARY_DESCRIPTION}:{representation:'supplied_image'}};p.imageAssets.push(asset);const request={artifactId:'copy',directionId,imageId:asset.id,kind:'direction',applicabilityProfile:'direction',borrowingNote:'Engineering capacity probe, not a true image evaluation',...(libraryEntry?{libraryEntryId:libraryEntry.id,catalogueDigest}:{})};reduceReferenceCommand(p,{kind:libraryEntry?'record-reference-library-material':'record-reference-material',request,commandId,copyContents,...(libraryEntry?{libraryEntry}:{})},{actorType:libraryEntry?'agent':'human',actorId:libraryEntry?'reference-library-curator':'fixture-human'},()=>{throw Error('not used for material registration');});}
 for(let i=0;i<count;i++)add({imageHash:sha(20+i),directionId:'steady',commandId:'manual'+i});
 const plan=planReferencePool({projectId:'p',caseId:'m6',artifact,directionIds,materials:p.referenceMaterials,librarySlots,catalogueDigest});assert.equal(plan.status,'ready');
 for(const d of plan.directions)for(const slot of d.imports)add({imageHash:slot.sha256,directionId:d.directionId,commandId:'library'+slot.entryId,libraryEntry:{id:slot.entryId,sha256:slot.sha256,sourceUrl:'https://example.org/'+slot.entryId,role:'same-use-master-kv',representation:'supplied_image',provenanceState:'test',limitations:['synthetic capacity data']}});
 assert.equal(p.referenceMaterials.filter(m=>m.provenance.kind==='manual_supplied').length,count);
 for(const directionId of directionIds){const current=p.referenceMaterials.filter(m=>m.directionId===directionId);assert.ok(new Set(current.map(m=>m.image.sha256)).size<=3);assert.ok(current.length<=12);}
 const again=planReferencePool({projectId:'p',caseId:'m6',artifact,directionIds,materials:p.referenceMaterials,librarySlots,catalogueDigest});assert.equal(again.status,'ready');assert.equal(again.directions.flatMap(d=>d.imports).length,0);
});
