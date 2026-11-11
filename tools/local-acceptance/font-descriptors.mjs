export function fontFaceDescriptors(buffer) {
  const fail = () => { throw new Error('EDITOR_FONT_METADATA_UNSUPPORTED'); };
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 12) fail();
  const view = new DataView(buffer);
  const signature = view.getUint32(0);
  if (signature !== 0x00010000 && signature !== 0x4f54544f) fail();
  const count = view.getUint16(4);
  if (!count || 12 + count * 16 > buffer.byteLength) fail();
  let os2;
  const tags = new Set();
  const ranges = [];
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16, tag = view.getUint32(entry);
    const offset = view.getUint32(entry + 8), length = view.getUint32(entry + 12);
    if (tags.has(tag) || offset + length > buffer.byteLength || length && offset < 12 + count * 16) fail();
    tags.add(tag);
    if (length) ranges.push({offset, end: offset + length});
    if (tag === 0x66766172) fail();
    if (tag === 0x4f532f32) os2 = {offset, length};
  }
  ranges.sort((a, b) => a.offset - b.offset);
  if (ranges.some((range, i) => i > 0 && range.offset < ranges[i - 1].end)) fail();
  if (!os2 || os2.length < 2) fail();
  const version = view.getUint16(os2.offset);
  const minimumLength = [78, 86, 96, 96, 96, 100][version];
  if (!minimumLength || os2.length < minimumLength) fail();
  const weight = view.getUint16(os2.offset + 4);
  const selection = view.getUint16(os2.offset + 62);
  if (weight < 1 || weight > 1000 || (selection & 1) && (selection & 512) || version < 4 && (selection & 512)) fail();
  return {weight: String(weight), style: selection & 1 ? 'italic' : selection & 512 ? 'oblique' : 'normal'};
}
