import { compile } from '../deck-studio/engine';
import { buildStrategyIntersectionPage } from './intersection-page';
import type { Draft } from '../deck-studio/model';

export const strategySummaryIdentity = {
  draftId: 'qingyu-strategy-owner-summary-20261110-v1',
  title: '青屿包装策略',
  ownerBrief: '从研究结论出发，结合产品真实特质与目标用户，找到值得聚焦的交叉点；说明优先放大什么、为什么。',
};

export type StrategyBoard = Draft & { claimIds: readonly string[] };
export const strategySummaryBoards: readonly [StrategyBoard, StrategyBoard, StrategyBoard] = [
  {
    id: 'qingyu-owner-research', chapter: '研究结论',
    eyebrow: '01 · 研究结论', title: '茶味信息要清楚，产品特点要具体',
    template: { kind: 'summary.list', points: [
      { k: '人群 · 先看懂茶', d: '历史样本希望明确口味 68.8%、风味特征 61.5%、无糖标识 54.4%。' },
      { k: '竞品 · 已有多种解释', d: '七品牌样本从茶种、香气、冷泡和现泡等角度解释产品。' },
      { k: '启示 · 再说明产品特点', d: '一般茶味难以构成具体区别。先让人看懂在选什么茶，再说明青屿的产品特点。' },
    ] },
    claimIds: ['J1', 'J2'],
    caption: '亿欧2023年历史样本自报，非青屿目标人群实测；竞品为七品牌有目的抽样。任务启示为本稿归纳。',
    notes: 'R4P18、R4P19、R4P20 / EO23，原报告p11右栏；原稿J1、J2。信息诉求可能重叠，不能推导购买效果。',
  },
  {
    id: 'qingyu-owner-intersection', chapter: '方向交叉点',
    eyebrow: '02 · 方向交叉点', title: '从熟悉的茶，聚焦到具体的用水选择',
    template: { kind: 'summary.list', points: [
      { k: '研究 · 理解入口', d: '茶味、无糖等基础信息，是理解产品的入口。' },
      { k: '产品 · 具体资源', d: '茶种与口感接近市售产品；配方使用虎跑泉水。' },
      { k: '用户 · 任务人群', d: '便利店、电商选茶的25至34岁城市办公者；是否在意泉水尚待验证。' },
      { k: '交叉点 · 保持清楚，讲明用水', d: '基础信息清楚，把虎跑泉用水作为青屿可进一步讲清的产品特点。' },
    ] },
    claimIds: ['J1', 'J2', 'J3'],
    caption: '产品为用户补充设定，水源使用凭据待补；目标人群来自任务卡第1版，非研究所得。交叉点为策略判断。',
    notes: '原稿J1、J2、J3；U-PRODUCT-01；原任务卡第1版。虎跑与饮茶的文化联系仅为解释背景，不能作为消费者偏好证据。',
  },
  {
    id: 'qingyu-owner-focus', chapter: '策略发力点',
    eyebrow: '03 · 策略发力点', title: '放大虎跑泉用水，让青屿的产品选择更具体',
    template: {
      kind: 'summary.statement',
      statement: '放大虎跑泉用水\n让青屿的产品选择更具体',
      sub: '以具体水源与茶的关系建立产品识别，让这一选择与青屿建立联系。\n茶种与无糖信息保持清楚，泉水成为进一步了解产品的线索。',
    },
    claimIds: ['J1', 'J3', 'J4'],
    caption: '策略建议，用户接受度待验证。伊刻已有用水叙事；不能推导更好喝、健康、独家、溢价或购买优势。',
    notes: '原稿J1、J3及U-PRODUCT-01；伊刻用水叙事据前稿J4补充来源INIKIN-WATER。虎跑泉是本案可放大的具体资源，不等于水源概念无人使用。新稿不沿用旧稿三方审查结论。',
  },
];

export function prepareStrategySummary() {
  const pages = compile([...strategySummaryBoards], '青屿', { primary: '#002FA7', accent: '#A9C545', style: 'business', mode: 'light' });
  return pages.map(page => page.id === strategySummaryBoards[1].id ? buildStrategyIntersectionPage(strategySummaryBoards[1]) : page);
}
