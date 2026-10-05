/**
 * @file run_a5_topic_retrieval.mjs
 * @description 执行 A5 两个真实选题的端到端检索召回，并输出完整分析结果。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CandidateRetrievalService } from "../src/retrieval/retrieval-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resultsDir = path.resolve(__dirname, "../src/retrieval/results");
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const service = new CandidateRetrievalService();

const topicAFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../src/retrieval/fixtures/topic_a_suspicion.json"), "utf8")
);
const topicBFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../src/retrieval/fixtures/topic_b_dangerous_probe.json"), "utf8")
);

console.log("=== 执行 选题A (吴站长什么时候开始怀疑余则成？) 真实检索召回 ===");
const resultA = service.retrieveForTopicTask(topicAFixture, { topK: 20 });
const pathA = path.resolve(resultsDir, "retrieval_results_topic_a.json");
fs.writeFileSync(pathA, JSON.stringify(resultA, null, 2), "utf8");
console.log(`选题A 检索完成，写入: ${pathA}`);

console.log("=== 执行 选题B (余则成最危险的一次试探) 真实检索召回 ===");
const resultB = service.retrieveForTopicTask(topicBFixture, { topK: 20 });
const pathB = path.resolve(resultsDir, "retrieval_results_topic_b.json");
fs.writeFileSync(pathB, JSON.stringify(resultB, null, 2), "utf8");
console.log(`选题B 检索完成，写入: ${pathB}`);

function summarizeResult(taskName, taskFixture, result) {
  console.log(`\n================== [${taskName}] 统计概要 ==================`);
  const reqs = taskFixture.material_requirements;
  
  for (const req of reqs) {
    const cands = result.requirements_candidates[req.requirement_id];
    console.log(`\nRequirement: ${req.requirement_id} - ${req.description.slice(0, 30)}...`);
    console.log(`  - 召回候选数: ${cands.length}`);
    
    // 独立帧 vs 继承帧统计
    let independentCount = 0;
    let inheritedCount = 0;
    const sceneEnvs = new Set();
    const scores = [];

    cands.forEach((c) => {
      const gran = c.provenance?.analysis_granularity;
      if (gran === "independent_keyframe") independentCount++;
      else inheritedCount++;
      sceneEnvs.add(c.scene_env);
      scores.push(c.total_score);
    });

    const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3);
    const minScore = Math.min(...scores).toFixed(3);
    const maxScore = Math.max(...scores).toFixed(3);

    console.log(`  - 证据溯源: independent_keyframe=${independentCount}, segment_inherited=${inheritedCount}`);
    console.log(`  - 场景空间分布数: ${sceneEnvs.size} (环境: ${Array.from(sceneEnvs).slice(0, 4).join(", ")}...)`);
    console.log(`  - 分数区间: [${minScore} ~ ${maxScore}], 均值: ${avgScore}`);
    console.log(`  - Top 1 镜头: ${cands[0].scene_id} [${cands[0].timecode.in} - ${cands[0].timecode.out}], 得分: ${cands[0].total_score}`);
    console.log(`    检索理由: ${cands[0].retrieval_reason}`);
  }
}

summarizeResult("选题A: 吴站长怀疑余则成", topicAFixture, resultA);
summarizeResult("选题B: 余则成危险试探", topicBFixture, resultB);
