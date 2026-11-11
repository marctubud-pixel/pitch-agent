import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryState } from '../../app/query';
import { FeedbackProvider } from '../../app/feedback';
import { TeamProvider } from '../../collaboration/context';
import { LocalTeamStore } from '../../collaboration/LocalTeamStore';
import { TestStorage } from '../../collaboration/testSupport';
import { ProposalArea } from '../../views/project/ProposalArea';
import { displayedTarget } from '../contributionTargets';
import { draftKey, writeDraft } from '../drafts';
import { ConfirmProvider } from '../../app/confirm';
import { RouterProvider } from '../../app/router';
import { ServiceProvider } from '../../app/services';
import type { BriefHistory, ResearchWorkspace } from '../../domain/models';
import { toServiceError } from '../../domain/service';
import { I18nProvider } from '../../i18n';
import { qingyuProposal } from '../../services/cases/qingyuFixture';
import { LocalIntakeService } from '../../services/intake/LocalIntakeService';
import { MockAssistantService } from '../../services/mock/MockAssistantService';
import { MockWorkbenchService } from '../../services/mock/MockWorkbenchService';
import { memoryStore } from '../../services/mock/storage';
import { MockProposalService } from '../../services/proposal/MockProposalService';
import { northline } from '../../services/proposal/fixtures/northline';
import { plumtide } from '../../services/proposal/fixtures/plumtide';
import { VisualStage } from '../../views/stages/VisualStage';
import { resolveQingyuThemesPreview } from '../qingyu-themes/preview';
import { QingyuVisualResultView } from './QingyuVisualPreview';
import { conceptImages, resolveDirectionConcept } from './concept-images';
import { packagingReferenceSet, resolvePackagingReferences } from './packaging-references';

let researchQuery: QueryState<ResearchWorkspace>;
let briefQuery: QueryState<BriefHistory>;
vi.mock('../../app/query', () => ({ useServiceQuery: (key: string) => key.startsWith('research-case-briefs:') ? briefQuery : researchQuery }));
vi.mock('../drafts', async () => {
  const actual = await vi.importActual<typeof import('../drafts')>('../drafts');
  function useStoredDraftForServerRender(key: string) { return [actual.readDraft(key), (patch: Partial<import('../drafts').IdeaDraft>) => actual.writeDraft(key, { ...actual.readDraft(key), ...patch }), () => actual.writeDraft(key, null)]; }
  return { ...actual, useIdeaDraft: useStoredDraftForServerRender };
});
const serviceError = toServiceError(new Error('offline'));

function render(children: ReactNode, query = '', actor = 'human-owner') {
  vi.stubGlobal('window', { location: { hash: `#/p/qingyu/proposal/visual${query ? `?${query}` : ''}` }, history: { state: null } });
  const team = new LocalTeamStore({ storage: new TestStorage(), sessionStorage: new TestStorage(), autoStart: false });
  team.selectActor(actor);
  const store = memoryStore();
  const service = new MockWorkbenchService({ store, latency: { read: 0, write: 0 }, autoTick: false });
  return renderToStaticMarkup(createElement(ServiceProvider, {
    service, intake: new LocalIntakeService({ latency: 0 }), assistant: new MockAssistantService(service, store, 0), proposals: new MockProposalService(service, store, { latency: 0 }),
    children: createElement(I18nProvider, { children: createElement(ConfirmProvider, { children: createElement(RouterProvider, { mode: 'hash', children: createElement(TeamProvider, { store: team, children: createElement(FeedbackProvider, { children }) }) }) }) }),
  }));
}

async function data() {
  const service = new MockWorkbenchService({ store: memoryStore(), latency: { read: 0, write: 0 }, autoTick: false });
  return { proposal: structuredClone(qingyuProposal), workspace: await service.getResearchWorkspace('qingyu'), history: await service.getBriefHistory('qingyu') };
}

