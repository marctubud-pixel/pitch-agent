// Auto-mode fast-PPT pipeline helpers: fine-to-broad research ladder, 3-macro-dimension gate,
// core slogan skill extractor, category-adaptive visual aesthetic quadrants, and auto visual adoption.

const MODIFIER_PREFIXES = [
  '超低度', '低度', '轻型', '轻度', '微醺', '无糖', '零糖', '0糖', '低糖', '减糖', '0脂', '低脂',
  '非油炸', '低温烘烤', '冻干', '鲜榨', '冷泡', '即饮', '速溶', '手工', '精酿', '小窖', '纯粮',
  '高端', '轻奢', '国潮', '新中式', '定制', '有机', '天然', '草本', '植物基', '益生菌', '高蛋白',
  '每日', '独立小包', '独立分装', '便携', '迷你', '小瓶', '瓶装', '罐装', '袋装', '盒装',
  '原味', '浓香', '清香', '酱香', '果味', '气泡', '无醇',
];

const BROAD_HINTS = [
  [/轻型.*白酒|低度.*白酒|小瓶.*白酒|浓香.*白酒|清香.*白酒|酱香.*白酒/u, ['低度白酒', '白酒']],
  [/坚果.*燕麦|燕麦脆|麦片脆|谷物脆/u, ['燕麦脆', '健康零食', '坚果零食']],
  [/无糖.*茶|冷泡.*茶|即饮.*茶|果茶/u, ['无糖茶', '即饮茶饮']],
  [/精酿.*啤酒|果味.*啤酒|低醇.*啤酒/u, ['精酿啤酒', '啤酒']],
  [/挂耳.*咖啡|冻干.*咖啡|冷萃.*咖啡|即饮.*咖啡/u, ['即饮咖啡', '咖啡']],
  [/气泡水|苏打水|电解质水/u, ['气泡水', '包装饮用水']],
];

function validTerm(term) {
  return typeof term === 'string' && /^[\p{L}\p{N} ·-]{2,24}$/u.test(term.trim());
}

/**
 * Derive an ordered fine -> broad category ladder so research can step up to a broader
 * macro category (e.g., 轻型白酒 -> 低度白酒 -> 白酒) when fine-grained data is scarce.
 */
export function broadCategoryLadder({
  specific = '',
  planned = '',
  reportCategories = [],
  consumerCategories = [],
  catalogTerms = [],
} = {}) {
  const seen = new Set();
  const fine = [];
  const broad = [];
  const pushUnique = (target, raw) => {
    if (!validTerm(raw)) return;
    const clean = raw.trim();
    if (seen.has(clean)) return;
    seen.add(clean);
    target.push(clean);
  };

  pushUnique(fine, specific);
  for (const term of [...(reportCategories ?? []), ...(consumerCategories ?? [])]) {
    if (validTerm(term)) {
      const clean = term.trim();
      if (clean === specific.trim()) pushUnique(fine, clean);
      else pushUnique(broad, clean);
    }
  }
  pushUnique(broad, planned);
  for (const term of catalogTerms ?? []) pushUnique(broad, term);

  // Strip fine-grained Chinese product modifiers progressively from `specific`
  const base = (specific || '').trim();
  if (base) {
    for (const [pattern, parents] of BROAD_HINTS) {
      if (pattern.test(base)) {
        for (const parent of parents) pushUnique(broad, parent);
      }
    }
    let current = base;
    for (let step = 0; step < 3; step++) {
      let stripped = current;
      for (const prefix of MODIFIER_PREFIXES) {
        if (stripped.startsWith(prefix) && stripped.length - prefix.length >= 2) {
          stripped = stripped.slice(prefix.length).trim();
          pushUnique(broad, stripped);
        }
      }
      if (stripped === current) break;
      current = stripped;
    }
    // Generic Chinese tail noun fallback (last 2 chars when >= 4 chars, e.g. 轻型白酒 -> 白酒)
    if (/^\p{Script=Han}{4,}$/u.test(base)) {
      pushUnique(broad, base.slice(-2));
    }
  }

  return { fine, broad, all: [...fine, ...broad] };
}

