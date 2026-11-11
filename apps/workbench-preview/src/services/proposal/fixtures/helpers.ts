/** Small builders that keep the demo fixtures readable. All artwork is generated illustration. */
import type { ArtSpec, CanDesign, EvidenceRef, LayoutStyle, MockupSpec, PackSpec, PosterSpec, SceneId, SceneSpec, ScoreLine, StageId, StageState } from '../../../domain/proposal';
import { contentReviewOwner } from '../../../proposal/stageOwners';

export const scene = (s: SceneId, palette: string[], extra: Partial<SceneSpec> = {}): SceneSpec => ({ kind: 'scene', scene: s, palette, ...extra });

export const poster = (sc: SceneSpec, headline: string, brand: string, extra: Partial<PosterSpec> = {}): PosterSpec => ({
  kind: 'poster',
  scene: sc,
  headline,
  brand,
  typeLayout: 'sky',
  typeface: 'serif',
  ink: '#f6f1e7',
  ...extra,
});

export const pack = (format: PackSpec['format'], view: PackSpec['view'], design: CanDesign): PackSpec => ({ kind: 'pack', format, view, design });

export const mock = (surface: MockupSpec['surface'], inner: MockupSpec['inner']): ArtSpec => ({ kind: 'mockup', surface, inner });

export const claim = (ref: string, label: string): EvidenceRef => ({ kind: 'claim', ref, label });
export const kase = (ref: string, label: string): EvidenceRef => ({ kind: 'case', ref, label });
export const brief = (ref: string, label: string): EvidenceRef => ({ kind: 'brief', ref, label });
export const chart = (ref: string, label: string): EvidenceRef => ({ kind: 'chart', ref, label });

export const scores = (...rows: Array<[string, number, string?]>): ScoreLine[] => rows.map(([criterion, score, note]) => ({ criterion, score, note: note ?? '' }));

export const avg = (rows: ScoreLine[]) => Math.round((rows.reduce((s, r) => s + r.score, 0) / rows.length) * 100) / 100;

export const stage = (status: StageState['status'], summary: string, lead: string, updatedAt: string | null, version = 1): StageState => ({ status, summary, lead, updatedAt, version });

export const LEADS: Record<StageId, string> = {
  brief: "提案总监",
  research: "调研负责人",
  strategy: "策略负责人",
  themes: "文案负责人",
  visual: "视觉负责人",
  content_review: contentReviewOwner,
  layout: "排版负责人",
  delivery: "提案总监",
};

/**
 * Slide style built from the supplied blue corporate PowerPoint deck. Each decision names the
 * composition it takes from that deck, so the mapping can be checked against the reference.
 */
export const COBALT_STYLE: LayoutStyle = {
  id: 'cobalt',
  name: "钴蓝与青柠",
  reference: "参考版式：企业介绍演示。",
  idea: "开场、推荐与结束采用整版钴蓝，中间使用浅灰和浅青柠色，配短提示卡与圆形箭头。",
  decisions: [
    "封面为钴蓝底、醒目短标题及大圆角主视觉。",
    "大圆角图片与短提示卡交叠。",
    "数字以钴蓝为主，辅以青柠色标记。",
    "方向采用钴蓝与青柠卡片交替对照，结束页回到钴蓝。",
  ],
  palette: { paper: '#f0f0ee', ink: '#141815', accent: '#3d4fe0', muted: '#6b706a', highlight: '#d8f06b', wash: '#f2f7d9' },
  typeface: 'grotesk',
};

/** Slide style built from the supplied case-study grid; keeps the editorial serif headlines. */
export const EDITORIAL_STYLE: LayoutStyle = {
  id: 'editorial',
  name: "编辑式",
  reference: "参考版式：案例卡片网格。",
  idea: "暖白卡片置于彩色底板，图片采用圆角框、缺口箭头与杂志式说明。",
  decisions: [
    "每页使用底板上的卡片结构，主题页采用对应方向的色彩。",
    "左上角短标题，圆角图片，右下角缺口处放浅色箭头。",
    "图片下只保留标题、一行说明及分类标签。",
    "方向用案例网格对照，结论页底部使用深色短句。",
  ],
  palette: { paper: '#f8f6f1', ink: '#1b1a1f', accent: '#b9b0dc', muted: '#6f6c73', highlight: '#f2c59b', wash: '#b9b0dc' },
  typeface: 'serif',
};

/** Slide style built from the supplied marketing deck ("How We Drive Growth?"). */
export const STUDIO_STYLE: LayoutStyle = {
  id: 'studio',
  name: "工作室式",
  reference: "参考版式：营销策略与品牌识别演示。",
  idea: "浅紫灰底上的白色页面，粗体标题、竖版编号图片卡与明确色块。",
  decisions: [
    "左上角放深色编号，右上角标注客户。",
    "三个方向以竖版编号图片卡呈现，底部为带勾选标记的色条。",
    "数字置于淡紫色块，结论使用青柠与紫色色块。",
    "文字页左下角使用细线箭头建立视觉锚点。",
  ],
  palette: { paper: '#ffffff', ink: '#111214', accent: '#6f63f0', muted: '#6d6f78', highlight: '#d4f06b', wash: '#d6daee' },
  typeface: 'grotesk',
};
