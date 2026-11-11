import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

test('numeric runtime component executes with bounded isolated prerequisite mocks', {timeout: 3600000}, async t => {
  const frozenPath=process.env.NUMERIC_CONTENT_FROZEN_MANIFEST;
  const verifyFrozen=async()=>{if(!frozenPath)return null;const bytes=await readFile(frozenPath),manifest=JSON.parse(bytes);for(const f of manifest.files){const actual=await readFile(resolve(manifest.root,f.path));assert.equal(createHash('sha256').update(actual).digest('hex'),f.sha256,`Frozen source changed: ${f.path}`);}return {path:frozenPath,sha256:createHash('sha256').update(bytes).digest('hex'),files:manifest.files.length};};
  const frozen=await verifyFrozen();
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [
    '--experimental-test-module-mocks', '--test', '--test-isolation=none', '--test-reporter=tap',
    fileURLToPath(new URL('./content-numeric-runtime-probe.mjs', import.meta.url)),
  ], {env, stdio: ['ignore', 'pipe', 'pipe']});
  const launch={at:new Date().toISOString(),cwd:process.cwd(),node:process.execPath,version:process.version,ownerPid:process.pid,ownerPPid:process.ppid,childPid:child.pid,argv:['--experimental-test-module-mocks','--test','--test-isolation=none','--test-reporter=tap',fileURLToPath(new URL('./content-numeric-runtime-probe.mjs',import.meta.url))],driverHash:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),probeHash:createHash('sha256').update(await readFile(new URL('./content-numeric-runtime-probe.mjs',import.meta.url))).digest('hex'),frozen};
  if(process.env.NUMERIC_CONTENT_LAUNCH_RECEIPT){
   try{
    launch.psIdentity=execFileSync('/bin/ps',['-p',String(child.pid),'-o','pid=,ppid=,lstart=,command='],{encoding:'utf8'}).trim();const [pid,ppid]=launch.psIdentity.split(/\s+/);assert.equal(Number(pid),child.pid);assert.equal(Number(ppid),process.pid);assert.ok(launch.psIdentity.endsWith(fileURLToPath(new URL('./content-numeric-runtime-probe.mjs',import.meta.url))));await writeFile(process.env.NUMERIC_CONTENT_LAUNCH_RECEIPT,JSON.stringify(launch,null,2));
   }catch(error){child.kill('SIGKILL');await new Promise(resolve=>child.once('close',resolve));throw error;}
  }

  const output = {stdout: [], stderr: []};
  let bytes = 0;
  let failure;
  const stop = reason => {
    failure ??= reason;
    child.kill('SIGKILL');
  };
  const cancel = () => stop('Outer test cancelled');
  t.signal.addEventListener('abort', cancel, {once: true});
  if (t.signal.aborted) cancel();
  const timer = setTimeout(() => stop('Inner test exceeded 3570000 ms'), 3570000);
  for (const name of ['stdout', 'stderr']) child[name].on('data', chunk => {
    bytes += chunk.length;
    if (bytes > 2 * 1024 * 1024) stop('Inner test output exceeded 2 MiB');
    else output[name].push(chunk);
  });
  child.on('error', error => {failure ??= error.message;});
  let result;
  try {
    result = await new Promise(resolve => child.once('close', (code, signal) => resolve({code, signal})));
  } finally {
    clearTimeout(timer);
    t.signal.removeEventListener('abort', cancel);
  }
  const stdout = Buffer.concat(output.stdout).toString('utf8');
  const stderr = Buffer.concat(output.stderr).toString('utf8');
  if(process.env.NUMERIC_CONTENT_LAUNCH_RECEIPT)await writeFile(process.env.NUMERIC_CONTENT_LAUNCH_RECEIPT,JSON.stringify({...launch,finishedAt:new Date().toISOString(),result,failure:failure??null,frozenAfter:await verifyFrozen()},null,2));
  else await verifyFrozen();
  const details = `${failure ?? 'Inner test result'}\nexit=${result.code} signal=${result.signal}\n${stdout}\n${stderr}`;
  assert.equal(failure, undefined, details);
  assert.equal(result.signal, null, details);
  assert.equal(result.code, 0, details);
  assert.match(stdout, /^# Subtest: Unit2B actual numeric runtime component dispatch, originals, owners and three semantic plans$/m, details);
  const summary = name => stdout.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1];
  assert.ok(Number(summary('tests')) > 0, details);
  for (const name of ['fail', 'cancelled', 'skipped']) assert.equal(summary(name), '0', details);
  t.diagnostic(stdout);
});
