import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {independentCalls,invalidOutput} from './call-checkpoints.mjs';
import {applyManuscriptEdits} from './layout-pages.mjs';
import {runLayout} from './layout.mjs';
import {pythonBinary} from './runtime-dependencies.mjs';

export const finalProtocol='case-b-1.2.0';
const roles={
  logic:'逻辑岗：审既定要求、客户立场、全册叙事衔接、事实和统计口径。图表不能共用不同分母、单位或时期。用本版可核对的原文定位。',
  copy:'措辞岗：把大屏上的长句和调研腔压成短句，保留限定、证据和已定策略及主副标。按现有材料纠正错误表述。',
  craft:'美术岗：看实图的构图、领读、字号、断行、裁切、遮挡、展签、品牌和页脚。指出确实看得到的问题和具体位置。',
};
const roleNames={logic:'逻辑',copy:'措辞',craft:'美术'};
const choices=['text','gallery','comparison','reflow','rhythm','shadows','hold'];
const upstream=['brief','research','strategy','copy','visual'];
const stageNames={brief:'简报',research:'研究',strategy:'策略',copy:'文案',visual:'视觉',layout:'版式'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const norm=value=>value.normalize('NFKC').replace(/\s/gu,'');
const text={type:'string'};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const execution=promisify(execFile);
const helper=fileURLToPath(new URL('./final-edition.py',import.meta.url));

async function python(action,path,images,signal) {
  const result=await execution(await pythonBinary(),['-I','-B',helper,action,path,...images],{
    signal,timeout:30000,maxBuffer:4*1024*1024,
  });
  return result.stdout;
}

function requireEdition(valid,message) {
  if (!valid) throw Object.assign(Error(message),{code:'WRONG_LAYOUT_EDITION'});
}

async function readEdition(artifacts,plan,dir,signal) {
  const file=artifacts.findLast(item=>item.kind==='pptx');
  const batch=file?.name.match(/^提案-([a-f0-9-]{36})\.pptx$/u)?.[1];
  requireEdition(batch,'缺少同版 PPTX');
  const preview=artifacts.find(item=>item.name==='提案预览-'+batch+'.deck.json');
  requireEdition(preview,'缺少同版预览或版次不一致');
  const pathFor=name=>{
    requireEdition(name===basename(name),'版次文件名无效');
    return join(dir,name);
  };
  const [deck,pptx]=await Promise.all([
    readFile(pathFor(preview.name),'utf8').then(JSON.parse),
    readFile(pathFor(file.name)),
  ]);
  requireEdition(deck.edition?.pptxSha256===sha(pptx),'PPTX 与预览的同批校验不符，请重排');
  requireEdition(deck.pages?.length===plan.pages.length &&
    deck.edition.renderSha256?.length===plan.pages.length,'逐页稿、PPTX 与预览页数不一致');
  const numbered=artifacts.filter(item=>item.renderPage);
  requireEdition(numbered.length===plan.pages.length,'逐页渲染缺页或混入了其他版次');
  const native=JSON.parse(await python('inspect',pathFor(file.name),[],signal));
  requireEdition(native.length===plan.pages.length,'PPTX 原生页数与本版逐页稿不符');
  const images=[];
  for (const [index,slide] of deck.pages.entries()) {
    const number=index+1;
    const planned=plan.pages[index];
    const ref=numbered.find(item=>item.renderPage===number);
    const id='P'+String(number).padStart(2,'0');
    const expected=planned.figures.map(id=>plan.figures.find(figure=>figure.id===id));
    const pictures=slide.nodes.filter(node=>node.kind==='image').map(({image})=>({
      name:image.id,sha256:sha(Buffer.from(image.data.split(',')[1],'base64')),
    }));
    const shown=norm(native[index].text.join(''));
    requireEdition(slide.id===id && ref?.name==='page-'+String(number).padStart(4,'0')+'-'+batch+'.jpg' &&
      [planned.title,...planned.points].every(value=>shown.includes(norm(value))) &&
      expected.every(figure=>pictures.some(pic=>pic.name===figure?.name && pic.sha256===figure.sha256)) &&
      JSON.stringify(native[index].images)===JSON.stringify(pictures),'第 '+number+' 页错版、串图或原生正文与逐页稿对不上');
    const path=pathFor(ref.name), bytes=await readFile(path), digest=sha(bytes);
    requireEdition(digest===deck.edition.renderSha256[index],'第 '+number+' 页渲染与本版不符');
    images.push({path,mediaType:'image/jpeg',sha256:digest,number});
  }
  return {file:file.name,sha256:deck.edition.pptxSha256,batch,native,images,deck};
}

function issueSchema(pages) {
  return object({issues:{type:'array',maxItems:12,items:object({
    page:{type:'integer',enum:pages},level:{type:'string',enum:['P0','P1']},
    problem:text,evidence:text,change:text,operation:{type:'string',enum:choices},
    target:{type:'string',enum:['layout',...upstream]},from:text,to:text,quote:text,
  })}});
}

const policy='P0 只用于事实、数据、已确认要求、关键图文或可读性错误，P1 用于表达、美术和可读的局部细节。以客户选案所需信息为界。';
const operations='每项填页码、严重程度、问题、实际证据、改法和责任。operation=text 时给可在本页 title 或单条 points 找到的唯一原文 from、短的替换 to 和本版原材料逐字引用 quote。作为同义精简时 quote 可空。保持数据、限定和方向，已核事实写准，待核说明写清。图表口径混排时，在同页将有直接依据的数据分别写清各自对象和时期。gallery 对单张作品图加展框和极简展签。comparison 等比优化并排图。reflow 调中文断行。rhythm 调页脚对比和节奏。shadows 清理默认投影。凡需变更已定策略、主副标、补商品事实或重绘原图，用 hold 且给实际责任阶段。其余 target=layout。非 text 项的 from、to、quote 填空。同一项在本批只报一次。已明确的演练缺口保留待核。';

async function audit({call,plan,edition,round,selected,prior=[],verify=false,receipts,onEvent}) {
  const findings=[];
  const sequence=plan.pages.map(({number,role,title})=>({number,role,title}));
  for (let i=0;i<selected.length;i+=4) {
    const numbers=selected.slice(i,i+4);
    const pages=numbers.map(n=>plan.pages[n-1]);
    const figureIds=new Set(pages.flatMap(page=>page.figures));
    const images=numbers.map(n=>edition.images[n-1]);
    const context=JSON.stringify({
      全册页序:sequence,Brief:plan.brief,策略:plan.strategy,已选文案:plan.copy,采用说明:plan.adoption,
      采用图读图:plan.figures.filter(figure=>figureIds.has(figure.id)),本批逐页稿:pages,
      本批PPT:numbers.map(n=>({页码:n,...edition.native[n-1],图片对象数量:edition.native[n-1].images.length})),
      本批待复核:prior.filter(issue=>numbers.includes(issue.page)).map(({page,role,problem,evidence,change,level})=>({page,role,problem,evidence,change,level})),
    });
    const active=round===1 ? Object.keys(roles) :
      [...new Set(['craft',...prior.filter(issue=>numbers.includes(issue.page) &&
        (issue.level==='P0' || issue.operation==='text')).map(issue=>issue.role)])];
    const batches=await independentCalls(active,async role=>{
      await onEvent?.('终审第 '+round+' 轮 · '+roleNames[role]+' · 第 '+numbers.join('、')+' 页'+(verify?'复验':''));
      const response=await call([roles[role],
        '按附件顺序审页 '+numbers.join('、')+'。只判断自己的审稿职责。',
        verify?'逐项复核本批实际修后图和正文。已解决不重复，有问题依然按证据记。':'结合全册页序读本批，逐页给证据。',
        policy,operations].join('\n'),images,issueSchema(numbers),{delegate:true,context});
      const issues=response.parsedOutput?.issues;
      if (!Array.isArray(issues) || issues.length>12 || issues.some(issue=>!numbers.includes(issue?.page) ||
        !['P0','P1'].includes(issue.level) || !choices.includes(issue.operation) ||
        !(issue.operation==='hold'?upstream.includes(issue.target):issue.target==='layout') ||
        [issue.problem,issue.evidence,issue.change].some(value=>typeof value!=='string'||!value.trim()) ||
        [issue.from,issue.to,issue.quote].some(value=>typeof value!=='string'))) {
        throw invalidOutput('终审意见须有本批页码、P0/P1、证据、改法和有效权限');
      }
      receipts.push({round,role,pages:numbers,verify,model:response.model,completionId:response.threadId,inputSha256:response.inputPacketHash});
      return issues.map(issue=>({...issue,role}));
    });
    findings.push(...batches.flat());
  }
  return findings;
}

const numbers=value=>norm(value).match(/\d+(?:[.,]\d+)?%?/gu) ?? [];
const qualifications=[/待核|未核|未验证/u,/目标价/u,/拟铺/u,/不(?:上|印)瓶/u,/仅限|仅在|仅有/u,/示意|占位/u];

function authorizeText(plan,page,issue) {
  const fields=[page.title,...page.points];
  const field=fields.find(value=>issue.from && value.includes(issue.from));
  if (!field || !issue.to.trim() || issue.to===issue.from || /[\r\n]/u.test(issue.to) || issue.to.length>260)
    throw Error('请提供本页唯一短句和可直接放入版面的改文');
  if (page.role==='strategy' || /^(?:主标|副标) · /u.test(field)) throw Error('已定策略和主副标需人工确认');
  const after=field.replace(issue.from,()=>issue.to);
  if (qualifications.some(flag=>flag.test(field) && !flag.test(after))) throw Error('原文的待核、适用范围或使用边界须保留');
  const sources=[plan.brief.original,plan.brief.task.body,...plan.strategy.map(item=>item.body),
    ...plan.copy.flatMap(item=>[item.main,item.secondary]),...page.sources.flatMap(item=>[item.evidence,item.conclusion,item.sampleScope]),
    ...plan.figures.filter(figure=>page.figures.includes(figure.id)).flatMap(figure=>[
      figure.observation.composition,...figure.observation.legibleText,...figure.observation.visibleDetails,
    ])].filter(Boolean);
  const quote=issue.quote.trim();
  if (quote && (quote.length<2 || !sources.some(value=>norm(value).includes(norm(quote)))))
    throw Error('所引用的事实或限定无法在本版材料定位');
  if ((issue.level==='P0' && !quote) || numbers(issue.to).some(n=>!numbers(issue.from).includes(n) && (!quote || !numbers(quote).includes(n))))
    throw Error('改正事实或数据需要提供可核对的原文');
  if (issue.level==='P1' && numbers(field).some(n=>!numbers(after).includes(n))) throw Error('措辞精简须保留本页已有数据');
  return applyManuscriptEdits(plan,[{page:issue.page,from:issue.from,to:issue.to}]);
}

function mergeIssues(issues) {
  const seen=new Map();
  for (const issue of issues) {
    const key=[issue.page,issue.operation,issue.from,issue.to,issue.operation==='hold'?issue.problem:''].join('\0');
    const previous=seen.get(key);
    if (!previous || previous.level==='P1' && issue.level==='P0') seen.set(key,issue);
  }
  return [...seen.values()].sort((a,b)=>a.page-b.page || a.level.localeCompare(b.level));
}

function prepareEdits(plan,issues,oldEdition) {
  let draft=structuredClone(plan);
  const applied=[], remaining=[];
  for (const issue of mergeIssues(issues)) {
    try {
      const slide=draft.pages[issue.page-1];
      if (issue.operation==='hold') throw Error('需提案人确认并交回责任阶段');
      if (issue.operation==='text') {
        const locked=slide.role==='strategy' ? 'strategy' :
          issue.from && slide.points.some(point=>/^(?:主标|副标) · /u.test(point) && point.includes(issue.from)) ? 'copy' : null;
        if (locked) {
          remaining.push({...issue,operation:'hold',target:locked,blockedBy:'已定策略和主副标需提案人确认'});
          continue;
        }
        draft=authorizeText(draft,slide,issue);
      }
      else {
        if (issue.operation==='gallery' && slide.role!=='work' || issue.operation==='comparison' && slide.role!=='compare')
          throw Error('本页模板与所提排版改法不匹配');
        const native=oldEdition.native[issue.page-1];
        if (issue.operation==='shadows' && !native.shadows && !native.effects.some(idx=>idx!=='0')) continue;
        if (slide.refinements?.includes(issue.operation)) throw Error('本页已应用此版式，仍需人工判断');
        slide.refinements=[...(slide.refinements ?? []),issue.operation];
      }
      applied.push(issue);
    } catch (error) {
      remaining.push({...issue,blockedBy:error.message});
    }
  }
  return {draft,applied,remaining};
}

async function contactSheet(edition,dir,signal) {
  const name='终审全览-'+edition.batch+'.jpg';
  const path=join(dir,name);
  await python('contact',path,edition.images.map(image=>image.path),signal);
  return {name,path,sha256:sha(await readFile(path)),mediaType:'image/jpeg',kind:'image'};
}

async function overview({call,current,round,receipts}) {
  const result=await call('这是修后整套提案的全览拼图。只检查全册节奏、章节标识、页码和主次。需要细看时写出对应页码，后续会用逐页实图复验。',
    [current.contact],object({observation:text}),{delegate:true,context:JSON.stringify({轮次:round,页数:current.plan.pages.length})});
  if (typeof result.parsedOutput?.observation!=='string') throw invalidOutput('全览审读须记录所见');
  receipts.push({round,role:'overview',model:result.model,completionId:result.threadId,inputSha256:result.inputPacketHash,
    observation:result.parsedOutput.observation});
}

async function refine({current,issues,project,dir,signal,onEvent,force=false}) {
  const {draft,applied,remaining}=prepareEdits(current.plan,issues,current.edition);
  if (!force && !applied.length) return {...current,applied,remaining};
  let edition, artifacts;
  for (;;) {
    try {
      const result=await runLayout({project,dir,signal,onEvent,reviewDraft:draft});
      artifacts=result.artifacts;
      edition=await readEdition(artifacts,draft,dir,signal);
      break;
    } catch (error) {
      const page=Number(String(error.message).match(/逐页稿 P(\d+)/u)?.[1] ?? 0);
      if (!applied.some(issue=>issue.page===page) || error.code==='WRONG_LAYOUT_EDITION') throw error;
      draft.pages[page-1]=current.plan.pages[page-1];
      const rejected=applied.filter(issue=>issue.page===page);
      remaining.push(...rejected.map(issue=>({...issue,blockedBy:'改文超出版面容量，已保留本页'})));
      for (const issue of rejected) applied.splice(applied.indexOf(issue),1);
    }
  }
  const contact=await contactSheet(edition,dir,signal);
  const changed=applied.filter(issue=>issue.operation==='shadows' ?
    current.edition.native[issue.page-1].shadows!==edition.native[issue.page-1].shadows ||
      JSON.stringify(current.edition.native[issue.page-1].effects)!==JSON.stringify(edition.native[issue.page-1].effects) :
    issue.operation==='text' || current.edition.images[issue.page-1].sha256!==edition.images[issue.page-1].sha256);
  remaining.push(...applied.filter(issue=>!changed.includes(issue)).map(issue=>({...issue,blockedBy:'复验时实际版面未发生此项变化'})));
  return {plan:draft,edition,artifacts,contact,applied:changed,remaining};
}

function makeRecord({rounds,original,current,receipts,applied,pending,reason}) {
  return ['# 本版 PPT 终审 · 1.2.0',reason,
    '原版 '+original.file+'\n精修版 '+current.edition.file+'\n终审 '+rounds+' 轮',
    '## 已落地的修改',
    ...applied.map((issue,i)=>'### '+(i+1)+' · 第 '+issue.page+' 页 · '+roleNames[issue.role]+' · '+issue.level+
      '\n\n- 改前 · '+issue.problem+'\n- 证据 · '+issue.evidence+
      '\n- 改后 · '+(issue.operation==='text'?issue.to:issue.change)),
    '## 待决定或可继续优化',
    ...(pending.length?pending.map(issue=>'- 第 '+issue.page+' 页 · '+issue.level+' · '+issue.problem+' · '+stageNames[issue.target]+
      '\n  依据 · '+issue.evidence+'\n  改法 · '+issue.change+(issue.blockedBy?'\n  当前 · '+issue.blockedBy:'')):['本版无待处理项。']),
    '## 实际审读回执',
    ...receipts.map(item=>'- 第 '+item.round+' 轮 · '+(roleNames[item.role] ?? '全览')+
      (item.pages?' · '+item.pages.join('、')+' 页':'')+' · '+(item.model ?? '')+' · '+(item.completionId ?? '')+
      '  '+(item.observation ?? '')),
  ].join('\n\n');
}

async function saveRecord(dir,body) {
  const name='终审改稿回执-'+randomUUID()+'.md';
  await writeFile(join(dir,name),body+'\n',{flag:'wx',mode:0o600});
  return {name,kind:'text',text:body};
}

export async function reviewFinalDeck({project,manuscript,dir,call,onEvent,signal}) {
  const plan=applyManuscriptEdits(manuscript,project.layoutChanges ?? []);
  const originals=project.artifacts.filter(item=>item.stage==='layout');
  let original;
  try {
    original=await readEdition(originals,plan,dir,signal);
  } catch (error) {
    if (!['WRONG_LAYOUT_EDITION','ENOENT'].includes(error.code) && !(error instanceof SyntaxError)) throw error;
    const reason=error.code==='WRONG_LAYOUT_EDITION'?error.message:'本版缺少可核对的 PPTX、预览或页图';
    const record=await saveRecord(dir,'# 终审准入检查\n\n'+reason+'。请回到版式重新生成。');
    return {artifacts:[record],finalReview:{protocol:finalProtocol,outcome:'return',returnStage:'layout',pages:[],reason}};
  }
  const allPages=plan.pages.map(page=>page.number);
  const receipts=[];
  const applied=[];
  let current={plan,edition:original};
  let rounds=1;
  let issues=await audit({call,plan,edition:original,round:1,selected:allPages,receipts,onEvent});
  const context={project,dir,signal,onEvent};
  current=await refine({current,issues,...context,force:true});
  applied.push(...current.applied);
  const retained=current.remaining;
  const scope=[...new Set([...issues.map(issue=>issue.page),...current.applied.map(issue=>issue.page)])].sort((a,b)=>a-b);
  rounds=2;
  await overview({call,current,round:rounds,receipts});
  issues=await audit({call,plan:current.plan,edition:current.edition,round:rounds,
    selected:scope.length?scope:[1],prior:issues,receipts,onEvent});
  current=await refine({current,issues,...context});
  applied.push(...current.applied);
  let pending=mergeIssues([...retained.filter(issue=>issue.operation==='hold' ||
    !applied.some(done=>done.page===issue.page && done.operation===issue.operation && done.from===issue.from)),
    ...current.remaining]);
  if (current.applied.length) {
    await overview({call,current,round:rounds,receipts});
    const selected=[...new Set(current.applied.map(issue=>issue.page))].sort((a,b)=>a-b);
    pending=mergeIssues([...pending,...await audit({call,plan:current.plan,edition:current.edition,round:rounds,
      selected,prior:current.applied,verify:true,receipts,onEvent})]);
  }
  const retryable=pending.some(issue=>issue.level==='P0'&&issue.operation!=='hold');
  if (retryable) {
    rounds=3;
    current=await refine({current,issues:pending,...context});
    applied.push(...current.applied);
    await overview({call,current,round:rounds,receipts});
    const selected=[...new Set([...pending.filter(issue=>issue.level==='P0'),...current.applied].map(issue=>issue.page))].sort((a,b)=>a-b);
    pending=mergeIssues([...current.remaining,...await audit({call,plan:current.plan,edition:current.edition,round:rounds,
      selected,prior:pending,verify:true,receipts,onEvent})]);
  }
  const blocking=pending.filter(issue=>issue.level==='P0');
  const outcome=blocking.length?'blocked':'ready';
  const reason=blocking.length?'终审还有 '+blocking.length+' 条必改项，请查看证据和责任阶段。':
    '终审已完成 '+rounds+' 轮，修订 '+applied.length+' 项，请验收本版 PPTX。';
  const record=await saveRecord(dir,makeRecord({rounds,original,current,receipts,applied,pending,reason}));
  const reviewPlan='终审逐页稿-'+current.edition.batch+'.plan.json';
  await writeFile(join(dir,reviewPlan),JSON.stringify(current.plan)+'\n',{flag:'wx',mode:0o600});
  return {artifacts:[...current.artifacts.map(item=>({...item,finalLayout:true})),
    {name:reviewPlan,kind:'text',finalLayout:true},{name:current.contact.name,kind:'image'},record],
    finalReview:{protocol:finalProtocol,outcome,pages:allPages,reason,rounds,changed:applied.length,
      originalPptx:original.file,pptx:current.edition.file,sha256:current.edition.sha256,
      contact:current.contact.name,report:record.name,
      ...(blocking.length?{blockingPages:[...new Set(blocking.map(issue=>issue.page))],returnStage:blocking.find(issue=>issue.target!=='layout')?.target ?? 'layout'}:{})}};
}
