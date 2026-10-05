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
  parseTimecodeToSeconds,
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

  assert.equal(enriched.length, 235);

  // 1. 验证每一条都是严格合法的 ObjectiveEvidence
  enriched.forEach((ev) => {
    assert.ok(validateObjectiveEvidence(ev));
    assert.ok(ev.evidence_id.startsWith("qianfu_ep18_720p_25fps:scene_"));
    assert.ok(ev.provenance);
    assert.ok(ev.provenance.pipeline);
    assert.ok(ev.confidence >= 0.2 && ev.confidence <= 1.0);
  });

  const avgConfidence = enriched.reduce((sum, e) => sum + e.confidence, 0) / enriched.length;
  assert.ok(avgConfidence >= 0.75, `平均置信度应高于 0.75，实际为 ${avgConfidence}`);

  // 2. 抽样验证真实剧情场景
  // Scene 46: 吴敬中与余则成
  const scene46 = enriched.find((e) => e.scene_id === "scene_0046");
  assert.ok(scene46);
  assert.ok(scene46.characters.includes("吴敬中") || scene46.characters.includes("余则成"));
  assert.ok(scene46.scene_env.includes("天津站") || scene46.scene_env.includes("办公区") || scene46.scene_env.includes("走廊"));
  assert.ok(scene46.physical_actions.length > 0);

  // Scene 49: 翠平与余则成
  const scene49 = enriched.find((e) => e.scene_id === "scene_0049");
  assert.ok(scene49);
  assert.ok(scene49.characters.includes("余则成") || scene49.characters.includes("翠平"));
  assert.ok(scene49.physical_actions.length > 0);

  // Scene 125: 谢若林与余则成在涮肉馆谈生意与调查陈秋平 (真实环境对齐)
  const scene125 = enriched.find((e) => e.scene_id === "scene_0125");
  assert.ok(scene125);
  assert.ok(scene125.characters.includes("谢若林"));
  assert.ok(scene125.characters.includes("余则成"));
  assert.strictEqual(scene125.characters.includes("吴敬中"), false, "scene_0125 严禁污染包含吴敬中");
  assert.ok(scene125.scene_env.includes("涮肉") || scene125.scene_env.includes("餐桌"), "真实物理环境为涮肉馆餐桌");

  // 3. 统计指标断言：绝大多数场景已补齐真实台词和人物
  const withDialogue = enriched.filter((e) => e.dialogue && e.dialogue.trim()).length;
  const withCharacters = enriched.filter((e) => e.characters && e.characters.length > 0).length;
  const withActions = enriched.filter((e) => e.physical_actions && e.physical_actions.length > 0).length;

  assert.ok(withDialogue >= 100, `对白场景覆盖应大于等于 100，当前为 ${withDialogue}`);
  assert.ok(withCharacters >= 90, `角色场景覆盖应大于等于 90，当前为 ${withCharacters}`);
  assert.ok(withActions >= 130, `物理动作观测覆盖应至少130，当前为 ${withActions}`);

  // 4. 注册进 EvidenceStore 并验证检索索引
  const store = new EvidenceStore();
  store.registerBatch(enriched);
  assert.equal(store.size(), enriched.length);

  const yuScenes = store.findByCharacter("余则成");
  assert.ok(yuScenes.length > 50, "余则成出场镜头数量应显著丰富");
  const officeScenes = store.findByScene("scene_0046");
  assert.equal(officeScenes.length, 1);
});

