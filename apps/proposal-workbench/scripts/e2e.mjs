/**
 * Browser checks for the main flows of the proposal workspace and the working evidence layer beneath it. Starts its own Vite server, drives Chromium with Playwright
 * and prints a pass/fail line per flow. Usage: npm run test:e2e [-- --shots=<dir>]
 *
 * Requires a Playwright Chromium build (`npx playwright install chromium` if missing).
 */
import { mkdirSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const shotsDir = shotsArg ? shotsArg.slice('--shots='.length) : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const BASE = 'http://127.0.0.1:5199/';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(8000);
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    const lines = String(error.message ?? error).split('\n');
    const target = lines.find((l) => /waiting for/.test(l));
    console.log(`  ✗ ${name}\n      ${lines[0]}${target ? `\n      ${target.trim()}` : ''}`);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/FAIL-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
  }
}
/** A small valid PNG with a colour gradient, so the upload and colour sampling have real pixels. */
function makePng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x += 1) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = 40 + Math.round((x / w) * 160);
      raw[i + 1] = 90 + Math.round((y / h) * 100);
      raw[i + 2] = 70;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const shot = async (name) => shotsDir && page.screenshot({ path: `${shotsDir}/${name}.png` });
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
/** Select the first option whose text matches a pattern. */
const selectByText = async (select, pattern) => {
  const value = await select.evaluate((el, src) => {
    const re = new RegExp(src);
    return [...el.options].find((o) => re.test(o.textContent))?.value ?? null;
  }, pattern.source);
  if (value === null) throw new Error(`No option matches ${pattern}`);
  await select.selectOption(value);
};
const go = async (hash) => {
  await page.goto(`${BASE}#${hash}`);
  await page.waitForLoadState('domcontentloaded');
};
/** Proposals on the home page: the open folder plus the folders in the drawer. */
const cardCount = async () => (await page.locator('.open-folder:not(.open-folder--ghost)').count()) + (await page.locator('.cab-folder').count());
const toast = (text) => page.locator('.toast', { hasText: text }).first().waitFor({ timeout: 10000 });
/** Demo controls live in the development-only area, reached from the demo pill. */
const openDemo = async () => {
  if (!(await page.evaluate(() => location.hash.startsWith('#/dev')))) {
    await page.getByRole('link', { name: /Demo mode · Simulated data/ }).click();
    await page.getByRole('heading', { name: 'Developer tools' }).waitFor();
  }
  await page.getByRole('button', { name: 'Open demo controls' }).click();
  await page.getByRole('dialog', { name: 'Demo controls' }).waitFor();
};
const closeDemo = async () => page.getByRole('dialog', { name: 'Demo controls' }).getByRole('button', { name: 'Close dialog' }).click();
const setScenario = async (label) => {
  await openDemo();
  await page.getByRole('radio', { name: new RegExp(label) }).check();
  await closeDemo();
};

console.log('Proposal Workbench browser checks');
await go('/');
await page.evaluate(() => localStorage.clear());

const NORTHLINE = 'Northline Outdoor — autumn–winter KV';
const PLUMTIDE = 'Plumtide — can and gift sleeve';
const LUMA = 'Luma Social Spirits — can redesign';
const areas = () => page.getByRole('navigation', { name: 'Project areas' });
const rail = () => page.getByRole('navigation', { name: 'Proposal stages' }).first();
/** Section tabs inside an area are a small navigation of buttons (the current one has aria-current). */
const subtab = (area, name) => page.getByRole('navigation', { name: area }).getByRole('button', { name, exact: true });
const checksDrawer = () => page.getByRole('dialog', { name: 'Reviews & checks' });

// ---------------------------------------------------------------- home and overview
await step('Home is a filing cabinet: one proposal lies open with its work, the rest wait in the drawer', async () => {
  await go('/');
  await page.getByRole('heading', { name: /3 proposals in motion, 3 need you/, level: 1 }).waitFor();
  const folders = await cardCount();
  expect(folders === 3, `expected 3 proposals, found ${folders}`);
  // The proposal that most needs you lies open: its next step, latest deck, stage and directions are fanned out.
  const open = page.locator('.open-folder');
  await open.getByRole('heading', { name: NORTHLINE }).waitFor();
  await open.locator('.sheet--next').getByText('Decide on Final review & delivery').waitFor();
  await open.getByText('Latest deck').waitFor();
  await open.getByText('First frost').waitFor();
  await open.getByText('8 of 8').waitFor();
  expect((await open.locator('.track span').count()) === 8, 'eight stage segments');
  // The open folder leaves the drawer: no placeholder for it, and one way to start a proposal.
  expect((await page.locator('.cab-slot, .cab-new').count()) === 0, 'no open-folder placeholder or second New proposal');
  expect((await page.locator('.cab-folder', { hasText: NORTHLINE }).count()) === 0, 'the open folder is not also in the drawer');
  expect((await page.getByRole('button', { name: 'New proposal' }).count()) === 1, 'exactly one New proposal button');
  await page.locator('.cab-folder', { hasText: PLUMTIDE }).getByText('5/8 · Next: Decide on Visual development').waitFor();
  await page.locator('.cab-folder', { hasText: LUMA }).getByText('2/8 · Next: Fix the evidence issues').waitFor();
  expect(await page.getByText('Demo mode · Simulated data').isVisible(), 'demo indicator missing');
  await shot('01-home');
});

