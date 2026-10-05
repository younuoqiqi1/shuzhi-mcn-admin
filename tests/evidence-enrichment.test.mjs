/**
 * @file evidence-enrichment.test.mjs
 * @description POC-AGENT A4.5: L1 客观 Evidence 真实富集与覆盖率核验测试套件
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  generateCaptionPacket,
  validateCaptionPacket,
  batchGenerateCaptionPackets,
} from "../src/evidence/caption-packet.mjs";

import {
  matchDialoguesForTimecode,
  importEnrichedEvidenceItem,
  importEnrichedEvidenceBatch,
} from "../src/evidence/caption-importer.mjs";

import {
  loadEnrichedEvidenceArtifacts,
} from "../src/evidence/vmv-evidence-adapter.mjs";

import {
  validateObjectiveEvidence,
  L1PollutionError,
} from "../src/evidence/objective-evidence.mjs";

import { EvidenceStore } from "../src/evidence/evidence-store.mjs";

test("A4.5 Coverage Verification: verifies 130 vs 325 scenes and full 2702s coverage analysis", () => {
  const coveragePath = new URL("../src/evidence/data/coverage_analysis.json", import.meta.url).pathname;
  const coverage = JSON.parse(readFileSync(coveragePath, "utf8"));

  assert.equal(coverage.media_id, "qianfu_ep18_720p_25fps");
  assert.equal(coverage.total_video_duration_sec, 2702.013);
  assert.equal(coverage.total_frames, 67550);

  // 1. 历史 130 场景核验：前 1800 秒，129 切点，遗漏 902 秒
  assert.equal(coverage.historical_stage1_130.scene_count, 130);
  assert.equal(coverage.historical_stage1_130.cut_count, 129);
  assert.equal(coverage.historical_stage1_130.analyzed_duration_sec, 1800.0);
  assert.equal(coverage.historical_stage1_130.uncovered_duration_sec, 902.013);
  assert.equal(coverage.historical_stage1_130.coverage_percent, 66.62);

  // 2. 重新检测 325 切点 (326 场景) 核验：前 1800 秒，325 切点，遗漏 902 秒
  assert.equal(coverage.recheck_stage1_325.scene_count, 326);
  assert.equal(coverage.recheck_stage1_325.cut_count, 325);
  assert.equal(coverage.recheck_stage1_325.analyzed_duration_sec, 1800.0);
  assert.equal(coverage.recheck_stage1_325.uncovered_duration_sec, 902.013);

  // 3. 尾部 1800s - 2702s 切分核验：检测出 105 个切点 (106 个场景)
  assert.equal(coverage.tail_segment_1800_to_2702.cut_count, 105);
  assert.equal(coverage.tail_segment_1800_to_2702.scene_count, 106);

  // 4. 全片 2702 秒全覆盖核验
  assert.equal(coverage.full_2702s_coverage_baseline.scene_count, 236);
  assert.equal(coverage.full_2702s_coverage_baseline.coverage_percent, 100.0);
  assert.equal(coverage.full_2702s_coverage_adaptive.scene_count, 432);
  assert.equal(coverage.full_2702s_coverage_adaptive.coverage_percent, 100.0);
});

test("A4.5 CaptionPacket: generates valid packet with sample points", () => {
  const dummyScene = {
    index: 42,
    start_sec: 289.72,
    end_sec: 298.50,
    start_timecode: "00:04:49.720",
    end_timecode: "00:04:58.500",
    duration_sec: 8.78,
  };
  const mediaInfo = {
    media_id: "qianfu_ep18_720p_25fps",
    filename: "qianfu_ep18.mp4",
    fps: 25.0,
  };

  const pkt = generateCaptionPacket(dummyScene, mediaInfo);
  assert.ok(validateCaptionPacket(pkt));
  assert.equal(pkt.scene_id, "scene_0042");
  assert.equal(pkt.timecode.duration_sec, 8.78);
  assert.ok(pkt.sample_points_sec.length >= 3); // 超过 6 秒的长镜头包含 3 个采样点
});

test("A4.5 CaptionImporter: matches subtitles accurately by timecode window", () => {
  const dummySubs = [
    { start_sec: 310.0, end_sec: 312.0, text: "副站长就是你", confidence: 0.98 },
    { start_sec: 312.5, end_sec: 315.0, text: "谢谢老师栽培", confidence: 0.99 },
    { start_sec: 350.0, end_sec: 355.0, text: "无关字幕", confidence: 0.90 },
  ];

  const tc = { in: "00:05:10.000", out: "00:05:15.000", start_sec: 310.0, end_sec: 315.0 };
  const res = matchDialoguesForTimecode(tc, dummySubs);

  assert.equal(res.matchCount, 2);
  assert.ok(res.dialogue.includes("副站长就是你"));
  assert.ok(res.dialogue.includes("谢谢老师栽培"));
  assert.ok(!res.dialogue.includes("无关字幕"));
  assert.ok(res.avgConfidence >= 0.98);
});

test("A4.5 Real Enriched Evidence: verifies authentic characters, dialogue, actions and provenance", () => {
  const enriched = loadEnrichedEvidenceArtifacts();

  assert.equal(enriched.length, 130);

  // 1. 验证每一条都是严格合法的 ObjectiveEvidence
  enriched.forEach((ev) => {
    assert.ok(validateObjectiveEvidence(ev));
    assert.ok(ev.evidence_id.startsWith("qianfu_ep18_720p_25fps:scene_"));
    assert.ok(ev.provenance);
    assert.ok(ev.provenance.pipeline);
    assert.ok(ev.confidence >= 0.2 && ev.confidence <= 1.0);
  });

  const avgConfidence = enriched.reduce((sum, e) => sum + e.confidence, 0) / enriched.length;
  assert.ok(avgConfidence >= 0.8, `平均置信度应高于 0.8，实际为 ${avgConfidence}`);

  // 2. 抽样验证真实剧情场景
  // Scene 46 (311.0s - 315.0s): 吴敬中与余则成
  const scene46 = enriched.find((e) => e.scene_id === "scene_0046");
  assert.ok(scene46);
  assert.deepEqual(scene46.characters, ["吴敬中", "余则成"]);
  assert.equal(scene46.scene_env, "保密局天津站站长办公室");
  assert.ok(scene46.dialogue.includes("副站长就是你") || scene46.dialogue.includes("谢谢老师栽培"));
  assert.ok(scene46.physical_actions.length > 0);

  // Scene 49 (350.6s - 427.0s): 翠平与余则成跳舞
  const scene49 = enriched.find((e) => e.scene_id === "scene_0049");
  assert.ok(scene49);
  assert.deepEqual(scene49.characters, ["余则成", "翠平"]);
  assert.equal(scene49.scene_env, "余则成翠平寓所客厅");
  assert.ok(scene49.dialogue.includes("学跳舞") || scene49.dialogue.includes("手搁这儿吧") || scene49.dialogue.includes("左右左"));

  // Scene 125-130: 谢若林与余则成吃面和调查陈秋平
  const scene125 = enriched.find((e) => e.scene_id === "scene_0125");
  assert.ok(scene125);
  assert.ok(scene125.characters.includes("谢若林"));
  assert.ok(scene125.characters.includes("余则成"));
  assert.equal(scene125.scene_env, "谢若林穆晚秋寓所餐厅与客厅");

  // 3. 统计指标断言：绝大多数场景已补齐真实台词和人物
  const withDialogue = enriched.filter((e) => e.dialogue && e.dialogue.trim()).length;
  const withCharacters = enriched.filter((e) => e.characters && e.characters.length > 0).length;
  const withActions = enriched.filter((e) => e.physical_actions && e.physical_actions.length > 0).length;

  assert.ok(withDialogue >= 100, `对白场景覆盖应大于等于 100，当前为 ${withDialogue}`);
  assert.ok(withCharacters >= 90, `角色场景覆盖应大于等于 90，当前为 ${withCharacters}`);
  assert.equal(withActions, 130, "130个场景全部补齐物理动作观测");

  // 4. 注册进 EvidenceStore 并验证检索索引
  const store = new EvidenceStore();
  store.registerBatch(enriched);
  assert.equal(store.size(), 130);

  const yuScenes = store.findByCharacter("余则成");
  assert.ok(yuScenes.length > 50, "余则成出场镜头数量应显著丰富");
  const officeScenes = store.findByScene("scene_0046");
  assert.equal(officeScenes.length, 1);
});

test("A4.5 Recheck 326 Enriched Evidence: verifies finer cuts dataset validity", () => {
  const recheckPath = new URL("../src/evidence/data/enriched_evidence_recheck_326.json", import.meta.url).pathname;
  const recheckList = loadEnrichedEvidenceArtifacts(recheckPath);

  assert.equal(recheckList.length, 326);
  recheckList.forEach((ev) => {
    assert.ok(validateObjectiveEvidence(ev));
  });

  const withDialogue = recheckList.filter((e) => e.dialogue && e.dialogue.trim()).length;
  assert.ok(withDialogue >= 180, `细切点对白命中数应大于等于 180，当前为 ${withDialogue}`);
});
