/**
 * KV demo: Northline Outdoor, autumn–winter seasonal key visual. An existing product with a
 * seasonal assignment, so research centres on brand history, comparable seasonal campaigns,
 * audience emotions and the visual cues of the season. Complete through delivery.
 *
 * Claim references (c1…c6) point at the Workbench research for project `northline`; their
 * support status is read from the service, not repeated here. Artwork is generated.
 */
import type { Proposal } from '../../../domain/proposal';
import { avg, brief, chart, claim, COBALT_STYLE, EDITORIAL_STYLE, kase, STUDIO_STYLE, LEADS, mock, poster, scene, scores, stage } from './helpers';

const FROST = ['#cfdde6', '#8fa3a8', '#5f7368', '#3e4c40', '#f3d9a4', '#1d241e'];
const GOLD = ['#ead9b8', '#a7a37a', '#7d8f6a', '#56664a', '#e8a548', '#1d241e'];
const DUSK = ['#33476b', '#25344f', '#1b2740', '#111829', '#f2b45a', '#0b101b'];
const WARMDUSK = ['#e7a46a', '#9c6a5a', '#5f4a4f', '#33303a', '#ffd38a', '#1b1820'];
const TERRAIN = ['#efe2cc', '#ddbf92', '#c98a3d', '#9a5f2a', '#f6e7c8', '#2a1d12'];
const TERRAIN_FROST = ['#dfe7ea', '#d8c3a0', '#c48a45', '#93602f', '#f4f7f8', '#2a1d12'];
const SUMMIT = ['#dfe7ee', '#9aa9b8', '#6b7c8e', '#3e4b5a', '#ffffff', '#1c232b'];
const STUDIO = ['#f1f1ee', '#d33f2a', '#9e2c1d', '#222222', '#ffffff', '#111111'];

const B = "北线户外";

const posterA = poster(scene('ridge-frost', FROST, { composition: 'low-horizon', seed: 3 }), "同一条路，冷了几分。", B, {
  subline: "秋冬叠穿系列",
  typeLayout: 'behind-ridge',
  ink: '#1d241e',
});
const posterB1 = poster(scene('fabric-terrain', TERRAIN, { composition: 'diagonal', seed: 2 }), "每一道山脊，都有层次。", B, {
  subline: "北线户外中间层，保暖表现经测试。",
  typeLayout: 'stacked-left',
  ink: '#2a1d12',
  typeface: 'grotesk',
});
const posterB2 = poster(scene('fabric-terrain', TERRAIN_FROST, { composition: 'diagonal', seed: 2, label: 'frost' }), "每一道山脊，都有层次。", B, {
  subline: "北线户外中间层，保暖表现经测试。",
  typeLayout: 'stacked-left',
  ink: '#2a1d12',
  typeface: 'grotesk',
});
const posterC1 = poster(scene('group-dusk', WARMDUSK, { composition: 'wide', seed: 5 }), "趁天未黑，一起出发。", B, {
  subline: "白昼渐短，同行更暖。",
  typeLayout: 'sky',
  ink: '#fff4e2',
});
const posterC2 = poster(scene('group-dusk', DUSK, { composition: 'wide', seed: 5 }), "趁天未黑，一起出发。", B, {
  subline: "白昼渐短，同行更暖。",
  typeLayout: 'sky',
  ink: '#fff4e2',
});

const sA = scores(["概念", 4.3], ["构图", 4.4], ["画面字体与文字处理", 4.2], ["季节是否在图像中可见", 4.5], ["能否作为主视觉", 4.6]);
const sB1 = scores(["概念", 4.2], ["构图", 4.0], ["画面字体与文字处理", 3.9], ["季节是否在图像中可见", 2.6, "肌理不带季节线索，只有标题在说秋天。"], ["能否作为主视觉", 3.8]);
const sB2 = scores(["概念", 4.3], ["构图", 4.1], ["画面字体与文字处理", 4.0], ["季节是否在图像中可见", 4.1, "山脊上的霜与低角度阳光。"], ["能否作为主视觉", 4.0]);
const sC1 = scores(["概念", 4.5], ["构图", 4.4], ["画面字体与文字处理", 4.3], ["季节是否在图像中可见", 4.6], ["能否作为主视觉", 4.5]);
const sC2 = scores(["概念", 4.6], ["构图", 4.5], ["画面字体与文字处理", 4.4], ["季节是否在图像中可见", 4.7], ["能否作为主视觉", 4.6]);

const themeA = scores(["清晰与记忆度", 4.5], ["品牌与产品融合", 4.8], ["受众共鸣", 4.0], ["差异化", 3.4], ["传播相关性", 3.6]);
const themeB = scores(["清晰与记忆度", 3.6], ["品牌与产品融合", 4.2], ["受众共鸣", 3.7], ["差异化", 4.6], ["传播相关性", 4.1]);
const themeC = scores(["清晰与记忆度", 4.6], ["品牌与产品融合", 4.1], ["受众共鸣", 4.7], ["差异化", 4.3], ["传播相关性", 4.4]);

