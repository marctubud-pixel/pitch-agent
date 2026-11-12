import {deriveDeckProjection} from './mapper.mjs';
import {paginateParagraphs,assertGraphemeLineBoundaries} from './pagination';
import {inspectProposalDeckInput,verifyImageByteIdentity,hashBytes,type Method,type Stage,type ProposalDeckInputV2} from './input';
import {compile} from '../deck-studio/engine';
import type {Deck,Draft,Media,Theme} from '../deck-studio/model';
export type Quote={stage:Stage;pointer:string;byteSpan:{start:number;end:number;sourceSha256:string;token:string}};
export type Paragraph={text:string;origins:Quote[];qualifiers:Quote[]};
export type Block={stage:Stage;id:string;title:string;titleOrigins:Quote[];paragraphs:Paragraph[]};
export type Projection={brief:Block[];research:Block[];copy:Block[];strategy:Block[];directions:{directionId:string;blocks:Block[]}[];limitations:Block[];imageOrigins:Record<string,Quote[]>;records:unknown[]};
type RangeBase={stage:Stage;pointer:string;start:number;end:number;unit:'utf16';raw:string};
export type SourceRange=RangeBase&({placement:'body'}|{placement:'heading'|'qualifier';repeated:boolean});
export type SourceMapRow={pageId:string;source:Quote[];images:string[];ranges:SourceRange[];blockId:string};
const chapters={brief:'任务',research:'研究',strategy:'策略',copy:'文案与主题',visual:'视觉开发'};
function quote(input:ProposalDeckInputV2,ref:Quote):string{
 const source=input.sources[ref.stage];if(!source||!ref.pointer.startsWith('/')||/~(?![01])/.test(ref.pointer))throw Error('SOURCE_POINTER_INVALID');
 let value:unknown=JSON.parse(source.original.originalText);
 for(const token of ref.pointer.slice(1).split('/')){const key=token.replaceAll('~1','/').replaceAll('~0','~');if(value===null||typeof value!=='object'||!Object.hasOwn(value,key))throw Error('SOURCE_POINTER_MISSING');value=Object.fromEntries(Object.entries(value))[key];}
 if(typeof value!=='string'||!value.trim())throw Error('SOURCE_QUOTE_REQUIRED');
 const span=ref.byteSpan,bytes=new TextEncoder().encode(source.original.originalText);if(!span||!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<0||span.end<=span.start||span.end>bytes.length)throw Error('SOURCE_BYTE_SPAN_CHANGED');
 const token=new TextDecoder('utf-8',{fatal:true}).decode(bytes.slice(span.start,span.end));if(source.original.sha256!==span.sourceSha256||token!==span.token||JSON.parse(token)!==value)throw Error('SOURCE_BYTE_SPAN_CHANGED');return value;
}
const theme:Theme={primary:'#143F9B',accent:'#08746D',style:'business',mode:'light'};
/** One pass through the existing compiler; grouped source paragraphs use its real capacity. */
export async function buildCandidateDeck(raw:unknown,method:Method,bytes:ReadonlyMap<string,Uint8Array>){
 raw=structuredClone(raw);
 const checked=await inspectProposalDeckInput(raw,method);if(checked.kind!=='descriptors_checked')throw Error('DECK_INPUT_INCOMPLETE');
 const input=checked.input,{projection}=deriveDeckProjection(input),drafts:Draft[]=[],sourceMap:SourceMapRow[]=[],seenHeadings=new Set<string>();
 if(!projection.brief.length||!projection.research.length||projection.strategy.length!==3||projection.directions.length!==3||!projection.limitations.length)throw Error('PROJECTION_INCOMPLETE');
 function headings(refs:Quote[],title:string):SourceRange[]{return refs.map(ref=>{const value=quote(input,ref);if(!title.includes(value.trim()))throw Error('TITLE_SOURCE_OMITTED');const key=ref.stage+ref.pointer,repeated=seenHeadings.has(key);seenHeadings.add(key);return {stage:ref.stage,pointer:ref.pointer,start:0,end:value.length,unit:'utf16',raw:value,placement:'heading',repeated};});}
 function block(value:Block){
  if(!value.paragraphs.length)throw Error('PROJECTION_INCOMPLETE');
  const segments:{start:number;end:number;paragraph:Paragraph}[]=[];let text='';
  for(const p of value.paragraphs){if(!p.origins.length||p.origins.some(ref=>quote(input,ref)!==p.text))throw Error('PROJECTION_BODY_REWRITES_SOURCE');if(text)text+='\n\n';const start=text.length;text+=p.text;segments.push({start,end:text.length,paragraph:p});}
  const makeDraft=(content:string,part:number,sub=''):Draft=>({id:`page-${drafts.length+1}`,title:value.title+(part?` · 续 ${part+1}`:''),eyebrow:chapters[value.stage]+' · '+value.title+(part?' · 续页':''),chapter:chapters[value.stage],caption:'',notes:'',template:{kind:'summary.statement',statement:content.trim(),sub}});
  const fits=(content:string)=>{try{const page=compile([makeDraft(content,0)],'整案静态提案',theme)[0],body=page.nodes.find(n=>n.kind==='text'&&n.lines.join('').replace(/\s/gu,'')===content.replace(/\s/gu,''));if(!body||body.kind!=='text'||body.size<42)return false;assertGraphemeLineBoundaries(body.lines);return true;}catch(error){if(error instanceof Error&&error.message==='UNSUPPORTED_TEMPLATE_GRAPHEME_LINE_SPLIT')throw error;return false;}};
  const fragments=paginateParagraphs(value.paragraphs.map(p=>p.text),fits);
  fragments.forEach((f,part)=>{
   const ranges:SourceRange[]=[];const refs:Quote[]=[];const qualifiers:string[]=[];
   for(const segment of segments){const start=Math.max(f.start,segment.start),end=Math.min(f.end,segment.end);if(end<=start)continue;for(const ref of segment.paragraph.origins){refs.push(ref);ranges.push({stage:ref.stage,pointer:ref.pointer,start:start-segment.start,end:end-segment.start,unit:'utf16',raw:segment.paragraph.text.slice(start-segment.start,end-segment.start),placement:'body'});}}
   for(const [index,segment] of segments.entries()){if(Math.min(f.end,segment.end)<=Math.max(f.start,segment.start))continue;const labels=segment.paragraph.qualifiers.map(ref=>{const text=quote(input,ref);refs.push(ref);ranges.push({stage:ref.stage,pointer:ref.pointer,start:0,end:text.length,unit:'utf16',raw:text,placement:'qualifier',repeated:part>0});return (ref.pointer.endsWith('/verification')?'核验标注 ':'判断类型 ')+text;});if(labels.length)qualifiers.push(`本板块第 ${index+1} 段：`+labels.join('；'));}
   const sub=qualifiers.length?'原稿标注 · '+qualifiers.join(' / '):'';
   const titleRanges=headings(value.titleOrigins,value.title);refs.push(...value.titleOrigins);ranges.push(...titleRanges);
   const draft=makeDraft(f.raw,part,sub);if(sub){const compiled=compile([draft],'整案静态提案',theme)[0];if(!compiled.nodes.some(n=>n.kind==='text'&&n.size>=16&&n.lines.join('').replace(/\s/gu,'')===sub.replace(/\s/gu,'')))throw Error('SOURCE_QUALIFIER_CAPACITY_EXCEEDED');}draft.notes=JSON.stringify({inputIdentity:checked.inputSha256,blockId:value.id,blockRange:{start:f.start,end:f.end,raw:f.raw,separator:'\n\n'},source:refs,ranges,oversizedWord:f.oversizedWord,records:drafts.length===0?projection.records:undefined,originals:drafts.length===0?Object.fromEntries(Object.entries(input.sources).map(([stage,s])=>[stage,s?{identity:s.original.identity,sha256:s.original.sha256,bytes:s.original.bytes}:null])):undefined});
   drafts.push(draft);sourceMap.push({pageId:draft.id,source:refs,images:[],ranges,blockId:value.id});
  });
 }
 projection.brief.forEach(block);projection.research.forEach(block);projection.strategy.forEach(block);projection.copy.forEach(block);
 for(let index=0;index<3;index++){
  const direction=input.directionIds[index],group=projection.directions[index];if(group.directionId!==direction)throw Error('PROJECTION_DIRECTION_MISMATCH');group.blocks.forEach(block);
  for(const d of input.images.filter(d=>d.directionId===direction)){
   const original=bytes.get(d.imageId);if(!original)throw Error('MEDIA_BYTES_MISSING');const snapshot=Uint8Array.from(original);await verifyImageByteIdentity(d,snapshot);let binary='';for(let i=0;i<snapshot.length;i+=8192)binary+=String.fromCharCode(...snapshot.subarray(i,i+8192));
   const image:Media={id:d.imageId,data:`data:${d.mediaType};base64,`+btoa(binary),width:d.width,height:d.height,alt:`${d.kind} · ${d.requiredViews.join(' / ')}`},id=`page-${drafts.length+1}`,title=`方向 ${index+1} · ${d.kind} · ${d.requiredViews.join(' / ')}`,refs=projection.imageOrigins[d.imageId]??[],ranges=headings(refs,title);
   drafts.push({id,title,eyebrow:'视觉开发',chapter:'视觉开发',caption:'',notes:JSON.stringify({inputIdentity:checked.inputSha256,imageId:d.imageId,sha256:d.sha256,locator:d.originalLocator,targetId:d.targetId,kind:d.kind,requiredViews:d.requiredViews,source:refs,ranges}),template:{kind:'design.stage',image,intro:'',points:[]}});sourceMap.push({pageId:id,source:refs,images:[d.imageId],ranges,blockId:'image-'+d.imageId});
  }
 }
 projection.limitations.forEach(block);
 const pages=compile(drafts,'整案静态提案',theme),deck:Deck={title:'整案静态提案',fileName:'proposal.pptx',pages,status:'来源排版预览，未取得终审批准',style:'business'};
 return {deck,sourceMap,inputSha256:checked.inputSha256,deckSha256:await hashBytes(new TextEncoder().encode(JSON.stringify(deck))),admission:'requires-native-source-receiver',physicalOriginalsVerified:false,semanticApproval:false,humanApproval:false};
}