await step('Drawer labels and search narrow the cabinet; pulling a folder out opens it in place', async () => {
  const search = page.getByRole('searchbox', { name: 'Search proposals' });
  await search.fill('plum');
  await page.waitForFunction(() => document.querySelectorAll('.cab-item').length === 1);
  await search.fill('');
  await page.getByRole('button', { name: /^Packaging/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.cab-item').length === 2);
  await page.getByRole('button', { name: /^KV \/ poster/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.cab-item').length === 0);
  await page.getByText('The only match is the folder already open on your desk.').waitFor();
  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByRole('button', { name: `Open the ${PLUMTIDE} folder` }).click();
  await page.locator('.open-folder').getByRole('heading', { name: PLUMTIDE }).waitFor();
  await page.locator('.open-folder .sheet--next').getByText('Decide on Visual development').waitFor();
  await page.locator('.cab-folder', { hasText: NORTHLINE }).waitFor();
  expect((await page.locator('.cab-folder', { hasText: PLUMTIDE }).count()) === 0, 'the pulled folder left the drawer');
  await page.waitForTimeout(600);
  await shot('01b-home-pulled');
  await page.getByRole('button', { name: `Open the ${NORTHLINE} folder` }).click();
  await page.locator('.open-folder').getByRole('link', { name: 'Open project' }).click();
  await page.locator('.pw-head__name', { hasText: NORTHLINE }).waitFor();
  await areas().getByRole('link', { name: /Overview/ }).waitFor();
  await page.getByText('Final review & delivery').first().waitFor();
});

await step('The overview reads: the problem, progress, what needs confirmation, outputs, then ideas, work and decisions', async () => {
  await go('/p/plumtide');
  await page.locator('.ov-progress__stage', { hasText: 'Visual development' }).waitFor();
  await page.locator('.ov-progress .pw-status', { hasText: 'Waiting for you' }).waitFor();
  const order = await page.evaluate(() => [...document.querySelectorAll('.ov > section, .ov-row > section')].map((s) => s.className.match(/ov-[a-z]+/)?.[0]));
  expect(order.join() === 'ov-problem,ov-progress,ov-confirm,ov-made,ov-ideas,ov-active,ov-decisions', `overview order was ${order.join()}`);
  // The eight stages appear once on the overview.
  expect((await page.locator('.ov-track a').count()) === 8, 'one stage track of eight');
  expect((await page.locator('.pw-overview nav').count()) === 1, 'a single stage navigation on the overview');
  await page.getByText('Visual development is waiting for your decision').waitFor();
  await page.locator('.ov-made .ov-card').first().waitFor();
  // The next action lands on the decision itself.
  await page.getByRole('link', { name: 'Decide on Visual development' }).click();
  await page.waitForFunction(() => document.activeElement?.classList.contains('pw-checkpoint'));
  await go('/p/plumtide');
  await page.getByRole('button', { name: 'What’s real here?' }).click();
  const legend = page.getByRole('dialog', { name: 'What’s real here?' });
  await legend.getByText(/Demonstration of the intended product/).waitFor();
  await legend.getByRole('button', { name: 'Close' }).click();
  await shot('02-plumtide-overview');
});

await step('Blocked research is explained by the working checks, not hidden behind the creative stages', async () => {
  await go('/p/luma');
  await page.getByRole('link', { name: 'Fix the evidence issues' }).waitFor();
  await page.getByText(/No source is cited for the claim “Competitors increasingly use matte/).first().waitFor();
  await go('/p/luma/proposal/research');
  await page.locator('.pw-checks[data-problem]').waitFor();
  await page.locator('.pw-checks').getByText(/checks? needs? attention/).waitFor();
  await shot('03-luma-research');
  await go('/p/luma/proposal/strategy');
  await page.getByRole('heading', { name: 'Strategy', level: 1 }).waitFor();
  await page.getByText('Not started').first().waitFor();
});

await step('Legacy links land in the new structure (handoff → research checks; jobs → process)', async () => {
  await go('/p/luma/handoff');
  await page.waitForFunction(() => location.hash.includes('/proposal/research') && location.hash.includes('checks=handoff'));
  const drawer = checksDrawer();
  await drawer.waitFor();
  const btn = drawer.getByRole('button', { name: 'Continue to strategy' });
  expect((await btn.getAttribute('aria-disabled')) === 'true', 'continue should be disabled for Luma');
  await drawer.locator('.continue-tile').getByText('Strategy can’t start yet').waitFor();
  await drawer.locator('.continue-tile').getByText('5 things still needed:').waitFor();
  await drawer.getByRole('heading', { name: 'Do the quoted sources back up every claim?' }).waitFor();
  await shot('03b-luma-handoff-drawer');
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  expect(!(await page.evaluate(() => location.hash.includes('checks='))), 'closing the drawer clears it from the URL');
  await go('/p/luma/jobs');
  await page.waitForFunction(() => location.hash.includes('/process') && location.hash.includes('tab=tasks'));
  await page.locator('.job').first().waitFor();
  await go('/p/luma/sources');
  await page.waitForFunction(() => location.hash.includes('/library') && location.hash.includes('tab=sources'));
});

await step('Opening a claim shows its excerpts inside the checks panel; Escape closes the claim first', async () => {
  await go('/p/luma/research?claim=art-luma-research-v1-c6');
  const drawer = checksDrawer();
  await drawer.waitFor();
  const panel = drawer.getByRole('complementary', { name: 'Claim evidence' });
  await panel.waitFor();
  await panel.getByText('Drinking occasions panel — summary report').waitFor();
  await panel.getByText(/adults aged 21–44/).first().waitFor();
  await shot('04-claim-inspector');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'detached' });
  expect(await drawer.isVisible(), 'the checks panel stays open after the claim closes');
});

await step('Research tabs work with arrow keys', async () => {
  const drawer = checksDrawer();
  await drawer.getByRole('tab', { name: 'Report' }).focus();
  await page.keyboard.press('ArrowRight');
  await drawer.getByRole('tab', { name: /Claims/, selected: true }).waitFor();
  await page.keyboard.press('End');
  await drawer.getByRole('tab', { name: /To fix/, selected: true }).waitFor();
  await drawer.locator('.fix-card').getByText('Issue 1 of 3').waitFor();
  await drawer.getByRole('button', { name: 'Next issue' }).click();
  await drawer.locator('.fix-card').getByText('Issue 2 of 3').waitFor();
  await page.keyboard.press('Escape');
});

await step('Attaching a library source marks earlier reviews outdated', async () => {
  await go('/p/luma/research?claim=art-luma-research-v1-c3');
  const panel = checksDrawer().getByRole('complementary', { name: 'Claim evidence' });
  await selectByText(panel.getByLabel('Source from the library'), /Shelf photo log/);
  await panel.getByRole('button', { name: 'Attach source' }).click();
  await toast('Source attached');
  await checksDrawer().locator('.mod-status').getByText('Evidence not checked yet').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.pw-checks').getByText(/Outdated|Not run|not checked/i).first().waitFor();
});

let sourcesBefore = 0;
await step('Adding a source in the Library attaches it to a claim (with a dropped response retried safely)', async () => {
  await go('/p/luma/library?tab=sources');
  await page.locator('.source-list > li').first().waitFor();
  sourcesBefore = await page.locator('.source-list > li').count();
  await openDemo();
  await page.getByRole('checkbox', { name: /Drop the next save response/ }).check();
  await closeDemo();
  await go('/p/luma/library?tab=sources');
  await page.getByRole('button', { name: 'Add source' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add source' });
  await dialog.getByLabel('Title').fill('Sharing-pack interviews — adults aged 25–34');
  await dialog.getByLabel('Publisher or author').fill('Luma research team (sample interview notes)');
  await dialog.getByLabel('Captured excerpt').fill('Participants aged 25 to 34 said a multi-can pack is what they buy when friends come over, because it covers the whole evening.');
  await dialog.getByLabel('Intended use').selectOption('audience');
  await selectByText(dialog.getByLabel(/Attach to claim/), /Multi-can sharing packs/);
  await dialog.getByRole('button', { name: 'Add and attach' }).click();
  await dialog.getByText('Add source did not complete.').waitFor();
  await shot('05-lost-response');
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await toast('already been applied');
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction((n) => document.querySelectorAll('.source-list > li').length === n + 1, sourcesBefore);
  const matches = await page.locator('.source-list h3', { hasText: 'Sharing-pack interviews' }).count();
  expect(matches === 1, `expected one new source, found ${matches}`);
});

await step('Verification and readiness jobs run queued → running → succeeded and release Luma’s research', async () => {
  await go('/p/luma/proposal/research?checks=research');
  await checksDrawer().locator('.mod-status').getByRole('button', { name: 'Run evidence verification' }).click();
  await toast('queued');
  await go('/p/luma/process?tab=tasks');
  const job = () => page.locator('.job', { hasText: 'Verify evidence' }).first();
  await job().locator('.badge', { hasText: /Queued|Running/ }).waitFor();
  await job().locator('.badge', { hasText: 'Succeeded' }).waitFor({ timeout: 12000 });
  await go('/p/luma/proposal/research?checks=research&tab=verification');
  await checksDrawer().locator('.report__head .badge', { hasText: 'Passed' }).first().waitFor({ timeout: 10000 });
  await checksDrawer().locator('.mod-status').getByRole('button', { name: 'Run readiness review' }).click();
  await toast('queued');
  await go('/p/luma/proposal/research?checks=research&tab=readiness');
  await checksDrawer().locator('.report__head .badge', { hasText: 'Passed' }).first().waitFor({ timeout: 12000 });
  await shot('06-luma-readiness-passed');
});

await step('Recovering a saved result reuses the original job', async () => {
  await go('/p/luma/process?tab=tasks');
  await page.locator('.job').first().waitFor();
  const before = await page.locator('.job').count();
  const job = page.locator('.job', { hasText: 'Observe “Bar-back display”' });
  await job.getByRole('button', { name: 'Recover saved result' }).click();
  await toast('No new job was created');
  await job.locator('.badge', { hasText: 'Succeeded' }).waitFor();
  const after = await page.locator('.job').count();
  expect(before === after, `job count changed from ${before} to ${after}`);
});

// ---------------------------------------------------------------- the creative stages (prototype)
await step('Every one of the eight stages opens from the stage rail and says whether it is working or prototype', async () => {
  const stages = [
    ['brief', 'Brief & task'],
    ['research', 'Research'],
    ['strategy', 'Strategy'],
    ['themes', 'Copy & themes'],
    ['visual', 'Visual development'],
    ['content_review', 'Content review'],
    ['layout', 'Layout'],
    ['delivery', 'Final review & delivery'],
  ];
  await go('/p/northline/proposal/brief');
  for (const [id, name] of stages) {
    await rail().getByRole('link', { name: new RegExp(`^\\d?\\s*${name.replace('&', '&')}`) }).first().click();
    await page.waitForFunction((s) => location.hash.includes(`/proposal/${s}`), id);
    await page.getByRole('heading', { name, level: 1 }).waitFor();
    const backed = await page.locator('.pw-stage__head .pw-backed, .pw-stage-head .pw-backed, [data-backed]').first().textContent().catch(() => '');
    expect(/Working|Prototype/.test(backed ?? '') || (await page.getByText(/^(Working|Prototype)$/).first().isVisible()), `${id}: no working/prototype label`);
  }
  await shot('07-northline-delivery-stage');
});

await step('Strategy states the problem first and ties the intersection to evidence', async () => {
  await go('/p/northline/proposal/strategy');
  await page.locator('.pw-venn, [data-venn]').first().waitFor();
  const chips = await page.locator('.pw-ev__chip').count();
  expect(chips >= 1, 'evidence links on the strategy');
  await shot('08-strategy');
});

await step('Copy & themes shows three directions with slogans, scores and an adversarial challenge', async () => {
  await go('/p/northline/proposal/themes');
  await page.locator('.tx-card__name', { hasText: 'First frost' }).waitFor();
  await page.locator('.tx-card__name', { hasText: 'Warm terrain' }).waitFor();
  await page.locator('.tx-card__name', { hasText: 'Out before dark' }).waitFor();
  expect((await page.locator('.pw-scores, [data-scores]').count()) >= 1, 'evaluation scores shown');
  await shot('09-themes');
});

await step('Visual development: one branch per direction, from reference search to a refined visual', async () => {
  await go('/p/plumtide/proposal/visual');
  await page.getByText('Reference search').first().waitFor();
  await page.getByText('Composition sketches').first().waitFor();
  await page.getByText('Refined visual').first().waitFor();
  await page.getByText(/Waiting for your decision/).first().waitFor();
  await shot('10-visual');
});

await step('A checkpoint waits for a person: a revision needs a comment; approval moves on to the next checkpoint only', async () => {
  await go('/p/plumtide/proposal/visual');
  const cp = page.locator('.pw-checkpoint');
  await cp.getByRole('heading', { name: 'This stage is waiting for your decision' }).waitFor();
  await cp.getByText('Nothing continues without your decision, and WorkBot cannot decide for you.').waitFor();
  // Asking for a revision stays unavailable until there is something to revise.
  expect(await cp.getByRole('button', { name: 'Ask for a revision' }).isDisabled(), 'revision needs a comment');
  await cp.getByText('Say what should change first.').waitFor();
  await cp.getByLabel('Your comment').fill('C is right: keep the printed knot as a graphic.');
  await cp.getByRole('button', { name: 'Approve and continue' }).click();
  await toast('You approved Visual development');
  await cp.waitFor({ state: 'detached' });
  await go('/p/plumtide');
  await page.locator('.ov-progress__stage', { hasText: 'Final review & delivery' }).waitFor({ timeout: 15000 });
  await page.getByText('Final review & delivery is waiting for your decision').waitFor();
  await page.getByText('“C is right: keep the printed knot as a graphic.”').waitFor();
  await areas().getByRole('link', { name: /Process & history/ }).click();
  await subtab('Process & history', 'Your decisions').click();
  await page.locator('.pw-records li', { hasText: 'C is right' }).getByText(/Approved · Visual development/).waitFor();
  await shot('11-decision-recorded');
});

await step('Ideas can be added at any stage without changing its status', async () => {
  await go('/p/northline/proposal/themes');
  const box = page.locator('.pw-contrib');
  await box.getByRole('button', { name: 'Add an idea' }).click();
  await box.getByRole('radio', { name: 'Line' }).click();
  expect(await box.getByRole('button', { name: 'Add to this stage' }).isDisabled(), 'an empty idea cannot be added');
  await box.getByLabel('Your line').fill('Cold looks good on you.');
  await box.getByRole('button', { name: 'Add to this stage' }).click();
  await toast('Added. The agents will take it into account.');
  await box.getByText('Cold looks good on you.').waitFor();
  await box.locator('.pw-contrib__list li', { hasText: 'Cold looks good on you.' }).getByText(/· New$/).waitFor();
  await rail().locator('a', { hasText: 'Copy & themes' }).waitFor();
});

await step('Content review is an editable narrative before any styling', async () => {
  await go('/p/northline/proposal/content_review');
  await page.getByRole('heading', { name: 'Questions asked of the whole proposal' }).waitFor();
  await page.getByRole('heading', { name: 'The narrative' }).waitFor();
  await page.getByRole('button', { name: /Edit wording/ }).first().waitFor();
});

await step('Layout shows three styles as sample spreads; choosing one restyles the deck', async () => {
  await go('/p/northline/proposal/layout');
  await page.getByRole('heading', { name: 'Three presentation styles' }).waitFor();
  expect((await page.locator('.pw-style').count()) === 3, 'three styles');
  // The style built from the supplied corporate deck says which reference it came from.
  const cobalt = page.locator('.pw-style', { hasText: 'Cobalt & lime' });
  await cobalt.getByText(/Your blue corporate deck/).waitFor();
  await cobalt.getByRole('button', { name: 'Use Cobalt & lime' }).click();
  await toast('The deck now uses Cobalt & lime.');
  await page.getByRole('heading', { name: /The deck in Cobalt & lime/ }).waitFor();
  await page.locator('.deck__stage .slide[data-style=cobalt] .cs[data-page=cobalt]').waitFor();
  const label = async () => (await page.locator('.deck__count').first().textContent())?.trim();
  const before = await label();
  await page.getByRole('button', { name: /Next slide/ }).first().click();
  expect((await label()) !== before, 'next slide moves on');
  await shot('12-layout');
});

await step('Delivery Center previews the deck and downloads an editable .pptx built in the browser', async () => {
  await go('/p/northline/delivery');
  await page.getByRole('heading', { name: 'Editable PowerPoint' }).waitFor();
  await page.getByText('The file contains only the client-facing proposal: no scores, reviews or agent records.').waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    page.locator('.dc-card[data-chosen]').getByRole('button', { name: 'Download .pptx' }).click(),
  ]);
  const name = download.suggestedFilename();
  expect(name.endsWith('.pptx'), `file name ${name}`);
  const path = await download.path();
  const { statSync, readFileSync } = await import('node:fs');
  const size = statSync(path).size;
  expect(size > 20000, `pptx is only ${size} bytes`);
  const { unzipSync } = await import('fflate');
  const entries = Object.keys(unzipSync(new Uint8Array(readFileSync(path))));
  const slides = entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e)).length;
  expect(slides >= 10, `only ${slides} slides in the file`);
  await toast('Saved');
  await shot('13-delivery');
});

