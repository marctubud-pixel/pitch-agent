import {layoutIssue} from './semantic-input.mjs';

const graphemes=new Intl.Segmenter('und',{granularity:'grapheme'});
const words=new Intl.Segmenter('und',{granularity:'word'});
const opening=/[\p{Ps}\p{Pi}\p{Sc}“‘·]/u;
const closing=/^[\p{Pe}\p{Pf}，。！？、；：,.!?;:%％‰”’…‥·々〻ヽヾゝゞーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/u;
const glue=/[\u00a0\u202f\u2060\ufeff]/u;

export function wrapExact(ctx,source,width,location={},overflowCode='SEMANTIC_UNBREAKABLE_OVERFLOW'){
  const wrapBreaks=[];
  for(const paragraph of source.matchAll(/[^\r\n]+/gu)){
    const value=paragraph[0],start=paragraph.index,protectedBreaks=new Set();
    for(const word of words.segment(value))if(word.isWordLike){
      for(const run of word.segment.matchAll(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu)){
        for(let i=word.index+run.index+1;i<word.index+run.index+run[0].length;i++)protectedBreaks.add(i);
      }
    }
    const clusters=[...graphemes.segment(value)],cuts=[0];
    for(let i=1;i<clusters.length;i++){
      const left=clusters[i-1].segment,right=clusters[i].segment,offset=clusters[i].index;
      if(!protectedBreaks.has(offset)&&!opening.test(left)&&!closing.test(right)&&!glue.test(left+right))cuts.push(offset);
    }
    cuts.push(value.length);
    let lineStart=0,lineEnd=0;
    for(let i=1;i<cuts.length;i++){
      const end=cuts[i],candidate=value.slice(lineStart,end);
      if(ctx.measureText(candidate).width<=width){lineEnd=end;continue;}
      if(lineEnd>lineStart){wrapBreaks.push(start+lineEnd);lineStart=lineEnd;}
      const unit=value.slice(lineStart,end),requiredWidth=ctx.measureText(unit).width;
      if(requiredWidth>width)layoutIssue(overflowCode,location,'Exact unbreakable source text exceeds its readable region',{sourceStart:start+lineStart,sourceEnd:start+end,sourceText:unit,requiredWidth,availableWidth:width,font:ctx.font});
      lineEnd=end;
    }
  }
  let text='',offset=0;
  for(const end of wrapBreaks){text+=source.slice(offset,end)+'\n';offset=end;}
  text+=source.slice(offset);
  return {text,wrapBreaks,lines:text.split(/\r\n|\r|\n/u).length};
}
export function textFrameHeight(ctx,wrapped){
  const metrics=ctx.measureText(wrapped.text);
  const advance=(metrics.fontBoundingBoxAscent+metrics.fontBoundingBoxDescent)*1.15;
  return wrapped.lines*advance+metrics.fontBoundingBoxDescent;
}
export function composition(style,hasImages){
  if(style==='editorial')return {title:{x:60,y:82,w:1160,h:110,size:42},body:{x:hasImages?790:390,y:220,w:hasImages?430:830,h:440},images:{x:60,y:210,w:670,h:440}};
  if(style==='stage')return {title:{x:120,y:76,w:1040,h:105,size:46},body:{x:120,y:215,w:1040,h:hasImages?210:440},images:{x:120,y:450,w:1040,h:210}};
  return {title:hasImages?{x:60,y:80,w:1160,h:105,size:40}:{x:60,y:125,w:350,h:470,size:52},body:{x:hasImages?60:480,y:hasImages?220:150,w:hasImages?610:740,h:hasImages?440:500},images:{x:730,y:220,w:490,h:440}};
}
export function narrativeTextStyle(graph,block){
  const secondary=new Set(['qualification','limitation','restriction','source']);
  const caption=block.originIds.length>0&&block.originIds.every(id=>graph.clausesById[id]||secondary.has(graph.obligationsByOrigin[id]?.kind));
  return caption?{role:'caption',size:16,gap:8}:{role:'body',size:22,gap:16};
}
export function prepareNarrativePages(input,intent,style,ctx){
  const graph=input.semantic;let geo=composition(style,intent.imageIds.length>0);
  const directionDetail=!intent.imageIds.length&&intent.blockIds.some(id=>graph.blocksById[id].originIds.some(origin=>graph.obligationsByOrigin[origin]?.kind==='direction'));
  if(directionDetail)geo={...geo,title:{x:60,y:75,w:1160,h:95,size:42},body:{x:60,y:180,w:1160,h:520}};
  if(style==='editorial'&&intent.central?.kind==='image')geo={...geo,body:{x:670,y:210,w:550,h:440},images:{x:60,y:210,w:550,h:440}};
  if(style==='stage'&&intent.central?.kind==='image')geo={...geo,body:{x:120,y:85,w:1040,h:290},images:{x:120,y:395,w:1040,h:310}};
  const provenance=ids=>{
    const originIds=[...new Set(ids.flatMap(id=>graph.blocksById[id].originIds))];
    const relatedLocations=[intent.location,...originIds.map(id=>graph.obligationsByOrigin[id]).filter(Boolean)].map(location=>({artifactId:location.artifactId,pointer:location.pointer,owner:location.owner,originIds:location.originIds??(location.originId?[location.originId]:originIds),contentHash:location.contentHash??null,sourceHash:location.sourceHash??null,valueHash:location.valueHash??null}));
    return {originIds,relatedLocations};
  };
  const loc={...intent.location,style,blockIds:intent.blockIds,imageIds:intent.imageIds,...provenance(intent.blockIds)};
  const font=(size,bold=false)=>{ctx.font=`${bold?'600':'400'} ${size}px "${input.brand.font.family}"`;};
  font(geo.title.size,true);const central=intent.central?.kind==='image'?{lines:0}:wrapExact(ctx,intent.centralMessage,geo.title.w-6,loc,'SEMANTIC_CENTRAL_OVERFLOW');
  if((central.lines?textFrameHeight(ctx,central):0)>geo.title.h)layoutIssue('SEMANTIC_CENTRAL_OVERFLOW',loc,'Exact central message exceeds its readable title region',{region:geo.title,lines:central.lines});
  const size=Math.max(22,input.brand.minBodySize);
  font(size);
  const blockLocation=id=>({...loc,...graph.blocksById[id].location,...(graph.obligationsByOrigin[graph.blocksById[id].originIds[0]]??{}),intentId:intent.id,style,blockIds:[id],...provenance([id])});
  const blockHeight=id=>{const typography=narrativeTextStyle(graph,graph.blocksById[id]);font(typography.role==='body'?size:typography.size);return textFrameHeight(ctx,wrapExact(ctx,graph.blocksById[id].text,geo.body.w-6,blockLocation(id),'SEMANTIC_UNSPLITTABLE_OVERFLOW'))+typography.gap;};
  const repeated=intent.localObligations.map(id=>graph.obligationsByOrigin[id]).filter(o=>o.imageIds.length&&o.kind!=='source');
  const citationIds=[...new Set(intent.blockIds.flatMap(id=>graph.blocksById[id].sourceIds))];
  const citationLabel=id=>{const source=graph.sourcesById[id];if(graph.manuscriptVersion==='complete-manuscript-v3'){const projection=graph.source.proseProjection.entries.find(e=>e.kind==='source'&&graph.source.obligations.find(o=>o.originId===e.originId)?.value.id===id);if(!projection)layoutIssue('SEMANTIC_CITATION_LABEL_REQUIRED',{...loc,owner:'copy-lead'},'Exact readable citation projection required');return projection.exactText;}if(!['complete-manuscript-v2','complete-manuscript-v3'].includes(graph.manuscriptVersion))return `[${id}] ${source.title??source.label??source.type??id}`;const label=source.title??source.label;if(typeof label!=='string'||!label.trim())layoutIssue('SEMANTIC_CITATION_LABEL_REQUIRED',{...loc,pointer:`/source/sources/${Object.keys(graph.sourcesById).indexOf(id)}`,owner:'copy-lead'},'A visible readable source label is required for this claim');return label;};
  const citationText=citationIds.map(citationLabel).join('\n');
  const citationHeight=citationIds.length?citationIds.reduce((height,id)=>{
    const source=graph.sourcesById[id],origin=Object.values(graph.obligationsByOrigin).find(o=>o.kind==='source'&&o.value.id===id);
    const citation=citationLabel(id);
    return height+textFrameHeight(ctx,wrapExact(ctx,citation,geo.body.w-6,{...loc,...origin,intentId:intent.id,style},'SEMANTIC_UNSPLITTABLE_OVERFLOW'));
  },12):0;
  const centralBlockIds=intent.central?.kind==='text'?intent.blockIds.filter(id=>{const b=graph.blocksById[id];return b.kind==='transition'&&!b.originIds.length&&b.text===intent.centralMessage;}):[];
  const bodyIds=intent.blockIds.filter(id=>!centralBlockIds.includes(id));
  const chunks=[];let chunk=[];
  for(const id of bodyIds){chunk.push(id);if(intent.allowedSplitAfterBlockIds.includes(id)){chunks.push(chunk);chunk=[];}}
  if(chunk.length)chunks.push(chunk);
  if(!chunks.length)chunks.push([]);
  for(const group of intent.atomicGroups){
    const indexes=group.map(id=>bodyIds.indexOf(id));
    for(const boundary of intent.allowedSplitAfterBlockIds){const cut=bodyIds.indexOf(boundary);if(indexes.some(i=>i<=cut)&&indexes.some(i=>i>cut))layoutIssue('SEMANTIC_SPLIT_ATOMIC_CONFLICT',loc,'Approved boundary cuts an attached claim, limit or attribution group',{boundary,group});}
  }
  const pages=[];let current=[];
  const repeatsFor=ids=>repeated.filter(o=>!o.blockIds.some(id=>ids.includes(id)));
  const materialFor=ids=>(intent.materialPlacements??[]).filter(p=>(p.affectedImageIds.some(id=>intent.imageIds.includes(id))||p.affectedBlockIds.some(id=>ids.includes(id)))&&!ids.includes(p.blockId));
  const captionHeight=(value,location)=>{font(16);return textFrameHeight(ctx,wrapExact(ctx,value,geo.body.w-6,location,'SEMANTIC_UNSPLITTABLE_OVERFLOW'))+8;};
  const materialHeight=ids=>materialFor(ids).reduce((h,p)=>h+graph.clausesById[p.clauseId].fragments.reduce((n,fragment)=>n+captionHeight(fragment,{...loc,...graph.clausesById[p.clauseId].location}),0),0);
  const height=ids=>materialHeight(ids)+ids.reduce((h,id)=>h+blockHeight(id),0)+repeatsFor(ids).reduce((h,o)=>h+captionHeight(o.exactText,{...loc,...o,intentId:intent.id,style}),0)+citationHeight;
  for(const part of chunks){
    if(height(part)>geo.body.h){const b=graph.blocksById[part[0]],owner=part.flatMap(id=>graph.blocksById[id].originIds).map(id=>graph.obligationsByOrigin[id]).find(Boolean);layoutIssue('SEMANTIC_UNSPLITTABLE_OVERFLOW',{...loc,...(owner??b?.location),intentId:intent.id,style,blockIds:part,imageIds:intent.imageIds,...provenance(part)},'Approved atomic content exceeds the reading floor without a legal split',{requiredHeight:height(part),availableHeight:geo.body.h,fontSize:size,approvedSplitAfter:intent.allowedSplitAfterBlockIds});}
    if(current.length&&height([...current,...part])>geo.body.h){pages.push(current);current=[];}current.push(...part);
  }
  if(current.length||!pages.length)pages.push(current);
  return pages.map((ids,index)=>({...intent,id:`${intent.id}/page-${index+1}`,originId:intent.id,continuationIndex:index+1,bodyBlockIds:ids,centralBlockIds,repeatedMaterials:materialFor(ids),repeatedObligations:repeatsFor(ids),citationIds,citationText,geometry:geo,bodySize:size,kind:'narrative'}));
}
export function narrativeImageFrames(q,style,assets){
  const ids=[...q.imageIds].sort((a,b)=>a===q.heroImageId?-1:b===q.heroImageId?1:0),box=q.geometry.images;
  if(!ids.length)return [];
  if(q.central?.kind==='image'&&ids.length>1){
    const readableWidth=id=>{const a=assets[id];return a.width*Math.max(100/Math.min(a.width,a.height),180/Math.max(a.width,a.height));};
    const gap=20,proofWidth=Math.ceil(Math.max(...ids.slice(1).map(readableWidth))),heroWidth=box.w-proofWidth-gap,proofHeight=(box.h-gap*(ids.length-2))/(ids.length-1);
    const frames=ids.map((id,n)=>n===0?{id,x:box.x,y:box.y,w:heroWidth,h:box.h}:{id,x:box.x+heroWidth+gap,y:box.y+(n-1)*(proofHeight+gap),w:proofWidth,h:proofHeight});
    for(const frame of frames){const a=assets[frame.id],scale=Math.min(frame.w/a.width,frame.h/a.height),w=a.width*scale,h=a.height*scale;if(Math.min(w,h)<100||Math.max(w,h)<180)layoutIssue('SEMANTIC_IMAGE_GROUP_OVERFLOW',{...q.location,owner:'layout-lead',style,intentId:q.originId,imageIds:ids},'Required image views cannot remain readable beside the actual central hero',{imageId:frame.id,renderedWidth:w,renderedHeight:h,minimumShortSide:100,minimumLongSide:180});}
    return frames;
  }
  const columns=style==='stage'?ids.length:ids.length===1?1:2,rows=Math.ceil(ids.length/columns),gap=20;
  const w=(box.w-gap*(columns-1))/columns,h=(box.h-gap*(rows-1))/rows;
  return ids.map((id,i)=>{
    const inset=id===q.heroImageId?0:10;
    const frame=ids.length===2&&style!=='stage'?{x:box.x+(i===0?0:box.w*.62+gap),y:box.y+(i===0?0:box.h*.12),w:i===0?box.w*.62:box.w*.38-gap,h:i===0?box.h:box.h*.76}:{x:box.x+(i%columns)*(w+gap)+inset,y:box.y+Math.floor(i/columns)*(h+gap)+inset,w:w-2*inset,h:h-2*inset};
    const a=assets[id],scale=Math.min(frame.w/a.width,frame.h/a.height),iw=a.width*scale,ih=a.height*scale;
    if(Math.min(iw,ih)<100||Math.max(iw,ih)<180)layoutIssue('SEMANTIC_IMAGE_GROUP_OVERFLOW',{...q.location,owner:'layout-lead',style,intentId:q.originId,imageIds:ids},'Required image views cannot stay together at readable scale',{imageId:id,renderedWidth:iw,renderedHeight:ih,minimumShortSide:100,minimumLongSide:180});
    return {id,...frame};
  });
}
