import {pythonBinary} from './runtime-dependencies.mjs';
import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { rowOf, sectionsOf } from '../../shared/stage-text.mts';
import { readPublishedCopy } from './copy-review.mjs';
import library from '../../skills/proposal-structure-pilot/references/page-library.json' with { type: 'json' };
import { materialSheetName, readAttemptText, readPageMaterials } from './outline-materials.mjs';

const execute = promisify(execFile);
const compiler = fileURLToPath(new URL('../../skills/proposal-structure-pilot/scripts/build_outline.py', import.meta.url));
const kindNames = { packaging: '包装设计提案', kv: 'KV 设计提案' };
const unique = values => [...new Set(values.filter(Boolean))];
const paragraphs = (...values) => unique(values.flat()).join('\n');
const problem = message => Object.assign(new Error(message), { status: 400 });

export function normalizeOutlineOptions(kind, value = {}) {
  if (kind != null && !Object.hasOwn(kindNames, kind)) throw problem('提案载体无效');
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !['include', 'singleTouchpoint'].includes(k))) throw problem('逐页选项无效');
  const { include = [], singleTouchpoint = false } = value;
  const rows = [...library.groups.closing, ...(library.groups[kind] ?? [])];
  const allowed = unique(rows.map(r => r.when));
  if (!Array.isArray(include) || !include.every(option => allowed.includes(option)) ||
      typeof singleTouchpoint !== 'boolean') throw problem('逐页选项与提案载体不符');
  return { include: allowed.filter(option => include.includes(option)), singleTouchpoint };
}

const positiveClauses = text => text.split(/[，,。；;\n]/u).map(s => s.trim()).filter(s =>
  s && !/(?:不需要|无需|不必|不要|不做|暂缓|仅供参考|只作参考|仅作参考|^参考)/u.test(s));

export function taskKind(target, structured) {
  const kinds = new Set();
  for (const clause of positiveClauses(target)) {
    // In free text, require an actual requested output. A market or reference description is insufficient.
    if (!structured && !/(?:制作|设计|交付|输出|开发|提案|方案|需要|做|改版|升级|概念稿)/u.test(clause)) continue;
    if (/包装|瓶标|盒型|礼盒设计/u.test(clause)) kinds.add('packaging');
    if (/\bKV\b|主视觉|海报/iu.test(clause)) kinds.add('kv');
    if (/\bTVC\b|电视广告片|IP表情|整场活动/iu.test(clause)) return null;
  }
  return kinds.size === 1 ? [...kinds][0] : null;
}

function requestedOptions(kind, target, structured) {
  const clauses = positiveClauses(target).filter(clause => structured ||
    /交付|输出|需要|要求|制作|设计|提供|附上|含|包括/u.test(clause));
  const text = clauses.join('\n');
  const checks = kind === 'kv' ? {
    process: /制作过程|创作过程|草图到成稿/u,
    motion: /动效|动态版|分镜/u,
    adaptation: /第二画幅|横竖(?:两|双)?版|横[、和与／/]竖版|横版.{0,12}竖版|竖版.{0,12}横版/u,
  } : { series: /多\s*SKU|系列包装|全系列|多口味包装|\d+\s*(?:个|款)?\s*SKU/iu };
  checks.activation = /活动延展|营销延展|品牌传播延展|节庆活动方案/u;
  return {
    include: Object.keys(checks).filter(k => checks[k].test(text)),
    singleTouchpoint: /(?:仅|只)(?:有|做|需|展示|考虑|设计|投放)?一(?:个|种)(?:应用)?(?:触点|渠道|媒介)/u.test(text),
  };
}

function lead(text) {
  return (text || '').split(/[\n。！？]/u).map(s => s.trim()).find(Boolean) || '';
}

function section(sections, pattern) {
  return sections.find(s => pattern.test(s.heading))?.lines ?? [];
}

function filled(title, body, refs, images = []) {
  return { client_title: title, content: body, material_ref: paragraphs(refs), images, status: '有据' };
}

function partial(page, reasons) {
  const gaps = reasons.filter(Boolean);
  if (!gaps.length) return page;
  return { ...page, content: paragraphs(page.content, gaps), status: '待补', gapReason: gaps.join(' ') };
}

