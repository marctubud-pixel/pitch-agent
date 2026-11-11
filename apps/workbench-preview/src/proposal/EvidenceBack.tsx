import { ArrowLeft } from 'lucide-react';
import { Link, projectPath, useRouter } from '../app/router';
import { STAGES, activeStage } from '../domain/proposal';
import { useT } from '../i18n';

/**
 * "Opened from Strategy · Back to the reasoning": shown wherever evidence opened from another
 * stage is on screen (the research page, the checks drawer, the claim panel), so the person can
 * return to the exact statement the evidence supports. Reads `back` and `at` from the link.
 */
export function EvidenceBack() {
  const t = useT();
  const { params, route } = useRouter();
  const raw = params.get('back');
  const back = STAGES.find((stage) => stage === raw) ?? null;
  if (!back || route.name !== 'project') return null;
  const at = params.get('at');
  return (
    <p className="pw-evback">
      <span className="small muted">{t('pw.ev.from', { stage: t(`pw.stage.${back}`) })}</span>
      <Link className="btn btn--secondary btn--sm" to={projectPath(route.projectId, 'proposal', { stage: activeStage(back), ...(at && back !== 'content_review' ? { focus: at } : {}) })}>
        <ArrowLeft size={14} aria-hidden="true" /> {t('pw.ev.back')}
      </Link>
    </p>
  );
}
