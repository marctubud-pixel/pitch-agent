/** Client-side image preparation: downscale for local storage and sample dominant colours. */

export interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
  dominantColors: string[];
}

const MAX_EDGE = 1280;

/** Messages in the interface language, passed in by the caller. */
export interface ImageMessages {
  unreadable: string;
  notImage: string;
  cannotProcess: string;
}

function loadImage(url: string, messages: ImageMessages): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(messages.unreadable));
    img.src = url;
  });
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export async function prepareImage(file: File, messages: ImageMessages): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error(messages.notImage);
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl, messages);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(messages.cannotProcess);
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

    const sample = document.createElement('canvas');
    sample.width = 24;
    sample.height = 24;
    const sctx = sample.getContext('2d')!;
    sctx.drawImage(img, 0, 0, 24, 24);
    const pixels = sctx.getImageData(0, 0, 24, 24).data;
    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }
    const dominantColors = [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((bk) => toHex(Math.round(bk.r / bk.count), Math.round(bk.g / bk.count), Math.round(bk.b / bk.count)));
    return { dataUrl, width, height, dominantColors };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
