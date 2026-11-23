import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { LogBar } from './components/LogBar';
import { TopBar } from './components/TopBar';
import { Home } from './components/Home';
import { defaultOutline, type OutlineSelection, StartScreen, ModeScreen } from './components/StartScreen';
import { Workspace } from './components/Workspace';
import { Library } from './components/Library';
import { QingyuStrategyReading } from './components/QingyuStrategyReading';
import { DetailSheet } from './components/DetailSheet';
import { ChatPanel } from './components/ChatPanel';
import { Celebration } from './components/Celebration';
import { Icon } from './components/Icon';
import {
  api,
  encodeFile,
  endpoint,
  type Action,
  type Project,
  type Summary,
} from './live';
import { STAGES } from './data/project';
import { buildExecutionStreams, deriveBotStatus, deriveChatMessages } from './components/stageText';
import type { Mode, StageId } from './types';

const hash = () => location.hash.slice(1);
const navigate = (route: string) => {
  location.hash = route;
};
const QingyuCopyReading = lazy(() => import('./components/QingyuCopyReading'));

const QingyuVisualReading = lazy(() => import('./components/QingyuVisualReading'));

export function App() {
  const [route, setRoute] = useState(hash),
    [projects, list] = useState<Summary[]>([]),
    [p, put] = useState<Project>(),
    [err, error] = useState(''),
    [connection, setConnection] = useState(''),
    [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState(''),
    [files, setFiles] = useState<File[]>([]),
    [outline, setOutline] = useState<OutlineSelection>(defaultOutline),
    draft = useRef(crypto.randomUUID()),
    lock = useRef(false);
  const composerRef = useRef<HTMLInputElement>(null);
  const [chat, setChat] = useState(false),
    [log, setLog] = useState(false),
    [library, setLibrary] = useState(false),
    [detail, open] = useState<{ id: StageId; name?: string }>(),
    [party, setParty] = useState(false);
  const [reload, refresh] = useState(0),
    generation = useRef(0),
    lastStatus = useRef(''),
    [seen, mark] = useState(0),
    [notice, setNotice] = useState(false);
  const [routePath, query] = route.split('?');
  const requestedLibrary = new URLSearchParams(query).get('view') === 'library';
  const stageParam = new URLSearchParams(query).get('stage');
  const requestedStage = stageParam === 'research' || stageParam === 'brief' || stageParam === 'strategy' || stageParam === 'copy' || stageParam === 'layout' ? stageParam : undefined;
  const id = routePath.startsWith('/p/') ? routePath.slice(3) : '',
    workspace = !!id && p?.id === id,
    start = route === '/new',
    mode = route === '/mode' && !!brief;
  useEffect(() => {
    const fn = () => setRoute(hash());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  useEffect(() => {
    let live = true;
    api<{ projects: Summary[] }>('/api/projects')
      .then((d) => {
        if (live) list(d.projects);
      })
      .catch((e) => {
        if (live) error(e.message);
      });
    return () => {
      live = false;
    };
  }, [route, library, reload]);
  useEffect(() => {
    error('');
    setConnection('');
    setLog(false);
    setLibrary(Boolean(id) && requestedLibrary);
    open(id && requestedStage ? { id: requestedStage } : undefined);
    setParty(false);
    setNotice(false);
    lastStatus.current = '';
    mark(0);
    setChat(false);
    if (!id) {
      put(undefined);
      return;
    }
    let alive = true,
      t: number;
    const poll = async () => {
      const g = generation.current;
      try {
        const d = await api<{ project: Project }>(endpoint(id));
        if (alive && g === generation.current) {
          put(d.project);
          setConnection('');
        }
      } catch (e) {
        if (alive && g === generation.current) setConnection(String(e));
      } finally {
        if (alive) t = window.setTimeout(poll, 1800);
      }
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [id, reload, requestedStage, requestedLibrary]);
  useEffect(() => {
    if (!workspace || !p) return;
    const finalDecision = p.stage==='final' && ['ready','blocked'].some(outcome=>p.finalReview?.outcome===outcome);
    if (p.status === 'waiting' && p.stage !== 'research' && !finalDecision && lastStatus.current !== 'waiting') setChat(true);
    if (p.status === 'done' && lastStatus.current && lastStatus.current !== 'done') {
      setParty(true);
      setNotice(true);
    }
    lastStatus.current = p.status;
    if (chat) mark(deriveChatMessages(p).length);
  }, [workspace, p, chat]);
  useEffect(() => {
    if (detail?.id!=='final') return;
    const viewport=window.matchMedia('(max-width: 1000px)');
    const closeOverlay=()=>{if (viewport.matches) setChat(false);};
    viewport.addEventListener('change',closeOverlay);
    return () => viewport.removeEventListener('change',closeOverlay);
  }, [detail?.id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (library) setLibrary(false);
        else if (detail) open(undefined);
        else if (log) setLog(false);
        else setChat(false);
      }
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [library, detail, log]);
  function newProject() {
    setBrief('');
    setFiles([]);
    setOutline(defaultOutline);
    draft.current = crypto.randomUUID();
    navigate('/new');
  }
  async function create(m: Mode) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    error('');
    try {
      const attachments = await Promise.all(files.map(encodeFile));
      const d = await api<{ project: Project }>('/api/projects', {
        id: draft.current,
        brief,
        mode: m,
        ...(outline.kind ? { proposalKind: outline.kind } : {}),
        ...(outline.include.length || outline.singleTouchpoint
          ? { outlineOptions: { include: outline.include, singleTouchpoint: outline.singleTouchpoint } } : {}),
        attachments,
      });
      navigate('/p/' + d.project.id);
    } catch (e) {
      error(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function act(kind: Action, text: string, files?: File[], options?: Parameters<import('./components/ChatPanel').Act>[3]) {
    if (lock.current || !workspace) return false;
    lock.current = true;
    setBusy(true);
    error('');
    generation.current++;
    try {
      const attachments = files?.length ? await Promise.all(files.map(encodeFile)) : undefined;
      const d = await api<{ project: Project }>(endpoint(id) + '/action', {
        kind,
        text,
        attachments,
        ...options,
        expectedRevision:
          kind === 'message' || kind === 'confirm_brief' || kind === 'choice' || kind === 'adopt' || kind === 'render_manuscript' || kind === 'research_again' || kind === 'research_continue' || kind === 'research_digest' || kind === 'accept_final' ? p.revision : undefined,
        opId: crypto.randomUUID(),
      });
      generation.current++;
      if (hash().split('?')[0] === '/p/' + id) put(d.project);
      return true;
    } catch (e) {
      error(String(e));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const endParty = useCallback(() => setParty(false), []);
  const openDetail = (s: StageId, name?: string) => {
    setLibrary(false);
    setLog(false);
    open({ id: s, name });
    if (window.innerWidth <= 1000) setChat(false);
  };
  const streams = workspace ? buildExecutionStreams(p) : { primary: [], all: [] };
  const botStatus = workspace ? deriveBotStatus(p, streams.primary) : undefined;
  const chatMessages = workspace ? deriveChatMessages(p) : [];
  if (routePath === '/reference/qingyu/visual') return (
    <Suspense fallback={<p className="pending">正在读取青屿视觉稿…</p>}>
      <QingyuVisualReading directionId={new URLSearchParams(query).get('dir')} />
    </Suspense>
  );
  if (routePath === '/reference/qingyu/copy') return (
    <Suspense fallback={<p className="pending">正在读取青屿文案…</p>}>
      <QingyuCopyReading edition={new URLSearchParams(query).get('edition')} />
    </Suspense>
  );
  if (routePath === '/reference/qingyu/strategy') return <QingyuStrategyReading />;
  return (
    <div className={'app phase-' + (workspace ? 'workspace' : start ? 'start' : mode ? 'mode' : 'home')}>
      <LogBar
        events={streams.primary}
        allEvents={streams.all}
        expanded={log && workspace}
        onToggle={() => setLog(!log)}
        mode={workspace ? p.mode : null}
        live={workspace && p.status === 'running'}
        idleText="就绪。把 Brief 交给我。"
        status={botStatus ? `${botStatus.label} · ${botStatus.detail}` : undefined}
      />
      <TopBar
        projectTitle={workspace ? p.title : undefined}
        inWorkspace={workspace}
        onHome={() => navigate('/')}
        chatOpen={chat}
        onToggleChat={() => setChat(!chat)}
        onReset={newProject}
        onLibrary={() => {
          if (!workspace) { navigate('/library'); return; }
          setLibrary(true);
          open(undefined);
        }}
        unread={!!p && chatMessages.length > seen}
      />
      {routePath === '/library' && <Library projects={projects} close={() => navigate('/')}
        create={newProject} open={project => navigate('/p/' + project.id)} />}
      {(err || connection) && (
        <div className="live-error" role="alert">
          {err || connection}{' '}
          <button
            className="btn btn-sm"
            onClick={() => {
              error('');
              refresh((n) => n + 1);
            }}
          >
            刷新连接
          </button>
        </div>
      )}
      {routePath !== '/library' && !id && !start && !mode && new URLSearchParams(location.search).has('personal') && (
        <main className="sheet-doc">
          <header className="sheet-head"><h1>我的提案项目</h1>
            <button className="btn btn-dark" onClick={newProject}>新建提案</button>
          </header>
          {projects.length === 0 && <p>暂时没有项目。</p>}
          {projects.map(project => (
            <section className="block" key={project.id}>
              <p className="mono-label">{STAGES.find(stage => stage.id === project.stage)?.name ?? project.stage} · {project.updatedAt && new Date(project.updatedAt).toLocaleDateString('zh-CN')}</p>
              <h2><a href={'#/p/' + project.id}>{project.title}</a></h2>
              <button className="btn" onClick={() => navigate('/p/' + project.id + '?view=library')}>查看项目资料</button>
            </section>
          ))}
        </main>
      )}
      {routePath !== '/library' && !id && !start && !mode && !new URLSearchParams(location.search).has('personal') && (
        <Home
          hasProject={projects.length > 0}
          onStart={() => (projects[0] ? navigate('/p/' + projects[0].id) : newProject())}
          onNew={newProject}
        />
      )}
      {start && (
        <StartScreen
          initialBrief={brief}
          initialFiles={files}
          initialOutline={outline}
          projects={projects}
          onSubmit={(b, f, options) => {
            setOutline(options);
            setBrief(b);
            setFiles(f);
            navigate('/mode');
          }}
        />
      )}
      {mode && (
        <ModeScreen
          brief={brief}
          fileName={null}
          attachments={files}
          onBack={() => navigate('/new')}
          onStart={create}
          busy={busy}
        />
      )}
      {id && !workspace && (
        <main className="entry">
          <div className="entry-box">
            <p>{err || connection ? '无法打开项目。' : '正在读取项目…'}</p>
            <button className="btn" onClick={() => navigate('/')}>
              返回首页
            </button>
          </div>
        </main>
      )}
      {workspace && (
        <div className={'main ' + (chat ? 'has-chat' : '')}>
          <div className="ws">
            <div className="ws-scroll">
              <Workspace
                p={p}
                primaryEvents={streams.primary}
                open={openDetail}
                log={() => setLog(true)}
                chat={() => setChat(true)}
                library={() => {
                  setLibrary(true);
                  open(undefined);
                }}
                celebrate={() => setParty(true)}
              />
            </div>
            {library && (
              <Library
                initialId={p.id}
                projects={projects}
                close={() => setLibrary(false)}
                open={(project) => {
                  setLibrary(false);
                  navigate('/p/' + project.id);
                }}
              />
            )}
            {detail && !library && (
              <DetailSheet
                p={p}
                id={detail.id}
                name={detail.name}
                nav={openDetail}
                correct={() => {
                  setChat(true);
                  requestAnimationFrame(() => composerRef.current?.focus());
                }}
                close={() => open(undefined)}
                act={act}
                busy={busy}
              />
            )}
            {notice && (
              <div className="done-toast" role="status">
                <strong>本地提案已完成</strong>
                <button
                  className="btn"
                  onClick={() => {
                    setNotice(false);
                    openDetail('final');
                  }}
                >
                  查看交付
                </button>
                <button className="toast-x" onClick={() => setNotice(false)} aria-label="关闭提示">
                  ×
                </button>
              </div>
            )}
          </div>
          {chat ? (
            <ChatPanel
              composerRef={composerRef}
              openResearch={() => openDetail('research')}
              openStage={openDetail}
              p={p}
              projects={projects}
              close={() => setChat(false)}
              act={act}
              busy={busy}
            />
          ) : (
            <button className="chat-fab" onClick={() => setChat(true)} aria-label="打开与主理人的对话">
              <Icon name="chat" size={26} />
              {chatMessages.length > seen && <span className="dot dot-live" />}
            </button>
          )}
        </div>
      )}
      {party && workspace && <Celebration onDone={endParty} />}
    </div>
  );
}
