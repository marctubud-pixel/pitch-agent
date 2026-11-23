const chapters = ['行业与市场','竞争与同类传播','人群与接触情境'];
export const researchAngles = {
  '行业与市场': ['品类规模与走势','供给与竞争格局','渠道与销售结构','品类价格带','品类创新与变化'],
  '竞争与同类传播': ['规格与商品组合','定位与主张','画面与信息层级','渠道与传播执行','价格与产品带'],
  '人群与接触情境': ['人群构成','选择偏好与顾虑','购买行为与渠道','使用场景与时机'],
};
export function reviewedFindings(findings, accepted, labels) {
  const selected = new Set(accepted);
  const classified = new Map();
  for (const label of labels) {
    const index = label?.findingIndex;
    const finding = findings[index];
    if (!selected.has(index) || !Number.isInteger(index) || !finding || classified.has(index))
      continue;
    if (!researchAngles[label.chapter]?.includes(label.angle)) continue;
    if (finding.images?.length && label.chapter !== '竞争与同类传播') continue;
    if (!finding.url && finding.chapter==='产品与品牌') continue;
    classified.set(index,{chapter:label.chapter,editorialAngle:label.angle});
  }
  return findings.flatMap((finding,index)=>{
    if (!selected.has(index)) return [];
    const {editorialAngle:previousAngle,...record} = finding;
    return [{...record,...classified.get(index)}];
  });
}

export function missingResearchCoverage(findings) {
  return chapters.flatMap(chapter=>{
    const available = new Set(findings.filter(f=>f.chapter===chapter && f.editorialAngle).map(f=>f.editorialAngle));
    if (available.size>=2) return [];
    const missing=researchAngles[chapter].filter(a=>!available.has(a));
    return [chapter+'还需补查 '+(2-available.size)+' 个不同角度，可查'+missing.join('、')+'。'];
  });
}

const string = {type:'string'};
const fields = {chapter:{type:'string',enum:chapters}, title:string, detail:string, findingIndex:{type:'integer'}};
const schema = {type:'object',additionalProperties:false,required:['digest','strategyAdvice'],properties:{strategyAdvice:{type:'array',items:{type:'object',additionalProperties:false,required:['recommendation','findingIndices'],properties:{recommendation:string,findingIndices:{type:'array',items:{type:'integer'}}}}},digest:{
  type:'array',items:{type:'object',additionalProperties:false,required:Object.keys(fields),properties:fields},
}}};

function numbers(text) {
  const normalized = text.normalize('NFKC').toLowerCase()
    .replace(/([一二两三四五六七八九十零半\d])成([一二三四五六七八九半\d])?/gu, (_, head, tail) => {
      const digit = ch => ch === '半' ? 0.5 : ch === '十' ? 10 : ch === '两' ? 2 : /\d/.test(ch) ? Number(ch) : '零一二三四五六七八九'.indexOf(ch);
      return String(digit(head)*10 + (tail === '半' ? 5 : tail ? digit(tail) : 0))+'%';
    })
    .replace(/((?:19|20)\d{2})(?=\s*(?:和|、|至|到|—|–|-)\s*(?:19|20)\d{2}年)/gu,'$1年');
  return [...normalized.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?\s*(?:%|‰|亿|万|毫升|ml|升|公斤|千克|克|元|年|人|家|倍|种|款|次|份|个|件|天|周|月|小时|分钟|点|岁|瓶|盒|吨|户|杯|个百分点)/g)]
    .map(([value])=>value.replace(/[,\s]/g,'').replace('毫升','ml').replace(/^[\d.]+/,n=>String(Number(n))));
}

