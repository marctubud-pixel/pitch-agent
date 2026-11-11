import {measureChartPage,validateNumericChartPlan,NUMERIC_COMPOSITION_VERSION} from './semantic-charts.mjs';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {resolveIntent,layoutIssue,hash} from './semantic-input.mjs';
import {wrapExact,textFrameHeight,prepareNarrativePages,narrativeImageFrames,narrativeTextStyle} from './semantic-composition.mjs';

export const styles = {
  editorial: {name:'留白编辑', refs:['static:11','static:13','static:14','pdf:junlebao:27'], gallery:'equal-height', statement:'asymmetric', items:'columns'},
  stage: {name:'品牌剧场', refs:['pdf:guijiu:31','pdf:yanghe:33','static:07'], gallery:'hero-and-proof', statement:'center-stage', items:'vertical'},
  evidence: {name:'观点叙事', refs:['pdf:waima:22-42','static:12','static:16'], gallery:'editorial-strip', statement:'oversized-left', items:'rows'},
};

function wrap(ctx, value, width) {
  const result=[];
  for(const paragraph of value.split('\n')) {
    let line='';const local=[];
    for(const char of paragraph) {
      if(line && ctx.measureText(line+char).width>width) {local.push(line);line=char;} else line+=char;
    }
    local.push(line);
    if(local.length>1) {
      const i=local.length-1;
      while(local[i].length<6&&local[i-1].length>6) {
        local[i]=local[i-1].slice(-1)+local[i];local[i-1]=local[i-1].slice(0,-1);
      }
      for(let j=1;j<local.length;j++)if(/^[，。！？、；：”）]/.test(local[j])) {
        local[j]=local[j-1].slice(-1)+local[j];local[j-1]=local[j-1].slice(0,-1);
      }
    }
    result.push(...local);
  }
  return result;
}

