import { useState, type ReactNode, type Ref } from 'react';
import { byId, type QingyuSection } from './report';
import { r2Value, type NumericRef, type QingyuR2Report, type R2Case, type R2Chart, type R2Price, type R2Sku } from './report-r2';
import { BOARD_FONT, type BoardAsset } from './board-export';
import type { Selection } from './QingyuR2View';

const BLUE = '#002fa7';
const INK = '#192337';
const MUTED = '#596579';
const FOG = '#f1f4f8';
const RULE = '#d8dfe8';
export const BOARD_DATA_SHA = '6a09986e67c970e8f803c3b6d6b20a5657c47cbfbbc4156a2efba2d3aab452b2';
export const SCENE_ASSET: BoardAsset = {
  id: 'qingyu-cooler-scene-illustration-20261109', role: 'generated-illustration',
  path: '/research-case/qingyu-boards-20261109/cooler-choice-illustration.png',
  sha256: '75ca946b2e78a5aaa363c9e0638a0e5bf420db5fd27a13cc8b17570e7798835c',
  label: '生成场景示意 · 非实拍、非调研样本', caption: '任务设定中的便利店冷柜选购情境',
};

type BoardBase = { id: string; number: string; title: string; subtitle: string; evidenceIds: string[]; assets: BoardAsset[] };
export type ResearchBoard = BoardBase & (
  { kind: 'market'; growth: R2Chart; share: R2Chart }
  | { kind: 'people'; chart: R2Chart }
  | { kind: 'prices'; quotes: R2Price[] }
  | { kind: 'packs'; cases: R2Case[] }
  | { kind: 'product'; conditions: QingyuSection['conditions'] }
  | { kind: 'conclusion' }
);
const number = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);

export function chapterBoards(report: QingyuR2Report, section: QingyuSection): ResearchBoard[] {
  const base = { evidenceIds: [...section.findingIds, ...section.datumIds, ...section.gapIds], assets: [] };
  switch (section.id) {
    case 'market': return [{ ...base, kind: 'market', id: '01-market', number: '01', title: '销额仍增长，品类结构转向无糖', subtitle: '两个监测窗口分别阅读。销售额与人数、销量分开。', growth: byId(report.charts, 'CH-GROW'), share: byId(report.charts, 'CH-SHARE') }];
    case 'people': return [{ ...base, kind: 'people', id: '02-people', number: '02', title: '先看懂是什么茶，再验证视觉偏好', subtitle: '工作场景问卷提供选择因素参照；包装承担识别与风味预期。', chart: byId(report.charts, 'CH-WORK'), assets: [SCENE_ASSET] }];
    case 'competition': return [
      { ...base, kind: 'prices', id: '03-prices', number: '03', title: '相近历史价位，已有不同产品理由', subtitle: '12条有价记录逐点展示；跨时期、渠道与报价性质不连趋势线。', quotes: report.prices },
      { ...base, kind: 'packs', id: '04-packs', number: '04', title: '看包装怎样表达茶种、属性与差异', subtitle: '6件同品类原件与2件邻近参照分组。仅观察本轮物料，不代表消费者效果。', cases: section.caseIds.map(id => byId(report.cases, id)), assets: section.caseIds.map(id => { const product = byId(report.cases, id); const image = byId(report.imageManifest, product.imageId); return { id: image.id, role: 'original', path: image.path, sha256: image.sha256, sourceId: image.sourceId, caseId: product.id, identity: image.identityLabel }; }) },
    ];
    case 'product': return [{ ...base, kind: 'product', id: '05-product', number: '05', title: '比较条件已给定，真实产品理由待补', subtitle: '虚构任务的规格与保留资产是约束；真实茶种、配方和口感还不是已知事实。', conditions: section.conditions }];
    case 'conclusion': return [{ ...base, kind: 'conclusion', id: '06-conclusion', number: '06', title: '研究明确了比较范围，也留下关键未决项', subtitle: '定性综合关系图。用于整理研究所得，不表示实测因果或已批准策略。' }];
    default: { const exhaustive: never = section.id; return exhaustive; }
  }
}

