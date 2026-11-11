/**
 * Simulated WorkBot. There is no language model here: a small set of recognised questions is
 * answered deterministically from the current project data, read through the public
 * WorkbenchService interface at the moment the question is asked. Anything else gets an honest
 * fallback. It never writes project data.
 *
 * Conversations are stored apart from project records, one per scope, and cleared on demo reset.
 */
import type { AnswerBlock, AssistantContext, AssistantMessage, AssistantRef, AssistantScope, AssistantService, BriefDraftContext, Conversation, SuggestedQuestion } from '../../domain/assistant';
import { scopeKey } from '../../domain/assistant';
import type { TaskCardDraft } from '../../domain/intake';
import { REQUIRED_FIELDS, TASK_FIELDS, type Brief, type BriefField, type ProjectOverview, type ProvenanceReason, type TaskField, type WorkspaceView } from '../../domain/models';
import type { WorkbenchService } from '../../domain/service';
import { STAGES, type Proposal, type ProposalService, type StageId } from '../../domain/proposal';
import { t } from './i18n';
import { clip } from './rules';
import type { KeyValueStore } from './storage';

type Intent = 'blockers' | 'next' | 'brief' | 'evidence' | 'returned' | 'pitch' | 'history' | 'progress' | 'g_process' | 'g_brief' | 'g_checks' | 'g_pitch';

const PROJECT_INTENTS: Intent[] = ['blockers', 'next', 'brief', 'evidence', 'returned', 'pitch', 'history', 'progress'];
const GENERAL_INTENTS: Intent[] = ['g_process', 'g_brief', 'g_checks', 'g_pitch'];

/** Words that identify each kind of question, in every interface language. Checked in order. */
const KEYWORDS: Array<[Intent, RegExp]> = [
  ['returned', /return|revis|reject|creative|sent back|renvoy|révis|créati|devuel|revisi|rechaz|creativ|差し戻|修正|クリエイティブ|반려|수정|크리에이티브|退回|修改|创意/i],
  ['pitch', /pitch|present|présent|presentar|プレゼン|見せ方|피치|발표|演示|展示|陈述/i],
  ['evidence', /evidence|source|support|recommend|preuve|soutien|recommand|evidencia|fuente|respald|recomend|エビデンス|根拠|出典|裏付け|推奨|근거|출처|뒷받침|추천|证据|来源|支持|建议/i],
  ['blockers', /block|stuck|prevent|bloqu|empêch|imp[ie]d|ブロック|妨げ|止ま|막|차단|阻碍|受阻|卡住/i],
  ['brief', /brief|task card|confirm|missing|unclear|ambigu|budget|timeline|fiche|manqu|ficha|falt|presupuesto|plazo|ブリーフ|確定|不足|曖昧|予算|スケジュール|브리프|확정|누락|모호|예산|일정|简报|确认|缺少|模糊|预算|时间/i],
  ['next', /next|what should|do now|to do|suivant|faire|siguiente|hacer|次|すべき|やること|다음|해야|下一步|该做|接下来/i],
  ['history', /history|changed|version|decision|histor|modifi|décision|historial|cambi|decisi|履歴|変更|判断|기록|변경|결정|历史|变更|决定|版本/i],
  ['progress', /progress|status|where|stage|avancement|statut|étape|progreso|estado|dónde|fase|進捗|状況|ステージ|진행|상태|단계|进度|状态|阶段/i],
];
const GENERAL_KEYWORDS: Array<[Intent, RegExp]> = [
  ['g_pitch', /pitch|present|présent|presentar|プレゼン|피치|발표|演示|展示/i],
  ['g_checks', /verif|readiness|ready|handoff|release|maturit|passation|madurez|traspaso|検証|準備|引き継ぎ|검증|준비도|인계|核验|就绪|交接/i],
  ['g_brief', /brief|task card|fiche|ficha|ブリーフ|브리프|简报/i],
  ['g_process', /process|stage|step|work|processus|étape|proceso|fase|paso|プロセス|ステージ|流れ|프로세스|단계|流程|阶段|步骤/i],
];

