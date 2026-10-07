// Separate diagnostic run: never changes the frozen calibration evaluator or score.
import { createHash, pbkdf2Sync, createDecipheriv, createCipheriv, randomBytes, randomInt } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const fields = ['personCount', 'actions', 'objects'];
const verdicts = ['A_CORRECT', 'B_CORRECT', 'BOTH_REASONABLE_TAXONOMY_AMBIGUITY', 'INSUFFICIENT_VISUAL_EVIDENCE', 'TECHNICAL_FAILURE'];
const bins = ['HUMAN_CORRECT', 'JUDGE_CORRECT', 'BOTH_REASONABLE_TAXONOMY_AMBIGUITY', 'INSUFFICIENT_VISUAL_EVIDENCE', 'TECHNICAL_FAILURE'];
export const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const json = path => JSON.parse(readFileSync(path, 'utf8'));
class SafeError extends Error {}
const check = (condition, message) => { if (!condition) throw new SafeError(message); };
const writeNew = (path, value) => {
  const text = JSON.stringify(value, null, 2) + '\n';
  writeFileSync(path, text, { flag: 'wx', mode: 0o400 });
  return sha(text);
};
const MAP = {
  personCount: { '不确定': 'uncertain' },
  actions: { '坐/站': 'sitting_or_standing', '移动': 'moving', '说话/交流': 'speaking_or_interacting', '操作/拿取物体': 'handling_object', '其他': 'other', '无明显动作': 'no_clear_action', '不确定': 'uncertain' },
  objects: { '家具': 'furniture', '容器': 'container', '纸张/文档': 'paper_or_document', '设备/工具': 'device_or_tool', '交通工具': 'vehicle', '食物/饮品': 'food_or_drink', '其他': 'other', '无关键物体': 'no_key_object', '不确定': 'uncertain' }
};
const normal = (field, v) => Array.isArray(v) ? v.map(x => MAP[field]?.[x] ?? x).sort() : MAP[field]?.[v] ?? v;

export function openHuman(envelope, password, config) {
  check(envelope.manifest === config.expectedManifest && envelope.answer_sha256 === config.expectedAnswerHash, 'Human commitment mismatch');
  check([100000, 310000].includes(envelope.iterations), 'Unsupported KDF');
  const key = pbkdf2Sync(password, Buffer.from(envelope.salt, 'base64'), envelope.iterations, 32, 'sha256');
  let plaintext;
  try {
    const ciphertext = Buffer.from(envelope.cipher, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(ciphertext.subarray(-16));
    plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
    const human = JSON.parse(plaintext.toString('utf8'));
    check(sha(JSON.stringify(canonical({ manifest: envelope.manifest, shots: human.shots, pairs: human.pairs }))) === config.expectedAnswerHash, 'Human commitment mismatch');
    return { human, key };
  } catch (e) { key.fill(0); throw e instanceof SafeError ? e : new SafeError('Local authentication failed'); }
  finally { plaintext?.fill(0); }
}

export function maskCases({ human, judge, disagreements, tasks, chooseSide = () => randomInt(2) ? 'A' : 'B' }) {
  const byId = new Map(judge.records.map(x => [x.id, x]));
  const raw = new Map(tasks.filter(x => x.kind === 'shot').map(x => [x.id, x]));
  const bundles = Object.fromEntries(fields.map(f => [f, []])), mapping = [];
  const seen = new Set();
  for (const item of disagreements.filter(x => fields.includes(x.field))) {
    const signature = `${item.id}:${item.field}`;
    check(!seen.has(signature), 'Duplicate diagnostic task'); seen.add(signature);
    const h = normal(item.field, human.shots?.[item.id]?.[item.field]);
    const j = normal(item.field, byId.get(item.id)?.fields?.[item.field]);
    check(h != null && j != null && raw.has(item.id), 'Diagnostic task unavailable');
    const id = 'case_' + randomBytes(8).toString('hex'), humanSide = chooseSide();
    check(['A', 'B'].includes(humanSide), 'Invalid side');
    bundles[item.field].push({ id, field: item.field, answerA: humanSide === 'A' ? h : j,
      answerB: humanSide === 'B' ? h : j, media: raw.get(item.id).media });
    mapping.push({ id, field: item.field, shot_id: item.id, humanSide });
  }
  // Both position and order are independent of labels and their correctness.
  for (const list of Object.values(bundles)) for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); [list[i], list[j]] = [list[j], list[i]];
  }
  return { bundles, mapping };
}

