// Curated tiered slogan anchor library & hard-filter helpers (calibrated through 5-round blind A/B testing).
// Users can freely append new favorite slogans into SLOGAN_ANCHOR_TIERS.consumer or SLOGAN_ANCHOR_TIERS.ceremony.

export const SLOGAN_ANCHOR_TIERS = {
  // Tier A: Consumer / Campaign / Poster short-punch craft anchors (strictly isolated from ceremony clichés)
  consumer: {
    brandSpiritFusion: [
      { text: '出手即英雄', source: '英雄联盟', note: '5字：短小有气势，品牌名与核心动作自然融合' },
      { text: '和你一起红', source: '招商银行', note: '5字：把品牌色、气质与人情一次收拢' },
      { text: '支付宝，知托付', source: '支付宝', note: '6字：名称自然押韵，直立信任' },
      { text: '清酌一瓶，刚好一顿', source: '清酌', note: '8字：品牌名+容器+场景一次锁死' },
    ],
    metaphorAndContrast: [
      { text: '有事，无恐', source: '和泰产险', note: '4字：一字改熟语，锁死品类' },
      { text: '低着头，向上看', source: '京东图书', note: '6字：动作反差，画面与精神一跳即达' },
      { text: '双层玻璃，把周六调成静音', source: '宿白', note: '11字：把物理特征转成鲜活体验隐喻' },
      { text: '把三小时的路，还给枕头', source: '宿白', note: '10字：画面感与情绪回报兼得' },
      { text: '鞋底会弯，脚才敢长', source: '轻跃', note: '8字：物理特征直连父母关切的成长' },
    ],
    sharpAndHuman: [
      { text: '不敬酒，敬这顿饭', source: '清酌', note: '7字：短动词对仗，带酒本体，锋利有态度' },
      { text: '这杯不办事，只办一顿饭', source: '清酌', note: '10字：一语双关，去应酬感' },
      { text: '每一笔都是我爱你', source: '民生信用卡', note: '8字：日常实词一跳连情感' },
      { text: '谢谢你，把日子过成家', source: '天猫超市', note: '9字：温暖人话，不端着' },
      { text: '小病不扛，小钱不慌', source: '安禾', note: '8字：大白话+押韵，替用户卸下顾虑' },
    ],
  },
  // Tier B: Finance / Bank / Anniversary / Institution ceremony register (loaded ONLY when Brief matches ceremony)
  ceremony: {
    brandAura: [
      { text: '江城有信', source: '江城银行20周年', note: '4字：城名+品牌信任，大气上大屏' },
      { text: '和你一起红', source: '招商银行30周年', note: '5字：喜庆有气势，品牌专属' },
      { text: '信我·信未来', source: '杭州银行26周年', note: '5字：短小有分量，大屏致辞皆宜' },
      { text: '积微步·致千里', source: '台州银行35周年', note: '6字：服务小微与长远格局合为一体' },
    ],
    warmthAndStance: [
      { text: '明天不失陪', source: '民生信用卡14周年', note: '5字：克制深情，去官话' },
      { text: '万千小店，各有一手', source: '微信支付', note: '8字：写活真实服务对象，不空喊赋能' },
      { text: '你过日子，我守街巷', source: '江城银行20周年', note: '8字：人称对仗，街巷烟火与守护感' },
      { text: '不追风口，只追街口', source: '江城银行20周年', note: '8字：同字对撞，城商行锋利本地底气' },
      { text: '柜台后头，站的都是熟人', source: '江城银行20周年', note: '10字：具体画面与本地温度' },
    ],
  },
};

export const SLOGAN_DEAD_WORDS = [
  '砥砺', '赋能', '焕新', '抓手', '闭环', '匠心', '重新定义', '诗和远方',
  '极致', '神器', '颠覆', '完美蜕变', '诠释', '助力', '打造', '高光时刻',
];

export const SLOGAN_DYING_WORDS = [
  '松弛', '情绪价值', '内卷', '躺平', '长期主义', '认知升级',
  '少年感', '余生', '与世界和解', '温柔且坚定', '慢生活',
];

export const SLOGAN_JARGON = [
  'CLTC', 'NEDC', 'OTA', 'CTC', '智能座舱', '零重力座椅',
  '单宁', '回甘', '酒体', '余味', '冰球', '醒酒', '风味轮',
  '算力', '端侧', '多模态', '交互范式', '心智', '触达', '用户画像', '私域',
  '免赔额', '直驱变频', '航空铝',
];

