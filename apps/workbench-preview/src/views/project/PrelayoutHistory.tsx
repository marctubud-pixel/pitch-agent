import type {PrelayoutReadRecord} from '../../domain/prelayoutRead';
import {SectionHead,More} from '../../proposal/ui';
import {Time} from '../../ui/kit';

const STATUS={queued:'已排队',running:'执行中',awaiting_reconciliation:'结果待核',succeeded:'结果已保存',succeeded_stale:'结果已保存 · 输入已变更'} satisfies Record<PrelayoutReadRecord['status'],string>;
const REPORT={clear:'模型记录未列新增阻断',returned:'记录要求退修',unresolved:'记录仍有未决项',invalid_report:'报告格式待核',stale:'历史结果，当前输入待核'};
/** This panel shows saved metadata; it never supplies a production or review action. */
export function PrelayoutHistory({records}:{records:PrelayoutReadRecord[]}) {
  if(!records.length)return null;
  return <section aria-labelledby="prelayout-history">
    <SectionHead id="prelayout-history" title="排版前检查记录" />
    <p className="process-scope">比稿Agent的后台检查记录。这里只展示同次快照中的任务与报告关联，原件资格尚未核实；不代表人类采用、排版完成或终审通过。</p>
    <ul className="pw-records">{records.map(record=><li key={record.jobId}>
      <div className="pw-records__head"><strong>排版前简短核对</strong><span className="pw-tag" data-tone={record.status==='awaiting_reconciliation'||record.status==='succeeded_stale'?'warn':'neutral'}>{STATUS[record.status]}</span><span className="small muted">{record.relation==='same_inputs'?'当前任务与稿件标识相符':'历史输入记录'}</span></div>
      <p className="small">{record.kind==='queued'?'尚无执行尝试记录。':<>执行开始记录 <Time iso={record.attempt.startedAt} /> · 原尝试状态：{STATUS[record.attempt.status]}</>}</p>
      {record.kind==='attempt'&&record.status==='awaiting_reconciliation'&&<p className="small">原结果待核，保留当前执行尝试；此页不恢复或重新派发。</p>}
      {record.attempt?.error&&<More label="查看原错误记录"><pre className="raw">{record.attempt.error.code}{'\n'}{record.attempt.error.message}</pre></More>}
      {record.kind==='reported'&&<><p>{REPORT[record.report.status]}；原件资格未核实。</p>{record.report.summary&&<p className="small">{record.report.summary}</p>}<More label="查看已保存报告原文"><pre className="raw">{record.report.originalText}</pre></More></>}
      <More label="查看任务与版本关联"><dl className="kv kv--compact"><dt>任务</dt><dd className="mono">{record.jobId}</dd><dt>任务卡</dt><dd className="mono">{record.taskCardId}</dd><dt>输入组合</dt><dd className="mono">{record.sourceTupleHash}</dd><dt>方法版本</dt><dd>{record.method.version}</dd>{record.attempt&&<><dt>原执行尝试</dt><dd className="mono">{record.attempt.id}</dd><dt>原请求</dt><dd className="mono">{record.attempt.requestHash}</dd></>}</dl></More>
    </li>)}</ul>
  </section>;
}
