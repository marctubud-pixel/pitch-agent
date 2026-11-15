import { conceptImages } from './concept-images';
import { displayReferences } from './display-references';
import type { GalleryDirection } from './VisualImageGallery';

const names = { n7: '两张名片', k4: '一口到虎跑', v2: '看见虎跑，想起你' };

export function qingyuGalleryDirections(): GalleryDirection[] {
  return conceptImages.map(concept => {
    const { directionId, description, sketches, main, mockups } = concept;
    const name = names[directionId];
    return {
      id: directionId, name, description,
      format: 'portrait', extensionLabel: '包装延展',
      references: displayReferences(directionId).map(ref => ({ src: ref.image, title: ref.title, alt: ref.alt })),
      sketch: { src: sketches[0].url, title: name + ' · 构图草图', alt: sketches[0].alt },
      sketchComparison: 'previousSketch' in concept && concept.previousSketch ? {
        previous: { src: concept.previousSketch.url, title: '原稿 · 水流指向茶芽', alt: concept.previousSketch.alt },
        note: '原稿有盲评读成“泉水在浇灌茶树”。本次只改水流终点，两位未看过原稿的模型评审都读到泉水入杯、用来泡茶。用户选用茶杯版作为本案草图。',
      } : undefined,
      mains: [{ src: main.url, title: name + ' · 主视觉', alt: main.alt }],
      mockup: { src: mockups.url, title: name + ' · 样机', alt: mockups.alt },
    };
  });
}
