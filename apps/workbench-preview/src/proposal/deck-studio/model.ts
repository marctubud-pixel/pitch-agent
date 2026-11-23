import type { Plot } from './chart-layout';
export type Box = { x: number; y: number; w: number; h: number; };
export type Media = { id: string; data: string; width: number; height: number; alt: string; };
export type Point = { id: string; label: string; spec: string; group: string; value: number; };
export type Chart =
  | {
    kind: 'prices';
    id: string;
    title: string;
    groups: string[];
    points: Point[];
    target: [number, number];
    unknown: string;
  }
  | {
    kind: 'line' | 'bar' | 'column';
    id: string;
    title: string;
    basis: string;
    labels: string[];
    values: number[];
    unit: string;
    min: number;
    max: number;
  };
type Pair = { k: string; d: string; };
export type Template =
  | { kind: 'section.left'; no?: string; desc: string; }
  | { kind: 'market.bars'; series: {label: string; value: number | string}[]; sub: string; unit?: string; chartTitle?: string; source?: string; findings?: Pair[]; }
  | { kind: 'competitor.table'; headers: string[]; rows: {name: string; values: string[]}[]; sub: string; }
  | { kind: 'persona.single'; name: string; profile: string; image?: Media; implication?: string; quote?: string; tags?: string; needs?: string[]; pains?: string[]; }
  | { kind: 'selling.spec'; usp: string; specs: {k: string; v: string}[]; image?: Media; }
  | { kind: 'summary.pillars'; points: Pair[]; }
  | { kind: 'mood.split'; slogan: string; sub: string; image: Media; en?: string; }
  | { kind: 'series.row'; items: {name: string; image: Media}[]; sub: string; ratio?: string; }
  | { kind: 'data.hero'; stats: { value: string; unit: string; label: string; }[]; sub: string; chart: Chart; }
  | { kind: 'combo.grid'; items: { item: Media | Chart; cap: string; }[]; }
  | { kind: 'compare.lineup'; items: { image: Media; name: string; desc: string; }[]; sub: string; }
  | ({ kind: 'upload.framed'; } & ({ chart: Chart; } | { image: Media; }))
  | { kind: 'summary.list'; points: Pair[]; }
  | { kind: 'summary.statement' | 'summary.question'; statement: string; sub: string; }
  | { kind: 'cover.split'; image: Media; sub: string; meta: string; }
  | { kind: 'cover.type' | 'closing.type'; sub: string; meta: string; }
  | { kind: 'contents.list'; items: { title: string; page?: number; }[]; }
  | { kind: 'design.half' | 'design.halfR' | 'design.stage'; image: Media; intro: string; points: Pair[]; fit?: 'contain' | 'cover'; };
export type Draft = { id: string; title: string; eyebrow: string; chapter: string; notes: string; caption: string; highlight?: string; tone?: 'brand' | 'light'; template: Template; };
export type Theme = { primary: string; accent: string; style: 'business' | 'elegant' | 'modern' | 'editorial' | 'bold' | 'guochao' | 'tech' | 'street' | 'playful' | 'fresh' | 'neon' | 'warm' | 'panel'; mode: 'light' | 'dark'; gradient?:'none'|'soft'|'deep'; fonts?:{display?:string;body?:string}; brandName?:string; brandLogo?:Media; agencyName?:string; agencyLogo?:Media; };
export type Font = { size: number; face: string; fallback?: string; weight: number; color: string; };
export type TextNode = Box & Font & {
  kind: 'text';
  vertical?: boolean;
  highlight?: {word: string; color: string};
  rotate?: number;
  lines: string[];
  runs: (Font & { text: string; })[];
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  lh: number;
  ls: number;
  opacity: number;
};
export type Gradient = {from: string; to: string; angle: number};
export type Node = (TextNode | (Box & { kind: 'rect' | 'ellipse'; gradient?: Gradient; fill: string | null; stroke: string | null; lw: number; opacity: number; radius: number; })
  | { kind: 'line'; x1: number; x2: number; y1: number; y2: number; color: string; width: number; opacity: number; }
  | (Box & { kind: 'image'; image: Media; bind: string; })
  | (Box & { kind: 'chart'; chart: Chart; bind: string; color: string; plot: Plot; })) & {rotate?: number};
export type Page = Pick<Draft, 'id' | 'title' | 'chapter' | 'notes' | 'caption'> & { template: Template['kind'] | 'strategy.venn'; bg: string; nodes: Node[]; };
export type Deck = { theme?: Theme; title: string; fileName: string; pages: Page[]; status: string; style: string; };

// Both editable PowerPoint runs and the SVG preview colour the exact same characters.
export function highlightedParts(text: string, highlight: TextNode['highlight']) {
  if (!highlight?.word) return [{text}];
  const pieces=text.split(highlight.word);
  return pieces.flatMap((piece,i)=>[
    ...(i ? [{text:highlight.word,color:highlight.color}] : []),
    ...(piece || pieces.length===1 ? [{text:piece}] : []),
  ]);
}