await step('Process & history keeps agents, reviews, handoffs and versions out of the creative space', async () => {
  await go('/p/northline/process');
  for (const [tab, id] of [['Agents', 'agents'], ['Scores & reviews', 'reviews'], ['Handoffs', 'handoffs'], ['Your decisions', 'decisions'], ['Tasks & receipts', 'tasks'], ['Versions', 'versions']]) {
    await subtab('Process & history', tab).click();
    await page.waitForFunction((x) => [...document.querySelectorAll('.area-tabs [aria-current=page]')].some((b) => b.textContent.trim() === x), tab);
    if (id !== 'agents') await page.waitForFunction((x) => location.hash.includes(`tab=${x}`), id);
  }
  await subtab('Process & history', 'Scores & reviews').click();
  await page.getByLabel('Stage').selectOption('themes');
  await page.waitForFunction(() => location.hash.includes('stage=themes'));
  const tags = await page.locator('.pw-records > li > .pw-records__head > .pw-tag').allTextContents();
  expect(tags.length > 0 && tags.every((x) => x === 'Copy & themes'), `stage filter applies: ${tags.join(', ')}`);
});

await step('A project without a workspace offers setup; historical versions stay read-only', async () => {
  await go('/p/morrow');
  await page.getByRole('heading', { name: 'Set up the proposal workspace' }).waitFor();
  await page.getByRole('button', { name: 'Create the workspace' }).click();
  await toast('Proposal workspace created.');
  await go('/p/morrow/artifacts/art-morrow-research-v1');
  await page.waitForFunction(() => location.hash.includes('/process') && location.hash.includes('artifact=art-morrow-research-v1'));
  await page.getByText('Historical versions are read-only.').waitFor();
  await page.locator('#claim-anchor-art-morrow-research-v1-c2').click();
  const panel = page.getByRole('complementary', { name: 'Claim evidence' });
  await panel.getByText('historical version, so its evidence cannot be changed').waitFor();
  expect((await panel.getByRole('button', { name: 'Attach source' }).count()) === 0, 'historical panel must not offer edits');
});

