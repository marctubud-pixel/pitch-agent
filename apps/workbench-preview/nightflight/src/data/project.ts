import type { Stage, StageId } from '../types';

export const PRODUCT_NAME = '夜航';
export const PRODUCT_FULL = '夜航提案台';
export const BOT_NAME = '主理人';

export const EXAMPLE_BRIEF =
  '帮我为一个新中式茶饮品牌制作新品上市提案，面向年轻消费者，需要品牌研究、创意方向和视觉方案。';

export const STAGES: Stage[] = [
  { id: 'brief', index: 1, name: '简报与任务', summary: '读懂需求，拆成任务卡' },
  { id: 'research', index: 2, name: '研究', summary: '品类、竞品与人群' },
  { id: 'strategy', index: 3, name: '策略', summary: '核心主张与传播路径' },
  { id: 'copy', index: 4, name: '文案与主题', summary: '三个创意方向与主题文案' },
  { id: 'visual', index: 5, name: '视觉开发', summary: '参考、草图与主视觉' },
  { id: 'layout', index: 6, name: '版式', summary: '提案页面与预览' },
  { id: 'final', index: 7, name: '终审与交付', summary: '终稿、终审记录与交付' },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, Stage>;
