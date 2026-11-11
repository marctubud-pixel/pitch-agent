/**
 * Packaging demo: Plumtide, a new sparkling plum drink from the (fictional) Oriya family.
 * A new product, so research leans on chiller conventions, packaging comparisons and how the
 * cans are shared and gifted. Assisted mode; paused at the visual-development checkpoint.
 *
 * The brief calls the drink "light" and the audience "young". Neither is turned into a strength
 * or an age range: both stay open questions. Claim references point at Workbench `plumtide`.
 */
import type { CanDesign, Proposal } from '../../../domain/proposal';
import { avg, brief, chart, claim, COBALT_STYLE, EDITORIAL_STYLE, kase, STUDIO_STYLE, LEADS, mock, pack, scene, scores, stage } from './helpers';

const INK: CanDesign = { base: '#f3ead8', ink: '#1f1a1c', accent: '#b8323f', pattern: 'plum-ink', wordmark: "梅潮", flavour: "梅味气泡饮" };
const BUBBLE: CanDesign = { base: '#7a2346', ink: '#fff4f6', accent: '#f2b8c6', pattern: 'bubbles', wordmark: "梅潮", flavour: "梅味气泡饮" };
const PANO = (panel: 0 | 1 | 2 | 3): CanDesign => ({ base: '#f6dccb', ink: '#2b1d2a', accent: '#b8323f', pattern: 'panorama', wordmark: "梅潮", flavour: "梅味气泡饮", panel });

const COMPETITOR = ['#2a1530', '#4b1f45', '#6d2a4f', '#8c2f43', '#d9c3d3', '#120a14'];
const ROOF = ['#f6c6a8', '#e58f73', '#9d4f63', '#4c2b45', '#ffe2a8', '#22171f'];
const BLOSSOM = ['#f6eddc', '#e9b9c2', '#c25b6c', '#5a2a3a', '#b8323f', '#1f1a1c'];

const sA = scores(["概念", 4.2], ["一眼读出梅味", 4.4], ["货架辨识度", 3.9], ["母品牌归属", 4.8], ["赠礼体面感", 4.1]);
const sB = scores(["概念", 4.1], ["一眼读出梅味", 4.3], ["货架辨识度", 4.5], ["母品牌归属", 3.7], ["赠礼体面感", 3.9]);
const sC = scores(["概念", 4.6], ["一眼读出梅味", 4.0], ["货架辨识度", 4.3], ["母品牌归属", 4.0], ["赠礼体面感", 4.7]);

const tA = scores(["清晰与记忆度", 4.2], ["品牌与产品融合", 4.7], ["受众共鸣", 3.6], ["差异化", 3.8], ["传播相关性", 3.5]);
const tB = scores(["清晰与记忆度", 4.4], ["品牌与产品融合", 4.0], ["受众共鸣", 4.0], ["差异化", 4.2], ["传播相关性", 4.3]);
const tC = scores(["清晰与记忆度", 4.5], ["品牌与产品融合", 4.0], ["受众共鸣", 4.7], ["差异化", 4.6], ["传播相关性", 4.5]);

const panoramaSleeve = pack('four-pack', 'front', PANO(0));

