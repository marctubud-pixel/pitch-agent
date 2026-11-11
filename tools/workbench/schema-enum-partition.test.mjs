import test from 'node:test';
import assert from 'node:assert/strict';
import {partitionEvidenceSchema,expandPartitionedEnumSchema,verifyPartitionedSchema,evidenceSchemaBudget} from './schema-enum-partition.mjs';
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const norm=value=>Array.isArray(value)?value.map(norm):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='enum'&&Array.isArray(v)?[...new Set(v)].sort():norm(v)])):value;
test('disjoint enum partitions retain exact overlapping sets and literal property names',()=>{
 const schema=obj({enum:{type:'string',enum:['a','b']},$defs:{type:'string',enum:['b','c']},nested:{type:'array',items:obj({choice:{type:'string',enum:['c','a']}})}});
 const result=partitionEvidenceSchema(schema);assert.deepEqual(norm(expandPartitionedEnumSchema(result.outputSchema)),norm(schema));assert.equal(result.proof.enumValues,3);assert(result.outputSchema.$defs);
 for(const mutate of [s=>Object.values(s.$defs)[0].enum.push('unauthorized'),s=>delete s.$defs.g0,s=>s.properties.enum.anyOf[0].$ref='https://example.test/schema']){const changed=structuredClone(result.outputSchema);mutate(changed);assert.throws(()=>verifyPartitionedSchema(changed,schema),{code:'EVIDENCE_SCHEMA_BUDGET_EXCEEDED'});}
 assert.throws(()=>partitionEvidenceSchema({$ref:'https://example.test/schema'}),{code:'EVIDENCE_SCHEMA_BUDGET_EXCEEDED'});
 assert.throws(()=>evidenceSchemaBudget({$ref:'#/$defs/g0',$defs:{g0:{$ref:'#/$defs/g0'}}}),{code:'EVIDENCE_SCHEMA_BUDGET_EXCEEDED'});
});
test('schema budgets reject overflow without removing choices or constraints',()=>{
 const values=Array.from({length:1000},(_,i)=>'v'+i);assert.equal(partitionEvidenceSchema(obj({choice:{type:'string',enum:values}})).proof.enumValues,1000);
 assert.throws(()=>partitionEvidenceSchema(obj({choice:{type:'string',enum:[...values,'overflow']}})),{code:'EVIDENCE_SCHEMA_BUDGET_EXCEEDED'});
 assert.throws(()=>evidenceSchemaBudget(obj(Object.fromEntries(Array.from({length:5001},(_,i)=>['p'+i,{type:'string'}])))),{code:'EVIDENCE_SCHEMA_BUDGET_EXCEEDED'});
 assert.throws(()=>evidenceSchemaBudget(obj({['x'.repeat(120001)]:{type:'string'}})),{code:'EVIDENCE_SCHEMA_BUDGET_EXCEEDED'});
 assert.throws(()=>evidenceSchemaBudget({type:'string',enum:Array.from({length:251},(_,i)=>String(i).padStart(61,'x'))}),{code:'EVIDENCE_SCHEMA_BUDGET_EXCEEDED'});
 const nested=n=>n?obj({child:nested(n-1)}):{type:'string'};assert.equal(evidenceSchemaBudget(nested(10)).logicalDepth,10);assert.throws(()=>evidenceSchemaBudget(nested(11)),{code:'EVIDENCE_SCHEMA_BUDGET_EXCEEDED'});
});
