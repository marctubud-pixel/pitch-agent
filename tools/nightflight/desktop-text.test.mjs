import assert from 'node:assert/strict';
import {chmod, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createStageRunner} from './codex-runner.mjs';
import {desktopTextProvider} from './desktop-text.mjs';

test('API stages use configured providers without a Codex installation and record the answering models', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'onepitch-models-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  const executable = join(dir, 'fixture.mjs');
  await writeFile(executable, `#!/usr/bin/env node
const [mode, action] = process.argv.slice(2);
const vision = mode === '--vision-model';
const model = vision ? 'vision-model' : 'text-model';
if (action === 'profile') {
  console.log(JSON.stringify({host:'fixture.test',base:'https://fixture.test',model}));
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const {body} = JSON.parse(Buffer.concat(chunks).toString());
  const content = body.messages[1].content;
  if (vision !== Array.isArray(content) || body.model !== model) process.exit(2);
  if (vision && !content[1].image_url.url.startsWith('data:image/png;base64,')) process.exit(3);
  console.log(JSON.stringify({id:'request-'+model,model:'actual-'+model,
    choices:[{message:{content:JSON.stringify({body:'测试任务卡'})}}]}));
}`);
  await chmod(executable, 0o700);
  const events = [];
  const onEvent = line => events.push(line);
  const original = process.env.ONEPITCH_TEXT_EXECUTABLE;
  process.env.ONEPITCH_TEXT_EXECUTABLE = executable;
  t.after(() => {
    if (original === undefined) delete process.env.ONEPITCH_TEXT_EXECUTABLE;
    else process.env.ONEPITCH_TEXT_EXECUTABLE = original;
  });
  const run = createStageRunner({binary:join(dir,'no-codex'),codexHome:join(dir,'no-home')});
  const brief = await run({stage:'brief',project:{brief:'测试',title:'测试'},dir,onEvent});
  assert.equal((await readFile(join(dir,brief.artifacts[0].name),'utf8')).trim(),'测试任务卡');
  const path = join(dir,'fixture.png');
  await writeFile(path, 'fixture image bytes');
  const provider = await desktopTextProvider(executable,undefined,onEvent);
  const review = await provider.execute({runId:'review',prompt:'盲看',images:[{path,mediaType:'image/png'}],outputSchema:{}});
  assert.equal(review.model,'actual-vision-model');
  assert.ok(events.some(x=>x.includes('文字 API 回执') && x.includes('actual-text-model') && x.includes('request-text-model')));
  assert.ok(events.some(x=>x.includes('视觉理解 API 回执') && x.includes('actual-vision-model') && x.includes('request-vision-model')));
});
