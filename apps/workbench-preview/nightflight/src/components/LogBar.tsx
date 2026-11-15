import { useEffect, useRef } from 'react';
import type { ExecutionEvent, Mode, StageId } from '../types';
import { STAGE_BY_ID } from '../data/project';

/**
 * 顶部黑色执行记录。
 * 默认只显示最近几行；展开后按时间顺序列出完整路径，并按阶段分段。
 * 事件来自 ExecutionEvent[]，将来可直接换成真实执行事件。
 */

interface Props {
  events: ExecutionEvent[];
  expanded: boolean;
  onToggle: () => void;
  mode: Mode | null;
  live: boolean;
  idleText: string;
  status?: string;
}

const MARK: Record<ExecutionEvent['kind'], string> = {
  info: '>',
  deliver: '+',
  check: '✓',
  decision: '?',
  error: '✕',
  done: '■',
};

const VISIBLE = 5;

export function LogBar({ events, expanded, onToggle, mode, live, idleText, status }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [expanded, events.length]);

  const hasEvents = events.length > 0;
  const tail = events.slice(-VISIBLE);
  const pad = Math.max(0, VISIBLE - Math.max(tail.length, 1));
  const modeLabel = mode === 'auto' ? '全自动 · SURPRISE ME' : mode === 'collab' ? '协作 · IDEA' : null;

  let lastStage: StageId | null = null;

  return (
    <section className={`log ${expanded ? 'is-expanded' : ''}`} aria-label="执行记录">
      <div className="log-inner">
        {!expanded && (
          <div
            className="log-tail"
            onClick={hasEvents ? onToggle : undefined}
            role={hasEvents ? 'button' : undefined}
            tabIndex={hasEvents ? 0 : undefined}
            onKeyDown={(e) => {
              if (hasEvents && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onToggle();
              }
            }}
            aria-label={hasEvents ? '展开完整执行记录' : undefined}
          >
            {Array.from({ length: pad }, (_, i) => (
              <div className="log-line is-empty" key={`p${i}`}>
                <span className="log-mark">&gt;</span>
              </div>
            ))}
            {!hasEvents && (
              <div className="log-line">
                <span className="log-mark">&gt;</span>
                <span className="log-text">{idleText}</span>
              </div>
            )}
            {tail.map((e, i) => {
              const current = i === tail.length - 1;
              return (
                <div className={`log-line kind-${e.kind} ${current ? 'is-current' : ''}`} key={e.id}>
                  <span className="log-mark">{MARK[e.kind]}</span>
                  <span className="log-text">{e.text}</span>
                  {current && live && <span className="log-cursor" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        )}

        {expanded && (
          <div className="log-full">
            <div className="log-full-head">
              <span>执行记录</span>
              <span className="log-count">{events.length} 条</span>
              <span className="tag-demo on-dark">本地执行</span>
              {status && <span className="log-status">当前：{status}</span>}
            </div>
            <div className="log-scroll" ref={scroller}>
              {events.map((e, i) => {
                const head = e.stageId !== lastStage;
                lastStage = e.stageId;
                const stage = STAGE_BY_ID[e.stageId];
                const current = i === events.length - 1;
                return (
                  <div key={e.id}>
                    {head && (
                      <div className="log-stage">
                        ── {stage.index} {stage.name} ──
                      </div>
                    )}
                    <div className={`log-line kind-${e.kind} ${current ? 'is-current' : ''}`}>
                      <span className="log-time">{e.at}</span>
                      <span className="log-mark">{MARK[e.kind]}</span>
                      <span className="log-text">{e.text}</span>
                      {current && live && <span className="log-cursor" aria-hidden="true" />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="log-legend">
              &gt; 进行　+ 交付物　✓ 阶段检查　? 等待决定　✕ 中断　■ 完成　　本机时间
            </div>
          </div>
        )}

        <div className="log-side">
          {modeLabel && <span className="log-mode">{modeLabel}</span>}
          {hasEvents && (
            <button type="button" className="log-toggle" onClick={onToggle} aria-expanded={expanded}>
              {expanded ? '收起记录 ▴' : '展开记录 ▾'}
            </button>
          )}
          {!expanded && hasEvents && <span className="tag-demo on-dark">本地</span>}
        </div>
      </div>
    </section>
  );
}
