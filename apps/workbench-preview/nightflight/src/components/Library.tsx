import { useEffect, useRef, useState } from 'react';
import { api, encodeFile, endpoint, safeURL, projectStatus, type Asset, type Project, type Summary } from '../live';
import { Icon } from './Icon';

interface Entry { id:string; name:string; brand:string; client:string; industry:string; date?:string }
interface Catalog { projects:Entry[]; files:Asset[] }
const uploads = 'uploads';
const day = (date?:string) => date ? new Date(date).toLocaleDateString('zh-CN') : '';

export function Library({initialId, projects, close, open, pick, create}:{
  initialId?:string; projects:Summary[]; close:()=>void; open?:(p:Project)=>void;
  pick?:(file:File)=>void; create?:()=>void;
}) {
  const [catalog,setCatalog] = useState<Catalog>({projects:[],files:[]});
  const [selected,select] = useState(initialId || ''), [mobile,setMobile] = useState(!!initialId);
  const [query,search] = useState(''), [industry,setIndustry] = useState(''), [client,setClient] = useState('');
  const [project,setProject] = useState<Project>(), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    api<Catalog>('/api/library').then(c => { if(active) setCatalog(c) }).catch(e => { if(active) setError(e.message) });
    return () => { active=false };
  }, []);
  useEffect(() => {
    const esc = (e:KeyboardEvent) => { if(e.key === 'Escape') close() };
    window.addEventListener('keydown',esc); return () => window.removeEventListener('keydown',esc);
  },[close]);
  const needle=query.trim().toLowerCase();
  const rows=catalog.projects.filter(x => (!client || x.client===client) && (!industry || x.industry===industry) &&
    [x.name,x.brand,x.client,x.industry,projects.find(p=>p.id===x.id)?.title || ''].some(v=>v.toLowerCase().includes(needle)));
  const entry=rows.find(x=>x.id===selected) || rows[0];
  const isUploads=selected===uploads;
  const id=isUploads ? undefined : entry?.id;
  useEffect(() => {
    let active=true; setProject(undefined);
    if(id) api<{project:Project}>(endpoint(id)).then(v=>{if(active)setProject(v.project)}).catch(e=>{if(active)setError(e.message)});
    return ()=>{active=false};
  },[id]);
  const p=project?.id===id ? project : undefined;
  const clients=[...new Set(catalog.projects.map(x=>x.client).filter(Boolean))];
  const industries=[...new Set(catalog.projects.map(x=>x.industry).filter(Boolean))];
  const filtered=Boolean(client || industry || needle);
  function show(key:string){select(key);setMobile(true)}
  async function upload(files:File[]) {
    setBusy(true); setError('');
    try {
      for(const file of files) {
        if(file.size > 12*1024*1024) throw Error(file.name+' 超过 12 MB');
        const saved=await api<Asset>('/api/library',await encodeFile(file));
        setCatalog(c=>({...c,files:[saved,...c.files]})); show(uploads);
      }
    } catch(e){setError(String(e))} finally {setBusy(false)}
  }
  async function attach(f:Asset) {
    const url=safeURL(f.url); if(!url || !pick) return;
    setBusy(true);
    try {const response=await fetch(url); if(!response.ok) throw Error('读取文件失败'); pick(new File([await response.blob()],f.name))}
    catch(e){setError(String(e))} finally {setBusy(false)}
  }
  function fileRows(files:Asset[]) {
    return <ul className="lib-files">{files.map(f=><li key={f.url}><Icon name="doc" size={20} className="doc-ico"/>
      <div className="lib-file-text"><strong>{f.name}</strong><span>{f.name.split('.').pop()?.toUpperCase()}</span></div>
      <div className="lib-file-act"><a className="link-btn" href={safeURL(f.url)} download={f.name}>下载</a>
      {pick && <button className="btn btn-sm" disabled={busy} onClick={()=>attach(f)}>加入参考资料</button>}</div></li>)}</ul>
  }
  const files=p ? [...(p.attachments || []),...p.artifacts] : [];
  return <div className={'sheet lib '+(mobile?'show-detail':'')} role="dialog" aria-label="比稿资料库">
    <div className="sheet-bar"><button className="back-link" onClick={close}>← {create?'回到首页':'返回'}</button>
      <span className="mono-label">{new URLSearchParams(location.search).get('personal') === '1' ? '个人资料库' : '共享资料库 · 本机保存'}</span></div>
    <div className="sheet-scroll"><div className="lib-doc">
      <header className="lib-head"><div><h1>比稿资料库</h1><p>跨项目查找过往的比稿、提案和相关文档。</p></div>
        <div className="lib-linked"><span className="mono-label">已归档项目</span><strong>{catalog.projects.length}</strong><span className="mono-label">个</span></div></header>
      <div className="lib-tools">
        <input aria-label="搜索资料库" className="lib-search" type="search" placeholder="搜索客户、品牌、行业或项目名" value={query} onChange={e=>search(e.target.value)}/>
        <select aria-label="按客户筛选" className="lib-select" value={client} onChange={e=>setClient(e.target.value)}><option value="">全部客户</option>{clients.map(x=><option key={x}>{x}</option>)}</select>
        <input className="sr-only" type="file" ref={input} multiple onChange={e=>{const f=Array.from(e.target.files || []);e.target.value='';void upload(f)}}/>
        <button className="btn" disabled={busy} onClick={()=>input.current?.click()}><Icon name="upload"/>上传过往文件</button>
        {create && <button className="btn" onClick={create}>新建提案</button>}
      </div>
      <div className="lib-chips" role="group" aria-label="按行业筛选">{['',...industries].map(x=><button key={x} className={x===industry?'is-on':''} aria-pressed={x===industry} onClick={()=>setIndustry(x)}>{x || '全部'}</button>)}
        {filtered && <button className="link-btn" onClick={()=>{search('');setClient('');setIndustry('')}}>清除筛选</button>}</div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="lib-panes"><section className="lib-list"><h2 className="col-title">过往项目 <span>{rows.length} / {catalog.projects.length}</span></h2>
        {!!catalog.files.length && <button className={'lib-row is-uploads '+(isUploads?'is-on':'')} onClick={()=>show(uploads)}><span className="lib-row-name">我上传的文件</span><span className="lib-row-meta">{catalog.files.length} 份原件</span></button>}
        {!rows.length && <p className="empty">没有符合条件的项目。</p>}
        {rows.map(x=><button key={x.id} className={'lib-row '+(id===x.id?'is-on':'')} aria-current={id===x.id} onClick={()=>show(x.id)}>
          <span className="lib-row-top"><span className="lib-row-name">{x.name}</span><span className="time">{day(x.date)}</span></span>
          <span className="lib-row-meta">{[x.client,x.brand].filter(Boolean).join(' · ')}</span>
          {x.industry && <span className="lib-row-foot"><span className="chip">{x.industry}</span></span>}</button>)}</section>
      <section className="lib-detail"><button className="back-link lib-back" onClick={()=>setMobile(false)}>← 项目列表</button>
        {isUploads ? <><h2 className="lib-title">我上传的文件</h2>{fileRows(catalog.files)}</> : entry && p && <>
          <p className="mono-label">{[entry.industry,day(entry.date)].filter(Boolean).join(' · ')}</p><h2 className="lib-title">{entry.name}</h2>
          <dl className="lib-meta">{[['客户',entry.client],['品牌',entry.brand],['行业',entry.industry],['更新日期',day(entry.date)],['项目状态',projectStatus(p)]].filter(([,v])=>v).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <p className="lib-desc">{p.brief}</p>{open && <button className="btn" onClick={()=>open(p)}>进入这个项目 →</button>}
          <h3 className="sub-title">文件 · {files.length}</h3>{fileRows(files)}{!files.length && <p className="empty">这个项目还没有文件。</p>}
          {p.versions?.map((v,i)=><details className="block" key={v.at}><summary>修订前的版本 {i+1} · {day(v.at)}</summary>{fileRows(v.artifacts)}</details>)}
        </>}</section></div></div></div></div>
}
