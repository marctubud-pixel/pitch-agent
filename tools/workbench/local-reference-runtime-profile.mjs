export const LEGACY_REFERENCE_RUNTIME='legacy-fixed-library-v1';
export const LOCAL_REFERENCE_POOL_RUNTIME='local-reference-pool-v2';
export function referenceRuntimeProfileOf(value=LEGACY_REFERENCE_RUNTIME){
 if(![LEGACY_REFERENCE_RUNTIME,LOCAL_REFERENCE_POOL_RUNTIME].includes(value))throw Object.assign(Error('LOCAL_REFERENCE_RUNTIME_PROFILE_INVALID'),{code:'LOCAL_REFERENCE_RUNTIME_PROFILE_INVALID'});
 return value;
}
export function requireMatchingCaseProfile(record,selected){
 if(referenceRuntimeProfileOf(record.referenceRuntimeProfile)!==selected)throw Object.assign(Error('LOCAL_REFERENCE_CASE_PROFILE_CHANGED'),{code:'LOCAL_REFERENCE_CASE_PROFILE_CHANGED',status:409});
}
