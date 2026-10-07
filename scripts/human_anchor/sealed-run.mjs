import { createHash, pbkdf2Sync, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { evaluateCalibration } from './evaluate.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
class SafeError extends Error {}

export function evaluateEnvelope({ envelope, password, judgeText, tasks, expectedManifest, expectedAnswerHash, expectedJudgeHash, bootstrapIterations = 10000 }) {
  // Check the irreversible ordering barrier before deriving a key or opening Human Anchor.
  if (sha(judgeText) !== expectedJudgeHash) throw new SafeError('Judge commitment mismatch');
  if (envelope.manifest !== expectedManifest) throw new SafeError('Manifest mismatch');
  if (envelope.answer_sha256 !== expectedAnswerHash) throw new SafeError('Answer commitment mismatch');
  if (![100000, 310000].includes(envelope.iterations)) throw new SafeError('Unsupported KDF configuration');
  let key, plaintext;
  try {
    key = pbkdf2Sync(password, Buffer.from(envelope.salt, 'base64'), envelope.iterations, 32, 'sha256');
    const ciphertext = Buffer.from(envelope.cipher, 'base64');
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAuthTag(ciphertext.subarray(-16));
      plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
    } catch { throw new SafeError('Decryption authentication failed'); }
    let human;
    try { human = JSON.parse(plaintext.toString('utf8')); } catch { throw new SafeError('Decrypted payload parse failed'); }
    const answerHash = sha(JSON.stringify(canonical({ manifest: envelope.manifest, shots: human.shots, pairs: human.pairs })));
    if (answerHash !== expectedAnswerHash) throw new SafeError('Answer commitment mismatch');
    let judge;
    try { judge = JSON.parse(judgeText); } catch { throw new SafeError('Committed Judge output parse failed'); }
    let report;
    try { report = evaluateCalibration({ human, judge, tasks, bootstrapIterations, blindnessConfirmed: true }); }
    catch { throw new SafeError('Frozen task data could not be evaluated'); }
    return { ...report, lockVerification: { judgeHash: expectedJudgeHash, answerHash,
      cipherAuthenticated: true, manifestMatched: true, plaintextExported: false,
      evaluatorOnlyHumanRead: true, credentialExported: false } };
  } finally { key?.fill(0); plaintext?.fill(0); }
}

async function localPassword(children) {
  const script = 'set d to display dialog "Human Anchor 本地揭盲评估\nJudge 结果已封存。请输入原标注口令。口令只交给本地 evaluator，不发送到聊天或模型。" default answer "" with hidden answer buttons {"取消", "解锁并评估"} default button "解锁并评估" giving up after 45\nif gave up of d then error "Dialog timeout" number -128\nreturn text returned of d';
  const child = spawn('/usr/bin/osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  return await new Promise((accept, reject) => {
    let secret = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { secret += chunk; });
    // stderr can contain system dialog diagnostics; do not echo it.
    child.stderr.resume();
    child.on('error', () => reject(new SafeError('Local credential dialog unavailable')));
    child.on('close', code => {
      children.delete(child);
      if (code !== 0) { secret = ''; reject(new SafeError('Local credential entry cancelled or timed out')); }
      else { const value = secret.replace(/\r?\n$/, ''); secret = ''; accept(value); }
    });
  });
}

async function main() {
  const children = new Set();
  const cleanup = () => { for (const child of children) { try { child.kill('SIGKILL'); } catch {} } children.clear(); };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
  const deadline = setTimeout(() => { cleanup(); console.error('Local evaluator exceeded 60 seconds; no credentials or answers exported.'); process.exit(124); }, 60000);
  let password = '';
  try {
    const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const backup = readFileSync(config.backupFile);
    if (sha(backup) !== config.expectedBackupHash) throw new SafeError('Encrypted backup commitment mismatch');
    const envelope = JSON.parse(backup.toString('utf8'));
    const judgeText = readFileSync(config.judgeFile, 'utf8');
    const lock = JSON.parse(readFileSync(config.judgeCommitmentFile, 'utf8'));
    if (lock.stage !== 'JUDGE_OUTPUTS_COMMITTED_BEFORE_HUMAN_REVEAL'
      || lock.judge_results_sha256 !== config.expectedJudgeHash || sha(judgeText) !== config.expectedJudgeHash) throw new SafeError('Judge commitment mismatch');
    if (envelope.manifest !== config.expectedManifest || envelope.answer_sha256 !== config.expectedAnswerHash) throw new SafeError('Answer commitment mismatch');
    for (const item of config.evaluatorFiles) if (sha(readFileSync(item.path)) !== item.sha256) throw new SafeError('Evaluator code commitment mismatch');
    for (const item of config.protocolFiles) if (sha(readFileSync(item.path)) !== item.sha256) throw new SafeError('Protocol commitment mismatch');
    const tasks = JSON.parse(readFileSync(config.tasksFile, 'utf8'));
    if (sha(readFileSync(config.tasksFile)) !== config.expectedTasksHash) throw new SafeError('Task commitment mismatch');
    const forbidden = resolve(config.repositoryRoot) + '/';
    if (resolve(config.outputFile).startsWith(forbidden)) throw new SafeError('Evaluator output must remain outside Git repository');
    console.log('Commitments verified. Waiting for local hidden-password dialog; no secret is logged.');
    password = await localPassword(children);
    const report = evaluateEnvelope({ envelope, password, judgeText, tasks,
      expectedManifest: config.expectedManifest, expectedAnswerHash: config.expectedAnswerHash,
      expectedJudgeHash: config.expectedJudgeHash, bootstrapIterations: 10000 });
    password = '';
    report.lockVerification.backupHash = config.expectedBackupHash;
    report.lockVerification.evaluatorCodeHashes = config.evaluatorFiles.map(x => ({ sha256: x.sha256, name: x.path.split('/').at(-1) }));
    const publicText = JSON.stringify(report, null, 2) + '\n';
    // Report includes aggregates and mismatch IDs/categories, never human labels or credentials.
    writeFileSync(config.outputFile, publicText, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ reportFile: config.outputFile, report_sha256: sha(publicText), conclusion: report.conclusion,
      completion: report.completion, timing: report.timing, humanSubmissionFlag: report.humanSubmissionFlag,
      failureAnalysisCounts: report.failureAnalysisCounts }));
  } catch (e) {
    console.error(e instanceof SafeError ? e.message : 'Local evaluator could not finish; no credentials or Human Anchor plaintext exported.');
    process.exitCode = 1;
  } finally { password = ''; clearTimeout(deadline); cleanup(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
