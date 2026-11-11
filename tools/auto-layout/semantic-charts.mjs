import {isDeepStrictEqual as equal} from 'node:util';
import {layoutIssue,hash} from './semantic-input.mjs';
import {wrapExact,textFrameHeight} from './semantic-composition.mjs';
const identity=p=>JSON.stringify([p.artifactId,p.chartId,p.dataHash,p.admissionHash]);
const ref=p=>Object.fromEntries(['occurrenceId','artifactId','chartId','dataHash','admissionHash','pageIntentId'].map(k=>[k,p[k]]));
export const CHART_METADATA_MIN_SIZE=16;
export const NUMERIC_COMPOSITION_VERSION='font-metric-regions-v1';
const legacyGeometries={
 editorial:{chart:{x:60,y:135,w:270,h:500},text:{x:370,y:120,w:850,h:580},columns:3,gap:18},
 stage:{chart:{x:60,y:80,w:1160,h:150},text:{x:60,y:240,w:1160,h:460},columns:4,gap:24},
 evidence:{chart:{x:60,y:120,w:300,h:540},text:{x:405,y:120,w:815,h:580},columns:3,gap:16},
};
function geometry(style,version){
 const legacy=legacyGeometries[style];if(!legacy)return null;
 if(version===null){const{chart,text,columns,gap}=legacy,w=(text.w-gap*(columns-1))/columns;return{chart,regions:Array.from({length:columns},(_,c)=>({x:text.x+c*(w+gap),y:text.y,w,h:text.h}))};}
 if(version!==NUMERIC_COMPOSITION_VERSION)layoutIssue('SEMANTIC_CHART_COMPOSITION_VERSION',{style,owner:'layout-lead',pointer:'/numericCompositionVersion'},'Known numeric composition version required');
 const gap={editorial:18,stage:24,evidence:16}[style],first=340,w=Math.floor((1160-first-3*gap)/3);
 return{chart:{x:60,y:55,w:first,h:230},regions:[{x:60,y:300,w:first,h:400},...Array.from({length:3},(_,c)=>({x:60+first+gap+c*(w+gap),y:55,w,h:645}))]};
}
const chartLocation=(graph,p,style,originIds=p.visibleBlockRefs.map(r=>r.originId))=>{
 const chart=graph.chartsByIdentity[identity(p)],r=chart?.requirements.find(r=>originIds.includes(r.originId)),row=graph.sourceLocations.find(row=>row.originId===r?.originId);
 return {style,intentId:p.pageIntentId,artifactId:r?.source?.artifactId??p.artifactId,pointer:r?.source?.pointer??'/chartPlacements',owner:r?.owner??'content-author',originIds,blockIds:[...new Set(p.visibleBlockRefs.map(r=>r.blockId))],sourceLocation:row,contentHash:graph.contentBinding.manuscriptHash};
};
export function measureChartPage(input,p,style,ctx,version=NUMERIC_COMPOSITION_VERSION){
 const graph=input.semantic,g=geometry(style,version),loc=chartLocation(graph,p,style);
 if(!g)layoutIssue('SEMANTIC_STYLE_UNSUPPORTED',loc,'Known chart composition style required');
 const chart=graph.chartsByIdentity[identity(p)];
 if(!chart)layoutIssue('SEMANTIC_CHART_REFERENCE_CHANGED',loc,'Exact admitted chart reference required');
 const size=CHART_METADATA_MIN_SIZE;
 ctx.font=`400 ${size}px "${input.brand.font.family}"`;
 const blocks=[...new Set(p.visibleBlockRefs.map(r=>r.blockId))].map(blockId=>{
  const b=graph.blocksById[blockId],refs=p.visibleBlockRefs.filter(r=>r.blockId===blockId),origins=refs.map(r=>r.originId),location=chartLocation(graph,p,style,origins);
  const measured=g.regions.map(region=>{const wrapped=wrapExact(ctx,b.text,region.w-6,location,'SEMANTIC_CHART_ATOM_OVERFLOW');return{wrapped,h:version===null?wrapped.lines*size*1.28:textFrameHeight(ctx,wrapped)};});
  return {blockId,b,refs,location,measured};
 });
 const prefixes=g.regions.map((_,c)=>{const prefix=[0];for(const b of blocks)prefix.push(prefix.at(-1)+b.measured[c].h+4);return prefix;});
 const dp=Array.from({length:g.regions.length+1},()=>Array(blocks.length+1).fill(Infinity)),cuts=dp.map(row=>row.map(()=>null));dp[0][0]=0;
 for(let c=1;c<=g.regions.length;c++)for(let end=1;end<=blocks.length;end++)for(let start=0;start<end;start++){
  const prefix=prefixes[c-1],required=Math.max(dp[c-1][start],(prefix[end]-prefix[start]-4)/(version===null?1:g.regions[c-1].h));
  if(required<dp[c][end]){dp[c][end]=required;cuts[c][end]=start;}
 }
 const count=Math.min(g.regions.length,blocks.length),requiredRatio=dp[count][blocks.length];
 if(requiredRatio>(version===null?g.regions[0].h:1)){const b=blocks.at(-1);layoutIssue('SEMANTIC_CHART_ATOM_OVERFLOW',b?.location??loc,'The chart and every distinct local clause cannot fit on one slide at the readable floor',{fontSize:size,minimumFontSize:CHART_METADATA_MIN_SIZE,requiredRatio,regions:g.regions,columns:g.regions.length,chartRegion:g.chart});}
 const ranges=[];let end=blocks.length;for(let c=count;c>0;c--){const start=cuts[c][end];ranges.unshift({start,end});end=start;}
 const columns=ranges.map(({start,end},column)=>{
  let height=0;const elements=[];
  for(const {blockId,b,refs,measured}of blocks.slice(start,end)){
   const {wrapped,h}=measured[column],w=g.regions[column].w;
   elements.push({type:'text',text:wrapped.text,sourceText:b.text,wrapBreaks:wrapped.wrapBreaks,x:g.regions[column].x,y:g.regions[column].y+height,w,h,size,role:'caption',color:style==='stage'?input.brand.colors.paper:input.brand.colors.ink,lineSpacing:1.15,contentRefs:{blockIds:[blockId],imageIds:[],sourceIds:b.sourceIds,claimOrigins:b.claimOrigins,obligationOrigins:b.originIds,chartOccurrenceId:p.occurrenceId,chartMetadata:refs.map(r=>({...r}))}});
   height+=h+4;
  }
  return {height,elements};
 });
 const elements=[{type:'chart',chartRef:ref(p),metadataOrigins:p.visibleBlockRefs.map(r=>r.originId),...g.chart,minimumLabelSize:16},...columns.flatMap(c=>c.elements)];
 for(const [index,e]of elements.entries()){if(version!==null)for(const key of ['x','y','w','h'])e[key]=Math.round(e[key]*9525)/9525;e.id=e.occurrenceId=`chart-element-${hash({occurrence:p.occurrenceId,style,index,refs:e.contentRefs??e.chartRef}).slice(0,24)}`;}
 return {id:`${p.pageIntentId}/chart-${p.occurrenceId}`,originId:p.pageIntentId,template:`${style}.numeric-chart`,background:style==='stage'?input.brand.colors.primary:input.brand.colors.paper,notes:'',elements};
}
export function validateNumericChartPlan(input,plan,ctx){
 const graph=input.semantic;
 if(graph.manuscriptVersion!=='complete-manuscript-v3')return;
 const placements=graph.chartPlacements,charts=plan.slides.flatMap((slide,index)=>slide.elements.filter(e=>e.type==='chart').map(element=>({slide,index,element})));
 for(const p of placements){
  const loc=chartLocation(graph,p,plan.style),matches=charts.filter(c=>c.element.chartRef?.occurrenceId===p.occurrenceId);
  if(matches.length!==1)layoutIssue('SEMANTIC_CHART_OCCURRENCE_COVERAGE',loc,'Every authored occurrence needs exactly one actual slide chart',{actual:matches.length});
  const {slide,element}=matches[0],expected=measureChartPage(input,p,plan.style,ctx,plan.numericCompositionVersion??null);
  if(!equal(element,expected.elements[0]))layoutIssue('SEMANTIC_CHART_REFERENCE_CHANGED',loc,'Only exact immutable chart references and measured geometry are allowed');
  const metadata=slide.elements.filter(e=>e.contentRefs?.chartOccurrenceId===p.occurrenceId);
  if(!equal(metadata,expected.elements.slice(1)))layoutIssue('SEMANTIC_CHART_METADATA_CHANGED',loc,'Every exact readable metadata block and its original spans must remain on the actual chart slide');
  for(const r of p.visibleBlockRefs){
   const e=metadata.find(e=>e.contentRefs.chartMetadata.some(v=>equal(v,r))),requirement=graph.chartsByIdentity[identity(p)].requirements.find(q=>q.originId===r.originId);
   if(!e||e.sourceText.slice(r.start,r.end)!==requirement.text||e.size<CHART_METADATA_MIN_SIZE)layoutIssue('SEMANTIC_CHART_METADATA_PAGE',chartLocation(graph,p,plan.style,[r.originId]),'Chart metadata must remain exact and readable on its own actual slide');
  }
 }
 if(charts.length!==placements.length)layoutIssue('SEMANTIC_CHART_OCCURRENCE_COVERAGE',{owner:'layout-lead',pointer:'/slides'},'Unexpected or duplicate chart occurrences cannot be added');
 if(plan.contentBinding?.sourceHash!==graph.contentBinding.sourceHash||plan.contentBinding?.manuscriptHash!==hash(graph.manuscript))layoutIssue('SEMANTIC_CHART_PLAN_STALE',{owner:'layout-lead',pointer:'/contentBinding'},'Plan must retain exact current source and manuscript identities');
}
