import {ServiceError} from '../../domain/service';

import type {PendingBriefWrite, PendingWriteKind} from '../../domain/service';

export function pendingWriteKind(path: string, body: Record<string, unknown>): PendingWriteKind {
  if (/^\/projects\/[A-Za-z0-9-]+\/documents\/[A-Za-z0-9_.:-]+\/extraction$/.test(path)) return 'extract_original';
  if (path === '/projects') return 'create_project';
  const suffix = /^\/projects\/[A-Za-z0-9-]+\/(commands|sources|research-jobs|research-verification|research-readiness|research-handoffs|research-release|documents|research-questions|research-readers|research-reader-reconciliations|research-revisions|research-reader-dispositions)$/.exec(path)?.[1];
  switch (suffix) {
    case 'commands': if (body.kind === 'revise-task-card') return 'save_brief'; if (body.kind === 'confirm-task-card') return 'confirm_brief'; break;
    case 'research-revisions': return 'revise_research';
    case 'research-reader-dispositions': return 'dispose_reader';
    case 'research-questions': return 'register_research_questions';
    case 'research-readers': return 'read_research';
    case 'research-reader-reconciliations': return 'reconcile_reader';
    case 'documents': return 'upload_original';
    case 'sources': return 'add_source';
    case 'research-jobs': return 'generate_research';
    case 'research-verification': return 'verify_research';
    case 'research-readiness': return 'review_readiness';
    case 'research-handoffs': return 'record_handoff';
    case 'research-release': return 'release_research';
  }
  throw new ServiceError('validation', '未决提交不是受限简报或研究操作。');
}
export const pendingWriteLabels: Record<PendingWriteKind, string> = {extract_original:'解析PDF原件',create_project: '新建提案', save_brief: '保存简报', confirm_brief: '确认简报', add_source: '登记来源', generate_research: '开始研究', verify_research: '核验研究事实', review_readiness: '核验研究有效性', record_handoff: '提交研究交接', release_research: '放行研究', upload_original: '保存资料原件', register_research_questions:'登记研究问题', read_research:'开始独立首读', reconcile_reader:'核对原读者结果', revise_research:'按读者问题修订研究', dispose_reader:'保存逐项处理'};

export class BriefWriteJournal {
  private cached: PendingBriefWrite | null = null;
  private serialized: string | null = null;
  private cachedKey = '';
  constructor(private readonly key: () => string, private readonly storage: () => Storage) {}
  getPending = (): PendingBriefWrite | null => {
    try {
      const key = this.key(), raw = this.storage().getItem(key);
      if (raw === this.serialized && key === this.cachedKey) return this.cached;
      let pending: PendingBriefWrite | null = null;
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || !('path' in value) || !('body' in value) || !('commandId' in value) || !('label' in value)
          || typeof value.path !== 'string' || typeof value.body !== 'string' || typeof value.commandId !== 'string' || typeof value.label !== 'string') throw new Error('Invalid journal');
        const body: unknown = JSON.parse(value.body);
        if (!body || typeof body !== 'object' || Array.isArray(body) || !('commandId' in body) || body.commandId !== value.commandId) throw new Error('Invalid command identity');
        const kind = pendingWriteKind(value.path, Object.fromEntries(Object.entries(body)));
        pending = {kind, path: value.path, body: value.body, commandId: value.commandId, label: pendingWriteLabels[kind]};
      }
      this.cachedKey = key; this.serialized = raw; this.cached = pending;
      return pending;
    } catch { throw new ServiceError('unavailable', '未决简报记录无法读取，请保留当前浏览器数据并检查会话存储。'); }
  };
  checkCapacity(body: string): void {
    const storage = this.storage(), key = `${this.key()}:capacity-probe`, previous = storage.getItem(key);
    try {storage.setItem(key, body);}
    catch {throw new ServiceError('unavailable', '浏览器无法保留这份原件的刷新恢复记录，请选择较小文件；本次未发送。');}
    finally {if (previous === null) storage.removeItem(key); else storage.setItem(key, previous);}
  }
  begin(pending: PendingBriefWrite): void {
    const previous = this.getPending();
    if (previous && (previous.commandId !== pending.commandId || previous.path !== pending.path || previous.body !== pending.body)) throw new ServiceError('unavailable', '上次简报提交尚待核对，请先处理页面上方的未决提交。', {outcomeUnknown: true});
    try { this.storage().setItem(this.key(), JSON.stringify(pending)); }
    catch { throw new ServiceError('unavailable', '无法保存刷新恢复记录，本次未发送，请检查会话存储。'); }
    this.getPending();
  }
  clear(commandId: string): void {
    if (this.getPending()?.commandId !== commandId) return;
    try { this.storage().removeItem(this.key()); }
    catch { throw new ServiceError('unavailable', '结果已返回，但未决记录清理失败，请保留原命令核对。', {outcomeUnknown: true}); }
    this.getPending();
  }
}
