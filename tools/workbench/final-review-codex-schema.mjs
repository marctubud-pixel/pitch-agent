const string={type:'string',minLength:1};
const array=items=>({type:'array',items});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const enumeration=values=>({enum:values});
const strings=array(string),categories=enumeration(['creative','aesthetic','strategy','factual','source','mandatory_task','native_proof','mixed']);
const evidence=array(object({targetId:string,observation:string}));
const findingFields={id:string,category:categories,duty:string,targetIds:{...strings,minItems:1,uniqueItems:true},evidence,reason:string,requestedChange:string,effect:enumeration(['must_fix','advisory','unknown'])};
const finding=object(findingFields),checks=array(object({obligationId:string,status:enumeration(['checked','unknown']),evidence}));
const proofs=array(object({style:string,attemptId:string,anchor:string,manifest:string,nativeInput:string,delivery:string,pdf:string,renders:strings}));
const kind=(name,fields)=>object({kind:{const:name},...fields});
export function finalCodexResultSchema(call){
 const returns=[kind('return',{findings:{...array(finding),minItems:1}})];
 if(call.phase==='owner_before')returns.push(kind('return',{findings:{...array(finding),minItems:1},basisHash:string,checks}));
 if(call.phase==='owner_after')returns.push(kind('return',{findings:{...array({anyOf:[finding,object({...findingFields,rulingRef:string})]}),minItems:1},approvalId:string,editionProofs:proofs,checks}));
 const owners={
  'owner:layoutProducer':kind('layout_handoff',{basisHash:string,statement:string}),
  'owner:finalConsumer':kind('intake_accept',{producerResultId:string,basisHash:string,checks}),
  'owner:finalProducer':kind('final_handoff',{approvalId:string,basisHash:string,editionProofs:proofs,statement:string}),
  'owner:deliveryConsumer':kind('delivery_accept',{producerResultId:string,approvalId:string,editionProofs:proofs,checks}),
  director:kind('director_disposition',{reviewedResultIds:strings,dispositions:array(object({itemRef:string,decision:enumeration(['uphold','dismiss','duplicate','unresolved']),evidence,reason:string,targetIds:strings,duplicateOf:{anyOf:[string,{type:'null'}]}})),coverage:checks,outcome:object({kind:enumeration(['approve','return','needs_evidence','needs_human']),itemRefs:strings})})
 };
 let success=owners[call.id];
 if(!success&&['primary','blind'].includes(call.phase))success=kind('observation',{packetId:string,coverage:checks,findings:array(finding),limitations:strings});
 if(!success&&['primary_synthesis','blind_synthesis'].includes(call.phase))success=kind('lane_synthesis',{lane:{const:call.phase.split('_')[0]},originalResultIds:strings,coverage:checks,findingRefs:strings,conflicts:array(object({findingRefs:{...strings,minItems:1},reason:string})),conclusion:enumeration(['clear','changes_required','inconclusive'])});
 if(!success&&call.phase==='paired_challenge')success=kind('paired_challenge',{role:string,reviewedResultIds:strings,comparisons:array(object({resultId:string,pointer:{const:'/result'},observation:string})),objections:array(object({id:string,category:categories,findingRefs:strings,targetIds:strings,evidence,reason:string,proposedDisposition:enumeration(['uphold','dismiss','needs_evidence'])})),conclusion:enumeration(['no_objection','objections','inconclusive'])});
 if(!success)throw Object.assign(Error('FINAL_PHASE_UNSUPPORTED'),{code:'FINAL_PHASE_UNSUPPORTED'});
 return {anyOf:[success,...returns]};
}
