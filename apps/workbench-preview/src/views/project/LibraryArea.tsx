/**
 * Project library: original brief files, supplied material, links, case images, sources and
 * reports. One place for everything the work draws on.
 *
 * Composition, after the supplied references: the header with Patria's big-number tiles; the tabs
 * as folder tabs on one sheet (Floe / Moov folders); supplied material as the Sky Grip picture
 * cards used on the Brief stage; case images as a wall of prints at their own proportions.
 */
import type { CSSProperties } from 'react';
import { ArrowUpRight, FileText, Image as ImageIcon, Link2, MessageSquareQuote } from 'lucide-react';
import { useServiceQuery } from '../../app/query';
import { Link, projectPath } from '../../app/router';
import type { Proposal } from '../../domain/proposal';
import { useT } from '../../i18n';
import { BrandResourceList } from '../../proposal/BrandResources';
import { FolderTabs, useTab } from '../../proposal/Tabs';
import { Backed } from '../../proposal/ui';
import { ArtFrame, naturalRatio } from '../../ui/art/ArtFrame';
import { Embedded, Time } from '../../ui/kit';
import { ImagesView } from '../ImagesView';
import { SourcesView } from '../SourcesView';
import { AreaHead } from './AreaHead';

const TABS = ['materials', 'cases', 'sources', 'images', 'reports'] as const;

export function LibraryArea({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const [tab, setTab] = useTab(TABS, 'materials');
  const pid = p.workbenchId;
  const cases = p.research?.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.items.length, 0), 0) ?? 0;
  const refs = p.contributions.filter((c) => c.kind === 'reference').length;
  return (
    <div className="page pw-page pw-library area">
      <AreaHead
        title={t('pw.area.library')}
        lede={t('pw.lib.lede')}
        stats={[
          { n: p.task.inputs.length + (p.brandResources?.length ?? 0), label: t('pw.lib.stat.supplied'), tone: 'lime', to: projectPath(pid, 'library', { tab: 'materials' }) },
          { n: cases, label: t('pw.lib.stat.cases'), tone: 'lilac', to: projectPath(pid, 'library', { tab: 'cases' }) },
          { n: refs, label: t('pw.lib.stat.refs'), tone: 'white', to: projectPath(pid, 'library', { tab: 'materials' }) },
        ]}
      />
      <FolderTabs tabs={TABS} current={tab} onChange={setTab} label={t('pw.area.library')} render={(x) => t(`pw.lib.tab.${x}`)}>
      {tab === 'materials' && <Materials proposal={p} />}
      {tab === 'cases' && <Cases proposal={p} />}
      {tab === 'sources' && (
        <Embedded>
          <SourcesView projectId={pid} />
        </Embedded>
      )}
      {tab === 'images' && (
        <Embedded>
          <ImagesView projectId={pid} />
        </Embedded>
      )}
      {tab === 'reports' && <Reports projectId={pid} />}
      </FolderTabs>
    </div>
  );
}