const CEREMONY_BRIEF_RE = /(?:周年|行庆|庆典|城商行|农商行|银行|分行|支行|政企|奠基|峰会|建行|农行|招行|工行|中行)/u;
const PREFIX_LEAK_RE = /^[★☆•·\s]*(?:(?:初选|备选|推荐|主推|方向\s*[ABC]|副标)\s*[｜|：:]\s*)+/gu;
const STAR_PREFIX_RE = /^[★☆•]+\s*/gu;
const TRAILING_NOTE_RE = /。?\s*candidates\s*首条为初选。?$/iu;
const DEBATE_CLICHE_RE = /不是.{1,10}[，,]?\s*而是|不是.{1,10}[，,]\s*是/u;
const STALE_RETORT_RE = /[？?].*(?:不签收|不同意|不答应|不买账|先管住|了解一下)/u;

export function detectSloganRegister(brief = '') {
  return CEREMONY_BRIEF_RE.test(String(brief || '')) ? 'ceremony' : 'consumer';
}

export function sloganCharCount(text = '') {
  return (String(text || '').match(/[\p{Script=Han}\dA-Za-z]/gu) || []).length;
}

export function sanitizeSloganLine(text = '') {
  return String(text || '')
    .replace(PREFIX_LEAK_RE, '')
    .replace(STAR_PREFIX_RE, '')
    .replace(TRAILING_NOTE_RE, '')
    .trim();
}

export function sanitizeSubhead(text = '') {
  return sanitizeSloganLine(text);
}

export function scanSloganFlags(text = '', { register = 'consumer' } = {}) {
  const cleaned = sanitizeSloganLine(text);
  const flags = [];
  if (sloganCharCount(cleaned) > 12) flags.push('超12字偏长');
  if (DEBATE_CLICHE_RE.test(cleaned)) flags.push('不是…是…辩论体');
  if (STALE_RETORT_RE.test(cleaned)) flags.push('伪网感反问套话');
  const pool = register === 'ceremony'
    ? SLOGAN_JARGON
    : [...SLOGAN_DEAD_WORDS, ...SLOGAN_DYING_WORDS, ...SLOGAN_JARGON];
  for (const w of pool) {
    if (cleaned.includes(w)) flags.push(`禁用/黑话「${w}」`);
  }
  return flags;
}

/**
 * Filter a direction's candidate list before blind pick without mutating original candidate indices.
 * Keeps all clean candidates when >= 2 pass; otherwise keeps the fewest-flagged 3 so blind pick never starves.
 */
export function filterSloganCandidates(candidates = [], { register = 'consumer', dirId = 'A' } = {}) {
  const scored = candidates.map((c, i) => {
    const text = sanitizeSloganLine(c.text);
    const flags = scanSloganFlags(text, { register });
    return { code: dirId + (i + 1), index: i, text, use: c.use, flags };
  });
  const clean = scored.filter((item) => item.flags.length === 0);
  const kept = clean.length >= 2
    ? clean
    : [...scored].sort((a, b) => a.flags.length - b.flags.length || a.index - b.index).slice(0, Math.min(3, scored.length));
  const keptCodes = new Set(kept.map((item) => item.code));
  const dropped = scored.filter((item) => !keptCodes.has(item.code));
  return { kept, dropped };
}

function formatAnchorList(items) {
  return items.map((x) => `  - 「${x.text}」（${x.source} · ${x.note}）`).join('\n');
}

