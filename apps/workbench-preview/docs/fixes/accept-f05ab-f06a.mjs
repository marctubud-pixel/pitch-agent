// Acceptance for F05-A (neutral changed-passages index), F05-B (a text match is not adoption) and
// F06-A (the docked WorkBot tab covers nothing on screen). Demo data only. Usage:
//   npx vite --port 5307   then   node docs/fixes/accept-f05ab-f06a.mjs http://localhost:5307 <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { measureTab } = await import(join(dirname(fileURLToPath(import.meta.url)), 'tab-overlap.mjs'));
const base = process.argv[2] ?? 'http://localhost:5307';
const out = process.argv[3] ?? 'accept-f05ab-f06a';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const results = [];
const ok = (n, c, d = '') => { results.push(!!c); console.log(c ? '✓' : '✗', n, d); };
async function page(w, h, mobile = false) {
  const c = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', ...(mobile ? { hasTouch: true, isMobile: true } : {}) });
  const p = await c.newPage();
  p.setDefaultTimeout(6000);
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  return p;
}
const go = async (p, h, wait = 1300) => { await p.goto(`${base}/#${h}`); await p.waitForTimeout(wait); };
const shown = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden'; }, sel);

// ------------------------------------------------------------------ F05-A
{
  const p = await page(1440, 900);
  await go(p, '/p/northline/proposal/content_review');
  const idx = p.locator('.pw-rev--passages');
  const before = await idx.innerText();
  ok('F05-A index uses neutral wording (2 changed passages, no "by the review")', /2 changed passages/i.test(before) && !/review changed|by the review/i.test(before), JSON.stringify(before.split('\n')[0]));
  const first = p.locator('.pw-passage').first();
  await first.getByRole('button', { name: /Edit wording/ }).click();
  await first.locator('textarea').fill('Every autumn there is one weekend when the cold arrives. This proposal is about that weekend.');
  await first.getByRole('button', { name: /Save/ }).click();
  await p.waitForTimeout(1200);
  const after = await idx.innerText();
  ok('F05-A after a manual edit: 3 changed passages, still no claim that the review changed them', /3 changed passages/i.test(after) && !/review changed|by the review/i.test(after), JSON.stringify(after.split('\n')[0]));
  ok('F05-A the recorded reason is kept as recorded', /1\. Opening — Edited by you\./.test(after) && /Too long; the sources belong in the notes\./.test(after));
  ok('F05-A the edited passage shows its earlier wording', await first.locator('.pw-passage__before').isVisible());
  await idx.getByRole('button', { name: /1\. Opening/ }).click();
  await p.waitForTimeout(400);
  ok('F05-A the index still navigates to the passage', await p.evaluate(() => document.activeElement?.id === 'cr-p-' + document.querySelector('.pw-passage')?.id.slice(5)));
  await idx.screenshot({ path: `${out}/F05A-index-after-edit.png` });
  ok('F05-A no page errors', p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();
}

// ------------------------------------------------------------------ F05-B
{
  const p = await page(1440, 900);
  await go(p, '/p/northline/proposal/themes');
  const box = p.locator('.pw-contrib');
  // existing, explicitly recorded adoption: status and response are kept as recorded
  const seeded = box.locator('.pw-contrib__list li', { hasText: 'Back before the lights are on. Just.' });
  const seededText = (await seeded.innerText()).replace(/\s+/g, ' ');
  ok('F05-B a recorded adoption keeps its recorded status and response', /Used as a secondary line for C\./.test(seededText) && /· Used$/.test(seededText));
  ok('F05-B its link is neutral (find matching text), not an adoption claim', (await seeded.getByRole('link', { name: 'Find matching text: direction C, copy lines' }).count()) === 1 && !/See where it is used/.test(seededText));
  // a new idea whose text happens to equal existing copy
  await box.getByRole('button', { name: 'Add an idea' }).click();
  await box.getByRole('radio', { name: 'Line' }).click();
  await box.locator('textarea').fill('Same path. Colder air.');
  await box.getByRole('button', { name: /^Add to/ }).click();
  await p.waitForTimeout(1500);
  const item = box.locator('.pw-contrib__list li', { hasText: 'Same path. Colder air.' });
  const itemText = (await item.innerText()).replace(/\s+/g, ' ');
  ok('F05-B the new matching idea stays "New" with its recorded response', /· New$/.test(itemText) && /will consider it/.test(itemText), JSON.stringify(itemText));
  ok('F05-B no "used" or "where it is used" wording on the new idea', !/See where it is used|Used as|used in/i.test(itemText));
  await item.screenshot({ path: `${out}/F05B-new-idea.png` });
  await item.getByRole('link', { name: 'Find matching text: direction A, copy lines' }).click();
  await p.waitForTimeout(1300);
  const linesA = p.locator('[data-focus="copy-A"] .pw-copylines');
  ok('F05-B the link opens A\'s copy lines and marks only the identical line as "Matching text"', (await linesA.locator('li[data-match]').count()) === 1 && /Same path\. Colder air\.\s*Matching text/.test(await linesA.innerText()));
  const main = await p.locator('main').innerText();
  ok('F05-B no authorship marker anywhere on the page ("Your idea")', !/Your idea(?!s)/.test(main));
  await p.locator('[data-focus="copy-A"]').screenshot({ path: `${out}/F05B-matching-line.png` });
  // without a match link, no line is marked at all (C's line is not attributed to anyone)
  await go(p, '/p/northline/proposal/themes?focus=copy-C');
  ok('F05-B copy lines opened without a match link carry no marker', (await p.locator('.pw-copylines li[data-match], .pw-copylines li[data-yours]').count()) === 0 && !/Your idea(?!s)/.test(await p.locator('main').innerText()));
  ok('F05-B no page errors', p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();
}

// ------------------------------------------------------------------ F06-A
for (const [w, h] of [[375, 760], [390, 844]]) {
  const p = await page(w, h, true);
  await go(p, '/p/northline/proposal/visual');
  await p.evaluate(() => sessionStorage.removeItem('pw.workbot.docked'));
  await go(p, '/p/northline/proposal/visual');
  await p.locator('.workbot-hide').click();
  await p.waitForTimeout(500);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(500);
  const m0 = await p.evaluate(measureTab);
  ok(`${w}×${h} F06-A docked at the top of Visual development: tab shown, overlapping nothing, no pointer hits taken`, m0.shown && m0.overlaps.length === 0 && m0.hits.length === 0 && !(await p.locator('.workbot-tab[data-aside]').count()), JSON.stringify(m0));
  await p.screenshot({ path: `${out}/${w}-F06A-1-docked-top.png` });
  // the stage navigation link that used to be covered is reachable by pointer
  const stageLinksFree = await p.evaluate(() => [...document.querySelectorAll('.sp-spines a')].every((a) => {
    const r = a.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return true;
    for (let x = Math.max(r.left + 2, 0); x < Math.min(r.right, innerWidth); x += 4) for (let y = Math.max(r.top + 2, 0); y < Math.min(r.bottom, innerHeight); y += 4) {
      const top = document.elementFromPoint(x, y);
      if (top?.closest('.workbot-tab')) return false;
    }
    return true;
  }));
  ok(`${w}×${h} F06-A every visible stage link resolves to itself under the pointer, never to the tab`, stageLinksFree);
  // while scrolling: the tab steps aside and takes no taps; afterwards it settles on free space
  let asideSeen = false, blocking = false;
  for (let i = 0; i < 10; i++) {
    await p.evaluate(() => window.scrollBy(0, 70));
    await p.waitForTimeout(40);
    const s = await p.evaluate(() => { const t = document.querySelector('.workbot-tab'); return { aside: t.hasAttribute('data-aside'), pe: getComputedStyle(t).pointerEvents }; });
    if (s.aside) asideSeen = true;
    if (s.aside && s.pe !== 'none') blocking = true;
  }
  ok(`${w}×${h} F06-A while scrolling the tab steps aside and takes no taps`, asideSeen && !blocking);
  await p.waitForTimeout(500);
  const m1 = await p.evaluate(measureTab);
  ok(`${w}×${h} F06-A after scrolling stops: shown again, overlapping nothing`, m1.shown && m1.overlaps.length === 0 && m1.hits.length === 0 && !(await p.locator('.workbot-tab[data-aside]').count()), JSON.stringify(m1));
  // full scan of this page at every half-screen, settled
  const scan = await p.evaluate(async (src) => {
    const measure = new Function('return (' + src + ')')();
    const bad = [];
    for (let y = 0; y <= document.documentElement.scrollHeight; y += Math.round(innerHeight / 2)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 450));
      const m = measure();
      const t = document.querySelector('.workbot-tab');
      if (!m.shown || m.overlaps.length || m.hits.length || t.hasAttribute('data-aside')) bad.push({ y, ...m, aside: t.hasAttribute('data-aside') });
    }
    return bad;
  }, measureTab.toString());
  ok(`${w}×${h} F06-A settled at every half-screen of the page: always shown, never overlapping`, scan.length === 0, JSON.stringify(scan.slice(0, 3)));
  // restore: the tab is the way back
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(1500);
  ok(`${w}×${h} F06-A docked state kept on reload`, (await shown(p, '.workbot-tab')) && !(await shown(p, '.workbot-launcher')));
  await p.locator('.workbot-tab').click();
  await p.waitForTimeout(300);
  ok(`${w}×${h} F06-A tab restores WorkBot; focus returns to it`, (await shown(p, '.workbot-launcher')) && (await p.evaluate(() => document.activeElement?.classList.contains('workbot-launcher'))));
  // keyboard: focusing the tab works even if it is aside
  await p.locator('.workbot-hide').click();
  await p.waitForTimeout(400);
  ok(`${w}×${h} F06-A hiding moves focus to the tab`, await p.evaluate(() => document.activeElement?.classList.contains('workbot-tab')));
  // input: everything steps aside
  await p.locator('.pw-contrib').getByRole('button', { name: 'Add an idea' }).click();
  await p.locator('.pw-contrib textarea').focus();
  await p.waitForTimeout(250);
  ok(`${w}×${h} F06-A while typing nothing of WorkBot is shown`, !(await shown(p, '.workbot-tab')) && !(await shown(p, '.workbot-launcher')) && !(await shown(p, '.workbot-hide')));
  await p.locator('.pw-contrib textarea').blur();
  await p.waitForTimeout(500);
  ok(`${w}×${h} F06-A after typing the docked tab is back on free space`, (await shown(p, '.workbot-tab')) && (await p.evaluate(measureTab)).overlaps.length === 0);
  await p.locator('.pw-contrib').getByRole('button', { name: /Cancel|Discard/ }).click();
  // dialog: not drawn
  await go(p, '/p/plumtide/proposal/visual?dir=A');
  await p.locator('.pw-view').first().scrollIntoViewIfNeeded();
  await p.locator('.pw-view').first().click();
  await p.waitForTimeout(500);
  ok(`${w}×${h} F06-A with a dialog open the tab is not drawn`, !(await shown(p, '.workbot-tab')));
  await p.screenshot({ path: `${out}/${w}-F06A-2-dialog.png` });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  ok(`${w}×${h} F06-A after the dialog the tab is back, overlapping nothing`, (await shown(p, '.workbot-tab')) && (await p.evaluate(measureTab)).overlaps.length === 0);
  // conversation and unsent question survive dock and restore
  await go(p, '/p/northline');
  await p.locator('.workbot-tab').click();
  await p.waitForTimeout(300);
  await p.locator('button.workbot-launcher').click();
  const input = p.locator('section.workbot textarea, section.workbot input[type=text]').first();
  await input.fill('What should I do next?');
  const msgs = await p.locator('section.workbot li').count();
  await p.getByRole('button', { name: 'Close WorkBot' }).click();
  await p.locator('.workbot-hide').click();
  await p.waitForTimeout(400);
  await p.locator('.workbot-tab').click();
  await p.waitForTimeout(300);
  await p.locator('button.workbot-launcher').click();
  ok(`${w}×${h} F06-A unsent question and conversation kept through dock and restore`, (await input.inputValue()) === 'What should I do next?' && (await p.locator('section.workbot li').count()) === msgs);
  await p.getByRole('button', { name: 'Close WorkBot' }).click();
  await p.locator('.workbot-hide').click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/${w}-F06A-3-docked-overview.png` });
  ok(`${w}×${h} no page errors`, p.errs.length === 0, p.errs.join(' | '));
  await p.context().close();
}

await b.close();
console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed.`);
process.exit(results.every(Boolean) ? 0 : 1);