export function ChapterBoards({ report, section, onInspect }: { report: QingyuR2Report; section: QingyuSection; onInspect: (selection: Selection) => void }) {
  if (!hasChapterBoardReferences(report, section)) return <div className="qy-board-unavailable" role="status"><p>本章图版资料未齐，可展开完整分析。</p></div>;
  return <div className="qy-boards">{chapterBoards(report, section).map(board => <BoardCard board={board} report={report} onInspect={onInspect} key={board.id} />)}</div>;
}

function hasChapterBoardReferences(report: QingyuR2Report, section: QingyuSection): boolean {
  const chart = (id: string, refs: NumericRef[]) => report.charts.some(chart => chart.id === id && chart.unit === '%' && chart.rows.length === refs.length && refs.every(ref => chart.rows.some(row => row.datumId === ref.datumId && row.valuePath === ref.valuePath)));
  const sources = (ids: string[]) => ids.every(id => report.sources.some(source => source.id === id));
  const brief = () => {
    const value = report.datums.find(datum => datum.id === 'B-GIVEN')?.value;
    return typeof value === 'object' && value !== null && ['容量', '价格下限', '价格上限'].every(path => Object.hasOwn(value, path) && typeof value[path] === 'number');
  };
  switch (section.id) {
    case 'market': return chart('CH-GROW', [{ datumId: 'M-GROW', valuePath: null }]) && chart('CH-SHARE', ['2024', '2025', '2026'].map(valuePath => ({ datumId: 'M-SHARE', valuePath })));
    case 'people': return chart('CH-WORK', ['口味／风味', '口感／质地', '健康功效'].map(valuePath => ({ datumId: 'P-WORK', valuePath })));
    case 'competition': return brief() && sources(['CS01', 'CS02', 'CS03', 'CS09']) && report.prices.length === Object.keys(quoteTitles).length + 1 && Object.keys(quoteTitles).every(id => report.prices.some(price => price.id === id && price.kind === 'priced')) && report.prices.some(price => price.id === 'PRICE-CM08-UNKNOWN' && price.kind === 'unknown') && section.caseIds.length === Object.keys(packNotes).length && Object.keys(packNotes).every(id => report.cases.some(product => product.imageId === id && section.caseIds.includes(product.id)));
    case 'product': return brief() && sources(['BRIEF-S1', 'CS04']) && section.conditions.length === 4;
    case 'conclusion': return report.findings.some(finding => finding.id === 'FS1') && sources(['M-S03', 'PS04', 'CS02', 'CS03', 'BRIEF-S1']);
    default: { const exhaustive: never = section.id; return exhaustive; }
  }
}

function BoardCard({ report, board, onInspect }: { report: QingyuR2Report; board: ResearchBoard; onInspect: (selection: Selection) => void }) {
  const [failedAssets, setFailedAssets] = useState<Set<string>>(new Set());
  const charts = board.kind === 'market' ? [board.growth, board.share] : board.kind === 'people' ? [board.chart] : [];
  return <figure className="qy-board" data-board={board.id}>
    <BoardSvg report={report} board={board} failedAssets={failedAssets} imageAttempt={0} onImageError={id => setFailedAssets(current => new Set([...current, id]))} />
    <figcaption className="qy-board-controls"><div><strong>图版 {board.number}</strong></div><div className="qy-board-actions"><button type="button" onClick={() => onInspect({ kind: 'references', title: `${board.title} · 依据与边界`, ids: board.evidenceIds })}>图版依据 ↗</button>{charts.map(chart => <button type="button" key={chart.id} onClick={() => onInspect({ kind: 'chart', chart })}>{chart.metricLabel} · 数值 ↗</button>)}</div></figcaption>
    {board.kind === 'packs' && <div className="qy-board-originals" aria-label="图版中的八件原图">{board.cases.map(product => <button type="button" key={product.id} onClick={() => onInspect({ kind: 'image', product })}>{product.title} · 原图 ↗</button>)}</div>}
    {failedAssets.size > 0 && <p className="qy-board-error" role="status">部分图片暂不可用，完整观察与原件身份可在详细分析中查看。</p>}
  </figure>;
}

