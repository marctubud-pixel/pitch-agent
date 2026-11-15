type Question = { question: string; reason: string };

const questionLabel = /^(?:状态[：:]\s*研究待补[。；;]\s*)?(?:本轮最影响策略的问题是|最影响策略的问题是|待补查问题|补查问题|待查问题|待核问题|问题|缺口)[：:]\s*/;
const auditOnly = /^(?:尚未从「.*?」原文核对这条依据|当前没有可以同时核对|当前材料尚未提供可供策略|本轮尚未取得可用公开原文|未实际读取规范入口)|未实际委派|未作为本轮发现|(?:无关|不相关)[，,]已排除/;
const clueLabel = /^(?:可用线索|已有线索|资料线索|来源线索|线索|来源|待核来源)[：:]\s*/;

// Older poster reports express the decision and the missing evidence across several
// clauses. Only translate a gap when the report identifies the relevant evidence.
function posterDecision(text: string, posterReport: boolean): Question | undefined {
  if (!posterReport) return;
  if (/材料对象|适用SKU|适用产品/i.test(text) && /证明|核实|待核/.test(text)) {
    const claim = text.match(/[“「]([^”」]+)[”」]的(?:材料对象|适用)/)?.[1];
    if (claim) return {
      question: `哪些产品有材料证明，能支持“${claim}”？`,
      reason: '决定海报能否写这个卖点，以及可以写在哪些产品上。',
    };
  }
  if (/同媒介/.test(text) && /品牌原始海报|竞品海报原件/.test(text) && /信息层级|产品露出/.test(text)) {
    return {
      question: '同一媒介的竞品海报怎样安排主信息和产品？',
      reason: '决定自己的海报先讲什么、产品放在什么位置。',
    };
  }
  if (/受众|人群/.test(text) && /媒介/.test(text) && /海报接触|接触.{0,8}海报/.test(text)) {
    return {
      question: '谁会在哪里看到海报，第一眼能记住什么？',
      reason: '决定海报优先面向谁，以及哪个品牌信息要放在最显眼的位置。',
    };
  }
}

export function researchDisplay(gaps: string[]) {
  const posterReport = gaps.some((gap) => gap.includes('海报'));
  const questions: Question[] = [];
  const clues: string[] = [];
  const clue = (text: string) => {
    if (text && !clues.includes(text)) clues.push(text);
  };
  for (const raw of gaps.flatMap((item) => item.split(/\r?\n/))) {
    const text = raw.trim().replace(/^[-•]\s*/, '');
    if (!text || auditOnly.test(text)) continue;
    if (clueLabel.test(text) || /^https?:\/\//i.test(text)) {
      clue(text.replace(clueLabel, ''));
      continue;
    }
    // A prior report may name a source together with its sampling limitations.
    // Keep that limitation attached, even when no finding passed verification.
    if (/^[^。；]{1,35}(?:报告|调查)(?:标注|显示|指出|提及|提示)/.test(text)) {
      clue(text);
      continue;
    }
    const sentences = text.replace(questionLabel, '').match(/[^。！？!?]+[。！？!?]?/g) ?? [];
    const content = sentences.filter((part) => {
      if (!/(?:仅为|作为|只作|仅作|只是).{0,12}线索/.test(part)) return true;
      clue(part.trim());
      return false;
    }).join('').trim();
    if (!content) continue;
    let item = posterDecision(content, posterReport);
    if (!item) {
      const pair = content.match(/^(.+?[？?]|.+?)[。；;\s]*(?:为什么要查|补查原因|判断原因|原因|策略用途|对策略的影响)[：:]\s*(.+)$/);
      const natural = pair ?? content.match(/^(.+?[？?])\s*((?:这将|这会|答案将|答案会|会|将)?(?:影响|决定).+)$/);
      if (natural) {
        const question = natural[1].trim();
        const reason = natural[2].trim();
        if (
          /[？?]$|如何|能否|是否|哪[些个里种类]|什么|谁|怎样|多少|为何|为什么/.test(question) &&
          /策略|取舍|投放|表达|排序|选择|决定|影响|判断|优先|定位|主推|卖点|侧重/.test(reason)
        ) item = { question, reason };
      }
    }
    if (item && !questions.some((entry) => entry.question === item.question)) questions.push(item);
  }
  return { questions, clues };
}
