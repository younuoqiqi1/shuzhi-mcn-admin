/**
 * @file retrieval-service.mjs
 * @description POC-AGENT A5/A6.2: 候选镜头召回检索服务 (Candidate Retrieval Service)。
 * 协调结构化匹配、词法匹配、语义匹配、L2 Affordance 匹配与多样性重排，
 * 以细颗粒度 Retrieval Unit 为实际检索单元，为每个 MaterialRequirement 产出高质量 Top20 Candidate。
 * 
 * 严守铁律：A5 只负责找可能有用的素材，retrieval_reason 严禁写入主观观点或 A6 结论。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { StructuredMatcher } from "./matchers/structured-matcher.mjs";
import { LexicalMatcher } from "./matchers/lexical-matcher.mjs";
import { SemanticMatcher } from "./matchers/semantic-matcher.mjs";
import { AffordanceMatcher } from "./matchers/affordance-matcher.mjs";
import { DiversityFilter } from "./diversity-filter.mjs";
import { AffordanceStore } from "../affordances/affordance-store.mjs";
import { validateCandidate } from "../contracts/validators.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CandidateRetrievalService {
  /**
   * @param {Object} [options]
   * @param {Array<Object>} [options.evidenceLibrary] 预载入的 canonical Evidence / Retrieval Units 数组
   * @param {AffordanceStore} [options.affordanceStore] 预载入的 AffordanceStore
   * @param {Object} [options.weights] 混合检索权重分配
   * @param {Object} [options.semanticProvider] 可替换的语义 Provider
   */
  constructor(options = {}) {
    this.canonicalScenes = options.canonicalScenes || this._loadDefaultScenes();
    this.evidenceLibrary = options.evidenceLibrary || this._loadDefaultEvidence();
    this.affordanceStore = options.affordanceStore || this._loadDefaultAffordances();

    this.weights = {
      structured: 0.30,
      lexical: 0.30,
      semantic: 0.25,
      affordance: 0.15,
      ...options.weights,
    };

    this.structuredMatcher = new StructuredMatcher();
    this.lexicalMatcher = new LexicalMatcher();
    this.semanticMatcher = new SemanticMatcher(options.semanticProvider);
    this.affordanceMatcher = new AffordanceMatcher(this.affordanceStore);
    this.diversityFilter = new DiversityFilter(options.diversityOptions);
  }

  _loadDefaultScenes() {
    const defaultPath = path.resolve(__dirname, "../evidence/data/canonical_evidence_qianfu_ep18.json");
    if (!fs.existsSync(defaultPath)) {
      throw new Error(`未找到 canonical Evidence 数据集: ${defaultPath}`);
    }
    return JSON.parse(fs.readFileSync(defaultPath, "utf8"));
  }

  _loadDefaultEvidence() {
    // 优先读取细化生成的 Retrieval Units 检索库 (问题4: 必须以 retrieval unit 为候选单位)
    const unitsPath = path.resolve(__dirname, "../evidence/data/canonical_retrieval_units_qianfu_ep18.json");
    if (fs.existsSync(unitsPath)) {
      return JSON.parse(fs.readFileSync(unitsPath, "utf8"));
    }

    const defaultPath = path.resolve(__dirname, "../evidence/data/canonical_evidence_qianfu_ep18.json");
    if (!fs.existsSync(defaultPath)) {
      throw new Error(`未找到 canonical Evidence 数据集: ${defaultPath}`);
    }
    const raw = JSON.parse(fs.readFileSync(defaultPath, "utf8"));
    const flattenedUnits = [];
    for (const item of raw) {
      if (Array.isArray(item.retrieval_units) && item.retrieval_units.length > 0) {
        flattenedUnits.push(...item.retrieval_units);
      } else {
        flattenedUnits.push(item);
      }
    }
    return flattenedUnits.length > 0 ? flattenedUnits : raw;
  }

  _loadDefaultAffordances() {
    const store = new AffordanceStore();
    const seedPath = path.resolve(__dirname, "./data/seed_l2_affordances.json");
    if (fs.existsSync(seedPath)) {
      const seeds = JSON.parse(fs.readFileSync(seedPath, "utf8"));
      store.registerBatch(seeds);
    }
    return store;
  }

  /**
   * 构建客观合规的召回理由 (检索理由只能解释为什么值得进入候选池，绝对不能写博主最终观点)
   * @private
   */
  _buildRetrievalReason(evidence, structDetails, lexDetails, semDetails, affDetails) {
    const reasons = [];

    // 角色命中理由
    if (structDetails.matched_characters && structDetails.matched_characters.length > 0) {
      reasons.push(`画面中客观出现目标人物[${structDetails.matched_characters.join("与")}]`);
    }

    // 场景空间环境
    if (structDetails.env_matched && evidence.scene_env) {
      reasons.push(`处于[${evidence.scene_env}]物理空间`);
    }

    // 对白与动作关键词命中
    if (lexDetails.dialogue_hits > 0 && evidence.dialogue) {
      reasons.push("台词直接命中关键剧情词项");
    } else if (lexDetails.action_hits > 0) {
      reasons.push("画面物理动作符合诉求动作特征");
    }

    // L2 戏剧潜能命中
    if (affDetails.matched_tags && affDetails.matched_tags.length > 0) {
      reasons.push(`具备[${affDetails.matched_tags.join(", ")}]通用戏剧潜能`);
    }

    if (reasons.length === 0) {
      return "该镜头符合基础时态上下文与镜头特征，作为候选素材备选。";
    }

    return `${reasons.join("，")}，具备较高的相关性。`;
  }

  /**
   * 为单个 MaterialRequirement 检索并召回候选镜头 (默认 Top20)
   * @param {Object} requirement MaterialRequirement 实体
   * @param {Object} [context] { topic, viewpoint, beat }
   * @param {Object} [options] { topK: 20 }
   * @returns {Array<Object>} 经过严格 Candidate Schema 校验的候选镜头数组
   */
  retrieveForRequirement(requirement, context = {}, options = {}) {
    const topK = options.topK || 20;

    // 遍历所有客观 Retrieval Units，计算多路混合得分
    const scoredList = this.evidenceLibrary.map((ev) => {
      // 1. 结构化匹配
      const structRes = this.structuredMatcher.match(requirement, ev);
      // 2. 词法匹配
      const lexRes = this.lexicalMatcher.match(requirement, ev);
      // 3. 语义匹配
      const semRes = this.semanticMatcher.match({ ...context, requirement }, ev);
      // 4. L2 潜能匹配
      const affRes = this.affordanceMatcher.match(requirement, ev);

      // 加权总分
      const rawScore = Number((
        structRes.score * this.weights.structured +
        lexRes.score * this.weights.lexical +
        semRes.score * this.weights.semantic +
        affRes.score * this.weights.affordance
      ).toFixed(3));

      return {
        evidence: ev,
        raw_score: rawScore,
        structRes,
        lexRes,
        semRes,
        affRes,
      };
    });

    // 多样性过滤与质量重排
    this.diversityFilter.topK = topK;
    const ranked = this.diversityFilter.filterAndRank(scoredList);

    // 格式化为标准 Candidate 对象
    const candidates = ranked.map((item, index) => {
      const ev = item.evidence;
      const beatId = requirement.beat_id || (context.beat ? context.beat.beat_id : "beat_unknown");
      const unitId = ev.unit_id || ev.scene_id;
      const parentSceneId = ev.parent_scene_id || ev.scene_id;
      const candId = `cand_${requirement.requirement_id || "req"}_${unitId}_${index + 1}`;

      const retrievalReason = this._buildRetrievalReason(
        ev,
        item.structRes.details,
        item.lexRes.details,
        item.semRes.details,
        item.affRes.details
      );

      const candidateObj = {
        candidate_id: candId,
        beat_id: beatId,
        media_id: ev.media_id || "qianfu_ep18_720p_25fps",
        evidence_id: ev.evidence_id || `${ev.media_id || "qianfu_ep18_720p_25fps"}:${parentSceneId}:${unitId}`,
        scene_id: parentSceneId,
        parent_scene_id: parentSceneId,
        retrieval_unit_id: unitId,
        timecode: {
          in: ev.timecode.in,
          out: ev.timecode.out,
          duration_sec: ev.timecode.duration_sec,
        },
        dialogue: ev.dialogue || "",
        characters: ev.characters || [],
        physical_actions: ev.physical_actions || [],
        scene_env: ev.scene_env || "",
        evidence_l1: {
          characters: ev.characters || [],
          actions: ev.physical_actions || [],
          dialogue: ev.dialogue || "",
          scene_env: ev.scene_env || "",
          camera: ev.camera || {},
        },
        affordance_l2: {
          tags: item.affRes.details.matched_tags || [],
        },
        relevant_affordances: item.affRes.details.relevant_affordances || [],
        provenance: ev.provenance || {},
        evidence_confidence: ev.provenance?.confidence || ev.confidence || 0.9,
        total_score: item.current_score !== undefined ? item.current_score : item.adjusted_score,
        total_retrieval_score: item.current_score !== undefined ? item.current_score : item.adjusted_score,
        score_breakdown: {
          structured_score: item.structRes.score,
          lexical_score: item.lexRes.score,
          semantic_score: item.semRes.score,
          affordance_score: item.affRes.score,
          quality_penalty: item.quality_penalty,
        },
        matched_requirements: [requirement.requirement_id],
        retrieval_reason: retrievalReason,
      };

      // 严格通过 Candidate 契约校验
      validateCandidate(candidateObj);
      return Object.freeze(candidateObj);
    });

    return candidates;
  }

  /**
   * 为整个运营选题生产任务执行端到端检索召回
   * @param {Object} topicTask 包含 topic, viewpoint, story_beats, material_requirements
   * @param {Object} [options]
   * @returns {{ task_id: string, requirements_candidates: Object }}
   */
  retrieveForTopicTask(topicTask, options = {}) {
    const { topic, viewpoint, story_beats, material_requirements } = topicTask;
    if (!Array.isArray(material_requirements) || material_requirements.length === 0) {
      throw new Error("topicTask 必须包含非空的 material_requirements 数组");
    }

    const beatsMap = new Map();
    if (Array.isArray(story_beats)) {
      story_beats.forEach((b) => beatsMap.set(b.beat_id, b));
    }

    const results = {};
    for (const req of material_requirements) {
      const beat = beatsMap.get(req.beat_id) || null;
      const candidates = this.retrieveForRequirement(req, { topic, viewpoint, beat }, options);
      results[req.requirement_id] = candidates;
    }

    return {
      topic_id: topic ? (topic.topic_id || topic.id) : "topic_unknown",
      total_requirements: material_requirements.length,
      requirements_candidates: results,
      timestamp: new Date().toISOString(),
    };
  }
}
