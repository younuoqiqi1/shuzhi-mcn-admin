import test from 'node:test';
import assert from 'node:assert/strict';

const api = await import('./evaluate.mjs').catch(() => ({}));
const requireApi = name => assert.equal(typeof api[name], 'function', `${name} must be implemented`);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('Wilson 30/30 lower bound matches the known 95% score interval', () => {
  requireApi('wilson');
  const ci = api.wilson(30, 30);
  near(ci[0], 0.8864866068260312);
  near(ci[1], 1);
  assert.equal(api.wilson(0, 0), null);
});

test('accuracy and kappa preserve missing predictions as errors', () => {
  requireApi('categorical');
  const m = api.categorical(['a', 'a', 'b', 'b'], ['a', 'b', 'b', 'b']);
  near(m.accuracy, 0.75);
  near(m.kappa, 0.5);
  assert.equal(api.categorical(['a', 'b'], [null, null]).accuracy, 0);
  assert.equal(api.categorical([null], [null]).accuracy, 0);
  assert.equal(api.categorical(['uncertain'], ['uncertain']).accuracy, 1);
});

test('multilabel micro F1 counts both false positives and missed labels', () => {
  requireApi('multilabel');
  const m = api.multilabel([['a', 'b'], ['a']], [['a'], ['b']]);
  near(m.microF1, 0.4);
  assert.equal(m.exactSet, 0);
  assert.equal(api.multilabel([['uncertain']], [['no_clear_action']]).exactSet, 0);
});

test('person missing predictions remain incorrect for supported same/different classes', () => {
  requireApi('personMetrics');
  const m = api.personMetrics(['same_person', 'same_person', 'different_person', 'different_person'], ['same_person', 'different_person', 'different_person', null]);
  near(m.balancedAccuracy, 0.5);
  near(m.macroF1, 7 / 12);
  assert.equal(api.personMetrics(['same_person'], ['same_person']).balancedAccuracy, null);
});

test('gate cannot PASS with a missing CI, insufficient n, or a crossing CI', () => {
  requireApi('judgeDecision');
  assert.equal(api.judgeDecision([{ value: .9, ci: [.72, .97], min: .85, ciMin: .7 }], 30), 'PASS');
  assert.equal(api.judgeDecision([{ value: .9, ci: null, min: .85, ciMin: .7 }], 30), 'INCONCLUSIVE');
  assert.equal(api.judgeDecision([{ value: .83, ci: [.65, .94], min: .85, ciMin: .7 }], 30), 'INCONCLUSIVE');
  assert.equal(api.judgeDecision([{ value: .1, ci: [.01, .3], min: .85, ciMin: .7 }], 30), 'FAIL');
  assert.equal(api.judgeDecision([{ value: 1, ci: [.8, 1], min: .8, ciMin: .6 }], 10, 15), 'INCONCLUSIVE');
});

function fixture() {
  const shots = {}, pairs = {}, tasks = [], records = [];
  for (let i = 0; i < 30; i++) {
    const id = `shot_${i}`;
    const zh = { boundary: i % 2 ? '可用' : '不可用', personCount: i % 2 ? '1' : '2', scene: i % 2 ? '室内' : '室外', actions: ['坐/站'], objects: ['家具'], speechStatus: '可辨语音', speakerSource: '画面中人物' };
    shots[id] = zh;
    tasks.push({ id, kind: 'shot', stratum: ['early', 'mid', 'late'][Math.floor(i / 10)] });
    records.push({ id, kind: 'shot', fields: { ...zh, boundary: i % 2 ? 'usable' : 'unusable', scene: i % 2 ? 'indoor' : 'outdoor', actions: ['sitting_or_standing'], objects: ['furniture'], speechStatus: null, speakerSource: null }, field_status: { speechStatus: 'failed', speakerSource: 'failed' } });
  }
  for (let i = 0; i < 20; i++) {
    const id = `pair_${i}`;
    pairs[id] = { decision: i % 2 ? '同一人' : '不同人', leftPoint: { x: .3, y: .4 }, rightPoint: { x: .3, y: .4 } };
    tasks.push({ id, kind: 'pair', left_id: `shot_${i}`, right_id: `shot_${i + 1}` });
    records.push({ id, kind: 'pair', fields: { decision: i % 2 ? 'same_person' : 'different_person' } });
  }
  return { human: { shots, pairs }, judge: { records }, tasks, bootstrapIterations: 100 };
}

test('field-level failed audio cannot discard valid visual fields or inflate denominators', () => {
  requireApi('evaluateCalibration');
  const input = fixture(), before = JSON.stringify(input.human);
  const r = api.evaluateCalibration(input);
  assert.equal(r.completion.shots, 30);
  assert.equal(r.completion.pairs, 20);
  assert.equal(r.metrics.boundary.accuracy, 1);
  assert.equal(r.metrics.speechStatus.accuracy, 0);
  assert.equal(r.metrics.speechStatus.n, 30);
  assert.equal(r.metrics.speakerSource.n, 30);
  assert.equal(r.metrics.speechStatus.status, 'FAIL');
  assert.equal(r.conclusion, 'FAIL');
  assert.equal(r.timing.active_seconds, null);
  assert.equal(r.timing.budget_result, 'NOT_APPLICABLE_V4');
  assert.equal(JSON.stringify(input.human), before);
  assert.equal(r.disagreements.length, 60);
  assert.ok(r.disagreements.every(x => !('human_value' in x) && !('judge_value' in x)));
});

test('no-speech Speaker is inapplicable even when legacy source choices remain', () => {
  requireApi('evaluateCalibration');
  const input = fixture();
  for (const h of Object.values(input.human.shots)) h.speechStatus = '无可辨说话';
  const r = api.evaluateCalibration(input);
  assert.equal(r.metrics.speakerSource.n, 0);
  assert.equal(r.metrics.speakerSource.status, 'INCONCLUSIVE');
});
