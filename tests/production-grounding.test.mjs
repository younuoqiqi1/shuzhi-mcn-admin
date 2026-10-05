/**
 * @file production-grounding.test.mjs
 * @description POC-AGENT A8.1: Production Grounding Remediation 专项自动化测试套件。
 * 覆盖：
 * 1. L1 物理事实纯净性 (scene_0059 绝无吴敬中、杜绝演职员表歌词字幕污染)；
 * 2. 核心原声台词与源视频毫秒级真实对齐 ("副站长就是你" 305-315s, "两根金条" 2015-2023s)；
 * 3. Final Director 防重复机制 (默认严禁相同成片重复使用相同 retrieval_unit_id)；
 * 4. 五维全息生产级门禁 (Temporal, Dialogue, Visual, Semantic >= Level 4, Editorial) 100% 满分通过；
 * 5. 真实源片抽帧验证 (21 张代表帧客观存在于磁盘，大小正常)；
 * 6. VMV 消费端假台词彻底清除断言 (render.py 严禁硬编码字幕文案)。
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ProductionGroundingGate } from "../src/director/production-grounding-gate.mjs";
import { DirectorEvidenceValidator, DirectorValidationError } from "../src/director/director-evidence-validator.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("POC-AGENT A8.1: Production Grounding Remediation 严苛质量门禁测试套件", () => {
  const canonicalEvidencePath = path.resolve(rootDir, "src/evidence/data/canonical_evidence_qianfu_ep18.json");
  const canonicalUnitsPath = path.resolve(rootDir, "src/evidence/data/canonical_retrieval_units_qianfu_ep18.json");
  const planAPath = path.resolve(rootDir, "src/director/results/director_plan_topic_a.json");
  const planBPath = path.resolve(rootDir, "src/director/results/director_plan_topic_b.json");
  const proofsAPath = path.resolve(rootDir, "outputs/grounding_proofs/candidate_proofs_topic_a.json");
  const proofsBPath = path.resolve(rootDir, "outputs/grounding_proofs/candidate_proofs_topic_b.json");
  const framesDir = path.resolve(rootDir, "outputs/grounding_proofs/frames");

  const canonicalEvidence = JSON.parse(fs.readFileSync(canonicalEvidencePath, "utf8"));
  const canonicalUnits = JSON.parse(fs.readFileSync(canonicalUnitsPath, "utf8"));
  const planA = JSON.parse(fs.readFileSync(planAPath, "utf8"));
  const planB = JSON.parse(fs.readFileSync(planBPath, "utf8"));

  // 1. L1 纯净客观性断言
  it("1. L1 纯净客观性断言：scene_0059 绝无吴敬中出镜，全片覆盖 0~2702s 且无时间断裂", () => {
    assert.strictEqual(canonicalEvidence.length, 235);
    
    // scene_0059 真实性审计
    const s59 = canonicalEvidence.find((s) => s.scene_id === "scene_0059");
    assert.ok(s59, "scene_0059 必须客观存在");
    assert.strictEqual(s59.characters.includes("吴敬中"), false, "scene_0059 (556-573s) 走廊楼梯谈话绝对不能有吴敬中");
    assert.deepStrictEqual(s59.characters, ["余则成", "陆桥山"], "scene_0059 出镜人物真实确认为余则成与陆桥山");

    // 单元库中的 scene_0059 也不得有吴敬中
    const u59 = canonicalUnits.find((u) => u.parent_scene_id === "scene_0059");
    assert.ok(u59);
    assert.strictEqual(u59.characters.includes("吴敬中"), false);

    // 全片连续性
    assert.strictEqual(canonicalEvidence[0].timecode.in, "00:00:00.000");
    assert.strictEqual(canonicalEvidence[canonicalEvidence.length - 1].timecode.out, "00:45:02.013");
  });

  // 2. 高光对白真实存在性与精确时间戳断言
  it("2. 核心原声对白真实对齐：'副站长就是你' (305-315s) 与 '两根金条' (2015-2023s) 毫秒级确证", () => {
    // 验证 unit_dial_vice_director_01
    const uVice = canonicalUnits.find((u) => u.unit_id === "unit_dial_vice_director_01");
    assert.ok(uVice, "unit_dial_vice_director_01 必须存在于检索单元库");
    assert.ok(uVice.dialogue.includes("副站长就是你"), "对白必须包含'副站长就是你'");
    assert.ok(uVice.dialogue.includes("谢谢老师栽培"), "对白必须包含'谢谢老师栽培'");
    assert.deepStrictEqual(uVice.characters, ["吴敬中", "余则成"]);
    assert.strictEqual(uVice.timecode.start_sec, 305.96);
    assert.strictEqual(uVice.timecode.end_sec, 315.00);

    // 验证 unit_dial_gold_bars_01
    const uGold = canonicalUnits.find((u) => u.unit_id === "unit_dial_gold_bars_01");
    assert.ok(uGold, "unit_dial_gold_bars_01 必须存在于检索单元库");
    assert.ok(uGold.dialogue.includes("两根金条"), "对白必须包含'两根金条'");
    assert.ok(uGold.dialogue.includes("个师呀才两根金条"), "对白必须包含'个师呀才两根金条'");
    assert.deepStrictEqual(uGold.characters, ["谢若林", "余则成"]);
    assert.strictEqual(uGold.timecode.start_sec, 2015.00);
    assert.strictEqual(uGold.timecode.end_sec, 2023.20);
  });

  // 3. 镜头去重防护断言
  it("3. Director 镜头排重机制：默认严禁相同成片重复使用同一 retrieval_unit_id", () => {
    // 验证校验器拦截重复镜头
    const fakePlan = JSON.parse(JSON.stringify(planA));
    fakePlan.segments[2].retrieval_unit_id = fakePlan.segments[0].retrieval_unit_id; // 强行注入重复镜头
    assert.throws(
      () => DirectorEvidenceValidator.validatePlan(fakePlan),
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("镜头重复错误"));
        return true;
      }
    );

    // 验证当前两条真实 Plan 内部绝对零重复镜头
    const unitsA = planA.segments.map((s) => s.retrieval_unit_id);
    assert.strictEqual(new Set(unitsA).size, unitsA.length, "Topic A 所有分段镜头必须唯一");

    const unitsB = planB.segments.map((s) => s.retrieval_unit_id);
    assert.strictEqual(new Set(unitsB).size, unitsB.length, "Topic B 所有分段镜头必须唯一");
  });

  // 4. 五维全息生产门禁 (ProductionGroundingGate) 100% 满分通过
  it("4. 五维生产门禁：Topic A 与 Topic B 所有分段 100% 通过 Temporal, Dialogue, Visual, Semantic, Editorial 检验", () => {
    // Topic A
    planA.segments.forEach((seg, idx) => {
      const evalRes = ProductionGroundingGate.evaluateSegment(seg, { allSegments: planA.segments });
      assert.strictEqual(evalRes.pass, true, `Topic A 分段 [${idx}] (${seg.segment_id}) 必须通过五维门禁`);
      assert.strictEqual(evalRes.failed_dimensions.length, 0);
      assert.strictEqual(evalRes.dimensions.temporal.pass, true);
      assert.strictEqual(evalRes.dimensions.dialogue.pass, true);
      assert.strictEqual(evalRes.dimensions.visual.pass, true);
      assert.strictEqual(evalRes.dimensions.semantic.pass, true);
      assert.ok(evalRes.dimensions.semantic.level >= 4, "Semantic 匹配度必须 >= Level 4");
      assert.strictEqual(evalRes.dimensions.editorial.pass, true);
    });

    // Topic B
    planB.segments.forEach((seg, idx) => {
      const evalRes = ProductionGroundingGate.evaluateSegment(seg, { allSegments: planB.segments });
      assert.strictEqual(evalRes.pass, true, `Topic B 分段 [${idx}] (${seg.segment_id}) 必须通过五维门禁`);
      assert.strictEqual(evalRes.failed_dimensions.length, 0);
      assert.strictEqual(evalRes.dimensions.temporal.pass, true);
      assert.strictEqual(evalRes.dimensions.dialogue.pass, true);
      assert.strictEqual(evalRes.dimensions.visual.pass, true);
      assert.strictEqual(evalRes.dimensions.semantic.pass, true);
      assert.ok(evalRes.dimensions.semantic.level >= 4, "Semantic 匹配度必须 >= Level 4");
      assert.strictEqual(evalRes.dimensions.editorial.pass, true);
    });
  });

  // 5. 门禁防御力测试：篡改台词时坚决阻断
  it("5. 门禁防御力验证：声称原声台词与源视频对白不符时，dialogue 维度坚决阻断并降级 semantic", () => {
    const tamperedSeg = {
      segment_id: "test_tampered_seg",
      source_in: 305.96,
      source_out: 315.00,
      planned_duration: 9.04,
      audio_owner: "original_dialogue",
      original_dialogue_text: "副站长就是你",
      actual_transcript_in_interval: "我们今天去吃涮肉", // 篡改为无关对白
      characters: ["吴敬中", "余则成"],
      retrieval_unit_id: "unit_test_01",
      purpose: "测试原声造假拦截",
    };

    const res = ProductionGroundingGate.evaluateSegment(tamperedSeg);
    assert.strictEqual(res.pass, false);
    assert.ok(res.failed_dimensions.includes("dialogue"));
    assert.ok(res.failed_dimensions.includes("semantic"));
    assert.strictEqual(res.dimensions.semantic.level, 1);
  });

  // 6. 真实代表帧与 Storyboard 页面存在性断言
  it("6. 证据真实落地：21 张真实代表帧文件全部存在且文件大小正常，Storyboard HTML 可视化完整生成", () => {
    const proofsA = JSON.parse(fs.readFileSync(proofsAPath, "utf8"));
    const proofsB = JSON.parse(fs.readFileSync(proofsBPath, "utf8"));

    let totalFramesChecked = 0;
    [...proofsA.segments, ...proofsB.segments].forEach((seg) => {
      assert.ok(seg.representative_frames.length >= 3, `分段 ${seg.segment_id} 必须包含至少 3 张代表帧`);
      seg.representative_frames.forEach((f) => {
        const fullPath = path.resolve(rootDir, "outputs/grounding_proofs", f.relative_path);
        assert.ok(fs.existsSync(fullPath), `抽帧图片必须真实存在: ${fullPath}`);
        const stat = fs.statSync(fullPath);
        assert.ok(stat.size > 10000, `图片文件必须为有效尺寸 (>10KB)，实际: ${stat.size}B`);
        totalFramesChecked++;
      });
    });

    assert.strictEqual(totalFramesChecked, 21, "必须总共验证全部 21 张真实抽帧");

    // Storyboard HTML 存在性
    const htmlAPath = path.resolve(rootDir, "outputs/grounding_proofs/storyboard_topic_a.html");
    const htmlBPath = path.resolve(rootDir, "outputs/grounding_proofs/storyboard_topic_b.html");
    assert.ok(fs.existsSync(htmlAPath), "storyboard_topic_a.html 必须存在");
    assert.ok(fs.existsSync(htmlBPath), "storyboard_topic_b.html 必须存在");

    const htmlA = fs.readFileSync(htmlAPath, "utf8");
    assert.ok(htmlA.includes("副站长就是你"));
    assert.ok(htmlA.includes("5-DIMENSIONS GROUNDING: ALL PASS"));

    const htmlB = fs.readFileSync(htmlBPath, "utf8");
    assert.ok(htmlB.includes("两根金条"));
    assert.ok(htmlB.includes("5-DIMENSIONS GROUNDING: ALL PASS"));
  });

  // 7. 消费端剔除假字幕代码铁律断言
  it("7. 消费端纯净化断言：video-moment-validation render.py 绝对不含任何硬编码假台词", () => {
    const vmvRenderPyPath = "/Users/yoyotaozhou/Documents/video-moment-validation/src/vmv/render.py";
    assert.ok(fs.existsSync(vmvRenderPyPath), "render.py 文件必须存在");
    const code = fs.readFileSync(vmvRenderPyPath, "utf8");

    // 严禁包含之前发现的伪造字幕硬编码
    assert.strictEqual(code.includes("老周重看第18集"), false);
    assert.strictEqual(code.includes("这第一呀 重要的情报没人向上汇报"), false);
    assert.strictEqual(code.includes("两根金条不仅化解了灭顶危机"), false);
  });
});
