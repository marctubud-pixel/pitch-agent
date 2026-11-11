import { useSyncExternalStore } from 'react';
import { isPresentationLocalTime } from '../domain/presentationTime';

const DEMO_DEADLINES: Record<string, string> = { 'northline-kv': '2026-11-15' };

function subscribe(refresh: () => void) {
  window.addEventListener('storage', refresh);
  window.addEventListener('project-deadline', refresh);
  return () => {
    window.removeEventListener('storage', refresh);
    window.removeEventListener('project-deadline', refresh);
  };
}

export function HomeDeadline({ id, presentationLocalTime }: { id: string; presentationLocalTime?: string }) {
  const key = 'proposal-workbench/deadline/' + id;
  const stored = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
  });
  const proposalDate = isPresentationLocalTime(presentationLocalTime) ? presentationLocalTime.slice(0, 10) : '';
  const value = proposalDate || stored || DEMO_DEADLINES[id] || '';
  const example = !proposalDate && !stored && Boolean(DEMO_DEADLINES[id]);
  const now = new Date();
  const day = Date.parse(value + 'T00:00:00Z');
  const date = Number.isFinite(day) ? new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'UTC', month: 'long', day: 'numeric',
    year: new Date(day).getUTCFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }).format(day) : '';
  const label = date ? `${date}截稿` : '截稿时间待定';

  return <span className="home-deadline">
    <span>{label}</span>
    {example && <small title="用于预览的默认截稿日期">示例日期</small>}
  </span>;
}
