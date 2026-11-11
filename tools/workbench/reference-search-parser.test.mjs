import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {performance} from 'node:perf_hooks';
import {parseSearchResults, parserPolicy} from './reference-search-parser.mjs';
import {inspectDocument} from './reference-search-parser-worker.mjs';
import {searchPublicReferences} from './reference-http-search.mjs';

const a = (href = 'https://real.example.org/', title = 'Genuine') => `<a class="result-link" href="${href}">${title}</a>`;
const fake = a('https://fake.example.org/', 'Fake');
const parse = (html, ms = 10000) => parseSearchResults(Buffer.from(html), {deadline: performance.now() + ms});
const refused = async (html, code = 'MALFORMED_HTML') => assert.rejects(parse(html), e => e.reasonCode === code);

async function search(t, body, options = {}) {
  const root = await mkdtemp('/private/tmp/reference-parser-boundary-');
  t.after(() => rm(root, {recursive: true, force: true}));
  let calls = 0;
  const result = await searchPublicReferences({query: 'offline parser acceptance', storeRoot: root, ...options}, {lookup: async () => [{address: '93.184.216.34', family: 4}], transport: async () => {calls++; return {status: 200, headers: {'content-type': 'text/html; charset=utf-8'}, body: Buffer.from(body)};}});
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(await readFile(result.attemptRecord.path)), result.receipt);
  return result;
}

test('independent Unicode, script and select reproductions retain genuine companions only', async () => {
  const fakeContexts = [
    '<a\u00a0class="result-link" href="https://fake.example.org/">Fake</a>',
    '<a class="other\u00a0result-link" href="https://fake.example.org/">Fake</a>',
    `<script><!--<script></script>${fake}</script>`,
    `<select>${fake}</select>`,
  ];
  for (const body of fakeContexts) {
    const anchors = await parse(body + a());
    assert.deepEqual(anchors.map(x => x.href), ['https://real.example.org/']);
  }
  const malformedSeparator = '<a class="result-link"\u00a0href="https://fake.example.org/">Fake</a>' + a();
  const inspected = inspectDocument(Buffer.from(malformedSeparator));
  assert.equal(inspected.malformed, true);
  assert.deepEqual(inspected.anchors.map(x => x.href), ['https://real.example.org/']);
  await refused(malformedSeparator);
});

test('BOM astral CRLF and parser entities retain exact original UTF16 source', async () => {
  const html = '\ufeff😀\r\n' + a('https://real.example.org/?x=1&amp;y=2', 'A &amp;lt; B &CounterClockwiseContourIntegral; <b>C</b>D<span>E<i>F</i>G</span>H<br>I');
  const [result] = await parse(html);
  assert.equal(result.source.start, 5);
  assert.equal(html.slice(result.source.start, result.source.end), result.source.quote);
  assert.equal(result.href, 'https://real.example.org/?x=1&y=2');
  assert.equal(result.title, 'A &lt; B ∳ CDEFGHI');
});

