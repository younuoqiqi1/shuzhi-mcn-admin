/**
 * @file production-e2e.test.mjs
 * @description POC-AGENT A8: MCN 后台 -> 真实生产链 -> MP4 端到端集成与技术 QC 自动化测试套件。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ProductionJobService, PRODUCTION_JOB_STATES } from "../src/production/production-job-service.mjs";
import { McnBackendServer } from "../src/server/mcn-backend-api.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.resolve(REPO_ROOT, "outputs/production");

function probeVideo(filePath) {
  const stdout = execFileSync("ffprobe", [
    "-v", "error",
    "-show_streams",
    "-show_format",
    "-of", "json",
    filePath,
  ], { encoding: "utf-8" });
  return JSON.parse(stdout);
}

test("POC-AGENT A8: 真实生产链与 MCN 后台端到端综合测试", async (t) => {
  const mp4B = path.join(OUTPUT_DIR, "topic_b_final.mp4");
  const manifestBPath = path.join(OUTPUT_DIR, "topic_b_final.manifest.json");
  const mp4A = path.join(OUTPUT_DIR, "topic_a_final.mp4");
  const manifestAPath = path.join(OUTPUT_DIR, "topic_a_final.manifest.json");

  await t.test("1. ProductionJobService 状态机合规性与参数校验", () => {
    const service = new ProductionJobService({ outputDir: OUTPUT_DIR });
    assert.throws(() => service.createJob({}), /topicId is required/);
    assert.throws(() => service.createJob({ topicId: "t1" }), /directorPlanId is required/);
    assert.throws(() => service.createJob({ topicId: "t1", directorPlanId: "p1" }), /orderFilePath is required/);

    const job = service.createJob({
      topicId: "test_topic",
      directorPlanId: "plan_test",
      orderFilePath: "test_order.json",
    });
    assert.equal(job.current_stage, PRODUCTION_JOB_STATES.QUEUED);
    assert.equal(job.progress, 0.0);
    assert.ok(job.job_id.startsWith("job_prod_test_topic_"));
  });

  await t.test("2. 选题 B 成片技术 QC 断言 (真实影视源片/时长/分辨率/流结构)", () => {
    assert.ok(fs.existsSync(mp4B), `Topic B MP4 must exist at ${mp4B}`);
    assert.ok(fs.existsSync(manifestBPath), `Topic B manifest must exist at ${manifestBPath}`);

    const manifestB = JSON.parse(fs.readFileSync(manifestBPath, "utf-8"));
    const probeB = probeVideo(mp4B);
    const vStream = probeB.streams.find((s) => s.codec_type === "video");
    const aStream = probeB.streams.find((s) => s.codec_type === "audio");
    const duration = parseFloat(probeB.format.duration);

    assert.ok(vStream, "Must contain video stream");
    assert.ok(aStream, "Must contain audio stream");
    assert.equal(vStream.codec_name, "h264");
    assert.equal(aStream.codec_name, "aac");
    assert.equal(vStream.width, 1280);
    assert.equal(vStream.height, 720);
    assert.ok(duration >= 39.0 && duration <= 42.0, `Duration must roughly match 40.4s (got ${duration}s)`);

    assert.equal(manifestB.qc_passed, true);
    assert.equal(manifestB.segment_count, 4);
    assert.ok(manifestB.sha256 && manifestB.sha256.length === 64);
  });

  await t.test("3. 选题 B Audio Owner 实际执行断言 (分段2无旁白保留原声/分段3闪避/分段4L-cut)", () => {
    const manifestB = JSON.parse(fs.readFileSync(manifestBPath, "utf-8"));
    const segs = manifestB.segments_summary;

    // Segment 1: narration
    assert.equal(segs[0].audio_owner, "narration");
    assert.ok(segs[0].tts_duration_sec > 4.0);

    // Segment 2: original_dialogue (谢若林两根金条名场面)
    assert.equal(segs[1].audio_owner, "original_dialogue");
    assert.equal(segs[1].tts_duration_sec, 0.0, "Segment 2 must NOT have TTS");
    assert.equal(segs[1].narration_text, "");

    // Segment 3: duck
    assert.equal(segs[2].audio_owner, "narration");
    assert.equal(segs[2].audio_transition, "duck");
    assert.ok(segs[2].tts_duration_sec > 5.0);

    // Segment 4: L_cut
    assert.equal(segs[3].audio_owner, "narration");
    assert.equal(segs[3].audio_transition, "L_cut");
  });

  await t.test("4. 选题 A 零改代码复跑 QC 断言 (3个分段/时长/分辨率/全新哈希)", () => {
    assert.ok(fs.existsSync(mp4A), `Topic A MP4 must exist at ${mp4A}`);
    assert.ok(fs.existsSync(manifestAPath), `Topic A manifest must exist at ${manifestAPath}`);

    const manifestA = JSON.parse(fs.readFileSync(manifestAPath, "utf-8"));
    const probeA = probeVideo(mp4A);
    const duration = parseFloat(probeA.format.duration);

    assert.ok(duration >= 38.0 && duration <= 41.0, `Duration must roughly match 39.44s (got ${duration}s)`);
    assert.equal(manifestA.segment_count, 3);
    assert.equal(manifestA.qc_passed, true);

    const manifestB = JSON.parse(fs.readFileSync(manifestBPath, "utf-8"));
    assert.notEqual(manifestA.sha256, manifestB.sha256, "Topic A and B must produce different SHA-256");
    assert.notEqual(manifestA.order_id, manifestB.order_id);
    assert.notEqual(manifestA.topic_id, manifestB.topic_id);
  });

  await t.test("5. McnBackendServer HTTP API 与视频流 Range 播放支持验证", async () => {
    const testPort = 3199;
    const server = new McnBackendServer({ port: testPort, outputDir: OUTPUT_DIR });
    await server.start();

    try {
      // 1. GET /api/production/jobs
      const listRes = await fetch(`http://localhost:${testPort}/api/production/jobs`);
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      assert.ok(Array.isArray(listData.jobs));

      // 2. GET /api/videos/topic_b_final.mp4 (Full content)
      const vidRes = await fetch(`http://localhost:${testPort}/api/videos/topic_b_final.mp4`);
      assert.equal(vidRes.status, 200);
      assert.equal(vidRes.headers.get("content-type"), "video/mp4");
      assert.equal(vidRes.headers.get("accept-ranges"), "bytes");
      await vidRes.arrayBuffer();

      // 3. GET /api/videos/topic_b_final.mp4 (Range request for browser player seeking)
      const rangeRes = await fetch(`http://localhost:${testPort}/api/videos/topic_b_final.mp4`, {
        headers: { Range: "bytes=0-1023" },
      });
      assert.equal(rangeRes.status, 206);
      assert.ok(rangeRes.headers.get("content-range").startsWith("bytes 0-1023/"));
      const buffer = await rangeRes.arrayBuffer();
      assert.equal(buffer.byteLength, 1024);

      // 4. GET /index.html (Static file hosting)
      const staticRes = await fetch(`http://localhost:${testPort}/index.html`);
      assert.equal(staticRes.status, 200);
      const htmlText = await staticRes.text();
      assert.ok(htmlText.includes("序场"));
    } finally {
      await server.stop();
    }
  });

  await t.test("6. Provenance 审计记录真实性断言", () => {
    const reportPath = path.resolve(REPO_ROOT, "docs/agent-poc/a8-e2e-production-report.md");
    assert.ok(fs.existsSync(reportPath), "Report must exist");
    const content = fs.readFileSync(reportPath, "utf-8");

    assert.ok(content.includes("topic_b_final.mp4"));
    assert.ok(content.includes("topic_a_final.mp4"));
    assert.ok(content.includes("macos_native_say"));
    assert.ok(content.includes("is_fallback: true"));
    assert.ok(content.includes("零改代码复跑验证"));
    assert.ok(content.includes("A8 awaiting_human_video_review"));
  });
});
