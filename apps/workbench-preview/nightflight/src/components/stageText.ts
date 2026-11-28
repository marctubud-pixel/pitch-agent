import {
  briefNeedsClarification,
  clock,
  isDeckPreview,
  phase,
  projectStatus,
  researchQuestion,
  type Artifact,
  type Project,
} from '../live';
import { STAGE_BY_ID } from '../data/project';
import type { BotStatus, EventKind, ExecutionEvent, StageId } from '../types';

import { rowOf, sectionsOf } from '../../../../../shared/stage-text.mjs';
export * from '../../../../../shared/stage-text.mjs';

export function publishedSlogan(p: Pick<Project, 'copyReview'>, direction: string) {
  const publication = p.copyReview;
  return publication?.status === 'ready'
    ? publication.draft.directions.find((entry) => entry.name === direction)?.main
    : undefined;
}

/** Identify low-level model transport & debug events that should stay out of the primary human log & chat. */
export function isTechnicalEvent(text: string): boolean {
  const s = text.trim();
  if (!s) return true;
  return (
    /^(?:文字|视觉理解|生图|读图|模型)\s*API\s*(?:请求|回执|返回|握手|等待|在等待|连接|旧版|超时)/u.test(s) ||
    /^api\.(?:deepseek|openai)\.com\b/iu.test(s) ||
    /^单次输出未通过校验，沿用已完成回执/u.test(s) ||
    /^本次文案记录：.*\.json/u.test(s) ||
    /^API\s*(?:请求|回执)/iu.test(s)
  );
}

/** Replace internal direction short names with their formal published Slogan so top log and pages stay consistent. */
export function humanizeEventText(
  p: Pick<Project, 'directions' | 'copyReview'>,
  raw: string,
): string {
  let out = raw.trim().replace(/DeepSeek\s*写作\s*Agent/giu, '文案主理人');
  for (const name of p.directions || []) {
    if (!name) continue;
    const slogan = publishedSlogan(p, name);
    if (slogan && slogan !== name && out.includes(name)) {
      out = out.split(name).join(slogan);
    }
  }
  return out;
}

export function classifyEventKind(
  text: string,
  isLast: boolean,
  projectStatusValue: Project['status'],
): EventKind {
  if (/失败|中断|无法|硬伤|缺失|阻断|未通过|报错|中止/u.test(text)) return 'error';
  if (
    /提案已完成|终审通过|已交付|全部完成/u.test(text) ||
    (isLast && projectStatusValue === 'done')
  ) {
    return 'done';
  }
  if (/自动模式已|已完成|已保存|已生成|已整理|产出|提案预览|可编辑|已成形|已归档/u.test(text)) {
    return /已为.*采用|已完成.*精简定稿/u.test(text) ? 'check' : 'deliver';
  }
  if (/仍缺|请提供|等你|等待你|需要你|待你|待明确|请选|请确认/u.test(text)) return 'decision';
  if (/通过|检查|复核|核对|选优|盲读|准入/u.test(text)) return 'check';
  return 'info';
}

export function buildExecutionStreams(p: Project): {
  primary: ExecutionEvent[];
  all: ExecutionEvent[];
} {
  const raw = p.events || [];
  const all: ExecutionEvent[] = raw.map((e, i) => {
    const text = humanizeEventText(p, e.text);
    const isLast = i === raw.length - 1;
    return {
      id: `ev-${i}`,
      seq: i,
      at: clock(e.at),
      text,
      stageId: e.stage,
      kind: isTechnicalEvent(e.text) ? 'info' : classifyEventKind(text, isLast, p.status),
      simulated: false,
    };
  });
  const primary = all.filter((_, i) => !isTechnicalEvent(raw[i].text));
  if (p.status === 'done' && primary.length && primary[primary.length - 1].kind !== 'done') {
    primary.push({
      id: 'ev-done-summary',
      seq: all.length + 1,
      at: clock(p.updatedAt || new Date().toISOString()),
      text: '提案已完成，可查看终稿与终审记录',
      stageId: 'final',
      kind: 'done',
      simulated: false,
    });
  }
  if (p.status === 'failed' && p.error && !primary.some((e) => e.text.includes(p.error!.slice(0, 16)))) {
    primary.push({
      id: 'ev-error-summary',
      seq: all.length + 2,
      at: clock(p.updatedAt || new Date().toISOString()),
      text: '执行中断：' + p.error,
      stageId: p.stage,
      kind: 'error',
      simulated: false,
    });
  }
  return { primary, all };
}

