/**
 * @file promotion-service.mjs
 * @description POC-AGENT A3: L3 动态解释向 L2 通用叙事潜能受控晋升 (Selective Promotion) 接口骨架。
 * 确保只有经过审核、具有 Evidence 支撑且去个性化的解释可晋升入 L2，绝不写入 L1。
 */

import { validateNarrativeAffordance } from "./narrative-affordance.mjs";
import { validateObjectiveEvidence } from "../evidence/objective-evidence.mjs";

export class PromotionGateError extends Error {
  constructor(reason, details = {}) {
    super(`[PromotionGateError] 晋升门禁拦截: ${reason}`);
    this.name = "PromotionGateError";
    this.reason = reason;
    this.details = details;
  }
}

/**
 * 将经过验证与审核的 L3 动态解读晋升为 L2 共享叙事潜能
 * @param {Object} params
 * @param {Object} params.perspectiveReading L3 动态解读对象
 * @param {Object} params.evidence 必须对应受支持的 L1 客观证据对象
 * @param {string} params.tag 通用戏剧标签 (如 'probing', 'power_dominance')
 * @param {string} params.category 分类 ('dramatic_function', 'emotional_tension' 等)
 * @param {string} params.narrativeFunction 抽象提纯后的通用叙事功能说明 (去博主个性化)
 * @param {number} [params.confidence=0.85] 置信度
 * @param {Object} params.approval 审核凭据 { status: 'approved', approved_by: string, approval_time: string }
 * @param {Object} params.affordanceStore L2 目标存储实例
 * @param {Object} [params.evidenceStore] 可选用于核对 L1 存在的证据存储
 * @returns {Object} 晋升成功的 L2 NarrativeAffordance
 */
export function promotePerspectiveReadingToAffordance({
  perspectiveReading,
  evidence,
  tag,
  category,
  narrativeFunction,
  confidence = 0.85,
  approval,
  affordanceStore,
  evidenceStore,
}) {
  if (!perspectiveReading || !evidence || !affordanceStore) {
    throw new PromotionGateError("缺少必要的输入参数 (reading, evidence 或 affordanceStore)");
  }

  // 1. 验证 L1 客观证据有效性
  validateObjectiveEvidence(evidence);
  if (evidenceStore && !evidenceStore.get(evidence.evidence_id)) {
    throw new PromotionGateError(`客观证据库中不存在 evidence_id '${evidence.evidence_id}'，禁止悬空晋升`);
  }

  // 2. 检查审核状态 (未过审绝不允许晋升)
  if (!approval || approval.status !== "approved") {
    throw new PromotionGateError(
      `L3 解释尚未过审 (当前状态: ${approval?.status || "none"})，只有 'approved' 状态可晋升入 L2`
    );
  }
  if (!approval.approved_by) {
    throw new PromotionGateError("缺少审核人 (approved_by) 签名");
  }

  // 3. 构建去个性化的 L2 叙事潜能
  const now = new Date().toISOString();
  const affordanceId = `aff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const affordance = {
    affordance_id: affordanceId,
    evidence_id: evidence.evidence_id,
    tag: tag.trim().toLowerCase(),
    category,
    narrative_function: narrativeFunction,
    confidence: Math.min(1.0, Math.max(0.0, confidence)),
    provenance: {
      source_type: "promoted_from_l3",
      version: 1,
      created_at: now,
      created_by: "selective_promotion_service",
      rationale: `基于客观动作/台词提纯: ${evidence.dialogue !== "unavailable" ? evidence.dialogue : evidence.timecode.in}`,
      promotion_source: {
        source_topic_id: perspectiveReading.topic_id || "unknown",
        source_blogger_id: perspectiveReading.blogger_id || "unknown",
        approval_status: "approved",
        approved_by: approval.approved_by,
        evidence_grounding: `timecode: [${evidence.timecode.in} -> ${evidence.timecode.out}], media: ${evidence.media_id}`,
      },
    },
    is_active: true,
  };

  validateNarrativeAffordance(affordance);

  // 4. 关键隔离铁律：只写入 affordanceStore，绝对不修改或写入 evidenceStore！
  return affordanceStore.register(affordance);
}
