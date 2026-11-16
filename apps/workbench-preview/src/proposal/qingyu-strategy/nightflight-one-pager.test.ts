import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StrategyOutput } from '../../../nightflight/src/components/StrategyOutput';
import type { Project } from '../../../nightflight/src/live';

const project: Project = {
  id: 'strategy-test', title: '燕麦饮', stage: 'strategy', status: 'waiting',
  revision: 1, mode: 'auto', brief: '', events: [], artifacts: [], directions: [],
};
const text = [
  '## 核心策略', '先认出品类，再辨别风味。', '## 人群洞察', '经过冷柜时要快速比较。',
  '## 品牌角色', '提供随身可带的原味燕麦饮。', '## 核心主张', '把品类与风味放在同一视线。',
  '- 放大品类字', '- 收拢规格行', '- 留出品牌区',
  '## 视觉与包装触点', '正面主次清楚。', '## 衡量方式', '- 识别品类', '- 复述风味', '- 记住品牌',
  '## 研究结论', '- 研究 2：同类饮品的风味描述不同（样本官网）',
  '## 方向交叉点', '本轮工作判断', '## 推导依据', '不相关的执行记录',
].join('\n');
function render(body: string, p: Project = project) {
  return renderToStaticMarkup(createElement(StrategyOutput, { p, text: body }));
}
describe('夜航策略正文', () => {
  it('保留核心原句及四个交付小节，隐藏后台执行记录', () => {
    const html = render(text);
    expect([...html.matchAll(/<h3>(.*?)<\/h3>/g)].map(m=>m[1])).toEqual(['人群洞察','品牌角色','核心主张','视觉与包装触点']);
    expect(html).not.toContain('衡量方式');
    expect(render(text.replace(/## 衡量方式[\s\S]*?(?=## 研究结论)/, ''))).toBe(html);
    expect(html).toContain('先认出品类，再辨别风味。');
    expect(html).toContain('收拢规格行');
    expect(html).not.toContain('不相关的执行记录');
    expect(html).not.toContain('本轮工作判断');
    expect(html).toContain('<summary>查看研究依据（1）</summary>');
  });
  it('按一基索引核对本版的研究来源', () => {
    const findings = ['未被引用的材料', '同类饮品的风味描述不同'].map((conclusion, i) => ({
      conclusion, evidence: '来源原句' + i, source: '样本官网', url: 'https://example.org/' + i, implication: '',
    }));
    const html = render(text, { ...project, research: { ready: true, findings, gaps: [], next: '' } });
    expect(html).toContain('https://example.org/1');
    expect(html).toContain('来源原句1');
    expect(html).not.toContain('未被引用的材料');
  });
  it('旧三板块稿仍可查看；研究待补时回到本项目研究', () => {
    expect(render('## 核心策略\n先陈列小包装。\n## 研究结论\n门店只取出了小规格。\n## 方向交叉点\n规格与场景相合。')).toContain('规格与场景相合');
    const waiting = render(text, { ...project, research: { ready: false, findings: [], gaps: [], next: '' } });
    expect(waiting).toContain('#/p/strategy-test?stage=research');
    expect(waiting).not.toContain('先认出品类');
  });
});
