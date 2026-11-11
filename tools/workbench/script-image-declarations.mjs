const MAX_SCRIPT = 128 * 1024;
const MAX_STRING = 4096;
const ADAPTER = 'sohu-cfgs-imgsList-v1';

function scriptAttributes(raw) {
  const attributes = new Map();
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /[\t\n\f\r /]/.test(raw[i])) i++;
    const start = i;
    while (i < raw.length && !/[\t\n\f\r =/>]/.test(raw[i])) i++;
    if (start === i) break;
    const name = raw.slice(start, i).toLowerCase();
    while (/[\t\n\f\r ]/.test(raw[i] ?? '')) i++;
    let value = '';
    if (raw[i] === '=') {
      i++;
      while (/[\t\n\f\r ]/.test(raw[i] ?? '')) i++;
      const quote = ['"', "'"].includes(raw[i]) ? raw[i++] : '';
      const valueStart = i;
      while (i < raw.length && (quote ? raw[i] !== quote : !/[\t\n\f\r ]/.test(raw[i]))) i++;
      value = raw.slice(valueStart, i);
      if (quote) i++;
    }
    if (!attributes.has(name)) attributes.set(name, value);
  }
  return attributes;
}

function inlineScripts(html) {
  const scripts = [];
  let index = 0, templateDepth = 0;
  while (index < html.length) {
    const start = html.indexOf('<', index);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', start) || html.startsWith('<?', start)) {
      const end = html.indexOf('>', start + 2);
      index = end < 0 ? html.length : end + 1;
      continue;
    }
    const closing = html[start + 1] === '/';
    const nameStart = start + (closing ? 2 : 1);
    const first = html.charCodeAt(nameStart);
    if (!((first >= 65 && first <= 90) || (first >= 97 && first <= 122))) {
      index = nameStart;
      continue;
    }
    let nameEnd = nameStart + 1;
    while (nameEnd < html.length) {
      const ch = html[nameEnd];
      if (ch === '\t' || ch === '\n' || ch === '\f' || ch === '\r' || ch === ' ' || ch === '/' || ch === '>') break;
      nameEnd++;
    }
    if (nameEnd === html.length) break;
    const name = html.slice(nameStart, nameEnd).toLowerCase();
    let quote = '', end = nameEnd;
    for (; end < html.length; end++) {
      const ch = html[end];
      if (quote) { if (ch === quote) quote = ''; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
    }
    if (end === html.length) break;
    index = end + 1;
    if (!closing && name === 'plaintext') break;
    if (name === 'template') templateDepth = Math.max(0, templateDepth + (closing ? -1 : 1));
    if (!closing && ['script', 'style', 'noscript', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes'].includes(name)) {
      const close = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, 'ig');
      close.lastIndex = index;
      const stop = close.exec(html);
      const bodyEnd = stop?.index ?? html.length;
      const attributes = scriptAttributes(html.slice(nameEnd, end));
      if (stop && name === 'script' && !templateDepth && !attributes.has('src')) {
        const type = attributes.get('type');
        if (type === undefined || type === '' || /^(?:text|application)\/(?:java|ecma)script$/i.test(type)) scripts.push({start: index, end: bodyEnd});
      }
      index = stop ? bodyEnd : html.length;
    }
  }
  return scripts;
}

function lex(source, offset) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (source.startsWith('//', i)) { const end = source.indexOf('\n', i + 2); i = end < 0 ? source.length : end + 1; continue; }
    if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); if (end < 0) throw Error('comment'); i = end + 2; continue; }
    if (ch === '`' || ch === '/' || ch === '\\' || source.startsWith('<!--', i) || source.startsWith('-->', i)) throw Error('unsupported lexical context');
    if (ch === '"' || ch === "'") {
      const start = ++i;
      let value = '';
      while (i < source.length && source[i] !== ch) {
        if (i - start >= MAX_STRING || /[\r\n\u2028\u2029]/.test(source[i])) throw Error('string limit');
        if (source[i] !== '\\') { value += source[i++]; continue; }
        const escape = source[++i];
        const simple = {"'": "'", '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t'};
        if (Object.hasOwn(simple, escape)) { value += simple[escape]; i++; }
        else if (escape === 'u' || escape === 'x') {
          const size = escape === 'u' ? 4 : 2, digits = source.slice(i + 1, i + 1 + size);
          if (digits.length !== size || !/^[\da-f]+$/i.test(digits)) throw Error('escape');
          value += String.fromCharCode(parseInt(digits, 16)); i += size + 1;
        } else throw Error('escape');
      }
      if (source[i] !== ch || i - start > MAX_STRING) throw Error('unterminated string');
      tokens.push({kind: 'string', value, start: offset + start, end: offset + i}); i++; continue;
    }
    const identifier = /^[a-zA-Z_$][\w$]*/.exec(source.slice(i));
    if (identifier) { tokens.push({kind: 'identifier', value: identifier[0]}); i += identifier[0].length; continue; }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(i));
    if (number) { tokens.push({kind: 'number', value: number[0]}); i += number[0].length; continue; }
    tokens.push({kind: ch, value: ch}); i++;
  }
  return tokens;
}

