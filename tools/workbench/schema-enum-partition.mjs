import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
const fail=message=>{throw Object.assign(Error(message),{code:'EVIDENCE_SCHEMA_BUDGET_EXCEEDED'});};
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
function children(node){return [...Object.values(node.properties??{}),...Object.values(node.$defs??{}),...(node.items?[node.items]:[]),...(node.anyOf??[])];}
function traverse(node,visit,depth=0,count={nodes:0}){
 if(++count.nodes>100000||depth>64||!node||typeof node!=='object'||Array.isArray(node))fail('Selection schema exceeds local traversal budget');
 visit(node);for(const child of children(node))traverse(child,visit,depth+1,count);
}
function mapChildren(node,map){return Object.fromEntries(Object.entries(node).map(([k,v])=>[k,['properties','$defs'].includes(k)?Object.fromEntries(Object.entries(v).map(([name,s])=>[name,map(s)])):k==='items'?map(v):k==='anyOf'?v.map(map):structuredClone(v)]));}
export function evidenceSchemaBudget(schema){
 let enumValues=0,properties=0,characters=0;
 traverse(schema,node=>{
  if(Array.isArray(node))return;
  if(node.properties){properties+=Object.keys(node.properties).length;characters+=Object.keys(node.properties).reduce((n,k)=>n+k.length,0);}
  if(node.$defs)characters+=Object.keys(node.$defs).reduce((n,k)=>n+k.length,0);
  if(node.const!==undefined)characters+=String(node.const).length;
  if(node.enum){if(!Array.isArray(node.enum)||node.enum.some(v=>typeof v!=='string'))fail('String-only selection enums required');enumValues+=node.enum.length;const n=node.enum.reduce((n,v)=>n+v.length,0);characters+=n;if(node.enum.length>250&&n>15000)fail('A selection enum exceeds the documented string budget');}
 });
 const logicalDepth=(node,depth=0)=>{if(node.$ref){const name=node.$ref.match(/^#\/\$defs\/(g[0-9]+)$/)?.[1];const atom=name&&schema.$defs?.[name];if(!atom||Object.keys(atom).sort().join('|')!=='enum|type'||atom.type!=='string'||!Array.isArray(atom.enum))fail('Unknown or cyclic schema reference');return depth;}const next=depth+(['object','array'].includes(node.type)?1:0);return Math.max(next,...Object.values(node.properties??{}).map(s=>logicalDepth(s,next)),...(node.items?[logicalDepth(node.items,next)]:[]),...(node.anyOf??[]).map(s=>logicalDepth(s,next)));};
 const depth=logicalDepth(schema);
 if(depth>10)fail('Selection schema exceeds the documented nesting budget');
 if(enumValues>1000||properties>5000||characters>120000)fail('Selection schema exceeds the documented structured-output budget');
 return {enumValues,properties,stringCharacters:characters,logicalDepth:depth};
}
function normalized(schema){const result=mapChildren(schema,normalized);if(schema.enum)result.enum=[...new Set(schema.enum)].sort();return result;}
export function expandPartitionedEnumSchema(schema){
 const definitions=schema.$defs??{};
 const expand=value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Invalid schema node');
  const refs=value.anyOf;
  if(value.type==='string'&&Array.isArray(refs)&&refs.length&&refs.every(ref=>ref&&Object.keys(ref).length===1&&typeof ref.$ref==='string'&&/^#\/\$defs\/g[0-9]+$/.test(ref.$ref))){
   const values=refs.flatMap(ref=>{const atom=definitions[ref.$ref.slice(8)];if(!atom||Object.keys(atom).sort().join('|')!=='enum|type'||atom.type!=='string'||!Array.isArray(atom.enum))fail('Invalid local enum partition');return atom.enum;});
   const result=mapChildren(Object.fromEntries(Object.entries(value).filter(([k])=>k!=='anyOf')),expand);return {...result,enum:values};
  }
  if(Object.hasOwn(value,'$ref'))fail('Unexpected or external schema reference');
  return mapChildren(Object.fromEntries(Object.entries(value).filter(([k])=>k!=='$defs')),expand);
 };
 return expand(schema);
}
export function verifyPartitionedSchema(wire,expanded){if(!isDeepStrictEqual(normalized(expandPartitionedEnumSchema(wire)),normalized(expanded)))fail('Enum partition changed the selection contract');return evidenceSchemaBudget(wire);}
export function partitionEvidenceSchema(schema){
 const sets=[],indices=new Map(),values=new Set();
 traverse(schema,node=>{
  if(Array.isArray(node))return;
  if(Object.hasOwn(node,'$ref')||Object.hasOwn(node,'$defs'))fail('Unpacked selection contract cannot contain schema references');
  if(node.enum){if(node.type!=='string'||!Array.isArray(node.enum)||node.enum.some(v=>typeof v!=='string')||Object.hasOwn(node,'anyOf'))fail('Unsupported selection enum contract');const key=canonical([...new Set(node.enum)].sort());if(!indices.has(key)){indices.set(key,sets.length);sets.push(new Set(node.enum));}for(const v of node.enum)values.add(v);}
 });
 if(values.size>1000)fail('Distinct selection choices exceed the documented enum budget');
 const groups=new Map();
 for(const value of values){const signature=sets.flatMap((set,i)=>set.has(value)?[i]:[]).join(',');if(!groups.has(signature))groups.set(signature,{indices:new Set(signature.split(',').map(Number)),values:[]});groups.get(signature).values.push(value);}
 const atoms=[...groups.values()].map((group,i)=>({...group,id:'g'+i}));
 const transform=value=>{
  const result=mapChildren(Object.fromEntries(Object.entries(value).filter(([k])=>k!=='enum')),transform);
  if(value.enum){const i=indices.get(canonical([...new Set(value.enum)].sort()));result.anyOf=atoms.filter(atom=>atom.indices.has(i)).map(atom=>({$ref:'#/$defs/'+atom.id}));}
  return result;
 };
 const wire={...transform(schema),$defs:Object.fromEntries(atoms.map(atom=>[atom.id,{type:'string',enum:atom.values}]))};
 const budget=verifyPartitionedSchema(wire,schema);
 return {outputSchema:wire,proof:{version:'disjoint-enum-partitions-v1',expandedSchemaHash:hash(schema),wireSchemaHash:hash(wire),definitions:atoms.length,...budget}};
}
