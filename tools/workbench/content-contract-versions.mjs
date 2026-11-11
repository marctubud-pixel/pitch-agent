export const VISIBILITY_CONTENT_CONTRACT=Object.freeze({packet:'content-packet-v3',source:'content-source-v2',manuscript:'complete-manuscript-v2',location:'content-source-location-v1',semantic:'semantic-layout-v2'});
export const NUMERIC_CONTENT_CONTRACT=Object.freeze({packet:'content-packet-v4',source:'content-source-v3',manuscript:'complete-manuscript-v3',location:'content-source-location-v2',semantic:'semantic-layout-v3'});
export const PLANNING_CONTENT_CONTRACT=Object.freeze({...NUMERIC_CONTENT_CONTRACT,packet:'content-packet-v5'});
export const MODEL_VIEW_CONTENT_CONTRACT=Object.freeze({...NUMERIC_CONTENT_CONTRACT,packet:'content-packet-v6'});
export const planningContentPacket=packet=>packet===PLANNING_CONTENT_CONTRACT.packet||packet===MODEL_VIEW_CONTENT_CONTRACT.packet;
const contracts=[VISIBILITY_CONTENT_CONTRACT,NUMERIC_CONTENT_CONTRACT,PLANNING_CONTENT_CONTRACT,MODEL_VIEW_CONTENT_CONTRACT];
export const numericContentPacket=packet=>packet===NUMERIC_CONTENT_CONTRACT.packet||planningContentPacket(packet);
export const numericContract=contract=>contract===NUMERIC_CONTENT_CONTRACT||contract===PLANNING_CONTENT_CONTRACT||contract===MODEL_VIEW_CONTENT_CONTRACT;
export function requireContentContract(tuple) {
 const keys=Object.keys(NUMERIC_CONTENT_CONTRACT);
 const result=tuple&&Object.keys(tuple).length===keys.length&&contracts.find(c=>keys.every(k=>Object.hasOwn(tuple,k)&&tuple[k]===c[k]));
 if(!result)throw Object.assign(new Error('An exact complete content version tuple is required'),{code:'CONTENT_CONTRACT_INVALID'});
 return result;
}
export function numericContentContract(source) {
 return source?.contentContract!==undefined&&numericContract(requireContentContract(source.contentContract));
}

export function contentContractForPacket(packetVersion,source) {
 const contract=contracts.find(c=>c.packet===packetVersion)??null;
 if(source?.contentContract!==undefined){
  if(requireContentContract(source.contentContract)!==contract)throw Object.assign(new Error('Content packet and source contract must match'),{code:'CONTENT_CONTRACT_INVALID'});
 }
 if(numericContract(contract)&&(!source||source.schemaVersion!==contract.source||requireContentContract(source.contentContract)!==contract))throw Object.assign(new Error('Full numeric projected source required'),{code:'CONTENT_CONTRACT_INVALID'});
 if(contract===VISIBILITY_CONTENT_CONTRACT&&source&&source.schemaVersion!==contract.source)throw Object.assign(new Error('Visibility source version required'),{code:'CONTENT_CONTRACT_INVALID'});
 return contract;
}
