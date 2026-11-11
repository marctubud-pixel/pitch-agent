import { useCallback, useRef, useState } from 'react';
import { useIntake } from '../app/services';
import { IntakeError, type ExtractedDocument, type IntakeErrorCode, type IntakeProgress, type IntakeSource, type TaskCardMapping } from '../domain/intake';

export type IntakeRunState =
  | { status: 'idle' }
  | { status: 'working'; label: string | null; progress: IntakeProgress }
  | { status: 'error'; label: string | null; code: IntakeErrorCode; source: IntakeSource; detail: string | null }
  | { status: 'done'; doc: ExtractedDocument; mapping: TaskCardMapping };

const labelOf = (source: IntakeSource) => (source.kind === 'file' ? source.file.name : null);

/**
 * Runs the two intake operations in order (extract, then map) and exposes their progress.
 * Nothing is saved: the result is a draft the person reviews.
 */
export function useIntakeRun() {
  const intake = useIntake();
  const [state, setState] = useState<IntakeRunState>({ status: 'idle' });
  const runRef = useRef(0);

  const run = useCallback(
    async (source: IntakeSource) => {
      const id = ++runRef.current;
      const label = labelOf(source);
      const alive = () => id === runRef.current;
      setState({ status: 'working', label, progress: { stage: 'reading' } });
      try {
        const doc = await intake.extractText(source, (progress) => alive() && setState({ status: 'working', label, progress }));
        if (!alive()) return;
        setState({ status: 'working', label: doc.fileName ?? label, progress: { stage: 'mapping' } });
        const mapping = await intake.mapToTaskCard(doc);
        if (!alive()) return;
        setState({ status: 'done', doc, mapping });
      } catch (error) {
        if (!alive()) return;
        const code: IntakeErrorCode = error instanceof IntakeError ? error.code : 'corrupt';
        const detail = error instanceof IntakeError ? (error.message !== error.code ? error.message : null) : String((error as Error)?.message ?? error);
        setState({ status: 'error', label, code, source, detail });
      }
    },
    [intake],
  );

  const cancel = useCallback(() => {
    runRef.current += 1;
    setState({ status: 'idle' });
  }, []);

  return { state, run, cancel };
}
