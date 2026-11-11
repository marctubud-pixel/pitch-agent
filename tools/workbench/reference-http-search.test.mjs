import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, readdir, rm, stat, symlink, realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {searchPublicReferences} from './reference-http-search.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtures = new URL('./fixtures/reference-http-search/', import.meta.url);
const literal = (href = 'https://design.example.org/work', title = 'Actual title') => `<a rel="nofollow" class='result-link' href="${href}">${title}</a>`;
const publicDns = async () => [{address: '93.184.216.34', family: 4}];

async function harness(t, {body = literal(), status = 200, headers = {'content-type': 'text/html; charset=utf-8'}, lookup = publicDns, transport, limits, query = 'packaging design'} = {}) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'reference-search-test-')));
  t.after(() => rm(root, {recursive: true, force: true}));
  const calls = [];
  const result = await searchPublicReferences({query, storeRoot: root, limits}, {lookup, transport: transport ?? (async request => {
    calls.push(request);
    return {status, headers, body: Buffer.isBuffer(body) ? body : Buffer.from(body)};
  })});
  const stored = await readFile(result.attemptRecord.path);
  assert.equal(sha(stored), result.attemptRecord.sha256);
  assert.deepEqual(JSON.parse(stored), result.receipt);
  assert.equal((await stat(result.attemptRecord.path)).mode & 0o222, 0);
  assert.equal((await readdir(path.join(root, 'search-attempts'))).length, 1);
  assert.equal(result.receipt.type, 'SearchDiscoveryReceipt');
  assert.equal(result.receipt.schemaVersion, 2);
  assert.equal(result.receipt.discoveryOnly, true);
  return {...result, root, calls};
}

test('two authentic captured query fixtures retain exact raw hashes and source anchors offline', async t => {
  const ids = [];
  for (const name of ['baijiu', 'minimal']) {
    const metadata = JSON.parse(await readFile(new URL(`${name}.json`, fixtures)));
    const bytes = await readFile(new URL(`${name}.html`, fixtures));
    assert.equal(sha(bytes), metadata.rawSha256);
    const {receipt, calls, root} = await harness(t, {body: bytes, query: metadata.query});
    assert.equal(receipt.outcome, 'available');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.href, metadata.queryUrl);
    assert.equal(calls[0].maxBytes, 1048576);
    assert.equal(receipt.capture.raw.sha256, metadata.rawSha256);
    assert.equal(receipt.results[0].url, metadata.firstUrl);
    assert.equal(receipt.capture.responseOrigin, 'https://lite.duckduckgo.com');
    assert.equal(receipt.results.length, 10);
    assert.ok(receipt.results.every(x => x.destinationVerification === 'not_captured'));
    assert.deepEqual(receipt.results.map(x => x.naturalRank), [1,2,3,4,5,6,7,8,9,10]);
    const html = bytes.toString('utf8');
    for (const result of receipt.results) {
      const source = result.source;
      assert.equal(html.slice(source.start, source.end), source.quote);
      assert.ok(source.quote.includes("class='result-link'"));
      assert.equal(source.rawSha256, sha(bytes));
      assert.equal(source.captureRecordSha256, receipt.capture.recordSha256);
      assert.equal(result.id, `ref_${sha(result.url)}`);
    }
    const recordBytes = await readFile(receipt.capture.recordPath);
    assert.equal(sha(recordBytes), receipt.capture.recordSha256);
    assert.equal(sha(await readFile(path.join(root, receipt.capture.raw.file))), metadata.rawSha256);
    ids.push(receipt.attemptId);
  }
  assert.notEqual(ids[0], ids[1]);
});

test('UTF16 offsets, entities, deduplication, natural rank and result cap', async t => {
  const body = `😀 text<!--${literal('https://ignore.example.org')}--><script>"${literal('https://script.example.org')}"</script><nav><a href="https://nav.example.org">Nav</a></nav>` + literal('//duckduckgo.com/l/?uddg=https%3A%2F%2Fdesign.example.org%2Fwork&amp;rut=abc', 'A &amp; <b>B</b> &#x1f600;') + literal() + literal('https://other.example.org/work');
  const {receipt} = await harness(t, {body, limits: {maxResults: 1}});
  assert.equal(receipt.outcome, 'available');
  assert.equal(receipt.results.length, 1);
  assert.equal(receipt.results[0].title, 'A & B 😀');
  assert.equal(receipt.results[0].naturalRank, 1);
  assert.equal(receipt.results[0].source.start, body.indexOf('<a rel="nofollow"', body.indexOf('</nav>')));
  assert.equal(body.slice(receipt.results[0].source.start, receipt.results[0].source.end), receipt.results[0].source.quote);
  const second = await harness(t, {body});
  assert.deepEqual(second.receipt.results.map(x => x.naturalRank), [1,3]);
  assert.equal(receipt.results[0].id, second.receipt.results[0].id);
});

