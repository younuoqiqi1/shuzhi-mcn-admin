/**
 * @file perspective-rereading.test.mjs
 * @description POC-AGENT A6 动态 Perspective Re-reading 与 Retrieval Top3 Gate 综合测试套件。
 * 覆盖：真实A5 Top20消费、Persona透镜解读、事实边界保护、supports_claim裁决、
 * 证据不足降级(INSUFFICIENT_EVIDENCE)、Top20->Top5->Top3重排与Rank Delta记录、
 * 溯源加权协同、L1/L2防污染、禁偷换镜头、双真实选题E2E与Top3 Gate实测计算。
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PerspectiveReReadingService } from "../src/perspective/perspective-rereading-service.mjs";
import { LAOZHOU_PERSONA } from "../src/perspective/persona/laozhou-persona.mjs";
import { SemanticAndConceptPerspectiveProvider } from "../src/perspective/providers/perspective-provider.mjs";
import { validatePerspectiveReading } from "../src/contracts/validators.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("POC-AGENT A6: 动态 Perspective Re-reading + Retrieval Top3 Gate 验证", () => {
  const service = new PerspectiveReReadingService();

  const topicAPath = path.resolve(__dirname, "../src/retrieval/fixtures/topic_a_suspicion.json");
  const topicBPath = path.resolve(__dirname, "../src/retrieval/fixtures/topic_b_dangerous_probe.json");
  const retrievalAPath = path.resolve(__dirname, "../src/retrieval/results/retrieval_results_topic_a.json");
  const retrievalBPath = path.resolve(__dirname, "../src/retrieval/results/retrieval_results_topic_b.json");

  const topicA = JSON.parse(fs.readFileSync(topicAPath, "utf8"));
  const topicB = JSON.parse(fs.readFileSync(topicBPath, "utf8"));
  const resA = JSON.parse(fs.readFileSync(retrievalAPath, "utf8"));
  const resB = JSON.parse(fs.readFileSync(retrievalBPath, "utf8"));

  it("1. 真实消费 A5 产物：每个 Requirement 均接收非空 Top20 候选", () => {
    assert.strictEqual(topicA.material_requirements.length, 4);
    assert.strictEqual(topicB.material_requirements.length, 4);

    for (const req of topicA.material_requirements) {
      const cands = resA.requirements_candidates[req.requirement_id];
      assert.ok(Array.isArray(cands));
      assert.strictEqual(cands.length, 20, `req ${req.requirement_id} 必须消费 A5 的 20 个候选`);
    }

    for (const req of topicB.material_requirements) {
      const cands = resB.requirements_candidates[req.requirement_id];
      assert.ok(Array.isArray(cands));
      assert.strictEqual(cands.length, 20, `req ${req.requirement_id} 必须消费 A5 的 20 个候选`);
    }
  });

  it("2. PerspectiveProvider 接口与 Fallback 透明声明规范", () => {
    const provider = new SemanticAndConceptPerspectiveProvider();
    assert.strictEqual(provider.is_fallback, true, "必须诚实声明 is_fallback 为 true");
    assert.strictEqual(provider.provider_name, "semantic_concept_perspective_provider_v1");
  });

  it("3. 单候选 Re-reading 契约合规与必要属性字段校验", () => {
    const req = topicA.material_requirements[0];
    const cand = resA.requirements_candidates[req.requirement_id][0];

    const reading = service.rereadCandidate(cand, {
      topic: topicA.topic,
      viewpoint: topicA.viewpoint,
      beat: topicA.story_beats[0],
      requirement: req,
    });

    // 契约必须严格通过
    assert.doesNotThrow(() => validatePerspectiveReading(reading));

    // 必填字段
    assert.ok(reading.candidate_id);
    assert.ok(reading.evidence_id);
    assert.ok(reading.perspective_lens);
    assert.ok(reading.subjective_interpretation.includes("老周视角"));
    assert.ok(["true", "partial", "false"].includes(reading.supports_claim));
    assert.ok(typeof reading.does_not_support === "string" && reading.does_not_support.length > 0);
    assert.ok(typeof reading.evidence_boundary === "string" && reading.evidence_boundary.includes("L1 客观事实底线"));
    assert.ok(Array.isArray(reading.risk_flags));
    assert.ok(["strong_support", "supporting", "transition", "atmosphere", "reject"].includes(reading.recommended_use));
    assert.ok(typeof reading.original_audio_strategy.keep === "boolean");
    assert.ok(reading.audio_suggestion);
  });

  it("4. 防幻觉机制：严格确立 Evidence Boundary (L1 物理事实 vs L3 叙事推论)", () => {
    const req = topicA.material_requirements[0];
    const cand = resA.requirements_candidates[req.requirement_id][0];

    const reading = service.rereadCandidate(cand, {
      topic: topicA.topic,
      viewpoint: topicA.viewpoint,
      beat: topicA.story_beats[0],
      requirement: req,
    });

    assert.ok(reading.evidence_boundary.includes("【L1 客观事实底线】"));
    assert.ok(reading.evidence_boundary.includes("【L3 叙事推论边界】"));
    assert.ok(reading.evidence_boundary.includes("绝对不可作为 L1 客观事实直接引用"));
  });

  it("5. 允许‘不支持该观点’：明确识别弱事实镜头并置 supports_claim 为 partial/false", () => {
    const req = topicA.material_requirements[0];
    // 构造一个人物/动作均不相关的镜头
    const weakCand = {
      ...resA.requirements_candidates[req.requirement_id][0],
      characters: ["张静"],
      dialogue: "无关字幕文本",
      physical_actions: ["走过门岗卫兵"],
      evidence_l1: {
        characters: ["张静"],
        actions: ["走过门岗卫兵"],
        dialogue: "无关字幕文本",
        scene_env: "天津站大门",
      },
    };

    const reading = service.rereadCandidate(weakCand, {
      topic: topicA.topic,
      viewpoint: topicA.viewpoint,
      beat: topicA.story_beats[0],
      requirement: req,
    });

    assert.ok(["partial", "false"].includes(reading.supports_claim));
    assert.ok(reading.does_not_support.length > 0);
  });

  it("6. 证据不足告警机制：当全候选无法支撑时返回 INSUFFICIENT_EVIDENCE 与行动建议", () => {
    const impossibleReq = {
      requirement_id: "req_impossible_01",
      beat_id: "beat_impossible",
      description: "寻找吴站长手持红星勋章证明他是地下党员的镜头",
      desired_characters: ["吴敬中"],
      desired_action: "手持红星勋章宣誓入党",
      desired_emotion: "庄严宣誓",
      evidence_grounding_criteria: "出现红星勋章、入党誓词",
    };

    // 传入完全无关的候选
    const unrelatedCandidates = [
      {
        candidate_id: "cand_unrelated_1",
        evidence_id: "ev_1",
        scene_id: "scene_0001",
        media_id: "qianfu_ep18_720p_25fps",
        timecode: { in: "00:00:00.000", out: "00:00:01.040", duration_sec: 1.04 },
        dialogue: "",
        characters: ["卫兵"],
        physical_actions: ["站岗"],
        scene_env: "天津站门口",
        total_score: 0.1,
      },
    ];

    const result = service.rerankRequirement(impossibleReq, unrelatedCandidates, {
      topic: topicA.topic,
      viewpoint: topicA.viewpoint,
    });

    assert.strictEqual(result.status, "INSUFFICIENT_EVIDENCE");
    assert.deepStrictEqual(result.suggested_actions, [
      "soften_claim",
      "modify_viewpoint",
      "modify_beat",
      "retrieve_again",
    ]);
  });

  it("7. Top20 重排与 Rank Delta 计算 (保留 A5 分数与 A6 分数)", () => {
    const req = topicB.material_requirements[0]; // req_probe_01
    const cands = resB.requirements_candidates[req.requirement_id];

    const result = service.rerankRequirement(req, cands, {
      topic: topicB.topic,
      viewpoint: topicB.viewpoint,
      beat: topicB.story_beats[0],
    });

    assert.strictEqual(result.top20_reread.length, 20);
    assert.strictEqual(result.top5.length, 5);
    assert.strictEqual(result.top3.length, 3);

    // 检查每个候选均包含 A5 排名、A6 排名与 Delta
    result.top20_reread.forEach((item, idx) => {
      assert.strictEqual(item.a6_rank, idx + 1);
      assert.ok(item.a5_rank >= 1 && item.a5_rank <= 20);
      assert.strictEqual(item.rank_delta, item.a5_rank - item.a6_rank);
      assert.ok(typeof item.a5_retrieval_score === "number");
      assert.ok(typeof item.a6_perspective_score === "number");
      assert.ok(typeof item.final_ranking_score === "number");
    });
  });

  it("8. 绝无偷换镜头：Top3/Top5 候选必须严格出自 A5 Top20 候选集合", () => {
    for (const req of topicA.material_requirements) {
      const originalCands = resA.requirements_candidates[req.requirement_id];
      const origIds = new Set(originalCands.map((c) => c.candidate_id));

      const res = service.rerankRequirement(req, originalCands, {
        topic: topicA.topic,
        viewpoint: topicA.viewpoint,
      });

      res.top3.forEach((cand) => {
        assert.ok(origIds.has(cand.candidate_id), `Top3 候选 ${cand.candidate_id} 必须完全来自 A5 召回池`);
      });
    }
  });

  it("9. L1 客观事实与 L2 通用潜能只读防污染保护", () => {
    const canonicalPath = path.resolve(__dirname, "../src/evidence/data/canonical_evidence_qianfu_ep18.json");
    const affordancesPath = path.resolve(__dirname, "../src/retrieval/data/seed_l2_affordances.json");

    const statL1Before = fs.statSync(canonicalPath);
    const statL2Before = fs.statSync(affordancesPath);

    service.processTopicTask(topicA, resA);
    service.processTopicTask(topicB, resB);

    const statL1After = fs.statSync(canonicalPath);
    const statL2After = fs.statSync(affordancesPath);

    assert.strictEqual(statL1Before.mtimeMs, statL1After.mtimeMs, "A6 严禁写入或修改 L1 数据集");
    assert.strictEqual(statL2Before.mtimeMs, statL2After.mtimeMs, "A6 严禁自动将 L3 写入 L2 潜能库");
  });

  it("10. 选题A 与 选题B 端到端执行与 Gate 判定", () => {
    const taskResA = service.processTopicTask(topicA, resA);
    const taskResB = service.processTopicTask(topicB, resB);

    assert.strictEqual(taskResA.total_requirements, 4);
    assert.strictEqual(taskResB.total_requirements, 4);

    assert.ok(taskResA.gate_pass_rate >= 0.8, `选题A 门禁通过率应 >= 80%，实际: ${taskResA.gate_pass_rate}`);
    assert.ok(taskResB.gate_pass_rate >= 0.8, `选题B 门禁通过率应 >= 80%，实际: ${taskResB.gate_pass_rate}`);
  });

  it("11. 跨选题综合 Retrieval Top3 Gate 评估 (门禁实测必须 >= 80%)", () => {
    const taskResA = service.processTopicTask(topicA, resA);
    const taskResB = service.processTopicTask(topicB, resB);

    const gateReport = service.evaluateOverallGate([taskResA, taskResB]);

    assert.strictEqual(gateReport.total_requirements, 8, "总需求样本数应为 8 (2 topics × 4 reqs)");
    assert.ok(gateReport.passed_requirements >= 7, `8个样本中至少通过 7 个，实际通过: ${gateReport.passed_requirements}`);
    assert.ok(gateReport.usable_coverage >= 0.8, `Usable Coverage 必须 >= 80%，实际: ${gateReport.usable_coverage}`);
    assert.strictEqual(gateReport.gate_passed, true);
    assert.strictEqual(gateReport.gate_status, "gate_candidate_pass");
  });
});