export function deriveBotStatus(p: Project, primaryEvents: ExecutionEvent[]): BotStatus {
  const researchPaused =
    p.stage === 'research' &&
    p.status === 'waiting' &&
    !p.research?.ready &&
    !p.canRequestStrategy &&
    !researchQuestion(p);

  if (p.status === 'done') {
    return { state: 'done', label: '已完成', detail: '终稿在这儿，等你来看' };
  }
  if (p.status === 'failed') {
    return { state: 'blocked', label: '执行中断', detail: '查看原因，补充或重试' };
  }
  if (researchPaused) {
    return { state: 'idle', label: '等待补查', detail: '研究尚缺关键依据' };
  }
  if (p.status === 'waiting') {
    if (briefNeedsClarification(p)) {
      return { state: 'waiting', label: '等你明确', detail: '补充交付范围后继续' };
    }
    const detailByStage: Record<StageId, string> = {
      brief: '确认任务卡后开始研究',
      research: researchQuestion(p)
        ? '有一项影响方向的问题等你判断'
        : p.research?.digestPending
          ? '核对研究摘要后进入策略'
          : '查看研究结论，准备进入策略',
      strategy: '确认策略主张后进入文案',
      copy: '三个方向已备好，等你选定',
      visual: '挑定各方向采用稿进入排版',
      layout: p.layoutDraftOnly ? '逐页稿已备好，可查看或排版' : '确认提案页面后终审',
      final: '终稿已就绪，请审阅交付',
    };
    return { state: 'waiting', label: projectStatus(p), detail: detailByStage[p.stage] };
  }

  // Running state — derive lively 2-line status matching the prototype's Bot card
  const latest = primaryEvents.at(-1)?.text || '';
  switch (p.stage) {
    case 'brief':
      return { state: 'working', label: '读取需求', detail: '看你写了什么，整理任务卡' };
    case 'research':
      if (/竞品|原图|包装/u.test(latest)) {
        return { state: 'working', label: '研究中', detail: '核对同类竞品与原图' };
      }
      if (/人群|用户|情境/u.test(latest)) {
        return { state: 'working', label: '研究中', detail: '梳理目标人群与使用场景' };
      }
      return {
        state: 'working',
        label: p.researchFollowup ? '补查中' : '研究中',
        detail: '品类格局、竞品与人群依据',
      };
    case 'strategy':
      return { state: 'working', label: '想策略', detail: '从研究发现里提炼核心主张' };
    case 'copy':
      if (/盲读|推荐|选优|评审/u.test(latest)) {
        return { state: 'working', label: '挑文案', detail: '盲读筛选三方向 Slogan' };
      }
      return { state: 'working', label: '想创意', detail: '发展三个不同方向与文案' };
    case 'visual':
      if (/搜图|参考|扫图|准入|五项特征/u.test(latest)) {
        return { state: 'working', label: '找参考', detail: '双渠道九宫格扫图精选' };
      }
      if (/选优|评审|核对/u.test(latest)) {
        return { state: 'working', label: '选主视觉', detail: '同批候选并排择优' };
      }
      return { state: 'working', label: '做主视觉', detail: '三方向九稿借三改二绘制' };
    case 'layout':
      return { state: 'working', label: '排版中', detail: '编排提案页面与可编辑 PPTX' };
    case 'final':
      return { state: 'working', label: '终审中', detail: '从头到尾核对逻辑、文字与版式' };
  }
}

export interface WorkspaceSubtask {
  id: string;
  stageId: StageId;
  title: string;
  detail: string;
  role: string;
  status: 'done' | 'active' | 'waiting' | 'failed' | 'pending';
}

