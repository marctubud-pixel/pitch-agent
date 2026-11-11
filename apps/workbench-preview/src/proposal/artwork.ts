import { createElement } from 'react';
import type { ArtSpec } from '../domain/proposal';
import { Art, artBox } from '../ui/art/Art';

export async function rasterize(spec: ArtSpec, ratio: [number, number], px = 1600, radii?: [number, number, number, number], mat = '#ece8df'): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const pxH = Math.round((px * ratio[1]) / ratio[0]);
  const whole = spec.kind !== 'scene';
  const [nw, nh] = artBox(spec);
  const pad = Math.round(Math.min(px, pxH) * 0.06);
  const scale = whole ? Math.min((px - 2 * pad) / nw, (pxH - 2 * pad) / nh) : 1;
  const [dw, dh] = whole ? [Math.round(nw * scale), Math.round(nh * scale)] : [px, pxH];
  let svg = renderToStaticMarkup(createElement(Art, whole ? { spec, round: 6 } : { spec, fit: 'slice', ratio }));
  svg = svg.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${dw}" height="${dh}"`);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Artwork could not be drawn.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    if (radii) {
      ctx.beginPath();
      ctx.roundRect(0, 0, px, pxH, radii.map((r) => Math.min(r * px, pxH / 2)));
      ctx.clip();
    }
    if (whole) {
      ctx.fillStyle = mat;
      ctx.fillRect(0, 0, px, pxH);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
      ctx.shadowBlur = Math.round(px * 0.02);
      ctx.shadowOffsetY = Math.round(px * 0.008);
      ctx.drawImage(img, Math.round((px - dw) / 2), Math.round((pxH - dh) / 2), dw, dh);
    } else {
      ctx.drawImage(img, 0, 0, px, pxH);
    }
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
