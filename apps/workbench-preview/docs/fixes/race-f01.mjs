// F01 follow-up: in-flight edits must survive an earlier submission's success.
// Usage: start the dev server (npx vite --port 5303), then: node docs/fixes/race-f01.mjs http://localhost:5303 <outDir>
// Test-only: wraps the demo service's contribute() inside the page (Vite serves the same module instance)
// to delay it or make it fail. Demo data only.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:5303';
const out = process.argv[3] ?? 'race-out';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const results = [];
const ok = (n, c, d = '') => { results.push(!!c); console.log(c ? '✓' : '✗', n, d); };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const p = await ctx.newPage();
p.setDefaultTimeout(5000);
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const go = async (h) => { await p.goto(`${base}/#${h}`); await p.waitForTimeout(1200); };
const patch = (mode) => p.evaluate(async (mode) => {
  const m = await import('/src/services/proposal/MockProposalService.ts');
  const proto = m.MockProposalService.prototype;
  if (!proto.__orig) proto.__orig = proto.contribute;
  window.__calls = 0;
  window.__settled = false;
  proto.contribute = async function (...a) {
    window.__calls += 1;
    window.__lastSent = a[2];
    try {
      await new Promise((r) => setTimeout(r, 1500));
      if (mode === 'fail') throw new Error('Simulated failure (test patch)');
      return await proto.__orig.apply(this, a);
    } finally {
      window.__settled = true;
    }
  };
}, mode);
const box = () => p.locator('.pw-contrib');
const list = async () => (await box().locator('.pw-contrib__list').innerText().catch(() => ''));
const openForm = async () => { if (!(await box().locator('textarea').count())) await box().getByRole('button', { name: 'Add an idea' }).click(); };
const submit = () => box().getByRole('button', { name: 'Add to Visual development' }).click();
// Wait until the patched request has really finished, then for the list to refresh.
const waitDone = async () => { await p.waitForFunction(() => window.__settled === true, null, { timeout: 10000 }); await p.waitForTimeout(800); };
const val = (sel) => box().locator(sel).inputValue().catch(() => null);

await go('/');
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await go('/p/northline/proposal/visual');

// 1. Submit A, edit to B in flight
await patch('ok');
await openForm();
await box().locator('textarea').fill('Idea A');
await submit();
await p.waitForTimeout(200);
await box().locator('textarea').fill('Idea B');
await waitDone();
const l1 = await list();
ok('1 A is saved', l1.includes('Idea A'));
ok('1 B stays as an unsent draft in the open form', (await val('textarea')) === 'Idea B');
ok('1 B was not submitted', !l1.includes('Idea B'));
ok('1 the request sent A, exactly one call', await p.evaluate(() => window.__calls === 1 && window.__lastSent.text === 'Idea A'));
await box().screenshot({ path: `${out}/race-1-after-success.png` });
await p.waitForTimeout(2500);
ok('1 B is still not submitted later (no automatic submit)', !(await list()).includes('Idea B') && (await p.evaluate(() => window.__calls)) === 1);

// 6. Navigation, reload, isolation, ownership
await p.locator('.sp-spines a', { hasText: 'Strategy' }).click(); await p.waitForTimeout(900);
ok('6 Strategy shows no Visual draft', (await box().locator('textarea').count()) === 0);
ok('6 A is not listed under Strategy', !(await list()).includes('Idea A'));
await p.locator('.sp-spines a', { hasText: 'Visual development' }).click(); await p.waitForTimeout(900);
ok('6 B restored after navigation', (await val('textarea')) === 'Idea B');
await p.reload(); await p.waitForTimeout(1500);
ok('6 B restored after reload', (await val('textarea')) === 'Idea B');
await go('/p/plumtide/proposal/visual');
ok('6 no leak into another project', (await box().locator('textarea').count()) === 0);
await go('/p/northline/proposal/visual');

// 2. No edits: clears normally
await patch('ok');
await openForm();
if ((await val('textarea')) !== 'Idea B') await box().locator('textarea').fill('Idea B');
await submit();
await waitDone();
ok('2 B saved and the draft cleared with no later edits', (await list()).includes('Idea B') && (await box().locator('textarea').count()) === 0);

// 3. Idea type changed in flight
await patch('ok');
await openForm();
await box().getByRole('radio', { name: 'Reference' }).click();
await box().locator('textarea').fill('Ref C');
await box().locator('input').fill('the knot');
await submit();
await p.waitForTimeout(200);
await box().getByRole('radio', { name: 'Theme' }).click();
await waitDone();
ok('3 the reference was saved as sent', (await list()).includes('Ref C') && await p.evaluate(() => window.__lastSent.kind === 'reference' && window.__lastSent.borrow === 'the knot'));
ok('3 the changed type survives (Theme selected, text kept)', (await box().locator('[role=radio][aria-checked=true]').innerText().catch(() => '')) === 'Theme' && (await val('textarea')) === 'Ref C');
if (await box().getByRole('button', { name: 'Discard draft' }).count()) await box().getByRole('button', { name: 'Discard draft' }).click();

// 4. Borrowing note changed in flight
await patch('ok');
await openForm();
await box().getByRole('radio', { name: 'Reference' }).click();
await box().locator('textarea').fill('Ref D');
await box().locator('input').fill('scale');
await submit();
await p.waitForTimeout(200);
await box().locator('input').fill('scale and light');
await waitDone();
ok('4 the reference was saved with the borrowing note as sent', (await list()).includes('Ref D') && await p.evaluate(() => window.__lastSent.borrow === 'scale'));
ok('4 the newer borrowing note survives', (await val('input')) === 'scale and light' && (await val('textarea')) === 'Ref D');
if (await box().getByRole('button', { name: 'Discard draft' }).count()) await box().getByRole('button', { name: 'Discard draft' }).click();

// 5. Failure keeps the draft
await patch('fail');
await openForm();
await box().locator('textarea').fill('Idea E');
const before = await list();
await submit();
await waitDone();
const errText = await box().locator('.field__error').innerText().catch(() => '');
ok('5 failure shows the error', /Simulated failure/.test(errText), JSON.stringify(errText));
ok('5 failure keeps the draft and adds nothing', (await val('textarea')) === 'Idea E' && (await list()) === before);
await box().screenshot({ path: `${out}/race-5-failure.png` });

ok('no page errors', errs.length === 0, errs.join(' | '));
console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed.`);
await b.close();
process.exit(results.every(Boolean) ? 0 : 1);
