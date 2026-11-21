import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {basename,extname,join} from 'node:path';
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
const roleNames={logic:'逻辑',copy:'措辞',craft:'美术',critical:'必改证据核实',productUse:'采用原图场景核实',survey:'实页调查数据核实'};
const choices=['text','gallery','comparison','reflow','rhythm','shadows','hold','note'];
const upstream=['brief','research','strategy','copy','visual'];
const stageNames={brief:'简报',research:'研究',strategy:'策略',copy:'文案',visual:'视觉',layout:'版式'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const norm=value=>value.normalize('NFKC').replace(/\s/gu,'');
const text={type:'string'};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const meaningful=value=>typeof value==='string' && !!value.trim();
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
      (planned.role!=='work' || shown.includes(norm(planned.label))) &&
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
    page:{type:'integer',enum:pages},level:{type:'string',enum:['P0','P1']},impact:{type:'string',enum:['proposal','production']},
    problem:text,evidence:text,change:text,operation:{type:'string',enum:choices},
    target:{type:'string',enum:['layout',...upstream]},from:text,to:text,quote:text,
  })}});
}

function routeIssue(issue,role) {
  const namedStage=upstream.includes(issue.operation);
  const canHold=issue.operation==='hold' && upstream.includes(issue.target);
  const canEdit=choices.includes(issue.operation) && issue.operation!=='hold' &&
    (issue.operation!=='text' || [issue.from,issue.to,issue.quote].every(value=>typeof value==='string'));
  const operation=namedStage || canHold ? 'hold' : canEdit ? issue.operation : 'note';
  const target=operation==='hold' ? (namedStage ? issue.operation : issue.target) : 'layout';
  return {...issue,role,operation,target,level:issue.impact==='production'?'P1':issue.level,
    ...(operation==='text' ? {} : {from:'',to:'',quote:''})};
}

const policy='以 Brief 的本轮交付为准。影响本轮提案的标 impact=proposal。P0 只用于已证实的事实或数据错写、违反已确认要求、关键图文缺失或不可辨认。逐项定位出错的原字、数据或被挡住的位置。P1 用于可读的长句、换行、留白、美术和局部表达；建议改美观或加快阅读时填 P1。已注明品牌待定、客户待选等正常提案事项按实情保留。只影响后续制版、印刷或发布的待核资料标 impact=production、P1。';
const operations='每项填页码、严重程度、问题、实际证据、改法和责任。operation=text 时给能在本页 title、眉标 label 或单条 points 找到的唯一原文 from、短的替换 to 和本版原材料逐字引用 quote。同义精简的 quote 可空。保持数据、限定和方向，已核事实写准，待核说明写清。图表口径混排时，在同页将有直接依据的数据分别写清各自对象和时期。gallery 对单张作品图加展框和极简展签。comparison 等比优化并排图。reflow 调中文断行。rhythm 调页脚对比和节奏。shadows 清理默认投影。凡需变更已定策略、主副标、补商品事实或重绘原图，用 hold 且给实际责任阶段。眉标或说明不准确可由版式改字。无法用上述改法完成的版式意见填 note。直修和 note 的 target 填 layout。非 text 项的 from、to、quote 填空。同一项在本批只报一次，P1 每页合并为最值得做的一条。';

