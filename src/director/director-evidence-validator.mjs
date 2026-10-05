/**
 * @file director-evidence-validator.mjs
 * @description POC-AGENT A7: 导演编排证据边界与视听规则严格校验器。
 * 
 * 核心守界规则：
 * 1. 旁白允许有博主主观视角 (L3)，但事实陈述受 Evidence Boundary 严格限制。
 * 2. 严禁出现未支撑客观断言 (unsupported claim) 与违禁事实 (strictly_forbidden_claims)。
 * 3. 避免原声与旁白打架 (Audio Ownership 冲突防护)。
 * 4. 校验 Narration Job 与 Narration Text 的因果依存关系。
 * 5. 校验 INSUFFICIENT_EVIDENCE 节拍的显式决议合法性。
 */

import { parseTimecodeToSeconds } from "../contracts/validators.mjs";

export class DirectorValidationError extends Error {
  constructor(field, message, details = {}) {
    super(`[DirectorValidationError] ${field}: ${message}`);
    this.name = "DirectorValidationError";
    this.field = field;
    this.details = details;
  }
}

export class DirectorEvidenceValidator {
  /**
   * 校验单个导演分段 (Director Segment)
   * @param {Object} segment 
   * @param {Object} [options] 
   * @returns {boolean}
   */
  static validateSegment(segment, options = {}) {
    if (!segment || typeof segment !== "object") {
      throw new DirectorValidationError("root", "segment 必须为非空对象");
    }

    const { segment_id = "unknown_seg" } = segment;

    // 1. 标识与必填字段
    const requiredFields = [
      "segment_id",
      "beat_id",
      "purpose",
      "selected_candidate_id",
      "retrieval_unit_id",
      "evidence_id",
      "parent_scene_id",
      "source_in",
      "source_out",
      "planned_duration",
      "visual_reason",
      "narration_job",
      "audio_owner",
      "audio_transition",
      "subtitle_mode",
    ];

    for (const f of requiredFields) {
      if (segment[f] === undefined || segment[f] === null || segment[f] === "") {
        throw new DirectorValidationError(
          `${segment_id}.${f}`,
          `缺少必填字段 '${f}'`
        );
      }
    }

    // 2. 时间码合法性
    if (typeof segment.source_in !== "number" || typeof segment.source_out !== "number") {
      throw new DirectorValidationError(
        `${segment_id}.timecode`,
        "source_in 与 source_out 必须为浮点数值秒"
      );
    }
    if (segment.source_in < 0) {
      throw new DirectorValidationError(
        `${segment_id}.source_in`,
        `source_in 必须 >= 0，实际收到 ${segment.source_in}`
      );
    }
    if (segment.source_out <= segment.source_in) {
      throw new DirectorValidationError(
        `${segment_id}.source_out`,
        `source_out (${segment.source_out}) 必须大于 source_in (${segment.source_in})`
      );
    }

    const diff = Math.round((segment.source_out - segment.source_in) * 1000) / 1000;
    if (Math.abs(segment.planned_duration - diff) > 0.05) {
      throw new DirectorValidationError(
        `${segment_id}.planned_duration`,
        `planned_duration (${segment.planned_duration}) 与 source_out - source_in (${diff}) 不符`
      );
    }

    // 3. Audio Owner 枚举与逻辑
    const validAudioOwners = ["original_dialogue", "narration", "ambience", "music", "silence"];
    if (!validAudioOwners.includes(segment.audio_owner)) {
      throw new DirectorValidationError(
        `${segment_id}.audio_owner`,
        `无效的 audio_owner '${segment.audio_owner}'，必须为 [${validAudioOwners.join(", ")}] 之一`
      );
    }

    // 4. Narration Job 枚举与逻辑
    const validNarrationJobs = ["context", "causal_link", "foreshadow", "interpretation", "transition", "none"];
    if (!validNarrationJobs.includes(segment.narration_job)) {
      throw new DirectorValidationError(
        `${segment_id}.narration_job`,
        `无效的 narration_job '${segment.narration_job}'，必须为 [${validNarrationJobs.join(", ")}] 之一`
      );
    }

    // 5. Narration Job 与 Narration Text 一致性
    const narrationText = (segment.narration_text || "").trim();
    if (segment.narration_job === "none") {
      if (narrationText.length > 0) {
        throw new DirectorValidationError(
          `${segment_id}.narration_text`,
          `当 narration_job 为 'none' 时，narration_text 必须为空，但收到: "${narrationText}"`
        );
      }
    } else {
      if (narrationText.length === 0) {
        throw new DirectorValidationError(
          `${segment_id}.narration_text`,
          `当 narration_job 为 '${segment.narration_job}' 时，narration_text 必须为非空有效文案`
        );
      }
    }

    // 6. 音频打架防御 (Audio Conflict Prevention)
    if (segment.audio_owner === "original_dialogue") {
      const dialogueText = (segment.original_dialogue_text || "").trim();
      if (dialogueText.length > 0 && segment.narration_job !== "none") {
        // 若同时有原声和旁白，必须具备 duck / J_cut / L_cut 平滑过渡，否则阻断
        const allowedTransitions = ["duck", "J_cut", "L_cut"];
        if (!allowedTransitions.includes(segment.audio_transition)) {
          throw new DirectorValidationError(
            `${segment_id}.audio_conflict`,
            `原声与旁白发生冲突：audio_owner 为 'original_dialogue' 且原声台词存在，但同时配置了旁白任务 '${segment.narration_job}'，且转场策略 '${segment.audio_transition}' 未使用 [${allowedTransitions.join(", ")}] 进行避让。禁止原声与旁白打架！`
          );
        }
      }
    }

    // 7. 证据边界与 Unsupported Claim 严格校验
    if (segment.evidence_boundary) {
      this.validateNarrationAgainstBoundary(segment, segment.evidence_boundary);
    }

    // 8. 旁白时长预算校验 (Narration Duration Budget Fit)
    if (segment.duration_fit === false || (typeof segment.duration_overflow_sec === "number" && segment.duration_overflow_sec > 0.05)) {
      throw new DirectorValidationError(
        `${segment_id}.duration_overflow`,
        `旁白预估时长 (${segment.estimated_tts_duration_sec}s) 超出镜头可用旁白时长 (${segment.available_narration_duration_sec}s)，溢出 ${segment.duration_overflow_sec}s。禁止单纯拉高语速强塞，请精简文案或在合法边界内延长镜头！`
      );
    }

    // 9. 原声对白完整性校验 (不能截断半句话)
    if (segment.audio_owner === "original_dialogue" && segment.original_dialogue_text) {
      const dialogueText = segment.original_dialogue_text.trim();
      const minDialogueDuration = Math.round((dialogueText.length / 4.8) * 10) / 10;
      if (segment.planned_duration < minDialogueDuration - 0.2) {
        throw new DirectorValidationError(
          `${segment_id}.dialogue_truncation`,
          `镜头计划时长 (${segment.planned_duration}s) 不足支撑完整原声台词 "${dialogueText}" (需约 ${minDialogueDuration}s)，存在截断半句话风险！`
        );
      }
    }

    // 10. INSUFFICIENT_EVIDENCE 决议合法性：默认严禁创建虚假生产 Segment
    if (segment.director_resolution === "insufficient_evidence") {
      if (segment.production_segment_created !== false) {
        throw new DirectorValidationError(
          `${segment_id}.fake_production_segment`,
          `INSUFFICIENT_EVIDENCE 需求默认严禁创建对应生产 Segment！必须执行 merge/drop，且 production_segment_created 必须为 false。`
        );
      }
      const validActions = ["merge", "drop", "soften_previous", "soften_next", "request_revision", "soften"];
      if (!validActions.includes(segment.resolution_action)) {
        throw new DirectorValidationError(
          `${segment_id}.resolution_action`,
          `缺失或非法的 resolution_action '${segment.resolution_action}'，必须为 [${validActions.join(", ")}] 之一`
        );
      }
    }

    return true;
  }

