import {parentPort} from 'node:worker_threads';
import {parse} from 'parse5';

const HTML = 'http://www.w3.org/1999/xhtml';
const suppressed = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'title', 'xmp', 'iframe', 'plaintext', 'nav']);
const inline = new Set(['b', 'strong', 'i', 'em', 'span', 'br']);
const allowedErrors = new Set(['missing-doctype', 'non-conforming-doctype']);
const fail = code => { throw Object.assign(new Error(code), {reasonCode: code}); };
const attr = (node, name) => node.attrs?.find(a => !a.namespace && !a.prefix && a.name === name)?.value;
const excluded = node => node.tagName && (node.namespaceURI !== HTML || suppressed.has(node.tagName) || attr(node, 'hidden') !== undefined || attr(node, 'aria-hidden')?.toLowerCase() === 'true');

function extent(location, length) {
  if (!location || !Number.isSafeInteger(location.startOffset) || !Number.isSafeInteger(location.endOffset) || location.startOffset < 0 || location.endOffset < location.startOffset || location.endOffset > length) fail('MALFORMED_HTML');
  return [location.startOffset, location.endOffset];
}

function literal(node, html) {
  const loc = node.sourceCodeLocation;
  const [start, end] = extent(loc, html.length);
  const [open, contentStart] = extent(loc.startTag, html.length);
  const [contentEnd, close] = extent(loc.endTag, html.length);
  if (start !== open || end !== close || contentStart > contentEnd) fail('MALFORMED_HTML');
  if (end - start > 8192) fail('MALFORMED_HTML');
  const stack = [{nodes: node.childNodes ?? [], start: contentStart, end: contentEnd}];
  const parts = [];
  let textLength = 0;
  while (stack.length) {
    const frame = stack.pop();
    let previous = frame.start;
    const descendants = [];
    for (const child of frame.nodes) {
      const [cs, ce] = extent(child.sourceCodeLocation, html.length);
      if (cs < previous || ce > frame.end) fail('MALFORMED_HTML');
      previous = ce;
      if (child.nodeName === '#text') {
        textLength += child.value.length;
        if (textLength > 8192) fail('MALFORMED_HTML');
        descendants.push({text: child.value});
      } else if (child.nodeName !== '#comment') {
        if (child.namespaceURI !== HTML || !inline.has(child.tagName) || excluded(child)) fail('MALFORMED_HTML');
        const c = child.sourceCodeLocation;
        const [os, oe] = extent(c.startTag, html.length);
        if (os !== cs) fail('MALFORMED_HTML');
        if (child.tagName === 'br') {
          if (ce !== oe || child.childNodes.length) fail('MALFORMED_HTML');
        } else {
          const [es, ee] = extent(c.endTag, html.length);
          if (ee !== ce || oe > es) fail('MALFORMED_HTML');
          descendants.push({nodes: child.childNodes, start: oe, end: es});
        }
      }
    }
    for (let i = descendants.length - 1; i >= 0; i--) stack.push(descendants[i]);
    while (stack.length && Object.hasOwn(stack.at(-1), 'text')) parts.push(stack.pop().text);
  }
  const title = parts.join('').replace(/\s+/g, ' ').trim();
  if (!title || title.length > 1024) fail('MALFORMED_HTML');
  return {href: attr(node, 'href') ?? '', title, source: {kind: 'html_utf16', start, end, quote: html.slice(start, end)}};
}

export function inspectDocument(bytes, {acquisitionWindow = false} = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1048576) fail('MALFORMED_HTML');
  let html;
  try { html = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); }
  catch { fail('MALFORMED_HTML'); }
  if (/anomaly\.js|bots use DuckDuckGo|challenge-form|captcha|verify (?:that )?you are (?:a )?human/i.test(html)) fail('CHALLENGE');
  if (/<!ENTITY\b|<!DOCTYPE[^>]*\[/i.test(html)) fail('MALFORMED_HTML');
  let errorCount = 0;
  let malformed = false;
  const document = parse(html, {scriptingEnabled: true, sourceCodeLocationInfo: true, onParseError(error) {
    if (++errorCount > 100) fail('PARSE_ERROR_LIMIT');
    if (!allowedErrors.has(error.code)) malformed = true;
  }});
  const anchors = [];
  const suppressedRanges = [];
  const stack = [{node: document, depth: 0, range: [0, html.length]}];
  let nodes = 0;
  let previousStart = -1;
  let windowExhausted = false;
  while (stack.length) {
    const {node, depth, range} = stack.pop();
    if (++nodes > 100000 || depth > 256) fail('STRUCTURE_LIMIT');
    if (excluded(node)) {
      if (node.sourceCodeLocation) suppressedRanges.push(extent(node.sourceCodeLocation, html.length));
      continue;
    }
    let childRange = range;
    if (node.tagName && node.sourceCodeLocation) {
      const [start, end] = extent(node.sourceCodeLocation, html.length);
      if (start < range[0] || end > range[1] || start <= previousStart) fail('MALFORMED_HTML');
      previousStart = start;
      childRange = [start, end];
      if (node.sourceCodeLocation.startTag) childRange[0] = node.sourceCodeLocation.startTag.endOffset;
      if (node.sourceCodeLocation.endTag) childRange[1] = node.sourceCodeLocation.endTag.startOffset;
    }
    if (node.tagName === 'a' && attr(node, 'href') !== undefined && (attr(node, 'class') ?? '').split(/[\t\n\f\r ]+/).includes('result-link')) {
      if (anchors.length >= 50) { if (acquisitionWindow) { windowExhausted = true; break; } fail('RESULT_LIMIT'); }
      anchors.push(literal(node, html));
    }
    const children = node.childNodes ?? [];
    for (let i = children.length - 1; i >= 0; i--) stack.push({node: children[i], depth: depth + 1, range: childRange});
  }
  for (const a of anchors) for (const [start, end] of suppressedRanges) {
    if (a.source.start < end && a.source.end > start) fail('MALFORMED_HTML');
  }
  anchors.sort((a, b) => a.source.start - b.source.start);
  return {anchors, malformed, ...(acquisitionWindow ? {window: {considered: anchors.length, unexamined: windowExhausted ? 'Unknown beyond first 50 literal anchors' : 0, maxItems: 50}} : {})};
}

if (parentPort) parentPort.once('message', request => {
  try {
    if (!['parse','parse-acquisition'].includes(request?.type) || !(request.bytes instanceof Uint8Array)) fail('WORKER_FAILURE');
    const {anchors, malformed, window} = inspectDocument(request.bytes, {acquisitionWindow: request.type === 'parse-acquisition'});
    if (malformed) fail('MALFORMED_HTML');
    if (!anchors.length) fail('NO_LITERAL_RESULTS');
    parentPort.postMessage({type: 'parsed', anchors, ...(window ? {window} : {})});
  } catch (error) {
    parentPort.postMessage({type: 'refused', code: error.reasonCode ?? 'WORKER_FAILURE'});
  } finally {
    parentPort.close();
  }
});
