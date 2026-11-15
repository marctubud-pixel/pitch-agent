import { STAGES } from '../data/project';
import { BotFigure } from './Bot';
import { Icon } from './Icon';

/**
 * 首页：说明产品是什么，再把人带进"交 Brief"的入口。
 * 主视觉是代码绘制的夜间办公室：整层楼都暗着，只有主理人的那盏灯亮着。
 */

function NightOffice() {
  // 远处的楼：一排排暗着的窗，零星几扇亮着
  const cols = 30, rows = 7;
  return (
    <svg className="hero-art" viewBox="0 0 1440 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="h-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#050505" /><stop offset="1" stopColor="#1d1d1c" /></linearGradient>
        <linearGradient id="h-desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b3a38" /><stop offset="1" stopColor="#121211" /></linearGradient>
        <radialGradient id="h-pool" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#fff" stopOpacity="0.5" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <linearGradient id="h-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.34" /><stop offset="1" stopColor="#fff" stopOpacity="0.02" /></linearGradient>
        <filter id="h-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.16 0" />
        </filter>
      </defs>
      <rect width="1440" height="720" fill="url(#h-sky)" />
      {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
        const k = (r * 7 + c * 13) % 29;
        const lit = k === 3 || k === 17;
        return <rect key={`${r}-${c}`} x={24 + c * 47} y={46 + r * 62} width="33" height="44" fill={lit ? '#8c8a84' : k % 4 === 0 ? '#1a1a19' : '#141413'} opacity={lit ? 0.28 : 1} />;
      }))}
      {/* 隔断与桌面 */}
      <rect x="0" y="470" width="1440" height="250" fill="url(#h-desk)" />
      <rect x="0" y="466" width="1440" height="5" fill="#55534f" />
      {/* 台灯与光 */}
      <path d="M1052 250 L900 560 H1250 Z" fill="url(#h-cone)" />
      <ellipse cx="1075" cy="566" rx="250" ry="44" fill="url(#h-pool)" />
      <path d="M1240 566 V330 L1090 232" fill="none" stroke="#6b6964" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1016 268 L1066 206 L1118 248 Z" fill="#8c8a84" />
      <rect x="1206" y="560" width="70" height="10" rx="3" fill="#6b6964" />
      {/* 桌上的一叠稿纸和杯子 */}
      <path d="M1010 572 h96 l12 10 h-120 z" fill="#d9d6cf" /><path d="M1006 566 h96 l12 10 h-120 z" fill="#f1eee7" />
      <rect x="1150" y="530" width="30" height="36" rx="3" fill="#8c8a84" /><path d="M1180 540 q14 2 0 18" fill="none" stroke="#8c8a84" strokeWidth="4" />
      <rect width="1440" height="720" filter="url(#h-grain)" />
    </svg>
  );
}

const TICKS = [
  { icon: 'log' as const, title: '它在做什么，一眼看得见', text: '顶部的执行记录逐行写下主理人的每一步，随时可以展开看完整的路径。' },
  { icon: 'layers' as const, title: '成果一件件出现', text: '任务卡、研究、策略、创意方向、主视觉、可编辑提案，做完一件，工作区里就多一件。' },
  { icon: 'library' as const, title: '旧稿和参考随手带上', text: '从比稿资料库里挑过往提案，或在提交需求时附上文件，告诉它要参考什么。' },
];

export function Home({ hasProject, onStart, onNew }: { hasProject: boolean; onStart: () => void; onNew: () => void }) {
  return (
    <main className="home">
      <div className="home-band"><span className="dot" />主理人整夜在线：研究、策略、创意、视觉、排版、终审</div>

      <section className="hero">
        <NightOffice />
        <div className="hero-bot"><BotFigure state="working" size={112} /></div>
        <div className="hero-copy">
          <p className="hero-eyebrow">AI 提案工作台 · 本地版</p>
          <h1>把 Brief 交给它，<br />你睡觉时提案还在往前走。</h1>
          <p className="hero-sub">一位提案主理人替你协调研究、策略、文案、视觉、排版和终审。你只和它一个人说话。</p>
          <div className="hero-cta">
            <button type="button" className="btn btn-hero" onClick={onStart}>{hasProject ? '回到当前项目' : '开始一份提案'}<Icon name="arrow" size={18} /></button>
            {hasProject && <button type="button" className="hero-link" onClick={onNew}>或者新建一个项目</button>}
          </div>
        </div>
        <p className="hero-scroll">往下看看它怎么工作</p>
      </section>

      <section className="home-sec">
        <header><p className="mono-label">工作方式</p><h2>一个主理人，七个阶段</h2></header>
        <ol className="home-stages">
          {STAGES.map((s) => (
            <li key={s.id}><span>{String(s.index).padStart(2, '0')}</span><strong>{s.name}</strong><p>{s.summary}</p></li>
          ))}
        </ol>
      </section>

      <section className="home-sec">
        <header><p className="mono-label">两种合作方式</p><h2>全交给它，或者关键处你来定</h2></header>
        <div className="home-modes">
          <div>
            <p className="mono-label">SURPRISE ME</p>
            <h3>全自动模式</h3>
            <p>自动调研会按现有简报取证，遇到关键缺口先补查。策略有据可用后继续推进，三个方向分别生图，由你确认采用。</p>
          </div>
          <div>
            <p className="mono-label">IDEA</p>
            <h3>协作模式</h3>
            <p>协作调研先展示已查到的依据。遇到影响方向的问题，问你一次再补查；到创意阶段，由你选择方向。</p>
          </div>
        </div>
      </section>

      <section className="home-sec">
        <header><p className="mono-label">你会看到</p><h2>不是黑箱，是一张摊开的工作台</h2></header>
        <div className="home-ticks">
          {TICKS.map((t) => (
            <div key={t.title}><Icon name={t.icon} size={26} /><h3>{t.title}</h3><p>{t.text}</p></div>
          ))}
        </div>
      </section>

      <section className="home-end">
        <h2>今晚就交给它。</h2>
        <button type="button" className="btn btn-hero" onClick={onStart}>{hasProject ? '回到当前项目' : '开始一份提案'}<Icon name="arrow" size={18} /></button>
      </section>
      <footer className="home-foot">夜航提案台 · 项目记录保存在这台电脑上</footer>
    </main>
  );
}