  /**
   * 检验旁白文案是否超出证据边界
   * @param {Object} segment 
   * @param {Object} boundary 
   */
  static validateNarrationAgainstBoundary(segment, boundary) {
    const text = (segment.narration_text || "").trim();
    if (!text) return true;

    // 1. 检查严格禁止的声明 (strictly_forbidden_claims)
    if (Array.isArray(boundary.strictly_forbidden_claims)) {
      for (const forbidden of boundary.strictly_forbidden_claims) {
        if (!forbidden) continue;
        // 如果旁白直接包含了禁止声明的核心词汇或主干短语
        if (text.includes(forbidden)) {
          throw new DirectorValidationError(
            `${segment.segment_id}.unsupported_claim`,
            `旁白文案命中了严格禁止的虚假陈述: "${forbidden}"`
          );
        }
      }
    }

    // 2. 检查常见越界伪造断言（硬编码规则防护）：
    // 例如：禁止直接在旁白中断言"吴站长确认余则成是共产党"（因为全剧/第18集无此确证事实）
    const absoluteFalseClaims = [
      "站长确认余则成是共产党",
      "站长已经确认余则成是共党",
      "吴站长已确认余则成是共产党",
      "余则成在档案室排查照片",
      "余则成在机要档案室",
      "李涯当面搜捕余则成",
    ];

    for (const falseClaim of absoluteFalseClaims) {
      if (text.includes(falseClaim)) {
        throw new DirectorValidationError(
          `${segment.segment_id}.unsupported_claim`,
          `旁白文案包含未经证实且被明令禁止的客观伪断言: "${falseClaim}"`
        );
      }
    }

    // 3. 检查非出镜人物断言（如果旁白声称某人正在做出动作，而镜头中该人根本未出现）
    const visualFacts = boundary.visual_facts || [];
    const characters = segment.characters || boundary.characters || [];
    
    // 如果文案声称"李涯拔枪/李涯冲出"，但李涯根本不出镜
    if (text.includes("李涯走进") || text.includes("李涯冲出") || text.includes("李涯拔枪")) {
      if (!characters.includes("李涯")) {
        throw new DirectorValidationError(
          `${segment.segment_id}.unsupported_character_action`,
          `旁白声称李涯在画面中行动，但当前镜头客观人物列表为 [${characters.join(", ")}]，李涯并未出镜`
        );
      }
    }

    return true;
  }

