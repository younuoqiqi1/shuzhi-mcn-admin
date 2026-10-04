/**
 * @file affordance-store.test.mjs
 * @description POC-AGENT A3: L2 通用叙事潜能与受控晋升 (Selective Promotion) 自动化测试
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  validateNarrativeAffordance,
  AffordanceValidationError,
  AFFORDANCE_CATEGORIES,
} from "../src/affordances/narrative-affordance.mjs";
import { AffordanceStore } from "../src/affordances/affordance-store.mjs";
import {
  promotePerspectiveReadingToAffordance,
  PromotionGateError,
} from "../src/affordances/promotion-service.mjs";
import { EvidenceStore } from "../src/evidence/evidence-store.mjs";
import { qianfuPerspectiveReadingsFixture } from "../src/fixtures/laozhou-qianfu-fixture.mjs";

const mockEvidence = Object.freeze({
  evidence_id: "qianfu_ep18_720p_25fps:scene_0042",
  media_id: "qianfu_ep18_720p_25fps",
  scene_id: "scene_0042",
  timecode: Object.freeze({
    in: "00:08:14.200",
    out: "00:08:18.700",
    duration_sec: 4.5,
    start_frame: 100,
    end_frame: 212,
    fps: 25.0,
  }),
  source: Object.freeze({
    type: "vmv_stage1_manifest",
    filename: "qianfu_ep18.mp4",
    relative_path: "data/input/qianfu_ep18.mp4",
    resolution: "1280x720",
    video_codec: "h264",
    audio_codec: "aac",
    fps: 25.0,
    total_media_duration_sec: 2702.0,
  }),
  dialogue: "unavailable",
  characters: "unavailable",
  physical_actions: "unavailable",
  camera: "unavailable",
  audio: Object.freeze({
    codec: "aac",
    channels: 2,
    sample_rate: 44100,
    audio_features: "unavailable",
  }),
});

test("NarrativeAffordance validator: accepts valid affordance and catches schema errors", () => {
  const validAff = {
    affordance_id: "aff-001",
    evidence_id: mockEvidence.evidence_id,
    tag: "probing",
    category: "dramatic_function",
    narrative_function: "汇报试探",
    confidence: 0.9,
    provenance: {
      source_type: "manual_seed",
      version: 1,
      created_at: new Date().toISOString(),
      created_by: "human_expert",
      rationale: "端茶手势克制，对方不抬头",
    },
  };
  assert.ok(validateNarrativeAffordance(validAff));

  // 置信度超出范围
  assert.throws(
    () => validateNarrativeAffordance({ ...validAff, confidence: 1.5 }),
    AffordanceValidationError
  );

  // 非法分类
  assert.throws(
    () => validateNarrativeAffordance({ ...validAff, category: "invalid_category" }),
    AffordanceValidationError
  );
});

test("AffordanceStore: supports one Evidence mapped to multiple incremental Affordances", () => {
  const store = new AffordanceStore();

  const aff1 = {
    affordance_id: "aff-001",
    evidence_id: mockEvidence.evidence_id,
    tag: "probing",
    category: "dramatic_function",
    narrative_function: "汇报试探",
    confidence: 0.9,
    provenance: {
      source_type: "manual_seed",
      version: 1,
      created_at: new Date().toISOString(),
      created_by: "expert",
      rationale: "动作留白",
    },
  };

  const aff2 = {
    affordance_id: "aff-002",
    evidence_id: mockEvidence.evidence_id,
    tag: "dramatic_silence",
    category: "audio_silence",
    narrative_function: "压迫性沉默",
    confidence: 0.85,
    provenance: {
      source_type: "manual_seed",
      version: 1,
      created_at: new Date().toISOString(),
      created_by: "expert",
      rationale: "对话间歇环境音",
    },
  };

  store.register(aff1);
  store.register(aff2);

  assert.equal(store.size(), 2);

  // 一个 Evidence 成功关联 2 个通用潜能
  const forEvidence = store.listByEvidence(mockEvidence.evidence_id);
  assert.equal(forEvidence.length, 2);
  assert.deepEqual(
    forEvidence.map((a) => a.tag),
    ["probing", "dramatic_silence"]
  );

  // 索引查询
  assert.equal(store.listByTag("probing").length, 1);
  assert.equal(store.listByCategory("audio_silence").length, 1);

  // 标签搜索
  const searchResults = store.searchByTags(["probing", "unknown"], 0.8);
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].affordance_id, "aff-001");
});

test("SelectivePromotionService: promotes reviewed L3 reading into L2 safely without touching L1", () => {
  const affordanceStore = new AffordanceStore();
  const evidenceStore = new EvidenceStore();
  evidenceStore.registerBatch([mockEvidence]);

  const reading = qianfuPerspectiveReadingsFixture[0];

  // 1. 正常过审晋升
  const promoted = promotePerspectiveReadingToAffordance({
    perspectiveReading: reading,
    evidence: mockEvidence,
    tag: "power_subservience",
    category: "dramatic_function",
    narrativeFunction: "服从性动作试探",
    confidence: 0.88,
    approval: {
      status: "approved",
      approved_by: "chief_director_01",
      approval_time: new Date().toISOString(),
    },
    affordanceStore,
    evidenceStore,
  });

  assert.ok(promoted.affordance_id);
  assert.equal(promoted.evidence_id, mockEvidence.evidence_id);
  assert.equal(promoted.provenance.source_type, "promoted_from_l3");
  assert.equal(promoted.provenance.promotion_source.approval_status, "approved");
  assert.equal(affordanceStore.size(), 1);

  // 验证 L1 绝对只读且未被污染
  assert.equal(evidenceStore.size(), 1);
  const storedL1 = evidenceStore.get(mockEvidence.evidence_id);
  assert.equal(storedL1.dialogue, "unavailable");
  assert.equal(storedL1.persona, undefined, "L1 绝对未包含任何主观语义");

  // 2. 未过审 (pending) 必须拦截
  assert.throws(
    () =>
      promotePerspectiveReadingToAffordance({
        perspectiveReading: reading,
        evidence: mockEvidence,
        tag: "illegal_tag",
        category: "dramatic_function",
        narrativeFunction: "未过审功能",
        approval: { status: "pending", approved_by: "someone" },
        affordanceStore,
        evidenceStore,
      }),
    PromotionGateError
  );

  // 3. 悬空证据 (Evidence 不在证据库) 必须拦截
  const fakeEvidence = { ...mockEvidence, evidence_id: "non_existent_media:scene_9999" };
  assert.throws(
    () =>
      promotePerspectiveReadingToAffordance({
        perspectiveReading: reading,
        evidence: fakeEvidence,
        tag: "illegal_tag",
        category: "dramatic_function",
        narrativeFunction: "悬空功能",
        approval: { status: "approved", approved_by: "someone" },
        affordanceStore,
        evidenceStore,
      }),
    PromotionGateError
  );
});
