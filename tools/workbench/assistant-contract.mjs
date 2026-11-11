export const ASSISTANT_PROTOCOL='workbench-assistant-v1';
export const ASSISTANT_INTENTS=Object.freeze(['status','blockers','next_step','evidence','interpret']);
export const ASSISTANT_BLOCK_KINDS=Object.freeze(['interpretation','recommendation','missing','guidance']);
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'};
const scope={oneOf:[object({kind:{const:'project'},projectId:id}),object({kind:{const:'general'}}),object({kind:{const:'draft'}})]};
const draft=object({fields:{type:'object',maxProperties:40,propertyNames:id,additionalProperties:{anyOf:[{type:'string',minLength:1,maxLength:2000},{type:'null'}]}}});
export const ASSISTANT_OUTPUT_SCHEMA=object({protocol:{const:'assistant-answer-v1'},blocks:{type:'array',minItems:1,maxItems:12,items:object({kind:{enum:ASSISTANT_BLOCK_KINDS},text:{type:'string',minLength:1,maxLength:4000},items:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:1000}},referenceIds:{type:'array',maxItems:20,uniqueItems:true,items:{type:'string'}}})}});
export const ASSISTANT_SCHEMAS=Object.freeze({
 protocol:ASSISTANT_PROTOCOL,
 question:object({scope,conversationId:id,requestId:id,question:{type:'string',minLength:1,maxLength:4000},intent:{enum:ASSISTANT_INTENTS},draft},['scope','conversationId','requestId','question','intent']),
 reset:object({scope,conversationId:id,requestId:id}),
 reconciliation:object({scope,requestId:id}),
 modelOutput:ASSISTANT_OUTPUT_SCHEMA,
 constraints:['Draft fields are allowed only in draft scope.','All referenced identifiers must exist in the frozen registry.','Nonempty strings must contain non-whitespace text.','Questions are at most 32 KiB and draft input at most 16 KiB.','All model output is unverified interpretation.'],
});
