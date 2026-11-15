import { conceptImages } from './concept-images';
import { displayReferences } from './display-references';
import type { GalleryDirection } from './VisualImageGallery';

const names = { n7: '两张名片', k4: '一口到虎跑', v2: '看见虎跑，想起你' };

// Frame the printed label inside the transparent margins of the product photography.
const referenceScale: Record<string, number> = {
  'two-name-rangcha': 1.25,
  'two-name-chun': 4.4,
  'display-chun-wulong': 4.4,
  'trip-longjing': 3.5,
  'trip-changbai': 4,
  'display-inikin-moli': 1.3,
  'memory-rabbit': 2.2,
  'display-coke-share-series': 1.3,
};

export function qingyuGalleryDirections(): GalleryDirection[] {
  return conceptImages.map(({ directionId, description, sketches, main, mockups }) => {
    const name = names[directionId];
    return {
      id: directionId, name, description,
      references: displayReferences(directionId).map(ref => ({ src: ref.image, title: ref.title, alt: ref.alt,
        thumbnailScale: referenceScale[ref.id] })),
      sketches: sketches.map((image, index) => ({ src: image.url, title: name + ' · 草图 ' + (index + 1), alt: image.alt })),
      main: { src: main.url, title: name + ' · 主视觉', alt: main.alt },
      mockup: { src: mockups.url, title: name + ' · 样机', alt: mockups.alt },
    };
  });
}