function Text({ x, y, children, size = 22, fill = INK, weight = 400, anchor = 'start' }: { x: number; y: number; children: ReactNode; size?: number; fill?: string; weight?: number; anchor?: 'start' | 'middle' | 'end' }) {
  return <text x={x} y={y} fontSize={size} fill={fill} fontWeight={weight} textAnchor={anchor}>{children}</text>;
}
function Lines({ x, y, lines, size = 22, fill = MUTED, gap = 33, weight = 400 }: { x: number; y: number; lines: string[]; size?: number; fill?: string; gap?: number; weight?: number }) {
  return <text x={x} y={y} fontSize={size} fill={fill} fontWeight={weight}>{lines.map((line, index) => <tspan key={index} x={x} dy={index ? gap : 0}>{line}</tspan>)}</text>;
}
function SourceLine({ report, ids, x = 64, y = 833 }: { report: QingyuR2Report; ids: string[]; x?: number; y?: number }) {
  const shortNames: Record<string, string> = { CS01: '北京商报 / 经济观察网', CS02: 'FBIF让茶投稿', CS03: 'FBIF伊利投稿', CS04: 'FBIF东鹏投稿', CS09: '同花顺财经转载' };
  return <Text x={x} y={y} size={17} fill={MUTED}>来源 {ids.map(id => { const source = byId(report.sources, id); return shortNames[id] ?? source.publisher; }).join('；')}</Text>;
}
function Panel({ x, y, width, height, fill = FOG }: { x: number; y: number; width: number; height: number; fill?: string }) { return <rect x={x} y={y} width={width} height={height} rx="10" fill={fill} />; }

export function BoardSvg({ report, board, svgRef, failedAssets = new Set(), imageAttempt = 0, onImageError = () => {} }: { report: QingyuR2Report; board: ResearchBoard; svgRef?: Ref<SVGSVGElement>; failedAssets?: ReadonlySet<string>; imageAttempt?: number; onImageError?: (id: string) => void }) {
  const metadata = {
    reportId: report.id, researchOriginReportRevision: report.revision.number, sourceSkill: report.revision.skillRevision,
    presentationContract: 'r4-visual-20261109', sourceDataSHA256: BOARD_DATA_SHA, boardId: board.id,
    asOf: report.asOf, evidenceIds: board.evidenceIds, assets: board.assets,
    numericRefs: board.kind === 'market' ? [...board.growth.rows, ...board.share.rows].map(({ datumId, valuePath }) => ({ datumId, valuePath, value: r2Value(report, { datumId, valuePath }) })) : board.kind === 'people' ? board.chart.rows.map(({ datumId, valuePath }) => ({ datumId, valuePath, value: r2Value(report, { datumId, valuePath }) })) : board.kind === 'prices' ? board.quotes.filter(p => p.kind === 'priced').map(p => ({ quoteId: p.id, skuId: p.skuId, ...p.price, rawAmount: r2Value(report, p.price), sourceId: p.sourceId })) : [],
    export: { png: '1920x1080; current-device CJK glyphs', svg: 'native text; receiving device requires CJK fonts' },
  };
  const body = (() => {
    switch (board.kind) {
      case 'market': return <MarketBoard report={report} board={board} />;
      case 'people': return <PeopleBoard report={report} board={board} failedAssets={failedAssets} imageAttempt={imageAttempt} onImageError={onImageError} />;
      case 'prices': return <PriceBoard report={report} board={board} />;
      case 'packs': return <PackBoard report={report} board={board} failedAssets={failedAssets} imageAttempt={imageAttempt} onImageError={onImageError} />;
      case 'product': return <ProductBoard report={report} board={board} />;
      case 'conclusion': return <ConclusionBoard report={report} />;
      default: { const exhaustive: never = board; return exhaustive; }
    }
  })();
  return <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1600 900" role="img" aria-labelledby={`qy-board-${board.id}-title qy-board-${board.id}-desc`} fontFamily={BOARD_FONT} ref={svgRef} data-board-svg={board.id}>
    <title id={`qy-board-${board.id}-title`}>{board.title}</title><desc id={`qy-board-${board.id}-desc`}>{board.subtitle}。青屿公开资料报告修订2。资料截至{report.asOf}。所有详细原值、时期与局限可从本章详情及图版依据查看。</desc><metadata>{JSON.stringify(metadata)}</metadata>
    <rect width="1600" height="900" fill="#ffffff" /><rect x="0" y="0" width="13" height="900" fill={BLUE} />
    <Text x={64} y={60} size={19} weight={650} fill={BLUE}>青屿 / 公开资料研究 · 修订2</Text><Text x={1536} y={60} size={18} fill={MUTED} anchor="end">图版 {board.number} / 06</Text>
    <Text x={64} y={124} size={43} weight={650}>{board.title}</Text><Text x={64} y={171} size={23} fill={MUTED}>{board.subtitle}</Text>
    {body}
    <line x1="64" y1="787" x2="1536" y2="787" stroke={RULE} /><Text x={64} y={867} size={16} fill={MUTED}>资料截至 {report.asOf} · 研究待补 · 依据任务卡第1版 · 图中判断不表示消费者或客户批准</Text><Text x={1536} y={867} size={16} fill={MUTED} anchor="end">青屿 / {board.number}</Text>
  </svg>;
}