async function audit({call,plan,edition,round,selected,prior=[],verify=false,receipts,onEvent}) {
  const findings=[];
  const sequence=plan.pages.map(({number,role,title})=>({number,role,title}));
  for (let i=0;i<selected.length;i+=4) {
    const numbers=selected.slice(i,i+4);
    const pages=numbers.map(n=>plan.pages[n-1]);
    const figureIds=new Set(pages.flatMap(page=>page.figures));
    const images=numbers.map(n=>edition.images[n-1]);
    const context={
      全册页序:sequence,Brief:plan.brief,策略:plan.strategy,已选文案:plan.copy,采用说明:plan.adoption,
      采用图读图:plan.figures.filter(figure=>figureIds.has(figure.id)),本批逐页稿:pages,
      本批PPT:numbers.map(n=>({页码:n,...edition.native[n-1],图片对象数量:edition.native[n-1].images.length})),
    };
    const active=round===1 ? Object.keys(roles) :
      [...new Set(['craft',...prior.filter(issue=>numbers.includes(issue.page) &&
        (issue.level==='P0' || issue.operation==='text')).map(issue=>issue.role)])];
    const batches=await independentCalls(active,async role=>{
      await onEvent?.('终审第 '+round+' 轮 · '+roleNames[role]+' · 第 '+numbers.join('、')+' 页'+(verify?'复验':''));
      const ownPrior=prior.filter(issue=>issue.role===role && numbers.includes(issue.page))
        .map(({page,role,problem,evidence,change,level})=>({page,role,problem,evidence,change,level}));
      const response=await call([roles[role],
        '按附件顺序审页 '+numbers.join('、')+'。只判断自己的审稿职责。',
        verify || round>1?'逐项对照本批实际修后图、正文和旧意见，只交回新版仍存在的问题。':'结合全册页序读本批，逐页给证据。',
        policy,operations].join('\n'),images,issueSchema(numbers),{delegate:true,context:JSON.stringify({...context,本批待复核:ownPrior})});
      const issues=response.parsedOutput?.issues;
      if (!Array.isArray(issues) || issues.some(issue=>!numbers.includes(issue?.page) ||
        !['P0','P1'].includes(issue.level) || !['proposal','production'].includes(issue.impact) ||
        ![issue.problem,issue.evidence,issue.change].every(meaningful))) {
        throw invalidOutput('终审意见须有本批页码、P0/P1、影响范围、实际证据和改法');
      }
      receipts.push({round,role,pages:numbers,verify,model:response.model,completionId:response.threadId,inputSha256:response.inputPacketHash});
      return issues.map(issue=>routeIssue(issue,role));
    });
    findings.push(...batches.flat());
  }
  return findings;
}

const numbers=value=>norm(value).match(/\d+(?:[.,]\d+)?%?/gu) ?? [];
const qualifications=[/待核|未核|未验证/u,/目标价/u,/拟铺/u,/不(?:上|印)瓶/u,/仅限|仅在|仅有/u,/示意|占位/u];

