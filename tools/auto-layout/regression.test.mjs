import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {loadInput} from './input.mjs';
import {planDeck} from './layout.mjs';
import {createServer} from './server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = {
  ledger: resolve(root, 'output/ppt/m6-integrated-v5/content-ledger.json'),
  brand: resolve(root, 'output/auto-layout/inputs/brand.json'),
  assets: resolve(root, 'output/auto-layout/inputs/assets.json'),
};
const results = [];
async function check(name, run) {
  try { results.push({name, status: 'pass', detail: await run()}); }
  catch (error) { results.push({name, status: 'fail', error: error.stack}); }
}
const input = await loadInput(fixture);
const server = createServer();
const handler = server.listeners('request')[0];
async function request(method, url, payload) {
  const req = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]);
  Object.assign(req, {method, url, socket: {localPort: 4180}, headers: {
    host: '127.0.0.1:4180', origin: 'http://127.0.0.1:4180', 'content-type': 'application/json',
  }});
  let status, body;
  const res = {
    headersSent: false,
    setHeader() {},
    writeHead(code) { status = code; this.headersSent = true; },
    end(value) { body = JSON.parse(value); },
  };
  await handler(req, res);
  return {status, body};
}

for (const style of ['editorial', 'stage', 'evidence']) {
  await check(`${style}: changed brand appears in rendered text`, () => {
    const edited = structuredClone(input);
    edited.brand.name = '回归测试品牌';
    const plan = planDeck(edited, style);
    for (const page of edited.pages.filter(page => page.kind !== 'kvfull')) {
      const slides = plan.slides.filter(slide => slide.originId === page.id);
      assert(slides.length > 0);
      for (const slide of slides) assert(slide.elements.some(element => element.type === 'text' && element.text.replaceAll('\n', '').includes(edited.brand.name)), page.id);
    }
    return {brand: edited.brand.name, slides: plan.slides.length};
  });
  await check(`${style}: reordered art stays with its comparison item`, () => {
    const edited = structuredClone(input);
    const page = edited.pages.find(page => page.kind === 'visualcomparison');
    assert(page);
    const order = [2, 0, 1];
    const originalArts = [...page.arts];
    const originalItems = structuredClone(page.items);
    page.arts = order.map(i => originalArts[i]);
    page.items = order.map(i => originalItems[i]);
    const expected = page.arts.map(ref => Object.entries(edited.assets).find(([id, asset]) => id.startsWith('art:') && (id === ref || asset.ledgerFile === ref))[0]);
    edited.pages = [page];
    const slide = planDeck(edited, style).slides[0];
    const images = slide.elements.filter(element => element.type === 'image').sort((a, b) => a.x - b.x);
    assert.deepEqual(images.map(image => image.assetId), expected);
    for (const [i, row] of page.items.entries()) for (const value of row) {
      const text = slide.elements.find(element => element.type === 'text' && element.sourceText === value);
      assert(text, value);
      assert(Math.abs((text.x + text.w / 2) - (images[i].x + images[i].w / 2)) < 1, value);
    }
    return {assetOrder: expected};
  });
  await check(`${style}: three circles have a common interior point`, () => {
    const plan = planDeck(input, style);
    const slides = plan.slides.filter(slide => slide.template.endsWith('.circles'));
    assert(slides.length > 0);
    const witnesses = [];
    for (const slide of slides) {
      const circles = slide.elements.filter(element => element.type === 'ellipse');
      assert.equal(circles.length, 3);
      let witness;
      for (let y = 0; y <= plan.height && !witness; y += 2) for (let x = 0; x <= plan.width; x += 2) {
        if (circles.every(c => ((x - c.x - c.w / 2) / (c.w / 2)) ** 2 + ((y - c.y - c.h / 2) / (c.h / 2)) ** 2 < 0.95)) {
          witness = {x, y};
          break;
        }
      }
      assert(witness, `${slide.id} has no shared interior`);
      witnesses.push({page: slide.id, witness});
    }
    return witnesses;
  });
}
await check('server rejects integrated-poster title and section edits', async () => {
  const response = await request('GET', '/api/sample');
  assert.equal(response.status, 200);
  const sample = response.body;
  const index = sample.ledger.pages.findIndex(page => page.kind === 'kvfull');
  assert(index >= 0);
  for (const field of ['title', 'section']) {
    const payload = {...structuredClone(sample), style: 'editorial'};
    payload.ledger.pages[index][field] = '不应被静默忽略的编辑';
    const rejected = await request('POST', '/api/build', payload);
    assert.equal(rejected.status, 400, field);
    assert.match(rejected.body.error, /海报/);
  }
  const job = await request('GET', '/api/job');
  assert.equal(job.body.status, 'idle');
  return {transport: 'real createServer request handler, no listening port', status: 400};
});
await check('public input rejects a fourth item column', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auto-layout-regression-'));
  try {
    const ledger = JSON.parse(await readFile(fixture.ledger, 'utf8'));
    ledger.pages.find(page => page.kind === 'brief').items[0].push('第四列不可丢失');
    const file = join(dir, 'ledger.json');
    await writeFile(file, JSON.stringify(ledger));
    await assert.rejects(() => loadInput({...fixture, ledger: file}), /exactly three fields/);
    return {rejectedColumns: 4};
  } finally { await rm(dir, {recursive: true, force: true}); }
});
const report = {
  generatedAt: new Date().toISOString(), command: 'node tools/auto-layout/regression.test.mjs',
  scope: 'Four P2 repairs and common three-circle intersection. Actual public input, actual layout plans, and real server request handler. No PPT export or browser validation.',
  principles: ['Test Behavior, Not Implementation', 'Prove It Works'],
  summary: {total: results.length, passed: results.filter(result => result.status === 'pass').length, failed: results.filter(result => result.status === 'fail').length},
  results,
};
await writeFile(resolve(root, 'output/auto-layout/checks/regression-review.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
for (const result of results.filter(result => result.status === 'fail')) console.error(result.name, result.error);
if (report.summary.failed) process.exitCode = 1;
