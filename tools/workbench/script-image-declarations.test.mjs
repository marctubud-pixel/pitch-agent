import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, writeFile, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {extractHtml, capturePublicSource} from './source-acquisition.mjs';
import {declaredArticleImages} from './script-image-declarations.mjs';
import {readManagedCapture} from './source-capture-store.mjs';
const page = 'https://www.sohu.com/a/798606967_100018552';
const url = '//q0.itc.cn/images01/20240805/bfc180f600b14135bd631cf2f6002c25.jpeg';
const config = (list = `[{url:"${url}",width:'1280',height:'720',},]`, extra = '') => `var cfgs = {news_id:"798606967", media_id:"100018552", imgsList:${list}, ${extra}};`;
const script = body => `<script>${body}</script>`;
const declared = html => extractHtml(html, page).images.filter(image => image.discovery);
const hash = value => createHash('sha256').update(value).digest('hex');

test('actual saved public Sohu HTML preserves nine old entries and appends eight exact declaration candidates', async () => {
  const bytes = await readFile(new URL('./fixtures/sohu-script-images.html', import.meta.url));
  assert.equal(hash(bytes), '6d1b70b6c483654b5e969874589d1dd4ce1b0434ff9406a65a0f1acc657066c2');
  const html = bytes.toString('utf8'), result = extractHtml(html, page);
  const old = extractHtml(html.replace('var cfgs =', 'var cfgg ='), page);
  assert.equal(old.method, 'static-html-tokenizer-v1'); assert.equal(old.images.length, 9);
  assert.deepEqual(result.images.slice(0, 9), old.images); assert.equal(result.images.length, 17);
  assert.equal(result.method, 'static-html-tokenizer-v2'); assert.equal(result.text, old.text);
  const added = result.images.slice(9);
  assert.equal(added.length, 8); assert.equal(added[4].url, `https:${url}`);
  assert.deepEqual(added[4].locator, {kind:'html_utf16_literal', start:16135, end:16202});
  for (const [index, image] of added.entries()) {
    assert.equal(html.slice(image.locator.start, image.locator.end), image.url.slice(6));
    assert.equal(image.alt, ''); assert.equal(image.caption, '');
    assert.deepEqual(image.discovery, {kind:'script-declared',adapter:'sohu-cfgs-imgsList-v1',declarationPath:`cfgs.imgsList[${index}].url`});
  }
});
test('declarations retain UTF16 raw literal contents after astral prefixes and decode supported escapes', () => {
  const html = `😀<p>caption unrelated</p>${script(config().replace('//q0', '\\u002f/q0'))}`;
  const [image] = declared(html);
  assert.equal(image.url, `https:${url}`);
  assert.equal(html.slice(image.locator.start, image.locator.end), '\\u002f' + url.slice(1));
  assert.equal(image.locator.start, html.indexOf('\\u002f')); assert.equal(image.caption, '');
});
test('restricted literal grammar accepts actual comments, single quoted other fields, primitives and trailing commas', () => {
  const body = config(undefined, "/* cfgs imgsList */ flag:false, other:null, number:-1.5e2, nested:{value:'100',}, items:[true,], // end\n");
  assert.equal(declared(script(body)).length, 1);
});
test('adapter requires final Sohu article host, path and exact literal article identifiers', () => {
  for (const base of ['https://evilsohu.com/a/798606967_100018552','https://www.sohu.com.evil.com/a/798606967_100018552','https://m.sohu.com/a/798606967_100018552','https://www.sohu.com/other','http://www.sohu.com/a/798606967_100018552']) assert.equal(extractHtml(script(config()), base).images.length, 0, base);
  for (const body of [config().replace('798606967','1'), config().replace('100018552','1'),config().replace('"798606967"','798606967')]) assert.equal(declared(script(body)).length, 0);
});
test('comments, quoted code, templates, raw text and external or inert scripts cannot declare candidates', () => {
  const valid = config();
  for (const html of [`<!--${script(valid)}-->`, `<!bogus ${script(valid)}>`, `<?bogus ${script(valid)}>`, `<plaintext>${script(valid)}`, `<template>${script(valid)}</template>`, `<template><template>${script(valid)}</template></template>`, `<textarea>${script(valid)}</textarea>`, `<style>${script(valid)}</style>`, `<script src='/x.js'>${valid}</script>`, `<script SRC = ''>${valid}</script>`, `<script id="x"src='/x.js'>${valid}</script>`, `<script src>${valid}</script>`, script('<!-- '+valid), script('--> '+valid), `<script type='application/json'>${valid}</script>`, script(`/*${valid}*/`), script(`// ${valid}`),script(JSON.stringify(valid)),script('`'+valid+'`'),script('/'+valid+'/')]) assert.equal(declared(html).length, 0, html);
});
test('HTML raw script termination wins over JavaScript strings and comments', () => {
  for (const html of [script(`var before="</script>"; ${config()}`), script(`/* </SCRIPT > */ ${config()}`), script(`var before='</script\n>'; ${config()}`)]) assert.equal(declared(html).length, 0, html);
});
test('non-HTML whitespace cannot open script tags or end raw script content', () => {
  for (const gap of ['\u00a0', '\u000b', '\u2028', '\u2029', '\ufeff']) {
    const label = `U+${gap.charCodeAt(0).toString(16).padStart(4, '0')}`;
    const quoted = `<script>let x="</script${gap}><script>${config()}</script>";</script>`;
    assert.equal(declared(quoted).length, 0, `quoted pseudo-close ${label}`);
    assert.equal(declared(`<script${gap}>${config()}</script>`).length, 0, `opening lookalike ${label}`);
    assert.equal(declared(`<script${gap} data-fake='<script>${config(`[{url:"${url}"}]`)}</script>'></script${gap}>`).length, 0, `lookalike quoted attribute ${label}`);
    assert.equal(declared(`<script type=text/javascript${gap}bogus>${config()}</script>`).length, 0, `unquoted type ${label}`);
    assert.equal(declared(`<script src${gap}='/external.js'>${config()}</script>`).length, 1, `attribute name ${label}`);
    assert.equal(declared(`<script type${gap}='application/json'>${config()}</script>`).length, 1, `type attribute name ${label}`);
  }
});
test('long non-script tag names keep quoted fake scripts inside their attributes', () => {
  for (const gap of ['\u00a0', '\u000b', '\u2028', '\u2029', '\ufeff']) {
    const name = 'script' + gap.repeat(120);
    assert.equal(declared(`<${name} data-fake='<script>${config(`[{url:"${url}"}]`)}</script>'></${name}>`).length, 0);
  }
});
test('HTML ASCII whitespace works at opening, closing and attribute boundaries', () => {
  for (const gap of ['\t', '\n', '\f', '\r', ' ']) {
    assert.equal(declared(`<script${gap}>${config()}</script${gap}>`).length, 1);
    assert.equal(declared(`<script${gap}type${gap}=${gap}'text/javascript'>${config()}</script>`).length, 1);
    assert.equal(declared(`<script${gap}src${gap}=${gap}'/external.js'>${config()}</script>`).length, 0);
    assert.equal(declared(`<script type=text/javascript${gap}id=x>${config()}</script>`).length, 1);
    assert.equal(declared(`<script>let x="</script${gap}><script>${config()}</script>";</script>`).length, 1);
  }
});
test('JavaScript lexer retains its own whitespace semantics', () => {
  for (const gap of ['\u00a0', '\u000b', '\u2028', '\u2029', '\ufeff']) {
    assert.equal(declared(script(config().replace('var cfgs =', `var${gap}cfgs${gap}=`))).length, 1);
  }
});
test('ambiguous declarations and nonliteral properties or expressions fail closed for the complete list', () => {
  const invalidLists = [`[{url:"${url}"},{url:load()}]`, '[{url:"'+url+'"},{url:`'+url+'`}]', `[{url:"${url}",url:"${url}"}]`, `[{["url"]:"${url}"}]`, `[{get url(){return "${url}"}}]`, `[{...other,url:"${url}"}]`, `[{url:"${url}"+suffix}]`, `[{url:/anything/}]`, `[{url:"${url}",nested:{x:1}}]`, `[{url:"${url}"},,]`, `[{url:"${url}"},`, `[{url:42}]`, `[{url:""}]`, `[{url:" "}]`];
  for (const list of invalidLists) assert.equal(declared(script(config(list))).length, 0, list);
  for (const body of [config()+config(), config(undefined,'imgsList:[], '),config(undefined, 'news_id:"798606967",'), config().replace('var cfgs', 'window.cfgs'),config().replace('};','}+load();'),config()+ 'cfgs.imgsList = [];']) assert.equal(declared(script(body)).length, 0, body);
  assert.equal(declared(script(config())+script(config())).length, 0);
  assert.equal(declared(script(config())+script('var cfgs = /bad/;')).length, 0);
});
test('one unsafe URL rejects the entire declared array without changing original HTML candidates', () => {
  for (const bad of ['http://example.com/x.jpg','https://127.0.0.1/x','https://user:pass@example.com/x','https://example.com:444/x','javascript:alert(1)']) {
    const html = '<img src="https://example.com/original.jpg">'+script(config(`[{url:"${url}"},{url:"${bad}"}]`));
    assert.deepEqual(extractHtml(html, page).images.map(image => image.url), ['https://example.com/original.jpg']);
  }
});
test('script, image-count, string and nesting caps fail closed at the extraction boundary', () => {
  assert.equal(declared(script(config(Array.from({length:64},()=>`{url:"${url}"}`).join(',').replace(/^/,'[')+']'))).length,64);
  assert.equal(declared(script(config('['+Array.from({length:65},()=>`{url:"${url}"}`).join(',')+']'))).length,0);
  assert.equal(declared(script(config(undefined, `huge:"${'x'.repeat(4097)}",`))).length,0);
  assert.equal(declared(script(config(undefined, `deep:${'['.repeat(17)}0${']'.repeat(17)},`))).length,0);
  assert.equal(declared(script(config()+' '.repeat(128*1024))).length,0);
  assert.equal(declared(script(config()+ '/*'+ '字'.repeat(45000)+'*/')).length,0);
});
test('adversarial bounded scanner completes excessive delimiters, comments and unterminated strings', {timeout:5000}, () => {
  const samples = ['['.repeat(120000),'/*'+'x'.repeat(120000),'"'+'x'.repeat(120000),'<'.repeat(120000), 'var cfgs = {'+'a:'.repeat(40000)];
  for (let repeat=0;repeat<5;repeat++) for (const body of samples) assert.equal(declared(script(body)).length,0);
  assert.equal(declared(script(config())).length,1);
});
for (const repetitions of [150000, 1500000]) {
  test(`actual extraction completes ${repetitions * 2} bytes of unterminated tag fragments within the external deadline`, () => {
    const moduleUrl = new URL('./source-acquisition.mjs', import.meta.url).href;
    const source = `
      import assert from 'node:assert/strict';
      import {extractHtml} from ${JSON.stringify(moduleUrl)};
      const result = extractHtml('<a'.repeat(${repetitions}), ${JSON.stringify(page)});
      assert.deepEqual(result.images, []);
      assert.equal(result.method, 'static-html-tokenizer-v1');
      const valid = extractHtml(${JSON.stringify(script(config()))}, ${JSON.stringify(page)});
      assert.equal(valid.images.length, 1);
      assert.equal(valid.method, 'static-html-tokenizer-v2');
      process.stdout.write('extraction completed');
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], {timeout:3000, encoding:'utf8'});
    assert.equal(child.error?.code, undefined, child.error?.message);
    assert.equal(child.signal, null, child.stderr);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, 'extraction completed');
  });
}
test('acquisition uses the final redirect host for adapter eligibility and keeps all network guards', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(),'declared-capture-')));t.after(()=>rm(root,{recursive:true,force:true}));
  const html = script(config()); let calls=0;
  const result=await capturePublicSource({url:'https://example.com/start',storeRoot:root},{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async ({url:target})=>{calls++;return target.hostname==='example.com'?{status:302,headers:{location:page},body:Buffer.alloc(0)}:{status:200,headers:{'content-type':'text/html'},body:Buffer.from(html)}}});
  assert.equal(calls,2);assert.equal(result.record.extraction.images.length,1);
  const managed=await readManagedCapture(root,result); assert.equal(managed.recordHash,result.recordHash);
  const forged=structuredClone(result.record);forged.extraction.images[0].locator.start++;
  const bytes=JSON.stringify(forged,null,2)+'\n',recordHash=hash(bytes);await writeFile(join(root,'captures',recordHash+'.json'),bytes);
  await assert.rejects(readManagedCapture(root,{recordHash}),/locator or declaration/);
  forged.extraction.images[0].locator=result.record.extraction.images[0].locator;forged.extraction.images[0].discovery.declarationPath='cfgs.imgsList[1].url';
  const changed=JSON.stringify(forged,null,2)+'\n',changedHash=hash(changed);await writeFile(join(root,'captures',changedHash+'.json'),changed);
  await assert.rejects(readManagedCapture(root,{recordHash:changedHash}),/locator or declaration/);
});
test('legacy managed captures retain their exact extraction and record bytes', async t => {
  const root=await realpath(await mkdtemp(join(tmpdir(),'legacy-capture-')));t.after(()=>rm(root,{recursive:true,force:true}));
  const result=await capturePublicSource({url:page,storeRoot:root},{lookup:async()=>[{address:'93.184.216.34',family:4}],transport:async()=>({status:200,headers:{'content-type':'text/html'},body:Buffer.from('<img src="https://example.com/old.jpg">')})});
  const before=await readFile(result.recordPath);const loaded=await readManagedCapture(root,result);
  assert.deepEqual(loaded.record,result.record);assert.deepEqual(await readFile(result.recordPath),before);
});
test('source picker renders declaration warning and submits the selected candidate URL', async () => {
  const html=await readFile(new URL('./ui.html',import.meta.url),'utf8');
  const code=html.slice(html.indexOf('function renderSources(p)'),html.indexOf('function renderImages(p,v)'));
  class Element {
    constructor(tag,text=''){this.tag=tag;this.text=text;this.children=[];this.options=this.children;this.value='';}
    append(...children){this.children.push(...children);if(this.tag==='select'&&!this.value)this.value=this.children[0]?.value;}
  }
  const content=new Element('main');const calls=[];
  const el=(tag,text)=>new Element(tag,text);
  vm.runInNewContext(code+';renderSources(p)',{el,content,historical:false,capabilities:{caseIdentity:{available:true}},field:(label,input)=>{const node=el('label',label);node.append(input);return node;},detail:()=>el('details'),track:()=>{},safe:fn=>fn(),mutate:(...args)=>calls.push(args),crypto:{randomUUID:()=> 'command'},p:{id:'p',revision:1,sourceCaptures:[{id:'capture',record:{finalUrl:page,extraction:{images:extractHtml(script(config()),page).images}}}],imageAssets:[{id:'reference',provenance:{originalFilename:'ref.png'}}]}});
  const flatten=node=>[node,...node.children.flatMap(flatten)];const nodes=flatten(content);
  assert.ok(nodes.some(node=>node.text?.includes('脚本声明不证明页面显示')));
  assert.ok(nodes.some(node=>node.tag==='option'&&node.text===`脚本声明候选 · https:${url}`));
  const form=nodes.filter(node=>node.tag==='form')[1];form.onsubmit({preventDefault(){}});
  assert.equal(calls[0][1].sourceImageUrl,`https:${url}`);assert.equal(calls[0][1].referenceImageId,'reference');
});
