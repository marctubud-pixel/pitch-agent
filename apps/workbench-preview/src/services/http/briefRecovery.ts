import {ServiceError} from '../../domain/service';

import type {PendingBriefWrite} from '../../domain/service';

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
          || typeof value.path !== 'string' || typeof value.body !== 'string' || typeof value.commandId !== 'string' || typeof value.label !== 'string'
          || !(/^\/projects(?:\/[A-Za-z0-9-]+\/commands)?$/.test(value.path))) throw new Error('Invalid journal');
        const body: unknown = JSON.parse(value.body);
        if (!body || typeof body !== 'object' || !('commandId' in body) || body.commandId !== value.commandId) throw new Error('Invalid command identity');
        if (value.path !== '/projects' && (!('kind' in body) || !['revise-task-card', 'confirm-task-card'].includes(String(body.kind)))) throw new Error('Invalid command kind');
        pending = {path: value.path, body: value.body, commandId: value.commandId, label: value.path === '/projects' ? '新建提案' : 'kind' in body && body.kind === 'revise-task-card' ? '保存简报' : '确认简报'};
      }
      this.cachedKey = key; this.serialized = raw; this.cached = pending;
      return pending;
    } catch { throw new ServiceError('unavailable', '未决简报记录无法读取，请保留当前浏览器数据并检查会话存储。'); }
  };
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