function MarketBoard({ report, board }: { report: QingyuR2Report; board: Extract<ResearchBoard, { kind: 'market' }> }) {
  return <><Panel x={64} y={217} width={456} height={524} /><Text x={96} y={265} size={25} weight={650}>监测无糖即饮茶销售额</Text><Text x={96} y={309} size={22} fill={MUTED}>{board.growth.period}</Text>
    {board.growth.rows.map(row => <Text key={row.datumId} x={88} y={455} size={108} fill={BLUE} weight={650}>{r2Value(report, row) >= 0 ? '+' : ''}{number(r2Value(report, row))}<tspan fontSize="50">%</tspan></Text>)}
    <Lines x={96} y={518} size={24} lines={['同比2025年第三季度', '传统线下监测渠道']} /><line x1="96" y1="581" x2="488" y2="581" stroke={RULE} /><Lines x={96} y={627} size={21} lines={['销额增长，不是人数或出货量增长', '头部集中方向另有报告', '集中度口径待核，不画品牌份额']} />
    <Text x={594} y={259} size={27} weight={650}>无糖占即饮茶销售额</Text><Text x={594} y={298} size={21} fill={MUTED}>各年5至8月 · 同季窗口 · 单位 %</Text>
    {[0, 25, 50, 75, 100].map(tick => { const y = 677 - tick * 3.2; return <g key={tick}><line x1="660" y1={y} x2="1514" y2={y} stroke={RULE} /><Text x={640} y={y + 6} size={18} fill={MUTED} anchor="end">{tick}</Text></g>; })}
    {board.share.rows.map((row, index) => { const value = r2Value(report, row); const x = 768 + index * 268; const height = value * 3.2; return <g key={row.label} data-datum={row.datumId} data-value-path={row.valuePath ?? ''}><rect x={x} y={677 - height} width="144" height={height} fill={index === 2 ? BLUE : '#9eb2df'} rx="3" /><Text x={x + 72} y={657 - height} size={32} weight={650} fill={BLUE} anchor="middle">{number(value)}%</Text><Text x={x + 72} y={715} size={24} anchor="middle">{row.label}</Text></g>; })}
    <Text x={64} y={813} size={18} fill={MUTED}>范围 中国县级以上城市POS门店；样本量未公开。占比以各期即饮茶销额为分母。两窗口不能拼成增速曲线。</Text><SourceLine report={report} ids={[...board.growth.sourceIds, ...board.share.sourceIds]} />
  </>;
}

