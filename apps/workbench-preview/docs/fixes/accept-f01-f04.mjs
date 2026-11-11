// Acceptance checks for F01–F04 with screenshots. Usage: node accept.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [,, base, out] = process.argv;
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, ok: !!cond, detail }); console.log(cond ? '✓' : '✗', name, detail); };
async function page(w = 1440, h = 900) {
  const c = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  p.errs = errs;
  return p;
}
const go = async (p, hash, wait = 1200) => { await p.goto(`${base}/#${hash}`); await p.waitForTimeout(wait); };
const spine = (p, name) => p.locator('.sp-spines a', { hasText: name });

for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
  // ---------------- F01
  {
    const p = await page(w, h);
    await go(p, '/p/northline/proposal/visual');
    await p.locator('.pw-contrib').getByRole('button', { name: 'Add an idea' }).click();
    await p.locator('.pw-contrib').getByRole('radio', { name: 'Reference' }).click();
    await p.locator('.pw-contrib textarea').fill('Frost on a wool sleeve, shot close');
    await p.locator('.pw-contrib input').fill('the macro scale, not the colour');
    const dest = await p.locator('.pw-contrib__dest').innerText();
    ok(`${tag} F01 form names its destination`, /Visual development/.test(dest) && /Northline/.test(dest), JSON.stringify(dest));
    ok(`${tag} F01 submit button names the stage`, await p.locator('.pw-contrib').getByRole('button', { name: 'Add to Visual development' }).count() === 1);
    await p.locator('.pw-contrib').scrollIntoViewIfNeeded();
    await p.locator('.pw-contrib').screenshot({ path: `${out}/${tag}-F01-1-visual-draft.png` });
    await spine(p, 'Strategy').click();
    await p.waitForTimeout(900);
    ok(`${tag} F01 Strategy does not show the Visual draft`, (await p.locator('.pw-contrib textarea').count()) === 0);
    const note = await p.locator('.pw-contrib__elsewhere').innerText().catch(() => '');
    ok(`${tag} F01 Strategy says a draft waits in Visual development`, /Visual development/.test(note), JSON.stringify(note));
    await p.locator('.pw-contrib').scrollIntoViewIfNeeded();
    await p.locator('.pw-contrib').screenshot({ path: `${out}/${tag}-F01-2-strategy.png` });
    // Strategy gets its own draft
    await p.locator('.pw-contrib').getByRole('button', { name: 'Add an idea' }).click();
    await p.locator('.pw-contrib textarea').fill('Strategy note');
    await spine(p, 'Visual development').click();
    await p.waitForTimeout(900);
    ok(`${tag} F01 Visual draft restored (text, type, borrow)`, (await p.locator('.pw-contrib textarea').inputValue()) === 'Frost on a wool sleeve, shot close' && (await p.locator('.pw-contrib input').inputValue()) === 'the macro scale, not the colour' && (await p.locator('.pw-contrib [role=radio][aria-checked=true]').innerText()) === 'Reference');
    // Other project: no leak
    await go(p, '/p/plumtide/proposal/visual');
    ok(`${tag} F01 no leak into another project`, (await p.locator('.pw-contrib textarea').count()) === 0 && (await p.locator('.pw-contrib__elsewhere').count()) === 0);
    await go(p, '/p/northline/proposal/visual');
    await p.locator('.pw-contrib').getByRole('button', { name: 'Add to Visual development' }).click();
    await p.waitForTimeout(1500);
    const listed = await p.locator('.pw-contrib__list').innerText().catch(() => '');
    ok(`${tag} F01 submitted idea is listed under Visual development`, listed.includes('Frost on a wool sleeve, shot close'));
    await spine(p, 'Strategy').click();
    await p.waitForTimeout(900);
    const sList = await p.locator('.pw-contrib__list').innerText().catch(() => '');
    ok(`${tag} F01 submitted idea is not under Strategy; Strategy draft kept`, !sList.includes('Frost on a wool') && (await p.locator('.pw-contrib textarea').inputValue()) === 'Strategy note');
    ok(`${tag} F01 no page errors`, p.errs.length === 0, p.errs.join(' | '));
    await p.context().close();
  }
  // ---------------- F02
  {
    const p = await page(w, h);
    await go(p, '/p/northline/proposal/strategy');
    const chip = p.locator('.pw-ev__chip', { hasText: 'Interviews' }).first();
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await p.waitForTimeout(150);
    const loadingSeen = await p.locator('.pw-evstate[role=status]').count();
    await p.waitForSelector('dialog.pw-drawer[open] .inspector, dialog.pw-drawer[open] .claim-quote', { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(600);
    const drawer = p.locator('dialog.pw-drawer[open]');
    const txt = await drawer.innerText().catch(() => '');
    ok(`${tag} F02 chip opens the evidence drawer on the claim`, (await drawer.count()) === 1 && /Walkers|walker/i.test(txt), `loading-state-seen=${loadingSeen}`);
    ok(`${tag} F02 drawer shows support status, source excerpt and a way back`, /Supported|Partly|Unsupported|Unverified/i.test(txt) && /excerpt|Excerpt|source|Source/.test(txt) && /Back to the reasoning/.test(txt));
    await p.screenshot({ path: `${out}/${tag}-F02-1-drawer.png` });
    await drawer.getByRole('link', { name: /Back to the reasoning/ }).click();
    await p.waitForTimeout(1300);
    const url = p.url().split('#')[1];
    const inView = await p.evaluate(() => { const el = document.querySelector('[data-focus="arg-1"]'); if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= -5 && r.top < innerHeight; });
    ok(`${tag} F02 back returns to the same argument step`, url.includes('/proposal/strategy') && url.includes('focus=arg-1') && inView, url);
    await p.screenshot({ path: `${out}/${tag}-F02-2-back.png` });
    // Missing target
    await go(p, '/p/northline/proposal/research?claim=zz-not-there&ev=Ghost%20study&back=strategy&at=arg-2', 2200);
    const miss = await p.locator('.pw-evstate[data-tone=warn]').innerText().catch(() => '');
    ok(`${tag} F02 missing evidence is reported, not left at the top silently`, /Ghost study/.test(miss) && /not in the current research/.test(miss) && (await p.locator('dialog.pw-drawer[open]').count()) === 0);
    await p.screenshot({ path: `${out}/${tag}-F02-3-missing.png` });
    // A case chip (non-claim) still lands on its case
    await go(p, '/p/northline/proposal/strategy');
    const kchip = p.locator('.pw-ev__chip[data-kind="case"]').first();
    await kchip.scrollIntoViewIfNeeded(); await kchip.click(); await p.waitForTimeout(1600);
    ok(`${tag} F02 case chips still land on their case, with a way back`, (await p.locator('.pw-evback').count()) >= 1);
    ok(`${tag} F02 no page errors`, p.errs.length === 0, p.errs.join(' | '));
    await p.context().close();
  }
  // ---------------- F03
  {
    const p = await page(w, h);
    await go(p, '/p/plumtide');
    await p.locator('.ov-confirm a', { hasText: /Visual development is waiting/ }).first().click();
    await p.waitForTimeout(1500);
    const sel = await p.locator('.pw-branch[aria-selected=true]').innerText();
    ok(`${tag} F03 Overview action lands on direction C`, /Pass it on/.test(sel), JSON.stringify(sel.replace(/\s+/g, ' ')));
    const panel = await p.locator('.pw-checkpoint').innerText();
    ok(`${tag} F03 panel states scope, stage version, direction, artwork version, changes and open issues`, /The whole Visual development stage/.test(panel) && /stage version v1/i.test(panel) && /Direction C · Pass it on/.test(panel) && /refined artwork v1/i.test(panel) && /first refined version/.test(panel) && /Partly upheld/.test(panel), '');
    await p.locator('.pw-checkpoint').screenshot({ path: `${out}/${tag}-F03-1-panel.png` });
    await p.screenshot({ path: `${out}/${tag}-F03-2-landing.png` });
    // Manual change is respected through rerenders
    await p.locator('.pw-branch', { hasText: /Ink orchard|A/ }).first().click();
    await p.waitForTimeout(400);
    await p.evaluate(() => window.dispatchEvent(new Event('focus')));
    await p.waitForTimeout(2500);
    const sel2 = await p.locator('.pw-branch[aria-selected=true]').innerText();
    ok(`${tag} F03 manual direction choice is kept`, !/Pass it on/.test(sel2), JSON.stringify(sel2.replace(/\s+/g, ' ')));
    await p.reload(); await p.waitForTimeout(1500);
    const sel3 = await p.locator('.pw-branch[aria-selected=true]').innerText();
    ok(`${tag} F03 reload keeps the manual choice`, sel3 === sel2);
    await p.locator('.pw-checkpoint').getByRole('button', { name: 'View the pending work' }).click();
    await p.waitForTimeout(1200);
    const sel4 = await p.locator('.pw-branch[aria-selected=true]').innerText();
    const refinedTop = await p.evaluate(() => document.getElementById('vis-refined')?.getBoundingClientRect().top ?? 9999);
    ok(`${tag} F03 "View the pending work" shows C's refined artwork`, /Pass it on/.test(sel4) && refinedTop < 200 && refinedTop > -50, `top=${Math.round(refinedTop)}`);
    await p.screenshot({ path: `${out}/${tag}-F03-3-pending-work.png` });
    await p.locator('.pw-pendingnote').getByRole('button', { name: 'Go to the decision' }).click();
    await p.waitForTimeout(900);
    const cpTop = await p.evaluate(() => document.querySelector('.pw-checkpoint')?.getBoundingClientRect().top ?? 9999);
    ok(`${tag} F03 "Go to the decision" returns to the panel`, cpTop < 200 && cpTop > -50, `top=${Math.round(cpTop)}`);
    ok(`${tag} F03 approve button names the stage, nothing was approved`, (await p.getByRole('button', { name: 'Approve Visual development and continue' }).count()) === 1 && (await p.locator('.pw-checkpoint').count()) === 1);
    ok(`${tag} F03 no page errors`, p.errs.length === 0, p.errs.join(' | '));
    await p.context().close();
  }
  // ---------------- F04
  {
    const p = await page(w, h);
    await go(p, '/p/plumtide/proposal/visual?dir=A');
    const views = p.locator('.pw-view');
    const n = await views.count();
    let allBigger = true;
    for (let i = 0; i < n; i++) {
      const v = views.nth(i);
      await v.scrollIntoViewIfNeeded();
      const small = await v.locator('.art-frame').boundingBox();
      if (i === 0) { await v.focus(); await p.keyboard.press('Enter'); } else await v.click();
      await p.waitForTimeout(500);
      const dlg = p.locator('dialog.modal[open]');
      const big = await dlg.locator('.art-frame').boundingBox();
      const label = await dlg.locator('h2').innerText();
      const fits = big && big.y >= 0 && big.y + big.height <= h + 2 && big.x >= 0 && big.x + big.width <= w + 1;
      if (!(big && small && big.width * big.height > small.width * small.height * 2 && fits)) allBigger = false;
      // ratio kept: frame ratio equals artwork ratio
      const r = await dlg.locator('.art-frame').evaluate((el) => { const cs = getComputedStyle(el); const box = el.getBoundingClientRect(); return { r: parseFloat(cs.getPropertyValue('--r')), box: box.width / box.height }; });
      if (Math.abs(r.r - r.box) / r.r > 0.03) allBigger = false;
      if (i === 0 || i === n - 1) await p.screenshot({ path: `${out}/${tag}-F04-${i + 1}-${label.split(' ·')[0].replace(/\W+/g, '-').toLowerCase()}.png` });
      const closeBtn = await dlg.getByRole('button', { name: /Close/ }).boundingBox();
      if (!closeBtn || closeBtn.y < 0 || closeBtn.x + closeBtn.width > w + 1) allBigger = false;
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      const focusedBack = await v.evaluate((el) => el === document.activeElement);
      if (!focusedBack || (await p.locator('dialog.modal[open]').count())) allBigger = false;
    }
    ok(`${tag} F04 every view opens larger, whole, at its ratio; Escape closes and focus returns (${n} views)`, n >= 4 && allBigger);
    await go(p, '/p/plumtide/proposal/visual?dir=C');
    ok(`${tag} F04 C has five views including the gift sleeve`, (await p.locator('.pw-view').count()) === 5);
    ok(`${tag} F04 no page errors`, p.errs.length === 0, p.errs.join(' | '));
    await p.context().close();
  }
}
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} acceptance checks passed.`);
process.exit(failed.length ? 1 : 0);
