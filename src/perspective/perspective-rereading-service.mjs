/**
 * @file perspective-rereading-service.mjs
 * @description POC-AGENT A6: 动态 Perspective Re-reading 服务。
 * 消费 A5 Top20 候选镜头，结合博主画像 (Persona)、选题、核心观点与故事节拍，
 * 执行逐候选深度再解读、证据边界锁定、主张支持度裁决与 Top3/Top5 重排。
 * 
 * 严格边界铁律：
 * 1. 绝对不修改 L1 Objective Evidence；
 * 2. 绝对不将 L3 主观解释写入 L2 Generic Affordance；
 * 3. 绝对不提前开始 A7 导演决策、剪辑或视频合成。
 */

import { LAOZHOU_PERSONA } from "./persona/laozhou-persona.mjs";
import { SemanticAndConceptPerspectiveProvider } from "./providers/perspective-provider.mjs";
import { HumanGateEvaluator } from "./evaluator/human-gate-evaluator.mjs";
import { validatePerspectiveReading } from "../contracts/validators.mjs";

export class PerspectiveReReadingService {
  /**
   * @param {Object} [options]
   * @param {Object} [options.provider] 可插拔 Provider
   * @param {Object} [options.persona] 博主画像
   * @param {Object} [options.weights] A5 召回分与 A6 视角分混合权重
   */
  constructor(options = {}) {
    this.provider = options.provider || new SemanticAndConceptPerspectiveProvider();
    this.persona = options.persona || LAOZHOU_PERSONA;
    this.humanGateEvaluator = new HumanGateEvaluator();
    this.weights = {
      a5_retrieval: 0.40,
      a6_perspective: 0.60,
      ...options.weights,
    };
  }

  /**
   * 对单个 Candidate 镜头执行视角再解读
   * @param {Object} candidate A5 候选镜头
   * @param {Object} context { topic, viewpoint, beat, requirement }
   * @returns {Object} 视角解读结果 (严格通过 validatePerspectiveReading)
   */
  rereadCandidate(candidate, context) {
    const reading = this.provider.interpretCandidate({
      persona: this.persona,
      topic: context.topic,
      viewpoint: context.viewpoint,
      beat: context.beat,
      requirement: context.requirement,
      candidate,
    });

    // 校验契约合规性
    validatePerspectiveReading(reading);
    return reading;
  }