function Materials({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const pid = p.workbenchId;
  const brief = useServiceQuery(`brief:${pid}`, (s) => s.getBriefHistory(pid), { projectId: pid });
  const refs = p.contributions.filter((c) => c.kind === 'reference');
  const originals = brief.data?.attachments ?? [];
  return (
    <div className="pw-mat">
      <BrandResourceList proposal={p} />
      <section aria-labelledby="lib-originals">
        <div className="pw-sh">
          <h2 id="lib-originals" className="pw-h3">
            {t('pw.lib.originals')}
          </h2>
          <Backed as="connected" />
        </div>
        {originals.length === 0 ? (
          <p className="small muted">{t('pw.lib.noOriginals')}</p>
        ) : (
          <ul className="pw-files">
            {originals.map((a) => (
              <li key={a.id}>
                <FileText size={18} aria-hidden="true" />
                <div>
                  <Link to={projectPath(pid, 'proposal', { stage: 'brief', version: String(a.briefVersion) })} className="pw-files__name">
                    {a.fileName ?? t(`attach.kind.${a.kind}`)}
                  </Link>
                  <p className="small muted">
                    {t('common.version', { v: a.briefVersion })} · <Time iso={a.createdAt} relative />
                    {!a.fileAvailable && a.fileName ? ` · ${t('pw.lib.textOnly')}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="lib-inputs">
        <div className="pw-sh">
          <h2 id="lib-inputs" className="pw-h3">
            {t('pw.lib.supplied')}
          </h2>
          <Backed as="prototype" />
        </div>
        <ul className="bf-inputs">
          {p.task.inputs.map((x) => (
            <li key={x.id} className="bf-input">
              <div className="bf-input__thumb">
                {x.art ? <ArtFrame spec={x.art} title={x.title} fill /> : x.kind === 'link' ? <Link2 size={26} aria-hidden="true" /> : x.kind === 'image' ? <ImageIcon size={26} aria-hidden="true" /> : <FileText size={26} aria-hidden="true" />}
              </div>
              <p className="bf-input__title">{x.title}</p>
              <p className="small muted">{x.note}</p>
              <span className="bf-chip">{t(`pw.inputKind.${x.kind}`)}</span>
            </li>
          ))}
          {refs.map((c) => (
            <li key={c.id} className="bf-input">
              <div className="bf-input__thumb lib-quote">
                <MessageSquareQuote size={26} aria-hidden="true" />
              </div>
              <p className="bf-input__title">{c.text}</p>
              {c.borrow && (
                <p className="small muted">
                  {t('pw.contrib.borrow')} {c.borrow}
                </p>
              )}
              <span className="bf-chip">{t('pw.lib.yourRef', { stage: t(`pw.stage.${c.stage}`) })}</span>
            </li>
          ))}
        </ul>
        {p.task.inputs.length + refs.length === 0 && <p className="small muted">{t('pw.lib.noSupplied')}</p>}
      </section>
    </div>
  );
}

function Cases({ proposal: p }: { proposal: Proposal }) {
  const t = useT();
  const groups = p.research?.sections.flatMap((s) => s.groups.map((g) => ({ ...g, section: s.id }))) ?? [];
  if (!groups.length) return <p className="pw-empty">{t('pw.lib.noCases')}</p>;
  return (
    <div className="pw-cases">
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`lc-${g.id}`} className="pw-wall" data-kind={g.kind}>
          <div className="pw-wall__head">
            <h2 id={`lc-${g.id}`} className="pw-wall__title">
              {g.title}
            </h2>
            <span className="pw-kindtag" data-kind={g.kind}>
              {t(`pw.kind.${g.kind}`)}
            </span>
            <Link className="bx-chip-link" to={projectPath(p.workbenchId, 'proposal', { stage: 'research', focus: g.items[0]?.id ?? '' })}>
              {t('pw.lib.inResearch')} <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <ul className="lib-wall">
            {g.items.map((c) => (
              <li key={c.id} style={{ '--r': naturalRatio(c.art)[0] / naturalRatio(c.art)[1] } as CSSProperties}>
                <figure className="lib-print">
                  <ArtFrame spec={c.art} title={c.title} />
                  <figcaption>
                    <span className="pw-case__title">{c.title}</span>
                    <span className="pw-case__cap">
                      {c.source} · {c.date}
                    </span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Reports({ projectId }: { projectId: string }) {
  const t = useT();
  const list = useServiceQuery(`artifacts:${projectId}`, (s) => s.listArtifacts(projectId), { projectId });
  const items = list.data?.items ?? [];
  return (
    <div>
      <div className="pw-sh">
        <p className="small muted">{t('pw.lib.reportsLede')}</p>
        <Backed as="connected" />
      </div>
      {items.length === 0 ? (
        <p className="small muted">{t('pw.lib.noReports')}</p>
      ) : (
        <ul className="pw-files">
          {items.map((a) => (
            <li key={a.id}>
              <FileText size={18} aria-hidden="true" />
              <div>
                <Link className="pw-files__name" to={projectPath(projectId, 'process', { tab: 'versions', artifact: a.id })}>
                  {a.title} · v{a.version}
                </Link>
                <p className="small muted">
                  {t(`pw.artStatus.${a.status}`)}
                  {!a.isCurrent && ` · ${t('pw.lib.superseded')}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
