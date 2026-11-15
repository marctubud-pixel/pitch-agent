// Positions refer to the accepted findings in the current project's research handoff.
export function strategyMarkdown(plan, research) {
  const findings = research?.findings;
  if (!research?.ready || !Array.isArray(findings) || !findings.length)
    throw Error('研究尚无可交接的依据，请返回研究补查。');
  const selected = plan?.findingNumbers;
  const missing = [];
  if (!Array.isArray(selected) || !selected.length) missing.push('研究结论');
  if (typeof plan?.intersection !== 'string' || !plan.intersection.trim()) missing.push('方向交叉点');
  if (typeof plan?.focus !== 'string' || !plan.focus.trim()) missing.push('策略发力点');
  if (missing.length) throw Error('策略稿尚缺：' + missing.join('、') + '。请在策略阶段补齐。');
  if (new Set(selected).size !== selected.length ||
      selected.some(n => !Number.isInteger(n) || n < 1 || n > findings.length))
    throw Error('策略引用的结论无法定位到本轮已通过的研究，请在策略阶段核对。');
  const blocks = selected.map(n => {
    const f = findings[n - 1];
    if (![f?.conclusion, f?.evidence, f?.source, f?.implication].every(s => typeof s === 'string' && s.trim()))
      throw Error('研究依据不全，请返回研究补查。');
    return '结论：' + f.conclusion + '\n依据：' + f.evidence + '\n来源：' + f.source;
  });
  return '## 研究结论\n\n' + blocks.join('\n\n') + '\n\n## 方向交叉点\n\n' +
    plan.intersection.trim() + '\n\n## 策略发力点\n\n' + plan.focus.trim();
}