type ImageRenderProps = { failedAssets: ReadonlySet<string>; imageAttempt: number; onImageError: (id: string) => void };
function BoardImage({ asset, x, y, width, height, failedAssets, imageAttempt, onImageError }: ImageRenderProps & { asset: BoardAsset; x: number; y: number; width: number; height: number }) {
  return <g><rect x={x} y={y} width={width} height={height} fill="#ffffff" />{failedAssets.has(asset.id) ? <><rect x={x} y={y} width={width} height={height} fill={FOG} stroke={RULE} /><Text x={x + width / 2} y={y + height / 2 - 9} size={18} fill={MUTED} anchor="middle">图片载入失败</Text><Text x={x + width / 2} y={y + height / 2 + 22} size={14} fill={MUTED} anchor="middle">{asset.role === 'original' ? '原件身份与观察保留于详情' : '生成场景示意'}</Text></> : <image key={`${asset.id}-${imageAttempt}`} data-asset-id={asset.id} href={asset.path} x={x} y={y} width={width} height={height} preserveAspectRatio="xMidYMid meet" onError={() => onImageError(asset.id)} />}</g>;
}
function PeopleBoard({ report, board, ...images }: ImageRenderProps & { report: QingyuR2Report; board: Extract<ResearchBoard, { kind: 'people' }> }) {
  return <><Panel x={64} y={218} width={816} height={529} /><BoardImage asset={SCENE_ASSET} x={80} y={232} width={784} height={459} {...images} />
    <rect x="80" y="694" width="784" height="39" fill={BLUE} /><Text x={472} y={721} size={23} fill="#ffffff" weight={650} anchor="middle">{SCENE_ASSET.role === 'generated-illustration' && SCENE_ASSET.label}</Text>
    <Text x={930} y={252} size={26} weight={650}>工作时段 · 包装即饮饮料</Text><Text x={930} y={288} size={20} fill={MUTED}>前三项考虑因素选择比例 · 单位 %</Text>
    {board.chart.rows.map((row, index) => { const y = 340 + index * 92; const value = r2Value(report, row); return <g key={row.label} data-datum={row.datumId} data-value-path={row.valuePath ?? ''}><Text x={930} y={y} size={23}>{row.label}</Text><rect x="930" y={y + 16} width="494" height="24" fill={FOG} /><rect x="930" y={y + 16} width={value * 4.94} height="24" fill={BLUE} /><Text x={1527} y={y + 38} size={31} weight={650} fill={BLUE} anchor="end">{number(value)}%</Text></g>; })}
    <Text x={930} y={597} size={18} fill={MUTED}>横轴 0至100%；独立选项，不相加、不作权重。</Text><Text x={930} y={627} size={18} fill={MUTED}>健康功效为问卷选项，不代表功效获证。</Text><line x1="930" y1="649" x2="1536" y2="649" stroke={RULE} /><Text x={930} y={683} size={23} weight={650}>包装识别任务</Text><Text x={930} y={720} size={24} fill={BLUE}>茶种 / 无糖属性 / 风味 / 规格</Text><Text x={930} y={750} size={18} fill={MUTED}>色彩协调、布局与内容可见性仍需验证。</Text>
    <Text x={64} y={813} size={18} fill={MUTED}>2026报告，采集日未公开；工作时段子组N、年龄、抽样未公开。范围宽于无糖茶，不能直接代表25至34岁青屿买家。</Text><SourceLine report={report} ids={board.chart.sourceIds} /><Text x={1125} y={833} size={17} fill={MUTED}>情境图仅助理解，不证明偏好或购买</Text>
  </>;
}

