/**
 * @file final-director-service.mjs
 * @description POC-AGENT A7: Final Director Plan 核心编排服务。
 * 
 * 核心设计原则：
 * 1. 严格消费真实 A6 产物：每个 segment 所选候选镜头必须属于 A6 Top3 集合！
 * 2. 严禁伪造镜头，严禁新增 Top3 之外的镜头与 scene_id。
 * 3. 显式处理 INSUFFICIENT_EVIDENCE (如 req_wu_03)：记录 director_resolution 与 resolution_action。
 * 4. 音频所有权先于旁白 (Audio Ownership First)：原声足够有力量时保护原声，narration_job = none。
 * 5. Narration Job 先于 Narration Text：先明确解说职责，再生成证据对齐的旁白。
 * 6. 整合 DirectorEvidenceValidator 进行证据边界阻断校验。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseTimecodeToSeconds } from "../contracts/validators.mjs";
import { DirectorEvidenceValidator, DirectorValidationError } from "./director-evidence-validator.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FinalDirectorService {
  constructor(options = {}) {
    this.reviewPackagePath = options.reviewPackagePath || path.resolve(__dirname, "../perspective/results/a6_human_gate_review.json");
    this.reviewData = null;
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
   * 严格实施镜头合法性、音频所有权与证据边界校验
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
      override_timecode = null,
    } = segmentParams;

    // 1. 获取 A6 Top3 候选池并严格断言
    const top3 = this.getTop3CandidatesForRequirement(requirement_id);
    const matchedCandidate = top3.find((c) => c.candidate_id === candidate_id);

    if (!matchedCandidate) {
      const allowedIds = top3.map((c) => c.candidate_id).join(", ");
      throw new DirectorValidationError(
        `${segment_id}.candidate_id`,
        `非法镜头选择！候选 '${candidate_id}' 不在 A6 Top3 允许集合 [${allowedIds}] 中。严禁使用 Top3 外的镜头！`
      );
    }

    // 2. 检查 INSUFFICIENT_EVIDENCE
    const reqStatus = this.getRequirementStatus(requirement_id);
    let finalDirectorResolution = director_resolution;
    let finalResolutionAction = resolution_action;

    if (reqStatus.status === "INSUFFICIENT_EVIDENCE") {
      if (!finalDirectorResolution) {
        finalDirectorResolution = "insufficient_evidence";
      }
      if (!finalResolutionAction) {
        finalResolutionAction = "soften"; // 默认安全策略：澄清事实，软化断言
      }
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
      narration_text: narration_text.trim(),
      original_dialogue_text: original_dialogue_text || (matchedCandidate.dialogue || ""),
      audio_transition,
      subtitle_mode,
      evidence_boundary: evidenceBoundary,
      risk_flags: matchedCandidate.risk_flags || [],
      characters: matchedCandidate.characters || [],
    };

    if (finalDirectorResolution) {
      segment.director_resolution = finalDirectorResolution;
      segment.resolution_action = finalResolutionAction;
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
      this.createSegment({
        segment_id: "seg_probe_01",
        beat_id: "beat_probe_01_hook",
        requirement_id: "req_probe_01",
        candidate_id: "cand_req_probe_01_unit_scene_0138_01_1", // Top1 (32:28.280 - 32:36.560)
        purpose: "开场交代涮肉馆致命饭局，老周旁白抛出全剧最凶险试探悬念",
        visual_reason: "东来顺包厢热气腾腾铜锅前，谢若林歪头打量，余则成冷笑警惕，张力拉满",
        audio_owner: "narration",
        narration_job: "context",
        narration_text: "老周带大家重看第18集。许多人以为余则成最大的危机是被李涯盯上，但真正让他命悬一线的，其实是这顿看似寻常的东来顺涮羊肉。",
        audio_transition: "fade",
        subtitle_mode: "bottom_standard",
      }),

      // 02: 谢若林致命摊牌，原声极具震撼，完全保留原声！
      this.createSegment({
        segment_id: "seg_probe_02",
        beat_id: "beat_probe_02_revelation",
        requirement_id: "req_probe_02",
        candidate_id: "cand_req_probe_02_unit_scene_0139_01_12", // Top1 (32:36.560 - 32:49.760)
        purpose: "呈现谢若林拿出底牌摊牌的巅峰原声，余则成身份面临灭顶危局",
        visual_reason: "谢若林冷笑开口吐烟圈，余则成眼神凝固，对白具有不可替代的压迫感",
        audio_owner: "original_dialogue",
        narration_job: "none",
        narration_text: "",
        original_dialogue_text: "这第一呀 重要的情报没人向上汇报 这第二啊 你是共党 那我很高兴 这第三呢",
        audio_transition: "hard_cut",
        subtitle_mode: "dialogue_highlight",
      }),

      // 03: 两根金条与主义伪装的博弈，原声起、老周解说切入
      this.createSegment({
        segment_id: "seg_probe_03",
        beat_id: "beat_probe_03_counterattack",
        requirement_id: "req_probe_03",
        candidate_id: "cand_req_probe_03_unit_scene_0149_01_1", // Top1 (33:37.760 - 33:43.200)
        purpose: "解析余则成如何把灭顶之灾变成生意同盟，反客为主瓦解试探",
        visual_reason: "谈及金钱与情报买卖，谢若林算计神情与余则成的商人伪装形成共振",
        audio_owner: "original_dialogue",
        narration_job: "interpretation",
        narration_text: "在老周看来，面对致命指控，余则成没有拔枪，而是顺着谢若林的贪婪，把政治信仰降维成一门两根金条的生意。在利欲熏心的保密局，贪婪比任何表忠心都更能打消怀疑。",
        original_dialogue_text: "个师呀才两根金条 人家这买卖多会做呀",
        audio_transition: "duck", // 避让策略：原声淡入前两秒后 duck 压低，旁白接入
        subtitle_mode: "bottom_standard",
      }),

      // 04: 暗夜火车站台撤离，汽笛声与总结升华
      this.createSegment({
        segment_id: "seg_probe_04",
        beat_id: "beat_probe_04_evacuation",
        requirement_id: "req_probe_04",
        candidate_id: "cand_req_probe_04_unit_scene_0193_01_2", // Top1 (40:42.000 - 40:51.360)
        purpose: "破局后安全送别晚秋登上列车，老周给出高维生存法则总结",
        visual_reason: "站台列车前夜色深沉，余则成翠平送别晚秋，暗夜破局意境深远",
        audio_owner: "narration",
        narration_job: "transition",
        narration_text: "老周总结：两根金条解除了眼前的杀身之祸，也为暗夜中的撤离赢得了生机。真正的潜伏高手，从不在绝境中硬碰硬，而是在敌人最贪婪的裂缝里绝处逢生。",
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
        speech_rate: 1.05,
        pitch_rate: 0.98,
      },
      director_resolution_summary: {
        insufficient_evidence_count: 0,
        resolutions: [],
      },
      segments,
    };

    DirectorEvidenceValidator.validatePlan(plan);
    return plan;
  }

  /**
   * 生成真实选题 A: “吴站长什么时候开始怀疑余则成？” Final Director Plan
   * 特别处理 req_wu_03 INSUFFICIENT_EVIDENCE
   * @returns {Object} Final Director Plan
   */
  buildDirectorPlanTopicA() {
    const planId = "plan_topic_qf18_wu_suspicion_v1";
    const topicId = "topic_qf18_wu_suspicion";
    const bloggerId = "laozhou_zhuiju";

    const segments = [
      // 01: 师生假面，余则成与站长办公室对坐
      this.createSegment({
        segment_id: "seg_wu_01",
        beat_id: "beat_wu_01_hook",
        requirement_id: "req_wu_01",
        candidate_id: "cand_req_wu_01_unit_scene_0046_01_5", // Top2 (05:10.960 - 05:15.000)
        purpose: "开场确立师生博弈基调，抛出吴站长究竟何时开始怀疑的核心悬念",
        visual_reason: "站长办公室内两人近距离对坐，余则成垂手谨慎，吴站长目光意味深长",
        audio_owner: "narration",
        narration_job: "foreshadow",
        narration_text: "老周聊谍战。许多观众问吴站长到底信不信余则成？第18集这句‘副站长就是你’，表面是提拔栽培，实则是站长布下的一场诛心大局。",
        original_dialogue_text: "副站长就是你 谢谢老师栽培",
        audio_transition: "fade",
        subtitle_mode: "bottom_standard",
      }),

      // 02: 借委任状敲打，保留原声高光
      this.createSegment({
        segment_id: "seg_wu_02",
        beat_id: "beat_wu_02_testing",
        requirement_id: "req_wu_02",
        candidate_id: "cand_req_wu_02_unit_scene_0044_01_6", // Top1 (04:59.960 - 05:05.960)
        purpose: "展示吴站长抽雪茄敲山震虎的压迫感原声",
        visual_reason: "吴站长靠坐大班椅吐烟圈，余则成立正聆听，气场完全碾压",
        audio_owner: "original_dialogue",
        narration_job: "none",
        narration_text: "",
        original_dialogue_text: "你来当这个副站长 不合适吧 还是跟李队长商量商量",
        audio_transition: "hard_cut",
        subtitle_mode: "dialogue_highlight",
      }),

      // 03: req_wu_03 INSUFFICIENT_EVIDENCE 决议段落！
      // 绝不伪造档案室镜头！选用 Top1 candidate unit_scene_0059_01，通过旁白澄清事实真相与心理暗战
      this.createSegment({
        segment_id: "seg_wu_03",
        beat_id: "beat_wu_03_crisis",
        requirement_id: "req_wu_03",
        candidate_id: "cand_req_wu_03_unit_scene_0059_01_8", // Top1 in Top3 (09:16.520 - 09:33.240)
        purpose: "处理档案室险情节拍：澄清物理档案缺失事实，升华至站长洞悉人性的心理试探",
        visual_reason: "两人在站长室内再次机密对话，李涯与站长名字被直接提及，紧迫感十足",
        audio_owner: "narration",
        narration_job: "context",
        narration_text: "老周必须说明：整部第18集里，并没有李涯在机要室搜查余则成物理档案的镜头。为什么？因为在老站长眼里，一纸档案根本不重要，真正致命的是人心。站长始终没有拿到物理卷宗，但他通过一次次言语刺探，早已在心底给余则成打下了问号。",
        original_dialogue_text: "提防李涯 站长也不可靠 你自己保重吧 金身而退 你说你这么就走了",
        audio_transition: "L_cut",
        subtitle_mode: "bottom_standard",
        director_resolution: "insufficient_evidence",
        resolution_action: "soften",
      }),

      // 04: 站长官场哲学收尾，老周深度透视
      this.createSegment({
        segment_id: "seg_wu_04",
        beat_id: "beat_wu_04_conclusion",
        requirement_id: "req_wu_04",
        candidate_id: "cand_req_wu_04_unit_scene_0047_04_3", // Top3 (05:27.000 - 05:33.360)
        purpose: "收束全片论点：看穿不戳穿、留有余地才是老谋深算站长的真正驭人之道",
        visual_reason: "谈及钱财与值钱家当，神态深沉克制，生动诠释保密局利益至上潜规则",
        audio_owner: "narration",
        narration_job: "interpretation",
        narration_text: "在老周看来，吴敬中从不追求‘余则成到底是不是共产党’的纯粹真相。只要你能帮我搞金佛、捞美钞，看破不戳破，才是这位保密局官场不倒翁的终极生存法则。",
        original_dialogue_text: "她怕有人查她家 好像他们家有很多值钱的东西",
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
        speech_rate: 1.05,
        pitch_rate: 0.98,
      },
      director_resolution_summary: {
        insufficient_evidence_count: 1,
        resolutions: [
          {
            requirement_id: "req_wu_03",
            beat_id: "beat_wu_03_crisis",
            status: "INSUFFICIENT_EVIDENCE",
            action: "soften",
            rationale: "第18集不存在机要室翻查档案镜头；拒绝伪造假镜头，旁白显式澄清事实缺失，将立意转为站长不依赖物理卷宗的心战敲打，使用合法 Top1 unit_scene_0059_01 承载画面。",
          },
        ],
      },
      segments,
    };

    DirectorEvidenceValidator.validatePlan(plan);
    return plan;
  }
}