function findingsPage(findings, refs) {
  if (!findings.length) return null;
  const body = findings.map((f, index) => {
    const firstSentence = f.evidence.match(/^[^。！？]{1,100}[。！？]/u)?.[0];
    return paragraphs(index > 0 && f.conclusion, '依据：' + (firstSentence || f.evidence),
      '对策略的用处：' + f.implication);
  }).join('\n\n');
  return filled(findings[0].conclusion, body, [refs, ...findings.map(f =>
    paragraphs(f.source + (f.url ? ' ' + f.url : ''), '原文：' + f.evidence))]);
}

const missing = {
  assignment: '项目问题及本次委托', category: '行业判断及其可核来源', brand: '现有品牌资产及出处',
  competitors: '同任务竞品判断与可比原图', audience: '目标人群的决策情境和行为依据',
  product: '产品事实及其可核依据', findings: '研究综合判断', choice: '研究、产品、人群交叉点和取舍依据',
  focus: '明确的策略发力点', directions: '同版创意方向',
  'pack-idea': '本方向的同版主题稿', 'kv-idea': '本方向的同版主题稿',
  'pack-front': '同版完整包装主稿', 'kv-hero': '同版完整主视觉',
  'pack-views': '同版包装的侧背或展开视图', 'pack-detail': '同版包装的关键细节',
  'pack-series': '同方向全系列的同尺度正面', 'pack-shelf': '实际或明确标注模拟的售卖场景',
  'pack-second-use': '另一购买触点的同版样机', 'kv-detail': '可核对的画面细节释义',
  'kv-process': '能解释关键取舍的真实过程材料', 'kv-motion': '明确身份的本案动效或分镜',
  'kv-adaptation': '第二画幅的同版完整稿', 'kv-primary-use': '第一媒介中的同版样机',
  'kv-second-use': '第二媒介中的同版样机', activation: '承接具体方向的活动设想',
  compare: '同一条件下可比较的多案作品',
};

async function stageText(root, artifacts, stage) {
  const item = artifacts.findLast(a => a.kind === 'text' && a.stage === stage);
  return item ? { name: item.name, body: await readAttemptText(root, item.name) } : { name: '', body: '' };
}

// Only chart figures paired in the same source, metric and unit. Preserve the
// cited sentence on the slide as well, including qualifications outside the numbers.
function pageFacts(type,input) {
  const rows=chapter=>input.byChapter.get(chapter) ?? [];
  if (type==='category') {
    for (const f of rows('行业与市场')) {
      const series=[];
      const pairs=/((?:19|20)\d{2})年[：:\s]*(?:为)?\s*(\d+(?:\.\d+)?)\s*(亿元|万元|万件|万瓶|万吨|%|％)/gu;
      const observations=[...f.evidence.matchAll(pairs)];
      if (observations.length<2 || observations.length>10) continue;
      const unit=observations[0][3].replace('％','%');
      const between=observations.slice(1).every((m,i)=>/^[，,、；;\s和与至到]*$/u.test(
        f.evidence.slice(observations[i].index+observations[i][0].length,m.index)));
      if (!between || observations.some(m=>m[3].replace('％','%')!==unit) || new Set(observations.map(m=>m[1])).size!==observations.length) continue;
      for (const [,year,value] of observations) series.push({label:year+'年',value});
      const first=observations[0],last=observations.at(-1);
      const scope=[f.evidence.slice(0, first.index),f.evidence.slice(last.index+last[0].length)]
        .map(text=>text.replace(/^[，、。；：:\s]+|[，、。；：:\s]+$/gu,'')).filter(Boolean).join('。');
      return {series,unit,scope,source:f.source,implication:f.implication};
    }
  }
  if (type==='competitors') {
    const findings=rows('竞争与同类传播');
    const cases=findings.flatMap(f=>(f.images ?? []).filter(img=>img.title && img.observation).map(img=>({name:img.title,values:[img.observation]})));
    return {rows:cases.length ? cases : findings.map(f=>({name:f.source,values:[f.conclusion]}))};
  }
  if (type==='audience') {
    const finding=rows('人群与接触情境')[0];
    const audience=input.fields.find(f=>/^(目标人群|核心人群|目标用户)$/u.test(f.label));
    const declared=audience?.value || /^\s*(?:目标人群|核心人群|目标用户)\s*[：:]\s*(.+)$/mu.exec(input.project.brief || '')?.[1]?.trim();
    return finding && {name:declared ? '简报人群 · '+declared : '接触情境',profile:finding.evidence,implication:finding.implication};
  }
  if (type==='directions') return {points:input.visible.map(k=>({k,d:input.drafts.get(k)?.claim || input.drafts.get(k)?.main || ''}))};
  if (type==='product') return {specs:input.fields.filter(f=>/产品名称|产品与品类|产品品类|^产品$|^品类$|卖点|配料|规格|工艺/u.test(f.label)).map(f=>({k:f.label,v:f.value}))};
}

