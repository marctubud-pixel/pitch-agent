/*!
 * DeckEngine — the single source of truth for 版式工坊 layouts.
 * The Claude prototype and the standalone website load this exact file.
 * Every font size, line break, colour and position a user sees — on screen,
 * in a thumbnail, or in the exported .pptx — is computed here, once.
 * Bump VERSION whenever a rule changes; decks record the version they were made with.
 */
(function (root) {
'use strict';
const VERSION = '1.7.0';
const W = 1280, H = 720;

/* ------------------------------------------------------------------ *
 * 1. Specification constants
 * ------------------------------------------------------------------ */
const SPEC = {
  version: VERSION,
  canvas: { w: W, h: H, ratio: '16:9', pxPerInch: 96, pptInches: [13.333, 7.5] },
  safe: { x0: 80, x1: 1200, y0: 40, y1: 708 },
  type: { display: 120, cover: 56, section: 54, h1: 46, h2: 34, h3: 22, body: 16, small: 14, caption: 12, minText: 11 },
  shrinkFloor: 0.6,                 // fitted text never drops below 60 % of its spec size
  contrast: { normal: 4.5, large: 3 },  // WCAG 2.1 AA; "large" = ≥24px, or ≥19px bold
  title: { maxChars: 30 },
  pxToPt: 0.75,
};

/* ------------------------------------------------------------------ *
 * 2. Colour maths
 * ------------------------------------------------------------------ */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexToRgb = h => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h.slice(0, 6), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s * 100, l * 100]; }
function hslToHex(h, s, l) { s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l); const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255); }
const hsl = hex => rgbToHsl(...hexToRgb(hex));
const lum = hex => { const c = hexToRgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
function ensure(c, bg, min) { if (contrast(c, bg) >= min) return c; let [h, s, l] = hsl(c); const toDark = contrast('#000000', bg) >= contrast('#FFFFFF', bg); for (let i = 0; i < 50; i++) { l = clamp(l + (toDark ? -2 : 2), 0, 100); const x = hslToHex(h, s, l); if (contrast(x, bg) >= min) return x; } return toDark ? '#000000' : '#FFFFFF'; }
const INK = '#141414';
const onColor = c => contrast('#FFFFFF', c) >= SPEC.contrast.normal ? '#FFFFFF' : (contrast(INK, c) >= contrast('#FFFFFF', c) ? INK : '#FFFFFF');
const isHex = v => /^#?[0-9a-f]{6}$/i.test(String(v || '').trim());
const normHex = v => '#' + String(v).trim().replace('#', '').toUpperCase();
const pad2 = n => String(n).padStart(2, '0');
const CN_NUM = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];
const getP = (o, p) => p.split('.').reduce((a, k) => a == null ? undefined : a[k], o);
const setP = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; };
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));

/* ------------------------------------------------------------------ *
 * 3. Fonts — every face is free for commercial use (SIL OFL)
 * ------------------------------------------------------------------ */
const FONTS = {
  sans:    { family: 'Noto Sans SC', alias: '思源黑体', fallback: '"PingFang SC","Microsoft YaHei",sans-serif', weights: [400, 500, 700, 900], sys: { ppt: 'Microsoft YaHei', key: 'PingFang SC' }, url: 'https://fonts.google.com/noto/specimen/Noto+Sans+SC' },
  serif:   { family: 'Noto Serif SC', alias: '思源宋体', fallback: '"Songti SC","SimSun",serif', weights: [700, 900], sys: { ppt: 'SimSun', key: 'Songti SC' }, url: 'https://fonts.google.com/noto/specimen/Noto+Serif+SC' },
  brush:   { family: 'Ma Shan Zheng', alias: '马善政毛笔楷书', fallback: '"Kaiti SC","KaiTi",serif', weights: [400], art: true, sys: { ppt: 'KaiTi', key: 'Kaiti SC' }, url: 'https://fonts.google.com/specimen/Ma+Shan+Zheng' },
  xiaowei: { family: 'ZCOOL XiaoWei', alias: '站酷小薇体', fallback: '"Songti SC","SimSun",serif', weights: [400], art: true, sys: { ppt: 'SimSun', key: 'Songti SC' }, url: 'https://fonts.google.com/specimen/ZCOOL+XiaoWei' },
  qingke:  { family: 'ZCOOL QingKe HuangYou', alias: '站酷庆科黄油体', fallback: '"PingFang SC","Microsoft YaHei",sans-serif', weights: [400], art: true, sys: { ppt: 'Microsoft YaHei', key: 'PingFang SC' }, url: 'https://fonts.google.com/specimen/ZCOOL+QingKe+HuangYou' },
  kuaile:  { family: 'ZCOOL KuaiLe', alias: '站酷快乐体', fallback: '"PingFang SC","Microsoft YaHei",sans-serif', weights: [400], art: true, sys: { ppt: 'Microsoft YaHei', key: 'PingFang SC' }, url: 'https://fonts.google.com/specimen/ZCOOL+KuaiLe' },
  mono:    { family: 'IBM Plex Mono', alias: 'IBM Plex Mono', fallback: 'ui-monospace,Menlo,Consolas,monospace', weights: [500], sys: { ppt: 'Consolas', key: 'Menlo' }, url: 'https://fonts.google.com/specimen/IBM+Plex+Mono' },
  cond:    { family: 'Bebas Neue', alias: 'Bebas Neue 窄体英文', fallback: '"Impact","Arial Narrow",sans-serif', weights: [400], latin: true, sys: { ppt: 'Impact', key: 'Impact' }, url: 'https://fonts.google.com/specimen/Bebas+Neue' },
};
const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Noto+Serif+SC:wght@700;900&family=Ma+Shan+Zheng&family=ZCOOL+XiaoWei&family=ZCOOL+QingKe+HuangYou&family=ZCOOL+KuaiLe&family=IBM+Plex+Mono:wght@500&family=Bebas+Neue&display=swap';
function injectFonts() {
  if (typeof document === 'undefined' || document.querySelector('link[data-deck-fonts]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONT_LINK; l.dataset.deckFonts = '1'; document.head.appendChild(l);
}
const fontCss = fk => `"${FONTS[fk].family}",${FONTS[fk].fallback}`;
const nearestWeight = (fk, w) => FONTS[fk].weights.reduce((a, b) => Math.abs(b - w) < Math.abs(a - w) ? b : a);

/* ------------------------------------------------------------------ *
 * 4. Visual styles (风格) and proposal types (提案类型)
 * ------------------------------------------------------------------ */
const STYLES = {
  modern:   { name: '现代简约', desc: '几何圆环、粗黑大字，适合大多数品牌', fonts: { d: 'sans', b: 'sans', m: 'mono' }, decor: 'rings', radius: 6, num: 'arabic', mode: 'light', palettes: ['tea', 'fin', 'orange'] },
  guochao:  { name: '国潮中国风', desc: '书法标题、朱砂印章、竖排文字与双线框', fonts: { d: 'brush', b: 'sans', m: 'serif' }, decor: 'seal', radius: 0, num: 'cn', mode: 'light', paper: true, titleBoost: 1.12, palettes: ['red', 'jade', 'ink'] },
  elegant:  { name: '高端雅致', desc: '宋体标题、细线框与留白，适合酒类、奢品、金融', fonts: { d: 'serif', b: 'sans', m: 'serif' }, decor: 'frame', radius: 0, num: 'arabic', titleLs: 2, mode: 'light', palettes: ['night', 'jade', 'mono'] },
  tech:     { name: '科技未来', desc: '网格、角标与等宽字，适合科技、互联网、汽车', fonts: { d: 'sans', b: 'sans', m: 'mono' }, decor: 'grid', radius: 2, num: 'arabic', eyebrowMono: true, mode: 'dark', palettes: ['violet', 'fin'] },
  street:   { name: '潮酷街头', desc: '粗犷字体、色块与超大英文，适合潮饮、潮牌', fonts: { d: 'qingke', b: 'sans', m: 'mono' }, decor: 'blocks', radius: 0, num: 'arabic', mode: 'dark', palettes: ['beer', 'mono'] },
  playful:  { name: '童趣 IP', desc: '圆润字体、大圆角与泡泡，适合 IP、亲子、零食', fonts: { d: 'kuaile', b: 'sans', m: 'sans' }, decor: 'bubbles', radius: 20, num: 'arabic', mode: 'light', palettes: ['ip', 'orange'] },
  fresh:    { name: '清新自然', desc: '柔和山丘与小薇体，适合茶饮、食品、美妆', fonts: { d: 'xiaowei', b: 'sans', m: 'sans' }, decor: 'hills', radius: 10, num: 'arabic', mode: 'light', palettes: ['tea', 'jade'] },
  business: { name: '商务稳重', desc: '色条与严谨网格，适合政企、银行、述职', fonts: { d: 'sans', b: 'sans', m: 'mono' }, decor: 'bars', radius: 2, num: 'arabic', mode: 'light', palettes: ['fin', 'night'] },
  bold:     { name: '大字冲击', desc: '超大窄体英文与数字、强对比色块，适合企业介绍、运动营养、快消', fonts: { d: 'sans', b: 'sans', m: 'mono' }, numFont: 'cond', decor: 'bigword', radius: 0, num: 'arabic', mode: 'light', palettes: ['red', 'fin'] },
  neon:     { name: '暗黑荧光', desc: '深色底、荧光描线与居中标题，适合平台通案、数码、潮流', fonts: { d: 'sans', b: 'sans', m: 'mono' }, decor: 'glow', headAlign: 'center', radius: 10, num: 'arabic', mode: 'dark', palettes: ['neon', 'violet'] },
  editorial:{ name: '杂志编辑', desc: '黑白照片、错位色块与侧边索引，适合趋势报告、时尚、文化', fonts: { d: 'serif', b: 'sans', m: 'mono' }, decor: 'offset', gray: true, radius: 0, num: 'arabic', mode: 'light', palettes: ['red', 'mono'] },
  warm:     { name: '温暖生活', desc: '米色纸感、胶囊标签与居中标题，适合家居、生活方式、节日', fonts: { d: 'sans', b: 'sans', m: 'sans' }, decor: 'pill', headAlign: 'center', radius: 14, num: 'arabic', mode: 'light', paper: 'warm', palettes: ['coral', 'red', 'orange'] },
  panel:    { name: '色框卡片', desc: '品牌色外框包住白色圆角面板，适合平台招商、活动通案', fonts: { d: 'sans', b: 'sans', m: 'sans' }, decor: 'panel', headAlign: 'center', radius: 12, num: 'arabic', mode: 'light', palettes: ['coral', 'red', 'tea'] },
};
const PRESETS = [
  { id: 'tea', name: '清新茶绿', primary: '#1F8A4C', accent: '#E3B341', mode: 'light' },
  { id: 'jade', name: '翡翠青瓷', primary: '#0E6B5C', accent: '#C9A45C', mode: 'light' },
  { id: 'fin', name: '金融深蓝', primary: '#0B4EA2', accent: '#E5403A', mode: 'light' },
  { id: 'orange', name: '暖橙家电', primary: '#F08A24', accent: '#2E2A27', mode: 'light' },
  { id: 'beer', name: '潮饮黑黄', primary: '#FFC21A', accent: '#FFFFFF', mode: 'dark' },
  { id: 'ip', name: 'IP 明黄', primary: '#FFCC2E', accent: '#1747A6', mode: 'light' },
  { id: 'night', name: '星夜酒蓝', primary: '#1A3E8C', accent: '#8DB8FF', mode: 'light' },
  { id: 'red', name: '中国红', primary: '#C8202F', accent: '#D8A24A', mode: 'light' },
  { id: 'ink', name: '水墨黛青', primary: '#2F4F5F', accent: '#B8322A', mode: 'light' },
  { id: 'violet', name: '科技紫', primary: '#5B3FD9', accent: '#22C3A6', mode: 'dark' },
  { id: 'mono', name: '极简黑白', primary: '#1A1A1A', accent: '#E4572E', mode: 'light' },
  { id: 'neon', name: '荧光绿', primary: '#2EE07B', accent: '#FF2D55', mode: 'dark' },
  { id: 'coral', name: '活力珊瑚红', primary: '#E61E3C', accent: '#FFB300', mode: 'light' },
];
// outline entries: [type, variant, title, en]
const PROPOSAL_TYPES = {
  packaging: { name: '包装提案', desc: '市场与竞品 → 用户 → 卖点 → 视觉策略 → 包装设计 → 延展', outline: [['cover', 'split'], ['contents'], ['section', 0, '市场分析', 'MARKET'], ['market', 'trend', '品类现状'], ['competitor', 'cards', '竞品货架分析'], ['competitor', 'map', '竞品定位'], ['section', 0, '用户洞察', 'USER'], ['persona', 'groups', '目标人群'], ['persona', 'single', '核心用户画像'], ['section', 0, '视觉策略', 'STRATEGY'], ['summary', 'statement', '核心创意'], ['design', 'half', '视觉语言'], ['section', 0, '包装设计', 'DESIGN'], ['compare', 'lineup', '竞品包装对比'], ['summary', 'concept', '创意方向'], ['design', 'stage', '主包装设计'], ['wip', 'steps', '设计过程'], ['selling', 'hero', '产品卖点'], ['markup', 0, '包装细节'], ['combo', 'grid', '系列 / 口味延展'], ['section', 0, '延展应用', 'APPLICATION'], ['combo', 'feature', '场景应用'], ['closing', 'type']] },
  visual:    { name: '视觉海报提案', desc: '需求解读 → 多个创意方向 → 主视觉 → 延展物料', outline: [['cover', 'full'], ['contents'], ['section', 0, '项目背景', 'BACKGROUND'], ['summary', 'list', '需求解读'], ['persona', 'single', '沟通对象'], ['selling', 'grid', '核心卖点'], ['compare', 'posters', '过往海报回顾'], ['section', 0, '创意方向', 'CONCEPT'], ['summary', 'concept', '方向一'], ['mood', 'full', '方向一 · 氛围'], ['design', 'half', '方向一 · 主视觉'], ['series', 'row', '方向一 · 系列海报'], ['summary', 'statement', '方向二'], ['design', 'halfR', '方向二 · 主视觉'], ['section', 0, '落地执行', 'EXECUTION'], ['combo', 'feature', '物料清单'], ['process', 0, '制作排期'], ['closing', 'type']] },
  campaign:  { name: '整合营销 Campaign', desc: '目标 → 洞察 → 创意概念 → 传播节奏 → 效果预估', outline: [['cover', 'type'], ['contents'], ['section', 0, '背景与目标', 'BRIEF'], ['market', 'share', '市场格局'], ['data', 'stats', '传播目标'], ['section', 0, '洞察', 'INSIGHT'], ['persona', 'groups', '目标人群'], ['persona', 'journey', '用户旅程'], ['summary', 'question', '洞察引子'], ['summary', 'statement', '核心洞察'], ['section', 0, '创意概念', 'IDEA'], ['mood', 'full', 'Campaign 主题'], ['design', 'half', '主视觉'], ['series', 'row', '系列海报'], ['section', 0, '传播策略', 'STRATEGY'], ['process', 0, '传播节奏'], ['combo', 'grid', '内容规划'], ['section', 0, '执行与效果', 'EXECUTION'], ['process', 0, '执行排期'], ['data', 'stats', '效果预估'], ['closing', 'type']] },
  ip:        { name: 'IP 形象提案', desc: '品牌性格 → IP 设定 → 三视图 → 表情动作 → 周边', outline: [['cover', 'type'], ['contents'], ['section', 0, '品牌解读', 'BRAND'], ['summary', 'pillars', '品牌性格'], ['persona', 'groups', '目标人群'], ['section', 0, 'IP 设定', 'CHARACTER'], ['design', 'half', 'IP 设定'], ['wip', 'sketch', '设计草图'], ['combo', 'grid', '三视图'], ['combo', 'grid', '表情与动作'], ['section', 0, '应用延展', 'APPLICATION'], ['combo', 'feature', '周边与物料'], ['process', 0, 'IP 运营规划'], ['closing', 'type']] },
  video:     { name: '视频 / TVC 提案', desc: '一句话创意 → 故事梗概 → 分镜脚本 → 调性 → 排期', outline: [['cover', 'full'], ['contents'], ['section', 0, '创意概念', 'CONCEPT'], ['persona', 'single', '沟通对象'], ['summary', 'statement', '一句话创意'], ['summary', 'list', '故事梗概'], ['section', 0, '分镜脚本', 'STORYBOARD'], ['storyboard', 0, '分镜 1–4'], ['storyboard', 0, '分镜 5–8'], ['section', 0, '视觉调性', 'MOOD'], ['mood', 'board', '调性参考'], ['section', 0, '制作', 'PRODUCTION'], ['process', 0, '制作排期'], ['closing', 'type']] },
  credentials: { name: '比稿 / 公司介绍', desc: '公司数据 → 服务能力 → 团队 → 流程 → 案例（可上传现成页面）', outline: [['cover', 'type'], ['section', 0, '公司介绍', 'ABOUT'], ['data', 'stats', '关于我们'], ['summary', 'list', '服务能力'], ['upload', 'framed', '公司介绍（上传现成页面）'], ['section', 0, '团队', 'TEAM'], ['combo', 'grid', '核心团队'], ['process', 0, '工作流程'], ['section', 0, '案例', 'CASES'], ['combo', 'feature', '代表案例'], ['upload', 'full'], ['upload', 'full'], ['closing', 'type']] },
  sponsorship: { name: '招商通案', desc: '洞察 → 往届成绩 → 活动主题 → 玩法与资源 → 合作权益 → 排期（适合平台 / IP 活动招商）', outline: [['cover', 'type'], ['contents'], ['section', 0, '项目背景', 'INSIGHT'], ['data', 'stats', '行业洞察'], ['case', 'result', '往届成绩'], ['summary', 'concept', '活动主题'], ['section', 0, '活动玩法', 'PLAY'], ['roadmap', 'phases', '玩法升级'], ['process', 'path', '用户参与路径'], ['screens', 'detail', '活动主阵地'], ['screens', 'row', '黄金资源'], ['section', 0, '合作权益', 'PACKAGE'], ['package', 'tiers', '合作权益'], ['package', 'matrix', '权益明细'], ['roadmap', 'gantt', '活动排期'], ['upload', 'framed', '公司介绍（上传现成页面）'], ['closing', 'type']] },
  solution:  { name: '营销通案 / 解决方案', desc: '平台价值 → 用户洞察 → 方法论 → 产品与投放 → 案例（适合平台、媒体、服务商）', outline: [['cover', 'type'], ['contents'], ['section', 0, '平台价值', 'VALUE'], ['data', 'hero', '平台数据'], ['market', 'search', '用户在搜什么'], ['process', 'path', '消费决策路径'], ['section', 0, '方法论', 'METHOD'], ['process', 'chevron', '四步方法'], ['persona', 'rings', '人群圈层'], ['summary', 'pillars', '组合投放'], ['section', 0, '案例', 'CASES'], ['case', 'steps', '案例详解'], ['case', 'result', '案例成绩'], ['logos', 'band', '合作品牌'], ['upload', 'framed', '公司介绍（上传现成页面）'], ['closing', 'type']] },
  corporate: { name: '企业 / 品牌介绍', desc: '品牌数据 → 发展历程 → 明星产品 → 合作伙伴 → 资质与优势', outline: [['cover', 'product'], ['contents'], ['section', 0, '品牌简介', 'ABOUT'], ['data', 'hero', '品牌数据'], ['roadmap', 'phases', '发展历程'], ['section', 0, '明星产品', 'PRODUCTS'], ['selling', 'matrix', '产品矩阵'], ['selling', 'hero', '核心产品'], ['section', 0, '产业链优势', 'SUPPLY CHAIN'], ['logos', 'grid', '战略合作伙伴'], ['data', 'stats', '供应链实力'], ['combo', 'grid', '资质与荣誉'], ['upload', 'framed', '公司介绍（上传现成页面）'], ['closing', 'type']] },
  identity:  { name: 'VI 视觉识别', desc: '设计理念 → 标志 → 标准色 → 字体 → 辅助图形 → 应用', outline: [['cover', 'center'], ['contents'], ['section', 0, '设计理念', 'CONCEPT'], ['summary', 'concept', '设计理念'], ['wip', 'steps', '标志推演'], ['section', 0, '基础系统', 'BASICS'], ['vi', 'logo', '标志'], ['vi', 'colors', '标准色'], ['vi', 'type', '标准字体'], ['vi', 'graphics', '辅助图形'], ['section', 0, '应用系统', 'APPLICATION'], ['series', 'row', '主视觉延展'], ['combo', 'feature', '物料应用'], ['upload', 'framed', '公司介绍（上传现成页面）'], ['closing', 'type']] },
  general:   { name: '通用提案', desc: '背景 → 要点 → 方案 → 计划', outline: [['cover', 'split'], ['contents'], ['section', 0, '背景', 'BACKGROUND'], ['market', 'trend', '市场分析'], ['competitor', 'table', '竞品对比'], ['persona', 'single', '用户分析'], ['summary', 'list', '要点'], ['section', 0, '方案', 'PLAN'], ['selling', 'hero', '产品卖点'], ['design', 'half', '方案说明'], ['process', 0, '执行计划'], ['closing', 'type']] },
};

/* ------------------------------------------------------------------ *
 * 5. Theme: brand colours + style + tone → tokens (contrast enforced)
 * ------------------------------------------------------------------ */
function solid(c) {
  const best = () => Math.max(contrast('#FFFFFF', c), contrast(INK, c));
  if (best() >= SPEC.contrast.normal) return c;
  const towardWhite = contrast('#FFFFFF', c) >= contrast(INK, c);
  let [h, s, l] = hsl(c);
  for (let i = 0; i < 40 && best() < SPEC.contrast.normal; i++) { l = clamp(l + (towardWhite ? -1 : 1), 0, 100); c = hslToHex(h, s, l); }
  return c;
}
function theme(project, tone) {
  const st = STYLES[project.theme.style] || STYLES.modern;
  const P0 = project.theme.primary, A = project.theme.accent || P0;
  const P = solid(P0);                     // brand colour used as a fill behind text: nudged (same hue) until text passes 4.5:1
  const [h, s] = hsl(P0), ns = Math.min(s, 42);
  let t;
  if (tone === 'brand') {
    const on = onColor(P);
    const hi = contrast(A, P) >= SPEC.contrast.large ? A : on;
    const away = on === '#FFFFFF' ? '#000000' : '#FFFFFF';          // cards step away from the text colour, so text on them keeps its contrast
    t = { bg: P, text: on, muted: ensure(mix(on, P, .25), P, SPEC.contrast.normal), line: mix(on, P, .62), surface: mix(P, away, on === '#FFFFFF' ? .14 : .3), surface2: mix(P, away, on === '#FFFFFF' ? .22 : .45), primary: hi };
    t.primaryInk = ensure(hi, P, SPEC.contrast.normal); t.primaryBig = ensure(hi, P, SPEC.contrast.large); t.accent = hi;
  } else if (tone === 'dark') {
    const bg = hslToHex(h, ns * .45, 8);
    t = { bg, surface: hslToHex(h, ns * .45, 13), surface2: hslToHex(h, ns * .45, 18), line: hslToHex(h, ns * .35, 26), text: hslToHex(h, 8, 95), muted: hslToHex(h, 8, 68) };
    t.primary = contrast(P, bg) < 1.8 ? solid(ensure(P, bg, 2.2)) : P; t.accent = A;
  } else {
    let bg = hslToHex(h, ns * .5, 97.6);
    t = { bg, surface: hslToHex(h, ns * .6, 93.5), surface2: hslToHex(h, ns * .6, 88.5), line: hslToHex(h, ns * .4, 85), text: hslToHex(h, Math.min(s, 30), 12), muted: hslToHex(h, Math.min(s, 14), 40) };
    if (st.paper === 'warm') Object.assign(t, { bg: '#F7F1E8', surface: '#EFE5D6', surface2: '#E6D8C4', line: '#D8C8B0', text: '#2B2420', muted: '#6C5E52' });
    else if (st.paper) Object.assign(t, { bg: '#F4EEE2', surface: '#EAE1D0', surface2: '#E0D5C1', line: '#CDBFA6', text: '#2A2420', muted: '#6B5E50' });
    t.primary = P; t.accent = A;
  }
  if (tone !== 'brand') {
    t.primaryInk = ensure(P0, t.bg, SPEC.contrast.normal);
    t.primaryBig = ensure(P0, t.bg, SPEC.contrast.large);
    t.muted = ensure(t.muted, t.bg, SPEC.contrast.normal);
  }
  t.onPrimary = onColor(t.primary); t.onAccent = onColor(t.accent);
  t.inkOnSurface = ensure(t.primaryInk, t.surface, SPEC.contrast.normal);
  t.mutedOnSurface = ensure(t.muted, t.surface, SPEC.contrast.normal);
  const [ph, ps] = hsl(P0);
  t.seal = st.decor === 'seal' ? (ps > 35 && (ph < 20 || ph > 340) ? P : '#B8322A') : t.primary;
  t.sealInk = ensure(t.seal, t.bg, SPEC.contrast.large);
  t.onSeal = onColor(t.seal);
  t.tone = tone; t.style = st;
  return t;
}

/* ------------------------------------------------------------------ *
 * 6. Element primitives (px on a 1280 × 720 canvas, 96 px = 1 in)
 * ------------------------------------------------------------------ */
const T = o => ({ k: 'text', size: 16, weight: 400, font: 'b', align: 'left', valign: 'top', lh: 1.4, ls: 0, editable: true, ...o });
const R = o => ({ k: 'rect', ...o });
const EL = o => ({ k: 'ellipse', ...o });
const LN = (x1, y1, x2, y2, color, w = 1, o = {}) => ({ k: 'line', x1, y1, x2, y2, color, w, ...o });
const IM = o => ({ k: 'image', fit: 'cover', ...o });
const PG = o => { const xs = o.pts.map(p => p[0]), ys = o.pts.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys); return { k: 'poly', ...o, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };
/* points of a ring slice: angles in degrees, 0 = 12 o'clock, clockwise; r0 = 0 gives a pie slice */
function arcPts(cx, cy, r, r0, a0, a1) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 2)), P = (rr, a) => [cx + rr * Math.sin(a * Math.PI / 180), cy - rr * Math.cos(a * Math.PI / 180)], out = [];
  for (let i = 0; i <= n; i++) out.push(P(r, a0 + (a1 - a0) * i / n));
  if (r0 > 0) for (let i = n; i >= 0; i--) out.push(P(r0, a0 + (a1 - a0) * i / n)); else out.push([cx, cy]);
  return out;
}
function inPoly(pts, x, y) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const seriesCols = th => [th.primary, mix(th.primary, th.accent, .5), th.accent, mix(th.primary, th.surface, .5), mix(th.accent, th.surface, .5), th.line, mix(th.primary, th.text, .4), mix(th.accent, th.text, .3)];

function kit(project, s, c) {
  const d = s.data;
  return {
    d, th: c.th, st: c.th.style, E: [], project, c,
    t(path, o = {}) { const v = getP(d, path); return T({ bind: path, value: v == null ? '' : String(v), ...o }); },
    im(path, o = {}) { return IM({ bind: path, id: getP(d, path), ...o }); },
  };
}
const numStr = (st, n) => st.num === 'cn' ? (CN_NUM[n] || String(n)) : pad2(n);
const asset = (project, id) => id && project.assets && project.assets[id] ? project.assets[id] : null;

function head(k, c, x = 80, w = 1120) {
  const { E, th, d, st } = k;
  let ex = x;
  if (st.decor === 'seal') { E.push(R({ x, y: 54, w: 11, h: 11, fill: th.seal })); ex = x + 20; }
  if (st.decor === 'grid') { E.push(LN(x - 24, 44, x - 10, 44, th.primaryInk, 1.5)); E.push(LN(x - 24, 44, x - 24, 58, th.primaryInk, 1.5)); }
  const ctr = st.headAlign === 'center', eb = d.eyebrow ?? c.autoEyebrow;
  if (st.decor === 'pill') {
    if (eb || c.edit) pill(k, x + w / 2, 40, eb || '眉标', { size: 13, h: 26, bind: 'eyebrow', value: eb, ph: '眉标', maxW: w, x0: x, x1: x + w });
  } else E.push(k.t('eyebrow', { x: ex, y: 50, w: w - (ex - x), h: 20, value: eb, ph: '眉标 · 所属章节', size: 13, weight: 700, color: st.decor === 'glow' ? th.muted : th.primaryInk, ls: 2, font: st.eyebrowMono ? 'm' : 'b' }));
  const tsz = Math.round(34 * (st.titleBoost || 1));
  E.push(k.t('title', { x, y: 74, w, h: 54, ph: '页面标题', size: tsz, weight: 700, font: 'd', lh: 1.3, ls: st.titleLs || 0, align: ctr ? 'center' : 'left', hl: d.hl, hlColor: th.primaryInk }));
  if (st.decor === 'blocks') E.push(R({ x, y: 132, w: 56, h: 6, fill: th.primary }));
  if (st.decor === 'bars') E.push(R({ x: 0, y: 0, w: W, h: 6, fill: th.primary }));
}
function foot(k, c, o = {}) {
  const { E, th, project } = k; const lg = asset(project, project.brand.logo);
  if (o.half) {
    if (lg) { const h = 20, w = Math.min(160, h * lg.w / lg.h); E.push(IM({ x: 80, y: 684, w, h, src: lg.src, fit: 'contain', editable: false, deco: true })); }
    else if (project.brand.name) E.push(T({ x: 80, y: 686, w: 420, h: 18, value: project.brand.name, size: 12, color: th.muted, weight: 500, ls: 1, editable: false }));
    E.push(T({ x: 520, y: 686, w: 100, h: 18, value: pad2(c.pageNo), size: 12, color: th.muted, align: 'right', editable: false })); return;
  }
  if (lg) { const h = 20, w = Math.min(160, h * lg.w / lg.h); E.push(IM({ x: 80, y: 684, w, h, src: lg.src, fit: 'contain', editable: false, deco: true })); }
  else if (project.brand.name) E.push(T({ x: 80, y: 686, w: 600, h: 18, value: project.brand.name, size: 12, color: th.muted, weight: 500, ls: 1, editable: false }));
  agencyMark(k, 'foot');
  E.push(T({ x: 1100, y: 686, w: 100, h: 18, value: k.st.decor === 'grid' ? `P.${pad2(c.pageNo)} / ${pad2(c.total)}` : pad2(c.pageNo), size: 12, color: th.muted, align: 'right', editable: false, font: k.st.decor === 'grid' ? 'm' : 'b' }));
}
function brandMark(k, x, y, h, color, maxW = 500) {
  const lg = asset(k.project, k.project.brand.logo);
  if (lg) { const w = Math.min(300, maxW, h * lg.w / lg.h); k.E.push(IM({ x, y, w, h, src: lum(color) > .5 && lg.light ? lg.light : lg.src, fit: 'contain', editable: false, deco: true, logo: true })); }
  else if (k.project.brand.name) k.E.push(T({ x, y, w: Math.min(500, maxW, 1200 - x), h, value: k.project.brand.name, size: Math.round(h * .45), weight: 900, ls: 2, color, valign: 'middle', editable: false }));
}
/* Proposer (agency) logo: the company that wrote the proposal. Top-right of the cover, optionally the closing page and every footer. */
const isDarkBg = c => contrast('#FFFFFF', c) > contrast(INK, c);
function logoEl(k, a, xRight, y, h, maxW, light) {
  const w = Math.min(maxW, h * a.w / a.h); return IM({ x: xRight - w, y, w, h, src: light && a.light ? a.light : a.src, fit: 'contain', editable: false, deco: true, logo: true });
}
function agencyMark(k, where, opts = {}) {
  const { project, th, E } = k, ag = project.agency || {}, place = ag.place || 'cover+closing';
  if (place === 'none' || (where === 'closing' && !/closing|all/.test(place)) || (where === 'foot' && place !== 'all')) return;
  const a = asset(project, ag.logo), dark = opts.dark != null ? opts.dark : isDarkBg(th.bg);
  if (where === 'foot') { if (a) E.push(logoEl(k, a, 1076, 685, 18, 140, dark)); return; }
  if (!a) { if (ag.name) E.push(T({ x: 760, y: 68, w: 440, h: 24, value: ag.name, size: 15, weight: 700, ls: 1, align: 'right', color: opts.plate ? th.text : (dark ? '#FFFFFF' : th.text), editable: false, deco: true })); return; }
  if (opts.plate) {                               // over a photo: a small plate in the page colour keeps any logo readable
    const h = 30, w = Math.min(200, h * a.w / a.h); E.push(R({ x: 1200 - w - 28, y: 44, w: w + 28, h: h + 24, fill: th.bg, op: .94, r: 8, flat: true }));
    E.push(logoEl(k, a, 1200 - 14, 56, h, 200, isDarkBg(th.bg))); return;
  }
  const xr = k.st.decor === 'seal' && !opts.plate ? 1150 : 1200;      // 国潮 pages keep the right edge for the vertical line of text
  E.push(logoEl(k, a, xr, 60, 40, 240, dark));
}
/* Style decoration for full-tone pages. where: cover | section | closing ; side: 'full' | 'left' (image on right) */
function deco(k, c, where, side = 'full') {
  const { E, th, st, project } = k; const ink = th.text;
  const right = side === 'full' ? W : 640;
  switch (st.decor) {
    case 'rings':
      if (side !== 'full') return;
      if (where === 'section') { E.push(EL({ x: 820, y: 120, w: 520, h: 520, line: ink, lw: 1.5, op: .25 })); E.push(EL({ x: 1060, y: 470, w: 110, h: 110, fill: th.primary, op: .9 })); }
      else if (where === 'cover') { E.push(EL({ x: 760, y: -180, w: 760, h: 760, fill: ink, op: .06 })); E.push(EL({ x: 900, y: 360, w: 520, h: 520, line: ink, lw: 1.5, op: .35 })); }
      else { E.push(EL({ x: 860, y: 300, w: 640, h: 640, fill: ink, op: .06 })); E.push(EL({ x: -160, y: -260, w: 520, h: 520, line: ink, lw: 1.5, op: .3 })); }
      return;
    case 'seal': {
      E.push(R({ x: 28, y: 28, w: right - 56, h: H - 56, line: ink, lw: 1.2, op: .4 }));
      E.push(R({ x: 36, y: 36, w: right - 72, h: H - 72, line: ink, lw: .75, op: .3 }));
      const ch = (project.brand.name || '印').replace(/[A-Za-z\s]/g, '').slice(0, 2) || '印';
      const sx = right - 140, sy = H - 150;
      E.push(R({ x: sx, y: sy, w: 72, h: 72, fill: th.seal }));
      E.push(T({ x: sx, y: sy, w: 72, h: 72, value: ch.length > 1 ? ch.split('').join('\n') : ch, size: ch.length > 1 ? 26 : 40, lh: 1.05, font: 'd', align: 'center', valign: 'middle', color: th.onSeal, editable: false, deco: true }));
      const vt = where === 'section' ? (k.d.en || '') : (k.d.kicker || k.d.sub || '');
      if (vt && side === 'full') E.push(T({ x: right - 104, y: 84, w: 34, h: 380, value: vt.slice(0, 16), size: 16, ls: 6, color: th.muted, vertical: true, editable: false, deco: true }));
      return;
    }
    case 'frame':
      E.push(R({ x: 32, y: 32, w: right - 64, h: H - 64, line: th.line, lw: 1 }));
      E.push(EL({ x: right / 2 - 5, y: 27, w: 10, h: 10, fill: th.primary }));
      return;
    case 'grid':
      for (let i = 1; i < (right === W ? 9 : 5); i++) E.push(LN(i * 140, 0, i * 140, H, ink, 1, { op: .07 }));
      for (let j = 1; j < 6; j++) E.push(LN(0, j * 120, right, j * 120, ink, 1, { op: .07 }));
      E.push(LN(40, 40, 72, 40, th.primary, 2)); E.push(LN(40, 40, 40, 72, th.primary, 2));
      E.push(LN(right - 72, H - 40, right - 40, H - 40, th.primary, 2)); E.push(LN(right - 40, H - 72, right - 40, H - 40, th.primary, 2));
      return;
    case 'blocks': {
      E.push(R({ x: 0, y: 0, w: 22, h: H, fill: th.tone === 'brand' ? th.text : th.primary }));
      const ghost = String(where === 'section' ? (k.d.en || '') : (k.d.title || '')).replace(/\n/g, ' ').toUpperCase();
      if (ghost && side === 'full') E.push(T({ x: 60, y: 540, w: 1200, h: 200, value: ghost.slice(0, 14), size: 180, weight: 900, font: 'b', color: ink, op: .07, lh: 1, editable: false, deco: true, nofit: true }));
      return;
    }
    case 'bubbles':
      if (side !== 'full') { E.push(EL({ x: 470, y: -80, w: 220, h: 220, fill: th.primary, op: .14 })); return; }
      E.push(EL({ x: 960, y: -90, w: 380, h: 380, fill: th.tone === 'brand' ? th.text : th.primary, op: .16 }));
      E.push(EL({ x: 1110, y: 420, w: 220, h: 220, fill: th.accent, op: .28 }));
      E.push(EL({ x: 880, y: 540, w: 120, h: 120, fill: th.tone === 'brand' ? th.text : th.primary, op: .12 }));
      E.push(EL({ x: -70, y: 570, w: 240, h: 240, fill: th.accent, op: .18 }));
      return;
    case 'hills': {
      const base = th.tone === 'brand' ? th.text : th.primary;
      E.push(EL({ x: -240, y: 540, w: 900, h: 520, fill: base, op: .10 }));
      E.push(EL({ x: 360, y: 580, w: 1100, h: 520, fill: base, op: .14 }));
      if (side === 'full') E.push(EL({ x: 900, y: 610, w: 700, h: 420, fill: th.accent, op: .16 }));
      return;
    }
    case 'bigword': {
      const ghost = String(where === 'section' ? (k.d.en || '') : where === 'cover' ? (k.d.kicker || '') : (k.d.title || '')).toUpperCase().replace(/[^A-Z0-9 &+\-]/g, '').trim();
      if (ghost && side === 'full') E.push(T({ x: 60, y: 470, w: 1220, h: 250, value: ghost.slice(0, 12), size: 260, font: 'cond', color: ink, op: .09, lh: 1, editable: false, deco: true, nofit: true }));
      E.push(R({ x: 80, y: H - 40, w: 160, h: 8, fill: th.tone === 'brand' ? th.text : th.primary }));
      return;
    }
    case 'glow': {
      const g = th.tone === 'brand' ? th.text : th.primary;
      E.push(EL({ x: -420, y: 420, w: 1100, h: 520, line: g, lw: 1.5, op: .5 })); E.push(EL({ x: -380, y: 470, w: 1100, h: 520, line: g, lw: 1, op: .25 }));
      if (side === 'full') { E.push(EL({ x: 760, y: -330, w: 900, h: 520, line: g, lw: 1.5, op: .45 })); E.push(EL({ x: 800, y: -290, w: 900, h: 520, line: g, lw: 1, op: .22 })); }
      return;
    }
    case 'offset':
      E.push(R({ x: 0, y: 0, w: 14, h: H, fill: th.tone === 'brand' ? th.text : th.primary }));
      if (where === 'section' && side === 'full') E.push(R({ x: 880, y: 150, w: 320, h: 420, fill: th.tone === 'brand' ? th.text : th.primary, op: .12 }));
      return;
    case 'pill':
      if (side === 'full') { E.push(EL({ x: 1000, y: -120, w: 420, h: 420, fill: th.tone === 'brand' ? th.text : th.primary, op: .08 })); E.push(EL({ x: -140, y: 520, w: 360, h: 360, fill: th.accent, op: .14 })); }
      return;
    case 'panel':
      return;
    case 'bars':
      E.push(R({ x: 0, y: 0, w: right, h: 8, fill: th.tone === 'brand' ? th.text : th.primary }));
      if (where === 'section') E.push(R({ x: 0, y: 0, w: 40, h: H, fill: th.text, op: .12 }));
      return;
  }
}
const ph = (d, path, def) => getP(d, path + 'Hint') || def;

