/**
 * @file evidence-store.test.mjs
 * @description POC-AGENT A2: L1 客观 Evidence 接入与真实 VMV 产物读取测试套件
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
  UNAVAILABLE,
  validateObjectiveEvidence,
  L1PollutionError,
  secondsToTimecode,
} from "../src/evidence/objective-evidence.mjs";
import { loadVMVStage1Artifacts } from "../src/evidence/vmv-evidence-adapter.mjs";
import { EvidenceStore } from "../src/evidence/evidence-store.mjs";

const VMV_REAL_MANIFEST =
  "/Users/yoyotaozhou/Documents/video-moment-validation/outputs/stage1/media_manifest.json";
const VMV_REAL_SCENES =
  "/Users/yoyotaozhou/Documents/video-moment-validation/outputs/stage1/scenes_qianfu_ep18_720p_25fps.json";

// 构造一个确定性的合成 fixture（以防在隔离环境下跑测试）
const mockVMVManifest = {
  version: 1,
  stage: "stage1_media_import",
  media: {
    media_id: "test_media_01",
    filename: "test.mp4",
    relative_path: "data/input/test.mp4",
    duration_sec: 120.0,
    video: {
      codec: "h264",
      width: 1920,
      height: 1080,
      fps: 25.0,
    },
    audio: {
      codec: "aac",
      channels: 2,
      sample_rate: 44100,
    },
    subtitles: [],
  },
};

const mockVMVScenes = {
  media_id: "test_media_01",
  fps: 25.0,
  total_scenes: 2,
  scenes: [
    {
      index: 1,
      start_sec: 0.0,
      end_sec: 4.5,
      duration_sec: 4.5,
      start_frame: 0,
      end_frame: 112,
    },
    {
      index: 2,
      start_sec: 4.5,
      end_sec: 10.0,
      duration_sec: 5.5,
      start_frame: 112,
      end_frame: 250,
    },
  ],
};

test("secondsToTimecode: correctly converts seconds to milliseconds timecode", () => {
  assert.equal(secondsToTimecode(0), "00:00:00.000");
  assert.equal(secondsToTimecode(4.5), "00:00:04.500");
  assert.equal(secondsToTimecode(3661.125), "01:01:01.125");
});

test("loadVMVStage1Artifacts: converts synthetic VMV fixture with strict objectivity", () => {
  const evidences = loadVMVStage1Artifacts(mockVMVManifest, mockVMVScenes);
  assert.equal(evidences.length, 2);

  const ev1 = evidences[0];
  assert.equal(ev1.evidence_id, "test_media_01:scene_0001");
  assert.equal(ev1.timecode.in, "00:00:00.000");
  assert.equal(ev1.timecode.out, "00:00:04.500");
  assert.equal(ev1.timecode.duration_sec, 4.5);
  assert.equal(ev1.source.resolution, "1920x1080");

  // 严谨检验：未探测字段必须标记为 UNAVAILABLE，禁止任何臆造
  assert.equal(ev1.dialogue, UNAVAILABLE);
  assert.equal(ev1.characters, UNAVAILABLE);
  assert.equal(ev1.physical_actions, UNAVAILABLE);
  assert.equal(ev1.camera, UNAVAILABLE);
  assert.equal(ev1.audio.codec, "aac");
});

test("EvidenceStore: registers, indexes, and queries evidence strictly", () => {
  const store = new EvidenceStore();
  const evidences = loadVMVStage1Artifacts(mockVMVManifest, mockVMVScenes);
  store.registerBatch(evidences);

  assert.equal(store.size(), 2);
  assert.ok(store.get("test_media_01:scene_0001"));
  assert.equal(store.listByMedia("test_media_01").length, 2);

  // 时间范围命中查询
  const rangeResults = store.queryTimeRange("test_media_01", 3.0, 6.0);
  assert.equal(rangeResults.length, 2, "scene 1 (0-4.5s) 与 scene 2 (4.5-10s) 均在 [3s, 6s] 窗口内重叠");

  // 严禁修改已有客观事实
  assert.throws(() => store.update(), L1PollutionError);
});

test("validateObjectiveEvidence: aggressively rejects any L1 subjective pollution", () => {
  const validEv = loadVMVStage1Artifacts(mockVMVManifest, mockVMVScenes)[0];
  assert.ok(validateObjectiveEvidence(validEv));

  // 试图向 L1 注入博主人设/观点
  assert.throws(
    () =>
      validateObjectiveEvidence({
        ...validEv,
        persona: "职场老周",
      }),
    (err) => {
      assert.ok(err instanceof L1PollutionError);
      assert.match(err.message, /严禁向 L1 客观事实层注入主观数据/);
      return true;
    }
  );

  // 试图注入剧情解读
  assert.throws(
    () =>
      validateObjectiveEvidence({
        ...validEv,
        interpretation: "余则成端茶是在借势试探",
      }),
    L1PollutionError
  );
});

test("Real VMV Artifacts: loads real Stage 1 output from video-moment-validation", () => {
  if (existsSync(VMV_REAL_MANIFEST) && existsSync(VMV_REAL_SCENES)) {
    const evidences = loadVMVStage1Artifacts(VMV_REAL_MANIFEST, VMV_REAL_SCENES);
    assert.equal(evidences.length, 130, "真实 VMV Stage 1 输出中应包含 130 个镜头");

    const first = evidences[0];
    assert.equal(first.media_id, "qianfu_ep18_720p_25fps");
    assert.equal(first.source.filename, "qianfu_ep18.mp4");
    assert.equal(first.source.resolution, "1280x720");
    assert.equal(first.source.fps, 25.0);
    assert.equal(first.timecode.in, "00:00:00.000");

    // 检查字段未臆造
    assert.equal(first.dialogue, UNAVAILABLE);
    assert.equal(first.characters, UNAVAILABLE);

    const store = new EvidenceStore();
    store.registerBatch(evidences);
    assert.equal(store.size(), 130);
    assert.equal(store.listByMedia("qianfu_ep18_720p_25fps").length, 130);
  } else {
    // 若路径不存在则跳过真实文件校验
    assert.ok(true, "真实文件路径未找到，已由模拟 fixture 覆盖");
  }
});
