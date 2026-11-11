// Reproduces F01–F04 against a running dev server. Usage: node repro.mjs <baseUrl> <outDir> <tag>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [,, base, out, tag] = process.argv;
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const log = (...a) => console.log(tag, ...a);
async function ctx(w = 1440, h = 900) {
  const c = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const p = await c.newPage();
  p.on('pageerror', (e) => log('PAGEERROR', e.message));
  return p;
}
const go = async (p, hash) => { await p.goto(`${base}/#${hash}`); await p.waitForTimeout(1200); };

// F01
{
  const p = await ctx();
  await go(p, '/p/northline/proposal/visual');
  await p.getByRole('button', { name: 'Add an idea' }).click();
  await p.locator('.pw-contrib textarea').fill('Try the frost closer to the lens');
  await p.locator('.sp-spines a', { hasText: 'Strategy' }).click();
  await p.waitForTimeout(1000);
  const ta = p.locator('.pw-contrib textarea');
  const visible = await ta.count() ? await ta.inputValue() : null;
  log('F01 strategy shows draft:', JSON.stringify(visible));
  await p.locator('.pw-contrib').scrollIntoViewIfNeeded();
  await p.locator('.pw-contrib').screenshot({ path: `${out}/F01-strategy-form.png` });
  await p.locator('.sp-spines a', { hasText: 'Visual development' }).click();
  await p.waitForTimeout(1000);
  const back = await p.locator('.pw-contrib textarea').count() ? await p.locator('.pw-contrib textarea').inputValue() : null;
  log('F01 back on visual shows:', JSON.stringify(back));
  await p.context().close();
}
// F02
{
  const p = await ctx();
  await go(p, '/p/northline/proposal/strategy');
  await p.locator('.pw-ev__chip', { hasText: 'Interviews' }).first().click();
  await p.waitForTimeout(1800);
  log('F02 url:', p.url().split('#')[1], 'scrollY', await p.evaluate(() => scrollY), 'drawer open', await p.locator('dialog.pw-drawer[open]').count());
  await p.screenshot({ path: `${out}/F02-after-click.png` });
  await p.context().close();
}
// F03
{
  const p = await ctx();
  await go(p, '/p/plumtide');
  const next = p.locator('.ov-confirm a, .ov-confirm button').filter({ hasText: /Decide|Visual/ }).first();
  log('F03 next action text:', (await next.innerText().catch(() => 'none')).replace(/\s+/g, ' '));
  await next.click();
  await p.waitForTimeout(1500);
  log('F03 url:', p.url().split('#')[1]);
  const sel = await p.locator('.vd-switch [aria-pressed="true"], .vd-switch [aria-selected="true"], [aria-current="true"]').allInnerTexts().catch(() => []);
  log('F03 selected:', JSON.stringify(sel.map((s) => s.replace(/\s+/g, ' '))));
  await p.screenshot({ path: `${out}/F03-landing.png` });
  await p.context().close();
}
// F04
{
  const p = await ctx();
  await go(p, '/p/plumtide/proposal/visual');
  const sec = p.locator('#vs-views').locator('xpath=ancestor::section[1]');
  await p.locator('#vs-views').scrollIntoViewIfNeeded();
  const btns = sec.getByRole('button');
  log('F04 view buttons:', JSON.stringify(await btns.allInnerTexts()));
  await btns.first().click();
  await p.waitForTimeout(800);
  log('F04 dialog open after click:', await p.locator('dialog[open]').count());
  await sec.screenshot({ path: `${out}/F04-after-click.png` });
  await p.context().close();
}
await b.close();
