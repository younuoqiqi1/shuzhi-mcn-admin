/**
 * @file affordance-matcher.mjs
 * @description POC-AGENT A5: L2 通用叙事潜能匹配器。
 * 检查当前物理 Evidence 挂载的通用戏剧功能（如 suspicion_testing, power_dynamic 等）与诉求 target_affordances 的重合度。
 */

export class AffordanceMatcher {
  /**
   * @param {Object} affordanceStore AffordanceStore 实例
   */
  constructor(affordanceStore) {
    this.store = affordanceStore;
  }

  /**
   * 计算 L2 Affordance 匹配度
   * @param {Object} requirement MaterialRequirement 诉求
   * @param {Object} evidence ObjectiveEvidence 物理证据
   * @returns {{ score: number, details: Object }}
   */
  match(requirement, evidence) {
    const targetAffordances = Array.isArray(requirement.target_affordances)
      ? requirement.target_affordances
      : [];

    // 获取该证据在 L2 中注册的所有叙事潜能
    const registeredAffordances = this.store ? (this.store.listByEvidence(evidence.evidence_id) || []) : [];

    if (targetAffordances.length === 0) {
      // 诉求未明确指定 target_affordances 时，若镜头有丰富的通用叙事潜能，给予中等基线分数
      return {
        score: registeredAffordances.length > 0 ? 0.6 : 0.4,
        details: {
          matched_tags: [],
          registered_count: registeredAffordances.length,
          relevant_affordances: registeredAffordances,
        },
      };
    }

    const matchedAffordances = [];
    const matchedTags = new Set();
    let totalScore = 0;

    for (const aff of registeredAffordances) {
      // 模糊匹配 tag（例如 suspicion_testing 匹配 testing 或 suspicion）
      for (const target of targetAffordances) {
        if (
          aff.tag === target ||
          aff.tag.includes(target) ||
          target.includes(aff.tag)
        ) {
          matchedTags.add(aff.tag);
          matchedAffordances.push(aff);
          totalScore += aff.confidence || 0.85;
        }
      }
    }

    // 命中比例
    const coverageRatio = targetAffordances.length > 0
      ? matchedTags.size / targetAffordances.length
      : 0;

    // 综合打分：命中率 * 平均置信度
    const avgConfidence = matchedAffordances.length > 0
      ? totalScore / matchedAffordances.length
      : 0;

    const finalScore = Math.min(1.0, Number((coverageRatio * 0.7 + avgConfidence * 0.3).toFixed(3)));

    return {
      score: finalScore,
      details: {
        matched_tags: Array.from(matchedTags),
        registered_count: registeredAffordances.length,
        matched_count: matchedAffordances.length,
        relevant_affordances: matchedAffordances,
      },
    };
  }
}
