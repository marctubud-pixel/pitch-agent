import type { ResearchGap } from '../live';

const labels: Record<string,string> = {
  coverage:'覆盖范围', source:'来源核对', visual:'竞品原图', decision:'策略取舍',
};
export function researchDisplay(gaps: (ResearchGap | string)[]) {
  return gaps.flatMap(gap => {
    if (typeof gap === 'string') return gap.trim() ? [{message:gap, label:'研究记录'}] : [];
    return gap.message ? [{message:gap.message, label:[gap.chapter, labels[gap.kind] || '研究记录'].filter(Boolean).join(' · ')}] : [];
  });
}
