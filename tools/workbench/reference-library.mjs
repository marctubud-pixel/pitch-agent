import {referenceHash} from './reference-review.mjs';
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
export const REFERENCE_LIBRARY_DESCRIPTION='Local curated acceptance library; not network capture or human approval.';
export function freezeReferenceLibrary(catalogue){
 need(catalogue?.schemaVersion==='local-acceptance-assets-v1','REFERENCE_LIBRARY_CATALOGUE_REQUIRED');
 const entries=[...(catalogue.m6?.posters??[]).map(a=>({...a,caseId:'m6'})),...(catalogue.dexian?.packaging??[]).map(a=>({...a,caseId:'dexian'}))].map(a=>({id:a.caseId+':'+a.id,caseId:a.caseId,sha256:a.sha256,role:a.role,sourceUrl:a.sourceUrl,representation:a.representation==='screenshot'?'screenshot':'supplied_image',provenanceState:a.provenanceState,limitations:structuredClone(a.limitations??[])}));
 need(entries.length>0&&new Set(entries.map(e=>e.id)).size===entries.length,'REFERENCE_LIBRARY_ENTRIES_INVALID');
 for(const e of entries)need(typeof e.id==='string'&&/^[a-f0-9]{64}$/.test(e.sha256)&&['same-use-master-kv','auxiliary-reference','observed-competitor-packaging'].includes(e.role)&&/^https?:\/\//.test(e.sourceUrl)&&typeof e.provenanceState==='string'&&e.limitations.length>0&&e.limitations.every(x=>typeof x==='string'),'REFERENCE_LIBRARY_ENTRY_INVALID');
 const value={protocol:'reference-local-library-v1',entries};return Object.freeze({...value,catalogueDigest:referenceHash(value)});
}
export function validateReferenceLibrary(library){
 need(library?.protocol==='reference-local-library-v1'&&Array.isArray(library.entries)&&library.catalogueDigest===referenceHash({protocol:library.protocol,entries:library.entries}),'REFERENCE_LIBRARY_CHANGED');return library;
}
export function referenceLibraryEntry(library,id){validateReferenceLibrary(library);const matches=library.entries.filter(e=>e.id===id);need(matches.length===1,'REFERENCE_LIBRARY_ENTRY_REQUIRED');return structuredClone(matches[0]);}
