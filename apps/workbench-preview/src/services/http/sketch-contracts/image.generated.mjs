const IMAGE_LIMITS={bytes:8*1024*1024,pixels:20000000,count:4},safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v),mimeTypes=new Set(['image/png','image/jpeg']);
export function imageManifest(images, envelope) {
  let maxImages = IMAGE_LIMITS.count;
  let remainingBytes;
  if (envelope !== undefined) {
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || Object.keys(envelope).some(key => !['operation', 'limits'].includes(key)) || !['sketch-review-v2', 'final-visual-v1', 'complete-content-v1'].includes(envelope.operation) || !envelope.limits || typeof envelope.limits !== 'object' || Array.isArray(envelope.limits) || !['maxImages', 'maxBytes', 'maxPixels'].every(key => Number.isSafeInteger(envelope.limits[key]) && envelope.limits[key] > 0)) throw new Error('Invalid review image envelope');
    maxImages = envelope.limits.maxImages;
    remainingBytes = envelope.limits.maxBytes;
  }
  if (!Array.isArray(images) || images.length < 1 || images.length > maxImages) throw new Error(envelope === undefined ? 'Observation requires one to four images' : 'Review image count bound exceeded');
  const seen = new Set();
  return images.map(image => {
    if (!image || typeof image !== 'object' || Array.isArray(image)) throw new Error('Invalid or duplicate manifest image');
    const imageId = image.imageId ?? image.id;
    if (!safeId(imageId) || seen.has(imageId) || !/^[a-f0-9]{64}$/.test(image.sha256) || !mimeTypes.has(image.mediaType) || !Number.isSafeInteger(image.byteLength) || image.byteLength < 1 || image.byteLength > IMAGE_LIMITS.bytes) throw new Error('Invalid or duplicate manifest image');
    if (envelope !== undefined) {
      remainingBytes -= image.byteLength;
      if (remainingBytes < 0) throw new Error('Review aggregate byte bound exceeded');
    }
    seen.add(imageId);
    return {imageId, sha256: image.sha256, mediaType: image.mediaType, byteLength: image.byteLength};
  });
}