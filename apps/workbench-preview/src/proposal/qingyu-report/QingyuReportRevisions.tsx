import { useState } from 'react';
import type { QingyuResolution } from './binding';
import { qingyuR2Report } from './bundle-r2';
import { QingyuReportView } from './QingyuReportView';
import { QingyuR2View } from './QingyuR2View';
import type { QingyuR2Parsed } from './report-r2';
import type { QingyuR3Parsed } from './report-r3';
import { qingyuR3Report } from './bundle-r3';
import { QingyuR3View } from './QingyuR3View';
import { qingyuR4Report } from './bundle-r4';
import type { QingyuR4Parsed } from './report-r4';
import { QingyuR4View } from './QingyuR4View';
import { QingyuStudioView } from './QingyuStudioView';
import '../../styles/qingyu-report-r2.css';

type Recheck = { pending: boolean; run: () => void };
export function QingyuReportRevisions({ result, recheck, bundle = qingyuR2Report, bundleR3 = qingyuR3Report, bundleR4 = qingyuR4Report, initialRevision = 'studio' }: { result: QingyuResolution; recheck: Recheck; bundle?: QingyuR2Parsed; bundleR3?: QingyuR3Parsed; bundleR4?: QingyuR4Parsed; initialRevision?: 1 | 2 | 3 | 4 | 'studio' }) {
  const [revision, setRevision] = useState<1 | 2 | 3 | 4 | 'studio'>(initialRevision);
  if (result.kind === 'unavailable') return <QingyuReportView key="unavailable" result={result} recheck={recheck} />;
  return <div className="qy-revisions">
    <div className="qy-revisions-switch" role="group" aria-label="青屿报告版本"><span>阅读版本</span><button type="button" aria-pressed={revision === 'studio'} onClick={() => setRevision('studio')}>版式工坊图版</button><button type="button" aria-pressed={revision === 4} onClick={() => setRevision(4)}>公开资料报告·修订4</button><button type="button" aria-pressed={revision === 3} onClick={() => setRevision(3)}>公开资料报告·修订3</button><button type="button" aria-pressed={revision === 2} onClick={() => setRevision(2)}>公开资料报告·修订2</button><button type="button" aria-pressed={revision === 1} onClick={() => setRevision(1)}>保存的研究第1版</button></div>
    {revision === 'studio' ? bundleR4.kind === 'valid' && bundle.kind === 'valid' ? <QingyuStudioView key="revision-studio" report={bundleR4.report} prices={bundle.report} historical={result.currency === 'historical'} latestBriefVersion={result.latestBriefVersion} /> : <section className="qy-r4" data-case-status="invalid-studio-bundle"><p className="qy-r4-warning" role="alert">版式工坊图版未通过完整性检查，暂不能展示。可明确切换至历史修订查看旧稿。</p></section> : revision === 1 ? <QingyuReportView key="revision-1" result={result} recheck={recheck} /> : revision === 2 ? bundle.kind === 'valid' ? <QingyuR2View key="revision-2" report={bundle.report} historical={result.currency === 'historical'} latestBriefVersion={result.latestBriefVersion} /> : <section className="qy-r2" data-case-status="invalid-r2-bundle"><p className="qy-r2-warning" role="alert">公开资料报告·修订2未通过完整性检查，暂不能展示。可明确切换至保存的研究第1版查看旧稿。</p></section> : revision === 4 ? bundleR4.kind === 'valid' ? <QingyuR4View key="revision-4" report={bundleR4.report} historical={result.currency === 'historical'} latestBriefVersion={result.latestBriefVersion} /> : <section className="qy-r4" data-case-status="invalid-r4-bundle"><p className="qy-r4-warning" role="alert">公开资料报告·修订4未通过完整性检查，暂不能展示。可明确切换至修订3、修订2或保存的研究第1版查看旧稿。</p></section> : bundleR3.kind === 'valid' ? <QingyuR3View key="revision-3" report={bundleR3.report} historical={result.currency === 'historical'} latestBriefVersion={result.latestBriefVersion} /> : <section className="qy-r3" data-case-status="invalid-r3-bundle"><p className="qy-r3-warning" role="alert">公开资料报告·修订3未通过完整性检查，暂不能展示。可明确切换至修订2或保存的研究第1版查看旧稿。</p></section>}
  </div>;
}
