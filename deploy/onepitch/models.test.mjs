import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, statSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {publicProfiles, saveProfile} from './models.mjs';
import {runModel} from './model-runner.mjs';

function storage(t) {
  const dir = mkdtempSync(join(tmpdir(), 'onepitch-model-test-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  return dir;
}

test('role settings keep the key private across reload, model change and tamper', t => {
  const dir = storage(t);
  assert.equal(publicProfiles(dir).text.configured, false);
  assert.throws(() => saveProfile(dir, {role:'text', model:'test'}), /Key/);
  assert.throws(() => saveProfile(dir, {role:'../data', model:'new', key:'secret'}));
  saveProfile(dir, {role:'text', model:'test-v1', key:'example-private-token'});
  saveProfile(dir, {role:'text', model:'test-v2', key:''});
  assert.deepEqual(publicProfiles(dir).text, {model:'test-v2',configured:true});
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  for (const name of ['.master-key','text.json']) assert.equal(statSync(join(dir,name)).mode & 0o777, 0o600);
  const bytes = readFileSync(join(dir,'text.json'));
  assert.equal(bytes.includes('example-private-token'), false);
  writeFileSync(join(dir,'image.json'), bytes);
  assert.throws(() => publicProfiles(dir), /解密/);
});

test('profile CLI reads systemd directory and never returns the credential', t => {
  const dir = storage(t);
  saveProfile(dir, {role:'vision',model:'vision-example',key:'demo-vision-key'});
  const child = spawnSync(new URL('./model-runner.mjs', import.meta.url).pathname, ['--vision-model','profile'], {
    env:{...process.env, ONEPITCH_MODEL_DIR: dir},encoding:'utf8'
  });
  assert.equal(child.status, 0);
  assert.deepEqual(JSON.parse(child.stdout), {base:'https://api.openai.com/v1', model:'vision-example',host:'api.openai.com'});
});

test('each role uses its own model and fixed provider for text, image analysis, generation and referenced edits', async t => {
  const dir = storage(t);
  for (const role of ['text','image','vision']) saveProfile(dir,{role,model:role+'-example',key:role+'-key'});
  const requests = [];
  const fetchImpl = async (url, req) => {
    requests.push({url,req});
    return Response.json({model:'served-version',id:'receipt',choices:[],data:[{b64_json:'eA=='}]}, {headers:{'x-request-id':'image-receipt'}});
  };
  for (const [role, suffix, images] of [
    ['text','/chat/completions',[]],['vision','/chat/completions',[]],
    ['image','/images/generations',[]],['image','/images/edits',[{mime:'image/png',data:'eA=='}]],
  ]) {
    const mode = '--' + role + '-model';
    const profile = await runModel({dir,mode,action:'profile'});
    const body = {model:profile.model};
    if (role === 'image') Object.assign(body, {prompt:'test',n:1,output_format:'png'});
    else body.messages = [{role:'user',content:role === 'vision' ? [{type:'image_url',image_url:{url:'data:image/png;base64,eA=='}}] : 'test'}];
    const result = await runModel({dir,mode,action:'completion',input:{base:profile.base,body,images},fetchImpl});
    const {url,req} = requests.at(-1);
    assert.equal(url, profile.base + suffix);
    assert.equal(req.headers.Authorization, 'Bearer ' + role + '-key');
    assert.equal(req.redirect, 'error');
    if (images.length) assert.equal(await req.body.get('image[]').text(),'x');
    else assert.deepEqual(JSON.parse(req.body),body);
    if (role === 'image') assert.equal(result.requestId,'image-receipt');
    else assert.equal(result.model,'served-version');
  }
  const input = {base:'https://other.example',body:{model:'text-example'}};
  await assert.rejects(runModel({dir, mode:'--text-model',action:'completion',input,fetchImpl}),/变更/);
  assert.equal(requests.length,4);
  input.base = 'https://api.deepseek.com';
  await assert.rejects(runModel({dir,mode:'--text-model',action:'completion',input,
    fetchImpl: async () => new Response('untrusted secret', {status:401})}), error => error.message.includes('401') && !error.message.includes('secret'));
});