function literal(tokens, cursor, depth = 0) {
  if (depth > 16) throw Error('nesting limit');
  const token = tokens[cursor.i++];
  if (!token) throw Error('missing literal');
  if (token.kind === 'string' || token.kind === 'number' || (token.kind === 'identifier' && ['true','false','null'].includes(token.value))) return token;
  if (token.kind !== '{' && token.kind !== '[') throw Error('expression');
  const object = token.kind === '{', close = object ? '}' : ']', values = object ? new Map() : [];
  while (tokens[cursor.i]?.kind !== close) {
    if (object) {
      const key = tokens[cursor.i++];
      if (!key || !['identifier','string'].includes(key.kind) || values.has(key.value) || tokens[cursor.i++]?.kind !== ':') throw Error('object property');
      values.set(key.value, literal(tokens, cursor, depth + 1));
    } else {
      if (values.length >= 256) throw Error('array limit');
      values.push(literal(tokens, cursor, depth + 1));
    }
    if (tokens[cursor.i]?.kind === close) break;
    if (tokens[cursor.i++]?.kind !== ',') throw Error('literal separator');
  }
  if (tokens[cursor.i++]?.kind !== close) throw Error('unclosed literal');
  return {kind: object ? 'object' : 'array', values};
}

export function declaredArticleImages(html, baseUrl) {
  let page;
  try { page = new URL(baseUrl); } catch { return []; }
  const article = /^\/a\/(\d+)_(\d+)\/?$/.exec(page.pathname);
  if (page.protocol !== 'https:' || !['www.sohu.com','sohu.com'].includes(page.hostname) || !article) return [];
  const declarations = [];
  for (const script of inlineScripts(html)) {
    const source = html.slice(script.start, script.end);
    if (source.length > MAX_SCRIPT || Buffer.byteLength(source, 'utf8') > MAX_SCRIPT) { if (source.includes('cfgs')) return []; continue; }
    let tokens;
    try { tokens = lex(source, script.start); } catch { if (source.includes('cfgs')) return []; continue; }
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].kind !== 'identifier' || tokens[i].value !== 'cfgs') continue;
      if (tokens[i - 1]?.kind !== 'identifier' || !['var','let','const'].includes(tokens[i - 1]?.value) || (i > 1 && !['{','}',';'].includes(tokens[i - 2]?.kind)) || tokens[i + 1]?.kind !== '=') return [];
      try {
        const cursor = {i: i + 2}, config = literal(tokens, cursor);
        if (config.kind !== 'object' || ![';', '}', undefined].includes(tokens[cursor.i]?.kind)) return [];
        declarations.push(config); i = cursor.i - 1;
      } catch { return []; }
    }
  }
  if (declarations.length !== 1) return [];
  const config = declarations[0].values;
  if (config.get('news_id')?.kind !== 'string' || config.get('news_id').value !== article[1] || config.get('media_id')?.kind !== 'string' || config.get('media_id').value !== article[2]) return [];
  const list = config.get('imgsList');
  if (list?.kind !== 'array' || list.values.length > 64) return [];
  const images = [];
  for (const [index, item] of list.values.entries()) {
    const url = item.kind === 'object' ? item.values.get('url') : null;
    if (url?.kind !== 'string' || !url.value.trim() || [...item.values.values()].some(value => ['array','object'].includes(value.kind))) return [];
    images.push({value: url.value, locator: {kind: 'html_utf16_literal', start: url.start, end: url.end}, discovery: {kind: 'script-declared', adapter: ADAPTER, declarationPath: `cfgs.imgsList[${index}].url`}});
  }
  return images;
}