export function validateResearchDigest(rows, findings) {
  if (!Array.isArray(rows)) throw Error('研究精选必须是一组条目');
  if (!rows.length && findings.some(f=>!f.visualOnly && chapters.includes(f.chapter))) throw Error('至少精选一条与本案有关的已核判断');
  const reviewed = findings.some(f=>f.editorialAngle);
  const seen = new Set();
  for (const row of rows) {
    const index = row?.findingIndex;
    const finding = findings[index];
    if (!Number.isInteger(index) || !finding || finding.visualOnly || seen.has(index) || !chapters.includes(row.chapter) || !chapters.includes(finding.chapter) ||
        (reviewed && row.chapter!==finding.chapter) || (finding.images?.length && row.chapter!=='竞争与同类传播'))
      throw Error('研究精选引用的发现不存在、重复或归组不符');
    seen.add(index);
    if (![row.title,row.detail].every(s=>typeof s==='string' && s.trim() && !/[\r\n]/.test(s)))
      throw Error('每条研究精选需有一句标题与一段简短解释');
    if (/^(?:建议(?:先|将|把|在|用|以|为|把握)|应(?:该|当|先|将|把|以|优先|关注)|可(?:先|优先|考虑)|优先(?:选择|关注|展示|比较))/.test(row.title))
      throw Error('标题应直陈已经观察到的事实，设计及策略建议留在底稿');
    if (/(?:可供(?:本案|设计|策略)?(?:参考|比较|借鉴)|(?:本次)?摘要(?:未|没有)(?:确认|说明|披露)|(?:不能|无法|不可)据此(?:推断|推导|证明|判断))/.test(row.detail))
      throw Error('解释只保留支持标题的观察或数据，将必要的范围写在事实旁，删除用途和局限尾注');
    const source = [finding.conclusion,finding.evidence,...(finding.images ?? []).map(img=>img.observation)].join(' ');
    const sourceYears = String(finding.source ?? '').match(/(?:19|20)\d{2}年/g) ?? [];
    const allowed = new Set(numbers([source,...sourceYears].join(' ')));
    const unsupported = numbers(row.title+' '+row.detail).filter(n=>!allowed.has(n));
    if (unsupported.length) throw Error('发现 '+index+' 引入原发现没有的数值或单位：'+unsupported.join('、'));
  }
  for (const chapter of chapters) {
    const entries=rows.filter(r=>r.chapter===chapter);
    if (reviewed) {
      const available = new Set(findings.filter(f=>f.chapter===chapter && f.editorialAngle).map(f=>f.editorialAngle));
      const minimum = Math.min(2,available.size);
      const angles = entries.map(r=>findings[r.findingIndex].editorialAngle);
      if (entries.length<minimum || angles.some(a=>!researchAngles[chapter].includes(a)) || new Set(angles).size!==angles.length)
        throw Error(chapter+'需要按实际可用证据精选不同角度（本版至少 '+minimum+' 条），不得凑数');
    }
    if (entries.length>3) throw Error('单个章节最多精选三条');
  }
  return chapters.flatMap(chapter=>rows.filter(row=>row.chapter===chapter).map(({title,detail,findingIndex})=>({
    chapter,title:title.trim(),detail:detail.trim(),findingIndex,
  })));
}

export function validateStrategyAdvice(items, digest) {
  const published = new Set(digest.map(row=>row.findingIndex));
  if (!Array.isArray(items) || items.length>3 || (published.size>0 && !items.length))
    throw Error('请从已核实的首页结论收成一至三条策略建议');
  return items.map(({recommendation,findingIndices})=>{
    if (typeof recommendation!=='string' || !recommendation.trim() || !Array.isArray(findingIndices) ||
        !findingIndices.length || new Set(findingIndices).size!==findingIndices.length ||
        findingIndices.some(i=>!published.has(i))) throw Error('策略建议必须引用本次摘要中已展示的发现编号');
    return {recommendation:recommendation.trim(),findingIndices};
  });
}

