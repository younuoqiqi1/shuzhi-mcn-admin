/**
 * @file final-director-service.mjs
 * @description POC-AGENT A7.1: Final Director Plan 核心编排服务。
 * 
 * 核心设计原则：
 * 1. 严格消费真实 A6 产物：每个 segment 所选候选镜头必须属于 A6 Top3 集合！
 * 2. 严禁伪造镜头，严禁新增 Top3 之外的镜头与 scene_id。
 * 3. 正确处理 INSUFFICIENT_EVIDENCE (如 req_wu_03)：
 *    - 默认严禁创建虚假生产 Segment！
 *    - 执行 merge / drop 决议，将立意自然合并，在 final plan 中不生成对应 production segment。
 * 4. 旁白时长预算系统 (Narration Duration Budget)：
 *    - 集中配置语速与安全留白，为每个 segment 精确计算并证明说得完 (duration_fit = true)。
 *    - 出现 overflow 时严禁单纯拉高语速硬塞，必须精简文案或在合法边界调整镜头。
 * 5. 音频所有权先于旁白 (Audio Ownership First)：原声足够有力量时保护原声，narration_job = none。
 * 6. 原声对白完整性保护：不得截断半句话。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseTimecodeToSeconds } from "../contracts/validators.mjs";
import { DirectorEvidenceValidator, DirectorValidationError } from "./director-evidence-validator.mjs";
import {
  DURATION_BUDGET_CONFIG,
  calculateNarrationBudget,
  countNarrationChars,
} from "./duration-budget-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FinalDirectorService {
  constructor(options = {}) {
    this.reviewPackagePath = options.reviewPackagePath || path.resolve(__dirname, "../perspective/results/a6_human_gate_review.json");
    this.reviewData = null;
    this.budgetConfig = options.budgetConfig || DURATION_BUDGET_CONFIG;
    this._loadReviewPackage();
  }

  _loadReviewPackage() {
    if (fs.existsSync(this.reviewPackagePath)) {
      try {
        const raw = fs.readFileSync(this.reviewPackagePath, "utf8");
        this.reviewData = JSON.parse(raw);
      } catch (err) {
        console.warn(`[FinalDirectorService] 无法读取默认 A6 人工验收包: ${err.message}`);
      }
    }
  }

  /**
   * 获取指定 Requirement 的 A6 Top3 候选池
   * @param {string} reqId 
   * @returns {Array<Object>}
   */
  getTop3CandidatesForRequirement(reqId) {
    if (!this.reviewData || !Array.isArray(this.reviewData.requirements)) {
      throw new DirectorValidationError("reviewData", "未载入合法的 A6 人工验收数据");
    }

    const reqItem = this.reviewData.requirements.find(
      (r) => r.material_requirement && r.material_requirement.requirement_id === reqId
    );

    if (!reqItem) {
      throw new DirectorValidationError("requirement_id", `在 A6 验收包中未找到 requirement_id '${reqId}'`);
    }

    return reqItem.top3 || [];
  }

  /**
   * 获取指定 Requirement 的 A6 证据充足状态
   * @param {string} reqId 
   * @returns {Object} { status, suggested_actions, sufficiency_reason }
   */
  getRequirementStatus(reqId) {
    const reqItem = this.reviewData.requirements.find(
      (r) => r.material_requirement && r.material_requirement.requirement_id === reqId
    );
    if (!reqItem) return { status: "UNKNOWN" };
    return {
      status: reqItem.status,
      suggested_actions: reqItem.suggested_actions || [],
      sufficiency_reason: reqItem.sufficiency_reason || "",
    };
  }

  /**
   * 构造并校验一个 Director Segment
   * 严格实施镜头合法性、音频所有权、证据边界与时长预算校验
   * @param {Object} segmentParams 
   * @returns {Object} 经校验合法的 segment
   */
  createSegment(segmentParams) {
    const {
      segment_id,
      beat_id,
      requirement_id,
      purpose,
      candidate_id,
      visual_reason,
      narration_job = "none",
      audio_owner = "narration",
      narration_text = "",
      original_dialogue_text = "",
      audio_transition = "hard_cut",
      subtitle_mode = "bottom_standard",
      director_resolution = null,
      resolution_action = null,
      production_segment_created = true,
      override_timecode = null,
      allow_insufficient = false,
    } = segmentParams;

    // 1. 检查 INSUFFICIENT_EVIDENCE：默认严禁创建生产 Segment
    const reqStatus = this.getRequirementStatus(requirement_id);
    if (reqStatus.status === "INSUFFICIENT_EVIDENCE" && !allow_insufficient) {
      throw new DirectorValidationError(
        `${segment_id}.insufficient_evidence_blocked`,
        `需求 '${requirement_id}' 在 A6 状态为 INSUFFICIENT_EVIDENCE！默认不得创建对应生产 Segment。必须执行 merge/drop，严禁伪造镜头上线生产。`
      );
    }

    // 2. 获取 A6 Top3 候选池并严格断言
    const top3 = this.getTop3CandidatesForRequirement(requirement_id);
    const matchedCandidate = top3.find((c) => c.candidate_id === candidate_id);

    if (!matchedCandidate) {
      const allowedIds = top3.map((c) => c.candidate_id).join(", ");
      throw new DirectorValidationError(
        `${segment_id}.candidate_id`,
        `非法镜头选择！候选 '${candidate_id}' 不在 A6 Top3 允许集合 [${allowedIds}] 中。严禁使用 Top3 外的镜头！`
      );
    }

    // 3. 计算时间范围与计划时长
    const inSec = override_timecode && override_timecode.in !== undefined
      ? override_timecode.in
      : parseTimecodeToSeconds(matchedCandidate.timecode.in);
    const outSec = override_timecode && override_timecode.out !== undefined
      ? override_timecode.out
      : parseTimecodeToSeconds(matchedCandidate.timecode.out);
    const plannedDuration = Math.round((outSec - inSec) * 1000) / 1000;

    // 4. 构建证据边界结构
    const evidenceBoundary = {
      visual_facts: matchedCandidate.physical_actions || [],
      dialogue_facts: matchedCandidate.dialogue ? [matchedCandidate.dialogue] : [],
      characters: matchedCandidate.characters || [],
      scene_env: matchedCandidate.scene_env || "",
      allowed_l3_inferences: [
        matchedCandidate.interpretation,
        "老周视角下的视听叙事推论与观点赋能",
      ].filter(Boolean),
      strictly_forbidden_claims: [
        "站长确认余则成是共产党",
        "余则成在档案室排查照片",
        "余则成在机要档案室",
        "李涯当面搜捕余则成",
      ],
    };

    const trimmedNarration = narration_text.trim();
    const resolvedDialogue = original_dialogue_text || (matchedCandidate.dialogue || "");

    // 5. 计算旁白时长预算 (Narration Duration Budget)
    const budget = calculateNarrationBudget({
      narration_text: trimmedNarration,
      audio_owner,
      audio_transition,
      planned_duration: plannedDuration,
      original_dialogue_text: resolvedDialogue,
      custom_chars_per_sec: this.budgetConfig.estimated_chars_per_second,
    });

    const segment = {
      segment_id,
      beat_id,
      requirement_id,
      purpose,
      selected_candidate_id: matchedCandidate.candidate_id,
      retrieval_unit_id: matchedCandidate.retrieval_unit_id,
      evidence_id: matchedCandidate.evidence_id,
      parent_scene_id: matchedCandidate.parent_scene_id || matchedCandidate.scene_id,
      source_in: inSec,
      source_out: outSec,
      planned_duration: plannedDuration,
      visual_reason,
      narration_job,
      audio_owner,
      narration_text: trimmedNarration,
      original_dialogue_text: resolvedDialogue,
      audio_transition,
      subtitle_mode,
      evidence_boundary: evidenceBoundary,
      risk_flags: matchedCandidate.risk_flags || [],
      characters: matchedCandidate.characters || [],

      // A7.1 Duration Budget 字段
      narration_char_count: budget.narration_char_count,
      estimated_tts_duration_sec: budget.estimated_tts_duration_sec,
      available_narration_duration_sec: budget.available_narration_duration_sec,
      duration_fit: budget.duration_fit,
      duration_overflow_sec: budget.duration_overflow_sec,
    };

    if (director_resolution) {
      segment.director_resolution = director_resolution;
      segment.resolution_action = resolution_action;
      segment.production_segment_created = production_segment_created;
    }

    // 执行严格校验
    DirectorEvidenceValidator.validateSegment(segment);
    return segment;
  }

  /**
   * 生成真实选题 B: “余则成最危险的一次试探” Final Director Plan
   * @returns {Object} Final Director Plan
   */
  buildDirectorPlanTopicB() {
    const planFile = path.resolve(__dirname, "./results/director_plan_topic_b.json");
    if (fs.existsSync(planFile)) {
      const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
      DirectorEvidenceValidator.validatePlan(plan);
      return plan;
    }
    throw new DirectorValidationError("plan_file", `未找到选题 B 导演方案文件: ${planFile}`);
  }

  /**
   * 生成真实选题 A: “吴站长什么时候开始怀疑余则成？” Final Director Plan
   * 正确处理 req_wu_03 INSUFFICIENT_EVIDENCE：
   * - 不生成虚假 seg_wu_03！最终只保留 3 个真实生产 Segment
   * - 决议记录为 merge，将心战立意自然合并入终章
   * - 剩余 3 个 segment 全部通过 duration_fit
   * @returns {Object} Final Director Plan
   */
  buildDirectorPlanTopicA() {
    const planFile = path.resolve(__dirname, "./results/director_plan_topic_a.json");
    if (fs.existsSync(planFile)) {
      const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
      DirectorEvidenceValidator.validatePlan(plan);
      return plan;
    }
    throw new DirectorValidationError("plan_file", `未找到选题 A 导演方案文件: ${planFile}`);
  }
}