export function validateReviews(bundles, reviews) {
  for (const field of fields) {
    check(Array.isArray(reviews[field]), 'Review records missing');
    const expected = new Set(bundles[field].map(x => x.id)), seen = new Set();
    for (const r of reviews[field]) {
      check(expected.has(r.id) && !seen.has(r.id) && verdicts.includes(r.verdict), 'Invalid or duplicate review'); seen.add(r.id);
      check(Array.isArray(r.schema_flags) && r.schema_flags.every(x => typeof x === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(x)), 'Invalid diagnostic flags');
    }
    check(seen.size === expected.size, 'Review incomplete');
  }
}

export function summarise(mapping, reviews) {
  const cases = [], counts = Object.fromEntries(fields.map(f => [f, { disagreements: 0, ...Object.fromEntries(bins.map(b => [b, 0])) }]));
  const byId = new Map(mapping.map(m => [m.id, m]));
  for (const field of fields) for (const r of reviews[field]) {
    const m = byId.get(r.id); check(m?.field === field, 'Mapping mismatch');
    const chosen = r.verdict === 'A_CORRECT' ? 'A' : r.verdict === 'B_CORRECT' ? 'B' : null;
    const verdict = chosen ? chosen === m.humanSide ? 'HUMAN_CORRECT' : 'JUDGE_CORRECT' : r.verdict;
    counts[field].disagreements++; counts[field][verdict]++;
    cases.push({ id: r.id, shot_id: m.shot_id, field, verdict, schema_flags: r.schema_flags });
  }
  return { counts, cases };
}

