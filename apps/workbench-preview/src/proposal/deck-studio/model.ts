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
    kind: 'line' | 'bar';
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
  | { kind: 'data.hero'; stats: { value: string; unit: string; label: string; }[]; sub: string; chart: Chart; }
  | { kind: 'combo.grid'; items: { item: Media | Chart; cap: string; }[]; }
  | { kind: 'compare.lineup'; items: { image: Media; name: string; desc: string; }[]; sub: string; }
  | { kind: 'upload.framed'; chart: Chart; }
  | { kind: 'summary.list'; points: Pair[]; }
  | { kind: 'summary.statement' | 'summary.question'; statement: string; sub: string; }
  | { kind: 'cover.split'; image: Media; sub: string; meta: string; }
  | { kind: 'design.half' | 'design.stage'; image: Media; intro: string; points: Pair[]; };
export type Draft = { id: string; title: string; eyebrow: string; chapter: string; notes: string; caption: string; template: Template; };
export type Theme = { primary: string; accent: string; style: 'business' | 'elegant' | 'modern' | 'editorial' | 'bold'; mode: 'light'; };
export type Font = { size: number; face: string; weight: number; color: string; };
export type TextNode = Box & Font & {
  kind: 'text';
  lines: string[];
  runs: (Font & { text: string; })[];
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  lh: number;
  ls: number;
  opacity: number;
};
export type Node = TextNode | (Box & { kind: 'rect' | 'ellipse'; fill: string | null; stroke: string | null; lw: number; opacity: number; radius: number; })
  | { kind: 'line'; x1: number; x2: number; y1: number; y2: number; color: string; width: number; opacity: number; }
  | (Box & { kind: 'image'; image: Media; bind: string; })
  | (Box & { kind: 'chart'; chart: Chart; bind: string; color: string; plot: Plot; });
export type Page = Pick<Draft, 'id' | 'title' | 'chapter' | 'notes' | 'caption'> & { template: Template['kind'] | 'strategy.venn'; bg: string; nodes: Node[]; };
export type Deck = { title: string; fileName: string; pages: Page[]; status: string; style: string; };
