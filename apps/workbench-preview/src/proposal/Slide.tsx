/**
 * One proposal slide, 16:9, in one of three presentation styles. Each slide has a single lead:
 * the slogan on a theme slide, the number on a data slide, the image on a visual slide.
 * The styles change composition, scale and image treatment, not just colour:
 *  - editorial: asymmetric thirds, serif lead, image on two thirds, side alternates;
 *  - poster: colour fields, oversized grotesk, images cut into blocks;
 *  - gallery: white walls, framed images in wide mats, small captions;
 *  - cobalt: built from the supplied blue corporate deck (see CobaltBody);
 *  - editorial: built from the supplied case-study grid (see EditorialBody);
 *  - studio: built from the supplied marketing deck (see StudioBody).
 * Sizes use container units, so a slide renders the same at any width.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ArtSpec, Direction, LayoutStyle, Slide as SlideData } from '../domain/proposal';
import { ArtFrame } from '../ui/art/ArtFrame';

export interface DeckContext {
  title: string;
  client: string;
  directions: Direction[];
  total: number;
  /** One picture per direction (its first visual slide), for slides that show all three. */
  arts?: Partial<Record<string, ArtSpec>>;
}

/** The first visual or mockup picture of each direction in a deck. */
export function directionArts(slides: SlideData[]): Partial<Record<string, ArtSpec>> {
  const out: Partial<Record<string, ArtSpec>> = {};
  for (const s of slides) if (s.directionId && s.art && (s.kind === 'visual' || s.kind === 'mockup') && !out[s.directionId]) out[s.directionId] = s.art;
  return out;
}

export function Slide({ slide, style, index, deck, label }: { slide: SlideData; style: LayoutStyle; index: number; deck: DeckContext; label?: string }) {
  const dir = deck.directions.find((d) => d.id === slide.directionId);
  const vars = {
    '--s-paper': style.palette.paper,
    '--s-ink': style.palette.ink,
    '--s-accent': style.palette.accent,
    '--s-muted': style.palette.muted,
    '--s-dir': dir?.color ?? style.palette.accent,
    '--s-hl': style.palette.highlight ?? style.palette.accent,
    '--s-wash': style.palette.wash ?? style.palette.paper,
  } as CSSProperties;
  const flip = index % 2 === 1;
  return (
    <div className="slide" data-style={style.id} data-kind={slide.kind} data-flip={flip || undefined} data-face={style.typeface} style={vars} role="img" aria-label={label ?? `${index + 1}. ${slide.lead}`}>
      {style.id === 'cobalt' ? (
        <CobaltBody slide={slide} index={index} deck={deck} dir={dir ?? null} />
      ) : style.id === 'editorial' ? (
        <EditorialBody slide={slide} index={index} deck={deck} dir={dir ?? null} />
      ) : style.id === 'studio' ? (
        <StudioBody slide={slide} index={index} deck={deck} dir={dir ?? null} />
      ) : (
        <SlideBody slide={slide} style={style} index={index} deck={deck} dir={dir ?? null} />
      )}
      <span className="slide__folio" aria-hidden="true">
        {String(index + 1).padStart(2, '0')} / {String(deck.total).padStart(2, '0')}
      </span>
    </div>
  );
}