export async function editResearchDigest(call, findings, project) {
  const reviewed = findings.some(f => f.editorialAngle);
  const eligible = findings.map((f,findingIndex)=>({findingIndex,visualOnly:f.visualOnly,chapter:f.chapter,conclusion:f.conclusion,evidence:f.evidence,
    implication:f.implication,caseTakeaways:(f.images ?? []).filter(i=>i.creatorRationale).map(i=>i.takeaway).filter(Boolean),source:f.source,angle:f.editorialAngle,observations:(f.images ?? []).filter(image=>image.sameCategory || !Object.hasOwn(image,'creatorRationale') || image.creatorRationale).map(image=>image.observation)})).filter(f=>!f.visualOnly && chapters.includes(f.chapter) && (!reviewed || f.angle));
  if (!eligible.length) return {researchDigest:[],strategyAdvice:[]};
  const productFacts = findings.filter(f => f.chapter === '产品与品牌').map(f => f.conclusion);
  const task = {
    editorial: true,
    rules: [],
    assignment: '比稿负责人整理研究摘要',
    context: JSON.stringify({
      project: {title: project.title, brief: project.brief, proposalKind: project.proposalKind, productFacts},
      findings: eligible,
    }),
  };
  const instruction = [
    eligible.some(f=>f.angle)
      ? '按行业、竞品、人群三组各优先选二至三条已复核且角度不同的观察。若定向补查后该组仍只有一个有效角度则只选一条，没有就省略。只选有 angle 的条目，同一角度不重复，同一份材料的一句结论不能拆成两条。'
      : '从这份旧版已核发现中按行业、竞品、人群精选。各组最多三条，没有相关材料的组跳过。旧版 chapter 只是初拟分组，按观察对象校正，例如受访者自报购买渠道归人群，整个品类各渠道销售额结构归行业，单款产品在某渠道的陈列或包装归竞品。保留原 findingIndex 以便溯源。',
    '先比较项目产品、人群、使用场景、载体和决策，舍弃无关邻近品类或不适用人群的细节，例如与本案无关的泛早餐调查、儿童吸管。',
    '不得每条重复说明与本案相关。',
    '每条只绑定一条原发现的 findingIndex，不拼接两条来源。已有复核角度的条目沿用复核确认的 chapter。',
    '有实际包装或KV对照且与本案相关的竞品图组，优先选入。',
    '标题只直陈观察：写谁、有什么特征、出现什么差别或变化。不要用动作指令、建议、问句或设计方案作标题。读者应能从标题看出实际发现。标题宜短，用日常中文概括规律；具体百分比、年份与调查名放在解释中，避免标题和解释重复同一句。例如“便利店是燕麦奶的购买渠道之一”，解释再给占比。',
    '解释只写支撑这个观察的具体事实。年份、人群、地区、样本与统计口径贴在对应事实或数字旁；产品图写图上实际可见的差别。不要再写对本案的用途或建议。',
    '例如把“建议优先关注价格与口味”改成“受访者最常提到价格与口味”（仅当原调查确实显示它们居前）。把“这两款包装可供比较名称呈现方式”改为实际看见的字序或字号差别。',
    '删除“摘要未确认样本量”“不能据此推断销量”等逐条局限尾注。若局限确实改变判断，在陈述中缩小范围：渠道数据只说调查中的购买渠道，样本只代表受访者。范围仍说不清或结论不能成立时，舍弃整条。不要删去会改变结论的年份、人群或场景。',
    '相关且口径明确的数据应保留数字、单位、样本范围，原文不能支持的数据一律不写。',
    '不得把相邻品类或外国样本写成本案调查，不下购买效果断言。',
    'strategyAdvice 写一至三条供下一步策略使用的具体设计建议，每条的 findingIndices 只引用本版所选 digest 的原 findingIndex，不写市场预测或未经证实的功能承诺。建议应明确在本案的哪个触点、优先讲什么、用什么方式测试。',
    '只输出客户读得懂的短句，不写流程、来源编号和执行说明。',
  ].join('');
  let correction = '';
  for (let attempt=0;attempt<2;attempt++) {
    const result = await call(instruction+correction,[],schema,task);
    try {
      const researchDigest = validateResearchDigest(result.parsedOutput?.digest,findings);
      const strategyAdvice = validateStrategyAdvice(result.parsedOutput?.strategyAdvice,researchDigest);
      return {researchDigest,strategyAdvice};
    }
    catch(error) {
      if (attempt===1) throw error;
      correction='上一次输出未通过校验，请针对以下问题重编：'+error.message;
    }
  }
}

