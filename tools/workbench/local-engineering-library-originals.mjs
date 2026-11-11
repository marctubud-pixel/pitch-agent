import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {assertStoreReadAdmission} from './store.mjs';
import {selectedOriginalCommandIndex} from './final-selected-originals.mjs';
import {applyCommand} from './project.mjs';
import {referenceLibraryEntry,validateReferenceLibrary} from './reference-library.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function checkEngineeringLibraryWitness({material,command,audit,library}){
 validateReferenceLibrary(library);const entry=referenceLibraryEntry(library,material.provenance.entryId);
 need(material.provenance.kind==='local_curated_library'&&material.provenance.captureState==='legacy-not-verified'&&library.catalogueDigest===material.provenance.catalogueDigest,'LOCAL_ENGINEERING_LIBRARY_PROVENANCE_CHANGED');
 need(command.kind==='record-reference-library-material'&&command.commandId===material.id&&audit.commandId===material.id&&audit.kind===command.kind&&audit.actorId==='reference-library-curator'&&equal(command.libraryEntry,entry)&&equal(command.request,material.request),'LOCAL_ENGINEERING_LIBRARY_COMMAND_CHANGED');
 need(command.request.catalogueDigest===library.catalogueDigest&&command.request.libraryEntryId===entry.id&&material.image.sha256===entry.sha256&&material.provenance.sourceUrl===entry.sourceUrl&&material.provenance.sourceRole===entry.role&&equal(material.provenance.limitations,entry.limitations),'LOCAL_ENGINEERING_LIBRARY_ENTRY_CHANGED');
 need(Number.isSafeInteger(audit.revision)&&audit.revision>0&&command.request.expectedRevision===audit.revision-1,'LOCAL_ENGINEERING_LIBRARY_REVISION_CHANGED');return entry;
}
export async function verifyEngineeringLibraryMaterials({store,project,selectedDossierIds,executionRoot,referenceLibraries={},current=()=>{}}){
 assertStoreReadAdmission(store,project.id);const index=selectedOriginalCommandIndex(project),dossiers=[],seen=new Set();
 function visit(id){if(seen.has(id))return;seen.add(id);const matches=project.referenceDossiers.filter(d=>d.id===id);need(matches.length===1,'LOCAL_ENGINEERING_LIBRARY_DOSSIER_REQUIRED');dossiers.push(matches[0]);for(const prior of matches[0].priorChoiceHistory??[])visit(prior.dossierId);}
 selectedDossierIds.forEach(visit);
 const frozen=[...new Map(dossiers.flatMap(d=>d.envelope.source.manualReferences??[]).filter(m=>m.provenance?.kind==='local_curated_library').map(m=>[m.id,m])).values()];need(frozen.length<=512,'LOCAL_ENGINEERING_LIBRARY_LIMIT');
 const catalogues=new Map(),proofs=[];
 for(const material of frozen){
  current();const registered=project.referenceMaterials.filter(m=>m.id===material.id);need(registered.length===1,'LOCAL_ENGINEERING_LIBRARY_MATERIAL_CHANGED');const {removed,...registeredOriginal}=registered[0];need(equal(registeredOriginal,material),'LOCAL_ENGINEERING_LIBRARY_MATERIAL_CHANGED');
  const digest=material.provenance.catalogueDigest,descriptor=referenceLibraries[digest];need(descriptor&&typeof descriptor.path==='string'&&/^[a-f0-9]{64}$/.test(descriptor.sha256)&&Number.isSafeInteger(descriptor.byteLength)&&descriptor.byteLength>0&&descriptor.byteLength<=8*1024*1024,'LOCAL_ENGINEERING_LIBRARY_ARCHIVE_REQUIRED');
  let library=catalogues.get(digest);if(!library){const bytes=await readManagedLayoutBytes(executionRoot,descriptor.path,descriptor.byteLength);need(bytes.length===descriptor.byteLength&&sha(bytes)===descriptor.sha256,'LOCAL_ENGINEERING_LIBRARY_ARCHIVE_CHANGED');library=JSON.parse(bytes);validateReferenceLibrary(library);need(library.catalogueDigest===digest,'LOCAL_ENGINEERING_LIBRARY_ARCHIVE_CHANGED');catalogues.set(digest,library);}
  const witnesses=index.entries.filter(e=>e.command.commandId===material.id);need(witnesses.length===1,'LOCAL_ENGINEERING_LIBRARY_WITNESS_REQUIRED');const witness=witnesses[0];checkEngineeringLibraryWitness({material,...witness,library});
  const before=store.read(project.id,witness.audit.revision-1),after=store.read(project.id,witness.audit.revision);current();need(before.revision+1===after.revision&&after.revision===witness.audit.revision&&!before.referenceMaterials.some(m=>m.id===material.id),'LOCAL_ENGINEERING_LIBRARY_CREATION_CHANGED');
  const replay=applyCommand(before,{...witness.command,expectedRevision:before.revision},{actorType:'agent',actorId:'reference-library-curator',runId:'engineering-library-reducer-replay',contextId:'engineering-library-reducer-replay',now:witness.audit.at??undefined});
  const actual=after.referenceMaterials.filter(m=>m.id===material.id),expected=replay.referenceMaterials.filter(m=>m.id===material.id);need(actual.length===1&&expected.length===1&&equal(actual[0],material)&&equal(expected[0],material),'LOCAL_ENGINEERING_LIBRARY_REDUCER_CHANGED');
  proofs.push({materialId:material.id,catalogueDigest:digest,archive:{path:descriptor.path,sha256:descriptor.sha256,byteLength:descriptor.byteLength},commandHash:sha(JSON.stringify(witness.command)),createdRevision:witness.audit.revision,actor:'reference-library-curator',actorType:'agent',captureState:'legacy-not-verified',validation:'actual-native-material-reducer-replayed'});current();
 }
 return {protocol:'local-engineering-library-originals-v1',proofs,automaticSearchCredit:false,humanApproval:false};
}
