/**
 * @file perspective-rereading.test.mjs
 * @description POC-AGENT A6.2: 动态 Perspective Re-reading + Retrieval Top3 Gate + 真实一致性质量测试套件。
 * 覆盖：
 * 1. 真实A5 Top20消费 (以细颗粒度 Retrieval Unit 为候选单元)；
 * 2. PerspectiveProvider 接口与 Fallback 透明声明规范；
 * 3. 单候选 Re-reading 契约合规与必要属性校验；
 * 4. 防幻觉机制：严格确立 Evidence Boundary；
 * 5. 允许“不支持该观点”与弱事实识别；
 * 6. 证据不足告警机制 (INSUFFICIENT_EVIDENCE)；
 * 7. Top20 重排与 Rank Delta 计算；
 * 8. 绝无偷换镜头：Top3/Top5 严格源自 A5 Top20 候选池；
 * 9. L1 客观事实与 L2 通用潜能只读防污染保护；
 * 10. 系统自评与正式门禁严格分离 (未审核前 awaiting_human_review / gate_passed=false)；
 * 11. A6.2 独立人工验收包完整性与防冒充断言 (human_verdict 必须为 pending)；
 * 12. 模拟人工审核流转：Top3 至少 1 个 usable 触发 PASS，全量达成触发 gate_human_pass；
 * 13. 人工验收 Markdown 与 JSON 产物的一致性与存在性；
 * 14. [A6.2 专项] 对白时间戳必须落在 retrieval unit 时间范围；
 * 15. [A6.2 专项] 视觉 provenance 必须对应当前或明确 parent segment；
 * 16. [A6.2 专项] 真实人物来源审计：scene_0125 绝无吴敬中污染，scene_0142/0149 等绝无李涯/天津站档案室错配；
 * 17. [A6.2 专项] Consistency Validator 拦截：解读若无依据引用未在场人物强制触发 unsupported_character_reference；
 * 18. [A6.2 专项] 过长场景细化验证：scene_0074 (92.28s) 与 scene_0125 (119.88s) 拆分为精细 retrieval units，绝不跨明显剧情段；
 * 19. [A6.2 专项] 模板动态隔离：选题B 谢若林候选严禁出现“吴站长借题发挥敲山震虎”，解读随 Candidate/Topic 动态生成。
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PerspectiveReReadingService } from "../src/perspective/perspective-rereading-service.mjs";
import { LAOZHOU_PERSONA } from "../src/perspective/persona/laozhou-persona.mjs";
import {
  SemanticAndConceptPerspectiveProvider,
  validatePerspectiveConsistency,
} from "../src/perspective/providers/perspective-provider.mjs";
import { validatePerspectiveReading } from "../src/contracts/validators.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("POC-AGENT A6.2: 动态 Perspective Re-reading + Retrieval Top3 Gate 综合验证", () => {
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

    assert.doesNotThrow(() => validatePerspectiveReading(reading));
    assert.ok(reading.candidate_id);
    assert.ok(reading.evidence_id);
    assert.ok(reading.blogger_id);
    assert.ok(reading.topic_id);
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
    const req = topicB.material_requirements[0];
    const cands = resB.requirements_candidates[req.requirement_id];

    const result = service.rerankRequirement(req, cands, {
      topic: topicB.topic,
      viewpoint: topicB.viewpoint,
      beat: topicB.story_beats[0],
    });

    assert.strictEqual(result.top20_reread.length, 20);
    assert.strictEqual(result.top5.length, 5);
    assert.strictEqual(result.top3.length, 3);

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

    assert.strictEqual(taskResA.system_candidate_coverage, 0.75, "选题A中req_wu_03正确识别为INSUFFICIENT_EVIDENCE，系统自评为3/4");
    assert.strictEqual(taskResB.system_candidate_coverage, 1.0, "选题B全量4个需求证据充足，系统自评为4/4");
    assert.strictEqual(taskResA.human_gate_status, "awaiting_human_review");
    assert.strictEqual(taskResB.human_gate_status, "awaiting_human_review");

    const gateReport = service.evaluateOverallGate([taskResA, taskResB]);
    assert.strictEqual(gateReport.total_requirements, 8);
    assert.strictEqual(gateReport.system_passed_requirements, 7, "7个需求存在确凿证据，1个需求正确返回证据不足");
    assert.strictEqual(gateReport.system_candidate_coverage, 0.875);
    assert.strictEqual(gateReport.human_usable_coverage, 0.0);
    assert.strictEqual(gateReport.gate_passed, false);
    assert.strictEqual(gateReport.gate_status, "awaiting_human_review");
  });

  it("11. A6.2 独立人工验收包完整性与防冒充断言 (human_verdict 必须为 pending)", () => {
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

    for (const reqItem of reviewPkg.requirements) {
      assert.ok(reqItem.topic.topic_id);
      assert.ok(reqItem.viewpoint.thesis);
      assert.ok(reqItem.beat.narrative_function);
      assert.ok(reqItem.material_requirement.requirement_id);
      assert.strictEqual(reqItem.human_requirement_verdict, "pending");
      assert.strictEqual(reqItem.top3.length, 3);

      for (const cand of reqItem.top3) {
        assert.strictEqual(cand.human_verdict, "pending", "未有人工输入前 human_verdict 必须为 pending");
        assert.strictEqual(cand.human_reason, "");
        assert.strictEqual(cand.reviewer, null);
        assert.strictEqual(cand.reviewed_at, null);

        assert.ok(["strong_support", "supporting", "transition", "atmosphere", "reject"].includes(cand.system_recommendation));
        assert.ok(["true", "partial", "false"].includes(cand.system_supports_claim));
        assert.ok(cand.timecode.in && cand.timecode.out);
        assert.ok(cand.retrieval_unit_id);
        assert.ok(cand.parent_scene_id);
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

    assert.strictEqual(reviewPkg.all_reviewed, false);
    assert.strictEqual(reviewPkg.gate_passed, false);

    const req8 = reviewPkg.requirements[7];
    req8.top3.forEach((cand) => {
      service.applyHumanVerdict(reviewPkg, {
        requirement_id: req8.material_requirement.requirement_id,
        candidate_id: cand.candidate_id,
        verdict: "unusable",
        reason: "画面无法支持论点",
        reviewer: "auditor_zhang",
      });
    });

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

    assert.ok(fs.existsSync(jsonPath));
    assert.ok(fs.existsSync(mdPath));

    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const mdContent = fs.readFileSync(mdPath, "utf8");

    assert.strictEqual(jsonContent.gate_status, "awaiting_human_review");
    assert.strictEqual(jsonContent.gate_passed, false);
    assert.ok(mdContent.includes("Retrieval Top3 真实人工验收包"));
    assert.ok(mdContent.includes("`awaiting_human_review`"));
  });

  // ==================== A6.2 专项质量与一致性自动化测试 (问题6) ====================

  it("14. [A6.2 专项] 对白时间戳必须严格落在 Retrieval Unit 时间范围内", () => {
    const unitsPath = path.resolve(__dirname, "../src/evidence/data/canonical_retrieval_units_qianfu_ep18.json");
    const units = JSON.parse(fs.readFileSync(unitsPath, "utf8"));

    assert.ok(units.length >= 235, "检索单元数量充足");
    for (const u of units) {
      assert.ok(u.timecode.start_sec !== undefined && u.timecode.end_sec !== undefined);
      assert.ok(u.timecode.start_sec <= u.timecode.end_sec, `出入点倒挂: ${u.unit_id}`);
      assert.ok(u.timecode.duration_sec > 0);
      assert.ok(u.parent_scene_id, "必须包含 parent_scene_id");
    }
  });

  it("15. [A6.2 专项] 真实人物来源审计：scene_0125 绝无吴敬中，scene_0134/0139/0142/0149/0150 绝无李涯/档案室错配", () => {
    const canonicalPath = path.resolve(__dirname, "../src/evidence/data/canonical_evidence_qianfu_ep18.json");
    const canonical = JSON.parse(fs.readFileSync(canonicalPath, "utf8"));

    // 1. 审计 scene_0125
    const sc125 = canonical.find((s) => s.scene_id === "scene_0125");
    assert.ok(sc125);
    assert.ok(sc125.characters.includes("谢若林"));
    assert.ok(sc125.characters.includes("余则成"));
    assert.strictEqual(sc125.characters.includes("吴敬中"), false, "scene_0125 严禁污染包含吴敬中");
    assert.ok(sc125.scene_env.includes("涮肉"), "真实物理环境为东来顺涮肉馆雅间");

    // 2. 审计 1800~2160s (scene_0134, 0139, 0142, 0149, 0150)
    const probeScenes = ["scene_0134", "scene_0139", "scene_0142", "scene_0149", "scene_0150"];
    for (const scId of probeScenes) {
      const sc = canonical.find((s) => s.scene_id === scId);
      assert.ok(sc, `必须存在场景 ${scId}`);
      assert.strictEqual(sc.characters.includes("李涯"), false, `${scId} 严禁错配为李涯`);
      assert.strictEqual(sc.scene_env.includes("机要档案室"), false, `${scId} 严禁错配为机要档案室`);
      assert.ok(sc.characters.includes("谢若林") || sc.characters.includes("余则成"), `${scId} 人物应为谢若林或余则成`);
      assert.ok(sc.scene_env.includes("涮肉"), `${scId} 环境应为东来顺涮肉馆`);
    }
  });

  it("16. [A6.2 专项] Consistency Validator: 未在场且无说明人物强制触发 unsupported_character_reference", () => {
    // 构造一个在场人物仅为谢若林和余则成，但解说词胡乱提及吴站长和李涯的测试案例
    const mockCand = {
      candidate_id: "cand_test_01",
      characters: ["谢若林", "余则成"],
      scene_env: "东来顺涮肉馆雅间餐桌",
      dialogue: "咱们俩有生意做呀",
    };

    // 1. 未作说明直接提及吴站长（无上下文标记词）
    const badInterpretation = "老周视角：这一幕吴站长在办公室冷眼审视，余则成瑟瑟发抖。";
    const check1 = validatePerspectiveConsistency(badInterpretation, mockCand);
    assert.strictEqual(check1.is_consistent, false);
    assert.ok(check1.invalid_characters.includes("吴敬中"));

    // 2. 明确作了跨镜头上下文说明（“在谢若林口中提及的站长官场背景下”）
    const goodContextualInterpretation = "老周视角：在谢若林口中提及的站长官场背景下，余则成冷眼周旋。";
    const check2 = validatePerspectiveConsistency(goodContextualInterpretation, mockCand);
    assert.strictEqual(check2.is_consistent, true);

    // 3. 验证 Provider interpretCandidate 对不一致解读触发 risk_flags
    const provider = new SemanticAndConceptPerspectiveProvider();
    const badCandidate = {
      ...mockCand,
      evidence_l1: { characters: ["谢若林", "余则成"], actions: ["涮肉"] },
      affordance_l2: { tags: ["covert_transaction"] },
      timecode: { in: "00:26:32.000", out: "00:26:37.000", duration_sec: 5.0 },
      dialogue: "这要是让站长知道了要杀头的",
    };
    // 强行注入错误 interpretation 验证拦截
    provider._buildSubjectiveInterpretation = () => badInterpretation;
    const reading = provider.interpretCandidate({
      persona: LAOZHOU_PERSONA,
      topic: topicB.topic,
      viewpoint: topicB.viewpoint,
      beat: topicB.story_beats[0],
      requirement: topicB.material_requirements[0],
      candidate: badCandidate,
    });

    assert.ok(reading.risk_flags.includes("unsupported_character_reference"), "必须标记 unsupported_character_reference");
    assert.strictEqual(reading.supports_claim, "false", "不一致解读必须拒绝支撑观点");
  });

  it("17. [A6.2 专项] 过长 scene (scene_0074 92.28s, scene_0125 119.88s) 细化为精细 Retrieval Units", () => {
    const canonicalPath = path.resolve(__dirname, "../src/evidence/data/canonical_evidence_qianfu_ep18.json");
    const canonical = JSON.parse(fs.readFileSync(canonicalPath, "utf8"));

    const sc74 = canonical.find((s) => s.scene_id === "scene_0074");
    assert.ok(sc74);
    assert.ok(sc74.retrieval_units.length >= 3, "scene_0074 必须切分成不少于 3 个检索单元");
    for (const u of sc74.retrieval_units) {
      assert.ok(u.timecode.duration_sec < 40, `检索单元时长必须受控: ${u.timecode.duration_sec}s`);
    }

    const sc125 = canonical.find((s) => s.scene_id === "scene_0125");
    assert.ok(sc125);
    assert.ok(sc125.retrieval_units.length >= 10, "scene_0125 必须切分成不少于 10 个检索单元");
    for (const u of sc125.retrieval_units) {
      assert.ok(u.timecode.duration_sec <= 25, `检索单元时长必须 <= 25s: ${u.timecode.duration_sec}s`);
    }
  });

  it("18. [A6.2 专项] 模板动态隔离：选题B 谢若林候选严禁出现‘吴站长借题发挥敲山震虎’", () => {
    const taskResB = service.processTopicTask(topicB, resB);

    for (const [reqId, reqRes] of Object.entries(taskResB.requirements_reread)) {
      for (const cand of reqRes.top3) {
        const interp = cand.subjective_interpretation;
        assert.strictEqual(interp.includes("站长借题发挥敲山震虎"), false, `选题B (${reqId}) 严禁套用吴站长模板: ${interp}`);
        assert.strictEqual(interp.includes("一把手点烟"), false, `选题B (${reqId}) 严禁套用点烟模板: ${interp}`);
      }
    }
  });

  it("19. [A6.2 专项] 双真实选题重新 E2E，全量 8 需求均生成合规候选与精细单元", () => {
    const taskResA = service.processTopicTask(topicA, resA);
    const taskResB = service.processTopicTask(topicB, resB);

    assert.strictEqual(taskResA.total_requirements, 4);
    assert.strictEqual(taskResB.total_requirements, 4);

    for (const [reqId, reqRes] of Object.entries(taskResA.requirements_reread)) {
      assert.strictEqual(reqRes.top3.length, 3);
      assert.ok(reqRes.top3[0].retrieval_unit_id);
    }
    for (const [reqId, reqRes] of Object.entries(taskResB.requirements_reread)) {
      assert.strictEqual(reqRes.top3.length, 3);
      assert.ok(reqRes.top3[0].retrieval_unit_id);
    }
  });

  it("20. [A6.3 专项] req_wu_03 真实审计：正确判定为 INSUFFICIENT_EVIDENCE，杜绝假命中", () => {
    const taskResA = service.processTopicTask(topicA, resA);
    const req3Res = taskResA.requirements_reread.req_wu_03;

    assert.ok(req3Res, "req_wu_03 重排结果必须存在");
    assert.strictEqual(req3Res.status, "INSUFFICIENT_EVIDENCE", "第18集无机要档案室及李涯排查卷宗画面，必须返回 INSUFFICIENT_EVIDENCE");
    assert.strictEqual(req3Res.usable_candidate_count_in_top3, 0, "Top3 中可用数量必须为 0");
    assert.strictEqual(req3Res.gate_pass, false, "该需求系统 gate_pass 必须为 false");
    assert.ok(req3Res.suggested_actions.includes("soften_claim"), "必须包含建议系统动作");
    assert.ok(req3Res.reason.includes("缺乏直接物理事实支撑"), "必须明确记录原因");
  });

  it("21. [A6.3 专项] 片尾字幕与歌词污染彻底清除：req_probe_04 Top3 为真实火车站站台镜头", () => {
    const taskResB = service.processTopicTask(topicB, resB);
    const req4Res = taskResB.requirements_reread.req_probe_04;

    assert.ok(req4Res, "req_probe_04 重排结果必须存在");
    assert.strictEqual(req4Res.status, "SUFFICIENT");
    assert.strictEqual(req4Res.top3.length, 3);

    // 断言 Top3 绝非片尾演职员表字幕 (unit_scene_0213_01)
    for (const cand of req4Res.top3) {
      assert.notStrictEqual(cand.retrieval_unit_id, "unit_scene_0213_01", "Top3 严禁混入片尾演职员表 unit_scene_0213_01");
      assert.strictEqual(cand.dialogue.includes("演员表"), false, "Top3 台词绝不可混入演员表");
      assert.strictEqual(cand.dialogue.includes("孙红雷"), false, "Top3 台词绝不可混入演员名");
      assert.strictEqual(cand.dialogue.includes("祖峰"), false, "Top3 台词绝不可混入演员名");
      assert.ok(cand.scene_env.includes("火车站") || cand.scene_env.includes("站台"), "Top3 必须属于火车站台物理空间");
    }
  });
});
