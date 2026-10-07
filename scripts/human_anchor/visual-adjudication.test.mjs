import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createCipheriv } from 'node:crypto';
import { openHuman, sha, maskCases, validateReviews, summarise } from './visual-adjudication.mjs';

const human = { shots: { s: { personCount: '2', actions: ['移动'], objects: ['容器'] } }, pairs: {} };
const judge = { records: [{ id: 's', fields: { personCount: '1', actions: ['no_clear_action'], objects: ['no_key_object'] } }] };
const tasks = [{ id: 's', kind: 'shot', media: [{ path: '/synthetic/frame.jpg', sha256: 'synthetic' }] }];
const disagreements = ['personCount', 'actions', 'objects'].map(field => ({ id: 's', field }));
test('only minimal field values exported with randomized hidden provenance', () => {
  const input = structuredClone(human);
  const m = maskCases({ human, judge, disagreements: [...disagreements, { id: 's', field: 'speakerSource' }], tasks, chooseSide: () => 'B' });
  assert.equal(m.mapping.length, 3); assert.equal(m.bundles.personCount[0].answerB, '2');
  assert.deepEqual(m.bundles.actions[0].answerB, ['moving']);
  for (const group of Object.values(m.bundles)) for (const r of group) assert.deepEqual(Object.keys(r).sort(), ['answerA', 'answerB', 'field', 'id', 'media']);
  assert.deepEqual(human, input);
});
test('review validation rejects missing, duplicate and wrong-category first answers', () => {
  const m = maskCases({ human, judge, disagreements, tasks });
  const r = Object.fromEntries(Object.entries(m.bundles).map(([f, rows]) => [f, rows.map(x => ({ id: x.id, verdict: 'A_CORRECT', schema_flags: [] }))]));
  validateReviews(m.bundles, r);
  assert.throws(() => validateReviews(m.bundles, { ...r, actions: [] }), /incomplete/);
  assert.throws(() => validateReviews(m.bundles, { ...r, objects: [r.objects[0], r.objects[0]] }), /duplicate/);
  assert.throws(() => validateReviews(m.bundles, { ...r, personCount: [{ ...r.personCount[0], verdict: 'HUMAN_CORRECT' }] }), /Invalid/);
});
test('origin reveal translates sides, preserves all five bins and excludes answer values', () => {
  const mapping = [
    { id: 'a', field: 'personCount', shot_id: 's', humanSide: 'A' },
    { id: 'b', field: 'personCount', shot_id: 's', humanSide: 'A' },
    { id: 'c', field: 'actions', shot_id: 's', humanSide: 'B' },
    { id: 'd', field: 'objects', shot_id: 's', humanSide: 'B' },
    { id: 'e', field: 'objects', shot_id: 's', humanSide: 'B' }
  ];
  const row = (id, verdict) => ({ id, verdict, schema_flags: [] });
  const r = summarise(mapping, { personCount: [row('a', 'A_CORRECT'), row('b', 'B_CORRECT')], actions: [row('c', 'BOTH_REASONABLE_TAXONOMY_AMBIGUITY')], objects: [row('d', 'INSUFFICIENT_VISUAL_EVIDENCE'), row('e', 'TECHNICAL_FAILURE')] });
  assert.equal(r.counts.personCount.HUMAN_CORRECT, 1); assert.equal(r.counts.personCount.JUDGE_CORRECT, 1);
  assert.equal(r.counts.objects.disagreements, 2);
  for (const count of Object.values(r.counts)) assert.equal(Object.entries(count).filter(([k]) => k !== 'disagreements').reduce((s, [, v]) => s + v, 0), count.disagreements);
  assert.ok(r.cases.every(x => !('humanSide' in x) && !('answerA' in x)));
});
test('synthetic envelope authentication and canonical commitment enforced without secrets in errors', () => {
  const password = 'synthetic-password', manifest = 'synthetic-manifest', iterations = 100000, salt = Buffer.alloc(16, 3), iv = Buffer.alloc(12, 4);
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  const answer = sha(JSON.stringify(canonical({ manifest, shots: human.shots, pairs: human.pairs })));
  const key = pbkdf2Sync(password, salt, iterations, 32, 'sha256'), cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(human)), cipher.final(), cipher.getAuthTag()]); key.fill(0);
  const envelope = { manifest, answer_sha256: answer, iterations, salt: salt.toString('base64'), iv: iv.toString('base64'), cipher: encrypted.toString('base64') };
  const config = { expectedManifest: manifest, expectedAnswerHash: answer };
  const result = openHuman(envelope, password, config); assert.deepEqual(result.human, human); result.key.fill(0);
  assert.throws(() => openHuman(envelope, 'wrong', config), /Local authentication failed/);
  assert.throws(() => openHuman(envelope, password, { ...config, expectedAnswerHash: 'changed' }), /commitment mismatch/);
});
