import { History } from 'lucide-react';
import { useServiceQuery } from '../app/query';
import { Link, projectPath, useRouter } from '../app/router';
import { useT } from '../i18n';
import type { Brief } from '../domain/models';
import { QueryView, Skeleton, Time } from '../ui/kit';
import { briefVersionDescription } from './briefVersions';

export function BriefVersionRecords({ projectId }: { projectId: string }) {
  const t = useT();
  const { params } = useRouter();
  const query = useServiceQuery(`brief:${projectId}`, service => service.getBriefHistory(projectId), { projectId });
  return <section className="brief-version-records" aria-labelledby="brief-version-records-title">
    <h2 id="brief-version-records-title"><History size={17} aria-hidden="true" />版本记录</h2>
    <QueryView query={query} skeleton={<Skeleton lines={2} />}>
      {data => {
        const versions = [...data.versions].sort((a,b) => b.version-a.version);
        const renderVersion = (brief: Brief) => {
          const current = brief.id === data.current?.id;
          const selected = String(brief.version) === (params.get('version') ?? String(data.current?.version));
          const description = briefVersionDescription(brief, data.versions.find(v => v.version === brief.version-1));
          const note = description.kind === 'note' ? description.text
            : description.kind === 'created' ? '创建任务卡。'
              : description.kind === 'changes' ? `本版更新：${description.fields.map(field => field === 'proposalType' ? '提案类型' : t(`taskField.${field}`)).join('、')}。`
                : description.kind === 'materials' ? '补充了简报材料。' : '此版本未填写备注。';
          return <li key={brief.id} data-current={current || undefined}>
            <Link to={projectPath(projectId,'proposal',{stage:'brief',...(current?{}:{version:String(brief.version)})})} aria-current={selected?'page':undefined}>
              <strong>第{brief.version}版</strong><span>{current?'当前任务卡':'查看此版本'}</span>
            </Link>
            <p className="brief-version-records__state">{current && brief.version>1 ? '已更新 · ' : ''}{brief.confirmedAt?'已确认':'待确认'}</p>
            <p className="brief-version-records__note">{note}</p>
            <p className="brief-version-records__meta">{brief.editedBy ?? '修改人未记录'} · <Time iso={brief.editedAt ?? brief.createdAt} /></p>
          </li>;
        };
        return <nav aria-label="任务卡版本记录">
          <ol>{data.current && renderVersion(data.current)}</ol>
          {versions.some(v => v.id !== data.current?.id) && <details className="brief-version-records__older" open={Boolean(params.get('version')) || undefined}>
            <summary>更早版本 · {versions.filter(v => v.id !== data.current?.id).length}</summary>
            <ol>{versions.filter(v => v.id !== data.current?.id).map(renderVersion)}</ol>
          </details>}
        </nav>;
      }}
    </QueryView>
  </section>;
}
