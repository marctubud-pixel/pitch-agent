import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SIMPLE_STRATEGY_VERSION, createSimpleStrategyBasis, buildSimpleStrategyRequest, validateSimpleStrategyOutput, simpleStrategySections, simpleStrategyRestrictions} from './seven-stage-strategy.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const researchText = JSON.stringify({summary: '包装需要先让产品类别清楚。', gaps: ['未验证消费偏好。']}, null, 2);
const basis = (brief = '品牌甲包装，产品用泉水，面向日常饮茶者。') => createSimpleStrategyBasis({projectId: 'p', taskCard: {id: 't1', brief}, research: {artifactId: 'r1', contentText: researchText, contentHash: hash(researchText)}, limitations: ['未验证消费偏好。']});
const ref = (sourceId, location, quote) => ({sourceId, location, quote});
const point = (id, text, kind, refs, limitations = []) => ({id, text, kind, refs, limitations});
function output(b = basis()) {
  const research = ref('research:r1', '/summary', '产品类别清楚');
  const task = ref('task:t1', '/text', '产品用泉水');
  return {strategyContractVersion: SIMPLE_STRATEGY_VERSION, strategyBasisHash: b.basisHash, outputKind: 'strategy', status: 'complete', title: '明确产品与用水关系', summary: '在品类清楚的基础上解释用水。',
    strategy: {researchConclusions: [point('research', '优先让类别清楚。', 'inference', [research])], intersection: point('intersection', '清楚交代茶与用水的关系。', 'inference', [research, task]), focus: point('focus', '优先放大具体用水关联，保留茶的基本信息。', 'inference', [research, task])}, gaps: [], limitations: ['未验证消费偏好。']};
}

test('three blocks consume exact research and raw task without optional product/user fields', () => {
  const b = basis(), result = validateSimpleStrategyOutput(JSON.stringify(output(b)), b);
  assert.deepEqual(simpleStrategySections(result).map(s => s.heading), ['研究结论', '方向交叉点', '策略发力点']);
  assert.ok(simpleStrategySections(result)[1].refs.some(r => r.sourceId === 'task:t1'));
  const request = buildSimpleStrategyRequest(b);
  assert.ok(request.prompt.includes(researchText.replaceAll('\n', '\\n').replaceAll('"', '\\"')));
  assert.deepEqual(Object.keys(request.outputSchema.properties.strategy.properties), ['researchConclusions', 'intersection', 'focus']);
});
test('BriefEnvelope remains unparsed original JSON and quotes actual locations', () => {
  const original = JSON.stringify({background: '产品用泉水', metadata: {hidden: 'untouched'}});
  const b = basis(original), value = output(b);
  for (const p of [value.strategy.intersection, value.strategy.focus]) p.refs[1] = ref('task:t1', '/background', '产品用泉水');
  assert.equal(validateSimpleStrategyOutput(value, b).status, 'complete');
  assert.equal(b.sources[0].contentText, original);
  value.strategy.focus.refs[1].location = '/text';
  assert.throws(() => validateSimpleStrategyOutput(value, b), /Quote not found/);
});
test('exact original hashes and basis mutation cannot be reused', () => {
  assert.throws(() => createSimpleStrategyBasis({projectId: 'p', taskCard: {id: 't', brief: 'brief'}, research: {artifactId: 'r', contentText: researchText, contentHash: hash('other')}}), /hash mismatch/);
  const b = basis(); b.sources[1].contentText = 'changed';
  assert.throws(() => buildSimpleStrategyRequest(b), /basis changed/);
  const old = output(), next = basis('修订后的产品用泉水。');
  assert.throws(() => validateSimpleStrategyOutput(old, next), /version mismatch/);
});
test('missing input retains existing conclusions and specific gap without invented direction', () => {
  const b = basis(), value = output(b);
  value.status = 'blocked'; value.strategy.intersection = null; value.strategy.focus = null; value.gaps = ['尚不清楚产品有哪些值得放大的特质。'];
  assert.equal(validateSimpleStrategyOutput(value, b).strategy.focus, null);
  assert.equal(simpleStrategySections(value)[0].body, '优先让类别清楚。');
  value.gaps = [];
  assert.throws(() => validateSimpleStrategyOutput(value, b), /specific reason/);
});
test('source quotations and required original limits are preserved', () => {
  const b = basis(), value = output(b);
  value.strategy.focus.refs[0].quote = '用户偏好已经验证';
  assert.throws(() => validateSimpleStrategyOutput(value, b), /Quote not found/);
  value.strategy.focus.refs[0].quote = '产品类别清楚'; value.limitations = [];
  assert.throws(() => validateSimpleStrategyOutput(value, b), /limitations cannot/);
});
test('task requirements and explicit assumptions cannot become facts', () => {
  const b = basis(), value = output(b);
  value.strategy.intersection.kind = 'fact';
  assert.throws(() => validateSimpleStrategyOutput(value, b), /cannot become fact/);
  value.strategy.intersection.kind = 'assumption'; value.strategy.intersection.limitations = [];
  assert.throws(() => validateSimpleStrategyOutput(value, b), /assumptions need limits/);
});
test('assumption source must stay uncertain, and restrictions retain stable paths', () => {
  const b = createSimpleStrategyBasis({projectId: 'p', taskCard: {id: 't1', brief: '产品用泉水'}, research: {artifactId: 'r1', contentText: researchText, contentHash: hash(researchText)}, sources: [{id: 'user-context', role: 'user', nature: 'assumption', contentText: '可能更容易记住'}]});
  const value = output(b); value.limitations = [];
  value.strategy.focus.refs.push(ref('user-context', '/text', '可能更容易记住'));
  assert.throws(() => validateSimpleStrategyOutput(value, b), /retain uncertainty/);
  value.strategy.focus.limitations = ['仅为记忆效果假设。'];
  assert.equal(validateSimpleStrategyOutput(value, b).status, 'complete');
  assert.deepEqual(simpleStrategyRestrictions(value), [{id: 'simple-strategy:/strategy/focus/limitations/0', kind: 'limitations', text: '仅为记忆效果假设。'}]);
});
test('complete cannot consist of one source, empty blocks, or old candidates and reasoning', () => {
  const b = basis(), value = output(b);
  value.strategy.intersection.refs = value.strategy.intersection.refs.slice(0, 1); value.strategy.focus.refs = value.strategy.focus.refs.slice(0, 1);
  assert.throws(() => validateSimpleStrategyOutput(value, b), /connect research/);
  const old = output(b); old.strategy.candidateCuts = []; old.strategy.reasoning = {};
  assert.throws(() => validateSimpleStrategyOutput(old, b), /Exactly three/);
  const empty = output(b); empty.strategy.focus = null;
  assert.throws(() => validateSimpleStrategyOutput(empty, b), /all three blocks/);
});
test('prototype paths and duplicate source/point identities cannot forge originals', () => {
  const b = basis(), value = output(b);
  value.strategy.focus.refs[0].location = '/__proto__/summary';
  assert.throws(() => validateSimpleStrategyOutput(value, b), /Quote not found/);
  const duplicate = output(b); duplicate.strategy.focus.id = duplicate.strategy.intersection.id;
  assert.throws(() => validateSimpleStrategyOutput(duplicate, b), /Unique substantive/);
  assert.throws(() => createSimpleStrategyBasis({projectId: 'p', taskCard: {id: 't1', brief: '产品'}, research: {artifactId: 'r1', contentText: researchText, contentHash: hash(researchText)}, sources: [{id: 'task:t1', role: 'product', nature: 'fact', contentText: '重复来源'}]}), /Unique original/);
});