async function localPassword(children) {
  const script = 'set d to display dialog "Visual Disagreement 本地匿名裁决\n请输入原标注口令。仅隔离 evaluator 使用，口令不进入模型。" default answer "" with hidden answer buttons {"取消", "继续"} default button "继续" giving up after 45\nif gave up of d then error "timeout" number -128\nreturn text returned of d';
  const child = spawn('/usr/bin/osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] }); children.add(child);
  return new Promise((accept, reject) => {
    let secret = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', x => { secret += x; }); child.stderr.resume();
    child.on('error', () => reject(new SafeError('Local dialog unavailable')));
    child.on('close', code => { children.delete(child); const value = secret.replace(/\r?\n$/, ''); secret = '';
      code === 0 ? accept(value) : reject(new SafeError('Local credential entry cancelled or timed out')); });
  });
}

function verify(config) {
  check(sha(readFileSync(config.backupFile)) === config.expectedBackupHash, 'Backup hash mismatch');
  check(sha(readFileSync(config.judgeFile)) === config.expectedJudgeHash, 'Judge hash mismatch');
  check(sha(readFileSync(config.publicReportFile)) === config.publicReportHash, 'Calibration report hash mismatch');
  check(sha(readFileSync(config.rawTasksFile)) === config.rawTasksHash, 'Raw task hash mismatch');
  check(sha(readFileSync(config.tasksFile)) === config.expectedTasksHash, 'Evaluator task hash mismatch');
  for (const entry of [...config.evaluatorFiles, ...config.protocolFiles, ...config.diagnosticFiles])
    check(sha(readFileSync(entry.path)) === entry.sha256, 'Frozen file hash mismatch');
  const oldLock = json(config.judgeCommitmentFile);
  check(oldLock.stage === 'JUDGE_OUTPUTS_COMMITTED_BEFORE_HUMAN_REVEAL' && oldLock.judge_results_sha256 === config.expectedJudgeHash, 'Judge lock mismatch');
  check(!resolve(config.outDir).startsWith(resolve(config.repositoryRoot) + '/'), 'Diagnostic files must remain outside repository');
  const tasks = json(config.rawTasksFile), report = json(config.publicReportFile);
  for (const task of tasks.filter(t => t.kind === 'shot')) for (const media of task.media)
    check(sha(readFileSync(media.path)) === media.sha256, 'Raw media changed');
  const n = Object.fromEntries(fields.map(f => [f, report.disagreements.filter(d => d.field === f).length]));
  check(n.personCount === 10 && n.actions === 21 && n.objects === 23, 'Frozen disagreement counts changed');
  return { tasks, report };
}

async function main() {
  const children = new Set(); let key, password = '';
  const cleanup = () => { for (const c of children) { try { c.kill('SIGKILL'); } catch {} } children.clear(); key?.fill(0); };
  process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); }); process.on('SIGTERM', () => { cleanup(); process.exit(143); });
  const deadline = setTimeout(() => { cleanup(); console.error('Diagnostic evaluator timeout'); process.exit(124); }, 60000);
  try {
    const [mode, configPath] = process.argv.slice(2); check(['prepare', 'aggregate'].includes(mode), 'Invalid mode');
    const config = json(configPath), { tasks, report } = verify(config);
    mkdirSync(config.outDir, { recursive: true, mode: 0o700 });
    const lockPath = resolve(config.outDir, 'bundle-lock.json'); let bundleLock, reviews, bundles;
    if (mode === 'prepare') check(!existsSync(lockPath), 'Diagnostic bundle already frozen');
    else {
      check(sha(readFileSync(lockPath)) === readFileSync(lockPath + '.sha256', 'utf8').trim(), 'Bundle lock mismatch');
      bundleLock = json(lockPath); bundles = {}; reviews = {};
      for (const field of fields) {
        const path = resolve(config.outDir, field + '.json'); check(sha(readFileSync(path)) === bundleLock.bundles[field], 'Blind bundle hash mismatch');
        bundles[field] = json(path); reviews[field] = json(resolve(config.outDir, 'reviews', field + '.json'));
      }
      validateReviews(bundles, reviews);
      const reviewHashes = Object.fromEntries(fields.map(f => [f, sha(readFileSync(resolve(config.outDir, 'reviews', f + '.json')))]));
      const reviewLockPath = resolve(config.outDir, 'review-commitment.json');
      const reviewLock = { stage: 'FIRST_BLIND_VISUAL_VERDICTS_COMMITTED_BEFORE_ORIGIN_REVEAL', bundle_lock_sha256: sha(readFileSync(lockPath)), review_hashes: reviewHashes };
      if (existsSync(reviewLockPath)) check(JSON.stringify(json(reviewLockPath)) === JSON.stringify(reviewLock), 'First review commitment changed');
      else { writeNew(reviewLockPath, reviewLock); for (const f of fields) chmodSync(resolve(config.outDir, 'reviews', f + '.json'), 0o400); }
      check(sha(readFileSync(resolve(config.outDir, 'map.hanchor'))) === bundleLock.mapping_cipher_sha256, 'Mapping hash mismatch');
    }
    console.log('Frozen inputs verified. Waiting for local hidden-password dialog.');
    password = await localPassword(children);
    const opened = openHuman(json(config.backupFile), password, config); key = opened.key; password = '';
    if (mode === 'prepare') {
      const masked = maskCases({ human: opened.human, judge: json(config.judgeFile), disagreements: report.disagreements, tasks });
      const bundleHashes = {};
      for (const field of fields) bundleHashes[field] = writeNew(resolve(config.outDir, field + '.json'), masked.bundles[field]);
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const plaintext = Buffer.from(JSON.stringify(masked.mapping));
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]); plaintext.fill(0);
      const mapHash = writeNew(resolve(config.outDir, 'map.hanchor'), { iv: iv.toString('base64'), cipher: encrypted.toString('base64'), tag: cipher.getAuthTag().toString('base64') });
      const hash = writeNew(lockPath, { stage: 'MASKED_BEFORE_VISUAL_ADJUDICATION', bundles: bundleHashes, mapping_cipher_sha256: mapHash,
        original_judge_sha256: config.expectedJudgeHash, original_answers_sha256: config.expectedAnswerHash, original_calibration_sha256: config.publicReportHash,
        diagnostic_files: config.diagnosticFiles, protocol_files: config.protocolFiles });
      writeFileSync(lockPath + '.sha256', hash + '\n', { flag: 'wx', mode: 0o400 });
      mkdirSync(resolve(config.outDir, 'reviews'), { recursive: true, mode: 0o700 });
      console.log(JSON.stringify({ stage: 'blind_bundle_frozen', counts: Object.fromEntries(fields.map(f => [f, masked.bundles[f].length])), bundle_lock_sha256: hash, outDir: config.outDir }));
    } else {
      const envelope = json(resolve(config.outDir, 'map.hanchor')), decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.cipher, 'base64')), decipher.final()]);
      let mapping; try { mapping = JSON.parse(plaintext.toString('utf8')); } finally { plaintext.fill(0); }
      const result = summarise(mapping, reviews);
      const publicResult = { run: 'Visual Disagreement Adjudication 2026-10-07', historical_calibration_conclusion: 'Independent Judge Calibration FAIL',
        historical_scores_changed: false, ...result, commitments: { bundle_lock_sha256: sha(readFileSync(lockPath)),
          review_commitment_sha256: sha(readFileSync(resolve(config.outDir, 'review-commitment.json'))), original_calibration_sha256: config.publicReportHash,
          original_judge_sha256: config.expectedJudgeHash, original_answers_sha256: config.expectedAnswerHash },
        human_plaintext_exported: false, answer_values_exported_in_public_result: false, credential_exported: false, stop_for_review: true };
      const hash = writeNew(resolve(config.outDir, 'public-adjudication.json'), publicResult);
      console.log(JSON.stringify({ stage: 'adjudication_aggregated', counts: result.counts, public_sha256: hash, outDir: config.outDir }));
    }
  } catch (e) { console.error(e instanceof SafeError ? e.message : 'Diagnostic evaluator failed safely'); process.exitCode = 1; }
  finally { password = ''; clearTimeout(deadline); cleanup(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
