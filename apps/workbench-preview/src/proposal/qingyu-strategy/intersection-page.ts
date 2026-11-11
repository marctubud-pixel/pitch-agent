import type { Box, Node, Page, TextNode } from '../deck-studio/model';
import type { StrategyBoard } from './summary';

type Pair = { k: string; d: string };
type IntersectionPoints = { research: Pair; product: Pair; audience: Pair; intersection: Pair };
const blue = '#002FA7';

function text(box: Box, value: string, size: number, color = '#26374D', weight = 400): TextNode {
  const lines = value.split('\n'), lh = 1.3;
  const width = (line: string) => Array.from(line).reduce((sum, char) => sum + (/[ -~]/.test(char) ? .62 : 1) * size, 0);
  if (lines.some(line => width(line) > box.w) || lines.length * size * lh > box.h) throw new Error('交叉点图版文字超出容量');
  return { kind: 'text', ...box, lines, runs: [], size, face: 'PingFang SC', weight, color, lh, ls: 0, align: 'left', valign: 'top', opacity: 1 };
}

function pointText(point: Pair, title: string, body: string, x: number, y: number, w: number, size = 20): Node[] {
  if (title.replaceAll('\n', '') !== point.k || body.replaceAll('\n', '') !== point.d) throw new Error('交叉点图版文字与策略原稿不符');
  return [text({ x, y, w, h: 58 }, title, 22, blue, 600), text({ x, y: y + (title.includes('\n') ? 64 : 38), w, h: 118 }, body, size)];
}

function intersectionPoints(board: StrategyBoard): IntersectionPoints {
  if (board.template.kind !== 'summary.list' || board.template.points.length !== 4) throw new Error('交叉点图版需要四组策略要点');
  const [research, product, audience, intersection] = board.template.points;
  if (!research || !product || !audience || !intersection) throw new Error('交叉点图版缺少策略要点');
  return { research, product, audience, intersection };
}

export function buildStrategyIntersectionPage(board: StrategyBoard): Page {
  const points = intersectionPoints(board);
  const rings: Node[] = [
    { x: 80, y: 130, stroke: blue },
    { x: 330, y: 130, stroke: '#6E905B' },
    { x: 205, y: 330, stroke: '#487E93' },
  ].map(ring => ({ kind: 'ellipse', ...ring, w: 340, h: 340, fill: null, lw: 3, opacity: .8, radius: 0 }));
  const calloutTitle = '交叉点 · 保持清楚，\n讲明用水';
  const calloutBody = '基础信息清楚，把虎跑泉用水\n作为青屿可进一步讲清的\n产品特点。';
  if (calloutTitle.replaceAll('\n', '') !== points.intersection.k || calloutBody.replaceAll('\n', '') !== points.intersection.d) throw new Error('交叉点说明与策略原稿不符');
  return {
    id: board.id, title: board.title, chapter: board.chapter, notes: board.notes, caption: board.caption,
    template: 'strategy.venn', bg: '#FFFFFF', nodes: [
      text({ x: 56, y: 30, w: 1150, h: 26 }, board.eyebrow, 17, blue, 600),
      text({ x: 56, y: 71, w: 1168, h: 52 }, board.title, 34, '#17273C', 600),
      ...rings,
      { kind: 'line', x1: 375, y1: 400, x2: 794, y2: 400, color: blue, width: 2, opacity: .8 },
      { kind: 'rect', x: 370, y: 395, w: 10, h: 10, fill: blue, stroke: null, lw: 0, opacity: 1, radius: 5 },
      ...pointText(points.research, '研究 · \n理解入口', '茶味、无糖等\n基础信息，是理解\n产品的入口。', 145, 180, 180),
      ...pointText(points.product, '产品 · \n具体资源', '茶种与口感\n接近市售产品；\n配方使用虎跑泉水。', 460, 180, 200),
      ...pointText(points.audience, '用户 · 任务人群', '便利店、电商选茶的\n25至34岁城市办公者；\n是否在意泉水\n尚待验证。', 290, 500, 240, 18),
      text({ x: 820, y: 293, w: 390, h: 92 }, calloutTitle, 29, blue, 600),
      text({ x: 820, y: 443, w: 390, h: 110 }, calloutBody, 24),
      text({ x: 820, y: 602, w: 390, h: 50 }, '三环为分析关系示意，\n不表示统计比例或已验证的人群重合。', 17, '#667384'),
      text({ x: 56, y: 688, w: 1120, h: 22 }, '青屿', 13, '#667384'),
      text({ x: 1170, y: 688, w: 54, h: 22 }, '02 / 03', 12, '#667384'),
    ],
  };
}
