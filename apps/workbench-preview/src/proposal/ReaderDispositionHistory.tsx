import type {ReaderDispositionAction,ReaderDispositionHistoryEntry} from '../domain/researchReader';
const LABELS:Record<ReaderDispositionAction,string>={revised:'已修订',clarified:'已补充说明',narrowed:'已缩小结论',withdrawn:'已撤回主张',unresolved:'仍未解决'};
export function ReaderDispositionHistory({entries}:{entries:ReaderDispositionHistoryEntry[]}){
 if(!entries.length)return null;
 return <section style={{marginBlock:20}} aria-label="已保存的逐项处理"><h4>已保存的逐项处理</h4><p className="muted">以下为负责人原始记录，仅供查阅；保存回应不代表问题已解决、研究放行或人类批准。</p>{entries.map(({record,kind,historical})=><section key={record.id}><h5>{kind==='consumed'?'此复查实际读取的处理记录':'针对此报告保存的处理记录'} · 读者 {record.seat+1} · {historical?'历史稿依据':'当前稿依据'}</h5>{record.items.map(item=><section key={item.issueId}><p><strong>问题 {item.issueId} · 实际处理：{LABELS[item.action]}</strong></p><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>负责人回应：{item.response}</p><p className="muted">保存时的新稿原文依据</p>{item.locations.map((location,i)=><blockquote key={i} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{location.quote}</blockquote>)}</section>)}{!record.items.length&&<p>原报告未单列问题项，此记录保留当时复查范围。</p>}</section>)}</section>;
}
