import { useEffect, useState } from 'react';
import { api, endpoint, safeURL, projectStatus, type Asset, type Project, type Summary } from '../live';
import { Icon } from './Icon';

export function Library({
  projects,
  close,
  open,
  pick,
}: {
  projects: Summary[];
  close: () => void;
  open?: (p: Project) => void;
  pick?: (f: File) => void;
}) {
  const [q, setQ] = useState(''),
    [id, select] = useState(projects[0]?.id || ''),
    [p, setP] = useState<Project>(),
    [err, setErr] = useState(''),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setP(undefined);
    setErr('');
    if (id)
      api<{ project: Project }>(endpoint(id))
        .then((d) => {
          if (live) setP(d.project);
        })
        .catch((e) => {
          if (live) setErr(e.message);
        });
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [close]);
  async function attach(f: Asset) {
    const url = safeURL(f.url);
    if (!url || !pick || busy) return;
    setBusy(true);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('读取文件失败');
      pick(new File([await r.blob()], f.name));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }
  const results = projects.filter((x) => x.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className={'sheet lib ' + (mobile ? 'show-detail' : '')} role="dialog" aria-label="比稿资料库">
      <div className="sheet-bar">
        <button className="back-link" onClick={close}>
          ← 返回
        </button>
        <span className="mono-label">本机项目与资料</span>
      </div>
      <div className="sheet-scroll">
        <div className="lib-doc">
          <header className="lib-head">
            <div>
              <p className="mono-label">项目档案</p>
              <h1>比稿资料库</h1>
              <p>打开以往的项目，查看其中的文件。</p>
            </div>
          </header>
          <div className="lib-tools">
            <input
              className="lib-search"
              aria-label="搜索项目"
              type="search"
              placeholder="搜索项目名"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {err && (
            <p role="alert" className="form-error">
              {err}
            </p>
          )}
          <div className="lib-panes">
            <section className="lib-list">
              <h2 className="col-title">
                过往项目 <span>{results.length}</span>
              </h2>
              {results.length === 0 && <p className="empty">暂无符合条件的本地项目。</p>}
              {results.map((x) => (
                <button
                  key={x.id}
                  className={'lib-row ' + (id === x.id ? 'is-on' : '')}
                  onClick={() => {
                    select(x.id);
                    setMobile(true);
                  }}
                >
                  <span className="lib-row-name">{x.title}</span>
                  <span className="lib-row-meta">{projectStatus(x)}</span>
                </button>
              ))}
            </section>
            <section className="lib-detail">
              <button className="back-link lib-back" onClick={() => setMobile(false)}>
                ← 项目列表
              </button>
              {p && (
                <>
                  <p className="mono-label">本地档案</p>
                  <h2 className="lib-title">{p.title}</h2>
                  <p className="lib-desc">{p.brief}</p>
                  {open && (
                    <button className="btn" onClick={() => open(p)}>
                      进入这个项目 →
                    </button>
                  )}
                  <h3 className="sub-title">项目文件</h3>
                  <ul className="lib-files">
                    {[...(p.attachments || []), ...p.artifacts].map((f, i) => (
                      <li key={i}>
                        <Icon name="doc" />
                        <div className="lib-file-text">
                          <strong>{f.name}</strong>
                        </div>
                        <div className="lib-file-act">
                          <a className="link-btn" href={safeURL(f.url)} download={f.name}>
                            下载
                          </a>
                          {pick && (
                            <button disabled={busy} className="btn btn-sm" onClick={() => attach(f)}>
                              加入参考资料
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!p.artifacts.length && !p.attachments?.length && (
                    <p className="empty">这个项目还没有文件。</p>
                  )}
                  {!!p.versions?.length && (
                    <>
                      <h3 className="sub-title">修订前的版本</h3>
                      {p.versions.map((v, i) => (
                        <details className="block" key={i}>
                          <summary>
                            版本 {i + 1} · {new Date(v.at).toLocaleString('zh-CN')}
                          </summary>
                          <ul className="lib-files">
                            {v.artifacts.map((f) => (
                              <li key={f.url}>
                                <strong>{f.name}</strong>
                                <a className="link-btn" href={safeURL(f.url)} download={f.name}>
                                  下载
                                </a>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ))}
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
