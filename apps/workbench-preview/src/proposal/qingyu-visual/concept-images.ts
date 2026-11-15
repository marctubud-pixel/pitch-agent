import type { CopyBundle } from '../qingyu-themes/content';

export type ConceptImage = { url: string; alt: string; generationType: 'preview' };
export type DirectionConcept = {
  directionId: 'n7' | 'k4' | 'v2';
  description: string;
  notes: readonly [string, string];
  main: ConceptImage;
  sketches: readonly [ConceptImage, ConceptImage, ConceptImage];
  mockups: ConceptImage;
};
const image = (file: string, alt: string): ConceptImage => ({ url: `/visual-concepts/qingyu-20261110/${file}.png`, alt, generationType: 'preview' });
export const conceptImages = [
  {
    directionId: 'n7', description: '把品牌与用水信息做成两张名片，各自清楚，也彼此呼应。',
    notes: ['两块名片式信息场，先认青屿，再读虎跑泉用水。', '青色与山形贯穿两块信息，保留透明瓶身的轻盈感。'],
    main: image('n7-main', '两张名片方向的青屿500毫升透明瓶包装设计试稿'),
    sketches: [image('n7-sketch-1', '两张名片方向草图一'), image('n7-sketch-2', '两张名片方向草图二'), image('n7-sketch-3', '两张名片方向草图三')],
    mockups: image('n7-mockups', '两张名片方向的正面、侧面、背面模拟样机图板'),
  },
  {
    directionId: 'k4', description: '以泉水地理为线索，让一道纵向水流窗口引出虎跑山线。',
    notes: ['纵向窗口组织水流与山线，形成从泉到瓶的阅读动线。', '青色与透明留白共同表达地理线索，不补写茶种或工艺。'],
    main: image('k4-main', '一口到虎跑方向的青屿500毫升透明瓶包装设计试稿'),
    sketches: [image('k4-sketch-1', '一口到虎跑方向草图一'), image('k4-sketch-2', '一口到虎跑方向草图二'), image('k4-sketch-3', '一口到虎跑方向草图三')],
    mockups: image('k4-mockups', '一口到虎跑方向的正面、侧面、背面模拟样机图板'),
  },
  {
    directionId: 'v2', description: '把日常分享变成一张寄语卡，让瓶身留下寄件人的心意。',
    notes: ['寄语卡与寄件人叙事形成分享入口，连接看到虎跑与想到某个人。', '山形作为寄语中的地点记号，青色保持青屿的品牌识别。'],
    main: image('v2-main', '看见虎跑想起你方向的青屿500毫升透明瓶包装设计试稿'),
    sketches: [image('v2-sketch-1', '看见虎跑想起你方向草图一'), image('v2-sketch-2', '看见虎跑想起你方向草图二'), image('v2-sketch-3', '看见虎跑想起你方向草图三')],
    mockups: image('v2-mockups', '看见虎跑想起你方向的正面、侧面、背面模拟样机图板'),
  },
] satisfies readonly DirectionConcept[];

export function resolveDirectionConcept(bundle: CopyBundle, directionId: string): DirectionConcept | undefined {
  const ids = bundle.currentRound.directions.map(direction => direction.id);
  if (bundle.id !== 'qingyu-copy-full-r2-20261110' || bundle.currentRound.id !== 'r2' || ids.length !== 3 || new Set(ids).size !== 3 || !conceptImages.every(item => ids.includes(item.directionId))) return undefined;
  return conceptImages.find(item => item.directionId === directionId);
}
