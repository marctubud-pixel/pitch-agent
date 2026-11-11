import { FlaskConical, Heading, PenLine, ScanText, TriangleAlert } from 'lucide-react';
import type { ExtractedDocument, TaskCardMapping } from '../domain/intake';
import { useI18n } from '../i18n';

/** Says plainly how the task card was filled, so a simulated or partial result is never mistaken for analysis. */
export function MappingBanner({ mapping, doc }: { mapping: TaskCardMapping; doc: ExtractedDocument }) {
  const { t, list } = useI18n();
  const name = doc.fileName ?? t(`attach.kind.${doc.kind}`);
  const method = doc.extraction.method === 'pdf' ? t('extract.method.pdf', { count: doc.extraction.pages ?? 0 }) : t(`extract.method.${doc.extraction.method}`);
  const tone = mapping.mode === 'none' ? 'warn' : mapping.mode === 'simulated_sample' ? 'accent' : 'info';
  const Icon = mapping.mode === 'simulated_sample' ? FlaskConical : mapping.mode === 'headings' ? Heading : doc.kind === 'paste' || doc.kind === 'request' ? PenLine : ScanText;
  return (
    <div className="banner banner--row mapping-banner" data-tone={tone} role="status" data-mode={mapping.mode}>
      <Icon size={18} aria-hidden="true" />
      <div className="stack-sm">
        <p>
          <strong>{t(`mapping.title.${mapping.mode}`)}</strong> {t(`mapping.body.${mapping.mode}`, { headings: list(mapping.matchedHeadings), count: mapping.matchedHeadings.length })}
        </p>
        <p className="small">
          {t('mapping.read', { name, method, chars: doc.text.length.toLocaleString() })}
        </p>
        {doc.extraction.warnings.includes('little_text') && (
          <p className="small">
            <TriangleAlert size={13} aria-hidden="true" /> {t('mapping.littleText')}
          </p>
        )}
      </div>
    </div>
  );
}
