const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
export function normalizeLocalFixtureIdentity(value){
 if(value===undefined)return undefined;
 need(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===3&&['protocol','fixtureProfile','closureHash'].every(key=>Object.hasOwn(value,key)),'LOCAL_FIXTURE_IDENTITY_INVALID');
 need(value.protocol==='local-fixture-identity-v1'&&value.fixtureProfile==='case-aware-grouped-v1'&&typeof value.closureHash==='string'&&/^[a-f0-9]{64}$/.test(value.closureHash),'LOCAL_FIXTURE_IDENTITY_INVALID');
 return Object.freeze({protocol:value.protocol,fixtureProfile:value.fixtureProfile,closureHash:value.closureHash});
}
export function requireMatchingLocalFixtureIdentity(record,expected){
 const actual=normalizeLocalFixtureIdentity(record?.fixtureIdentity),wanted=normalizeLocalFixtureIdentity(expected);
 need(actual===undefined&&wanted===undefined||actual!==undefined&&wanted!==undefined&&actual.protocol===wanted.protocol&&actual.fixtureProfile===wanted.fixtureProfile&&actual.closureHash===wanted.closureHash,'LOCAL_FIXTURE_PROFILE_CHANGED');
 return true;
}
