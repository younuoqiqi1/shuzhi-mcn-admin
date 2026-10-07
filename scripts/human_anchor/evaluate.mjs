// Pure evaluator: no files, network, credentials or mutation of either frozen answer set.
export function wilson(success, n) {
  if (!(n > 0)) return null;
  const z = 1.959963984540054, z2 = z * z, p = success / n, den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / den;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export function categorical(truth, pred, weights = truth.map(() => 1)) {
  const a = new Map(), b = new Map(); let n = 0, correct = 0;
  truth.forEach((value, i) => {
    const w = weights[i] || 0, t = value ?? '__human_missing__', p = pred[i] ?? '__judge_missing__';
    n += w; a.set(t, (a.get(t) || 0) + w); b.set(p, (b.get(p) || 0) + w);
    if (value != null && pred[i] != null && value === pred[i]) correct += w;
  });
  if (!n) return { accuracy: null, kappa: null, correct, n };
  const accuracy = correct / n;
  const pe = [...a].reduce((sum, [k, v]) => sum + v * (b.get(k) || 0), 0) / n ** 2;
  return { accuracy, kappa: 1 - pe > 1e-12 ? (accuracy - pe) / (1 - pe) : null, correct, n };
}

export function multilabel(truth, pred, weights = truth.map(() => 1)) {
  let tp = 0, fp = 0, fn = 0, exact = 0, n = 0;
  truth.forEach((value, i) => {
    const w = weights[i] || 0;
    const a = new Set(Array.isArray(value) && value.length ? value : ['__human_missing__']);
    const b = new Set(Array.isArray(pred[i]) && pred[i].length ? pred[i] : ['__judge_missing__']);
    n += w;
    for (const x of a) { if (b.has(x)) tp += w; else fn += w; }
    for (const x of b) if (!a.has(x)) fp += w;
    if (a.size === b.size && [...a].every(x => b.has(x))) exact += w;
  });
  return { microF1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null,
    precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null,
    exactSet: n ? exact / n : null, tp, fp, fn, n };
}

export function personMetrics(truth, pred, weights = truth.map(() => 1)) {
  const recalls = [], f1s = [], supports = [];
  for (const label of ['same_person', 'different_person']) {
    let tp = 0, fp = 0, fn = 0;
    truth.forEach((t, i) => {
      const w = weights[i] || 0;
      if (t === label) { if (pred[i] === label) tp += w; else fn += w; }
      else if (pred[i] === label) fp += w;
    });
    supports.push(tp + fn);
    recalls.push(tp + fn ? tp / (tp + fn) : null);
    f1s.push(2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null);
  }
  return { balancedAccuracy: recalls.every(x => x != null) ? (recalls[0] + recalls[1]) / 2 : null,
    macroF1: supports.every(x => x > 0) && f1s.every(x => x != null) ? (f1s[0] + f1s[1]) / 2 : null,
    supports, n: weights.reduce((a, b) => a + b, 0) };
}

export function judgeDecision(criteria, n, minN = 1) {
  if (n < minN || !criteria.length) return 'INCONCLUSIVE';
  if (criteria.some(c => c.ci && c.ci[1] < c.min)) return 'FAIL';
  if (criteria.every(c => c.value != null && c.ci && c.value >= c.min && c.ci[0] >= c.ciMin)) return 'PASS';
  return 'INCONCLUSIVE';
}

const MAP = {
  boundary: { '可用': 'usable', '不可用': 'unusable', '不确定': 'uncertain' },
  personCount: { '不确定': 'uncertain' },
  scene: { '室内': 'indoor', '室外': 'outdoor', '车辆/交通工具内': 'vehicle_interior', '过渡/无法归类': 'transition_unclear', '其他': 'other', '不确定': 'uncertain' },
  actions: { '坐/站': 'sitting_or_standing', '移动': 'moving', '说话/交流': 'speaking_or_interacting', '操作/拿取物体': 'handling_object', '其他': 'other', '无明显动作': 'no_clear_action', '不确定': 'uncertain' },
  objects: { '家具': 'furniture', '容器': 'container', '纸张/文档': 'paper_or_document', '设备/工具': 'device_or_tool', '交通工具': 'vehicle', '食物/饮品': 'food_or_drink', '其他': 'other', '无关键物体': 'no_key_object', '不确定': 'uncertain' },
  speechStatus: { '可辨语音': 'intelligible_speech_audible', '无可辨说话': 'no_intelligible_speech', '不确定': 'uncertain' },
  speakerSource: { '画面中人物': 'on_screen_person', '画外音': 'off_screen_voice', '两者都有': 'both_on_and_off_screen', '不确定': 'uncertain' },
  decision: { '同一人': 'same_person', '不同人': 'different_person', '不确定': 'uncertain' }
};
const normal = (field, value) => value == null ? null : Array.isArray(value)
  ? value.map(v => MAP[field]?.[v] ?? v) : MAP[field]?.[value] ?? value;
const same = (a, b) => a != null && b != null && (Array.isArray(a)
  ? Array.isArray(b) && new Set(a).size === new Set(b).size && a.every(x => b.includes(x)) : a === b);
const criterion = (value, ci, min, ciMin) => ({ value, ci, min, ciMin });

function rng(seed) {
  // Deterministic seed recorded by v4; no dependence on answers.
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function percentile(values, p) {
  const at = (values.length - 1) * p, lo = Math.floor(at), hi = Math.ceil(at);
  return values[lo] + (values[hi] - values[lo]) * (at - lo);
}

export function evaluateCalibration({ human, judge, tasks, bootstrapIterations = 10000, blindnessConfirmed = true }) {
  const shotTasks = tasks.filter(t => t.kind === 'shot'), pairTasks = tasks.filter(t => t.kind === 'pair');
  if (shotTasks.length !== 30 || pairTasks.length !== 20) throw Error('Frozen 30/20 task counts required');
  const byId = new Map(judge.records.map(r => [r.id, r]));
  if (byId.size !== judge.records.length) throw Error('Duplicate Judge IDs');
  const columns = ['boundary', 'personCount', 'scene', 'actions', 'objects', 'speechStatus', 'speakerSource'];
  const truth = {}, prediction = {}, failureCounts = {};
  for (const key of columns) {
    truth[key] = shotTasks.map(t => normal(key, human.shots?.[t.id]?.[key]));
    prediction[key] = shotTasks.map(t => {
      const r = byId.get(t.id), failed = !r || r.field_status?.[key] === 'failed';
      if (failed || r.fields?.[key] == null) failureCounts[key] = (failureCounts[key] || 0) + 1;
      return failed ? null : normal(key, r.fields?.[key]);
    });
  }
  let shotComplete = 0, pairComplete = 0;
  for (const t of shotTasks) {
    const h = human.shots?.[t.id] || {};
    if (['boundary', 'personCount', 'scene', 'speechStatus'].every(k => h[k])
      && ['actions', 'objects'].every(k => Array.isArray(h[k]) && h[k].length)
      && (normal('speechStatus', h.speechStatus) !== 'intelligible_speech_audible' || h.speakerSource)) shotComplete++;
  }
  for (const t of pairTasks) {
    const h = human.pairs?.[t.id] || {}, d = normal('decision', h.decision);
    if (d === 'uncertain' || ['same_person', 'different_person'].includes(d) && h.leftPoint && h.rightPoint) pairComplete++;
  }
  const speakerIndices = shotTasks.map((_, i) => i).filter(i => truth.speechStatus[i] === 'intelligible_speech_audible');
  const eligiblePairs = pairTasks.filter(t => ['same_person', 'different_person'].includes(normal('decision', human.pairs?.[t.id]?.decision)));
  const personTruth = eligiblePairs.map(t => normal('decision', human.pairs[t.id].decision));
  const personPred = eligiblePairs.map(t => {
    const r = byId.get(t.id); return !r || r.field_status?.decision === 'failed' ? null : normal('decision', r.fields?.decision);
  });
  const metrics = {};
  for (const key of ['boundary', 'personCount', 'scene', 'speechStatus']) {
    const m = categorical(truth[key], prediction[key]); metrics[key] = { ...m, accuracyCI: wilson(m.correct, 30) };
  }
  for (const key of ['actions', 'objects']) metrics[key] = multilabel(truth[key], prediction[key]);
  const spTruth = speakerIndices.map(i => truth.speakerSource[i]), spPred = speakerIndices.map(i => prediction.speakerSource[i]);
  const sp = categorical(spTruth, spPred);
  metrics.speakerSource = { ...sp, accuracyCI: wilson(sp.correct, sp.n), coverage: sp.n / 30, eligibility: 'human intelligible speech' };
  metrics.personConsistency = { ...personMetrics(personTruth, personPred), eligiblePairs: eligiblePairs.length, coverage: eligiblePairs.length / 20 };

  const shotIndex = new Map(shotTasks.map((t, i) => [t.id, i]));
  const strata = ['early', 'mid', 'late'].map(s => shotTasks.map((t, i) => t.stratum === s ? i : -1).filter(i => i >= 0));
  if (strata.some(s => s.length !== 10)) throw Error('Frozen early/mid/late allocation must be 10/10/10');
  const boots = Object.fromEntries(['boundary.kappa', 'personCount.kappa', 'scene.kappa', 'actions.microF1', 'actions.exactSet', 'objects.microF1', 'objects.exactSet', 'personConsistency.balancedAccuracy', 'personConsistency.macroF1'].map(k => [k, { values: [], invalid: 0 }]));
  const random = rng(20261007);
  for (let draw = 0; draw < bootstrapIterations; draw++) {
    const w = shotTasks.map(() => 0);
    for (const group of strata) for (let j = 0; j < group.length; j++) w[group[Math.floor(random() * group.length)]]++;
    const pairWeights = eligiblePairs.map(t => w[shotIndex.get(t.left_id)] * w[shotIndex.get(t.right_id)]);
    const bm = {};
    for (const key of ['boundary', 'personCount', 'scene']) bm[key] = categorical(truth[key], prediction[key], w);
    for (const key of ['actions', 'objects']) bm[key] = multilabel(truth[key], prediction[key], w);
    bm.personConsistency = personMetrics(personTruth, personPred, pairWeights);
    for (const [name, storage] of Object.entries(boots)) {
      const [field, statistic] = name.split('.'), value = bm[field][statistic];
      if (value == null || !Number.isFinite(value)) storage.invalid++; else storage.values.push(value);
    }
  }
  for (const [name, storage] of Object.entries(boots)) {
    const [field, statistic] = name.split('.'); storage.values.sort((a, b) => a - b);
    // Do not condition CI on dropping undefined resamples; v4 requires N/A when not calculable.
    metrics[field][statistic + 'CI'] = storage.invalid || !storage.values.length ? null : [percentile(storage.values, .025), percentile(storage.values, .975)];
    metrics[field][statistic + 'BootstrapInvalid'] = storage.invalid;
  }
  for (const key of ['boundary', 'personCount', 'scene']) {
    const m = metrics[key], isScene = key === 'scene';
    m.status = judgeDecision([criterion(m.accuracy, m.accuracyCI, isScene ? .80 : .85, isScene ? .60 : .70),
      criterion(m.kappa, m.kappaCI, isScene ? .60 : .70, isScene ? .40 : .50)], 30);
  }
  for (const key of ['actions', 'objects']) {
    const m = metrics[key]; m.status = judgeDecision([criterion(m.microF1, m.microF1CI, .80, .60), criterion(m.exactSet, m.exactSetCI, .70, .50)], 30);
  }
  const pm = metrics.personConsistency;
  pm.status = judgeDecision([criterion(pm.balancedAccuracy, pm.balancedAccuracyCI, .80, .55), criterion(pm.macroF1, pm.macroF1CI, .80, .55)], pm.n, 15);
  metrics.speechStatus.status = judgeDecision([criterion(metrics.speechStatus.accuracy, metrics.speechStatus.accuracyCI, .85, .65)], 30);
  sp.status = judgeDecision([criterion(sp.accuracy, metrics.speakerSource.accuracyCI, .80, .60)], sp.n, 15);
  metrics.speakerSource.status = sp.status;

  const disagreements = [];
  for (const t of shotTasks) for (const key of columns) {
    const i = shotIndex.get(t.id);
    if (key === 'speakerSource' && !speakerIndices.includes(i)) continue;
    if (same(truth[key][i], prediction[key][i])) continue;
    const h = truth[key][i], j = prediction[key][i];
    let category = '模型视觉理解错误', certainty = 'hypothesis_not_adjudicated';
    if (j == null) { category = 'Judge missing / failed'; certainty = 'confirmed_output_missing'; }
    else if (h == null || h === 'uncertain' || Array.isArray(h) && h.includes('uncertain')) category = 'Human Anchor 本身可能存在歧义';
    else if (key === 'boundary') category = 'Shot 切分问题';
    else if (h === 'other' || Array.isArray(h) && h.includes('other')) category = '分类定义歧义';
    else if (['speechStatus', 'speakerSource'].includes(key)) category = '其他（音频理解或来源判定）';
    disagreements.push({ id: t.id, field: key, category, certainty });
  }
  for (const t of eligiblePairs) {
    const i = eligiblePairs.indexOf(t);
    if (same(personTruth[i], personPred[i])) continue;
    disagreements.push({ id: t.id, field: 'personConsistency', category: personPred[i] == null ? 'Judge missing / failed' : '人物一致性错误',
      certainty: personPred[i] == null ? 'confirmed_output_missing' : 'hypothesis_not_adjudicated',
      limitation: 'Human/Judge independently selected targets; target ambiguity must be reviewed, not used to change scores' });
  }
  const completion = { shots: shotComplete, shotDenominator: 30, shotRate: shotComplete / 30,
    pairs: pairComplete, pairDenominator: 20, pairRate: pairComplete / 20, allRate: (shotComplete + pairComplete) / 50,
    status: shotComplete === 30 && pairComplete === 20 ? 'PASS' : 'FAIL' };
  const states = [completion.status, ...Object.values(metrics).map(m => m.status)];
  const conclusion = !blindnessConfirmed ? 'INCONCLUSIVE' : states.includes('FAIL') ? 'FAIL' : states.every(s => s === 'PASS') ? 'PASS' : 'INCONCLUSIVE';
  return { protocol: 'HA-DEV-2026-10-07-v4 with recorded amendments', timing: { active_seconds: null, budget_result: 'NOT_APPLICABLE_V4', reason: 'Timing removed before annotation by user instruction' },
    completion, metrics, conclusion, blindnessConfirmed, failureCounts, disagreements,
    failureAnalysisCounts: disagreements.reduce((a, x) => { a[x.category] = (a[x.category] || 0) + 1; return a; }, {}),
    failureAnalysisLimitation: 'Disagreement-based candidate categories; missing/failed is definite, perceptual root causes not independently adjudicated.',
    bootstrap: { iterations: bootstrapIterations, seed: 20261007, unit: 'stratified Shot cluster', pairMethod: 'product of sampled multiplicities of both endpoint Shot clusters', undefinedDraws: 'CI N/A if any undefined draw; no conditional deletion' },
    humanSubmissionFlag: human.finished === true, recommendation: 'STOP awaiting Review; no automatic next stage' };
}
