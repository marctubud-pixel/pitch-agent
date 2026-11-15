import { conceptImages } from './concept-images';
import { displayReferences } from './display-references';
import type { GalleryDirection } from './VisualImageGallery';

const names = { n7: '两张名片', k4: '一口到虎跑', v2: '看见虎跑，想起你' };

export function qingyuGalleryDirections(): GalleryDirection[] {
  return conceptImages.map(({ directionId, sketches, main, mockups }) => {
    const name = names[directionId];
    return {
      id: directionId, name,
      references: displayReferences(directionId).map(ref => ({ src: ref.image, title: ref.title, alt: ref.alt })),
      sketches: sketches.map((image, index) => ({ src: image.url, title: name + ' · 草图 ' + (index + 1), alt: image.alt })),
      main: { src: main.url, title: name + ' · 主视觉', alt: main.alt },
      mockup: { src: mockups.url, title: name + ' · 样机', alt: mockups.alt },
    };
  });
}
