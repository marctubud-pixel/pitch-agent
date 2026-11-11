const ROLES=['content','visual','brand','user','communication'];
const OWNER_KEYS=['layoutProducer','finalConsumer','finalProducer','deliveryConsumer'];
const positive=n=>Number.isSafeInteger(n)&&n>0;
const text=s=>typeof s==='string'&&s.length>0;

export function validateFinalAssignments(configurationOrNull,owners) {
  const errors=[],blockers=[];
  let config=null,pixelProfiles=[];
  const profileMap=new Map(),seatMap=new Map();
  const invalid=(code,path)=>errors.push({code,path});
  const missing=(code,path)=>blockers.push({code,path});
  const finish=kind=>({kind,config,profileMap,seatMap,pixelProfiles,issues:[...blockers,...errors]});
  config=configurationOrNull==null?null:structuredClone(configurationOrNull);
  if(!config){missing('FINAL_CONFIGURATION_REQUIRED','configuration');return finish('blocked');}
  if(config.schemaVersion!=='final-review-configuration-v2'||!config.assignmentPolicy){
    missing('EXPLICIT_ASSIGNMENT_POLICY_REQUIRED','configuration.assignmentPolicy');return finish('blocked');
  }
  if(typeof config.assignmentPolicy!=='object'||Array.isArray(config.assignmentPolicy)){
    invalid('INVALID_ASSIGNMENT_POLICY','configuration.assignmentPolicy');return finish('invalid_basis');
  }
  if(Object.keys(config).sort().join(',')!=='assignmentPolicy,schemaVersion')invalid('AMBIGUOUS_CONFIGURATION','configuration');
  const policy=config.assignmentPolicy;
  if(policy.profiles===undefined)missing('PROFILE_SET_REQUIRED','configuration.assignmentPolicy.profiles');
  else if(!Array.isArray(policy.profiles))invalid('INVALID_PROFILE_SET','configuration.assignmentPolicy.profiles');
  for(const profile of Array.isArray(policy.profiles)?policy.profiles:[]){
    const id=profile?.identity;
    if(!text(id)||profileMap.has(id)){invalid('DUPLICATE_OR_INVALID_PROFILE',String(id));continue;}
    profileMap.set(id,profile);
    if(![profile.providerIdentity,profile.modelIdentity,profile.adapterEvidenceIdentity,profile.contextEvidenceIdentity,
      profile.transportEvidenceIdentity,profile.independentContextEvidenceIdentity].every(text))missing('PROFILE_EVIDENCE_REQUIRED',id);
    if(profile.operation!=='final-review-v1')missing('FINAL_OPERATION_REQUIRED',id);
    if(!profile.context||!positive(profile.context.maxInputBytes)||!positive(profile.context.maxOutputBytes)||
      !positive(profile.reportBoundBytes)||profile.reportBoundBytes>profile.context.maxOutputBytes)missing('FINITE_CONTEXT_REQUIRED',id);
    if(profile.transport!==null&&(!profile.transport||!positive(profile.transport.maxImages)||profile.transport.maxImages>4||
      !['maxBytes','maxPixels','maxImageBytes','maxImagePixels'].every(k=>positive(profile.transport[k]))))missing('TRANSPORT_UNSUPPORTED',id);
  }
  const seatKeys=['primary','blind','primarySynthesis','blindSynthesis','challenge'];
  const seenAssignments=new Set();
  const seat=(key,value)=>{
    if(value===undefined){missing('ASSIGNMENT_REQUIRED',key);return;}
    if(!value||typeof value!=='object'||!['assignmentIdentity','actorIdentity','profileIdentity'].every(k=>text(value[k]))){invalid('INVALID_ASSIGNMENT',key);return;}
    if(seenAssignments.has(value.assignmentIdentity))invalid('DUPLICATE_ASSIGNMENT',key);
    seenAssignments.add(value.assignmentIdentity);
    if(!profileMap.has(value.profileIdentity))missing('ASSIGNMENT_PROFILE_REQUIRED',key);
    seatMap.set(key,value);
  };
  if(policy.roles===undefined)missing('ROLE_SEATS_REQUIRED','configuration.assignmentPolicy.roles');
  else if(!policy.roles||typeof policy.roles!=='object'||Array.isArray(policy.roles))invalid('INVALID_ROLE_SEAT_MAP','configuration.assignmentPolicy.roles');
  else for(const key of Object.keys(policy.roles))if(!ROLES.includes(key))invalid('EXTRA_ROLE_SEATS',key);
  for(const role of ROLES){
    const seats=policy.roles?.[role];
    if(!seats)missing('ROLE_SEATS_REQUIRED',role);
    else if(typeof seats!=='object'||Array.isArray(seats))invalid('INVALID_ROLE_SEATS',role);
    else for(const key of Object.keys(seats))if(!seatKeys.includes(key))invalid('EXTRA_ROLE_SEATS',`${role}:${key}`);
    for(const key of seatKeys)seat(`${role}:${key}`,seats?.[key]);
    const a=seats?.primary?.actorIdentity,b=seats?.blind?.actorIdentity,c=seats?.challenge?.actorIdentity;
    if(a&&b&&a===b)invalid('ROLE_SELF_BLIND',role);
    if(c&&(c===a||c===b))invalid('CHALLENGE_SELF_REVIEW',role);
  }
  seat('director',policy.director);
  if(policy.ownerProfiles===undefined)missing('OWNER_PROFILES_REQUIRED','configuration.assignmentPolicy.ownerProfiles');
  else if(!policy.ownerProfiles||typeof policy.ownerProfiles!=='object'||Array.isArray(policy.ownerProfiles))invalid('INVALID_OWNER_PROFILE_MAP','configuration.assignmentPolicy.ownerProfiles');
  else for(const key of Object.keys(policy.ownerProfiles))if(!OWNER_KEYS.includes(key))invalid('EXTRA_OWNER_PROFILE',key);
  for(const key of OWNER_KEYS){
    const id=policy.ownerProfiles?.[key],p=profileMap.get(id),owner=owners[key];
    if(!text(id)||!p)missing('OWNER_PROFILE_REQUIRED',key);
    if(p&&owner&&(p.providerIdentity!==owner.providerIdentity||p.modelIdentity!==owner.modelIdentity))invalid('OWNER_PROFILE_MISMATCH',key);
  }
  const selectedProfileIds=new Set([...seatMap.values()].map(s=>s.profileIdentity).concat(Object.values(policy.ownerProfiles??{})));
  const completeProfileReferences=seatMap.size===ROLES.length*seatKeys.length+1&&OWNER_KEYS.every(key=>text(policy.ownerProfiles?.[key]));
  if(completeProfileReferences)for(const id of profileMap.keys())if(!selectedProfileIds.has(id))invalid('UNUSED_PROFILE',id);
  pixelProfiles=ROLES.flatMap(role=>['primary','blind'].map(phase=>profileMap.get(seatMap.get(`${role}:${phase}`)?.profileIdentity)));
  for(const [index,p] of pixelProfiles.entries())if(p&&p.transport===null)missing('PIXEL_READER_UNSUPPORTED',`${ROLES[Math.floor(index/2)]}:${index%2?'blind':'primary'}`);
  if(errors.length)return finish('invalid_basis');
  if(blockers.length>0)return finish('blocked');
  return finish('valid');
}
