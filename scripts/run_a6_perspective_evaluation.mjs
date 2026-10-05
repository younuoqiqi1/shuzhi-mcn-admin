/**
 * @file run_a6_perspective_evaluation.mjs
 * @description 运行 A6 两个真实选题的端到端视角再解读并执行 Retrieval Top3 Gate 评估。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PerspectiveReReadingService } from "../src/perspective/perspective-rereading-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resultsDir = path.resolve(__dirname, "../src/perspective/results");
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
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
console.log(`选题A 视角重读完成，Gate 通过率: ${(resA.gate_pass_rate * 100).toFixed(1)}% (${resA.pass_requirements}/${resA.total_requirements})`);

console.log("\n=== 执行 选题B (余则成最危险的一次试探) A6 视角重读 ===");
const resB = service.processTopicTask(topicBFixture, retrievalB);
fs.writeFileSync(path.resolve(resultsDir, "a6_results_topic_b.json"), JSON.stringify(resB, null, 2), "utf8");
console.log(`选题B 视角重读完成，Gate 通过率: ${(resB.gate_pass_rate * 100).toFixed(1)}% (${resB.pass_requirements}/${resB.total_requirements})`);

console.log("\n=== 执行 跨选题综合 Retrieval Top3 Gate 评估 ===");
const gateReport = service.evaluateOverallGate([resA, resB]);
fs.writeFileSync(path.resolve(resultsDir, "a6_gate_evaluation.json"), JSON.stringify(gateReport, null, 2), "utf8");

console.log(`\n========================================================================================`);
console.log(`  Retrieval Top3 Gate 评估结果: ${gateReport.gate_passed ? "✅ PASS" : "❌ FAIL"}`);
console.log(`  总样本需求数: ${gateReport.total_requirements}`);
console.log(`  Top3 内包含可用镜头的需求数: ${gateReport.passed_requirements}`);
console.log(`  最终 Top3 Usable Coverage: ${(gateReport.usable_coverage * 100).toFixed(1)}% (门禁阈值: 80.0%)`);
console.log(`  门禁状态标识: ${gateReport.gate_status}`);
console.log(`========================================================================================\n`);

console.log("| 选题 | Requirement | Beat ID | Top1 | Top2 | Top3 | Top3至少1个可用 | 最可用镜头 | A5->A6排名 | Gate判定 |");
console.log("|:---|:---|:---|:---|:---|:---|:---:|:---|:---:|:---:|");
for (const s of gateReport.samples) {
  const deltaStr = s.rank_delta > 0 ? `+${s.rank_delta}` : `${s.rank_delta}`;
  console.log(`| ${s.topic_id} | ${s.requirement_id} | ${s.beat_id} | ${s.top1_scene} | ${s.top2_scene} | ${s.top3_scene} | ${s.has_usable_in_top3 ? "✅ 是" : "❌ 否"} | ${s.best_usable_scene} | ${s.best_a5_rank} -> ${s.best_a6_rank} (${deltaStr}) | ${s.gate_verdict} |`);
}
