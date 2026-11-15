import type { BotStatus } from '../types';

/**
 * 提案主理人：一张折了角的稿纸。
 * 每种状态有自己的表情和动作（动画在 styles/motion.css）：
 *   待命 idle     轻轻呼吸、偶尔眨眼
 *   工作 working  伏案书写：眼睛来回扫读，铅笔沿页脚写字，头顶月亮轻晃
 *   等待 waiting  歪头看向你，问号上下跳
 *   完成 done     原地小跳，头顶太阳转动
 *   中断 blocked  摇头，感叹号闪烁
 */

const ink = { stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const thin = { ...ink, strokeWidth: 1.6 };

function Face({ state }: { state: BotStatus['state'] }) {
  const nose = <path d="M40 62 l4 5 l4 -5" {...thin} />;
  switch (state) {
    case 'working':
      return (
        <g>
          <g className="bot-eyes bot-scan"><path d="M26 52 h10" {...ink} /><path d="M52 52 h10" {...ink} /></g>
          {nose}
          <path className="bot-scribble" d="M26 80 q4 -5 8 0 t8 0 t8 0 t8 0" {...thin} pathLength={100} />
          <g className="bot-pencil">
            <path d="M26 79 l3 -9 l4 1.4 l-3 9 z" fill="var(--paper)" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M26 79 l0.6 -2.6 l2 0.7 z" fill="currentColor" />
          </g>
        </g>
      );
    case 'waiting':
      return (
        <g>
          <circle cx="33" cy="52" r="4.5" {...ink} /><circle cx="59" cy="52" r="4.5" {...ink} />
          <g className="bot-pupils"><circle cx="34" cy="52" r="1.7" fill="currentColor" /><circle cx="60" cy="52" r="1.7" fill="currentColor" /></g>
          {nose}
          <path d="M38 78 h12" {...thin} />
        </g>
      );
    case 'done':
      return (
        <g>
          <path d="M27 54 q5 -7 10 0" {...ink} /><path d="M51 54 q5 -7 10 0" {...ink} />
          {nose}
          <path d="M32 75 q12 9 24 0" {...thin} />
        </g>
      );
    case 'blocked':
      return (
        <g>
          <path d="M28 48 l8 8 M36 48 l-8 8" {...ink} /><path d="M52 48 l8 8 M60 48 l-8 8" {...ink} />
          {nose}
          <path d="M34 79 q10 -6 20 0" {...thin} />
        </g>
      );
    default:
      return (
        <g>
          <g className="bot-eyes"><circle cx="32" cy="52" r="2.4" fill="currentColor" /><circle cx="56" cy="52" r="2.4" fill="currentColor" /></g>
          {nose}
          <path d="M36 77 q8 4 16 0" {...thin} />
        </g>
      );
  }
}

export function BotFigure({ state, size = 96 }: { state: BotStatus['state']; size?: number }) {
  return (
    <svg className={`bot-figure bot-${state}`} viewBox="0 0 96 112" width={size} height={(size * 112) / 96} aria-hidden="true">
      <ellipse className="bot-shadow" cx="46" cy="108" rx="34" ry="2.4" fill="currentColor" opacity="0.14" />
      <g className="bot-all">
        {state === 'working' && <path className="bot-moon" d="M70 6 a9 9 0 1 0 9 12 a7 7 0 0 1 -9 -12 Z" fill="var(--orange)" />}
        {state === 'done' && (
          <g className="bot-sun" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round">
            <circle cx="74" cy="12" r="4.5" fill="var(--orange)" stroke="none" />
            <path d="M74 3 v2 M74 19 v2 M65 12 h2 M81 12 h2 M67.6 5.6 l1.4 1.4 M79 17 l1.4 1.4 M80.4 5.6 l-1.4 1.4 M69 17 l-1.4 1.4" />
          </g>
        )}
        {state === 'waiting' && <text className="bot-mark" x="70" y="19" fontFamily="var(--mono)" fontWeight="600" fontSize="18" fill="var(--orange)">?</text>}
        {state === 'blocked' && <text className="bot-bang" x="72" y="19" fontFamily="var(--mono)" fontWeight="600" fontSize="18" fill="var(--orange)">!</text>}
        {/* 稿纸身体，右上折角 */}
        <path d="M6 24 H68 L86 42 V104 H6 Z" fill="var(--paper)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M68 24 V42 H86" fill="var(--paper-2)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <Face state={state} />
        {state !== 'working' && <path d="M16 96 h18" stroke="currentColor" strokeWidth="1.4" opacity="0.3" />}
      </g>
    </svg>
  );
}

export function BotCard({ bot, onPoke }: { bot: BotStatus; onPoke?: () => void }) {
  const live = bot.state === 'working' || bot.state === 'waiting' || bot.state === 'blocked';
  return (
    <div className="bot-card">
      {onPoke ? (
        <button type="button" className="bot-poke" onClick={onPoke} title="再庆祝一次" aria-label="再庆祝一次">
          <BotFigure state={bot.state} />
        </button>
      ) : (
        <BotFigure state={bot.state} />
      )}
      <div className={`bot-bubble is-${bot.state}`} role="status">
        <div className="bot-bubble-label">
          {bot.state !== 'done' && <span className={`dot ${live ? 'dot-live' : ''}`} />}
          {bot.label}
        </div>
        <div className="bot-bubble-detail">{bot.detail}</div>
      </div>
    </div>
  );
}
