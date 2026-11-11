import {createHash} from 'node:crypto';
export const SEMANTIC_PROTOCOL='research-semantic-challenge-v1';
const readers=new WeakMap();
export const semanticHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function bindSemanticReader(project,reader){readers.set(project,reader);return project;}
export function transferSemanticReader(before,after){const reader=readers.get(before);if(reader)readers.set(after,reader);return after;}
export function semanticConfiguration(project){const reader=readers.get(project);const config=reader?.();if(!config)throw Object.assign(Error('Semantic reviewer configuration is unavailable'),{code:'SEMANTIC_UNCONFIGURED'});return config;}
export function validateSemanticConfiguration(value){
 if(!value||Object.keys(value).sort().join(',')!=='challengeBinding,readinessBinding,rubricVersion'||value.rubricVersion!==SEMANTIC_PROTOCOL)throw Object.assign(Error('Invalid semantic configuration'),{code:'SEMANTIC_CONFIGURATION_INVALID'});
 for(const binding of [value.readinessBinding,value.challengeBinding])if(!binding||Object.keys(binding).sort().join(',')!=='model,providerId,role'||Object.values(binding).some(v=>typeof v!=='string'||!v.trim()))throw Object.assign(Error('Invalid reviewer binding'),{code:'SEMANTIC_CONFIGURATION_INVALID'});
 const normalized={readinessBinding:Object.fromEntries(['providerId','model','role'].map(k=>[k,value.readinessBinding[k]])),challengeBinding:Object.fromEntries(['providerId','model','role'].map(k=>[k,value.challengeBinding[k]])),rubricVersion:value.rubricVersion};
 if(JSON.stringify(normalized.readinessBinding)===JSON.stringify(normalized.challengeBinding))throw Object.assign(Error('Independent reviewer role required'),{code:'SEMANTIC_REVIEWER_REQUIRED'});
 return normalized;
}
