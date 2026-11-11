/** Small builders that keep the demo fixtures readable. All artwork is generated illustration. */
import type { ArtSpec, CanDesign, EvidenceRef, LayoutStyle, MockupSpec, PackSpec, PosterSpec, SceneId, SceneSpec, ScoreLine, StageId, StageState } from '../../../domain/proposal';

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
  brief: 'Proposal Director',
  research: 'Research Lead',
  strategy: 'Strategy Lead',
  themes: 'Copy Lead',
  visual: 'Visual Lead',
  content_review: 'Proposal Director',
  layout: 'Layout Lead',
  delivery: 'Proposal Director',
};

/**
 * Slide style built from the supplied blue corporate PowerPoint deck. Each decision names the
 * composition it takes from that deck, so the mapping can be checked against the reference.
 */
export const COBALT_STYLE: LayoutStyle = {
  id: 'cobalt',
  name: 'Cobalt & lime',
  reference: 'Your blue corporate deck (“Corporate Overview”)',
  idea: 'Full cobalt pages for the opening, the recommendation and the close; light grey and pale-lime pages in between, with lime call-outs and round arrow buttons.',
  decisions: [
    'Cover: full cobalt page, huge two-line title with a lime pill over its last line, the key visual in a large rounded frame with a lime arrow button on its edge.',
    'Images sit in big rounded frames, and short lime cards with the line or the claim overlap them.',
    'Numbers lead in cobalt with a small lime arrow chip; counts are shown as cobalt and lime blocks.',
    'Directions are compared as alternating cobalt and lime cards; the close is a centred cobalt page.',
  ],
  palette: { paper: '#f0f0ee', ink: '#141815', accent: '#3d4fe0', muted: '#6b706a', highlight: '#d8f06b', wash: '#f2f7d9' },
  typeface: 'grotesk',
};

/** Slide style built from the supplied case-study grid; keeps the editorial serif headlines. */
export const EDITORIAL_STYLE: LayoutStyle = {
  id: 'editorial',
  name: 'Editorial',
  reference: 'Your case-study grid (“Leading Companies Have Trusted Us”)',
  idea: 'Each page is a warm off-white card on a coloured mat; pictures sit in rounded frames with a pastel arrow button in a notch, captioned like a magazine.',
  decisions: [
    'Every slide is a card inset on a mat: lilac by default, the direction’s own colour on its theme slide.',
    'Two-line headlines top left; pictures in rounded frames with a pastel arrow button cut into the bottom-right corner.',
    'Under each picture: a title, one short line and coloured tag chips, as on the case cards.',
    'The three directions are shown as the case grid itself; statements end with a dark pill centred at the foot.',
  ],
  palette: { paper: '#f8f6f1', ink: '#1b1a1f', accent: '#b9b0dc', muted: '#6f6c73', highlight: '#f2c59b', wash: '#b9b0dc' },
  typeface: 'serif',
};

/** Slide style built from the supplied marketing deck ("How We Drive Growth?"). */
export const STUDIO_STYLE: LayoutStyle = {
  id: 'studio',
  name: 'Studio',
  reference: 'Your marketing deck (“How We Drive Growth?”, “Corporate Identity”, “Why Choose Our Strategy?”)',
  idea: 'White pages on a pale periwinkle ground, heavy grotesk headlines, tall numbered picture cards and bold colour tiles.',
  decisions: [
    'Every page has a numbered dark tag top left and the client in small capitals top right.',
    'The directions are three tall numbered picture cards, each ending in a coloured pill with a tick.',
    'Numbers lead on a lilac tile; conclusions sit on lime and violet tiles, as on the Vision and Mission slide.',
    'A large thin arrow anchors the bottom-left corner of text pages.',
  ],
  palette: { paper: '#ffffff', ink: '#111214', accent: '#6f63f0', muted: '#6d6f78', highlight: '#d4f06b', wash: '#d6daee' },
  typeface: 'grotesk',
};
