import {resolveIntent} from './semantic-input.mjs';
const pagesOf=input=>input.semantic.intents.map(i=>resolveIntent(input,i));
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadInput } from './input.mjs';
import { planDeck } from './layout.mjs';
import { buildDeck } from './index.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const request = {
  ledger: resolve(root, 'output/ppt/m6-integrated-v5/content-ledger.json'),
  brand: resolve(root, 'output/auto-layout/inputs/brand.json'),
  assets: resolve(root, 'output/auto-layout/inputs/assets.json'),
};
const reportPath = resolve(root, 'output/auto-layout/checks/test-report.json');
await mkdir(dirname(reportPath), { recursive: true });
const results = [];
async function check(name, run) {
  try { const detail = await run(); results.push({ name, status: 'pass', ...(detail ? { detail } : {}) }); }
  catch (error) { results.push({ name, status: 'fail', error: error.message }); }
}
const input = await loadInput(request);
const clone = () => structuredClone(input);
const styles = ['editorial', 'stage', 'evidence'];
const plans = {};
const normalize = text => text.replaceAll('\n', '');
const renderedText = slides => slides.flatMap(s => s.elements.filter(e => e.type === 'text'));
function expectedText(page) {
  return [page.title, page.sub, page.takeaway, ...(page.items || []).flat()].filter(Boolean);
}
async function invalidManifest(field, mutate, pattern) {
  const manifest = JSON.parse(await readFile(request[field], 'utf8'));
  mutate(manifest);
  if (field === 'assets') for (const asset of Object.values(manifest.assets)) asset.file = resolve(dirname(request.assets), asset.file);
  if (field === 'brand') manifest.font.files = manifest.font.files.map(file => resolve(dirname(request.brand), file));
  await writeFile(reportPath, JSON.stringify(manifest));
  await assert.rejects(() => loadInput({ ...request, [field]: reportPath }), pattern);
}
for (const style of styles) {
  await check(`${style}: deterministic real-input plan and public plan-only API`, async () => {
    plans[style] = planDeck(input, style);
    assert.deepEqual(planDeck(input, style), plans[style]);
    assert.deepEqual(await buildDeck({ ...request, style, planOnly: true }), plans[style]);
    assert.deepEqual([...new Set(plans[style].slides.map(s => s.originId))], pagesOf(input).map(p => p.id));
    return { slides: plans[style].slides.length };
  });
  await check(`${style}: all elements fit 1280×720 and body fonts meet 22px floor`, () => {
    for (const slide of plans[style].slides) for (const e of slide.elements) {
      assert([e.x, e.y, e.w, e.h].every(Number.isFinite), slide.id);
      assert(e.x >= 0 && e.y >= 0 && e.w > 0 && e.h >= 0 && e.x + e.w <= 1280.1 && e.y + e.h <= 720.1, `${slide.id} outside canvas`);
      if (e.type === 'text' && e.role === 'body') assert(e.size >= 22, slide.id);
    }
  });
  await check(`${style}: visible text characters covered, integrated poster exempt`, () => {
    for (const page of pagesOf(input).filter(p => p.kind !== 'kvfull')) {
      const text = renderedText(plans[style].slides.filter(s => s.originId === page.id));
      for (const value of expectedText(page)) assert(text.some(e => normalize(e.text) === normalize(value)), `${page.id} missing visible text ${value}`);
    }
  });
  await check(`${style}: sourceText preserves exact original including circles sub`, () => {
    const missing = [];
    for (const page of pagesOf(input).filter(p => p.kind !== 'kvfull')) {
      const text = renderedText(plans[style].slides.filter(s => s.originId === page.id));
      for (const value of expectedText(page)) if (!text.some(e => e.sourceText === value)) missing.push({ page: page.id, kind: page.kind, value });
    }
    assert.equal(missing.length, 0, JSON.stringify(missing));
  });
  await check(`${style}: circles retain all nine item cells and subtitle characters`, () => {
    const circles = pagesOf(input).filter(p => p.kind === 'circles');
    assert(circles.length > 0);
    for (const page of circles) {
      const text = renderedText(plans[style].slides.filter(s => s.originId === page.id));
      for (const value of [...page.items.flat(), page.sub]) assert(text.some(e => normalize(e.text) === normalize(value)), `${page.id} missing ${value}`);
    }
  });
  await check(`${style}: image ratios preserved and poster remains an independent image`, () => {
    for (const slide of plans[style].slides) for (const e of slide.elements.filter(e => e.type === 'image')) {
      const asset = input.assets[e.assetId];
      assert(Math.abs((e.w / e.h) / (asset.width / asset.height) - 1) < 1e-9, `${slide.id} ${e.assetId}`);
      assert.equal(e.fit, 'contain');
    }
    for (const page of pagesOf(input).filter(p => p.kind === 'kvfull')) {
      const slide = plans[style].slides.find(s => s.originId === page.id);
      assert(slide.elements.some(e => e.type === 'image' && e.assetId === `art:${page.direction}`));
    }
    for (const page of pagesOf(input).filter(p => p.kind === 'application')) {
      const slide = plans[style].slides.find(s => s.originId === page.id);
      assert.deepEqual(slide.elements.filter(e => e.type === 'image').map(e => e.assetId), [page.mockup, `art:${page.direction}`]);
    }
  });
  await check(`${style}: galleries over four images paginate without loss`, () => {
    const sample = clone(), page = sample.semantic.intents.find(p => p.kind === 'gallery');
    page.ids = Object.keys(sample.cases).slice(0, 9);
    sample.semantic.intents = [page];
    const plan = planDeck(sample, style);
    assert.equal(plan.slides.length, Math.ceil(page.ids.length/(style==='stage'?2:4)));
    assert(plan.slides.every(s => s.originId === page.id));
    const images = plan.slides.flatMap(s => s.elements.filter(e => e.type === 'image').map(e => e.assetId));
    assert.deepEqual(images, page.ids.map(id => `case:${id}`));
    assert(plan.slides.every(s => s.elements.filter(e => e.type === 'image').length <= 4));
  });
  await check(`${style}: extreme text fails explicitly`, () => {
    const sample = clone();
    const page=sample.semantic.intents.find(p=>p.kind==='statement');sample.semantic.intents=[page];sample.semantic.blocksById[page.slotFields.title].text='长文字'.repeat(2000);
    assert.throws(() => planDeck(sample, style), /content-overflow/);
  });
  await check(`${style}: mockup purpose and aspect mismatches rejected`, () => {
    const purpose = clone(), ratio = clone();
    purpose.semantic.intents = [purpose.semantic.intents.find(p => p.kind === 'application')];
    purpose.semantic.intents[0].purpose = 'packaging-portrait';
    assert.throws(() => planDeck(purpose, style), /mockup-purpose-mismatch/);
    ratio.semantic.intents = [ratio.semantic.intents.find(p => p.kind === 'application')];
    ratio.assets[ratio.semantic.intents[0].mockup].aperture.w /= 2;
    assert.throws(() => planDeck(ratio, style), /mockup-aspect-mismatch/);
  });
  await check(`${style}: brand palette replacement propagates`, () => {
    const sample = clone();
    sample.brand.colors = { primary: '#1A242E', accent: '#AD7755', paper: '#F0F4EA', ink: '#223311', muted: '#78766A' };
    const plan = planDeck(sample, style);
    const colors = plan.slides.flatMap(s => [s.background, ...s.elements.map(e => e.color).filter(Boolean)]);
    for (const old of Object.values(input.brand.colors)) assert(!colors.includes(old), `old palette color retained ${old}`);
    assert(colors.includes(sample.brand.colors.primary));
    assert(colors.includes(sample.brand.colors.paper));
    const geometry = p => p.slides.map(s => s.elements.map(e => ({ type: e.type, x: e.x, y: e.y, w: e.w, h: e.h })));
    assert.deepEqual(geometry(plan), geometry(plans[style]));
  });
}
await check('three styles have different observable composition', () => {
  const coordinates = plan => plan.slides.map(s => s.elements.map(e => [e.type, e.x, e.y, e.w, e.h]));
  assert.notDeepEqual(coordinates(plans.editorial), coordinates(plans.stage));
  assert.notDeepEqual(coordinates(plans.editorial), coordinates(plans.evidence));
  assert.notDeepEqual(coordinates(plans.stage), coordinates(plans.evidence));
});
await check('input rejects missing case references', () => invalidManifest('ledger', l => { l.pages.find(p => p.ids).ids = ['missing-case']; }, /unknown case/));
await check('input rejects missing evidence references', () => invalidManifest('ledger', l => { l.pages.find(p => p.evidence).evidence = ['missing-evidence']; }, /unknown evidence/));
await check('input rejects missing artwork references', () => invalidManifest('ledger', l => { l.pages.find(p => p.art).art = 'missing-art'; }, /unknown artwork/));
await check('input rejects missing mockup references', () => invalidManifest('assets', a => { a.pages[0].mockup = 'mockup:missing'; }, /unknown mockup/));
await check('input rejects missing asset files', () => invalidManifest('assets', a => { a.assets['art:A'].file = '/nonexistent/auto-layout-missing.png'; }, /cannot read/));
const report = {
  generatedAt: new Date().toISOString(), command: 'node tools/auto-layout/test.mjs', fixture: request,
  scope: 'Real loadInput fixture, public plan-only API and observable layout plan. No PPT export or visual/aesthetic assessment.',
  posterException: 'kvfull poster text is permitted as an integrated bitmap; not treated as missing native text.',
  summary: { total: results.length, passed: results.filter(r => r.status === 'pass').length, failed: results.filter(r => r.status === 'fail').length }, results,
};
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
for (const failure of results.filter(r => r.status === 'fail')) console.error(`${failure.name}\n${failure.error}`);
if (report.summary.failed) process.exitCode = 1;