export const plumtide: Proposal = {
  id: 'plumtide-pack',
  workbenchId: 'plumtide',
  name: "梅潮 · 罐装与礼套提案",
  client: "梅原饮品（虚构品牌）",
  type: 'packaging',
  summary: "新款梅味气泡饮的包装演示：冷柜单罐与新年四罐礼套。",
  cover: pack('can', 'three-quarter', PANO(1)),
  mode: 'assisted',
  checkpoints: ['strategy', 'themes', 'visual', 'delivery'],
  currentStage: 'visual',
  stages: {
    brief: stage('done', "任务卡已确认；酒精度、尺寸、材质与年龄范围仍待确认。", LEADS.brief, '2026-10-18T06:30:00Z'),
    research: stage('done', "调研已完成模拟核验、充分性检查与交接。", LEADS.research, '2026-10-20T03:00:00Z'),
    strategy: stage('done', "演示批准记录：轻盈的梅子插画罐，适合共同餐桌。", LEADS.strategy, '2026-10-21T08:00:00Z'),
    themes: stage('done', "演示批准记录：三个方向继续，并补充包袱布礼套参考。", LEADS.themes, '2026-10-22T07:30:00Z'),
    visual: stage('waiting_for_you', "甲、乙已通过模拟评审，丙的精修稿等待人工决定。", LEADS.visual, '2026-10-24T09:40:00Z'),
    content_review: stage('not_started', "确认视觉开发后再开始。", LEADS.content_review, null),
    layout: stage('not_started', "内容审核后再开始。", LEADS.layout, null),
    delivery: stage('not_started', "最终检查与可编辑演示文稿。", LEADS.delivery, null),
  },
  task: {
    assignment: "为梅潮新款梅味气泡饮制作罐装与新年四罐礼套。",
    output: "三个包装方向，含罐身视图、礼套、概念应用及可编辑提案。",
    occasion: "日常相聚与新年赠礼",
    scope: ["罐装正面、四分之三角度与背面", "四罐礼套", "概念应用：冷柜、礼赠餐桌与手持展示", "可编辑的提案演示文稿"],
    inputs: [
      { id: 'pi1', kind: 'pdf', title: "梅原品牌规范.pdf", note: "演示客户材料：梅枝笔触、家族印章与配色。" },
      { id: 'pi2', kind: 'image', title: "梅原梅酒瓶标", note: "母品牌标签参考。", art: scene('plum-ink', BLOSSOM, { seed: 2 }) },
      { id: 'pi3', kind: 'link', title: "零售商赠礼排期", note: "示例链接：礼套从12月中旬开始陈列。" },
    ],
    unknowns: [
      { id: 'pu1', topic: "酒精含量", why: "简报中的轻盈描述口味与情绪，不代表酒精度；已列为待询问题。" },
      { id: 'pu2', topic: "年龄范围", why: "年轻不等于具体年龄范围；若含酒精，还需遵守法定饮用年龄约束。" },
      { id: 'pu3', topic: "谁购买礼套", why: "送礼者、饮用者与分享对象可能不同，简报尚未说明。" },
      { id: 'pu4', topic: "罐体尺寸、材质与工艺", why: "尚未指定。概念图采用标准细罐形状，仅供演示。" },
    ],
  },
  research: {
    adaptation:
      "本案为新产品包装：重点查看冷柜惯例、同类包装、分享与赠礼场景。品牌历史来自母品牌梅原，因此只保留简短部分。",
    summary:
      "演示资料将同类梅味饮品设为深紫底加水果摄影；礼套需要不经额外包装也能体面送出。梅花则作为新年季节线索。",
    sections: [
      {
        id: 'brand',
        title: "梅原与新产品",
        summary: "梅潮继承母品牌的梅枝笔触与家族印章。饮品酒精度与规格仍未确认。",
        findings: [
          { id: 'pb1', kind: 'evidence', text: "母品牌演示标签采用手绘梅枝、家族印章、米白、墨色与梅红配色。", claimRef: 'c4', note: null },
          { id: 'pb2', kind: 'unverified', text: "梅潮的酒精含量。", claimRef: null, note: "简报未说明。轻盈不是酒精度判断，作品不作此类宣称。" },
        ],
        groups: [
          {
            id: 'pg-oriya',
            title: "梅原现有标签",
            kind: 'background',
            takeaway: "笔触、印章、米白底：可延续或重新组织的家族视觉。",
            items: [
              { id: 'pk-label1', title: "经典梅酒", caption: "米白底上的梅枝笔触。", art: scene('plum-ink', BLOSSOM, { seed: 2 }), source: "客户品牌规范（演示插画）", date: '2025', applicability: "直接参考母品牌资产。", limitation: null },
              { id: 'pk-label2', title: "珍藏梅酒", caption: "以印章为主的标签。", art: scene('plum-ink', ['#1f1a1c', '#3a2a2e', '#b8323f', '#f3ead8', '#d9a441', '#f3ead8'], { seed: 6 }), source: "客户品牌规范（演示插画）", date: '2024', applicability: "直接参考。", limitation: null },
            ],
          },
        ],
        chart: null,
      },
      {
        id: 'category',
        title: "冷柜惯例与竞品",
        summary: "演示竞品使用深紫罐与水果摄影。较浅的插画罐可以形成差异，但仍须让人一眼看懂梅味。",
        findings: [
          { id: 'pc1', kind: 'evidence', text: "演示同类梅味气泡饮使用深紫或深红底，配水果摄影。", claimRef: 'c1', note: null },
          { id: 'pc2', kind: 'evidence', text: "演示赠礼排期设为12月中旬，礼套要在不额外包装时也显得体面。", claimRef: 'c2', note: null },
        ],
        groups: [
          {
            id: 'pg-competitors',
            title: "冷柜里的梅味罐",
            kind: 'comparison',
            takeaway: "三个虚构品牌采用相近画法：深底与水果图在冷柜里混在一起。",
            items: [
              { id: 'pk-shelf', title: "第3家门店冷柜", caption: "梅味罐集中陈列。", art: scene('chiller', COMPETITOR, { seed: 3 }), source: "冷柜观察（模拟笔记）", date: "2026年10月", applicability: "直接比较。", limitation: "同一城市的6家演示门店。" },
              { id: 'pk-flat', title: "竞品罐正面", caption: "深紫底上的水果摄影。", art: scene('shelf-lineup', COMPETITOR, { seed: 4 }), source: "案头比较（演示插画）", date: "2026年10月", applicability: "直接比较。", limitation: null },
              { id: 'pk-photo', title: "常见梅果照片", caption: "切开的梅果与水滴。", art: scene('fruit-flatlay', COMPETITOR, { seed: 1 }), source: "案头比较（演示插画）", date: "2026年10月", applicability: "直接比较。", limitation: null },
            ],
          },
        ],
        chart: {
          id: 'ch-colour',
          kind: 'bar',
          title: "梅味竞品的罐身主色",
          measure: "六个演示冷柜中观察到的罐正面数量",
          data: [
            { label: "深紫", value: 7, highlight: true },
            { label: "深红", value: 3 },
            { label: "浅色或米白", value: 1 },
            { label: "其他", value: 1 },
          ],
          note: "模拟观察笔记，仅供工程演示。",
          demoData: true,
        },
      },
      {
        id: 'audience',
        title: "饮用者、购买者与送礼者",
        summary: "演示访谈中，罐装饮品被带去聚会分享；礼套购买者可能不同，因此罐与礼套应分别判断。",
        findings: [
          { id: 'pa1', kind: 'evidence', text: "模拟参与者会带饮品相聚，并在意罐子摆在桌面上的样子。", claimRef: 'c3', note: null },
          { id: 'pa2', kind: 'unverified', text: "礼套可能由饮用者之外的人购买。", claimRef: null, note: "这是待验证的假设，未在本案演示来源中获得支持，因此保留为问题。" },
        ],
        groups: [
          {
            id: 'pg-moments',
            title: "相聚时刻",
            kind: 'background',
            takeaway: "访谈主题演示插画：传递饮品、摆上桌面、带去屋顶。",
            items: [
              { id: 'pk-roof', title: "屋顶暮色", caption: "罐装饮品沿长椅传递。", art: scene('rooftop', ROOF, { seed: 2 }), source: "相聚访谈（模拟笔记）", date: "2026年10月", applicability: "场景线索，仅为定性演示。", limitation: "只有一轮模拟访谈。" },
              { id: 'pk-table', title: "共同餐桌", caption: "摆出来也要好看。", art: scene('gift-wrap', ['#f3ead8', '#e8c9a8', '#b8323f', '#5a2a3a', '#d9a441', '#1f1a1c'], { seed: 3 }), source: "相聚访谈（模拟笔记）", date: "2026年10月", applicability: "场景线索，仅为定性演示。", limitation: null },
            ],
          },
        ],
        chart: {
          id: 'ch-who',
          kind: 'split',
          title: "谁带来了饮品",
          measure: "模拟访谈中的10次相聚描述",
          data: [
            { label: "客人带来", value: 6, highlight: true },
            { label: "主人购买", value: 4 },
          ],
          note: "模拟访谈笔记，仅供工程演示。",
          demoData: true,
        },
      },
      {
        id: 'context',
        title: "新年与季节",
        summary: "梅花是新年线索。在礼套上，应让季节融入插画，而不仅是加一句祝福。",
        findings: [{ id: 'px1', kind: 'evidence', text: "梅花常被用作新年图案，与早春花期关联。", claimRef: 'c5', note: null }],
        groups: [
          {
            id: 'pg-inspiration',
            title: "跨行业灵感",
            kind: 'inspiration',
            takeaway: "渐变玻璃、布包与灯光只供手法参考，不代表受众偏好。",
            items: [
              { id: 'pk-glass', title: "香水瓶渐变", caption: "颜色在玻璃中向上生长。", art: scene('perfume-glass', ['#f6e3ea', '#e9a6bb', '#b8476c', '#5a1f3a', '#fff4f6', '#2b1020'], { seed: 2 }), source: "美妆包装（演示插画）", date: '2026', applicability: "参考渐变表现流动的手法。", limitation: "品类与价格带均不同。" },
              { id: 'pk-cloth', title: "包袱布礼赠包装", caption: "以布结作为封口。", art: scene('gift-wrap', BLOSSOM, { seed: 5 }), source: "工艺档案（演示插画）", date: '—', applicability: "参考无需额外包装即可赠礼的方式。", limitation: null },
              { id: 'pk-lantern', title: "新年灯笼街景", caption: "暖色光点。", art: scene('festival-lanterns', ['#2b1d2a', '#4c2b45', '#9d4f63', '#e58f73', '#ffd38a', '#120a14'], { seed: 1 }), source: "街景摄影（演示插画）", date: '—', applicability: "仅供季节光线参考。", limitation: "只作为情绪参考。" },
            ],
          },
        ],
        chart: null,
      },
    ],
  },
  strategy: {
    question: "如何让新梅味饮品在深紫冷柜中被先选中，同时适合新年送礼，并保持母品牌识别？",
    structure: 'sequential',
    circles: {
      category: {
        title: "品类：一整面深紫色",
        points: [
          { text: "演示竞品普遍使用深色底与水果摄影。", evidence: [claim('c1', "冷柜观察演示"), chart('ch-colour', "罐身颜色")] },
          { text: "礼套无需额外包装也要体面。", evidence: [claim('c2', "赠礼指南演示")] },
        ],
      },
      brand: {
        title: "梅原：笔触、印章、米白",
        points: [
          { text: "梅枝笔触与家族印章是已有识别资产。", evidence: [claim('c4', "品牌规范"), kase('pk-label1', "梅原瓶标")] },
          { text: "酒精度与规格未确认，包装不得暗示这些属性。", evidence: [brief('openQuestions', "简报未决问题")] },
        ],
      },
      audience: {
        title: "饮用者分享，送礼者可能不同",
        points: [
          { text: "罐子用于相聚分享，摆在桌上也要好看。", evidence: [claim('c3', "模拟访谈"), chart('ch-who', "饮品由谁带来")] },
          { text: "梅花本身就能提示新年。", evidence: [claim('c5', "新年图案参考")] },
        ],
      },
    },
    intersection: {
      insight: "轻盈的梅子插画罐，适合共同餐桌；四罐组合又成为礼物。",
      why: "冷柜多为深色摄影，母品牌偏笔触与米白；饮用者看桌面效果，赠礼者看礼套体面程度。",
    },
    argument: [
      { step: "深色与摄影是演示品类的默认画法。", detail: "若要用浅色插画形成差异，仍须一眼读出梅味。", evidence: [claim('c1', "冷柜观察演示")] },
      { step: "母品牌为新产品提供了插画语言。", detail: "梅枝、印章和米白是已有品牌资产。", evidence: [claim('c4', "品牌规范")] },
      { step: "单罐要在餐桌上成立，礼套要在未包裹时成立。", detail: "两个任务、两类使用者，同一套视觉系统。", evidence: [claim('c3', "模拟访谈"), claim('c2', "赠礼指南演示")] },
      { step: "梅花连接罐装与新年礼套。", detail: "季节可以融入插画本身。", evidence: [claim('c5', "新年图案参考")] },
    ],
    conclusion: "以浅色插画区别于深色摄影，并将单罐与礼套设计为同一系统。",
    answer: "梅潮以浅色梅子插画区别于演示冷柜，通过笔触和印章保持品牌归属，四罐组合形成赠礼画面。",
    opportunities: [
      { id: 'po1', title: "老梅园的新枝", idea: "将母品牌梅枝笔触带到米白罐身。", because: "延续品牌资产，并与演示品类的深色形成对比。", evidence: [claim('c4', "品牌规范"), claim('c1', "冷柜观察演示")], leadsTo: 'A' },
      { id: 'po2', title: "把气泡画出来", idea: "让气泡成为罐身图案。", because: "这是新产品相对于母品牌的一项差异线索。", evidence: [kase('pk-glass', "渐变手法参考")], leadsTo: 'B' },
      { id: 'po3', title: "四罐，一幅画", idea: "四罐拼合成礼套上的相聚场景。", because: "分享是使用场景，礼套应无需额外包装也能赠送。", evidence: [claim('c3', "模拟访谈"), claim('c2', "赠礼指南演示")], leadsTo: 'C' },
    ],
  },
  themes: {
    copyDirection: "语气温暖轻盈，不谈酒精度或功效；短句适合拿在手中时阅读。",
    historicalNote: "母品牌惯用简短诗意句。本案保留每方向一句，但不照搬古典语气。",
    directions: [
      {
        id: 'A',
        mechanism: 'evolution',
        name: "水墨梅园",
        slogan: "老梅园，长出新枝。",
        subline: "梅潮，来自梅原家族。",
        rationale: "以米白罐承接母品牌梅枝与印章，让新品的家族归属清晰可见。",
        connections: { brand: "使用母品牌已有识别资产。", audience: "摆在餐桌上克制，也适合赠礼。", assignment: "一眼看出品牌归属。" },
        difference: "唯一以传承为主要机制的方向。",
        copyLines: ["老梅园，长出新枝。", "梅原家族，轻轻起泡。"],
        color: '#b8323f',
        scores: tA,
        challenges: [{ claim: "品牌融合4.7", challenge: "传承线索可能让人想到梅酒，而非新的气泡饮。", resolution: "在梅枝下加气泡线索，并保持罐身轻盈。", outcome: 'partly_upheld' }],
        brandView: "家族识别最强。",
        audienceView: "优雅，但可能显得更像上一代人的饮品。",
        reviewOutcome: 'passed',
        disposition: 'kept',
      },
      {
        id: 'B',
        mechanism: 'product',
        name: "梅色上扬",
        slogan: "梅子的心情，轻轻起泡。",
        subline: "梅原出品，梅味气泡饮。",
        rationale: "让碳酸感可见：气泡从深梅色升向花瓣粉，罐子静止时也有流动感。",
        connections: { brand: "将品牌梅红转化得更活泼。", audience: "表现活力，不宣称饮用效果。", assignment: "在冷柜中形成差异。" },
        difference: "唯一将气泡特征直接转化为罐身设计的方向。",
        copyLines: ["梅子的心情，轻轻起泡。", "轻盈起泡的梅子风味。"],
        color: '#7a2346',
        scores: tB,
        challenges: [{ claim: "货架辨识度", challenge: "深梅色底部仍接近竞品的紫色。", resolution: "将视线更先接触的上半罐提亮为粉色。", outcome: 'upheld' }],
        brandView: "与母品牌距离更大，需要突出印章。",
        audienceView: "活泼、现代。",
        reviewOutcome: 'passed_with_notes',
        disposition: 'kept',
      },
      {
        id: 'C',
        mechanism: 'audience',
        name: "传给身边的人",
        slogan: "四罐，一幅画，一起分享。",
        subline: "梅潮礼套，梅原家族的梅味气泡饮。",
        rationale: "每罐承载梅树下屋顶相聚画面的四分之一，四罐并排拼成全景，礼套呈现完整画面。",
        connections: { brand: "用母品牌梅树作为画面中心。", audience: "围绕分享这一演示使用场景设计。", assignment: "同时解决单罐与礼套表达。" },
        difference: "唯一将分享写进包装结构的方向。",
        copyLines: ["四罐，一幅画，一起分享。", "放在一起，才更完整。"],
        color: '#e58f73',
        scores: tC,
        challenges: [{ claim: "受众共鸣4.7", challenge: "单罐在冷柜里只能呈现全景的四分之一。", resolution: "每一部分仍是完整的小场景，包含人物与梅枝。", outcome: 'partly_upheld' }],
        brandView: "表达更新鲜，但通过梅树保持品牌关联。",
        audienceView: "更接近模拟访谈描述的分享方式。",
        reviewOutcome: 'passed',
        disposition: 'recommended',
      },
    ],
    recommendation: { id: 'C', reasons: ["模拟传播平均分最高，为4.46。", "用一个创意解决单罐与礼套。", "与深色水果摄影的演示竞品差异最大。"] },
    directorNote: "演示确认记录：三个方向继续，并补充包袱布封口参考；方向丙已采用。",
  },
  visual: {
    branches: [
      {
        directionId: 'A',
        search: { seeking: "浅底上的笔触与印章，同时保持新品感。", borrow: ["笔触粗细", "印章作为色彩重点", "米白留白"], notFor: "不使用水果摄影。" },
        references: [
          { id: 'pa-r1', title: "梅原经典瓶标", origin: 'task_matched', art: scene('plum-ink', BLOSSOM, { seed: 2 }), borrow: "梅枝与印章。", verdict: 'selected', reason: "已有品牌资产。" },
          { id: 'pa-r2', title: "茶品牌罐装", origin: 'task_matched', art: scene('shelf-lineup', ['#f3ead8', '#9fb39a', '#5b7a62', '#2e3d33', '#d9a441', '#1f1a1c'], { seed: 7 }), borrow: "深色冷柜中的浅色罐。", verdict: 'selected', reason: "参考浅色底在货架中的识别表现。" },
          { id: 'pa-r3', title: "书法海报", origin: 'cross_industry', art: scene('plum-ink', ['#ffffff', '#cccccc', '#1f1a1c', '#1f1a1c', '#b8323f', '#1f1a1c'], { seed: 9 }), borrow: "笔触的力量感。", verdict: 'rejected', reason: "对气泡饮而言过于正式。" },
          { id: 'pa-r4', title: "水果摄影罐", origin: 'task_matched', art: scene('fruit-flatlay', COMPETITOR, { seed: 2 }), borrow: '—', verdict: 'rejected', reason: "本方向要避开的品类画法。" },
        ],
        referenceNote: "保留两份同任务参考。",
        sketches: [
          { id: 'pa-s1', title: "梅枝环绕罐身", art: scene('plum-ink', BLOSSOM, { sketch: true, composition: 'wide', seed: 2 }), scores: scores(["概念", 4.2], ["构图", 4.3], ["视觉层次", 4.0], ["品牌与季节", 4.6]), verdict: 'selected', reason: "从不同侧面仍能阅读。" },
          { id: 'pa-s2', title: "印章居中", art: scene('plum-ink', BLOSSOM, { sketch: true, composition: 'centered', seed: 2 }), scores: scores(["概念", 3.6], ["构图", 3.7], ["视觉层次", 4.2], ["品牌与季节", 4.0]), verdict: 'rejected', reason: "更像酒瓶标签。" },
          { id: 'pa-s3', title: "梅枝从底部生长", art: scene('plum-ink', BLOSSOM, { sketch: true, composition: 'low-horizon', seed: 2 }), scores: scores(["概念", 3.9], ["构图", 3.8], ["视觉层次", 3.7], ["品牌与季节", 4.1]), verdict: 'rejected', reason: "风味名称被挤压。" },
        ],
        sketchNote: "包装草图按创意、构图、层次及品牌季节表达评估。",
        refined: [
          {
            version: 1,
            art: pack('can', 'three-quarter', INK),
            explanation: "梅枝环绕米白罐，印章靠近风味名，以浅色区别于演示冷柜。",
            scores: sA,
            requirements: [
              { text: "能够识别梅子风味", met: true, note: "枝头同时出现梅花与果实。" },
              { text: "保留母品牌家族印章", met: true, note: '' },
              { text: "不暗示酒精度或规格", met: true, note: "没有酒精度线索，罐形仅为示意。" },
            ],
            status: 'accepted',
            challenge: null,
          },
        ],
        views: [
          { label: "正面", art: pack('can', 'front', INK) },
          { label: "四分之三视图", art: pack('can', 'three-quarter', INK) },
          { label: "背面", art: pack('can', 'back', INK) },
          { label: "礼套", art: pack('four-pack', 'front', INK) },
        ],
        mockups: [{ label: "冷柜货架", why: "检查与深色演示竞品并排时的辨识度。", art: mock('shelf', pack('can', 'front', INK)) }],
      },
      {
        directionId: 'B',
        search: { seeking: "像饮品上升般流动的色彩。", borrow: ["渐变方向", "气泡大小与间距"], notFor: "避免通用汽水气泡画法。" },
        references: [
          { id: 'pb-r1', title: "香水瓶渐变", origin: 'cross_industry', art: scene('perfume-glass', ['#f6e3ea', '#e9a6bb', '#b8476c', '#5a1f3a', '#fff4f6', '#2b1020'], { seed: 2 }), borrow: "颜色沿容器上升。", verdict: 'selected', reason: "用渐变表现流动。" },
          { id: 'pb-r2', title: "气泡图案研究", origin: 'cross_industry', art: scene('bubbles', ['#7a2346', '#a33a5c', '#d16a8a', '#f2b8c6', '#fff4f6', '#2b1020'], { seed: 3 }), borrow: "通过间距表现上升。", verdict: 'selected', reason: "让气泡特征可见。" },
          { id: 'pb-r3', title: "汽水罐气泡", origin: 'task_matched', art: scene('bubbles', ['#1e5aa8', '#3a7bd5', '#7fb2f0', '#d6e8ff', '#ffffff', '#0b1f3a'], { seed: 1 }), borrow: '—', verdict: 'rejected', reason: "过于通用的汽水语言。" },
          { id: 'pb-r4', title: "灯笼光线", origin: 'cross_industry', art: scene('festival-lanterns', ['#2b1d2a', '#4c2b45', '#9d4f63', '#e58f73', '#ffd38a', '#120a14'], { seed: 1 }), borrow: 'Glow.', verdict: 'rejected', reason: "具有季节感，但会干扰气泡创意。" },
        ],
        referenceNote: "保留两份跨行业手法参考。",
        sketches: [
          { id: 'pb-s1', title: "气泡升向粉色", art: scene('bubbles', BLOSSOM, { sketch: true, composition: 'low-horizon', seed: 3 }), scores: scores(["概念", 4.2], ["构图", 4.1], ["视觉层次", 4.0], ["品牌与季节", 3.8]), verdict: 'selected', reason: "向上流动，在视线落点保持明亮。" },
          { id: 'pb-s2', title: "单个巨大气泡", art: scene('bubbles', BLOSSOM, { sketch: true, composition: 'close-up', seed: 3 }), scores: scores(["概念", 3.4], ["构图", 3.6], ["视觉层次", 3.8], ["品牌与季节", 3.2]), verdict: 'rejected', reason: "容易读成梅果，而非气泡。" },
          { id: 'pb-s3', title: "斜向气流", art: scene('bubbles', BLOSSOM, { sketch: true, composition: 'diagonal', seed: 3 }), scores: scores(["概念", 3.9], ["构图", 3.7], ["视觉层次", 3.5], ["品牌与季节", 3.6]), verdict: 'rejected', reason: "与品牌字标相互竞争。" },
        ],
        sketchNote: "包装草图按创意、构图、层次及品牌季节表达评估。",
        refined: [
          {
            version: 1,
            art: pack('can', 'three-quarter', BUBBLE),
            explanation: "气泡从深梅色升向花瓣粉，上半罐最明亮，对应冷柜中的主要视线区域。",
            scores: sB,
            requirements: [
              { text: "能够识别梅子风味", met: true, note: "以颜色及梅味名称建立风味识别。" },
              { text: "保留母品牌家族印章", met: true, note: "印章上移，提高可见性。" },
              { text: "不暗示酒精度或规格", met: true, note: '' },
            ],
            status: 'accepted',
            challenge: { claim: "模拟货架辨识度4.5", challenge: "底部接近竞品的紫色。", resolution: "渐变整体上提，使上半罐呈粉色。", outcome: 'upheld' },
          },
        ],
        views: [
          { label: "正面", art: pack('can', 'front', BUBBLE) },
          { label: "四分之三视图", art: pack('can', 'three-quarter', BUBBLE) },
          { label: "背面", art: pack('can', 'back', BUBBLE) },
          { label: "礼套", art: pack('four-pack', 'front', BUBBLE) },
        ],
        mockups: [{ label: "手持展示", why: "检查手臂距离下的渐变阅读效果。", art: mock('hand', pack('can', 'front', BUBBLE)) }],
      },
      {
        directionId: 'C',
        search: { seeking: "拼合后才完整的图画。", borrow: ["将全景拆分到多个物件上", "平面插画", "无需额外包纸的礼物"], notFor: "不使用聚会摄影。" },
        references: [
          { id: 'pc-r1', title: "你提供的包袱布参考", origin: 'cross_industry', art: scene('gift-wrap', BLOSSOM, { seed: 5 }), borrow: "按你的建议，将布结用于礼套封口表达。", verdict: 'selected', reason: "这份演示参考用于解决不额外包装也能赠礼的问题。" },
          { id: 'pc-r2', title: "屋顶相聚", origin: 'task_matched', art: scene('rooftop', ROOF, { seed: 2 }), borrow: "场景本身。", verdict: 'selected', reason: "来自模拟访谈主题。" },
          { id: 'pc-r3', title: "拼图盒包装", origin: 'cross_industry', art: scene('gift-wrap', ['#e9eef2', '#9fb7c9', '#3f5d77', '#1d2a36', '#e9b44c', '#1d2a36'], { seed: 8 }), borrow: "拼合关系。", verdict: 'rejected', reason: "容易显得像玩具。" },
          { id: 'pc-r4', title: "灯笼街景", origin: 'cross_industry', art: scene('festival-lanterns', ['#2b1d2a', '#4c2b45', '#9d4f63', '#e58f73', '#ffd38a', '#120a14'], { seed: 4 }), borrow: "季节光线。", verdict: 'rejected', reason: "作为场景背景过于繁忙。" },
        ],
        referenceNote: "包袱布参考已用于礼套封口表达。",
        sketches: [
          { id: 'pc-s1', title: "横跨四罐的屋顶全景", art: scene('rooftop', ROOF, { sketch: true, composition: 'wide', seed: 2 }), scores: scores(["概念", 4.6], ["构图", 4.3], ["视觉层次", 4.1], ["品牌与季节", 4.4]), verdict: 'selected', reason: "每一部分单独也成立。" },
          { id: 'pc-s2', title: "俯视餐桌", art: scene('rooftop', ROOF, { sketch: true, composition: 'high-horizon', seed: 2 }), scores: scores(["概念", 4.0], ["构图", 3.6], ["视觉层次", 3.5], ["品牌与季节", 3.8]), verdict: 'rejected', reason: "在曲面罐身上难以阅读。" },
          { id: 'pc-s3', title: "传递罐装饮品的手", art: scene('rooftop', ROOF, { sketch: true, composition: 'close-up', seed: 2 }), scores: scores(["概念", 3.8], ["构图", 3.9], ["视觉层次", 3.6], ["品牌与季节", 3.3]), verdict: 'rejected', reason: "失去了梅树与季节线索。" },
        ],
        sketchNote: "包装草图按创意、构图、层次及品牌季节表达评估。",
        refined: [
          {
            version: 1,
            art: panoramaSleeve,
            explanation: "暮色里，四位朋友围绕梅树相聚。四罐并排拼成全景，礼套用包袱布式结扣表达无需额外包装的赠礼感。",
            scores: sC,
            requirements: [
              { text: "能够识别梅子风味", met: true, note: "每部分都有梅树与果实，每罐都有梅味名称。" },
              { text: "保留母品牌家族印章", met: true, note: "每罐及结扣处均保留品牌印章。" },
              { text: "不暗示酒精度或规格", met: true, note: "不出现酒精度线索，也不展示饮酒。" },
              { text: "每罐在冷柜里单独成立", met: true, note: "每一部分都是完整小场景。" },
            ],
            status: 'awaiting_review',
            challenge: { claim: "模拟赠礼体面感4.7", challenge: "结扣只是印刷图形，并非真实封口，是否会像廉价噱头？", resolution: "概念阶段明确为印刷图形，真实折叠结构留待生产设计确认。", outcome: 'partly_upheld' },
          },
        ],
        views: [
          { label: "四罐中的第1罐", art: pack('can', 'front', PANO(0)) },
          { label: "四罐中的第2罐", art: pack('can', 'front', PANO(1)) },
          { label: "四罐中的第3罐", art: pack('can', 'front', PANO(2)) },
          { label: "四罐中的第4罐", art: pack('can', 'front', PANO(3)) },
          { label: "礼套", art: panoramaSleeve },
        ],
        mockups: [
          { label: "赠礼餐桌", why: "检查不额外包装时是否仍显体面。", art: mock('gift-table', panoramaSleeve) },
          { label: "冷柜货架", why: "检查单罐独立呈现。", art: mock('shelf', pack('can', 'front', PANO(1))) },
        ],
      },
    ],
    similarity: [
      { pair: ['B', 'C'], level: 'medium', note: "两个方向都依赖梅色到粉色的色彩关系。", action: "方向丙保持平面插画，仅方向乙使用渐变。" },
      { pair: ['A', 'B'], level: 'low', note: "笔触传承与可见气泡的差异。", action: "无需处理。" },
      { pair: ['A', 'C'], level: 'low', note: "单枝梅树与完整场景的差异。", action: "无需处理。" },
    ],
    conceptLimits: [
      "简报未指定罐形与规格，当前仅为示意。",
      "酒精度未确认，因此未展示相关数值与法定标识；真实完稿需在确认后补充。",
      "材料、表面工艺与印刷方式未指定，应用图仅为概念，不代表生产结构。",
    ],
  },
  contentReview: {
    checks: [
      { id: 'pq1', question: "是否回答简报？", outcome: 'pass', note: "每个方向均用同一系统回应单罐与礼套任务。" },
      { id: 'pq2', question: "调研、结论、主题与视觉是否连贯？", outcome: 'pass', note: "每个方向都能追溯到一个机会点。" },
      { id: 'pq3', question: "章节过渡是否自然？", outcome: 'revised', note: "补充冷柜发现到策略之间的过渡。" },
      { id: 'pq4', question: "语言是否简洁，并符合品牌策略？", outcome: 'revised', note: "缩短方向介绍。" },
      { id: 'pq5', question: "事实宣称是否有依据？", outcome: 'revised', note: "删除缺乏依据的完美聚会饮品说法。" },
      { id: 'pq6', question: "图片与文案是否表达同一件事？", outcome: 'pass', note: '' },
      { id: 'pq7', question: "三个方向是否有实质差异？", outcome: 'pass', note: "传承、气泡与分享。" },
    ],
    narrative: [
      { id: 'pn1', title: "开场", text: "演示冷柜中的梅味罐多为深紫色，梅潮可以不同。", before: null, changeReason: null },
      { id: 'pn2', title: "核心问题", text: "如何让新梅味饮品先被选中，适合赠礼，又保留母品牌识别？", before: null, changeReason: null },
      { id: 'pn3', title: "调研发现", text: "深底水果图是演示惯例；礼套无需额外包装也要体面；单罐用于共同餐桌；梅花提示新年。", before: null, changeReason: null },
      { id: 'pn4', title: "三个创意方向", text: "甲把母品牌梅枝带到米白罐，乙让气泡可见，丙将相聚全景分到四罐。", before: "演示旧稿曾将三个方向均称为完美聚会选择。", changeReason: "已删除无依据的宣称。" },
      { id: 'pn5', title: "推荐选择", text: "礼套与系列发布主推方向丙，甲作为传承备选。", before: null, changeReason: null },
    ],
  },
  layout: {
    styles: [
      EDITORIAL_STYLE,
      COBALT_STYLE,
      STUDIO_STYLE,
    ],
    chosen: null,
    chosenBy: null,
    slides: [
      { id: 'ps1', kind: 'cover', lead: "梅潮", support: "包装提案 · 单罐与礼套", art: panoramaSleeve, notes: '' },
      { id: 'ps2', kind: 'question', lead: "如何让新梅味饮品先被选中、适合赠礼，并清楚属于母品牌？", support: "核心问题", notes: '' },
      { id: 'ps3', kind: 'data', lead: "12个中的7个", support: "演示竞品罐正面为深紫色。", bigNumber: '7/12', notes: "模拟观察笔记，仅供工程演示。" },
      { id: 'ps4', kind: 'conclusion', lead: "以浅色插画形成差异，并将单罐与礼套作为同一系统。", support: "品类 · 品牌 · 受众", notes: '' },
      { id: 'ps5', kind: 'visual', lead: "水墨梅园", support: "老梅园，长出新枝。", directionId: 'A', art: pack('can', 'three-quarter', INK), notes: '' },
      { id: 'ps6', kind: 'visual', lead: "梅色上扬", support: "梅子的心情，轻轻起泡。", directionId: 'B', art: pack('can', 'three-quarter', BUBBLE), notes: '' },
      { id: 'ps7', kind: 'visual', lead: "传给身边的人", support: "四罐，一幅画。", directionId: 'C', art: panoramaSleeve, notes: '' },
      { id: 'ps8', kind: 'mockup', lead: "在赠礼餐桌上", support: "无需额外包装也显体面。", directionId: 'C', art: mock('gift-table', panoramaSleeve), notes: '' },
      { id: 'ps9', kind: 'mockup', lead: "在冷柜里", support: "用浅色区别于整面紫色。", directionId: 'A', art: mock('shelf', pack('can', 'front', INK)), notes: '' },
      { id: 'ps10', kind: 'comparison', lead: "先被选中的三种方式", support: "传承 · 气泡 · 分享", notes: '' },
      { id: 'ps11', kind: 'recommendation', lead: "主推丙，保留甲作为传承方向。", support: "用一个创意解决单罐与礼套。", directionId: 'C', art: panoramaSleeve, notes: '' },
      { id: 'ps12', kind: 'closing', lead: "完稿前需确认酒精度、规格与材料。", support: "给母品牌的待确认问题", notes: '' },
    ],
    editability: {
      native: ["所有标题、文案与图片说明", "页面底色、分隔线与色块", "以原生演示图表呈现的统计"],
      raster: ["生成的包装图与应用图，作为可替换图片放置"],
    },
  },
  delivery: {
    checks: [
      { id: 'pd1', area: "内容完整性", outcome: 'pass', note: '' },
      { id: 'pd2', area: "视觉层级与一致性", outcome: 'pass', note: '' },
      { id: 'pd3', area: "图片质量与裁切", outcome: 'pass', note: '' },
      { id: 'pd4', area: "文字溢出与可读性", outcome: 'fixed', note: "方向丙副文案已缩短。" },
      { id: 'pd5', area: "应用示意是否符合场景", outcome: 'pass', note: "仅展示冷柜、赠礼餐桌与手持场景。" },
      { id: 'pd6', area: "渲染检查", outcome: 'pass', note: '' },
      { id: 'pd7', area: "演示文件可编辑性", outcome: 'pass', note: '' },
    ],
    comparison: [
      { criterion: "创意机制", values: { A: "母品牌传承", B: "把气泡画出来", C: "将分享写进结构" } },
      { criterion: "主文案", values: { A: "老梅园，长出新枝。", B: "梅子的心情，轻轻起泡。", C: "四罐，一幅画。" } },
      { criterion: "传播评分", values: { A: '3.96', B: '4.18', C: '4.46' } },
      { criterion: "礼套", values: { A: "克制、经典", B: "醒目渐变", C: "拼成完整画面" } },
      { criterion: "主要风险", values: { A: "容易被理解为梅酒", B: "接近竞品紫色", C: "单罐只呈现四分之一" } },
    ],
    recommendation: "礼套与发布主推方向丙，甲保留为传承备选。",
    limitations: ["酒精度、罐规格和材料未确认，当前没有展示法定标识。", "包装图为生成的概念插画，不是生产完稿。"],
  },
  decisions: [
    { id: 'pd-1', stage: 'strategy', kind: 'approved', by: "演示用户", at: '2026-10-21T08:00:00Z', comment: "同意采用轻盈的插画方向。", reviewerPosition: null },
    { id: 'pd-2', stage: 'themes', kind: 'approved', by: "演示用户", at: '2026-10-22T07:30:00Z', comment: "三个方向继续；方向丙可参考包袱布封口。", reviewerPosition: null },
  ],
  contributions: [
    { id: 'pc-1', stage: 'themes', kind: 'reference', text: "包袱布礼赠包装", borrow: "将布结用于礼套，使其无需包纸也有赠礼感。", by: "演示用户", at: '2026-10-22T07:25:00Z', status: 'used', response: "已用于方向丙的精修礼套。" },
  ],
  tasks: [
    { id: 'pt1', stage: 'brief', agent: "提案总监", level: 'director', task: "整理任务卡，标出酒精度、规格与年龄范围的未知项", status: 'done', startedAt: '2026-10-18T02:05:00Z', seconds: 38, receipt: 'rcpt_pt_brief' },
    { id: 'pt2', stage: 'research', agent: "调研负责人", level: 'lead', task: "为新品与包装规划调研", status: 'done', startedAt: '2026-10-18T07:00:00Z', seconds: 52, receipt: 'rcpt_pt_plan' },
    { id: 'pt3', stage: 'research', agent: "案例搜集员 ×2", level: 'specialist', task: "冷柜比较与赠礼参考检索", status: 'done', startedAt: '2026-10-18T07:02:00Z', seconds: 180, receipt: 'rcpt_pt_scouts' },
    { id: 'pt4', stage: 'strategy', agent: "策略负责人", level: 'lead', task: "按顺序形成论证与机会点", status: 'done', startedAt: '2026-10-20T04:00:00Z', seconds: 160, receipt: 'rcpt_pt_strat' },
    { id: 'pt5', stage: 'themes', agent: "文案负责人", level: 'lead', task: "按机制形成三个方向", status: 'done', startedAt: '2026-10-21T09:00:00Z', seconds: 210, receipt: 'rcpt_pt_copy' },
    { id: 'pt6', stage: 'visual', agent: "参考搜集员 ×3", level: 'specialist', task: "按方向搜集参考", status: 'done', startedAt: '2026-10-22T08:00:00Z', seconds: 170, receipt: 'rcpt_pt_refs' },
    { id: 'pt7', stage: 'visual', agent: "包装成稿制作员", level: 'specialist', task: "制作三个方向的精修视图与应用示意", status: 'done', startedAt: '2026-10-23T08:00:00Z', seconds: 520, receipt: 'rcpt_pt_render' },
    { id: 'pt8', stage: 'visual', agent: "视觉评审员", level: 'evaluator', task: "评估精修概念", status: 'done', startedAt: '2026-10-24T09:00:00Z', seconds: 66, receipt: 'rcpt_pt_eval' },
  ],
  reviews: [
    { id: 'pr1', stage: 'themes', subject: "方向甲至丙", evaluator: "文案评审员", average: Math.round(((avg(tA) + avg(tB) + avg(tC)) / 3) * 100) / 100, verdict: "模拟评审均通过，推荐方向丙", challenge: null, directorResolution: "已在主题检查点提交人工决定。", at: '2026-10-21T13:00:00Z' },
    { id: 'pr2', stage: 'visual', subject: "方向甲精修稿", evaluator: "视觉评审员", average: avg(sA), verdict: "模拟通过", challenge: null, directorResolution: null, at: '2026-10-24T09:10:00Z' },
    { id: 'pr3', stage: 'visual', subject: "方向乙精修稿", evaluator: "视觉评审员", average: avg(sB), verdict: "上移渐变后模拟通过", challenge: { claim: "货架辨识度4.5", challenge: "底色接近竞品紫色。", resolution: "上半罐改为粉色。", outcome: 'upheld' }, directorResolution: null, at: '2026-10-24T09:20:00Z' },
    { id: 'pr4', stage: 'visual', subject: "方向丙精修稿", evaluator: "视觉评审员", average: avg(sC), verdict: "模拟评审通过，等待人工决定", challenge: { claim: "模拟赠礼体面感4.7", challenge: "印刷结扣可能被理解为噱头。", resolution: "仅为概念，折叠结构待生产设计确认。", outcome: 'partly_upheld' }, directorResolution: "已在视觉检查点提交人工决定。", at: '2026-10-24T09:40:00Z' },
  ],
  handoffs: [
    { id: 'ph1', from: 'research', to: 'strategy', producer: "调研负责人", consumer: "策略负责人", producerCheck: "演示交付记录明确三项禁止推断：酒精度、年龄，以及购买者等同于饮用者。", consumerCheck: "已接收，未决问题继续保留在任务卡。", status: 'accepted', at: '2026-10-20T03:00:00Z' },
    { id: 'ph2', from: 'strategy', to: 'themes', producer: "策略负责人", consumer: "文案负责人", producerCheck: "三个机会点均有演示依据。", consumerCheck: "各机会点支持不同机制。", status: 'accepted', at: '2026-10-21T08:10:00Z' },
    { id: 'ph3', from: 'themes', to: 'visual', producer: "文案负责人", consumer: "视觉负责人", producerCheck: "文案已定，并附包袱布参考。", consumerCheck: "要求书面明确不暗示酒精度。", status: 'accepted', at: '2026-10-22T07:40:00Z' },
  ],
  versions: [
    { id: 'pv1', stage: 'brief', label: "任务卡", version: 1, inputs: ["客户简报演示", "母品牌规范"], at: '2026-10-18T06:30:00Z', state: 'current', impact: null },
    { id: 'pv2', stage: 'research', label: "调研看板", version: 1, inputs: ["任务卡第1版", "5份演示来源"], at: '2026-10-20T03:00:00Z', state: 'current', impact: null },
    { id: 'pv3', stage: 'strategy', label: "策略", version: 1, inputs: ["调研第1版"], at: '2026-10-21T08:00:00Z', state: 'current', impact: null },
    { id: 'pv4', stage: 'themes', label: "创意方向", version: 1, inputs: ["策略第1版", "你提供的包袱布参考"], at: '2026-10-22T07:30:00Z', state: 'current', impact: null },
    { id: 'pv5', stage: 'visual', label: "精修概念稿", version: 1, inputs: ["方向第1版"], at: '2026-10-24T09:40:00Z', state: 'current', impact: null },
  ],
  revision: 18,
  updatedAt: '2026-10-24T09:40:00Z',
};
