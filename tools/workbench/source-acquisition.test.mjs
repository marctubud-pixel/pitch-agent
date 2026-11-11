import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { capturePublicSource, extractHtml, isPublicAddress } from './source-acquisition.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
const now = () => new Date('2026-10-25T08:00:00.000Z');
const response = (body, mime = 'text/html', status = 200, headers = {}) => ({ status, headers: { 'content-type': mime, ...headers }, body: Buffer.from(body) });
const setup = async () => ({ storeRoot: await mkdtemp(path.join(os.tmpdir(), 'source-acquisition-')), url: 'https://example.com/case' });

test('actual byte receipt freezes URL chain, hashes, text and image correspondence without semantic approval', async () => {
  const options = await setup();
  const html = '<html><title>A &amp; B</title><body><script>bad()</script><style>.hidden{}</style><h1>Brand</h1><figure><img src="/pack.jpg" alt="Bottle &quot;A&quot;"><figcaption>Designer caption</figcaption></figure><p>Case &#x4e00;</p></body></html>';
  const seen = [];
  const transport = async request => { seen.push(request); return seen.length === 1 ? response('', 'text/html', 302, { location: '/final' }) : response(html); };
  const result = await capturePublicSource(options, { lookup, transport, now });
  const { record } = result;
  assert.equal(record.requestedUrl, options.url);
  assert.equal(record.finalUrl, 'https://example.com/final');
  assert.equal(record.redirects.length, 1);
  assert.equal(record.retrievedAt, now().toISOString());
  assert.equal(record.httpStatus, 200);
  assert.equal(record.mimeType, 'text/html');
  assert.equal(record.raw.sha256, sha(Buffer.from(html)));
  assert.deepEqual(await readFile(path.join(options.storeRoot, record.raw.file)), Buffer.from(html));
  assert.equal(sha(await readFile(result.recordPath)), result.recordHash);
  assert.equal(record.extraction.title, 'A & B');
  assert.match(record.extraction.text, /Case 一/);
  assert.doesNotMatch(record.extraction.text, /bad\(\)|hidden/);
  assert.equal(record.extraction.textHash, sha(record.extraction.text));
  assert.equal(record.extraction.images[0].url, 'https://example.com/pack.jpg');
  assert.equal(record.extraction.images[0].alt, 'Bottle "A"');
  assert.equal(record.extraction.images[0].caption, 'Designer caption');
  const locator = record.extraction.images[0].locator;
  assert.match(html.slice(locator.start, locator.end), /^<img/);
  assert.ok(seen.every(item => item.address === '93.184.216.34' && item.family === 4));
  for (const field of ['verification', 'identity', 'scopeRelation', 'verified']) assert.equal(Object.hasOwn(record, field), false);
  const second = await capturePublicSource(options, { lookup, transport: async () => response('', 'text/html', 302, { location: '/final' }), now }).catch(error => error);
  assert.match(second.message, /Redirect limit/);
});

test('identical receipts converge to the same immutable record and stale bytes are rejected', async () => {
  const options = await setup();
  const deps = { lookup, now, transport: async () => response('<p>case</p>') };
  const first = await capturePublicSource(options, deps);
  const second = await capturePublicSource(options, deps);
  assert.equal(first.recordPath, second.recordPath);
  await chmod(path.join(options.storeRoot, first.record.raw.file), 0o644);
  await writeFile(path.join(options.storeRoot, first.record.raw.file), 'stale');
  await assert.rejects(capturePublicSource(options, deps), /Immutable capture collision/);
});

test('PDF is raw-only unless a real extractor callback runs and identifies output', async () => {
  const options = await setup();
  const body = '%PDF-1.7\nbytes';
  const deps = { lookup, now, transport: async () => response(body, 'application/pdf') };
  const first = await capturePublicSource(options, deps);
  assert.equal(first.record.extraction.method, 'none');
  assert.equal(first.record.extraction.text, '');
  let input;
  const second = await capturePublicSource(options, { ...deps, pdfExtractor: async bytes => { input = bytes; return { method: 'test-real-callback', text: 'Page 1 content', locators: [{ page: 1 }] }; } });
  assert.equal(input.toString(), body);
  assert.equal(second.record.extraction.text, 'Page 1 content');
  assert.equal(second.record.extraction.method, 'test-real-callback');
  await assert.rejects(capturePublicSource(options, { ...deps, pdfExtractor: async () => ({ text: 'unsourced' }) }), /must identify/);
});

test('image payload remains raw capture without pixel or identity claims', async () => {
  const result = await capturePublicSource(await setup(), { lookup, now, transport: async () => response('pixels', 'image/png') });
  assert.equal(result.record.extraction.method, 'none');
  assert.equal(result.record.extraction.text, '');
});

