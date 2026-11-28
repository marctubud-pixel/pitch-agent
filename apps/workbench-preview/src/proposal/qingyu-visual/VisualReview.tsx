export interface BlindReading {
  first: string;
  brand?: string;
  action: string;
  words: string;
  alternative: string;
  model?: string;
  slogan?: {status:'readable' | 'missing' | 'unreadable'; text:string; location:string};
}

export interface CandidateReview {
  title: string;
  image?: string;
  readings: BlindReading[];
  scores: {role: string; score: number; reason: string}[];
  reason?: string;
  hardIssues?: string[];
  selectionHold?: string;
  edit?: string;
  research?: string;
}

export function VisualReview({board, order, candidates}: {
  board?: string;
  order: string[];
  candidates: CandidateReview[];
}) {
  return <section aria-label="主视觉评审">
    {board && <figure><a href={board} target="_blank" rel="noopener noreferrer">
      <img src={board} alt="候选与同类包装并排对照" style={{width:'100%',height:'auto'}} />
    </a><figcaption>{order.join(' · ')}</figcaption></figure>}
    {candidates.map(c => <section key={c.title}>
      <h4>{c.title}{c.image && <>　<a href={c.image} target="_blank" rel="noopener noreferrer">查看原图</a></>}</h4>
      {!!c.readings.length && <details><summary>匿名盲读原话</summary>
        {c.readings.map((b,i)=><div key={i}>
          {c.readings.length>1 && <h5>读者 {i+1}</h5>}
          {([['第一眼',b.first],['品牌与品类',b.brand],['画面动作',b.action],['靠读字确认',b.words],['其他读法',b.alternative]] as const)
            .map(([label,value])=>value && <p key={label}><strong>{label}</strong>　{value}</p>)}
          {b.slogan && <>
            <p><strong>主标题抄录</strong>　<span style={{whiteSpace:'pre-wrap'}}>{typeof b.slogan === 'string' ? b.slogan : (b.slogan.text || (b.slogan.status==='missing' ? '未见主标题' : '无法读清'))}</span></p>
            {typeof b.slogan !== 'string' && b.slogan.location && <p><strong>位置</strong>　{b.slogan.location}</p>}
            {b.model && <p><strong>读图模型</strong>　{b.model}</p>}
          </>}
        </div>)}
      </details>}
      {c.selectionHold && <p><strong>待并排核对</strong>　{c.selectionHold}</p>}
      {!!c.hardIssues?.length && <ul className="plain-list" aria-label="待修正事项">
        {c.hardIssues.map(issue => <li key={issue}>{issue}</li>)}
      </ul>}
      {!!c.scores.length && <details><summary>{c.hardIssues ? '四岗意见' : '四岗原分与理由'}</summary>
        {c.scores.map(v=><p key={v.role}><strong>{v.role}{!c.hardIssues && ' · ' + v.score + '/5'}</strong>　{v.reason}</p>)}
      </details>}
      {c.reason && <p>{c.reason}</p>}
      {c.edit && c.edit!=='无' && <p><strong>改图</strong>　{c.edit}</p>}
      {c.research && c.research!=='无' && <p><strong>补资料</strong>　{c.research}</p>}
    </section>)}
  </section>;
}
