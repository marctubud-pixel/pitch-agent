import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLocalPdfExtractor} from './intake-pdf.mjs';
const pythonBinary='/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const fixture=name=>readFile(new URL(`./fixtures/intake/${name}`,import.meta.url));
test('actual bundled PDF extraction preserves blank pages, exact UTF16, encrypted and malformed originals',async()=>{
 const parser=createLocalPdfExtractor({pythonBinary}),cap=await parser.capability();assert.equal(cap.available,true,JSON.stringify(cap));assert.equal(cap.identity.pypdf,'6.10.0');assert.ok(cap.memoryProtection.samples>0);
 const mixed=await parser.extract(await fixture('mixed.pdf'));assert.equal(mixed.status,'partial');assert.equal(mixed.pages.length,2);assert.equal(mixed.pages[1].status,'no_text');assert.equal(mixed.text,mixed.pages[0].text+'\f');assert.ok(mixed.pages[0].wordChannel.length);assert.equal(mixed.memoryProtection.available,true);
 const emoji=await parser.extract(await fixture('emoji.pdf'));assert.equal(emoji.status,'text_extracted');assert.equal(emoji.text,'😀 Age 25');assert.equal(emoji.pages[0].textEndUtf16,9);assert.equal(emoji.text.slice(7,9),'25');
 assert.equal((await parser.extract(await fixture('encrypted.pdf'))).status,'password_required');assert.equal((await parser.extract(await fixture('invalid.pdf'))).status,'invalid');
});
test('actual subprocess limits and missing runtime are truthful and owned processes finish before return',async()=>{
 const bytes=await fixture('mixed.pdf');
 for(const limits of [{pages:1},{textBytes:1},{nodes:1},{outputBytes:1},{timeoutMs:1},{memoryBytes:1}]){const result=await createLocalPdfExtractor({pythonBinary,limits}).extract(bytes);assert.equal(result.status,'limit_exceeded',JSON.stringify({limits,result}));}
 assert.equal((await createLocalPdfExtractor(null).capability()).available,false);assert.equal((await createLocalPdfExtractor({pythonBinary:'/nonexistent/python'}).capability()).available,false);
 await assert.rejects(()=>createLocalPdfExtractor(null).extract(bytes),{code:'PDF_EXTRACTOR_UNAVAILABLE'});
});