function clientPage(slot, input) {
  const { type_id: type, direction } = slot;
  const { project, assigned, drafts, mains, byChapter, strategy, copyRef, researchRef,
    kind, fields, briefRef, title, visible, sourceMaterials } = input;
  const group = label => byChapter.get(label) ?? [];
  const fact = pattern => paragraphs(fields.filter(row => pattern.test(row.label)).map(row => row.label + '：' + row.value));
  const route = drafts.get(direction), main = mains.get(direction);
  const recommendation = input.recommendation;
  const asset = sourceMaterials.bound.get(slot.instance_id);
  const fromAsset = () => filled(asset.caption, '项目提供 · ' + asset.identity + '\n' + asset.caption,
    [materialSheetName, asset.source, ...asset.images, mains.get(asset.direction)?.name], asset.images);
  switch (type) {
    case 'cover': return filled(title, kindNames[kind], briefRef);
    case 'toc': return filled('目录', '', '本版逐页稿');
    case 'assignment': return assigned ? filled('本次委托', assigned, briefRef) : null;
    case 'category': return findingsPage(group('行业与市场'), researchRef);
    case 'brand': {
      const data = fact(/品牌名称|^品牌$|品牌资产|视觉资产|品牌识别|品牌现貌|品牌或产品/u);
      if (!data && !asset) return null;
      return partial(filled('品牌与现有资产', paragraphs(data, asset?.caption),
        [briefRef, asset?.source, ...(asset?.images ?? [])], asset?.images ?? []), [!asset && '现有品牌图像待补。']);
    }
    case 'competitors':
    case 'audience': {
      const isPeer = type === 'competitors';
      const report = findingsPage(group(isPeer ? '竞争与同类传播' : '人群与接触情境'), researchRef);
      const images = asset?.images ?? (isPeer ? input.competitorRefs : []);
      if (!report && !images.length) return null;
      const page = filled(report?.client_title || (isPeer ? '同类作品对照' : '目标人群的接触情境'),
        paragraphs(report?.content, asset && ('项目提供 · ' + asset.identity + '。' + asset.caption)),
        [report?.material_ref, asset?.source, ...images], images);
      return partial(page, [!report && '对应研究判断与依据待补。',
        !images.length && (isPeer ? '可同屏核对的同类原图待补。' : '对应场景图待补。'),
        isPeer && images.length === 1 && '当前只有一张同类原图，横向比较仍待补充。']);
    }
    case 'product': {
      const research = findingsPage(group('产品与品牌'), researchRef);
      const product = fact(/产品名称|产品与品类|产品品类|^产品$|^品类$|卖点|配料|规格|工艺/u);
      if (!research && !product) return null;
      return partial(filled(research?.client_title || '项目提供的产品信息',
        paragraphs(research?.content, product && '简报所列：\n' + product), [research?.material_ref, product && briefRef]),
        [!research && '产品主张的研究依据待补。']);
    }
    case 'findings':
    case 'choice':
    case 'focus': {
      const patterns = { findings: /研究结论|研究小结/u, choice: /方向交叉点|策略交叉点/u,
        focus: /策略发力点|核心策略|策略主张/u };
      const body = paragraphs(section(strategy.sections, patterns[type]));
      if (body) {
        const title = lead(body);
        return filled(title, body.slice(title.length).replace(/^[。！？\s]+/u, ''), strategy.name);
      }
      return type === 'findings' ? findingsPage(group('研究结论'), researchRef) : null;
    }
    case 'directions': {
      const page = filled(visible.length === 1 ? '本次展开的创意方向' : '创意方向一览',
        visible.map(name => paragraphs(name, drafts.get(name)?.claim || drafts.get(name)?.main)).join('\n\n'), copyRef);
      return partial(page, [drafts.size !== visible.length && '部分方向的同版文案原稿待核。']);
    }
    case 'pack-idea':
    case 'kv-idea': return route ? filled(route.main || direction, paragraphs(direction, route.claim, route.mechanism, route.strategyLink), copyRef) : null;
    case 'pack-front':
    case 'kv-hero': return main ? filled(direction, '', main.name, [main.name]) : null;
    case 'kv-detail':
    case 'pack-detail': {
      if (asset) return fromAsset();
      if (!main?.visual?.blind?.action) return null;
      const read = main.visual.blind;
      return filled(direction + ' · 画面细读', paragraphs('单图盲读记录：' + read.action,
        read.words && '依靠文字辨认的信息：' + read.words), [main.name, '本版主视觉单图盲读'], [main.name]);
    }
    case 'compare': {
      if (visible.length < 2) return null;
      const pictures = visible.map(d => mains.get(d)).filter(Boolean);
      if (pictures.length !== visible.length) return null;
      const chosen = [...drafts.values()].find(d => d.id === recommendation?.directionId);
      const explanation = pictures.map(p => paragraphs(p.visual.direction, p.visual.reason)).join('\n\n');
      return filled('各方向并排比较', paragraphs(explanation, chosen && '文案评审推荐主题「' + chosen.main + '」。' +
        paragraphs(recommendation.reason, recommendation.tradeoff), '整案方向由客户确认。'),
        [copyRef, ...pictures.map(p => p.name)], pictures.map(p => p.name));
    }
    case 'back-cover': return filled(title, '谢谢', briefRef);
    default: return asset ? fromAsset() : null;
  }
}