export function deriveWorkspaceTasks(
  p: Project,
  primaryEvents: ExecutionEvent[],
): WorkspaceSubtask[] {
  const stagePhase = (s: StageId) => phase(p, s);
  const hasResearchImages =
    (p.research?.findings || []).some((f) => (f.images?.length || 0) > 0) ||
    primaryEvents.some((e) => e.stageId === 'research' && /人群|原图|竞品/u.test(e.text));
  const hasVisualRefs =
    p.artifacts.some((a) => a.stage === 'visual' && a.visual?.role === 'reference') ||
    primaryEvents.some((e) => e.stageId === 'visual' && /提示词|生成主视觉|并排选优/u.test(e.text));
  const hasVisualMains = p.artifacts.some(
    (a) => a.stage === 'visual' && a.kind === 'image' && a.visual?.role === 'main',
  );
  const hasDeck = p.artifacts.some((a) => a.kind === 'pptx' || isDeckPreview(a));

  type TaskState = WorkspaceSubtask['status'];
  const currentState = (s: StageId, ph: ReturnType<typeof phase>): TaskState => {
    if (p.status === 'failed' && p.stage === s) return 'failed';
    if (ph === 'waiting') return 'waiting';
    return 'active';
  };

  const mapTwoStep = (s: StageId, firstDone: boolean): [TaskState, TaskState] => {
    const ph = stagePhase(s);
    if (ph === 'done') return ['done', 'done'];
    if (ph === 'pending') return ['pending', 'pending'];
    const cur = currentState(s, ph);
    return firstDone ? ['done', cur] : [cur, 'pending'];
  };

  const [res1, res2] = mapTwoStep('research', hasResearchImages);
  const [vis1, vis2] = mapTwoStep('visual', hasVisualRefs || hasVisualMains);
  const [fin1, fin2] = mapTwoStep(
    'final',
    Boolean(p.finalReview) || p.status === 'done',
  );

  const single = (s: StageId): TaskState => {
    const ph = stagePhase(s);
    if (ph === 'done' || ph === 'pending') return ph;
    return currentState(s, ph);
  };

  return [
    {
      id: 't-brief',
      stageId: 'brief',
      title: '整理项目任务卡',
      detail: '提取品牌、产品、人群与交付要求，标出待确认项。',
      role: '主理人',
      status: single('brief'),
    },
    {
      id: 't-market',
      stageId: 'research',
      title: '梳理品类与竞争环境',
      detail: '品类格局、参照品牌做法与公开实证资料。',
      role: '研究',
      status: res1,
    },
    {
      id: 't-consumer',
      stageId: 'research',
      title: '整理人群与使用场景',
      detail: '目标人群接触情境、真实使用习惯与审美偏好。',
      role: '研究',
      status: res2,
    },
    {
      id: 't-strategy',
      stageId: 'strategy',
      title: '确定核心主张与品牌角色',
      detail: '把研究发现收束成一句能指导创意的一页策略。',
      role: '策略',
      status: single('strategy'),
    },
    {
      id: 't-copy',
      stageId: 'copy',
      title: '发展三个创意方向与 Slogan',
      detail: '三案拉开气质与场景差异，经盲读筛选并推荐一案。',
      role: '文案',
      status: single('copy'),
    },
    {
      id: 't-refs',
      stageId: 'visual',
      title: '为三个方向精选视觉参考',
      detail: '双渠道九宫格扫图，筛选高审美独立主参考。',
      role: '视觉',
      status: vis1,
    },
    {
      id: 't-kv',
      stageId: 'visual',
      title: '生成主视觉候选并选优',
      detail: '三方向九稿按借三改二绘制，并排择优进提案。',
      role: '视觉',
      status: vis2,
    },
    {
      id: 't-deck',
      stageId: 'layout',
      title: '编排可编辑提案 PPTX',
      detail: '串联研究、策略、文案与主视觉成稿，生成预览。',
      role: '排版',
      status: hasDeck && stagePhase('layout') !== 'active' ? 'done' : single('layout'),
    },
    {
      id: 't-review',
      stageId: 'final',
      title: '终审逐页复核',
      detail: '核对逻辑链条、文字准确度与页面版式一致性。',
      role: '终审',
      status: fin1,
    },
    {
      id: 't-deliver',
      stageId: 'final',
      title: '整理终稿并打包交付',
      detail: '汇总可编辑 PPTX、终审记录并通知查看。',
      role: '主理人',
      status: fin2,
    },
  ];
}

export interface ChatDeliverableLink {
  stage: StageId;
  label: string;
  name?: string;
}

export interface ChatMilestoneMessage {
  id: string;
  at: string;
  from: 'bot' | 'user';
  kind: 'text' | 'decision' | 'done' | 'error';
  text: string;
  links?: ChatDeliverableLink[];
}

function stageEndIso(p: Project, stage: StageId, fallback = ''): string {
  const hit = (p.events || []).findLast((e) => e.stage === stage);
  return hit?.at || fallback || p.updatedAt || '';
}

