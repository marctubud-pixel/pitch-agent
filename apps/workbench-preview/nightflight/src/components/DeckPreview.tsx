import { useEffect, useRef, useState } from 'react';
import { DeckStudioPage } from '../../../src/proposal/deck-studio/Viewer';
import type { Page } from '../../../src/proposal/deck-studio/model';
import { safeURL, type Artifact } from '../live';

import { OutlineReading } from './OutlineReading';

export function DeckPreview({ file, open, foldIndex = false, outline }: {
  file: Artifact; open?: () => void; foldIndex?: boolean; outline?: Artifact;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [pages, setPages] = useState<Page[]>([]),
    [index, setIndex] = useState(0),
    [err, setErr] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const url = safeURL(file.url);
    setPages([]);
    setIndex(0);
    setIndexOpen(false);
    setErr('');
    if (!url) {
      setErr('预览文件地址无效。');
      return;
    }
    (async () => {
      const r = await fetch(url, { signal: controller.signal });
      if (!r.ok) throw Error();
      const data = await r.json();
      if (
        !Array.isArray(data.pages) ||
        !data.pages.length ||
        data.pages.some((p: Page) => !Array.isArray(p.nodes))
      )
        throw Error();
      if (!controller.signal.aborted) setPages(data.pages);
    })().catch(() => {
      if (!controller.signal.aborted) setErr('预览暂时无法打开，可下载 PPTX 查看。');
    });
    return () => controller.abort();
  }, [file.url]);
  if (!pages.length) return <p className="empty">{err || '正在读取提案页面…'}</p>;
  if (open)
    return (
      <button className="deck-thumb appear" onClick={open}>
        <DeckStudioPage page={pages[0]} />
        <span className="deck-thumb-foot">
          <span>提案预览 · {pages.length} 页</span>
          <span>打开 →</span>
        </span>
      </button>
    );
  const go = (to: number) => setIndex(Math.max(0, Math.min(pages.length - 1, to)));
  const jump = (to: number) => {
    go(to);
    stage.current?.focus({ preventScroll: true });
    stage.current?.scrollIntoView({ block: 'center' });
  };
  const thumbnails = (!foldIndex || indexOpen) && (
    <div className="deck-strip">
      {pages.map((p, i) => (
        <button
          key={p.id}
          className={i === index ? 'is-on' : ''}
          onClick={() => jump(i)}
          aria-label={'第 ' + (i + 1) + ' 页'}
          aria-current={i === index}
        >
          <DeckStudioPage page={p} />
        </button>
      ))}
    </div>
  );
  return (
    <div
      className="deck"
      tabIndex={0}
      aria-label="提案预览，可用左右方向键翻页"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          go(index + (e.key === 'ArrowLeft' ? -1 : 1));
        }
      }}
    >
      <div className="deck-stage" ref={stage} tabIndex={-1}>
        <DeckStudioPage page={pages[index]} />
      </div>
      <div className="deck-ctrl">
        <button className="btn btn-sm" disabled={index === 0} onClick={() => go(index - 1)}>
          ← 上一页
        </button>
        <span aria-live="polite">
          {index + 1} / {pages.length}
        </span>
        <button className="btn btn-sm" disabled={index === pages.length - 1} onClick={() => go(index + 1)}>
          下一页 →
        </button>
      </div>
      {foldIndex ? (
        <details open={indexOpen} onToggle={(event) => setIndexOpen(event.currentTarget.open)}>
          <summary>页面目录（{pages.length}）</summary>
          {thumbnails}
        </details>
      ) : thumbnails}
      {outline && <OutlineReading key={outline.url} file={outline} pageCount={pages.length} go={jump} />}
    </div>
  );
}
