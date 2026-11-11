import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {loadInput} from './input.mjs';
import {planDeck} from './layout.mjs';

const fixture={ledger:resolve('output/ppt/m6-integrated-v5/content-ledger.json'),brand:resolve('output/auto-layout/inputs/brand.json'),assets:resolve('output/auto-layout/inputs/assets.json')};
test('layout-only proposal needs no invented audience evidence; dangling citations still fail',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'layout-scope-'));
  try {
    const ledger=JSON.parse(await readFile(fixture.ledger,'utf8'));
    const cited=ledger.pages.find(p=>p.evidence?.length);
    ledger.audience.findings=[];
    ledger.pages=ledger.pages.filter(p=>!p.evidence?.length);
    const file=join(dir,'ledger.json');
    await writeFile(file,JSON.stringify(ledger));
    const input=await loadInput({...fixture,ledger:file});
    assert.equal(input.audience.findings.length,0);
    assert.ok(planDeck(input,'editorial').slides.length);
    ledger.pages.push(cited);
    await writeFile(file,JSON.stringify(ledger));
    await assert.rejects(loadInput({...fixture,ledger:file}),/unknown evidence/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('art attribution follows each source rather than assuming every image is generated',async()=>{
  const input=await loadInput(fixture);
  const page=input.semantic.intents.find(p=>p.kind==='kvfull'&&p.direction==='A');
  assert(page);
  input.semantic={...input.semantic,intents:[page]};
  input.assets['art:A'].source={type:'user-provided-reference',description:'用户提供的原方案作品，第42页',url:'local-source.pdf#page=42'};
  let notes=planDeck(input,'editorial').slides[0].notes;
  assert.match(notes,/用户提供的原方案作品/);
  assert.match(notes,/local-source.pdf#page=42/);
  assert.doesNotMatch(notes,/AI辅助概念稿/);
  input.assets['art:A'].source={type:'ai-assisted-concept',description:'AI辅助概念稿，非官方投放'};
  notes=planDeck(input,'editorial').slides[0].notes;
  assert.match(notes,/AI辅助概念稿/);
});
