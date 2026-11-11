export const NUMERICAL_REVIEW_PROTOCOL='excerpt-support-v4';
const capabilities=Object.freeze({
 'excerpt-support-v2':Object.freeze({catalogueState:false,originalPacket:false,fullTaskCard:false,numerical:false}),
 'excerpt-support-v3':Object.freeze({catalogueState:true,originalPacket:true,fullTaskCard:false,numerical:false}),
 'excerpt-support-v4':Object.freeze({catalogueState:true,originalPacket:true,fullTaskCard:true,numerical:true}),
});
export function evidenceProtocolCapabilities(version){
 if(!Object.hasOwn(capabilities,version))throw Object.assign(new Error('Unknown evidence review protocol'),{code:'INVALID_EVIDENCE_REVIEW'});
 return capabilities[version];
}
