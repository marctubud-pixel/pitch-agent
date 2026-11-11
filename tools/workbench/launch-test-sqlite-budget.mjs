import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
function size(value){if(value===null||value===undefined)return 0;if(typeof value==='string')return Buffer.byteLength(value);if(ArrayBuffer.isView(value))return value.byteLength;if(typeof value==='number'||typeof value==='bigint')return 8;if(Array.isArray(value))return value.reduce((n,x)=>n+size(x),0);if(typeof value==='object')return Object.entries(value).reduce((n,[k,v])=>n+Buffer.byteLength(k)+size(v),0);return 0;}
export function installSqliteBudget(path){
 const charge=(kind,bytes)=>{const record=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{boundBytes:0,returnedBytes:0,operations:0,limit:256*1024*1024};if(record.boundBytes+record.returnedBytes+bytes>record.limit)throw new Error('Owned logical SQLite traffic exceeds 256 MiB');record[kind]+=bytes;record.operations++;writeFileSync(path,JSON.stringify(record));};
 const prepare=DatabaseSync.prototype.prepare;
 DatabaseSync.prototype.prepare=function(...args){const statement=prepare.apply(this,args);for(const name of ['run','get','all']){const method=statement[name];statement[name]=function(...values){charge('boundBytes',size(values));const result=method.apply(this,values);if(name!=='run')charge('returnedBytes',size(result));return result;};}return statement;};
}