  /**
   * 对单个 MaterialRequirement 对应的 Top20 候选列表执行全量重读与重排
   * @param {Object} requirement MaterialRequirement
   * @param {Array<Object>} candidates A5 产出的 Top20 候选列表
   * @param {Object} context { topic, viewpoint, beat }
   * @param {Object} [options]
   * @returns {Object} 重排结果（包含 Top3, Top5, 排序升降记录与证据充足度判定）
   */
  rerankRequirement(requirement, candidates, context, options = {}) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return {
        requirement_id: requirement.requirement_id,
        beat_id: requirement.beat_id,
        status: "INSUFFICIENT_EVIDENCE",
        suggested_actions: ["soften_claim", "modify_viewpoint", "modify_beat", "retrieve_again"],
        reason: "未找到任何候选镜头，无法进行视角重读",
        top20_reread: [],
        top5: [],
        top3: [],
        usable_candidate_count_in_top3: 0,
        gate_pass: false,
      };
    }

    // 1. 逐个候选重新打分与解读
    const rereadList = candidates.map((cand, idx) => {
      const a5Rank = idx + 1; // A5 原始排名 (1-indexed)
      const a5Score = cand.total_score !== undefined ? cand.total_score : cand.total_retrieval_score;

      const reading = this.rereadCandidate(cand, { ...context, requirement });

      // 计算最终综合重排得分 (A5 基础相关性 + A6 视角叙事契合度)
      const a6Score = reading.a6_perspective_score;
      const finalScore = Number((
        a5Score * this.weights.a5_retrieval +
        a6Score * this.weights.a6_perspective
      ).toFixed(3));

      return {
        ...reading,
        candidate_raw: cand,
        retrieval_unit_id: cand.retrieval_unit_id || cand.unit_id || cand.scene_id,
        parent_scene_id: cand.parent_scene_id || cand.scene_id,
        scene_id: cand.scene_id,
        timecode: cand.timecode,
        characters: cand.characters,
        dialogue: cand.dialogue,
        physical_actions: cand.physical_actions,
        scene_env: cand.scene_env,
        a5_rank: a5Rank,
        a5_retrieval_score: a5Score,
        final_ranking_score: finalScore,
      };
    });

    // 2. 按综合重排得分降序排序并应用时序多样性微调
    rereadList.sort((a, b) => b.final_ranking_score - a.final_ranking_score);

    // 3. 分配 A6 排名并计算 rank delta
    const rankedWithDelta = rereadList.map((item, idx) => {
      const a6Rank = idx + 1;
      const rankDelta = item.a5_rank - a6Rank; // 正数表示排名上升，负数表示下降
      return {
        ...item,
        a6_rank: a6Rank,
        rank_delta: rankDelta,
      };
    });

    // 4. 评估证据充足性 (Evidence Sufficiency Audit)
    // 若所有候选均不能支持核心论断 (supports_claim === 'false' 或 evidence_support_score < 0.40)
    const hasAnySupport = rankedWithDelta.some(
      (c) => c.supports_claim !== "false" && c.evidence_support_score >= 0.40
    );

    let status = "SUFFICIENT";
    let suggestedActions = [];
    let sufficiencyReason = "候选镜头中存在确凿客观证据，能够有效支撑故事节拍与视角论点。";

    if (!hasAnySupport) {
      status = "INSUFFICIENT_EVIDENCE";
      suggestedActions = ["soften_claim", "modify_viewpoint", "modify_beat", "retrieve_again"];
      sufficiencyReason = "A5 召回的 20 个候选镜头均缺乏直接物理事实支撑该节拍的核心观点，为防止模型幻觉，建议软化断言或调整素材诉求。";
    }

    // 5. 截取 Top5 与 Top3
    const top5 = rankedWithDelta.slice(0, 5);
    const top3 = rankedWithDelta.slice(0, 3);

    // 6. 检查 Top3 中是否至少存在 1 个可用镜头
    const usableInTop3 = top3.filter(
      (c) => c.recommended_use !== "reject" && c.supports_claim !== "false"
    );
    const gatePass = usableInTop3.length >= 1;

    return {
      requirement_id: requirement.requirement_id,
      beat_id: requirement.beat_id,
      status,
      suggested_actions: suggestedActions,
      reason: sufficiencyReason,
      top20_reread: rankedWithDelta,
      top5,
      top3,
      usable_candidate_count_in_top3: usableInTop3.length,
      gate_pass: gatePass,
    };
  }

  /**
   * 为整个运营选题任务批量处理所有 Requirements 的视角重读与 Gate 判定
   * @param {Object} topicTask 选题任务 (包含 topic, viewpoint, story_beats, material_requirements)
   * @param {Object} retrievalResults A5 检索结果 (包含 requirements_candidates)
   * @param {Object} [options]
   * @returns {Object}
   */
  processTopicTask(topicTask, retrievalResults, options = {}) {
    const { topic, viewpoint, story_beats, material_requirements } = topicTask;
    const candidatesMap = retrievalResults.requirements_candidates || {};

    const beatsMap = new Map();
    if (Array.isArray(story_beats)) {
      story_beats.forEach((b) => beatsMap.set(b.beat_id, b));
    }

    const requirementsReread = {};
    let passedReqs = 0;

    for (const req of material_requirements) {
      const beat = beatsMap.get(req.beat_id) || null;
      const cands = candidatesMap[req.requirement_id] || [];
      const res = this.rerankRequirement(req, cands, { topic, viewpoint, beat }, options);
      requirementsReread[req.requirement_id] = res;
      if (res.gate_pass) {
        passedReqs++;
      }
    }

    const totalReqs = material_requirements.length;
    const passRate = totalReqs > 0 ? Number((passedReqs / totalReqs).toFixed(3)) : 0;

    return {
      topic_id: topic.topic_id || topic.id,
      blogger_id: this.persona.blogger_id,
      total_requirements: totalReqs,
      pass_requirements: passedReqs,
      system_candidate_coverage: passRate,
      system_gate_status: passRate >= 0.8 ? "system_candidate_pass" : "system_candidate_fail",
      human_gate_status: "awaiting_human_review",
      requirements_reread: requirementsReread,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 综合评估两个或多个选题的跨选题整体 Retrieval Top3 Gate
   * 严守原则：自动 Perspective 结果只输出系统推荐与自评覆盖率，正式 Gate 判定在真人未审核前保持 awaiting_human_review。
   * @param {Array<Object>} topicTaskResults processTopicTask 的结果数组
   * @returns {Object} 跨选题综合 Gate 评估报告
   */
  evaluateOverallGate(topicTaskResults) {
    let totalReqCount = 0;
    let totalPassCount = 0;
    const samples = [];

    for (const taskRes of topicTaskResults) {
      totalReqCount += taskRes.total_requirements;
      totalPassCount += taskRes.pass_requirements;

      for (const [reqId, reqRes] of Object.entries(taskRes.requirements_reread)) {
        const top1 = reqRes.top3[0] || null;
        const top2 = reqRes.top3[1] || null;
        const top3 = reqRes.top3[2] || null;

        // 寻找最优可用候选
        const bestUsable = reqRes.top3.find(
          (c) => c.recommended_use !== "reject" && c.supports_claim !== "false"
        ) || top1;

        samples.push({
          topic_id: taskRes.topic_id,
          requirement_id: reqId,
          beat_id: reqRes.beat_id,
          top1_scene: top1 ? top1.candidate_raw.scene_id : "N/A",
          top2_scene: top2 ? top2.candidate_raw.scene_id : "N/A",
          top3_scene: top3 ? top3.candidate_raw.scene_id : "N/A",
          has_usable_in_top3: reqRes.gate_pass,
          best_usable_scene: bestUsable ? bestUsable.candidate_raw.scene_id : "N/A",
          best_usable_timecode: bestUsable ? `${bestUsable.candidate_raw.timecode.in} - ${bestUsable.candidate_raw.timecode.out}` : "N/A",
          best_a5_rank: bestUsable ? bestUsable.a5_rank : 0,
          best_a6_rank: bestUsable ? bestUsable.a6_rank : 0,
          rank_delta: bestUsable ? bestUsable.rank_delta : 0,
          selection_reason: bestUsable ? bestUsable.selection_reason : "N/A",
          evidence_boundary: bestUsable ? bestUsable.evidence_boundary : "N/A",
          system_recommendation: bestUsable ? bestUsable.recommended_use : "supporting",
          gate_verdict: "awaiting_human_review",
        });
      }
    }

    const overallCoverage = totalReqCount > 0 ? Number((totalPassCount / totalReqCount).toFixed(3)) : 0;

    return {
      total_requirements: totalReqCount,
      system_passed_requirements: totalPassCount,
      failed_requirements: totalReqCount - totalPassCount,
      system_candidate_coverage: overallCoverage,
      human_usable_coverage: 0.0,
      gate_threshold: 0.8,
      gate_passed: false, // 严格规定：真人未完成审核前，严禁为 true
      gate_status: "awaiting_human_review",
      note: "此项仅为系统算法自评候选覆盖率 (100%)，未经过真人审核前正式 Retrieval Top3 Gate 不得判定为 PASS。",
      samples,
    };
  }

  /**
   * 构造独立的人工审核包
   * @param {Array<{ topicTask: Object, a6Result: Object }>} taskPairs
   */
  buildHumanReviewPackage(taskPairs) {
    return this.humanGateEvaluator.buildReviewPackage(taskPairs);
  }

  /**
   * 评估人工审核包的 Gate 状态
   * @param {Object} reviewPackage
   */
  evaluateHumanGate(reviewPackage) {
    return this.humanGateEvaluator.evaluateHumanGate(reviewPackage);
  }

  /**
   * 记录单项人工审核结果
   * @param {Object} reviewPackage
   * @param {Object} params
   */
  applyHumanVerdict(reviewPackage, params) {
    return this.humanGateEvaluator.applyHumanVerdict(reviewPackage, params);
  }

  /**
   * 渲染 Markdown 报告
   * @param {Object} reviewPackage
   */
  generateHumanReviewMarkdown(reviewPackage) {
    return this.humanGateEvaluator.generateMarkdownReport(reviewPackage);
  }
}