function SlideBody({ slide: s, index, deck, dir }: { slide: SlideData; style: LayoutStyle; index: number; deck: DeckContext; dir: Direction | null }) {
  const art = s.art ? <ArtFrame spec={s.art} fill /> : null;
  const tag = dir ? (
    <span className="slide__dir">
      {dir.id} · {dir.name}
    </span>
  ) : null;
  switch (s.kind) {
    case 'cover':
      return (
        <>
          <div className="slide__media slide__media--cover">{art}</div>
          <div className="slide__text slide__text--cover">
            <span className="slide__kicker">{deck.client}</span>
            <p className="slide__lead slide__lead--xl">{s.lead}</p>
            <p className="slide__support">{s.support}</p>
          </div>
        </>
      );
    case 'question':
    case 'conclusion':
    case 'closing':
      return (
        <div className="slide__statement">
          <span className="slide__kicker">{s.support}</span>
          <p className="slide__lead slide__lead--statement">{s.lead}</p>
          {s.kind === 'conclusion' && <span className="slide__rule" aria-hidden="true" />}
        </div>
      );
    case 'data':
      return (
        <div className="slide__data">
          <p className="slide__number">{s.bigNumber ?? s.lead}</p>
          <div className="slide__data-text">
            <p className="slide__lead slide__lead--md">{s.support}</p>
            {s.chart && (
              <ul className="slide__bars">
                {s.chart.data.map((d) => (
                  <li key={d.label} data-hl={d.highlight || undefined}>
                    <span>{d.label}</span>
                    <i style={{ width: `${(d.value / Math.max(...s.chart!.data.map((x) => x.value), 1)) * 100}%` }} />
                  </li>
                ))}
              </ul>
            )}
            {s.notes && <p className="slide__note">{s.notes}</p>}
          </div>
        </div>
      );
    case 'theme':
      return (
        <div className="slide__theme">
          {tag}
          <p className="slide__lead slide__lead--slogan">{s.lead}</p>
          <p className="slide__support">{s.support}</p>
        </div>
      );
    case 'visual':
    case 'mockup':
      return (
        <>
          <div className="slide__media slide__media--hero">{art}</div>
          <div className="slide__caption">
            {tag}
            <p className="slide__lead slide__lead--sm">{s.lead}</p>
            <p className="slide__support">{s.support}</p>
          </div>
        </>
      );
    case 'comparison':
      return (
        <div className="slide__compare">
          <p className="slide__lead slide__lead--md">{s.lead}</p>
          <ul>
            {deck.directions.map((d) => (
              <li key={d.id} style={{ ['--c' as string]: d.color }}>
                <span className="slide__dir">
                  {d.id} · {d.name}
                </span>
                <p className="slide__compare-slogan">{d.slogan}</p>
                <p className="slide__support">{d.difference}</p>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'strategy':
      return (
        <div className="slide__strategy">
          <p className="slide__lead slide__lead--md">{s.lead}</p>
          <ul>
            {s.support.split('·').map((x) => (
              <li key={x}>{x.trim()}</li>
            ))}
          </ul>
        </div>
      );
    case 'insight':
    case 'recommendation':
    default:
      return (
        <>
          <div className="slide__text">
            {tag}
            <span className="slide__kicker">{s.kind === 'recommendation' ? deck.title : String(index + 1).padStart(2, '0')}</span>
            <p className="slide__lead slide__lead--lg">{s.lead}</p>
            <p className="slide__support">{s.support}</p>
          </div>
          {art && <div className="slide__media">{art}</div>}
        </>
      );
  }
}

/** Which page colour a cobalt-style slide sits on; shared with the PowerPoint export. */
export function cobaltPage(kind: SlideData['kind']): 'cobalt' | 'wash' | 'paper' {
  if (kind === 'cover' || kind === 'closing' || kind === 'recommendation') return 'cobalt';
  if (kind === 'conclusion' || kind === 'theme' || kind === 'strategy') return 'wash';
  return 'paper';
}

/** "9/12" or "9 of 12" as numbers, for counts drawn as blocks. */
export function fraction(text: string | undefined): [number, number] | null {
  const m = /^\s*(\d+)\s*(?:\/|of)\s*(\d+)\s*$/.exec(text ?? '');
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return b > 0 && b <= 40 && a <= b ? [a, b] : null;
}

const Orb = ({ className = '' }: { className?: string }) => (
  <span className={`cs-orb ${className}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="100%" height="100%">
      <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

/**
 * Slides in the style built from the supplied blue corporate deck:
 * - cover → "Corporate Overview": cobalt page, huge title, lime pill over its last line, image in a
 *   big rounded frame with a lime arrow button on its edge;
 * - question / data / insight → the light-grey pages: one lead, numbers in cobalt with a lime chip;
 * - conclusion / theme / strategy → the pale-lime pages with cobalt pills ("Proven Results…");
 * - visual / mockup → photo in a rounded frame with a lime card overlapping it;
 * - comparison → alternating cobalt and lime cards ("Smart Analytics");
 * - recommendation / closing → cobalt pages ("We Appreciate Your Time").
 */
function CobaltBody({ slide: s, index, deck, dir }: { slide: SlideData; index: number; deck: DeckContext; dir: Direction | null }) {
  const art = s.art ? <ArtFrame spec={s.art} fill /> : null;
  const page = cobaltPage(s.kind);
  const dirPill = dir ? (
    <span className="cs-pill cs-pill--accent">
      {dir.id} · {dir.name}
    </span>
  ) : null;
  const wrap = (children: ReactNode) => (
    <div className="cs" data-page={page}>
      {children}
    </div>
  );
  switch (s.kind) {
    case 'cover':
      return wrap(
        <>
          <div className="cs-cover__text">
            <p className="cs-lead cs-lead--xl">{s.lead}</p>
            <span className="cs-pill cs-pill--hl cs-cover__pill">{deck.client}</span>
            <p className="cs-sub">{s.support}</p>
          </div>
          <div className="cs-frame cs-frame--cover">{art}</div>
          <Orb className="cs-orb--cover" />
        </>,
      );
    case 'question':
      return wrap(
        <div className="cs-statement">
          <Orb className="cs-orb--chip" />
          <p className="cs-lead cs-lead--statement">{s.lead}</p>
          <span className="cs-pill cs-pill--accent">{s.support}</span>
        </div>,
      );
    case 'conclusion':
    case 'strategy':
      return wrap(
        <div className="cs-split">
          <p className="cs-lead cs-lead--lg">{s.lead}</p>
          <ul className="cs-stack">
            {s.support.split('·').map((x) => (
              <li key={x} className="cs-pill cs-pill--big">
                {x.trim()}
              </li>
            ))}
          </ul>
        </div>,
      );
    case 'closing':
      return wrap(
        <div className="cs-closing">
          <span className="cs-kicker">{s.support}</span>
          <p className="cs-lead cs-lead--statement">
            {s.lead} <Orb className="cs-orb--inline" />
          </p>
          <span className="cs-pill cs-pill--hl">{deck.client}</span>
        </div>,
      );
    case 'data': {
      const f = fraction(s.bigNumber ?? s.lead);
      return wrap(
        <div className="cs-data">
          <div className="cs-data__lead">
            <p className="cs-number">
              {s.bigNumber ?? s.lead}
              <Orb className="cs-orb--sup" />
            </p>
            <p className="cs-sub cs-sub--dark">{s.support}</p>
            {s.notes && <p className="cs-note">{s.notes}</p>}
          </div>
          {s.chart ? (
            <ul className="cs-bars">
              {s.chart.data.map((d, i) => (
                <li key={d.label} data-alt={i % 2 === 1 || undefined} style={{ width: `${Math.max(18, (d.value / Math.max(...s.chart!.data.map((x) => x.value), 1)) * 100)}%` }}>
                  <span>{d.label}</span>
                  <b>{d.value}</b>
                </li>
              ))}
            </ul>
          ) : f ? (
            <ul className="cs-blocks" style={{ '--cols': Math.ceil(Math.sqrt(f[1] * 1.5)) } as CSSProperties} aria-hidden="true">
              {Array.from({ length: f[1] }, (_, i) => (
                <li key={i} data-on={i < f[0] || undefined} />
              ))}
            </ul>
          ) : null}
        </div>,
      );
    }
    case 'theme':
      return wrap(
        <div className="cs-theme" style={{ '--c': dir?.color ?? 'var(--s-accent)' } as CSSProperties}>
          <div className="cs-theme__text">
            {dirPill}
            <p className="cs-lead cs-lead--slogan">{s.lead}</p>
            <p className="cs-sub cs-sub--dark">{s.support}</p>
          </div>
          <div className="cs-circles" aria-hidden="true">
            <span className="cs-circle cs-circle--dir">{dir?.id}</span>
            <span className="cs-circle cs-circle--hl" />
            <span className="cs-circle cs-circle--accent" />
          </div>
        </div>,
      );
    case 'visual':
    case 'mockup':
      return wrap(
        <>
          <div className="cs-frame cs-frame--hero">{art}</div>
          <div className="cs-card cs-card--hl">
            {dir && (
              <span className="cs-card__tag">
                {dir.id} · {dir.name}
              </span>
            )}
            <p className="cs-lead cs-lead--sm">{s.lead}</p>
            <p className="cs-sub cs-sub--dark">{s.support}</p>
            <Orb className="cs-orb--dark" />
          </div>
        </>,
      );
    case 'comparison':
      return wrap(
        <div className="cs-compare">
          <p className="cs-lead cs-lead--md">{s.lead}</p>
          <ul>
            {deck.directions.map((d, i) => (
              <li key={d.id} data-alt={i % 2 === 1 || undefined}>
                <span className="cs-compare__id" style={{ background: d.color }}>
                  {d.id}
                </span>
                <p className="cs-compare__name">{d.name}</p>
                <p className="cs-compare__slogan">{d.slogan}</p>
                <p className="cs-compare__diff">{d.difference}</p>
              </li>
            ))}
          </ul>
        </div>,
      );
    case 'insight':
    case 'recommendation':
    default:
      return wrap(
        <>
          <div className="cs-text">
            {dirPill ?? <span className="cs-pill cs-pill--hl">{s.kind === 'recommendation' ? deck.title : String(index + 1).padStart(2, '0')}</span>}
            <p className="cs-lead cs-lead--lg">{s.lead}</p>
            <p className="cs-sub">{s.support}</p>
          </div>
          {art && (
            <div className="cs-frame cs-frame--side">
              {art}
              <Orb className="cs-orb--frame" />
            </div>
          )}
        </>,
      );
  }
}

/** Pastel orb colours of the case-study grid, in order. */
const ED_ORBS = ['#f2c59b', '#b7d3a8', '#b9b0e6'];

/** A picture in a rounded frame with a pastel arrow button in a notch at its bottom-right. */
function NotchedPic({ art, orb, className = '' }: { art: ReactNode; orb: string; className?: string }) {
  return (
    <div className={`ed-pic ${className}`} style={{ '--orb': orb } as CSSProperties}>
      <div className="ed-pic__frame">{art}</div>
      <span className="ed-pic__notch" aria-hidden="true">
        <Orb className="ed-orb" />
      </span>
    </div>
  );
}

/**
 * Slides in the Editorial style, built from the supplied case-study grid ("Leading Companies
 * Have Trusted Us"): every page is a warm off-white card on a coloured mat (the direction's
 * colour where there is one, lilac otherwise); a two-line headline top left; pictures in
 * rounded frames with a pastel arrow button in a notch; titles, a short line and coloured tag
 * chips under each picture; a dark pill centred at the foot.
 */
function EditorialBody({ slide: s, index, deck, dir }: { slide: SlideData; index: number; deck: DeckContext; dir: Direction | null }) {
  const art = s.art ? <ArtFrame spec={s.art} fill /> : null;
  const orb = ED_ORBS[index % ED_ORBS.length];
  const mat = s.kind === 'theme' && dir ? dir.color : undefined;
  const chips = (items: string[]) => (
    <span className="ed-chips">
      {items.map((x, i) => (
        <span key={x} className="ed-chip" data-i={i % 3}>
          {x}
        </span>
      ))}
    </span>
  );
  const page = (children: ReactNode) => (
    <div className="ed" style={mat ? ({ '--ed-mat': mat } as CSSProperties) : undefined}>
      <div className="ed-card">{children}</div>
    </div>
  );
  switch (s.kind) {
    case 'cover':
      return page(
        <>
          <div className="ed-cover__text">
            <p className="ed-lead ed-lead--xl">{s.lead}</p>
            <p className="ed-sub">{s.support}</p>
            {chips([deck.client])}
          </div>
          {art && <NotchedPic art={art} orb={ED_ORBS[0]} className="ed-pic--cover" />}
        </>,
      );
    case 'question':
    case 'conclusion':
    case 'closing':
    case 'strategy':
      return page(
        <div className="ed-statement">
          <p className="ed-lead ed-lead--statement">{s.lead}</p>
          {s.kind === 'conclusion' || s.kind === 'strategy' ? chips(s.support.split('·').map((x) => x.trim()).filter(Boolean)) : <p className="ed-sub">{s.support}</p>}
          <span className="ed-pill">{s.kind === 'closing' ? deck.client : deck.title}</span>
        </div>,
      );
    case 'data':
      return page(
        <div className="ed-data">
          <p className="ed-number">{s.bigNumber ?? s.lead}</p>
          <div className="ed-data__text">
            <p className="ed-lead ed-lead--md">{s.support}</p>
            {s.notes && <p className="ed-note">{s.notes}</p>}
          </div>
        </div>,
      );
    case 'theme':
      return page(
        <div className="ed-theme">
          {dir && chips([`${dir.id} · ${dir.name}`])}
          <p className="ed-lead ed-lead--slogan">{s.lead}</p>
          <p className="ed-sub">{s.support}</p>
        </div>,
      );
    case 'comparison': {
      return page(
        <>
          <p className="ed-lead ed-lead--md ed-compare__title">{s.lead}</p>
          <ul className="ed-compare">
            {deck.directions.map((d, i) => {
              const a = deck.arts?.[d.id];
              return (
                <li key={d.id}>
                  <NotchedPic art={a ? <ArtFrame spec={a} fill /> : <span className="ed-pic__blank" style={{ background: d.color }} />} orb={ED_ORBS[i % 3]} />
                  <p className="ed-compare__name">{d.name}</p>
                  <p className="ed-compare__line">{d.slogan}</p>
                  {chips([d.id, ...d.difference.split(/[.;]/).slice(0, 1).map((x) => x.trim()).filter((x) => x.length < 26)])}
                </li>
              );
            })}
          </ul>
        </>,
      );
    }
    case 'visual':
    case 'mockup':
      return page(
        <>
          {art && <NotchedPic art={art} orb={orb} className="ed-pic--hero" />}
          <div className="ed-side">
            <p className="ed-lead ed-lead--md">{s.lead}</p>
            <p className="ed-sub">{s.support}</p>
            {dir && chips([dir.id, dir.name])}
          </div>
        </>,
      );
    case 'insight':
    case 'recommendation':
    default:
      return page(
        <>
          <div className="ed-text">
            <p className="ed-kicker">{s.kind === 'recommendation' ? deck.title : String(index + 1).padStart(2, '0')}</p>
            <p className="ed-lead ed-lead--lg">{s.lead}</p>
            <p className="ed-sub">{s.support}</p>
            {dir && chips([`${dir.id} · ${dir.name}`])}
          </div>
          {art && <NotchedPic art={art} orb={orb} className="ed-pic--side" />}
        </>,
      );
  }
}

/** A dark section tag: a number dot followed by a label, as on the marketing-deck pages. */
const Tag = ({ n, label }: { n: string | number; label: string }) => (
  <span className="sd-tag">
    <span className="sd-tag__n">{n}</span>
    <span className="sd-tag__l">{label}</span>
  </span>
);

/**
 * Slides in the Studio style, built from the supplied marketing deck ("How We Drive Growth?",
 * "Corporate Identity", "Why Choose Our Strategy?"): white pages on a pale periwinkle ground,
 * a numbered dark tag top left and a small-caps label top right, a heavy grotesk headline, tall
 * numbered picture cards that end in a coloured pill with a tick, lilac big-number tiles, and
 * lime and violet tiles for the conclusion.
 */
function StudioBody({ slide: s, index, deck, dir }: { slide: SlideData; index: number; deck: DeckContext; dir: Direction | null }) {
  const art = s.art ? <ArtFrame spec={s.art} fill /> : null;
  const n = index + 1;
  const head = (label: string) => (
    <div className="sd-head">
      <Tag n={n} label={label} />
      <span className="sd-label">{deck.client}</span>
    </div>
  );
  const tick = (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const page = (label: string, children: ReactNode) => (
    <div className="sd">
      <div className="sd-page">
        {head(label)}
        {children}
      </div>
    </div>
  );
  switch (s.kind) {
    case 'cover':
      return page(
        deck.title,
        <>
          <p className="sd-lead sd-lead--xl">{s.lead}</p>
          <p className="sd-sub sd-cover__sub">{s.support}</p>
          <Orb className="sd-arrow" />
          {art && (
            <div className="sd-tall sd-tall--cover">
              <div className="sd-tall__pic">{art}</div>
              <span className="sd-tall__pill" data-c="lime">
                {deck.client} {tick}
              </span>
            </div>
          )}
        </>,
      );
    case 'question':
    case 'closing':
      return page(
        s.support,
        <div className="sd-statement">
          <p className="sd-lead sd-lead--statement">{s.lead}</p>
          <Orb className="sd-arrow sd-arrow--static" />
        </div>,
      );
    case 'conclusion':
    case 'strategy': {
      const parts = s.support.split('·').map((x) => x.trim()).filter(Boolean);
      return page(
        s.kind === 'conclusion' ? deck.title : s.support,
        <div className="sd-bento">
          <div className="sd-tile sd-tile--lime sd-bento__lead">
            <p className="sd-lead sd-lead--md">{s.lead}</p>
          </div>
          <ul className="sd-tile sd-tile--violet sd-bento__list">
            {parts.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <Orb className="sd-bento__orb" />
        </div>,
      );
    }
    case 'data':
      return page(
        deck.title,
        <div className="sd-data">
          <div className="sd-data__text">
            <p className="sd-lead sd-lead--lg">{s.support}</p>
            {s.notes && <p className="sd-note">{s.notes}</p>}
          </div>
          <div className="sd-tile sd-tile--lilac sd-stat">
            <p className="sd-stat__n">{s.bigNumber ?? s.lead}</p>
            <p className="sd-stat__l">{s.support}</p>
          </div>
        </div>,
      );
    case 'theme':
      return page(
        dir ? `${dir.id} · ${dir.name}` : deck.title,
        <div className="sd-theme" style={{ '--c': dir?.color ?? '#6f63f0' } as CSSProperties}>
          <div className="sd-theme__text">
            <p className="sd-lead sd-lead--slogan">{s.lead}</p>
            <p className="sd-sub">{s.support}</p>
          </div>
          <div className="sd-tile sd-theme__tile">
            <span className="sd-theme__id">{dir?.id}</span>
            <span className="sd-theme__name">{dir?.name}</span>
          </div>
        </div>,
      );
    case 'comparison':
      return page(
        deck.title,
        <div className="sd-growth">
          <div className="sd-growth__text">
            <p className="sd-lead sd-lead--lg">{s.lead}</p>
            <p className="sd-sub">{s.support}</p>
            <Orb className="sd-arrow sd-arrow--static" />
          </div>
          <ol className="sd-growth__cards">
            {deck.directions.map((d, i) => {
              const a = deck.arts?.[d.id];
              return (
                <li key={d.id} className="sd-tall">
                  <div className="sd-tall__pic">{a ? <ArtFrame spec={a} fill /> : <span className="sd-tall__blank" style={{ background: d.color }} />}</div>
                  <span className="sd-tall__n">{i + 1}</span>
                  <div className="sd-tall__text">
                    <p className="sd-tall__title">{d.name}</p>
                    <p className="sd-tall__line">{d.slogan}</p>
                  </div>
                  <span className="sd-tall__pill" data-c={i === deck.directions.length - 1 ? 'lime' : 'violet'}>
                    {d.id} {tick}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>,
      );
    case 'visual':
    case 'mockup':
      return page(
        dir ? `${dir.id} · ${dir.name}` : deck.title,
        <div className="sd-visual">
          <div className="sd-visual__text">
            <p className="sd-lead sd-lead--lg">{s.lead}</p>
            <p className="sd-sub">{s.support}</p>
            <Orb className="sd-arrow sd-arrow--static" />
          </div>
          {art && (
            <div className="sd-tall sd-tall--wide">
              <div className="sd-tall__pic">{art}</div>
              <span className="sd-tall__pill" data-c={dir?.id === 'C' ? 'lime' : 'violet'}>
                {dir ? dir.name : deck.client} {tick}
              </span>
            </div>
          )}
        </div>,
      );
    case 'insight':
    case 'recommendation':
    default:
      return page(
        s.kind === 'recommendation' || !dir ? deck.title : `${dir.id} · ${dir.name}`,
        <div className="sd-why">
          <div className="sd-why__text">
            <p className="sd-lead sd-lead--lg">{s.lead}</p>
            <p className="sd-sub">{s.support}</p>
            {dir && <span className="sd-pill">{`${dir.id} · ${dir.name}`}</span>}
          </div>
          <div className="sd-why__media">
            <div className="sd-tile sd-tile--lilac sd-why__stat">
              <p className="sd-stat__n">{dir?.id ?? String(n).padStart(2, '0')}</p>
              <p className="sd-stat__l">{dir?.slogan ?? deck.title}</p>
            </div>
            {art && <div className="sd-why__pic">{art}</div>}
          </div>
        </div>,
      );
  }
}

