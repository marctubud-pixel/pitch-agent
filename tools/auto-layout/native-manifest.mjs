import {openSync,closeSync,fstatSync,lstatSync,readSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import schema from './native-manifest-slots.json' with {type:'json'};
export const NATIVE_MANIFEST_VERSION=schema.version;
export const NATIVE_MANIFEST_LIMITS=Object.freeze(schema.limits);
const need=(ok,code='NATIVE_MANIFEST_INVALID')=>{if(!ok)throw new Error(code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=bytes=>({sha256:sha(bytes),bytes:bytes.length});
const own=(o,k)=>Object.hasOwn(o,k);
const get=(o,path)=>path.reduce((v,k)=>v&&own(v,k)?v[k]:undefined,o);
const put=(o,path,v)=>{get(o,path.slice(0,-1))[path.at(-1)]=v;};
const closed=(o,keys)=>need(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===[...keys].sort().join('|'));
function policy(request={}){const result={};for(const [k,v]of Object.entries(schema.limits)){result[k]=request[k]??v;need(Number.isSafeInteger(result[k])&&result[k]>0&&result[k]<=v,'NATIVE_MANIFEST_LIMIT');}return result;}
function scan(raw,limit){
 need(raw.length<=limit.encodedBytes,'NATIVE_MANIFEST_LIMIT');
 need(raw.length*6<=limit.workBytes,'NATIVE_MANIFEST_WORK');
 new TextDecoder('utf-8',{fatal:true}).decode(raw);
 const trie=Object.create(null),captures=new Map();
 const paths=[[],['transportVersion'],['expanded'],['root'],['slots']];
 for(const s of schema.slots)for(const p of s.paths)paths.push(['root',...p]);
 for(let i=0;i<6;i++)for(const p of [[],['kind'],['value']])paths.push(['slots',String(i),...p]);
 for(const path of paths){let n=trie;for(const k of path)n=n[k]??=(Object.create(null));n.$=JSON.stringify(path);}
 let pos=0,nodes=0,units=0,whitespace=false;
 const ws=()=>{while([9,10,13,32].includes(raw[pos])){pos++;whitespace=true;}};
 function string(){const start=pos++;let count=0;need(raw[start]===34);while(pos<raw.length){const c=raw[pos++];if(c===34){units+=count;need(units<=limit.utf16,'NATIVE_MANIFEST_LIMIT');return {start,end:pos,units:count};}need(c>=32);if(c===92){const e=raw[pos++];if(e===117){need(/^[0-9a-fA-F]{4}$/.test(raw.toString('ascii',pos,pos+4)));pos+=4;}else need([34,92,47,98,102,110,114,116].includes(e));count++;}else if(c<128)count++;else if(c<224){pos++;count++;}else if(c<240){pos+=2;count++;}else {pos+=3;count+=2;}}need(false);}
 function value(depth,node){ws();need(depth<=limit.depth&&++nodes<=limit.nodes,'NATIVE_MANIFEST_LIMIT');const start=pos,before=nodes,unitStart=units;let maxDepth=1,children=0;
 const c=raw[pos];if(c===34)string();else if(c===123||c===91){pos++;ws();const object=c===123,end=object?125:93,keys=new Set();if(raw[pos]!==end)while(true){let key=String(children);if(object){const token=string();key=JSON.parse(raw.toString('utf8',token.start,token.end));need(!keys.has(key),'NATIVE_MANIFEST_DUPLICATE_KEY');keys.add(key);ws();need(raw[pos++]===58);}const child=value(depth+1,node?.[key]);maxDepth=Math.max(maxDepth,child.depth+1);children++;ws();if(raw[pos]!==44)break;pos++;ws();}need(raw[pos++]===end);}else if(c===116||c===102||c===110){const literal=c===116?'true':c===102?'false':'null';need(raw.toString('ascii',pos,pos+literal.length)===literal);pos+=literal.length;}else {const begin=pos;while(pos<raw.length&&[43,45,46,69,101].includes(raw[pos])||pos<raw.length&&raw[pos]>=48&&raw[pos]<=57)pos++;const token=raw.toString('ascii',begin,pos);need(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)&&Number.isFinite(Number(token)));}
 const result={start,end:pos,bytes:pos-start,nodes:nodes-before+1,utf16:units-unitStart,depth:maxDepth,children};if(node&&own(node,'$'))captures.set(node.$,result);return result;}
 const metrics=value(1,trie);ws();need(pos===raw.length);return {metrics,captures,whitespace};
}
export function readNativeManifest(input,expectedIdentity,requested={}){
 need(Buffer.isBuffer(input),'NATIVE_MANIFEST_BYTES_REQUIRED');
 const raw=input,limit=policy(requested),checked=scan(raw,limit),transport=identity(raw);
 if(expectedIdentity)need(transport.sha256===expectedIdentity.sha256&&(expectedIdentity.bytes??expectedIdentity.byteLength??transport.bytes)===transport.bytes,'NATIVE_MANIFEST_IDENTITY');
 const cap=path=>checked.captures.get(JSON.stringify(path));
 if(!cap(['transportVersion']))return {transport,original:transport,manifest:JSON.parse(raw.toString('utf8')),transportVersion:null};
 need(!checked.whitespace,'NATIVE_MANIFEST_WIRE_WHITESPACE');
 const token=path=>{const m=cap(path);need(m);return JSON.parse(raw.toString('utf8',m.start,m.end));};
 need(checked.metrics.children===4&&token(['transportVersion'])===schema.version);
 const declared=token(['expanded']);closed(declared,['sha256','bytes','nodes','utf16','depth']);
 need(typeof declared.sha256==='string'&&/^[a-f0-9]{64}$/.test(declared.sha256));
 const root=cap(['root']),slots=cap(['slots']);need(root&&slots&&slots.children<=6&&raw[root.start]===123&&raw[slots.start]===91);
 const expanded={bytes:root.bytes,nodes:root.nodes,utf16:root.utf16,depth:root.depth},replacements=[];let previous=-1;
 const selected=new Set();
 for(let i=0;i<slots.children;i++){
  need(cap(['slots',String(i)])?.children===2);const kind=token(['slots',String(i),'kind']),index=schema.slots.findIndex(s=>s.kind===kind);need(index>previous);previous=index;selected.add(kind);const v=cap(['slots',String(i),'value']);need(v&&raw.toString('ascii',v.start,v.end)!=='null');
  for(const path of schema.slots[index].paths){const target=cap(['root',...path]);need(target&&raw.toString('ascii',target.start,target.end)==='null');replacements.push({target,value:v});expanded.bytes+=v.bytes-4;expanded.nodes+=v.nodes-1;expanded.utf16+=v.utf16;expanded.depth=Math.max(expanded.depth,path.length+v.depth);}
 }
 for(const slot of schema.slots)if(!selected.has(slot.kind))for(const p of slot.paths){const t=cap(['root',...p]);need(!t||raw.toString('ascii',t.start,t.end)!=='null');}
 for(const k of ['bytes','nodes','utf16','depth'])need(Number.isSafeInteger(declared[k])&&declared[k]===expanded[k]&&expanded[k]<=(k==='bytes'?limit.expandedBytes:limit[k]),'NATIVE_MANIFEST_EXPANSION_LIMIT');
 need(raw.length*6+expanded.bytes*4<=limit.workBytes&&checked.metrics.nodes+expanded.nodes*3<=limit.workNodes,'NATIVE_MANIFEST_WORK');
 replacements.sort((a,b)=>a.target.start-b.target.start);
 const hash=createHash('sha256');let offset=root.start;
 const spans=[];for(const r of replacements){spans.push([offset,r.target.start],[r.value.start,r.value.end]);offset=r.target.end;}spans.push([offset,root.end]);
 for(const [a,b]of spans)hash.update(raw.subarray(a,b));need(hash.digest('hex')===declared.sha256,'NATIVE_MANIFEST_EXPANDED_IDENTITY');
 const bytes=Buffer.allocUnsafe(expanded.bytes);let cursor=0;for(const [a,b]of spans){raw.copy(bytes,cursor,a,b);cursor+=b-a;}need(cursor===expanded.bytes);
 return {transport,original:{sha256:declared.sha256,bytes:expanded.bytes},manifest:JSON.parse(bytes.toString('utf8')),transportVersion:schema.version,metrics:expanded};
}
export function readNativeManifestFile(path,expectedIdentity,requested={}){
 const limit=policy(requested),fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const before=fstatSync(fd);need(before.isFile()&&before.size<=limit.encodedBytes,'NATIVE_MANIFEST_LIMIT');const raw=Buffer.alloc(before.size+1);let n=0,count;while(n<raw.length&&(count=readSync(fd,raw,n,raw.length-n,null))>0)n+=count;const after=fstatSync(fd),terminal=lstatSync(path);need(terminal.isFile()&&!terminal.isSymbolicLink()&&terminal.dev===before.dev&&terminal.ino===before.ino&&n===before.size&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'NATIVE_MANIFEST_CHANGED');return {...readNativeManifest(raw.subarray(0,n),expectedIdentity,requested),raw:raw.subarray(0,n)};}finally{closeSync(fd);}
}
function measureOwned(value){
 const limit=schema.limits,active=new Set();let nodes=0,utf16=0,bytes=0,maxDepth=0;
 const add=n=>{bytes+=n;need(bytes<=limit.expandedBytes,'NATIVE_MANIFEST_EXPANSION_LIMIT');};
 const string=s=>{utf16+=s.length;need(utf16<=limit.utf16,'NATIVE_MANIFEST_EXPANSION_LIMIT');add(2);for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c===34||c===92)add(2);else if(c<32)add([8,9,10,12,13].includes(c)?2:6);else if(c<128)add(1);else if(c<2048)add(2);else if(c>=0xd800&&c<=0xdbff&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){add(4);i++;}else add(c>=0xd800&&c<=0xdfff?6:3);}};
 const walk=(v,depth)=>{need(++nodes<=limit.nodes&&depth<=limit.depth,'NATIVE_MANIFEST_EXPANSION_LIMIT');maxDepth=Math.max(maxDepth,depth);if(typeof v==='string')string(v);else if(v===null)add(4);else if(typeof v==='boolean')add(v?4:5);else if(typeof v==='number'){need(Number.isFinite(v));add(JSON.stringify(v).length);}else{need(v&&typeof v==='object'&&!active.has(v));active.add(v);const array=Array.isArray(v),keys=Object.keys(v);need(!array||keys.length===v.length);add(2+Math.max(0,keys.length-1));for(const key of keys){if(!array){string(key);add(1);}walk(v[key],depth+1);}active.delete(v);}};
 walk(value,1);return {nodes,utf16,bytes,depth:maxDepth};
}
export function encodeNativeManifest(manifest){
 const measured={metrics:measureOwned(manifest)};
 const original=Buffer.from(JSON.stringify(manifest));
 need(original.length===measured.metrics.bytes,'NATIVE_MANIFEST_WRITER_CHANGED');
 const root=JSON.parse(original),slots=[];
 for(const slot of schema.slots){const [a,b]=slot.paths.map(p=>get(root,p));if(a!==undefined&&a!==null&&JSON.stringify(a)===JSON.stringify(b)){slots.push({kind:slot.kind,value:a});for(const p of slot.paths)put(root,p,null);}}
 const expanded={...identity(original),nodes:measured.metrics.nodes,utf16:measured.metrics.utf16,depth:measured.metrics.depth};
 const envelope={transportVersion:schema.version,expanded,root,slots};
 need(measureOwned(envelope).bytes<=schema.limits.encodedBytes,'NATIVE_MANIFEST_LIMIT');
 const raw=Buffer.from(JSON.stringify(envelope));
 const result=readNativeManifest(raw);need(result.original.sha256===sha(original),'NATIVE_MANIFEST_WRITER_CHANGED');return raw;
}