export function planDeck(input, style) {
  const grammar=styles[style];
  if(!grammar){if(input.semantic.contentBinding)layoutIssue('SEMANTIC_STYLE_UNSUPPORTED',{style,artifactId:'layout',pointer:'/style'},'Requested composition style is unsupported');throw new Error(`Unknown style ${style}`);}
  for(const f of input.brand.font.files) GlobalFonts.registerFromPath(f);
  const ctx=createCanvas(1,1).getContext('2d');
  const c=input.brand.colors, slides=[], decisions=[];
  let s, q, ink, muted, accent, mockupCarriers;
  function text(value,x,y,w,h,size=28,role='body',bold=false,color=ink) {
    if(value===undefined || value==='') return;
    const floor=role==='caption'?16:role==='note'?13:role==='title'?32:input.brand.minBodySize;
    if(q.kind==='narrative'){
      ctx.font=`${bold?'600':'400'} ${size}px "${input.brand.font.family}"`;
      const wrapped=wrapExact(ctx,String(value),w-6,{...q.location,style,intentId:q.originId});
      if(textFrameHeight(ctx,wrapped)>h)layoutIssue('SEMANTIC_TEXT_OVERFLOW',{...q.location,style,intentId:q.originId},'Exact visible text cannot fit at the declared size',{size,w,h,lines:wrapped.lines});
      s.elements.push({type:'text',text:wrapped.text,sourceText:String(value),wrapBreaks:wrapped.wrapBreaks,x,y,w,h,size,color,bold,role,lineSpacing:1.15});return;
    }
    let lines;
    for(;size>=floor;size-=2) {
      ctx.font=`${bold?'600':'400'} ${size}px "${input.brand.font.family}"`;
      lines=wrap(ctx,String(value),w-6);
      if(lines.length*size*1.28<=h) break;
    }
    if(size<floor) throw new Error(`content-overflow ${q.id} ${role}: ${String(value).slice(0,40)}`);
    s.elements.push({type:'text',text:lines.join('\n'),sourceText:String(value),x,y,w,h,size,color,bold,role,lineSpacing:1.15});
  }
  function image(assetId,x,y,w,h) {
    const a=input.assets[assetId];if(!a) throw new Error(`missing-asset ${assetId}`);
    const scale=Math.min(w/a.width,h/a.height), iw=a.width*scale,ih=a.height*scale;
    s.elements.push({type:'image',assetId,x:x+(w-iw)/2,y:y+(h-ih)/2,w:iw,h:ih,fit:'contain'});
  }
  function rule(x,y,w,color=accent) {s.elements.push({type:'line',x,y,w,h:0,color,width:1});}
  function title(y=100,w=1160,x=60,h=125,size=50) {text(q.title,x,y,w,h,size,'title',true);}
  function caption(id,x,y,w) {const a=input.cases[id];text(`${a.year}  ${a.display_title||a.title}`,x,y,w,65,18,'caption',false,muted);}
  function notes(page) {
    const source=(page.ids||[]).map(id=>{const a=input.cases[id];return `${id} ${a.title}\n${a.source_url}\n${(a.notes||[]).join(' ')}`;});
    for(const id of page.evidence||[]) {const a=input.audience.findings.find(f=>f.id===id);source.push(`${id}\n${a.fact}\n${a.url}\n${a.period}\n限制：${a.limit}`);}
    const refs = page.arts || (page.art ? [page.art] : page.kind==='application' ? [`art:${page.direction}`] : []);
    for (const ref of [...refs, ...(page.mockup ? [page.mockup] : [])]) {
      const entry = Object.entries(input.assets).find(([id,a]) => id===ref || a.ledgerFile===ref);
      if (entry) {
        const [id,a] = entry, origin = a.source;
        source.push(`${id}\n${typeof origin==='string' ? origin : [origin.type,origin.description,origin.url].filter(Boolean).join('\n')}`);
      }
    }
    if (refs.length) source.push('画面为独立图片，可整体替换；图片内文字不支持逐字编辑。');
    if (page.kind==='application') source.push('应用场景为示意，不代表实际投放。');
    return [page.note||'',...source,`内容状态：${page.status||'沿用既有样本'}。本轮只验证排版，不新增事实核验。`].join('\n\n');
  }
  const galleryCapacity=style==='stage'?2:4;
  const sourcePages=input.semantic.intents.map(i=>resolveIntent(input,i));
  const pages=sourcePages.flatMap(p=>{
    if(!p.chartPlacements?.length)return p.kind==='narrative'?prepareNarrativePages(input,p,style,ctx):[p];
    const groups=p.chartPlacements.map(placement=>({placement,ids:[...new Set(placement.visibleBlockRefs.map(r=>r.blockId))]}));
    const chartBlocks=new Set(groups.flatMap(g=>g.ids)),pages=[];let pending=[];
    const occupied=new Set();
    for(const group of groups){
      const positions=group.ids.map(id=>p.blockIds.indexOf(id)),first=Math.min(...positions),last=Math.max(...positions),at={...p.location,style,owner:'content-author',originIds:group.placement.visibleBlockRefs.map(r=>r.originId),blockIds:p.blockIds.slice(first,last+1)};
      if(group.ids.some(id=>occupied.has(id)))layoutIssue('SEMANTIC_CHART_SHARED_ATOM',at,'Separate chart occurrences need separately authored same-slide metadata groups');
      if(p.blockIds.slice(first,last+1).some(id=>!group.ids.includes(id)))layoutIssue('SEMANTIC_CHART_ATOM_ORDER',at,'Interleaved narrative must return to content before chart metadata can stay atomic in source order');
      if(first>0&&!p.allowedSplitAfterBlockIds.includes(p.blockIds[first-1])||last<p.blockIds.length-1&&!p.allowedSplitAfterBlockIds.includes(p.blockIds[last]))layoutIssue('SEMANTIC_CHART_SPLIT_REQUIRED',at,'Chart pagination requires an explicit authored boundary beside the complete metadata atom');
      for(const id of group.ids){occupied.add(id);if(input.semantic.blocksById[id].originIds.some(origin=>input.semantic.obligationsByOrigin[origin]?.kind!=='chart_metadata'))layoutIssue('SEMANTIC_CHART_METADATA_SCOPE',at,'Ordinary narrative needs its own reading-size composition outside chart metadata blocks');}
    }
    const flush=()=>{if(pending.length){pages.push(...prepareNarrativePages(input,{...p,blockIds:pending,atomicGroups:p.atomicGroups.filter(g=>g.every(id=>pending.includes(id))),localObligations:p.localObligations.filter(id=>input.semantic.obligationsByOrigin[id].blockIds.some(id=>pending.includes(id))),allowedSplitAfterBlockIds:p.allowedSplitAfterBlockIds.filter(id=>pending.includes(id))},style,ctx));pending=[];}};
    for(const id of p.blockIds){if(chartBlocks.has(id)){flush();for(const g of groups.filter(g=>g.ids[0]===id))pages.push({kind:'numeric-chart',placement:g.placement,id:`${p.id}/${g.placement.occurrenceId}`});}else pending.push(id);}
    flush();return pages;
  }).flatMap(p=>p.kind==='gallery'&&p.ids.length>galleryCapacity ? Array.from({length:Math.ceil(p.ids.length/galleryCapacity)},(_,i)=>({...p,id:`${p.id}/${i+1}`,originId:p.id,ids:p.ids.slice(i*galleryCapacity,i*galleryCapacity+galleryCapacity)})) : [p]);
  for(q of pages) {
    mockupCarriers=new Map();
    if(q.kind==='numeric-chart'){slides.push(measureChartPage(input,q.placement,style,ctx));continue;}
    const dark=style==='stage' || q.kind==='direction' || (style==='evidence'&&q.kind==='cover');
    ink=dark?c.paper:c.ink; muted=dark?'#CFD5DC':c.muted;accent=dark?c.accent:c.primary;
    s={id:q.id,originId:q.originId||q.id,template:`${style}.${q.kind}`,referenceIds:grammar.refs,background:dark?c.primary:c.paper,notes:notes(q),elements:[]};
    if(q.kind!=='kvfull') {
      if(q.kind==='narrative'&&slides.length===0){
        text(input.semantic.title,60,28,1100,40,16,'caption',false,muted);
        s.elements.at(-1).contentRefs={manuscriptTitle:true,blockIds:[],imageIds:[],sourceIds:[],claimOrigins:[],obligationOrigins:[]};
      }else text(`${input.brand.name} · ${q.section||''}`,60,28,1100,28,14,'note',false,muted);
      text(String(slides.length+1).padStart(2,'0'),1170,28,50,28,14,'note',false,muted);
    }
    if(q.kind==='narrative') {
      const g=q.geometry,t=g.title,b=g.body;
      if(q.central?.kind!=='image'){
      text(q.centralMessage,t.x,t.y,t.w,t.h,t.size,'title',true);
      s.elements.at(-1).contentRefs={centralMessageIntentId:q.originId,blockIds:q.centralBlockIds??[],imageIds:[],sourceIds:[],claimOrigins:[],obligationOrigins:[]};
      }
      const materialRefs=(blockId)=> (q.materialPlacements??[]).filter(p=>p.blockId===blockId&&(p.affectedImageIds.some(id=>q.imageIds.includes(id))||p.affectedBlockIds.some(id=>q.bodyBlockIds.includes(id)))).map(p=>({placementIndex:p.index,clauseId:p.clauseId,occurrenceScopeKeys:p.occurrenceScopeKeys,fragments:p.exactFragmentRanges.map((r,n)=>({fragmentIndex:n,sourceRange:r,nativeRange:r}))}));
      let y=b.y;
      for(const id of q.bodyBlockIds){
        const block=input.semantic.blocksById[id],typography=narrativeTextStyle(input.semantic,block),size=typography.role==='body'?q.bodySize:typography.size;ctx.font=`400 ${size}px "${input.brand.font.family}"`;
        const h=textFrameHeight(ctx,wrapExact(ctx,block.text,b.w-6));
        text(block.text,b.x,y,b.w,h+.1,size,typography.role);
        s.elements.at(-1).contentRefs={blockIds:[id],imageIds:[],sourceIds:block.sourceIds,claimOrigins:block.claimOrigins,obligationOrigins:block.originIds,...(q.central?{materialPlacements:materialRefs(id)}:{})};y+=h+typography.gap;
      }
      for(const o of q.repeatedObligations){
        ctx.font=`400 16px "${input.brand.font.family}"`;const h=textFrameHeight(ctx,wrapExact(ctx,o.exactText,b.w-6));
        text(o.exactText,b.x,y,b.w,h+.1,16,'caption');s.elements.at(-1).contentRefs={blockIds:[],imageIds:o.imageIds,sourceIds:[],claimOrigins:[],obligationOrigins:[o.originId],repeatedQualification:true};y+=h+8;
      }
      for(const p of q.repeatedMaterials??[]){
        const clause=input.semantic.clausesById[p.clauseId];
        for(const [n,fragment]of clause.fragments.entries()){
          ctx.font=`400 16px "${input.brand.font.family}"`;const h=textFrameHeight(ctx,wrapExact(ctx,fragment,b.w-6));
          text(fragment,b.x,y,b.w,h+.1,16,'caption');s.elements.at(-1).contentRefs={blockIds:[],imageIds:[],sourceIds:[],claimOrigins:[],obligationOrigins:[p.clauseId],materialPlacements:[{placementIndex:p.index,clauseId:p.clauseId,occurrenceScopeKeys:p.occurrenceScopeKeys,fragments:[{fragmentIndex:n,sourceRange:p.exactFragmentRanges[n],nativeRange:{start:0,end:fragment.length}}]}],repeatedMaterial:true};y+=h+8;
        }
      }
      if(q.citationText){text(q.citationText,b.x,y,b.w,b.y+b.h-y,q.bodySize,'body');s.elements.at(-1).contentRefs={blockIds:[],imageIds:[],sourceIds:q.citationIds,claimOrigins:[],obligationOrigins:[],citation:true};}
      for(const frame of narrativeImageFrames(q,style,input.assets)){
        const asset=input.assets[frame.id];
        if(asset.application){
          const mock=input.assets[asset.application.mockupId],r=mock.aperture.w*mock.width/(mock.aperture.h*mock.height);
          if(Math.abs(r/(asset.width/asset.height)-1)>.06)layoutIssue('SEMANTIC_MOCKUP_ASPECT',{...q.location,style,imageIds:[frame.id]},'Declared rectangular aperture is incompatible with original artwork',{apertureRatio:r,artRatio:asset.width/asset.height});
          const scale=Math.min(frame.w/mock.width,frame.h/mock.height),w=mock.width*scale,h=mock.height*scale,x=frame.x+(frame.w-w)/2,y=frame.y+(frame.h-h)/2;
          image(asset.application.mockupId,x,y,w,h);mockupCarriers.set(frame.id,s.elements.at(-1));image(frame.id,x+w*mock.aperture.x,y+h*mock.aperture.y,w*mock.aperture.w,h*mock.aperture.h);
        }else image(frame.id,frame.x,frame.y,frame.w,frame.h);
      }
      if(q.central?.kind==='image'){
        const hero=s.elements.find(e=>e.type==='image'&&e.assetId===q.central.imageId),carrier=mockupCarriers.get(q.central.imageId),others=s.elements.filter(e=>e.type==='image'&&e.assetId!==q.central.imageId&&e!==carrier);
        if(!hero||others.some(e=>e.w*e.h>=hero.w*hero.h))layoutIssue('SEMANTIC_IMAGE_CENTRAL_PROMINENCE',{...q.location,style,intentId:q.originId,imageIds:q.imageIds},'Actual central hero must have greater visible area than every other image',{heroArea:hero?.w*hero?.h,otherAreas:others.map(e=>e.w*e.h)});
        hero.centralImageIntentId=q.originId;
      }
      s.notes=[...new Set(q.bodyBlockIds.flatMap(id=>input.semantic.blocksById[id].sourceIds))].map(id=>input.semantic.manuscriptVersion==='complete-manuscript-v3'?input.semantic.source.proseProjection.entries.find(e=>e.kind==='source'&&input.semantic.source.obligations.find(o=>o.originId===e.originId)?.value.id===id).exactText:JSON.stringify(input.semantic.sourcesById[id])).join('\n\n');
    } else if(q.kind==='kvfull') {
      image(`art:${q.direction}`,0,0,1280,720);
    } else if(q.kind==='cover'||q.kind==='direction'||q.kind==='statement') {
      if(style==='editorial') {
        title(145,1130,60,260,q.kind==='direction'?86:72);
        text(q.sub,610,465,605,185,27,'body',false,muted);
      } else if(style==='stage') {
        title(170,1040,120,270,q.kind==='direction'?90:72);
        rule(120,490,90);
        text(q.sub,360,510,800,140,25,'body',false,muted);
      } else {
        title(130,710,60,430,76);
        rule(825,130,390);
        text(q.sub,825,170,390,410,27,'body',false,muted);
      }
    } else if(q.kind==='gallery') {
      if(style==='editorial') {
        title(90,1160,60,90,45);
        const gap=24, cw=(1160-gap*(q.ids.length-1))/q.ids.length;
        q.ids.forEach((id,i)=>{image(`case:${id}`,60+i*(cw+gap),200,cw,350);caption(id,60+i*(cw+gap),568,cw);});
        text(q.takeaway,60,640,1160,64,23,'body',false,accent);
      } else if(style==='stage') {
        title(90,1160,60,100,48);
        const cw=1160/q.ids.length;
        q.ids.forEach((id,i)=>{image(`case:${id}`,60+i*cw,200,cw-28,355);caption(id,60+i*cw,575,cw-28);});
        text(q.takeaway,60,650,1160,60,22,'body',false,muted);
      } else {
        title(90,1160,60,90,48);
        const widths=q.ids.map(id=>{const a=input.assets[`case:${id}`];return Math.max(.6,Math.min(1.5,a.width/a.height));});
        const sum=widths.reduce((a,b)=>a+b,0);let x=60;
        q.ids.forEach((id,i)=>{const w=1088*widths[i]/sum;image(`case:${id}`,x,200,w,330);caption(id,x,545,w);x+=w+24;});
        rule(60,625,1160);text(q.takeaway,60,647,1160,60,22,'body',false,accent);
      }
    } else if(q.kind==='feature'||q.kind==='explanation') {
      const ids=q.kind==='feature'?q.ids.map(id=>`case:${id}`):[`art:${q.direction}`];
      if(style==='editorial') {
        ids.forEach((id,i)=>image(id,50,135+i*245,740,ids.length===1?450:225));
        title(145,370,850,180,46);text(q.sub,850,365,370,270,25,'body',false,muted);
      } else if(style==='stage') {
        title(95,1160,60,100,48);
        const w=1120/ids.length;
        ids.forEach((id,i)=>image(id,60+i*w,200,w-20,340));
        text(q.sub,60,565,1160,100,26,'body',false,muted);
      } else {
        title(90,430,60,230,55);text(q.sub,60,365,430,270,25,'body',false,muted);
        ids.forEach((id,i)=>image(id,540,130+i*250,680,ids.length===1?480:230));
      }
    } else if(q.kind==='circles') {
      title(95,1160,60,110,48);
      q.items.forEach((a,i)=>{
        const [x,y]=[[80,230],[300,230],[190,375]][i];
        s.elements.push({type:'ellipse',x,y,w:300,h:300,color:accent,width:1.5});
        const [tx,ty]=[[130,320],[405,320],[280,580]][i];
        text(a[0],tx,ty,165,45,24,'body',true);
        text(a[1],760,225+i*125,450,45,25,'body',true,accent);
        text(a[2],760,275+i*125,450,65,22,'body',false,muted);
      });
      text('创意交集',285,430,150,45,22,'body',true,accent);
      text(q.sub,760,590,450,96,24,'body',true,accent);
    } else if(q.kind==='visualcomparison') {
      title(92,1160,60,110,46);
      q.items.forEach((a,i)=> {
        const x=60+i*395;
        const ref=q.arts[i];
        const assetId=Object.keys(input.assets).find(id=>id.startsWith('art:')&&(id===ref||input.assets[id].ledgerFile===ref));
        image(assetId,x,220,370,210);
        text(a[0],x,450,370,60,19,'caption',false,muted);
        text(a[1],x,525,370,60,27,'body',true,accent);
        text(a[2],x,600,370,70,22,'body',false,muted);
      });
    } else if(q.kind==='application') {
      const m=input.assets[q.mockup], art=input.assets[`art:${q.direction}`];
      if(q.purpose!==m.purpose) throw new Error(`mockup-purpose-mismatch ${q.id}`);
      const r=m.aperture.w*m.width/(m.aperture.h*m.height);
      if(Math.abs(r/(art.width/art.height)-1)>.06)throw new Error(`mockup-aspect-mismatch ${q.id}`);
      const scale=Math.min(1160/m.width,500/m.height),w=m.width*scale,h=m.height*scale,x=(1280-w)/2,y=150+(500-h)/2;
      title(75,1160,60,70,38);image(q.mockup,x,y,w,h);
      image(`art:${q.direction}`,x+w*m.aperture.x,y+h*m.aperture.y,w*m.aperture.w,h*m.aperture.h);
      text(q.sub||'场景应用示意',60,665,1160,35,16,'caption',false,muted);
    } else if(q.items) {
      title(95,1160,60,120,48);
      if(style==='stage'||style==='evidence') {
        q.items.forEach((a,i)=>{const y=250+i*125;rule(60,y-16,1160);text(a[0],60,y,210,85,26,'body',false,accent);text(a[1],300,y,370,100,34,'body',true);text(a[2],730,y,490,100,24,'body',false,muted);});
        if(q.sub)text(q.sub,60,650,1160,55,26,'body',true,accent);
      } else {
        const cw=1160/q.items.length;
        q.items.forEach((a,i)=>{const x=60+i*cw;text(a[0],x,270,cw-35,40,22,'body',false,accent);text(a[1],x,340,cw-35,120,38,'body',true);text(a[2],x,485,cw-35,140,25,'body',false,muted);});
        if(q.sub)text(q.sub,60,650,1160,55,26,'body',true,accent);
      }
    } else throw new Error(`Unsupported page ${q.kind}`);
    if(q.note&&q.kind!=='kvfull'&&q.kind!=='gallery'&&q.kind!=='application')text(q.note,60,692,1160,22,13,'note',false,muted);
    const consumed=new Set();
    for(const [index,e]of s.elements.entries()){
      if(!e.contentRefs&&e.type==='text'){
        const id=(q.slots??[]).find(id=>!consumed.has(id)&&input.semantic.blocksById[id].text===e.sourceText);
        if(id){consumed.add(id);e.contentRefs={blockIds:[id],imageIds:[],sourceIds:[],claimOrigins:[],obligationOrigins:[id]};}
      }
      if(e.type==='image'){
        const obligationOrigins=Object.values(input.semantic.obligationsByOrigin).filter(o=>o.imageIds.includes(e.assetId)).map(o=>o.originId);
        e.contentRefs={...(e.centralImageIntentId?{centralImageIntentId:e.centralImageIntentId}:{}),blockIds:[],imageIds:[e.assetId],sourceIds:[],claimOrigins:[],obligationOrigins};e.imageId=e.assetId;
      }
      const identity={intentId:s.originId,slideId:s.id,type:e.type,refs:e.contentRefs??{decoration:index}};
      e.occurrenceId=`occ-${hash(identity).slice(0,24)}`;e.id=e.occurrenceId;
    }
    slides.push(s);decisions.push({pageId:q.id,template:s.template,reason:`${grammar.name} / ${q.kind}；原文保留，图片按实际比例完整放置`,references:s.referenceIds});
  }
  const placements=slides.flatMap(s=>s.elements.filter(e=>e.contentRefs).map(e=>({intentId:s.originId,slideId:s.id,elementId:e.id,occurrenceId:e.occurrenceId,...e.contentRefs})));
  const plan={...(input.semantic.manuscriptVersion==='complete-manuscript-v3'?{numericCompositionVersion:NUMERIC_COMPOSITION_VERSION}:{}),style,width:1280,height:720,slides,decisions,placements,contentBinding:input.semantic.contentBinding,authority:input.semantic.authority};
  const ids=slides.flatMap(s=>s.elements.map(e=>e.id));if(new Set(ids).size!==ids.length)throw new Error('duplicate-element-identity');
  for(const intent of input.semantic.intents)if(intent.kind==='narrative'){
    const ps=placements.filter(p=>p.intentId===intent.id);
    for(const id of intent.blockIds)if(!ps.some(p=>p.blockIds.includes(id)))layoutIssue('SEMANTIC_PLACEMENT_BLOCK_MISSING',{...intent.location,style,blockIds:[id]},'Required block has no actual native placement');
    for(const id of intent.imageIds)if(!ps.some(p=>p.imageIds.includes(id)))layoutIssue('SEMANTIC_PLACEMENT_IMAGE_MISSING',{...intent.location,style,imageIds:[id]},'Required image has no actual placement');
  }
  validateMaterialPlacements(input.semantic,plan);
  validateNumericChartPlan(input,plan,ctx);
  validatePlan(plan);
  return plan;
}

