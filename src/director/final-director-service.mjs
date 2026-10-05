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
   * 优先作为 A8 第一条真实成片候选
   * @returns {Object} Final Director Plan
   */
  buildDirectorPlanTopicB() {
    const planId = "plan_topic_qf18_dangerous_probe_v1";
    const topicId = "topic_qf18_dangerous_probe";
    const bloggerId = "laozhou_zhuiju";

    const segments = [
      // 01: 开场单间涮肉背景，老周旁白切入，揭示致命邀约
      // 镜头时长: 8.28s, 可用旁白时长: 7.78s
      // 文案精简为 27 字：预估 6.75s <= 7.78s (Fit!, 余量 1.03s)
      this.createSegment({
        segment_id: "seg_probe_01",
        beat_id: "beat_probe_01_hook",
        requirement_id: "req_probe_01",
        candidate_id: "cand_req_probe_01_unit_scene_0138_01_1", // Top1 (32:28.280 - 32:36.560, 8.28s)
        purpose: "开场交代涮肉馆致命饭局，老周旁白抛出全剧最凶险试探悬念",
        visual_reason: "东来顺包厢热气腾腾铜锅前，谢若林歪头打量，余则成冷笑警惕，张力拉满",
        audio_owner: "narration",
        narration_job: "context",
        narration_text: "老周重看第18集：余则成最大的危机，正是这顿东来顺涮肉。",
        audio_transition: "fade",
        subtitle_mode: "bottom_standard",
      }),

      // 02: 谢若林致命摊牌，原声极具震撼，完全保留原声！
      // 镜头时长: 13.20s, 旁白为 0 字，原声台词 35 字完整念完，绝不截断半句话
      this.createSegment({
        segment_id: "seg_probe_02",
        beat_id: "beat_probe_02_revelation",
        requirement_id: "req_probe_02",
        candidate_id: "cand_req_probe_02_unit_scene_0139_01_12", // Top1 (32:36.560 - 32:49.760, 13.20s)
        purpose: "呈现谢若林拿出底牌摊牌的巅峰原声，余则成身份面临灭顶危局",
        visual_reason: "谢若林冷笑开口吐烟圈，余则成眼神凝固，对白具有不可替代的压迫感",
        audio_owner: "original_dialogue",
        narration_job: "none",
        narration_text: "",
        original_dialogue_text: "这第一呀 重要的情报没人向上汇报 这第二啊 你是共党 那我很高兴 这第三呢",
        audio_transition: "hard_cut",
        subtitle_mode: "dialogue_highlight",
      }),

      // 03: 两根金条与主义伪装的博弈
      // 选用 A6 Top3 已批准候选 cand_req_probe_03_unit_scene_0147_01_4 (33:25.440–33:35.000, 9.56s)
      // 可用旁白时长: 9.56s - 0.5s = 9.06s
      // 文案精炼为 33 字：预估 8.25s <= 9.06s (Fit!, 余量 0.81s)
      this.createSegment({
        segment_id: "seg_probe_03",
        beat_id: "beat_probe_03_counterattack",
        requirement_id: "req_probe_03",
        candidate_id: "cand_req_probe_03_unit_scene_0147_01_4", // Top3 (33:25.440 - 33:35.000, 9.56s)
        purpose: "解析余则成如何把灭顶之灾变成生意同盟，反客为主瓦解试探",
        visual_reason: "谈及金钱与共党买情报，谢若林算计神情与余则成的商人伪装形成共振",
        audio_owner: "narration",
        narration_job: "interpretation",
        narration_text: "在老周看来，余则成顺着对方的贪婪，把政治信仰降维成一门两根金条的生意。",
        original_dialogue_text: "这不明摆着呢吗 买走情报那是共党 就等于封锁消息了",
        audio_transition: "duck",
        subtitle_mode: "bottom_standard",
      }),

      // 04: 暗夜火车站台撤离，汽笛声与总结升华
      // 镜头时长: 9.36s, 可用旁白时长: 8.86s
      // 文案精炼为 29 字：预估 7.25s <= 8.86s (Fit!, 余量 1.61s)
      this.createSegment({
        segment_id: "seg_probe_04",
        beat_id: "beat_probe_04_evacuation",
        requirement_id: "req_probe_04",
        candidate_id: "cand_req_probe_04_unit_scene_0193_01_2", // Top1 (40:42.000 - 40:51.360, 9.36s)
        purpose: "破局后安全送别晚秋登上列车，老周给出高维生存法则总结",
        visual_reason: "站台列车前夜色深沉，余则成翠平送别晚秋，暗夜破局意境深远",
        audio_owner: "narration",
        narration_job: "transition",
        narration_text: "老周总结：两根金条化解了灭顶危机，更为暗夜撤离赢得了生机。",
        original_dialogue_text: "梅姐我给你介绍 下 这是我们街坊晚秋",
        audio_transition: "L_cut",
        subtitle_mode: "bottom_standard",
      }),
    ];

    const totalPlannedDuration = segments.reduce((acc, s) => acc + s.planned_duration, 0);

    const plan = {
      director_plan_id: planId,
      topic_id: topicId,
      blogger_id: bloggerId,
      target_duration: Math.round(totalPlannedDuration * 100) / 100,
      aspect_ratio: "16:9",
      voice_config: {
        provider: "aliyun_tts",
        voice_id: "zh-CN-laozhou-deep",
        speech_rate: 1.0,
        pitch_rate: 1.0,
        estimated_chars_per_second: this.budgetConfig.estimated_chars_per_second,
      },
      director_resolution_summary: {
        insufficient_evidence_count: 0,
        resolutions: [],
      },
      duration_budget_summary: {
        all_segments_fit: segments.every((s) => s.duration_fit),
        total_narration_chars: segments.reduce((acc, s) => acc + s.narration_char_count, 0),
        total_estimated_tts_sec: Math.round(segments.reduce((acc, s) => acc + s.estimated_tts_duration_sec, 0) * 100) / 100,
        total_planned_sec: Math.round(totalPlannedDuration * 100) / 100,
      },
      segments,
    };

    DirectorEvidenceValidator.validatePlan(plan);
    return plan;
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
    const planId = "plan_topic_qf18_wu_suspicion_v1";
    const topicId = "topic_qf18_wu_suspicion";
    const bloggerId = "laozhou_zhuiju";

    const segments = [
      // 01: 师生假面，余则成与站长办公室对坐
      // 选用 Top1 cand_req_wu_01_unit_scene_0059_01_1 (16.72s, 可用旁白 16.22s)
      // 文案 60 字：预估 15.00s <= 16.22s (Fit!, 余量 1.22s)
      this.createSegment({
        segment_id: "seg_wu_01",
        beat_id: "beat_wu_01_hook",
        requirement_id: "req_wu_01",
        candidate_id: "cand_req_wu_01_unit_scene_0059_01_1", // Top1 (09:16.520 - 09:33.240, 16.72s)
        purpose: "开场确立师生博弈基调，抛出吴站长究竟何时开始怀疑的核心悬念",
        visual_reason: "站长办公室内两人近距离对坐，余则成垂手谨慎，吴站长目光深邃",
        audio_owner: "narration",
        narration_job: "foreshadow",
        narration_text: "老周聊谍战。许多观众问吴站长到底信不信余则成？第18集这句‘副站长就是你’，表面是提拔栽培，实则是站长布下的一场诛心大局。",
        original_dialogue_text: "提防李涯 站长也不可靠 你自己保重吧 金身而退 你说你这么就走了",
        audio_transition: "fade",
        subtitle_mode: "bottom_standard",
      }),

      // 02: 借委任状敲打，保留原声高光
      // 镜头时长: 6.00s, 旁白为 0 字，原声台词 26 字完整念完，绝不截断
      this.createSegment({
        segment_id: "seg_wu_02",
        beat_id: "beat_wu_02_testing",
        requirement_id: "req_wu_02",
        candidate_id: "cand_req_wu_02_unit_scene_0044_01_6", // Top1 (04:59.960 - 05:05.960, 6.00s)
        purpose: "展示吴站长抽雪茄敲山震虎的压迫感原声",
        visual_reason: "吴站长靠坐大班椅吐烟圈，余则成立正聆听，气场完全碾压",
        audio_owner: "original_dialogue",
        narration_job: "none",
        narration_text: "",
        original_dialogue_text: "你来当这个副站长 不合适吧 还是跟李队长商量商量",
        audio_transition: "hard_cut",
        subtitle_mode: "dialogue_highlight",
      }),

      // 03: 终章收尾 (合并 req_wu_03 立意：站长不看卷宗看利益与人心)
      // 选用 Top2 cand_req_wu_04_unit_scene_0059_01_1 (16.72s, 可用旁白 16.22s)
      // 文案 61 字：预估 15.25s <= 16.22s (Fit!, 余量 0.97s)
      this.createSegment({
        segment_id: "seg_wu_04",
        beat_id: "beat_wu_04_conclusion",
        requirement_id: "req_wu_04",
        candidate_id: "cand_req_wu_04_unit_scene_0059_01_1", // Top2 (09:16.520 - 09:33.240, 16.72s)
        purpose: "收束全片论点：吴站长从不依赖物理卷宗，看穿不戳穿、留有余地才是老狐狸的真正驭人之道",
        visual_reason: "站长室内两人机密谈话，谈及李涯与暗流，生动诠释保密局利益至上的潜规则",
        audio_owner: "narration",
        narration_job: "interpretation",
        narration_text: "在老周看来，吴敬中从不依赖物理卷宗去查余则成。只要你能帮我搞金佛、捞美钞，看破不戳破，才是这位保密局老狐狸的终极生存法则。",
        original_dialogue_text: "提防李涯 站长也不可靠 你自己保重吧 金身而退 你说你这么就走了",
        audio_transition: "duck",
        subtitle_mode: "bottom_standard",
      }),
    ];

    const totalPlannedDuration = segments.reduce((acc, s) => acc + s.planned_duration, 0);

    const plan = {
      director_plan_id: planId,
      topic_id: topicId,
      blogger_id: bloggerId,
      target_duration: Math.round(totalPlannedDuration * 100) / 100,
      aspect_ratio: "16:9",
      voice_config: {
        provider: "aliyun_tts",
        voice_id: "zh-CN-laozhou-deep",
        speech_rate: 1.0,
        pitch_rate: 1.0,
        estimated_chars_per_second: this.budgetConfig.estimated_chars_per_second,
      },
      director_resolution_summary: {
        insufficient_evidence_count: 1,
        resolutions: [
          {
            requirement_id: "req_wu_03",
            beat_id: "beat_wu_03_crisis",
            status: "INSUFFICIENT_EVIDENCE",
            resolution_action: "merge",
            merged_into_beat_id: "beat_wu_04_conclusion",
            production_segment_created: false,
            rationale: "第18集客观事实无档案室镜头且李涯零出镜；按规范严禁创建虚假生产Segment，将站长不依赖物理卷宗而是看穿人性的心战立意自然合并入终章 seg_wu_04。",
          },
        ],
      },
      duration_budget_summary: {
        all_segments_fit: segments.every((s) => s.duration_fit),
        total_narration_chars: segments.reduce((acc, s) => acc + s.narration_char_count, 0),
        total_estimated_tts_sec: Math.round(segments.reduce((acc, s) => acc + s.estimated_tts_duration_sec, 0) * 100) / 100,
        total_planned_sec: Math.round(totalPlannedDuration * 100) / 100,
      },
      segments,
    };

    DirectorEvidenceValidator.validatePlan(plan);
    return plan;
  }
}
