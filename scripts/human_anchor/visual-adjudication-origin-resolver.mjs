// Post-commitment source resolution only. No Human backup, password, decryption or inference.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha, fields, validateReviews, summarise } from './visual-adjudication.mjs';

const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const signature = v => JSON.stringify(canonical(v));
const normal = v => Array.isArray(v) ? [...v].sort() : v;
const check = (condition, message) => { if (!condition) throw Error(message); };

export function recoverMapping(bundles, tasks, judge, disagreements) {
  const raw = tasks.filter(t => t.kind === 'shot');
  const source = new Map(raw.map(t => [signature(t.media), t.id]));
  check(source.size === raw.length, 'Raw source signature is not unique');
  const originals = new Map(judge.records.map(r => [r.id, r]));
  check(originals.size === judge.records.length, 'Duplicate committed Judge ID');
  const expected = new Set(disagreements.filter(d => fields.includes(d.field)).map(d => `${d.id}:${d.field}`));
  const seen = new Set(), mapping = [];
  for (const field of fields) for (const c of bundles[field]) {
    const shot = source.get(signature(c.media)), task = `${shot}:${field}`;
    check(shot && expected.has(task) && !seen.has(task), 'Unexpected or duplicate diagnostic task'); seen.add(task);
    const record = originals.get(shot), value = record?.fields?.[field];
    check(value != null && record.field_status?.[field] !== 'failed', 'Committed Judge value unavailable');
    const a = signature(normal(c.answerA)) === signature(normal(value));
    const b = signature(normal(c.answerB)) === signature(normal(value));
    check(a !== b, 'Source matching must have exactly one result');
    mapping.push({ id: c.id, field, shot_id: shot, humanSide: a ? 'B' : 'A' });
  }
  check(seen.size === expected.size, 'Diagnostic source coverage incomplete');
  return mapping;
}

function main() {
  const deadline = setTimeout(() => process.exit(124), 60000), cleanup = () => clearTimeout(deadline);
  process.on('exit', cleanup); process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));
  try {
    const read = p => JSON.parse(readFileSync(p, 'utf8')), config = read(process.argv[2]), base = config.outDir;
    const matches = (path, hash) => check(sha(readFileSync(path)) === hash, 'Frozen file hash mismatch');
    // The reviewer barrier must already exist. Never derive sides before first verdicts are sealed.
    const commitmentPath = resolve(base, 'review-commitment.json');
    matches(commitmentPath, '29aaf93c4afb6b0d169f0f580ef13c556fab0a351d137efaeb05d805ef33a0ae');
    const commitment = read(commitmentPath);
    check(commitment.stage === 'FIRST_BLIND_VISUAL_VERDICTS_COMMITTED_BEFORE_ORIGIN_REVEAL', 'First verdicts are not sealed');
    matches(config.judgeFile, config.expectedJudgeHash); matches(config.rawTasksFile, config.rawTasksHash);
    matches(config.publicReportFile, config.publicReportHash); matches(config.tasksFile, config.expectedTasksHash);
    for (const e of [...config.evaluatorFiles, ...config.protocolFiles, ...config.diagnosticFiles]) matches(e.path, e.sha256);
    const lockPath = resolve(base, 'bundle-lock.json'); matches(lockPath, commitment.bundle_lock_sha256);
    const lock = read(lockPath), bundles = {}, reviews = {};
    for (const field of fields) {
      const p = resolve(base, field + '.json'), q = resolve(base, 'reviews', field + '.json');
      matches(p, lock.bundles[field]); matches(q, commitment.review_hashes[field]);
      bundles[field] = read(p); reviews[field] = read(q);
    }
    validateReviews(bundles, reviews);
    const tasks = read(config.rawTasksFile), judge = read(config.judgeFile), calibration = read(config.publicReportFile);
    for (const task of tasks.filter(t => t.kind === 'shot')) for (const media of task.media) matches(media.path, media.sha256);
    const mapping = recoverMapping(bundles, tasks, judge, calibration.disagreements);
    const result = summarise(mapping, reviews);
    check(result.counts.personCount.disagreements === 10 && result.counts.actions.disagreements === 21 && result.counts.objects.disagreements === 23, 'Disagreement denominators changed');
    const selfPath = fileURLToPath(import.meta.url), selfHash = sha(readFileSync(selfPath));
    const report = { run: 'Visual Disagreement Adjudication 2026-10-07', historical_calibration_conclusion: 'Independent Judge Calibration FAIL',
      historical_scores_changed: false, ...result, commitments: { bundle_lock_sha256: sha(readFileSync(lockPath)),
        review_commitment_sha256: sha(readFileSync(commitmentPath)), review_hashes: commitment.review_hashes,
        original_calibration_sha256: config.publicReportHash, original_judge_sha256: config.expectedJudgeHash,
        original_answers_sha256: config.expectedAnswerHash },
      origin_resolution: { method: 'EXACT_MATCH_WITH_COMMITTED_JUDGE_AFTER_FIRST_VERDICTS_SEALED', unique_matches: 54,
        resolver_sha256: selfHash, human_backup_read: false, encrypted_origin_mapping_read: false,
        heuristic_source_guessing: false, criteria_or_verdicts_changed: false },
      human_plaintext_exported: false, answer_values_exported_in_public_result: false, credential_used: false, stop_for_review: true };
    const text = JSON.stringify(report, null, 2) + '\n', output = resolve(base, 'public-adjudication.json');
    check(!output.startsWith(resolve(config.repositoryRoot) + '/'), 'Public staging output must remain outside repository');
    writeFileSync(output, text, { flag: 'wx', mode: 0o400 });
    console.log(JSON.stringify({ counts: report.counts, public_report_sha256: sha(text), resolver_sha256: selfHash, output, human_backup_read: false }));
  } catch { console.error('Post-commitment source resolution failed safely; no answers or credentials exported'); process.exitCode = 1; }
  finally { cleanup(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
