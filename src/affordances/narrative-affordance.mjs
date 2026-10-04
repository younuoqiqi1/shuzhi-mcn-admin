/**
 * @file narrative-affordance.mjs
 * @description POC-AGENT A3: L2 通用叙事潜能 (Generic Narrative Affordances) 数据模型与校验器。
 * 明确区分客观证据 (L1) 与叙事可能性 (L2)，具备完整的溯源 (Provenance) 与可信度机制。
 */

export const AFFORDANCE_CATEGORIES = Object.freeze([
  "dramatic_function",   // 戏剧功能：试探、对峙、顺从、转折等
  "emotional_tension",   // 情绪张力：压迫、松弛、窒息感等
  "audio_silence",       // 原声与留白：戏剧性沉默、金句原声、环境音效
  "pacing_shift",        // 节奏转折：急停、突变、拖长
]);

export class AffordanceValidationError extends Error {
  constructor(field, message) {
    super(`[AffordanceValidationError] 字段 '${field}': ${message}`);
    this.name = "AffordanceValidationError";
    this.field = field;
  }
}

/**
 * 校验 L2 Generic Narrative Affordance 实体
 * @param {Object} aff
 * @returns {boolean}
 */
export function validateNarrativeAffordance(aff) {
  if (!aff || typeof aff !== "object") {
    throw new AffordanceValidationError("root", "必须是非空对象");
  }

  const requiredFields = [
    "affordance_id",
    "evidence_id",
    "tag",
    "category",
    "narrative_function",
    "confidence",
    "provenance",
  ];
  for (const field of requiredFields) {
    if (!aff[field]) {
      throw new AffordanceValidationError(field, "必填字段缺失或为空");
    }
  }

  if (typeof aff.confidence !== "number" || aff.confidence < 0 || aff.confidence > 1.0) {
    throw new AffordanceValidationError("confidence", "置信度必须在 0.0 到 1.0 之间");
  }

  if (!AFFORDANCE_CATEGORIES.includes(aff.category)) {
    throw new AffordanceValidationError(
      "category",
      `无效的分类 '${aff.category}'，允许列表: [${AFFORDANCE_CATEGORIES.join(", ")}]`
    );
  }

  // 溯源对象校验
  const prov = aff.provenance;
  if (!prov || typeof prov !== "object") {
    throw new AffordanceValidationError("provenance", "必须包含完整的溯源 (Provenance) 对象");
  }
  if (!["manual_seed", "promoted_from_l3", "heuristics"].includes(prov.source_type)) {
    throw new AffordanceValidationError("provenance.source_type", "来源类型必须为 manual_seed, promoted_from_l3 或 heuristics");
  }
  if (typeof prov.version !== "number" || prov.version < 1) {
    throw new AffordanceValidationError("provenance.version", "版本号必须为大于等于 1 的正整数");
  }
  if (typeof prov.rationale !== "string" || !prov.rationale.trim()) {
    throw new AffordanceValidationError("provenance.rationale", "必须提供叙事潜能成立的客观依据说明 (rationale)");
  }

  // 若为 L3 晋升来源，必须具备审核与证据锚定记录
  if (prov.source_type === "promoted_from_l3") {
    if (!prov.promotion_source || typeof prov.promotion_source !== "object") {
      throw new AffordanceValidationError("provenance.promotion_source", "L3 晋升必须提供详细晋升溯源信息");
    }
    if (prov.promotion_source.approval_status !== "approved") {
      throw new AffordanceValidationError("provenance.promotion_source.approval_status", "只有已过审 (approved) 的 L3 解释方可晋升为 L2");
    }
    if (!prov.promotion_source.evidence_grounding) {
      throw new AffordanceValidationError("provenance.promotion_source.evidence_grounding", "晋升必须明确指明基于客观事实的证据锚点");
    }
  }

  return true;
}
