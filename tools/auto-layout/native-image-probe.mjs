import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Presentation, PresentationFile} from '@oai/artifact-tool';
import {writeImage} from './export.mjs';

const output = path.resolve(process.argv[2]);
const original = JSON.parse(await fs.readFile('/private/tmp/semantic-three-actual-j9dhj9gx/editorial-r2/layout-manifest.json', 'utf8'));
const page = structuredClone(original.slides[4]);
page.elements = page.elements.filter(element => element.type === 'image');
assert.equal(page.elements.length, 2);
const repeated = {...structuredClone(page.elements[0]), id: 'occ-probe-repeat-native', occurrenceId: 'occ-probe-repeat-native', x: 900, y: 210, w: 150, h: 250};
page.elements.push(repeated);
const placements = original.placements.filter(item => page.elements.some(element => element.id === item.elementId));
placements.push({...structuredClone(placements[0]), elementId: repeated.id, occurrenceId: repeated.occurrenceId});
const manifest = {schemaVersion: 2, width: original.width, height: original.height, slides: [page], placements, imageResources: original.imageResources, semanticContent: {intents: [], obligationsByOrigin: {}}};
const presentation = Presentation.create({slideSize: {width: manifest.width, height: manifest.height}});
const slide = presentation.slides.add();
const input = {assets: manifest.imageResources};
for (const element of page.elements) {
  const bytes = await fs.readFile(input.assets[element.assetId].file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), input.assets[element.assetId].sha256);
  await writeImage(slide, element, input, element.id);
}
assert.deepEqual(slide.images.items.map(image => image.name), page.elements.map(element => element.id));
await fs.mkdir(output, {recursive: true});
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
const deck = path.join(output, 'probe.pptx');
await fs.access(deck).then(() => {throw new Error('Refusing existing probe package');}, error => {if (error.code !== 'ENOENT') throw error;});
await (await PresentationFile.exportPptx(presentation)).save(deck);
assert((await fs.stat(deck)).size <= 10 * 1024 * 1024);
console.log(JSON.stringify({slides: 1, pictures: 3, repeatedSourceOccurrences: 2, package: deck, finalizer: false, renders: 0, nativeFonts: false}));