test('non-result links and suppressed HTML never supply discovery leads', async t => {
  for (const body of [
    '<a href="https://design.example.org">navigation</a>',
    `<!--${literal()}-->`,
    `<script>const s = '${literal()}';</script>`,
    `<style>${literal()}</style>`,
    `<template>${literal()}</template>`,
    `<textarea>${literal()}</textarea>`,
    `<title>${literal()}</title>`,
    `<nav>${literal()}</nav>`,
    `<svg>${literal()}</svg>`,
    '<a class="not-result-link" href="https://design.example.org">look alike</a>',
  ]) {
    const {receipt} = await harness(t, {body});
    assert.equal(receipt.outcome, 'unavailable');
    assert.equal(receipt.reason.code, 'NO_LITERAL_RESULTS');
    assert.deepEqual(receipt.results, []);
  }
});

test('challenge, malformed nested anchors and XML entities fail closed', async t => {
  for (const [body, code] of [
    [`${literal()}<form id="challenge-form"></form>`, 'CHALLENGE'],
    [`${literal()}<script src="/anomaly.js"></script>`, 'CHALLENGE'],
    [`<a class="result-link" href="https://design.example.org">bad${literal()}</a>`, 'MALFORMED_HTML'],
    ['<a class="result-link" href="https://design.example.org"><span>bad</a>', 'MALFORMED_HTML'],
    ['<a class="result-link" href="https://design.example.org">unclosed', 'MALFORMED_HTML'],
    ['<a class="result-link" href="https://design.example.org" href="https://evil.example.org">bad</a>', 'MALFORMED_HTML'],
    [`<a class="result-link" href="https://design.example.org"><script>${literal()}</script></a>`, 'MALFORMED_HTML'],
    [`<!DOCTYPE html [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${literal()}`, 'MALFORMED_HTML'],
    [`<!-- no close ${literal()}`, 'MALFORMED_HTML'],

    [literal('https://design.example.org', '&#0;'), 'MALFORMED_HTML'],
    [literal('https://design.example.org', ''), 'MALFORMED_HTML'],
  ]) {
    const {receipt} = await harness(t, {body});
    assert.equal(receipt.outcome, 'unavailable', body);
    assert.equal(receipt.reason.code, code);
    assert.deepEqual(receipt.results, []);
    assert.ok(receipt.capture.raw.sha256);
  }
});

test('unsafe URL leads are excluded without DNS checks or page capture', async t => {
  const unsafe = ['http://design.example.org/', 'https://user:password@design.example.org/', 'https://design.example.org:8443/', 'https://localhost/', 'https://localhost./', 'https://a.local./', 'https://.../', 'https://router.home.arpa/', 'https://a.local/', 'https://127.0.0.1/', 'https://2130706433/', 'https://0x7f000001/', 'https://[::1]/', 'https://192.168.1.1/', 'https://[::ffff:127.0.0.1]/', 'javascript:alert(1)', '//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fl%2F%3Fuddg%3Dhttps%253A%252F%252Fdesign.example.org', '//duckduckgo.com/l/?uddg=https%3A%2F%2Fdesign.example.org&uddg=https%3A%2F%2Fevil.example.org', '//duckduckgo.com/l/?uddg=https%253A%252F%252Fdesign.example.org', 'https://duckduckgo.com/?q=nav', 'https://design.example.org/&#10;bad'];
  const lookups = [];
  const {receipt, calls} = await harness(t, {body: unsafe.map(url => literal(url)).join('') + literal(), lookup: async host => {lookups.push(host); return publicDns();}});
  assert.equal(receipt.outcome, 'available');
  assert.equal(receipt.results.length, 1);
  assert.equal(receipt.results[0].naturalRank, unsafe.length + 1);
  assert.equal(receipt.rejected.length, unsafe.length);
  assert.deepEqual(lookups, ['lite.duckduckgo.com']);
  assert.equal(calls.length, 1);
});

