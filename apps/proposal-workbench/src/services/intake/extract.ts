/**
 * Real, local text extraction. Nothing leaves the browser.
 *  - TXT / Markdown: decoded as UTF-8 (UTF-16 when it has a byte-order mark).
 *  - DOCX: the document XML read from the zip; paragraphs, tabs and line breaks kept.
 *  - PDF: pdf.js, loaded only when a PDF is chosen. Scanned PDFs have no text layer and say so.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { IntakeError, MAX_BRIEF_BYTES, type IntakeProgress } from '../../domain/intake';
import type { ExtractionSummary } from '../../domain/models';

export type FileKind = 'txt' | 'docx' | 'pdf';

export function detectKind(name: string, type: string): FileKind | 'doc' | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (ext === 'docx' || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (ext === 'doc' || type === 'application/msword') return 'doc';
  if (['txt', 'md', 'markdown', 'text'].includes(ext) || type.startsWith('text/')) return 'txt';
  return null;
}

export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, code: string) => {
    if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? all;
  });

/** Text of word/document.xml, paragraph by paragraph. */
export function docxText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
  } catch {
    throw new IntakeError('corrupt');
  }
  const xml = files['word/document.xml'];
  if (!xml) throw new IntakeError('corrupt');
  const body = strFromU8(xml);
  const paragraphs = body.split(/<\/w:p>/);
  const token = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g;
  const lines = paragraphs.map((p) => {
    let text = '';
    for (const match of p.matchAll(token)) {
      if (match[1] !== undefined) text += match[1];
      else text += match[0].startsWith('<w:tab') ? '\t' : '\n';
    }
    const bullet = /<w:numPr>/.test(p) ? '- ' : '';
    return text.trim() ? bullet + decodeXml(text) : '';
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function pdfText(bytes: Uint8Array, onProgress?: (p: IntakeProgress) => void): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === 'PasswordException') throw new IntakeError('encrypted');
    throw new IntakeError('corrupt', String((error as Error).message ?? error));
  }
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    const lines: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join('\n'));
    onProgress?.({ stage: 'extracting', ratio: i / doc.numPages });
  }
  await doc.destroy();
  return { text: pages.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), pages: doc.numPages };
}

export async function extractFile(file: File, onProgress?: (p: IntakeProgress) => void): Promise<{ text: string; extraction: ExtractionSummary }> {
  const kind = detectKind(file.name, file.type);
  if (kind === 'doc') throw new IntakeError('legacy_doc');
  if (!kind) throw new IntakeError('unsupported_type');
  if (file.size > MAX_BRIEF_BYTES) throw new IntakeError('too_large');
  if (file.size === 0) throw new IntakeError('empty');
  onProgress?.({ stage: 'reading' });
  const bytes = new Uint8Array(await file.arrayBuffer());
  onProgress?.({ stage: 'extracting', ratio: 0 });
  let text: string;
  let pages: number | null = null;
  const warnings: string[] = [];
  if (kind === 'txt') text = decodeText(bytes);
  else if (kind === 'docx') text = docxText(bytes);
  else {
    const result = await pdfText(bytes, onProgress);
    text = result.text;
    pages = result.pages;
  }
  text = text.replace(/\r\n?/g, '\n').trim();
  if (!text) throw new IntakeError(kind === 'pdf' ? 'no_text' : 'empty');
  if (kind === 'pdf' && pages && text.length / pages < 80) warnings.push('little_text');
  return { text, extraction: { method: kind === 'txt' ? 'plain_text' : kind, pages, warnings } };
}
