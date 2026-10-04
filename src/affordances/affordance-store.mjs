/**
 * @file affordance-store.mjs
 * @description POC-AGENT A3: L2 通用叙事潜能存储与增量索引服务。
 * 支持一个 Evidence 对应多个可持续增量 Affordance，与 L1 物理隔离。
 */

import { validateNarrativeAffordance } from "./narrative-affordance.mjs";

export class AffordanceStore {
  constructor() {
    this._affordances = new Map(); // affordance_id -> NarrativeAffordance
    this._evidenceIndex = new Map(); // evidence_id -> Set<affordance_id>
    this._tagIndex = new Map(); // tag -> Set<affordance_id>
    this._categoryIndex = new Map(); // category -> Set<affordance_id>
  }

  /**
   * 注册单个通用叙事潜能（支持一个 Evidence 多次增量追加）
   * @param {Object} affordance
   * @returns {Object} 注册后的不可变对象
   */
  register(affordance) {
    validateNarrativeAffordance(affordance);

    const frozen = Object.freeze({
      ...affordance,
      provenance: Object.freeze({ ...affordance.provenance }),
    });

    this._affordances.set(frozen.affordance_id, frozen);

    // 维护 evidence 索引（一个 evidence 对应多个 affordance）
    if (!this._evidenceIndex.has(frozen.evidence_id)) {
      this._evidenceIndex.set(frozen.evidence_id, new Set());
    }
    this._evidenceIndex.get(frozen.evidence_id).add(frozen.affordance_id);

    // 维护 tag 索引
    if (!this._tagIndex.has(frozen.tag)) {
      this._tagIndex.set(frozen.tag, new Set());
    }
    this._tagIndex.get(frozen.tag).add(frozen.affordance_id);

    // 维护 category 索引
    if (!this._categoryIndex.has(frozen.category)) {
      this._categoryIndex.set(frozen.category, new Set());
    }
    this._categoryIndex.get(frozen.category).add(frozen.affordance_id);

    return frozen;
  }

  /**
   * 批量注册
   * @param {Array<Object>} list
   */
  registerBatch(list) {
    if (!Array.isArray(list)) {
      throw new Error("registerBatch 必须传入数组");
    }
    return list.map((item) => this.register(item));
  }

  /**
   * 获取某个 Evidence 关联的所有叙事潜能
   * @param {string} evidenceId
   * @returns {Array<Object>}
   */
  listByEvidence(evidenceId) {
    const ids = this._evidenceIndex.get(evidenceId);
    if (!ids) return [];
    return Array.from(ids).map((id) => this._affordances.get(id));
  }

  /**
   * 根据戏剧标签获取所有潜能
   * @param {string} tag
   * @returns {Array<Object>}
   */
  listByTag(tag) {
    const ids = this._tagIndex.get(tag);
    if (!ids) return [];
    return Array.from(ids).map((id) => this._affordances.get(id));
  }

  /**
   * 根据分类获取
   * @param {string} category
   * @returns {Array<Object>}
   */
  listByCategory(category) {
    const ids = this._categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids).map((id) => this._affordances.get(id));
  }

  /**
   * 按标签集合与最小置信度过滤
   * @param {Array<string>} tags
   * @param {number} [minConfidence=0.0]
   * @returns {Array<Object>}
   */
  searchByTags(tags, minConfidence = 0.0) {
    if (!Array.isArray(tags) || tags.length === 0) return [];
    const matchedIds = new Set();

    for (const tag of tags) {
      const ids = this._tagIndex.get(tag);
      if (ids) {
        for (const id of ids) {
          matchedIds.add(id);
        }
      }
    }

    return Array.from(matchedIds)
      .map((id) => this._affordances.get(id))
      .filter((aff) => aff.confidence >= minConfidence);
  }

  /**
   * 当前总条目数
   * @returns {number}
   */
  size() {
    return this._affordances.size;
  }
}
