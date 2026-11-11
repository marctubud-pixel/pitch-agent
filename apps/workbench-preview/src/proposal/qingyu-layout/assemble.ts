import { compile } from '../deck-studio/engine';
import { prepareResearchDeck } from '../deck-studio/research';
import type { Deck, Draft, Media, Template, Page, TextNode } from '../deck-studio/model';
import { imageSignature } from '../qingyu-report/pptx-r3';
import { resolveDirectionConcept } from '../qingyu-visual/concept-images';
import { prepareStrategySummary, type QingyuLayoutInput } from './preview';
import manifest from './manifest.json';

export async function loadLayoutImages(signal: AbortSignal): Promise<Media[]> {
  return Promise.all(manifest.images.map(async image => {
    signal.throwIfAborted();
    const origin = globalThis.location?.origin ?? 'http://localhost', target = new URL(image.path, origin);
    if (target.origin !== origin || target.pathname !== image.path || target.search || target.hash || image.path !== `/visual-concepts/qingyu-20261110/${image.id}.png`) throw new Error('设计试稿路径身份失配');
    const response = await fetch(target.href, { signal, redirect: 'error', cache: 'no-cache' });
    if (!response.ok || (response.url && response.url !== target.href)) throw new Error('设计试稿读取失败：' + image.id);
    const buffer = await response.arrayBuffer(), bytes = new Uint8Array(buffer);
    signal.throwIfAborted();
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
    const view = new DataView(buffer);
    if (!imageSignature(bytes, 'image/png') || sha !== image.sha256 || bytes.length < 24 || view.getUint32(16) !== image.width || view.getUint32(20) !== image.height) throw new Error('设计试稿身份核对失败：' + image.id);
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return { id: image.id, data: `data:image/png;base64,${btoa(binary)}`, width: image.width, height: image.height, alt: image.identity };
  }));
}
export async function prepareQingyuLayoutDeck(input: QingyuLayoutInput, signal: AbortSignal): Promise<Deck> {
  signal.throwIfAborted();
  const [research, images] = await Promise.all([prepareResearchDeck(input.research, signal), loadLayoutImages(signal)]);
  signal.throwIfAborted();
  const { bundle, basis } = input.themes.preview;
  const image = (id: string) => { const result = images.find(item => item.id === id); if (!result) throw new Error('缺少设计试稿：' + id); return result; };
  const inputSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.context))), b => b.toString(16).padStart(2, '0')).join('');
  const notes = (additional: unknown) => JSON.stringify({ inputIdentity: { sha256: inputSha256, proposal: 'qingyu-pack', briefVersion: input.brief.version, currency: input.themes.kind }, manifest, basis, brief: input.brief, originalCopy: bundle.currentRound.draft, references: bundle.identity.sourceRecords, additional });
  const draft = (id: string, title: string, chapter: string, template: Template, caption: string, additional: unknown = null): Draft => ({ id, title, chapter, template, eyebrow: chapter, caption, notes: notes(additional) });
  const theme = { primary: '#002FA7', accent: '#A9C545', style: 'business', mode: 'light' } satisfies Parameters<typeof compile>[2];
  const front = [
    draft('qy-layout-cover', '青屿 · 包装提案', '提案与任务', { kind: 'cover.split', image: image('n7-main'), sub: '无糖茶包装方向\n演练 · 排版预览', meta: '本地排版稿 · 待人工终审' }, '封面用原推荐方向生成试稿，不表示用户选案或视觉终稿。'),
    draft('qy-layout-task', '任务与边界', '提案与任务', { kind: 'summary.list', points: [
      { k: '任务', d: input.brief.background },
      { k: '人群与渠道', d: input.brief.audience },
      { k: '目标', d: input.brief.objectives.join('；') },
      { k: '规格与资产', d: input.brief.constraints.join('；') },
    ] }, '500ml、6至8元、25至34岁城市办公者、便利店/电商、青色山形均为题设，非市场验证。'),
  ];
  const directions: Draft[] = [];
  for (const direction of bundle.currentRound.directions) {
    const concept = resolveDirectionConcept(bundle, direction.id);
    if (!concept) throw new Error('当前文案与设计试稿方向失配');
    const caption = 'AI生成设计试稿；图外为封存主副文，未完整落在实际图上。茶种、完整标签、触点与读图效果待验证。';
    directions.push(draft(`qy-${direction.id}-main`, direction.name, '文案与视觉', { kind: 'design.half', image: image(`${direction.id}-main`), intro: direction.slogan, points: [{ k: '副文', d: direction.subline }] }, caption, { direction, concept }));
    directions.push(draft(`qy-${direction.id}-mockups`, direction.name + ' · 正侧背模拟样机', '文案与视觉', { kind: 'design.stage', image: image(`${direction.id}-mockups`), intro: 'AI生成设计试稿 · 背面为标签示意\n\n' + concept.notes.join('\n'), points: [] }, '整板等比展示；不是实物拍摄、印前生产稿或已通过的视觉终稿。', { direction, concept }));
  }
  const rec = bundle.recommendation, recommended = bundle.currentRound.directions.find(item => item.id === rec.directionId);
  if (!recommended) throw new Error('原推荐方向缺失');
  const end = [
    draft('qy-layout-compare', '三方向对照', '比较与取舍', { kind: 'compare.lineup', items: bundle.currentRound.directions.map(direction => ({ image: image(`${direction.id}-main`), name: direction.name, desc: resolveDirectionConcept(bundle, direction.id)?.description ?? '' })), sub: '当前R2三方向 · 生成设计试稿 · 人群与触点效果未验证' }, '同尺度等比展示，不构成视觉评分或用户选择。', bundle.currentRound.directions),
    draft('qy-layout-recommendation', '原推荐与取舍 · ' + recommended.name, '比较与取舍', { kind: 'summary.list', points: [
      ...rec.reasons.map((d, i) => ({ k: `原推荐理由 ${i + 1}`, d })),
      ...rec.tradeoffs.map((d, i) => ({ k: `取舍 ${i + 1}`, d })),
      { k: '推荐范围', d: '仅为本地包装文字概念优先，不表示用户选案或实图效果通过。' },
    ] }, '本地包装文字概念优先方向；原概念理由不表示实图效果已验证，也不是用户选案。', rec),
    draft('qy-layout-scope', '资料说明与适用范围', '资料与限制', { kind: 'summary.list', points: [
      { k: '研究与价格', d: '研究待补。2023历史样本与2026饮料情景分开使用；R2为历史报价，不是2026现价或支付意愿。' },
      { k: '产品设定', d: '配方使用虎跑泉水为用户演练设定；茶种、完整配料、用水比例与来源凭据仍待核。' },
      { k: '图像与推荐', d: '六张图为生成试稿；图外封存文案不代表已印在瓶身。推荐仅为文字概念优先，视觉与读图效果待验证。' },
      { k: '资料记录', d: '完整来源、报价条件、封存原文、输入身份与适用限制保留在逐页备注。' },
    ] }, '研究采用r6；版式规则r7。既有缺口随稿保留，本稿不签正式业务通过或终审。', { sources: input.research.report.sources, prices: input.research.prices, limits: manifest.limits }),
  ];
  const pages = [...compile(front, '青屿 · 演练排版预览', theme), ...research.pages, ...prepareStrategySummary(), ...compile(directions, '青屿 · 生成设计试稿', theme), ...compile(end, '青屿 · 演练排版预览', theme)];
  signal.throwIfAborted();
  return { title: '青屿 · 包装提案', fileName: `青屿_${input.themes.kind === 'historical' ? '历史任务卡_' : ''}本地排版稿.pptx`, status: '演练 · 本地排版预览 · 待人工终审', style: 'qingyu-layout-r1', pages: numberLayoutPages(emphasizeDirectionCopy(pages)).map(page => ({ ...page, notes: page.notes + '\n页面适用范围：' + page.caption + '\n' + notes({ pageId: page.id, scope: '研究r6与版式r7分开；未签业务通过' }) })) };
}


