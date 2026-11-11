import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createServices } from './services';
import { applyTheme, readTheme } from './app/theme';
import './styles/fonts.css';
import './styles/app.css';
import './styles/dashboard.css';
import './styles/overview.css';
import './styles/archive.css';
import './styles/modules.css';
import './styles/intake.css';
import './styles/workbot.css';
import './styles/proposal.css';
import './styles/bento.css';
import './styles/cobalt.css';
import './styles/stages.css';
import './styles/slides.css';
import './styles/areas.css';
import './styles/frames.css';
import './styles/palette.css';
import './styles/refine.css';
import './styles/experience.css';
import './styles/workspace-refine.css';
import './styles/collaboration.css';

// Apply the saved colour mode before the first paint so there is no flash.
applyTheme(readTheme());

const services = createServices();
// The single-file build runs inside hosts that own the URL, so it keeps routes in memory.
const routerMode = import.meta.env.MODE === 'singlefile' ? 'memory' : 'hash';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App services={services} routerMode={routerMode} />
  </StrictMode>,
);