const SUGGESTION_ORDER: Partial<Record<WorkspaceView | 'dashboard' | 'new', Intent[]>> = {
  brief: ['brief', 'next', 'blockers', 'history'],
  research: ['evidence', 'blockers', 'next', 'brief'],
  sources: ['evidence', 'blockers', 'next', 'brief'],
  images: ['returned', 'evidence', 'next', 'blockers'],
  handoff: ['blockers', 'next', 'evidence', 'pitch'],
  artifacts: ['evidence', 'pitch', 'returned', 'history'],
  jobs: ['next', 'blockers', 'history', 'progress'],
  overview: ['next', 'progress', 'blockers', 'history'],
  proposal: ['next', 'evidence', 'returned', 'pitch'],
  library: ['evidence', 'history', 'brief', 'next'],
  process: ['history', 'returned', 'next', 'progress'],
  delivery: ['pitch', 'progress', 'next', 'evidence'],
};

const newId = () => `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const pause = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
/** One chip per destination: several items can point to the same record. */
const uniqueRefs = (refs: AssistantRef[]) => refs.filter((r, i) => refs.findIndex((o) => JSON.stringify([o.label, o.target]) === JSON.stringify([r.label, r.target])) === i);
const block = (kind: AnswerBlock['kind'], text: string, items: string[] = [], refs: AssistantRef[] = []): AnswerBlock => ({ kind, text, items, refs: uniqueRefs(refs) });
const ref = (kind: AssistantRef['kind'], label: string, view: WorkspaceView, params?: Record<string, string>): AssistantRef => ({ kind, label: clip(label, 60), target: { view, params } });
const show = (v: string | string[]) => clip(Array.isArray(v) ? v.join('; ') : v, 90);
const isEmpty = (v: string | string[]) => (Array.isArray(v) ? v.length === 0 : !v.trim());

const STORAGE_KEY = 'proposal-workbench/demo/assistant';

export class MockAssistantService implements AssistantService {
  readonly simulated = true;
  readonly available = true;
  private conversations: Record<string, Conversation> = {};
  private listeners = new Set<() => void>();

  constructor(
    private readonly workbench: WorkbenchService,
    private readonly store: KeyValueStore,
    private readonly latency = 650,
    /** Optional: the creative stages, so progress answers match what the workspace shows. Read only. */
    private readonly proposals: ProposalService | null = null,
  ) {
    try {
      const raw = store.get(STORAGE_KEY);
      if (raw) this.conversations = JSON.parse(raw) as Record<string, Conversation>;
    } catch {
      this.conversations = {};
    }
    // A demo reset clears simulated conversations too.
    workbench.subscribe((event) => {
      if (event.type === 'reset') {
        this.conversations = {};
        this.store.remove(STORAGE_KEY);
        this.listeners.forEach((l) => l());
      }
    });
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist() {
    try {
      this.store.set(STORAGE_KEY, JSON.stringify(this.conversations));
    } catch {
      /* conversations stay in memory */
    }
  }

  private conversation(scope: AssistantScope): Conversation {
    const key = scopeKey(scope);
    return (this.conversations[key] ??= { key, messages: [] });
  }

  async getConversation(scope: AssistantScope) {
    return structuredClone(this.conversation(scope));
  }

  async newConversation(scope: AssistantScope) {
    const key = scopeKey(scope);
    this.conversations[key] = { key, messages: [] };
    this.persist();
    return structuredClone(this.conversations[key]);
  }

  async suggestions(scope: AssistantScope, context: AssistantContext): Promise<SuggestedQuestion[]> {
    let ids: Intent[];
    if (scope.kind === 'general') ids = GENERAL_INTENTS;
    else if (scope.kind === 'draft') ids = ['brief'];
    else {
      const first = context.draft ? ['brief' as Intent] : (SUGGESTION_ORDER[context.view ?? 'dashboard'] ?? []);
      ids = [...new Set([...first, ...PROJECT_INTENTS])];
    }
    return ids.map((id) => ({ id, text: t(context.draft && id === 'brief' ? 'wb.q.draft' : `wb.q.${id}`) }));
  }

  private intentOf(scope: AssistantScope, text: string, suggestionId: string | null): Intent | null {
    const allowed = scope.kind === 'general' ? GENERAL_INTENTS : scope.kind === 'draft' ? (['brief'] as Intent[]) : PROJECT_INTENTS;
    if (suggestionId && allowed.includes(suggestionId as Intent)) return suggestionId as Intent;
    const table = scope.kind === 'general' ? GENERAL_KEYWORDS : KEYWORDS;
    const hit = table.find(([intent, re]) => allowed.includes(intent) && re.test(text));
    return hit?.[0] ?? null;
  }

  async ask(scope: AssistantScope, question: { text: string; suggestionId: string | null }, context: AssistantContext): Promise<Conversation> {
    const convo = this.conversation(scope);
    const now = () => new Date().toISOString();
    convo.messages.push({ id: newId(), role: 'user', createdAt: now(), text: question.text, blocks: [], status: 'answer', simulated: false, basedOn: null, question: null });
    await pause(this.latency);
    const intent = this.intentOf(scope, question.text, question.suggestionId);
    let reply: Omit<AssistantMessage, 'id' | 'role' | 'createdAt' | 'text' | 'simulated' | 'question'>;
    try {
      reply = await this.answer(scope, intent, context);
    } catch (error) {
      reply = { status: 'error', blocks: [block('missing', t('wb.error'), [String((error as Error).message ?? error)])], basedOn: null };
    }
    convo.messages.push({ id: newId(), role: 'assistant', createdAt: now(), text: '', simulated: true, question: { text: question.text, suggestionId: intent ?? question.suggestionId }, ...reply });
    convo.messages = convo.messages.slice(-60);
    this.persist();
    return structuredClone(convo);
  }

  // ---------------------------------------------------------------------------

  private async answer(scope: AssistantScope, intent: Intent | null, context: AssistantContext) {
    if (scope.kind === 'general') {
      if (!intent) return this.fallback('general');
      return { status: 'answer' as const, blocks: this.general(intent), basedOn: null };
    }
    if (scope.kind === 'draft') {
      if (!context.draft || intent !== 'brief') return this.fallback('draft');
      return { status: 'answer' as const, blocks: this.draft(context.draft), basedOn: null };
    }
    const id = scope.projectId;
    const ov = await this.workbench.getProjectOverview(id);
    const basedOn = { projectId: id, revision: ov.project.revision, briefVersion: ov.brief?.version ?? null, briefConfirmed: Boolean(ov.brief?.confirmedAt) };
    if (!intent) return { ...this.fallback('project'), basedOn };
    const proposal = this.proposals ? await this.proposals.findByWorkbenchId(id).catch(() => null) : null;
    let blocks: AnswerBlock[];
    switch (intent) {
      case 'blockers':
        blocks = this.blockers(ov);
        break;
      case 'next':
        blocks = proposal ? this.proposalNext(proposal, ov) : this.next(ov);
        break;
      case 'progress':
        blocks = proposal ? this.proposalProgress(proposal, ov) : this.progress(ov);
        break;
      case 'brief':
        blocks = context.draft ? [block('fact', t('wb.draft.update')), ...this.draft(context.draft)] : await this.brief(id);
        break;
      case 'evidence':
        blocks = await this.evidence(ov);
        break;
      case 'returned':
        blocks = await this.returned(ov);
        break;
      case 'pitch':
        blocks = await this.pitch(ov);
        break;
      case 'history':
        blocks = await this.history(ov);
        break;
      default:
        blocks = this.progress(ov);
    }
    return { status: 'answer' as const, blocks, basedOn };
  }

  private fallback(kind: 'project' | 'general' | 'draft') {
    return { status: 'fallback' as const, blocks: [block('missing', t('wb.fallback')), block('guidance', t(`wb.fallback.${kind}`))], basedOn: null };
  }

  private stageLine(ov: ProjectOverview) {
    const index = ov.stages.findIndex((s) => s.stage === ov.project.currentStage);
    return t('wb.stage', { n: index + 1, total: ov.stages.length, stage: ov.stages[index]?.label ?? '' });
  }

  private nextRef(ov: ProjectOverview) {
    const link = ov.nextAction.link;
    return link ? ref('stage', ov.nextAction.label, link.view, link.params) : ref('stage', ov.nextAction.label, 'overview');
  }

  private blockers(ov: ProjectOverview): AnswerBlock[] {
    const out = [block('fact', this.stageLine(ov))];
    if (ov.blockers.length) {
      out.push(
        block(
          'fact',
          t('wb.blockers.list', { count: ov.blockers.length }),
          ov.blockers.map((b) => `${b.title}: ${clip(b.detail, 110)}`),
          ov.blockers.map((b) => ref('blocker', b.title, b.link.view, b.link.params)),
        ),
      );
    } else out.push(block('fact', t('wb.blockers.none')));
    const unmet = ov.eligibility.checks.filter((c) => !c.passed);
    if (unmet.length && !ov.eligibility.alreadyContinued) {
      out.push(
        block(
          'interpretation',
          t('wb.blockers.checks', { count: unmet.length, total: ov.eligibility.checks.length }),
          unmet.map((c) => c.label),
          unmet.filter((c) => c.fix).map((c) => ref('stage', c.fix!.label, c.fix!.view, c.fix!.params)),
        ),
      );
    }
    out.push(block('recommendation', t('wb.next.do', { label: ov.nextAction.label }), [], [this.nextRef(ov)]));
    return out;
  }

  private next(ov: ProjectOverview): AnswerBlock[] {
    const out = [block('fact', t('wb.next.recorded', { label: ov.nextAction.label, desc: ov.nextAction.description }), [], [this.nextRef(ov)])];
    if (!ov.nextAction.enabled && ov.nextAction.disabledReason) out.push(block('missing', t('wb.next.disabled', { reason: ov.nextAction.disabledReason })));
    const gates = ov.project.humanGates.filter((g) => g.status === 'awaiting_decision');
    if (gates.length) out.push(block('fact', t('wb.next.gates', { count: gates.length }), gates.map((g) => `${g.label}: ${g.description}`)));
    const blocking = ov.blockers.filter((b) => b.severity === 'blocking').length;
    out.push(block('recommendation', blocking ? t('wb.next.blockersFirst', { count: blocking }) : t('wb.next.go'), [], blocking ? [ref('blocker', ov.blockers[0].title, ov.blockers[0].link.view, ov.blockers[0].link.params)] : []));
    return out;
  }

  /** Lists what still needs a decision in a set of task-card values. Shared by saved and draft briefs. */
  private fieldReview(read: (f: TaskField) => { value: string | string[]; origin: string | null; reason: ProvenanceReason | null }, link: (f: TaskField) => AssistantRef, fields: readonly TaskField[]) {
    const suggested: TaskField[] = [];
    const ambiguous: TaskField[] = [];
    const missingRequired: TaskField[] = [];
    const missingOptional: TaskField[] = [];
    for (const f of fields) {
      const { value, origin } = read(f);
      if (origin === 'suggested') suggested.push(f);
      else if (origin === 'ambiguous') ambiguous.push(f);
      else if (isEmpty(value)) ((REQUIRED_FIELDS as readonly string[]).includes(f) ? missingRequired : missingOptional).push(f);
    }
    const name = (f: TaskField) => t(`taskField.${f}`);
    const out: AnswerBlock[] = [];
    if (suggested.length) out.push(block('recommendation', t('wb.brief.suggested', { count: suggested.length }), suggested.map((f) => `${name(f)}: ${show(read(f).value)}`), suggested.map(link)));
    if (ambiguous.length)
      out.push(block('missing', t('wb.brief.ambiguous', { count: ambiguous.length }), ambiguous.map((f) => `${name(f)}: ${show(read(f).value)} (${t(`wb.reason.${read(f).reason ?? 'vague'}`)})`), ambiguous.map(link)));
    if (missingRequired.length) out.push(block('missing', t('wb.brief.required', { count: missingRequired.length }), missingRequired.map(name), missingRequired.map(link)));
    if (missingOptional.length) out.push(block('missing', t('wb.brief.optional', { count: missingOptional.length }), missingOptional.map(name), missingOptional.map(link)));
    if (!out.length) out.push(block('fact', t('wb.brief.allClear')));
    const open = read('openQuestions').value;
    if (Array.isArray(open) && open.length) out.push(block('fact', t('wb.brief.open', { count: open.length }), open.map((q) => clip(q, 110)), [link('openQuestions')]));
    out.push(block('recommendation', missingRequired.length || suggested.length ? t('wb.brief.beforeConfirm') : t('wb.brief.canConfirm')));
    return out;
  }

  private async brief(projectId: string): Promise<AnswerBlock[]> {
    const hist = await this.workbench.getBriefHistory(projectId);
    const brief = hist.current;
    if (!brief) return [block('missing', t('wb.brief.none'))];
    const head = brief.confirmedAt
      ? block('fact', t('wb.brief.confirmed', { v: brief.version, atDate: brief.confirmedAt, by: brief.confirmedBy ?? '' }), [], [ref('brief_field', t('wb.ref.brief', { v: brief.version }), 'brief')])
      : block('fact', t('wb.brief.draft', { v: brief.version }), [], [ref('brief_field', t('wb.ref.brief', { v: brief.version }), 'brief')]);
    const read = (f: TaskField) => {
      const value = f === 'projectName' ? hist.project.name : (brief[f as BriefField] as string | string[]);
      const p = brief.provenance?.[f];
      return { value, origin: p?.origin ?? null, reason: p?.reason ?? null };
    };
    const link = (f: TaskField) => ref('brief_field', t(`taskField.${f}`), 'brief', { field: f });
    const fields = TASK_FIELDS.filter((f) => f !== 'projectName');
    const body = brief.confirmedAt ? this.fieldReview(read, link, fields).filter((b) => b.kind !== 'recommendation') : this.fieldReview(read, link, fields);
    if (brief.confirmedAt) body.push(block('recommendation', t('wb.brief.confirmedNext')));
    return [head, ...body];
  }

  private draft(draft: BriefDraftContext): AnswerBlock[] {
    const fields: TaskCardDraft = draft.fields;
    const mode = draft.mapping === 'simulated_sample' ? t('wb.draft.simulated') : draft.mapping === 'headings' ? t('wb.draft.headings') : t('wb.draft.none');
    const provided = TASK_FIELDS.filter((f) => fields[f].provenance.origin === 'provided');
    const out = [block('fact', t('wb.draft.statement', { name: draft.fileName ?? t('wb.draft.typed') })), block('interpretation', mode)];
    if (provided.length) out.push(block('fact', t('wb.draft.provided', { count: provided.length }), provided.map((f) => `${t(`taskField.${f}`)}: ${show(fields[f].value)}`), provided.map((f) => ({ kind: 'draft_field' as const, label: t(`taskField.${f}`), target: { draftField: f } }))));
    const read = (f: TaskField) => ({ value: fields[f].value, origin: fields[f].provenance.origin, reason: fields[f].provenance.reason });
    const link = (f: TaskField): AssistantRef => ({ kind: 'draft_field', label: t(`taskField.${f}`), target: { draftField: f } });
    return [...out, ...this.fieldReview(read, link, TASK_FIELDS)];
  }

  private async evidence(ov: ProjectOverview): Promise<AnswerBlock[]> {
    const id = ov.project.id;
    if (ov.strategy) {
      const detail = await this.workbench.getArtifact(id, ov.strategy.id);
      const para = detail.artifact.sections.flatMap((s) => s.blocks).find((b) => b.kind === 'paragraph');
      const text = para && para.kind === 'paragraph' ? para.segments.filter((s): s is string => typeof s === 'string').join('') : detail.artifact.summary;
      const sources = new Map(detail.sources.map((s) => [s.id, s]));
      const out = [
        block('fact', t('wb.ev.strategy', { v: ov.strategy.version, text: clip(text, 220) }), [], [ref('artifact', t('wb.ref.strategy', { v: ov.strategy.version }), 'artifacts', { artifact: ov.strategy.id })]),
      ];
      if (detail.claims.length) {
        out.push(
          block(
            'fact',
            t('wb.ev.carried', { count: detail.claims.length }),
            detail.claims.map((c) => `${clip(c.text, 100)} — ${c.sourceIds.map((s) => sources.get(s)?.title ?? '').filter(Boolean).join(', ')}`),
            [
              ...detail.claims.slice(0, 4).map((c) => ref('claim', clip(c.text, 40), 'artifacts', { artifact: ov.strategy!.id, claim: c.id })),
              ...[...new Set(detail.claims.flatMap((c) => c.sourceIds))].slice(0, 3).map((s) => ref('source', sources.get(s)?.title ?? s, 'sources', { q: sources.get(s)?.title ?? '' })),
            ],
          ),
        );
      } else out.push(block('missing', t('wb.ev.noneCarried')));
      const handoff = await this.workbench.getHandoffOverview(id);
      const limits = handoff.strategySide?.prohibitedInferences ?? [];
      if (limits.length) out.push(block('interpretation', t('wb.ev.limits'), limits.map((l) => clip(l, 110)), [ref('handoff', t('wb.ref.handoff'), 'handoff')]));
      return out;
    }
    const research = await this.workbench.getResearchWorkspace(id);
    if (!research.artifact) return [block('missing', t('wb.ev.noResearch')), block('recommendation', t('wb.next.do', { label: ov.nextAction.label }), [], [this.nextRef(ov)])];
    const supported = research.claims.filter((c) => c.supportStatus === 'supported');
    const weak = research.claims.filter((c) => c.supportStatus !== 'supported');
    const out = [block('missing', t('wb.ev.noStrategy'))];
    out.push(
      supported.length
        ? block('fact', t('wb.ev.supported', { count: supported.length, total: research.claims.length }), supported.slice(0, 5).map((c) => clip(c.text, 110)), supported.slice(0, 4).map((c) => ref('claim', clip(c.text, 40), 'research', { claim: c.id })))
        : block('missing', t('wb.ev.noneSupported')),
    );
    if (weak.length) out.push(block('interpretation', t('wb.ev.weak', { count: weak.length }), weak.map((c) => `${clip(c.text, 90)} (${t(`wb.support.${c.supportStatus}`)})`), weak.slice(0, 4).map((c) => ref('claim', clip(c.text, 40), 'research', { claim: c.id }))));
    const verification = research.verification;
    out.push(
      block(
        'fact',
        verification ? t(verification.outdated ? 'wb.ev.verifOutdated' : 'wb.ev.verif', { summary: verification.summary }) : t('wb.ev.verifNone'),
        [],
        [ref('review', t('wb.ref.verification'), 'research', { tab: 'verification' })],
      ),
    );
    return out;
  }

  private async returned(ov: ProjectOverview): Promise<AnswerBlock[]> {
    const id = ov.project.id;
    const out = [block('missing', t('wb.ret.noCreative'))];
    const handoff = await this.workbench.getHandoffOverview(id);
    const returned = handoff.history.filter((h) => h.decision === 'returned');
    if (returned.length) out.push(block('fact', t('wb.ret.handoffs', { count: returned.length }), returned.map((h) => `${h.owner}: “${clip(h.note || h.unresolvedIssues.join(' '), 120)}”`), [ref('handoff', t('wb.ref.handoff'), 'handoff')]));
    const images = await this.workbench.listImages(id);
    const flagged = images.items.filter((r) => r.observation?.reviewStatus === 'needs_revision');
    if (flagged.length)
      out.push(block('fact', t('wb.ret.observations', { count: flagged.length }), flagged.map((r) => `${r.image.name}: “${clip(r.observation?.reviewNote ?? '', 110)}”`), flagged.map((r) => ref('image', r.image.name, 'images', { image: r.image.id }))));
    if (!returned.length && !flagged.length) out.push(block('fact', t('wb.ret.none')));
    else out.push(block('recommendation', t('wb.ret.address')));
    return out;
  }

  private async pitch(ov: ProjectOverview): Promise<AnswerBlock[]> {
    const out = [block('guidance', t('wb.pitch.guide'), [t('wb.pitch.g1'), t('wb.pitch.g2'), t('wb.pitch.g3')])];
    if (!ov.strategy) {
      out.push(block('missing', t('wb.pitch.noStrategy')), block('recommendation', t('wb.next.do', { label: ov.nextAction.label }), [], [this.nextRef(ov)]));
      return out;
    }
    const detail = await this.workbench.getArtifact(ov.project.id, ov.strategy.id);
    const list = detail.artifact.sections.find((s) => /territor/i.test(s.heading))?.blocks.find((b) => b.kind === 'list');
    if (list && list.kind === 'list') out.push(block('fact', t('wb.pitch.territories', { v: ov.strategy.version, count: list.items.length }), list.items.map((i) => clip(i, 120)), [ref('artifact', t('wb.ref.strategy', { v: ov.strategy.version }), 'artifacts', { artifact: ov.strategy.id })]));
    const handoff = await this.workbench.getHandoffOverview(ov.project.id);
    const limits = handoff.strategySide?.prohibitedInferences ?? [];
    if (limits.length) out.push(block('interpretation', t('wb.pitch.limits'), limits.map((l) => clip(l, 110)), [ref('handoff', t('wb.ref.handoff'), 'handoff')]));
    if (ov.strategy.status !== 'ready' && ov.strategy.status !== 'released') out.push(block('missing', t('wb.pitch.notApproved', { v: ov.strategy.version })));
    return out;
  }

  private async history(ov: ProjectOverview): Promise<AnswerBlock[]> {
    const id = ov.project.id;
    const hist = await this.workbench.getBriefHistory(id);
    const artifacts = await this.workbench.listArtifacts(id);
    const briefLine = (b: Brief) => `v${b.version} · ${b.confirmedAt ? t('wb.hist.confirmed', { atDate: b.confirmedAt }) : t('wb.hist.draft')}${b.changeNote ? ` · ${clip(b.changeNote, 80)}` : ''}`;
    const out = [
      block('fact', t('wb.hist.brief', { count: hist.versions.length }), hist.versions.map(briefLine), hist.versions.slice(0, 3).map((b) => ref('brief_field', t('wb.ref.brief', { v: b.version }), 'brief', b.version === hist.current?.version ? undefined : { version: String(b.version) }))),
    ];
    if (artifacts.items.length) out.push(block('fact', t('wb.hist.artifacts', { count: artifacts.items.length }), artifacts.items.map((a) => `${a.title} v${a.version}${a.isCurrent ? '' : ` · ${t('wb.hist.superseded')}`}`), artifacts.items.slice(0, 3).map((a) => ref('artifact', `${clip(a.title, 30)} v${a.version}`, 'artifacts', { artifact: a.id }))));
    const gates = ov.project.humanGates.filter((g) => g.status === 'awaiting_decision');
    out.push(gates.length ? block('fact', t('wb.next.gates', { count: gates.length }), gates.map((g) => g.label)) : block('fact', t('wb.hist.noPending')));
    if (ov.recentActivity.length) out.push(block('fact', t('wb.hist.activity'), ov.recentActivity.slice(0, 4).map((a) => clip(a.message, 110))));
    return out;
  }

  /** Where the proposal stands across the eight creative stages. */
  private proposalProgress(p: Proposal, ov: ProjectOverview): AnswerBlock[] {
    const n = STAGES.indexOf(p.currentStage) + 1;
    return [
      block(
        'fact',
        t('wb.p.stage', { n, stage: t(`wb.pstage.${p.currentStage}`), status: t(`wb.pstatus.${p.stages[p.currentStage].status}`) }),
        STAGES.map((s) => `${t(`wb.pstage.${s}`)}: ${t(`wb.pstatus.${p.stages[s].status}`)}`),
        [ref('stage', t('wb.ref.overview'), 'overview')],
      ),
      ...this.proposalNext(p, ov).slice(0, 1),
    ];
  }

  /** The next step, in the same order as the workspace: your decisions, real blockers, revisions, then progress. */
  private proposalNext(p: Proposal, ov: ProjectOverview): AnswerBlock[] {
    const go = (s: StageId) => ref('stage', t(`wb.pstage.${s}`), 'proposal', { stage: s });
    const waiting = STAGES.find((s) => p.stages[s].status === 'waiting_for_you');
    if (waiting) return [block('recommendation', t('wb.p.waiting', { stage: t(`wb.pstage.${waiting}`) }), [p.stages[waiting].summary], [go(waiting)]), block('guidance', t('wb.p.cantDecide'))];
    if (p.stages.brief.status !== 'done') return [block('recommendation', t('wb.p.confirmBrief'), [], [go('brief')])];
    if (ov.blockers.some((b) => b.severity === 'blocking') && p.stages.research.status !== 'done') return this.next(ov);
    const revising = STAGES.find((s) => p.stages[s].status === 'needs_revision');
    if (revising) return [block('fact', t('wb.p.revising', { stage: t(`wb.pstage.${revising}`) }), [p.stages[revising].summary], [go(revising)])];
    if (p.stages.delivery.status === 'done') return [block('fact', t('wb.p.delivered'), [], [ref('artifact', t('wb.p.deliveryCenter'), 'delivery')])];
    return [block('fact', t('wb.p.working', { lead: p.stages[p.currentStage].lead, stage: t(`wb.pstage.${p.currentStage}`) }), [p.stages[p.currentStage].summary], [go(p.currentStage)])];
  }

  private progress(ov: ProjectOverview): AnswerBlock[] {
    return [
      block('fact', this.stageLine(ov), ov.stages.filter((s) => s.state !== 'not_in_demo').map((s) => `${s.label}: ${s.note}`), [ref('stage', t('wb.ref.overview'), 'overview')]),
      block('recommendation', t('wb.next.do', { label: ov.nextAction.label }), [], [this.nextRef(ov)]),
    ];
  }

  private general(intent: Intent): AnswerBlock[] {
    switch (intent) {
      case 'g_process':
        return [
          block('guidance', t('wb.g.process2'), STAGES.map((s) => `${t(`wb.pstage.${s}`)}: ${t(`wb.g.pw.${s}`)}`)),
          block('guidance', t('wb.g.modes')),
        ];
      case 'g_brief':
        return [block('guidance', t('wb.g.brief'), [t('wb.g.brief1'), t('wb.g.brief2'), t('wb.g.brief3'), t('wb.g.brief4')])];
      case 'g_checks':
        return [block('guidance', t('wb.g.checks'), [t('wb.g.checks1'), t('wb.g.checks2'), t('wb.g.checks3'), t('wb.g.checks4')])];
      default:
        return [block('guidance', t('wb.pitch.guide'), [t('wb.pitch.g1'), t('wb.pitch.g2'), t('wb.pitch.g3'), t('wb.pitch.g4')])];
    }
  }
}

