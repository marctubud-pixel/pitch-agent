function normalized(value){
 if(Array.isArray(value))return value.map(normalized);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalized(value[key])]));
 return value;
}
export function canonicalWireJson(value){return JSON.stringify(normalized(JSON.parse(JSON.stringify(value))));}
export function requestIdentityWire(body){const {commandId,...data}=body;return canonicalWireJson(data);}
export function normalizeDecisionWire(body){
 const {stage,...request}=body;
 if(stage!==undefined&&request.module!==undefined&&stage!==request.module)throw Object.assign(Error('DECISION_STAGE_CONFLICT'),{code:'DECISION_STAGE_CONFLICT',status:422});
 return {...request,module:request.module??stage};
}
