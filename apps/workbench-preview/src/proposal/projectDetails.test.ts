import { describe, expect, it } from 'vitest';
import { confirmationOwner, presentationTimeLabel, projectBriefSummary } from './projectDetails';

const task = { assignment: '旧任务摘要', output: '旧交付要求', occasion: '线下陈列', scope: ['旧限制'], inputs: [], unknowns: [] };
const brief = { version: 2, confirmedAt: null, background: '已保存项目背景', researchQuestions: ['用户在意哪些因素？'], provenance: {}, objectives: ['当前目标', '第二项目标'], deliverables: ['当前交付要求'], constraints: ['品牌蓝色不变'], audience: '办公室工作者', brand: '测试品牌', timeline: '内部评审另定', openQuestions: ['印刷规格待确认'] };

describe('project display details', () => {
  it('summarizes the saved working brief and retains its draft identity', () => {
    expect(projectBriefSummary({ brief, task })).toEqual({ source: 'brief', version: 2, confirmed: false, background: brief.background, researchQuestions: brief.researchQuestions, objectives: brief.objectives, deliverables: brief.deliverables, constraints: brief.constraints, audience: brief.audience, brand: brief.brand, timeline: brief.timeline, openQuestions: brief.openQuestions });
  });
  it('does not resurrect old authored text after working fields were cleared', () => {
    const summary = projectBriefSummary({ brief: { ...brief, objectives: [], deliverables: [], constraints: [], audience: '', brand: '', timeline: '', openQuestions: [] }, task });
    expect(summary.objectives).toEqual([]);
    expect(summary.deliverables).toEqual([]);
    expect(summary.constraints).toEqual([]);
    expect(summary.audience).toBe('');
  });
  it('uses proposal extras only when a successful read has no working brief', () => {
    expect(projectBriefSummary({ brief: null, task })).toMatchObject({ source: 'proposal', objectives: ['旧任务摘要'], deliverables: ['旧交付要求'], constraints: [], scope: ['旧限制'] });
  });
  it('records confirmed source identity without inventing a scene', () => {
    const summary = projectBriefSummary({ brief: { ...brief, confirmedAt: '2026-12-01T10:00:00Z' }, task });
    expect(summary).toMatchObject({ source: 'brief', version: 2, confirmed: true });
    expect('occasion' in summary).toBe(false);
  });
  it('does not expose source arrays to display mutations', () => {
    const summary = projectBriefSummary({ brief, task });
    summary.objectives.push('显示层临时内容');
    expect(brief.objectives).toEqual(['当前目标', '第二项目标']);
  });
  it('keeps the saved local reporting date and time unchanged', () => {
    expect(presentationTimeLabel('2027-01-01T00:05')).toBe('汇报时间 2027年1月1日 00:05');
    expect(presentationTimeLabel('2026-02-30T12:00')).toBe('汇报时间待定');
    expect(presentationTimeLabel(undefined)).toBe('汇报时间待定');
  });
  it('uses the configured owner role without inferring from the viewer or presence', () => {
    expect(confirmationOwner([{ id: 'operator', name: '正在查看的人', role: 'operator' }, { id: 'owner', name: '林予', role: 'pitch_owner' }])).toBe('林予 · 比稿负责人');
    expect(confirmationOwner([])).toBe('比稿负责人');
    expect(confirmationOwner([{ id: 'a', name: '甲', role: 'pitch_owner' }, { id: 'b', name: '乙', role: 'pitch_owner' }])).toBe('比稿负责人');
  });
});
