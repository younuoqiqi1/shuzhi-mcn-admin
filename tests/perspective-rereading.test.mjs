/**
 * @file perspective-rereading.test.mjs
 * @description POC-AGENT A6.1 动态 Perspective Re-reading 与 Retrieval Top3 Gate 综合测试套件。
 * 覆盖：真实A5 Top20消费、Persona透镜解读、事实边界保护、supports_claim裁决、
 * 证据不足降级(INSUFFICIENT_EVIDENCE)、Top20->Top5->Top3重排与Rank Delta记录、
 * 溯源加权协同、L1/L2防污染、禁偷换镜头、系统自评与人工门禁分离、
 * 人工验收包规范（默认pending与防冒充）、模拟人工审核流转与正式Gate通过判定。
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

describe("POC-AGENT A6.1: 动态 Perspective Re-reading + Retrieval Top3 Gate 验证", () => {
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

  it("10. 系统自评与正式门禁严格分离：未人工审核前 gate_passed 必须为 false 且状态为 awaiting_human_review", () => {
    const taskResA = service.processTopicTask(topicA, resA);
    const taskResB = service.processTopicTask(topicB, resB);

    assert.strictEqual(taskResA.total_requirements, 4);
    assert.strictEqual(taskResB.total_requirements, 4);

    // 系统自评覆盖率
    assert.strictEqual(taskResA.system_candidate_coverage, 1.0);
    assert.strictEqual(taskResB.system_candidate_coverage, 1.0);
    assert.strictEqual(taskResA.human_gate_status, "awaiting_human_review");
    assert.strictEqual(taskResB.human_gate_status, "awaiting_human_review");

    // 跨选题 Gate 评估
    const gateReport = service.evaluateOverallGate([taskResA, taskResB]);
    assert.strictEqual(gateReport.total_requirements, 8);
    assert.strictEqual(gateReport.system_passed_requirements, 8);
    assert.strictEqual(gateReport.system_candidate_coverage, 1.0, "系统自评覆盖率应为 100%");
    assert.strictEqual(gateReport.human_usable_coverage, 0.0, "未审核前真实人工可用率必须为 0%");
    assert.strictEqual(gateReport.gate_passed, false, "严禁系统自评冒充 Gate PASS，未审核前必须为 false");
    assert.strictEqual(gateReport.gate_status, "awaiting_human_review");
  });

  it("11. A6.1 独立人工验收包完整性与防冒充断言 (human_verdict 必须为 pending)", () => {
    const taskResA = service.processTopicTask(topicA, resA);
    const taskResB = service.processTopicTask(topicB, resB);

    const reviewPkg = service.buildHumanReviewPackage([
      { topicTask: topicA, a6Result: taskResA },
      { topicTask: topicB, a6Result: taskResB },
    ]);

    assert.strictEqual(reviewPkg.total_requirements, 8);
    assert.strictEqual(reviewPkg.gate_passed, false);
    assert.strictEqual(reviewPkg.gate_status, "awaiting_human_review");
    assert.strictEqual(reviewPkg.all_reviewed, false);

    // 遍历所有 8 个需求及其 Top3 候选
    for (const reqItem of reviewPkg.requirements) {
      assert.ok(reqItem.topic.topic_id);
      assert.ok(reqItem.viewpoint.thesis);
      assert.ok(reqItem.beat.narrative_function);
      assert.ok(reqItem.material_requirement.requirement_id);
      assert.strictEqual(reqItem.human_requirement_verdict, "pending");
      assert.strictEqual(reqItem.top3.length, 3, "每个需求必须严格提供 Top3 候选");

      for (const cand of reqItem.top3) {
        // 核心防冒充铁律
        assert.strictEqual(cand.human_verdict, "pending", "未有人工输入前 human_verdict 必须为 pending");
        assert.strictEqual(cand.human_reason, "");
        assert.strictEqual(cand.reviewer, null);
        assert.strictEqual(cand.reviewed_at, null);

        // 系统字段与人工字段分离
        assert.ok(["strong_support", "supporting", "transition", "atmosphere", "reject"].includes(cand.system_recommendation));
        assert.ok(["true", "partial", "false"].includes(cand.system_supports_claim));

        // 真实客观信息
        assert.ok(cand.timecode.in && cand.timecode.out);
        assert.ok(typeof cand.timecode.duration_sec === "number");
        assert.ok(Array.isArray(cand.characters));
        assert.ok(typeof cand.scene_env === "string");
        assert.ok(typeof cand.retrieval_score === "number");
        assert.ok(typeof cand.perspective_score === "number");
        assert.ok(typeof cand.final_ranking_score === "number");
        assert.ok(cand.interpretation.length > 0);
        assert.ok(cand.evidence_boundary.includes("【L1 客观事实底线】"));
      }
    }
  });

  it("12. 模拟人工审核流转：Top3 至少 1 个 usable 触发 PASS，全量达成触发 gate_human_pass", () => {
    const taskResA = service.processTopicTask(topicA, resA);
    const taskResB = service.processTopicTask(topicB, resB);

    const reviewPkg = service.buildHumanReviewPackage([
      { topicTask: topicA, a6Result: taskResA },
      { topicTask: topicB, a6Result: taskResB },
    ]);

    // 1. 验证拒绝非法的 human_verdict
    assert.throws(
      () => service.applyHumanVerdict(reviewPkg, {
        requirement_id: "req_wu_01",
        candidate_id: reviewPkg.requirements[0].top3[0].candidate_id,
        verdict: "invalid_verdict",
      }),
      /非法的 human_verdict/
    );

    // 2. 模拟人工将前 7 个需求的 Top1 标记为 usable
    for (let i = 0; i < 7; i++) {
      const reqItem = reviewPkg.requirements[i];
      const top1 = reqItem.top3[0];
      service.applyHumanVerdict(reviewPkg, {
        requirement_id: reqItem.material_requirement.requirement_id,
        candidate_id: top1.candidate_id,
        verdict: "usable",
        reason: "台词与人物神态符合节拍叙事",
        reviewer: "auditor_zhang",
      });
      assert.strictEqual(reqItem.human_requirement_verdict, "PASS");
      assert.strictEqual(top1.human_verdict, "usable");
    }

    // 此时第 8 个需求仍然是 pending，因此未全审完
    assert.strictEqual(reviewPkg.all_reviewed, false);
    assert.strictEqual(reviewPkg.gate_passed, false);
    assert.strictEqual(reviewPkg.gate_status, "awaiting_human_review");

    // 3. 模拟第 8 个需求：Top1、Top2、Top3 全部标记为 unusable
    const req8 = reviewPkg.requirements[7];
    req8.top3.forEach((cand) => {
      service.applyHumanVerdict(reviewPkg, {
        requirement_id: req8.material_requirement.requirement_id,
        candidate_id: cand.candidate_id,
        verdict: "unusable",
        reason: "画面虽然有关，但对白无法支持论点",
        reviewer: "auditor_zhang",
      });
    });

    // 此时全量 8 个需求审核完毕，通过 7 个，通过率 7/8 = 87.5% >= 80%
    assert.strictEqual(req8.human_requirement_verdict, "FAIL");
    assert.strictEqual(reviewPkg.all_reviewed, true);
    assert.strictEqual(reviewPkg.reviewed_requirements, 8);
    assert.strictEqual(reviewPkg.human_passed_requirements, 7);
    assert.strictEqual(reviewPkg.human_usable_coverage, 0.875);
    assert.strictEqual(reviewPkg.gate_passed, true);
    assert.strictEqual(reviewPkg.gate_status, "gate_human_pass");
  });

  it("13. 人工验收 Markdown 与 JSON 产物的一致性与存在性", () => {
    const jsonPath = path.resolve(__dirname, "../src/perspective/results/a6_human_gate_review.json");
    const mdPath = path.resolve(__dirname, "../docs/agent-poc/a6-human-gate-review.md");

    assert.ok(fs.existsSync(jsonPath), "src/perspective/results/a6_human_gate_review.json 必须存在");
    assert.ok(fs.existsSync(mdPath), "docs/agent-poc/a6-human-gate-review.md 必须存在");

    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const mdContent = fs.readFileSync(mdPath, "utf8");

    assert.strictEqual(jsonContent.gate_status, "awaiting_human_review");
    assert.strictEqual(jsonContent.gate_passed, false);
    assert.ok(mdContent.includes("POC-AGENT A6.1: Retrieval Top3 真实人工验收包"));
    assert.ok(mdContent.includes("`awaiting_human_review`"));
    assert.ok(mdContent.includes("严禁进入 A7 Director Final 阶段"));
  });
});