const quoteTitles: Record<string, string> = { CP01: '维他冷萃（味型未明）', CP03: '三得利乌龙茶 · 无糖', CP04: '东鹏乌龙上茶', CP06: '东方树叶乌龙茶', CP10: '东鹏乌龙上茶', CP11: '三得利乌龙茶 · 无糖', CP12: '淳茶舍冷萃（系列）', CP13: '燃茶茉莉花茶', CP14: '维他冷萃（味型未明）', CP15: '让茶竹香乌龙', CP16: '伊刻现泡茶（系列）', CP18: '果子熟了×汲赏明前龙井' };
export function perBottlePrice(report: QingyuR2Report, quote: R2Price): number | null {
  if (quote.kind === 'unknown') return null;
  const sku = byId(report.skus, quote.skuId);
  return sku.packCount === null ? null : r2Value(report, quote.price) / r2Value(report, sku.packCount);
}
function skuCapacity(report: QingyuR2Report, sku: R2Sku) { return sku.capacity === null ? '容量未核实' : `${number(r2Value(report, sku.capacity))}ml`; }
function PriceBoard({ report, board }: { report: QingyuR2Report; board: Extract<ResearchBoard, { kind: 'prices' }> }) {
  const start = 820, scale = 51;
  const lower = r2Value(report, { datumId: 'B-GIVEN', valuePath: '价格下限' }), upper = r2Value(report, { datumId: 'B-GIVEN', valuePath: '价格上限' });
  const groups: { nature: R2Price['priceNature']; label: string }[] = [
    { nature: 'reported-price', label: '媒体历史原价 / 建议价 · 2024-06报道；限量款日期逐条注明' },
    { nature: 'brand-reported-launch', label: '品牌参赛资料历史价 · 非当前渠道成交价' },
    { nature: 'promotion', label: '历史促销与条件报价 · 2024-06报道；优惠资格、邮费未明' },
  ];
  let cursor = 292;
  return <><Text x={88} y={225} size={20} fill={MUTED}>产品 / 原规格与关键条件</Text><Text x={820} y={225} size={20} fill={MUTED}>历史单瓶参照 · 元/瓶</Text><Text x={1534} y={225} size={18} fill={BLUE} anchor="end">题设目标 {number(lower)}至{number(upper)}元 · 非支付意愿</Text>
    <rect x={start + lower * scale} y="274" width={(upper - lower) * scale} height="476" fill="#e8eefb" />
    {[0, 2, 4, 6, 8, 10].map(tick => <g key={tick}><line x1={start + tick * scale} y1="272" x2={start + tick * scale} y2="750" stroke={RULE} strokeDasharray="3 5" /><Text x={start + tick * scale} y={258} size={18} fill={MUTED} anchor="middle">{tick}</Text></g>)}
    {groups.map(group => {
      const headingY = cursor; cursor += 25;
      return <g key={group.nature}><Text x={88} y={headingY} size={18} fill={BLUE} weight={650}>{group.label}</Text>{board.quotes.filter(quote => quote.priceNature === group.nature).map(quote => {
        const y = cursor; cursor += 29;
        const sku = byId(report.skus, quote.skuId), value = perBottlePrice(report, quote);
        const amount = quote.kind === 'priced' ? r2Value(report, quote.price) : null;
        const count = sku.packCount === null ? null : r2Value(report, sku.packCount);
        let spec = skuCapacity(report, sku);
        if (quote.id === 'CP01' || quote.id === 'CP06') spec += ` · 需${count}瓶 / 总价${amount}元`;
        if (quote.id === 'CP18') spec = `2025-04 · ${spec} · 限量15万瓶`;
        if (quote.id === 'CP15') spec += ' · 2024资料';
        if (quote.id === 'CP16') spec += ' · 2023后 / 味型同价未核';
        return <g key={quote.id} data-price-point={quote.id}><title>{`${sku.title}；${quote.quotedAt}；${quote.channel}；${quote.conditions}；来源${byId(report.sources, quote.sourceId).publisher}；实际读取${quote.readAt}`}</title><Text x={88} y={y} size={22}>{quoteTitles[quote.id] ?? sku.title}</Text><Text x={448} y={y} size={20} fill={MUTED}>{spec}</Text>{value !== null && <><circle cx={start + value * scale} cy={y - 6} r="7" fill={group.nature === 'promotion' ? '#60738c' : BLUE} /><Text x={1360} y={y} size={21} weight={650} fill={BLUE}>{number(value)}{count !== null && count > 1 ? ' · 折单瓶' : ' / 瓶'}</Text></>}</g>;
      })}{(() => { cursor += 13; return null; })()}</g>;
    })}
    <Text x={88} y={769} size={18} fill={MUTED}>价格未知：东方树叶菊花普洱500ml，不画为0；历史乌龙报价不能套用。本图12条有价记录，另1条未知，完整13条见详情。</Text>
    <Text x={64} y={813} size={18} fill={MUTED}>读取日期 2026-11-09；原价、建议价、参赛价与条件促销分组。非当前市场排名，不将整箱折算误写为单瓶标价。</Text><SourceLine report={report} ids={['CS01', 'CS02', 'CS03', 'CS09']} />
  </>;
}

