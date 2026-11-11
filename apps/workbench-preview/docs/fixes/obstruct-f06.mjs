// Measures where the WorkBot launcher (character + bubble) covers interactive or text content on phones.
// Usage: node obstruct.mjs <baseUrl> <outDir> <tag>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [,, base, out, tag] = process.argv;
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const PAGES = ['/p/northline', '/p/northline/proposal/visual', '/p/northline/proposal/delivery', '/p/plumtide/proposal/visual', '/p/northline/proposal/strategy', '/new'];
const summary = {};
for (const w of [375, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 760 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  for (const h of PAGES) {
    await p.goto(`${base}/#${h}`); await p.waitForTimeout(1300);
    // force the bubble on (worst case): it appears periodically anyway
    const hits = await p.evaluate(async () => {
      const launcher = document.querySelector('.workbot-launcher');
      const found = new Map();
      const H = document.documentElement.scrollHeight;
      for (let y = 0; y <= H; y += Math.round(innerHeight / 2)) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
        if (!launcher || launcher.hidden || getComputedStyle(launcher).display === 'none') continue;
        const parts = [launcher.querySelector('.workbot-launcher__figure'), launcher.querySelector('.workbot-launcher__bubble[data-show]')].filter(Boolean);
        for (const el of document.querySelectorAll('main a, main button, main input, main textarea, main select, main [role=tab], main p, main h1, main h2, main h3, main li')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
          for (const part of parts) {
            const q = part.getBoundingClientRect();
            const ix = Math.min(r.right, q.right) - Math.max(r.left, q.left);
            const iy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
            if (ix > 4 && iy > 4) {
              const interactive = el.matches('a,button,input,textarea,select,[role=tab]');
              // only count text blocks that actually have text under the overlap
              const key = (interactive ? 'CTRL ' : 'TEXT ') + el.tagName + ':' + (el.textContent || el.getAttribute('aria-label') || el.placeholder || '').trim().slice(0, 40);
              found.set(key, (found.get(key) || 0) + 1);
            }
          }
        }
      }
      return [...found.keys()];
    });
    const ctrls = hits.filter((x) => x.startsWith('CTRL'));
    summary[`${w} ${h}`] = { controls: ctrls.length, text: hits.length - ctrls.length, sample: ctrls.slice(0, 4) };
  }
  // modal: open a packaging view and check whether the launcher is drawn over the dialog
  await p.goto(`${base}/#/p/plumtide/proposal/visual?dir=A`); await p.waitForTimeout(1300);
  await p.locator('.pw-view').first().scrollIntoViewIfNeeded(); await p.locator('.pw-view').first().click(); await p.waitForTimeout(600);
  const modal = await p.evaluate(() => {
    const l = document.querySelector('.workbot-launcher');
    if (!l || l.hidden || getComputedStyle(l).display === 'none' || getComputedStyle(l).visibility === 'hidden') return 'launcher hidden';
    const r = l.querySelector('.workbot-launcher__figure').getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top && l.contains(top) ? 'launcher ABOVE the modal' : 'launcher under the modal backdrop (' + (top?.tagName || '?') + ')';
  });
  summary[`${w} modal`] = modal;
  await p.screenshot({ path: `${out}/${tag}-${w}-modal.png` });
  await p.keyboard.press('Escape');
  await p.goto(`${base}/#/p/northline/proposal/visual`); await p.waitForTimeout(1300);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${tag}-${w}-visual-bottom.png` });
  await ctx.close();
}
console.log(JSON.stringify(summary, null, 1));
await b.close();
