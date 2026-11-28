import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyManuscriptEdits } from './layout-pages.mjs';
import { chromiumPath } from './runtime-dependencies.mjs';

const appRoot = fileURLToPath(new URL('../../apps/workbench-preview/', import.meta.url));
const requireApp = createRequire(join(appRoot, 'package.json'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const DECK_STYLES = ['bento', 'editorial', 'consulting'];
export const DECK_STYLE_LABELS = {
  bento: '现代 4A',
  editorial: '东方画册',
  consulting: '商务咨询',
};

export function normalizeDeckStyle(value) {
  return DECK_STYLES.includes(value) ? value : 'bento';
}

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function rgbToHex(rgbStr) {
  if (!rgbStr) return null;
  const m = rgbStr.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  if (a < 0.03) return null;
  const hex = [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { hex, alpha: a };
}

function mapFontFamily(ff) {
  if (!ff) return 'PingFang SC';
  if (/Songti|Serif|Georgia|STSong|Noto Serif/i.test(ff)) return 'Songti SC';
  if (/Mono|Menlo|Courier/i.test(ff)) return 'Menlo';
  return 'PingFang SC';
}

function clampText(text, maxChars) {
  const chars = [...String(text || '').trim()];
  return chars.length <= maxChars ? chars.join('') : chars.slice(0, maxChars - 1).join('') + '…';
}

/**
 * Extract percentage metrics from page.points with clean, readable Chinese labels.
 * Flags whether all metrics share the same ratio scope (for native PPTX addChart)
 * vs. mixed growth/share metrics (rendered as editable horizontal data bars).
 */
function extractPercentMetrics(points = []) {
  const growthRe = /同比增长|环比增长|同比增|增速|增长|下降|低于|高于|涨幅|跌幅/u;
  const out = [];
  const seen = new Set();
  for (const pt of points) {
    const clauses = pt.split(/[，,；;。]/u).map((s) => s.trim()).filter(Boolean);
    let subjectHint = '';
    for (const clause of clauses) {
      const m = clause.match(/(\d+(?:\.\d+)?)\s*%/);
      if (!m) {
        const hint = clause
          .replace(/^(?:\d{4}年|同年|在|据|同一报告里|其中|而|以及|同时|且)+/u, '')
          .replace(/\d+(?:\.\d+)?(?:亿元|万元|元|万|亿|人|户|家|件|盒|袋|倍).*$/u, '')
          .replace(/《[^》]*》中?/gu, '')
          .trim();
        if (hint.length >= 2 && hint.length <= 14) subjectHint = hint;
        continue;
      }
      const val = Number(m[1]);
      if (!Number.isFinite(val) || val <= 0 || val > 100) continue;
      const isGrowth = growthRe.test(clause);
      let label = clause
        .replace(/(\d+(?:\.\d+)?)\s*%/g, '')
        .replace(/^(?:在|据|同年|同一报告里|其中|而|以及|同时|且)+/u, '')
        .replace(/《[^》]*》中?/gu, '')
        .replace(/^[^，,。]*?(?:报告|调查|调研|数据)中?/u, '')
        .replace(/^(?:高于|低于)/u, '')
        .replace(/(?:占比|占|达|达到|为|者占|约为)$/u, '')
        .replace(/[：:（）()《》“”「」]/gu, '')
        .trim();
      if (/^(?:同比增|同比增长|环比增长|增速|增长)$/u.test(label)) {
        label = (subjectHint ? subjectHint + '同比增速' : '同比增速');
      } else if (isGrowth && !/增速|增长|下降/u.test(label)) {
        label = label + '增速';
      }
      const shortLabel = clampText(label || subjectHint || '关键指标', 12);
      const key = `${shortLabel}:${val}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label: shortLabel, value: val, isGrowth, raw: clause });
    }
  }
  return out.slice(0, 4);
}

function splitPeerLine(line) {
  const m = line.match(/^([^，,：:用将以把在的]{2,10})(?:用|以|将|把|在|通过|主推|采用|：|:)(.+)$/u);
  if (m && !/^(?:两家|三家|多数|同类|竞品|行业|市场|品牌|主要|目前|常见)/u.test(m[1].trim())) {
    return { brand: m[1].trim(), detail: line.trim() };
  }
  return { brand: '', detail: line.trim() };
}

function paletteFor(style, theme = {}) {
  const primary = (theme.primary || '#163028').replace(/^#?/, '#');
  const accent = (theme.accent || '#C48A3A').replace(/^#?/, '#');
  if (style === 'editorial') {
    return {
      bg: '#F5F1E7',
      dark: '#141311',
      dark2: '#22201D',
      card: '#FAF7F0',
      soft: '#E7E1D3',
      ink: '#141311',
      mute: '#6E6A61',
      line: '#CFC8B8',
      accent: '#9E2F24',
      accentSoft: '#F3E5E1',
      gold: '#A88952',
      white: '#FFFFFF',
    };
  }
  if (style === 'consulting') {
    return {
      bg: '#F7F5F0',
      dark: primary,
      dark2: '#1D3B31',
      card: '#FFFFFF',
      soft: '#ECE8DF',
      ink: '#1A1F1D',
      mute: '#5B635F',
      line: '#D8D2C5',
      accent,
      accentSoft: '#F6EBDC',
      gold: accent,
      white: '#FFFFFF',
    };
  }
  // Default: 'bento' (Modern 4A Bento Fusion)
  return {
    bg: '#F2F1EC',
    dark: '#0F1E1A',
    dark2: primary === '#143F9B' ? '#193C32' : primary,
    card: '#FFFFFF',
    soft: '#E8E5DC',
    ink: '#161A18',
    mute: '#616965',
    line: '#E0DDD4',
    accent: accent === '#E1BC42' ? '#D49B4B' : accent,
    accentSoft: '#FAF3E6',
    gold: '#D49B4B',
    white: '#FFFFFF',
  };
}

function buildHtmlSlides({ title, plan, imageByName, style, theme }) {
  const P = paletteFor(style, theme);
  const total = plan.pages.length;
  const deckLabel = theme.brandName || clampText(plan.pages[0]?.title || title, 20) || '品牌提案';
  const allFigures = new Map([...plan.figures, ...(plan.derivatives ?? [])].map((f) => [f.id, f]));
  const copyByDir = new Map((plan.copy ?? []).filter((d) => d?.name).map((d) => [d.name, d]));
  const styleLabel = DECK_STYLE_LABELS[style] || '现代 4A';

  const imgTag = (img, css, fit = 'contain') => {
    if (!img) return '';
    return `<img data-ppt="img" data-asset="${esc(img.id)}" src="${img.data}" alt="${esc(img.alt || img.id)}" style="${css};object-fit:${fit}" />`;
  };

  const footerHtml = (num, dark = false) => {
    const col = dark ? '#8FA39C' : P.mute;
    return `
      <div data-ppt="text" style="position:absolute;left:56px;bottom:18px;font-size:11px;color:${col}">${esc(deckLabel)}</div>
      <div data-ppt="text" class="mono" style="position:absolute;right:56px;bottom:18px;font-size:11px;color:${col}">${String(num).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div>
    `;
  };

  const headerHtml = (eyebrow, heading) => {
    const labelText = String(eyebrow || '').trim();
    if (style === 'editorial') {
      return `
        ${labelText ? `<div data-ppt="text" class="mono" style="position:absolute;left:60px;top:32px;font-size:11.5px;letter-spacing:.12em;color:${P.mute}">${esc(labelText)}</div>` : ''}
        <div data-ppt="text" class="serif" style="position:absolute;left:60px;top:60px;width:1160px;font-size:32px;font-weight:700;color:${P.ink}">${esc(heading)}</div>
        <div data-ppt="line" style="position:absolute;left:60px;top:116px;width:1160px;height:1px;background:${P.line}"></div>
      `;
    }
    if (style === 'consulting') {
      return `
        <div data-ppt="shape" style="position:absolute;left:60px;top:38px;width:34px;height:4px;background:${P.accent}"></div>
        ${labelText ? `<div data-ppt="text" style="position:absolute;left:104px;top:30px;font-size:12px;font-weight:700;color:${P.mute};letter-spacing:.04em">${esc(labelText)}</div>` : ''}
        <div data-ppt="text" style="position:absolute;left:60px;top:56px;width:1160px;font-size:28px;font-weight:700;color:${P.ink}">${esc(heading)}</div>
        <div data-ppt="line" style="position:absolute;left:60px;top:112px;width:1160px;height:1px;background:${P.line}"></div>
      `;
    }
    // bento
    return `
      ${labelText ? `
        <div data-ppt="shape" style="position:absolute;left:56px;top:30px;width:${Math.min(260, Math.max(96, labelText.length * 14 + 28))}px;height:26px;border-radius:13px;background:#E2E8E5"></div>
        <div data-ppt="text" style="position:absolute;left:68px;top:35px;font-size:11.5px;font-weight:700;color:${P.dark2}">${esc(clampText(labelText, 18))}</div>
      ` : ''}
      <div data-ppt="text" style="position:absolute;left:56px;top:66px;width:1168px;font-size:29px;font-weight:700;color:${P.ink}">${esc(heading)}</div>
    `;
  };

  let directionCounter = 0;
  const chartSpecs = new Map(); // pageIndex -> native chart spec for PPTX injection
  const slideTemplates = [];

  const slideHtmls = plan.pages.map((page, idx) => {
    const num = page.number;
    const pts = page.points ?? [];
    const refinements = page.refinements ?? [];
    const pageImgs = (page.figures ?? []).map((id) => {
      const fig = allFigures.get(id);
      return fig ? { fig, img: imageByName.get(fig.name) } : null;
    }).filter((x) => x?.img);

    // 1. COVER — Pure typographic cover (100% manuscript-faithful, zero artwork spoilers, zero fabricated copy)
    if (page.role === 'cover') {
      slideTemplates[idx] = 'cover.type';
      const sub = pts.join(' · ');
      const coverTitleSize = page.title.length > 16 ? 48 : page.title.length > 11 ? 54 : 62;
      if (style === 'editorial') {
        return `<section class="slide" style="background:${P.bg}">
          <div data-ppt="shape" style="position:absolute;left:96px;top:138px;width:56px;height:4px;background:${P.accent}"></div>
          ${page.label ? `<div data-ppt="text" class="mono" style="position:absolute;left:96px;top:160px;font-size:12.5px;letter-spacing:.14em;color:${P.mute}">${esc(page.label)}</div>` : ''}
          <div data-ppt="text" class="serif" style="position:absolute;left:96px;top:220px;width:1080px;font-size:${coverTitleSize}px;font-weight:700;line-height:1.28;color:${P.ink}">${esc(page.title)}</div>
          ${sub ? `
            <div data-ppt="line" style="position:absolute;left:96px;top:418px;width:88px;height:1.5px;background:${P.accent}"></div>
            <div data-ppt="text" style="position:absolute;left:96px;top:448px;width:920px;font-size:21px;line-height:1.75;color:${P.mute}">${esc(sub)}</div>
          ` : ''}
          ${footerHtml(num)}
        </section>`;
      }
      if (style === 'consulting') {
        return `<section class="slide" style="background:${P.dark};color:#fff">
          <div data-ppt="shape" style="position:absolute;left:0;top:0;width:24px;height:720px;background:${P.accent}"></div>
          <div data-ppt="shape" style="position:absolute;left:108px;top:154px;width:64px;height:4px;background:${P.accent}"></div>
          ${page.label ? `<div data-ppt="text" class="mono" style="position:absolute;left:108px;top:174px;font-size:13px;font-weight:700;color:${P.accent};letter-spacing:.12em">${esc(page.label)}</div>` : ''}
          <div data-ppt="text" class="serif" style="position:absolute;left:108px;top:232px;width:1040px;font-size:${coverTitleSize}px;font-weight:700;line-height:1.28;color:#FFFFFF">${esc(page.title)}</div>
          ${sub ? `
            <div data-ppt="line" style="position:absolute;left:108px;top:430px;width:540px;height:1px;background:#335247"></div>
            <div data-ppt="text" style="position:absolute;left:108px;top:456px;width:960px;font-size:21px;line-height:1.7;color:#D4DFDA">${esc(sub)}</div>
          ` : ''}
          ${footerHtml(num, true)}
        </section>`;
      }
      // bento (现代 4A): Deep architectural dark surface with sleek geometric accent frame
      return `<section class="slide" style="background:${P.dark};color:#fff">
        <div data-ppt="shape" style="position:absolute;left:56px;top:52px;width:1168px;height:604px;border-radius:18px;background:${P.dark2};border:1px solid #2A4A3E"></div>
        <div data-ppt="shape" style="position:absolute;left:116px;top:152px;width:68px;height:5px;border-radius:3px;background:${P.accent}"></div>
        ${page.label ? `<div data-ppt="text" class="mono" style="position:absolute;left:116px;top:176px;font-size:13px;font-weight:700;color:${P.accent};letter-spacing:.12em">${esc(page.label)}</div>` : ''}
        <div data-ppt="text" class="serif" style="position:absolute;left:116px;top:234px;width:1040px;font-size:${coverTitleSize}px;font-weight:700;line-height:1.28;color:#FFFFFF">${esc(page.title)}</div>
        ${sub ? `
          <div data-ppt="line" style="position:absolute;left:116px;top:434px;width:480px;height:1px;background:#35594C"></div>
          <div data-ppt="text" style="position:absolute;left:116px;top:460px;width:960px;font-size:21px;line-height:1.7;color:#D4DFDA">${esc(sub)}</div>
        ` : ''}
        ${footerHtml(num, true)}
      </section>`;
    }

    // 2. CONTENTS — 100% manuscript items only (zero fabricated intro text)
    if (page.role === 'contents') {
      slideTemplates[idx] = 'contents.list';
      const items = pts.length ? pts : [];
      if (style === 'editorial') {
        const step = Math.min(116, Math.floor(520 / Math.max(1, items.length)));
        return `<section class="slide" style="background:${P.bg}">
          ${page.label ? `<div data-ppt="text" class="mono" style="position:absolute;left:60px;top:36px;font-size:11.5px;letter-spacing:.14em;color:${P.mute}">${esc(page.label)}</div>` : ''}
          <div data-ppt="text" class="serif" style="position:absolute;left:60px;top:120px;width:320px;font-size:52px;font-weight:700;line-height:1.18;color:${P.ink}">${esc(page.title)}</div>
          <div data-ppt="shape" style="position:absolute;left:60px;top:210px;width:48px;height:3px;background:${P.accent}"></div>
          ${items.map((item, i) => `
            <div data-ppt="line" style="position:absolute;left:460px;top:${132 + i * step}px;width:760px;height:1px;background:${P.line}"></div>
            <div data-ppt="text" class="mono" style="position:absolute;left:460px;top:${152 + i * step}px;font-size:15px;font-weight:700;color:${P.accent}">${String(i + 1).padStart(2, '0')}</div>
            <div data-ppt="text" class="serif" style="position:absolute;left:530px;top:${146 + i * step}px;width:680px;font-size:${items.length > 5 ? 22 : 28}px;font-weight:700;color:${P.ink}">${esc(item)}</div>
          `).join('')}
          ${footerHtml(num)}
        </section>`;
      }
      const cols = Math.min(4, Math.max(2, items.length));
      const rows = Math.max(1, Math.ceil(items.length / cols));
      const cardW = Math.floor((1168 - (cols - 1) * 20) / cols);
      const cardH = rows === 1 ? 444 : Math.floor((460 - (rows - 1) * 20) / rows);
      return `<section class="slide" style="background:${P.bg}">
        ${headerHtml(page.label || '目录', page.title)}
        ${items.map((item, i) => {
          const x = 56 + (i % cols) * (cardW + 20);
          const y = 164 + Math.floor(i / cols) * (cardH + 20);
          const hi = i === 2;
          return `
            <div data-ppt="shape" style="position:absolute;left:${x}px;top:${y}px;width:${cardW}px;height:${cardH}px;border-radius:${style === 'bento' ? '14px' : '2px'};background:${P.card};border:1px solid ${P.line}"></div>
            <div data-ppt="shape" style="position:absolute;left:${x}px;top:${y}px;width:${cardW}px;height:8px;border-radius:${style === 'bento' ? '14px' : '0'};background:${hi ? P.accent : P.dark2}"></div>
            <div data-ppt="text" class="mono" style="position:absolute;left:${x + 26}px;top:${y + (rows > 1 ? 26 : 44)}px;font-size:${rows > 1 ? 30 : 44}px;font-weight:700;color:${hi ? P.accent : P.dark2}">${String(i + 1).padStart(2, '0')}</div>
            <div data-ppt="text" style="position:absolute;left:${x + 26}px;top:${y + (rows > 1 ? 82 : 144)}px;width:${cardW - 52}px;font-size:${rows > 1 ? 18 : 22}px;font-weight:700;line-height:1.4;color:${P.ink}">${esc(item)}</div>
          `;
        }).join('')}
        ${footerHtml(num)}
      </section>`;
    }

    // 3. BRIEF — Clean asymmetric Bento or 2-column grid (zero fabricated copy or English tags)
    if (page.role === 'brief') {
      slideTemplates[idx] = 'summary.list';
      if (style === 'bento' && pts.length >= 2) {
        const rightPts = pts.slice(1);
        const gap = rightPts.length > 4 ? 10 : 18;
        const cardH = Math.floor((514 - (rightPts.length - 1) * gap) / rightPts.length);
        const fontSz = rightPts.length > 4 ? 14 : 17;
        return `<section class="slide" style="background:${P.bg}">
          ${headerHtml(page.label || '需求回顾', page.title)}
          <div data-ppt="shape" style="position:absolute;left:56px;top:134px;width:456px;height:514px;border-radius:14px;background:${P.dark2}"></div>
          <div data-ppt="text" class="mono" style="position:absolute;left:86px;top:168px;font-size:14px;font-weight:700;color:${P.accent}">01</div>
          <div data-ppt="text" class="serif" style="position:absolute;left:86px;top:216px;width:396px;font-size:28px;font-weight:700;line-height:1.55;color:#FFFFFF">${esc(pts[0])}</div>
          <div data-ppt="line" style="position:absolute;left:86px;top:450px;width:56px;height:3px;background:${P.accent}"></div>
          ${rightPts.map((pt, i) => {
            const y = 134 + i * (cardH + gap);
            const isLast = i === rightPts.length - 1;
            return `
              <div data-ppt="shape" style="position:absolute;left:534px;top:${y}px;width:690px;height:${cardH}px;border-radius:14px;background:${isLast ? P.accentSoft : P.card};border:1px solid ${isLast ? P.accent : P.line}"></div>
              <div data-ppt="text" class="mono" style="position:absolute;left:564px;top:${y + Math.min(22, Math.round(cardH * 0.22))}px;font-size:13px;font-weight:700;color:${isLast ? P.accent : P.dark2}">0${i + 2}</div>
              <div data-ppt="text" style="position:absolute;left:606px;top:${y + Math.min(20, Math.round(cardH * 0.2))}px;width:592px;font-size:${fontSz}px;font-weight:600;line-height:1.55;color:${P.ink}">${esc(pt)}</div>
            `;
          }).join('')}
          ${footerHtml(num)}
        </section>`;
      }
      // Editorial / Consulting 2-column grid (renders ALL pts)
      const rows = Math.max(1, Math.ceil(pts.length / 2));
      const rowH = Math.min(220, Math.floor((490 - (rows - 1) * 18) / rows));
      return `<section class="slide" style="background:${P.bg}">
        ${headerHtml(page.label || '需求回顾', page.title)}
        ${pts.map((pt, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const x = 60 + col * 592, y = 152 + row * (rowH + 18);
          return `
            <div data-ppt="shape" style="position:absolute;left:${x}px;top:${y}px;width:568px;height:${rowH}px;background:${P.card};border:1px solid ${P.line}"></div>
            <div data-ppt="shape" style="position:absolute;left:${x}px;top:${y}px;width:6px;height:${rowH}px;background:${i === 2 ? P.accent : P.dark}"></div>
            <div data-ppt="text" class="mono" style="position:absolute;left:${x + 30}px;top:${y + 18}px;font-size:14px;font-weight:700;color:${i === 2 ? P.accent : P.dark}">0${i + 1}</div>
            <div data-ppt="text" style="position:absolute;left:${x + 30}px;top:${y + 48}px;width:506px;font-size:${rows > 2 ? 14.5 : 17.5}px;line-height:1.6;color:${P.ink}">${esc(pt)}</div>
          `;
        }).join('')}
        ${footerHtml(num)}
      </section>`;
    }

    // 4. TREND / INSIGHT — Chart ONLY when all percentages share the same scope/denominator; otherwise clean conclusion cards!
    if (page.role === 'trend' || page.role === 'insight') {
      slideTemplates[idx] = 'summary.list';
      const metrics = extractPercentMetrics(pts);
      const sourceNote = (page.sources ?? []).map((s) => s.source).filter(Boolean).join(' · ');
      if (metrics.length >= 2) {
        if (style === 'editorial') {
          const colW = Math.floor((1160 - (metrics.length - 1) * 36) / metrics.length);
          const lineStep = Math.min(56, Math.floor(236 / Math.max(1, pts.length)));
          return `<section class="slide" style="background:${P.bg}">
            ${headerHtml(page.label || '趋势洞察', page.title)}
            ${metrics.map((m, i) => {
              const x = 60 + i * (colW + 36);
              const col = i === metrics.length - 1 ? P.accent : P.ink;
              return `
                <div data-ppt="text" class="serif" style="position:absolute;left:${x}px;top:164px;font-size:82px;font-weight:700;color:${col};line-height:1">${m.value}%</div>
                <div data-ppt="shape" style="position:absolute;left:${x}px;top:270px;width:${colW}px;height:6px;background:${P.soft}"></div>
                <div data-ppt="shape" style="position:absolute;left:${x}px;top:270px;width:${Math.max(12, Math.round(colW * m.value / 100))}px;height:6px;background:${col}"></div>
                <div data-ppt="text" style="position:absolute;left:${x}px;top:294px;width:${colW}px;font-size:18px;font-weight:700;color:${P.ink}">${esc(m.label)}</div>
              `;
            }).join('')}
            <div data-ppt="line" style="position:absolute;left:60px;top:372px;width:1160px;height:1px;background:${P.line}"></div>
            ${pts.map((pt, i) => `
              <div data-ppt="text" style="position:absolute;left:60px;top:${390 + i * lineStep}px;width:1160px;font-size:${pts.length > 4 ? 13.5 : 15.5}px;line-height:1.5;color:${P.mute}">· ${esc(pt)}</div>
            `).join('')}
            ${sourceNote ? `<div data-ppt="text" style="position:absolute;left:60px;top:636px;width:1100px;font-size:11.5px;color:${P.mute}">来源：${esc(sourceNote)}</div>` : ''}
            ${footerHtml(num)}
          </section>`;
        }

        // Bento & Consulting: Native PPTX bar chart when all metrics share ratio scope;
        // clean editable horizontal data bars when growth & share metrics appear together.
        const sameScopeRatios = metrics.every((m) => !m.isGrowth);
        const maxVal = Math.min(100, Math.max(60, Math.ceil(Math.max(...metrics.map((m) => m.value)) / 10) * 10 + 10));
        if (sameScopeRatios) {
          chartSpecs.set(idx, {
            x: 68, y: 186, w: 690, h: 350,
            labels: metrics.map((m) => m.label),
            values: metrics.map((m) => m.value),
            maxVal,
            color: P.dark2.slice(1),
          });
        }
        const barPptAttr = sameScopeRatios ? '' : ' data-ppt="shape"';
        const barTxtAttr = sameScopeRatios ? '' : ' data-ppt="text"';
        const cardGap = pts.length > 4 ? 10 : 14;
        const cardH = Math.floor((492 - (Math.max(1, pts.length) - 1) * cardGap) / Math.max(1, pts.length));
        return `<section class="slide" style="background:${P.bg}">
          ${headerHtml(page.label || '趋势洞察', page.title)}
          <div data-ppt="shape" style="position:absolute;left:56px;top:138px;width:714px;height:492px;border-radius:${style === 'bento' ? '14px' : '2px'};background:${P.card};border:1px solid ${P.line}"></div>
          <div data-ppt="text" style="position:absolute;left:84px;top:162px;font-size:16px;font-weight:700;color:${P.ink}">${sameScopeRatios ? '关键指标对比（%）' : '关键趋势数据一览（%）'}</div>
          ${metrics.map((m, i) => {
            const y = 228 + i * Math.min(96, Math.floor(300 / metrics.length));
            const barCol = i === 0 ? P.dark2 : i === metrics.length - 1 ? P.accent : '#2F6655';
            return `
              <div${barTxtAttr} style="position:absolute;left:76px;top:${y}px;width:176px;font-size:14px;font-weight:600;color:${P.ink};text-align:right">${esc(m.label)}</div>
              <div${barPptAttr} style="position:absolute;left:266px;top:${y - 4}px;width:380px;height:28px;border-radius:${style === 'bento' ? '6px' : '0'};background:${P.soft}"></div>
              <div${barPptAttr} style="position:absolute;left:266px;top:${y - 4}px;width:${Math.max(18, Math.round(380 * m.value / maxVal))}px;height:28px;border-radius:${style === 'bento' ? '6px' : '0'};background:${barCol}"></div>
              <div${barTxtAttr} class="mono" style="position:absolute;left:660px;top:${y - 2}px;font-size:17.5px;font-weight:700;color:${barCol}">${m.value}%</div>
            `;
          }).join('')}
          ${sourceNote ? `<div data-ppt="text" style="position:absolute;left:84px;top:586px;width:660px;font-size:11.5px;color:${P.mute}">来源：${esc(sourceNote)}</div>` : ''}
          ${pts.map((pt, i) => {
            const y = 138 + i * (cardH + cardGap);
            const darkCard = style === 'bento' && i === 0;
            return `
              <div data-ppt="shape" style="position:absolute;left:792px;top:${y}px;width:432px;height:${cardH}px;border-radius:${style === 'bento' ? '14px' : '2px'};background:${darkCard ? P.dark2 : P.card};border:1px solid ${darkCard ? P.dark2 : P.line}"></div>
              <div data-ppt="text" style="position:absolute;left:818px;top:${y + Math.min(18, Math.round(cardH * 0.16))}px;width:380px;font-size:${pts.length > 4 ? 12.5 : 14.5}px;line-height:1.52;color:${darkCard ? '#FFFFFF' : P.ink}">${esc(pt)}</div>
            `;
          }).join('')}
          ${footerHtml(num)}
        </section>`;
      }
      // Qualitative or multi-scope trend/insight: clean multi-card layout (zero forced bar charts!)
      const cols = Math.min(3, Math.max(1, pts.length));
      const rows = Math.max(1, Math.ceil(pts.length / cols));
      const cardW = Math.floor((1168 - (cols - 1) * 20) / cols);
      const availH = sourceNote ? 452 : 486;
      const h = rows === 1 ? availH : Math.floor((availH - (rows - 1) * 18) / rows);
      return `<section class="slide" style="background:${P.bg}">
        ${headerHtml(page.label || '趋势洞察', page.title)}
        ${pts.map((pt, i) => {
          const x = 56 + (i % cols) * (cardW + 20);
          const y = 148 + Math.floor(i / cols) * (h + 18);
          const darkFirst = style === 'bento' && i === 0 && pts.length <= 3;
          return `
            <div data-ppt="shape" style="position:absolute;left:${x}px;top:${y}px;width:${cardW}px;height:${h}px;border-radius:${style === 'bento' ? '14px' : '2px'};background:${darkFirst ? P.dark2 : P.card};border:1px solid ${darkFirst ? P.dark2 : P.line}"></div>
            <div data-ppt="text" class="mono" style="position:absolute;left:${x + 26}px;top:${y + 24}px;font-size:20px;font-weight:700;color:${P.accent}">0${i + 1}</div>
            <div data-ppt="text" style="position:absolute;left:${x + 26}px;top:${y + 66}px;width:${cardW - 52}px;font-size:${rows > 2 ? 14 : 17.5}px;line-height:1.7;color:${darkFirst ? '#FFFFFF' : P.ink}">${esc(pt)}</div>
          `;
        }).join('')}
        ${sourceNote ? `<div data-ppt="text" style="position:absolute;left:56px;top:628px;width:1168px;font-size:11.5px;color:${P.mute}">来源：${esc(sourceNote)}</div>` : ''}
        ${footerHtml(num)}
      </section>`;
    }

    // 5. PEERS — 3-Column Comparison Cards + Bottom Takeaway Strip (zero fabricated "参考 1/2/3" titles!)
    if (page.role === 'peers') {
      slideTemplates[idx] = 'summary.list';
      const mainPeers = pts.slice(0, Math.min(3, pts.length));
      const bottomNote = pts.length > 3 ? pts.slice(3).join('；') : '';
      const cols = Math.max(1, mainPeers.length);
      const colW = Math.floor((1168 - (cols - 1) * 20) / cols);
      const stripColors = [P.dark2, P.accent, '#4A5550'];
      const cardH = bottomNote ? 378 : 486;
      return `<section class="slide" style="background:${P.bg}">
        ${headerHtml(page.label || '同类参考', page.title)}
        ${mainPeers.map((pt, i) => {
          const { brand, detail } = splitPeerLine(pt);
          const x = 56 + i * (colW + 20);
          if (style === 'editorial') {
            return `
              ${i > 0 ? `<div data-ppt="line" style="position:absolute;left:${x - 10}px;top:156px;width:1px;height:${cardH}px;background:${P.line}"></div>` : ''}
              <div data-ppt="text" class="mono" style="position:absolute;left:${x + 6}px;top:162px;font-size:12.5px;font-weight:700;color:${P.accent}">0${i + 1}</div>
              ${brand ? `<div data-ppt="text" class="serif" style="position:absolute;left:${x + 6}px;top:194px;width:${colW - 16}px;font-size:26px;font-weight:700;color:${P.ink}">${esc(brand)}</div>` : ''}
              <div data-ppt="text" style="position:absolute;left:${x + 6}px;top:${brand ? 250 : 204}px;width:${colW - 16}px;font-size:16.5px;line-height:1.78;color:${brand ? P.mute : P.ink}">${esc(detail)}</div>
            `;
          }
          return `
            <div data-ppt="shape" style="position:absolute;left:${x}px;top:144px;width:${colW}px;height:${cardH}px;border-radius:${style === 'bento' ? '14px' : '2px'};background:${P.card};border:1px solid ${P.line}"></div>
            <div data-ppt="shape" style="position:absolute;left:${x}px;top:144px;width:${colW}px;height:8px;border-radius:${style === 'bento' ? '14px' : '0'};background:${stripColors[i % stripColors.length]}"></div>
            ${brand
              ? `<div data-ppt="text" class="serif" style="position:absolute;left:${x + 26}px;top:180px;width:${colW - 52}px;font-size:24px;font-weight:700;color:${P.ink}">${esc(brand)}</div>`
              : `<div data-ppt="text" class="mono" style="position:absolute;left:${x + 26}px;top:180px;font-size:18px;font-weight:700;color:${P.accent}">0${i + 1}</div>`}
            <div data-ppt="text" style="position:absolute;left:${x + 26}px;top:${brand ? 236 : 226}px;width:${colW - 52}px;font-size:16px;line-height:1.75;color:${brand ? P.mute : P.ink}">${esc(detail)}</div>
          `;
        }).join('')}
        ${bottomNote ? `
          <div data-ppt="shape" style="position:absolute;left:56px;top:546px;width:1168px;height:96px;border-radius:${style === 'bento' ? '12px' : '2px'};background:${style === 'editorial' ? P.accentSoft : P.dark2}"></div>
          <div data-ppt="text" style="position:absolute;left:84px;top:576px;width:1112px;font-size:16px;font-weight:600;color:${style === 'editorial' ? P.ink : '#FFFFFF'}">${esc(bottomNote)}</div>
        ` : ''}
        ${footerHtml(num)}
      </section>`;
    }

    // 6. STRATEGY — Dramatic Anchor Slide
    if (page.role === 'strategy') {
      slideTemplates[idx] = 'summary.statement';
      const dark = style !== 'editorial';
      return `<section class="slide" style="background:${dark ? P.dark : P.bg};color:${dark ? '#fff' : P.ink}">
        <div data-ppt="text" class="mono" style="position:absolute;left:${dark ? 88 : 60}px;top:${dark ? 132 : 36}px;font-size:13px;font-weight:700;color:${P.accent};letter-spacing:.14em">${esc(page.label || '核心策略')}</div>
        <div data-ppt="shape" style="position:absolute;left:${dark ? 88 : 596}px;top:${dark ? 174 : 168}px;width:84px;height:4px;background:${P.accent}"></div>
        <div data-ppt="text" class="serif" style="position:absolute;left:${dark ? 88 : 130}px;top:${dark ? 218 : 226}px;width:${dark ? 1100 : 1020}px;font-size:46px;font-weight:700;line-height:1.45;text-align:${dark ? 'left' : 'center'};color:${dark ? '#FFFFFF' : P.ink}">${esc(page.title)}</div>
        ${pts.length ? `<div data-ppt="text" style="position:absolute;left:${dark ? 88 : 160}px;top:450px;width:${dark ? 1060 : 960}px;font-size:17px;line-height:1.7;text-align:${dark ? 'left' : 'center'};color:${dark ? '#BFD1CA' : P.mute}">${esc(pts.join(' · '))}</div>` : ''}
        ${footerHtml(num, dark)}
      </section>`;
    }

    // 7. EXECUTION — Full-width clean numbered execution cards (zero hardcoded poster wireframe!)
    if (page.role === 'execution') {
      slideTemplates[idx] = 'summary.list';
      const gap = pts.length > 4 ? 12 : 16;
      const cardH = Math.min(126, Math.floor((498 - (Math.max(1, pts.length) - 1) * gap) / Math.max(1, pts.length)));
      return `<section class="slide" style="background:${P.bg}">
        ${headerHtml(page.label || '执行展开', page.title)}
        ${pts.map((pt, i) => {
          const y = 148 + i * (cardH + gap);
          const isFirst = style === 'bento' && i === 0;
          return `
            <div data-ppt="shape" style="position:absolute;left:56px;top:${y}px;width:1168px;height:${cardH}px;border-radius:${style === 'bento' ? '12px' : '2px'};background:${isFirst ? P.dark2 : P.card};border:1px solid ${isFirst ? P.dark2 : P.line}"></div>
            <div data-ppt="text" class="mono" style="position:absolute;left:88px;top:${y + Math.round((cardH - 26) / 2)}px;font-size:20px;font-weight:700;color:${P.accent}">0${i + 1}</div>
            <div data-ppt="text" style="position:absolute;left:156px;top:${y + Math.max(12, Math.round((cardH - 28) / 2))}px;width:1032px;font-size:${pts.length > 4 ? 15 : 17.5}px;line-height:1.55;color:${isFirst ? '#FFFFFF' : P.ink}">${esc(pt)}</div>
          `;
        }).join('')}
        ${footerHtml(num)}
      </section>`;
    }

    // 8. DIRECTION — High-impact split layout honoring imageSide (matches layout-pages.mjs alternating default: 左 first!)
    if (page.role === 'direction') {
      const side = page.imageSide || (directionCounter++ % 2 === 0 ? '左' : '右');
      const imgOnLeft = side === '左';
      slideTemplates[idx] = imgOnLeft ? 'design.half' : 'design.halfR';
      const imgX = imgOnLeft ? 56 : 756;
      const txtX = imgOnLeft ? 556 : 56;
      const mainImg = pageImgs[0]?.img;
      const copyPts = pts.filter((p) => /^(?:主标|副标) · /u.test(p));
      const detailPts = pts.filter((p) => !/^(?:主标|副标) · /u.test(p));
      const topBase = copyPts.length ? 338 : 196;
      const availH = 650 - topBase;
      const detailGap = detailPts.length > 3 ? 10 : 14;
      const detailH = detailPts.length
        ? Math.min(148, Math.floor((availH - (detailPts.length - 1) * detailGap) / detailPts.length))
        : 0;
      const dirEyebrow = [page.chapter, page.label].filter(Boolean).join(' · ') || '方向阐述';
      return `<section class="slide" style="background:${P.bg}">
        <div data-ppt="text" class="mono" style="position:absolute;left:${txtX}px;top:38px;font-size:12px;font-weight:700;color:${P.accent};letter-spacing:.1em">${esc(dirEyebrow)}</div>
        <div data-ppt="text" class="serif" style="position:absolute;left:${txtX}px;top:76px;width:668px;font-size:44px;font-weight:700;line-height:1.22;color:${P.ink}">${esc(page.title)}</div>
        ${copyPts.length ? `
          <div data-ppt="shape" style="position:absolute;left:${txtX}px;top:186px;width:668px;height:132px;border-radius:${style === 'bento' ? '12px' : '2px'};background:${style === 'editorial' ? P.accentSoft : P.dark2}"></div>
          <div data-ppt="text" style="position:absolute;left:${txtX + 26}px;top:208px;width:616px;font-size:17px;line-height:1.68;color:${style === 'editorial' ? P.ink : '#FFFFFF'}">${esc(copyPts.join('\n'))}</div>
        ` : ''}
        ${detailPts.map((pt, i) => {
          const y = topBase + i * (detailH + detailGap);
          return `
            <div data-ppt="shape" style="position:absolute;left:${txtX}px;top:${y}px;width:668px;height:${detailH}px;border-radius:${style === 'bento' ? '12px' : '2px'};background:${P.card};border:1px solid ${P.line}"></div>
            <div data-ppt="text" style="position:absolute;left:${txtX + 26}px;top:${y + Math.min(18, Math.round(detailH * 0.18))}px;width:616px;font-size:${detailPts.length > 3 ? 13.5 : 15.5}px;line-height:1.58;color:${P.ink}">${esc(pt)}</div>
          `;
        }).join('')}
        ${mainImg ? `
          <div data-ppt="shape" style="position:absolute;left:${imgX}px;top:44px;width:468px;height:612px;border-radius:${style === 'bento' ? '14px' : '2px'};background:${P.soft};border:1px solid ${P.line}"></div>
          ${imgTag(mainImg, `position:absolute;left:${imgX + 14}px;top:58px;width:440px;height:584px`, 'contain')}
        ` : ''}
        ${footerHtml(num)}
      </section>`;
    }

    // 9. WORK — Museum exhibition single artwork showcase (honors Case B 'gallery' refinement!)
    if (page.role === 'work') {
      slideTemplates[idx] = 'upload.framed';
      const mainImg = pageImgs[0]?.img;
      const figId = page.figures?.[0] || '';
      const dark = style !== 'editorial';
      const galleryMode = refinements.includes('gallery');
      return `<section class="slide" style="background:${dark ? P.dark : P.bg};color:${dark ? '#fff' : P.ink}">
        <div data-ppt="text" class="mono" style="position:absolute;left:56px;top:30px;font-size:12px;font-weight:700;color:${P.accent};letter-spacing:.1em">${esc(page.label || '成品展示')}</div>
        ${figId ? `<div data-ppt="text" class="mono" style="position:absolute;left:192px;top:30px;font-size:12px;font-weight:700;color:${dark ? '#8FA39C' : P.mute};letter-spacing:.1em">${esc(figId)}</div>` : ''}
        <div data-ppt="text" class="serif" style="position:absolute;right:56px;top:24px;font-size:24px;font-weight:700;color:${dark ? '#FFFFFF' : P.ink}">${esc(page.title)}</div>
        ${galleryMode && figId ? `
          <div data-ppt="shape" style="position:absolute;left:56px;top:324px;width:190px;height:72px;border-radius:4px;background:${dark ? '#182A24' : P.card};border:1px solid ${P.accent}"></div>
          <div data-ppt="text" class="mono" style="position:absolute;left:72px;top:348px;width:160px;font-size:14px;font-weight:700;color:${dark ? '#FFFFFF' : P.ink}">${esc(figId + ' · 采用原图')}</div>
        ` : ''}
        ${mainImg ? (galleryMode ? `
          <div data-ppt="shape" style="position:absolute;left:286px;top:76px;width:708px;height:580px;border-radius:2px;background:transparent;border:1.5px solid ${P.accent}"></div>
          <div data-ppt="shape" style="position:absolute;left:298px;top:88px;width:684px;height:556px;border-radius:2px;background:${dark ? '#182A24' : P.card};border:1px solid ${dark ? '#FFFFFF' : P.line}"></div>
          ${imgTag(mainImg, 'position:absolute;left:314px;top:104px;width:652px;height:524px', 'contain')}
        ` : `
          <div data-ppt="shape" style="position:absolute;left:160px;top:74px;width:960px;height:590px;border-radius:${style === 'bento' ? '14px' : '2px'};background:${dark ? '#182A24' : P.card};border:1px solid ${dark ? '#2D483E' : P.line}"></div>
          ${imgTag(mainImg, 'position:absolute;left:180px;top:90px;width:920px;height:558px', 'contain')}
        `) : ''}
        ${pts.length ? `<div data-ppt="text" style="position:absolute;left:56px;top:672px;width:1168px;font-size:12.5px;color:${dark ? '#B8C9C2' : P.mute}">${esc(pts.join(' · '))}</div>` : ''}
        ${footerHtml(num, dark)}
      </section>`;
    }

    // 10. APPLICATION (延展与样机) — Pure large-format gallery of Extension + Real Mockup ONLY, ZERO extra body text!
    if (page.role === 'application') {
      slideTemplates[idx] = pageImgs.length >= 2 ? 'compare.lineup' : 'upload.framed';
      const dark = style === 'bento';
      const gallery = pageImgs;
      const count = Math.max(1, gallery.length);
      const gap = 24;
      const cardW = count === 1 ? 1040 : Math.floor((1184 - (count - 1) * gap) / count);
      const startX = count === 1 ? 120 : 48;
      const topY = 82;
      const frameH = pts.length ? 556 : 584;
      return `<section class="slide" style="background:${dark ? P.dark : P.bg};color:${dark ? '#fff' : P.ink}">
        <div data-ppt="text" class="mono" style="position:absolute;left:48px;top:28px;font-size:12px;font-weight:700;color:${P.accent};letter-spacing:.1em">${esc(page.label || '延展与样机')}</div>
        <div data-ppt="text" class="serif" style="position:absolute;right:48px;top:22px;font-size:22px;font-weight:700;color:${dark ? '#FFFFFF' : P.ink}">${esc(page.title)}</div>
        ${gallery.map((item, k) => {
          const x = startX + k * (cardW + gap);
          return `
            ${style !== 'editorial' ? `<div data-ppt="shape" style="position:absolute;left:${x}px;top:${topY}px;width:${cardW}px;height:${frameH}px;border-radius:${style === 'bento' ? '14px' : '2px'};background:${dark ? '#182A24' : P.card};border:1px solid ${dark ? '#2D483E' : P.line}"></div>` : ''}
            ${imgTag(item.img, `position:absolute;left:${x + 14}px;top:${topY + 14}px;width:${cardW - 28}px;height:${frameH - 28}px`, 'contain')}
          `;
        }).join('')}
        ${pts.length ? `<div data-ppt="text" style="position:absolute;left:48px;top:648px;width:1184px;font-size:12.5px;color:${dark ? '#B8C9C2' : P.mute}">${esc(pts.join(' · '))}</div>` : ''}
        ${footerHtml(num, dark)}
      </section>`;
    }

    // 11. COMPARE — 3-column visual triptych (preserves any overflow points cleanly!)
    if (page.role === 'compare') {
      slideTemplates[idx] = 'compare.lineup';
      const count = Math.max(1, pageImgs.length);
      const colW = Math.floor((1168 - (count - 1) * 24) / count);
      const extraNote = pts.length > pageImgs.length ? pts.slice(pageImgs.length).join(' · ') : '';
      const cardH = extraNote ? 464 : 520;
      const imgH = extraNote ? 270 : 312;
      return `<section class="slide" style="background:${P.bg}">
        ${headerHtml(page.label || '横向对比', page.title)}
        ${pageImgs.map((item, i) => {
          const x = 56 + i * (colW + 24);
          const dirTitle = copyByDir.get(item.fig.direction)?.main || item.fig.direction;
          const desc = pts[i] || '';
          return `
            ${style !== 'editorial' ? `<div data-ppt="shape" style="position:absolute;left:${x}px;top:138px;width:${colW}px;height:${cardH}px;border-radius:${style === 'bento' ? '14px' : '2px'};background:${P.card};border:${i === 0 ? '2px solid ' + P.accent : '1px solid ' + P.line}"></div>` : ''}
            ${imgTag(item.img, `position:absolute;left:${x + 16}px;top:152px;width:${colW - 32}px;height:${imgH}px`, 'contain')}
            <div data-ppt="line" style="position:absolute;left:${x + 16}px;top:${166 + imgH}px;width:${colW - 32}px;height:1px;background:${style === 'editorial' ? P.ink : P.line}"></div>
            <div data-ppt="text" class="serif" style="position:absolute;left:${x + 18}px;top:${178 + imgH}px;width:${colW - 36}px;font-size:18px;font-weight:700;color:${P.ink}">${esc(dirTitle)}</div>
            <div data-ppt="text" style="position:absolute;left:${x + 18}px;top:${210 + imgH}px;width:${colW - 36}px;font-size:13px;line-height:1.55;color:${P.mute}">${esc(desc)}</div>
          `;
        }).join('')}
        ${extraNote ? `
          <div data-ppt="shape" style="position:absolute;left:56px;top:614px;width:1168px;height:50px;border-radius:${style === 'bento' ? '10px' : '2px'};background:${P.accentSoft};border:1px solid ${P.accent}"></div>
          <div data-ppt="text" style="position:absolute;left:78px;top:628px;width:1124px;font-size:14px;font-weight:600;color:${P.ink}">${esc(extraNote)}</div>
        ` : ''}
        ${footerHtml(num)}
      </section>`;
    }

    // 12. DECISION — Clean numbered action cards (ALL pts preserved!)
    if (page.role === 'decision') {
      slideTemplates[idx] = 'summary.list';
      const gap = pts.length > 5 ? 10 : 14;
      const rowH = Math.min(110, Math.floor((500 - (Math.max(1, pts.length) - 1) * gap) / Math.max(1, pts.length)));
      return `<section class="slide" style="background:${P.bg}">
        ${headerHtml(page.label || '决策与待确认', page.title)}
        ${pts.map((pt, i) => {
          const y = 148 + i * (rowH + gap);
          return `
            <div data-ppt="shape" style="position:absolute;left:56px;top:${y}px;width:1168px;height:${rowH}px;border-radius:${style === 'bento' ? '12px' : '2px'};background:${P.card};border:1px solid ${P.line}"></div>
            <div data-ppt="text" class="mono" style="position:absolute;left:84px;top:${y + Math.round((rowH - 28) / 2)}px;font-size:${pts.length > 5 ? 18 : 24}px;font-weight:700;color:${P.accent}">0${i + 1}</div>
            <div data-ppt="text" style="position:absolute;left:150px;top:${y + Math.max(10, Math.round((rowH - 26) / 2))}px;width:1040px;font-size:${pts.length > 5 ? 14 : 16.5}px;line-height:1.45;color:${P.ink}">${esc(pt)}</div>
          `;
        }).join('')}
        ${footerHtml(num)}
      </section>`;
    }

    // 13. CLOSE — Dark anchor closing slide (splits greeting cleanly just like layout-pages.mjs!)
    if (page.role === 'close') {
      const greeting = page.title.match(/^((?:感谢观看|谢谢观看|谢谢)(?:[，,。！!]|$))\s*(.*)$/u);
      slideTemplates[idx] = greeting ? 'closing.type' : 'summary.statement';
      const mainTitle = greeting ? greeting[1] : page.title;
      const subParts = [greeting?.[2], ...pts].filter(Boolean);
      return `<section class="slide" style="background:${P.dark};color:#fff">
        <div data-ppt="shape" style="position:absolute;left:580px;top:228px;width:120px;height:4px;background:${P.accent}"></div>
        <div data-ppt="text" class="serif" style="position:absolute;left:100px;top:276px;width:1080px;font-size:48px;font-weight:700;text-align:center;line-height:1.4;color:#FFFFFF">${esc(mainTitle)}</div>
        ${subParts.length ? `<div data-ppt="text" style="position:absolute;left:140px;top:392px;width:1000px;font-size:19px;text-align:center;line-height:1.65;color:#B8C9C2">${esc(subParts.join(' · '))}</div>` : ''}
        ${footerHtml(num, true)}
      </section>`;
    }

    // Generic fallback slide (ALL pts + any figures preserved!)
    slideTemplates[idx] = 'summary.list';
    const gap = pts.length > 5 ? 10 : 14;
    const rowH = Math.min(72, Math.floor((490 - (Math.max(1, pts.length) - 1) * gap) / Math.max(1, pts.length)));
    return `<section class="slide" style="background:${P.bg}">
      ${headerHtml(page.label || page.chapter || '提案内容', page.title)}
      ${pts.map((pt, i) => `
        <div data-ppt="shape" style="position:absolute;left:56px;top:${146 + i * (rowH + gap)}px;width:${pageImgs.length ? 720 : 1168}px;height:${rowH}px;border-radius:${style === 'bento' ? '10px' : '2px'};background:${P.card};border:1px solid ${P.line}"></div>
        <div data-ppt="text" style="position:absolute;left:84px;top:${146 + i * (rowH + gap) + Math.max(10, Math.round((rowH - 22) / 2))}px;width:${pageImgs.length ? 664 : 1112}px;font-size:${pts.length > 5 ? 13.5 : 16}px;color:${P.ink}">${esc(pt)}</div>
      `).join('')}
      ${pageImgs.map((item, k) => imgTag(item.img, `position:absolute;left:804px;top:${146 + k * 240}px;width:420px;height:220px`, 'contain')).join('')}
      ${footerHtml(num)}
    </section>`;
  });

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)} · ${esc(styleLabel)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #101211; font-family: "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", sans-serif; color: ${P.ink}; overflow: hidden; }
  .slide { width: 1280px; height: 720px; position: relative; overflow: hidden; display: none; }
  .serif { font-family: "Songti SC", "STSong", "Noto Serif SC", Georgia, serif; }
  .mono { font-family: "Menlo", "IBM Plex Mono", monospace; }
  .deck-chrome { position: fixed; right: 22px; bottom: 18px; z-index: 99; display: flex; align-items: center; gap: 8px; }
  .deck-chrome button { padding: 7px 14px; border: 1px solid rgba(255,255,255,.28); background: rgba(15,24,20,.78); color: #fff; cursor: pointer; font-size: 12px; border-radius: 6px; backdrop-filter: blur(8px); }
  .deck-chrome span { color: rgba(255,255,255,.85); font: 12px Menlo, monospace; padding: 0 6px; }
</style>
</head>
<body>
${slideHtmls.join('\n')}
<div class="deck-chrome">
  <button type="button" onclick="go(-1)">← 上一页</button>
  <span id="deck-pos">1 / ${total}</span>
  <button type="button" onclick="go(1)">下一页 →</button>
</div>
<script>
  let cur = 0;
  const slides = [...document.querySelectorAll('.slide')];
  const pos = document.getElementById('deck-pos');
  function show(i) {
    cur = (i + slides.length) % slides.length;
    slides.forEach((s, k) => { s.style.display = k === cur ? 'block' : 'none'; });
    if (pos) pos.textContent = (cur + 1) + ' / ' + slides.length;
  }
  function go(d) { show(cur + d); }
  function fit() {
    if (location.search.includes('export=1')) return;
    const k = Math.min(innerWidth / 1280, innerHeight / 720);
    slides.forEach((s) => {
      s.style.position = 'fixed';
      s.style.left = '50%';
      s.style.top = '50%';
      s.style.transform = 'translate(-50%,-50%) scale(' + k + ')';
    });
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
  });
  addEventListener('resize', fit);
  show(0); fit();
</script>
</body>
</html>`;

  return { html, chartSpecs, slideTemplates };
}

export async function renderHtmlDeck({
  title,
  manuscript,
  images,
  theme = {},
  edits = [],
  style = 'bento',
  signal = new AbortController().signal,
  onEvent = () => {},
}) {
  signal.throwIfAborted();
  const resolvedStyle = normalizeDeckStyle(style);
  const editedPlan = applyManuscriptEdits(manuscript, edits);
  const imageByName = new Map(images.map((img) => [img.id, img]));
  const allFigures = new Map([...editedPlan.figures, ...(editedPlan.derivatives ?? [])].map((f) => [f.id, f]));

  onEvent('正在以「' + DECK_STYLE_LABELS[resolvedStyle] + '」风格编排 HTML 与可编辑 PPTX');
  const { html, chartSpecs, slideTemplates } = buildHtmlSlides({
    title,
    plan: editedPlan,
    imageByName,
    style: resolvedStyle,
    theme,
  });

  const PptxGenJS = requireApp('pptxgenjs');
  const { chromium } = requireApp('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });
  const abort = () => { void browser.close().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });

  try {
    const page = await browser.newPage({ offline: true, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const imgs = [...document.querySelectorAll('img')];
      await Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 4000); })));
    });

    const slideCount = await page.locator('.slide').count();
    const PX = 96;
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
    pres.title = title;
    pres.author = '夜航提案台';

    const deckPages = [];
    const pageJpegs = [];
    const renderHashes = [];

    for (let i = 0; i < slideCount; i++) {
      signal.throwIfAborted();
      await page.evaluate((idx) => {
        document.querySelectorAll('.slide').forEach((el, k) => {
          el.style.display = k === idx ? 'block' : 'none';
          el.style.position = 'fixed';
          el.style.left = '0';
          el.style.top = '0';
          el.style.width = '1280px';
          el.style.height = '720px';
          el.style.transform = 'none';
        });
        document.querySelectorAll('.deck-chrome').forEach((el) => { el.style.display = 'none'; });
      }, i);

      const jpgBytes = await page.screenshot({ type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 1280, height: 720 } });
      pageJpegs.push(jpgBytes);
      renderHashes.push(sha(jpgBytes));

      const domSlide = await page.evaluate((idx) => {
        const root = document.querySelectorAll('.slide')[idx];
        const bgColor = getComputedStyle(root).backgroundColor;
        const items = [];
        for (const el of root.querySelectorAll('[data-ppt]')) {
          const kind = el.getAttribute('data-ppt');
          const r = el.getBoundingClientRect();
          if (r.width <= 0.5 || r.height <= 0.5) continue;
          const st = getComputedStyle(el);
          if (kind === 'shape' || kind === 'line') {
            items.push({
              kind, x: r.left, y: r.top, w: r.width, h: r.height,
              bg: st.backgroundColor, borderColor: st.borderTopColor,
              borderWidth: parseFloat(st.borderTopWidth) || 0,
              radius: parseFloat(st.borderTopLeftRadius) || 0,
              opacity: parseFloat(st.opacity) || 1,
            });
          } else if (kind === 'img') {
            items.push({
              kind: 'img', x: r.left, y: r.top, w: r.width, h: r.height,
              assetId: el.getAttribute('data-asset') || '',
              fit: st.objectFit || 'contain',
            });
          } else if (kind === 'text') {
            const text = (el.innerText || '').trim();
            if (!text) continue;
            items.push({
              kind: 'text', x: r.left, y: r.top, w: r.width, h: r.height,
              text, color: st.color, fontSize: parseFloat(st.fontSize) || 14,
              fontWeight: parseInt(st.fontWeight, 10) || 400,
              fontFamily: st.fontFamily, textAlign: st.textAlign || 'left',
            });
          }
        }
        return { bgColor, items };
      }, i);

      const slide = pres.addSlide();
      const bg = rgbToHex(domSlide.bgColor);
      if (bg) slide.background = { color: bg.hex };

      const pageNodes = [];
      for (const item of domSlide.items) {
        const x = Math.max(0, item.x / PX);
        const y = Math.max(0, item.y / PX);
        const w = Math.max(0.02, item.w / PX);
        const h = Math.max(0.02, item.h / PX);

        if (item.kind === 'shape' || item.kind === 'line') {
          const fill = rgbToHex(item.bg);
          const stroke = item.borderWidth > 0 ? rgbToHex(item.borderColor) : null;
          const shapeType = item.radius >= 4 ? pres.ShapeType.roundRect : pres.ShapeType.rect;
          const opts = { x, y, w, h };
          if (fill) {
            const trans = Math.round((1 - fill.alpha * item.opacity) * 100);
            opts.fill = { color: fill.hex, ...(trans > 0 ? { transparency: Math.min(98, trans) } : {}) };
          } else {
            opts.fill = { type: 'none' };
          }
          if (stroke && item.borderWidth > 0) {
            opts.line = { color: stroke.hex, pt: Math.max(0.5, item.borderWidth * 0.75) };
          } else {
            opts.line = { type: 'none' };
          }
          if (item.radius >= 4) opts.rectRadius = Math.min(0.2, item.radius / Math.min(item.w, item.h));
          slide.addShape(shapeType, opts);
        } else if (item.kind === 'img') {
          const img = imageByName.get(item.assetId);
          if (!img) continue;
          slide.addImage({
            data: img.data,
            altText: img.alt || img.id,
            objectName: img.id,
            x, y, w, h,
            sizing: { type: item.fit === 'cover' ? 'cover' : 'contain', w, h },
          });
          pageNodes.push({
            kind: 'image',
            x: item.x, y: item.y, w: item.w, h: item.h,
            image: { id: img.id, alt: img.alt || img.id, data: img.data },
          });
        } else if (item.kind === 'text') {
          const col = rgbToHex(item.color) || { hex: '1A1A1A' };
          const pt = Math.max(8, Math.round(item.fontSize * 0.75 * 10) / 10);
          const align = ['center', 'right', 'justify'].includes(item.textAlign) ? item.textAlign : 'left';
          slide.addText(item.text, {
            x, y, w: w + 0.08, h: h + 0.06,
            color: col.hex,
            fontSize: pt,
            fontFace: mapFontFamily(item.fontFamily),
            bold: item.fontWeight >= 600,
            align,
            valign: 'top',
            margin: 0,
            wrap: true,
            lang: 'zh-CN',
          });
          pageNodes.push({
            kind: 'text',
            x: item.x, y: item.y, w: item.w, h: item.h,
            lines: item.text.split(/\r?\n/u),
            runs: [],
          });
        }
      }

      // Inject REAL native editable PowerPoint Bar Chart when this slide has extracted percentage metrics
      const chartSpec = chartSpecs.get(i);
      if (chartSpec) {
        slide.addChart(pres.ChartType.bar, [
          { name: '占比（%）', labels: chartSpec.labels, values: chartSpec.values },
        ], {
          x: chartSpec.x / PX,
          y: chartSpec.y / PX,
          w: chartSpec.w / PX,
          h: chartSpec.h / PX,
          barDir: 'bar',
          chartColors: [chartSpec.color],
          showLegend: false,
          showValue: true,
          dataLabelPosition: 'outEnd',
          dataLabelFormatCode: '0.##"%"',
          dataLabelFontSize: 12,
          valAxisMinVal: 0,
          valAxisMaxVal: chartSpec.maxVal,
          valAxisHidden: true,
          catAxisLabelFontSize: 11,
          gridLine: { style: 'none' },
          lang: 'zh-CN',
        });
      }

      const planned = editedPlan.pages[i];
      const noteText = [
        planned.title,
        planned.chapter,
        planned.notes,
        planned.imageNote,
        planned.internalNote,
        ...(planned.sources ?? []).map((s) => s.source),
      ].filter(Boolean).join('\n');
      if (noteText) slide.addNotes(noteText);
      deckPages.push({
        id: 'P' + String(planned.number).padStart(2, '0'),
        template: slideTemplates[i] || 'summary.list',
        title: planned.title,
        chapter: planned.chapter || planned.label,
        bg: bg ? '#' + bg.hex : '#F7F5F0',
        notes: noteText,
        previewData: 'data:image/jpeg;base64,' + jpgBytes.toString('base64'),
        nodes: pageNodes,
      });
    }

    const rawPptx = Buffer.from(await pres.write({ outputType: 'nodebuffer' }));
    // Explicitly insert empty <a:effectLst/> inside shape <p:spPr> to suppress default PowerPoint/Keynote drop shadows.
    const { unzipSync, zipSync, strFromU8, strToU8 } = requireApp('fflate');
    const pkg = unzipSync(rawPptx);
    for (const key of Object.keys(pkg)) {
      if (!/^ppt\/slides\/slide\d+\.xml$/u.test(key)) continue;
      const xml = strFromU8(pkg[key]);
      pkg[key] = strToU8(xml.replace(/<p:spPr>(?![\s\S]*?<a:effectLst)/gu, (m) => m)
        .replace(/(<p:spPr>[\s\S]*?)(<\/p:spPr>)/gu, (_, inner, close) =>
          inner.includes('<a:effectLst') ? inner + close : inner + '<a:effectLst/>' + close));
    }
    const pptxBuffer = Buffer.from(zipSync(pkg));
    const outline = {
      physical_page_count: deckPages.length,
      gaps: [],
      pages: editedPlan.pages.map((p, i) => ({
        instance_id: deckPages[i].id,
        first_page: p.number,
        last_page: p.number,
        client_title: p.title,
        content: p.points.join('\n'),
        material_ref: [
          ...(p.sources ?? []).map((s) => s.source),
          ...(p.figures ?? []).map((id) => id + ' · ' + (allFigures.get(id)?.name ?? id)),
        ].filter(Boolean).join(' ｜ '),
        status: '已排版',
      })),
    };

    const deck = {
      title,
      style: resolvedStyle,
      status: '融合版式 · ' + DECK_STYLE_LABELS[resolvedStyle],
      pages: deckPages,
      edition: {
        pptxSha256: sha(pptxBuffer),
        renderSha256: renderHashes,
      },
    };

    return { pptxBuffer, htmlContent: html, deck, outline, pageJpegs, style: resolvedStyle };
  } finally {
    signal.removeEventListener('abort', abort);
    await browser.close();
  }
}