test("A4.5.1 Canonical L1 Evidence: full video 0 to 2702s continuous coverage, tail dialogue & provenance audit", () => {
  const canonicalPath = new URL("../src/evidence/data/canonical_evidence_qianfu_ep18.json", import.meta.url).pathname;
  const canonicalList = JSON.parse(readFileSync(canonicalPath, "utf8"));

  assert.ok(canonicalList.length >= 200, `全片镜头总数应大于等于 200，实际为 ${canonicalList.length}`);

  // 1. 首尾时间码断言：从 0 开始，在 2702.013s 结束
  const first = canonicalList[0];
  const last = canonicalList[canonicalList.length - 1];

  const firstInSec = typeof first.timecode.in === "number" ? first.timecode.in : parseTimecodeToSeconds(first.timecode.in);
  const lastOutSec = typeof last.timecode.out === "number" ? last.timecode.out : parseTimecodeToSeconds(last.timecode.out);

  assert.equal(firstInSec, 0.0, "首个镜头开始时间必须严格为 0.0s");
  assert.ok(
    Math.abs(lastOutSec - 2702.013) <= 0.05,
    `末尾镜头结束时间必须约等于 2702.013s，实际为 ${lastOutSec}s`
  );

  // 2. 连续性校验：无超过容差 (0.05s) 的时间空洞，且时长合法
  let maxGap = 0;
  for (let i = 0; i < canonicalList.length; i++) {
    const cur = canonicalList[i];
    assert.ok(validateObjectiveEvidence(cur), `镜头 ${cur.scene_id} 必须通过客观证据校验`);

    const curIn = parseTimecodeToSeconds(cur.timecode.in);
    const curOut = parseTimecodeToSeconds(cur.timecode.out);
    assert.ok(curOut > curIn, `镜头 ${cur.scene_id} 出点必须大于入点 (${curIn} -> ${curOut})`);
    assert.ok(cur.timecode.duration_sec > 0, `镜头 ${cur.scene_id} 时长必须大于0`);

    if (i < canonicalList.length - 1) {
      const next = canonicalList[i + 1];
      const nextIn = parseTimecodeToSeconds(next.timecode.in);
      const gap = Math.abs(nextIn - curOut);
      if (gap > maxGap) maxGap = gap;
      assert.ok(
        gap <= 0.05,
        `镜头 ${cur.scene_id} 与 ${next.scene_id} 之间发现时间空洞: ${gap.toFixed(4)}s (当前出点: ${curOut}, 下个入点: ${nextIn})`
      );
    }
  }
  assert.ok(maxGap <= 0.05, `相邻镜头最大时间空洞必须 <= 0.05s，实际为 ${maxGap}s`);

  // 3. 尾部 (>= 1800s) 真实数据深度断言（禁止仅依赖元数据）
  const tailScenes = canonicalList.filter((e) => parseTimecodeToSeconds(e.timecode.in) >= 1800.0);
  assert.ok(tailScenes.length >= 80, `尾部镜头数量应至少有80个，实际为 ${tailScenes.length}`);

  const tailWithDialogue = tailScenes.filter((e) => e.dialogue && e.dialogue.trim().length > 0);
  assert.ok(tailWithDialogue.length >= 60, `尾部带真实台词镜头应至少有60个，实际为 ${tailWithDialogue.length}`);

  // 抽查尾部晚秋撤离与站长剧情的真实台词
  const tailDialogueCombined = tailWithDialogue.map((e) => e.dialogue).join(" ");
  assert.ok(
    tailDialogueCombined.includes("照片") ||
    tailDialogueCombined.includes("局里") ||
    tailDialogueCombined.includes("时间来不及") ||
    tailDialogueCombined.includes("忠诚永在"),
    "尾部台词流中必须包含原片晚秋/撤离/片尾真实台词"
  );

  // 4. 来源与粒度审计断言：明确区分 independent_keyframe 与 segment_inherited
  const independentScenes = canonicalList.filter((e) => e.provenance.analysis_granularity === "independent_keyframe");
  const inheritedScenes = canonicalList.filter((e) => e.provenance.analysis_granularity === "segment_inherited");

  assert.ok(independentScenes.length > 0, "必须存在独立代表帧分析镜头");
  assert.ok(inheritedScenes.length > 0, "必须存在段级继承镜头");

  // 校验段级继承镜头的真实来源记录与置信度衰减
  inheritedScenes.forEach((e) => {
    assert.ok(e.provenance.source_segment_id, `继承镜头 ${e.scene_id} 必须明确记录 source_segment_id`);
    assert.ok(
      e.confidence <= 0.85,
      `继承镜头 ${e.scene_id} 的置信度必须相应降低 (<= 0.85)，实际为 ${e.confidence}`
    );
    assert.ok(
      Array.isArray(e.provenance.sample_frame_refs) && e.provenance.sample_frame_refs.length > 0,
      `继承镜头 ${e.scene_id} 必须记录代表帧引用`
    );
  });

  // 校验独立代表帧镜头的置信度与比较
  const avgIndependent = independentScenes.reduce((sum, e) => sum + e.confidence, 0) / independentScenes.length;
  const avgInherited = inheritedScenes.reduce((sum, e) => sum + e.confidence, 0) / inheritedScenes.length;
  assert.ok(
    avgIndependent > avgInherited,
    `独立分析平均置信度 (${avgIndependent.toFixed(3)}) 必须高于继承分析平均置信度 (${avgInherited.toFixed(3)})`
  );
  independentScenes.forEach((e) => {
    assert.ok(
      e.confidence >= 0.20 && e.confidence <= 1.0,
      `独立分析镜头 ${e.scene_id} 的置信度应在合法区间 [0.2, 1.0]，实际为 ${e.confidence}`
    );
  });

  // 5. 尾部 EvidenceStore 检索可用性
  const store = new EvidenceStore();
  store.registerBatch(canonicalList);
  assert.equal(store.size(), canonicalList.length);

  // 检索尾部出场人物
  const tailYuScenes = store.findByCharacter("余则成").filter((e) => parseTimecodeToSeconds(e.timecode.in) >= 1800.0);
  assert.ok(tailYuScenes.length >= 20, `尾部余则成出场镜头检索应至少有20个，实际为 ${tailYuScenes.length}`);
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