beforeEach(async () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ measureText: (char: string) => ({ width: /[ -~]/.test(char) ? 50 : 100 }) }) }) });
  const input = await data();
  researchQuery = { status: 'success', data: input.workspace, error: null, refreshError: null, refreshing: false, refetch: vi.fn() };
  briefQuery = { status: 'success', data: input.history, error: null, refreshError: null, refreshing: false, refetch: vi.fn() };
});
afterEach(() => vi.unstubAllGlobals());

describe('Qingyu visual layout preview', () => {
  it('shows bound design previews with sealed full copy without business visual writes', async () => {
    const input = await data();
    const before = JSON.stringify(input);
    const result = resolveQingyuThemesPreview(input);
    if (result.kind === 'unavailable') throw new Error('Actual sealed copy required');
    expect(result.preview.bundle.id).toBe('qingyu-copy-full-r2-20261110');
    expect(result.preview.bundle.currentRound.directions.map(direction => direction.id)).toEqual(['n7', 'k4', 'v2']);
    for (const direction of result.preview.bundle.currentRound.directions) {
      const html = render(createElement(QingyuVisualResultView, { result, retry: () => {} }), `part=current&dir=${direction.id}`);
      for (const text of [direction.name, direction.slogan, direction.subline]) expect(html).toContain(text);
      expect(html).toContain(`data-visual-direction="${direction.id}"`);
      expect(html).toContain('class="pw-refined"');
      expect(html).toContain(`/visual-concepts/qingyu-20261110/${direction.id}-main.png`);
      expect(html).toContain(`/visual-concepts/qingyu-20261110/${direction.id}-mockups.png`);
      expect(html).toContain('生成示意');
      expect(html).toContain('规范与评审记录');
      expect((html.match(/class="qv-mockup-board qv-image-button"/g) ?? [])).toHaveLength(1);
      expect((html.match(/aria-haspopup="dialog"/g) ?? [])).toHaveLength(2);
      for (const label of ['正面', '侧面', '背面']) expect(html).toContain(label);
      expect(html).not.toMatch(/图位|待制作|视觉稿版本位置|视觉评审位置/);
      expect(html).not.toMatch(/data-verdict|data-met|data-score|pw-scores|pw-threshold|<image|art-frame|精修第|[0-9]+\s*\/\s*5|[0-9]+%/);
    }
    expect(JSON.stringify(input)).toBe(before);
    expect(input.proposal.visual).toBeNull();
    expect(input.proposal.stages.visual.status).toBe('not_started');
  });

  it('keeps the reference fan, folder sheets and equal comparison positions available with no scores', async () => {
    const result = resolveQingyuThemesPreview(await data());
    const process = render(createElement(QingyuVisualResultView, { result, retry: () => {} }), 'part=process&dir=k4');
    expect((process.match(/class="vd-fan__card"/g) ?? [])).toHaveLength(2);
    expect((process.match(/class="vd-sheet"/g) ?? [])).toHaveLength(3);
    expect(process).toContain('data-reference-detail="trip-longjing"');
    expect(process).toContain('借鉴句来自对公开包装图的观察');
    expect(process).toContain('class="vd-folder"');
    expect(process).toContain('--dir:#587650');
    expect(render(createElement(QingyuVisualResultView, { result, retry: () => {} }), 'part=process&dir=n7')).toContain('class="vd-folder" style="--dir:#002FA7');
    const compare = render(createElement(QingyuVisualResultView, { result, retry: () => {} }), 'part=compare');
    expect((compare.match(/data-visual-comparison=/g) ?? [])).toHaveLength(3);
    expect(compare).toContain('未进行相似度评审');
    if (result.kind === 'unavailable') throw new Error('Actual sealed copy required');
    for (const direction of result.preview.bundle.currentRound.directions) for (const text of [direction.name, direction.slogan, direction.subline]) expect(compare).toContain(text);
    expect(process + compare).not.toMatch(/data-verdict|data-score|data-met|art-frame|[0-9]+\s*\/\s*5|[0-9]+%/);
    expect((compare.match(/<img /g) ?? [])).toHaveLength(9);
    for (const reference of packagingReferenceSet.references) expect(compare).toContain(reference.image);
  });

  it('defaults to references only when part is absent and shows each direction’s actual references', async () => {
    const input = await data();
    const before = JSON.stringify(input);
    const result = resolveQingyuThemesPreview(input);
    if (result.kind === 'unavailable') throw new Error('Actual sealed copy required');
    for (const direction of result.preview.bundle.currentRound.directions) {
      const refs = resolvePackagingReferences({ bundle: result.preview.bundle, directionId: direction.id });
      if (refs.kind !== 'ready') throw new Error('Bound packaging references required');
      const html = render(createElement(QingyuVisualResultView, { result, retry: () => {} }), `dir=${direction.id}`);
      expect(html).toContain('参考已收集待评');
      expect(html).toContain(`data-reference-detail="${refs.references[0].id}"`);
      expect((html.match(/<img /g) ?? [])).toHaveLength(8);
      for (const index of [1, 2, 3]) expect(html).toContain(`/visual-concepts/qingyu-20261110/${direction.id}-sketch-${index}.png`);
      for (const reference of refs.references) {
        expect(html).toContain(reference.title);
        expect(html).toContain(reference.image);
      }
      const displayed = refs.references[0];
      expect(html).toContain(`data-reference-note="${displayed.id}"`);
      expect(html.split(displayed.borrow)).toHaveLength(2);
      expect(html).toContain(displayed.sourceName);
      expect(html).toContain(displayed.sourceUrl.replaceAll('&', '&amp;'));
      expect(html).toContain(`href="${displayed.image}"`);
      expect(html).toContain('来源、用途限制与评审记录');
      expect(html).toContain(refs.references[0].form);
      expect(html).toContain(refs.references[0].scope);
      expect(html).not.toContain('精修主图图位');
      expect(html).not.toMatch(/data-verdict|data-score|data-met|[0-9]+\s*\/\s*5/);
    }
    const memory = render(createElement(QingyuVisualResultView, { result, retry: () => {} }), 'dir=v2');
    expect(memory).toContain('查看完整系列图');
    expect(memory).toContain('近景原图未显示瓶底');
    expect(memory).toContain('2023金兔生肖瓶');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps unmatched reference bindings visible without exposing another version’s pictures', async () => {
    const result = resolveQingyuThemesPreview(await data());
    if (result.kind === 'unavailable') throw new Error('Actual sealed copy required');
    for (const change of ['bundle', 'round', 'missing', 'duplicate', 'extra', 'different']) {
      const changed = structuredClone(result);
      const bundle = changed.preview.bundle;
      if (change === 'bundle') bundle.id = 'other-bundle';
      if (change === 'round') bundle.currentRound.id = 'r3';
      if (change === 'missing') bundle.currentRound.directions.pop();
      if (change === 'duplicate') bundle.currentRound.directions[1] = bundle.currentRound.directions[0];
      if (change === 'extra') bundle.currentRound.directions.push({ ...bundle.currentRound.directions[0], id: 'extra' });
      if (change === 'different') bundle.currentRound.directions[1].id = 'other';
      expect(resolvePackagingReferences({ bundle, directionId: 'n7' }).kind).toBe('unmatched');
      const html = render(createElement(QingyuVisualResultView, { result: changed, retry: () => {} }), 'part=process');
      expect(html).toContain('参考集未匹配');
      expect(html).not.toMatch(/<img|data-reference-detail|data-reference-note/);
      expect(resolveDirectionConcept(bundle, 'n7')).toBeUndefined();
      const current = render(createElement(QingyuVisualResultView, { result: changed, retry: () => {} }), 'part=current');
      expect(current).toContain('参考集未匹配');
      expect(current.indexOf('参考集未匹配')).toBeLessThan(current.indexOf('class="qv-owner"'));
      expect(current.indexOf('接续记录')).toBeLessThan(current.indexOf('class="qv-owner"'));
    }
    expect(resolvePackagingReferences({ bundle: result.preview.bundle, directionId: 'unknown' }).kind).toBe('unmatched');
  });

  it('compares only artwork from the requested stage and never substitutes references', async () => {
    const result = resolveQingyuThemesPreview(await data());
    for (const stage of ['sketch', 'refined']) {
      const html = render(createElement(QingyuVisualResultView, { result, retry: () => {} }), `part=compare&compareStage=${stage}`);
      expect((html.match(/data-comparison-stage=/g) ?? [])).toHaveLength(3);
      expect((html.match(/class="qv-comparison-art"/g) ?? [])).toHaveLength(3);
      expect((html.match(/<img /g) ?? [])).toHaveLength(stage === 'sketch' ? 12 : 6);
      expect(html).not.toMatch(/data-score|pw-scores|data-verdict/);
      for (const reference of packagingReferenceSet.references) expect(html).not.toContain(`src="${reference.image}"`);
      if (stage === 'refined') expect(html).not.toContain('-sketch-');
    }
    const invalid = render(createElement(QingyuVisualResultView, { result, retry: () => {} }), 'part=compare&compareStage=other');
    expect(invalid).toContain('未找到指定的对照阶段');
    expect((invalid.match(/<img /g) ?? [])).toHaveLength(9);
  });

  it('registers fifteen unique preview assets and preserves the three direction identities', async () => {
    const result = resolveQingyuThemesPreview(await data());
    if (result.kind === 'unavailable') throw new Error('Sealed copy required');
    const images = conceptImages.flatMap(concept => [concept.main, ...concept.sketches, concept.mockups]);
    expect(images).toHaveLength(15);
    expect(new Set(images.map(image => image.url)).size).toBe(15);
    expect(images.every(image => image.generationType === 'preview' && image.alt.length > 0)).toBe(true);
    for (const image of images) {
      const bytes = readFileSync(new URL(`../../../public${image.url}`, import.meta.url));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
      expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
    }
    expect(conceptImages.map(concept => concept.directionId)).toEqual(['n7', 'k4', 'v2']);
    for (const concept of conceptImages) expect(resolveDirectionConcept(result.preview.bundle, concept.directionId)).toEqual(concept);
    expect(resolveDirectionConcept(result.preview.bundle, 'unknown')).toBeUndefined();
  });

  it('keeps exactly one actual collaboration area for owners, guests and failed evidence', () => {
    for (const actor of ['human-owner', 'human-guest']) {
      const html = render(createElement(ProposalArea, { proposal: qingyuProposal, stage: 'visual' }), 'dir=n7&focus=ideas', actor);
      expect((html.match(/id="contrib-visual"/g) ?? [])).toHaveLength(1);
      expect(html).toContain('整个视觉阶段');
      expect(html.indexOf('id="contrib-visual"')).toBeLessThan(html.indexOf('class="qv-owner-records"'));
      expect(html).toContain('设计试稿预览，含构图探索与模拟样机；正式流程状态保持。');
      expect(html).toContain('data-open="true"');
      expect(html.includes('aria-labelledby="contrib-visual"')).toBe(true);
      expect(html.includes('添加想法')).toBe(actor === 'human-owner');
      expect(displayedTarget(qingyuProposal, 'visual', new URLSearchParams('dir=n7&part=current&version=9'))).toEqual({ kind: 'stage', stage: 'visual', version: qingyuProposal.stages.visual.version });
    }
    researchQuery = { ...researchQuery, status: 'error', error: serviceError };
    const unavailable = render(createElement(ProposalArea, { proposal: qingyuProposal, stage: 'visual' }), 'focus=ideas');
    expect(unavailable).toContain('读取失败');
    expect((unavailable.match(/id="contrib-visual"/g) ?? [])).toHaveLength(1);
    expect(unavailable).not.toContain('data-intake-status="current"');
  });

  it('keeps actor-owned stage drafts and recorded review meanings while directions change', () => {
    const key = draftKey(qingyuProposal.id, 'visual', 'human-owner');
    writeDraft(key, { open: true, kind: 'comment', text: '请核对字级的原始意见', borrow: '', target: { kind: 'stage', stage: 'visual', version: 1 } });
    for (const dir of ['n7', 'k4', 'v2']) {
      const html = render(createElement(ProposalArea, { proposal: qingyuProposal, stage: 'visual' }), `dir=${dir}`);
      expect((html.match(/<textarea/g) ?? [])).toHaveLength(1);
      expect(html).toContain('请核对字级的原始意见');
      expect(html).toContain('绑定整个视觉阶段');
      expect(html).not.toContain('绑定当前显示稿件');
      const guest = render(createElement(ProposalArea, { proposal: qingyuProposal, stage: 'visual' }), `dir=${dir}`, 'human-guest');
      expect(guest).not.toContain('<textarea');
      expect(guest).not.toContain('请核对字级的原始意见');
    }
    writeDraft(key, null);
  });


  it('starts with collaboration collapsed while retaining its mounted content in every view', async () => {
    const result = resolveQingyuThemesPreview(await data());
    for (const part of ['current', 'process', 'compare']) {
      const html = render(createElement(QingyuVisualResultView, { result, retry: () => {}, collaboration: createElement('textarea', { defaultValue: '未发送的意见' }) }), `part=${part}`);
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('aria-controls="qv-owner-content"');
      expect(html).toContain('class="qv-owner" aria-label="视觉规范、版本与协作" hidden=""');
      expect((html.match(/未发送的意见/g) ?? [])).toHaveLength(1);
      expect(html).not.toContain('class="qv-task"');
      expect(html).not.toContain('class="qv-progress"');
    }
  });

  it('delivers all six verified reference records as original local image bytes with public sources', () => {
    expect(packagingReferenceSet.references.map(reference => reference.directionId)).toEqual(['n7', 'n7', 'k4', 'k4', 'v2', 'v2']);
    expect(new Set(packagingReferenceSet.references.map(reference => reference.id)).size).toBe(6);
    for (const reference of packagingReferenceSet.references) {
      const image = readFileSync(new URL(`../../../public${reference.image}`, import.meta.url));
      expect(createHash('sha256').update(image).digest('hex')).toBe(reference.sha256);
      expect(reference.sourceUrl).toMatch(/^https:\/\/(www\.)?(rangcha\.com|coca-cola\.com|nongfuspring\.com)\//);
      expect(reference.imageUrl).toMatch(/^https:\/\//);
      expect(reference.market).toBe('中国大陆');
      expect(reference.width).toBeGreaterThan(0);
      expect(reference.height).toBeGreaterThan(0);
    }
    const complete = readFileSync(new URL('../../../public/research-case/qingyu-packrefs-20261110/coke-share-03.jpg', import.meta.url));
    expect(createHash('sha256').update(complete).digest('hex')).toBe('96759d427d8c63f99fc381a3d74e5d704eb810cb09a7ca87f37241fb5807764e');
  });

  it('explains invalid direction, part and version links without pretending a visual version exists', async () => {
    const result = resolveQingyuThemesPreview(await data());
    const html = render(createElement(QingyuVisualResultView, { result, retry: () => {} }), 'dir=A&part=unknown&version=7');
    expect(html).toContain('未找到链接指定的文案方向');
    expect(html).toContain('未找到链接指定的视图');
    expect(html).toContain('没有可核对的视觉稿版本');
    expect(html).toContain('当前显示“当前稿”');
    expect(html).not.toMatch(/data-reference-detail/);
    expect(html).toContain('/visual-concepts/qingyu-20261110/n7-main.png');
    expect(html).toContain('data-visual-direction="n7"');
    expect(html).not.toContain('精修第 7 版');
  });

  it.each(['historical', 'no-current'])('keeps %s basis visible before every layout', async context => {
    const input = await data();
    if (context === 'no-current') input.history.current = null;
    else {
      if (!input.history.current) throw new Error('Current brief required');
      input.history.current = { ...input.history.current, id: 'brf-qingyu-v2', version: 2 };
    }
    const result = resolveQingyuThemesPreview(input);
    expect(result.kind).toBe('historical');
    for (const part of ['current', 'process', 'compare']) {
      const html = render(createElement(QingyuVisualResultView, { result, retry: () => {} }), `part=${part}`);
      expect(html).toContain('data-visual-context="historical"');
      expect(html.indexOf('历史依据预览')).toBeLessThan(html.indexOf('role="tablist"'));
      expect(html).toContain(context === 'no-current' ? '当前任务卡缺失' : '最新任务卡为第 2 版');
    }
  });

  it('rejects invalid evidence without leaking copy or layout', async () => {
    const input = await data();
    input.history.project.revision += 1;
    const result = resolveQingyuThemesPreview(input);
    expect(result.kind).toBe('unavailable');
    const html = render(createElement(QingyuVisualResultView, { result, retry: () => {} }));
    expect(html).toContain('重新核对依据');
    expect(html).not.toMatch(/data-visual-direction|pw-branches|精修主图图位|两张名片/);
  });

  it('enters only the exact empty Qingyu case and keeps formal visual rendering first', () => {
    expect(render(createElement(VisualStage, { proposal: qingyuProposal }))).toContain('data-visual-preview');
    for (const proposal of [{ ...qingyuProposal, id: 'other' }, { ...qingyuProposal, workbenchId: 'other' }, { ...qingyuProposal, type: 'kv' } satisfies typeof qingyuProposal, { ...qingyuProposal, themes: northline.themes }]) {
      const html = render(createElement(VisualStage, { proposal }));
      expect(html).not.toContain('data-visual-preview');
      expect(html).toContain('pw-empty');
    }
    for (const proposal of [northline, plumtide, { ...qingyuProposal, visual: northline.visual }]) {
      const html = render(createElement(VisualStage, { proposal }));
      expect(html).not.toContain('data-visual-preview');
      expect(html).toContain('pw-visual');
    }
  });

  it.each(['research', 'brief'])('protects initial failure, loading and cached refresh for %s', query => {
    const researchSuccess = researchQuery, briefSuccess = briefQuery;
    if (query === 'research') researchQuery = { ...researchQuery, status: 'loading', data: undefined };
    else briefQuery = { ...briefQuery, status: 'loading', data: undefined };
    const loading = render(createElement(VisualStage, { proposal: qingyuProposal }));
    expect(loading).toContain('正在核对研究与任务卡');
    expect(loading).not.toContain('data-visual-preview');
    if (query === 'research') researchQuery = { ...researchQuery, status: 'error', error: serviceError };
    else briefQuery = { ...briefQuery, status: 'error', error: serviceError };
    const error = render(createElement(VisualStage, { proposal: qingyuProposal }));
    expect(error).toContain('读取失败');
    expect(error).toContain('重新核对依据');
    expect(error).not.toContain('data-visual-preview=');
    researchQuery = researchSuccess; briefQuery = briefSuccess;
    if (query === 'research') researchQuery = { ...researchQuery, refreshing: true };
    else briefQuery = { ...briefQuery, refreshing: true };
    const refreshing = render(createElement(VisualStage, { proposal: qingyuProposal }));
    expect(refreshing).toContain('上次成功读取的依据');
    expect(refreshing).toContain('data-visual-preview');
    if (query === 'research') researchQuery = { ...researchQuery, refreshing: false, refreshError: serviceError };
    else briefQuery = { ...briefQuery, refreshing: false, refreshError: serviceError };
    const stale = render(createElement(VisualStage, { proposal: qingyuProposal }));
    expect(stale).toContain('刷新失败');
    expect(stale).toContain('重试读取依据');
    expect(stale).toContain('data-visual-preview');
  });
});
