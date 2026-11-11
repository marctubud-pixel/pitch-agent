import { useConfirm } from '../app/confirm';
import { useCommand } from '../app/commands';
import { useService } from '../app/services';
import type { NextActionCommand, Project } from '../domain/models';
import { useT } from '../i18n';

/** Starts workflow jobs (generation, verification, readiness, continuation) through one command runner. */
export function useWorkflowCommand() {
  const service = useService();
  const confirm = useConfirm();
  const command = useCommand();
  const t = useT();

  const exec = async (kind: NextActionCommand, project: Project) => {
    if (kind === 'confirm_brief') {
      return command.run({
        label: t('wf.confirmBrief'),
        payload: { kind },
        expectedRevision: project.revision,
        execute: (meta) => service.confirmBrief(project.id, meta),
        success: t('wf.confirmBrief.done'),
      });
    }
    if (kind === 'continue_to_strategy') {
      const ok = await confirm({
        title: t('wf.continue.title', { name: project.name }),
        body: t('wf.continue.body'),
        confirmLabel: t('wf.continue_to_strategy'),
      });
      if (!ok) return null;
    }
    const execute = {
      generate_research: service.generateResearch,
      regenerate_research: service.generateResearch,
      run_verification: service.startVerification,
      run_readiness: service.startReadinessReview,
      continue_to_strategy: service.continueToStrategy,
    }[kind].bind(service);
    return command.run({
      label: t(`wf.${kind}`),
      payload: { kind },
      expectedRevision: project.revision,
      execute: (meta) => execute(project.id, meta),
      success: (r) => t('wf.queued', { job: r.data.label }),
    });
  };

  return { command, exec };
}