export async function buildProposalOutline(project, dir) {
  const root = await realpath(dir);
  const artifacts = project.artifacts ?? [];
  const brief = await stageText(root, artifacts, 'brief');
  const known = section(sectionsOf(brief.body), /已掌握的项目信息/u);
  const fields = known.map(rowOf).filter(Boolean);
  const target = fields.filter(r => /输出目标|交付(?:内容|物)|提案类型|设计任务/u.test(r.label)).map(r => r.value).join('\n');
  const declared = project.proposalKind;
  const task = target || project.brief || '';
  const taggedMains = artifacts.filter(a => a.stage === 'visual' && a.visual?.role === 'main');
  const exclusivelyPackaging = taggedMains.length && taggedMains.every(a => a.visual.output === 'packaging');
  const otherCommission = /\bKV\b|主视觉|海报|\bTVC\b|电视广告片|IP表情|整场活动/iu.test(task);
  const kind = declared || taskKind(task, Boolean(target)) || (exclusivelyPackaging && !otherCommission ? 'packaging' : null);
  if (!kind) return null;
  const options = normalizeOutlineOptions(kind, project.outlineOptions ?? requestedOptions(kind, target || project.brief || '', Boolean(target)));
  // Old runs kept untagged images. Preserve their original, lossless export path.
  if (!declared && artifacts.some(a => a.stage === 'visual' && a.kind === 'image' &&
      !['main', 'comparison'].includes(a.visual?.role))) return null;
  const names = project.directions ?? [];
  if (![2, 3].includes(names.length)) {
    if (!declared) return null;
    throw Error('逐页编稿缺少本版已交接的文案方向');
  }
  const visible = project.mode === 'collab' ? names.filter(name => name === project.choice) : names;
  if (!visible.length) throw Error('逐页编稿缺少协作模式已选方向');
  const args = ['-I', '-B', compiler, '--kind', kind, '--directions', ...names, '--format', 'json'];
  if (options.include.length) args.push('--include', ...options.include);
  if (options.singleTouchpoint) args.push('--single-touchpoint');
  const { stdout } = await execute(await pythonBinary(), args, { maxBuffer: 2 * 1024 * 1024, timeout: 15000 });
  const skeleton = JSON.parse(stdout);
  const slots = skeleton.pages.filter(p => !p.direction || visible.includes(p.direction));
  const [strategy, copy] = await Promise.all(['strategy', 'copy'].map(stage => stageText(root, artifacts, stage)));
  const publication = readPublishedCopy(project, copy.body);
  const drafts = new Map([...publication.drafts].filter(([name])=>visible.includes(name)));
  const mains = new Map();
  for (const a of artifacts.filter(a => a.stage === 'visual' && a.kind === 'image' && a.visual?.role === 'main')) {
    if (!visible.includes(a.visual.direction) || (a.visual.candidate && !a.visual.recommended && !a.adoptedForLayout)) continue;
    if (mains.has(a.visual.direction)) throw Error('同一方向出现多份采用主稿，请核对当前视觉版本');
    mains.set(a.visual.direction, a);
  }
  const byChapter = new Map();
  for (const f of project.research?.findings ?? []) {
    if (![f.chapter, f.conclusion, f.evidence, f.source, f.implication].every(v => typeof v === 'string' && v.trim())) continue;
    if (!byChapter.has(f.chapter)) byChapter.set(f.chapter, []);
    byChapter.get(f.chapter).push(f);
  }
  const sourceMaterials = await readPageMaterials(root, project, slots, mains);
  const pictures = (project.attachments ?? []).filter(a => /\.(png|jpe?g)$/iu.test(a.name)).map(a => a.name);
  const researchImages = new Set(artifacts.filter(a=>a.stage==='research' && a.kind==='image').map(a=>a.name));
  const observed = (project.research?.findings ?? []).flatMap(f=>(f.images ?? []).map(i=>i.name)).filter(name=>researchImages.has(name));
  const competitorRefs = unique([...observed, ...(kind==='packaging' ? project.layoutCompetitorReferences ?? [] : []).filter(n=>pictures.includes(n))]);
  const title = fields.find(f => /^项目名(?:称)?$/u.test(f.label))?.value ||
    fields.find(f => /^品牌(?:名称)?$/u.test(f.label))?.value || project.title;
  const briefRef = brief.name || '原始简报';
  const input = { project, assigned: paragraphs(fields.map(r => r.label + '：' + r.value)) || project.brief, fields, title, briefRef, kind,
    recommendation: publication.recommendation,
    strategy: { ...strategy, sections: sectionsOf(strategy.body) }, drafts, mains, visible, byChapter, competitorRefs,
    copyRef: copy.name || '当前文案方向', researchRef: artifacts.findLast(a => a.stage === 'research' && a.kind === 'text')?.name ||
      '本次研究交接', sourceMaterials };
  const pages = [], gaps = [];
  for (const slot of slots) {
    let page;
    if (slot.type_id === 'decision') {
      const grouped = Map.groupBy(gaps, row => row.direction || row.chapter);
      const pending = [...grouped].map(([chapter, rows]) => chapter + '：' + unique(rows.map(row => row.reason)).join('、'));
      page = filled('本次决定与后续核对', paragraphs(project.mode === 'collab' ? '本次已选择「' + project.choice +
        '」用于视觉开发。' : '请比较本次展示的方向，确认进入下一步深化的方案。',
        pending.length && '进入正式制作前待补：', pending,
        sourceMaterials.issues.length && '部分补充材料与本次作品未能对应，需核对材料表。',
        ...(project.research?.gaps ?? []).map(gap => typeof gap === "string" ? gap : gap.message)), [briefRef, ...sourceMaterials.issues]);
      if (gaps.length || sourceMaterials.issues.length || project.research?.gaps?.length) page.status = '待补';
    } else page = clientPage(slot, input);
    if (!page) {
      if (slot.type_id !== 'compare' || visible.length > 1) gaps.push({ instance_id: slot.instance_id,
        type_id: slot.type_id, chapter: slot.chapter, direction: slot.direction, reason: missing[slot.type_id] || slot.title });
      continue;
    }
    const { instance_id, type_id, chapter, direction, template } = slot;
    const { gapReason, ...client } = page;
    if (gapReason) gaps.push({ instance_id, type_id, chapter, direction, reason: gapReason });
    const semantic=pageFacts(type_id,input);
    pages.push({ instance_id, type_id, chapter, direction, template, ...(semantic ? {semantic} : {}), ...client });
  }
  const starts = new Map();
  for (const [index, page] of pages.entries()) if (!starts.has(page.chapter)) starts.set(page.chapter, index + 1);
  pages.find(p => p.type_id === 'toc').content = [...starts].map(([chapter, n]) => chapter + '　P' + n).join('\n');
  return { version: skeleton.library_version, kind, pages, gaps, materialIssues: sourceMaterials.issues,
    hasGaps: Boolean(gaps.length || sourceMaterials.issues.length || project.research?.gaps?.length) };
}