/**
 * Macro-level research readiness gate for auto mode:
 * Requires only the 3 macro dimensions (行业与市场, 竞争与同类传播, 人群与接触情境)
 * to each have >= 1 grounded finding (conclusion + evidence/source).
 * Missing 4th dimension, 2nd audience quote, or competitor image originals are returned
 * separately as non-blocking advisory gaps.
 */
export function macroResearchGaps(report, project = {}) {
  const chapters = ['行业与市场', '竞争与同类传播', '人群与接触情境'];
  const subjects = ['market', 'competitor', 'audience'];
  const rows = report?.sections ?? [];
  const findings = report?.findings ?? [];
  const external = (f) =>
    /^https?:\/\//iu.test(f.url || '') ||
    Boolean(project.attachments?.some((a) => a.name === f.source));

  const blocking = [];
  for (const [index, chapter] of chapters.entries()) {
    const chapterRows = rows.filter(
      (r) => r.chapter === chapter && r.conclusion?.trim() && r.explanation?.trim(),
    );
    let covered = false;
    for (const row of chapterRows) {
      const refs = (row.evidenceIndices ?? [])
        .map((i) => findings[i])
        .filter((f) => f && !f.visualOnly && f.evidence?.trim() && f.source?.trim());
      const grounded = refs.filter(
        (f) =>
          (external(f) || f.macroFallback === true) &&
          (f.passage?.trim() || f.evidence?.trim() || f.images?.length),
      );
      if (
        grounded.some(
          (f) => f.subject === subjects[index] || f.chapter === chapter || (index === 1 && f.images?.length),
        )
      ) {
        covered = true;
        break;
      }
    }
    // Only fall back to raw findings when structured sections have not been assembled yet
    if (!covered && !rows.length) {
      covered = findings.some(
        (f) =>
          f &&
          !f.visualOnly &&
          (f.subject === subjects[index] || f.chapter === chapter) &&
          f.conclusion?.trim() &&
          f.evidence?.trim() &&
          f.source?.trim() &&
          (external(f) || f.macroFallback === true),
      );
    }
    if (!covered) {
      blocking.push({
        kind: 'decision',
        chapter,
        message: `${chapter}尚缺至少 1 条带数据或出处的宏观结论（可退回上位大类补查）。`,
      });
    }
  }
  return blocking;
}

/**
 * Infer a safe accepted scope in auto mode when a user's brief is broad/unclear,
 * preventing dead-stops at the brief stage while documenting the assumption.
 */
export function autoFallbackBriefScope(project, rejectedScope) {
  const text = `${project.title || ''}\n${project.brief || ''}`;
  const types = [];
  if (/包装|盒|瓶|袋|礼盒|罐/u.test(text) || project.proposalKind === 'packaging') types.push('packaging');
  if (/海报|kv|主视觉|画面|广告|宣传/iu.test(text) || project.proposalKind === 'kv') types.push('kv');
  if (/活动|快闪|市集|路演|体验展/u.test(text)) types.push('activity');
  if (/tvc|短片|广告片|视频/iu.test(text)) types.push('tvc');
  if (!types.length) types.push('kv');

  const uniqueTypes = [...new Set(types)];
  const carrierLabel = uniqueTypes
    .map((t) => ({ packaging: '包装设计', kv: 'KV主视觉', activity: '活动策划', tvc: 'TVC短片' }[t] || t))
    .join(' + ');
  const briefExcerpt = (project.brief || project.title || '待补充简报').trim().replace(/\s+/g, ' ').slice(0, 120);
  const assumption = `自动模式按「${carrierLabel}」推进完整提案，具体载体范围待提案人后续确认。`;
  const body = [
    '## 已掌握的项目信息',
    `提案任务：${carrierLabel}（自动模式按原简报推断）`,
    `其他项目条件：${briefExcerpt}`,
    '',
    '## 影响下一步的未知项',
    `交付载体范围未完全明确：${rejectedScope?.reason || '简报未逐项限定交付载体'}。暂按以下方式处理：${assumption}`,
    '',
    '## 原稿记录',
    '任务卡格式：客户意向 v1（自动模式降级受理）',
    `提案任务依据：${briefExcerpt}`,
  ].join('\n');

  return {
    briefScope: {
      status: 'accepted',
      types: uniqueTypes,
      reason: `自动模式已按「${carrierLabel}」默认受理，具体载体假设已记入未知项。`,
      autoAssumed: true,
    },
    body,
  };
}

