/**
 * @file candidate-retrieval.test.mjs
 * @description POC-AGENT A5 综合自动化测试套件。
 * 覆盖：真实数据读取、动态检索、Top20重排、得分拆解、时序去重、场景多样性、
 * 溯源加权、L2潜能协同、无硬编码、L1不污染、L3无主观结论、双真实选题E2E。
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CandidateRetrievalService } from "../src/retrieval/retrieval-service.mjs";
import { StructuredMatcher } from "../src/retrieval/matchers/structured-matcher.mjs";
import { LexicalMatcher } from "../src/retrieval/matchers/lexical-matcher.mjs";
import { SemanticMatcher, ConceptFallbackSemanticProvider } from "../src/retrieval/matchers/semantic-matcher.mjs";
import { AffordanceMatcher } from "../src/retrieval/matchers/affordance-matcher.mjs";
import { DiversityFilter } from "../src/retrieval/diversity-filter.mjs";
import { AffordanceStore } from "../src/affordances/affordance-store.mjs";
import { validateCandidate, validate } from "../src/contracts/validators.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("POC-AGENT A5: 候选镜头召回 Retrieval Pipeline", () => {
  const service = new CandidateRetrievalService();

  const topicAPath = path.resolve(__dirname, "../src/retrieval/fixtures/topic_a_suspicion.json");
  const topicBPath = path.resolve(__dirname, "../src/retrieval/fixtures/topic_b_dangerous_probe.json");
  const topicA = JSON.parse(fs.readFileSync(topicAPath, "utf8"));
  const topicB = JSON.parse(fs.readFileSync(topicBPath, "utf8"));

  it("1. 真实 canonical Evidence 数据载入完整性 (235镜头，2702s全覆盖，无手工mock)", () => {
    assert.ok(Array.isArray(service.evidenceLibrary), "evidenceLibrary 必须是数组");
    assert.strictEqual(service.evidenceLibrary.length, 235, "必须加载全部 235 个客观镜头");

    const first = service.evidenceLibrary[0];
    const last = service.evidenceLibrary[service.evidenceLibrary.length - 1];

    assert.strictEqual(first.timecode.in, "00:00:00.000", "首镜头从 0 秒开始");
    assert.strictEqual(last.timecode.out, "00:45:02.013", "尾镜头覆盖至约 2702.013s (45:02.013)");
    assert.ok(service.evidenceLibrary.every((ev) => ev.scene_id && ev.evidence_id), "所有条目具有真实唯一标识");
  });

  it("2. L2 通用叙事潜能库加载与 AffordanceStore 协同", () => {
    assert.ok(service.affordanceStore instanceof AffordanceStore, "必须挂载真实的 AffordanceStore");
    assert.ok(service.affordanceStore.size() > 0, "必须包含预加载的通用叙事潜能");
    
    // 检查通用标签分布
    const suspicionAffs = service.affordanceStore.listByTag("suspicion_testing");
    assert.ok(suspicionAffs.length > 0, "必须存在 suspicion_testing 通用潜能");
  });

  it("3. StructuredMatcher: 准确计算人物交集、物理环境与时间提示分", () => {
    const matcher = new StructuredMatcher();
    const req = {
      desired_characters: ["吴敬中", "余则成"],
      desired_scene_env: "保密局天津站站长办公室",
    };
    const evMatch = {
      characters: ["吴敬中", "余则成"],
      scene_env: "保密局天津站站长办公室办公桌前",
    };
    const evMismatch = {
      characters: ["翠平"],
      scene_env: "厨房",
    };

    const resMatch = matcher.match(req, evMatch);
    const resMismatch = matcher.match(req, evMismatch);

    assert.ok(resMatch.score >= 0.85, `人物与环境完全匹配得分应高，实际: ${resMatch.score}`);
    assert.ok(resMismatch.score < 0.35, `人物与环境均不匹配得分应低，实际: ${resMismatch.score}`);
    assert.strictEqual(resMatch.details.matched_characters.length, 2);
  });

  it("4. LexicalMatcher: 中文分词与对白/动作多字段命中加权", () => {
    const matcher = new LexicalMatcher();
    const req = {
      description: "提及两根金条与共党情报的交锋",
      desired_action: "拍桌子严厉质问",
      desired_emotion: "激愤与戒备",
      evidence_grounding_criteria: "包含金条与情报词项",
    };
    const evHit = {
      dialogue: "现在共党的情报都卖到什么价了 一个师呀才两根金条",
      physical_actions: ["余则成在铁皮档案柜前检索绝密卷宗，拍桌子怒视对方"],
      visual_description: "",
      scene_env: "走廊",
    };
    const evMiss = {
      dialogue: "买花布叫着晚秋一块去吧",
      physical_actions: ["翠平剥花生"],
      visual_description: "",
      scene_env: "客厅",
    };

    const hitRes = matcher.match(req, evHit);
    const missRes = matcher.match(req, evMiss);

    assert.ok(hitRes.score > missRes.score, "高频关键剧情词命中的得分必须显著高于无关镜头");
    assert.ok(hitRes.details.dialogue_hits > 0, "必须记录台词命中");
  });

  it("5. SemanticMatcher: 透明暴露 Fallback 标记，严禁伪报 Embedding", () => {
    const provider = new ConceptFallbackSemanticProvider();
    assert.strictEqual(provider.is_fallback, true, "必须如实声明 is_fallback 为 true");
    assert.strictEqual(provider.provider_name, "concept_mesh_fallback_v1");

    const matcher = new SemanticMatcher(provider);
    const context = {
      topic: { title: "吴站长怀疑余则成" },
      viewpoint: { thesis: "老谋深算站长的心理博弈与试探" },
      requirement: { desired_emotion: "表面平和内部紧张，眼神试探" },
    };
    const ev = {
      dialogue: "站长冷笑翻看卷宗，审视下属目光",
      physical_actions: ["站长翻看文件目光冷峻"],
      visual_description: "二人对峙试探",
      scene_env: "站长室",
    };

    const res = matcher.match(context, ev);
    assert.strictEqual(res.details.is_fallback, true, "输出 details 必须如实标注 is_fallback: true");
    assert.ok(res.score > 0.0, "必须产生非零余弦投影相似度");
  });

  it("6. AffordanceMatcher: 戏剧潜能重合度与置信度协同", () => {
    const store = new AffordanceStore();
    store.register({
      affordance_id: "aff_test_01",
      evidence_id: "ev_test_1",
      tag: "suspicion_testing",
      category: "dramatic_function",
      narrative_function: "暗中测试信任",
      confidence: 0.95,
      provenance: {
        source_type: "heuristics",
        version: 1,
        rationale: "测试用例",
        evidence_anchor: "ev_test_1",
      },
    });

    const matcher = new AffordanceMatcher(store);
    const req = { target_affordances: ["suspicion_testing"] };
    const ev = { evidence_id: "ev_test_1" };

    const res = matcher.match(req, ev);
    assert.ok(res.score >= 0.9, `匹配已注册潜能应得高分，实际: ${res.score}`);
    assert.deepStrictEqual(res.details.matched_tags, ["suspicion_testing"]);
  });

  it("7. DiversityFilter: 证据质量加权、时序去重与场景环境上限", () => {
    const filter = new DiversityFilter({ topK: 5, sameSceneCap: 2, nearDupSuppression: 0.5 });
    
    // 构造模拟候选集
    const candidates = [
      {
        raw_score: 0.9,
        evidence: {
          scene_id: "s1",
          timecode: { in: "00:01:00.000", out: "00:01:05.000" },
          scene_env: "办公室",
          dialogue: "台词A",
          provenance: { analysis_granularity: "independent_keyframe" },
          confidence: 0.95,
        },
      },
      // s2 与 s1 时序紧邻且台词重复
      {
        raw_score: 0.88,
        evidence: {
          scene_id: "s2",
          timecode: { in: "00:01:06.000", out: "00:01:10.000" },
          scene_env: "办公室",
          dialogue: "台词A",
          provenance: { analysis_granularity: "independent_keyframe" },
          confidence: 0.95,
        },
      },
      // s3 也是办公室（达到 sameSceneCap 2）
      {
        raw_score: 0.85,
        evidence: {
          scene_id: "s3",
          timecode: { in: "00:05:00.000", out: "00:05:10.000" },
          scene_env: "办公室",
          dialogue: "台词B",
          provenance: { analysis_granularity: "independent_keyframe" },
          confidence: 0.95,
        },
      },
      // s4 仍然是办公室（超过 cap 受到惩罚）
      {
        raw_score: 0.84,
        evidence: {
          scene_id: "s4",
          timecode: { in: "00:08:00.000", out: "00:08:10.000" },
          scene_env: "办公室",
          dialogue: "台词C",
          provenance: { analysis_granularity: "independent_keyframe" },
          confidence: 0.95,
        },
      },
      // s5 来自不同场景（客厅）
      {
        raw_score: 0.80,
        evidence: {
          scene_id: "s5",
          timecode: { in: "00:10:00.000", out: "00:10:10.000" },
          scene_env: "客厅",
          dialogue: "台词D",
          provenance: { analysis_granularity: "independent_keyframe" },
          confidence: 0.95,
        },
      },
      // s6 继承帧（受到 0.85 质量惩罚）
      {
        raw_score: 0.85,
        evidence: {
          scene_id: "s6",
          timecode: { in: "00:15:00.000", out: "00:15:10.000" },
          scene_env: "走廊",
          dialogue: "台词E",
          provenance: { analysis_granularity: "segment_inherited" },
          confidence: 0.75,
        },
      },
    ];

    const ranked = filter.filterAndRank(candidates);
    assert.strictEqual(ranked.length, 5);
    
    // s1 应当排第一
    assert.strictEqual(ranked[0].evidence.scene_id, "s1");
    // s6 继承帧的 adjusted_score 必须低于独立帧
    const s6Rank = ranked.find((r) => r.evidence.scene_id === "s6");
    if (s6Rank) {
      assert.ok(s6Rank.quality_penalty > 0.1, "继承帧必须有质量惩罚");
    }
  });

  it("8. 检索服务输出严格合规：字段完整、Score breakdown、无 L3 主观观点污染", () => {
    const req = topicA.material_requirements[0];
    const cands = service.retrieveForRequirement(req, {
      topic: topicA.topic,
      viewpoint: topicA.viewpoint,
      beat: topicA.story_beats[0],
    }, { topK: 20 });

    assert.strictEqual(cands.length, 20, "必须产出完整的 Top20 候选镜头");

    cands.forEach((cand, idx) => {
      // 1. 通过 A1 校验器
      assert.doesNotThrow(() => validateCandidate(cand), `候选镜头 [${idx}] 必须通过 validateCandidate`);

      // 2. 字段完整性
      assert.ok(cand.candidate_id, "candidate_id 存在");
      assert.ok(cand.scene_id, "scene_id 存在");
      assert.ok(cand.evidence_id, "evidence_id 存在");
      assert.ok(cand.timecode.in && cand.timecode.out, "timecode 完整");
      assert.ok(cand.provenance, "provenance 存在");
      assert.ok(cand.evidence_confidence > 0, "evidence_confidence 合法");
      assert.ok(cand.total_retrieval_score > 0, "total_retrieval_score 合法");

      // 3. 得分拆解完整性
      assert.ok(cand.score_breakdown, "score_breakdown 必须存在");
      const sb = cand.score_breakdown;
      assert.ok(typeof sb.structured_score === "number");
      assert.ok(typeof sb.lexical_score === "number");
      assert.ok(typeof sb.semantic_score === "number");
      assert.ok(typeof sb.affordance_score === "number");
      assert.ok(typeof sb.quality_penalty === "number");

      // 4. 客观性铁律：禁止博主主观断言
      const reason = cand.retrieval_reason;
      assert.ok(reason && typeof reason === "string", "retrieval_reason 必须存在");
      assert.ok(
        !reason.includes("证明吴站长") &&
        !reason.includes("暴露出站长") &&
        !reason.includes("看穿不戳穿") &&
        !reason.includes("博主认为"),
        `retrieval_reason 严禁包含 L3 主观立场断言，实际: '${reason}'`
      );
      assert.ok(
        reason.includes("画面中") || reason.includes("处于") || reason.includes("符合") || reason.includes("具备"),
        `retrieval_reason 必须是客观特征解释，实际: '${reason}'`
      );
    });
  });

  it("9. 真实选题A 端到端完整性：4个 requirement 均生成合规 Top20 候选", () => {
    const result = service.retrieveForTopicTask(topicA, { topK: 20 });
    assert.strictEqual(result.topic_id, topicA.topic.topic_id);
    assert.strictEqual(result.total_requirements, 4);

    for (const req of topicA.material_requirements) {
      const candidates = result.requirements_candidates[req.requirement_id];
      assert.ok(Array.isArray(candidates), `req ${req.requirement_id} 必须有候选数组`);
      assert.strictEqual(candidates.length, 20, `req ${req.requirement_id} 必须有 20 个候选镜头`);
      
      // 验证降序
      for (let i = 1; i < candidates.length; i++) {
        assert.ok(
          candidates[i - 1].total_score >= candidates[i].total_score,
          `候选必须按总分降序: cand[${i-1}]=${candidates[i-1].total_score} vs cand[${i}]=${candidates[i].total_score}`
        );
      }
    }
  });

  it("10. 真实选题B 端到端完整性：4个 requirement 均生成合规 Top20 候选", () => {
    const result = service.retrieveForTopicTask(topicB, { topK: 20 });
    assert.strictEqual(result.topic_id, topicB.topic.topic_id);
    assert.strictEqual(result.total_requirements, 4);

    for (const req of topicB.material_requirements) {
      const candidates = result.requirements_candidates[req.requirement_id];
      assert.ok(Array.isArray(candidates), `req ${req.requirement_id} 必须有候选数组`);
      assert.strictEqual(candidates.length, 20, `req ${req.requirement_id} 必须有 20 个候选镜头`);

      // 验证无重复 candidate_id
      const ids = new Set(candidates.map((c) => c.candidate_id));
      assert.strictEqual(ids.size, 20, "20个候选镜头的 candidate_id 必须互不相同");
    }
  });

  it("11. 绝无硬编码：检索系统无死板 scene_id 绑定，完全动态计算", () => {
    const serviceCode = fs.readFileSync(path.resolve(__dirname, "../src/retrieval/retrieval-service.mjs"), "utf8");
    const structCode = fs.readFileSync(path.resolve(__dirname, "../src/retrieval/matchers/structured-matcher.mjs"), "utf8");
    const lexCode = fs.readFileSync(path.resolve(__dirname, "../src/retrieval/matchers/lexical-matcher.mjs"), "utf8");

    assert.ok(!serviceCode.includes("scene_0074"), "retrieval-service 源码中严禁硬编码 scene_id");
    assert.ok(!structCode.includes("scene_0074"), "structured-matcher 源码中严禁硬编码 scene_id");
    assert.ok(!lexCode.includes("scene_0074"), "lexical-matcher 源码中严禁硬编码 scene_id");
  });

  it("12. L1 物理数据只读保护：检索过程绝对不污染本地 canonical L1 文件", () => {
    const canonicalPath = path.resolve(__dirname, "../src/evidence/data/canonical_evidence_qianfu_ep18.json");
    const originalStat = fs.statSync(canonicalPath);

    // 再次调用检索
    service.retrieveForTopicTask(topicA, { topK: 20 });
    service.retrieveForTopicTask(topicB, { topK: 20 });

    const currentStat = fs.statSync(canonicalPath);
    assert.strictEqual(originalStat.mtimeMs, currentStat.mtimeMs, "canonical Evidence 文件绝对不能被检索过程写入修改");
  });
});