test('ASCII class separators only, namespaces, static exclusions and inline title rules', async () => {
  for (const delimiter of ['\t', '\n', '\f', '\r', ' ']) assert.equal((await parse(a().replace('result-link', `x${delimiter}result-link`))).length, 1);
  for (const delimiter of ['\u00a0', '\u1680', '\u2000', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff']) assert.deepEqual((await parse(a().replace('result-link', `x${delimiter}result-link`) + a())).map(x => x.href), ['https://real.example.org/']);
  for (const wrapper of ['<svg><foreignObject>BODY</foreignObject></svg>', '<math><annotation-xml encoding="text/html">BODY</annotation-xml></math>', '<template>BODY</template>', '<nav>BODY</nav>', '<div hidden>BODY</div>', '<div aria-hidden="TrUe">BODY</div>', '<noscript>BODY</noscript>', '<textarea>BODY</textarea>', '<style>BODY</style>', '<title>BODY</title>', '<xmp>BODY</xmp>', '<iframe>BODY</iframe>']) assert.deepEqual((await parse(wrapper.replace('BODY', fake) + a())).map(x => x.href), ['https://real.example.org/']);
  assert.deepEqual((await parse('<a xlink:class="result-link" href="https://fake.example.org/">F</a>' + a())).map(x => x.href), ['https://real.example.org/']);
  await refused(a().replace('href=', 'xlink:href='), 'NO_LITERAL_RESULTS');
  assert.equal((await parse(a(undefined, 'A<!-- x --><strong>B<em>C</em></strong><br>D')))[0].title, 'ABCD');
  await refused(a(undefined, '<span hidden>Invisible</span>Visible'));
});

test('repairs, clones, relocation, malformed trailing input and strict error allowlist refuse whole response', async t => {
  for (const body of [
    `<a class="result-link" href="https://real.example.org/">x${fake}</a>`,
    a().replace('</a>', ''), a(undefined, '<span>open'),
    '<b><a class="result-link" href="https://fake.example.org/">F</b>cloned</a>',
    '<p><b><a class="result-link" href="https://fake.example.org/">F</p>cloned</a></b>',
    `<table>${fake}<tr><td>cell</td></tr></table>`,
    `<table hidden>${fake}<tr><td>cell</td></tr></table>`,
    a() + '<', a() + '<!-- unclosed', a().replace('href=', 'href="x" href='),
    '<!DOCTYPE html [<!ENTITY x "y">]>' + a(), '<?xml version="1.0"?>' + a(),
    a(undefined, '<div>invalid</div>'), a(undefined, '&#0;'),
  ]) {
    const {receipt} = await search(t, body);
    assert.equal(receipt.outcome, 'unavailable', body);
    assert.equal(receipt.reason.code, 'MALFORMED_HTML', body);
    assert.deepEqual(receipt.results, []);
    assert.ok(receipt.capture.raw.sha256);
  }
  assert.equal((await parse(a())).length, 1);
  assert.equal((await parse('<!doctype html>' + a())).length, 1);
  assert.equal((await parse('<!doctype html PUBLIC "legacy">' + a())).length, 1);
});

test('fixed anchor and title boundaries, eligible count, dedup and original ranks', async t => {
  const sourceOverhead = a(undefined, '').length;
  const exact = a(undefined, 'x'.repeat(1024));
  assert.equal((await parse(exact))[0].title.length, 1024);
  await refused(a(undefined, 'x'.repeat(1025)));
  const at = a(undefined, 'x' + ' '.repeat(8192 - sourceOverhead - 1));
  assert.equal(at.length, 8192);
  assert.equal((await parse(at))[0].source.quote.length, 8192);
  await refused(at.replace('x', 'xx'));
  const fifty = Array.from({length: 50}, (_, i) => a(`https://real.example.org/${i}`)).join('');
  assert.equal((await parse(fifty)).length, 50);
  await refused(fifty + a(), 'RESULT_LIMIT');
  const {receipt} = await search(t, a('http://unsafe.example.org/') + a() + a() + a('https://second.example.org/'), {limits: {maxResults: 2}});
  assert.deepEqual(receipt.results.map(x => x.naturalRank), [2, 4]);
  assert.equal(receipt.rejected.length, 1);
  assert.equal(receipt.schemaVersion, 2);
  assert.deepEqual(receipt.parserPolicy, parserPolicy);
});

test('invalid UTF8 and node, depth, error and byte budgets have explicit terminal outcomes', async () => {
  await assert.rejects(parseSearchResults(Buffer.from([255]), {deadline: performance.now() + 10000}), e => e.reasonCode === 'MALFORMED_HTML');
  assert.equal((await parse('<div>'.repeat(252) + a() + '</div>'.repeat(252))).length, 1);
  await refused('<div>'.repeat(253) + a() + '</div>'.repeat(253), 'STRUCTURE_LIMIT');
  assert.equal((await parse('<!--x-->'.repeat(99994) + a())).length, 1);
  await refused('<!--x-->'.repeat(99995) + a(), 'STRUCTURE_LIMIT');
  await refused('<!--x-->'.repeat(100001) + a(), 'STRUCTURE_LIMIT');
  await refused('<div a="x" a="y"></div>'.repeat(101) + a(), 'PARSE_ERROR_LIMIT');
  const hugeAttribute = '<div data-x="' + 'x'.repeat(1048400) + '"></div>' + a();
  assert.ok(Buffer.byteLength(hugeAttribute) <= 1048576);
  assert.equal((await parse(hugeAttribute)).length, 1);
  await refused('x'.repeat(1048577), 'MALFORMED_HTML');
  const depth = Math.floor((1048576 - a().length) / 11);
  const deep = '<div>'.repeat(depth) + a() + '</div>'.repeat(depth);
  assert.ok(Buffer.byteLength(deep) >= 1048560 && Buffer.byteLength(deep) <= 1048576);
  await assert.rejects(parse(deep), e => ['STRUCTURE_LIMIT', 'WORKER_TIMEOUT', 'WORKER_FAILURE'].includes(e.reasonCode));
});

test('real worker leaves the main event loop responsive and terminates pathological bounded input', async () => {
  let ticks = 0;
  const timer = setInterval(() => ticks++, 5);
  try {
    const body = '<b>'.repeat(170000) + '</b>'.repeat(13000);
    assert.ok(Buffer.byteLength(body) < 1048576);
    await assert.rejects(parse(body), e => ['WORKER_TIMEOUT', 'WORKER_FAILURE', 'STRUCTURE_LIMIT'].includes(e.reasonCode));
    assert.ok(ticks >= 2, `event-loop ticks ${ticks}`);
  } finally {clearInterval(timer);}
  await assert.rejects(parse(a(), -1), e => e.reasonCode === 'WORKER_TIMEOUT');
  assert.equal((await parse(a())).length, 1);
});

test('mocked worker protocol, timeout, exit, cleanup and exhausted deadline', async () => {
  const script = `
    import {mock} from 'node:test'; import assert from 'node:assert/strict'; import {EventEmitter} from 'node:events'; import {performance} from 'node:perf_hooks';
    let behavior, created=0, active=0, terminated=0, constructorFailure=false;
    class Worker extends EventEmitter {
      constructor(url, options) {super(); if(constructorFailure)throw new Error('private startup failure'); created++; active++; assert.equal(options.resourceLimits.maxOldGenerationSizeMb,128); assert.equal(options.resourceLimits.stackSizeMb,4);}
      postMessage(request) {assert.equal(request.type,'parse'); queueMicrotask(()=>behavior(this));}
      async terminate(){active--;terminated++;return 0;}
    }
    mock.module('node:worker_threads',{namedExports:{Worker}});
    const {parseSearchResults:parse}=await import(${JSON.stringify(new URL('./reference-search-parser.mjs', import.meta.url).href)});
    for (const [run,expected] of [
      [w=>w.emit('exit',0),'WORKER_FAILURE'],
      [w=>w.emit('error',new Error('private data')),'WORKER_FAILURE'],
      [w=>{w.emit('message',{type:'parsed',anchors:[{}]});w.emit('exit',0)},'WORKER_FAILURE'],
      [w=>{w.emit('message',{type:'refused',code:'INVENTED'});w.emit('exit',0)},'WORKER_FAILURE'],
      [w=>{w.emit('message',{type:'refused',code:'MALFORMED_HTML'});w.emit('message',{});w.emit('exit',0)},'WORKER_FAILURE'],
      [w=>{},'WORKER_TIMEOUT'],
      [w=>{w.emit('message',{type:'refused',code:'MALFORMED_HTML'});w.emit('exit',0)},'MALFORMED_HTML'],
    ]) {behavior=run;await assert.rejects(parse(Buffer.from('x'),{deadline:performance.now()+40}),e=>e.reasonCode===expected);assert.equal(active,0);}
    const before=created;await assert.rejects(parse(Buffer.from('x'),{deadline:performance.now()-1}),e=>e.reasonCode==='WORKER_TIMEOUT');assert.equal(created,before);assert.equal(terminated,created);
    constructorFailure=true;await assert.rejects(parse(Buffer.from('x'),{deadline:performance.now()+40}),e=>e.reasonCode==='WORKER_FAILURE');assert.equal(active,0);
    console.log('all terminal paths awaited worker termination');
  `;
  const {stdout} = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script]);
  assert.match(stdout, /all terminal paths/);
});

