import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('numeric content source contract executes with isolated module mocks', {timeout: 300000}, async t => {
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [
    '--experimental-test-module-mocks', '--test', '--test-isolation=none', '--test-reporter=tap',
    fileURLToPath(new URL('./content-numeric-source-probe.mjs', import.meta.url)),
  ], {env, stdio: ['ignore', 'pipe', 'pipe']});
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
  const timer = setTimeout(() => stop('Inner test exceeded 270000 ms'), 270000);
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
  const details = `${failure ?? 'Inner test result'}\nexit=${result.code} signal=${result.signal}\n${stdout}\n${stderr}`;
  assert.equal(failure, undefined, details);
  assert.equal(result.signal, null, details);
  assert.equal(result.code, 0, details);
  assert.match(stdout, /^# Subtest: Unit2A public source, manuscript and exact locations on actual numeric upstream with an explicit pure visual fixture$/m, details);
  const summary = name => stdout.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1];
  assert.ok(Number(summary('tests')) > 0, details);
  for (const name of ['fail', 'cancelled', 'skipped']) assert.equal(summary(name), '0', details);
  t.diagnostic(stdout);
});
