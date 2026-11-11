// Acceptance checks for F05 (revision feedback, display only), F06 (WorkBot on phones) and
// F07 (overview readability). Demo data only. Usage:
//   npx vite --port 5306   then   node docs/fixes/accept-f05-f07.mjs http://localhost:5306 <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5306';
const out = process.argv[3] ?? 'accept-f05-f07';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const results = [];
const ok = (n, c, d = '') => { results.push({ n, ok: !!c }); console.log(c ? '✓' : '✗', n, d); };

async function page(w, h = 844, extra = {}) {
  const c = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', ...extra });
  const p = await c.newPage();
  p.setDefaultTimeout(6000);
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  return p;
}
const go = async (p, h, wait = 1300) => { await p.goto(`${base}/#${h}`); await p.waitForTimeout(wait); };
const visible = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden'; }, sel);

// ------------------------------------------------------------------ F06: phones
for (const w of [375, 390]) {
  const p = await page(w, 760, { hasTouch: true, isMobile: true });
  await go(p, '/p/northline/proposal/visual');
  await p.evaluate(() => sessionStorage.removeItem('pw.workbot.docked'));
  await go(p, '/p/northline/proposal/visual');
  ok(`${w} F06 launcher and a hide control are shown`, (await visible(p, '.workbot-launcher')) && (await visible(p, '.workbot-hide')));
  const hb = await p.locator('.workbot-hide').boundingBox();
  ok(`${w} F06 hide control is a usable target (≥ 24px)`, hb && hb.width >= 24 && hb.height >= 24, JSON.stringify(hb && { w: hb.width, h: hb.height }));
  await p.screenshot({ path: `${out}/${w}-F06-1-launcher.png` });
  await p.locator('.workbot-hide').click();
  await p.waitForTimeout(300);
  ok(`${w} F06 hiding docks WorkBot to the edge and moves focus to the tab`, !(await visible(p, '.workbot-launcher')) && (await visible(p, '.workbot-tab')) && (await p.evaluate(() => document.activeElement?.classList.contains('workbot-tab'))));
  await p.screenshot({ path: `${out}/${w}-F06-2-docked.png` });
  // Docked: nothing is stuck under the edge tab at the end of the page (where bottom actions sit);
  // while scrolling, controls can pass under it for a moment, which is recorded, not hidden.
  const tabCheck = await p.evaluate(async () => {
    const tab = document.querySelector('.workbot-tab');
    const under = () => {
      const q = tab.getBoundingClientRect();
      const hits = [];
      for (const el of document.querySelectorAll('main a, main button, main input, main textarea, main select')) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx >= q.left && cx <= q.right && cy >= q.top && cy <= q.bottom) hits.push((el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30));
      }
      return hits;
    };
    const passing = new Set();
    for (let y = 0; y <= document.documentElement.scrollHeight; y += Math.round(innerHeight / 2)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
      under().forEach((h) => passing.add(h));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 60));
    return { atEnd: under(), passing: [...passing] };
  });
  ok(`${w} F06 docked: no control stuck under the edge tab at the end of the page`, tabCheck.atEnd.length === 0, JSON.stringify(tabCheck.atEnd));
  console.log(`  (info) ${w} controls that pass under the docked tab while scrolling: ${JSON.stringify(tabCheck.passing)}`);
  await p.reload(); await p.waitForTimeout(1200);
  ok(`${w} F06 docked state is kept on reload (this tab only)`, (await visible(p, '.workbot-tab')) && !(await visible(p, '.workbot-launcher')));
  await p.locator('.workbot-tab').click();
  await p.waitForTimeout(300);
  ok(`${w} F06 the tab restores WorkBot and focus returns to it`, (await visible(p, '.workbot-launcher')) && (await p.evaluate(() => document.activeElement?.classList.contains('workbot-launcher'))));

  // Typing in a page field: WorkBot steps aside, then comes back.
  await p.locator('.pw-contrib').getByRole('button', { name: 'Add an idea' }).click();
  const ta = p.locator('.pw-contrib textarea');
  await ta.focus();
  await ta.type('Frost');
  await p.waitForTimeout(200);
  const asideWhileTyping = !(await visible(p, '.workbot-launcher')) && !(await visible(p, '.workbot-hide')) && !(await visible(p, '.workbot-tab'));
  ok(`${w} F06 WorkBot steps aside while typing in a page field`, asideWhileTyping);
  await p.screenshot({ path: `${out}/${w}-F06-3-typing.png` });
  await ta.blur();
  await p.waitForTimeout(200);
  ok(`${w} F06 WorkBot returns after typing`, await visible(p, '.workbot-launcher'));
  await p.locator('.pw-contrib').getByRole('button', { name: 'Discard draft' }).click();

  // Reading: the idle bubble stays in while scrolling.
  await go(p, '/p/northline');
  await p.evaluate(() => window.scrollTo(0, 0));
  let bubbleWhileScrolling = false;
  const y0 = await p.evaluate(() => scrollY);
  for (let i = 0; i < 24; i++) {
    await p.evaluate(() => window.scrollBy(0, 60));
    await p.waitForTimeout(200);
    if (await p.locator('.workbot-launcher__bubble[data-show]').count()) bubbleWhileScrolling = true;
  }
  const moved = (await p.evaluate(() => scrollY)) - y0;
  ok(`${w} F06 the idle bubble stays in while the page is scrolled (scrolled ${moved}px over ~4.8 s)`, moved > 1000 && !bubbleWhileScrolling);

  // The conversation and its unsent input survive hiding.
  await go(p, '/p/northline');
  await p.locator('button.workbot-launcher').click();
  const input = p.locator('section.workbot textarea, section.workbot input[type=text]').first();
  await input.fill('What should I do next?');
  const msgs = await p.locator('section.workbot li').count();
  await p.getByRole('button', { name: 'Close WorkBot' }).click();
  await p.waitForTimeout(200);
  await p.locator('.workbot-hide').click();
  await p.waitForTimeout(200);
  await p.locator('.workbot-tab').click();
  await p.waitForTimeout(200);
  await p.locator('button.workbot-launcher').click();
  ok(`${w} F06 hiding keeps the unsent question and the conversation`, (await input.inputValue()) === 'What should I do next?' && (await p.locator('section.workbot li').count()) === msgs);
  await p.getByRole('button', { name: 'Close WorkBot' }).click();

  // Modal open: WorkBot is not drawn; the artwork and close control are free.
  await go(p, '/p/plumtide/proposal/visual?dir=A');
  await p.locator('.pw-view').first().scrollIntoViewIfNeeded();
  await p.locator('.pw-view').first().click();
  await p.waitForTimeout(500);
  const dlg = p.locator('dialog.modal[open]');
  const art = await dlg.locator('.pw-viewbig .art-frame').boundingBox();
  const close = await dlg.getByRole('button', { name: /Close/ }).boundingBox();
  ok(`${w} F06 with a dialog open WorkBot is not drawn; artwork and close button are on screen`, !(await visible(p, '.workbot-launcher')) && !(await visible(p, '.workbot-hide')) && art.y >= 0 && art.y + art.height <= 760 && close.x + close.width <= w);
  await p.screenshot({ path: `${out}/${w}-F06-4-modal.png` });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  ok(`${w} F06 WorkBot comes back when the dialog closes`, await visible(p, '.workbot-launcher'));

  // Bottom actions: at the end of a stage page the pager is not under WorkBot.
  await go(p, '/p/northline/proposal/visual');
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(300);
  const pagerFree = await p.evaluate(() => {
    const fig = document.querySelector('.workbot-launcher__figure').getBoundingClientRect();
    return [...document.querySelectorAll('.pw-stage__pager a')].every((a) => {
      const r = a.getBoundingClientRect();
      return r.bottom <= fig.top || r.right <= fig.left || r.top >= fig.bottom;
    });
  });
  ok(`${w} F06 the stage pager at the end of the page is not under WorkBot`, pagerFree);
  await p.screenshot({ path: `${out}/${w}-F06-5-page-end.png` });

  // No horizontal scroll on the changed views.
  let over = [];
  for (const h of ['/p/northline', '/p/plumtide', '/p/luma', '/p/northline/proposal/visual?dir=B', '/p/northline/proposal/content_review', '/p/northline/proposal/themes']) {
    await go(p, h, 1100);
    const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (o > 0) over.push(`${h} +${o}`);
  }
  ok(`${w} no horizontal scroll on the changed views`, over.length === 0, over.join(', '));
  ok(`${w} no page errors (F06 run)`, p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();
}

