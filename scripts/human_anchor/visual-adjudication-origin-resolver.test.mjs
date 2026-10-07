import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoverMapping } from './visual-adjudication-origin-resolver.mjs';
import { summarise } from './visual-adjudication.mjs';
const media = [{ label: '25%', path: '/synthetic/frame.jpg', sha256: 'synthetic' }];
const tasks = [{ kind: 'shot', id: 's', media }];
const judge = { records: [{ id: 's', fields: { personCount: '2', actions: ['moving', 'handling_object'], objects: ['furniture'] } }] };
const disagreements = ['personCount', 'actions', 'objects'].map(field => ({ id: 's', field }));
const bundles = {
  personCount: [{ id: 'c', media, answerA: '2', answerB: '1' }],
  actions: [{ id: 'a', media, answerA: ['sitting_or_standing'], answerB: ['handling_object', 'moving'] }],
  objects: [{ id: 'o', media, answerA: ['container'], answerB: ['furniture'] }]
};
test('unique source matches recover side assignment without Human data, independent of label order', () => {
  const before = JSON.stringify(bundles), mapping = recoverMapping(bundles, tasks, judge, disagreements);
  assert.deepEqual(mapping.map(x => x.humanSide), ['B', 'A', 'A']);
  const row = (id, verdict) => ({ id, verdict, schema_flags: [] });
  const result = summarise(mapping, { personCount: [row('c', 'A_CORRECT')], actions: [row('a', 'A_CORRECT')], objects: [row('o', 'BOTH_REASONABLE_TAXONOMY_AMBIGUITY')] });
  assert.equal(result.counts.personCount.JUDGE_CORRECT, 1); assert.equal(result.counts.actions.HUMAN_CORRECT, 1);
  assert.equal(result.counts.objects.BOTH_REASONABLE_TAXONOMY_AMBIGUITY, 1); assert.equal(JSON.stringify(bundles), before);
});
test('no guessing when zero or two proposal sides match the committed Judge', () => {
  for (const answerB of ['2', '3']) {
    const changed = structuredClone(bundles); changed.personCount[0].answerB = answerB;
    if (answerB === '3') changed.personCount[0].answerA = '4+';
    assert.throws(() => recoverMapping(changed, tasks, judge, disagreements), /exactly one result/);
  }
});
test('source task replacement, duplication and omission abort rather than changing denominators', () => {
  assert.throws(() => recoverMapping(bundles, [...tasks, { ...tasks[0], id: 's2' }], judge, disagreements), /not unique/);
  assert.throws(() => recoverMapping({ ...bundles, objects: [] }, tasks, judge, disagreements), /coverage incomplete/);
  assert.throws(() => recoverMapping({ ...bundles, personCount: [...bundles.personCount, bundles.personCount[0]] }, tasks, judge, disagreements), /duplicate/);
});