const packNotes: Record<string, { name: string[]; observation: string; identity: string }> = {
  CM01: { name: ['东鹏乌龙上茶'], observation: '茶种大字 / 山形辅助', identity: '参赛宣传合成' },
  CM02: { name: ['伊刻活泉', '现泡茉莉花茶'], observation: '结构解释现泡体验', identity: '现泡操作宣传合成' },
  CM03: { name: ['让茶竹香乌龙'], observation: '风味名与竹图互释', identity: '参赛场景宣传图' },
  CM06: { name: ['淳茶舍', '冷萃茉莉花茶'], observation: '竖标 / 红色无糖块', identity: '官方产品渲染' },
  CM07: { name: ['淳茶舍', '冷萃乌龙茶'], observation: '同系布局 / 口味色分', identity: '官方产品渲染' },
  CM08: { name: ['东方树叶', '菊花普洱'], observation: '品牌 / 茶种 / 植物图', identity: '年报官方宣传合成' },
  CM04: { name: ['王老吉无糖凉茶'], observation: '品牌资产与无糖变体分层', identity: '品牌宣传合成 / 效果图' },
  CM05: { name: ['元气森林白桃味苏打气泡水'], observation: '大识别字 / 零糖标记 / 口味图', identity: '历史宣传合成 · 旧気字版' },
};
function PackBoard({ report, board, ...images }: ImageRenderProps & { report: QingyuR2Report; board: Extract<ResearchBoard, { kind: 'packs' }> }) {
  const tea = board.cases.filter(product => byId(report.skus, product.skuId).category === 'strict-tea');
  const adjacent = board.cases.filter(product => byId(report.skus, product.skuId).category === 'adjacent');
  function card(product: R2Case, index: number, category: 'tea' | 'adjacent') {
    const x = category === 'tea' ? 64 + index % 3 * 362 : 1210;
    const y = 247 + (category === 'tea' ? Math.floor(index / 3) : index) * 268;
    const width = category === 'tea' ? 346 : 326;
    const asset = byId(board.assets, product.imageId), note = packNotes[product.imageId], sku = byId(report.skus, product.skuId);
    return <g key={product.id}><Panel x={x} y={y} width={width} height={256} /><BoardImage asset={asset} x={x + 10} y={y + 8} width={width - 20} height={176} {...images} /><Text x={x + 13} y={y + 207} size={20} weight={650}>{note.name.join(' ')}</Text><Text x={x + 13} y={y + 231} size={16} fill={MUTED}>{skuCapacity(report, sku)} · {note.identity}</Text><Text x={x + 13} y={y + 251} size={16} fill={BLUE}>{note.observation}</Text></g>;
  }
  return <><Text x={64} y={227} size={22} fill={BLUE} weight={650}>同品类 / 无糖即饮茶 · {tea.length}件</Text><Text x={1210} y={227} size={21} fill={BLUE} weight={650}>邻近 / 识别机制 · {adjacent.length}件</Text><line x1="1173" y1="218" x2="1173" y2="770" stroke={RULE} />
    {tea.map((product, index) => card(product, index, 'tea'))}{adjacent.map((product, index) => card(product, index, 'adjacent'))}
    <Text x={64} y={813} size={17} fill={MUTED}>来源 东鹏、伊刻、让茶、王老吉、元气森林：FBIF品牌投稿；淳茶舍：可口可乐中国；东方树叶：农夫山泉2025年报</Text><Text x={64} y={840} size={17} fill={MUTED}>原图等比完整显示，不裁瓶贴。均非本轮生成或货架实拍；宣传海报文字不等于瓶贴。邻近参照不计无糖茶价格带，未核同款价不绑价。</Text>
  </>;
}