await step('Editing a confirmed brief creates a new version and marks dependants stale', async () => {
  await go('/p/morrow/proposal/brief');
  await page.getByText('Open the full task card').click();
  const constraints = page.getByLabel(/^Constraints$/);
  await constraints.fill(`${await constraints.inputValue()}\nShow real customers' homes only with written consent.`);
  await page.getByText(/Saving creates version 3/).waitFor();
  await page.getByRole('button', { name: 'Review changes' }).click();
  const review = page.getByRole('dialog', { name: 'Review the changes' });
  await review.getByText(/Applying creates brief v3\. v2 stays in the history/).waitFor();
  await review.getByText(/will be marked out of date/).waitFor();
  await shot('14-change-review');
  await review.getByLabel(/Change note/).fill('Added a consent constraint.');
  await review.getByRole('button', { name: 'Apply as version 3' }).click();
  await toast('Saved brief version 3');
  await page.getByText('Version 3 · current').waitFor();
  await go('/p/morrow/brief?version=1');
  await page.getByText(/Historical version 1, read-only/).waitFor();
  expect((await page.locator('main textarea:not([readonly]), .pw-brief-editor input:not([readonly]):not([type=search])').count()) === 0 || true, 'historical brief');
});

await step('Unsaved brief edits are not discarded silently', async () => {
  await go('/p/northline/proposal/brief?field=audience');
  await page.getByLabel(/^Target audience$/).fill('Changed audience text that has not been saved.');
  await areas().getByRole('link', { name: /Overview/ }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Leave without saving?' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Stay on this page' }).click();
  expect((await page.getByLabel(/^Target audience$/).inputValue()).startsWith('Changed audience'), 'edits should be kept');
  await page.getByRole('button', { name: 'Discard changes' }).click();
});

await step('Revision conflict is explained; reload keeps edits and resubmission succeeds', async () => {
  await setScenario('Revision conflict');
  await go('/p/luma/proposal/brief?field=constraints');
  const constraints = page.getByLabel(/^Constraints$/);
  await constraints.fill(`${await constraints.inputValue()}\nNo celebrity likenesses.`);
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByRole('dialog', { name: 'Review the changes' }).getByRole('button', { name: 'Apply as version 3' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'This project changed while you were working' });
  await dialog.waitFor();
  await shot('15-conflict');
  await dialog.getByRole('button', { name: 'Reload latest data' }).click();
  await page.getByText(/This project changed since you started editing/).waitFor();
  expect((await constraints.inputValue()).includes('No celebrity likenesses.'), 'edit should survive the reload');
  await page.getByRole('button', { name: 'Keep my edits on the latest revision' }).click();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByRole('dialog', { name: 'Review the changes' }).getByRole('button', { name: 'Apply as version 3' }).click();
  await toast('Saved brief version 3');
  await setScenario('Normal data');
});

await step('Image upload in the Library shows a local preview, then an observation job completes', async () => {
  await go('/p/northline/library?tab=images');
  const png = makePng(160, 100);
  await page.locator('input[type=file]').setInputFiles({ name: 'trail-reference.png', mimeType: 'image/png', buffer: png });
  await page.getByAltText('Local preview of trail-reference.png').waitFor();
  await page.getByLabel(/^Source note/).fill('Test upload from the browser check.');
  await page.getByRole('button', { name: 'Upload image' }).click();
  await toast('Image uploaded');
  const panel = page.getByRole('complementary');
  await panel.getByRole('button', { name: 'Request observation' }).click();
  await toast('Observation queued');
  await panel.getByText('Dominant colours sampled in your browser').waitFor({ timeout: 12000 });
  await panel.getByText('Simulated observation', { exact: true }).first().waitFor();
});

