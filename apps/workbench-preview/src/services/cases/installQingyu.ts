import { ServiceError } from '../../domain/service';
import type { KeyValueStore } from '../mock/storage';
import { publishStoreChange, storeTransaction } from '../mock/transactions';
import { qingyuAnchor, qingyuArtifact, qingyuBrief, qingyuProject, qingyuProposal } from './qingyuFixture';

export const caseStorageKeys = { workbench: 'proposal-workbench/demo/db/zh-desktop-v1', proposal: 'proposal-workbench/demo/proposals/zh-desktop-v1' };
export const qingyuInstallMarker = 'qingyu-pack-20261109-v1';
type StoreKind = keyof typeof caseStorageKeys;
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function object(value: unknown): Record<string, unknown> { if (!isObject(value)) throw invalidStore(); return value; }
function invalidStore() { return new ServiceError('unavailable', '本地资料格式损坏或版本不支持，未写入示例。请保留原数据后重试。', { retryable: true }); }
const dbLists = ['projects', 'briefs', 'briefAttachments', 'sources', 'claims', 'artifacts', 'reviews', 'handoffs', 'jobs', 'images', 'observations', 'activity'];
export function readCaseStore(store: KeyValueStore, kind: StoreKind): Record<string, unknown> | null {
  const raw = store.get(caseStorageKeys[kind]);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw); const root = object(value);
    if (root.caseInstallations !== undefined && (!Array.isArray(root.caseInstallations) || !root.caseInstallations.every(v => typeof v === 'string'))) throw invalidStore();
    if (kind === 'workbench') {
      if (root.schemaVersion !== 6 || typeof root.catalogRevision !== 'number' || dbLists.some(key => !Array.isArray(root[key]) || !root[key].every(isObject)) || !isObject(root.commands) || !isObject(root.imageMeta) || !isObject(root.strategyTemplates)) throw invalidStore();
    } else if (root.schema !== 4 || !isObject(root.data) || Object.values(root.data).some(v => !isObject(v) || typeof v.id !== 'string' || typeof v.workbenchId !== 'string')) throw invalidStore();
    return root;
  } catch (error) { if (error instanceof ServiceError) throw error; throw invalidStore(); }
}
function marked(root: Record<string, unknown> | null) { return root !== null && Array.isArray(root.caseInstallations) && root.caseInstallations.includes(qingyuInstallMarker); }
function records(root: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = root[key]; if (!Array.isArray(value)) throw invalidStore(); return value.map(object);
}
function occupiedWorkbench(root: Record<string, unknown> | null) {
  if (!root || marked(root)) return false;
  return dbLists.some(key => records(root, key).some(v => v.projectId === 'qingyu' || v.id === 'qingyu' || v.id === qingyuAnchor.briefId || v.id === qingyuAnchor.artifactId || v.lineageId === qingyuAnchor.lineageId))
    || Object.keys(object(root.imageMeta)).includes('qingyu') || Object.keys(object(root.strategyTemplates)).includes('qingyu');
}
function occupiedProposal(root: Record<string, unknown> | null) {
  if (!root || marked(root)) return false;
  return Object.entries(object(root.data)).some(([key, v]) => key === qingyuAnchor.proposalId || object(v).id === qingyuAnchor.proposalId || object(v).workbenchId === 'qingyu');
}
export async function installQingyu({ store, kind, fallback }: { store: KeyValueStore; kind: StoreKind; fallback: () => unknown }): Promise<void> {
  const key = caseStorageKeys[kind];
  await storeTransaction(store, key, () => {
    const own = readCaseStore(store, kind);
    if (marked(own)) return;
    const workbench = kind === 'workbench' ? own : readCaseStore(store, 'workbench');
    const proposal = kind === 'proposal' ? own : readCaseStore(store, 'proposal');
    if (occupiedWorkbench(workbench) || occupiedProposal(proposal)) throw new ServiceError('conflict', '青屿示例身份已被本地记录占用，原数据保持不变。请保留原记录后核对。');
    const root = own ?? object(fallback());
    const markers = root.caseInstallations === undefined ? [] : root.caseInstallations;
    if (!Array.isArray(markers)) throw invalidStore();
    let next: Record<string, unknown>;
    if (kind === 'workbench') next = { ...root, catalogRevision: typeof root.catalogRevision === 'number' ? root.catalogRevision + 1 : 1, projects: [...records(root, 'projects'), structuredClone(qingyuProject)], briefs: [...records(root, 'briefs'), structuredClone(qingyuBrief)], artifacts: [...records(root, 'artifacts'), structuredClone(qingyuArtifact)], caseInstallations: [...markers, qingyuInstallMarker] };
    else next = { ...root, data: { ...object(root.data), [qingyuAnchor.proposalId]: structuredClone(qingyuProposal) }, caseInstallations: [...markers, qingyuInstallMarker] };
    try { store.set(key, JSON.stringify(next)); }
    catch { throw new ServiceError('unavailable', '青屿示例安装未完成，原记录保留，可重试读取。', { retryable: true }); }
    publishStoreChange(store, key);
  });
}