test('HTTP failures retain captured bytes while refusing results', async t => {
  for (const [options, code] of [
    [{status: 404}, 'HTTP_STATUS'],
    [{status: 429}, 'HTTP_STATUS'],
    [{headers: {'content-type': 'application/json'}}, 'NON_HTML'],
    [{headers: {'content-type': 'application/xhtml+xml'}}, 'NON_HTML'],
    [{headers: {'content-type': 'text/html; charset=windows-1252'}}, 'UNSUPPORTED_ENCODING'],
    [{body: Buffer.from([0xff, 0xfe])}, 'MALFORMED_HTML'],
  ]) {
    const {receipt} = await harness(t, options);
    assert.equal(receipt.outcome, 'unavailable');
    assert.equal(receipt.reason.code, code);
    assert.ok(receipt.capture);
  }
});

test('capture safeguards, oversize and deadline do not retry', async t => {
  for (const options of [
    {body: 'x'.repeat(1025), limits: {maxBytes: 1024}},
    {status: 302, headers: {'content-type': 'text/html', location: 'https://evil.example.org'}},
    {lookup: async () => [{address: '127.0.0.1', family: 4}]},
    {transport: async () => {throw Object.assign(new Error('DNS failed https://user:pass@example.org password=secret'), {code: 'ENOTFOUND'});}},
    {limits: {timeoutMs: 10}, transport: async () => new Promise(resolve => setTimeout(() => resolve({status: 200, headers: {'content-type': 'text/html'}, body: Buffer.from(literal())}), 30))},
    {headers: {'content-type': 'text/html', 'content-encoding': 'gzip'}},
  ]) {
    const {receipt, calls} = await harness(t, options);
    assert.equal(receipt.outcome, 'unavailable');
    assert.equal(receipt.reason.code, 'CAPTURE_FAILED');
    assert.equal(receipt.capture, null);
    assert.ok(calls.length <= 1);
    assert.ok(!receipt.reason.error.message.includes('user:pass'));
    assert.ok(!receipt.reason.error.message.includes('secret'));
  }
});

test('bounded invalid inputs create failure attempts without a network dispatch', async t => {
  for (const options of [{query: ''}, {query: ' padded '}, {query: 'a\nb'}, {query: 'x'.repeat(257)}, {query: '\ud800'}, {limits: {maxResults: 11}}, {limits: {maxBytes: 1048577}}, {limits: {timeoutMs: 10001}}, {limits: {maxRedirects: 1}}, {limits: {maxResults: 0}}]) {
    const {receipt, calls} = await harness(t, options);
    assert.equal(receipt.outcome, 'unavailable');
    assert.equal(receipt.reason.code, 'INVALID_INPUT');
    assert.equal(calls.length, 0);
    assert.equal(receipt.capture, null);
  }
});

test('every invocation has a separate atomic attempt even for an identical query', async t => {
  const {root, receipt} = await harness(t);
  const again = await searchPublicReferences({query: receipt.query, storeRoot: root}, {lookup: publicDns, transport: async () => ({status: 200, headers: {'content-type': 'text/html'}, body: Buffer.from(literal())})});
  assert.notEqual(again.receipt.attemptId, receipt.attemptId);
  assert.equal(again.receipt.results[0].id, receipt.results[0].id);
  assert.equal((await readdir(path.join(root, 'search-attempts'))).length, 2);
});

test('symlink stores are refused before network access', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reference-search-path-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const target = path.join(directory, 'target');
  const alias = path.join(directory, 'alias');
  const {mkdir} = await import('node:fs/promises');
  await mkdir(target);
  await symlink(target, alias);
  await assert.rejects(searchPublicReferences({query: 'design', storeRoot: alias}), /symlink/);
});


test('oversized literal anchors and excessive result counts fail closed', async t => {
  for (const body of [literal('https://design.example.org', 'x'.repeat(1025)), literal('https://design.example.org/' + 'x'.repeat(9000)), Array.from({length: 51}, (_, index) => literal(`https://design.example.org/${index}`)).join('')]) {
    const {receipt} = await harness(t, {body});
    assert.equal(receipt.outcome, 'unavailable');
    assert.ok(['MALFORMED_HTML', 'RESULT_LIMIT'].includes(receipt.reason.code));
    assert.deepEqual(receipt.results, []);
  }
});
