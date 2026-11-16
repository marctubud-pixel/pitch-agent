import { useEffect, useRef, useState } from 'react';
import { PRODUCT_NAME } from '../data/project';
import { Icon } from './Icon';

interface Props {
  projectTitle?: string;
  inWorkspace: boolean;
  onHome: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  onReset: () => void;
  onLibrary: () => void;
  unread: boolean;
}

export function Logo({ onClick }: { onClick?: () => void }) {
  const inner = (
    <>
      <span className="logo-name">{PRODUCT_NAME}</span>
      <span className="logo-sub">提案台</span>
    </>
  );
  return onClick ? (
    <button type="button" className="logo" onClick={onClick} aria-label="回到首页">
      {inner}
    </button>
  ) : (
    <span className="logo">{inner}</span>
  );
}

export function TopBar(p: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Logo onClick={p.onHome} />
        {p.projectTitle && <span className="topbar-project">{p.projectTitle}</span>}
      </div>
      {new URLSearchParams(window.location.search).has("personal") && (
        <form method="post" action="/logout"><button className="btn" type="submit">退出登录</button></form>
      )}
      {p.inWorkspace && (
        <div className="topbar-right">
          <span className="tag-demo">本地工作台</span>
          <button
            type="button"
            className={`btn ${p.chatOpen ? 'is-on' : ''}`}
            onClick={p.onToggleChat}
            aria-pressed={p.chatOpen}
          >
            <Icon name="chat" />
            对话{p.unread && !p.chatOpen && <span className="dot dot-live btn-dot" />}
          </button>
          <div className="menu-wrap" ref={wrap}>
            <button
              type="button"
              className="btn"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <Icon name="menu" />
              菜单
            </button>
            {open && (
              <div className="menu" role="menu">
                <button type="button" role="menuitem" className="menu-item" onClick={run(p.onLibrary)}>
                  <Icon name="library" />
                  比稿资料库
                </button>
                <button type="button" role="menuitem" className="menu-item" onClick={run(p.onHome)}>
                  <Icon name="home" />
                  首页
                </button>
                <div className="menu-sep" />
                <button type="button" role="menuitem" className="menu-item" onClick={run(p.onReset)}>
                  <Icon name="new" />
                  新建项目
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