export function numberLayoutPages(pages: Page[]): Page[] {
  return pages.map((page, index) => {
    const label = String(index + 1).padStart(2, '0');
    const isPageNumber = (node: Page['nodes'][number]): node is TextNode => node.kind === 'text' && (
      (node.y === 686 && node.w === 100 && node.h === 18 && (node.x === 1100 || node.x === 520)) ||
      (page.template === 'strategy.venn' && node.x === 1170 && node.y === 688 && node.w === 54 && node.h === 22)
    );
    const existing = page.nodes.filter(isPageNumber);
    if (existing.length > 1) throw new Error('页码图元重复：' + page.id);
    const nodes = page.nodes.map(node => isPageNumber(node) ? { ...node, lines: [label], runs: [] } : node);
    if (!existing.length) nodes.push({ kind: 'text', x: 1100, y: 686, w: 100, h: 18, lines: [label], runs: [], size: 12, face: 'PingFang SC', weight: 400, color: '#667384', align: 'right', valign: 'top', lh: 1.2, ls: 0, opacity: 1 });
    return { ...page, nodes };
  });
}


function emphasizeDirectionCopy(pages: Page[]): Page[] {
  function lines(value: string, width: number, size: number, face: string): string[] {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) throw new Error('文字测量不可用');
    ctx.font = `400 ${size}px "${face}"`;
    const result: string[] = [];
    for (const paragraph of value.split('\n')) {
      let line = '';
      for (const ch of paragraph) {
        if (line && ctx.measureText(line + ch).width > width) { result.push(line); line = ch; } else line += ch;
      }
      result.push(line);
    }
    return result;
  }
  return pages.map(page => {
    if (!/^qy-(n7|k4|v2)-main$/.test(page.id)) return page;
    const nodes = page.nodes.map(node => {
      if (node.kind !== 'text') return node;
      if (node.x === 700 && node.y === 248) return { ...node, size: 34, color: '#17273C', lines: lines(node.lines.join(''), 500, 34, node.face) };
      if (node.x === 820 && node.y === 406) return { ...node, x: 700, y: 445, w: 500, h: 140, size: 22, lines: lines(node.lines.join('').replace(/([。！？])/g, '$1\n').trimEnd(), 500, 22, node.face) };
      return node;
    });
    nodes.push({ kind: 'text', x: 700, y: 604, w: 500, h: 54, lines: ['AI生成试稿；图外为封存原文。', '图内未完整落字，标签与效果待验证。'], runs: [], size: 15, face: 'PingFang SC', weight: 400, color: '#667384', align: 'left', valign: 'top', lh: 1.4, ls: 0, opacity: 1 });
    return { ...page, nodes };
  });
}
