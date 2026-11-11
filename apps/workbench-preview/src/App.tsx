import {BriefRecoveryPanel} from './app/BriefRecoveryPanel';
import { useEffect, useRef } from 'react';
import { CloudOff, Sun } from 'lucide-react';
import type { Services } from './services';
import { ConfirmProvider } from './app/confirm';
import { DemoIndicator } from './app/DemoPanel';
import { FeedbackProvider } from './app/feedback';
import { useTheme } from './app/theme';
import { Link, RouterProvider, useRouter } from './app/router';
import { ServiceProvider, useServiceContext } from './app/services';
import { I18nProvider, useI18n } from './i18n';
import { StatePanel } from './ui/kit';
import { DevView } from './views/DevView';
import { HomeView } from './views/HomeView';
import { NewProjectView } from './views/NewProjectView';
import { ProjectWorkspace } from './views/ProjectWorkspace';
import { WorkBot } from './workbot/WorkBot';
import { WorkBotProvider } from './workbot/context';
import { TeamProvider, useTeam } from './collaboration/context';
import { PermissionNotice, TeamTools } from './collaboration/TeamTools';

export function App({ services, routerMode }: { services: Services; routerMode: 'hash' | 'memory' }) {
  return (
    <TeamProvider store={services.team}>
    <ServiceProvider service={services.workbench} intake={services.intake} assistant={services.assistant} proposals={services.proposals}>
      <I18nProvider>
        <ConfirmProvider>
          <RouterProvider mode={routerMode}>
            <FeedbackProvider>
              <WorkBotProvider>
                <Shell />
              </WorkBotProvider>
            </FeedbackProvider>
          </RouterProvider>
        </ConfirmProvider>
      </I18nProvider>
    </ServiceProvider>
    </TeamProvider>
  );
}

function ThemeSwitcher() {
  const { t } = useI18n();
  const [choice, setChoice] = useTheme();
  return <label className="team-theme-select"><Sun size={14} aria-hidden="true" /><span className="sr-only">{t('shell.theme')}</span><select value={choice} aria-label={t('shell.theme')} onChange={event => {
    const value = event.target.value;
    if (value === 'auto' || value === 'light' || value === 'dark') setChoice(value);
  }}><option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>;
}

function Shell() {
  const { t } = useI18n();
  const { route, path } = useRouter();
  const { demoState } = useServiceContext();
  const { snapshot, can } = useTeam();
  const mainRef = useRef<HTMLElement>(null);
  const firstPath = useRef(path);

  // Move focus to the new page heading after in-app navigation, for keyboard and screen reader users.
  useEffect(() => {
    if (path === firstPath.current) return;
    firstPath.current = path;
    const frame = requestAnimationFrame(() => {
      const heading = mainRef.current?.querySelector<HTMLElement>('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [path]);

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        {t('shell.skip')}
      </a>
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand" aria-label={t('shell.brandLabel')}>
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path d="M5 4h9l5 5v11H5z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M14 4v5h5M8 13h8M8 16.5h5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
            <span className="brand__name">提案工作台</span>
          </Link>
          <div className="topbar__tools">
            <TeamTools />
            <ThemeSwitcher />
            <DemoIndicator />
          </div>
        </div>
      </header>
      {snapshot.actor.role === 'guest' && <p className="team-readonly-banner" role="status">游客只读 · 可以查看提案和历史，不能编辑、评论或交流。</p>}
      {demoState?.storageWarning && (
        <p className="banner banner--global" data-tone="warn" role="status">
          <CloudOff size={16} aria-hidden="true" /> {demoState.storageWarning}
        </p>
      )}
      <main id="main" ref={mainRef} tabIndex={-1} className="main">
        <BriefRecoveryPanel />
        {route.name === 'dashboard' && <HomeView />}
        {route.name === 'dev' && <DevView />}
        {route.name === 'new' && (can({ kind: 'manage' }) ? <NewProjectView /> : <div className="page"><h1>新建提案</h1><PermissionNotice action={{ kind: 'manage' }} /><Link className="btn btn--secondary" to="/">返回全部提案</Link></div>)}
        {route.name === 'project' && <ProjectWorkspace key={`${route.projectId}:${snapshot.actor.id}`} projectId={route.projectId} view={route.view} artifactId={route.artifactId} stage={route.stage} />}
        {route.name === 'not_found' && (
          <div className="page">
            <StatePanel kind="unavailable" title={t('shell.notFound')} action={<Link className="btn btn--secondary" to="/">{t('common.backToProjects')}</Link>}>
              <p>{t('shell.notFoundBody', { path: route.path })}</p>
            </StatePanel>
          </div>
        )}
      </main>
      <WorkBot />
    </div>
  );
}