export function validatePlan(plan) {
  for(const s of plan.slides)for(const e of s.elements) {
    if(![e.x,e.y,e.w,e.h].every(Number.isFinite)||e.x<0||e.y<0||e.w<=0||e.h<0||e.x+e.w>plan.width+.1||e.y+e.h>plan.height+.1)throw new Error(`geometry-outside ${s.id}`);
    if(e.type==='text'&&(!e.text||e.size<13))throw new Error(`invalid-text ${s.id}`);
  }
  return true;
}

export function validateMaterialPlacements(graph,plan){
  if(!['complete-manuscript-v2','complete-manuscript-v3'].includes(graph.manuscriptVersion))return true;
  for(const [index,p]of graph.clausePlacements.entries())for(const intentId of p.pageIntentIds){
    const pages=plan.slides.filter(s=>s.originId===intentId);
    const targets=pages.filter(s=>s.elements.some(e=>e.type==='image'&&p.affectedImageIds.includes(e.assetId)||(e.contentRefs?.blockIds??[]).some(id=>p.affectedBlockIds.includes(id))));
    const clause=graph.clausesById[p.clauseId],loc={...clause.location,style:plan.style,intentId,originIds:[p.clauseId],blockIds:p.affectedBlockIds,imageIds:p.affectedImageIds};
    if(!targets.length)layoutIssue('SEMANTIC_MATERIAL_TARGET_MISSING',loc,'Clause scope has no actual affected content object');
    for(const s of targets)for(const [n,fragment]of clause.fragments.entries()){
      const found=s.elements.some(e=>e.type==='text'&&(e.contentRefs?.materialPlacements??[]).some(r=>r.placementIndex===index&&r.clauseId===p.clauseId&&new Set(p.occurrenceScopeKeys).size===p.occurrenceScopeKeys.length&&r.occurrenceScopeKeys.length===p.occurrenceScopeKeys.length&&new Set(r.occurrenceScopeKeys).size===r.occurrenceScopeKeys.length&&r.occurrenceScopeKeys.every(k=>p.occurrenceScopeKeys.includes(k))&&r.fragments.some(f=>f.fragmentIndex===n&&f.sourceRange.start===p.exactFragmentRanges[n].start&&f.sourceRange.end===p.exactFragmentRanges[n].end&&e.sourceText.slice(f.nativeRange.start,f.nativeRange.end)===fragment)));
      if(!found)layoutIssue('SEMANTIC_MATERIAL_FRAGMENT_MISSING',loc,'Exact material fragment must share the actual slide with its affected object',{slideId:s.id,fragmentIndex:n,placementIndex:index});
    }
  }
  return true;
}