function extractCoreStrategyLine(p: Project): string {
  const strat = p.artifacts.find((a) => a.stage === 'strategy' && a.kind === 'text')?.text || '';
  const m = strat.match(/##\s*核心策略\s*\n+([^\n#]+)/u);
  return m?.[1]?.trim() || '';
}

export function deriveChatMessages(p: Project): ChatMilestoneMessage[] {
  type TimedMsg = ChatMilestoneMessage & { iso: string; order: number };
  const msgs: TimedMsg[] = [];
  let seq = 0;
  const push = (iso: string, m: Omit<ChatMilestoneMessage, 'at'>) => {
    msgs.push({ ...m, at: clock(iso), iso, order: seq++ });
  };

  const startIso = p.events?.[0]?.at || p.updatedAt || '';
  push(startIso, {
    id: 'm-start',
    from: 'bot',
    kind: 'text',
    text:
      p.mode === 'auto'
        ? '收到，我来负责这份提案。全自动模式下每一步进度都会留在上方黑屏执行记录里，关键交付我会在这里向你汇报。'
        : '收到，我来负责这份提案。常规步骤我会持续推进，到了需要你拍板的节点会在这里停下来问你。',
  });

  const briefDoc = p.artifacts.find((a) => a.stage === 'brief' && a.kind === 'text');
  if (briefDoc) {
    push(stageEndIso(p, 'brief', startIso), {
      id: 'm-brief',
      from: 'bot',
      kind: 'text',
      text: '项目任务卡已整理好，明确了品牌、产品、目标人群和本次交付边界。',
      links: [{ stage: 'brief', label: '项目任务卡', name: briefDoc.name }],
    });
  }

  const researchDoc = p.artifacts.find((a) => a.stage === 'research' && a.kind === 'text');
  if (researchDoc || (p.research?.findings?.length ?? 0) > 0) {
    const count = p.research?.findings?.length ?? 0;
    const rawLead = p.research?.findings?.[0]?.conclusion?.trim() || '';
    const firstSentence = rawLead.split(/[。！？；]/u)[0]?.trim() || '';
    const conciseLead =
      firstSentence && firstSentence.length <= 44 && !/未披露|不能直接等同/u.test(firstSentence)
        ? `首条发现：${firstSentence}。`
        : '可以点开查看品类、竞品与人群原图依据。';
    const summary =
      count > 0
        ? `研究报告出来了，共核实 ${count} 条关键发现。${conciseLead}`
        : '研究报告已整理完成，可以点开查看品类、竞品与人群依据。';
    push(stageEndIso(p, 'research'), {
      id: 'm-research',
      from: 'bot',
      kind: 'text',
      text: summary,
      links: [{ stage: 'research', label: '研究报告', name: researchDoc?.name }],
    });
  }

  const strategyDoc = p.artifacts.find((a) => a.stage === 'strategy' && a.kind === 'text');
  if (strategyDoc) {
    const core = extractCoreStrategyLine(p);
    push(stageEndIso(p, 'strategy'), {
      id: 'm-strategy',
      from: 'bot',
      kind: 'text',
      text: core ? `策略定了：${core}` : '一页策略框架已完成，核心主张和传播触点已收束清晰。',
      links: [{ stage: 'strategy', label: '策略框架', name: strategyDoc.name }],
    });
  }

  const copyDoc = p.artifacts.find((a) => a.stage === 'copy' && a.kind === 'text');
  if (copyDoc || p.directions.length > 0) {
    const recDirId = p.copyReview?.status === 'ready' ? p.copyReview.recommendation?.directionId : undefined;
    const recDir =
      p.copyReview?.status === 'ready'
        ? p.copyReview.draft.directions.find((d) => d.id === recDirId)
        : undefined;
    const recSlogan = recDir?.main || (p.directions[0] ? publishedSlogan(p, p.directions[0]) || p.directions[0] : '');
    const waitingCopy = p.stage === 'copy' && p.status === 'waiting';
    push(stageEndIso(p, 'copy'), {
      id: 'm-copy',
      from: 'bot',
      kind: waitingCopy ? 'decision' : 'text',
      text: waitingCopy
        ? `三个创意方向和 Slogan 都准备好了，这一步需要你来定。本版建议「${recSlogan}」，选一个或在下方直接告诉我想法。`
        : `三个创意方向与主题 Slogan 已写好${recSlogan ? `，本版推荐「${recSlogan}」` : ''}。`,
      links: [{ stage: 'copy', label: '创意方向与文案', name: copyDoc?.name }],
    });
  }

  const visualRefs = p.artifacts.filter((a) => a.stage === 'visual' && a.visual?.role === 'reference');
  const visualMains = p.artifacts.filter(
    (a) => a.stage === 'visual' && a.kind === 'image' && (!a.visual?.role || a.visual.role === 'main'),
  );
  const visualDerivatives = p.artifacts.filter(
    (a) => a.stage === 'visual' && a.kind === 'image' && (a.visual?.role === 'extension' || a.visual?.role === 'mockup'),
  );
  if (visualMains.length > 0 || visualRefs.length > 0) {
    const recCount = visualMains.filter((a) => a.visual?.recommended).length;
    const derivText = visualDerivatives.length ? `，另已生成 ${visualDerivatives.length} 张延展与样机图` : '';
    const text =
      visualMains.length > 0
        ? `视觉开发已产出 ${visualMains.length} 张主视觉候选${visualRefs.length ? `（基于 ${visualRefs.length} 张精选参考图）` : ''}${recCount ? `，已为 ${recCount} 个方向标出推荐稿` : ''}${derivText}。`
        : `已收集 ${visualRefs.length} 张高审美视觉参考图，正在绘制主视觉候选。`;
    push(stageEndIso(p, 'visual'), {
      id: 'm-visual',
      from: 'bot',
      kind: p.stage === 'visual' && p.status === 'waiting' ? 'decision' : 'text',
      text,
      links: [{ stage: 'visual', label: '视觉参考与主视觉' }],
    });
  }

  const preview = p.artifacts.find(isDeckPreview);
  const pptx = p.artifacts.find((a) => a.kind === 'pptx');
  if (preview || pptx) {
    push(stageEndIso(p, 'layout'), {
      id: 'm-layout',
      from: 'bot',
      kind: 'text',
      text: '提案页面与可编辑 PPTX 已经排好，可以先逐页翻看预览。',
      links: [{ stage: 'layout', label: '提案预览', name: preview?.name || pptx?.name }],
    });
  }

  if (p.status === 'done') {
    const finalNote = p.finalReview?.reason ? `终审结论：${p.finalReview.reason}` : '全套研究、策略、文案、主视觉与可编辑 PPTX 均已整理完毕。';
    push(stageEndIso(p, 'final'), {
      id: 'm-done',
      from: 'bot',
      kind: 'done',
      text: `提案做完了。${finalNote} 看完哪里要改，直接在这里告诉我。`,
      links: [
        { stage: 'final', label: '终稿与终审记录' },
        ...(visualMains.length ? [{ stage: 'visual' as StageId, label: '查看主视觉' }] : []),
      ],
    });
  }

  if (p.status === 'failed' && p.error) {
    push(p.updatedAt || '', {
      id: 'm-error',
      from: 'bot',
      kind: 'error',
      text: `我停在「${STAGE_BY_ID[p.stage].name}」没有往下硬做。原因：${p.error}`,
      links: [{ stage: p.stage, label: `查看${STAGE_BY_ID[p.stage].name}` }],
    });
  }

  for (const [i, f] of (p.feedback || []).entries()) {
    push(f.at || '', {
      id: `u-${i}`,
      from: 'user',
      kind: 'text',
      text: f.text,
    });
  }

  msgs.sort((a, b) => {
    if (a.id === 'm-start') return -1;
    if (b.id === 'm-start') return 1;
    const ta = Date.parse(a.iso);
    const tb = Date.parse(b.iso);
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
    return a.order - b.order;
  });

  return msgs.map(({ iso: _iso, order: _order, ...rest }) => rest);
}

export function isPrimaryReadableDoc(file: Artifact, hasLayoutDraft: boolean): boolean {
  if (file.kind !== 'text' || isDeckPreview(file) || file.stage === 'visual') return false;
  if (file.name.endsWith('.json')) return false;
  if (file.stage === 'layout' && file.name.startsWith('逐页材料包') && hasLayoutDraft) return false;
  return true;
}

export function stageDocumentTitle(file: Artifact): string {
  if (isDeckPreview(file)) return '提案预览';
  if (file.kind === 'pptx') return '可编辑 PPTX';
  if (file.stage === 'brief') return '项目任务卡';
  if (file.stage === 'research') return '研究报告';
  if (file.stage === 'strategy') return '策略框架';
  if (file.stage === 'copy') return '创意方向与文案';
  if (file.stage === 'final') return '终审记录';
  if (file.stage === 'layout') {
    if (file.name.startsWith('逐页材料包')) return '编稿材料包';
    if (file.name.startsWith('逐页稿')) return '逐页讲稿';
    return '版式说明';
  }
  return file.text?.match(/^# (.+)$/m)?.[1] || STAGE_BY_ID[file.stage].name + '文档';
}

export function stageDocumentBlurb(p: Project, file: Artifact): string {
  if (file.stage === 'brief') return '需求拆解、交付边界与待确认假设';
  if (file.stage === 'research') {
    const n = p.research?.findings?.length;
    return n ? `${n} 条核实发现与公开依据` : '品类、竞品与人群发现';
  }
  if (file.stage === 'strategy') {
    return extractCoreStrategyLine(p) || '核心主张与传播触点';
  }
  if (file.stage === 'copy') {
    const slogans = p.directions.map((d) => publishedSlogan(p, d) || d).filter(Boolean);
    return slogans.length ? slogans.join(' / ') : '三个创意方向与主题 Slogan';
  }
  if (file.stage === 'layout') {
    if (file.name.startsWith('逐页材料包')) return '各页视觉与文字编稿材料';
    if (file.name.startsWith('逐页稿')) return '按汇报顺序编排的逐页讲稿';
  }
  if (file.stage === 'final') return p.finalReview?.reason || '终审检查与交付结论';
  return STAGE_BY_ID[file.stage].summary;
}

const UNKNOWN_FIELD = /未提供|未明确|尚未|未说明|未确定|待确认|待定|暂定|未知|不详|待核实/u;
const normalizeCompare = (s: string) => s.replace(/[\s，。、,.!！?？：:；;「」“”"']/gu, '').trim();

/** Derive a concise project heading from the structured Brief card and never duplicate the raw brief text. */
export function deriveProjectHeading(p: Project): {
  topBarTitle: string;
  cardTitle: string;
  cardBrief: string;
} {
  const rawTitle = (p.title || '').trim();
  const rawBrief = (p.brief || '').trim();
  let shortTitle = '';

  const briefText = p.artifacts.find((a) => a.stage === 'brief' && a.kind === 'text')?.text || '';
  if (briefText) {
    const rows = sectionsOf(briefText)
      .filter((s) => !/原稿记录|未知项|假设/u.test(s.heading))
      .flatMap((s) => s.lines)
      .map(rowOf)
      .filter((r): r is NonNullable<typeof r> => Boolean(r && r.value && !UNKNOWN_FIELD.test(r.value)));

    const pick = (re: RegExp) => rows.find((r) => re.test(r.label))?.value.trim() || '';
    const brand = pick(/^(?:品牌|品牌名称|客户|客户名称)$/u);
    const product = pick(/^(?:产品与品类|产品|产品名称|品类|新品|品牌与产品)$/u);
    const rawTask = pick(/^(?:提案任务|提案要求|交付内容|项目目标|提案目标)$/u);
    const task = rawTask
      .replace(/^(?:帮我)?为(?:一款|一个)?/u, '')
      .replace(/(?:设计|制作)(?:一款|一个)?/u, '')
      .replace(/[。！!]+$/u, '')
      .trim();

    if (brand && task && task.length <= 24) {
      shortTitle = task.includes(brand) ? task : `${brand} · ${task}`;
    } else if (brand && product && product.length <= 24) {
      shortTitle = product.includes(brand) ? product : `${brand} · ${product}`;
    } else if (product && task && task.length <= 22 && !task.includes(product)) {
      shortTitle = `${product} · ${task}`;
    } else if (task && task.length <= 24) {
      shortTitle = task;
    } else if (brand) {
      shortTitle = brand;
    }
  }

  const normBrief = normalizeCompare(rawBrief);
  const isTitleCopyOfBrief = (candidate: string) => {
    const nc = normalizeCompare(candidate.replace(/…$/u, ''));
    if (!nc || !normBrief) return false;
    return nc === normBrief || normBrief.startsWith(nc);
  };

  if (shortTitle && !isTitleCopyOfBrief(shortTitle)) {
    return { topBarTitle: shortTitle, cardTitle: shortTitle, cardBrief: rawBrief };
  }

  if (rawTitle && !isTitleCopyOfBrief(rawTitle)) {
    return { topBarTitle: rawTitle, cardTitle: rawTitle, cardBrief: rawBrief };
  }

  // Raw title is identical to or a truncated prefix of the brief: show the full brief once without repeating it.
  return {
    topBarTitle: rawTitle || rawBrief,
    cardTitle: '',
    cardBrief: rawBrief || rawTitle,
  };
}
