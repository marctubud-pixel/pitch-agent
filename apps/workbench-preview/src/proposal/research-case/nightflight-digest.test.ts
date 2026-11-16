import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResearchDigest } from '../../../nightflight/src/components/TextStageOutput';
import type { Project, ResearchImage } from '../../../nightflight/src/live';

const sample: ResearchImage = {
  name: 'carton.png', sha256: 'source-image', title: '盒装样本', pageUrl: 'https://brand.example/case',
  sourceUrl: 'https://brand.example/image', observation: '正面品类字位于品牌名下方。',
};
type Report = NonNullable<Project['research']>;
function render(image: ResearchImage, ready = true, advice?: Report['strategyAdvice']) {
  const report: Report = {
    ready, gaps: [], next: '',
    findings: [
      { conclusion: '受访者关注口味', evidence: '原问卷发现', url: 'https://example.org/report', source: '调查原表', implication: '' },
      { conclusion: '包装使用两级信息', evidence: '', url: '', source: '', implication: '', images: [image] },
    ],
    digest: [{ chapter: '竞争与同类传播', title: '正面层级', detail: '两个层级', findingIndex: 1 }],
    strategyAdvice: advice,
  };
  return renderToStaticMarkup(createElement(ResearchDigest, { report, artifacts: [] }));
}
describe('夜航研究图例和策略交接', () => {
  it('把创作者原话与自己的观察和启发绑定在同一图例', () => {
    const html = render({ ...sample, rationaleQuote: '设计说明原话', creatorRationale: '创作者解释',
      rationaleSourceUrl: 'https://studio.example/statement', takeaway: '可用于比较的做法' });
    expect(html).toContain('https://studio.example/statement');
    expect(html).toContain('<blockquote>设计说明原话</blockquote>');
    expect(html).toContain('可用于比较的做法');
    expect(render({ ...sample, creatorRationale: '无出处的解释' })).not.toContain('无出处的解释');
    expect(render(sample)).not.toContain('创作者说明');
  });
  it('一条建议只列所引发现及原出处，旧稿或待补时不展示交接建议', () => {
    const advice = [{ recommendation: '先比较两种口味表达', findingIndices: [0] }];
    const html = render(sample, true, advice);
    const section = html.slice(html.indexOf('给策略的建议'));
    expect(section).toContain('原问卷发现');
    expect(section).toContain('https://example.org/report');
    expect(section).not.toContain('盒装样本');
    expect(render(sample, false, advice)).not.toContain('先比较两种口味表达');
    expect(render(sample)).not.toContain('给策略的建议');
  });
});