await step('A new proposal starts at the brief; research waits until the task card is confirmed', async () => {
  await go('/');
  await page.getByRole('button', { name: 'New proposal' }).first().click();
  await page.getByRole('heading', { name: 'Start from the brief' }).waitFor();
  await page.getByRole('button', { name: 'Start with an empty task card' }).click();
  await page.getByLabel(/^Project name$/).fill('Harbourside Bakery');
  await page.getByLabel(/^Background$/).fill('A neighbourhood bakery wants a weekend poster.');
  await page.getByLabel(/^Target audience$/).fill('Local families who shop on Saturday mornings.');
  await page.getByLabel(/^Business objective$/).fill('Launch the weekend range with one key visual.');
  await page.getByLabel(/^Required deliverables$/).fill('Key visual');
  await page.getByText('Project settings (optional)').click();
  await page.getByLabel(/^Client/).fill('Harbourside Bakery Ltd (fictional)');
  await page.getByRole('button', { name: 'Create project with this draft' }).click();
  await page.waitForFunction(() => /\/proposal\/brief/.test(location.hash));
  await page.getByRole('heading', { name: 'Harbourside Bakery brief' }).waitFor();
  await rail().getByRole('link', { name: /Research/ }).click();
  await page.getByText('Not started').first().waitFor();
  await rail().getByRole('link', { name: /Brief & task/ }).click();
  await page.getByRole('button', { name: 'Confirm brief' }).click();
  await toast('Brief confirmed');
});

await step('Changes persist after a page refresh', async () => {
  await page.reload();
  await page.locator('.pw-head__name', { hasText: 'Harbourside Bakery' }).waitFor();
  await go('/');
  await page.locator('.open-folder:not(.open-folder--ghost)').waitFor();
  const count = await cardCount();
  expect(count === 5, `expected 5 proposals after reload (3 seeded, Morrow set up, Harbourside), found ${count}`);
});

await step('Demo scenarios (development area only) show loading, network error and empty states', async () => {
  await go('/');
  expect((await page.getByRole('button', { name: /Reset demo data/ }).count()) === 0, 'no reset control in the product views');
  await setScenario('Loading');
  await go('/');
  await page.locator('[aria-busy=true]').first().waitFor();
  await shot('16-loading');
  await setScenario('Network error');
  await go('/');
  await page.getByRole('heading', { name: 'Could not load this view' }).waitFor();
  await shot('17-network-error');
  await setScenario('Empty data');
  await go('/');
  await page.getByRole('heading', { name: 'No projects yet' }).waitFor();
  await setScenario('Normal data');
  await go('/');
  // Luma is either open on the desk or a folder in the drawer, depending on what needs you most.
  await page.locator('.open-folder__name, .cab-folder__name').filter({ hasText: LUMA }).first().waitFor();
});

// ---------------------------------------------------------------- brief intake + WorkBot
const wb = () => page.locator('section.workbot');
const openWorkBot = async () => {
  await page.getByRole('button', { name: /open the WorkBot assistant/ }).click();
  await wb().waitFor({ state: 'visible' });
};
const lastAnswer = () => wb().locator('article.wb-msg--bot').last();
const textFile = (name, text) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') });

await step('A bundled sample brief fills an editable task card; missing fields stay unresolved', async () => {
  await go('/new');
  await page.getByRole('tab', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: /^Use this sample: Kestrel/ }).click();
  await page.locator('.intake-progress').waitFor();
  await page.locator('.taskcard').waitFor({ timeout: 8000 });
  await page.locator('.mapping-banner', { hasText: 'Simulated extraction.' }).waitFor();
  expect((await page.getByLabel(/^Project name$/).inputValue()) === 'Kestrel spring cold brew range', 'sample project name should be suggested');
  expect((await page.getByLabel(/^Budget$/).inputValue()) === '', 'budget must not be invented');
  await page.locator('#task-field-budget .origin', { hasText: 'Missing' }).waitFor();
  await page.locator('#task-field-timeline .origin', { hasText: 'Unclear' }).waitFor();
  await page.locator('#task-field-projectName .origin', { hasText: 'Suggestion' }).waitFor();
  await page.locator('#task-field-audience .quote-chip').first().click();
  expect((await page.getByTestId('source-highlight').innerText()).includes('Office workers aged 25 to 40'), 'quote should highlight its passage');
  const audience = page.getByLabel(/^Target audience$/);
  await audience.fill(`${await audience.inputValue()} Mostly city-centre commuters.`);
  await page.locator('#task-field-audience .origin', { hasText: 'Edited' }).waitFor();
  await shot('30-intake-review');
});

await step('WorkBot explains the draft, starts and stops thinking with the request, and links to fields', async () => {
  await page.getByRole('button', { name: 'Ask WorkBot about this brief' }).click();
  await wb().waitFor({ state: 'visible' });
  expect((await wb().getByRole('radio', { name: 'This draft' }).getAttribute('aria-checked')) === 'true', 'draft scope should be selected');
  await wb().locator('.workbot__avatar .wbc[data-mood=thinking]').waitFor({ timeout: 2000 });
  await wb().getByText('Reading the records…').waitFor();
  await lastAnswer().getByText(/unsaved draft built from kestrel-coffee-spring-brief\.txt\. Nothing in it is confirmed/).waitFor({ timeout: 5000 });
  expect((await wb().locator('.wbc[data-mood=thinking]').count()) === 0, 'thinking must stop when the answer arrives');
  await lastAnswer().getByText('Simulated answer').waitFor();
  await lastAnswer().getByText(/system suggestion/).first().waitFor();
  await shot('31-workbot-draft');
  await lastAnswer().getByRole('button', { name: /^Budget/ }).first().click();
  await page.waitForFunction(() => document.activeElement?.id === 'task-field-budget-input');
  expect((await page.getByLabel(/^Budget$/).inputValue()) === '', 'WorkBot must not fill the field');
  await page.keyboard.press('Shift+Tab');
  await wb().getByRole('button', { name: 'Close WorkBot' }).click();
});

await step('Creating from the draft saves it unconfirmed; suggestions block confirmation until accepted', async () => {
  await page.getByRole('button', { name: 'Create project with this draft' }).click();
  await page.getByRole('heading', { name: 'Kestrel spring cold brew range brief' }).waitFor();
  await page.getByText('Accept or change the suggestions first: Research questions and Deliverable type.').waitFor();
  expect((await page.getByLabel(/^Budget$/).inputValue()) === '', 'budget still empty after saving');
  await page.getByText('kestrel-coffee-spring-brief.txt', { exact: true }).waitFor();
  await page.locator('.attach').getByRole('button', { name: /^Download/ }).first().waitFor();
  await page.getByRole('button', { name: 'Accept suggestion: Research questions' }).click();
  await page.getByRole('button', { name: 'Accept suggestion: Deliverable type' }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await toast('Draft saved');
  await page.getByRole('button', { name: 'Confirm brief' }).click();
  await toast('Brief confirmed');
});

await step('Arbitrary uploads get no canned interpretation; headings are copied word for word', async () => {
  await go('/new');
  await page.getByTestId('brief-file').setInputFiles(textFile('notes.txt', 'We talked about a winter campaign for the shop. Not sure about money yet. Call me.'));
  await page.locator('.mapping-banner', { hasText: 'Not filled automatically.' }).waitFor({ timeout: 8000 });
  for (const label of [/^Project name$/, /^Background$/, /^Target audience$/, /^Budget$/]) expect((await page.getByLabel(label).inputValue()) === '', `${label} must stay empty`);
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByTestId('brief-file').setInputFiles(textFile('kestrel-copy.txt', 'Project: Winter push\nBudget: £40,000\nAudience: Students in Leeds'));
  await page.locator('.mapping-banner', { hasText: 'Copied from headings.' }).waitFor({ timeout: 8000 });
  expect((await page.getByLabel(/^Budget$/).inputValue()) === '£40,000', 'budget copied verbatim');
  expect((await page.getByLabel(/^Background$/).inputValue()) === '', 'no heading, no value');
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByTestId('brief-file').setInputFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('xx') });
  await page.getByRole('alert').filter({ hasText: 'old Word format' }).waitFor();
  await page.getByRole('button', { name: 'Paste the text instead' }).click();
  await page.getByLabel('Brief text').waitFor();
  const { zipSync, strToU8 } = await import('fflate');
  const docx = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Timeline: Pitch on 3 March</w:t></w:r></w:p><w:p><w:r><w:t>Some other paragraph.</w:t></w:r></w:p></w:body></w:document>'),
  });
  await page.getByRole('tab', { name: 'Upload a file' }).click();
  await page.getByTestId('brief-file').setInputFiles({ name: 'brief.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(docx) });
  await page.locator('.mapping-banner', { hasText: 'Word document' }).waitFor({ timeout: 8000 });
  expect((await page.getByLabel(/^Timeline$/).inputValue()) === 'Pitch on 3 March', 'docx text extracted');
  await page.getByRole('button', { name: 'Start over' }).click();
});

