/** Domain grouping only; source text never rewritten. Equal paragraphs share all exact origins. */
export function semanticProjection(originals,coverage,directionIds){
 for(const row of coverage){row.visible=false;row.placement='record';row.blockIds=[];}
 const projection={brief:[],research:[],copy:[],strategy:[],directions:directionIds.map(directionId=>({directionId,blocks:[]})),limitations:[],imageOrigins:{},records:[]};
 const rows=(stage,predicate)=>coverage.filter(r=>r.stage===stage&&r.value.trim()&&predicate(r.pointer));
 const one=(stage,pointer)=>coverage.find(r=>r.stage===stage&&r.pointer===pointer&&r.value.trim());
 const ref=row=>({stage:row.stage,pointer:row.pointer,byteSpan:{...row.byteSpan,sourceSha256:row.sourceSha256}});
 const mark=(row,place,id)=>{row.visible=true;row.placement=place;if(!row.blockIds.includes(id))row.blockIds.push(id);};
 function block(stage,id,title,heads=[]){const b={stage,id,title,titleOrigins:heads.filter(Boolean).map(r=>{mark(r,'heading',id);return ref(r);}),paragraphs:[]};return b;}
 function paragraph(b,row){if(!row)return;let found=b.paragraphs.find(p=>p.text===row.value);if(!found){found={text:row.value,origins:[],qualifiers:[]};b.paragraphs.push(found);}if(!found.origins.some(r=>r.stage===row.stage&&r.pointer===row.pointer))found.origins.push(ref(row));mark(row,'body',b.id);return found;}
 function qualify(b,p,row){if(!row)return;p.qualifiers.push(ref(row));mark(row,'qualifier',b.id);}
 function present(b,destination){if(b.paragraphs.length)destination.push(b);return b;}
 const brand=one('brief','/fields/brand'),task=block('brief','task','需求与任务'+(brand?' · '+brand.value:''),[brand]);
 for(const row of rows('brief',p=>/^\/fields\/(background|audience|objectives|deliverables|researchQuestions|timeline|budget|openQuestions)(\/|$)/.test(p)))paragraph(task,row);
 present(task,projection.brief);
 const research=JSON.parse(originals.research.originalText),rt=one('research','/title');
 for(const [n,section] of (research.sections??[]).entries()){
  const heading=one('research',`/sections/${n}/heading`),b=block('research',`research-section-${n}`,[rt?.value,heading?.value].filter(Boolean).join(' · ')||'研究结论',[...(n===0?[rt]:[]),heading]);
  paragraph(b,one('research',`/sections/${n}/body`));present(b,projection.research);
 }
 if(!projection.research.length)projection.research.push(block('research','research-summary',rt?.value??'研究结论',[rt]));
 const first=projection.research[0];paragraph(first,one('research','/summary'));
 for(const row of rows('research',p=>/^\/claims\/\d+(\/text)?$/.test(p))){const existing=projection.research.find(b=>b.paragraphs.some(p=>p.text===row.value));const b=existing??first,p=paragraph(b,row);if(row.pointer.endsWith('/text'))for(const key of ['kind','verification'])qualify(b,p,one('research',row.pointer.replace(/text$/u,key)));}
 // Typed native declarations remain literal source data; no inferred chart, ratio or circles.
 if(research.chartData)for(const [n,c] of research.chartData.charts.entries()){
  const heading=one('research',`/chartData/charts/${n}/title/text`),b=block('research',`research-data-${n}`,heading?.value??'原数值资料',[heading]);
  for(const row of rows('research',p=>p.startsWith(`/chartData/charts/${n}/`)&&!p.includes('/evidence/')&&(/\/(text|lexeme|decimal)$/.test(p))&&p!==heading?.pointer))paragraph(b,row);
  present(b,projection.research);
 }
 const st=one('strategy','/title'),strategyRoots=['researchConclusions','intersection','focus'];
 strategyRoots.forEach((root,n)=>{const b=block('strategy',`strategy-${root}`,['研究结论','方向交叉点','策略发力点'][n]+(n===0&&st?' · '+st.value:''),n===0?[st]:[]);if(n===0)paragraph(b,one('strategy','/summary'));for(const row of rows('strategy',p=>p.startsWith('/strategy/'+root+'/')&&p.endsWith('/text'))){const p=paragraph(b,row);qualify(b,p,one('strategy',row.pointer.replace(/text$/u,'kind')));}projection.strategy.push(b);});
 const copy=JSON.parse(originals.copy.originalText),intro=block('copy','copy-intro','文案与主题');paragraph(intro,one('copy','/summary'));for(const row of rows('copy',p=>/^\/claims\/\d+(\/text)?$/.test(p))){const p=paragraph(intro,row);if(row.pointer.endsWith('/text'))for(const key of ['kind','verification'])qualify(intro,p,one('copy',row.pointer.replace(/text$/u,key)));}
 for(const [n,section] of (copy.sections??[]).entries()){
  const body=one('copy',`/sections/${n}/body`),heading=one('copy',`/sections/${n}/heading`);if(!body)continue;
  const shared=projection.brief.find(b=>b.paragraphs.some(p=>p.text===body.value));if(shared){paragraph(shared,body);continue;}
  const b=block('copy',`copy-section-${n}`,heading?.value??'文案说明',[heading]);paragraph(b,body);present(b,projection.copy);
 }
 if(intro.paragraphs.length)projection.copy.unshift(intro);
 for(const [n,d] of copy.directions.entries()){
  const heading=one('copy',`/directions/${n}/title`),message=block('copy',`copy-${d.id}-message`,heading?.value??`方向 ${n+1}`,[heading]);
  for(const key of ['slogan','supportingCopy'])paragraph(message,one('copy',`/directions/${n}/${key}`));present(message,projection.directions[n].blocks);
  const explanation=block('copy',`copy-${d.id}-explanation`,(heading?.value??`方向 ${n+1}`)+' · 创意说明',[heading]);for(const key of ['creativeExplanation','rationale','differentiation'])paragraph(explanation,one('copy',`/directions/${n}/${key}`));present(explanation,projection.directions[n].blocks);
 }
 if(originals.visual){const visual=JSON.parse(originals.visual.originalText);for(const [n,d] of visual.directions.entries()){
  const target=projection.directions.find(g=>g.directionId===d.directionId),b=block('visual',`visual-${d.directionId}`,copy.directions.find(c=>c.id===d.directionId).title+' · 视觉说明');for(const key of ['explanation','presentationIntent'])paragraph(b,one('visual',`/directions/${n}/${key}`));for(const row of rows('visual',p=>new RegExp('^/directions/'+n+'/claims/[0-9]+(/text)?$').test(p))){const p=paragraph(b,row);if(row.pointer.endsWith('/text'))for(const key of ['kind','verification'])qualify(b,p,one('visual',row.pointer.replace(/text$/u,key)));}present(b,target.blocks);
  for(const [t,target] of d.targets.entries()){
   const origins=rows('visual',p=>p===`/directions/${n}/targets/${t}/kind`||p.startsWith(`/directions/${n}/targets/${t}/requiredViews/`));
   const brief=JSON.parse(originals.brief.originalText);origins.push(...rows('brief',p=>{if(p==='/fields/proposalType')return true;const m=/^\/fields\/visualRequirements\/(\d+)\//.exec(p);return Boolean(m&&brief.fields.visualRequirements[Number(m[1])]?.kind===target.kind);}));
   projection.imageOrigins[target.imageId]=origins.filter(r=>r.value.trim()===target.kind||target.requiredViews.includes(r.value.trim())).map(r=>{mark(r,'target_heading','image-'+target.imageId);return ref(r);});
  }
 }}
 const limits=block('visual','scope','任务约束与适用范围');
 for(const row of coverage){const p=row.pointer;if(!row.value.trim())continue;
  const declared=/\/(limitations|gaps|uncertainties)\/\d+(\/text)?$/.test(p)||/\/(allowedBorrowing|prohibitedCopying|limitation)$/.test(p);
  const visualScope=/^\/(directions\/\d+\/(limitations|preservedFindings)|referenceQualifications|refinementHandoffs)\//.test(p);
  if(row.stage==='brief'&&p.startsWith('/fields/constraints/')||declared&&!p.includes('/evidence/')&&!p.includes('/refs/')&&(row.stage!=='visual'||visualScope)||row.stage==='research'&&/^\/evidenceClassifications\/\d+\/reason$/.test(p))paragraph(limits,row);
 }
 present(limits,projection.limitations);
 for(const r of coverage)r.archived=!r.visible;
 projection.records=coverage.filter(r=>!r.visible).map(r=>({stage:r.stage,pointer:r.pointer,sourceSha256:r.sourceSha256,byteSpan:{start:r.byteSpan.start,end:r.byteSpan.end}}));
 return projection;
}