export const northline: Proposal = {
  id: 'northline-kv',
  workbenchId: 'northline',
  name: "北线户外 · 秋冬主视觉提案",
  client: "北线户外（虚构品牌）",
  type: 'kv',
  summary: "以秋天第一个寒冷周末为节点，为叠穿系列制作季节主视觉。",
  cover: posterC2,
  mode: 'assisted',
  checkpoints: ['themes', 'delivery'],
  currentStage: 'delivery',
  stages: {
    brief: stage('done', "任务卡第1版已确认；三项未知信息保留，不作假设。", LEADS.brief, '2026-10-13T15:00:00Z'),
    research: stage('done', "调研已完成证据核验、充分性检查与交接，可进入策略阶段。", LEADS.research, '2026-10-22T11:30:00Z'),
    strategy: stage('done', "熟悉路线上的第一个寒冷周末：尚未被竞品占据的时刻。", LEADS.strategy, '2026-10-22T16:40:00Z'),
    themes: stage('done', "已形成三个方向。你保留了评审不建议采用的方向乙，推荐方向为丙。", LEADS.themes, '2026-10-23T11:05:00Z', 2),
    visual: stage('done', "三个方向的精修稿已通过模拟评审；乙、丙经过修订。", LEADS.visual, '2026-10-24T13:20:00Z', 2),
    content_review: stage('done', "排版前已通读叙事：精简4处表述，删除1句缺乏依据的文案。", LEADS.content_review, '2026-10-24T16:00:00Z'),
    layout: stage('done', "16页演示采用编辑式版式，包含户外、橱窗、电梯及数字屏应用示意。", LEADS.layout, '2026-10-25T08:10:00Z'),
    delivery: stage('waiting_for_you', "模拟终审完成，修正2处问题，等待人工确认交付。", LEADS.delivery, '2026-10-25T09:00:00Z'),
  },
  task: {
    assignment: "为北线户外的秋冬叠穿系列制作季节主视觉。",
    output: "探索三个创意方向，选出主视觉，并展示户外、橱窗、电梯及数字屏的应用。",
    occasion: "秋天第一个真正转冷的周末",
    scope: ["主视觉的横版与竖版", "三个有明确差异的创意方向及推荐理由", "简报指定渠道的应用示意", "可编辑的提案演示文稿"],
    inputs: [
      { id: 'in-1', kind: 'image', title: "上一个冬季的主视觉（客户档案演示）", note: "延续小比例行者、低海拔路线及左下角品牌标识。", art: poster(scene('ridge', GOLD, { seed: 1 }), "继续走吧。", B, { typeLayout: 'bottom-band', ink: '#f6f1e7' }) },
      { id: 'in-2', kind: 'link', title: "北线户外2025年品牌规范", note: "示例链接：品牌标识位置与字体规则。" },
      { id: 'in-3', kind: 'pdf', title: "零售伙伴排期草稿.pdf", note: "仅为草稿，日期尚未确认。" },
    ],
    unknowns: [
      { id: 'u-1', topic: "零售伙伴橱窗档期", why: "简报要求发布配合零售排期，但具体日期未确认。" },
      { id: 'u-2', topic: "媒体计划与投放数量", why: "简报未提供。应用示意不代表实际媒体购买。" },
      { id: 'u-3', topic: "受众年龄范围", why: "简报描述了周末步行者，但没有年龄范围，因此不作假设。" },
    ],
  },
  research: {
    adaptation:
      "本案为既有产品的季节传播：关注品牌一贯表达、同类品牌如何呈现季节、步行者转冷时的感受，以及可见的季节线索。不将品类规模估算或品牌重新定位加入本次任务。",
    summary:
      "本地演示资料将准备装备的触发点设为第一个寒冷周末。竞品多强调登顶或产品陈列，与秋日短途结伴步行不同。创意空间是熟悉路线刚刚转冷的那一天。",
    sections: [
      {
        id: 'brand',
        title: "品牌与产品",
        summary: "北线户外以可抵达的路线、风景中的小比例人物为特征。中间层产品仅有保暖和透气方面的测试记录。",
        findings: [
          { id: 'nb1', kind: 'background', text: "2023至2025年的演示主视觉采用单人、低海拔路线、开阔风景及左下角标识。", claimRef: null, note: "客户档案演示" },
          { id: 'nb2', kind: 'background', text: "内部演示文件记录了保暖与透气测试，不支持防水宣称。", claimRef: null, note: "面料测试摘要（内部文件演示）" },
        ],
        groups: [
          {
            id: 'g-archive',
            title: "北线户外2023—2025主视觉",
            kind: 'background',
            takeaway: "一致的识别线索：小人物、日常风景、克制的文字。",
            items: [
              { id: 'k-arch-23', title: "2023年秋季", caption: "正午的山脊小路。", art: poster(scene('ridge', GOLD, { seed: 7 }), "走得比想象更远。", B, { typeLayout: 'bottom-band' }), source: "客户档案（演示插画）", date: '2023', applicability: "直接参考品牌过去的视觉表达。", limitation: null },
              { id: 'k-arch-24', title: "2024年冬季", caption: "阴天里的山谷步行。", art: poster(scene('ridge', ['#d5d9d6', '#9aa39b', '#738070', '#4d5a4c', '#e9e2cf', '#1d241e'], { seed: 9 }), "照样出发。", B, { typeLayout: 'bottom-band' }), source: "客户档案（演示插画）", date: '2024', applicability: "直接参考。", limitation: null },
              { id: 'k-arch-25', title: "2025年冬季", caption: "夕阳下的独行者。", art: poster(scene('ridge', GOLD, { seed: 1 }), "继续走吧。", B, { typeLayout: 'bottom-band' }), source: "客户档案（演示插画）", date: '2025', applicability: "直接参考。", limitation: null },
            ],
          },
        ],
        chart: null,
      },
      {
        id: 'category',
        title: "品类惯例与竞品活动",
        summary: "演示案例中的季节发布分为登顶远征与技术产品陈列，两者都未聚焦熟悉路线上的第一个寒冷周末。",
        findings: [
          { id: 'nc1', kind: 'evidence', text: "演示资料将叠穿咨询增加的节点设在初秋，早于冬季系列集中上市。", claimRef: 'c2', note: null },
          { id: 'nc2', kind: 'evidence', text: "演示访谈指出，单按面料技术分类会增加选择叠穿产品的难度。", claimRef: 'c4', note: null },
          { id: 'nc3', kind: 'evidence', text: "演示橱窗记录中，十月初仍在展示夏季系列。", claimRef: 'c6', note: null },
        ],
        groups: [
          {
            id: 'g-competitors',
            title: "竞品季节传播",
            kind: 'comparison',
            takeaway: "登顶与白底产品图占主导，强调性能而非季节里的日常乐趣。",
            items: [
              { id: 'k-summit', title: "竞品甲 · 越过寒意", caption: "黎明时分雪峰上的攀登者。", art: scene('summit', SUMMIT, { seed: 2 }), source: "竞品传播（演示插画）", date: "2025年10月", applicability: "直接比较：相同品类与季节。", limitation: "每个品牌仅一个案例，不是完整市场审计。" },
              { id: 'k-studio', title: "竞品乙 · 冬季外套", caption: "白底外套图及面料功能说明。", art: scene('studio-jacket', STUDIO, { seed: 1 }), source: "竞品传播（演示插画）", date: "2025年11月", applicability: "直接比较。", limitation: "每个品牌仅一个案例，不是完整市场审计。" },
              { id: 'k-summit2', title: "竞品丙 · 走向更高处", caption: "山脊线上的远征小队。", art: scene('summit', ['#e8ecef', '#b3bcc6', '#7f8b98', '#4b5663', '#f4c96a', '#1c232b'], { seed: 6 }), source: "竞品传播（演示插画）", date: "2025年11月", applicability: "直接比较。", limitation: null },
            ],
          },
        ],
        chart: {
          id: 'ch-launch',
          kind: 'bar',
          title: "竞品冬季传播的发布时点",
          measure: "六个演示案例按半月分组的数量",
          data: [
            { label: "10月上旬", value: 0 },
            { label: "10月下旬", value: 1 },
            { label: "11月上旬", value: 3, highlight: true },
            { label: "11月下旬", value: 2 },
          ],
          note: "六个虚构案例的工程演示统计，不是市场数据。",
          demoData: true,
        },
      },
      {
        id: 'audience',
        title: "受众与使用场景",
        summary: "转冷是一种可感知的时刻。演示访谈将检查装备的节点设为第一个寒冷周末，具体路线让购买理由更容易理解。",
        findings: [
          { id: 'na1', kind: 'evidence', text: "演示访谈描述：准备装备从第一个寒冷周末开始，而非固定日期。", claimRef: 'c1', note: null },
          { id: 'na2', kind: 'evidence', text: "能够想象具体使用路线时，一件叠穿单品更容易被理解为值得提前购买。", claimRef: 'c3', note: null },
          { id: 'na3', kind: 'unverified', text: "演示资料中还出现季末送礼场景，因此购买者与穿着者可能不同。", claimRef: null, note: "仅有演示店员意见，未纳入引用来源，也未用于策略结论。" },
        ],
        groups: [
          {
            id: 'g-moments',
            title: "步行者描述的时刻",
            kind: 'background',
            takeaway: "访谈主题的演示插画，并非真实参与者照片。",
            items: [
              { id: 'k-breath', title: "看得见的呼气", caption: "第一次能看见自己呼气的早晨。", art: scene('ridge-frost', FROST, { seed: 11, composition: 'close-up' }), source: "步行者访谈（模拟笔记）", date: "2026年10月", applicability: "受众情绪线索，仅为定性演示。", limitation: "只有一轮模拟访谈。" },
              { id: 'k-flask', title: "栅栏边的保温壶", caption: "停下来喝一口热饮。", art: scene('thermos', ['#d9e2e6', '#6f7f74', '#b5532f', '#3e4c40', '#f2e6d0', '#1d241e'], { seed: 2 }), source: "步行者访谈（模拟笔记）", date: "2026年10月", applicability: "受众情绪线索，仅为定性演示。", limitation: null },
              { id: 'k-group', title: "天黑前回家", caption: "短一点，一起走。", art: scene('group-dusk', WARMDUSK, { seed: 3 }), source: "步行俱乐部通讯（虚构）", date: "2026年秋季", applicability: "场景线索，仅为定性演示。", limitation: null },
            ],
          },
        ],
        chart: {
          id: 'ch-worth',
          kind: 'bar',
          title: "哪些理由让叠穿单品显得值得购买",
          measure: "提及各理由的模拟访谈人数，样本12人",
          data: [
            { label: "想象具体路线", value: 9, highlight: true },
            { label: "朋友推荐", value: 4 },
            { label: "价格优惠", value: 3 },
            { label: "面料技术", value: 2 },
          ],
          note: "模拟访谈笔记，可多选；仅为工程演示，不是真实研究。",
          demoData: true,
        },
      },
      {
        id: 'context',
        title: "季节与文化背景",
        summary: "演示叙事将秋天描述为短途结伴步行、日落提前与归途停留的季节。低角度阳光、初霜、呼气与亮起的窗应出现在画面中。",
        findings: [
          { id: 'nx1', kind: 'evidence', text: "虚构俱乐部通讯将秋日步行描述为更短、更社交的活动。", claimRef: 'c5', note: null },
          { id: 'nx2', kind: 'background', text: "第一个寒冷周末的视觉线索：晨霜、低角度阳光、呼气及傍晚亮灯的窗。", claimRef: null, note: "案头资料与场地观察演示" },
        ],
        groups: [
          {
            id: 'g-inspiration',
            title: "跨行业灵感",
            kind: 'inspiration',
            takeaway: "暖冷对比、织物肌理及复古旅行海报可供画法参考，不代表受众偏好。",
            items: [
              { id: 'k-cabin', title: "酒店冬季传播", caption: "蓝调时分的一扇暖窗。", art: scene('cabin-window', DUSK, { seed: 4 }), source: "酒店广告（演示插画）", date: '2025', applicability: "仅供暖冷对比手法参考。", limitation: "品类与受众均不同。" },
              { id: 'k-knit', title: "针织品画册", caption: "掠过织物的斜射光。", art: scene('knit', ['#e9dcc8', '#c9a77c', '#a97d4f', '#7a5634', '#f7ecd8', '#2a1d12'], { seed: 1 }), source: "时装画册（演示插画）", date: '2026', applicability: "仅供肌理转化为地景的手法参考。", limitation: "不同品类。" },
              { id: 'k-travel', title: "20世纪70年代铁路旅行海报", caption: "平涂山丘与鲜明天空。", art: scene('catalogue-1970', ['#f0e2c2', '#e0a05a', '#7d8f6a', '#3e5a4e', '#c94f3a', '#1d241e'], { seed: 2 }), source: "档案海报（演示插画）", date: '1970s', applicability: "仅供平面化风景的画法参考。", limitation: "历史风格不代表当下受众喜好。" },
            ],
          },
        ],
        chart: null,
      },
    ],
  },
  strategy: {
    question: "如何让北线户外在季节转冷时被想起，使人们在第一个寒冷周末之前，而非之后，想到添一件叠穿单品？",
    structure: 'question-parallel-synthesis',
    circles: {
      category: {
        title: "品类：山峰与性能",
        points: [
          { text: "季节发布多呈现登顶场景或白底产品图。", evidence: [kase('k-summit', "竞品甲"), kase('k-studio', "竞品乙")] },
          { text: "演示案例多在11月发布，10月初的橱窗仍呈现夏季。", evidence: [chart('ch-launch', "发布时点"), claim('c6', "橱窗观察演示")] },
          { text: "按面料分类会增加选择难度。", evidence: [claim('c4', "店员交流演示")] },
        ],
      },
      brand: {
        title: "北线户外：如实呈现日常路线",
        points: [
          { text: "持续以风景中的小比例人物呈现可抵达路线。", evidence: [kase('k-arch-25', "2025年主视觉"), kase('k-arch-23', "2023年主视觉")] },
          { text: "中间层保暖表现有测试依据，不扩大性能宣称。", evidence: [brief('constraints', "简报约束")] },
        ],
      },
      audience: {
        title: "步行者：第一个寒冷周末",
        points: [
          { text: "第一个寒冷周末触发装备准备。", evidence: [claim('c1', "模拟步行访谈")] },
          { text: "能想象路线时，产品用途更具体。", evidence: [claim('c3', "模拟步行访谈"), chart('ch-worth', "理由")] },
          { text: "秋日步行更短，也更适合同行。", evidence: [claim('c5', "虚构俱乐部通讯")] },
        ],
      },
    },
    intersection: {
      insight: "熟悉路线上的第一个寒冷周末：竞品尚未占据、品牌风景能够承载、步行者能够感知的时刻。",
      why: "品类强调高山；品牌立足日常路线；模拟访谈聚焦某个具体转冷的周末。",
    },
    argument: [
      { step: "决定发生在某一天，而非日历上的日期。", detail: "演示访谈中的人们在第一个寒冷周末检查装备；门店叠穿咨询则早于冬季系列上市。", evidence: [claim('c1', "模拟访谈"), claim('c2', "渠道调查演示")] },
      { step: "这是日常的同行时刻，而非英雄式远征。", detail: "秋日短途结伴步行，与竞品常用的登顶图像不同。", evidence: [claim('c5', "虚构通讯"), kase('k-summit', "竞品甲")] },
      { step: "品牌已有相近的表达基础。", detail: "过去的小人物与日常路线，能够自然承接这个时刻。", evidence: [kase('k-arch-25', "2025年主视觉")] },
      { step: "因此，寒意必须在画面里。", detail: "初霜、低光、呼气与暖窗共同表达季节，不能只依赖标题。", evidence: [kase('k-breath', "看得见的呼气")] },
    ],
    conclusion: "以熟悉路线上的首个寒冷周末为切口，让画面本身传达冷意。",
    answer: "在竞品冬季传播到来前，北线户外先呈现熟悉路线转冷的那一天。",
    opportunities: [
      { id: 'o1', title: "同一条路，第一场霜", idea: "保留熟悉路线，让季节改变周围的景象。", because: "延续品牌识别，并加入初寒清晨的视觉线索。", evidence: [kase('k-arch-25', "2025年主视觉"), kase('k-breath', "呼气")], leadsTo: 'A' },
      { id: 'o2', title: "把叠穿画成地景", idea: "让中间层织物肌理成为步行路线上的山丘。", because: "演示访谈强调具体使用场景，产品可以转化为画面中的路线。", evidence: [claim('c3', "想象那段路")], leadsTo: 'B' },
      { id: 'o3', title: "天黑之前，一起走", idea: "用蓝调时分的短途同行，以及终点的暖光表现秋日社交。", because: "在这段季节叙事里，傍晚来临成为同行场景的触发点。", evidence: [claim('c5', "虚构通讯"), kase('k-group', "天黑前回家")], leadsTo: 'C' },
    ],
  },
  themes: {
    copyDirection: "沿用品牌短句、口语、现在时的表达，不使用技术术语，也不夸张渲染寒冷。",
    historicalNote: "既有演示标题较短，配合克制的副文案；保持简短，但不强迫所有方向使用相同句式。",
    directions: [
      {
        id: 'A',
        mechanism: 'evolution',
        name: "初霜",
        slogan: "同一条路，冷了几分。",
        subline: "北线户外秋冬叠穿系列。",
        rationale: "保留熟悉路线与小人物，让初霜、低光和呼气表达季节变化。",
        connections: { brand: "直接延续2023至2025年的演示主视觉。", audience: "呼应模拟访谈描述的第一个寒冷周末。", assignment: "具有清晰品牌识别的季节主视觉。" },
        difference: "只改变天气的方向：连续性本身就是创意。",
        copyLines: ["同一条路，冷了几分。", "熟悉的路，多了寒意。", "初霜改变景象，不改变出发的计划。"],
        color: '#9fb7c9',
        scores: themeA,
        challenges: [{ claim: "模拟品牌融合评分为4.8。", challenge: "过度延续可能被理解为去年的画面加了一层霜。", resolution: "部分接受建议：让寒冷成为画面主题，而不是滤镜。", outcome: 'partly_upheld' }],
        brandView: "识别清晰，品牌团队理解成本较低。",
        audienceView: "克制易辨认，但未必能让快速浏览者停留。",
        reviewOutcome: 'passed',
        disposition: 'kept',
      },
      {
        id: 'B',
        mechanism: 'product',
        name: "温暖地形",
        slogan: "每一道山脊，都有层次。",
        subline: "北线户外中间层，保暖表现经测试。",
        rationale: "将抓绒肌理转化为山丘，让产品与步行场景成为同一画面。",
        connections: { brand: "突出中间层产品，不添加未经支持的性能宣称。", audience: "帮助步行者想象产品的使用位置。", assignment: "以产品为主角的季节视觉方向。" },
        difference: "唯一把产品直接化为地景的方向。",
        copyLines: ["每一道山脊，都有层次。", "把温暖画成地图。", "为你常走的山路而做。"],
        color: '#c98a3d',
        scores: themeB,
        challenges: [{ claim: "模拟差异化评分为4.6。", challenge: "肌理地景在小尺寸下可能过于抽象，文案也可能被误读为技术承诺。", resolution: "副文案限定为保暖测试；小尺寸保留行者以建立尺度。", outcome: 'upheld' }],
        brandView: "在测试依据范围内呈现产品。",
        audienceView: "视觉突出，但需要多看一眼才能理解。",
        reviewOutcome: 'passed_with_notes',
        disposition: 'kept_by_you_despite_review',
      },
      {
        id: 'C',
        mechanism: 'audience',
        name: "天黑之前",
        slogan: "趁天未黑，一起出发。",
        subline: "白昼渐短，同行更暖。",
        rationale: "以归途中的小队、渐暗天色和村落暖窗，放大秋日步行的社交感。",
        connections: { brand: "熟悉路线，有人同行。", audience: "来自模拟访谈与俱乐部资料：秋日步行更短，更适合同伴同行。", assignment: "有明确使用场景的季节主视觉。" },
        difference: "唯一聚焦同行者及终点暖意的方向。",
        copyLines: ["趁天未黑，一起出发。", "白昼短了，路线没变，同伴更好。", "赶在亮灯前回来，刚刚好。"],
        color: '#23334d',
        scores: themeC,
        challenges: [{ claim: "模拟受众共鸣评分为4.7。", challenge: "若以酒馆为终点，可能暗示饮酒是步行的一部分。", resolution: "只保留村落暖窗，不出现酒杯或吧台；人物正在步行。", outcome: 'partly_upheld' }],
        brandView: "比品牌惯常表达更温暖，但保持真实克制。",
        audienceView: "更贴近模拟访谈描述的秋日场景。",
        reviewOutcome: 'passed',
        disposition: 'recommended',
      },
    ],
    recommendation: {
      id: 'C',
      reasons: ["模拟传播平均分最高，为4.42；受众方向的演示依据也更充分。", "蓝调时分、低光与暖窗，使季节存在于画面内部。", "与竞品的登顶及产品陈列惯例形成清晰差异。"],
    },
    directorNote: "模拟评审建议用更轻量的产品创意替换方向乙。你选择保留一个大胆的产品方向，原评审意见继续保留。",
  },
  visual: {
    branches: [
      {
        directionId: 'A',
        search: { seeking: "同一处风景，第一个转冷的清晨。", borrow: ["霜的表面质感", "低角度斜射光", "通过呼气建立人物尺度"], notFor: "简报排除远征场景，因此不使用雪峰。" },
        references: [
          { id: 'ar1', title: "日出时结霜的田野", origin: 'cross_industry', art: scene('ridge-frost', FROST, { seed: 21, composition: 'close-up' }), borrow: "前景的霜接住低角度阳光。", verdict: 'selected', reason: "不用下雪，也能让寒冷可见。" },
          { id: 'ar2', title: "北线户外2025年主视觉", origin: 'task_matched', art: poster(scene('ridge', GOLD, { seed: 1 }), "继续走吧。", B, { typeLayout: 'bottom-band' }), borrow: "引入画面的路线与小比例人物。", verdict: 'selected', reason: "以品牌既有作品锚定构图。" },
          { id: 'ar3', title: "竞品黎明登顶画面", origin: 'task_matched', art: scene('summit', SUMMIT, { seed: 3 }), borrow: "仅参考黎明光线。", verdict: 'rejected', reason: "远征场景与可抵达路线的约束冲突。" },
          { id: 'ar4', title: "天气应用季节开屏", origin: 'cross_industry', art: scene('contour', ['#dbe6ee', '#9fb7c9', '#6f8ea6', '#3f5d77', '#f3d9a4', '#1d2a36'], { seed: 4 }), borrow: "温度提示手法。", verdict: 'rejected', reason: "更像屏幕界面，缺少风景感。" },
        ],
        referenceNote: "四个候选中保留两个：一个提供冷意，一个提供品牌构图。",
        sketches: [
          { id: 'as1', title: "低地平线，路线引入", art: scene('ridge-frost', FROST, { sketch: true, composition: 'low-horizon', seed: 3 }), scores: scores(["概念", 4.3], ["构图", 4.4], ["视觉层次", 4.0], ["品牌与季节", 4.5]), verdict: 'selected', reason: "天空留出文字空间，路线引导视线找到行者。" },
          { id: 'as2', title: "前景霜面特写", art: scene('ridge-frost', FROST, { sketch: true, composition: 'close-up', seed: 3 }), scores: scores(["概念", 3.8], ["构图", 3.6], ["视觉层次", 3.2], ["品牌与季节", 4.1]), verdict: 'rejected', reason: "更像霜的研究图，行者消失了。" },
          { id: 'as3', title: "行者位于山脊中央", art: scene('ridge-frost', FROST, { sketch: true, composition: 'centered', seed: 3 }), scores: scores(["概念", 3.5], ["构图", 3.4], ["视觉层次", 3.9], ["品牌与季节", 3.6]), verdict: 'rejected', reason: "构图静止，接近登顶姿态。" },
        ],
        sketchNote: "草图仅评估创意、构图、层次及品牌季节表达，不按完成度评判。",
        refined: [
          {
            version: 1,
            art: posterA,
            explanation: "去年画面中的路线迎来初霜。低光照亮霜面与呼气，标题置于远处山脊之后，让风景承载文字。",
            scores: sA,
            requirements: [
              { text: "季节融入画面", met: true, note: "霜与可见的呼气。" },
              { text: "可抵达的低海拔路线", met: true, note: '' },
              { text: "不添加技术性能宣称", met: true, note: '' },
              { text: "能否作为主视觉", met: true, note: "检查公交站及数字屏中的阅读效果。" },
            ],
            status: 'accepted',
            challenge: null,
          },
        ],
        views: [],
        mockups: [
          { label: "门店橱窗", why: "演示观察中十月初的橱窗仍展示夏季，此处更需要季节识别。", art: mock('store-window', posterA) },
          { label: "公交站灯箱", why: "简报指定的户外投放示意。", art: mock('bus-shelter', posterA) },
        ],
      },
      {
        directionId: 'B',
        search: { seeking: "材料如何成为一个地方。", borrow: ["微距肌理转化为地形", "等高线", "掠过肌理的暖色斜光"], notFor: "白底产品图正是本方向要避开的惯例。" },
        references: [
          { id: 'br1', title: "地形图印刷品", origin: 'cross_industry', art: scene('contour', ['#efe6d6', '#d4b88f', '#b98c5a', '#8a6038', '#f6ecdc', '#2a1d12'], { seed: 7 }), borrow: "用等高线将肌理转化为地形。", verdict: 'selected', reason: "连接面料与路线。" },
          { id: 'br2', title: "针织画册微距图", origin: 'cross_industry', art: scene('knit', ['#e9dcc8', '#c9a77c', '#a97d4f', '#7a5634', '#f7ecd8', '#2a1d12'], { seed: 3 }), borrow: "斜射光让针织肌理看起来像山丘。", verdict: 'selected', reason: "提供创意所需的光线机制。" },
          { id: 'br3', title: "竞品白底外套图", origin: 'task_matched', art: scene('studio-jacket', STUDIO, { seed: 2 }), borrow: '—', verdict: 'rejected', reason: "需要避开的表现惯例。" },
          { id: 'br4', title: "陶瓷釉面特写", origin: 'cross_industry', art: scene('perfume-glass', ['#e8e2d8', '#b9a48a', '#8c7660', '#5b4a3c', '#f4efe6', '#2a1d12'], { seed: 1 }), borrow: "表面层次。", verdict: 'rejected', reason: "质感好，但缺少路线，也没有步行关联。" },
        ],
        referenceNote: "跨行业参考提供表现手法，不证明步行者偏好这种画法。",
        sketches: [
          { id: 'bs1', title: "纯肌理铺满画面", art: scene('fabric-terrain', TERRAIN, { sketch: true, composition: 'close-up', seed: 2 }), scores: scores(["概念", 3.9], ["构图", 3.5], ["视觉层次", 3.0], ["品牌与季节", 3.2]), verdict: 'rejected', reason: "缺少尺度，容易读成抽象图形。" },
          { id: 'bs2', title: "肌理山脊与小行者", art: scene('fabric-terrain', TERRAIN, { sketch: true, composition: 'diagonal', seed: 2 }), scores: scores(["概念", 4.4], ["构图", 4.1], ["视觉层次", 4.0], ["品牌与季节", 3.9]), verdict: 'selected', reason: "行者建立尺度，使肌理成为地形。" },
          { id: 'bs3', title: "左侧产品，右侧风景", art: scene('fabric-terrain', TERRAIN, { sketch: true, composition: 'split', seed: 2 }), scores: scores(["概念", 3.4], ["构图", 3.6], ["视觉层次", 3.3], ["品牌与季节", 3.5]), verdict: 'rejected', reason: "偏向解释而非呈现，两幅画面相互竞争。" },
        ],
        sketchNote: "草图仅评估创意、构图、层次及品牌季节表达，不按完成度评判。",
        refined: [
          {
            version: 1,
            art: posterB1,
            explanation: "抓绒山丘间，有一位行者经过。",
            scores: sB1,
            requirements: [
              { text: "季节融入画面", met: false, note: "画面适合任何季节，秋天仅存在于标题里。" },
              { text: "不添加技术性能宣称", met: true, note: '' },
              { text: "能否作为主视觉", met: true, note: '' },
            ],
            status: 'superseded',
            challenge: { claim: "模拟概念评分为4.2。", challenge: "季节只存在于标题中，尚未满足本次简报。", resolution: "退回修订：让寒冷出现在地形本身。", outcome: 'upheld' },
          },
          {
            version: 2,
            art: posterB2,
            explanation: "结霜清晨的抓绒地形：霜勾出山脊，低光掠过绒面，一位行者提供尺度。",
            scores: sB2,
            requirements: [
              { text: "季节融入画面", met: true, note: "霜覆盖山脊，阳光低斜。" },
              { text: "不添加技术性能宣称", met: true, note: "副文案限定为保暖测试。" },
              { text: "能否作为主视觉", met: true, note: "数字屏裁切保留行者，维持尺度。" },
            ],
            status: 'accepted',
            challenge: null,
          },
        ],
        views: [],
        mockups: [
          { label: "电梯屏", why: "近距离观看适合肌理主导的图像。", art: mock('elevator', posterB2) },
          { label: "竖版数字屏", why: "检查小尺寸下肌理是否仍能被理解。", art: mock('phone', posterB2) },
        ],
      },
      {
        directionId: 'C',
        search: { seeking: "暖光与冷色暮色相遇，画面中有同行的人。", borrow: ["蓝调时分的暖窗", "小队人物剪影", "暖冷色分区"], notFor: "不使用酒吧及饮酒场景。" },
        references: [
          { id: 'cr1', title: "酒店冬季传播", origin: 'cross_industry', art: scene('cabin-window', DUSK, { seed: 4 }), borrow: "以暖窗作为目的地。", verdict: 'selected', reason: "呈现暖冷对比，不展示酒吧。" },
          { id: 'cr2', title: "步行俱乐部通讯图片", origin: 'task_matched', art: scene('group-dusk', WARMDUSK, { seed: 8, composition: 'close-up' }), borrow: "合理的小队规模与行走节奏。", verdict: 'selected', reason: "让人物场景更可信。" },
          { id: 'cr3', title: "节日灯笼巡游", origin: 'cross_industry', art: scene('festival-lanterns', DUSK, { seed: 2 }), borrow: "点状灯光。", verdict: 'rejected', reason: "节庆感过强，改变了原定场景。" },
          { id: 'cr4', title: "酒馆室内广告", origin: 'cross_industry', art: scene('cabin-window', WARMDUSK, { seed: 9, composition: 'close-up' }), borrow: 'Glow.', verdict: 'rejected', reason: "容易让人以为饮酒才是步行目的。" },
        ],
        referenceNote: "一份同任务参考校准人物，一份跨行业参考提供灯光手法。",
        sketches: [
          { id: 'cs1', title: "山脊小队与下方村落", art: scene('group-dusk', DUSK, { sketch: true, composition: 'wide', seed: 5 }), scores: scores(["概念", 4.6], ["构图", 4.4], ["视觉层次", 4.3], ["品牌与季节", 4.6]), verdict: 'selected', reason: "一次阅读里能看见路线、人物和目的地。" },
          { id: 'cs2', title: "近距离照亮人脸", art: scene('group-dusk', DUSK, { sketch: true, composition: 'close-up', seed: 5 }), scores: scores(["概念", 3.7], ["构图", 3.8], ["视觉层次", 3.9], ["品牌与季节", 3.4]), verdict: 'rejected', reason: "失去路线，更像人物肖像。" },
          { id: 'cs3', title: "天空前的人物剪影", art: scene('group-dusk', DUSK, { sketch: true, composition: 'low-horizon', seed: 5 }), scores: scores(["概念", 3.9], ["构图", 4.0], ["视觉层次", 3.8], ["品牌与季节", 3.7]), verdict: 'rejected', reason: "只有暮色，没有温暖的目的地。" },
        ],
        sketchNote: "草图仅评估创意、构图、层次及品牌季节表达，不按完成度评判。",
        refined: [
          {
            version: 1,
            art: posterC1,
            explanation: "日落时，小队走完最后一段路，村落就在下方。",
            scores: sC1,
            requirements: [
              { text: "季节融入画面", met: true, note: '' },
              { text: "不暗示饮酒", met: true, note: '' },
              { text: "能否作为主视觉", met: true, note: '' },
            ],
            status: 'superseded',
            challenge: { claim: "单稿模拟评分通过，为4.46。", challenge: "与初霜方向并排时，两者都使用山脊暖色低光，容易被看成同一个创意。", resolution: "将方向丙改为蓝调时分，暖意只来自窗灯。", outcome: 'upheld' },
          },
          {
            version: 2,
            art: posterC2,
            explanation: "归途最后一段路处于蓝调时分：寒冷在天空里，暖意只在前方村窗。没有酒杯与吧台，步行本身就是场景。",
            scores: sC2,
            requirements: [
              { text: "季节融入画面", met: true, note: "蓝调时分，灯光初亮。" },
              { text: "不暗示饮酒", met: true, note: "只使用村落窗光。" },
              { text: "能否作为主视觉", met: true, note: "检查大型户外与数字屏的阅读效果。" },
              { text: "与其他方向形成差异", met: true, note: "冷色调将该方向与初霜方向分开。" },
            ],
            status: 'accepted',
            challenge: null,
          },
        ],
        views: [],
        mockups: [
          { label: "公交站灯箱", why: "主要户外应用：归途暮色中的观看场景。", art: mock('bus-shelter', posterC2) },
          { label: "竖版数字屏", why: "简报指定的社交传播示意。", art: mock('phone', posterC2) },
          { label: "电梯屏", why: "周末前的周五办公楼场景。", art: mock('elevator', posterC2) },
        ],
      },
    ],
    similarity: [
      { pair: ['A', 'C'], level: 'medium', note: "两份初稿都使用山脊上的暖色低光。", action: "方向丙转为蓝调时分，方向甲保留结霜清晨。" },
      { pair: ['A', 'B'], level: 'low', note: "风景与肌理的差异。", action: "无需处理。" },
      { pair: ['B', 'C'], level: 'low', note: "产品地形与暮色人物的差异。", action: "无需处理。" },
    ],
    conceptLimits: [],
  },
  contentReview: {
    checks: [
      { id: 'q1', question: "是否回答简报？", outcome: 'pass', note: "各个指定应用中，都以首个寒冷周末的主视觉回应任务。" },
      { id: 'q2', question: "调研、结论、主题与视觉是否连贯？", outcome: 'revised', note: "补充从具体决策时刻走向三个方向的过渡。" },
      { id: 'q3', question: "章节过渡是否自然？", outcome: 'revised', note: "删除策略之前重复出现的摘要。" },
      { id: 'q4', question: "语言是否简洁，并符合品牌策略？", outcome: 'revised', note: "演示修订记录：将调研摘要从74个词压缩至38个词。" },
      { id: 'q5', question: "事实宣称是否有依据？", outcome: 'revised', note: "方向乙原先的全天候说法没有依据，已替换为保暖测试说明。" },
      { id: 'q6', question: "图片与文案是否表达同一件事？", outcome: 'pass', note: "每句口号都能在对应图像中被读出。" },
      { id: 'q7', question: "三个方向是否有实质差异？", outcome: 'pass', note: "分别聚焦品牌延续、产品地形与暮色同行。" },
    ],
    narrative: [
      { id: 'n1', title: "开场", text: "每年秋天，总有一个周末让人真正感到冷了。本提案就围绕这个周末展开。", before: null, changeReason: null },
      { id: 'n2', title: "核心问题", text: "如何让步行者在第一个寒冷周末之前，而非之后，想到北线户外的叠穿单品？", before: null, changeReason: null },
      {
        id: 'n3',
        title: "调研发现",
        text: "演示资料中的装备准备发生在首个寒冷周末。竞品11月多用高山与面料图，熟悉路线转冷的那天仍有表达空间。",
        before: "本地演示引用模拟访谈、渠道调查、店员交流、虚构俱乐部通讯及橱窗观察，将准备装备的触发点设为首个寒冷周末，而非固定日期，并将竞品发布设为较晚时点。",
        changeReason: "文字过长，来源应移入注释。",
      },
      { id: 'n4', title: "策略含义", text: "决策发生在具体的一天，场景日常且适合同伴同行。品牌已有相近表达基础，因此寒冷必须出现在画面中。", before: null, changeReason: null },
      {
        id: 'n5',
        title: "三个创意方向",
        text: "方向甲保留路线并改变天气；乙让产品成为地形；丙跟随小队在天黑前归家。",
        before: "已形成三个创意方向。",
        changeReason: "补充过渡，使每个方向先说明核心创意。",
      },
      { id: 'n6', title: "推荐选择", text: "户外与社交传播推荐方向丙；橱窗使用识别更强的甲；乙保留为产品主导备选。", before: null, changeReason: null },
    ],
  },
  layout: {
    styles: [
      EDITORIAL_STYLE,
      COBALT_STYLE,
      STUDIO_STYLE,
    ],
    chosen: 'editorial',
    chosenBy: 'director',
    slides: [
      { id: 's1', kind: 'cover', lead: "第一个寒冷周末", support: "北线户外秋冬主视觉 · 提案", art: posterC2, notes: '' },
      { id: 's2', kind: 'question', lead: "如何让人们在第一个寒冷周末之前，而非之后，想到北线户外？", support: "本提案回答的问题", notes: '' },
      { id: 's3', kind: 'insight', lead: "准备发生在某一天，而非某个日期。", support: "模拟访谈中的人们在首个寒冷周末检查装备，并在能够想象路线时理解产品价值。", art: { kind: 'scene', scene: 'ridge-frost', palette: FROST, seed: 11, composition: 'close-up' }, notes: "模拟访谈，仅作定性演示。" },
      { id: 's4', kind: 'data', lead: "12人中的9人", support: "模拟访谈中提到：能想象具体路线时，叠穿单品更显得值得购买。", chart: undefined, bigNumber: '9/12', notes: "模拟访谈数据，仅用于工程演示。" },
      { id: 's5', kind: 'insight', lead: "竞品在11月强调高山。", support: "登顶与面料图占主导，熟悉路线转冷的那天仍有空位。", art: { kind: 'scene', scene: 'summit', palette: SUMMIT, seed: 2 }, notes: "六个虚构案例的案头演示。" },
      { id: 's6', kind: 'conclusion', lead: "围绕熟悉路线的首个寒冷周末，把寒冷放进画面。", support: "品类 · 品牌 · 受众", notes: '' },
      { id: 's7', kind: 'theme', lead: "同一条路，冷了几分。", support: "方向甲 · 初霜：路线不变，季节改变。", directionId: 'A', notes: '' },
      { id: 's8', kind: 'visual', lead: "初霜", support: "既有路线迎来初霜，标题置于山脊之后。", directionId: 'A', art: posterA, notes: '' },
      { id: 's9', kind: 'theme', lead: "每一道山脊，都有层次。", support: "方向乙 · 温暖地形：产品成为风景。", directionId: 'B', notes: '' },
      { id: 's10', kind: 'visual', lead: "温暖地形", support: "霜勾出抓绒山脊，行者建立尺度。", directionId: 'B', art: posterB2, notes: '' },
      { id: 's11', kind: 'theme', lead: "趁天未黑，一起出发。", support: "方向丙 · 天黑之前：蓝调归途中的同行者。", directionId: 'C', notes: '' },
      { id: 's12', kind: 'visual', lead: "天黑之前", support: "天空有寒意，前方窗灯有暖意。", directionId: 'C', art: posterC2, notes: '' },
      { id: 's13', kind: 'mockup', lead: "归途之中", support: "暮色下的公交站灯箱示意。", directionId: 'C', art: mock('bus-shelter', posterC2), notes: '' },
      { id: 's14', kind: 'mockup', lead: "十月初的橱窗", support: "演示观察中，夏季系列仍在陈列。", directionId: 'A', art: mock('store-window', posterA), notes: '' },
      { id: 's15', kind: 'comparison', lead: "走向同一个周末的三种方式", support: "品牌延续 · 产品 · 同行者", notes: '' },
      { id: 's16', kind: 'recommendation', lead: "主推方向丙，橱窗使用甲，产品表达保留乙。", support: "模拟传播得分更高、受众演示依据更充分、季节表达更清楚。", directionId: 'C', art: posterC2, notes: '' },
    ],
    editability: {
      native: ["所有标题、文案与图片说明", "页面底色、分隔线与色块", "以原生演示图表呈现的统计"],
      raster: ["生成插画与应用示意，作为可替换图片放置"],
    },
  },
  delivery: {
    checks: [
      { id: 'd1', area: "内容完整性", outcome: 'pass', note: "16页均与模拟审核后的叙事对应。" },
      { id: 'd2', area: "视觉层级与一致性", outcome: 'pass', note: "每页只有一个主要元素。" },
      { id: 'd3', area: "图片质量与裁切", outcome: 'fixed', note: "方向丙的数字屏裁切重新以小队为中心。" },
      { id: 'd4', area: "文字溢出与可读性", outcome: 'fixed', note: "第10页的方向乙说明已缩短。" },
      { id: 'd5', area: "应用示意是否符合场景", outcome: 'pass', note: "户外、橱窗、电梯与数字屏均来自简报。" },
      { id: 'd6', area: "渲染检查", outcome: 'pass', note: "演示导出文件中的检查记录。" },
      { id: 'd7', area: "演示文件可编辑性", outcome: 'pass', note: "文字、形状与图表为原生对象，插画作为图片放置。" },
    ],
    comparison: [
      { criterion: "创意机制", values: { A: "品牌延续", B: "产品成为地形", C: "社交场景" } },
      { criterion: "主文案", values: { A: "同一条路，冷了几分。", B: "每一道山脊，都有层次。", C: "趁天未黑，一起出发。" } },
      { criterion: "传播评分", values: { A: '4.06', B: '4.04', C: '4.42' } },
      { criterion: "适用场景", values: { A: "门店橱窗", B: "电梯与近距离观看", C: "户外与社交传播" } },
      { criterion: "主要风险", values: { A: "容易被看成去年的延续", B: "小尺寸下偏抽象", C: "比品牌惯常表达更温暖" } },
    ],
    recommendation: "户外与社交传播主推天黑之前；识别要求高的橱窗采用初霜；温暖地形保留为产品主导备选。",
    limitations: [
      "图片为生成的工程演示插画；真实项目仍需安排摄影或插画制作。",
      "零售伙伴日期未确认，应用仅为示意。",
      "受众部分仅有一轮模拟访谈。",
    ],
  },
  decisions: [
    { id: 'hd1', stage: 'themes', kind: 'chosen_despite_review', by: "演示用户", at: '2026-10-23T10:50:00Z', comment: "保留一个大胆的产品方向，方向乙继续。", reviewerPosition: "模拟评审建议用更轻量的产品创意替换方向乙，其清晰度评分为3.6。" },
    { id: 'hd2', stage: 'themes', kind: 'approved', by: "演示用户", at: '2026-10-23T11:05:00Z', comment: "三个方向继续推进，同意主推丙。", reviewerPosition: null },
  ],
  contributions: [
    { id: 'uc1', stage: 'themes', kind: 'slogan', text: "赶在亮灯前回来，刚刚好。", borrow: null, by: "演示用户", at: '2026-10-23T10:40:00Z', status: 'used', response: "已作为方向丙的副文案使用。" },
  ],
  tasks: [
    { id: 't1', stage: 'brief', agent: "提案总监", level: 'director', task: "从简报整理任务卡并列出未知项", status: 'done', startedAt: '2026-10-12T09:05:00Z', seconds: 41, receipt: 'rcpt_nl_brief_01' },
    { id: 't2', stage: 'research', agent: "调研负责人", level: 'lead', task: "为既有产品的季节主视觉规划调研", status: 'done', startedAt: '2026-10-14T09:00:00Z', seconds: 63, receipt: 'rcpt_nl_res_plan' },
    { id: 't3', stage: 'research', agent: "案例搜集员 ×3", level: 'specialist', task: "并行检索品牌档案、竞品发布与季节线索", status: 'done', startedAt: '2026-10-14T09:02:00Z', seconds: 212, receipt: 'rcpt_nl_res_scouts' },
    { id: 't4', stage: 'strategy', agent: "策略负责人", level: 'lead', task: "形成三圈分析与机会点", status: 'done', startedAt: '2026-10-22T13:00:00Z', seconds: 180, receipt: 'rcpt_nl_strat' },
    { id: 't5', stage: 'themes', agent: "文案负责人", level: 'lead', task: "按不同机制发展三个方向", status: 'done', startedAt: '2026-10-22T17:00:00Z', seconds: 240, receipt: 'rcpt_nl_copy' },
    { id: 't6', stage: 'themes', agent: "文案评审员", level: 'evaluator', task: "评估传播维度", status: 'done', startedAt: '2026-10-23T08:00:00Z', seconds: 55, receipt: 'rcpt_nl_copy_eval' },
    { id: 't7', stage: 'themes', agent: "文案质疑员", level: 'adversary', task: "质疑正向判断", status: 'done', startedAt: '2026-10-23T08:05:00Z', seconds: 48, receipt: 'rcpt_nl_copy_adv' },
    { id: 't8', stage: 'visual', agent: "参考搜集员 ×3", level: 'specialist', task: "按方向搜集参考", status: 'done', startedAt: '2026-10-23T11:30:00Z', seconds: 190, receipt: 'rcpt_nl_refs' },
    { id: 't9', stage: 'visual', agent: "草图设计师 ×3", level: 'specialist', task: "每个方向制作三张构图草图", status: 'done', startedAt: '2026-10-23T13:00:00Z', seconds: 300, receipt: 'rcpt_nl_sketch' },
    { id: 't10', stage: 'visual', agent: "视觉评审员", level: 'evaluator', task: "评估精修稿：阈值4.0及必要条件", status: 'done', startedAt: '2026-10-24T09:00:00Z', seconds: 70, receipt: 'rcpt_nl_vis_eval' },
    { id: 't11', stage: 'visual', agent: "成稿制作员", level: 'specialist', task: "修正季节线索问题，制作方向乙第2版", status: 'done', startedAt: '2026-10-24T10:10:00Z', seconds: 160, receipt: 'rcpt_nl_vis_b2' },
    { id: 't12', stage: 'content_review', agent: "内容审阅员", level: 'evaluator', task: "排版前通读整案内容", status: 'done', startedAt: '2026-10-24T14:30:00Z', seconds: 95, receipt: 'rcpt_nl_narr' },
    { id: 't13', stage: 'layout', agent: "排版负责人", level: 'lead', task: "提供三种版式样张，并将选定风格应用至16页", status: 'done', startedAt: '2026-10-24T17:00:00Z', seconds: 420, receipt: 'rcpt_nl_layout' },
    { id: 't14', stage: 'delivery', agent: "输出检查员", level: 'evaluator', task: "检查演示文件中的溢出、裁切与可编辑性", status: 'done', startedAt: '2026-10-25T08:30:00Z', seconds: 88, receipt: 'rcpt_nl_render' },
  ],
  reviews: [
    { id: 'r1', stage: 'themes', subject: "方向甲", evaluator: "文案评审员", average: avg(themeA), verdict: "模拟通过", challenge: { claim: "品牌融合4.8", challenge: "可能被看成去年的画面加了一层霜。", resolution: "让寒冷成为主题。", outcome: 'partly_upheld' }, directorResolution: "保留方向，要求视觉本身呈现季节。", at: '2026-10-23T08:10:00Z' },
    { id: 'r2', stage: 'themes', subject: "方向乙", evaluator: "文案评审员", average: avg(themeB), verdict: "有条件通过", challenge: { claim: "差异化4.6", challenge: "小尺寸下偏抽象，文案可能被误读为性能承诺。", resolution: "副文案仅保留有依据的保暖说明。", outcome: 'upheld' }, directorResolution: "曾建议替换；按你的决定保留，原意见不删除。", at: '2026-10-23T08:12:00Z' },
    { id: 'r3', stage: 'themes', subject: "方向丙", evaluator: "文案评审员", average: avg(themeC), verdict: "模拟通过", challenge: { claim: "受众共鸣4.7", challenge: "酒馆场景可能暗示饮酒。", resolution: "只使用村落窗光。", outcome: 'partly_upheld' }, directorResolution: "推荐方向丙。", at: '2026-10-23T08:14:00Z' },
    { id: 'r4', stage: 'visual', subject: "方向乙精修第1版", evaluator: "视觉评审员", average: avg(sB1), verdict: "未达阈值：画面中没有季节线索", challenge: null, directorResolution: "退回制作，要求将寒冷放入地形。", at: '2026-10-24T09:20:00Z' },
    { id: 'r5', stage: 'visual', subject: "方向丙精修第1版", evaluator: "视觉评审员", average: avg(sC1), verdict: "单稿通过，但与方向甲相似", challenge: { claim: "单稿模拟评估通过", challenge: "与方向甲使用相同的暖色低光。", resolution: "改为蓝调时分。", outcome: 'upheld' }, directorResolution: "为建立差异而修订。", at: '2026-10-24T09:25:00Z' },
    { id: 'r6', stage: 'visual', subject: "全部精修稿第2版", evaluator: "视觉评审员", average: 4.43, verdict: "模拟通过：甲4.40，乙4.10，丙4.56", challenge: null, directorResolution: null, at: '2026-10-24T13:10:00Z' },
    { id: 'r7', stage: 'content_review', subject: "完整叙事", evaluator: "内容审阅员", average: null, verdict: "修订4处，删除1句无依据的表述", challenge: { claim: "模拟叙事审核认为前后连贯", challenge: "调研与方向之间缺少过渡。", resolution: "已补充。", outcome: 'upheld' }, directorResolution: "演示状态：可进入排版。", at: '2026-10-24T16:00:00Z' },
    { id: 'r8', stage: 'delivery', subject: "已渲染的演示文稿", evaluator: "输出检查员", average: null, verdict: "已修正2处，可供查看", challenge: null, directorResolution: "等待人工确认交付。", at: '2026-10-25T09:00:00Z' },
  ],
  handoffs: [
    { id: 'h1', from: 'research', to: 'strategy', producer: "调研负责人", consumer: "策略负责人", producerCheck: "第1版已释放，记录允许用途及禁止推断。", consumerCheck: "已接收；受众判断仅作为方向性演示。", status: 'accepted', at: '2026-10-22T11:30:00Z' },
    { id: 'h2', from: 'strategy', to: 'themes', producer: "策略负责人", consumer: "文案负责人", producerCheck: "三个机会点均关联演示依据。", consumerCheck: "每个机会点承载不同创意机制。", status: 'accepted', at: '2026-10-22T16:45:00Z' },
    { id: 'h3', from: 'themes', to: 'visual', producer: "文案负责人", consumer: "视觉负责人", producerCheck: "口号已定，方向乙保留评审备注。", consumerCheck: "要求书面明确不添加技术宣称。", status: 'accepted', at: '2026-10-23T11:10:00Z' },
    { id: 'h4', from: 'visual', to: 'content_review', producer: "视觉负责人", consumer: "提案总监", producerCheck: "全部精修稿模拟评分不低于4.0，并满足必要条件。", consumerCheck: "附方向相似度检查。", status: 'accepted', at: '2026-10-24T13:20:00Z' },
    { id: 'h5', from: 'content_review', to: 'layout', producer: "提案总监", consumer: "排版负责人", producerCheck: "叙事定稿，共6个章节。", consumerCheck: "每页只保留一个主要元素。", status: 'accepted', at: '2026-10-24T16:05:00Z' },
    { id: 'h6', from: 'layout', to: 'delivery', producer: "排版负责人", consumer: "提案总监", producerCheck: "16页，采用编辑式版式。", consumerCheck: "已提出并完成两处修正。", status: 'accepted', at: '2026-10-25T08:20:00Z' },
  ],
  versions: [
    { id: 'v1', stage: 'brief', label: "任务卡", version: 1, inputs: ["客户简报演示", "零售排期草稿"], at: '2026-10-13T15:00:00Z', state: 'current', impact: null },
    { id: 'v2', stage: 'research', label: "调研看板", version: 1, inputs: ["任务卡第1版", "6份演示来源"], at: '2026-10-22T11:30:00Z', state: 'current', impact: null },
    { id: 'v3', stage: 'strategy', label: "策略", version: 1, inputs: ["调研第1版"], at: '2026-10-22T16:40:00Z', state: 'current', impact: null },
    { id: 'v4', stage: 'themes', label: "创意方向", version: 1, inputs: ["策略第1版"], at: '2026-10-23T08:00:00Z', state: 'superseded', impact: null },
    { id: 'v5', stage: 'themes', label: "创意方向", version: 2, inputs: ["策略第1版", "你为方向丙补充的口号"], at: '2026-10-23T11:05:00Z', state: 'current', impact: null },
    { id: 'v6', stage: 'visual', label: "精修视觉稿", version: 2, inputs: ["方向第2版"], at: '2026-10-24T13:20:00Z', state: 'current', impact: null },
    { id: 'v7', stage: 'content_review', label: "整案叙事", version: 1, inputs: ["策略第1版", "方向第2版", "视觉第2版"], at: '2026-10-24T16:00:00Z', state: 'current', impact: null },
    { id: 'v8', stage: 'layout', label: "演示文稿 · 编辑式", version: 1, inputs: ["叙事第1版", "视觉第2版"], at: '2026-10-25T08:10:00Z', state: 'current', impact: null },
  ],
  revision: 31,
  updatedAt: '2026-10-25T09:00:00Z',
};
