import { rowOf, sectionsOf, type Row } from './stageText';

// New Briefs declare their two display sections. Older task cards mix project facts
// with run metadata, questions and receipts; read their labelled project rows only.
const groups: [RegExp, string][] = [
  [/^(客户|客户名称|品牌|品牌名称)$/, '品牌'],
  [/^(品牌或产品|品牌与产品)$/, '品牌与产品'],
  [/^(品类|产品|产品名称|产品品类|新品)$/, '产品'],
  [/^(核心卖点|卖点|产品卖点|品牌提供的卖点|品牌卖点)$/, '品牌提供的卖点'],
  [/^(提案要求|目标|输出目标|提案目标|项目目标|交付内容|提案类型)$/, '提案要求'],
  [/^(目标受众|目标人群|受众)$/, '目标人群'],
  [/^(传播渠道|投放渠道|渠道)$/, '渠道'],
  [/^(时间|上市时间|汇报时间|交付时间|传播时机|节点)$/, '时间'],
  [/^(项目名称|预算|市场|目标市场|产品规格|背景|项目背景|场景|时间与渠道|产品与卖点)$/, ''],
];
const unknown = /未提供|未明确|尚未|未说明|未确定|待确认|待定|暂定|未知|不详|待核实/;
const metadata = /版本|规范|整理者|作者|授权|工作模式|确认状态|阶段状态|来源记录/;
const treatment =
  /按|先|暂以|暂将|暂用|暂设|假设|暂不|视为|对比|比较|分开|分别|并行|沿用|保留|采用|默认|不依赖|限定|聚焦|仅查/;
const comparable = (s: string) => s.replace(/[。.!！\s]+$/u, '').trim();

export function briefCard(text: string) {
  const sections = sectionsOf(text);
  const explicit = sections.find((s) => s.heading === '已掌握的项目信息');
  const task =
    explicit ??
    sections.find(
      (s) => /^(主要信息|任务概况|基本信息|项目概况|任务信息|项目任务卡)$/.test(s.heading) && s.lines.length,
    );
  const inputs = (
    task ? task.lines : sections.filter((s) => !s.heading || /任务卡/.test(s.heading)).flatMap((s) => s.lines)
  )
    .map(rowOf)
    .filter((row): row is Row => Boolean(row));
  const rows: Row[] = [];
  const add = (label: string, value: string) => {
    if (!value || rows.some((r) => comparable(r.value) === comparable(value))) return;
    rows.push({ label, value });
  };
  for (const { label, value } of inputs) {
    if (metadata.test(label)) continue;
    const group = groups.find(([pattern]) => pattern.test(label));
    if (!explicit && !group) continue;
    const key = group?.[1] || label;
    // In legacy briefs a background paragraph sometimes repeats the deliverable,
    // then explicitly attributes a selling point to the brand.
    const claim =
      !explicit && /背景/.test(key) && value.match(/(?:品牌|产品)?卖点(?:为|是|包括|[：:])\s*([^。；;]+)/u);
    if (claim) {
      add('品牌提供的卖点', claim[1]);
      continue;
    }
    const fact = value
      .split(/[；;。]/u)
      .filter((part) => !unknown.test(part) && !/^\s*(?:先按|可先|暂按|建议|需补查)/.test(part))
      .join('；')
      .replace(/[；\s]+$/u, '')
      .trim();
    if (!unknown.test(value)) add(key, value);
    else if (fact && !/[？?]/u.test(fact)) add(key, fact);
  }

  const assumptions: string[] = [];
  const declared = sections.filter((s) => /影响下一步的未知项|假设/.test(s.heading));
  for (const section of declared) {
    for (const line of section.lines) {
      const row = rowOf(line);
      const action = row?.value ?? line;
      if (
        !metadata.test(line) &&
        (row || !line.startsWith('|')) &&
        !/[?？]$/.test(action) &&
        treatment.test(action) &&
        (row || unknown.test(line))
      ) {
        const statement = row ? row.label + '：' + row.value : line;
        if (!assumptions.includes(statement)) assumptions.push(statement);
      }
    }
  }
  // For old cards apply only the research policy that already governs an explicitly
  // unresolved audience/channel. Never infer a particular demographic or deployment.
  if (!explicit && !declared.length) {
    const missing = inputs.filter((r) => unknown.test(r.value));
    const channelMissing = missing.some(
      (r) => /渠道/.test(r.label) || r.value.split(/[；;。]/u).some((part) => /渠道/.test(part) && unknown.test(part)),
    );
    if (channelMissing && !rows.some((r) => /渠道/.test(r.label))) {
      assumptions.push('渠道未定：研究先按不同媒介分别比较案例，标明各自的适用条件。');
    }
    if (missing.some((r) => /受众|人群/.test(r.label)) && !rows.some((r) => r.label === '目标人群')) {
      assumptions.push('目标人群未定：先比较资料中不同人群的使用或购买情境，保留有依据的发现。');
    }
  }
  return { rows, assumptions };
}