function ProductBoard({ report, board }: { report: QingyuR2Report; board: Extract<ResearchBoard, { kind: 'product' }> }) {
  const capacity = r2Value(report, { datumId: 'B-GIVEN', valuePath: '容量' }), lower = r2Value(report, { datumId: 'B-GIVEN', valuePath: '价格下限' }), upper = r2Value(report, { datumId: 'B-GIVEN', valuePath: '价格上限' });
  const values = [`${number(capacity)}ml · 无糖即饮茶`, `${number(lower)}至${number(upper)}元 / 瓶`, ...board.conditions.slice(2).map(condition => condition.value)];
  return <><Panel x={64} y={219} width={704} height={537} /><Text x={98} y={267} size={29} weight={650} fill={BLUE}>题设已给定</Text>
    {board.conditions.map((condition, index) => { const y = 315 + index * 106; const parts = values[index].split('；'); return <g key={condition.label}><Text x={98} y={y} size={19} fill={MUTED}>{String(index + 1).padStart(2, '0')} / {condition.label}</Text><Lines x={98} y={y + 36} size={25} gap={29} fill={INK} weight={600} lines={parts} />{index < 3 && <line x1="98" y1={y + 85} x2="734" y2={y + 85} stroke={RULE} />}</g>; })}
    <Text x={832} y={267} size={29} weight={650}>真实产品资料待补</Text>
    <line x1="1038" y1="390" x2="1326" y2="626" stroke={RULE} strokeWidth="3" /><line x1="1326" y1="390" x2="1038" y2="626" stroke={RULE} strokeWidth="3" />
    {[{ x: 833, y: 334, text: '茶种与配方' }, { x: 1247, y: 334, text: '风味与口感' }, { x: 833, y: 613, text: '工艺与背标' }, { x: 1247, y: 613, text: '包材与生产' }].map(item => <g key={item.text}><rect x={item.x} y={item.y} width="274" height="83" rx="8" fill="#ffffff" stroke={RULE} strokeDasharray="7 5" /><Text x={item.x + 137} y={item.y + 50} size={25} fill={MUTED} anchor="middle">{item.text}</Text></g>)}
    <circle cx="1181" cy="510" r="99" fill={BLUE} /><Text x={1181} y={502} size={29} fill="#ffffff" weight={650} anchor="middle">产品理由</Text><Text x={1181} y={543} size={28} fill="#ffffff" anchor="middle">尚未建立</Text><Text x={1181} y={742} size={21} fill={MUTED} anchor="middle">补齐后再讨论卖点与视觉方向</Text>
    <Text x={64} y={813} size={18} fill={MUTED}>任务设定不等于上市事实、成交价或真实买家分布。青色与山形是保留条件，尚不能证明独特性或人群偏好。</Text><SourceLine report={report} ids={['BRIEF-S1', 'CS04']} />
  </>;
}
function ConclusionBoard({ report }: { report: QingyuR2Report }) {
  const inputs = [
    { y: 237, title: '市场', lines: ['监测销额增长，头部集中', '机会不等于新品牌必然被选'] },
    { y: 366, title: '人群', lines: ['茶种、属性与风味应易理解', '注意、偏好、购买分别验证'] },
    { y: 495, title: '竞品', lines: ['同价附近已有不同产品理由', '价格、规格和物料身份分别核'] },
    { y: 624, title: '产品', lines: ['题设约束已知，真实资料待补', '不能把约束直接当卖点'] },
  ];
  return <>{inputs.map(item => <g key={item.title}><Panel x={64} y={item.y} width={525} height={111} /><Text x={88} y={item.y + 35} size={24} fill={BLUE} weight={650}>{item.title}</Text><Lines x={175} y={item.y + 35} size={21} gap={33} fill={INK} lines={item.lines} /><path d={`M 589 ${item.y + 56} L 650 ${item.y + 56} L 650 485 L 730 485`} fill="none" stroke={RULE} strokeWidth="3" /></g>)}
    <rect x="730" y="363" width="365" height="244" rx="12" fill={BLUE} /><Text x={912} y={416} size={25} fill="#c8d7ff" anchor="middle">现有研究的作用</Text><Text x={912} y={479} size={33} fill="#ffffff" weight={650} anchor="middle">明确比较范围</Text><Text x={912} y={529} size={33} fill="#ffffff" weight={650} anchor="middle">与包装识别任务</Text><Text x={912} y={576} size={18} fill="#dce5ff" anchor="middle">研究综合归纳</Text>
    <path d="M 1095 485 L 1144 485 L 1144 358 L 1195 358 M 1144 485 L 1144 614 L 1195 614" fill="none" stroke={RULE} strokeWidth="3" />
    <Panel x={1195} y={279} width={341} height={158} /><Text x={1220} y={318} size={20} fill={BLUE}>关键未决 / 真实产品</Text><Lines x={1220} y={363} size={25} fill={INK} weight={650} lines={['茶种、配方、口感', '及可信的产品差别']} />
    <Panel x={1195} y={535} width={341} height={158} /><Text x={1220} y={574} size={20} fill={BLUE}>关键未决 / 目标人群</Text><Lines x={1220} y={619} size={25} fill={INK} weight={650} lines={['如何理解与评价', '真实产品与包装']} />
    <Text x={730} y={746} size={21} fill={MUTED}>下一步补事实与验证，不在本轮选定位、口号或视觉风格。</Text><Text x={64} y={813} size={18} fill={MUTED}>定性关系，不含评分或比例。价格仍需按同日同渠道补查。研究待补不表示已进入策略或已获真实客户批准。</Text><SourceLine report={report} ids={['M-S03', 'PS04', 'CS02', 'CS03', 'BRIEF-S1']} y={839} />
  </>;
}