/**
 * Strip engineering/script appendices (Section 8 templates, Python Appendix A, install Appendix B)
 * from skills/slogan-engine/SKILL.md so the writer LLM focuses purely on creative craft (-60% noise).
 */
export function coreSloganSkill(skillText = '') {
  if (typeof skillText !== 'string' || !skillText.trim()) return '';
  const stripped = skillText.split(/\n## 八、交付模板/u, 1)[0].trim();
  return stripped || skillText;
}

/**
 * Normalize whitespace and punctuation for forgiving verbatim basis matching.
 */
export function normalizeBasisText(text = '') {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .toLowerCase();
}

export function matchesSourceBasis(originals, basis) {
  if (typeof basis !== 'string' || !basis.trim()) return false;
  if (originals.some((src) => src.includes(basis))) return true;
  const target = normalizeBasisText(basis);
  if (target.length < 4) return false;
  return originals.some((src) => normalizeBasisText(src).includes(target));
}

/**
 * Category-adaptive 3-quadrant visual aesthetic matrix (Plan Z / Variant C winner).
 * Assigns 3 mutually exclusive aesthetic quadrants across Directions A/B/C so the 3 PPT
 * visual proposals are unmistakably distinct instead of lookalike studio shots.
 */
export function selectAestheticQuadrants(brief = '', carriers = []) {
  const isTechOrService = /软件|saas|ai|科技|数码|手机|汽车|金融|家电|电子|平台|app/iu.test(brief);
  const isBeautyOrFashion = /美妆|护肤|香水|服饰|鞋|穿搭|珠宝|时尚|彩妆/iu.test(brief);
  const isActivity = carriers.includes('activity') && !carriers.includes('packaging');

  if (isTechOrService) {
    return [
      {
        id: 'A',
        quadrant: '工业质感棚拍',
        style: '极简高端工业产品摄影，精密材质光影与干净留白构图',
        queryHint: '极简 工业设计 产品摄影 光影',
      },
      {
        id: 'B',
        quadrant: '真实都市使用场景',
        style: '35mm 纪实风格都市人物真实使用瞬间，自然光感与情绪代入',
        queryHint: '都市 人物 真实使用 场景摄影 海报',
      },
      {
        id: 'C',
        quadrant: '瑞士网格平面与几何图形',
        style: '高对比现代平面图形与超大编辑字体海报，克制专色版式',
        queryHint: '现代 平面设计 字体 网格 海报',
      },
    ];
  }
  if (isBeautyOrFashion) {
    return [
      {
        id: 'A',
        quadrant: '静物材质微距棚拍',
        style: '高定静物微距摄影，晶莹质感、肌理水光与建筑感阴影',
        queryHint: '极简 静物 材质 光影 广告摄影',
      },
      {
        id: 'B',
        quadrant: '时尚杂志情绪人像',
        style: '杂志编辑感胶片人像特写，自然松弛情绪与细腻肤质光影',
        queryHint: '时尚 杂志 人像 胶片 广告大片',
      },
      {
        id: 'C',
        quadrant: '先锋艺术拼贴与版式',
        style: '当代艺术插画/色彩色块与克制衬线大字结合的强识别平面海报',
        queryHint: '当代 平面插画 艺术海报 色彩版式',
      },
    ];
  }
  if (isActivity) {
    return [
      {
        id: 'A',
        quadrant: '空间装置与视觉地标',
        style: '实景城市快闪装置与标志性视觉主角，开阔建筑透视',
        queryHint: '品牌 快闪 空间装置 户外海报',
      },
      {
        id: 'B',
        quadrant: '现场人物互动纪实',
        style: '真实参与者动态瞬间、温暖现场光线与人群松弛氛围摄影',
        queryHint: '城市 活动 现场 人物互动 纪实海报',
      },
      {
        id: 'C',
        quadrant: '强识别图形与大字海报',
        style: '现代主义扁平插画/risograph 专色质感与强节奏大字排版',
        queryHint: '现代 插画 活动海报 字体排版',
      },
    ];
  }
  // Default FMCG / Beverage / Food / Packaging + KV
  return [
    {
      id: 'A',
      quadrant: '商业棚拍微距质感',
      style: '高端极简商业静物摄影，突出产品本体、材质肌理/冰霜水珠与克制留白',
      queryHint: '极简 商业静物 材质 光影 广告摄影',
    },
    {
      id: 'B',
      quadrant: '真实生活场景摄影',
      style: '35mm 胶片感温暖日常使用/聚会/办公场景摄影，自然人物互动与情绪共鸣',
      queryHint: '生活方式 胶片 场景 人物 品牌海报',
    },
    {
      id: 'C',
      quadrant: '现代平面插画与大字排版',
      style: '当代平面插画/专色纸感版画与超大清晰编辑字体构成的高记忆海报',
      queryHint: '现代 平面插画 字体 网格 品牌海报',
    },
  ];
}

/**
 * Automatically pick 1 winning visual candidate per direction in auto mode,
 * preferring `recommended: true` and gracefully falling back to the candidate with
 * the fewest recorded defects (recording fallback notes instead of halting in `waiting`).
 */
export function pickAutoVisualAdoption(project) {
  const directions = project.mode === 'collab' ? [project.choice] : (project.directions || []);
  const candidates = (project.artifacts || []).filter((a) => a.stage === 'visual' && a.visual?.candidate);
  if (!directions.length || !candidates.length) return null;

  const chosen = [];
  const fallbackNotes = [];
  for (const direction of directions) {
    const group = candidates.filter((a) => a.visual?.direction === direction);
    if (!group.length) return null;
    const winner = group.find((a) => a.visual?.recommended);
    if (winner) {
      chosen.push(winner);
      continue;
    }
    // Fallback: pick candidate with fewest hard issues, then highest numeric mean/score
    const ranked = [...group].sort((a, b) => {
      const aIssues = Array.isArray(a.visual?.hardIssues) ? a.visual.hardIssues.length : 0;
      const bIssues = Array.isArray(b.visual?.hardIssues) ? b.visual.hardIssues.length : 0;
      if (aIssues !== bIssues) return aIssues - bIssues;
      const aScore = typeof a.visual?.mean === 'number' ? a.visual.mean : 0;
      const bScore = typeof b.visual?.mean === 'number' ? b.visual.mean : 0;
      return bScore - aScore;
    });
    const best = ranked[0];
    chosen.push(best);
    const reason =
      (Array.isArray(best.visual?.hardIssues) && best.visual.hardIssues.join('；')) ||
      best.visual?.reason ||
      '尚无无瑕疵推荐稿，按最少瑕疵兜底采用';
    fallbackNotes.push(`「${direction}」自动兜底采用 ${best.name}（待人工复核：${reason.slice(0, 120)}）`);
  }

  return {
    artifacts: chosen.map((a) => a.storageKey),
    ...(fallbackNotes.length ? { autoFallbackNotes: fallbackNotes, overrideReason: fallbackNotes.join('；') } : {}),
  };
}
