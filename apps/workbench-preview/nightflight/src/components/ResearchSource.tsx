import { safeURL, type Asset } from '../live';

export function ResearchSource({ finding, attachments = [] }: { finding: { source: string; url: string }; attachments?: Asset[] }) {
  const matches = attachments.filter(file => file.name === finding.source);
  if (/^https?:\/\//i.test(finding.url)) return (
    <a href={finding.url} target="_blank" rel="noopener noreferrer">{finding.source || finding.url} · 打开网页</a>
  );
  const url = matches.length === 1 ? safeURL(matches[0].url) : undefined;
  return url ? <a href={url} download={finding.source}>{finding.source} · 下载附件</a> : <>{finding.source}</>;
}
