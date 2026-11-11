export type BoardAsset = {
  id: string;
  path: string;
  sha256: string;
} & ({ role: 'original'; sourceId: string; caseId: string; identity: string } | { role: 'generated-illustration'; label: string; caption: string });

export const BOARD_WIDTH = 1920;
export const BOARD_HEIGHT = 1080;
export const BOARD_FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Heiti SC", sans-serif';

export async function readBoardAsset(asset: BoardAsset, fetchAsset: typeof fetch = fetch): Promise<string> {
  if (!/^\/research-case\/[A-Za-z0-9_./-]+\.(png|jpe?g)$/.test(asset.path) || asset.path.includes('..') || !/^[0-9a-f]{64}$/.test(asset.sha256)) throw new Error(`图片身份不在本地图版清单内 · ${asset.id}`);
  const response = await fetchAsset(asset.path, { credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error(`图片读取失败 · ${asset.id} · HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== asset.sha256) throw new Error(`图片完整性校验失败 · ${asset.id}`);
  const data = new Uint8Array(bytes);
  const png = data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71;
  const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (!png && !jpeg) throw new Error(`图片格式无法用于图版 · ${asset.id}`);
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return `data:image/${png ? 'png' : 'jpeg'};base64,${btoa(binary)}`;
}

export async function embedBoardImages({ markup, assets, readAsset = readBoardAsset }: { markup: string; assets: readonly BoardAsset[]; readAsset?: (asset: BoardAsset) => Promise<string> }): Promise<string> {
  if (!markup.startsWith('<svg') || !markup.includes('viewBox="0 0 1600 900"') || /<(script|foreignObject|style|use)\b|\bon\w+\s*=|var\(|url\(/i.test(markup)) throw new Error('图版包含不能安全导出的绘制内容');
  const imageTags = [...markup.matchAll(/<image\b[^>]*\/?>(?:<\/image>)?/g)];
  const seen = new Set<string>();
  const replacements: { tag: string; embedded: string }[] = [];
  for (const match of imageTags) {
    const tag = match[0];
    const id = tag.match(/\bdata-asset-id="([^"]+)"/)?.[1];
    const path = tag.match(/(?:\s|:)href="([^"]+)"/)?.[1];
    const asset = assets.find(asset => asset.id === id);
    if (!asset || asset.path !== path || seen.has(asset.id)) throw new Error('图版图片与身份清单不一致，请重新载入后重试');
    seen.add(asset.id);
    const embedded = await readAsset(asset);
    if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(embedded)) throw new Error(`图片内嵌失败 · ${asset.id}`);
    replacements.push({ tag, embedded: tag.replace(/((?:\s|:)href=")[^"]+"/, `$1${embedded}"`) });
  }
  if (assets.some(asset => !seen.has(asset.id))) throw new Error('图版有图片尚未载入，请重新载入图片后重试');
  let output = markup;
  for (const { tag, embedded } of replacements) output = output.replace(tag, embedded);
  if (/\b(?:href|src)="(?!data:image\/)/.test(output)) throw new Error('导出图版仍包含外部绘制资源');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + output;
}

export async function rasterizeBoardSvg(markup: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG解码失败，请重试或下载SVG'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = BOARD_WIDTH;
    canvas.height = BOARD_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法建立PNG画布');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    context.drawImage(image, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG文件生成失败，请重试')), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportBoard({ svg, assets, format }: { svg: SVGSVGElement; assets: readonly BoardAsset[]; format: 'png' | 'svg' }): Promise<Blob> {
  if (document.fonts) await document.fonts.ready;
  const markup = await embedBoardImages({ markup: new XMLSerializer().serializeToString(svg.cloneNode(true)), assets });
  return format === 'svg' ? new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }) : rasterizeBoardSvg(markup);
}

export function downloadBoard(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
