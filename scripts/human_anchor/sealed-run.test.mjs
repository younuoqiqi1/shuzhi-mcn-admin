import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createCipheriv, pbkdf2Sync } from 'node:crypto';

const api = await import('./sealed-run.mjs').catch(() => ({}));
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;

function fixture() {
  const human = { shots: {}, pairs: {}, finished: true };
  const tasks = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, kind: 'shot', stratum: ['early', 'mid', 'late'][Math.floor(i / 10)] }))
    .concat(Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, kind: 'pair', left_id: `s${i}`, right_id: `s${i + 1}` })));
  const manifest = 'a'.repeat(64), password = 'synthetic-test-only';
  const key = pbkdf2Sync(password, Buffer.alloc(16, 1), 100000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, Buffer.alloc(12, 2));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(human)), cipher.final(), cipher.getAuthTag()]);
  const envelope = { version: 4, iterations: 100000, salt: Buffer.alloc(16, 1).toString('base64'), iv: Buffer.alloc(12, 2).toString('base64'), cipher: ciphertext.toString('base64'), manifest,
    answer_sha256: hash(JSON.stringify(canonical({ manifest, shots: human.shots, pairs: human.pairs }))) };
  const judgeText = JSON.stringify({ records: tasks.map(t => ({ id: t.id, kind: t.kind, fields: {}, field_status: {} })) });
  return { envelope, password, judgeText, tasks, expectedManifest: manifest, expectedAnswerHash: envelope.answer_sha256, expectedJudgeHash: hash(judgeText), bootstrapIterations: 10 };
}

test('sealed evaluator authenticates both commitments and emits only public metrics', () => {
  assert.equal(typeof api.evaluateEnvelope, 'function', 'sealed evaluator must be implemented');
  const f = fixture(), r = api.evaluateEnvelope(f), text = JSON.stringify(r);
  assert.equal(r.lockVerification.judgeHash, f.expectedJudgeHash);
  assert.equal(r.lockVerification.answerHash, f.expectedAnswerHash);
  assert.equal(r.lockVerification.cipherAuthenticated, true);
  assert.equal(r.completion.shots, 0);
  assert.equal(r.humanSubmissionFlag, true);
  assert.ok(!text.includes('synthetic-test-only'));
  assert.ok(!('human' in r) && !('plaintext' in r) && !('password' in r));
});

test('changed Judge output or changed human answer commitment aborts evaluation', () => {
  assert.equal(typeof api.evaluateEnvelope, 'function');
  assert.throws(() => api.evaluateEnvelope({ ...fixture(), expectedJudgeHash: '0'.repeat(64) }), /Judge commitment mismatch/);
  assert.throws(() => api.evaluateEnvelope({ ...fixture(), expectedAnswerHash: '0'.repeat(64) }), /Answer commitment mismatch/);
});

test('wrong password fails authentication without echoing it', () => {
  assert.equal(typeof api.evaluateEnvelope, 'function');
  assert.throws(() => api.evaluateEnvelope({ ...fixture(), password: 'must-never-be-echoed' }), e => /Decryption authentication failed/.test(e.message) && !e.message.includes('must-never-be-echoed'));
});