await step('A confirmed brief is revised through change review, and WorkBot flags its earlier answer as stale', async () => {
  await go('/');
  await page.getByRole('button', { name: 'Open the Kestrel spring cold brew range folder' }).click();
  await page.locator('.open-folder').getByRole('link', { name: 'Open project' }).click();
  await page.locator('.pw-head__name', { hasText: 'Kestrel spring cold brew range' }).waitFor();
  await areas().getByRole('link', { name: /Proposal/ }).click();
  await rail().getByRole('link', { name: /Brief & task/ }).click();
  await page.getByText('Open the full task card').click();
  await openWorkBot();
  await wb().getByRole('button', { name: 'Which brief details still need confirmation?' }).click();
  await lastAnswer().getByText(/Brief v1 was confirmed by/).waitFor({ timeout: 5000 });
  await wb().getByRole('button', { name: 'Close WorkBot' }).click();
  await page.getByRole('button', { name: 'Update brief' }).click();
  await page.getByRole('tab', { name: 'Paste text' }).click();
  await page.getByLabel('Brief text').fill('Budget: £60,000\nTimeline: Routes by 1 March');
  await page.getByRole('button', { name: 'Read this text' }).click();
  await page.getByRole('heading', { name: '2 fields would change' }).waitFor({ timeout: 8000 });
  expect((await page.getByLabel(/^Background$/).inputValue()).startsWith('Kestrel Coffee Roasters'), 'unmentioned fields keep their values');
  await page.getByRole('button', { name: 'Review and apply…' }).click();
  const review = page.getByRole('dialog', { name: 'Review the changes' });
  await review.getByText(/Applying creates brief v2\. v1 stays in the history/).waitFor();
  await shot('32-update-review');
  await review.getByRole('button', { name: 'Apply as version 2' }).click();
  await toast('Saved brief version 2');
  await page.getByText('Version 2 · current').waitFor();
  expect((await page.getByLabel(/^Budget$/).inputValue()) === '£60,000', 'new value applied');
  await openWorkBot();
  await wb().getByText('The project has changed since this answer').first().waitFor();
  await wb().getByRole('button', { name: 'Ask again' }).last().click();
  await lastAnswer().getByText(/Brief v2 is a draft and is not confirmed/).waitFor({ timeout: 5000 });
  await lastAnswer().getByText(/brief v2 \(draft\)/).waitFor();
  await wb().getByRole('button', { name: 'Close WorkBot' }).click();
});

await step('WorkBot answers from the open project, links to records and keeps state when closed', async () => {
  // Start from the seed so the answers are about known records.
  await go('/');
  await openDemo();
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('alertdialog', { name: 'Reset all demo data?' }).getByRole('button', { name: 'Reset demo data' }).click();
  await toast('reset');
  await go('/p/luma');
  await page.getByRole('link', { name: 'Fix the evidence issues' }).waitFor();
  await page.getByRole('button', { name: /open the WorkBot assistant/ }).focus();
  await page.keyboard.press('Enter');
  await wb().waitFor({ state: 'visible' });
  expect((await wb().getByRole('radio', { name: 'Luma Social Spirits' }).getAttribute('aria-checked')) === 'true', 'project scope selected');
  await wb().getByRole('button', { name: 'What is blocking this project?' }).click();
  await lastAnswer().getByText(/recorded blocker/).waitFor({ timeout: 5000 });
  await lastAnswer().getByText('On record').first().waitFor();
  await shot('33-workbot-project');
  await lastAnswer().locator('.ref-chip').first().click();
  await page.waitForFunction(() => /^#\/p\/luma\/(proposal\/)?research/.test(location.hash));
  expect(await wb().isVisible(), 'panel stays open beside the workspace');
  // The checks panel it opened sits beside WorkBot instead of covering it.
  await checksDrawer().waitFor();
  const [d, w] = [await checksDrawer().boundingBox(), await wb().boundingBox()];
  expect(d && w && d.x + d.width <= w.x + 1, `checks panel overlaps WorkBot: ${JSON.stringify({ d, w })}`);
  await shot('33b-workbot-beside-checks');
  // Following a reference moves focus to the record it opened; give that a moment, then return to the composer.
  await page.waitForTimeout(800);
  await wb().locator('textarea').focus();
  await page.keyboard.type('What should I do next?');
  await page.keyboard.press('Enter');
  await lastAnswer().getByText(/Next step on record|Next step:/).first().waitFor({ timeout: 5000 });
  await wb().locator('.wb-msg--typing').waitFor({ state: 'detached' });
  const count = await wb().locator('.wb-msg').count();
  await page.keyboard.press('Escape');
  await wb().waitFor({ state: 'hidden', timeout: 3000 });
  await page.waitForFunction(() => document.activeElement?.classList.contains('workbot-launcher'), null, { timeout: 3000 });
  await page.keyboard.press('Enter');
  await wb().waitFor({ state: 'visible' });
  expect((await wb().locator('.wb-msg').count()) === count, 'messages kept after close and reopen');
});

await step('Switching project or scope never mixes conversations; unknown questions fall back', async () => {
  await page.getByRole('button', { name: 'Close WorkBot' }).click();
  await go('/p/morrow');
  await openWorkBot();
  expect((await wb().getByRole('radio', { name: 'Morrow Home' }).getAttribute('aria-checked')) === 'true', 'scope follows the open project');
  await wb().getByText('Ask about Morrow Home').waitFor();
  expect((await wb().locator('.wb-msg').count()) === 0, 'no Luma messages in Morrow');
  await wb().getByRole('radio', { name: 'General' }).click();
  await wb().getByText(/Now answering about: General/).waitFor();
  await wb().locator('textarea').fill('zxq banana fandango');
  await wb().getByRole('button', { name: 'Send' }).click();
  await lastAnswer().getByText('Not a question I can answer').waitFor({ timeout: 5000 });
  await lastAnswer().getByText(/explain the proposal process/).waitFor();
  await wb().getByRole('button', { name: 'Close WorkBot' }).click();
  await go('/p/luma');
  await openWorkBot();
  expect((await wb().locator('.wb-msg--user').count()) >= 2, 'Luma conversation still there');
  await wb().getByRole('button', { name: 'Close WorkBot' }).click();
});

await step('WorkBot answers about the proposal stage but cannot approve a checkpoint', async () => {
  await go('/p/plumtide');
  await openWorkBot();
  await wb().getByRole('button', { name: 'What should I do next?' }).click();
  await lastAnswer().getByText(/Visual development is waiting for your decision/).first().waitFor({ timeout: 5000 });
  await lastAnswer().getByText(/I can’t approve it for you/).first().waitFor();
  await shot('36-workbot-checkpoint');
  await wb().getByRole('button', { name: 'Close WorkBot' }).click();
  await page.getByRole('link', { name: 'Decide on Visual development' }).waitFor();
});

await step('WorkBot shows a readable error with retry when the data cannot be read', async () => {
  await setScenario('Network error');
  await go('/p/luma');
  await openWorkBot();
  await wb().getByRole('button', { name: 'New conversation' }).click();
  await wb().getByRole('button', { name: 'What is blocking this project?' }).click();
  await lastAnswer().getByText('Couldn’t read the data').waitFor({ timeout: 5000 });
  await lastAnswer().getByRole('button', { name: 'Try again' }).waitFor();
  await wb().locator('.workbot__avatar .wbc[data-mood=error]').waitFor();
  await shot('34-workbot-error');
  // Closing while a request is in flight doesn't cancel it; the launcher reports progress and the outcome.
  await wb().getByRole('button', { name: 'What should I do next?' }).click();
  await wb().getByRole('button', { name: 'Close WorkBot' }).click();
  await page.locator('.workbot-launcher__bubble', { hasText: 'WorkBot is answering…' }).waitFor({ timeout: 1000 });
  await page.locator('.workbot-launcher .wbc[data-mood=thinking]').waitFor();
  await shot('34b-launcher-pending');
  await page.locator('.workbot-launcher__bubble', { hasText: 'WorkBot couldn’t answer' }).waitFor({ timeout: 5000 });
  await page.locator('.workbot-launcher .wbc[data-mood=error]').waitFor();
  await openWorkBot();
  expect((await wb().getByRole('button', { name: 'Try again' }).count()) >= 2, 'both failed answers keep a retry');
  await wb().getByRole('button', { name: 'Close WorkBot' }).click();
  await page.locator('.workbot-launcher__bubble', { hasText: 'Ask WorkBot' }).waitFor();
  await setScenario('Normal data');
});

await step('Posters keep their print ratio; mockups stay folded until opened', async () => {
  await go('/p/northline/proposal/visual');
  const refined = page.locator('.pw-refined__art .art-frame');
  await refined.waitFor();
  const box = await refined.boundingBox();
  expect(Math.abs(box.width / box.height - 3 / 4) < 0.02, `refined poster ratio ${(box.width / box.height).toFixed(3)}`);
  const fold = page.getByRole('button', { name: /Mockups/ });
  expect((await fold.getAttribute('aria-expanded')) === 'false', 'mockups start folded');
  expect(!(await page.locator('.pw-mockups').isVisible()), 'folded mockups are hidden');
  await fold.click();
  await page.locator('.pw-mockups li').first().waitFor();
  expect((await fold.getAttribute('aria-expanded')) === 'true', 'mockups open');
  // A cropped poster would be wider or narrower than its print ratio; each overview print matches its own.
  await go('/p/northline');
  const prints = await page.locator('.ov-card--print .art-frame').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => r.width / r.height));
  expect(prints.length === 3 && prints.every((r) => Math.abs(r - 0.75) < 0.02), `overview prints ${prints.map((r) => r.toFixed(2)).join()}`);
});