export function buildEngineWriteInstruction({ brief = '', register = detectSloganRegister(brief) } = {}) {
  const isCeremony = register === 'ceremony';
  if (isCeremony) {
    const t = SLOGAN_ANCHOR_TIERS.ceremony;
    return [
      '你是本次写作 Agent。本案属于【金融/周年仪式档】，沿用当前 Brief、研究与策略，严格执行 slogan-engine 01–05 步定位受众、动机与连接，按三个彻底拉开的方向创作大气得体、有分量有归属且拒绝空洞官话的创意主题：',
      '- 方向 A（品牌/城名气势轴）：优先把品牌名/城市名与周年分量融成 4–8 字短小有气势、大屏和致辞都能用的专属主标；',
      '- 方向 B（日常陪伴温度轴）：写活市民家庭、小微商户与社区网点的真实在场陪伴，用人话致谢；',
      '- 方向 C（锋利格局立场轴）：不写万能官话，用干脆利落的短句立出本行立足本地的鲜明底气（4–11 字）。',
      '【黄金字数与气场】主标控制在 4–11 字（4–5 字气势自然拉满即可，绝不注水拉长；也不硬凑干巴电报口令）。每条主标单看就能认出本行/金融属性。',
      '【仪式档标杆参考】',
      formatAnchorList([...t.brandAura, ...t.warmthAndStance]),
      '每案产出 4–5 条不同招式的原候选（A1–A5 等编号）和各自用法；副标 secondary 用 1 句干净流畅的中文承接核心事实（≤28 字，三案不重复，不堆砌中点参数墙）。主标题与方向名严禁带「初选｜」「★」「方向A」等内部标签。',
      '依据 basis 从当前材料摘取一处简短连续原文。claim 写本案主张，mechanism 写哪两个具体事物怎样相连，strategyLink 写如何承接策略。作为创作者从每案原候选初选一句填入 picks 并填写 authorCheck，整组推荐交给负责人。',
    ].join('\n');
  }

  const t = SLOGAN_ANCHOR_TIERS.consumer;
  return [
    '你是本次写作 Agent。沿用当前 Brief、研究与策略，严格执行 slogan-engine 01–05 步定位物料和受众。先分辨【购买人（掏钱人）】与【使用人】是否分离——若分离（如童鞋/母婴/礼品/养老），主标必须戳中掏钱人真正在乎的价值（如父母关切的成长、快乐、活力、安心），不可自嗨跑偏。按三条彻底拉开的方向创作三个独立创意主题：',
    '- 方向 A（品牌/产品气质融合轴）：把品牌名或核心物理特征自然融成一句有气势、有画面或隐喻的主标（4–10 字，如「出手即英雄」「清酌一瓶，刚好一顿」「双层玻璃，把周六调成静音」），严禁违背品类常识；',
    '- 方向 B（生活现场口语动作轴）：锁死当事人在真实场景里脱口而出的大白话与具体动作，画面鲜活、零书面腔（6–10 字）；',
    '- 方向 C（有温度的锋利态度轴）：必须更锋利、有鲜明立场！站在用户这边，用直白短陈述或短动词对仗替用户点破委屈、麻烦或旧规矩（6–11 字，如「不敬酒，敬这顿饭」「把三小时的路，还给枕头」「小病不扛，小钱不慌」），严禁脱离 Brief 硬杠、严禁用「不是…是…」辩论体、严禁用「XX？YY不签收/不同意」伪网感反问体。',
    '【黄金字数与本体铁律】主标控制在 4–11 字（4–5 字气势浑然天成极佳，但绝不为了凑短写成干巴电报口令；多数消费案 7–10 字画面完整、有温度是主力）。每条主标单看文字必须能一眼认出本案品类或产品（短而不丢本体，禁「撕开周三」「别端着」这类脱离画面不知所云的谜语）。专业条款/技术参数词下沉副标，主标说普通人嘴里的真话。',
    '【消费/传播档标杆参考】',
    formatAnchorList([...t.brandSpiritFusion, ...t.metaphorAndContrast, ...t.sharpAndHuman]),
    '三案中至少一条显性承接 Brief 的核心规格或秩序资产。每案保留围绕同一连接的 4–5 条不同招式原候选（A1–A5 等编号）和各自用法；副标 secondary 用 1 句干净流畅的中文承接核心产品事实（≤28 字，三案不重复，严禁堆砌中点参数墙）。主标题与方向名严禁带「初选｜」「★」「方向A」等内部标签。',
    '依据 basis 从当前材料摘取一处简短连续原文。claim 写本案主张，mechanism 写哪两个具体事物怎样相连，strategyLink 写如何承接策略。作为创作者从每案原候选初选一句填入 picks 并填写 authorCheck，整组推荐交给负责人。',
  ].join('\n');
}

export function buildBlindPickInstruction({ register = 'consumer' } = {}) {
  const isCeremony = register === 'ceremony';
  return [
    '你是独立空白盲读裁判（没看过作者推导，只看三组纯中文主标题候选及简短品类/场合提示）。',
    '从 A、B、C 每个方向各挑出唯一最敢直接印上大屏主视觉的一句编号（填 code），按以下铁律判断：',
    '1) 本体在场与用户视角一票否决：单看句子，陌生人必须 2 秒听出卖什么或用在哪，且击中真实购买人关切（脱离画面不知所云、或自嗨跑偏购买人视角的直接淘汰）；',
    '2) 4–11 字海报气场与画面温度优先：4–6 字仅在浑然天成有气势（如「出手即英雄」「江城有信」）时胜出，绝不盲目偏爱干巴巴的电报口令或专业术语；同等条件下优先 7–11 字有画面、有隐喻、顺口好念、有人情味的短句；',
    '3) 严厉淘汰：死词/将死词、行业黑话（如免赔额/参数堆砌）、「不是…是…」辩论说教体、「XX？YY不签收/不同意」伪网感反问体、13 字以上长段子；',
    isCeremony
      ? '4) 仪式档须兼顾大气得体、品牌/城市归属与温度，拒绝空洞万能官话。'
      : '4) 方向 C 务必选立场干脆、替用户解气或有态度回响的一句，不退回四平八稳的安全句。',
    'lineNotes 用一句简短大白话写每条入选句的真实路人读感。',
  ].join('\n');
}
