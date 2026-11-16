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
  clock,
  encodeFile,
  endpoint,
  projectStatus,
  type Action,
  type Project,
  type Summary,
} from './live';
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
  const stageParam = new URLSearchParams(query).get('stage');
  const requestedStage = stageParam === 'research' || stageParam === 'brief' || stageParam === 'strategy' || stageParam === 'layout' ? stageParam : undefined;
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
    setLibrary(false);
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
  }, [id, reload, requestedStage]);
  useEffect(() => {
    if (!workspace || !p) return;
    if (p.status === 'waiting' && p.stage !== 'research' && lastStatus.current !== 'waiting') setChat(true);
    if (p.status === 'done' && lastStatus.current && lastStatus.current !== 'done') {
      setParty(true);
      setNotice(true);
    }
    lastStatus.current = p.status;
    if (chat) mark(p.events.length);
  }, [workspace, p, chat]);
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
  async function act(kind: Action, text: string, files?: File[]) {
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
        expectedRevision:
          kind === 'choice' || kind === 'adopt' || kind === 'research_again' || kind === 'research_continue' ? p.revision : undefined,
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
  const events = (workspace ? p.events : []).map((e, i) => ({
    id: String(i),
    seq: i,
    at: clock(e.at),
    text: e.text,
    stageId: e.stage,
    kind: 'info' as const,
    simulated: false,
  }));
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
        events={events}
        expanded={log && workspace}
        onToggle={() => setLog(!log)}
        mode={workspace ? p.mode : null}
        live={workspace && p.status === 'running'}
        idleText="就绪。把 Brief 交给我。"
        status={workspace ? projectStatus(p) : undefined}
      />
      <TopBar
        projectTitle={workspace ? p.title : undefined}
        inWorkspace={workspace}
        onHome={() => navigate('/')}
        chatOpen={chat}
        onToggleChat={() => setChat(!chat)}
        onReset={newProject}
        onLibrary={() => {
          setLibrary(true);
          open(undefined);
        }}
        unread={!!p && p.events.length > seen}
      />
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
      {!id && !start && !mode && (
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
              openResearch={() => openDetail('research')}
              p={p}
              projects={projects}
              close={() => setChat(false)}
              act={act}
              busy={busy}
            />
          ) : (
            <button className="chat-fab" onClick={() => setChat(true)} aria-label="打开与主理人的对话">
              <Icon name="chat" size={26} />
            </button>
          )}
        </div>
      )}
      {party && workspace && <Celebration onDone={endParty} />}
    </div>
  );
}