/* ------------------------------------------------------------------ *
 * 7. Page types (版式)
 * ------------------------------------------------------------------ */
const L = {};
L.cover = {
  name: '封面', desc: '项目名、副标题与主视觉',
  variants: [['split', '左文右图'], ['full', '满版图'], ['type', '纯色字效'], ['center', '满版居中'], ['product', '产品主图'], ['band', '上图下文']],
  tone: d => d.variant === 'type' || d.variant === 'product' ? 'brand' : d.variant === 'full' || d.variant === 'center' ? 'dark' : null,
  imageFit: true,
  defaults: () => ({ variant: 'split', kicker: '创意提案', title: '项目名称', sub: '一句话说明这份提案要解决的问题', meta: '提案方 · 日期', img: null }),
  build(k, c) {
    const { E, th, d, st } = k; const boost = st.titleBoost || 1;
    if (d.variant === 'center') {
      E.push(k.im('img', { x: 0, y: 0, w: W, h: H, ph: ph(d, 'img', '满版主视觉'), fit: d.fit || 'cover' }));
      E.push(R({ x: 0, y: 0, w: W, h: H, fill: '#000000', op: .5 }));
      brandMark(k, 80, 60, 40, '#FFFFFF'); agencyMark(k, 'cover', { dark: true });
      E.push(k.t('kicker', { x: 140, y: 236, w: 1000, h: 26, ph: '项目类型', size: 16, weight: 700, color: '#FFFFFF', ls: 6, align: 'center' }));
      E.push(k.t('title', { x: 100, y: 274, w: 1080, h: 190, ph: '项目名称', size: Math.round(72 * boost), weight: 900, font: 'd', lh: 1.18, color: '#FFFFFF', align: 'center', ls: st.titleLs || 0 }));
      E.push(R({ x: 612, y: 486, w: 56, h: 4, fill: '#FFFFFF' }));
      E.push(k.t('sub', { x: 190, y: 510, w: 900, h: 36, ph: '副标题', size: 22, color: '#EDEDED', align: 'center' }));
      E.push(k.t('meta', { x: 190, y: 646, w: 900, h: 22, ph: '提案方 · 日期', size: 14, color: '#E0E0E0', align: 'center' }));
      return E;
    }
    if (d.variant === 'product') {
      E.push(EL({ x: 690, y: 130, w: 520, h: 520, fill: th.surface }));
      E.push(k.im('img', { x: 650, y: 130, w: 600, h: 560, ph: ph(d, 'img', '产品图（建议透明底 PNG）'), fit: d.fit || 'contain' }));
      brandMark(k, 80, 60, 40, th.text); agencyMark(k, 'cover');
      E.push(k.t('kicker', { x: 80, y: 222, w: 520, h: 24, ph: '项目类型', size: 15, weight: 700, color: th.muted, ls: 4 }));
      E.push(k.t('title', { x: 80, y: 258, w: 540, h: 200, ph: '项目名称', size: Math.round(60 * boost), weight: 900, font: 'd', lh: 1.18, ls: st.titleLs || 0 }));
      E.push(R({ x: 80, y: 484, w: 56, h: 5, fill: th.accent }));
      E.push(k.t('sub', { x: 80, y: 510, w: 520, h: 66, ph: '副标题', size: 20, color: th.muted, lh: 1.5 }));
      E.push(k.t('meta', { x: 80, y: 640, w: 520, h: 22, ph: '提案方 · 日期', size: 14, color: th.muted }));
      return E;
    }
    if (d.variant === 'band') {
      E.push(k.im('img', { x: 0, y: 0, w: W, h: 430, ph: ph(d, 'img', '横幅主视觉'), fit: d.fit || 'cover' }));
      agencyMark(k, 'cover', { plate: true });
      E.push(R({ x: 0, y: 430, w: W, h: 6, fill: st.decor === 'seal' ? th.seal : th.primary }));
      E.push(k.t('kicker', { x: 80, y: 470, w: 760, h: 24, ph: '项目类型', size: 15, weight: 700, color: th.primaryInk, ls: 4 }));
      E.push(k.t('title', { x: 80, y: 500, w: 820, h: 118, ph: '项目名称', size: Math.round(48 * boost), weight: 900, font: 'd', lh: 1.18, ls: st.titleLs || 0 }));
      E.push(k.t('sub', { x: 80, y: 630, w: 760, h: 30, ph: '副标题', size: 18, color: th.muted }));
      brandMark(k, 960, 474, 36, th.text);
      E.push(k.t('meta', { x: 860, y: 636, w: 340, h: 22, ph: '提案方 · 日期', size: 14, color: th.muted, align: 'right' }));
      return E;
    }
    if (d.variant === 'full') {
      E.push(k.im('img', { x: 0, y: 0, w: W, h: H, ph: ph(d, 'img', '满版主视觉'), fit: d.fit || 'cover' }));
      E.push(R({ x: 0, y: 0, w: W, h: H, fill: '#000000', op: .45 }));
      brandMark(k, 80, 60, 40, '#FFFFFF'); agencyMark(k, 'cover', { dark: true });
      E.push(k.t('kicker', { x: 80, y: 300, w: 900, h: 26, ph: '项目类型', size: 16, weight: 700, color: '#FFFFFF', ls: 4 }));
      E.push(k.t('title', { x: 80, y: 336, w: 1000, h: 170, ph: '项目名称', size: Math.round(64 * boost), weight: 900, font: 'd', lh: 1.18, color: '#FFFFFF', ls: st.titleLs || 0 }));
      E.push(k.t('sub', { x: 80, y: 520, w: 900, h: 36, ph: '副标题', size: 22, color: '#EDEDED' }));
      E.push(k.t('meta', { x: 80, y: 640, w: 900, h: 22, ph: '提案方 · 日期', size: 14, color: '#E0E0E0' }));
      return E;
    }
    if (d.variant === 'type') {
      deco(k, c, 'cover');
      brandMark(k, 80, 60, 40, th.text); agencyMark(k, 'cover');
      E.push(k.t('kicker', { x: 80, y: 236, w: 800, h: 26, ph: '项目类型', size: 16, weight: 700, color: th.text, ls: 4 }));
      E.push(k.t('title', { x: 80, y: 274, w: 940, h: 200, ph: '项目名称', size: Math.round(76 * boost), weight: 900, font: 'd', lh: 1.15, ls: st.titleLs || 0 }));
      E.push(R({ x: 80, y: 500, w: 56, h: 5, fill: th.accent }));
      E.push(k.t('sub', { x: 80, y: 528, w: 800, h: 34, ph: '副标题', size: 22, color: th.muted }));
      E.push(k.t('meta', { x: 80, y: 640, w: 800, h: 22, ph: '提案方 · 日期', size: 14, color: th.muted }));
      return E;
    }
    E.push(k.im('img', { x: 640, y: 0, w: 640, h: H, ph: ph(d, 'img', '主视觉 / 产品图'), fit: d.fit || 'cover' }));
    deco(k, c, 'cover', 'left');
    brandMark(k, 80, 60, 40, th.text); agencyMark(k, 'cover', { plate: true });
    E.push(k.t('kicker', { x: 80, y: 222, w: 520, h: 24, ph: '项目类型', size: 15, weight: 700, color: th.primaryInk, ls: 4 }));
    E.push(k.t('title', { x: 80, y: 258, w: 500, h: 200, ph: '项目名称', size: Math.round(56 * boost), weight: 900, font: 'd', lh: 1.2, ls: st.titleLs || 0 }));
    E.push(k.t('sub', { x: 80, y: 470, w: 500, h: 66, ph: '副标题', size: 21, color: th.muted, lh: 1.5 }));
    E.push(R({ x: 80, y: 600, w: 44, h: 4, fill: st.decor === 'seal' ? th.seal : th.primary }));
    E.push(k.t('meta', { x: 80, y: 620, w: 500, h: 22, ph: '提案方 · 日期', size: 14, color: th.muted }));
    return E;
  }
};
L.contents = {
  name: '目录', desc: '自动汇总章节页',
  variants: [['list', '列表']],
  toggles: [['auto', '自动同步章节页']],
  lists: [{ key: 'items', label: '目录项（关闭自动同步后可编辑）', min: 1, max: 8, fields: [['t', '标题'], ['en', '英文', 90]], make: () => ({ t: '章节', en: 'PART' }), when: d => !d.auto }],
  defaults: () => ({ variant: 'list', title: '目录', en: 'CONTENTS', auto: true, items: [{ t: '项目洞察', en: 'INSIGHT' }, { t: '创意策略', en: 'STRATEGY' }] }),
  build(k, c) {
    const { E, th, d, st } = k;
    const items = d.auto ? c.secs.map(x => ({ t: x.title, en: x.en, no: x.no })) : (d.items || []).map((x, i) => ({ ...x, no: numStr(st, i + 1) }));
    if (st.decor === 'seal' || st.decor === 'frame') deco(k, c, 'contents');
    if (st.decor === 'bars') E.push(R({ x: 0, y: 0, w: W, h: 6, fill: th.primary }));
    E.push(k.t('title', { x: 80, y: 150, w: 340, h: 84, ph: '目录', size: Math.round(60 * (st.titleBoost || 1)), weight: 900, font: 'd' }));
    E.push(k.t('en', { x: 80, y: 240, w: 340, h: 24, ph: 'CONTENTS', size: 16, weight: 500, color: th.muted, ls: 6 }));
    E.push(R({ x: 80, y: 284, w: 48, h: 4, fill: st.decor === 'seal' ? th.seal : th.primary }));
    const n = Math.max(items.length, 1), two = n > 5, cols = two ? 2 : 1, perCol = Math.ceil(n / cols);
    const x0 = 480, colW = two ? 340 : 720, rh = Math.min(96, 480 / perCol), y0 = 360 - perCol * rh / 2;
    items.forEach((it, i) => {
      const col = Math.floor(i / perCol), row = i % perCol, x = x0 + col * (colW + 40), y = y0 + row * rh, ed = !d.auto;
      E.push(T({ x, y: y + 6, w: 70, h: 44, value: it.no, size: 30, weight: 900, font: st.num === 'cn' ? 'd' : 'd', color: th.primaryBig, editable: false }));
      E.push(T({ x: x + 84, y: y + 6, w: colW - 84, h: 34, value: it.t || '', bind: ed ? `items.${i}.t` : null, ph: '章节标题', size: 24, weight: 700, editable: ed }));
      E.push(T({ x: x + 84, y: y + 42, w: colW - 84, h: 20, value: it.en || '', bind: ed ? `items.${i}.en` : null, ph: 'ENGLISH', size: 12, color: th.muted, ls: 3, editable: ed }));
      E.push(LN(x, y + rh - 6, x + colW, y + rh - 6, th.line, 1));
    });
    if (!items.length) E.push(T({ x: x0, y: 340, w: 700, h: 40, value: '添加章节页后，这里会自动列出章节', size: 18, color: th.muted, editable: false }));
    return E;
  }
};
L.section = {
  name: '章节页', desc: 'PART 编号与章节标题',
  variants: [['left', '左对齐'], ['center', '居中'], ['band', '底部图带'], ['ghost', '大号底字 + 小节'], ['split', '左文右图']],
  tone: () => 'brand',
  imageFit: true,
  lists: [{ key: 'items', label: '本章小节', min: 0, max: 6, fields: [['t', '小节']], make: () => ({ t: '小节' }), when: d => d.variant === 'ghost' }],
  defaults: () => ({ variant: 'left', no: '', title: '章节标题', en: 'SECTION', desc: '', img: null, items: [{ t: '公司简介' }, { t: '服务能力' }, { t: '团队配置' }] }),
  build(k, c) {
    const { E, th, d, st } = k;
    const no = d.no || c.secNo;
    const label = st.num === 'cn' ? '第　章' : 'PART';
    if (d.variant === 'band') {
      E.push(k.im('img', { x: 0, y: 400, w: W, h: H - 400, ph: ph(d, 'img', '章节氛围图带'), fit: d.fit || 'cover' }));
      E.push(k.t('no', { x: 80, y: 84, w: 320, h: 150, value: no, ph: '01', size: 128, weight: 900, font: 'd', color: th.primaryBig, lh: 1.1 }));
      E.push(k.t('title', { x: 80, y: 238, w: 600, h: 70, ph: '章节标题', size: Math.round(50 * (st.titleBoost || 1)), weight: 900, font: 'd', ls: st.titleLs || 0 }));
      E.push(k.t('en', { x: 80, y: 314, w: 600, h: 24, ph: 'ENGLISH TITLE', size: 15, color: th.muted, ls: 6 }));
      E.push(k.t('desc', { x: 720, y: 250, w: 480, h: 80, ph: '一句话说明本章内容（可留空）', size: 16, color: th.muted, lh: 1.6 }));
      return E;
    }
    if (d.variant === 'split') {
      E.push(k.im('img', { x: 640, y: 0, w: 640, h: H, ph: ph(d, 'img', '章节配图'), fit: d.fit || 'cover' }));
      deco(k, c, 'section', 'left');
      E.push(T({ x: 80, y: 168, w: 200, h: 22, value: label, size: 16, weight: 700, ls: 6, color: th.muted, editable: false }));
      E.push(k.t('no', { x: 80, y: 186, w: 480, h: 190, value: no, ph: '01', size: 160, weight: 900, font: 'd', color: th.primaryBig, lh: 1.1 }));
      E.push(k.t('title', { x: 80, y: 392, w: 500, h: 74, ph: '章节标题', size: Math.round(50 * (st.titleBoost || 1)), weight: 900, font: 'd', ls: st.titleLs || 0 }));
      E.push(k.t('en', { x: 80, y: 478, w: 500, h: 24, ph: 'ENGLISH TITLE', size: 15, color: th.muted, ls: 6 }));
      E.push(k.t('desc', { x: 80, y: 528, w: 500, h: 60, ph: '一句话说明本章内容（可留空）', size: 16, color: th.muted, lh: 1.6 }));
      return E;
    }
    if (d.variant === 'ghost') {
      deco(k, c, 'section');
      E.push(T({ x: 140, y: 70, w: 1000, h: 340, value: String(no), size: 300, weight: 900, font: 'd', align: 'center', valign: 'middle', color: mix(th.text, th.bg, .86), lh: 1, editable: false, deco: true, nofit: true }));
      E.push(k.t('title', { x: 140, y: 196, w: 1000, h: 80, ph: '章节标题', size: Math.round(54 * (st.titleBoost || 1)), weight: 900, font: 'd', align: 'center', ls: st.titleLs || 0 }));
      E.push(k.t('en', { x: 140, y: 284, w: 1000, h: 24, ph: 'ENGLISH TITLE', size: 15, color: th.muted, align: 'center', ls: 6 }));
      const it = d.items || [], cols = it.length > 3 ? 2 : 1, per = Math.ceil(it.length / cols), cw = 340, x0 = (W - (cols * cw + (cols - 1) * 60)) / 2;
      it.forEach((x, i) => {
        const col = Math.floor(i / per), row = i % per, xx = x0 + col * (cw + 60), y = 420 + row * 52;
        E.push(T({ x: xx, y, w: 60, h: 30, value: `${String(no).replace(/^0/, '') || no}.${i + 1}`, size: 16, weight: 700, font: 'm', color: th.primaryInk, editable: false }));
        E.push(k.t(`items.${i}.t`, { x: xx + 64, y, w: cw - 64, h: 30, ph: '小节', size: 18, weight: 500 }));
        E.push(LN(xx, y + 40, xx + cw, y + 40, th.line, 1));
      });
      return E;
    }
    deco(k, c, 'section');
    if (d.variant === 'center') {
      E.push(k.t('no', { x: 240, y: 140, w: 800, h: 180, value: no, ph: '01', size: 150, weight: 900, font: 'd', align: 'center', color: th.primaryBig, lh: 1.1 }));
      E.push(k.t('title', { x: 140, y: 340, w: 1000, h: 72, ph: '章节标题', size: Math.round(52 * (st.titleBoost || 1)), weight: 900, font: 'd', align: 'center', ls: st.titleLs || 0 }));
      E.push(k.t('en', { x: 140, y: 424, w: 1000, h: 24, ph: 'ENGLISH TITLE', size: 15, color: th.muted, align: 'center', ls: 6 }));
      E.push(k.t('desc', { x: 290, y: 470, w: 700, h: 60, ph: '一句话说明本章内容（可留空）', size: 16, color: th.muted, align: 'center', lh: 1.6 }));
      return E;
    }
    E.push(T({ x: 80, y: 168, w: 200, h: 22, value: label, size: 16, weight: 700, ls: 6, color: th.muted, editable: false }));
    E.push(k.t('no', { x: 80, y: 186, w: 600, h: 190, value: no, ph: '01', size: 170, weight: 900, font: 'd', color: th.primaryBig, lh: 1.1 }));
    E.push(k.t('title', { x: 80, y: 392, w: 760, h: 74, ph: '章节标题', size: Math.round(54 * (st.titleBoost || 1)), weight: 900, font: 'd', ls: st.titleLs || 0 }));
    E.push(k.t('en', { x: 80, y: 478, w: 760, h: 24, ph: 'ENGLISH TITLE', size: 15, color: th.muted, ls: 6 }));
    E.push(k.t('desc', { x: 80, y: 528, w: 600, h: 60, ph: '一句话说明本章内容（可留空）', size: 16, color: th.muted, lh: 1.6 }));
    return E;
  }
};
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, '')); return isFinite(n) ? n : 0; };
function barChart(k, box) {
  const { E, th, d } = k; const bars = d.bars || [];
  E.push(k.t('chartTitle', { x: box.x, y: box.y, w: box.w, h: 22, ph: '图表标题', size: 15, weight: 700 }));
  const n = Math.max(bars.length, 1), slot = box.w / n, bw = Math.min(76, slot * .56);
  const base = box.y + box.h - 30, top = box.y + 64, ch = base - top;
  const vals = bars.map(b => num(b.value)), mx = Math.max(...vals, 0) || 1;
  E.push(LN(box.x, base, box.x + box.w, base, th.line, 1.2));
  bars.forEach((b, i) => {
    const v = vals[i], h = Math.max(2, v / mx * ch), x = box.x + i * slot + (slot - bw) / 2, hot = v === mx;
    E.push(R({ x, y: base - h, w: bw, h, fill: hot ? th.primary : mix(th.primary, th.bg, .62), r: Math.min(k.st.radius, 6) }));
    E.push(k.t(`bars.${i}.value`, { x: box.x + i * slot, y: base - h - 30, w: slot, h: 24, ph: '0', size: 16, weight: 700, align: 'center', color: hot ? th.inkOnSurface : th.text, rerender: true }));
    E.push(k.t(`bars.${i}.label`, { x: box.x + i * slot, y: base + 8, w: slot, h: 20, ph: '标签', size: 13, align: 'center', color: th.mutedOnSurface }));
  });
}
L.data = {
  name: '数据页', desc: '大数字、柱状图或组合',
  variants: [['stats', '数字'], ['chart', '图表'], ['mix', '数字 + 图表']],
  lists: [
    { key: 'stats', label: '数字', min: 1, max: 5, fields: [['value', '数值', 70], ['unit', '单位', 46], ['label', '说明']], make: () => ({ value: '100', unit: '%', label: '指标说明', note: '' }), when: d => d.variant !== 'chart' },
    { key: 'bars', label: '柱状图数据', min: 2, max: 10, fields: [['label', '标签'], ['value', '数值', 70]], make: () => ({ label: '类别', value: '50' }), when: d => d.variant !== 'stats' },
  ],
  defaults: () => ({ variant: 'stats', title: '关键数据', sub: '用一句话说明这些数字意味着什么', chartTitle: '图表标题',
    stats: [{ value: '19', unit: '年', label: '行业经验', note: '' }, { value: '800', unit: '+', label: '服务品牌', note: '' }, { value: '12000', unit: '件', label: '交付作品', note: '' }],
    bars: [{ label: 'A', value: '40' }, { label: 'B', value: '65' }, { label: 'C', value: '52' }, { label: 'D', value: '80' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    const stats = d.stats || [];
    const statRow = (y, big, withNote) => {
      const n = Math.max(stats.length, 1), cw = 1120 / n;
      stats.forEach((s, i) => {
        const x = 80 + i * cw;
        if (i) E.push(LN(x - 1, y + 10, x - 1, y + (withNote ? 230 : 150), th.line, 1));
        const px = i ? x + 28 : x;
        E.push(T({ x: px, y, w: cw - 40, h: big + 16, valign: 'bottom', lh: 1.1, runs: [
          { bind: `stats.${i}.value`, value: s.value ?? '', ph: '0', size: big, weight: 900, font: 'd', color: th.primaryBig },
          { bind: `stats.${i}.unit`, value: s.unit ?? '', ph: '', size: Math.round(big * .3), weight: 700, color: th.text }] }));
        E.push(k.t(`stats.${i}.label`, { x: px, y: y + big + 26, w: cw - 40, h: 26, ph: '指标说明', size: 17, weight: 700 }));
        if (withNote) E.push(k.t(`stats.${i}.note`, { x: px, y: y + big + 58, w: cw - 44, h: 64, ph: '补充说明（可留空）', size: 14, color: th.muted, lh: 1.55 }));
      });
    };
    if (d.variant === 'chart') {
      E.push(k.t('sub', { x: 80, y: 200, w: 360, h: 220, ph: '结论：数据说明了什么', size: 26, weight: 700, font: 'd', lh: 1.45 }));
      E.push(k.t('note', { x: 80, y: 560, w: 360, h: 60, ph: '数据来源（可留空）', size: 12, color: th.muted, lh: 1.5 }));
      E.push(R({ x: 500, y: 176, w: 700, h: 470, fill: th.surface, r: st.radius }));
      barChart(k, { x: 540, y: 206, w: 620, h: 410 });
    } else if (d.variant === 'mix') {
      statRow(172, 60, false);
      barChart(k, { x: 80, y: 360, w: 1120, h: 300 });
    } else {
      statRow(210, 84, true);
      if (d.sub || c.edit) {
        E.push(R({ x: 80, y: 528, w: 1120, h: 112, fill: th.surface, r: st.radius }));
        E.push(k.t('sub', { x: 116, y: 528, w: 1050, h: 112, valign: 'middle', ph: '用一句话说明这些数字意味着什么', size: 20, weight: 500, lh: 1.55 }));
      }
    }
    foot(k, c); return E;
  }
};
L.summary = {
  name: '总结页', desc: '金句、支柱关键词或要点列表',
  variants: [['statement', '金句'], ['pillars', '关键词'], ['list', '要点列表'], ['question', '提问过渡'], ['concept', '概念标题']],
  tone: d => d.variant === 'question' ? 'brand' : null,
  toggles: [['highlight', '突出最后一个关键词', d => d.variant === 'pillars']],
  lists: [{ key: 'points', label: '要点', min: 2, max: 6, fields: [['k', '关键词', 90], ['d', '说明']], make: () => ({ k: '关键词', d: '一句说明' }), when: d => d.variant !== 'statement' && d.variant !== 'question' }],
  defaults: () => ({ variant: 'pillars', title: '核心结论', statement: '把一句最重要的洞察写在这里，让评审一眼记住。', sub: '', highlight: true,
    points: [{ k: '识别点', d: '货架上三秒被看见' }, { k: '记忆点', d: '一个只属于品牌的符号' }, { k: '传播点', d: '让用户愿意拍照分享' }] }),
  build(k, c) {
    const { E, th, d, st } = k;
    if (d.variant === 'question') {
      deco(k, c, 'section');
      E.push(k.t('eyebrow', { x: 140, y: 196, w: 1000, h: 22, value: d.eyebrow ?? c.autoEyebrow, ph: '眉标', size: 14, weight: 700, color: th.muted, ls: 3, align: 'center', font: st.eyebrowMono ? 'm' : 'b' }));
      E.push(k.t('statement', { x: 140, y: 236, w: 1000, h: 200, ph: '一个引出下一部分的问题？', size: Math.round(46 * (st.titleBoost || 1)), weight: 900, font: 'd', lh: 1.4, align: 'center', valign: 'middle' }));
      E.push(R({ x: 612, y: 462, w: 56, h: 4, fill: th.accent }));
      E.push(k.t('sub', { x: 240, y: 488, w: 800, h: 60, ph: '补充说明（可留空）', size: 17, color: th.muted, align: 'center', lh: 1.6 }));
      return E;
    }
    if (d.variant === 'concept') {
      const sz = Math.round(66 * (st.titleBoost || 1)), f = resolveFont({ font: 'd', weight: 900, size: sz }, st, d.statement || '概念名'), tw = Math.min(900, textW(d.statement || '概念名', f.fk, f.weight, sz, 0));
      E.push(k.t('eyebrow', { x: 140, y: 140, w: 1000, h: 22, value: d.eyebrow ?? c.autoEyebrow, ph: '眉标 · 如「创意方向一」', size: 14, weight: 700, color: th.primaryInk, ls: 3, align: 'center', font: st.eyebrowMono ? 'm' : 'b' }));
      E.push(T({ x: W / 2 - tw / 2 - 78, y: 196, w: 70, h: 100, value: '「', size: sz, weight: 400, color: th.primaryBig, align: 'right', valign: 'middle', editable: false, nofit: true }));
      E.push(T({ x: W / 2 + tw / 2 + 8, y: 196, w: 70, h: 100, value: '」', size: sz, weight: 400, color: th.primaryBig, align: 'left', valign: 'middle', editable: false, nofit: true }));
      E.push(k.t('statement', { x: 190, y: 196, w: 900, h: 100, ph: '概念名', size: sz, weight: 900, font: 'd', align: 'center', valign: 'middle', ls: st.titleLs || 0 }));
      E.push(k.t('sub', { x: 190, y: 316, w: 900, h: 60, ph: '一句话阐释这个概念', size: 21, color: th.muted, align: 'center', lh: 1.55 }));
      const pts = (d.points || []).slice(0, 5), n = Math.max(pts.length, 1), slot = 1120 / n;
      E.push(R({ x: 0, y: 520, w: W, h: 200, fill: th.primary }));
      pts.forEach((p, i) => {
        const x = 80 + i * slot;
        E.push(EL({ x: x + slot / 2 - 7, y: 566, w: 14, h: 14, line: th.onPrimary, lw: 2 }));
        E.push(k.t(`points.${i}.k`, { x: x + 10, y: 592, w: slot - 20, h: 30, ph: '关键词', size: 20, weight: 800, align: 'center', color: th.onPrimary }));
        E.push(k.t(`points.${i}.d`, { x: x + 10, y: 628, w: slot - 20, h: 44, ph: '一句说明', size: 13, align: 'center', color: th.onPrimary, lh: 1.5 }));
      });
      return E;
    }
    if (d.variant === 'statement') {
      if (st.decor === 'seal') { E.push(R({ x: 160, y: 117, w: 11, h: 11, fill: th.seal })); }
      E.push(k.t('eyebrow', { x: st.decor === 'seal' ? 180 : 160, y: 112, w: 900, h: 20, value: d.eyebrow ?? c.autoEyebrow, ph: '眉标', size: 13, weight: 700, color: th.primaryInk, ls: 2, font: st.eyebrowMono ? 'm' : 'b' }));
      E.push(T({ x: 156, y: 150, w: 120, h: 80, value: st.decor === 'seal' ? '「' : '“', size: st.decor === 'seal' ? 64 : 120, weight: 900, font: st.decor === 'seal' ? 'm' : 'd', color: st.decor === 'seal' ? th.sealInk : th.primaryBig, lh: 1, editable: false, nofit: true }));
      E.push(k.t('statement', { x: 160, y: 236, w: 980, h: 240, ph: '一句核心洞察', size: Math.round(46 * (st.titleBoost || 1)), weight: 800, font: 'd', lh: 1.42 }));
      E.push(R({ x: 160, y: 500, w: 44, h: 4, fill: st.decor === 'seal' ? th.seal : th.primary }));
      E.push(k.t('sub', { x: 160, y: 526, w: 900, h: 90, ph: '补充说明（可留空）', size: 19, color: th.muted, lh: 1.65 }));
      if (st.decor === 'hills' || st.decor === 'bubbles') deco(k, c, 'statement');
      foot(k, c); return E;
    }
    head(k, c);
    const pts = d.points || [];
    if (d.variant === 'list') {
      const n = Math.max(pts.length, 1), rh = Math.min(88, 450 / n), y0 = 176;
      pts.forEach((p, i) => {
        const y = y0 + i * rh;
        E.push(LN(80, y, 1200, y, th.line, 1));
        E.push(T({ x: 80, y: y + 16, w: 80, h: 40, value: pad2(i + 1), size: 28, weight: 900, font: 'd', color: th.primaryBig, editable: false }));
        E.push(k.t(`points.${i}.k`, { x: 180, y: y + 18, w: 300, h: rh - 24, ph: '要点', size: 22, weight: 700 }));
        E.push(k.t(`points.${i}.d`, { x: 500, y: y + 21, w: 700, h: rh - 26, ph: '说明', size: 16, color: th.muted, lh: 1.55 }));
      });
      if (pts.length) E.push(LN(80, y0 + n * rh, 1200, y0 + n * rh, th.line, 1));
      foot(k, c); return E;
    }
    const n = clamp(pts.length, 1, 4), gap = 64, D = Math.min(220, (1120 - (n - 1) * gap) / n);
    const tot = n * D + (n - 1) * gap, x0 = (W - tot) / 2, y = 186;
    pts.slice(0, 4).forEach((p, i) => {
      const x = x0 + i * (D + gap), hot = d.highlight && i === n - 1;
      const shape = st.radius >= 20 || st.decor === 'rings' || st.decor === 'hills' || st.decor === 'seal' ? EL : R;
      E.push(shape({ x, y, w: D, h: D, fill: hot ? th.primary : th.surface, line: hot ? null : th.primary, lw: 2, r: st.radius }));
      E.push(k.t(`points.${i}.k`, { x: x + 12, y, w: D - 24, h: D, ph: '关键词', size: Math.round(D * .14 * (st.titleBoost || 1)), weight: 900, font: 'd', align: 'center', valign: 'middle', color: hot ? th.onPrimary : th.primaryInk }));
      E.push(k.t(`points.${i}.d`, { x: x - 24, y: y + D + 22, w: D + 48, h: 70, ph: '说明', size: 15, color: th.muted, align: 'center', lh: 1.6 }));
      if (i < n - 1) E.push(T({ x: x + D, y: y + D / 2 - 24, w: gap, h: 48, value: '+', size: 34, weight: 400, color: th.muted, align: 'center', valign: 'middle', editable: false }));
    });
    if (d.sub || c.edit) {
      E.push(R({ x: 80, y: 588, w: 1120, h: 64, fill: th.surface, r: st.radius }));
      E.push(k.t('sub', { x: 112, y: 588, w: 1060, h: 64, valign: 'middle', ph: '一句结论（可留空）', size: 18, weight: 700, align: 'center' }));
    }
    foot(k, c); return E;
  }
};
L.design = {
  name: '设计说明页', desc: '作品图 + 设计理念与要点',
  variants: [['half', '左图右文'], ['halfR', '左文右图'], ['stage', '展台']],
  imageFit: true,
  lists: [{ key: 'points', label: '设计要点', min: 0, max: 4, fields: [['k', '要点', 70], ['d', '说明']], make: () => ({ k: '要点', d: '一句说明' }) }],
  defaults: () => ({ variant: 'half', title: '设计说明', intro: '用两三句话讲清楚设计从哪里来、想让人感受到什么。', img: null,
    points: [{ k: '色彩', d: '延续品牌主色，降低饱和度营造自然感' }, { k: '图形', d: '提取品牌符号，作为包装的连续纹样' }, { k: '字体', d: '标题使用粗黑体，信息层级清晰' }] }),
  build(k, c) {
    const { E, th, d, st } = k; const pts = d.points || [];
    const pointsAt = (x, y0, w, avail) => {
      const n = Math.max(pts.length, 1), rh = Math.min(80, avail / n);
      pts.forEach((p, i) => {
        const y = y0 + i * rh;
        E.push(LN(x, y, x + w, y, th.line, 1));
        E.push(k.t(`points.${i}.k`, { x, y: y + 14, w: 110, h: rh - 20, ph: '要点', size: 15, weight: 700, color: th.primaryInk }));
        E.push(k.t(`points.${i}.d`, { x: x + 120, y: y + 14, w: w - 120, h: rh - 20, ph: '说明', size: 15, lh: 1.6 }));
      });
    };
    if (d.variant === 'stage') {
      head(k, c);
      E.push(R({ x: 80, y: 164, w: 700, h: 486, fill: th.surface, r: st.radius }));
      E.push(k.im('img', { x: 80, y: 164, w: 700, h: 486, ph: ph(d, 'img', '作品图（建议透明底 PNG）'), fit: d.fit || 'contain' }));
      E.push(k.t('intro', { x: 830, y: 168, w: 370, h: 150, ph: '设计理念', size: 16, color: th.muted, lh: 1.75 }));
      pointsAt(830, 340, 370, 300);
      foot(k, c); return E;
    }
    const right = d.variant === 'halfR', ix = right ? 660 : 0, tx = right ? 80 : 700, tw = 500;
    E.push(k.im('img', { x: ix, y: 0, w: 620, h: H, ph: ph(d, 'img', '作品图 / 设计稿'), fit: d.fit || 'cover' }));
    if (st.decor === 'seal') E.push(R({ x: tx, y: 101, w: 11, h: 11, fill: th.seal }));
    E.push(k.t('eyebrow', { x: st.decor === 'seal' ? tx + 20 : tx, y: 96, w: st.decor === 'seal' ? tw - 20 : tw, h: 20, value: d.eyebrow ?? c.autoEyebrow, ph: '眉标', size: 13, weight: 700, color: th.primaryInk, ls: 2, font: st.eyebrowMono ? 'm' : 'b' }));
    E.push(k.t('title', { x: tx, y: 124, w: tw, h: 110, ph: '页面标题', size: Math.round(38 * (st.titleBoost || 1)), weight: 800, font: 'd', lh: 1.3, ls: st.titleLs || 0 }));
    E.push(k.t('intro', { x: tx, y: 248, w: tw, h: 120, ph: '设计理念', size: 16, color: th.muted, lh: 1.75 }));
    pointsAt(tx, 392, tw, 270);
    E.push(T({ x: right ? 80 : 1100, y: 686, w: 100, h: 18, value: pad2(c.pageNo), size: 12, color: th.muted, align: right ? 'left' : 'right', editable: false }));
    return E;
  }
};
const MARKUP_BOX = { x: 400, y: 168, w: 480, h: 500 };
L.markup = {
  name: '标注页', desc: '作品图 + 引线标注细节',
  variants: [['both', '两侧标注']],
  imageFit: true,
  lists: [{ key: 'callouts', label: '标注（在画面上拖动圆点调整位置）', min: 1, max: 8, fields: [['t', '标注文字'], ['side', '', 64, 'side']], make: () => ({ t: '标注说明', ax: .5, ay: .5, side: 'auto' }) }],
  defaults: () => ({ variant: 'both', title: '细节标注', sub: '', img: null, fit: 'contain',
    callouts: [{ t: '品牌标识放在视觉中心', ax: .45, ay: .22, side: 'left' }, { t: '核心卖点用大字号呈现', ax: .4, ay: .5, side: 'left' }, { t: '辅助图形增加识别度', ax: .62, ay: .38, side: 'right' }, { t: '底部信息区统一规范', ax: .58, ay: .82, side: 'right' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    E.push(k.t('sub', { x: 80, y: 132, w: 1120, h: 22, ph: '一句说明（可留空）', size: 15, color: th.muted }));
    const IB = MARKUP_BOX;
    E.push(k.im('img', { ...IB, ph: ph(d, 'img', '作品图（建议透明底 PNG）'), fit: d.fit || 'contain' }));
    const cs = (d.callouts || []).map((o, i) => ({ ...o, i, side: o.side === 'left' || o.side === 'right' ? o.side : (num(o.ax) < .5 ? 'left' : 'right') }));
    const bh = 58, gap = 14, minY = 168, maxY = 668;
    for (const side of ['left', 'right']) {
      const list = cs.filter(o => o.side === side).sort((a, b) => a.ay - b.ay);
      list.forEach(o => o.y = clamp(IB.y + o.ay * IB.h - bh / 2, minY, maxY - bh));
      for (let j = 1; j < list.length; j++) list[j].y = Math.max(list[j].y, list[j - 1].y + bh + gap);
      for (let j = list.length - 1; j >= 0; j--) { if (list[j].y + bh > maxY) list[j].y = maxY - bh; if (j < list.length - 1) list[j].y = Math.min(list[j].y, list[j + 1].y - bh - gap); }
      list.forEach(o => {
        const bx = side === 'left' ? 80 : 940, bw = 260;
        const ax = IB.x + clamp(num(o.ax), 0, 1) * IB.w, ay = IB.y + clamp(num(o.ay), 0, 1) * IB.h;
        const ex = side === 'left' ? bx + bw : bx, ey = o.y + bh / 2, elbow = side === 'left' ? IB.x - 18 : IB.x + IB.w + 18;
        E.push(LN(ex, ey, elbow, ey, th.primaryInk, 1.3));
        E.push(LN(elbow, ey, ax, ay, th.primaryInk, 1.3));
        E.push(R({ x: bx, y: o.y, w: bw, h: bh, fill: th.bg, line: th.primaryInk, lw: 1.3, r: Math.min(st.radius, 12) }));
        E.push(k.t(`callouts.${o.i}.t`, { x: bx + 14, y: o.y, w: bw - 28, h: bh, valign: 'middle', ph: '标注文字', size: 14, lh: 1.45 }));
        E.push(EL({ x: ax - 11, y: ay - 11, w: 22, h: 22, fill: th.primary, op: .25 }));
        E.push(EL({ x: ax - 5, y: ay - 5, w: 10, h: 10, fill: th.primaryInk }));
        if (c.edit) E.push({ k: 'handle', x: ax, y: ay, i: o.i, key: 'callouts', box: IB });
      });
    }
    foot(k, c); return E;
  }
};
L.combo = {
  name: '组合页', desc: '多图拼版：案例、物料、场景',
  variants: [['grid', '等分网格'], ['feature', '一大多小']],
  toggles: [['captions', '显示图注']],
  lists: [{ key: 'items', label: '图片', min: 1, max: 8, fields: [['cap', '图注']], make: () => ({ img: null, cap: '图注' }) }],
  defaults: () => ({ variant: 'grid', title: '应用延展', sub: '', captions: true, items: [{ img: null, cap: '图注' }, { img: null, cap: '图注' }, { img: null, cap: '图注' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    const items = d.items || [], n = Math.max(items.length, 1), capH = d.captions ? 30 : 0, gap = 16;
    const A = { x: 80, y: 160, w: 1120, h: 500 };
    const cell = (i, x, y, w, h) => {
      E.push(k.im(`items.${i}.img`, { x, y, w, h: h - capH, ph: items[i].hint || '图片 ' + (i + 1), r: st.radius >= 10 ? st.radius : 0 }));
      if (d.captions) E.push(k.t(`items.${i}.cap`, { x, y: y + h - capH + 8, w, h: 20, ph: '图注', size: 13, color: th.muted }));
    };
    if (d.variant === 'feature' && n > 1) {
      const bw = Math.round(A.w * .58); cell(0, A.x, A.y, bw, A.h);
      const rest = n - 1, cols = rest > 2 ? 2 : 1, rows = Math.ceil(rest / cols);
      const rx = A.x + bw + gap, rw = A.w - bw - gap, cw = (rw - (cols - 1) * gap) / cols, ch = (A.h - (rows - 1) * gap) / rows;
      for (let j = 0; j < rest; j++) cell(j + 1, rx + (j % cols) * (cw + gap), A.y + Math.floor(j / cols) * (ch + gap), cw, ch);
    } else {
      const cols = n <= 4 ? n : Math.ceil(n / 2), rows = n <= 4 ? 1 : 2;
      const cw = (A.w - (cols - 1) * gap) / cols, ch = (A.h - (rows - 1) * gap) / rows;
      items.forEach((_, i) => cell(i, A.x + (i % cols) * (cw + gap), A.y + Math.floor(i / cols) * (ch + gap), cw, ch));
    }
    foot(k, c); return E;
  }
};
L.storyboard = {
  name: '分镜页', desc: '镜头编号、时码、画面与旁白',
  variants: [['grid', '分镜格']],
  lists: [{ key: 'frames', label: '镜头', min: 2, max: 8, fields: [['shot', '镜头', 64], ['tc', '时码', 56], ['desc', '画面描述']], make: () => ({ img: null, shot: '镜头', tc: '00:00', desc: '画面描述' }) }],
  defaults: () => ({ variant: 'grid', title: '分镜脚本', vo: '', frames: [1, 2, 3, 4].map(i => ({ img: null, shot: '镜头 ' + pad2(i), tc: '00:0' + (i * 2 - 1), desc: '画面描述' })) }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    const fr = d.frames || [], n = Math.max(fr.length, 1), cols = n <= 4 ? n : 4, rows = Math.ceil(n / cols), gap = 20;
    const fw = (1120 - (cols - 1) * gap) / cols; let fh = fw * 9 / 16;
    const tagH = 26, descH = rows > 1 ? 42 : 62; let rowH = tagH + fh + 10 + descH;
    const avail = 470; if (rows * rowH + (rows - 1) * 16 > avail) { fh = (avail - (rows - 1) * 16) / rows - tagH - 10 - descH; rowH = tagH + fh + 10 + descH; }
    const tot = rows * rowH + (rows - 1) * 16, y0 = 156 + Math.max(0, (avail - tot) / 2);
    fr.forEach((f, i) => {
      const x = 80 + (i % cols) * (fw + gap), y = y0 + Math.floor(i / cols) * (rowH + 16);
      E.push(R({ x, y, w: fw, h: tagH, fill: th.primary }));
      E.push(k.t(`frames.${i}.shot`, { x: x + 10, y, w: fw / 2, h: tagH, valign: 'middle', ph: '镜头', size: 12, weight: 700, color: th.onPrimary }));
      E.push(k.t(`frames.${i}.tc`, { x: x + fw / 2, y, w: fw / 2 - 10, h: tagH, valign: 'middle', align: 'right', ph: '00:00', size: 12, color: th.onPrimary, font: 'm' }));
      E.push(k.im(`frames.${i}.img`, { x, y: y + tagH, w: fw, h: fh, ph: f.hint || '画面' }));
      E.push(k.t(`frames.${i}.desc`, { x, y: y + tagH + fh + 10, w: fw, h: descH, ph: '画面描述', size: 13, lh: 1.5 }));
    });
    if (d.vo || c.edit) {
      E.push(R({ x: 80, y: 636, w: 1120, h: 38, fill: th.surface, r: Math.min(st.radius, 8) }));
      E.push(T({ x: 96, y: 636, w: 76, h: 38, value: 'VO / 旁白', size: 12, weight: 700, color: th.inkOnSurface, valign: 'middle', editable: false }));
      E.push(k.t('vo', { x: 180, y: 636, w: 1006, h: 38, valign: 'middle', ph: '旁白或字幕（可留空）', size: 13 }));
    }
    foot(k, c); return E;
  }
};
L.process = {
  name: '流程页', desc: '工作流程、执行节奏',
  variants: [['line', '时间线']],
  lists: [{ key: 'steps', label: '步骤', min: 2, max: 6, fields: [['t', '步骤', 90], ['d', '说明']], make: () => ({ t: '步骤', d: '说明' }) }],
  defaults: () => ({ variant: 'line', title: '工作流程', sub: '', steps: [{ t: '需求沟通', d: '明确目标与范围' }, { t: '策略提案', d: '洞察与创意方向' }, { t: '设计深化', d: '视觉与物料落地' }, { t: '交付复盘', d: '上线与效果追踪' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    const s = d.steps || [], n = Math.max(s.length, 1), slot = 1120 / n, ly = 300;
    if (n > 1) E.push(LN(80 + slot / 2, ly, 80 + slot * (n - .5), ly, th.line, 2));
    s.forEach((p, i) => {
      const cx = 80 + slot * (i + .5);
      const shape = st.radius <= 2 && st.decor !== 'rings' ? R : EL;
      E.push(shape({ x: cx - 32, y: ly - 32, w: 64, h: 64, fill: th.primary, r: st.radius }));
      E.push(T({ x: cx - 32, y: ly - 32, w: 64, h: 64, value: pad2(i + 1), size: 22, weight: 900, font: st.decor === 'grid' ? 'm' : 'b', color: th.onPrimary, align: 'center', valign: 'middle', editable: false }));
      E.push(k.t(`steps.${i}.t`, { x: cx - slot / 2 + 10, y: ly + 56, w: slot - 20, h: 32, ph: '步骤', size: 20, weight: 700, align: 'center' }));
      E.push(k.t(`steps.${i}.d`, { x: cx - slot / 2 + 14, y: ly + 96, w: slot - 28, h: 120, ph: '说明', size: 14, color: th.muted, align: 'center', lh: 1.65 }));
    });
    if (d.sub || c.edit) {
      E.push(R({ x: 80, y: 584, w: 1120, h: 62, fill: th.surface, r: st.radius }));
      E.push(k.t('sub', { x: 112, y: 584, w: 1060, h: 62, valign: 'middle', align: 'center', ph: '补充说明，如周期、节点（可留空）', size: 16, weight: 500 }));
    }
    foot(k, c); return E;
  }
};
L.closing = {
  name: '结尾页', desc: '致谢与联系方式',
  variants: [['type', '纯色字效'], ['split', '左文右图']],
  tone: d => d.variant === 'type' ? 'brand' : null,
  imageFit: true,
  defaults: () => ({ variant: 'type', title: 'THANKS', sub: '期待合作', meta: '联系人 · 电话 · 邮箱', img: null }),
  build(k, c) {
    const { E, th, d, st } = k; const split = d.variant === 'split';
    if (split) E.push(k.im('img', { x: 640, y: 0, w: 640, h: H, ph: ph(d, 'img', '收尾画面'), fit: d.fit || 'cover' }));
    deco(k, c, 'closing', split ? 'left' : 'full');
    brandMark(k, 80, 60, 40, th.text); agencyMark(k, 'closing', split ? { plate: true } : {});
    const w = split ? 500 : 940;
    E.push(k.t('title', { x: 80, y: 250, w, h: 150, ph: 'THANKS', size: Math.round((split ? 92 : 120) * (st.titleBoost || 1)), weight: 900, font: 'd', ls: 4, lh: 1.1 }));
    E.push(k.t('sub', { x: 80, y: 410, w, h: 44, ph: '期待合作', size: 30, weight: 700 }));
    E.push(R({ x: 80, y: 480, w: 48, h: 4, fill: st.decor === 'seal' ? th.seal : (split ? th.primary : th.accent) }));
    E.push(k.t('meta', { x: 80, y: 504, w, h: 60, ph: '联系方式（可留空）', size: 15, color: th.muted, lh: 1.6 }));
    return E;
  }
};
L.upload = {
  name: '上传页', desc: '放入自己的公司介绍、案例等现成页面（图片或 PDF）',
  variants: [['full', '整页原样'], ['framed', '带标题版式']],
  imageFit: true,
  defaults: () => ({ variant: 'full', title: '', img: null, fit: 'contain' }),
  build(k, c) {
    const { E, d } = k;
    if (d.variant === 'framed') {
      head(k, c);
      E.push(k.im('img', { x: 80, y: 150, w: 1120, h: 516, ph: ph(d, 'img', '点击上传公司介绍或案例页（图片，或在「添加页面」里导入 PDF）'), fit: d.fit || 'contain' }));
      foot(k, c); return E;
    }
    E.push(k.im('img', { x: 0, y: 0, w: W, h: H, ph: ph(d, 'img', '点击上传整页图片，或在「添加页面」里一次导入整份 PDF'), fit: d.fit || 'contain' }));
    return E;
  }
};
/* ---- analysis pages: market, competitor, user, selling points ---- */
const splitTags = s => String(s || '').split(/\s*(?:[／、,，|｜]|(?<!\d)\/|\/(?!\d))\s*/).map(x => x.trim()).filter(Boolean);   // 5/5 stays one tag
function chips(k, x, y, maxW, tags, size = 13, onSurface = false) {
  const { E, th, st } = k, f = resolveFont({ font: 'b', weight: 500 }, st), h = size + 14; let cx = x;
  for (const t of tags) {
    const w = Math.ceil(textW(t, f.fk, f.weight, size, 0)) + 22; if (cx + w > x + maxW) break;
    E.push(R({ x: cx, y, w, h, fill: onSurface ? th.bg : th.surface, r: h / 2 }));
    E.push(T({ x: cx + 10, y, w: w - 20 + 2, h, value: t, size, weight: 500, valign: 'middle', align: 'center', editable: false, nofit: true }));
    cx += w + 8;
  }
}
function findings(k, x, y0, w, avail, key) {
  const { E, th, d } = k, list = d[key] || [], n = Math.max(list.length, 1), rh = Math.min(92, avail / n);
  list.forEach((p, i) => {
    const y = y0 + i * rh; E.push(LN(x, y, x + w, y, th.line, 1));
    E.push(k.t(`${key}.${i}.k`, { x, y: y + 12, w, h: 24, ph: '发现', size: 15, weight: 700, color: th.primaryInk }));
    E.push(k.t(`${key}.${i}.d`, { x, y: y + 40, w, h: rh - 48, ph: '一句说明', size: 14, color: th.muted, lh: 1.55 }));
  });
}
function lineChart(k, box, key) {
  const { E, th, d } = k, pts = d[key] || [], n = Math.max(pts.length, 1);
  E.push(k.t('chartTitle', { x: box.x, y: box.y, w: box.w, h: 22, ph: '图表标题', size: 15, weight: 700 }));
  const top = box.y + 70, base = box.y + box.h - 34, vals = pts.map(p => num(p.value)), mx = Math.max(...vals), mn = Math.min(...vals);
  const lo = mx === mn ? mx * .5 : mn - (mx - mn) * .35, Y = v => base - (v - lo) / ((mx - lo) || 1) * (base - top);
  const X = i => box.x + 36 + i * (box.w - 72) / Math.max(1, n - 1);
  for (let g = 0; g < 3; g++) { const gy = top + g * (base - top) / 3; E.push(LN(box.x, gy, box.x + box.w, gy, th.line, 1, { op: .6 })); }
  E.push(LN(box.x, base, box.x + box.w, base, th.line, 1.2));
  for (let i = 1; i < pts.length; i++) E.push(LN(X(i - 1), Y(vals[i - 1]), X(i), Y(vals[i]), th.primary, 3));
  pts.forEach((p, i) => {
    const last = i === pts.length - 1, r = last ? 9 : 6;
    E.push(EL({ x: X(i) - r, y: Y(vals[i]) - r, w: r * 2, h: r * 2, fill: last ? th.primary : th.bg, line: last ? null : th.primary, lw: 2.5 }));
    E.push(k.t(`${key}.${i}.value`, { x: X(i) - 50, y: Y(vals[i]) - 34, w: 100, h: 22, ph: '0', size: last ? 16 : 14, weight: 700, align: 'center', color: last ? th.inkOnSurface : th.text, rerender: true }));
    E.push(k.t(`${key}.${i}.label`, { x: X(i) - 50, y: base + 10, w: 100, h: 20, ph: '标签', size: 13, align: 'center', color: th.mutedOnSurface }));
  });
}
/* ---- 1.5 chart and layout helpers ---- */
const ramp = (th, i, n, hi = 0) => i === hi ? th.primary : mix(th.primary, th.surface, .2 + .45 * (Math.abs(i - hi) / Math.max(1, n - 1)));
function niceStep(span) { const p = Math.pow(10, Math.floor(Math.log10(span || 1))), f = span / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function colChart(k, box, key) {
  const { E, th, d } = k, pts = d[key] || [], n = Math.max(pts.length, 1), vals = pts.map(p => Math.max(0, num(p.value))), mx = Math.max(...vals, 0) || 1;
  E.push(k.t('chartTitle', { x: box.x, y: box.y, w: box.w, h: 22, ph: '图表标题', size: 15, weight: 700 }));
  const top = box.y + 74, base = box.y + box.h - 34, slot = box.w / n, bw = Math.min(70, slot * .56);
  for (let g = 0; g < 3; g++) { const gy = top + g * (base - top) / 3; E.push(LN(box.x, gy, box.x + box.w, gy, th.line, 1, { op: .6 })); }
  E.push(LN(box.x, base, box.x + box.w, base, th.line, 1.2));
  pts.forEach((p, i) => {
    const last = i === n - 1, bh = Math.max(2, (base - top) * vals[i] / mx), x = box.x + slot * i + (slot - bw) / 2;
    E.push(R({ x, y: base - bh, w: bw, h: bh, fill: last ? th.primary : mix(th.primary, th.surface, .2 + .5 * (1 - i / Math.max(1, n - 1))), r: Math.min(6, bw / 5) }));
    E.push(k.t(`${key}.${i}.value`, { x: x + bw / 2 - 50, y: base - bh - 28, w: 100, h: 22, ph: '0', size: last ? 16 : 14, weight: 700, align: 'center', color: last ? th.inkOnSurface : th.text, rerender: true }));
    E.push(k.t(`${key}.${i}.label`, { x: x + bw / 2 - slot / 2 + 2, y: base + 10, w: slot - 4, h: 20, ph: '标签', size: 13, align: 'center', color: th.mutedOnSurface }));
  });
}
function rowChart(k, box, key) {
  const { E, th, d } = k, pts = d[key] || [], n = Math.max(pts.length, 1), vals = pts.map(p => Math.max(0, num(p.value))), mx = Math.max(...vals, 0) || 1;
  E.push(k.t('chartTitle', { x: box.x, y: box.y, w: box.w, h: 22, ph: '图表标题', size: 15, weight: 700 }));
  const y0 = box.y + 50, rh = Math.min(58, (box.h - 56) / n), lw = 150, bx = box.x + lw + 10, maxW = box.w - lw - 90, bh = Math.min(26, rh * .52);
  pts.forEach((p, i) => {
    const y = y0 + i * rh, w = Math.max(3, maxW * vals[i] / mx);
    E.push(k.t(`${key}.${i}.label`, { x: box.x, y, w: lw, h: rh, valign: 'middle', ph: '名称', size: 14, weight: i === 0 ? 700 : 400 }));
    E.push(R({ x: bx, y: y + (rh - bh) / 2, w, h: bh, fill: ramp(th, i, n), r: Math.min(4, bh / 3) }));
    E.push(k.t(`${key}.${i}.value`, { x: bx + w + 8, y, w: 80, h: rh, valign: 'middle', ph: '0', size: 14, weight: 700, color: i === 0 ? th.inkOnSurface : th.text, rerender: true }));
  });
}
function donut(k, box, key) {
  const { E, th, d } = k, sh = d[key] || [], vals = sh.map(s => Math.max(0, num(s.value))), sum = vals.reduce((a, b) => a + b, 0) || 1, cols = seriesCols(th);
  const r = Math.min(176, box.h / 2 - 26), cx = box.x + r + 24, cy = box.y + box.h / 2, ring = d.donut !== false, r0 = ring ? r * .6 : 0, gap = sh.length > 1 ? .9 : 0;
  let a = 0;
  sh.forEach((s, i) => { const da = 360 * vals[i] / sum; if (da > gap * 2) E.push(PG({ pts: arcPts(cx, cy, r, r0, a + gap, a + da - gap), fill: cols[i % cols.length] })); a += da; });
  if (ring) {
    E.push(T({ x: cx - r0 + 14, y: cy - 38, w: r0 * 2 - 28, h: 50, align: 'center', valign: 'bottom', lh: 1.1, runs: [
      { bind: 'totalValue', value: d.totalValue ?? '', ph: '0', size: 40, weight: 900, font: 'd', color: th.inkOnSurface },
      { bind: 'totalUnit', value: d.totalUnit ?? '', ph: '', size: 17, weight: 700, color: th.text }] }));
    E.push(k.t('totalLabel', { x: cx - r0 + 14, y: cy + 16, w: r0 * 2 - 28, h: 40, ph: '总量说明', size: 13, align: 'center', color: th.mutedOnSurface, lh: 1.4 }));
  }
  const lx = cx + r + 40, lw = box.x + box.w - lx, rh = 46, ly = cy - sh.length * rh / 2;
  if (!ring) { E.push(k.t('totalLabel', { x: lx, y: ly - 44, w: lw, h: 22, ph: '总量说明（可留空）', size: 13, color: th.mutedOnSurface })); }
  sh.forEach((s, i) => {
    const y = ly + i * rh;
    E.push(R({ x: lx, y: y + 6, w: 14, h: 14, fill: cols[i % cols.length], r: 3 }));
    E.push(k.t(`${key}.${i}.name`, { x: lx + 24, y, w: lw - 96, h: 26, ph: '名称', size: 15 }));
    E.push(k.t(`${key}.${i}.value`, { x: lx + lw - 70, y, w: 70, h: 26, ph: '0', size: 16, weight: 700, align: 'right', rerender: true }));
  });
}
function pyramidPage(k, c) {
  const { E, th, d } = k, tiers = d.tiers || [], n = Math.max(tiers.length, 1), gap = 6, top = 166, bot = 612, Hh = bot - top, cx = 350, hT = 30, hB = 270;
  const hw = y => hT + (hB - hT) * (y - top) / Hh, tH = (Hh - gap * (n - 1)) / n;
  tiers.forEach((t, i) => {
    const y0 = top + i * (tH + gap), y1 = y0 + tH, ym = (y0 + y1) / 2, fill = solid(ramp(k.th, i, n));
    E.push(PG({ pts: [[cx - hw(y0), y0], [cx + hw(y0), y0], [cx + hw(y1), y1], [cx - hw(y1), y1]], fill }));
    const ink = ensure(onColor(fill), fill, SPEC.contrast.normal), tw = Math.max(60, 2 * hw(ym) - 24);
    E.push(k.t(`tiers.${i}.name`, { x: cx - tw / 2, y: ym - 16, w: tw, h: 32, valign: 'middle', align: 'center', ph: '层级', size: 18, weight: 700, color: ink }));
    E.push(LN(cx + hw(ym) + 10, ym, 660, ym, th.line, 1.2));
    E.push(EL({ x: 656, y: ym - 4, w: 8, h: 8, fill: fill }));
    const hasTag = !!t.tag, tagW = hasTag ? Math.ceil(textW(t.tag, resolveFont({ font: 'b', weight: 700 }, k.st).fk, 700, 13, 0)) + 24 : 0;
    E.push(k.t(`tiers.${i}.band`, { x: 684, y: ym - Math.min(44, tH / 2), w: 516 - (hasTag ? tagW + 12 : 0), h: 28, ph: '价格带 / 规模', size: 20, weight: 700, color: i === 0 ? th.primaryInk : th.text }));
    if (hasTag) { E.push(R({ x: 1200 - tagW, y: ym - Math.min(44, tH / 2) + 2, w: tagW, h: 24, fill: th.primary, r: 12 })); E.push(T({ x: 1200 - tagW + 12, y: ym - Math.min(44, tH / 2) + 2, w: tagW - 24 + 2, h: 24, value: t.tag, size: 13, weight: 700, color: th.onPrimary, align: 'center', valign: 'middle', editable: false, nofit: true })); }
    E.push(k.t(`tiers.${i}.d`, { x: 684, y: ym - Math.min(44, tH / 2) + 34, w: 516, h: Math.max(22, Math.min(64, tH - 40)), ph: '代表品牌 / 说明', size: 14, color: th.muted, lh: 1.5 }));
  });
  E.push(k.t('sub', { x: 80, y: 632, w: 1120, h: 26, ph: '一句话结论（可留空）', size: 15, weight: 700 }));
  foot(k, c); return E;
}
function priceBands(k, c) {
  const { E, th, d } = k, rs = d.ranges || [], n = Math.max(rs.length, 1), lo = rs.map(r => num(r.lo)), hi = rs.map((r, i) => Math.max(lo[i], num(r.hi)));
  const mn0 = lo.length ? Math.min(...lo) : 0, mx0 = Math.max(...hi, 1), step = niceStep((mx0 - Math.min(mn0, mx0)) / 5 || 1), mn = Math.max(0, Math.floor(mn0 / step) * step), mx = Math.ceil(mx0 / step) * step || step;
  const X0 = 300, X1 = 1180, X = v => X0 + (v - mn) / ((mx - mn) || 1) * (X1 - X0), y0 = 176, rh = Math.min(70, 400 / n), base = y0 + n * rh + 8;
  for (let v = mn; v <= mx + 1e-9; v += step) { E.push(LN(X(v), y0 - 6, X(v), base, th.line, 1, { op: .7 })); E.push(T({ x: clamp(X(v) - 40, 80, 1120), y: base + 8, w: 80, h: 18, align: X(v) - 40 > 1120 ? 'right' : X(v) - 40 < 80 ? 'left' : 'center', value: String(+v.toFixed(2)), size: 12, color: th.muted, editable: false })); }
  E.push(k.t('unit', { x: X1 - 120, y: base + 30, w: 120, h: 18, ph: '单位', size: 12, align: 'right', color: th.muted }));
  rs.forEach((r, i) => {
    const y = y0 + i * rh, self = d.selfFirst && i === 0, bh = Math.min(26, rh * .42), x1 = X(lo[i]), x2 = Math.max(x1 + 10, X(hi[i]));
    E.push(k.t(`ranges.${i}.name`, { x: 80, y, w: 200, h: rh, valign: 'middle', ph: '品牌', size: 16, weight: self ? 700 : 500, color: self ? th.primaryInk : th.text }));
    E.push(R({ x: x1, y: y + (rh - bh) / 2, w: x2 - x1, h: bh, fill: self ? th.primary : mix(th.text, th.bg, .72), r: bh / 2 }));
    const lab = `${r.lo ?? ''}–${r.hi ?? ''}${d.unit ? ' ' + d.unit : ''}`, right = x2 + 160 <= 1200;
    E.push(T({ x: right ? x2 + 10 : x1 - 160, y, w: 150, h: rh, valign: 'middle', align: right ? 'left' : 'right', value: lab, size: 13, weight: 700, color: self ? th.primaryInk : th.muted, editable: false }));
  });
  E.push(k.t('sub', { x: 80, y: 632, w: 1120, h: 26, ph: '一句结论（可留空）', size: 15, weight: 700 }));
  foot(k, c); return E;
}
function scoreBars(k, c) {
  const { E, th, d } = k, brands = ['b1', 'b2', 'b3'].filter((b, i) => d[b] || i < 2), dims = d.dims || [], nd = Math.max(dims.length, 1), mx = num(d.max) || 10;
  const cols = [th.primary, mix(th.text, th.bg, .5), mix(th.text, th.bg, .75)], keys = ['a', 'b', 'c'];
  let lx = 80; brands.forEach((b, j) => { E.push(R({ x: lx, y: 150, w: 14, h: 14, fill: cols[j], r: 3 })); E.push(k.t(b, { x: lx + 22, y: 146, w: 150, h: 22, ph: j ? '竞品' : '本品', size: 14, weight: j ? 500 : 700 })); lx += 190; });
  const y0 = 190, rh = Math.min(104, 440 / nd), bh = Math.min(16, (rh - 20) / brands.length - 6), X0 = 300, MW = 780;
  dims.forEach((dm, i) => {
    const y = y0 + i * rh, block = brands.length * (bh + 6) - 6, by = y + (rh - block) / 2;
    E.push(LN(80, y + rh, 1200, y + rh, th.line, 1, { op: .8 }));
    E.push(k.t(`dims.${i}.name`, { x: 80, y, w: 200, h: rh, valign: 'middle', ph: '维度', size: 16, weight: 700 }));
    brands.forEach((b, j) => {
      const v = clamp(num(dm[keys[j]]), 0, mx), w = Math.max(3, MW * v / mx), yy = by + j * (bh + 6);
      E.push(R({ x: X0, y: yy, w, h: bh, fill: cols[j], r: bh / 2 }));
      E.push(T({ x: X0 + w + 8, y: yy - 4, w: 60, h: bh + 8, valign: 'middle', value: dm[keys[j]] == null ? '' : String(dm[keys[j]]), size: 13, weight: j ? 500 : 700, color: j ? th.muted : th.primaryInk, editable: false }));
    });
  });
  E.push(k.t('sub', { x: 80, y: 646, w: 1120, h: 26, ph: '一句结论（可留空，分值满分见右侧面板）', size: 14, color: th.muted }));
  foot(k, c); return E;
}
function sidePage(k, c, phImg) {           // full-height image left, text column right (spec / moment / bigword)
  const { E, th, d, st } = k;
  if (st.decor === 'seal') E.push(R({ x: 680, y: 101, w: 11, h: 11, fill: th.seal }));
  E.push(k.t('eyebrow', { x: st.decor === 'seal' ? 700 : 680, y: 96, w: 500, h: 20, value: d.eyebrow ?? c.autoEyebrow, ph: '眉标', size: 13, weight: 700, color: th.primaryInk, ls: 2, font: st.eyebrowMono ? 'm' : 'b' }));
  E.push(k.t('title', { x: 680, y: 124, w: 520, h: 56, ph: phImg || '标题', size: Math.round(36 * (st.titleBoost || 1)), weight: 800, font: 'd' }));
}
const pageNo = (k, c) => k.E.push(T({ x: 1100, y: 686, w: 100, h: 18, value: pad2(c.pageNo), size: 12, color: k.th.muted, align: 'right', editable: false }));
function scenesGrid(k, c) {
  const { E, th, d, st } = k, items = d.scenes || [], n = Math.max(items.length, 1), gap = 20, cw = (1120 - gap * (n - 1)) / n, y = 160;
  items.forEach((it, i) => {
    const x = 80 + i * (cw + gap);
    E.push(R({ x, y, w: cw, h: 496, fill: th.surface, r: st.radius }));
    E.push(k.im(`scenes.${i}.img`, { x: x + 14, y: y + 14, w: cw - 28, h: 250, ph: it.hint || '使用场景照片', r: Math.min(st.radius, 12) }));
    E.push(T({ x: x + 22, y: y + 282, w: cw - 44, h: 20, runs: [
      { bind: `scenes.${i}.time`, value: it.time ?? '', ph: '时间', size: 13, weight: 700, color: th.inkOnSurface, font: 'm' },
      { value: (it.time && it.place) ? '  ·  ' : '', size: 13, color: th.mutedOnSurface },
      { bind: `scenes.${i}.place`, value: it.place ?? '', ph: '地点', size: 13, weight: 500, color: th.mutedOnSurface }] }));
    E.push(k.t(`scenes.${i}.t`, { x: x + 22, y: y + 312, w: cw - 44, h: 34, ph: '场景', size: 21, weight: 700, font: 'd' }));
    E.push(k.t(`scenes.${i}.d`, { x: x + 22, y: y + 352, w: cw - 44, h: 124, ph: '在这个场景里，用户在做什么、需要什么', size: 14, color: th.mutedOnSurface, lh: 1.6 }));
  });
  foot(k, c); return E;
}
function momentPage(k, c) {
  const { E, th, d, st } = k;
  E.push(k.im('img', { x: 0, y: 0, w: 620, h: H, ph: ph(d, 'img', '场景大图'), fit: d.fit || 'cover' }));
  sidePage(k, c, '场景标题');
  const fs = d.facts || [], n = Math.max(fs.length, 1), rh = Math.min(70, 270 / n);
  fs.forEach((f, i) => {
    const y = 210 + i * rh; E.push(LN(680, y, 1200, y, th.line, 1));
    E.push(k.t(`facts.${i}.k`, { x: 680, y: y + 12, w: 110, h: rh - 18, ph: '要素', size: 13, weight: 700, color: th.primaryInk }));
    E.push(k.t(`facts.${i}.v`, { x: 800, y: y + 8, w: 400, h: rh - 14, ph: '内容', size: 17, lh: 1.45 }));
  });
  E.push(R({ x: 680, y: 512, w: 520, h: 132, fill: th.surface, r: Math.min(st.radius, 8) }));
  E.push(R({ x: 680, y: 512, w: 6, h: 132, fill: th.primary }));
  E.push(k.t('quote', { x: 706, y: 512, w: 474, h: 132, valign: 'middle', ph: '这一刻用户心里的一句话', size: 18, lh: 1.6, font: 'd' }));
  pageNo(k, c); return E;
}
function keywordsPage(k, c) {
  const { E, th, d, st } = k, ws = d.words || [], n = Math.max(ws.length, 1), cw = 1120 / n;
  ws.forEach((w, i) => {
    const x = 80 + i * cw, pad = i ? 32 : 0, iw = cw - pad - (i < n - 1 ? 24 : 0);
    if (i) E.push(LN(x, 196, x, 560, th.line, 1));
    E.push(k.t(`words.${i}.w`, { x: x + pad, y: 190, w: iw, h: 130, ph: '关键词', size: 104, weight: 900, font: 'd', color: th.primaryBig, lh: 1.2, valign: 'bottom' }));
    E.push(k.t(`words.${i}.en`, { x: x + pad, y: 330, w: iw, h: 20, ph: 'KEYWORD', size: 13, weight: 500, font: 'm', ls: 3, color: th.muted }));
    E.push(R({ x: x + pad, y: 368, w: 40, h: 4, fill: th.primary }));
    E.push(k.t(`words.${i}.d`, { x: x + pad, y: 392, w: iw, h: 170, ph: '一句说明', size: 16, color: th.muted, lh: 1.65 }));
  });
  E.push(k.t('usp', { x: 80, y: 600, w: 1120, h: 40, ph: '一句话总结（可留空）', size: 20, weight: 700, font: 'd' }));
  foot(k, c); return E;
}
function bigwordPage(k, c) {
  const { E, th, d } = k;
  E.push(R({ x: 0, y: 0, w: 580, h: H, fill: th.primary }));
  E.push(k.t('word', { x: 80, y: 120, w: 420, h: 360, ph: '字', size: 300, weight: 900, font: 'd', color: th.onPrimary, align: 'center', valign: 'middle', lh: 1.15 }));
  E.push(k.t('wordEn', { x: 80, y: 500, w: 420, h: 24, ph: 'KEYWORD', size: 16, weight: 500, font: 'm', ls: 6, color: th.onPrimary, align: 'center' }));
  sidePage(k, c, '产品卖点');
  E.push(k.t('usp', { x: 680, y: 196, w: 520, h: 110, ph: '一句话说清这个字代表什么', size: 24, weight: 700, font: 'd', lh: 1.45, color: th.primaryInk }));
  const pts = d.points || [], n = Math.max(pts.length, 1), rh = Math.min(96, 340 / n);
  pts.forEach((p, i) => {
    const y = 326 + i * rh; E.push(LN(680, y, 1200, y, th.line, 1));
    E.push(T({ x: 680, y: y + 14, w: 40, h: 22, value: pad2(i + 1), size: 14, weight: 700, font: 'm', color: th.primaryInk, editable: false }));
    E.push(k.t(`points.${i}.k`, { x: 724, y: y + 10, w: 476, h: 28, ph: '卖点', size: 19, weight: 700 }));
    E.push(k.t(`points.${i}.d`, { x: 724, y: y + 42, w: 476, h: Math.max(22, rh - 50), ph: '一句说明', size: 14, color: th.muted, lh: 1.5 }));
  });
  pageNo(k, c); return E;
}
function formulaPage(k, c) {
  const { E, th, d } = k, ps = d.parts || [], n = Math.max(ps.length, 1), op = 64, D = Math.min(196, (1120 - n * op) / (n + 1)), total = (n + 1) * D + n * op, x0 = 80 + (1120 - total) / 2, cy = 330;
  const circ = (i, x, isRes) => {
    E.push(EL({ x, y: cy - D / 2, w: D, h: D, fill: isRes ? th.primary : th.surface }));
    E.push(k.t(isRes ? 'result' : `parts.${i}.k`, { x: x + 18, y: cy - D / 2 + 24, w: D - 36, h: D - 48, ph: isRes ? '结果' : '卖点', size: isRes ? 26 : 22, weight: 800, font: 'd', align: 'center', valign: 'middle', lh: 1.3, color: isRes ? th.onPrimary : th.text }));
    E.push(k.t(isRes ? 'resultD' : `parts.${i}.d`, { x: x - 14, y: cy + D / 2 + 22, w: D + 28, h: 90, ph: '一句说明', size: 14, align: 'center', color: th.muted, lh: 1.55 }));
  };
  ps.forEach((p, i) => {
    const x = x0 + i * (D + op); circ(i, x, false);
    E.push(T({ x: x + D, y: cy - 30, w: op, h: 60, value: i === n - 1 ? '=' : '+', size: 44, weight: 300, color: th.muted, align: 'center', valign: 'middle', editable: false }));
  });
  circ(0, x0 + n * (D + op), true);
  E.push(k.t('sub', { x: 80, y: 616, w: 1120, h: 30, ph: '一句话总结（可留空）', size: 18, weight: 700, align: 'center' }));
  foot(k, c); return E;
}
/* ---- 1.6: presentation pages — visual comparison, work in progress, atmosphere, poster series ---- */
const ratioOf = r => { const m = String(r || '3:4').match(/(\d+(?:\.\d+)?)\s*[:：x×/]\s*(\d+(?:\.\d+)?)/); return m ? +m[2] / +m[1] : 4 / 3; };   // height / width
const RATIOS = [['3:4', '竖版 3:4'], ['2:3', '竖版 2:3'], ['9:16', '长图 9:16'], ['1:1', '方形 1:1'], ['4:3', '横版 4:3']];
const hexList = s => String(s || '').match(/#?[0-9a-fA-F]{6}\b/g)?.map(h => normHex(h)).filter(Boolean).slice(0, 5) || [];
function dots(k, x, y, n, max = 5, size = 8, gap = 5) {
  const { E, th } = k; for (let i = 0; i < max; i++) E.push(EL({ x: x + i * (size + gap), y, w: size, h: size, fill: i < n ? th.text : th.line }));
}
function bottomBar(k, y = 572, h = 64) {        // one conclusion line under a row of cards (optional)
  const { E, th, d, st } = k; if (!d.sub && !k.c.edit) return;
  E.push(R({ x: 80, y, w: 1120, h, fill: th.surface, r: st.radius }));
  E.push(k.t('sub', { x: 112, y, w: 1056, h, valign: 'middle', ph: '一句结论（可留空）', size: 17, weight: 700, align: 'center' }));
}
L.compare = {
  name: '视觉对比', desc: '竞品包装并排、过往海报对比、前后对比',
  variants: [['lineup', '包装 / 产品并排'], ['posters', '海报对比'], ['versus', '前后对比']],
  imageFit: true,
  toggles: [['mineLast', '最后一项是本品（高亮）', d => d.variant !== 'versus']],
  fields: [['ratio', '海报比例（如 3:4、9:16）', d => d.variant === 'posters']],
  lists: [
    { key: 'items', label: '对比项', min: 2, max: 6, fields: [['name', '名称', 80], ['desc', '说明'], ['colors', '色值', 90], ['score', '辨识度 0–5', 56]], make: () => ({ img: null, name: '竞品', desc: '', colors: '', score: '3' }), when: d => d.variant === 'lineup' },
    { key: 'posters', label: '海报', min: 2, max: 5, fields: [['name', '名称', 80], ['note', '点评']], make: () => ({ img: null, name: '海报', note: '' }), when: d => d.variant === 'posters' },
    { key: 'pair', label: '前后两项', min: 2, max: 2, fields: [['label', '标签', 80], ['d', '说明']], make: () => ({ img: null, label: '', d: '' }), when: d => d.variant === 'versus' },
  ],
  defaults: () => ({ variant: 'lineup', title: '竞品包装并排对比', sub: '品类被白底与水蓝占满，深色是明确的空位。', mineLast: true, ratio: '3:4',
    items: [{ img: null, name: '竞品 A', desc: '白底盒配产品发光照，科技感偏运动风', colors: '#FFFFFF #1CB5E0 #2B2B2B', score: '3' }, { img: null, name: '竞品 B', desc: '大面积留白与莫兰迪色，北欧极简', colors: '#F4F4F2 #9FB8C4 #1E1E1E', score: '4' }, { img: null, name: '竞品 C', desc: '白底配蓝色品牌字与 App 截图', colors: '#FFFFFF #2F8FE0 #9AA5B1', score: '2' }, { img: null, name: '本品', desc: '深墨底配单一高饱和信号色', colors: '#1F2A2E #FF6A3D #EDE8E1', score: '4' }],
    posters: [{ img: null, name: '竞品 A 端午海报', note: '龙舟元素直给，产品偏小' }, { img: null, name: '竞品 B 端午海报', note: '水墨意境强，品牌识别弱' }, { img: null, name: '竞品 C 端午海报', note: '促销信息多，情绪感不足' }, { img: null, name: '本品往年海报', note: '产品突出，但缺节日氛围' }],
    pair: [{ img: null, label: '现状', d: '白底产品图，和竞品站在一起分不出来' }, { img: null, label: '新方案', d: '深色底 + 完成环，货架上三秒被看见' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c); k.c = c;
    if (d.variant === 'versus') {
      const pr = d.pair || [], bw = 520, y = 158, h = 352;
      pr.slice(0, 2).forEach((p, i) => {
        const x = i ? 680 : 80, after = i === 1;
        E.push(k.im(`pair.${i}.img`, { x, y, w: bw, h, ph: p.hint || (after ? '新方案' : '现状 / 竞品'), fit: d.fit || 'cover', r: Math.min(st.radius, 12) }));
        if (after) E.push(R({ x: x - 3, y: y - 3, w: bw + 6, h: h + 6, line: th.primary, lw: 3, r: Math.min(st.radius, 12) + 3 }));
        E.push(k.t(`pair.${i}.label`, { x, y: y + h + 22, w: bw, h: 30, ph: after ? '新方案' : '现状', size: 22, weight: 800, font: 'd', color: after ? th.primaryInk : th.text }));
        E.push(k.t(`pair.${i}.d`, { x, y: y + h + 58, w: bw, h: 50, ph: '一句说明', size: 15, color: th.muted, lh: 1.55 }));
      });
      E.push(EL({ x: 612, y: y + h / 2 - 28, w: 56, h: 56, fill: th.primary }));
      E.push(T({ x: 612, y: y + h / 2 - 28, w: 56, h: 56, value: '→', size: 26, weight: 700, color: th.onPrimary, align: 'center', valign: 'middle', editable: false }));
      E.push(k.t('sub', { x: 80, y: 640, w: 1120, h: 26, ph: '一句结论（可留空）', size: 15, weight: 700 }));
      foot(k, c); return E;
    }
    if (d.variant === 'posters') {
      const ps = d.posters || [], n = Math.max(ps.length, 1), gap = 28, rh = ratioOf(d.ratio);
      let w = (1120 - gap * (n - 1)) / n, h = w * rh; if (h > 322) { h = 322; w = h / rh; }
      const x0 = 80 + (1120 - (n * w + gap * (n - 1))) / 2, y = 154;
      ps.forEach((p, i) => {
        const x = x0 + i * (w + gap), mine = d.mineLast && i === n - 1;
        E.push(k.im(`posters.${i}.img`, { x, y, w, h, ph: p.hint || '海报', fit: d.fit || 'cover', r: Math.min(st.radius, 8) }));
        if (mine) E.push(R({ x: x - 3, y: y - 3, w: w + 6, h: h + 6, line: th.primary, lw: 3, r: Math.min(st.radius, 8) + 3 }));
        const tw = Math.max(w, 150), tx = x + (w - tw) / 2;
        E.push(k.t(`posters.${i}.name`, { x: tx, y: y + h + 14, w: tw, h: 22, ph: '名称', size: 15, weight: 700, align: 'center', color: mine ? th.primaryInk : th.text }));
        E.push(k.t(`posters.${i}.note`, { x: tx, y: y + h + 40, w: tw, h: 44, ph: '一句点评', size: 13, align: 'center', color: th.muted, lh: 1.5 }));
      });
      bottomBar(k, 598, 58); foot(k, c); return E;
    }
    const it = d.items || [], n = Math.max(it.length, 1), gap = 16, cw = (1120 - gap * (n - 1)) / n, y = 150, ch = 400, ih = Math.min(190, cw * 1.05);
    it.forEach((p, i) => {
      const x = 80 + i * (cw + gap), mine = d.mineLast && i === n - 1, cols = hexList(p.colors);
      E.push(R({ x, y, w: cw, h: ch, fill: th.surface, line: mine ? th.primary : null, lw: 2, r: st.radius }));
      E.push(k.im(`items.${i}.img`, { x: x + 12, y: y + 12, w: cw - 24, h: ih, ph: p.hint || '包装 / 产品图', fit: d.fit || 'contain', r: Math.min(st.radius, 8) }));
      const ty = y + ih + 26;
      E.push(k.t(`items.${i}.name`, { x: x + 16, y: ty, w: cw - 32 - (mine ? 44 : 0), h: 24, ph: '名称', size: 16, weight: 700, color: mine ? th.inkOnSurface : th.text }));
      if (mine) { E.push(R({ x: x + cw - 56, y: ty + 1, w: 40, h: 22, fill: th.primary, r: 11 })); E.push(T({ x: x + cw - 56, y: ty + 1, w: 40, h: 22, value: '本品', size: 11, weight: 700, color: th.onPrimary, align: 'center', valign: 'middle', editable: false, nofit: true })); }
      E.push(k.t(`items.${i}.desc`, { x: x + 16, y: ty + 30, w: cw - 32, h: 64, ph: '包装特征', size: 13, color: th.mutedOnSurface, lh: 1.55 }));
      const sy = y + ch - 52;
      cols.forEach((col, j) => E.push(R({ x: x + 16 + j * 24, y: sy, w: 18, h: 18, fill: col, line: th.line, lw: 1, r: 4 })));
      if (p.score !== '' && p.score != null) { E.push(T({ x: x + 16, y: sy + 26, w: 50, h: 16, value: '辨识度', size: 11, color: th.mutedOnSurface, editable: false })); dots(k, x + 64, sy + 30, clamp(Math.round(num(p.score)), 0, 5), 5, 8, 4); }
    });
    bottomBar(k, 572); foot(k, c); return E;
  }
};
L.wip = {
  name: '设计过程', desc: '参考→草图→定稿的推演、草图说明、版本迭代',
  variants: [['steps', '过程推演'], ['sketch', '草图说明'], ['versions', '版本迭代']],
  imageFit: true,
  lists: [
    { key: 'steps', label: '过程', min: 2, max: 5, fields: [['t', '阶段', 70], ['d', '说明']], make: () => ({ img: null, t: '阶段', d: '' }), when: d => d.variant === 'steps' },
    { key: 'notes', label: '设计说明', min: 0, max: 4, fields: [['k', '要点', 70], ['d', '说明']], make: () => ({ k: '要点', d: '' }), when: d => d.variant === 'sketch' },
    { key: 'versions', label: '版本', min: 2, max: 4, fields: [['v', '版本', 60], ['d', '说明']], make: () => ({ img: null, v: 'V1', d: '' }), when: d => d.variant === 'versions' },
  ],
  defaults: () => ({ variant: 'steps', title: '设计过程', sub: '', intro: '从情绪参考出发，先定构图，再定色彩与字体。', tag: '过程稿',
    steps: [{ img: null, t: '情绪参考', d: '收集端午、水墨、龙舟相关意象' }, { img: null, t: '构图草图', d: '产品居中，龙舟环绕形成视线引导' }, { img: null, t: '色彩深化', d: '青绿为主，金色点缀节日感' }, { img: null, t: '定稿', d: '统一字体与品牌信息层级' }],
    notes: [{ k: '构图', d: '产品放在视觉中心，四周留白' }, { k: '线条', d: '用一笔线描串起场景' }, { k: '下一步', d: '确认构图后进入上色' }],
    versions: [{ img: null, v: 'V1', d: '信息完整，但画面偏满' }, { img: null, v: 'V2', d: '减少元素，突出产品' }, { img: null, v: 'V3 定稿', d: '加入节日色彩，层级更清楚' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c); k.c = c;
    if (d.variant === 'sketch') {
      E.push(k.im('img', { x: 80, y: 150, w: 700, h: 506, ph: ph(d, 'img', '草图 / 过程稿'), fit: d.fit || 'contain', r: Math.min(st.radius, 10) }));
      E.push(R({ x: 820, y: 154, w: 76, h: 26, fill: th.primary, r: 13 }));
      E.push(k.t('tag', { x: 826, y: 154, w: 64, h: 26, valign: 'middle', align: 'center', ph: '过程稿', size: 12, weight: 700, color: th.onPrimary }));
      E.push(k.t('intro', { x: 820, y: 198, w: 380, h: 100, ph: '这一稿想解决什么问题', size: 18, weight: 700, font: 'd', lh: 1.5 }));
      const ns = d.notes || [], rh = Math.min(84, 330 / Math.max(ns.length, 1));
      ns.forEach((p, i) => {
        const y = 318 + i * rh; E.push(LN(820, y, 1200, y, th.line, 1));
        E.push(T({ x: 820, y: y + 12, w: 36, h: 20, value: pad2(i + 1), size: 13, weight: 700, font: 'm', color: th.primaryInk, editable: false }));
        E.push(k.t(`notes.${i}.k`, { x: 860, y: y + 10, w: 340, h: 24, ph: '要点', size: 16, weight: 700 }));
        E.push(k.t(`notes.${i}.d`, { x: 860, y: y + 36, w: 340, h: Math.max(22, rh - 42), ph: '说明', size: 13, color: th.muted, lh: 1.5 }));
      });
      foot(k, c); return E;
    }
    const versions = d.variant === 'versions', key = versions ? 'versions' : 'steps', list = d[key] || [], n = Math.max(list.length, 1), arrow = versions ? 0 : 40;
    const w = (1120 - arrow * (n - 1) - (versions ? 20 * (n - 1) : 0)) / n, y = versions ? 196 : 160, h = Math.min(versions ? 300 : 320, w * 1.15);
    list.forEach((s, i) => {
      const x = 80 + i * (w + arrow + (versions ? 20 : 0)), last = i === n - 1;
      if (versions) E.push(k.t(`versions.${i}.v`, { x, y: 152, w, h: 32, ph: 'V' + (i + 1), size: 24, weight: 800, font: 'm', color: last ? th.primaryInk : th.muted }));
      E.push(k.im(`${key}.${i}.img`, { x, y, w, h, ph: s.hint || (versions ? '版本 ' + (i + 1) : ['参考', '草图', '深化', '定稿', '应用'][i] || '过程图'), fit: d.fit || 'cover', r: Math.min(st.radius, 10) }));
      if (last) E.push(R({ x: x - 3, y: y - 3, w: w + 6, h: h + 6, line: th.primary, lw: 3, r: Math.min(st.radius, 10) + 3 }));
      if (!versions) {
        if (i < n - 1) E.push(T({ x: x + w, y: y + h / 2 - 20, w: arrow, h: 40, value: '→', size: 24, color: th.muted, align: 'center', valign: 'middle', editable: false }));
        E.push(T({ x, y: y + h + 18, w: 40, h: 24, value: pad2(i + 1), size: 15, weight: 700, font: 'm', color: last ? th.primaryInk : th.muted, editable: false }));
        E.push(k.t(`steps.${i}.t`, { x: x + 40, y: y + h + 16, w: w - 40, h: 28, ph: '阶段', size: 18, weight: 700, color: last ? th.primaryInk : th.text }));
      }
      E.push(k.t(`${key}.${i}.d`, { x, y: y + h + (versions ? 18 : 52), w, h: 66, ph: '说明', size: 14, color: th.muted, lh: 1.55 }));
    });
    foot(k, c); return E;
  }
};
L.mood = {
  name: '氛围页', desc: '标语 + 画面：满版标语、左图右字、情绪板',
  variants: [['full', '满版标语'], ['split', '左图右字'], ['board', '情绪板']],
  tone: d => d.variant === 'full' ? 'dark' : d.variant === 'split' ? 'brand' : null,
  imageFit: true,
  toggles: [['centered', '标语居中', d => d.variant === 'full']],
  lists: [{ key: 'images', label: '画面', min: 3, max: 5, fields: [['cap', '说明']], make: () => ({ img: null, cap: '' }), when: d => d.variant === 'board' }],
  defaults: () => ({ variant: 'full', slogan: '端午安康，轻享自在', en: 'A LIGHT DRAGON BOAT FESTIVAL', sub: '一杯微分子酒，喝出节日的轻盈。', img: null, centered: false,
    images: [{ img: null, cap: '' }, { img: null, cap: '' }, { img: null, cap: '' }, { img: null, cap: '' }, { img: null, cap: '' }] }),
  build(k, c) {
    const { E, th, d, st } = k, boost = st.titleBoost || 1;
    if (d.variant === 'board') {
      E.push(k.t('slogan', { x: 80, y: 64, w: 1120, h: 70, ph: '一句标语', size: Math.round(44 * boost), weight: 900, font: 'd', align: 'center', ls: st.titleLs || 0 }));
      E.push(k.t('sub', { x: 180, y: 140, w: 920, h: 26, ph: '一句说明（可留空）', size: 16, color: th.muted, align: 'center' }));
      const im = d.images || [], n = im.length, g = 12, top = 190, bot = 676, hh = bot - top;
      if (n) {
        const bigW = n <= 3 ? 560 : 520; E.push(k.im('images.0.img', { x: 80, y: top, w: bigW, h: hh, ph: im[0].hint || '主氛围图', fit: 'cover', r: Math.min(st.radius, 10) }));
        const rest = im.slice(1), rx = 80 + bigW + g, rw = 1200 - rx, cols = rest.length >= 3 ? 2 : 1, rows = Math.ceil(rest.length / cols), cw = (rw - g * (cols - 1)) / cols, rh = (hh - g * (rows - 1)) / rows;
        rest.forEach((x, j) => { const col = j % cols, row = Math.floor(j / cols), last = j === rest.length - 1 && rest.length % 2 === 1 && cols === 2; E.push(k.im(`images.${j + 1}.img`, { x: rx + col * (cw + g), y: top + row * (rh + g), w: last ? rw : cw, h: rh, ph: x.hint || '氛围图', fit: 'cover', r: Math.min(st.radius, 10) })); });
      }
      return E;
    }
    if (d.variant === 'split') {
      E.push(k.im('img', { x: 0, y: 0, w: 800, h: H, ph: ph(d, 'img', '氛围大图'), fit: d.fit || 'cover' }));
      if (st.decor === 'seal') {                    // 国潮: vertical slogan
        E.push(R({ x: 828, y: 28, w: 424, h: H - 56, line: th.text, lw: 1, op: .35 }));
        E.push(k.t('slogan', { x: 1040, y: 96, w: 140, h: 520, ph: '标语', size: 54, weight: 400, font: 'd', vertical: true, ls: 8 }));
        E.push(k.t('sub', { x: 880, y: 140, w: 120, h: 440, ph: '一句说明', size: 16, color: th.muted, vertical: true, ls: 4 }));
        brandMark(k, 880, 620, 32, th.text); return E;
      }
      E.push(k.t('en', { x: 860, y: 196, w: 340, h: 20, ph: 'ENGLISH LINE', size: 13, weight: 700, ls: 3, color: th.muted, font: st.eyebrowMono ? 'm' : 'b' }));
      E.push(k.t('slogan', { x: 860, y: 226, w: 340, h: 250, ph: '一句标语', size: Math.round(46 * boost), weight: 900, font: 'd', lh: 1.3, ls: st.titleLs || 0 }));
      E.push(R({ x: 860, y: 500, w: 44, h: 4, fill: th.accent }));
      E.push(k.t('sub', { x: 860, y: 524, w: 340, h: 90, ph: '一句说明（可留空）', size: 16, color: th.muted, lh: 1.6 }));
      brandMark(k, 860, 640, 32, th.text); return E;
    }
    E.push(k.im('img', { x: 0, y: 0, w: W, h: H, ph: ph(d, 'img', '满版氛围图'), fit: d.fit || 'cover' }));
    E.push(R({ x: 0, y: 0, w: W, h: H, fill: '#000000', op: .42 }));
    const cen = d.centered, x = cen ? 140 : 80, w = cen ? 1000 : 900, al = cen ? 'center' : 'left', y0 = cen ? 230 : 390;
    E.push(k.t('en', { x, y: y0, w, h: 22, ph: 'ENGLISH LINE', size: 14, weight: 700, ls: 4, color: '#FFFFFF', align: al }));
    E.push(k.t('slogan', { x, y: y0 + 34, w, h: 180, ph: '一句标语', size: Math.round(68 * boost), weight: 900, font: 'd', lh: 1.2, color: '#FFFFFF', align: al, ls: st.titleLs || 0 }));
    E.push(k.t('sub', { x, y: y0 + 226, w, h: 60, ph: '一句说明（可留空）', size: 19, color: '#EDEDED', align: al, lh: 1.55 }));
    brandMark(k, 80, 60, 36, '#FFFFFF');
    return E;
  }
};
L.series = {
  name: '系列海报', desc: '多张海报横排、主次排列或两行墙面',
  variants: [['row', '横排'], ['hero', '主次'], ['wall', '两行墙面']],
  imageFit: true,
  toggles: [['names', '显示海报名称']],
  fields: [['ratio', '海报比例（如 3:4、9:16、1:1）']],
  lists: [{ key: 'items', label: '海报', min: 2, max: 10, fields: [['name', '名称']], make: () => ({ img: null, name: '海报' }) }],
  defaults: () => ({ variant: 'row', title: '系列海报', sub: '', ratio: '3:4', names: true,
    items: [{ img: null, name: '北京' }, { img: null, name: '上海' }, { img: null, name: '广州' }, { img: null, name: '深圳' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c); k.c = c;
    const it = d.items || [], n = Math.max(it.length, 1), rh = ratioOf(d.ratio), r = Math.min(st.radius, 8), nm = d.names, nh = nm ? 30 : 0;
    const put = (i, x, y, w, h, big) => {
      E.push(k.im(`items.${i}.img`, { x, y, w, h, ph: (it[i] && it[i].hint) || '海报 ' + (i + 1), fit: d.fit || 'cover', r }));
      if (nm) { const tw = Math.max(w, 120); E.push(k.t(`items.${i}.name`, { x: x + (w - tw) / 2, y: y + h + 8, w: tw, h: 22, ph: '名称', size: big ? 15 : 13, weight: 700, align: 'center' })); }
    };
    const top = 150, avail = (d.sub || c.edit ? 590 : 660) - top;
    if (d.variant === 'hero' && n >= 2) {
      let bh = avail - nh, bw = bh / rh; if (bw > 520) { bw = 520; bh = bw * rh; }
      const rest = n - 1, rx = 80 + bw + 24, rw = 1200 - rx, rows = rest > 3 ? 2 : 1, cols = Math.ceil(rest / rows), g = 16;
      let sh = (avail - (rows - 1) * g) / rows - nh, sw = sh / rh; if (sw > (rw - (cols - 1) * g) / cols) { sw = (rw - (cols - 1) * g) / cols; sh = sw * rh; }
      put(0, 80, top, bw, bh, true);
      const gx = rx + (rw - (cols * sw + (cols - 1) * g)) / 2;
      for (let j = 0; j < rest; j++) put(j + 1, gx + (j % cols) * (sw + g), top + Math.floor(j / cols) * (sh + nh + g), sw, sh);
    } else {
      const rows = d.variant === 'wall' ? 2 : 1, cols = Math.ceil(n / rows), g = d.variant === 'wall' ? 16 : 24;
      let w = (1120 - g * (cols - 1)) / cols, h = w * rh; const maxH = (avail - (rows - 1) * g) / rows - nh; if (h > maxH) { h = maxH; w = h / rh; }
      const x0 = 80 + (1120 - (cols * w + (cols - 1) * g)) / 2, y0 = top + (avail - rows * (h + nh) - (rows - 1) * g) / 2;
      it.forEach((p, i) => put(i, x0 + (i % cols) * (w + g), y0 + Math.floor(i / cols) * (h + nh + g), w, h));
    }
    if (d.sub || c.edit) E.push(k.t('sub', { x: 80, y: 612, w: 1120, h: 40, valign: 'middle', ph: '一句说明（可留空）', size: 16, color: th.muted, align: 'center' }));
    foot(k, c); return E;
  }
};
L.market = {
  name: '市场分析', desc: '市场趋势、规模与结构、关键发现',
  variants: [['trend', '趋势折线'], ['bars', '柱状图'], ['hbar', '条形排名'], ['share', '结构占比'], ['pie', '饼图 / 环形图'], ['pyramid', '金字塔分层']],
  toggles: [['donut', '环形（关闭为实心饼图）', d => d.variant === 'pie']],
  lists: [
    { key: 'series', label: '数据', min: 2, max: 10, fields: [['label', '时间/类别'], ['value', '数值', 70]], make: () => ({ label: '2026', value: '100' }), when: d => ['trend', 'bars', 'hbar'].includes(d.variant) },
    { key: 'shares', label: '结构占比', min: 2, max: 8, fields: [['name', '名称'], ['value', '占比 %', 64]], make: () => ({ name: '其他', value: '10' }), when: d => d.variant === 'share' || d.variant === 'pie' },
    { key: 'tiers', label: '层级（自上而下）', min: 2, max: 5, fields: [['name', '层级', 64], ['band', '价格带 / 规模'], ['d', '说明'], ['tag', '标记', 64]], make: () => ({ name: '层级', band: '', d: '', tag: '' }), when: d => d.variant === 'pyramid' },
    { key: 'findings', label: '关键发现', min: 0, max: 3, fields: [['k', '发现', 80], ['d', '说明']], make: () => ({ k: '发现', d: '一句说明' }), when: d => d.variant !== 'pyramid' },
  ],
  defaults: () => ({ variant: 'trend', title: '市场分析', sub: '一句话结论：市场正在发生什么', chartTitle: '市场规模（亿元，示例数据）', source: '', totalValue: '1,280', totalUnit: '亿', totalLabel: '市场总规模',
    series: [{ label: '2022', value: '620' }, { label: '2023', value: '780' }, { label: '2024', value: '930' }, { label: '2025', value: '1100' }, { label: '2026', value: '1280' }],
    shares: [{ name: '头部品牌', value: '42' }, { name: '腰部品牌', value: '31' }, { name: '新锐品牌', value: '17' }, { name: '其他', value: '10' }],
    findings: [{ k: '增速', d: '近五年保持两位数增长' }, { k: '机会', d: '新锐品牌份额持续上升' }], donut: true,
    tiers: [{ name: '高端', band: '15 元以上', d: '原叶冷泡、进口品牌', tag: '' }, { name: '中高端', band: '8–15 元', d: '新式茶饮品牌', tag: '' }, { name: '中端', band: '5–8 元', d: '年轻化表达仍是空白', tag: '本品切入' }, { name: '大众', band: '3–5 元', d: '传统茶饮，渠道最广', tag: '' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    if (d.variant === 'pyramid') return pyramidPage(k, c);
    E.push(k.t('sub', { x: 80, y: 170, w: 380, h: 130, ph: '一句话结论', size: 24, weight: 700, font: 'd', lh: 1.45 }));
    findings(k, 80, 318, 380, 320, 'findings');
    E.push(k.t('source', { x: 80, y: 656, w: 380, h: 20, ph: '数据来源（可留空）', size: 11, color: th.muted }));
    E.push(R({ x: 500, y: 170, w: 700, h: 486, fill: th.surface, r: st.radius }));
    if (d.variant === 'share') {
      E.push(T({ x: 536, y: 196, w: 628, h: 86, valign: 'bottom', lh: 1.1, runs: [
        { bind: 'totalValue', value: d.totalValue ?? '', ph: '0', size: 64, weight: 900, font: 'd', color: th.inkOnSurface },
        { bind: 'totalUnit', value: d.totalUnit ?? '', ph: '', size: 22, weight: 700, color: th.text }] }));
      E.push(k.t('totalLabel', { x: 536, y: 288, w: 628, h: 22, ph: '总量说明', size: 15, color: th.mutedOnSurface }));
      const sh = d.shares || [], vals = sh.map(s => Math.max(0, num(s.value))), sum = vals.reduce((a, b) => a + b, 0) || 1;
      const cols = [th.primary, mix(th.primary, th.accent, .5), th.accent, mix(th.primary, th.surface, .5), mix(th.accent, th.surface, .5), th.line];
      let x = 536; const bw = 628;
      sh.forEach((s, i) => { const w = bw * vals[i] / sum; E.push(R({ x, y: 336, w: Math.max(2, w - 2), h: 52, fill: cols[i % cols.length] })); x += w; });
      sh.forEach((s, i) => {
        const col = i % 2, row = Math.floor(i / 2), lx = 536 + col * 322, ly = 420 + row * 58;
        E.push(R({ x: lx, y: ly + 4, w: 16, h: 16, fill: cols[i % cols.length], r: 3 }));
        E.push(k.t(`shares.${i}.name`, { x: lx + 28, y: ly, w: 200, h: 24, ph: '名称', size: 15 }));
        E.push(k.t(`shares.${i}.value`, { x: lx + 228, y: ly, w: 70, h: 24, ph: '0', size: 15, weight: 700, align: 'right' }));
      });
    } else if (d.variant === 'pie') donut(k, { x: 536, y: 196, w: 628, h: 436 }, 'shares');
    else if (d.variant === 'bars') colChart(k, { x: 536, y: 196, w: 628, h: 436 }, 'series');
    else if (d.variant === 'hbar') rowChart(k, { x: 536, y: 196, w: 628, h: 436 }, 'series');
    else lineChart(k, { x: 536, y: 196, w: 628, h: 436 }, 'series');
    foot(k, c); return E;
  }
};
L.competitor = {
  name: '竞品分析', desc: '对比表、竞品卡片或定位图（可拖动）',
  variants: [['table', '对比表'], ['cards', '竞品卡片'], ['map', '定位图'], ['price', '价格带'], ['score', '评分对比']],
  toggles: [['selfFirst', '第一项是本品（高亮）']],
  fields: [['unit', '价格单位', d => d.variant === 'price'], ['b1', '品牌 1（本品）', d => d.variant === 'score'], ['b2', '品牌 2', d => d.variant === 'score'], ['b3', '品牌 3（留空则隐藏）', d => d.variant === 'score'], ['max', '满分', d => d.variant === 'score'], ['h1', '对比维度 1', d => d.variant === 'table'], ['h2', '对比维度 2', d => d.variant === 'table'], ['h3', '对比维度 3（留空则隐藏）', d => d.variant === 'table'], ['h4', '对比维度 4（留空则隐藏）', d => d.variant === 'table']],
  lists: [
    { key: 'rows', label: '对比行（第一行为本品）', min: 2, max: 6, fields: [['name', '品牌', 70], ['a', '列 1'], ['b', '列 2'], ['c', '列 3'], ['e', '列 4']], make: () => ({ name: '品牌', a: '', b: '', c: '', e: '' }), when: d => d.variant === 'table' },
    { key: 'items', label: '竞品', min: 2, max: 4, fields: [['name', '品牌', 70], ['pos', '定位'], ['plus', '优势'], ['minus', '不足']], make: () => ({ img: null, name: '竞品', pos: '一句定位', plus: '优势', minus: '不足' }), when: d => d.variant === 'cards' },
    { key: 'dots', label: '定位点（第一项为本品，可在画面上拖动）', min: 2, max: 10, fields: [['name', '品牌']], make: () => ({ name: '竞品', ax: .5, ay: .5 }), when: d => d.variant === 'map' },
    { key: 'points', label: '结论要点', min: 0, max: 3, fields: [['k', '要点', 70], ['d', '说明']], make: () => ({ k: '结论', d: '一句说明' }), when: d => d.variant === 'map' },
    { key: 'ranges', label: '价格区间（第一行为本品）', min: 2, max: 8, fields: [['name', '品牌'], ['lo', '最低', 56], ['hi', '最高', 56]], make: () => ({ name: '竞品', lo: '5', hi: '8' }), when: d => d.variant === 'price' },
    { key: 'dims', label: '评分维度', min: 2, max: 6, fields: [['name', '维度'], ['a', '品牌 1', 50], ['b', '品牌 2', 50], ['c', '品牌 3', 50]], make: () => ({ name: '维度', a: '8', b: '6', c: '' }), when: d => d.variant === 'score' },
  ],
  defaults: () => ({ variant: 'table', title: '竞品分析', sub: '', selfFirst: true, h0: '品牌', h1: '定位', h2: '价格带', h3: '核心卖点', h4: '',
    rows: [{ name: '本品', a: '新式即饮茶', b: '5–8 元', c: '产地鲜萃', e: '' }, { name: '竞品 A', a: '传统茶饮', b: '3–5 元', c: '渠道广', e: '' }, { name: '竞品 B', a: '高端茶饮', b: '10 元以上', c: '原叶冷泡', e: '' }],
    items: [{ img: null, name: '竞品 A', pos: '大众茶饮的代表', plus: '渠道覆盖广，认知度高', minus: '包装老化，缺少新意' }, { img: null, name: '竞品 B', pos: '高端原叶茶', plus: '品质感强', minus: '价格高，受众窄' }, { img: null, name: '竞品 C', pos: '网红新品牌', plus: '设计年轻', minus: '复购率低' }],
    xLow: '价格低', xHigh: '价格高', yLow: '传统', yHigh: '年轻',
    dots: [{ name: '本品', ax: .55, ay: .8 }, { name: '竞品 A', ax: .25, ay: .3 }, { name: '竞品 B', ax: .82, ay: .4 }, { name: '竞品 C', ax: .4, ay: .62 }],
    points: [{ k: '空白点', d: '中等价位、年轻调性的位置还没有强势品牌' }],
    unit: '元', ranges: [{ name: '本品', lo: '5', hi: '8' }, { name: '竞品 A', lo: '3', hi: '5' }, { name: '竞品 B', lo: '10', hi: '18' }, { name: '竞品 C', lo: '6', hi: '12' }],
    b1: '本品', b2: '竞品 A', b3: '竞品 B', max: '10', dims: [{ name: '口感', a: '9', b: '7', c: '8' }, { name: '颜值', a: '9', b: '5', c: '7' }, { name: '价格', a: '8', b: '9', c: '5' }, { name: '健康', a: '9', b: '6', c: '8' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    if (d.variant === 'price') return priceBands(k, c);
    if (d.variant === 'score') return scoreBars(k, c);
    if (d.variant === 'cards') {
      E.push(k.t('sub', { x: 80, y: 132, w: 1120, h: 22, ph: '一句说明（可留空）', size: 15, color: th.muted }));
      const items = d.items || [], n = Math.max(items.length, 1), gap = 20, cw = (1120 - gap * (n - 1)) / n, y = 168;
      items.forEach((it, i) => {
        const x = 80 + i * (cw + gap), self = d.selfFirst && i === 0;
        E.push(R({ x, y, w: cw, h: 486, fill: th.surface, line: self ? th.primary : null, lw: 2, r: st.radius }));
        E.push(k.im(`items.${i}.img`, { x: x + 16, y: y + 16, w: cw - 32, h: 170, ph: it.hint || '产品 / 货架图', r: Math.min(st.radius, 10) }));
        E.push(k.t(`items.${i}.name`, { x: x + 20, y: y + 200, w: cw - 40, h: 30, ph: '品牌', size: 20, weight: 700, color: self ? th.inkOnSurface : th.text }));
        E.push(k.t(`items.${i}.pos`, { x: x + 20, y: y + 234, w: cw - 40, h: 44, ph: '一句定位', size: 14, color: th.mutedOnSurface, lh: 1.5 }));
        E.push(T({ x: x + 20, y: y + 290, w: 120, h: 20, value: '优势', size: 12, weight: 700, color: th.inkOnSurface, editable: false }));
        E.push(k.t(`items.${i}.plus`, { x: x + 20, y: y + 312, w: cw - 40, h: 66, ph: '优势', size: 14, lh: 1.5 }));
        E.push(T({ x: x + 20, y: y + 388, w: 120, h: 20, value: '不足', size: 12, weight: 700, color: th.mutedOnSurface, editable: false }));
        E.push(k.t(`items.${i}.minus`, { x: x + 20, y: y + 410, w: cw - 40, h: 66, ph: '不足', size: 14, lh: 1.5 }));
      });
      foot(k, c); return E;
    }
    if (d.variant === 'map') {
      const P = { x: 80, y: 160, w: 660, h: 494 }, I = { x: P.x + 44, y: P.y + 44, w: P.w - 88, h: P.h - 88 };
      E.push(R({ x: P.x, y: P.y, w: P.w, h: P.h, fill: th.surface, r: st.radius }));
      E.push(LN(P.x + 20, P.y + P.h / 2, P.x + P.w - 20, P.y + P.h / 2, th.line, 1.5));
      E.push(LN(P.x + P.w / 2, P.y + 20, P.x + P.w / 2, P.y + P.h - 20, th.line, 1.5));
      E.push(k.t('xLow', { x: P.x + 20, y: P.y + P.h / 2 + 8, w: 150, h: 20, ph: '横轴低', size: 13, color: th.mutedOnSurface }));
      E.push(k.t('xHigh', { x: P.x + P.w - 170, y: P.y + P.h / 2 + 8, w: 150, h: 20, ph: '横轴高', size: 13, color: th.mutedOnSurface, align: 'right' }));
      E.push(k.t('yHigh', { x: P.x + P.w / 2 + 10, y: P.y + 16, w: 200, h: 20, ph: '纵轴高', size: 13, color: th.mutedOnSurface }));
      E.push(k.t('yLow', { x: P.x + P.w / 2 + 10, y: P.y + P.h - 36, w: 200, h: 20, ph: '纵轴低', size: 13, color: th.mutedOnSurface }));
      (d.dots || []).forEach((o, i) => {
        const self = d.selfFirst && i === 0, px = I.x + clamp(num(o.ax), 0, 1) * I.w, py = I.y + (1 - clamp(num(o.ay), 0, 1)) * I.h, r = self ? 11 : 7;
        if (self) E.push(EL({ x: px - 20, y: py - 20, w: 40, h: 40, fill: th.primary, op: .2 }));
        E.push(EL({ x: px - r, y: py - r, w: r * 2, h: r * 2, fill: self ? th.primary : mix(th.text, th.surface, .45) }));
        const left = px > P.x + P.w - 190;
        E.push(k.t(`dots.${i}.name`, { x: left ? px - 176 : px + 16, y: py - 12, w: 160, h: 24, ph: '品牌', size: self ? 15 : 13, weight: self ? 700 : 500, color: self ? th.inkOnSurface : th.text, align: left ? 'right' : 'left', valign: 'middle' }));
        if (c.edit) E.push({ k: 'handle', x: px, y: py, i, key: 'dots', box: I, inv: true });
      });
      E.push(k.t('sub', { x: 780, y: 168, w: 420, h: 150, ph: '一句话结论', size: 24, weight: 700, font: 'd', lh: 1.45 }));
      findings(k, 780, 336, 420, 300, 'points');
      foot(k, c); return E;
    }
    const heads = ['h1', 'h2', 'h3', 'h4'], colsK = ['a', 'b', 'c', 'e'];
    const active = heads.map((h, i) => i).filter(i => d[heads[i]] || (c.edit && i < 3 && !d.h1 && !d.h2 && !d.h3));
    const nc = Math.max(active.length, 1), rows = d.rows || [], nr = Math.max(rows.length, 1), nameW = 200, colW = (1120 - nameW) / nc, y0 = 164, hh = 48, rh = Math.min(84, (474 - hh) / nr);
    E.push(R({ x: 80, y: y0, w: 1120, h: hh, fill: th.surface2, r: Math.min(st.radius, 6) }));
    E.push(k.t('h0', { x: 96, y: y0, w: nameW - 24, h: hh, valign: 'middle', ph: '品牌', size: 14, weight: 700 }));
    active.forEach((ci, j) => E.push(k.t(heads[ci], { x: 80 + nameW + j * colW + 12, y: y0, w: colW - 24, h: hh, valign: 'middle', ph: '对比维度', size: 14, weight: 700 })));
    rows.forEach((r, i) => {
      const y = y0 + hh + i * rh, self = d.selfFirst && i === 0;
      if (self) E.push(R({ x: 80, y, w: 1120, h: rh, fill: (th.tone === 'brand' ? th.surface : mix(th.primary, th.bg, .88)) }));
      E.push(k.t(`rows.${i}.name`, { x: 96, y, w: nameW - 24, h: rh, valign: 'middle', ph: '品牌', size: 16, weight: 700, color: self ? ensure(th.primaryInk, (th.tone === 'brand' ? th.surface : mix(th.primary, th.bg, .88)), SPEC.contrast.normal) : th.text }));
      active.forEach((ci, j) => E.push(k.t(`rows.${i}.${colsK[ci]}`, { x: 80 + nameW + j * colW + 12, y, w: colW - 24, h: rh, valign: 'middle', ph: '—', size: 14, lh: 1.5 })));
      E.push(LN(80, y + rh, 1200, y + rh, th.line, 1));
    });
    E.push(k.t('sub', { x: 80, y: 650, w: 1120, h: 26, ph: '一句结论（可留空）', size: 14, color: th.muted }));
    foot(k, c); return E;
  }
};
L.persona = {
  name: '用户分析', desc: '人物画像、人群分层或用户旅程',
  variants: [['single', '人物画像'], ['groups', '人群分层'], ['journey', '用户旅程'], ['scenes', '使用场景'], ['moment', '场景特写']],
  imageFit: true,
  fields: [['tags', '画像标签（用 / 分隔）', d => d.variant === 'single']],
  lists: [
    { key: 'needs', label: '需求', min: 0, max: 4, fields: [['t', '需求']], make: () => ({ t: '需求' }), when: d => d.variant === 'single' },
    { key: 'pains', label: '痛点', min: 0, max: 4, fields: [['t', '痛点']], make: () => ({ t: '痛点' }), when: d => d.variant === 'single' },
    { key: 'items', label: '人群', min: 2, max: 4, fields: [['name', '名称', 80], ['desc', '描述'], ['tags', '标签 / 分隔']], make: () => ({ img: null, name: '人群', desc: '一句描述', quote: '', tags: '标签 / 标签' }), when: d => d.variant === 'groups' },
    { key: 'scenes', label: '使用场景', min: 2, max: 4, fields: [['time', '时间', 56], ['place', '地点', 70], ['t', '场景'], ['d', '说明']], make: () => ({ img: null, time: '', place: '', t: '场景', d: '' }), when: d => d.variant === 'scenes' },
    { key: 'facts', label: '场景要素', min: 2, max: 4, fields: [['k', '要素', 56], ['v', '内容']], make: () => ({ k: '要素', v: '' }), when: d => d.variant === 'moment' },
    { key: 'stages', label: '旅程阶段', min: 3, max: 6, fields: [['t', '阶段', 70], ['d', '行为 / 触点'], ['mood', '情绪 1–5', 64]], make: () => ({ t: '阶段', d: '行为', mood: '3', note: '' }), when: d => d.variant === 'journey' },
  ],
  defaults: () => ({ variant: 'single', title: '目标用户画像', img: null, name: '小林，28 岁', profile: '一线城市互联网公司产品经理', quote: '「工作再忙，也想好好照顾自己。」', tags: '精致独居 / 效率优先 / 愿为设计买单',
    needs: [{ t: '健康，但不想花太多时间' }, { t: '颜值高，愿意拍照分享' }], pains: [{ t: '选择太多，不知道哪个好' }, { t: '担心添加剂与糖分' }],
    items: [{ img: null, name: '精致白领', desc: '25–35 岁，注重效率与品质', quote: '「好喝也要好看。」', tags: '颜值 / 健康' }, { img: null, name: '学生党', desc: '18–24 岁，追新尝鲜', quote: '「新品一定要试。」', tags: '尝鲜 / 社交' }, { img: null, name: '年轻父母', desc: '30–40 岁，关注成分', quote: '「孩子能喝吗？」', tags: '安心 / 配料表' }],
    stages: [{ t: '认知', d: '刷到种草笔记', mood: '3', note: '内容要有记忆点' }, { t: '兴趣', d: '搜索评价与成分', mood: '2', note: '信息分散，易流失' }, { t: '购买', d: '便利店货架挑选', mood: '4', note: '包装三秒定胜负' }, { t: '饮用', d: '办公室下午茶', mood: '5', note: '口感超预期' }, { t: '分享', d: '拍照发朋友圈', mood: '4', note: '给出分享理由' }],
    scenes: [{ img: null, time: '08:30', place: '通勤路上', t: '早高峰提神', d: '地铁里单手拿着，比咖啡更轻、不心慌。' }, { img: null, time: '15:00', place: '办公室', t: '下午茶时刻', d: '和同事分享，包装好看，愿意拍照。' }, { img: null, time: '21:00', place: '家里', t: '运动之后', d: '0 糖 0 卡，补水不增加负担。' }],
    facts: [{ k: '时间', v: '工作日下午三点' }, { k: '地点', v: '写字楼茶水间' }, { k: '人物', v: '刚开完会的小林' }, { k: '需求', v: '想提神，又不想喝甜的' }] }),
  build(k, c) {
    const { E, th, d, st } = k;
    if (d.variant === 'moment') return momentPage(k, c);
    head(k, c);
    if (d.variant === 'scenes') return scenesGrid(k, c);
    if (d.variant === 'groups') {
      const items = d.items || [], n = Math.max(items.length, 1), gap = 20, cw = (1120 - gap * (n - 1)) / n, y = 160;
      items.forEach((it, i) => {
        const x = 80 + i * (cw + gap);
        E.push(R({ x, y, w: cw, h: 496, fill: th.surface, r: st.radius }));
        E.push(k.im(`items.${i}.img`, { x: x + 16, y: y + 16, w: cw - 32, h: 200, ph: it.hint || '人群照片', r: Math.min(st.radius, 12) }));
        E.push(k.t(`items.${i}.name`, { x: x + 20, y: y + 230, w: cw - 40, h: 32, ph: '人群名称', size: 21, weight: 700, font: 'd' }));
        E.push(k.t(`items.${i}.desc`, { x: x + 20, y: y + 266, w: cw - 40, h: 46, ph: '一句描述', size: 14, color: th.mutedOnSurface, lh: 1.5 }));
        E.push(k.t(`items.${i}.quote`, { x: x + 20, y: y + 320, w: cw - 40, h: 110, ph: '一句典型原话（可留空）', size: 15, lh: 1.6 }));
        chips(k, x + 20, y + 446, cw - 40, splitTags(it.tags).slice(0, 4), 12, true);
      });
      foot(k, c); return E;
    }
    if (d.variant === 'journey') {
      const sg = d.stages || [], n = Math.max(sg.length, 1), slot = 1120 / n, cx = i => 80 + slot * (i + .5);
      sg.forEach((s, i) => {
        E.push(R({ x: cx(i) - slot / 2 + 8, y: 166, w: slot - 16, h: 40, fill: th.primary, r: 20 }));
        E.push(k.t(`stages.${i}.t`, { x: cx(i) - slot / 2 + 16, y: 166, w: slot - 32, h: 40, valign: 'middle', align: 'center', ph: '阶段', size: 15, weight: 700, color: th.onPrimary }));
        E.push(k.t(`stages.${i}.d`, { x: cx(i) - slot / 2 + 12, y: 222, w: slot - 24, h: 96, ph: '行为 / 触点', size: 14, align: 'center', lh: 1.55 }));
      });
      E.push(R({ x: 80, y: 334, w: 1120, h: 216, fill: th.surface, r: st.radius }));
      E.push(T({ x: 96, y: 344, w: 120, h: 18, value: '情绪高', size: 12, color: th.mutedOnSurface, editable: false }));
      E.push(T({ x: 96, y: 522, w: 120, h: 18, value: '情绪低', size: 12, color: th.mutedOnSurface, editable: false }));
      const Y = s => 520 - (clamp(num(s.mood) || 3, 1, 5) - 1) / 4 * 150;
      for (let i = 1; i < sg.length; i++) E.push(LN(cx(i - 1), Y(sg[i - 1]), cx(i), Y(sg[i]), th.primary, 3));
      sg.forEach((s, i) => { const low = (num(s.mood) || 3) <= 2; E.push(EL({ x: cx(i) - 10, y: Y(s) - 10, w: 20, h: 20, fill: low ? th.surface : th.primary, line: th.primary, lw: 3 })); });
      sg.forEach((s, i) => E.push(k.t(`stages.${i}.note`, { x: cx(i) - slot / 2 + 12, y: 566, w: slot - 24, h: 76, ph: '机会点', size: 13, align: 'center', color: th.muted, lh: 1.5 })));
      foot(k, c); return E;
    }
    E.push(k.im('img', { x: 80, y: 160, w: 400, h: 494, ph: ph(d, 'img', '人物照片'), fit: d.fit || 'cover', r: Math.min(st.radius, 12) }));
    E.push(k.t('name', { x: 520, y: 160, w: 680, h: 44, ph: '名字，年龄', size: 30, weight: 800, font: 'd' }));
    E.push(k.t('profile', { x: 520, y: 208, w: 680, h: 24, ph: '职业 / 城市 / 生活状态', size: 15, color: th.muted }));
    chips(k, 520, 246, 680, splitTags(d.tags).slice(0, 6), 13);
    E.push(R({ x: 520, y: 300, w: 680, h: 104, fill: th.surface, r: Math.min(st.radius, 8) }));
    E.push(R({ x: 520, y: 300, w: 6, h: 104, fill: th.primary }));
    E.push(k.t('quote', { x: 548, y: 300, w: 630, h: 104, valign: 'middle', ph: '一句典型原话', size: 19, lh: 1.55, font: 'd' }));
    [['needs', '需求', 520], ['pains', '痛点', 880]].forEach(([key, lab, x]) => {
      E.push(T({ x, y: 430, w: 300, h: 22, value: lab, size: 14, weight: 700, color: key === 'needs' ? th.primaryInk : th.muted, editable: false }));
      (d[key] || []).forEach((it, i) => {
        const y = 462 + i * 48;
        E.push(EL({ x, y: y + 8, w: 7, h: 7, fill: key === 'needs' ? th.primary : th.muted }));
        E.push(k.t(`${key}.${i}.t`, { x: x + 18, y, w: 302, h: 44, ph: lab, size: 15, lh: 1.45 }));
      });
    });
    foot(k, c); return E;
  }
};
L.selling = {
  name: '产品卖点', desc: '产品居中环绕卖点、卖点网格或参数说明',
  variants: [['hero', '产品环绕'], ['grid', '卖点网格'], ['spec', '参数说明'], ['keywords', '关键词大字'], ['bigword', '一字定调'], ['formula', '卖点公式']],
  imageFit: true,
  toggles: [['images', '卖点配图', d => d.variant === 'grid']],
  lists: [
    { key: 'points', label: '卖点', min: 2, max: 6, fields: [['k', '卖点', 80], ['d', '说明']], make: () => ({ k: '卖点', d: '一句说明' }), when: d => d.variant === 'hero' || d.variant === 'bigword' },
    { key: 'words', label: '关键词', min: 2, max: 4, fields: [['w', '关键词', 70], ['en', '英文', 80], ['d', '说明']], make: () => ({ w: '词', en: '', d: '' }), when: d => d.variant === 'keywords' },
    { key: 'parts', label: '公式项', min: 2, max: 4, fields: [['k', '卖点', 80], ['d', '说明']], make: () => ({ k: '卖点', d: '' }), when: d => d.variant === 'formula' },
    { key: 'items', label: '卖点', min: 2, max: 4, fields: [['k', '卖点', 80], ['d', '说明']], make: () => ({ img: null, k: '卖点', d: '一句说明' }), when: d => d.variant === 'grid' },
    { key: 'specs', label: '参数', min: 0, max: 6, fields: [['k', '参数', 80], ['v', '数值']], make: () => ({ k: '参数', v: '数值' }), when: d => d.variant === 'spec' },
  ],
  defaults: () => ({ variant: 'hero', title: '产品卖点', usp: '一句话说清最大的卖点', img: null, fit: 'contain', images: true,
    points: [{ k: '产地鲜萃', d: '核心产区鲜叶，当季萃取' }, { k: '0 糖 0 卡', d: '清爽无负担，日常放心喝' }, { k: '冷泡工艺', d: '低温慢萃，回甘不苦涩' }, { k: '轻巧瓶身', d: '单手可握，通勤随身带' }],
    items: [{ img: null, k: '少油', d: '空气循环加热，减少约八成用油' }, { img: null, k: '大容量', d: '一次做够三口之家的晚餐' }, { img: null, k: '一键菜单', d: '12 种预设，新手也不失手' }],
    specs: [{ k: '容量', v: '5.5 L' }, { k: '功率', v: '1500 W' }, { k: '温度', v: '80–200 ℃' }, { k: '预设菜单', v: '12 种' }],
    words: [{ w: '鲜', en: 'FRESH', d: '核心产区鲜叶，当季采摘当季萃取。' }, { w: '轻', en: 'LIGHT', d: '0 糖 0 卡，清爽没有负担。' }, { w: '醇', en: 'MELLOW', d: '低温冷泡，回甘不苦涩。' }],
    word: '鲜', wordEn: 'FRESH',
    parts: [{ k: '产地鲜叶', d: '核心产区当季采摘' }, { k: '冷泡工艺', d: '低温慢萃 8 小时' }, { k: '0 糖 0 卡', d: '清爽没有负担' }], result: '一口山野清晨', resultD: '鲜、轻、醇，一次喝到' }),
  build(k, c) {
    const { E, th, d, st } = k;
    if (d.variant === 'bigword') return bigwordPage(k, c);
    if (d.variant === 'keywords') { head(k, c); return keywordsPage(k, c); }
    if (d.variant === 'formula') { head(k, c); return formulaPage(k, c); }
    if (d.variant === 'spec') {
      E.push(k.im('img', { x: 0, y: 0, w: 600, h: H, ph: ph(d, 'img', '产品图（建议透明底 PNG）'), fit: d.fit || 'contain' }));
      if (st.decor === 'seal') E.push(R({ x: 680, y: 101, w: 11, h: 11, fill: th.seal }));
      E.push(k.t('eyebrow', { x: st.decor === 'seal' ? 700 : 680, y: 96, w: 500, h: 20, value: d.eyebrow ?? c.autoEyebrow, ph: '眉标', size: 13, weight: 700, color: th.primaryInk, ls: 2, font: st.eyebrowMono ? 'm' : 'b' }));
      E.push(k.t('title', { x: 680, y: 124, w: 520, h: 56, ph: '产品名称', size: Math.round(36 * (st.titleBoost || 1)), weight: 800, font: 'd' }));
      E.push(k.t('usp', { x: 680, y: 200, w: 520, h: 150, ph: '一句话说清最大的卖点', size: 28, weight: 700, font: 'd', lh: 1.45, color: th.primaryInk }));
      const sp = d.specs || [], n = Math.max(sp.length, 1), rh = Math.min(54, 290 / n);
      sp.forEach((p, i) => { const y = 380 + i * rh; E.push(LN(680, y, 1200, y, th.line, 1)); E.push(k.t(`specs.${i}.k`, { x: 680, y: y + 14, w: 160, h: rh - 20, ph: '参数', size: 14, color: th.muted })); E.push(k.t(`specs.${i}.v`, { x: 850, y: y + 11, w: 350, h: rh - 16, ph: '数值', size: 18, weight: 700 })); });
      E.push(T({ x: 1100, y: 686, w: 100, h: 18, value: pad2(c.pageNo), size: 12, color: th.muted, align: 'right', editable: false }));
      return E;
    }
    head(k, c);
    if (d.variant === 'grid') {
      const items = d.items || [], n = Math.max(items.length, 1), gap = 20, cw = (1120 - gap * (n - 1)) / n, y = 164, show = d.images;
      items.forEach((it, i) => {
        const x = 80 + i * (cw + gap), ny = show ? y + 226 : y + 40;
        E.push(R({ x, y, w: cw, h: 490, fill: th.surface, r: st.radius }));
        if (show) E.push(k.im(`items.${i}.img`, { x: x + 16, y: y + 16, w: cw - 32, h: 194, ph: it.hint || '卖点配图', r: Math.min(st.radius, 12) }));
        E.push(T({ x: x + 24, y: ny, w: 120, h: 52, value: pad2(i + 1), size: 42, weight: 900, font: 'd', color: th.inkOnSurface, lh: 1.1, editable: false }));
        E.push(k.t(`items.${i}.k`, { x: x + 24, y: ny + 62, w: cw - 48, h: 36, ph: '卖点', size: 23, weight: 700, font: 'd' }));
        E.push(k.t(`items.${i}.d`, { x: x + 24, y: ny + 106, w: cw - 48, h: y + 470 - (ny + 106), ph: '一句说明', size: 15, color: th.mutedOnSurface, lh: 1.6 }));
      });
      foot(k, c); return E;
    }
    E.push(EL({ x: 470, y: 196, w: 340, h: 340, fill: th.surface }));
    E.push(k.im('img', { x: 430, y: 150, w: 420, h: 510, ph: ph(d, 'img', '产品图（建议透明底 PNG）'), fit: d.fit || 'contain' }));
    const pts = d.points || [], half = Math.ceil(pts.length / 2), sides = [pts.slice(0, half), pts.slice(half)];
    sides.forEach((list, sIdx) => {
      const x = sIdx ? 880 : 80, w = 320, rows = Math.max(list.length, 1), bh = Math.min(150, 470 / rows), y0 = 172 + (470 - rows * bh) / 2;
      list.forEach((p, j) => {
        const i = sIdx ? half + j : j, y = y0 + j * bh;
        E.push(EL({ x, y, w: 44, h: 44, fill: th.primary }));
        E.push(T({ x, y, w: 44, h: 44, value: String(i + 1), size: 18, weight: 900, color: th.onPrimary, align: 'center', valign: 'middle', editable: false }));
        E.push(k.t(`points.${i}.k`, { x: x + 60, y: y + 4, w: w - 60, h: 32, ph: '卖点', size: 21, weight: 700, font: 'd' }));
        E.push(k.t(`points.${i}.d`, { x: x + 60, y: y + 40, w: w - 60, h: bh - 50, ph: '一句说明', size: 14, color: th.muted, lh: 1.55 }));
      });
    });
    foot(k, c); return E;
  }
};
/* ---- 1.7: pages from platform pitch decks (招商通案 / 营销通案 / 企业介绍 / VI) ---- */
const pill = (k, cx, y, text, o = {}) => {             // a rounded tag centred on cx; returns its width
  const { E, th, st } = k, size = o.size || 14, f = resolveFont({ font: 'b', weight: 700 }, st), h = o.h || size + 16;
  const w = Math.min(o.maxW || 400, Math.ceil(textW(text || ' ', f.fk, f.weight, size, 0)) + (o.pad || 28));
  const fill = o.fill || th.primary, col = o.color || onColor(fill), x = clamp(cx - w / 2, o.x0 ?? 80, (o.x1 ?? 1200) - w);
  E.push(R({ x, y, w, h, fill, r: h / 2, flat: o.flat }));
  E.push(o.bind ? k.t(o.bind, { value: o.value ?? text, x: x + 8, y, w: w - 16, h, size, weight: 700, align: 'center', valign: 'middle', color: col, ph: o.ph || '标签' }) : T({ x: x + 8, y, w: w - 16, h, value: text, size, weight: 700, align: 'center', valign: 'middle', color: col, editable: false }));
  return { x, w, h };
};
const yes = v => /^(y|yes|是|有|✓|√|●|1|true)$/i.test(String(v || '').trim());
const no = v => /^(n|no|否|无|×|x|-|—|0|false)?$/i.test(String(v || '').trim());
function phone(k, x, y, w, path, phText) {                // a phone frame with a screen image; returns its height
  const { E } = k, h = Math.round(w * 2.04), r = Math.round(w * .13);
  E.push(R({ x, y, w, h, fill: '#18181B', r, flat: true }));
  E.push(k.im(path, { x: x + 6, y: y + 6, w: w - 12, h: h - 12, r: Math.max(4, r - 6), ph: phText || '界面截图', fit: 'cover' }));
  return h;
}

L.roadmap = {
  name: '排期 / 路线图', desc: '分阶段的甘特排期、阶段路线图',
  variants: [['gantt', '甘特排期'], ['phases', '阶段路线']],
  fields: [['bigday', '关键节点（如 BIGDAY 1/1，可空）', d => d.variant === 'gantt'], ['bigdayAt', '节点在第几阶段结束处', d => d.variant === 'gantt']],
  lists: [
    { key: 'phases', label: '阶段', min: 2, max: 5, fields: [['t', '阶段', 70], ['date', '时间', 96], ['items', '事项（用 / 分隔）']], make: () => ({ t: '阶段', date: '', items: '' }) },
    { key: 'bars', label: '排期条（行名相同的排在同一行；起止为阶段序号）', min: 1, max: 18, fields: [['row', '行', 56], ['t', '内容'], ['from', '起', 34], ['to', '止', 34]], make: () => ({ row: '官号', t: '内容', from: '1', to: '1' }), when: d => d.variant === 'gantt' },
  ],
  defaults: () => ({ variant: 'gantt', title: '活动排期', sub: '', bigday: '', bigdayAt: '',
    phases: [{ t: '预热期', date: '12.01–12.19', items: '官宣海报 / 话题上线 / 达人预告' }, { t: '爆发期', date: '12.20–01.01', items: '主题活动 / 线下快闪 / 开屏资源' }, { t: '收尾期', date: '01.01–01.20', items: '优质笔记沉淀 / 数据复盘' }],
    bars: [{ row: '官号', t: '官宣主题与玩法', from: '1', to: '1' }, { row: '官号', t: '每日话题与福利', from: '2', to: '3' }, { row: '达人', t: '头部达人预告', from: '1', to: '2' }, { row: '达人', t: '腰部达人铺量', from: '2', to: '3' }, { row: '线下', t: '城市快闪', from: '2', to: '2' }, { row: '资源', t: '开屏 + 信息流', from: '2', to: '2' }, { row: '资源', t: '搜索彩蛋', from: '1', to: '3' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    const ps = (d.phases || []).slice(0, 5), n = Math.max(ps.length, 1);
    if (d.variant === 'phases') {
      const gap = 28, cw = (1120 - (n - 1) * gap) / n;
      ps.forEach((p, i) => {
        const x = 80 + i * (cw + gap);
        const shape = st.radius >= 10 || st.decor === 'rings' ? EL : R;
        E.push(shape({ x, y: 162, w: 44, h: 44, fill: th.primary, r: st.radius }));
        E.push(T({ x, y: 162, w: 44, h: 44, value: String(i + 1), size: 22, weight: 900, font: 'd', color: th.onPrimary, align: 'center', valign: 'middle', editable: false }));
        if (i < n - 1) E.push(PG({ pts: [[x + cw + gap / 2 - 5, 176], [x + cw + gap / 2 + 5, 184], [x + cw + gap / 2 - 5, 192]], fill: th.line }));
        E.push(LN(x + 56, 184, x + cw, 184, th.line, 1));
        E.push(k.t(`phases.${i}.t`, { x, y: 218, w: cw, h: 40, ph: '阶段', size: 28, weight: 900, font: 'd', color: th.primaryBig }));
        E.push(k.t(`phases.${i}.date`, { x, y: 260, w: cw, h: 22, ph: '时间（可空）', size: 14, color: th.muted, font: st.decor === 'grid' ? 'm' : 'b' }));
        splitTags(p.items).slice(0, 6).forEach((t, j) => {
          const y = 298 + j * 46;
          E.push(R({ x, y, w: cw, h: 38, fill: th.surface, r: Math.min(19, st.radius + 4) }));
          E.push(T({ x: x + 12, y, w: cw - 24, h: 38, value: t, size: 15, weight: 500, align: 'center', valign: 'middle', editable: false }));
        });
      });
      if (d.sub || c.edit) {
        E.push(R({ x: 80, y: 590, w: 1120, h: 56, fill: th.primary, r: Math.min(28, st.radius + 8) }));
        E.push(k.t('sub', { x: 112, y: 590, w: 1056, h: 56, valign: 'middle', align: 'center', ph: '贯穿全程的动作，如「官方账号、话题页、搜索彩蛋全程联动」（可留空）', size: 17, weight: 700, color: th.onPrimary }));
      }
      foot(k, c); return E;
    }
    const X0 = 216, X1 = 1200, pw = (X1 - X0) / n, Y0 = 160;
    ps.forEach((p, i) => {
      const x = X0 + i * pw + 3, w = pw - 6;
      E.push(R({ x, y: Y0, w, h: 54, fill: th.primary, r: st.radius }));
      E.push(k.t(`phases.${i}.t`, { x: x + 8, y: Y0 + 5, w: w - 16, h: 24, ph: '阶段', size: 17, weight: 700, align: 'center', color: th.onPrimary }));
      E.push(k.t(`phases.${i}.date`, { x: x + 8, y: Y0 + 30, w: w - 16, h: 18, ph: '时间', size: 12, align: 'center', color: th.onPrimary }));
    });
    const bars = (d.bars || []).map((b, i) => ({ ...b, i, f: clamp(num(b.from) || 1, 1, n), t2: clamp(num(b.to) || num(b.from) || 1, 1, n) })).map(b => ({ ...b, t2: Math.max(b.f, b.t2) }));
    const lanes = []; bars.forEach(b => { const r = String(b.row || '').trim() || '—'; let ln = lanes.find(x => x.name === r); if (!ln) { if (lanes.length >= 6) return; ln = { name: r, bars: [] }; lanes.push(ln); } ln.bars.push(b); });
    lanes.forEach(ln => { const ends = []; ln.bars.sort((a, b) => a.f - b.f).forEach(b => { let t = ends.findIndex(e => e < b.f); if (t < 0) { t = ends.length; ends.push(0); } ends[t] = b.t2; b.track = t; }); ln.tracks = Math.max(1, ends.length); });
    const tracks = lanes.reduce((a, l) => a + l.tracks, 0) || 1, LY0 = 230, avail = 640 - LY0 - lanes.length * 10, th0 = clamp(avail / tracks, 26, 40), bh = th0 - 8;
    let y = LY0; const at = num(d.bigdayAt), yEnd = LY0 + tracks * th0 + lanes.length * 10, xb = X0 + at * pw, big = d.bigday && at >= 1 && at <= n;
    if (big) E.push(LN(xb, Y0 + 56, xb, yEnd, th.primaryInk, 2));
    for (let i = 1; i < n; i++) E.push(LN(X0 + i * pw, LY0, X0 + i * pw, LY0 + tracks * th0 + lanes.length * 10, th.line, 1));
    lanes.forEach((ln, li) => {
      const lh = ln.tracks * th0 + 4;
      E.push(R({ x: 80, y, w: 124, h: lh, fill: th.surface, r: st.radius }));
      E.push(T({ x: 86, y, w: 112, h: lh, value: ln.name, size: 16, weight: 700, align: 'center', valign: 'middle', color: th.inkOnSurface, editable: false }));
      ln.bars.forEach(b => {
        const bx = X0 + (b.f - 1) * pw + 6, bw = (b.t2 - b.f + 1) * pw - 12, by = y + 2 + b.track * th0;
        E.push(R({ x: bx, y: by, w: bw, h: bh, fill: li % 2 ? th.surface2 : th.surface, line: th.primary, lw: 1, r: Math.min(bh / 2, st.radius + 6), flat: true }));
        E.push(k.t(`bars.${b.i}.t`, { x: bx + 8, y: by, w: bw - 16, h: bh, ph: '内容', size: bh > 24 ? 14 : 12, weight: 500, align: 'center', valign: 'middle' }));
      });
      y += lh + 6;
      if (li < lanes.length - 1) E.push(LN(80, y - 3, 1200, y - 3, th.line, 1, { op: .7 }));
    });
    if (big) pill(k, xb, Math.min(y + 4, 646), d.bigday, { size: 13, h: 26, bind: 'bigday', maxW: 220 });
    foot(k, c); return E;
  }
};

L.package = {
  name: '招商权益', desc: '合作档位与权益明细',
  variants: [['tiers', '权益档位'], ['matrix', '权益明细表']],
  toggles: [['hot', '突出第一档', d => d.variant === 'tiers']],
  fields: [['h1', '档位 1', d => d.variant === 'matrix'], ['h2', '档位 2', d => d.variant === 'matrix'], ['h3', '档位 3（可空）', d => d.variant === 'matrix'], ['h4', '档位 4（可空）', d => d.variant === 'matrix'], ['note', '页脚备注（可空）']],
  lists: [
    { key: 'tiers', label: '档位', min: 2, max: 4, fields: [['name', '档位', 70], ['price', '价格', 70], ['rights', '权益（用 / 分隔）']], make: () => ({ name: '合作伙伴', price: '', rights: '权益 / 权益', tag: '' }), when: d => d.variant === 'tiers' },
    { key: 'rows', label: '权益行（是 / 否，或写数量）', min: 2, max: 9, fields: [['name', '权益'], ['a', '档 1', 50], ['b', '档 2', 50], ['c', '档 3', 50], ['e', '档 4', 50]], make: () => ({ name: '权益', a: '是', b: '是', c: '', e: '' }), when: d => d.variant === 'matrix' },
  ],
  defaults: () => ({ variant: 'tiers', title: '合作权益', hot: true, note: '*以上仅供参考，具体以实际执行为准', h1: '冠名', h2: '特约', h3: '合作', h4: '',
    tiers: [{ name: '独家冠名', price: '500 万', rights: '活动命名权 / 开屏 3 天 / 定制话题页 / 头部达人 10 位 / 线下主会场', tag: '限 1 席' }, { name: '特约合作', price: '200 万', rights: '联合露出 / 开屏 1 天 / 话题页品牌位 / 达人 5 位', tag: '限 3 席' }, { name: '品类合作', price: '80 万', rights: '品类专区 / 信息流 / 达人 2 位', tag: '' }],
    rows: [{ name: '活动命名权', a: '是', b: '否', c: '否', e: '' }, { name: '开屏资源', a: '3 天', b: '1 天', c: '否', e: '' }, { name: '定制话题页', a: '是', b: '品牌位', c: '否', e: '' }, { name: '达人合作', a: '10 位', b: '5 位', c: '2 位', e: '' }, { name: '线下快闪露出', a: '主会场', b: '分会场', c: '否', e: '' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    if (d.variant === 'matrix') {
      const hs = [d.h1, d.h2, d.h3, d.h4], keys = ['a', 'b', 'c', 'e'], cols = Math.max(1, hs.filter((h, i) => i < 2 || h).length);
      const rows = d.rows || [], n = Math.max(rows.length, 1), c0 = 330, cw = (1120 - c0) / cols, rh = Math.min(54, 420 / n), y0 = 166;
      E.push(R({ x: 80, y: y0, w: 1120, h: 52, fill: th.primary, r: st.radius }));
      E.push(T({ x: 104, y: y0, w: c0 - 40, h: 52, value: '权益', size: 16, weight: 700, valign: 'middle', color: th.onPrimary, editable: false }));
      for (let j = 0; j < cols; j++) E.push(k.t('h' + (j + 1), { x: 80 + c0 + j * cw + 8, y: y0, w: cw - 16, h: 52, ph: '档位', size: 18, weight: 700, align: 'center', valign: 'middle', color: th.onPrimary }));
      rows.forEach((r, i) => {
        const y = y0 + 52 + i * rh;
        if (i % 2) E.push(R({ x: 80, y, w: 1120, h: rh, fill: th.surface, flat: true }));
        E.push(k.t(`rows.${i}.name`, { x: 104, y, w: c0 - 40, h: rh, ph: '权益', size: 16, weight: 700, valign: 'middle' }));
        for (let j = 0; j < cols; j++) {
          const v = r[keys[j]], cx = 80 + c0 + j * cw;
          if (yes(v)) E.push(EL({ x: cx + cw / 2 - 8, y: y + rh / 2 - 8, w: 16, h: 16, fill: th.primary }));
          else if (no(v)) E.push(T({ x: cx + 8, y, w: cw - 16, h: rh, value: '—', size: 16, color: i % 2 ? th.mutedOnSurface : th.muted, align: 'center', valign: 'middle', editable: false }));
          else E.push(k.t(`rows.${i}.${keys[j]}`, { x: cx + 8, y, w: cw - 16, h: rh, ph: '', size: 15, weight: 500, align: 'center', valign: 'middle' }));
        }
      });
      E.push(LN(80, y0 + 52 + n * rh, 1200, y0 + 52 + n * rh, th.line, 1));
      E.push(k.t('note', { x: 80, y: 650, w: 1000, h: 20, ph: '备注（可空）', size: 12, color: th.muted }));
      foot(k, c); return E;
    }
    const ts = (d.tiers || []).slice(0, 4), n = Math.max(ts.length, 1), gap = 24, cw = (1120 - (n - 1) * gap) / n, y0 = 164, ch = 458;
    ts.forEach((t, i) => {
      const x = 80 + i * (cw + gap), hot = d.hot && i === 0;
      E.push(R({ x, y: y0, w: cw, h: ch, fill: th.surface, r: st.radius, line: hot ? th.primary : null, lw: 2 }));
      E.push(R({ x, y: y0, w: cw, h: 66, fill: hot ? th.primary : th.surface2, r: st.radius }));
      E.push(k.t(`tiers.${i}.name`, { x: x + 16, y: y0, w: cw - 32, h: 66, ph: '档位', size: 24, weight: 800, font: 'd', align: 'center', valign: 'middle', color: hot ? th.onPrimary : th.text }));
      E.push(k.t(`tiers.${i}.price`, { x: x + 16, y: y0 + 84, w: cw - 32, h: 52, ph: '价格（可空）', size: 36, weight: 900, font: 'd', align: 'center', valign: 'middle', color: th.inkOnSurface }));
      if (t.tag || c.edit) E.push(k.t(`tiers.${i}.tag`, { x: x + 16, y: y0 + 138, w: cw - 32, h: 22, ph: '席位说明（可空）', size: 13, align: 'center', color: th.mutedOnSurface }));
      E.push(LN(x + 24, y0 + 172, x + cw - 24, y0 + 172, th.line, 1));
      splitTags(t.rights).slice(0, 7).forEach((r, j) => {
        const y = y0 + 188 + j * 38;
        E.push(EL({ x: x + 24, y: y + 11, w: 8, h: 8, fill: th.primary }));
        E.push(T({ x: x + 42, y, w: cw - 62, h: 30, value: r, size: 15, valign: 'middle', editable: false }));
      });
    });
    E.push(k.t('note', { x: 80, y: 640, w: 1000, h: 20, ph: '备注（可空）', size: 12, color: th.muted }));
    foot(k, c); return E;
  }
};

L.case = {
  name: '案例页', desc: '案例拆解与成绩复盘',
  variants: [['steps', '案例拆解'], ['result', '成绩复盘']],
  imageFit: false,
  toggles: [['images', '每列配图', d => d.variant === 'steps']],
  lists: [
    { key: 'cols', label: '拆解步骤', min: 2, max: 4, fields: [['k', '步骤', 80], ['d', '说明']], make: () => ({ img: null, k: '步骤', d: '一句说明' }), when: d => d.variant === 'steps' },
    { key: 'results', label: '成绩', min: 0, max: 4, fields: [['value', '数值', 60], ['unit', '单位', 44], ['label', '说明']], make: () => ({ value: '100', unit: '%', label: '指标' }) },
    { key: 'images', label: '图片', min: 1, max: 3, fields: [['cap', '说明']], make: () => ({ img: null, cap: '' }), when: d => d.variant === 'result' },
  ],
  defaults: () => ({ variant: 'steps', title: '案例详解', sub: '', images: true,
    cols: [{ img: null, k: '科学洞察', d: '从搜索与笔记里找到用户真实的痛点' }, { img: null, k: '目标设定', d: '锁定核心人群，再向外破圈' }, { img: null, k: '内容投放', d: '达人种草 + 信息流 + 搜索三路并进' }, { img: null, k: '诊断度量', d: '按周复盘，持续优化内容与投放' }],
    results: [{ value: '90', unit: '%', label: '新客占比' }, { value: '第一', unit: '', label: '上市首月品类销量' }, { value: '500', unit: '%', label: '全域销售提升' }],
    images: [{ img: null, cap: '' }, { img: null, cap: '' }, { img: null, cap: '' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    const rs = (d.results || []).slice(0, 4);
    if (d.variant === 'result') {
      const im = (d.images || []).slice(0, 3);
      if (im.length >= 2) {
        E.push(k.im('images.0.img', { x: 80, y: 164, w: 340, h: 476, ph: '活动现场 / 主图', r: st.radius }));
        const hh = im.length === 3 ? 230 : 476;
        E.push(k.im('images.1.img', { x: 436, y: 164, w: 204, h: hh, ph: '图片', r: st.radius }));
        if (im.length === 3) E.push(k.im('images.2.img', { x: 436, y: 410, w: 204, h: 230, ph: '图片', r: st.radius }));
      } else E.push(k.im('images.0.img', { x: 80, y: 164, w: 560, h: 476, ph: '活动现场 / 主图', r: st.radius }));
      const n = Math.max(rs.length, 1), D = n <= 2 ? 200 : 170, cols = n === 1 ? 1 : 2, rows = Math.ceil(n / cols);
      rs.forEach((r, i) => {
        const col = i % cols, row = Math.floor(i / cols), last = i === n - 1 && n % 2 === 1 && n > 1;
        const cx = last ? 940 : (cols === 1 ? 940 : 820 + col * 240), cy = rows === 1 ? 380 : 270 + row * 230;
        E.push(EL({ x: cx - D / 2, y: cy - D / 2, w: D, h: D, fill: th.primary }));
        E.push(T({ x: cx - D / 2 + 12, y: cy - 40, w: D - 24, h: 54, valign: 'bottom', align: 'center', lh: 1.1, runs: [
          { bind: `results.${i}.value`, value: r.value ?? '', ph: '0', size: D > 180 ? 50 : 42, weight: 900, font: 'd', color: th.onPrimary },
          { bind: `results.${i}.unit`, value: r.unit ?? '', ph: '', size: 18, weight: 700, color: th.onPrimary }] }));
        E.push(k.t(`results.${i}.label`, { x: cx - D / 2 + 18, y: cy + 18, w: D - 36, h: 40, ph: '指标', size: 15, weight: 700, align: 'center', color: th.onPrimary, lh: 1.3 }));
      });
      if (d.sub || c.edit) E.push(k.t('sub', { x: 680, y: 612, w: 520, h: 30, ph: '一句总结（可留空）', size: 15, color: th.muted, align: 'center' }));
      foot(k, c); return E;
    }
    const cl = (d.cols || []).slice(0, 4), n = Math.max(cl.length, 1), gap = 16, cw = (1120 - (n - 1) * gap) / n, y0 = 160, hasR = rs.length > 0, ch = hasR ? 380 : 480;
    cl.forEach((p, i) => {
      const x = 80 + i * (cw + gap);
      E.push(R({ x, y: y0, w: cw, h: ch, fill: th.surface, r: st.radius }));
      E.push(k.t(`cols.${i}.k`, { x: x + 20, y: y0 + 18, w: cw - 40, h: 32, ph: '步骤', size: 22, weight: 800, align: 'center', color: th.inkOnSurface, font: 'd' }));
      E.push(k.t(`cols.${i}.d`, { x: x + 20, y: y0 + 58, w: cw - 40, h: d.images ? 70 : ch - 80, ph: '说明', size: 14, color: th.mutedOnSurface, lh: 1.6, align: d.images ? 'left' : 'center' }));
      if (d.images) E.push(k.im(`cols.${i}.img`, { x: x + 16, y: y0 + 140, w: cw - 32, h: ch - 156, ph: '过程图 / 截图', r: Math.max(0, st.radius - 2) }));
    });
    if (hasR) {
      const by = 556, bh = 92, sl = 1120 / rs.length;
      E.push(R({ x: 80, y: by, w: 1120, h: bh, fill: th.primary, r: st.radius }));
      rs.forEach((r, i) => {
        const x = 80 + i * sl;
        if (i) E.push(LN(x, by + 20, x, by + bh - 20, th.onPrimary, 1, { op: .35 }));
        E.push(T({ x: x + 20, y: by + 6, w: sl - 40, h: 52, valign: 'bottom', align: 'center', lh: 1.1, runs: [
          { bind: `results.${i}.value`, value: r.value ?? '', ph: '0', size: 40, weight: 900, font: 'd', color: th.onPrimary },
          { bind: `results.${i}.unit`, value: r.unit ?? '', ph: '', size: 18, weight: 700, color: th.onPrimary }] }));
        E.push(k.t(`results.${i}.label`, { x: x + 20, y: by + 60, w: sl - 40, h: 22, ph: '指标', size: 14, align: 'center', color: th.onPrimary }));
      });
    }
    foot(k, c); return E;
  }
};

L.screens = {
  name: '界面 / 资源位', desc: '手机界面、资源位与互动页面展示',
  variants: [['row', '资源位一排'], ['detail', '界面标注']],
  toggles: [['two', '两部手机', d => d.variant === 'detail']],
  lists: [
    { key: 'items', label: '资源位', min: 2, max: 5, fields: [['tag', '名称', 80], ['cap', '说明']], make: () => ({ img: null, tag: '资源位', cap: '' }), when: d => d.variant === 'row' },
    { key: 'notes', label: '标注', min: 2, max: 9, fields: [['t', '要点', 90], ['d', '说明']], make: () => ({ t: '要点', d: '' }), when: d => d.variant === 'detail' },
  ],
  defaults: () => ({ variant: 'row', title: '黄金资源', sub: '', two: true, img: null, img2: null,
    items: [{ img: null, tag: '开屏', cap: '活动当天全量曝光' }, { img: null, tag: '定制话题页', cap: '品牌专属活动聚合页' }, { img: null, tag: '信息流', cap: '原生内容精准触达' }, { img: null, tag: '搜索彩蛋', cap: '搜索关键词触发品牌彩蛋' }],
    notes: [{ t: '主 KV', d: '活动主题与品牌露出' }, { t: '许愿入口', d: '一键发布心愿笔记' }, { t: '品牌任务', d: '完成任务领取福利' }, { t: '排行榜', d: '实时展示热门心愿' }, { t: '兑换页', d: '跳转品牌店铺' }] }),
  build(k, c) {
    const { E, th, d, st } = k; head(k, c);
    if (d.variant === 'detail') {
      const two = d.two !== false, pw = 196, ph0 = Math.round(pw * 2.04), py = 164, xs = two ? [100, 340] : [210];
      E.push(R({ x: 80, y: 150, w: two ? 500 : 400, h: 500, fill: th.surface, r: st.radius }));
      const h1 = phone(k, xs[0], py, pw, 'img', '界面截图 1'); if (two) phone(k, xs[1], py, pw, 'img2', '界面截图 2');
      const ns = (d.notes || []).slice(0, 9), n = Math.max(ns.length, 1), half = two ? Math.ceil(n / 2) : n;
      ns.forEach((p, i) => {
        const onP = two && i >= half ? 1 : 0, j = onP ? i - half : i, m = onP ? n - half : half;
        const cy = py + 40 + (h1 - 80) * (m > 1 ? j / (m - 1) : .5), cx = xs[onP] + pw;
        E.push(EL({ x: cx - 15, y: cy - 15, w: 30, h: 30, fill: th.primary }));
        E.push(T({ x: cx - 15, y: cy - 15, w: 30, h: 30, value: String(i + 1), size: 14, weight: 700, color: th.onPrimary, align: 'center', valign: 'middle', editable: false }));
      });
      const x0 = two ? 640 : 560, w = 1200 - x0, rh = Math.min(64, 470 / n);
      ns.forEach((p, i) => {
        const y = 164 + i * rh;
        E.push(EL({ x: x0, y: y + 4, w: 28, h: 28, fill: th.primary }));
        E.push(T({ x: x0, y: y + 4, w: 28, h: 28, value: String(i + 1), size: 13, weight: 700, color: th.onPrimary, align: 'center', valign: 'middle', editable: false }));
        E.push(k.t(`notes.${i}.t`, { x: x0 + 44, y: y + 4, w: 200, h: 28, ph: '要点', size: 17, weight: 700, valign: 'middle' }));
        E.push(k.t(`notes.${i}.d`, { x: x0 + 250, y: y + 4, w: w - 250, h: Math.max(28, rh - 10), ph: '说明', size: 14, color: th.muted, lh: 1.45, valign: rh > 50 ? 'top' : 'middle' }));
        if (i < n - 1) E.push(LN(x0 + 44, y + rh - 3, 1200, y + rh - 3, th.line, 1));
      });
      foot(k, c); return E;
    }
    const it = (d.items || []).slice(0, 5), n = Math.max(it.length, 1), slot = 1120 / n, pw = Math.min(188, slot - 44), ph0 = Math.round(pw * 2.04), py = Math.max(206, 214 + (384 - ph0) / 2);
    it.forEach((p, i) => {
      const cx = 80 + slot * (i + .5);
      pill(k, cx, 160, p.tag, { size: 15, h: 32, bind: `items.${i}.tag`, maxW: slot - 16, x0: 80 + slot * i + 4, x1: 80 + slot * (i + 1) - 4 });
      phone(k, cx - pw / 2, py, pw, `items.${i}.img`, '界面截图');
      E.push(k.t(`items.${i}.cap`, { x: cx - slot / 2 + 10, y: py + ph0 + 12, w: slot - 20, h: 40, ph: '一句说明', size: 13, color: th.muted, align: 'center', lh: 1.45 }));
    });
    foot(k, c); return E;
  }
};

L.logos = {
  name: '合作伙伴', desc: '合作品牌、客户与资质标志墙',
  variants: [['grid', '标志墙'], ['band', '金句 + 标志带']],
  lists: [{ key: 'items', label: '合作方', min: 2, max: 12, fields: [['name', '名称', 90], ['note', '说明']], make: () => ({ img: null, name: '合作方', note: '' }) }],
  defaults: () => ({ variant: 'grid', title: '战略合作伙伴', sub: '', statement: '与全球优质伙伴，共同把好品质这一关',
    items: [{ img: null, name: '合作方 A', note: '原料供应' }, { img: null, name: '合作方 B', note: '研发合作' }, { img: null, name: '合作方 C', note: '包材供应' }, { img: null, name: '合作方 D', note: '检测认证' }, { img: null, name: '合作方 E', note: '仓储物流' }, { img: null, name: '合作方 F', note: '渠道合作' }, { img: null, name: '合作方 G', note: '营养研究' }, { img: null, name: '合作方 H', note: '品质管理' }] }),
  build(k, c) {
    const { E, th, d, st } = k;
    const it = (d.items || []).slice(0, 12), n = Math.max(it.length, 1), plate = isDarkBg(th.surface);     // logos are drawn for white paper: give them a white plate on dark cards
    if (d.variant === 'band') {
      head(k, c);
      E.push(k.t('statement', { x: 80, y: 176, w: 1000, h: 130, ph: '一句话说明合作的意义', size: Math.round(40 * (st.titleBoost || 1)), weight: 800, font: 'd', lh: 1.4 }));
      E.push(k.t('sub', { x: 80, y: 316, w: 900, h: 56, ph: '补充说明（可留空）', size: 17, color: th.muted, lh: 1.6 }));
      const m = Math.min(n, 6), sl = 1120 / m;
      E.push(R({ x: 80, y: 420, w: 1120, h: 210, fill: th.surface, r: st.radius }));
      it.slice(0, 6).forEach((p, i) => {
        const x = 80 + i * sl;
        if (i) E.push(LN(x, 450, x, 600, th.line, 1));
        if (plate) E.push(R({ x: x + 14, y: 446, w: sl - 28, h: 102, fill: '#FFFFFF', r: Math.min(10, st.radius + 4), flat: true }));
        E.push(k.im(`items.${i}.img`, { x: x + 24, y: 452, w: sl - 48, h: 90, ph: '标志', fit: 'contain' }));
        E.push(k.t(`items.${i}.name`, { x: x + 10, y: 556, w: sl - 20, h: 24, ph: '名称', size: 15, weight: 700, align: 'center' }));
        E.push(k.t(`items.${i}.note`, { x: x + 10, y: 582, w: sl - 20, h: 20, ph: '', size: 12, align: 'center', color: th.mutedOnSurface }));
      });
      foot(k, c); return E;
    }
    head(k, c);
    if (d.sub || c.edit) E.push(k.t('sub', { x: 80, y: 136, w: 1120, h: 24, ph: '一句说明（可留空）', size: 15, color: th.muted, align: st.headAlign === 'center' ? 'center' : 'left' }));
    const cols = n <= 4 ? n : n <= 8 ? 4 : n === 9 ? 3 : 4, rows = Math.ceil(n / cols), gap = 16, cw = (1120 - (cols - 1) * gap) / cols, y0 = 176, ch = Math.min(220, (470 - (rows - 1) * gap) / rows);
    it.forEach((p, i) => {
      const x = 80 + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
      E.push(R({ x, y, w: cw, h: ch, fill: th.surface, r: st.radius }));
      if (plate) E.push(R({ x: x + 12, y: y + 10, w: cw - 24, h: ch - 68, fill: '#FFFFFF', r: Math.min(10, st.radius + 4), flat: true }));
      E.push(k.im(`items.${i}.img`, { x: x + 24, y: y + 14, w: cw - 48, h: ch - 76, ph: '标志', fit: 'contain' }));
      E.push(k.t(`items.${i}.name`, { x: x + 12, y: y + ch - 56, w: cw - 24, h: 24, ph: '名称', size: 15, weight: 700, align: 'center' }));
      E.push(k.t(`items.${i}.note`, { x: x + 12, y: y + ch - 30, w: cw - 24, h: 20, ph: '说明（可空）', size: 12, align: 'center', color: th.mutedOnSurface }));
    });
    foot(k, c); return E;
  }
};

const rgbOf = hx => hexToRgb(hx).join(' / ');
const cmykOf = hx => { const [r, g, b] = hexToRgb(hx).map(v => v / 255), K = 1 - Math.max(r, g, b); if (K >= 1) return '0 / 0 / 0 / 100'; return [(1 - r - K) / (1 - K), (1 - g - K) / (1 - K), (1 - b - K) / (1 - K), K].map(v => Math.round(v * 100)).join(' / '); };
const fontKey = v => { const s = String(v || '').trim(); if (FONTS[s]) return s; const f = Object.entries(FONTS).find(([, x]) => x.family === s || x.alias === s || x.alias.includes(s) && s.length >= 2); return f ? f[0] : 'sans'; };
L.vi = {
  name: 'VI 视觉规范', desc: '标志、标准色、字体与辅助图形',
  variants: [['logo', '标志'], ['colors', '标准色'], ['type', '标准字体'], ['graphics', '辅助图形']],
  imageFit: true,
  lists: [
    { key: 'colors', label: '标准色', min: 2, max: 6, fields: [['name', '名称', 80], ['hex', 'HEX', 76], ['note', '说明']], make: () => ({ name: '辅助色', hex: '#888888', note: '' }), when: d => d.variant === 'colors' },
    { key: 'fonts', label: '字体（填 sans / serif / brush / xiaowei / qingke / kuaile / mono / cond，或字体名）', min: 1, max: 3, fields: [['fk', '字体', 90], ['use', '用途']], make: () => ({ fk: 'sans', use: '正文' }), when: d => d.variant === 'type' },
    { key: 'items', label: '图形', min: 2, max: 6, fields: [['cap', '说明']], make: () => ({ img: null, cap: '' }), when: d => d.variant === 'graphics' },
    { key: 'points', label: '使用说明', min: 0, max: 4, fields: [['k', '要点', 80], ['d', '说明']], make: () => ({ k: '要点', d: '' }), when: d => d.variant === 'logo' },
  ],
  defaults: () => ({ variant: 'colors', title: '标准色', en: 'BRAND COLORS', intro: '', img: null, img2: null, sample: '好品质，看得见', fit: 'contain',
    colors: [{ name: '品牌红', hex: '#D7262F', note: '标志、标题与重点信息' }, { name: '深墨灰', hex: '#2B2B2B', note: '正文与线框' }, { name: '暖米白', hex: '#F4EFE6', note: '背景与留白' }, { name: '琥珀金', hex: '#E3A33B', note: '点缀，面积不超过 10%' }],
    fonts: [{ fk: 'sans', use: '标题与正文' }, { fk: 'serif', use: '品牌故事与长文' }],
    items: [{ img: null, cap: '' }, { img: null, cap: '' }, { img: null, cap: '' }, { img: null, cap: '' }, { img: null, cap: '' }, { img: null, cap: '' }],
    points: [{ k: '安全空间', d: '四周留出标志高度 1/4 的空白' }, { k: '最小尺寸', d: '印刷 15mm，屏幕 64px' }, { k: '反白使用', d: '深色或品牌色底上使用反白稿' }] }),
  build(k, c) {
    const { E, th, d, st } = k;
    const enLine = (x, y, w, align = 'left') => E.push(k.t('en', { x, y, w, h: 20, ph: 'ENGLISH', size: 13, color: th.muted, ls: 3, align }));
    if (d.variant === 'graphics') {
      head(k, c, 80, 520); enLine(80, 130, 520, st.headAlign === 'center' ? 'center' : 'left');
      E.push(k.t('intro', { x: 660, y: 74, w: 540, h: 76, ph: '一段说明：图形从何而来、如何使用（可留空）', size: 13, color: th.muted, lh: 1.6 }));
      const it = (d.items || []).slice(0, 6), n = Math.max(it.length, 1), cols = n <= 3 ? n : 3, rows = Math.ceil(n / cols), gap = 16, cw = (1120 - (cols - 1) * gap) / cols, ch = (476 - (rows - 1) * gap) / rows;
      it.forEach((p, i) => {
        const x = 80 + (i % cols) * (cw + gap), y = 166 + Math.floor(i / cols) * (ch + gap);
        E.push(R({ x, y, w: cw, h: ch, fill: th.surface, r: st.radius }));
        E.push(k.im(`items.${i}.img`, { x: x + 20, y: y + 16, w: cw - 40, h: ch - (p.cap || c.edit ? 52 : 32), ph: '辅助图形', fit: 'contain' }));
        if (p.cap || c.edit) E.push(k.t(`items.${i}.cap`, { x: x + 16, y: y + ch - 32, w: cw - 32, h: 20, ph: '说明（可空）', size: 12, align: 'center', color: th.mutedOnSurface }));
      });
      foot(k, c); return E;
    }
    head(k, c);
    if (d.variant === 'logo') {
      E.push(R({ x: 80, y: 160, w: 680, h: 480, fill: th.surface, r: st.radius }));
      const lg = asset(k.project, k.project.brand.logo);
      E.push(d.img || !lg ? k.im('img', { x: 160, y: 220, w: 520, h: 360, ph: '标志标准稿（建议透明底 PNG）', fit: 'contain' }) : IM({ x: 160, y: 220, w: 520, h: 360, src: lg.src, fit: 'contain', editable: false }));
      E.push(R({ x: 784, y: 160, w: 416, h: 200, fill: th.primary, r: st.radius }));
      E.push(d.img2 || !lg ? k.im('img2', { x: 834, y: 190, w: 316, h: 140, ph: '反白稿', fit: 'contain' }) : IM({ x: 834, y: 190, w: 316, h: 140, src: lg.light || lg.src, fit: 'contain', editable: false }));
      const ps = (d.points || []).slice(0, 4), rh = Math.min(70, 270 / Math.max(ps.length, 1));
      ps.forEach((p, i) => {
        const y = 380 + i * rh; E.push(LN(784, y, 1200, y, th.line, 1));
        E.push(k.t(`points.${i}.k`, { x: 784, y: y + 10, w: 416, h: 22, ph: '要点', size: 15, weight: 700, color: th.primaryInk }));
        E.push(k.t(`points.${i}.d`, { x: 784, y: y + 34, w: 416, h: rh - 38, ph: '说明', size: 13, color: th.muted, lh: 1.5 }));
      });
      foot(k, c); return E;
    }
    if (d.variant === 'type') {
      const fs = (d.fonts || []).slice(0, 3), n = Math.max(fs.length, 1), gap = 24, cw = (1120 - (n - 1) * gap) / n;
      fs.forEach((f, i) => {
        const x = 80 + i * (cw + gap), fk = fontKey(f.fk), F = FONTS[fk], latin = fk === 'cond' || fk === 'mono';
        E.push(R({ x, y: 160, w: cw, h: 480, fill: th.surface, r: st.radius }));
        E.push(T({ x: x + 28, y: 176, w: cw - 56, h: 190, value: latin ? 'Aa' : '永', size: 150, weight: 700, font: fk, color: th.inkOnSurface, lh: 1.2, nofit: true, editable: false }));
        E.push(T({ x: x + 28, y: 376, w: cw - 56, h: 28, value: F.family, size: 20, weight: 700, color: th.text, editable: false }));
        E.push(T({ x: x + 28, y: 406, w: cw - 56, h: 22, value: F.alias + ' · 免费商用（OFL）', size: 13, color: th.mutedOnSurface, editable: false }));
        E.push(T({ x: x + 28, y: 446, w: cw - 56, h: 84, value: latin ? 'ABCDEFG abcdefg 0123456789' : (d.sample || '好品质，看得见') + '\nABC abc 0123', size: 24, weight: 500, font: fk, color: th.text, lh: 1.5, editable: false }));
        E.push(LN(x + 28, 560, x + cw - 28, 560, th.line, 1));
        E.push(k.t(`fonts.${i}.use`, { x: x + 28, y: 574, w: cw - 56, h: 44, ph: '用途', size: 15, weight: 500, color: th.text, lh: 1.45 }));
      });
      foot(k, c); return E;
    }
    const cs = (d.colors || []).slice(0, 6), n = Math.max(cs.length, 1), gap = 16, cw = (1120 - (n - 1) * gap) / n;
    cs.forEach((p, i) => {
      const x = 80 + i * (cw + gap), hx = isHex(p.hex) ? normHex(p.hex) : th.primary, on = onColor(hx);
      E.push(R({ x, y: 160, w: cw, h: 300, fill: hx, r: st.radius, line: lum(hx) > .85 ? th.line : null, lw: 1, flat: true }));
      E.push(k.t(`colors.${i}.name`, { x: x + 20, y: 180, w: cw - 40, h: 32, ph: '名称', size: 22, weight: 800, color: on }));
      E.push(k.t(`colors.${i}.hex`, { x: x + 20, y: 404, w: cw - 40, h: 30, ph: '#RRGGBB', size: 20, weight: 700, color: on }));
      E.push(T({ x, y: 478, w: cw, h: 20, value: 'RGB  ' + rgbOf(hx), size: 13, color: th.muted, editable: false }));
      E.push(T({ x, y: 502, w: cw, h: 20, value: 'CMYK  ' + cmykOf(hx), size: 13, color: th.muted, editable: false }));
      E.push(k.t(`colors.${i}.note`, { x, y: 536, w: cw, h: 60, ph: '使用场景（可空）', size: 14, color: th.text, lh: 1.5 }));
    });
    foot(k, c); return E;
  }
};

/* ---- 1.7 variants on existing page types ---- */
function extend(type, variants, more) {
  const def = L[type]; def.variants.push(...variants);
  const b0 = def.build, d0 = def.defaults;
  def.build = function (k, c) { const f = more.builds[k.d.variant]; return f ? f(k, c) : b0.call(def, k, c); };
  if (more.defaults) def.defaults = () => ({ ...d0(), ...more.defaults() });
  if (more.lists) def.lists = [...(def.lists || []), ...more.lists];
  if (more.fields) def.fields = [...(def.fields || []), ...more.fields];
  if (more.when) for (const [key, w] of Object.entries(more.when)) { const ls = def.lists.find(l => l.key === key); if (ls) { const w0 = ls.when; ls.when = d => w(d, w0); } }
  if (more.imageFit) def.imageFit = true;
}
extend('process', [['chevron', '大号步骤'], ['path', '路径 + 数据']], {
  fields: [['hot', '突出第几步（数字，可空）', d => d.variant === 'path']],
  lists: [{ key: 'stats', label: '路径下方的数据', min: 0, max: 3, fields: [['at', '第几步', 44], ['value', '数值', 60], ['label', '说明']], make: () => ({ at: '1', value: '50%', label: '说明' }), when: d => d.variant === 'path' }],
  defaults: () => ({ hot: '', stats: [] }),
  builds: {
    chevron(k, c) {
      const { E, th, d, st } = k; head(k, c);
      const s = (d.steps || []).slice(0, 5), n = Math.max(s.length, 1), slot = 1120 / n;
      s.forEach((p, i) => {
        const x = 80 + i * slot;
        E.push(T({ x: x + 10, y: 196, w: slot - 20, h: 120, value: pad2(i + 1), size: 110, weight: 900, font: 'd', align: 'center', valign: 'middle', color: mix(th.text, th.bg, .88), lh: 1, editable: false, deco: true, nofit: true }));
        E.push(k.t(`steps.${i}.t`, { x: x + 14, y: 290, w: slot - 28, h: 50, ph: '步骤', size: 32, weight: 900, font: 'd', align: 'center' }));
        E.push(k.t(`steps.${i}.d`, { x: x + 20, y: 352, w: slot - 40, h: 150, ph: '说明', size: 15, color: th.muted, align: 'center', lh: 1.7 }));
        if (i < n - 1) E.push(T({ x: x + slot - 22, y: 290, w: 44, h: 50, value: '›', size: 44, weight: 700, color: th.primaryBig, align: 'center', valign: 'middle', editable: false }));
      });
      if (d.sub || c.edit) {
        E.push(R({ x: 80, y: 584, w: 1120, h: 62, fill: th.surface, r: st.radius }));
        E.push(k.t('sub', { x: 112, y: 584, w: 1060, h: 62, valign: 'middle', align: 'center', ph: '补充说明（可留空）', size: 16, weight: 500 }));
      }
      foot(k, c); return E;
    },
    path(k, c) {
      const { E, th, d, st } = k; head(k, c);
      const s = (d.steps || []).slice(0, 6), n = Math.max(s.length, 1), gap = 12, bw = (1120 - (n - 1) * gap) / n, y0 = 190, bh = 132, hot = num(d.hot);
      s.forEach((p, i) => {
        const x = 80 + i * (bw + gap), h = hot === i + 1;
        E.push(R({ x, y: y0, w: bw, h: bh, fill: h ? th.bg : th.surface, line: h ? th.primary : null, lw: 2, r: st.radius }));
        E.push(k.t(`steps.${i}.t`, { x: x + 10, y: y0 + 18, w: bw - 20, h: 32, ph: '阶段', size: 22, weight: 800, align: 'center', color: h ? th.primaryInk : th.text }));
        E.push(LN(x + bw / 2 - 16, y0 + 58, x + bw / 2 + 16, y0 + 58, h ? th.primary : th.line, 2));
        E.push(k.t(`steps.${i}.d`, { x: x + 14, y: y0 + 68, w: bw - 28, h: 56, ph: '用户在做什么', size: 13, color: h ? th.muted : th.mutedOnSurface, align: 'center', lh: 1.55 }));
        if (h) pill(k, x + bw / 2, y0 - 40, '关键', { size: 13, h: 26 });
      });
      const sts = (d.stats || []).slice(0, 3);
      sts.forEach((q, i) => {
        const at = clamp(Math.round(num(q.at)) || 1, 1, n) - 1, x = 80 + at * (bw + gap), cw = Math.max(bw, 180), cx = clamp(x + bw / 2 - cw / 2, 80, 1200 - cw);
        E.push(PG({ pts: [[x + bw / 2 - 10, y0 + bh + 16], [x + bw / 2 + 10, y0 + bh + 16], [x + bw / 2, y0 + bh + 30]], fill: th.primary }));
        E.push(R({ x: cx, y: y0 + bh + 42, w: cw, h: 118, fill: th.surface, r: st.radius }));
        E.push(k.t(`stats.${i}.value`, { x: cx + 10, y: y0 + bh + 56, w: cw - 20, h: 50, ph: '数值', size: 38, weight: 900, font: 'd', align: 'center', color: th.inkOnSurface }));
        E.push(k.t(`stats.${i}.label`, { x: cx + 12, y: y0 + bh + 110, w: cw - 24, h: 40, ph: '说明', size: 13, align: 'center', color: th.mutedOnSurface, lh: 1.45 }));
      });
      if (d.sub || c.edit) {
        E.push(R({ x: 80, y: 590, w: 1120, h: 56, fill: th.surface, r: st.radius }));
        E.push(k.t('sub', { x: 112, y: 590, w: 1060, h: 56, valign: 'middle', align: 'center', ph: '一句结论（可留空）', size: 16, weight: 700 }));
      }
      foot(k, c); return E;
    },
  },
});
extend('data', [['hero', '大数字 + 配图']], {
  imageFit: true,
  fields: [['tags', '标签（用 / 分隔）', d => d.variant === 'hero']],
  defaults: () => ({ img: null, tags: '' }),
  when: { bars: (d, w0) => d.variant !== 'hero' && w0(d) },
  builds: {
    hero(k, c) {
      const { E, th, d, st } = k; const s0 = (d.stats || [])[0] || {};
      E.push(k.im('img', { x: 640, y: 0, w: 640, h: H, ph: ph(d, 'img', '产品墙 / 品牌主图'), fit: d.fit || 'cover' }));
      E.push(k.t('eyebrow', { x: 80, y: 56, w: 520, h: 20, value: d.eyebrow ?? c.autoEyebrow, ph: '眉标', size: 13, weight: 700, color: th.primaryInk, ls: 2, font: st.eyebrowMono ? 'm' : 'b' }));
      E.push(k.t('title', { x: 80, y: 84, w: 520, h: 36, ph: '标题', size: 24, weight: 800, font: 'd' }));
      E.push(T({ x: 80, y: 132, w: 540, h: 140, valign: 'bottom', lh: 1.05, runs: [
        { bind: 'stats.0.value', value: s0.value ?? '', ph: '0', size: 120, weight: 900, font: 'd', color: th.primaryBig },
        { bind: 'stats.0.unit', value: s0.unit ?? '', ph: '', size: 56, weight: 900, font: 'd', color: th.primaryBig }] }));
      E.push(k.t('stats.0.label', { x: 80, y: 284, w: 520, h: 34, ph: '这个数字说明什么', size: 24, weight: 800 }));
      const tg = splitTags(d.tags); if (tg.length) chips(k, 80, 332, 520, tg, 14);
      E.push(k.t('sub', { x: 80, y: 386, w: 500, h: 150, ph: '一段介绍（可留空）', size: 15, color: th.muted, lh: 1.75 }));
      const rest = (d.stats || []).slice(1, 4), sl = 540 / Math.max(rest.length, 1);
      rest.forEach((s, i) => {
        const x = 80 + i * sl + 1;
        E.push(LN(x, 556, x + sl - 24, 556, th.line, 1));
        E.push(T({ x, y: 566, w: sl - 24, h: 44, valign: 'bottom', lh: 1.1, runs: [
          { bind: `stats.${i + 1}.value`, value: s.value ?? '', ph: '0', size: 34, weight: 900, font: 'd', color: th.primaryInk },
          { bind: `stats.${i + 1}.unit`, value: s.unit ?? '', ph: '', size: 15, weight: 700, color: th.text }] }));
        E.push(k.t(`stats.${i + 1}.label`, { x, y: 614, w: sl - 24, h: 20, ph: '指标', size: 13, color: th.muted }));
      });
      foot(k, c, { half: true }); return E;
    },
  },
});
const SEARCH_SLOTS = [[230, 206], [500, 192], [790, 204], [1060, 214], [200, 296], [1090, 298], [210, 446], [1080, 450], [300, 548], [560, 566], [830, 552], [1080, 558]];
extend('market', [['search', '搜索关键词']], {
  fields: [['label', '搜索框标签', d => d.variant === 'search'], ['query', '搜索词', d => d.variant === 'search']],
  lists: [{ key: 'keywords', label: '关键词（权重 1~3）', min: 2, max: 12, fields: [['t', '关键词'], ['w', '权重', 44]], make: () => ({ t: '关键词', w: '1' }), when: d => d.variant === 'search' }],
  defaults: () => ({ label: '搜索', query: '百元预算妈妈的礼物', keywords: [{ t: '高瘦男生春季怎么穿', w: '2' }, { t: '洱海民宿推荐', w: '2' }, { t: '补水保湿', w: '3' }, { t: '小户型装修', w: '3' }, { t: '猫挑食', w: '2' }, { t: '什么表值得买', w: '2' }, { t: '防晒霜', w: '1' }, { t: '短羽绒服', w: '1' }, { t: '南山雪季到什么时候', w: '1' }, { t: '手机壁纸', w: '1' }] }),
  when: { findings: (d, w0) => d.variant !== 'search' && w0(d) },
  builds: {
    search(k, c) {
      const { E, th, d, st } = k; head(k, c);
      E.push(R({ x: 370, y: 336, w: 540, h: 64, fill: th.bg, line: th.primary, lw: 3, r: 32 }));
      const lb = pill(k, 446, 344, d.label || '搜索', { size: 18, h: 48, bind: 'label', maxW: 150, x0: 378, x1: 560 });
      E.push(EL({ x: lb.x + lb.w + 14, y: 359, w: 16, h: 16, line: th.muted, lw: 2 }));
      E.push(LN(lb.x + lb.w + 28, 373, lb.x + lb.w + 34, 380, th.muted, 2));
      E.push(k.t('query', { x: lb.x + lb.w + 44, y: 336, w: 900 - (lb.x + lb.w + 44), h: 64, ph: '用户在搜什么', size: 21, weight: 700, valign: 'middle' }));
      (d.keywords || []).slice(0, 12).forEach((q, i) => {
        const [cx, cy] = SEARCH_SLOTS[i], w = clamp(Math.round(num(q.w)) || 1, 1, 3), size = [0, 13, 15, 18][w];
        const fill = w === 3 ? th.primary : w === 2 ? th.surface2 : th.surface, col = w === 3 ? th.onPrimary : th.text;
        pill(k, cx, cy - (size + 14) / 2, q.t, { size, h: size + 18, bind: `keywords.${i}.t`, fill, color: col, maxW: 300 });
      });
      if (d.sub || c.edit) E.push(k.t('sub', { x: 180, y: 610, w: 920, h: 30, ph: '一句结论（可留空）', size: 16, weight: 700, align: 'center' }));
      foot(k, c); return E;
    },
  },
});
extend('persona', [['rings', '人群圈层']], {
  lists: [{ key: 'rings', label: '圈层（由内到外）', min: 2, max: 4, fields: [['name', '圈层', 80], ['d', '说明']], make: () => ({ name: '人群', d: '' }), when: d => d.variant === 'rings' }],
  defaults: () => ({ rings: [{ name: '核心人群', d: '已购用户与高意向人群，先打透' }, { name: '兴趣人群', d: '对品类有兴趣、正在比较的人' }, { name: '泛人群', d: '相关兴趣的大众用户，破圈扩量' }] }),
  builds: {
    rings(k, c) {
      const { E, th, d, st } = k; head(k, c);
      const rs = (d.rings || []).slice(0, 4), n = Math.max(rs.length, 1), cx = 370, cy = 408, R0 = 244, step = R0 / n;
      const fillOf = i => i === 0 ? th.primary : solid(mix(th.primary, th.bg, .3 + .55 * i / Math.max(1, n - 1)));
      for (let i = n - 1; i >= 0; i--) { const r = step * (i + 1); E.push(EL({ x: cx - r, y: cy - r, w: r * 2, h: r * 2, fill: fillOf(i) })); }
      rs.forEach((p, i) => {
        const r = step * (i + 1), f = fillOf(i), ink = onColor(f), y = i === 0 ? cy - 16 : cy - r + step / 2 - 16;
        E.push(k.t(`rings.${i}.name`, { x: cx - Math.min(r, 120), y, w: Math.min(r, 120) * 2, h: 32, ph: '圈层', size: i === 0 ? 20 : 17, weight: 800, align: 'center', valign: 'middle', color: ink }));
      });
      const rh = Math.min(140, 470 / n);
      rs.forEach((p, i) => {
        const y = 172 + i * rh;
        E.push(EL({ x: 700, y: y + 8, w: 18, h: 18, fill: fillOf(i), line: th.line, lw: 1 }));
        E.push(T({ x: 730, y: y + 2, w: 470, h: 30, value: p.name || '', size: 20, weight: 700, editable: false }));
        E.push(k.t(`rings.${i}.d`, { x: 730, y: y + 38, w: 470, h: rh - 48, ph: '说明', size: 15, color: th.muted, lh: 1.6 }));
        if (i < n - 1) E.push(LN(700, y + rh - 6, 1200, y + rh - 6, th.line, 1));
      });
      foot(k, c); return E;
    },
  },
});
extend('selling', [['matrix', '产品数据卡']], {
  lists: [{ key: 'products', label: '产品', min: 2, max: 4, fields: [['name', '产品', 90], ['value', '数值', 60], ['unit', '单位', 44], ['label', '说明']], make: () => ({ img: null, name: '产品', value: '100', unit: '万', label: '说明' }), when: d => d.variant === 'matrix' }],
  defaults: () => ({ products: [{ img: null, name: '明星产品 A', value: 'TOP1', unit: '', label: '品类年度销量' }, { img: null, name: '明星产品 B', value: '3752', unit: '万瓶', label: '全渠道累计销量' }, { img: null, name: '明星产品 C', value: '98', unit: '%', label: '用户好评率' }, { img: null, name: '明星产品 D', value: '120', unit: '万', label: '月度复购人数' }] }),
  builds: {
    matrix(k, c) {
      const { E, th, d, st } = k; head(k, c);
      const ps = (d.products || []).slice(0, 4), n = Math.max(ps.length, 1), cols = n === 3 ? 3 : 2, rows = Math.ceil(n / cols), gap = 16;
      const cw = (1120 - (cols - 1) * gap) / cols, ch = (476 - (rows - 1) * gap) / rows, tall = rows === 1;
      ps.forEach((p, i) => {
        const x = 80 + (i % cols) * (cw + gap), y = 164 + Math.floor(i / cols) * (ch + gap);
        E.push(R({ x, y, w: cw, h: ch, fill: th.surface, r: st.radius }));
        if (tall) {
          E.push(k.im(`products.${i}.img`, { x: x + 24, y: y + 20, w: cw - 48, h: ch - 200, ph: '产品图（透明底）', fit: 'contain' }));
          E.push(k.t(`products.${i}.name`, { x: x + 24, y: y + ch - 168, w: cw - 48, h: 28, ph: '产品', size: 19, weight: 700 }));
          E.push(T({ x: x + 24, y: y + ch - 134, w: cw - 48, h: 70, valign: 'bottom', lh: 1.05, runs: [
            { bind: `products.${i}.value`, value: p.value ?? '', ph: '0', size: 58, weight: 900, font: 'd', color: th.inkOnSurface },
            { bind: `products.${i}.unit`, value: p.unit ?? '', ph: '', size: 20, weight: 700, color: th.text }] }));
          E.push(k.t(`products.${i}.label`, { x: x + 24, y: y + ch - 56, w: cw - 48, h: 36, ph: '说明', size: 14, color: th.mutedOnSurface, lh: 1.45 }));
          return;
        }
        const iw = Math.min(220, cw * .4);
        E.push(k.im(`products.${i}.img`, { x: x + 16, y: y + 16, w: iw, h: ch - 32, ph: '产品图', fit: 'contain' }));
        const tx = x + iw + 36, tw = cw - iw - 60;
        E.push(k.t(`products.${i}.name`, { x: tx, y: y + 28, w: tw, h: 28, ph: '产品', size: 19, weight: 700 }));
        E.push(T({ x: tx, y: y + 64, w: tw, h: 70, valign: 'bottom', lh: 1.05, runs: [
          { bind: `products.${i}.value`, value: p.value ?? '', ph: '0', size: 58, weight: 900, font: 'd', color: th.inkOnSurface },
          { bind: `products.${i}.unit`, value: p.unit ?? '', ph: '', size: 20, weight: 700, color: th.text }] }));
        E.push(k.t(`products.${i}.label`, { x: tx, y: y + 142, w: tw, h: ch - 160, ph: '说明', size: 14, color: th.mutedOnSurface, lh: 1.5 }));
      });
      foot(k, c); return E;
    },
  },
});

const TYPE_ORDER = ['cover', 'contents', 'section', 'data', 'market', 'competitor', 'persona', 'selling', 'compare', 'summary', 'design', 'wip', 'series', 'mood', 'markup', 'combo', 'storyboard', 'process', 'roadmap', 'case', 'screens', 'package', 'logos', 'vi', 'upload', 'closing'];

/* ------------------------------------------------------------------ *
 * 8. Text measurement & fitting (one algorithm for screen and file)
 * ------------------------------------------------------------------ */
/* Platform hooks: the browser by default; Node (agent package) swaps in @napi-rs/canvas through setPlatform(). */
const PLATFORM = {
  canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
  loadImage(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); },
  fontReady(decl, ch) { try { return document.fonts ? document.fonts.check(decl, ch) : true; } catch (e) { return true; } },
  loadFont(decl, text) { return document.fonts.load(decl, text); },
  async zip() { if (!window.JSZip) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('压缩组件没有加载成功，请检查网络')); document.head.appendChild(sc); }); return window.JSZip; },
};
let _cv = null; const _w = new Map(); const _pending = new Map(); let _loadT = 0; let _onFonts = null;
function setPlatform(p) { Object.assign(PLATFORM, p); _cv = null; _w.clear(); }
function g2d() { if (!_cv) _cv = PLATFORM.canvas(8, 8); return _cv.getContext('2d'); }
function fontDecl(fk, weight, size) { return `${weight} ${size}px "${FONTS[fk].family}"`; }
function charW(fk, weight, ch) {
  const key = fk + '|' + weight + '|' + ch; const v = _w.get(key); if (v != null) return v;
  const decl = fontDecl(fk, weight, 100), g = g2d(); g.font = decl + ',' + FONTS[fk].fallback;
  const w = g.measureText(ch).width;
  const ok = PLATFORM.fontReady(decl, ch);
  if (ok) _w.set(key, w); else { const s = _pending.get(decl) || new Set(); s.add(ch); _pending.set(decl, s); scheduleFontLoad(); }
  return w;
}
function scheduleFontLoad() {
  if (_loadT) return;
  _loadT = setTimeout(async () => {
    _loadT = 0; const jobs = [];
    for (const [decl, chars] of _pending) jobs.push(Promise.resolve(PLATFORM.loadFont(decl, [...chars].join(''))).catch(() => null));
    _pending.clear();
    await Promise.all(jobs);
    if (_onFonts) _onFonts();
  }, 40);
}
const CLOSE_P = '，。、；：？！）」』》〉】”’,.;:?!)]}%…';
const OPEN_P = '（「『《〈【“‘([{';
const tokenize = s => s.match(/[A-Za-z0-9À-ɏ'’\-.%+#&@/]+\s*|\s+|[\s\S]/gu) || [];
function textW(t, fk, weight, size, ls) { let s = 0; for (const ch of t) s += charW(fk, weight, ch) * size / 100 + ls; return s; }
function wrapLines(text, maxW, fk, weight, size, ls) {
  const out = []; const tw = t => textW(t, fk, weight, size, ls); const lim = maxW + .5;
  for (const para of String(text).split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '', lw = 0;
    const pushChars = s => { for (const ch of s) { const cw = tw(ch); if (lw + cw > lim && line) { out.push(line); line = ''; lw = 0; } line += ch; lw += cw; } };
    for (const tok of tokenize(para)) {
      const w = tw(tok);
      if (lw + w <= lim) { line += tok; lw += w; continue; }
      if (!line) { pushChars(tok); continue; }
      if (/^\s+$/.test(tok)) { out.push(line.replace(/\s+$/, '')); line = ''; lw = 0; continue; }
      if (CLOSE_P.includes(tok) && line.length > 1) {           // no closing punctuation at line start: carry the last character (and any closing marks after it) down
        const chars = [...line]; let k = chars.length - 1; while (k > 0 && CLOSE_P.includes(chars[k])) k--;
        if (k > 0) { out.push(chars.slice(0, k).join('')); line = chars.slice(k).join('') + tok; lw = tw(line); continue; }
      }
      let carry = '';
      if (OPEN_P.includes(line[line.length - 1])) { carry = line[line.length - 1]; line = line.slice(0, -1); }  // no opening punctuation at line end
      out.push(line.replace(/\s+$/, ''));
      line = ''; lw = 0; pushChars(carry + tok.replace(/^\s+/, ''));
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out;
}
const ASCII = /^[\x20-\x7E\n]+$/;
function resolveFont(el, st, val) {
  let fk = (st.fonts && st.fonts[el.font]) || (FONTS[el.font] ? el.font : 'sans');
  if (st.numFont && el.font === 'd' && (el.size || 0) >= 40 && val && ASCII.test(val)) fk = st.numFont;   // 大字冲击: big Latin words and numbers in the condensed face
  return { fk, weight: nearestWeight(fk, el.weight || 400) };
}
function fit(el, st) {
  const { fk, weight } = resolveFont(el, st, el.value); el.fk = fk; el.fw = weight;
  if (el.runs) {
    el.runs.forEach(r => { const f = resolveFont({ font: r.font || el.font, weight: r.weight || el.weight, size: r.size }, st, r.value); r.fk = f.fk; r.fw = f.weight; });
    const total = el.runs.reduce((a, r) => a + (r.value ? textW(r.value, r.fk, r.fw, r.size, el.ls || 0) : 0), 0);
    const sc = total > el.w ? Math.max(SPEC.shrinkFloor, el.w / total) : 1;
    el.runs.forEach(r => r.size = Math.max(SPEC.type.minText, Math.floor(r.size * sc)));
    el.fitOk = total * sc <= el.w + 1; return el;
  }
  if (el.vertical || el.nofit || !el.value) { el.lines = el.value ? String(el.value).split('\n') : []; el.fitOk = true; return el; }
  const base = el.size, min = Math.max(SPEC.type.minText, Math.round(base * SPEC.shrinkFloor));
  for (let s = base; s >= min; s -= (s > 40 ? 2 : 1)) {
    const lines = wrapLines(el.value, el.w, fk, weight, s, el.ls || 0);
    if (lines.length * s * el.lh <= el.h + 1.5) { el.size = s; el.lines = lines; el.fitOk = true; el.shrunk = s < base; return el; }
  }
  el.size = min; el.lines = wrapLines(el.value, el.w, fk, weight, min, el.ls || 0); el.fitOk = false; el.shrunk = true; return el;
}

/* ------------------------------------------------------------------ *
 * 9. Build a slide → fitted element list
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * 9b. Gradient fills (渐变质感). Stops are solved per shape so that every
 *     text sitting on it still passes its contrast rule at both ends.
 * ------------------------------------------------------------------ */
const needOf = e => { const size = e.runs ? Math.max(...e.runs.map(r => r.size)) : e.size, bold = (e.fw || e.weight) >= 600; return size >= 24 || (bold && size >= 19) ? SPEC.contrast.large : SPEC.contrast.normal; };
const covers = (e, x, y) => e.k === 'poly' ? inPoly(e.pts, x, y) : x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h;
const solidFill = e => (e.k === 'rect' || e.k === 'ellipse' || e.k === 'poly') && e.fill && (e.overlay || e.op == null || e.op >= .9);
function gstop(base, toward, max, inks) {
  const ok = c => inks.every(([ink, need]) => contrast(ink, c) + .005 >= Math.min(need, contrast(ink, base)));
  for (let t = max; t > .015; t -= .015) { const c = mix(base, toward, t); if (ok(c)) return c; }
  return base;
}
function applyGrad(els, th, mode) {
  const deep = mode === 'deep', inks = new Map();
  els.forEach((e, i) => {
    if (e.k !== 'text') return; const txt = e.runs ? e.runs.map(r => r.value).join('') : e.value; if (!txt) return;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    for (let j = i - 1; j >= 0; j--) {
      const s = els[j];
      if (s.k === 'image' && covers(s, cx, cy)) break;
      if (solidFill(s) && covers(s, cx, cy)) { if (!inks.has(s)) inks.set(s, []); const need = needOf(e); (e.runs ? e.runs.map(r => r.color || e.color || th.text) : [e.color || th.text]).concat(e.hl && e.hlColor ? [e.hlColor] : []).forEach(c => inks.get(s).push([c, need])); break; }
    }
  });
  for (const s of els) {
    if (!solidFill(s) || s.grad || s.flat || s.overlay) continue;
    const ik = inks.get(s) || [];
    if (s.pageBg) {
      if (th.tone === 'brand') s.grad = { from: gstop(s.fill, '#FFFFFF', deep ? .3 : .16, ik), to: gstop(s.fill, '#000000', deep ? .34 : .18, ik), ang: 45 };
      else if (deep) s.grad = { from: s.fill, to: gstop(s.fill, th.primary, th.tone === 'dark' ? .16 : .1, ik), ang: 45 };
    } else if (s.fill === th.primary) s.grad = { from: gstop(s.fill, '#FFFFFF', deep ? .3 : .16, ik), to: gstop(s.fill, '#000000', deep ? .3 : .16, ik), ang: s.w > s.h * 1.6 ? 0 : 90 };
    if (s.grad && s.grad.from === s.grad.to) delete s.grad;
  }
}
const cssAng = a => (a + 90) % 360;
const ATMO = { light: .86, medium: .7 };      // overlay opacity of the page background over an atmosphere image
/* Style chrome: page-level framing drawn under every layout (so layouts stay style-agnostic). */
const PANEL = { x: 16, y: 16, w: W - 32, h: H - 32, r: 12 };
function chrome(k, c, s, els) {
  const { th, st } = k, out = [], brand = th.tone === 'brand', full = s.type === 'cover' || s.type === 'section' || s.type === 'closing' || (s.type === 'summary' && s.data.variant === 'question');
  if (st.decor === 'panel') {
    if (brand) out.push(R({ x: 16, y: 16, w: W - 32, h: H - 32, line: th.text, lw: 2, op: .4, r: 12 }));
    else if (th.tone !== 'dark') {
      out.push(R({ x: 0, y: 0, w: W, h: H, fill: th.primary }), R({ ...PANEL, fill: th.bg, flat: true }));
      const P2 = { x0: PANEL.x, y0: PANEL.y, x1: PANEL.x + PANEL.w, y1: PANEL.y + PANEL.h };
      els.forEach(e => {
        if (!(e.k === 'image' || (e.k === 'rect' && e.fill))) return;
        if (e.x >= P2.x0 && e.y >= P2.y0 && e.x + e.w <= P2.x1 && e.y + e.h <= P2.y1) return;
        const x0 = Math.max(e.x, P2.x0), y0 = Math.max(e.y, P2.y0), x1 = Math.min(e.x + e.w, P2.x1), y1 = Math.min(e.y + e.h, P2.y1);
        const corner = (x0 <= P2.x0 || x1 >= P2.x1) && (y0 <= P2.y0 || y1 >= P2.y1);
        Object.assign(e, { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }); if (corner && !e.r) e.r = PANEL.r;
      });
    }
  }
  if (!brand && !full) {
    if (st.decor === 'glow') {
      out.push(EL({ x: -460, y: 520, w: 1000, h: 420, line: th.primary, lw: 1.5, op: .45 }), EL({ x: -420, y: 560, w: 1000, h: 420, line: th.primary, lw: 1, op: .22 }));
      out.push(EL({ x: 860, y: -300, w: 820, h: 400, line: th.primary, lw: 1.5, op: .4 }), EL({ x: 900, y: -270, w: 820, h: 400, line: th.primary, lw: 1, op: .2 }));
    }
    if (st.decor === 'bigword') {
      const w = String(c.curEn || '').toUpperCase().replace(/[^A-Z0-9 &+\-]/g, '').trim();
      if (w) out.push(T({ x: 80, y: 14, w: 1120, h: 150, value: w.slice(0, 16), size: 150, font: 'cond', align: 'right', color: mix(th.text, th.bg, .93), lh: 1, editable: false, deco: true, nofit: true }));
      out.push(R({ x: 80, y: 40, w: 40, h: 6, fill: th.primary }));
    }
    if (st.decor === 'offset') {
      if (c.curEn) out.push(T({ x: 28, y: 160, w: 24, h: 400, value: String(c.curEn).slice(0, 20), size: 12, ls: 4, color: th.muted, vertical: true, editable: false, deco: true }));
      let big = null; for (const e of els) if (e.k === 'image' && e.bind && e.w < W - 40 && e.h < H - 40 && e.w * e.h >= 60000 && (!big || e.w * e.h > big.w * big.h)) big = e;
      if (big) els.splice(els.indexOf(big), 0, R({ x: big.x - 14, y: big.y + 14, w: big.w, h: big.h, fill: th.primary, flat: true, deco: true }));
    }
  }
  return out;
}
function sections(project) { const st = STYLES[project.theme.style] || STYLES.modern; const out = []; project.slides.forEach((x, i) => { if (x.type === 'section') out.push({ i, no: x.data.no || numStr(st, out.length + 1), title: x.data.title || '', en: x.data.en || '' }); }); return out; }
function toneOf(project, s) { const def = L[s.type] || L.summary; return s.tone && s.tone !== 'auto' ? s.tone : (def.tone && def.tone(s.data)) || project.theme.mode; }
function build(project, idx, opts = {}) {
  const s = opts.slide || project.slides[idx]; const def = L[s.type] || L.summary;
  const th = theme(project, toneOf(project, s)), st = th.style, secs = sections(project);
  let cur = null; for (const sc of secs) if (sc.i < idx) cur = sc;
  const me = secs.find(x => x.i === idx);
  const secNo = me ? me.no : numStr(st, secs.filter(x => x.i < idx).length + 1);
  const autoEyebrow = cur ? (st.num === 'cn' ? `第${cur.no}章 · ${cur.title}` : `PART ${cur.no} · ${cur.title}`) : '';
  const c = { th, edit: !!opts.edit, idx, pageNo: idx + 1, total: project.slides.length, secs, secNo, autoEyebrow };
  const k = kit(project, s, c);
  c.curEn = cur ? cur.en : '';
  const els = def.build(k, c), gm = project.theme.gradient && project.theme.gradient !== 'none' ? project.theme.gradient : null;
  const pre = chrome(k, c, s, els);
  const at = s.atmo && asset(project, s.atmo.id), PB = st.decor === 'panel' && th.tone !== 'brand' && th.tone !== 'dark' ? PANEL : null;
  if (at) pre.push(IM({ x: 0, y: 0, w: W, h: H, src: at.src, fit: 'cover', editable: false, deco: true, atmo: true, ...(PB ? { x: PB.x, y: PB.y, w: PB.w, h: PB.h, r: PB.r } : {}) }), R({ x: 0, y: 0, w: W, h: H, fill: th.bg, op: ATMO[s.atmo.strength] || ATMO.light, overlay: true, ...(PB || {}) }));
  els.unshift(...pre);
  if (gm && (th.tone === 'brand' || gm === 'deep')) els.unshift(R({ x: 0, y: 0, w: W, h: H, fill: th.bg, pageBg: true }));
  if (st.gray) els.forEach(e => { if (e.k === 'image' && e.fit !== 'contain' && !e.logo && !e.src) e.gray = true; });
  for (const el of els) if (el.k === 'text') fit(el, st);
  if (gm) applyGrad(els, th, gm);
  return { bg: th.bg, th, els, slide: s, idx };
}

/* ------------------------------------------------------------------ *
 * 10. DOM renderer
 * ------------------------------------------------------------------ */
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
let PT = null;
function plainEditable() { if (PT) return PT; const d = document.createElement('div'); try { d.contentEditable = 'plaintext-only'; } catch (e) { } PT = d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'; return PT; }
/* Title keyword highlight (data.hl): the same characters, in the accent ink. Splits are by text, so line breaks never move. */
function hlSegs(text, hl) {
  const k = String(hl || '').trim(); if (!k || !text.includes(k)) return [[text, false]];
  const out = []; let i = 0, j; while ((j = text.indexOf(k, i)) >= 0) { if (j > i) out.push([text.slice(i, j), false]); out.push([k, true]); i = j + k.length; }
  if (i < text.length) out.push([text.slice(i), false]); return out;
}
function hlFill(p, text, el) {
  if (!el.hl) { p.textContent = text; return; }
  for (const [t, on] of hlSegs(text, el.hl)) { if (!on) { p.appendChild(document.createTextNode(t)); continue; } const sp = document.createElement('span'); sp.textContent = t; sp.style.color = el.hlColor; p.appendChild(sp); }
}
function paint(host, built, opts = {}) {
  const edit = !!opts.edit, project = opts.project; const th = built.th;
  host.innerHTML = ''; host.style.background = built.bg;
  const frag = document.createDocumentFragment();
  for (const el of built.els) {
    let n;
    if (el.k === 'line') {
      const pad = el.w + 2, x = Math.min(el.x1, el.x2) - pad, y = Math.min(el.y1, el.y2) - pad, w = Math.abs(el.x2 - el.x1) + pad * 2, h = Math.abs(el.y2 - el.y1) + pad * 2;
      n = document.createElement('div'); n.className = 'el line';
      Object.assign(n.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      n.innerHTML = `<svg width="${w}" height="${h}" style="display:block;overflow:visible"><line x1="${el.x1 - x}" y1="${el.y1 - y}" x2="${el.x2 - x}" y2="${el.y2 - y}" stroke="${el.color}" stroke-width="${el.w}"${el.op != null ? ` stroke-opacity="${el.op}"` : ''}/></svg>`;
      frag.appendChild(n); continue;
    }
    if (el.k === 'poly') {
      n = document.createElement('div'); n.className = 'el poly';
      Object.assign(n.style, { left: el.x + 'px', top: el.y + 'px', width: el.w + 'px', height: el.h + 'px' });
      const gid = el.grad ? 'g' + uid() : null, pts = el.pts.map(p => (p[0] - el.x).toFixed(2) + ',' + (p[1] - el.y).toFixed(2)).join(' ');
      const gv = el.grad ? (() => { const a = el.grad.ang * Math.PI / 180, dx = Math.cos(a) / 2, dy = Math.sin(a) / 2; return `<defs><linearGradient id="${gid}" x1="${.5 - dx}" y1="${.5 - dy}" x2="${.5 + dx}" y2="${.5 + dy}"><stop offset="0" stop-color="${el.grad.from}"/><stop offset="1" stop-color="${el.grad.to}"/></linearGradient></defs>`; })() : '';
      n.innerHTML = `<svg width="${el.w}" height="${el.h}" style="display:block;overflow:visible">${gv}<polygon points="${pts}" fill="${el.fill ? (gid ? `url(#${gid})` : el.fill) : 'none'}"${el.line ? ` stroke="${el.line}" stroke-width="${el.lw || 1}"` : ''}${el.op != null ? ` opacity="${el.op}"` : ''}/></svg>`;
      frag.appendChild(n); continue;
    }
    if (el.k === 'handle') {
      if (!edit) continue;
      n = document.createElement('div'); n.className = 'handle'; n.dataset.i = el.i; n.dataset.key = el.key || 'callouts'; if (el.box) n.dataset.box = JSON.stringify(el.box); if (el.inv) n.dataset.inv = '1'; n.style.left = el.x + 'px'; n.style.top = el.y + 'px'; n.title = '拖动调整标注位置';
      frag.appendChild(n); continue;
    }
    n = document.createElement('div'); n.className = 'el ' + el.k;
    Object.assign(n.style, { left: el.x + 'px', top: el.y + 'px', width: el.w + 'px', height: el.h + 'px' });
    if (el.k === 'rect' || el.k === 'ellipse') {
      if (el.fill) n.style.background = el.grad ? `linear-gradient(${cssAng(el.grad.ang)}deg, ${el.grad.from}, ${el.grad.to})` : el.fill;
      if (el.line) n.style.border = `${el.lw || 1}px solid ${el.line}`;
      if (el.op != null) n.style.opacity = el.op;
      n.style.borderRadius = el.k === 'ellipse' ? '50%' : (el.r || 0) + 'px';
    } else if (el.k === 'image') {
      const a = el.src ? { src: el.src } : asset(project, el.id);
      if (el.r) n.style.borderRadius = el.r + 'px';
      if (a) { n.style.backgroundImage = `url("${a.src}")`; n.style.backgroundSize = el.fit === 'contain' ? 'contain' : 'cover'; if (el.gray) n.style.filter = 'grayscale(1)'; }
      else {
        n.classList.add('empty'); n.style.background = `repeating-linear-gradient(135deg, ${th.surface} 0 14px, ${th.surface2} 14px 28px)`; n.style.color = th.muted;
        n.innerHTML = `<div class="phi"></div><div class="phl">${esc(el.ph || '图片')}</div>`;
      }
      if (edit && el.bind) { n.dataset.bind = el.bind; if (a) n.insertAdjacentHTML('beforeend', '<div class="imgacts"><button data-imgact="replace">替换</button><button data-imgact="remove">移除</button></div>'); }
    } else if (el.k === 'text') {
      const vmap = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
      n.style.justifyContent = vmap[el.valign] || 'flex-start';
      if (el.op != null) n.style.opacity = el.op;
      const p = document.createElement('div'); p.className = 'tx';
      const runs = el.runs || null, maxSize = runs ? Math.max(...runs.map(r => r.size)) : el.size;
      Object.assign(p.style, { fontSize: el.size + 'px', fontWeight: el.fw, fontFamily: fontCss(el.fk), color: el.color || th.text, textAlign: el.align, lineHeight: (maxSize * el.lh) + 'px', letterSpacing: (el.ls || 0) + 'px' });
      if (el.vertical) { p.style.writingMode = 'vertical-rl'; p.style.height = '100%'; }
      const editable = edit && el.editable !== false && (el.bind || runs);
      if (runs) {
        for (const r of runs) {
          const sp = document.createElement('span'); sp.textContent = r.value || '';
          Object.assign(sp.style, { fontSize: r.size + 'px', fontWeight: r.fw, color: r.color || el.color || th.text, fontFamily: fontCss(r.fk) });
          if (editable && r.bind) { sp.contentEditable = plainEditable(); sp.dataset.bind = r.bind; sp.dataset.ph = r.ph ?? ''; sp.style.display = 'inline-block'; sp.style.minWidth = '.5em'; }
          p.appendChild(sp);
        }
        p.style.whiteSpace = 'nowrap';
      } else if (editable) {
        hlFill(p, el.value || '', el); p.contentEditable = plainEditable(); p.dataset.bind = el.bind; p.dataset.ph = el.ph || ''; if (el.rerender) p.dataset.rerender = '1';
        p.style.whiteSpace = 'pre-wrap';
      } else {
        hlFill(p, (el.lines || []).join('\n'), el); p.style.whiteSpace = 'pre';
      }
      if (edit && !el.fitOk) n.classList.add('overflow');
      n.appendChild(p);
    }
    frag.appendChild(n);
  }
  host.appendChild(frag);
}

/* ------------------------------------------------------------------ *
 * 11. Validator — the rules every page must pass
 * ------------------------------------------------------------------ */
function bgUnder(els, i, slideBg) {
  const t = els[i], cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  for (let j = i - 1; j >= 0; j--) {
    const e = els[j];
    if (e.k === 'image' && cx >= e.x && cx <= e.x + e.w && cy >= e.y && cy <= e.y + e.h) return null;
    if (solidFill(e) && covers(e, cx, cy)) return e.grad ? [e.grad.from, e.grad.to] : e.fill;
  }
  return slideBg;
}
function validate(project) {
  const issues = [];
  project.slides.forEach((s, i) => {
    const b = build(project, i, { edit: false }), page = i + 1, S = SPEC.safe;
    let emptyImgs = 0;
    b.els.forEach((e, j) => {
      if (e.k === 'image' && e.bind && !asset(project, e.id)) emptyImgs++;
      if (e.k !== 'text' || e.deco) return;
      const txt = e.runs ? e.runs.map(r => r.value).join('') : e.value;
      if (!txt) return;
      if (!e.fitOk) issues.push({ page, level: 'error', code: 'overflow', bind: e.bind, msg: `文字超出文本框：「${txt.slice(0, 14)}${txt.length > 14 ? '…' : ''}」，请精简内容` });
      if (e.x < S.x0 - .5 || e.x + e.w > S.x1 + .5 || e.y < S.y0 - .5 || e.y + e.h > S.y1 + .5) issues.push({ page, level: 'error', code: 'safe', bind: e.bind, msg: `文字超出安全边距：「${txt.slice(0, 10)}」` });
      const bg = bgUnder(b.els, j, b.bg);
      if (bg) {
        const size = e.runs ? Math.max(...e.runs.map(r => r.size)) : e.size, bold = (e.fw || e.weight) >= 600;
        const need = size >= 24 || (bold && size >= 19) ? SPEC.contrast.large : SPEC.contrast.normal;
        const cols = e.runs ? e.runs.map(r => r.color || e.color || b.th.text) : [e.color || b.th.text]; if (e.hl && e.hlColor && txt.includes(String(e.hl).trim())) cols.push(e.hlColor);
        for (const col of cols) { const cr = Math.min(...[].concat(bg).map(g => contrast(col, g))); if (cr + .01 < need) { issues.push({ page, level: 'warn', code: 'contrast', bind: e.bind, msg: `文字对比度 ${cr.toFixed(1)}:1，低于规范 ${need}:1` }); break; } }
      }
      if (e.bind === 'title' && txt.length > SPEC.title.maxChars) issues.push({ page, level: 'warn', code: 'title', bind: 'title', msg: `标题 ${txt.length} 字，建议不超过 ${SPEC.title.maxChars} 字` });
    });
    if (emptyImgs) issues.push({ page, level: 'warn', code: 'image', msg: `${emptyImgs} 处图片位还没有放图` });
    if (s.atmo && s.atmo.strength === 'medium') issues.push({ page, level: 'warn', code: 'atmo', msg: '氛围图为「中」浓度，请目测文字是否清晰' });
    if (s.type !== 'contents' && s.type !== 'upload' && s.data.title === '') issues.push({ page, level: 'warn', code: 'notitle', msg: '页面缺少标题' });
  });
  return issues;
}

/* ------------------------------------------------------------------ *
 * 12. PPTX writer (PptxGenJS) — uses the fitted sizes and line breaks
 * ------------------------------------------------------------------ */
const hex6 = col => String(col).replace('#', '').toUpperCase().slice(0, 6);
const IN = v => v / 96, PTS = v => v * SPEC.pxToPt;
function loadImg(src) { return PLATFORM.loadImage(src); }
async function cropCover(src, w, h, gray) {
  const img = await loadImg(src); if (!img) return null;
  const scale = Math.min(2, Math.max(1, 1600 / w)), cw = Math.round(w * scale), ch = Math.round(h * scale);
  const cv = PLATFORM.canvas(cw, ch);
  const r = Math.max(cw / img.naturalWidth, ch / img.naturalHeight), dw = img.naturalWidth * r, dh = img.naturalHeight * r;
  const g = cv.getContext('2d'); g.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  if (gray) { const id = g.getImageData(0, 0, cw, ch), p = id.data; for (let i = 0; i < p.length; i += 4) { const v = .2126 * p[i] + .7152 * p[i + 1] + .0722 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = v; } g.putImageData(id, 0, 0); }
  return cv.toDataURL(/^data:image\/png/.test(src) ? 'image/png' : 'image/jpeg', .9);
}
function textToPng(el, color) {
  const sc = 3, cv = PLATFORM.canvas(Math.ceil(el.w * sc), Math.ceil(el.h * sc));
  const g = cv.getContext('2d'); g.scale(sc, sc); g.fillStyle = color; g.textBaseline = 'middle';
  g.font = `${el.fw} ${el.size}px ${fontCss(el.fk)}`;
  const lh = el.size * el.lh, lines = el.lines || [], total = lines.length * lh;
  let y0 = el.valign === 'middle' ? (el.h - total) / 2 : el.valign === 'bottom' ? el.h - total : 0;
  if ('letterSpacing' in g) g.letterSpacing = (el.ls || 0) + 'px';
  lines.forEach((ln, i) => {
    const w = textW(ln, el.fk, el.fw, el.size, el.ls || 0);
    const x = el.align === 'center' ? (el.w - w) / 2 : el.align === 'right' ? el.w - w : 0;
    g.fillText(ln, x, y0 + i * lh + lh / 2);
  });
  return cv.toDataURL('image/png');
}
function fontsUsed(project) {
  const set = new Set();
  project.slides.forEach((s, i) => build(project, i).els.forEach(e => { if (e.k === 'text') { if (e.runs) e.runs.forEach(r => r.value && set.add(r.fk)); else if (e.value) set.add(e.fk); } }));
  return [...set].map(fk => ({ key: fk, ...FONTS[fk] }));
}
/* Logo preparation, shared by the website and the agent: knock out a flat white background,
   trim empty margins, and make a white (反白) version for dark pages and photos. */
async function prepLogo(src) {
  const img = await loadImg(src); if (!img) return null;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, sc = Math.min(1, 800 / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * sc)), h = Math.max(1, Math.round(ih * sc)), cv = PLATFORM.canvas(w, h), g = cv.getContext('2d');
  g.drawImage(img, 0, 0, w, h); const id = g.getImageData(0, 0, w, h), px = id.data;
  const at = (x, y) => (y * w + x) * 4, corner = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const flatWhite = corner.every(i => px[i + 3] > 250 && Math.min(px[i], px[i + 1], px[i + 2]) > 232);
  if (flatWhite) for (let i = 0; i < px.length; i += 4) { const m = Math.min(px[i], px[i + 1], px[i + 2]); if (m > 244) px[i + 3] = 0; else if (m > 214) px[i + 3] = Math.round(px[i + 3] * (244 - m) / 30); }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[at(x, y) + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  g.putImageData(id, 0, 0);
  const tw = x1 - x0 + 1, tht = y1 - y0 + 1, out = PLATFORM.canvas(tw, tht), og = out.getContext('2d'); og.drawImage(cv, x0, y0, tw, tht, 0, 0, tw, tht);
  const lt = PLATFORM.canvas(tw, tht), lg = lt.getContext('2d'); lg.drawImage(out, 0, 0); const ld = lg.getImageData(0, 0, tw, tht);
  for (let i = 0; i < ld.data.length; i += 4) { ld.data[i] = ld.data[i + 1] = ld.data[i + 2] = 255; }
  lg.putImageData(ld, 0, 0);
  return { src: out.toDataURL('image/png'), light: lt.toDataURL('image/png'), w: tw, h: tht, logo: true };
}
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
async function gradPost(data, outputType) {
  const Z = await PLATFORM.zip(), zip = await Z.loadAsync(data);
  for (const f of Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))) {
    let x = await zip.file(f).async('string'); if (!x.includes('name="dg_')) continue;
    x = x.replace(/<p:sp>((?:(?!<\/p:sp>)[\s\S])*?)<\/p:sp>/g, sp => {
      const m = sp.match(/name="dg_([0-9A-F]{6})_([0-9A-F]{6})_(\d+)"/); if (!m) return sp; sp = sp.replace(m[0], `name="渐变色块 ${m[1]}"`);
      return sp.replace(/<a:solidFill>\s*<a:srgbClr val="[0-9A-Fa-f]{6}"\s*(?:\/>|>((?:(?!<\/a:srgbClr>)[\s\S])*)<\/a:srgbClr>)\s*<\/a:solidFill>/, (all, inner) => {
        const al = inner || ''; return `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${m[1]}">${al}</a:srgbClr></a:gs><a:gs pos="100000"><a:srgbClr val="${m[2]}">${al}</a:srgbClr></a:gs></a:gsLst><a:lin ang="${+m[3] * 60000}" scaled="0"/></a:gradFill>`;
      });
    });
    zip.file(f, x);
  }
  return zip.generateAsync({ type: outputType, mimeType: PPTX_MIME, compression: 'DEFLATE' });
}
async function toPptx(project, opt = {}) {
  const P = (typeof PptxGenJS !== 'undefined') ? PptxGenJS : null;
  if (!P) throw new Error('导出组件没有加载成功，请检查网络后刷新页面');
  const target = opt.target || 'ppt', fontMode = opt.fontMode || 'spec';
  const face = fk => fontMode === 'system' ? FONTS[fk].sys[target] : FONTS[fk].family;
  const pptx = new P(); pptx.layout = 'LAYOUT_WIDE'; pptx.title = project.name || '提案'; pptx.company = project.brand.name || ''; pptx.subject = `DeckEngine ${VERSION}`;
  let grads = 0; const gname = el => { if (!el.grad) return {}; grads++; return { objectName: `dg_${hex6(el.grad.from)}_${hex6(el.grad.to)}_${Math.round(el.grad.ang)}` }; };
  for (let i = 0; i < project.slides.length; i++) {
    const b = build(project, i), th = b.th, sl = pptx.addSlide();
    sl.background = { color: hex6(b.bg) };
    for (const el of b.els) {
      if (el.k === 'handle') continue;
      if (el.k === 'line') {
        const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2), w = Math.abs(el.x2 - el.x1), h = Math.abs(el.y2 - el.y1);
        sl.addShape(pptx.ShapeType.line, { x: IN(x), y: IN(y), w: IN(w), h: IN(h), flipV: (el.x2 - el.x1) * (el.y2 - el.y1) < 0, line: { color: hex6(el.color), width: PTS(el.w), transparency: el.op != null ? Math.round((1 - el.op) * 100) : 0 } });
        continue;
      }
      if (el.k === 'rect' || el.k === 'ellipse') {
        const o = { x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h) }, tr = el.op != null ? Math.round((1 - el.op) * 100) : 0;
        if (el.fill) o.fill = { color: hex6(el.fill), transparency: tr };
        if (el.line) o.line = { color: hex6(el.line), width: PTS(el.lw || 1), transparency: tr };
        let shape = pptx.ShapeType.rect;
        if (el.k === 'ellipse') shape = pptx.ShapeType.ellipse; else if (el.r) { shape = pptx.ShapeType.roundRect; o.rectRadius = IN(Math.min(el.r, el.w / 2, el.h / 2)); }
        sl.addShape(shape, { ...o, ...gname(el) }); continue;
      }
      if (el.k === 'poly') {
        const o = { x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h), points: [...el.pts.map(p => ({ x: IN(p[0] - el.x), y: IN(p[1] - el.y) })), { close: true }] }, tr = el.op != null ? Math.round((1 - el.op) * 100) : 0;
        o.fill = el.fill ? { color: hex6(el.fill), transparency: tr } : { type: 'none' };
        o.line = el.line ? { color: hex6(el.line), width: PTS(el.lw || 1) } : { type: 'none' };
        sl.addShape(pptx.ShapeType.custGeom, { ...o, ...gname(el) }); continue;
      }
      if (el.k === 'image') {
        const a = el.src ? { src: el.src } : asset(project, el.id);
        if (a) {
          if (el.fit === 'contain') {
            const img = await loadImg(a.src); if (!img) continue;
            const r = Math.min(el.w / img.naturalWidth, el.h / img.naturalHeight), w = img.naturalWidth * r, h = img.naturalHeight * r;
            sl.addImage({ data: a.src.startsWith('data:') ? a.src : await cropCover(a.src, w, h), x: IN(el.x + (el.w - w) / 2), y: IN(el.y + (el.h - h) / 2), w: IN(w), h: IN(h) });
          } else { const data = await cropCover(a.src, el.w, el.h, el.gray); if (data) sl.addImage({ data, x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h) }); }
        } else if (opt.placeholders !== false && el.bind) {
          sl.addShape(pptx.ShapeType.rect, { x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h), fill: { color: hex6(th.surface) }, line: { color: hex6(th.line), width: .75, dashType: 'dash' } });
          sl.addText(el.ph || '图片', { x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h), align: 'center', valign: 'middle', fontFace: face('sans'), fontSize: el.w < 300 ? 10 : 14, color: hex6(th.muted), margin: 4 });
        }
        continue;
      }
      if (el.k === 'text') {
        const color = el.color || th.text;
        const tr = el.op != null ? Math.round((1 - el.op) * 100) : 0;
        const tol = el.align === 'center' ? 6 : 4;                      // absorb sub-pixel metric differences
        const bx = el.align === 'center' ? el.x - tol / 2 : el.align === 'right' ? el.x - tol : el.x;
        const base = { x: IN(bx), y: IN(el.y), w: IN(el.w + tol), h: IN(el.h), align: el.align, valign: el.valign, margin: 0, wrap: true, charSpacing: el.ls ? PTS(el.ls) : undefined };
        if (el.runs) {
          const runs = el.runs.filter(r => r.value).map(r => ({ text: r.value, options: { fontSize: PTS(r.size), bold: r.fw >= 600, color: hex6(r.color || color), fontFace: face(r.fk) } }));
          if (!runs.length) continue;
          sl.addText(runs, { ...base, wrap: false, lineSpacing: PTS(Math.max(...el.runs.map(r => r.size)) * el.lh) });
          continue;
        }
        if (!el.value) continue;
        if (opt.artAsImage && FONTS[el.fk].art && !el.vertical) { sl.addImage({ data: textToPng(el, color), x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h) }); continue; }
        const text = el.vertical ? el.value : (opt.lockBreaks === false ? el.value : el.lines.join('\n'));
        if (el.hl && !el.vertical && text.includes(String(el.hl).trim())) {
          const fo = { fontSize: PTS(el.size), bold: el.fw >= 600 && FONTS[el.fk].weights.includes(el.fw), fontFace: face(el.fk) }, runs = [], ls = text.split('\n');
          ls.forEach((ln, li) => { const sg = hlSegs(ln, el.hl); sg.forEach(([t, on], si) => runs.push({ text: t, options: { ...fo, color: hex6(on ? el.hlColor : color), breakLine: si === sg.length - 1 && li < ls.length - 1 } })); });
          sl.addText(runs, { ...base, lineSpacing: PTS(el.size * el.lh) }); continue;
        }
        sl.addText(text, { ...base, fontSize: PTS(el.size), bold: el.fw >= 600 && FONTS[el.fk].weights.includes(el.fw), color: hex6(color), transparency: tr || undefined, fontFace: face(el.fk), lineSpacing: PTS(el.size * el.lh), vert: el.vertical ? 'eaVert' : undefined });
      }
    }
  }
  const ot = opt.outputType || 'blob';
  if (!grads) return await pptx.write({ outputType: ot });
  return await gradPost(await pptx.write({ outputType: 'arraybuffer' }), ot);
}

/* ------------------------------------------------------------------ *
 * 13. Deck model helpers
 * ------------------------------------------------------------------ */
function newSlide(type) { return { id: uid(), type, tone: 'auto', data: L[type].defaults() }; }
function migrate(p) {
  p.assets = p.assets || {}; p.brand = { name: '', logo: null, ...(p.brand || {}) }; p.agency = { name: '', logo: null, place: 'cover+closing', ...(p.agency || {}) };
  p.theme = { primary: '#1F8A4C', accent: '#E3B341', mode: 'light', style: 'modern', ptype: 'general', gradient: 'none', ...(p.theme || {}) };
  if (!STYLES[p.theme.style]) p.theme.style = p.theme.font === 'serif' ? 'elegant' : 'modern';
  p.slides = (p.slides || []).filter(s => L[s.type]).map(s => ({ id: s.id || uid(), tone: s.tone || 'auto', type: s.type, data: { ...L[s.type].defaults(), ...(s.data || {}) } }));
  if (!p.slides.length) p.slides = [newSlide('cover')];
  p.engine = VERSION;
  return p;
}
function skeleton(ptype, style, brand) {
  const T0 = PROPOSAL_TYPES[ptype] || PROPOSAL_TYPES.general, S0 = STYLES[style] || STYLES.modern;
  const slides = T0.outline.map(([type, variant, title, en]) => {
    const s = newSlide(type); if (variant) s.data.variant = variant;
    if (type === 'section') { s.data.title = title; s.data.en = en || ''; }
    else if (title) s.data.title = title;
    if (type === 'cover') { s.data.kicker = T0.name; s.data.title = (brand && brand.name ? brand.name + '\n' : '') + T0.name; }
    return s;
  });
  return { name: (brand && brand.name ? brand.name + ' ' : '') + T0.name, brand: { name: '', logo: null, ...(brand || {}) }, theme: { primary: '#1F8A4C', accent: '#E3B341', mode: S0.mode, style, ptype }, assets: {}, slides };
}
function patchSlide(s, o) {
  const def = L[s.type];
  if (o.variant && def.variants.some(v => v[0] === o.variant)) s.data.variant = o.variant;
  if (o.tone && ['auto', 'light', 'dark', 'brand'].includes(o.tone)) s.tone = o.tone;
  const d = o.data || {};
  for (const key of Object.keys(d)) {
    const v = d[key]; const ls = (def.lists || []).find(l => l.key === key);
    if (ls && Array.isArray(v)) {
      const old = s.data[key] || [];
      s.data[key] = v.slice(0, ls.max).map((it, i) => { const base = { ...ls.make(), ...(it && typeof it === 'object' ? it : { t: String(it), k: String(it), cap: String(it) }) }; base.img = old[i] ? old[i].img || null : null; return base; });
      while (s.data[key].length < ls.min) s.data[key].push(ls.make());
    } else if (['string', 'number', 'boolean'].includes(typeof v) && key !== 'img' && key !== 'img2' && key !== 'variant') s.data[key] = v;
  }
  if (o.data && o.data.variant && def.variants.some(v => v[0] === o.data.variant)) s.data.variant = o.data.variant;
}
function normalizeSlides(arr, refs) {
  if (!Array.isArray(arr)) return [];
  const out = [], used = new Set();
  const take = r => { const id = refs && r != null ? refs[String(r).trim()] : null; if (id) used.add(String(r).trim()); return id || null; };
  for (const x of arr) {
    if (!x || !L[x.type] || x.type === 'contents' || x.type === 'upload') continue;
    const s = newSlide(x.type); patchSlide(s, x);
    if (refs) {
      const src = x.data || {};
      if (src.imgRef && 'img' in s.data) s.data.img = take(src.imgRef);
      for (const ls of (L[x.type].lists || [])) if (Array.isArray(src[ls.key])) src[ls.key].forEach((it, i) => { if (it && it.ref && s.data[ls.key][i] && 'img' in s.data[ls.key][i]) s.data[ls.key][i].img = take(it.ref); });
    }
    if (x.type === 'markup') s.data.fit = 'contain';
    if (x.type === 'section') s.data.no = '';
    out.push(s);
  }
  if (out.filter(s => s.type === 'section').length >= 2 && out[0] && out[0].type === 'cover') out.splice(1, 0, newSlide('contents'));
  if (refs) out.unused = Object.keys(refs).filter(r => !used.has(r));
  return out;
}
function applyOps(project, ops) {
  const log = []; if (!Array.isArray(ops)) return log;
  for (const o of ops) {
    try {
      const idx = (parseInt(o.page, 10) || 0) - 1, s = project.slides[idx];
      switch (o.op) {
        case 'update': if (s) { patchSlide(s, o); log.push(`修改了第 ${idx + 1} 页`); } break;
        case 'retype': if (s && L[o.type]) { const title = s.data.title; s.type = o.type; s.data = L[o.type].defaults(); if (title) s.data.title = title; patchSlide(s, o); log.push(`第 ${idx + 1} 页改为${L[o.type].name}`); } break;
        case 'insert': if (L[o.type]) { const ns = newSlide(o.type); patchSlide(ns, o); const at = clamp(parseInt(o.after, 10) || 0, 0, project.slides.length); project.slides.splice(at, 0, ns); log.push(`在第 ${at} 页后新增${L[o.type].name}`); } break;
        case 'delete': if (s && project.slides.length > 1) { project.slides.splice(idx, 1); log.push(`删除了第 ${idx + 1} 页`); } break;
        case 'move': if (s) { const to = clamp((parseInt(o.to, 10) || 1) - 1, 0, project.slides.length - 1); project.slides.splice(idx, 1); project.slides.splice(to, 0, s); log.push(`第 ${idx + 1} 页移到第 ${to + 1} 页`); } break;
        case 'theme': {
          if (isHex(o.primary)) project.theme.primary = normHex(o.primary);
          if (isHex(o.accent)) project.theme.accent = normHex(o.accent);
          if (o.mode === 'light' || o.mode === 'dark') project.theme.mode = o.mode;
          if (STYLES[o.style]) project.theme.style = o.style;
          log.push('调整了整体风格与配色'); break;
        }
      }
    } catch (e) { /* skip malformed op */ }
  }
  return log;
}
function deckForAI(project) {
  return project.slides.map((s, i) => {
    const d = {};
    for (const [key, v] of Object.entries(s.data)) {
      if (key === 'img') { d.img = v ? '已放图' : '空'; continue; }
      if (key === 'fit' || key === 'no' && !v) continue;
      if (key === 'imgQuery' || key === 'imgHint') continue;
      if (Array.isArray(v)) d[key] = v.map(it => { const o = {}; for (const [kk, vv] of Object.entries(it)) o[kk] = kk === 'img' ? (vv ? '已放图' : '空') : vv; return o; });
      else d[key] = v;
    }
    return { page: i + 1, type: s.type, tone: s.tone, atmo: s.atmo ? '有氛围图' : undefined, data: d };
  });
}

/* ------------------------------------------------------------------ *
 * 14. AI prompts — shared verbatim by every environment
 * ------------------------------------------------------------------ */
const listTypes = () => Object.entries(PROPOSAL_TYPES).map(([k, v]) => `${k}（${v.name}：${v.desc}）`).join('；');
const listStyles = () => Object.entries(STYLES).map(([k, v]) => `${k}（${v.name}：${v.desc}）`).join('；');
const SCHEMA = `页面类型（type）与 data 字段：
- cover：variant 取 split|full|type|center|product|band（split 左文右图；full 满版图；type 纯色字效；center 满版图居中大标题；product 品牌色底 + 产品透明底大图；band 上方横幅图、下方标题）；kicker（项目类型）、title（项目名，可用 \\n 换行）、sub（一句副标题）、meta（提案方 · 日期）、imgHint（中文配图建议）、imgQuery（英文图库搜索词）
- section：variant 取 left|center|band|ghost|split（band 底部图带，ghost 大号底字并列出本章小节 items:[{t}]，split 左文右图；band/split 需 imgHint、imgQuery）；title（章节名 2~6 字）、en（英文小标题，大写）、desc（一句说明，可空）
- data：variant 取 stats|chart|mix|hero；title、sub（一句结论；hero 用时写一段介绍）、stats:[{value,unit,label,note}]（1~5 个，数字只能来自原文；hero 第一个是超大主数字，其余 0~3 个小数字）、chartTitle、bars:[{label,value}]（chart/mix 用）；hero（大数字 + 右侧大图，适合品牌简介、平台数据）另用 tags（/ 分隔的 2~4 个标签）、imgHint、imgQuery
- summary：variant 取 statement|pillars|list|question|concept；title、statement（≤40 字金句，statement 用；question 用时写一个引出下一部分的问题，如"同行如何借助端午氛围呈现产品特性？"；concept 用时写创意方向/概念名 2~8 字，不带书名号）、sub（concept 写一句阐释）、points:[{k,d}]（k 为 2~5 字关键词，d ≤30 字；pillars 2~4 个，list 3~6 个，concept 3~5 个关键词）
- design：variant 取 half|halfR|stage；title、intro（≤80 字）、points:[{k,d}]（≤4 个）、imgHint、imgQuery
- markup：title、sub、imgHint、imgQuery、callouts:[{t,ax,ay}]（3~6 个，t ≤20 字，ax/ay 为 0~1 标注点位置）
- combo：variant 取 grid|feature；title、sub、items:[{cap,hint,query}]（2~6 个，hint 中文配图建议，query 英文图库搜索词）
- storyboard：title、vo、frames:[{shot,tc,desc,hint,query}]（3~8 个，shot 如"镜头 01"，tc 如"00:03"，desc ≤28 字）
- process：variant 取 line|chevron|path；title、sub、steps:[{t,d}]（3~6 个，t ≤6 字，d ≤24 字）；chevron（大号序号 01 02 03 的方法论步骤，2~5 步）；path（消费 / 参与路径，一排方框）另用 hot（突出第几步，数字，可空）、stats:[{at,value,label}]（0~3 个挂在某一步下方的数据，at 为第几步）
- roadmap（排期 / 路线图）：variant 取 gantt|phases；title、phases:[{t,date,items}]（2~5 个阶段，如 预热期 / 12.01–12.19；items 为 / 分隔的 2~6 个事项，phases 用）；gantt 另用 bars:[{row,t,from,to}]（排期条，row 为行名如 官号、达人、线下、资源，行名相同的排在一行；from/to 为起止阶段序号 1~阶段数）、bigday（关键节点如 "BIGDAY 1/1"，可空）、bigdayAt（节点位于第几阶段结束处）；phases 另用 sub（贯穿全程的动作，可空）
- package（招商权益）：variant 取 tiers|matrix；title、note（页脚备注，可空）；tiers 用 tiers:[{name,price,tag,rights}]（2~4 档，price 如 "500 万"，tag 如 "限 1 席"，rights 为 / 分隔的权益）、hot（是否突出第一档）；matrix 用 h1~h4（档位名，不用的留空）、rows:[{name,a,b,c,e}]（2~9 条权益，值写 是 / 否 或数量）
- case（案例页）：variant 取 steps|result；title、sub、results:[{value,unit,label}]（0~4 个成绩，数字只能来自原文）；steps 用 cols:[{k,d,hint,query}]（2~4 步，如 科学洞察 / 目标设定 / 内容投放 / 诊断度量）、images（每列是否配图）；result 用 images:[{cap,hint,query}]（1~3 张现场图）
- screens（界面 / 资源位）：variant 取 row|detail；title；row 用 items:[{tag,cap,hint,query}]（2~5 个资源位，如 开屏、信息流、话题页）；detail 用 notes:[{t,d}]（2~9 个界面标注）、two（是否两部手机）、imgHint、imgQuery
- logos（合作伙伴 / 客户）：variant 取 grid|band；title、sub；items:[{name,note}]（2~12 个合作方）；band 另用 statement（一句话说明合作意义）
- vi（VI 视觉规范）：variant 取 logo|colors|type|graphics；title、en；logo 用 points:[{k,d}]（0~4 条使用规范）；colors 用 colors:[{name,hex,note}]（2~6 个标准色，hex 如 #D7262F）；type 用 fonts:[{fk,use}]（1~3 个，fk 取 sans|serif|brush|xiaowei|qingke|kuaile|mono|cond）、sample（示例文字）；graphics 用 intro（一段说明）、items:[{cap,hint,query}]（2~6 个辅助图形）
- market（市场分析）：variant 取 trend|bars|hbar|share|pie|pyramid|search；search（用户在搜什么：中间一个搜索框，四周是关键词）用 label（搜索框标签，默认"搜索"）、query（搜索框里的词）、keywords:[{t,w}]（4~12 个，w 为权重 1~3）、sub；title、sub（一句话结论 ≤30 字）、findings:[{k,d}]（0~3 个关键发现，pyramid 不用）、source（数据来源，可空）；trend（折线，看趋势）、bars（柱状图，看逐年变化）、hbar（条形排名，看品牌/渠道排名，第一行最突出）都用 chartTitle、series:[{label,value}]（2~10 项）；share（横向占比条）与 pie（饼图/环形图，donut:false 为实心饼）用 totalValue、totalUnit、totalLabel（市场总量，如 "30""亿元""2025 年市场规模"；原文没有总量就三项都留空，不要填项目个数）、shares:[{name,value}]（2~8 项，value 为百分比数字）；pyramid（金字塔，适合价格带、产品层级、市场分层）用 tiers:[{name,band,d,tag}]（2~5 层，自上而下由高到低，band 价格带或规模，d 代表品牌或说明，tag 可标"本品切入"等，可空）。数字只能来自原文，原文没有就不要用 market
- competitor（竞品分析）：variant 取 table|cards|map|price|score；title、sub（一句结论）；table 用 h0（首列表头，默认"品牌"）、h1~h4（对比维度，2~4 个，不用的留空）、rows:[{name,a,b,c,e}]（2~6 行，第一行是本品，a/b/c/e 对应 h1~h4）；cards 用 items:[{name,pos,plus,minus,hint,query}]（2~4 个竞品，pos 一句定位，plus 优势，minus 不足）；map 用 xLow、xHigh、yLow、yHigh（两条轴两端的词）、dots:[{name,ax,ay}]（2~10 个，第一个是本品，ax/ay 为 0~1，ay 越大越靠上）、points:[{k,d}]（0~3 个结论）；price（价格带）用 unit（如"元"）、ranges:[{name,lo,hi}]（2~8 个，第一个是本品，lo/hi 为数字）；score（评分对比）用 b1~b3（品牌名，b1 为本品，b3 可空）、max（满分，默认 10）、dims:[{name,a,b,c}]（2~6 个维度，a/b/c 为 b1~b3 的分数）
- persona（用户分析）：variant 取 single|groups|journey|scenes|moment|rings；rings（人群圈层，同心圆由内到外）用 rings:[{name,d}]（2~4 层，第一层是核心人群）；title；single 用 name（"名字，年龄"）、profile（职业/城市/状态）、tags（用 / 分隔的 3~6 个标签）、quote（一句典型原话）、needs:[{t}]、pains:[{t}]（各 0~4 个）、imgHint、imgQuery；groups 用 items:[{name,desc,quote,tags,hint,query}]（2~4 个人群）；journey 用 stages:[{t,d,mood,note}]（3~6 个阶段，d 行为/触点，mood 情绪 1~5，note 机会点）；scenes（使用场景）用 scenes:[{time,place,t,d,hint,query}]（2~4 个，time 如"08:30"，place 如"通勤路上"，t 场景名，d 用户在做什么、需要什么）；moment（场景特写，一张大图讲一个场景）用 facts:[{k,v}]（2~4 个，如 时间/地点/人物/需求）、quote（这一刻用户心里的一句话）、imgHint、imgQuery
- selling（产品卖点）：variant 取 hero|grid|spec|keywords|bigword|formula|matrix；matrix（产品数据卡，2~4 个产品各配一个大数字）用 products:[{name,value,unit,label,hint,query}]；title；hero 用 points:[{k,d}]（2~6 个，环绕产品图）、imgHint、imgQuery；grid 用 items:[{k,d,hint,query}]（2~4 个）；spec 用 usp（一句话最大卖点）、specs:[{k,v}]（0~6 个参数）、imgHint、imgQuery；keywords（关键词大字）用 words:[{w,en,d}]（2~4 个，w 为 1~2 个字的关键词如"鲜"，en 英文，d 一句说明）、usp（一句总结，可空）；bigword（一字定调，整页一个大字）用 word（1~2 个字）、wordEn、usp、points:[{k,d}]（2~4 个）；formula（卖点公式 A + B + C = 结果）用 parts:[{k,d}]（2~4 项）、result（结果，≤8 字）、resultD、sub（一句总结，可空）
- compare（视觉对比）：variant 取 lineup|posters|versus；title、sub（一句结论）、mineLast（最后一项是不是本品，默认 true）；lineup（竞品包装/产品并排）用 items:[{name,desc,colors,score,hint,query}]（2~6 个，desc 一句包装特征，colors 为 2~4 个色值如 "#FFFFFF #1CB5E0"，score 辨识度 0~5，可空）；posters（过往海报或竞品海报对比）用 ratio（如 "3:4"）、posters:[{name,note,hint,query}]（2~5 张，note 一句点评）；versus（现状与新方案前后对比）用 pair:[{label,d,hint,query}]（正好 2 项，第一项现状，第二项新方案）
- wip（设计过程）：variant 取 steps|sketch|versions；title；steps（参考→草图→深化→定稿）用 steps:[{t,d,hint,query}]（2~5 步）；sketch（一张草图配说明）用 tag（如"过程稿"）、intro、notes:[{k,d}]（0~4 个）、imgHint、imgQuery；versions（版本迭代）用 versions:[{v,d,hint,query}]（2~4 版，v 如 "V1"）
- mood（氛围页：标语 + 画面）：variant 取 full|split|board；slogan（标语 ≤16 字，可用 \n 分行）、en（英文一句，可空）、sub（一句说明，可空）；full（满版图上的标语，centered:true 居中）与 split（左图右字，国潮风格自动竖排）用 imgHint、imgQuery；board（情绪板，一大多小）用 images:[{hint,query}]（3~5 张）
- series（系列海报）：variant 取 row|hero|wall；title、sub（可空）、ratio（海报比例，如 "3:4"、"9:16"）、names（是否显示名称）、items:[{name,hint,query}]（row 2~6 张，hero 3~5 张第一张为主海报，wall 4~10 张两行）
- closing：variant 取 type|split；title、sub、meta
内容页都可带 eyebrow（省略时自动显示所属章节）与 hl（标题里要高亮的一个关键词，必须是标题原文的一部分，如标题"小红书已经成为国民生活指南"的 hl 为"国民生活指南"，可空）。目录页自动生成，不要输出 contents；upload（上传页）由用户自己放入现成页面，不要输出。`;
const prompts = {
  analyze(doc) {
    return `你是 4A 广告公司的品牌策略总监。阅读下面的文档，判断品牌定位与调性，并为提案 PPT 选择提案类型、视觉风格和配色。
可选提案类型 proposalType：${listTypes()}
可选视觉风格 style：${listStyles()}
规则：文档里写明了品牌色就用它；没有写明时，根据品类、定位与调性推荐。中国传统、非遗、白酒、茶、国货等用 guochao 或 elegant 时要说明理由。
只回复一个 JSON 对象：
{"brand":"品牌名","industry":"行业","positioning":"一句话定位","tone":["3~5 个调性关键词"],"audience":"目标人群","proposalType":"…","style":"…","palette":{"primary":"#RRGGBB","accent":"#RRGGBB","mode":"light 或 dark"},"reasons":{"type":"≤24 字","style":"≤24 字","palette":"≤24 字"}}

文档：
"""
${String(doc).slice(0, 40000)}
"""`;
  },
  generate(doc, profile) {
    const T0 = PROPOSAL_TYPES[profile.proposalType] || PROPOSAL_TYPES.general;
    const outline = T0.outline.filter(o => o[0] !== 'contents').map(o => o[0] + (o[1] ? ':' + o[1] : '') + (o[2] ? `「${o[2]}」` : '')).join(' → ');
    return `你是资深广告公司的提案策划与版式设计师。请把下面的文档整理成一份中文提案 PPT 的页面结构。
品牌档案：${JSON.stringify({ brand: profile.brand, industry: profile.industry, positioning: profile.positioning, tone: profile.tone, audience: profile.audience })}
提案类型：${T0.name}。参考结构（按文档内容增删，不必照抄）：${outline}
视觉风格：${(STYLES[profile.style] || STYLES.modern).name}。文案语气要贴合品牌调性${profile.style === 'guochao' ? '，可适度使用四字短语与古典意象' : ''}。
原则：
1. 提炼而不是照搬：标题不超过 14 字，正文短句化。
2. 数字只能使用文档中出现过的，不得编造数据；没有数据就不要用 data 页。
3. 每个图片位都要给 imgHint（中文，说明画面）和 imgQuery（2~4 个英文关键词，用于 Pixabay 图库搜索）。
4. 总页数 8~24 页。第一页 cover，最后一页 closing。
5. 文档里的结论句、「所以」句和关键数字要保留：结论可作页面标题或 sub，不要只留空泛的小标题；估算、预测的数字要在 note、source 或 chartTitle 里注明。
6. 选能表达内容结构的页面：有时间序列用 market:trend 或 bars，有占比用 pie/share，有排名用 hbar，有价格带或层级用 pyramid，有竞品打分用 competitor:score，有包装或海报对比用 compare，有分阶段排期用 roadmap，有合作档位与权益用 package，有案例拆解或往期成绩用 case，有资源位或界面截图用 screens，有合作方名单用 logos，有标准色与字体用 vi，有用户路径用 process:path，不要把所有内容都做成 summary:list。
${SCHEMA}
只回复一个 JSON 对象：{"slides":[{"type":"cover","variant":"split","data":{...}}, ...]}

文档：
"""
${String(doc).slice(0, 60000)}
"""`;
  },
  edit(project, curIdx, instruction) {
    return `你是提案 PPT 的设计助手。用户会用一句话提出修改意见，请把它转换成对演示文稿的修改操作。
当前演示文稿（page 从 1 开始，img 字段只显示是否已放图）：
${JSON.stringify({ theme: { primary: project.theme.primary, accent: project.theme.accent, mode: project.theme.mode, style: project.theme.style }, slides: deckForAI(project) })}
用户正在看第 ${curIdx + 1} 页。「这一页」「这里」「当前页」指第 ${curIdx + 1} 页。
可用视觉风格 style：${listStyles()}
${SCHEMA}
可用操作 ops：
- {"op":"update","page":n,"variant"?:"…","tone"?:"auto|light|dark|brand","data":{只写要改的字段；数组字段要给出完整新数组}}
- {"op":"retype","page":n,"type":"…","variant"?:"…","data":{…}}  把该页换成另一种页面类型
- {"op":"insert","after":n,"type":"…","variant"?:"…","data":{…}}  在第 n 页之后插入（after=0 表示最前）
- {"op":"delete","page":n}
- {"op":"move","page":n,"to":m}
- {"op":"theme","primary"?:"#RRGGBB","accent"?:"#RRGGBB","mode"?:"light|dark","style"?:"…"}
规则：不要改动用户没提到的内容；不要编造数据；图片由用户自己放，不要输出 img 字段。如果意见含糊，做最合理的一种改法并在 reply 里说明。
用户意见：「${instruction}」
只回复一个 JSON 对象：{"reply":"一句中文，说明你改了什么","ops":[...]}`;
  },
  beautify(pagesText, profile, imageCount) {
    const T0 = PROPOSAL_TYPES[profile.proposalType] || PROPOSAL_TYPES.general;
    return `你是资深广告公司的版式设计师。用户上传了一份排版朴素的 PPT（或 PDF），下面是逐页提取出的内容。请在不丢失信息的前提下，把它重新编排成专业、美观的提案页面。
品牌档案：${JSON.stringify({ brand: profile.brand, industry: profile.industry, positioning: profile.positioning, tone: profile.tone })}
提案类型：${T0.name}；视觉风格：${(STYLES[profile.style] || STYLES.modern).name}。
原则：
1. 保留原有信息与先后顺序，不得编造内容或数据；文字可以提炼成更短的标题和要点。
2. 信息过多的页面可以拆成两页，过碎的页面可以合并；为每页选择最合适的页面类型。
3. 原文件里的图片用 [img1] 这样的编号表示，共 ${imageCount} 张。把它们放进最合适的图片位：cover/design/markup/closing 以及 persona（single）、selling（hero、spec）用 data.imgRef（如 "img2"），combo、competitor（cards）、persona（groups）、selling（grid）的 items[].ref 和 storyboard 的 frames[].ref 也可以引用。每张图最多用一次；没有合适图片的图片位给 imgHint 与 imgQuery。
4. 第一页是 cover，最后一页是 closing（原文件没有结尾页就补一页）。
5. 标注「原样保留」的页面（原文件这一页没有可提取的文字，多为整页图片），在原来的位置输出 {"type":"keep","ref":"imgN"}，不要改写。
${SCHEMA}
只回复一个 JSON 对象：{"slides":[{"type":"cover","variant":"split","data":{...}}, ...]}

原文件内容：
"""
${String(pagesText).slice(0, 60000)}
"""`;
  },
  atmosphere(project, idx) {
    const s = project.slides[idx] || {}, d = s.data || {};
    const txt = [d.title, d.statement, d.sub, d.intro].filter(Boolean).join('；').slice(0, 300);
    return `你是品牌视觉总监，为提案 PPT 的一页挑选「氛围图」：烘托情绪与意境的配图，不是产品图。
品牌：${project.brand.name || '未命名'}；品牌描述：${project.brand.desc || '无'}；视觉风格：${(STYLES[project.theme.style] || STYLES.modern).name}。
这一页的内容：${txt || '（无文字）'}
请给出 4 个氛围图方向，每个方向包含：title（中文 4~10 字）、query（2~4 个英文关键词，用于 Pixabay 开源图库搜索，画面要具体）、prompt（中文 AI 生图提示词，40~80 字，写清主体、场景、光线、构图、画风，适合作为横版背景，画面上不要出现文字和品牌标识）。
例如白酒品牌可以是「古人月下对饮」「竹林宴饮」等东方意境。
只回复 JSON 数组：[{"title":"…","query":"…","prompt":"…"}]`;
  },
  readPage(no, total) {
    return `这是一份文档第 ${no}/${total} 页的整页图片（文字是图片，无法直接复制）。请把页面内容完整转写成 Markdown，后面会用它整理成提案 PPT：
1. 按阅读顺序转写全部文字（多栏时先左后右、先上后下），不要总结、不要改写、不要补充页面上没有的内容；看不清的字用 □。
2. 标题层级：大标题用 #，章节（如"01 行业"）用 "## 01 行业"，小标题用 ###；要点用 "- "；正文段落原样保留。
3. 表格：每行写成 "- 单元格 | 单元格 | 单元格"，第一行是表头。圆点或星级评分写成数字，如 ●●●○○ 写成 3。
4. 图表：先写图表标题和单位，再把每个数据点写成 "- 数值 | 标签"（数值在前）；只能估读时写"约"。定位图、气泡图写出每个点的名称和大致位置。
5. 卡片、标签、结论框照实转写，可在前面注明"结论："、"所以："等原有字样。
6. 照片、插图、图片占位写成 "[图片：一句话描述]"。
7. 页眉、页脚、页码不要转写。
只输出 Markdown 正文，不要任何解释。`;
  },
  palette(brand, desc) {
    return `你是品牌视觉设计师。为下面的品牌推荐 3 套用于提案 PPT 的配色。
品牌：${brand || '未命名'}；描述：${desc || '无'}
只回复 JSON 数组：[{"name":"2~6 字配色名","primary":"#RRGGBB","accent":"#RRGGBB","mode":"light|dark","style":"${Object.keys(STYLES).join('|')}","why":"≤18 字理由"}]`;
  },
};
function parseJSON(text) {
  if (text && typeof text === 'object') return text;
  const s = String(text || '').trim();
  try { return JSON.parse(s); } catch (e) { }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { try { return JSON.parse(fence[1]); } catch (e) { } }
  const a = Math.min(...['{', '['].map(c => { const i = s.indexOf(c); return i < 0 ? Infinity : i; })), b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (isFinite(a) && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { } }
  throw { code: 'invalid_json', text: s };
}

root.DeckEngine = {
  VERSION, SPEC, FONTS, FONT_LINK, STYLES, PRESETS, PROPOSAL_TYPES, LAYOUTS: L, TYPE_ORDER, MARKUP_BOX,
  injectFonts, onFontsReady(fn) { _onFonts = fn; }, setPlatform, ATMO, prepLogo,
  theme, build, paint, validate, toPptx, fontsUsed, sections,
  newSlide, migrate, skeleton, normalizeSlides, applyOps, patchSlide, deckForAI, prompts, parseJSON, SCHEMA,
  util: { clamp, num, splitTags, hexToRgb, rgbToHex, rgbToHsl, hslToHex, hsl, mix, contrast, ensure, onColor, isHex, normHex, pad2, getP, setP, uid, clone, esc, wrapLines, textW },
};
})(typeof window !== 'undefined' ? window : globalThis);