// ------------------------------------------------------------------ F06: desktop unchanged
{
  const p = await page(1440, 900);
  await go(p, '/p/northline/proposal/visual');
  ok('desktop F06 no hide control or tab; launcher as before', (await visible(p, '.workbot-launcher')) && !(await visible(p, '.workbot-hide')) && !(await visible(p, '.workbot-tab')));
  await p.locator('.pw-contrib').getByRole('button', { name: 'Add an idea' }).click();
  await p.locator('.pw-contrib textarea').focus();
  await p.waitForTimeout(200);
  ok('desktop F06 typing does not hide WorkBot (desktop behaviour kept)', await visible(p, '.workbot-launcher'));
  await p.locator('.pw-contrib').getByRole('button', { name: /Cancel|Discard/ }).click();
  await p.context().close();
}

// ------------------------------------------------------------------ F05
for (const w of [1440, 390]) {
  const p = await page(w, w > 500 ? 900 : 844);
  const tag = w > 500 ? 'desktop' : `${w}`;
  await go(p, '/p/northline/proposal/visual?dir=B');
  const rev = p.locator('.pw-rev').first();
  const txt = await rev.innerText().catch(() => '');
  ok(`${tag} F05 B shows request, response, change, both reviews and open items`, /Independent challenge to v1/.test(txt) && /put the cold into the terrain/.test(txt) && /not met → met/.test(txt) && /v1: average 3\.\d · does not meet/.test(txt) && /v2: average 4\.\d · meets/.test(txt) && /Nothing recorded as open for v2/.test(txt), JSON.stringify(txt.slice(0, 120)));
  ok(`${tag} F05 it says there is no detailed list of visual changes`, /no detailed list of visual changes/.test(txt));
  await rev.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${out}/${tag}-F05-1-visual-record.png` });
  await rev.getByRole('button', { name: 'Compare v1 and v2' }).click();
  await p.waitForTimeout(500);
  const figs = await p.locator('.pw-compare figure').count();
  const fit = await p.evaluate(() => [...document.querySelectorAll('.pw-compare .art-frame')].every((e) => e.getBoundingClientRect().height <= innerHeight * 0.75));
  ok(`${tag} F05 compare opens the earlier-versions disclosure with v1 and v2 side by side, sized to the screen`, figs === 2 && fit);
  await p.screenshot({ path: `${out}/${tag}-F05-2-compare.png` });
  await rev.getByRole('link', { name: 'See v2' }).click();
  await p.waitForTimeout(400);
  const artTop = await p.evaluate(() => document.querySelector('.pw-refined__art').getBoundingClientRect().top);
  ok(`${tag} F05 "See v2" goes to the current artwork`, artTop > -200 && artTop < (w > 500 ? 900 : 844));
  await go(p, '/p/northline/proposal/visual?dir=A');
  ok(`${tag} F05 no revision panel for a direction without a previous version`, (await p.locator('.pw-rev').count()) === 0);
  await go(p, '/p/plumtide/proposal/visual');
  ok(`${tag} F05 no revision panel on Plumtide (no previous versions); F03 panel intact`, (await p.locator('.pw-branch-panel .pw-rev').count()) === 0 && /Direction C · Pass it on/.test(await p.locator('.pw-checkpoint').innerText()));

  // Content review: changed passages index
  await go(p, '/p/northline/proposal/content_review');
  const idx = p.locator('.pw-rev--passages');
  // (F05-A) neutral wording: the index does not claim who changed a passage
  ok(`${tag} F05 content review lists the 2 changed passages and says checks are not linked`, /2 changed passages/i.test(await idx.innerText()) && !/by the review/i.test(await idx.innerText()) && /does not link checks to passages/.test(await idx.innerText()));
  await idx.getByRole('button', { name: /What we found/ }).click();
  await p.waitForTimeout(500);
  ok(`${tag} F05 the index goes to the passage (earlier wording shown there)`, await p.evaluate(() => { const el = document.activeElement; return !!el && el.classList.contains('pw-passage') && !!el.querySelector('.pw-passage__before'); }));
  await p.screenshot({ path: `${out}/${tag}-F05-3-content-review.png` });

  // Themes: idea → response → where it is used; kept-by-you stays separate from passed review
  await go(p, '/p/northline/proposal/themes');
  const themesText = await p.locator('main').innerText();
  ok(`${tag} F05 "kept by you" and "passed review" stay distinct`, /Kept by you despite reviewer advice/.test(themesText) && /Passed with notes/.test(themesText));
  // (F05-B) a text match is only a match: neutral link, no authorship marker
  await p.getByRole('link', { name: /Find matching text: direction C/ }).click();
  await p.waitForTimeout(1300);
  ok(`${tag} F05 the match link opens C's copy lines with the identical line marked as matching text, not as yours`, (await p.locator('[data-focus="copy-C"] .pw-copylines li[data-match]', { hasText: 'Back before the lights are on. Just.' }).isVisible()) && !/Your idea(?!s)/.test(await p.locator('main').innerText()));
  await p.screenshot({ path: `${out}/${tag}-F05-4-idea-used.png` });
  ok(`${tag} no page errors (F05 run)`, p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();
}

// F05: your own revision request, through the simulated round (desktop)
{
  const p = await page(1440, 900);
  await go(p, '/p/plumtide/proposal/visual');
  const cp = p.locator('.pw-checkpoint');
  ok('F05 no revision request block before any request', (await cp.locator('.pw-rev--request').count()) === 0);
  await cp.getByLabel('Your comment').fill('Make the knot a real fold');
  await cp.getByRole('button', { name: 'Ask for a revision' }).click();
  await p.locator('.pw-rev--request').waitFor();
  const t1 = await p.locator('.pw-rev--request').innerText();
  ok('F05 while revising: the request is shown and results are stated as not connected', /Make the knot a real fold/.test(t1) && /not connected in this prototype/.test(t1) && /No new version recorded yet/.test(t1));
  await p.screenshot({ path: `${out}/desktop-F05-5-request-pending.png` });
  await p.locator('.pw-checkpoint').waitFor({ timeout: 12000 });
  await p.waitForTimeout(500);
  const t2 = await p.locator('.pw-checkpoint').innerText();
  ok('F05 after the simulated round: the decision area says the artwork has not changed', t2.includes('This demonstrates the revision state only; the artwork has not changed.'));
  ok('F05 response is the recorded review text; stage version and artwork version stay distinct', /content unchanged in this prototype/.test(t2) && /stage version v2/.test(t2) && /refined artwork v1/.test(t2));
  ok('F05 nothing was approved by the round', /This stage is waiting for your decision/.test(t2) && (await p.locator('.sp-spines li[data-current]').getAttribute('data-status')) === 'waiting_for_you');
  await p.locator('.pw-checkpoint').screenshot({ path: `${out}/desktop-F05-6-request-returned.png` });
  ok('no page errors (F05 request run)', p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();
}

// ------------------------------------------------------------------ F07
for (const w of [1440, 375]) {
  const p = await page(w, w > 500 ? 900 : 812);
  const tag = w > 500 ? 'desktop' : `${w}`;
  await go(p, '/p/northline');
  const prob = p.locator('.ov-problem');
  const probText = await prob.innerText();
  ok(`${tag} F07 summary keeps objective, key constraints and unknowns in view`, /A seasonal key visual/.test(probText) && /KEY CONSTRAINTS|Key constraints/i.test(probText) && /The launch must fit/.test(probText) && /Retail partner window dates/.test(probText));
  ok(`${tag} F07 full brief is folded until asked for`, !(await p.locator('.ov-fullbrief').isVisible()));
  await p.screenshot({ path: `${out}/${tag}-F07-1-overview.png`, fullPage: w < 500 });
  await prob.getByRole('button', { name: 'Show the full brief' }).click();
  const full = await p.locator('.ov-fullbrief').innerText();
  ok(`${tag} F07 full brief expands with every constraint and the other fields`, /CONSTRAINTS|Constraints/i.test(full) && (full.match(/\n/g) || []).length > 6 && /Target audience|TARGET AUDIENCE/i.test(full));
  await prob.screenshot({ path: `${out}/${tag}-F07-2-full-brief.png` });
  // count and its composition, from the shared rule
  const big = await p.locator('.ov-confirm .bx-big__n').innerText();
  const badge = (await p.locator('.pw-tab__count').first().innerText().catch(() => '')).trim();
  const parts = await p.locator('.ov-parts').innerText();
  ok(`${tag} F07 the count matches the tab badge and says what it is made of`, big === '2' && badge === '2' && /1 decision to make/.test(parts) && /1 list of 3 open facts/.test(parts) && /count as one item/.test(parts), JSON.stringify({ big, badge, parts }));
  await p.getByRole('button', { name: /Handle pending tasks/ }).click();
  await p.waitForTimeout(700);
  ok(`${tag} F07 "Handle pending tasks" lands on the pending list`, await p.evaluate(() => { const el = document.getElementById('ov-confirm-tile'); const r = el.getBoundingClientRect(); return document.activeElement === el && r.top >= 0 && r.top < 200; }));
  await p.getByRole('button', { name: /View current results/ }).click().catch(async () => { await p.evaluate(() => window.scrollTo(0, 0)); await p.getByRole('button', { name: /View current results/ }).click(); });
  await p.waitForTimeout(700);
  ok(`${tag} F07 "View current results" lands on Produced so far`, await p.evaluate(() => { const el = document.getElementById('ov-made-tile'); const r = el.getBoundingClientRect(); return document.activeElement === el && r.top >= 0 && r.top < 200; }));
  // other projects: wording follows their data
  await go(p, '/p/plumtide');
  const pParts = await p.locator('.ov-parts').innerText();
  const pBig = await p.locator('.ov-confirm .bx-big__n').innerText();
  ok(`${tag} F07 Plumtide count and composition follow its data`, /decision/.test(pParts) && Number(pBig) === (await p.locator('.ov-confirm .bx-list > li').count()), JSON.stringify({ pBig, pParts }));
  await go(p, '/p/luma');
  const lParts = await p.locator('.ov-parts').innerText().catch(() => '');
  const lBig = await p.locator('.ov-confirm .bx-big__n').innerText();
  ok(`${tag} F07 Luma count equals its listed items`, Number(lBig) === (await p.locator('.ov-confirm .bx-list > li').count()), JSON.stringify({ lBig, lParts }));
  ok(`${tag} no page errors (F07 run)`, p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();
}

await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