function authorizeText(plan,page,issue) {
  const fields=[page.title,...page.points,page.label];
  const field=fields.find(value=>issue.from && value.includes(issue.from));
  if (!field || !issue.to.trim() || issue.to===issue.from || /[\r\n]/u.test(issue.to) || issue.to.length>260)
    throw Error('请提供本页唯一短句和可直接放入版面的改文');
  if (page.role==='strategy' || /^(?:主标|副标) · /u.test(field)) throw Error('已定策略和主副标需人工确认');
  const after=field.replace(issue.from,()=>issue.to);
  if (qualifications.some(flag=>flag.test(field) && !flag.test(after))) throw Error('原文的待核、适用范围或使用边界须保留');
  const sources=[plan.brief.original,plan.brief.task.body,plan.adoption.explanation,...plan.strategy.map(item=>item.body),
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

function issueKey(issue) {
  return [issue.page,issue.operation,issue.target,issue.from,issue.to,issue.operation==='hold'?issue.problem:''].join('\0');
}

function mergeIssues(issues) {
  const seen=new Map();
  for (const issue of issues) {
    const key=issueKey(issue);
    const previous=seen.get(key);
    if (!previous || previous.level==='P1' && issue.level==='P0') seen.set(key,issue);
  }
  return [...seen.values()].sort((a,b)=>a.page-b.page || a.level.localeCompare(b.level));
}

async function recheck(options) {
  const start=options.receipts.length;
  const latest=await audit(options);
  const covered=new Set(options.receipts.slice(start).flatMap(item=>item.pages.map(page=>item.role+'/'+page)));
  const prior=options.prior;
  const known=new Map(prior.map(issue=>[issueKey(issue),issue.blockedBy]));
  return mergeIssues([
    ...(options.keep ?? prior).filter(issue=>!covered.has(issue.role+'/'+issue.page)),
    ...latest.map(issue=>({...issue,blockedBy:known.get(issueKey(issue))})),
  ]);
}

const packageAmounts=value=>norm(value).match(/\d+(?:[.]\d+)?(?:袋|包|盒|瓶|罐|杯|片|粒|支|份|枚|克|g)/giu) ?? [];
const packCounts=value=>packageAmounts(value).filter(amount=> !/(?:克|g)$/iu.test(amount));
const countLabel={type:'integer',minimum:0};
const parsedCount=value=>Number(value.match(/^\d+/u)?.[0]);

function containsDecisionRequests(slide,nativeText,required) {
  const clauses=value=>value.split(/[。；;]+/u).map(norm).filter(Boolean);
  const requested=clauses(required);
  const printed=slide.points.filter(point=>/^(?:[^，,。]+(?:后|时)[，,]\s*)?(?:请)?(?:确认|决定|选择|选定)/u.test(point) &&
    nativeText.includes(norm(point))).flatMap(clauses);
  return requested.length>0 && requested.every(clause=>clause.length>=4 && printed.includes(clause));
}

async function verifyProductUse({call,project,plan,slide,edition,round,receipts,onEvent,issue,decision}) {
  const complaint=issue.problem+' '+issue.evidence;
  if (slide.role!=='work' || slide.figures.length!==1 || !['fact_conflict','confirmed_requirement_missing'].includes(decision.kind) ||
      !/(?:仅|只)(?:见|有|放|装|显示)|少(?:了|装)|袋数|份数|实物数量|装量|槽位|插槽|空位|缺少第/u.test(complaint) || !packCounts(complaint).length) return '';
  const figure=plan.figures.find(item=>item.id===slide.figures[0]);
  const artifact=project.artifacts.find(item=>item.adoptedForLayout && item.name===figure?.name);
  const visualIntent=figure?.visualIntent ?? artifact?.visual?.referenceHandoff?.referenceTask?.translation;
  const observation=figure?.observation;
  const mediaType={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[extname(artifact?.name ?? '').toLowerCase()];
  if (!mediaType || !meaningful(visualIntent) || !observation?.legibleText?.length || !artifact.path ||
      !edition.native[issue.page-1].images.some(image=>image.name===figure.name && image.sha256===figure.sha256)) return '';
  const bytes=await readFile(artifact.path).catch(error=>{if(error.code!=='ENOENT') throw error; return null;});
  if (!bytes || sha(bytes)!==figure.sha256) return '';
  const schema=object({printed:text,display:{...text,enum:['closed_pack','taken_out','unclear']},empty:text,matching:text,contradiction:text,
    insideCount:countLabel,matchingOutsideCount:countLabel});
  const instruction=[
    '先看采用原图，再对照之前的观察和画面意图。意图本身不能证明画上内容。请核对商品外盒上写的规格和实际展示情形，不采纳讲稿的改稿意见。',
    'closed_pack 指明确展示的是未取出任何一份的整盒。taken_out 指盒内确有对应空位，盒外同时有与盒内同款的单份，画面正在示意使用。无法核实时填 unclear。请用 empty 写空位位置，用 matching 写同款包装的可见痕迹。',
    'printed 照抄盒上装量。contradiction 写可见的另一种装量、取出后仍明显缺少商品，或违反本案明确的展示方式；缺证时如实留空，无法判断展示关系填 unclear。盒外不相关的摆件不能算一份。',
    '遇到空位，把两边实际可见的满槽分开数，再把满槽数量相加写 insideCount，空位不计。matchingOutsideCount 只数确实同款且对应空位的单份。之前的读图可用于定位，复核时不要按印刷字样补齐件数，无法数清则填 0 并填 unclear。',
  ].join('\n');
  const context=JSON.stringify({客户原始要求:plan.brief.original,画面意图:visualIntent,原图读图实答:observation});
  await onEvent?.('核对采用原图的商品展示 · 第 '+issue.page+' 页');
  const reply=await call(instruction,[{path:artifact.path,mediaType,sha256:figure.sha256}],schema,{delegate:true,context});
  const answer=reply.parsedOutput;
  if (!answer || !['closed_pack','taken_out','unclear'].includes(answer.display) ||
      ![answer.printed,answer.empty,answer.matching,answer.contradiction].every(value=>typeof value==='string'))
    throw invalidOutput('商品展示复核须逐字记录盒身规格、空位、同款依据和实际冲突');
  receipts.push({round,role:'productUse',pages:[issue.page],verify:true,model:reply.model,completionId:reply.threadId,
    inputSha256:reply.inputPacketHash,observation:[answer.display,answer.printed,answer.empty,answer.matching,answer.contradiction,
      '盒内 '+answer.insideCount+'，盒外同款 '+answer.matchingOutsideCount].filter(Boolean).join('，')});
  const amounts=packageAmounts(answer.printed);
  const counts=packCounts(answer.printed);
  const briefAmounts=packageAmounts(plan.brief.original);
  const {insideCount,matchingOutsideCount}=answer;
  const verified=answer.display==='taken_out' && meaningful(answer.empty) && meaningful(answer.matching) && !meaningful(answer.contradiction) &&
    counts.length===1 && amounts.every(amount=>briefAmounts.includes(amount)) &&
    [insideCount,matchingOutsideCount].every(count=>Number.isSafeInteger(count) && count>0) &&
    insideCount+matchingOutsideCount===parsedCount(counts[0]) &&
    observation.legibleText.some(line=>norm(line).includes(norm(answer.printed)));
  return verified?'采用原图已核实取用场景。'+answer.empty+'，'+answer.matching+'。盒内 '+insideCount+'，盒外同款 '+matchingOutsideCount+'，盒身印字「'+answer.printed+'」。':'';
}

async function verifySurvey({call,slide,edition,round,receipts,onEvent,issue,decision}) {
  const native=edition.native[issue.page-1];
  const concern=issue.problem+' '+issue.evidence;
  if (slide.role!=='trend' || native.charts!==0 || !['pending_confirmation','confirmed_requirement_missing'].includes(decision.kind) ||
      !/样本|口径|统计|调查/u.test(concern)) return '';
  const normNumber=value=>value.replaceAll(',','');
  const values=value=>numbers(value).map(normNumber);
  const points=slide.points.filter(line=>values(line).some(number=>number.endsWith('%')));
  const sources=slide.sources;
  if (points.length<2 || !sources.length || !points.every(point=>norm(native.text.join('')).includes(norm(point)))) return '';
  const ids=points.map((_,i)=>String(i+1));
  const refs=sources.map((_,i)=>'R'+(i+1));
  const schema=object({rows:object(Object.fromEntries(ids.map(id=>[id,object({actual:text,quote:text,
    source:{...text,enum:['',...refs]},comparison:{...text,enum:['matches','conflicts','unclear']}})]))),
    relationship:{...text,enum:['separate_claims','mixed_denominator','unclear']}});
  const context=JSON.stringify({页题:slide.title,实页条目:Object.fromEntries(ids.map((id,i)=>[id,points[i]])),
    研究来源:Object.fromEntries(refs.map((ref,i)=>[ref,sources[i]]))});
  await onEvent?.('核对实页调查数据的对应口径 · 第 '+issue.page+' 页');
  const response=await call('按真实页图逐条抄出 actual，选择一份对应研究来源 source，quote 摘录其中一条连续原句。分别核实数字、时期、对象和样本口径，不能从百分比或题名猜。每条填 matches、conflicts 或 unclear。看页上是分别叙述不同调查，还是用同一分母对比；分别选 separate_claims、mixed_denominator 或 unclear。',
    [edition.images[issue.page-1]],schema,{delegate:true,context});
  const answer=response.parsedOutput;
  receipts.push({round,role:'survey',pages:[issue.page],verify:true,model:response.model,completionId:response.threadId,
    inputSha256:response.inputPacketHash,observation:JSON.stringify(answer)});
  const grounded=answer?.relationship==='separate_claims' && ids.every((id,i)=>{
    const row=answer.rows?.[id];
    const source=sources[refs.indexOf(row?.source)];
    if (!meaningful(source?.evidence) || row?.comparison!=='matches' || !meaningful(row.actual) || norm(row.actual)!==norm(points[i]) ||
        !meaningful(row.quote) || !norm(source.evidence).includes(norm(row.quote))) return false;
    const allowed=values(source.evidence+' '+(source.sampleScope ?? ''));
    return values(points[i]).every(number=>allowed.includes(number));
  });
  return grounded?'实页数据分别陈述，数字已逐条对到原研究。口径呈现另作措辞建议。':'';
}

async function qualifyCritical({call,current,pending,round,receipts,onEvent,project}) {
  const {plan,edition}=current;
  const critical=pending.filter(issue=>issue.level==='P0');
  const pages=[...new Set(critical.map(issue=>issue.page))];
  const updates=new Map();
  const kinds=['fact_conflict','confirmed_requirement_missing','key_content_unreadable','readable_suggestion','not_found','pending_confirmation','unresolved'];
  for (let offset=0; offset<pages.length; offset+=4) {
    const batch=pages.slice(offset,offset+4);
    const claims=critical.filter(issue=>batch.includes(issue.page));
    const ids=claims.map((_,index)=>String(index+1));
    const confirmed=Object.fromEntries([
      ['B1',{出处:'客户原始 Brief',原话:plan.brief.original}],
      ...plan.strategy.map((item,index)=>['S'+(index+1),{出处:'已定策略',原话:item.body}]),
      ...plan.copy.map((item,index)=>['C'+(index+1),{出处:'已选主副标',原话:[item.main,item.secondary].filter(Boolean).join('\n')}]),
      ...batch.flatMap(page=>plan.pages[page-1].sources ?? []).map((item,index)=>['R'+(index+1),{出处:item.source,原话:item.evidence}]),
    ].filter(([,entry])=>meaningful(entry.原话)));
    const schema=object({items:object(Object.fromEntries(ids.map(id=>[id,object({
      kind:{...text,enum:kinds},actual:text,required:text,location:text,reason:text,
      source:{...text,enum:['',...Object.keys(confirmed)]},
    })])))});
    const context=JSON.stringify({
      Brief:plan.brief,策略:plan.strategy,采用文案:plan.copy,
      本批页图:batch.map(page=>({页码:page,逐页稿:plan.pages[page-1],PPT:edition.native[page-1],
        采用原图观察:plan.figures.filter(figure=>plan.pages[page-1].figures.includes(figure.id))})),
      待核所见:Object.fromEntries(claims.map(({page,problem,evidence},index)=>[ids[index],{page,problem,evidence}])),
      确认材料:confirmed,
    });
    await onEvent?.('核实仍待处理的必改项 · 第 '+batch.join('、')+' 页');
    const result=await call([
      '核对剩余必改项。结合实际页图和同版正文，逐条读取所报位置。按给定编号只返回一份判断。',
      '先按实图逐字转录意见直接质疑的最短字样 actual，location 写看到的位置。逐项选一个证据类型 kind。fact_conflict 需要实际原字与本版已确认事实冲突。confirmed_requirement_missing 需要本页应交付的已确认信息确实缺失。key_content_unreadable 需要字实际被遮挡、裁掉或模糊到读不出。前三类在 required 中逐字摘录本版给定材料中的必要原句、要求或关键字样。',
      '实际内容能读全，意见只是标点、句式、普通断行、留白或美术，选 readable_suggestion。中英文标点或行尾形式本身属于这一类。报告描述的现象没有发生选 not_found。还缺实际证据选 unresolved。若这三类没有必要原话，required 留空。',
      'work 是作品整图页，创意思路在 direction 页。品牌名待定和待客户选案按原任务保留。reason 只写实图和原件能支持的理由。',
      '商品事实冲突或缺少已确认要求时，必须在 source 填确认材料的编号，并在 required 逐字引用该条原话。讲稿备注只用于识别实际所见。备注要求「后续、实拍时、待客户确认」某事实而确认材料未提供时，选 pending_confirmation，将本项留作后续制作提示。文字被挡或裁切时用 key_content_unreadable，required 写本页应读取的关键字样，source 留空。无需引用的类别 source 留空。',
      '用词意见先逐字对照原简报，以及已定策略或文案。实际已经沿用客户词，若仅建议核实更合适的叫法，选 readable_suggestion。核心策略句在本页完整呈现时，按该页职责判断；只有取得本页必须另设信息的已确认原句，才按缺失处理。',
    ].join('\n'),batch.map(page=>edition.images[page-1]),schema,{delegate:true,context});
    const items=result.parsedOutput?.items;
    if (!items || Object.keys(items).length!==ids.length || !ids.every(id=>kinds.includes(items[id]?.kind) &&
      typeof items[id].actual==='string' && typeof items[id].required==='string' && typeof items[id].source==='string' &&
      meaningful(items[id].location) && meaningful(items[id].reason))) throw invalidOutput('必改证据核实须逐条记录问题类型、实际位置和依据');
    for (const [index,issue] of claims.entries()) {
      const decision=items[ids[index]];
      const expected=norm(decision.required);
      const observed=norm(decision.actual);
      const authority=Object.hasOwn(confirmed,decision.source) ? confirmed[decision.source] : null;
      const sourceMatches=authority && expected.length>=2 && norm(authority.原话).includes(expected);
      const slide=plan.pages[issue.page-1];
      const nativeText=norm(edition.native[issue.page-1].text.join(''));
      const note=slide.notes ?? '';
      const productionNote=decision.kind==='pending_confirmation' && !sourceMatches && observed && norm(note).includes(observed);
      const wordingNote=decision.kind==='pending_confirmation' && sourceMatches && observed.length>=2 &&
        norm(authority.原话).includes(observed) && nativeText.includes(observed);
      const showsExpected=expected && expected===observed && (sourceMatches || decision.kind==='key_content_unreadable');
      const unsupported=['fact_conflict','confirmed_requirement_missing'].includes(decision.kind) && !sourceMatches;
      const heading=norm(slide.title);
      const approvedStrategy=unsupported && slide.role==='strategy' && !slide.points.length && heading && nativeText.includes(heading) &&
        plan.strategy.some(item=>meaningful(item.body) && norm(item.body).includes(heading));
      const requestedConfirmation=unsupported && decision.kind==='confirmed_requirement_missing' && slide.role==='decision' &&
        (containsDecisionRequests(slide,nativeText,decision.required) ||
          /品牌名.{0,18}(?:标志|商标|logo).{0,12}(?:待定|未定|还没定|未确认)/iu.test(plan.brief.original) &&
          slide.points.some(point=>/^(?:请)?确认.{0,22}品牌名.{0,18}(?:标志|商标|logo).{0,25}替换.{0,18}占位/iu.test(point) &&
            observed.includes(norm(point)) && nativeText.includes(norm(point))));
      const clear=productionNote || wordingNote || approvedStrategy || requestedConfirmation || showsExpected || ['readable_suggestion','not_found'].includes(decision.kind);
      const check={call,project,plan,slide,edition,round,receipts,onEvent,issue,decision};
      const additional=clear?'':await verifyProductUse(check) || ((!sourceMatches || decision.source.startsWith('R')) && await verifySurvey(check));
      if (clear || additional) {
        const qualification=productionNote?'保留为后续制作待确认。':approvedStrategy?'实页已呈现原策略句，新增要求无同版原话。':
          requestedConfirmation?'实页已列出所报的客户待确认事项。':'按本版实页复核。';
        const detail=requestedConfirmation?qualification:qualification+decision.location+' '+decision.reason;
        updates.set(issue,{...issue,level:'P1',blockedBy:additional || detail});
      } else if (unsupported) {
        updates.set(issue,{...issue,blockedBy:'引用尚未绑定本版已确认原话，保留待核。'+decision.location+' '+decision.reason});
      }
    }
    receipts.push({round,role:'critical',pages:batch,verify:true,model:result.model,completionId:result.threadId,inputSha256:result.inputPacketHash,
      observation:ids.map(id=>{
        const {kind,actual,required,location,reason,source}=items[id];
        return [kind,location,actual,source,required,reason].filter(Boolean).join(' ');
      }).join('\n')});
  }
  return pending.map(issue=>updates.get(issue) ?? issue);
}

function prepareEdits(plan,issues,oldEdition) {
  let draft=structuredClone(plan);
  const applied=[], remaining=[];
  for (const issue of mergeIssues(issues)) {
    try {
      const slide=draft.pages[issue.page-1];
      if (issue.operation==='hold') throw Error('需提案人确认并交回责任阶段');
      if (issue.operation==='note') throw Error('本项留给版式人工判断');
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
  const retained=new Map(current.remaining.map(issue=>[issueKey(issue),issue]));
  const scope=[...new Set([...issues.map(issue=>issue.page),...current.applied.map(issue=>issue.page)])].sort((a,b)=>a-b);
  rounds=2;
  await overview({call,current,round:rounds,receipts});
  issues=await recheck({call,plan:current.plan,edition:current.edition,round:rounds,
    selected:scope.length?scope:[1],prior:issues.map(issue=>retained.get(issueKey(issue)) ?? issue),
    keep:current.remaining,receipts,onEvent});
  current=await refine({current,issues,...context});
  applied.push(...current.applied);
  let pending=mergeIssues(current.remaining);
  if (current.applied.length) {
    await overview({call,current,round:rounds,receipts});
    const selected=[...new Set(current.applied.map(issue=>issue.page))].sort((a,b)=>a-b);
    const prior=mergeIssues([...pending,...current.applied.filter(issue=>selected.includes(issue.page))]);
    pending=await recheck({call,plan:current.plan,edition:current.edition,round:rounds,selected,
      prior,keep:pending,verify:true,receipts,onEvent});
  }
  pending=await qualifyCritical({call,current,pending,round:rounds,receipts,onEvent,project});
  const retryable=pending.some(issue=>issue.level==='P0'&&issue.operation!=='hold');
  if (retryable) {
    rounds=3;
    current=await refine({current,issues:pending,...context});
    applied.push(...current.applied);
    await overview({call,current,round:rounds,receipts});
    const selected=[...new Set([...pending.filter(issue=>issue.level==='P0'),...current.applied].map(issue=>issue.page))].sort((a,b)=>a-b);
    const prior=mergeIssues([...current.remaining,...current.applied]);
    pending=await recheck({call,plan:current.plan,edition:current.edition,round:rounds,selected,
      prior,keep:current.remaining,verify:true,receipts,onEvent});
    pending=await qualifyCritical({call,current,pending,round:rounds,receipts,onEvent,project});
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
