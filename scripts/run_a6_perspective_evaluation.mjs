/**
 * @file run_a6_perspective_evaluation.mjs
 * @description POC-AGENT A6.1: 运行两个真实选题的端到端视角再解读，输出系统自评数据并生成独立人工验收包。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PerspectiveReReadingService } from "../src/perspective/perspective-rereading-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resultsDir = path.resolve(__dirname, "../src/perspective/results");
const docsDir = path.resolve(__dirname, "../docs/agent-poc");

if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const service = new PerspectiveReReadingService();

// 载入真实 Fixture 与 A5 真实检索结果
const topicAFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../src/retrieval/fixtures/topic_a_suspicion.json"), "utf8")
);
const topicBFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../src/retrieval/fixtures/topic_b_dangerous_probe.json"), "utf8")
);
const retrievalA = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../src/retrieval/results/retrieval_results_topic_a.json"), "utf8")
);
const retrievalB = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../src/retrieval/results/retrieval_results_topic_b.json"), "utf8")
);

console.log("=== 执行 选题A (吴站长什么时候开始怀疑余则成？) A6 视角重读 ===");
const resA = service.processTopicTask(topicAFixture, retrievalA);
fs.writeFileSync(path.resolve(resultsDir, "a6_results_topic_a.json"), JSON.stringify(resA, null, 2), "utf8");
console.log(`选题A 视角重读完成，系统自评覆盖率: ${(resA.system_candidate_coverage * 100).toFixed(1)}% (${resA.pass_requirements}/${resA.total_requirements})`);

console.log("\n=== 执行 选题B (余则成最危险的一次试探) A6 视角重读 ===");
const resB = service.processTopicTask(topicBFixture, retrievalB);
fs.writeFileSync(path.resolve(resultsDir, "a6_results_topic_b.json"), JSON.stringify(resB, null, 2), "utf8");
console.log(`选题B 视角重读完成，系统自评覆盖率: ${(resB.system_candidate_coverage * 100).toFixed(1)}% (${resB.pass_requirements}/${resB.total_requirements})`);

console.log("\n=== 执行 跨选题综合 Retrieval Top3 Gate 评估 (系统自评 vs 人工门禁) ===");
const gateReport = service.evaluateOverallGate([resA, resB]);
fs.writeFileSync(path.resolve(resultsDir, "a6_gate_evaluation.json"), JSON.stringify(gateReport, null, 2), "utf8");

// 生成独立人工验收包与 Markdown 审核文档
console.log("\n=== 生成 A6.1 独立人工验收包 (docs/agent-poc/a6-human-gate-review.md & a6_human_gate_review.json) ===");
const reviewPackage = service.buildHumanReviewPackage([
  { topicTask: topicAFixture, a6Result: resA },
  { topicTask: topicBFixture, a6Result: resB },
]);

fs.writeFileSync(
  path.resolve(resultsDir, "a6_human_gate_review.json"),
  JSON.stringify(reviewPackage, null, 2),
  "utf8"
);

const reviewMd = service.generateHumanReviewMarkdown(reviewPackage);
fs.writeFileSync(path.resolve(docsDir, "a6-human-gate-review.md"), reviewMd, "utf8");

console.log(`\n========================================================================================`);
console.log(`  系统自评候选覆盖率 (System Candidate Coverage): ${(gateReport.system_candidate_coverage * 100).toFixed(1)}% (${gateReport.system_passed_requirements}/${gateReport.total_requirements})`);
console.log(`  正式人工 Gate 判定: ${gateReport.gate_passed ? "✅ PASS" : "⏳ 阻断等待人工审核 (awaiting_human_review)"}`);
console.log(`  Gate 状态标识: ${gateReport.gate_status}`);
console.log(`  人工验收包产物:`);
console.log(`    - 机器可读: src/perspective/results/a6_human_gate_review.json`);
console.log(`    - 审核文档: docs/agent-poc/a6-human-gate-review.md`);
console.log(`========================================================================================\n`);

console.log("| 选题 | Requirement | Beat ID | Top1 | Top2 | Top3 | 系统判定至少1个可用 | 最优可用镜头 | A5->A6排名 | 门禁状态 |");
console.log("|:---|:---|:---|:---|:---|:---|:---:|:---|:---:|:---:|");
for (const s of gateReport.samples) {
  const deltaStr = s.rank_delta > 0 ? `+${s.rank_delta}` : `${s.rank_delta}`;
  console.log(`| ${s.topic_id} | ${s.requirement_id} | ${s.beat_id} | ${s.top1_scene} | ${s.top2_scene} | ${s.top3_scene} | ${s.has_usable_in_top3 ? "✅ 是" : "❌ 否"} | ${s.best_usable_scene} | ${s.best_a5_rank} -> ${s.best_a6_rank} (${deltaStr}) | ${s.gate_verdict} |`);
}
