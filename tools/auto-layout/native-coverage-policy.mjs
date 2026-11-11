import policy from './native-coverage-policy.json' with {type:'json'};
import {isDeepStrictEqual as equal} from 'node:util';
export const coveragePolicy=Object.freeze(policy);
const need=(ok,code)=>{if(!ok)throw new Error(code);};
export function coverageOutputLimit(checked){return checked.transportVersion?coveragePolicy.completeNumericOutputBytes:coveragePolicy.legacyNumericOutputBytes;}
export function checkNumericCoverage(report,checked){
 const transported=Boolean(checked.transportVersion);
 need(report.schemaVersion===(transported?coveragePolicy.completeVersion:coveragePolicy.semanticVersion),'NATIVE_COVERAGE_VERSION_TUPLE');
 if(transported)need(report.semanticCoverageVersion===coveragePolicy.semanticVersion&&equal(report.layoutTransport,checked.transport)&&equal(report.layoutOriginal,checked.original),'NATIVE_COVERAGE_VERSION_TUPLE');
 else need(!Object.hasOwn(report,'semanticCoverageVersion')&&!Object.hasOwn(report,'layoutTransport')&&!Object.hasOwn(report,'layoutOriginal'),'NATIVE_COVERAGE_VERSION_TUPLE');
}
export function anchorCoverageLimit(anchor,legacyLimit){
 if(!Object.hasOwn(anchor,'coverageSchemaVersion'))return legacyLimit;
 need(anchor.protocol==='project-native-proof-v2'&&anchor.coverageSchemaVersion===coveragePolicy.completeVersion,'NATIVE_COVERAGE_VERSION_TUPLE');
 return coveragePolicy.completeNumericOutputBytes;
}
export function jsonWireSize(value,limit,code='NATIVE_COVERAGE_OUTPUT_BOUND'){
 let total=0;
 const add=n=>{total+=n;need(total<=limit,code);};
 const string=value=>{
  add(2);
  for(let i=0;i<value.length;i++){
   const code=value.charCodeAt(i);
   if(code===34||code===92)add(2);
   else if(code<32)add([8,9,10,12,13].includes(code)?2:6);
   else if(code<128)add(1);
   else if(code<2048)add(2);
   else if(code>=0xd800&&code<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){add(4);i++;}
   else add(code>=0xd800&&code<=0xdfff?6:3);
  }
 };
 const walk=value=>{if(typeof value==='string')string(value);else if(Array.isArray(value)){add(2+Math.max(0,value.length-1));for(const item of value)walk(item);}else if(value&&typeof value==='object'){const keys=Object.keys(value);add(2+Math.max(0,keys.length-1));for(const key of keys){string(key);add(1);walk(value[key]);}}else add(JSON.stringify(value).length);};
 walk(value);return total;
}
