/**
 * @file director-final.test.mjs
 * @description POC-AGENT A7: Director Final 综合测试套件。
 * 覆盖：
 * 1. A6 Top3 -> Director selection
 * 2. 禁止 Top3 外镜头
 * 3. INSUFFICIENT_EVIDENCE resolution (req_wu_03)
 * 4. audio_owner 策略
 * 5. narration_job 与 narration_text 因果依赖
 * 6. 原声对白保护 (original dialogue preservation)
 * 7. 旁白与原声冲突检测 (narration / original dialogue conflict detection)
 * 8. Evidence Boundary 校验
 * 9. unsupported claim 拦截阻断
 * 10. source IN/OUT 与 segment duration 合法性
 * 11. 双真实选题 Director Plan E2E
 * 12. VMV adapter consumer contract 校验与 A8 blocker 声明
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FinalDirectorService,
  DirectorEvidenceValidator,
  DirectorValidationError,
  VMVProductionAdapter,
  VMV_PRODUCTION_ORDER_CONTRACT_SCHEMA,
} from "../src/director/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("POC-AGENT A7: Director Final 内容编排与视听门禁综合测试", () => {
  const directorService = new FinalDirectorService();

  // 1. A6 Top3 -> Director selection
  it("1. 正常从 A6 Top3 中选取候选并成功创建 Director Segment", () => {
    const seg = directorService.createSegment({
      segment_id: "test_seg_01",
      beat_id: "beat_probe_01_hook",
      requirement_id: "req_probe_01",
      candidate_id: "cand_req_probe_01_unit_scene_0138_01_1",
      purpose: "开场交代涮肉馆致命饭局",
      visual_reason: "东来顺包厢铜锅前对坐",
      audio_owner: "narration",
      narration_job: "context",
      narration_text: "老周带大家重看第18集这顿饭局。",
      audio_transition: "fade",
      subtitle_mode: "bottom_standard",
    });

    assert.ok(seg);
    assert.strictEqual(seg.segment_id, "test_seg_01");
    assert.strictEqual(seg.selected_candidate_id, "cand_req_probe_01_unit_scene_0138_01_1");
    assert.strictEqual(seg.retrieval_unit_id, "unit_scene_0138_01");
    assert.ok(seg.source_in > 0);
    assert.ok(seg.source_out > seg.source_in);
    assert.strictEqual(seg.planned_duration, Math.round((seg.source_out - seg.source_in) * 1000) / 1000);
  });

  // 2. 禁止 Top3 外镜头
  it("2. 铁律保护：严禁使用 A6 Top3 以外的镜头，否则坚决抛错阻断", () => {
    assert.throws(
      () => {
        directorService.createSegment({
          segment_id: "test_seg_illegal",
          beat_id: "beat_probe_01_hook",
          requirement_id: "req_probe_01",
          candidate_id: "cand_non_existent_or_rank4",
          purpose: "试图偷塞假镜头",
          visual_reason: "假镜头",
          audio_owner: "narration",
          narration_job: "context",
          narration_text: "旁白文本",
          audio_transition: "fade",
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("不在 A6 Top3 允许集合"));
        return true;
      }
    );
  });

  // 3. INSUFFICIENT_EVIDENCE resolution (req_wu_03)
  it("3. 处理 req_wu_03: A6 判定为 INSUFFICIENT_EVIDENCE 时，必须记录显式决议，拒绝伪造假镜头", () => {
    const status = directorService.getRequirementStatus("req_wu_03");
    assert.strictEqual(status.status, "INSUFFICIENT_EVIDENCE", "req_wu_03 在 A6 必须是证据不足");

    // 创建该分段，必须带有 director_resolution 与 resolution_action
    const seg = directorService.createSegment({
      segment_id: "seg_wu_03_resolved",
      beat_id: "beat_wu_03_crisis",
      requirement_id: "req_wu_03",
      candidate_id: "cand_req_wu_03_unit_scene_0059_01_8", // 属于 top3 中被 reject 的候选，作为承接画面
      purpose: "说明档案事实真相并转为心战试探",
      visual_reason: "站长室内两人机密对话",
      audio_owner: "narration",
      narration_job: "context",
      narration_text: "老周必须说明：整部第18集里，并没有李涯在机要室搜查余则成物理档案的镜头。",
      audio_transition: "L_cut",
      director_resolution: "insufficient_evidence",
      resolution_action: "soften",
    });

    assert.strictEqual(seg.director_resolution, "insufficient_evidence");
    assert.strictEqual(seg.resolution_action, "soften");
  });

  // 4. audio_owner 策略与校验
  it("4. audio_owner 枚举校验：非法音频所有权抛错", () => {
    assert.throws(
      () => {
        DirectorEvidenceValidator.validateSegment({
          segment_id: "seg_invalid_audio",
          beat_id: "b1",
          purpose: "p",
          selected_candidate_id: "c1",
          retrieval_unit_id: "u1",
          evidence_id: "e1",
          parent_scene_id: "s1",
          source_in: 10.0,
          source_out: 15.0,
          planned_duration: 5.0,
          visual_reason: "v",
          narration_job: "none",
          audio_owner: "invalid_radio", // 非法
          audio_transition: "hard_cut",
          subtitle_mode: "bottom_standard",
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("无效的 audio_owner"));
        return true;
      }
    );
  });

  // 5. narration_job 与 narration_text 因果依赖
  it("5. Narration Job 先于 Narration Text：none 必须配空旁白，非 none 必须配有效旁白", () => {
    // 5.1 narration_job = none 但配有文案 -> 必须抛错
    assert.throws(
      () => {
        DirectorEvidenceValidator.validateSegment({
          segment_id: "seg_job_none_with_text",
          beat_id: "b1",
          purpose: "p",
          selected_candidate_id: "c1",
          retrieval_unit_id: "u1",
          evidence_id: "e1",
          parent_scene_id: "s1",
          source_in: 10.0,
          source_out: 15.0,
          planned_duration: 5.0,
          visual_reason: "v",
          narration_job: "none",
          audio_owner: "original_dialogue",
          narration_text: "强行配了一段旁白",
          audio_transition: "hard_cut",
          subtitle_mode: "bottom_standard",
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("当 narration_job 为 'none' 时，narration_text 必须为空"));
        return true;
      }
    );

    // 5.2 narration_job = context 但旁白为空 -> 必须抛错
    assert.throws(
      () => {
        DirectorEvidenceValidator.validateSegment({
          segment_id: "seg_job_context_empty_text",
          beat_id: "b1",
          purpose: "p",
          selected_candidate_id: "c1",
          retrieval_unit_id: "u1",
          evidence_id: "e1",
          parent_scene_id: "s1",
          source_in: 10.0,
          source_out: 15.0,
          planned_duration: 5.0,
          visual_reason: "v",
          narration_job: "context",
          audio_owner: "narration",
          narration_text: "   ", // 空白
          audio_transition: "fade",
          subtitle_mode: "bottom_standard",
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("narration_text 必须为非空有效文案"));
        return true;
      }
    );
  });

  // 6. 原声对白保护 (original dialogue preservation)
  it("6. 原声保护：原声极具力量时，narration_job 为 none，保留完整台词", () => {
    const planB = directorService.buildDirectorPlanTopicB();
    const seg2 = planB.segments[1]; // seg_probe_02 谢若林致命摊牌

    assert.strictEqual(seg2.audio_owner, "original_dialogue");
    assert.strictEqual(seg2.narration_job, "none");
    assert.strictEqual(seg2.narration_text, "");
    assert.ok(seg2.original_dialogue_text.includes("你是共党 那我很高兴"));
    assert.strictEqual(seg2.subtitle_mode, "dialogue_highlight");
  });

  // 7. 旁白与原声冲突检测 (narration / original dialogue conflict detection)
  it("7. 音频打架防御：原声主导且有原台词时，若强行上旁白且未使用避让策略 (duck/J_cut/L_cut)，坚决阻断", () => {
    assert.throws(
      () => {
        DirectorEvidenceValidator.validateSegment({
          segment_id: "seg_audio_clash",
          beat_id: "b1",
          purpose: "p",
          selected_candidate_id: "c1",
          retrieval_unit_id: "u1",
          evidence_id: "e1",
          parent_scene_id: "s1",
          source_in: 10.0,
          source_out: 15.0,
          planned_duration: 5.0,
          visual_reason: "v",
          audio_owner: "original_dialogue",
          original_dialogue_text: "重要情报原声台词",
          narration_job: "interpretation",
          narration_text: "老周强行在原声上大声说话",
          audio_transition: "hard_cut", // 硬切未做避让！
          subtitle_mode: "bottom_standard",
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("原声与旁白发生冲突"));
        return true;
      }
    );
  });

  // 8. Evidence Boundary 校验与 Unsupported Claim 拦截阻断
  it("8. 证据边界与 Unsupported Claim 拦截：严禁伪造‘站长已确认余则成是共产党’等违禁伪断言", () => {
    assert.throws(
      () => {
        DirectorEvidenceValidator.validateSegment({
          segment_id: "seg_forbidden_claim",
          beat_id: "b1",
          purpose: "p",
          selected_candidate_id: "c1",
          retrieval_unit_id: "u1",
          evidence_id: "e1",
          parent_scene_id: "s1",
          source_in: 10.0,
          source_out: 15.0,
          planned_duration: 5.0,
          visual_reason: "v",
          audio_owner: "narration",
          narration_job: "interpretation",
          narration_text: "在这个关键时刻，吴站长已确认余则成是共产党，准备实施抓捕。", // 严重违禁伪断言！
          audio_transition: "fade",
          subtitle_mode: "bottom_standard",
          evidence_boundary: {
            strictly_forbidden_claims: ["站长确认余则成是共产党", "吴站长已确认余则成是共产党"],
          },
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("unsupported_claim"));
        return true;
      }
    );
  });

  // 9. 出镜人物未支撑行动拦截
  it("9. 人物一致性拦截：旁白声称李涯拔枪行动，但当前镜头客观无李涯出镜时坚决阻断", () => {
    assert.throws(
      () => {
        DirectorEvidenceValidator.validateSegment({
          segment_id: "seg_unsupported_character",
          beat_id: "b1",
          purpose: "p",
          selected_candidate_id: "c1",
          retrieval_unit_id: "u1",
          evidence_id: "e1",
          parent_scene_id: "s1",
          source_in: 10.0,
          source_out: 15.0,
          planned_duration: 5.0,
          visual_reason: "v",
          audio_owner: "narration",
          narration_job: "interpretation",
          narration_text: "老周注意看细节，李涯走进门突然拔枪对准余则成。",
          audio_transition: "fade",
          subtitle_mode: "bottom_standard",
          characters: ["吴敬中", "余则成"], // 无李涯
          evidence_boundary: {
            characters: ["吴敬中", "余则成"],
          },
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("unsupported_character_action"));
        return true;
      }
    );
  });

  // 10. source IN/OUT 与 segment duration 合法性
  it("10. 时间码合法性：source_in/out 与 planned_duration 不匹配必须抛错", () => {
    assert.throws(
      () => {
        DirectorEvidenceValidator.validateSegment({
          segment_id: "seg_time_mismatch",
          beat_id: "b1",
          purpose: "p",
          selected_candidate_id: "c1",
          retrieval_unit_id: "u1",
          evidence_id: "e1",
          parent_scene_id: "s1",
          source_in: 10.0,
          source_out: 20.0,
          planned_duration: 3.0, // 应当为 10.0
          visual_reason: "v",
          audio_owner: "narration",
          narration_job: "context",
          narration_text: "测试文本",
          audio_transition: "fade",
          subtitle_mode: "bottom_standard",
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("planned_duration"));
        return true;
      }
    );
  });

  // 11. 双真实选题 Director Plan E2E
  it("11. 双真实选题 Director Plan E2E：选题 A 与选题 B 均生成合法合规 Plan", () => {
    const planA = directorService.buildDirectorPlanTopicA();
    assert.ok(planA);
    assert.strictEqual(planA.topic_id, "topic_qf18_wu_suspicion");
    assert.strictEqual(planA.segments.length, 4);
    assert.strictEqual(planA.director_resolution_summary.insufficient_evidence_count, 1);

    const planB = directorService.buildDirectorPlanTopicB();
    assert.ok(planB);
    assert.strictEqual(planB.topic_id, "topic_qf18_dangerous_probe");
    assert.strictEqual(planB.segments.length, 4);
    assert.strictEqual(planB.director_resolution_summary.insufficient_evidence_count, 0);

    // 校验所有 segment 引用的 candidate 严格来自 A6 Top3
    planB.segments.forEach((seg, idx) => {
      const top3 = directorService.getTop3CandidatesForRequirement(seg.requirement_id);
      const isTop3 = top3.some((c) => c.candidate_id === seg.selected_candidate_id);
      assert.ok(isTop3, `选题B 第 ${idx + 1} 段候选必须属于 A6 Top3`);
    });
  });

  // 12. VMV adapter consumer contract 校验与 A8 blocker 声明
  it("12. VMV adapter consumer contract：100% 满足 VMV 消费契约，并诚实将真实运行标为 A8 Blocker", () => {
    const planB = directorService.buildDirectorPlanTopicB();
    const vmvOrder = VMVProductionAdapter.adaptPlanToProductionOrder(planB, {
      orderId: "order_test_contract_b",
    });

    assert.ok(vmvOrder);
    assert.strictEqual(vmvOrder.version, "1.0.0");
    assert.strictEqual(vmvOrder.order_id, "order_test_contract_b");
    assert.strictEqual(vmvOrder.segments.length, 4);

    // 验证段落 2（原声保留）在 VMV 订单中的映射
    const vmvSeg2 = vmvOrder.segments[1];
    assert.strictEqual(vmvSeg2.narration_text, "");
    assert.strictEqual(vmvSeg2.original_audio.preserve, true);
    assert.strictEqual(vmvSeg2.original_audio.volume_percent, 100);

    // 验证段落 3（duck 垫底）在 VMV 订单中的映射
    const vmvSeg3 = vmvOrder.segments[2];
    assert.ok(vmvSeg3.narration_text.length > 0);
    assert.strictEqual(vmvSeg3.original_audio.preserve, true);
    assert.strictEqual(vmvSeg3.original_audio.volume_percent, 25);

    // 验证段落 1（旁白主导）在 VMV 订单中的映射
    const vmvSeg1 = vmvOrder.segments[0];
    assert.ok(vmvSeg1.narration_text.length > 0);
    assert.strictEqual(vmvSeg1.original_audio.preserve, false);
    assert.strictEqual(vmvSeg1.original_audio.volume_percent, 0);

    // 验证 VMV Consumer Contract 兼容性报告
    const report = VMVProductionAdapter.getCompatibilityReport();
    assert.strictEqual(report.contract_status, "PASSED_SCHEMA_VALIDATION");
    assert.strictEqual(report.real_runtime_status, "A8_BLOCKER");
    assert.ok(report.limitations.some((lim) => lim.includes("A8 Blocker")));
  });
});
