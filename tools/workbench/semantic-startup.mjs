import {isDeepStrictEqual} from 'node:util';
import {validateSemanticConfiguration} from './semantic-authority.mjs';
export function initializeSemanticReview(store,option,bindings){
 if(option==null)return null;
 if(!option||Object.keys(option).some(k=>!['configuration','expectedEpoch'].includes(k)))throw Object.assign(Error('Invalid trusted semantic startup option'),{code:'SEMANTIC_CONFIGURATION_INVALID'});
 const config=validateSemanticConfiguration(option.configuration);
 if(!isDeepStrictEqual(config.readinessBinding,bindings.readiness)||!isDeepStrictEqual(config.challengeBinding,bindings.semantic))throw Object.assign(Error('Configured runtime bindings do not match reviewers'),{code:'SEMANTIC_CONFIGURATION_CHANGED'});
 return Object.hasOwn(option,'expectedEpoch')?store.registerSemanticConfiguration(config,{expectedEpoch:option.expectedEpoch}):store.attachSemanticConfiguration(config);
}
