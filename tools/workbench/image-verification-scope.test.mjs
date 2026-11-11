import test from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {fixture, withScope} from './image-verification-http-fixture.mjs';

// Observe actual IO and actual strict decoder children; never fabricate results.
let decodes = 0, sourceReads = 0, originalReads = 0, holdNext;
const spawn = cp.spawn, open = fs.open;
cp.spawn = function (...args) {
  const child = spawn.apply(this, args);
  if (String(args[1]?.[0]).endsWith('/model-http-image-check.mjs')) {
    decodes++;
    if (holdNext) {
      const held = holdNext; holdNext = undefined;
      const end = child.stdin.end.bind(child.stdin);
      child.stdin.end = (bytes, ...rest) => { held(() => end(bytes, ...rest)); return child.stdin; };
    }
  }
  return child;
};
fs.open = function (path, ...rest) {
  if (/\/portable-image-original-[^/]+\/input-\d+$/.test(String(path))) sourceReads++;
  if (/\/portable-image-original-[^/]+\/originals\/[^/]+\/image-\d+\.(png|jpg)$/.test(String(path))) originalReads++;
  return open.call(this, path, ...rest);
};
syncBuiltinESMExports();
const reset = () => { decodes = sourceReads = originalReads = 0; };
const bad = f => ({...f.args, savedExecution: {...f.args.savedExecution, protocol: 'unknown'}});
const verified = async f => assert.equal((await f.reopen()).kind, 'verified');
const invalid = operation => assert.rejects(operation, {code: 'original-invalid'});

test('same scope reuses two real decodes while every occurrence rereads source and persisted image', async t => {
  const f = await fixture(t); reset();
  await withScope(async () => { await verified(f); await verified(f); });
  assert.deepEqual({decodes, sourceReads, originalReads}, {decodes: 2, sourceReads: 6, originalReads: 6});
});

test('separate operations, concurrent scopes and detached closed continuations cannot share decodes', async t => {
  const f = await fixture(t); reset();
  await withScope(() => verified(f)); await withScope(() => verified(f));
  assert.equal(decodes, 4);
  reset(); await Promise.all([withScope(() => verified(f)), withScope(() => verified(f))]);
  assert.deepEqual({decodes, sourceReads, originalReads}, {decodes: 4, sourceReads: 6, originalReads: 6});
  let release, pending; const gate = new Promise(r => release = r); reset();
  await withScope(async () => {
    await verified(f);
    pending = gate.then(async () => { await verified(f); await verified(f); });
  });
  release(); await pending;
  assert.equal(decodes, 8, 'closed scope forces all three occurrences to decode on each late read');
});

test('warm decodes cannot bypass late source, hash, MIME, binding or persisted-original rejection', async t => {
  const f = await fixture(t);
  for (const mutate of [
    c => { c.images[0].sha256 = '0'.repeat(64); },
    c => { c.images[0].mediaType = 'image/jpeg'; },
    c => { c.binding.model += '-changed'; },
  ]) await withScope(async () => {
    await verified(f); const changed = structuredClone(f.args); mutate(changed);
    await invalid(() => f.owner.reopen(changed)); await verified(f);
  });
  const source = f.args.images[0].path, bytes = await fs.readFile(source);
  await withScope(async () => {
    await verified(f);
    try { await fs.writeFile(source, Buffer.concat([bytes, Buffer.from('changed')])); await invalid(f.reopen); }
    finally { await fs.writeFile(source, bytes); }
    await verified(f);
  });
  const path = `${f.root}/originals/${f.args.savedExecution.original.rootRelativePath}/image-0.png`;
  const original = await fs.readFile(path);
  await withScope(async () => {
    await verified(f);
    try { await fs.chmod(path, 0o600); await fs.writeFile(path, Buffer.concat([original, Buffer.from('changed')])); await invalid(f.reopen); }
    finally { await fs.writeFile(path, original); }
    await verified(f);
  });
});

for (const event of ['invoke', 'reopen rejection', 'callback rejection']) {
  test(`nested ${event} revokes ancestor successes`, async t => {
    const f = await fixture(t); reset();
    await withScope(async () => {
      await verified(f);
      if (event === 'callback rejection') await assert.rejects(() => withScope(async () => { throw Error('callback rejected'); }));
      else await withScope(async () => {
        if (event === 'invoke') assert.equal((await f.owner.invoke(f.args)).kind, 'refused');
        else await invalid(() => f.owner.reopen(bad(f)));
      });
      await verified(f); await verified(f);
    });
    assert.equal(decodes, event === 'invoke' ? 8 : 4);
    assert.equal(sourceReads, 9); assert.equal(originalReads, 9);
  });
}

for (const event of ['invoke', 'reject']) {
  test(`nested ${event} clears ancestors without clearing concurrent sibling's own cache`, async t => {
    const f = await fixture(t); reset();
    let warm, done; const warmed = new Promise(r => warm = r), finished = new Promise(r => done = r);
    await withScope(async () => {
      await verified(f);
      await Promise.all([
        withScope(async () => {
          await warmed;
          try {
            if (event === 'invoke') assert.equal((await f.owner.invoke(f.args)).kind, 'refused');
            else await invalid(() => f.owner.reopen(bad(f)));
          } finally { done(); }
        }),
        withScope(async () => { await verified(f); warm(); await finished; await verified(f); }),
      ]);
      await verified(f); await verified(f);
    });
    assert.equal(decodes, event === 'invoke' ? 10 : 6);
    assert.equal(sourceReads, 15); assert.equal(originalReads, 15);
  });
}

test('pending decode from before nested rejection cannot refill an invalidated ancestor', async t => {
  const f = await fixture(t, 2); reset();
  await withScope(async () => {
    let resume; const held = new Promise(r => { holdNext = release => { resume = release; r(); }; });
    const running = f.reopen(); await held;
    try { await withScope(() => invalid(() => f.owner.reopen(bad(f)))); }
    finally { resume(); }
    assert.equal((await running).kind, 'verified');
    await verified(f);
  });
  assert.deepEqual({decodes, sourceReads, originalReads}, {decodes: 3, sourceReads: 4, originalReads: 4});
});
