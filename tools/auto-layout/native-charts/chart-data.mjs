import {createHash} from 'node:crypto';

export class ChartDataError extends Error {
  constructor(code, path, message) { super(`${code} ${path}: ${message}`); this.code=code; this.path=path; }
}
const fail=(code,path,message)=>{throw new ChartDataError(code,path,message);};
export function canonical(value) {
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
export const textDigest=text=>createHash('sha256').update(text,'utf8').digest('hex');
function object(v,keys,path) {
  if(!v || typeof v!=='object' || Array.isArray(v) || Object.keys(v).sort().join('|')!==[...keys].sort().join('|')) fail('CHART_SHAPE',path,`expected keys ${keys.join(',')}`);
}
function str(v,path,max=1000) { if(typeof v!=='string'||!v.length||v.length>max||(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(v)||!v.isWellFormed())) fail('CHART_TEXT',path,'nonempty bounded XML-safe string required'); return v; }
function id(v,path) { str(v,path,80); if(!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v)) fail('CHART_ID',path,'stable ASCII id required'); }
function list(v,path,min,max) { if(!Array.isArray(v)||v.length<min||v.length>max) fail('CHART_SHAPE',path,`array length ${min}..${max} required`); }
function unique(values,path) { if(new Set(values).size!==values.length) fail('CHART_DUPLICATE_ID',path,'ids must be unique'); }
function normalizeDecimal(v,path) {
  if(typeof v!=='string'||v.length>64||! /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(v)) fail('CHART_DECIMAL',path,'plain exact decimal string required');
  const [integer,fraction='']=v.split('.'); const trimmed=fraction.replace(/0+$/,'');
  const n=integer+(trimmed?`.${trimmed}`:'');
  if(n==='-0') fail('CHART_DECIMAL',path,'negative zero unsupported');
  return n;
}
function expandNumber(v) {
  const s=String(v); if(!/[eE]/.test(s)) return s;
  const [base,exponent]=s.split(/[eE]/); const negative=base.startsWith('-'); const digits=base.replace('-','').replace('.','');
  const offset=(base.replace('-','').split('.')[0].length)+Number(exponent);
  return (negative?'-':'')+(offset<=0?'0.'+'0'.repeat(-offset)+digits:offset>=digits.length?digits+'0'.repeat(offset-digits.length):digits.slice(0,offset)+'.'+digits.slice(offset));
}
export function decimalNumber(v,path='decimal') {
  const normalized=normalizeDecimal(v,path); const n=Number(v);
  if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER||normalizeDecimal(expandNumber(n),path)!==normalized) fail('CHART_PRECISION',path,'native number serialization must preserve exact decimal value');
  return n;
}
function divide100(v,path) {
  normalizeDecimal(v,path); const negative=v.startsWith('-'); const [i,f='']=v.replace('-','').split('.');
  let digits=(i+f).padStart(f.length+3,'0'); const cut=digits.length-f.length-2;
  return normalizeDecimal((negative?'-':'')+(digits.slice(0,cut).replace(/^0+(?=\d)/,'')||'0')+'.'+digits.slice(cut),path);
}
function freeze(value) { if(value&&typeof value==='object'){ Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

/** Pure trust boundary. Sources are immutable original UTF-8 text supplied by the caller. */
export function parseChartEvidence(raw,sourceCatalog) {
  object(raw,['schema','charts'],'catalog'); if(raw.schema!=='chart-data-v1') fail('CHART_VERSION','catalog.schema','chart-data-v1 required');
  list(sourceCatalog,'sources',1,100); const sources=new Map();
  for(const [i,s] of sourceCatalog.entries()) {
    const p=`sources[${i}]`; object(s,['sourceId','text','sha256','kind'],p); id(s.sourceId,p); str(s.text,p+'.text',1000000);
    if(!['synthetic-engineering-fixture','captured-source'].includes(s.kind)||s.sha256!==textDigest(s.text)) fail('CHART_SOURCE_HASH',p,'source bytes/hash or kind mismatch');
    if(sources.has(s.sourceId)) fail('CHART_DUPLICATE_ID',p,'duplicate source'); sources.set(s.sourceId,s);
  }
  function evidence(e,expected,p) {
    object(e,['sourceId','sourceHash','indexing','start','end','text'],p); const source=sources.get(e.sourceId);
    if(!source||source.sha256!==e.sourceHash) fail('CHART_SOURCE_HASH',p,'unknown or changed original source');
    if(e.indexing!=='utf16'||!Number.isSafeInteger(e.start)||!Number.isSafeInteger(e.end)||e.start<0||e.end<=e.start||e.end>source.text.length) fail('CHART_LOCATOR',p,'bounded UTF-16 offsets required');
    const boundary=n=>n===0||n===source.text.length||!(source.text.charCodeAt(n)>=0xdc00&&source.text.charCodeAt(n)<=0xdfff&&source.text.charCodeAt(n-1)>=0xd800&&source.text.charCodeAt(n-1)<=0xdbff);
    if(!boundary(e.start)||!boundary(e.end)||source.text.slice(e.start,e.end)!==e.text||e.text!==expected) fail('CHART_LOCATOR',p,'original excerpt must equal declared literal');
  }
  const bound=(v,p)=>{object(v,['text','evidence'],p);str(v.text,p);evidence(v.evidence,v.text,p+'.evidence');return v.text;};
  list(raw.charts,'charts',1,32); unique(raw.charts.map(x=>x?.chartId),'charts'); const charts=[];
  for(const [ci,c] of raw.charts.entries()) {
    const p=`charts[${ci}]`; object(c,['chartId','type','direction','title','unit','period','population','limitations','categoryCount','seriesCount','categories','series','numberFormat'],p); id(c.chartId,p+'.chartId');
    if(!['bar','line'].includes(c.type)||!['column','bar'].includes(c.direction)||(c.type==='line'&&c.direction!=='column')) fail('CHART_UNSUPPORTED_TYPE',p,'ordinary bar/column and line only');
    const title=bound(c.title,p+'.title'),period=bound(c.period,p+'.period'),population=bound(c.population,p+'.population');
    object(c.unit,['kind','label'],p+'.unit'); if(!['decimal','count','ratio'].includes(c.unit.kind)) fail('CHART_UNIT',p,'single decimal/count/ratio unit required'); const unit=bound(c.unit.label,p+'.unit.label');
    const formats={decimal:['0','0.0','0.00','0.000'],count:['0'],ratio:['0%','0.0%','0.00%']};
    if(!formats[c.unit.kind].includes(c.numberFormat)) fail('CHART_FORMAT',p,'explicit supported format for unit required');
    list(c.limitations,p+'.limitations',1,16); const limitations=c.limitations.map((x,i)=>bound(x,`${p}.limitations[${i}]`));
    list(c.categories,p+'.categories',1,100);list(c.series,p+'.series',1,16);
    if(c.categoryCount!==c.categories.length||c.seriesCount!==c.series.length) fail('CHART_MATRIX',p,'declared counts must match complete matrix');
    unique(c.categories.map(x=>x?.categoryId),p+'.categories');unique(c.series.map(x=>x?.seriesId),p+'.series');
    const categories=c.categories.map((x,i)=>{object(x,['categoryId','label'],p+'.categories');id(x.categoryId,p);return {categoryId:x.categoryId,label:bound(x.label,`${p}.categories[${i}].label`)};});
    const series=c.series.map((s,si)=>{
      const sp=`${p}.series[${si}]`;object(s,['seriesId','name','values'],sp);id(s.seriesId,sp);const name=bound(s.name,sp+'.name');list(s.values,sp+'.values',c.categoryCount,c.categoryCount);
      const decimals=s.values.map((cell,vi)=>{
        const vp=`${sp}.values[${vi}]`;object(cell,['decimal','lexeme','conversion','evidence'],vp);str(cell.lexeme,vp+'.lexeme',70);evidence(cell.evidence,cell.lexeme,vp+'.evidence');
        const normalized=normalizeDecimal(cell.decimal,vp+'.decimal');
        if(cell.conversion==='identity') {if(normalizeDecimal(cell.lexeme,vp)!==normalized) fail('CHART_CONVERSION',vp,'identity must preserve original value');}
        else if(cell.conversion==='percent-to-ratio-v1'&&c.unit.kind==='ratio'&&cell.lexeme.endsWith('%')) {if(divide100(cell.lexeme.slice(0,-1),vp)!==normalized) fail('CHART_CONVERSION',vp,'explicit percent conversion mismatch');}
        else fail('CHART_CONVERSION',vp,'unknown or incompatible conversion');
        const number=decimalNumber(cell.decimal,vp);if(c.unit.kind==='count'&&!Number.isSafeInteger(number)) fail('CHART_UNIT',vp,'count must be an exact integer');return cell.decimal;
      });
      return {seriesId:s.seriesId,name,decimals,values:decimals.map(x=>decimalNumber(x)),};
    });
    charts.push({chartId:c.chartId,type:c.type,direction:c.direction,title,unit,unitKind:c.unit.kind,period,population,limitations,categories,series,numberFormat:c.numberFormat,dataHash:digest(c)});
  }
  return freeze({schema:'validated-chart-data-v1',catalogDigest:digest(raw),sourcesDigest:digest(sourceCatalog),original:structuredClone(raw),sources:structuredClone(sourceCatalog),charts});
}
