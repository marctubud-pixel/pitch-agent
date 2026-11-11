import type { Artifact, Brief, BriefHistory, Claim, EvidenceTopic, ResearchWorkspace, Review, Source } from '../../domain/models';
import { methodBriefSnapshot, methodNodes, type ResearchMethodNode } from '../../domain/researchMethod';
import { currentResearchClaims } from '../researchClaims';
import { originalLumaAttachments } from './lumaReference';
import type { ResearchFigure } from './model';

export const supportLabels = { supported: '有支持', partial: '部分支持', unsupported: '不支持', missing_citation: '缺少引用', unverified: '未核验' };
export const sourceLabels = { verified: '已核验', unverified: '未核验', insufficient: '依据不足' };
const topicLabels: Record<EvidenceTopic, string> = { audience: '人群', category: '行业', competitor: '竞争', cultural: '文化背景', production: '产品' };
export type MethodProjection = {
  identity: string;
  artifactLabel: string;
  brief: Brief | null;
  latestBrief: Brief | null;
  stale: boolean;
  planState: 'recorded' | 'legacy' | 'mismatch' | 'unavailable';
  nodes: ResearchMethodNode[];
  claims: Claim[];
  observations: Claim[];
  sources: Source[];
  figures: ResearchFigure[];
  attachmentReason: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function sameStrings(raw: unknown, expected: string[]): boolean {
  return stringArray(raw) && raw.length === expected.length && raw.every((value, index) => value === expected[index]);
}

function version(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function evidenceTopic(value: unknown): value is EvidenceTopic {
  return value === 'audience' || value === 'category' || value === 'competitor' || value === 'cultural' || value === 'production';
}

function parseNode(raw: unknown): ResearchMethodNode | null {
  if (!record(raw)) return null;
  const { id, kind, title, questions, topics, dependsOn } = raw;
  if (typeof title !== 'string' || !stringArray(questions) || !stringArray(dependsOn)) return null;
  if (kind === 'input' && (id === 'A' || id === 'B' || id === 'D') && dependsOn.length === 0 && Array.isArray(topics) && topics.every(evidenceTopic)) {
    return { kind, id, title, questions: [...questions], topics: [...topics], dependsOn: [] };
  }
  if (kind === 'synthesis' && id === 'C' && dependsOn.length === 3 && new Set(dependsOn).size === 3 && dependsOn.every(dependency => dependency === 'A' || dependency === 'B' || dependency === 'D')) {
    return { kind, id, title, questions: [...questions], dependsOn: ['A', 'B', 'D'] };
  }
  return null;
}

/** Parse saved wording only after checking its authoritative report and brief binding. */
function matchingMethodNodes(raw: unknown, workspace: ResearchWorkspace, brief: Brief): ResearchMethodNode[] | null {
  const artifact = workspace.artifact;
  if (!artifact || !record(raw) || raw.kind !== 'dot-research-plan' || raw.schemaVersion !== 1 || !record(raw.binding) || !record(raw.binding.brief) || !Array.isArray(raw.nodes)) return null;
  const binding = raw.binding;
  const snapshot = raw.binding.brief;
  const expected = methodBriefSnapshot(brief);
  if (binding.projectId !== workspace.project.id || artifact.projectId !== workspace.project.id || artifact.stage !== 'research' || binding.artifactId !== artifact.id || !version(binding.artifactVersion) || binding.artifactVersion !== artifact.version || brief.projectId !== workspace.project.id || brief.version !== artifact.basedOn.briefVersion) return null;
  if (snapshot.id !== expected.id || snapshot.projectId !== expected.projectId || !version(snapshot.version) || snapshot.version !== expected.version || snapshot.brand !== expected.brand || snapshot.background !== expected.background || snapshot.audience !== expected.audience || snapshot.proposalType !== expected.proposalType || !sameStrings(snapshot.researchQuestions, expected.researchQuestions) || !sameStrings(snapshot.deliverables, expected.deliverables) || !sameStrings(snapshot.constraints, expected.constraints)) return null;
  const nodes = raw.nodes.map(parseNode);
  if (nodes.length !== 4 || nodes.some(node => node === null)) return null;
  const parsed = nodes.filter(node => node !== null);
  return new Set(parsed.map(node => node.id)).size === 4 ? parsed : null;
}

export function planMatches(raw: unknown, workspace: ResearchWorkspace, brief: Brief): boolean {
  return matchingMethodNodes(raw, workspace, brief) !== null;
}

export function reviewLabel(review: Review | null, artifact?: Artifact | null): string {
  if (!review) return '尚无评审记录';
  if (artifact === null || (artifact && (review.projectId !== artifact.projectId || review.artifactId !== artifact.id || review.artifactVersion !== artifact.version))) return '评审与当前报告不匹配';
  if (review.outdated) return `评审已过期${review.outdatedReason ? `：${review.outdatedReason}` : ''}`;
  return review.decision === 'fail' ? '评审未通过' : review.decision === 'pass_with_conditions' ? '有条件通过' : '评审通过';
}

function exactLumaBasis(workspace: ResearchWorkspace, brief: Brief | null, claims: Claim[], sources: Source[]): boolean {
  const a = workspace.artifact;
  if (!a || a.id !== 'art-luma-research-v1' || a.version !== 1 || a.projectId !== 'luma' || a.stage !== 'research' || a.basedOn.briefVersion !== 2 || !a.simulated || !brief) return false;
  return originalLumaAttachments.some(basis => {
    if (JSON.stringify(methodBriefSnapshot(brief)) !== JSON.stringify(basis.brief)) return false;
    const claim = claims.find(c => c.id === basis.claim.id);
    const source = sources.find(s => s.id === basis.source.id);
    if (!claim || !source) return false;
    const { verificationStatus: _status, ...sourceSnapshot } = source;
    return claim.artifactId === basis.claim.artifactId && claim.text === basis.claim.text && JSON.stringify([...claim.sourceIds].sort()) === JSON.stringify([...basis.claim.sourceIds].sort()) && JSON.stringify(sourceSnapshot) === JSON.stringify(basis.source);
  });
}

export function projectResearch(workspace: ResearchWorkspace, history: BriefHistory | null): MethodProjection {
  const { artifact, project } = workspace;
  const ownArtifact = artifact?.projectId === project.id && artifact.stage === 'research' && artifact.isCurrent ? artifact : null;
  const ownHistory = history?.project.id === project.id ? history : null;
  const brief = ownArtifact ? ownHistory?.versions.find(b => b.projectId === project.id && b.version === ownArtifact.basedOn.briefVersion) ?? null : ownHistory?.current?.projectId === project.id ? ownHistory.current : null;
  const latestBrief = ownHistory?.current?.projectId === project.id ? ownHistory.current : null;
  const claims = currentResearchClaims(workspace);
  const sources = workspace.sources.filter(s => s.projectId === project.id);
  const stale = Boolean(ownArtifact && (ownArtifact.staleReason || ownArtifact.status === 'stale' || (latestBrief && latestBrief.version !== ownArtifact.basedOn.briefVersion)));
  const recordedNodes = ownArtifact && brief ? matchingMethodNodes(ownArtifact.researchMethodPlan, workspace, brief) : null;
  const planState = !ownArtifact || !brief ? 'unavailable' : Object.hasOwn(ownArtifact, 'researchMethodPlan') ? recordedNodes ? 'recorded' : 'mismatch' : 'legacy';
  const verification = workspace.verification;
  const currentVerification = Boolean(ownArtifact && verification && verification.type === 'verification' && !verification.outdated && verification.projectId === project.id && verification.artifactId === ownArtifact.id && verification.artifactVersion === ownArtifact.version);
  const observations = currentVerification && !stale ? claims.filter(claim => claim.supportStatus === 'supported' && claim.sourceIds.length > 0 && claim.sourceIds.every(id => sources.some(source => source.id === id && source.verificationStatus === 'verified'))) : [];
  const figures: ResearchFigure[] = [];
  if (claims.length) {
    figures.push({ id: 'evidence-map', kind: 'matrix', title: '证据地图 · 哪些判断站得住', description: '逐条呈现当前论点的核验状态与引用，不把论点数量当作市场规模或研究完成度。', origin: { kind: 'project', note: `研究第${ownArtifact?.version}版当前论点与来源；状态随已有工作区刷新。`, claimIds: claims.map(c => c.id), sourceIds: [] }, columns: ['论点支持', '来源记录', '限制'], rows: claims.map((c, i) => ({ label: `论点 ${i + 1} · ${topicLabels[c.topic]}`, cells: [{ text: supportLabels[c.supportStatus], tone: c.supportStatus === 'supported' ? 'ok' : c.supportStatus === 'partial' ? 'partial' : c.supportStatus === 'unverified' ? 'unknown' : 'gap' }, { text: c.sourceIds.length ? c.sourceIds.every(id => sources.some(s => s.id === id)) ? `${c.sourceIds.length} 条引用` : '引用记录缺失' : '无引用', tone: !c.sourceIds.length || c.sourceIds.some(id => !sources.some(s => s.id === id)) ? 'gap' : c.sourceIds.some(id => sources.find(s => s.id === id)?.verificationStatus !== 'verified') ? 'unknown' : 'ok' }, { text: c.limitations.length ? `${c.limitations.length} 项限制` : '未记录限制', tone: c.limitations.length ? 'partial' : 'unknown' }] })) });
    const observation = observations[0];
    const pending = observation ?? claims[0];
    const gap = claims.find(claim => !observations.includes(claim));
    figures.push({ id: 'insight-chain', kind: 'chain', title: '从观察到机会假设', description: '这是研究推导提示，尚未形成策略定位；任何假设都需携带证据边界。', origin: { kind: 'project', note: '读取当前论点、完整引用与有效核验状态。机会仅为待验证的工作假设。完整原文见数据表与下方论点。', claimIds: [pending.id, ...(gap && gap.id !== pending.id ? [gap.id] : [])], sourceIds: [] }, steps: [{ label: observation ? '观察' : '待核验论点', text: observation ? observation.text : `尚无已核验且引用完整的观察。待核验：${pending.text}` }, { label: '张力 / 边界', text: !observation ? '现有论点仍需完整来源与当前有效核验，尚不能作为已证实观察。' : gap ? `${supportLabels[gap.supportStatus]}，引用与有效核验仍需核对：${gap.text}` : '当前核验仅覆盖已记录材料，尚不能外推到全部市场。' }, { label: '机会假设', text: !observation ? '先补齐来源并完成有效核验，暂不能据此提出有依据的机会。' : gap ? '先补足关键缺口，再判断这条观察能否转化为设计机会。' : '可将已支持观察转为设计方向候选，在策略阶段验证。' }] });
  }
  const exact = exactLumaBasis(workspace, brief, claims, sources);
  if (exact) figures.unshift({ id: 'store-observation', kind: 'bars', title: '门店走查 · 有限样本中的陈列观察', description: '同一条街的四家样本门店中，两家记录了视线高度的独立冷藏陈列面。两根柱分别表示样本总数与其中的观察数，不是市场占有率。', unit: '家门店', max: 4, rows: [{ label: '走访样本总数', metric: { kind: 'known', value: 4 } }, { label: '记录独立陈列面的门店', metric: { kind: 'known', value: 2 } }], origin: { kind: 'project', note: `独立本地工程模拟资料 · 示例走查笔记记录走访4家门店，其中2家有独立陈列面。来源状态：${sourceLabels[sources.find(s => s.id === 'src-luma-audit')?.verificationStatus ?? 'unverified']}。仅描述此样本，不外推。`, claimIds: ['art-luma-research-v1-c1'], sourceIds: ['src-luma-audit'] } });
  return { identity: `${project.id}:${ownArtifact?.id ?? 'none'}:${ownArtifact?.version ?? 'none'}`, artifactLabel: ownArtifact ? `研究第${ownArtifact.version}版` : '尚无研究报告', brief, latestBrief, stale, planState, nodes: recordedNodes ?? methodNodes(brief ? methodBriefSnapshot(brief) : null), claims, observations, sources, figures, attachmentReason: exact ? '' : ownArtifact?.id === 'art-luma-research-v1' ? '当前走查记录与报告原始依据不一致，暂不绘制门店数量。仍可查看当前论点及来源原文。' : ownArtifact?.lineageId === 'lin-luma-research' && project.id === 'luma' ? '报告已换版，旧版门店数量未带入新版。市场规模、份额、意愿及竞争坐标仍待定量依据。' : '尚无可绘制市场规模、份额、意愿及竞争坐标的定量依据。未知不等于零。' };
}
