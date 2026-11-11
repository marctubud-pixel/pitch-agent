import {NUMERIC_CONTENT_CONTRACT,contentContractForPacket} from '../workbench/content-contract-versions.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
import {contentSourceLocations,resolveContentSourceLocation,CONTENT_SOURCE_LOCATION_VERSION} from '../workbench/complete-content.mjs';
import {hash,layoutIssue} from './semantic-input.mjs';
export const SOURCE_LOCATION_VERSION=CONTENT_SOURCE_LOCATION_VERSION;
export {resolveContentSourceLocation as resolveLayoutSourceLocation};
export function normalizeSourceLocations(ledger){
  const {source,contentBinding:binding}=ledger;
  const numeric=ledger.schemaVersion===NUMERIC_CONTENT_CONTRACT.semantic,contract=contentContractForPacket(numeric?source?.contentContract?.packet:'content-packet-v3',source);
  if(numeric&&ledger.sourceLocations===undefined)layoutIssue('SEMANTIC_SOURCE_LOCATION_MISSING',{artifactId:binding.artifactId,pointer:'/sourceLocations',owner:'content-author'},'Numeric layouts require all exact server source locations');
  if(ledger.sourceLocations===undefined&&ledger.sourceLocationVersion!==undefined)layoutIssue('SEMANTIC_SOURCE_LOCATION_MISSING',{artifactId:binding.artifactId??'standalone-ledger',pointer:'/sourceLocations',owner:'content-author'},'A declared source location version requires its complete location rows');
  if(ledger.sourceLocations===undefined)return source.visibility.clauses.map((c,n)=>({originId:c.clauseId,namespace:'ledger-source',envelopeId:binding.sourceEnvelopeId??binding.artifactId??'standalone-ledger',sourceHash:source.sourceHash,pointer:`/source/visibility/clauses/${n}`,valueHash:hash(c),ancestryAnchor:{artifactId:source.visual.artifactId,contentHash:source.visual.contentHash??null,role:'ancestry_anchor'}}));
  const at={artifactId:binding.sourceEnvelopeId??binding.artifactId??'standalone-ledger',pointer:'/sourceLocations',owner:'content-author'};
  if(ledger.sourceLocationVersion!==contract.location||typeof binding.rootJobId!=='string'||!binding.rootJobId)layoutIssue('SEMANTIC_SOURCE_LOCATION_VERSION',at,'Versioned effective source locations require the bound root identity');
  const expected=contentSourceLocations({id:binding.rootJobId,task:{packetVersion:numeric?source?.contentContract?.packet:'content-packet-v3',source}});
  if(!equal(ledger.sourceLocations,expected))layoutIssue('SEMANTIC_SOURCE_LOCATION_CHANGED',at,'Exact derived effective-source and original occurrence locations must remain bound');
  return structuredClone(ledger.sourceLocations);
}
