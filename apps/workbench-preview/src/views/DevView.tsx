import { DemoControls } from '../app/DemoPanel';
import { useServiceContext } from '../app/services';
import { useT } from '../i18n';
import { Backed } from '../proposal/ui';
import { TeamDemoControls } from '../collaboration/TeamTools';

/** Development-only area: demo scenarios and reset. Not part of the product a client sees. */
export function DevView() {
  const t = useT();
  const { demo } = useServiceContext();
  return (
    <div className="page pw-page">
      <p className="pw-kicker">{t('pw.dev.kicker')}</p>
      <h1 className="pw-h1">{t('pw.dev.title')}</h1>
      <p className="pw-lede">{t('pw.dev.lede')}</p>
      <TeamDemoControls />
      <div className="card stack">{demo ? <DemoControls /> : <p className="muted">{t('pw.dev.none')}</p>}</div>
      <section className="card stack pw-dev-legend" aria-labelledby="dev-legend">
        <h2 id="dev-legend" className="card__title">
          {t('pw.whatsReal')}
        </h2>
        <ul>
          <li>
            <Backed as="connected" /> {t('pw.legend.connected')} {t('pw.dev.connectedList')}
          </li>
          <li>
            <Backed as="prototype" /> {t('pw.legend.prototype')} {t('pw.dev.prototypeList')}
          </li>
          <li>
            <Backed as="planned" /> {t('pw.legend.planned')} {t('pw.dev.plannedList')}
          </li>
        </ul>
      </section>
    </div>
  );
}