// These are rewrite triggers, not display limits. Never truncate a qualifier or a quotation.
function crowdedResearchCopy({conclusion, explanation}) {
  return [...conclusion].length > 32 || [...explanation].length > 60 ||
    /[，,；;]\s*(?:但|不过)?(?:不能外推|不能推广|不能据此)/u.test(conclusion) ||
    [conclusion,explanation].some(text=>/[。！？；;\n]\s*[^“”‘’。！？\s]/u.test(text.trim()));
}

function keepsSceneComparison(original, edit) {
  if (original.audienceTopic!=='使用场景') return true;
  const percentages=row=>(row.conclusion+' '+row.explanation).normalize('NFKC').match(/\d+(?:\.\d+)?%/gu) ?? [];
  const before=new Set(percentages(original));
  const after=new Set(percentages(edit));
  return before.size<2 || [...before].every(value=>after.has(value));
}

export async function compactResearchPage(call, sections, findings, onEvent, signal, { maxAttempts = 2 } = {}) {
  const pending = sections.map((row,index)=>({row,index})).filter(({row})=>crowdedResearchCopy(row));
  if (!pending.length) return sections;
  const packet = pending.map(({row,index})=>({...row,index,
    evidence:row.evidenceIndices.map(i=>({source:findings[i].source,quote:findings[i].evidence,passage:findings[i].passage})),
  }));
  const rowSchema = {type:'object',additionalProperties:false,required:['index','conclusion','explanation','sourceDetail'],
    properties:{index:{type:'integer',enum:pending.map(item=>item.index)},conclusion:string,explanation:string,sourceDetail:string}};
  const responseSchema = {type:'object',additionalProperties:false,required:['edits'],
    properties:{edits:{type:'array',items:rowSchema}}};
  const written = [...sections];
  await onEvent?.('比稿负责人正在精简研究页标题与副文');
  let remaining = packet;
  const instruction = '发布前精简自己的文案。每条标题只说一个判断，副文只说一个例子、数字或比较理由。同题场景合并时，副文用一句话并列保留原有的场景和各自的比例，两项合起来就是一个比较。标题用对象和动词限定范围，比如“受访者更愿意……”已交代这是受访者的意愿。“样本仅限……，不能外推……”等说明移到 sourceDetail。避免在标题和副文加上同一个限制尾句。每个 index 只写一次，保留时期、关键条件和原意。仅返回 edits。';
  try {
    for (let attempt=0;remaining.length && attempt<maxAttempts;attempt++) {
      const retry = attempt ? '上一版仍有长句、多个判断或缺项。只处理这次给出的条目，删掉重复解释。' : '';
      const response = await call(instruction+retry,[],responseSchema,
        {editorial:true,context:JSON.stringify(remaining)});
      const edits = response.parsedOutput?.edits;
      if (!Array.isArray(edits)) continue;
      const next = [];
      for (const item of remaining) {
        const matches = edits.filter(edit=>edit?.index===item.index);
        const edit = matches[0];
        if (matches.length===1 && keepsSceneComparison(item,edit) && typeof edit.sourceDetail==='string' &&
            [edit.conclusion,edit.explanation].every(v=>typeof v==='string' && v.trim()) && !crowdedResearchCopy(edit)) {
          written[item.index]={...sections[item.index],conclusion:edit.conclusion.trim(),explanation:edit.explanation.trim(),
            sourceDetail:edit.sourceDetail.trim() || item.sourceDetail || ''};
        } else next.push(item);
      }
      remaining=next;
    }
  } catch {
    signal?.throwIfAborted();
  }
  if (remaining.length) await onEvent?.('部分条目未完成精简，已保留对应的有据原句。');
  return written;
}