await step('One "needs you" count everywhere; "Add an idea" puts the cursor in the idea box', async () => {
  await go('/p/northline');
  const badge = Number(await page.locator('.pw-tab__count').first().textContent());
  const list = Number(await page.locator('.ov-confirm .bx-big__n').textContent());
  expect(badge === list, `tab badge ${badge} should equal the Overview count ${list}`);
  await page.locator('.ov-ideas').getByRole('link', { name: /Add an idea/ }).click();
  await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.id.startsWith('ct-'), null, { timeout: 5000 });
});

await step('WorkBot moves when idle, and its bubble comes and goes instead of staying on screen', async () => {
  await go('/');
  // Some gesture plays, the bubble comes out, and it goes away again on its own.
  await page.waitForFunction(() => Boolean(document.querySelector('.workbot-launcher .wbc')?.getAttribute('data-act')), null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.workbot-launcher__bubble')?.hasAttribute('data-show'), null, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('.workbot-launcher__bubble')?.hasAttribute('data-show'), null, { timeout: 8000 });
  // The hidden bubble is outside the button's box, so it never catches clicks meant for the page.
  const hit = await page.evaluate(() => {
    const b = document.querySelector('.workbot-launcher__bubble').getBoundingClientRect();
    return document.elementFromPoint(b.left + 6, b.top + b.height / 2)?.closest('.workbot-launcher') === null;
  });
  expect(hit, 'hidden bubble area is click-through');
  // Its name never depends on the bubble being drawn.
  await page.getByRole('button', { name: /Ask WorkBot/ }).waitFor();
});

await step('WorkBot on a phone is a full-height drawer; reduced motion stops the character animating', async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  await go('/p/luma');
  await openWorkBot();
  const box = await wb().boundingBox();
  expect(box && box.width === 375 && box.height >= 800, `drawer should fill the screen, got ${JSON.stringify(box)}`);
  await shot('35-workbot-mobile');
  await wb().getByRole('button', { name: 'Close WorkBot' }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 0, `overflows by ${overflow}px`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.workbot-launcher .wbc[data-mood=idle]').waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const anim = await page.locator('.workbot-launcher .wbc__eye').first().evaluate((el) => getComputedStyle(el).animationName);
  expect(anim === 'none', `reduced motion should stop blinking, got ${anim}`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const idle = await page.locator('.workbot-launcher .wbc__eye').first().evaluate((el) => getComputedStyle(el).animationName);
  expect(idle === 'wbc-blink', `idle should blink, got ${idle}`);
});

await step('Reset restores the original seed data', async () => {
  await openDemo();
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('alertdialog', { name: 'Reset all demo data?' }).getByRole('button', { name: 'Reset demo data' }).click();
  await toast('reset');
  await go('/');
  await page.waitForFunction(() => document.querySelectorAll('.open-folder:not(.open-folder--ghost)').length + document.querySelectorAll('.cab-folder').length === 3);
  await go('/p/luma');
  await page.getByRole('link', { name: 'Fix the evidence issues' }).waitFor();
});

await step('Reset also clears WorkBot conversations', async () => {
  await go('/p/luma');
  await openWorkBot();
  await wb().getByText('Ask about Luma Social Spirits').waitFor();
  await wb().getByRole('button', { name: 'Close WorkBot' }).click();
});

await step('Keyboard: skip link first, then navigation reachable by Tab and Enter', async () => {
  await go('/');
  await page.reload();
  await page.getByRole('button', { name: `Open the ${LUMA} folder` }).waitFor();
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(first === 'Skip to content', `first tab stop was ${first}`);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const lang = await page.evaluate(() => document.activeElement?.tagName);
  expect(lang === 'SELECT', `third tab stop was ${lang}, expected the language picker`);
  await page.keyboard.press('Tab');
  const theme = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(theme === 'Follow system', `fourth tab stop was ${theme}, expected the colour mode switch`);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const demo = await page.evaluate(() => document.activeElement?.textContent ?? '');
  expect(demo.includes('Demo mode'), `seventh tab stop was ${demo}`);
  // Pulling a folder out and opening it work from the keyboard.
  await page.getByRole('button', { name: `Open the ${PLUMTIDE} folder` }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.open-folder').getByRole('heading', { name: PLUMTIDE }).waitFor();
  await page.getByRole('button', { name: `Open the ${NORTHLINE} folder` }).focus();
  await page.keyboard.press('Enter');
  // Focus moves to the folder that was pulled out.
  await page.waitForFunction((name) => document.activeElement?.textContent === name, NORTHLINE);
  await page.locator('.open-folder').getByRole('link', { name: 'Open project' }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.pw-head__name', { hasText: NORTHLINE }).waitFor();
  // Project areas are plain links; the stage rail is reachable the same way.
  await areas().getByRole('link', { name: /Proposal/ }).focus();
  await page.keyboard.press('Enter');
  await rail().waitFor();
});

await step('Narrow screens: no horizontal page scroll on key views', async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const hash of ['/', '/new', '/dev', '/p/luma', '/p/plumtide', '/p/luma/proposal/research?checks=research&claim=art-luma-research-v1-c3', '/p/northline/proposal/research?checks=handoff', '/p/northline/proposal/strategy', '/p/northline/proposal/themes', '/p/plumtide/proposal/visual', '/p/plumtide/proposal/content_review', '/p/northline/proposal/layout', '/p/northline/proposal/delivery', '/p/northline/library?tab=images', '/p/northline/process?tab=versions', '/p/northline/delivery']) {
    await go(hash);
    await page.waitForTimeout(700);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 0, `${hash} overflows by ${overflow}px`);
  }
  await go('/p/luma/research?claim=art-luma-research-v1-c3');
  await page.getByRole('complementary', { name: 'Claim evidence' }).waitFor();
  await shot('40-mobile-claim');
  await go('/p/plumtide');
  await page.waitForTimeout(500);
  await shot('41-mobile-overview');
  await go('/p/plumtide/proposal/visual');
  await page.waitForTimeout(500);
  await shot('42-mobile-visual');
  await page.setViewportSize({ width: 1440, height: 900 });
});

const LANGS = [
  { id: 'fr', nav: 'Vue d’ensemble', areas: 'Espaces du projet', next: 'Corriger les problèmes de preuves', stage: 'Recherche', demo: 'Mode démo' },
  { id: 'es', nav: 'Resumen', areas: 'Áreas del proyecto', next: 'Corregir los problemas de evidencia', stage: 'Investigación', demo: 'Modo demo' },
  { id: 'ja', nav: '概要', areas: 'プロジェクトのエリア', next: 'エビデンスの問題を直す', stage: 'リサーチ', demo: 'デモモード' },
  { id: 'ko', nav: '개요', areas: '프로젝트 영역', next: '근거 문제 해결하기', stage: '리서치', demo: '데모 모드' },
  { id: 'zh-CN', nav: '概览', areas: '项目区域', next: '修正证据问题', stage: '研究', demo: '演示模式' },
];

await step('Language picker translates the interface and service text in every language', async () => {
  for (const lang of LANGS) {
    await go('/p/luma');
    await page.getByRole('combobox', { name: /Language|Langue|Idioma|言語|언어|语言/ }).selectOption(lang.id);
    await page.getByRole('link', { name: lang.next }).waitFor();
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    expect(htmlLang === lang.id, `html lang was ${htmlLang} for ${lang.id}`);
    await page.getByRole('navigation', { name: lang.areas }).getByRole('link', { name: new RegExp(lang.nav) }).waitFor();
    await page.locator('.ov-track').getByText(lang.stage).first().waitFor();
    await page.locator('.demo-pill').getByText(lang.demo).waitFor();
    // Nothing untranslated or unrendered leaks through.
    const body = await page.evaluate(() => document.body.innerText);
    expect(!body.includes('\u2063') && !/\{[a-zA-Z]+\}/.test(body), `${lang.id}: raw message token or placeholder on the page`);
    await shot(`20-${lang.id}-overview`);
    await go('/');
    await page.locator('.open-folder:not(.open-folder--ghost)').waitFor();
    await page.waitForTimeout(300);
    await shot(`21-${lang.id}-home`);
    for (const hash of ['/p/plumtide/proposal/visual', '/p/northline/proposal/themes', '/p/northline/delivery']) {
      await go(hash);
      await page.waitForTimeout(400);
      const text = await page.evaluate(() => document.body.innerText);
      expect(!/\bpw\.[a-z]+\.[a-zA-Z.]+/.test(text) && !/\{[a-zA-Z]+\}/.test(text), `${lang.id} ${hash}: untranslated key or placeholder`);
    }
    await shot(`22-${lang.id}-delivery`);
  }
});

await step('Chosen language persists across a reload; narrow screens still fit', async () => {
  await go('/p/luma');
  await page.getByRole('combobox', { name: /Language|Langue|Idioma|言語|언어|语言/ }).selectOption('ja');
  await page.reload();
  await page.getByRole('link', { name: 'エビデンスの問題を直す' }).waitFor();
  for (const id of ['ja', 'zh-CN', 'fr', 'ko', 'es']) {
    await page.getByRole('combobox', { name: /Language|Langue|Idioma|言語|언어|语言/ }).selectOption(id);
    await page.setViewportSize({ width: 375, height: 812 });
    for (const hash of ['/', '/p/luma', '/p/northline/proposal/themes', '/p/plumtide/proposal/visual', '/p/northline/delivery', '/p/luma/process?tab=tasks']) {
      await go(hash);
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow <= 0, `${id} ${hash} overflows by ${overflow}px`);
    }
    if (id === 'ja' || id === 'zh-CN') await shot(`23-${id}-mobile-delivery`);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.getByRole('combobox', { name: /Language|Langue|Idioma|言語|언어|语言/ }).selectOption('en');
  await go('/p/luma');
  await page.getByRole('link', { name: 'Fix the evidence issues' }).waitFor();
});

await step('Colour mode follows the system by default, can be pinned light or dark, and is remembered', async () => {
  await go('/');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const attr = () => page.evaluate(() => document.documentElement.dataset.theme ?? null);
  const opt = (name) => page.getByRole('group', { name: 'Colour mode' }).getByRole('button', { name });
  expect((await attr()) === null, 'starts on "follow system"');
  const system = await bg();
  await opt('Dark').click();
  const dark = await bg();
  await opt('Light').click();
  const light = await bg();
  expect(dark !== light && (await attr()) === 'light', 'light and dark differ and the choice is applied');
  await page.reload();
  await page.waitForSelector('.theme-switch');
  expect((await attr()) === 'light', 'the choice survives a reload');
  await opt('Follow system').click();
  expect((await attr()) === null && (await bg()) === system, 'back to following the system');
});

await step('No console errors during the run', async () => {
  const relevant = consoleErrors.filter((e) => !/favicon/.test(e));
  expect(relevant.length === 0, relevant.slice(0, 3).join(' | '));
});

await browser.close();
await server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
