import { conceptImages } from './concept-images';
import { displayReferences } from './display-references';
import type { GalleryDirection } from './VisualImageGallery';

const names = { n7: '两张名片', k4: '一口到虎跑', v2: '看见虎跑，想起你' };

export function qingyuGalleryDirections(): GalleryDirection[] {
  return conceptImages.map(({ directionId, description, sketches, main, mockups }) => {
    const name = names[directionId];
    return {
      id: directionId, name, description,
      format: 'portrait', extensionLabel: '包装延展',
      references: displayReferences(directionId).map(ref => ({ src: ref.image, title: ref.title, alt: ref.alt })),
      sketch: { src: sketches[0].url, title: name + ' · 构图草图', alt: sketches[0].alt },
      mains: [{ src: main.url, title: name + ' · 主视觉', alt: main.alt }],
      mockup: { src: mockups.url, title: name + ' · 样机', alt: mockups.alt },
    };
  });
}