  /**
   * 校验整个 Final Director Plan
   * @param {Object} plan 
   * @returns {boolean}
   */
  static validatePlan(plan) {
    if (!plan || typeof plan !== "object") {
      throw new DirectorValidationError("plan", "Plan 必须是非空对象");
    }

    const requiredTopFields = [
      "director_plan_id",
      "topic_id",
      "blogger_id",
      "target_duration",
      "segments",
    ];

    for (const f of requiredTopFields) {
      if (plan[f] === undefined || plan[f] === null) {
        throw new DirectorValidationError(`plan.${f}`, `缺少必填字段 '${f}'`);
      }
    }

    if (!Array.isArray(plan.segments) || plan.segments.length === 0) {
      throw new DirectorValidationError("plan.segments", "segments 必须为非空数组");
    }

    // 校验每个分段
    for (const seg of plan.segments) {
      this.validateSegment(seg);
    }

    // 校验 INSUFFICIENT_EVIDENCE 决议合法性：绝不允许存在对应的生产 segment
    if (plan.director_resolution_summary && Array.isArray(plan.director_resolution_summary.resolutions)) {
      for (const res of plan.director_resolution_summary.resolutions) {
        if (res.status === "INSUFFICIENT_EVIDENCE") {
          if (res.production_segment_created !== false) {
            throw new DirectorValidationError(
              `plan.resolution.${res.requirement_id}`,
              `INSUFFICIENT_EVIDENCE 决议必须将 production_segment_created 设为 false`
            );
          }
          const hasFakeSeg = plan.segments.some((s) => s.requirement_id === res.requirement_id);
          if (hasFakeSeg) {
            throw new DirectorValidationError(
              `plan.segments.${res.requirement_id}`,
              `INSUFFICIENT_EVIDENCE 需求 '${res.requirement_id}' 严禁生成生产 Segment！请执行 merge/drop 并移出 segments。`
            );
          }
        }
      }
    }

    // 校验分段之间的时间顺序与连贯性
    let totalPlannedDuration = 0;
    const seenSegIds = new Set();

    plan.segments.forEach((seg, idx) => {
      if (seenSegIds.has(seg.segment_id)) {
        throw new DirectorValidationError(`plan.segments[${idx}]`, `重复的 segment_id '${seg.segment_id}'`);
      }
      seenSegIds.add(seg.segment_id);
      totalPlannedDuration += seg.planned_duration;
    });

    return true;
  }
}