test('private imports remain bounded to adapter, lifecycle, worker and tests', async () => {
  const directory = new URL('.', import.meta.url);
  for (const filename of await readdir(directory)) if (filename.endsWith('.mjs') && !filename.endsWith('.test.mjs') && !['reference-http-search.mjs','reference-search-parser.mjs','reference-search-parser-worker.mjs'].includes(filename)) {
    const content = await readFile(new URL(filename, directory), 'utf8');
    assert.doesNotMatch(content, /(?:from\s*|import\s*\()['"][^'"]*reference-search-parser/);
  }
});

test('adapter shared acquisition deadline refuses exhaustion and grants only remaining parse time', async () => {
  const script = `
    import {mock} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {mkdtemp,rm} from 'node:fs/promises';
    let now=0, spent=0, workers=0, terminations=0; const timers=[];const schedule=globalThis.setTimeout;
    globalThis.setTimeout=(fn,delay,...args)=>{timers.push(delay);return schedule(fn,delay,...args)};
    class Worker extends EventEmitter{constructor(){super();workers++;}postMessage(){}async terminate(){terminations++;}}
    mock.module('node:perf_hooks',{namedExports:{performance:{now:()=>now}}});mock.module('node:worker_threads',{namedExports:{Worker}});
    const {searchPublicReferences}=await import(${JSON.stringify(new URL('./reference-http-search.mjs', import.meta.url).href)});
    for(const remaining of [-1,1]){
      const root=await mkdtemp('/private/tmp/reference-shared-deadline-');now=0;timers.length=0;const before=workers;
      try {const {receipt}=await searchPublicReferences({query:'offline shared deadline',storeRoot:root,limits:{timeoutMs:100}},{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async()=>{now=100-remaining;return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<a class="result-link" href="https://real.example.org/">R</a>')}}});
        assert.equal(receipt.reason.code,'WORKER_TIMEOUT');assert.deepEqual(receipt.results,[]);assert.ok(receipt.capture.raw.sha256);
        if(remaining<0)assert.equal(workers,before);else{assert.equal(workers,before+1);assert.ok(timers.some(ms=>ms<=1));assert.ok(timers.every(ms=>ms<=1));}
      }finally{await rm(root,{recursive:true,force:true});}
    }assert.equal(workers,terminations);console.log('shared deadline and worker cleanup proved');
  `;
  const {stdout} = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--input-type=module', '-e', script]);
  assert.match(stdout, /shared deadline and worker cleanup proved/);
});

test('real worker success refusal timeout and cancellation leave no MessagePort handles', async () => {
  const script = `
    import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
    const {parseSearchResults:parse}=await import(${JSON.stringify(new URL('./reference-search-parser.mjs', import.meta.url).href)});
    const before=process._getActiveHandles().filter(x=>x.constructor.name==='MessagePort').length;
    for(const [html,ms] of [['<a class="result-link" href="https://real.example.org/">R</a>',10000],['<',10000],['<b>'.repeat(170000),1],['x',-1]])try{await parse(Buffer.from(html),{deadline:performance.now()+ms});}catch(e){assert.ok(['MALFORMED_HTML','WORKER_TIMEOUT','NO_LITERAL_RESULTS'].includes(e.reasonCode));}
    await new Promise(setImmediate);assert.equal(process._getActiveHandles().filter(x=>x.constructor.name==='MessagePort').length,before);console.log('no surviving worker ports');
  `;
  const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {timeout: 10000});
  assert.match(stdout, /no surviving worker ports/);
});
