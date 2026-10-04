/**
 * @file operations-orchestrator.mjs
 * @description POC-AGENT A4: Topic-First 运营任务编排服务。
 * 运营Agent 作为唯一面向真人的交互入口，负责意图理解、Topic/Viewpoint立项、
 * 多轮反馈修订历史保留、Story Beats 拆解与 Material Requirements 导出。
 * 严格守界：Story Beats 阶段严禁在无真实证据前写死最终物理时间码或最终剧情定论。
 */

import {
  validatePersona,
  validateTopic,
  validateCoreViewpoint,
  validateStoryBeat,
  validateMaterialRequirement,
} from "../contracts/validators.mjs";
import {
  JOB_STATES,
  createProductionJob,
  transitionJob,
} from "../contracts/job-state-machine.mjs";

export class OrchestratorError extends Error {
  constructor(message, details = {}) {
    super(`[OperationsOrchestratorError] ${message}`);
    this.name = "OrchestratorError";
    this.details = details;
  }
}

/**
 * Topic-First 运营任务编排控制器
 */
export class OperationsOrchestrator {
  /**
   * 1. 根据真人运营意图与博主人设，初始化生产任务 (形成 Topic 与初始 Core Viewpoint)
   * @param {Object} params
   * @param {Object} params.persona 博主人设 (Persona)
   * @param {string} params.operatorIntent 真人运营意图描述
   * @param {string} params.sourceMediaId 关联作品标识
   * @param {Object} [params.topicDefaults] 可选画幅与时长偏好
   * @returns {Object} 初始化的 ProductionJob
   */
  static initiateJobFromIntent({ persona, operatorIntent, sourceMediaId, topicDefaults = {} }) {
    validatePersona(persona);

    if (typeof operatorIntent !== "string" || !operatorIntent.trim()) {
      throw new OrchestratorError("真人运营意图 (operatorIntent) 必须为非空文本");
    }
    if (typeof sourceMediaId !== "string" || !sourceMediaId.trim()) {
      throw new OrchestratorError("sourceMediaId 必须为非空文本");
    }

    const timestamp = Date.now().toString(36);
    const jobId = `job-${persona.id}-${timestamp}`;
    const topicId = `topic-${sourceMediaId}-${timestamp}`;

    // 结构化生成符合规范的初始 Topic
    const topic = {
      id: topicId,
      blogger_id: persona.id,
      title: topicDefaults.title || `围绕意图策划: ${operatorIntent.slice(0, 30)}`,
      source_media_id: sourceMediaId,
      aspect_ratio: topicDefaults.aspect_ratio || "16:9",
      target_duration_sec: topicDefaults.target_duration_sec || 120,
    };
    validateTopic(topic);

    // 结构化生成初始 Core Viewpoint (版本 1)
    const initialViewpoint = {
      topic_id: topicId,
      thesis: topicDefaults.thesis || `基于${persona.name}视角: ${operatorIntent}`,
      hook: topicDefaults.hook || `为什么这一关键情节暗藏深意？`,
      takeaway: topicDefaults.takeaway || `通过镜头视听细节，提供高维戏剧或现实认知洞察。`,
      tone_keywords: persona.tone.split("、").map((s) => s.trim()).filter(Boolean),
      version: 1,
    };
    validateCoreViewpoint(initialViewpoint);

    const initialPayload = {
      operator_intent: operatorIntent,
      persona,
      topic,
      core_viewpoint: initialViewpoint,
      revisions: [],
      beats: [],
      material_requirements: [],
    };

    const job = createProductionJob({
      jobId,
      topicId,
      bloggerId: persona.id,
      initialPayload,
    });

    return job;
  }

  /**
   * 2. 支持真人运营多轮交互修改 Core Viewpoint (保留完整 Revision History，不新建任务)
   * @param {Object} job 现有 ProductionJob
   * @param {Object} params
   * @param {string} params.feedback 真人修改反馈 (如 "这个结论太绝对了，收一点。")
   * @param {Object} params.revisedFields 修改后的具体字段 (如 { thesis, hook, takeaway })
   * @returns {Object} 带有修订历史的新 Job 副本
   */
  static reviseCoreViewpoint(job, { feedback, revisedFields }) {
    if (!job || !job.payload || !job.payload.core_viewpoint) {
      throw new OrchestratorError("无效的 Job 实例或缺少 core_viewpoint 载荷");
    }
    if (typeof feedback !== "string" || !feedback.trim()) {
      throw new OrchestratorError("修订反馈 (feedback) 必须为非空描述说明");
    }

    const currentVp = job.payload.core_viewpoint;
    const nextVersion = (currentVp.version || 1) + 1;

    const nextVp = {
      ...currentVp,
      ...revisedFields,
      topic_id: job.topic_id,
      version: nextVersion,
    };
    validateCoreViewpoint(nextVp);

    const revisionEntry = {
      revision_id: `rev-vp-v${nextVersion}-${Date.now().toString(36)}`,
      target: "core_viewpoint",
      version: nextVersion,
      previous_value: { ...currentVp },
      updated_value: { ...nextVp },
      operator_feedback: feedback.trim(),
      timestamp: new Date().toISOString(),
    };

    const nextRevisions = [...(job.payload.revisions || []), revisionEntry];

    // 更新 payload，并在 history 中记录修订
    const updatedJob = {
      ...job,
      updated_at: new Date().toISOString(),
      payload: {
        ...job.payload,
        core_viewpoint: nextVp,
        revisions: nextRevisions,
      },
      history: [
        ...job.history,
        {
          from: job.status,
          to: job.status,
          timestamp: new Date().toISOString(),
          reason: `Core Viewpoint 修订至 v${nextVersion}: ${feedback.trim()}`,
        },
      ],
    };

    return updatedJob;
  }