test('credentials, insecure protocols, local/private/special IPs, ports and disguised addresses never reach transport', async () => {
  const options = await setup();
  let called = false;
  for (const url of ['file:///etc/passwd', 'http://example.com', 'https://user:pass@example.com', 'https://localhost/a', 'https://127.0.0.1', 'https://2130706433', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://10.0.0.1', 'https://example.com:8443']) {
    await assert.rejects(capturePublicSource({ ...options, url }, { lookup, transport: async () => { called = true; return response(''); } }));
  }
  assert.equal(called, false);
  for (const ip of ['0.0.0.0', '100.64.1.1', '169.254.1.1', '172.17.0.1', '192.168.1.1', '192.0.2.2', '198.19.1.1', '224.1.1.1', '255.255.255.255', '2001:db8::1', '2002:7f00:1::', 'fc00::1', 'fe80::1', '::ffff:8.8.8.8']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('mixed DNS responses and redirect rebinding to private addresses are blocked', async () => {
  const options = await setup();
  await assert.rejects(capturePublicSource(options, { lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }], transport: async () => assert.fail('must not connect') }), /public addresses/);
  let calls = 0;
  await assert.rejects(capturePublicSource(options, { lookup: async () => ++calls === 1 ? lookup() : [{ address: '127.0.0.1', family: 4 }], transport: async () => response('', 'text/html', 302, { location: 'https://other.example/page' }) }), /public addresses/);
  assert.equal(calls, 2);
  await assert.rejects(capturePublicSource(options, { lookup, transport: async () => response('', 'text/html', 302, { location: 'http://example.com/page' }) }), /HTTPS/);
});

test('byte, redirect, timeout and encoding limits reject rather than fabricate extracted content', async () => {
  const options = await setup();
  await assert.rejects(capturePublicSource({ ...options, limits: { maxBytes: 2 } }, { lookup, transport: async () => response('abc') }), /byte limit/);
  await assert.rejects(capturePublicSource({ ...options, limits: { maxRedirects: 0 } }, { lookup, transport: async () => response('', 'text/html', 302, { location: '/next' }) }), /Redirect limit/);
  await assert.rejects(capturePublicSource(options, { lookup, transport: async () => response('gzip', 'text/html', 200, { 'content-encoding': 'gzip' }) }), /Encoded responses/);
  const keepAlive = setTimeout(() => {}, 500);
  try { await assert.rejects(capturePublicSource({ ...options, limits: { timeoutMs: 10 } }, { lookup: async () => new Promise(() => {}), transport: async () => assert.fail('must not connect') }), /timed out/); }
  finally { clearTimeout(keepAlive); }
});

test('HTTP denied response preserves the actual response bytes without treating the error page as research text', async () => {
  const result = await capturePublicSource(await setup(), { lookup, now, transport: async () => response('<p>Denied</p>', 'text/html', 403) });
  assert.equal(result.record.httpStatus, 403);
  assert.equal(result.record.extraction.text, '');
  assert.equal(result.record.extraction.method, 'none');
});

test('symlink storage directories cannot redirect capture writes outside the root', async () => {
  const options = await setup();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'source-outside-'));
  await symlink(outside, path.join(options.storeRoot, 'raw'));
  await assert.rejects(capturePublicSource(options, { lookup, now, transport: async () => response('data') }), /symlinks/);
});

test('HTML static extraction excludes executable content and keeps unknown dates unknown', () => {
  const result = extractHtml('<p>A</p><!-- <p>bad</p> --><script>fake <img src="https://bad.example/x"></script><figure><img src="https://ok.example/img"><figcaption>Shown pack</figcaption></figure><img src="file:///etc/passwd"><img src="https://127.0.0.1/a">', 'https://example.com');
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].caption, 'Shown pack');
  assert.doesNotMatch(result.text, /bad|fake/);
  assert.equal(Object.hasOwn(result, 'date'), false);
  const inert = extractHtml('<template><script>"</template><template>"</script><style>"</template>"</style><noscript></template></noscript><template></template><p>Hidden</p><img src="/hidden.jpg"></template><p>Visible</p><img src="/visible.jpg">', 'https://example.com');
  assert.equal(inert.text, 'Visible');
  assert.deepEqual(inert.images.map(image => image.url), ['https://example.com/visible.jpg']);
  const attributes = extractHtml('<img disabled loading = lazy SRC = "/first.jpg" src="/second.jpg" alt=\'A > B &amp; C\'><img data-note="src=\'/fake.jpg\'" data-src=/fallback.jpg>', 'https://example.com');
  assert.deepEqual(attributes.images.map(image => [image.url, image.alt]), [['https://example.com/first.jpg', 'A > B & C'], ['https://example.com/fallback.jpg', '']]);
});
