/** Built-in fictional Chinese briefs. Mapping applies only to these exact sample texts. */
import type { FieldOrigin, ProvenanceReason, TaskField } from '../../domain/models';
import type { SampleBrief } from '../../domain/intake';

interface SampleField {
  value: string | string[];
  origin: FieldOrigin;
  reason: ProvenanceReason;
  quotes: string[];
}
export interface SampleDefinition extends SampleBrief {
  text: string;
  fields: Partial<Record<TaskField, SampleField>>;
}

const KESTREL = `红隼咖啡 · 春季冷萃系列简报
本地工程演示，品牌与需求均为虚构。

品牌背景
红隼咖啡是一家拥有14家门店的独立烘焙品牌，计划推出三款单一产地罐装冷萃，在自有门店和两家区域超市销售。

目标
吸引原本在大型连锁购买冷咖啡的人群，并在一年内使罐装销售达到门店收入的15%。

受众
25至40岁的办公室工作者，每周至少两次在上班途中购买冰咖啡。

交付
先提供简短调研摘要及两至三个定位方向，供管理层选择；选定后再发展罐身设计方向。

约束
必须使用现有标识与红隼插画。不作咖啡因或提神方面的健康宣称。超市要求二月底前取得最终完稿。

时间
希望在夏季菜单变更前看到方向，与二月底的完稿要求可能冲突，需要确认。

资料
2025年品牌规范另行提供，并附现有柜台陈列照片。

待确认
尚未确定主打产地故事还是冷萃工艺。`;

const JUNIPER = '青柏铁路需要一份利兹至伦敦夜间新线路提案，面向轮班工作者和清晨出行者，11月14日提交，并沿用既有品牌。此为虚构的本地工程演示需求。';
const miss = (reason: ProvenanceReason = 'not_stated'): SampleField => ({ value: '', origin: 'missing', reason, quotes: [] });
const missList = (): SampleField => ({ value: [], origin: 'missing', reason: 'not_stated', quotes: [] });
const provided = (value: string | string[], quote: string): SampleField => ({ value, origin: 'provided', reason: 'stated', quotes: [quote] });

export const SAMPLES: SampleDefinition[] = [
  {
    id: 'kestrel', title: '红隼咖啡 · 春季系列简报', description: '完整简报示例，预算缺失、时间要求存在冲突。', fileName: '红隼咖啡_春季简报.txt', presentAs: 'file', text: KESTREL,
    fields: {
      projectName: { value: '红隼春季罐装冷萃系列', origin: 'suggested', reason: 'inferred', quotes: ['红隼咖啡 · 春季冷萃系列简报'] },
      brand: provided('红隼咖啡 · 单一产地罐装冷萃', '红隼咖啡是一家拥有14家门店的独立烘焙品牌'),
      background: provided('拥有14家门店的独立烘焙品牌，计划推出三款罐装冷萃，在门店及两家区域超市销售。', '红隼咖啡是一家拥有14家门店的独立烘焙品牌，计划推出三款单一产地罐装冷萃，在自有门店和两家区域超市销售。'),
      objectives: provided(['吸引连锁冷咖啡购买者。', '一年内使罐装销售达到门店收入的15%。'], '吸引原本在大型连锁购买冷咖啡的人群，并在一年内使罐装销售达到门店收入的15%。'),
      researchQuestions: { value: ['目标受众如何选择罐装咖啡？', '产地故事与冷萃工艺，哪个更有说服力？'], origin: 'suggested', reason: 'inferred', quotes: ['尚未确定主打产地故事还是冷萃工艺。'] },
      audience: provided('25至40岁、每周至少两次在上班途中购买冰咖啡的办公室工作者。', '25至40岁的办公室工作者，每周至少两次在上班途中购买冰咖啡。'),
      deliverableType: { value: '供管理层选择的定位提案', origin: 'suggested', reason: 'inferred', quotes: ['供管理层选择'] },
      deliverables: provided(['简短调研摘要。', '两至三个定位方向。', '选定后的罐身设计方向。'], '先提供简短调研摘要及两至三个定位方向，供管理层选择；选定后再发展罐身设计方向。'),
      constraints: provided(['使用现有标识与红隼插画。', '不作咖啡因或提神方面的健康宣称。', '超市要求二月底前取得最终完稿。'], '必须使用现有标识与红隼插画。不作咖啡因或提神方面的健康宣称。超市要求二月底前取得最终完稿。'),
      timeline: { value: '夏季菜单变更前看方向，二月底前交完稿；先后关系待确认。', origin: 'ambiguous', reason: 'conflict', quotes: ['希望在夏季菜单变更前看到方向，与二月底的完稿要求可能冲突，需要确认。'] },
      budget: miss(), references: provided(['2025年品牌规范。', '柜台陈列照片。'], '2025年品牌规范另行提供，并附现有柜台陈列照片。'),
      openQuestions: provided(['主打产地故事还是冷萃工艺？'], '尚未确定主打产地故事还是冷萃工艺。'),
    },
  },
  {
    id: 'juniper', title: '青柏铁路 · 一句话需求', description: '简短输入示例：未提供的任务卡字段继续留空。', fileName: '青柏铁路_需求.txt', presentAs: 'request', text: JUNIPER,
    fields: {
      projectName: { value: '青柏铁路夜间线路提案', origin: 'suggested', reason: 'inferred', quotes: ['青柏铁路需要一份利兹至伦敦夜间新线路提案'] },
      brand: provided('青柏铁路 · 利兹至伦敦夜间新线路', '青柏铁路需要一份利兹至伦敦夜间新线路提案'),
      background: miss(), objectives: missList(), researchQuestions: missList(),
      audience: provided('轮班工作者和清晨出行者', '面向轮班工作者和清晨出行者'),
      deliverableType: provided('提案', '需要一份利兹至伦敦夜间新线路提案'),
      deliverables: { value: ['一份提案，具体格式未说明。'], origin: 'ambiguous', reason: 'vague', quotes: ['夜间新线路提案'] },
      constraints: provided(['沿用既有品牌。'], '沿用既有品牌'), timeline: provided('11月14日提交。', '11月14日提交'),
      budget: miss(), references: missList(), openQuestions: missList(),
    },
  },
];