  /**
   * 3. 编排 Story Beats (叙事节拍骨架)
   * 严格守界：只表达“想讲什么”，严禁在无真实证据前写死具体时间码或物理片段 ID
   * @param {Object} job
   * @param {Array<Object>} beatsConfig 叙事节拍定义列表
   * @returns {Object} 跃迁至 SCRIPTING 状态的新 Job 副本
   */
  static generateStoryBeats(job, beatsConfig) {
    if (!Array.isArray(beatsConfig) || beatsConfig.length === 0) {
      throw new OrchestratorError("Story Beats 列表必须是非空数组");
    }

    const beats = beatsConfig.map((item, index) => {
      // 守界检查：严禁包含具体物理时间码或锁死场景
      if ("in_timecode" in item || "out_timecode" in item || "scene_id" in item) {
        throw new OrchestratorError(
          `StoryBeat [${item.beat_id || index}] 严禁在无证据检索阶段写死物理时间码或 scene_id！`
        );
      }

      const beat = {
        beat_id: item.beat_id || `beat-${String(index + 1).padStart(2, "0")}`,
        order: item.order !== undefined ? item.order : index + 1,
        beat_title: item.beat_title,
        narrative_function: item.narrative_function || "hook",
        target_duration_sec: item.target_duration_sec || 5.0,
        key_dialogue_or_claim: item.key_dialogue_or_claim || "",
      };
      validateStoryBeat(beat);
      return Object.freeze(beat);
    });

    let activeJob = job;
    if (activeJob.status === JOB_STATES.DRAFTING) {
      activeJob = transitionJob(activeJob, JOB_STATES.SCRIPTING, {
        reason: "推进至分镜节拍构思阶段",
        currentStage: "2. 节拍编排与诉求推导 (Story Beats & Requirements)",
      });
    }

    return {
      ...activeJob,
      payload: {
        ...activeJob.payload,
        beats,
      },
    };
  }

  /**
   * 4. 导出 Material Requirements (画面/情节/情绪诉求)，并提交至真人审核卡点
   * 严格守界：只声明画面动作诉求与期望戏剧功能，不涉及具体镜头
   * @param {Object} job
   * @param {Array<Object>} requirementsConfig
   * @returns {Object} 跃迁至 AWAITING_SCRIPT_REVIEW 状态的 Job 副本
   */
  static deriveMaterialRequirementsAndSubmit(job, requirementsConfig) {
    if (!job.payload.beats || job.payload.beats.length === 0) {
      throw new OrchestratorError("必须先存在合法的 Story Beats 方可推导画面素材诉求");
    }
    if (!Array.isArray(requirementsConfig) || requirementsConfig.length === 0) {
      throw new OrchestratorError("Material Requirements 必须是非空数组");
    }

    const beatIds = new Set(job.payload.beats.map((b) => b.beat_id));

    const requirements = requirementsConfig.map((req, idx) => {
      if (!beatIds.has(req.beat_id)) {
        throw new OrchestratorError(`Material Requirement 关联的 beat_id '${req.beat_id}' 不在现有节拍中`);
      }

      // 守界检查：严禁包含具体物理时间码或锁死场景
      if ("in_timecode" in req || "out_timecode" in req || "scene_id" in req) {
        throw new OrchestratorError(
          `MaterialRequirement [${req.beat_id}] 严禁在无证据检索阶段写死物理时间码或 scene_id！`
        );
      }

      const requirement = {
        beat_id: req.beat_id,
        characters: Array.isArray(req.characters) ? req.characters : [],
        scene_env: req.scene_env || "",
        action_cue: req.action_cue,
        emotional_tone: req.emotional_tone,
        preferred_affordances: Array.isArray(req.preferred_affordances) ? req.preferred_affordances : [],
        forbidden_elements: Array.isArray(req.forbidden_elements) ? req.forbidden_elements : [],
      };
      validateMaterialRequirement(requirement);
      return Object.freeze(requirement);
    });

    // 跃迁至等待审核状态
    const submittedJob = transitionJob(job, JOB_STATES.AWAITING_SCRIPT_REVIEW, {
      reason: "Story Beats 与画面需求已生成，挂起等待真人运营审核",
      currentStage: "3. 脚本与诉求真人审核卡点 (Awaiting Script Review)",
      payloadUpdate: {
        material_requirements: requirements,
      },
    });

    return submittedJob;
  }
}
