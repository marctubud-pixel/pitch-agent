import { useEffect, useState } from 'react';
import { safeURL, type Artifact } from '../live';

interface OutlinePage {
  instance_id: string;
  first_page: number;
  last_page: number;
  client_title: string;
  content: string;
  material_ref: string;
  status: string;
}
interface Outline {
  physical_page_count: number;
  pages: OutlinePage[];
  gaps: { instance_id: string; chapter: string; reason: string }[];
}

export function OutlineReading({ file, pageCount, go }: {
  file: Artifact; pageCount: number; go: (page: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [outline, setOutline] = useState<Outline>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open || outline) return;
    const controller = new AbortController();
    const load = async () => {
      const url = safeURL(file.url);
      if (!url) throw Error();
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw Error();
      const data: Outline = await response.json();
      if (data.physical_page_count !== pageCount || !Array.isArray(data.pages) || !Array.isArray(data.gaps) ||
          !data.pages.every(p => Number.isInteger(p.first_page) && Number.isInteger(p.last_page) &&
            p.first_page >= 1 && p.last_page >= p.first_page && p.last_page <= pageCount)) throw Error();
      if (!controller.signal.aborted) setOutline(data);
    };
    setError(false);
    load().catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [file.url, open, outline, pageCount]);
  return <details className="outline-reading" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>逐页稿与材料</summary>
    {open && (!outline
      ? <p>{error ? '本版逐页稿暂时无法读取。' : '正在读取逐页稿…'}</p>
      : <>
        {outline.gaps.length > 0 && <details>
          <summary>待补材料（{outline.gaps.length}）</summary>
          <ul>{outline.gaps.map(gap => <li key={gap.instance_id}>{gap.chapter} · {gap.reason}</li>)}</ul>
        </details>}
        <ol>{outline.pages.map(p => <li key={p.instance_id}>
          <button type="button" className="link-btn" onClick={() => go(p.first_page - 1)}>
            P{p.first_page}{p.last_page > p.first_page ? '–' + p.last_page : ''}　{p.client_title}
          </button>
          {p.content && <p>{p.content}</p>}
          {p.material_ref && <small>{p.material_ref}</small>}
        </li>)}</ol>
      </>)}
  </details>;
}
