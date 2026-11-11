import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import type { Deck, Node, Page, TextNode } from './model';

function TextShape({ n }: { n: TextNode; }) {
  const size = n.runs.length ? Math.max(...n.runs.map(r => r.size)) : n.size;
  const height = (n.runs.length ? 1 : n.lines.length) * size * n.lh;
  const y = n.y + (n.valign === 'bottom' ? n.h - height : n.valign === 'middle' ? (n.h - height) / 2 : 0) + (size * n.lh - size) / 2 + size * .86;
  const x = n.x + (n.align === 'right' ? n.w : n.align === 'center' ? n.w / 2 : 0);
  return <text x={x} y={y} textAnchor={n.align === 'right' ? 'end' : n.align === 'center' ? 'middle' : 'start'} style={{
    fontFamily: n.face,
    fontSize: n.size,
    fontWeight: n.weight,
    letterSpacing: n.ls,
    fill: n.color,
    opacity: n.opacity,
    whiteSpace: 'pre'
  }}>{n.runs.length ? n.runs.map((r, i) => <tspan key={i} style={{ fontFamily: r.face, fontSize: r.size, fontWeight: r.weight, fill: r.color }}>{r.text}</tspan>) : n.lines.map((s, i) => <tspan key={i} x={x} y={y + i * n.size * n.lh}>{s}</tspan>)}</text>;
}
function Shape({ n }: { n: Node; }) {
  switch (n.kind) {
    case 'text': return <TextShape n={n} />;
    case 'rect': return <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius} fill={n.fill ?? 'none'} stroke={n.stroke ?? 'none'} strokeWidth={n.lw} opacity={n.opacity} />;
    case 'ellipse': return <ellipse cx={n.x + n.w / 2} cy={n.y + n.h / 2} rx={n.w / 2} ry={n.h / 2} fill={n.fill ?? 'none'} stroke={n.stroke ?? 'none'} strokeWidth={n.lw} opacity={n.opacity} />;
    case 'line': return <line x1={n.x1} y1={n.y1} x2={n.x2} y2={n.y2} stroke={n.color} strokeWidth={n.width} opacity={n.opacity} />;
    case 'image': return <image x={n.x} y={n.y} width={n.w} height={n.h} href={n.image.data} data-media-id={n.image.id}><title>{n.image.alt}</title></image>;
    case 'chart': {
      const plot = n.plot;
      return <g data-chart={n.chart.id} data-slot={n.bind}><title>{n.chart.title}</title>{plot.labels.map((v, i) => <Shape n={v} key={i} />)}{plot.valueLabels.map((v, i) => <TextShape n={v} key={i} />)}{plot.bars.map((v, i) => <rect key={i} x={v.x} y={v.y} width={v.w} height={v.h} fill={v.color} />)}{n.chart.kind === 'line' && <polyline fill="none" stroke={n.color} strokeWidth="4" points={plot.points.map(p => p.x + ',' + p.y).join(' ')} />}
        {plot.points.map(p => <circle data-price-point={n.chart.kind === 'prices' ? p.id : undefined} key={p.id} cx={p.x} cy={p.y} r={n.chart.kind === 'prices' ? 6 : 7} fill={p.color}><title>{p.tip}</title></circle>)}</g>;
    }
  }
}
export function DeckStudioPage({ page }: { page: Page; }) {
  return <svg className="deck-studio-page" style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '16/9', background: page.bg, overflow: 'hidden' }} viewBox="0 0 1280 720" role="img" aria-label={page.title} data-studio-page={page.id} data-template={page.template}><title>{page.title}</title>{page.nodes.map((n, i) => <Shape key={i} n={n} />)}</svg>;
}
export function DeckStudioViewer({ deck }: { deck: Deck; }) {
  const [current, setCurrent] = useState(0), [full, setFull] = useState(false), strip = useRef<HTMLOListElement>(null);
  const index = Math.min(current, deck.pages.length - 1), go = (i: number) => setCurrent(Math.max(0, Math.min(deck.pages.length - 1, i)));
  useEffect(() => {
    const el = strip.current, thumb = el?.children[index];
    if (el && thumb instanceof HTMLElement) el.scrollTo({ left: Math.max(0, thumb.offsetLeft - (el.clientWidth - thumb.offsetWidth) / 2), behavior: 'smooth' });
  }, [index]);
  useEffect(() => {
    if (!full) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrent(i => Math.max(0, Math.min(deck.pages.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1))));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [full, deck]);
  const page = deck.pages[index];
  if (!page) return null;
  return <div className="deck" data-full={full || undefined} data-studio-style={deck.style}>
    <div className="deck__stage" tabIndex={0} aria-label={`第${index + 1}页，共${deck.pages.length}页`} onKeyDown={e => {
      if (!full && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        go(index + (e.key === 'ArrowRight' ? 1 : -1));
      }
    }}><DeckStudioPage page={page} /></div>
    <div className="deck__bar"><button className="icon-btn" type="button" aria-label="上一页" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={18} /></button><span className="deck__count" aria-live="polite">{index + 1} / {deck.pages.length}</span><button className="icon-btn" type="button" aria-label="下一页" disabled={index === deck.pages.length - 1} onClick={() => go(index + 1)}><ChevronRight size={18} /></button><span className="small deck__notes">{page.caption}</span><button className="btn btn--ghost btn--sm deck__full" type="button" onClick={() => setFull(!full)}>{full ? <X size={14} /> : <Maximize2 size={14} />} {full ? '退出全屏' : '全屏'}</button></div>
    <ol className="deck__strip" ref={strip} aria-label="逐页预览">{deck.pages.map((p, i) => <li key={p.id}><button type="button" aria-current={i === index ? 'true' : undefined} onClick={() => go(i)} aria-label={`${i + 1}. ${p.title}`}><DeckStudioPage page={p} /></button></li>)}</ol></div>;
}
