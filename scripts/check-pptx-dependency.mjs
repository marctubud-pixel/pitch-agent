import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const app = resolve(process.argv[2] ?? 'apps/workbench-preview');
const require = createRequire(resolve(app, 'package.json'));
const pptxRequire = createRequire(require.resolve('pptxgenjs'));
const {imageSize} = pptxRequire('image-size');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=', 'base64');
assert.deepEqual(imageSize(png), {height: 1, width: 1, type: 'png'});

// Exercise the advisory payload in a separate process so regressions fail with a timeout.
const probe = spawnSync(process.execPath, ['-e', `
  const {createRequire} = require('node:module');
  const load = createRequire(${JSON.stringify(resolve(app, 'package.json'))});
  const pptxLoad = createRequire(load.resolve('pptxgenjs'));
  const module = pptxLoad('image-size');
  const size = typeof module === 'function' ? module : module.imageSize;
  const bytes = Buffer.alloc(16);
  bytes.write('icns'); bytes.writeUInt32BE(16, 4);
  bytes.write('junk', 8); bytes.writeUInt32BE(0, 12);
  try { size(bytes); process.exitCode = 2; }
  catch { process.stdout.write('rejected'); }
`], {timeout: 3000, encoding: 'utf8'});
assert.equal(probe.error, undefined, `Malformed ICNS parser did not terminate: ${probe.error?.code}`);
assert.equal(probe.status, 0, probe.stderr);
assert.equal(probe.stdout, 'rejected');

const PptxGenJS = require('pptxgenjs');
const {unzipSync, strFromU8} = require('fflate');
const deck = new PptxGenJS();
const slide = deck.addSlide();
slide.addText('图片解析修复回归', {x: 1, y: 1, w: 5, h: 1});
slide.addImage({data: 'image/png;base64,' + png.toString('base64'), x: 1, y: 2, w: 1, h: 1});
const bytes = await deck.write({outputType: 'nodebuffer'});
const zip = unzipSync(new Uint8Array(bytes));
assert.match(strFromU8(zip['ppt/slides/slide1.xml']), /图片解析修复回归/);
const media = Object.entries(zip).filter(([path]) => /^ppt\/media\/.+\.png$/.test(path));
assert.equal(media.length, 1);
assert.deepEqual(Buffer.from(media[0][1]), png);
process.stdout.write(JSON.stringify({result: 'PASS', app, malformedIcns: 'rejected', png: '1x1', nativePptxImageBytes: 'preserved'}) + '\n');
