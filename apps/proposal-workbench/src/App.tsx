import { useEffect, useRef } from 'react';
import { CloudOff, Languages, Monitor, Moon, Sun } from 'lucide-react';
import type { Services } from './services';
import { ConfirmProvider } from './app/confirm';
import { DemoIndicator } from './app/DemoPanel';
import { FeedbackProvider } from './app/feedback';
import { useTheme, type ThemeChoice } from './app/theme';
import { Link, RouterProvider, useRouter } from './app/router';
import { ServiceProvider, useServiceContext } from './app/services';
import { I18nProvider, LOCALES, useI18n, type Locale } from './i18n';
import { StatePanel } from './ui/kit';
import { DevView } from './views/DevView';
import { HomeView } from './views/HomeView';
import { NewProjectView } from './views/NewProjectView';
import { ProjectWorkspace } from './views/ProjectWorkspace';
import { WorkBot } from './workbot/WorkBot';
import { WorkBotProvider } from './workbot/context';

export function App({ services, routerMode }: { services: Services; routerMode: 'hash' | 'memory' }) {
  return (
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
  );
}

/** Language picker. A native select keeps it keyboard- and screen-reader-friendly everywhere. */
function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const current = LOCALES.find((l) => l.id === locale)!;
  return (
    <label className="lang-pill" title={t('shell.language')}>
      <Languages size={15} aria-hidden="true" />
      <span className="lang-pill__code" aria-hidden="true">
        {current.short}
      </span>
      <span className="sr-only">{t('shell.language')}</span>
      <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
        {LOCALES.map((l) => (
          <option key={l.id} value={l.id} lang={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Colour mode: follow the system (default), or pin light or dark. */
const THEME_OPTIONS: { id: ThemeChoice; Icon: typeof Sun; key: string }[] = [
  { id: 'auto', Icon: Monitor, key: 'shell.themeAuto' },
  { id: 'light', Icon: Sun, key: 'shell.themeLight' },
  { id: 'dark', Icon: Moon, key: 'shell.themeDark' },
];

function ThemeSwitcher() {
  const { t } = useI18n();
  const [choice, setChoice] = useTheme();
  return (
    <div className="theme-switch" role="group" aria-label={t('shell.theme')}>
      {THEME_OPTIONS.map(({ id, Icon, key }) => (
        <button key={id} type="button" className="theme-switch__opt" aria-pressed={choice === id} title={t(key as never)} onClick={() => setChoice(id)}>
          <Icon size={15} aria-hidden="true" />
          <span className="sr-only">{t(key as never)}</span>
        </button>
      ))}
    </div>
  );
}

function Shell() {
  const { t } = useI18n();
  const { route, path } = useRouter();
  const { demoState } = useServiceContext();
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
            <span className="brand__name">Proposal Workbench</span>
          </Link>
          <div className="topbar__tools">
            <LanguageSwitcher />
            <ThemeSwitcher />
            <DemoIndicator />
          </div>
        </div>
      </header>
      {demoState?.storageWarning && (
        <p className="banner banner--global" data-tone="warn" role="status">
          <CloudOff size={16} aria-hidden="true" /> {demoState.storageWarning}
        </p>
      )}
      <main id="main" ref={mainRef} tabIndex={-1} className="main">
        {route.name === 'dashboard' && <HomeView />}
        {route.name === 'dev' && <DevView />}
        {route.name === 'new' && <NewProjectView />}
        {route.name === 'project' && <ProjectWorkspace key={route.projectId} projectId={route.projectId} view={route.view} artifactId={route.artifactId} stage={route.stage} />}
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
