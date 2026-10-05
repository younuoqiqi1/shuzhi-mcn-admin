/**
 * @file director-final.test.mjs
 * @description POC-AGENT A7.1: Director Final 内容编排、时长预算与视听门禁综合测试套件。
 * 覆盖：
 * 1. A6 Top3 -> Director selection
 * 2. 铁律：禁止使用 Top3 外镜头
 * 3. A7.1 核心：INSUFFICIENT_EVIDENCE 默认不生成 production segment (merge/drop 决议)
 * 4. audio_owner 策略与枚举校验
 * 5. Narration Job 先于 Narration Text 因果依赖
 * 6. 原声对白保护 (original dialogue preservation)
 * 7. 音频打架防御 (duck/J_cut/L_cut 避让策略)
 * 8. Evidence Boundary 校验与 Unsupported Claim 拦截
 * 9. 出镜人物未支撑行动拦截
 * 10. source IN/OUT 与 segment duration 合法性
 * 11. A7.1 核心：Narration Duration Budget 集中配置与估算
 * 12. A7.1 核心：Duration Overflow 阻止 Plan finalize 且禁止拉高语速强塞
 * 13. A7.1 核心：原声对白完整性防护（严禁截断半句话）
 * 14. A7.1 核心：Topic B 真实选题全部分段 duration_fit = true
 * 15. A7.1 核心：Topic A 真实选题只保留 3 个生产分段且全部 duration_fit = true
 * 16. VMV adapter consumer contract 校验与 A8 blocker 声明
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
  DURATION_BUDGET_CONFIG,
  calculateNarrationBudget,
  countNarrationChars,
} from "../src/director/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("POC-AGENT A7.1: Director Final 内容编排、时长预算与视听门禁综合测试", () => {
  const directorService = new FinalDirectorService();

  // 1. A6 Top3 -> Director selection
  it("1. 正常从 A6 Top3 中选取候选并成功创建 Director Segment", () => {
    const top3 = directorService.getTop3CandidatesForRequirement("req_probe_01");
    const cand = top3[0];
    const seg = directorService.createSegment({
      segment_id: "test_seg_01",
      beat_id: "beat_probe_01_hook",
      requirement_id: "req_probe_01",
      candidate_id: cand.candidate_id,
      purpose: "开场交代涮肉馆致命饭局",
      visual_reason: "东来顺包厢铜锅前对坐",
      audio_owner: "narration",
      narration_job: "context",
      narration_text: "老周重看第18集：余则成最大的危机，正是这顿东来顺涮肉。",
      audio_transition: "fade",
      subtitle_mode: "bottom_standard",
    });

    assert.ok(seg);
    assert.strictEqual(seg.segment_id, "test_seg_01");
    assert.strictEqual(seg.selected_candidate_id, cand.candidate_id);
    assert.strictEqual(seg.retrieval_unit_id, cand.retrieval_unit_id);
    assert.ok(seg.source_in > 0);
    assert.ok(seg.source_out > seg.source_in);
    assert.strictEqual(seg.planned_duration, Math.round((seg.source_out - seg.source_in) * 1000) / 1000);
    assert.strictEqual(seg.duration_fit, true);
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

  // 3. A7.1 核心：INSUFFICIENT_EVIDENCE 默认不生成 production segment (merge/drop 决议)
  it("3. A7.1 核心：INSUFFICIENT_EVIDENCE 需求默认严禁创建生产 Segment，必须执行 merge/drop", () => {
    const status = directorService.getRequirementStatus("req_wu_03");
    assert.strictEqual(status.status, "INSUFFICIENT_EVIDENCE", "req_wu_03 在 A6 必须是证据不足");

    // 3.1 尝试直接创建生产 Segment 必须被阻断
    assert.throws(
      () => {
        directorService.createSegment({
          segment_id: "seg_wu_03_illegal_prod",
          beat_id: "beat_wu_03_crisis",
          requirement_id: "req_wu_03",
          candidate_id: "cand_req_wu_03_unit_scene_0059_01_8",
          purpose: "强行上线生产分段",
          visual_reason: "强行顶替",
          audio_owner: "narration",
          narration_job: "context",
          narration_text: "老周强行在成片解释没有镜头",
          audio_transition: "fade",
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("INSUFFICIENT_EVIDENCE"));
        assert.ok(err.message.includes("默认不得创建对应生产 Segment"));
        return true;
      }
    );

    // 3.2 校验整个 Plan 中若包含了 INSUFFICIENT_EVIDENCE 的虚假生产分段，validatePlan 必须阻断
    assert.throws(
      () => {
        DirectorEvidenceValidator.validatePlan({
          director_plan_id: "plan_bad",
          topic_id: "t1",
          blogger_id: "b1",
          target_duration: 10.0,
          director_resolution_summary: {
            insufficient_evidence_count: 1,
            resolutions: [
              {
                requirement_id: "req_wu_03",
                status: "INSUFFICIENT_EVIDENCE",
                resolution_action: "merge",
                production_segment_created: true, // 违规设为 true
              },
            ],
          },
          segments: [
            {
              segment_id: "s1",
              beat_id: "b1",
              requirement_id: "req_wu_03", // 违规包含
              purpose: "p",
              selected_candidate_id: "c1",
              retrieval_unit_id: "u1",
              evidence_id: "e1",
              parent_scene_id: "sc1",
              source_in: 0,
              source_out: 10,
              planned_duration: 10,
              visual_reason: "v",
              narration_job: "none",
              audio_owner: "narration",
              audio_transition: "fade",
              subtitle_mode: "bottom_standard",
              duration_fit: true,
            },
          ],
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("production_segment_created 设为 false"));
        return true;
      }
    );
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
          duration_fit: true,
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("无效的 audio_owner"));
        return true;
      }
    );
  });

  // 5. Narration Job 先于 Narration Text 因果依赖
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
          duration_fit: true,
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
          narration_text: "   ",
          audio_transition: "fade",
          subtitle_mode: "bottom_standard",
          duration_fit: true,
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
    assert.ok(
      seg2.original_dialogue_text.includes("你是共党 那我很高兴") ||
      seg2.original_dialogue_text.includes("两根金条")
    );
    assert.strictEqual(seg2.subtitle_mode, "dialogue_highlight");
    assert.strictEqual(seg2.duration_fit, true);
  });

  // 7. 音频打架防御 (duck/J_cut/L_cut 避让策略)
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
          duration_fit: true,
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("原声与旁白发生冲突"));
        return true;
      }
    );
  });

  // 8. Evidence Boundary 校验与 Unsupported Claim 拦截
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
          narration_text: "在这个关键时刻，吴站长已确认余则成是共产党，准备实施抓捕。",
          audio_transition: "fade",
          subtitle_mode: "bottom_standard",
          duration_fit: true,
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
          duration_fit: true,
          characters: ["吴敬中", "余则成"],
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
          duration_fit: true,
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("planned_duration"));
        return true;
      }
    );
  });

  // 11. A7.1 核心：Narration Duration Budget 集中配置与估算
  it("11. A7.1 核心：集中配置语速与余量，计算旁白时长预算，严禁散落 magic number", () => {
    assert.strictEqual(typeof DURATION_BUDGET_CONFIG.estimated_chars_per_second, "number");
    assert.ok(DURATION_BUDGET_CONFIG.estimated_chars_per_second >= 3.5 && DURATION_BUDGET_CONFIG.estimated_chars_per_second <= 4.5);
    assert.ok(DURATION_BUDGET_CONFIG.audio_headroom_sec >= 0.3);

    const budget = calculateNarrationBudget({
      narration_text: "老周重看第18集：东来顺这顿涮肉暗藏杀机。",
      audio_owner: "narration",
      planned_duration: 8.0,
    });

    assert.strictEqual(budget.narration_char_count, 21);
    // 21 字 / 4.0 = 5.25s
    assert.strictEqual(budget.estimated_tts_duration_sec, 5.25);
    // 8.0s - 0.5s = 7.5s 可用
    assert.strictEqual(budget.available_narration_duration_sec, 7.5);
    assert.strictEqual(budget.duration_fit, true);
    assert.strictEqual(budget.duration_overflow_sec, 0.0);
  });

  // 12. A7.1 核心：Duration Overflow 阻止 Plan finalize 且禁止拉高语速强塞
  it("12. A7.1 核心：旁白时长超出可用预算时，duration_fit 必须为 false，坚决阻止 Plan finalize", () => {
    const budgetOverflow = calculateNarrationBudget({
      narration_text: "这是一段特别长特别啰嗦的旁白，在短短的三秒镜头里根本不可能说得完，不管怎么念都必然会溢出严重超时严重违背镜头规律！",
      audio_owner: "narration",
      planned_duration: 3.0, // 只有 3 秒！
    });

    assert.strictEqual(budgetOverflow.duration_fit, false);
    assert.ok(budgetOverflow.duration_overflow_sec > 5.0);

    // 校验器阻断
    assert.throws(
      () => {
        DirectorEvidenceValidator.validateSegment({
          segment_id: "seg_overflow",
          beat_id: "b1",
          purpose: "p",
          selected_candidate_id: "c1",
          retrieval_unit_id: "u1",
          evidence_id: "e1",
          parent_scene_id: "s1",
          source_in: 0.0,
          source_out: 3.0,
          planned_duration: 3.0,
          visual_reason: "v",
          audio_owner: "narration",
          narration_job: "context",
          narration_text: "这是一段特别长特别啰嗦的旁白，在短短的三秒镜头里根本不可能说得完！",
          audio_transition: "fade",
          subtitle_mode: "bottom_standard",
          duration_fit: false,
          duration_overflow_sec: 5.2,
          estimated_tts_duration_sec: 7.7,
          available_narration_duration_sec: 2.5,
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("duration_overflow"));
        return true;
      }
    );
  });

  // 13. A7.1 核心：原声对白完整性防护（严禁截断半句话）
  it("13. A7.1 核心：原声对白时长不足时触发 dialogue_truncation 报警保护", () => {
    assert.throws(
      () => {
        DirectorEvidenceValidator.validateSegment({
          segment_id: "seg_cut_dialogue",
          beat_id: "b1",
          purpose: "p",
          selected_candidate_id: "c1",
          retrieval_unit_id: "u1",
          evidence_id: "e1",
          parent_scene_id: "s1",
          source_in: 0.0,
          source_out: 1.5,
          planned_duration: 1.5, // 仅 1.5 秒
          visual_reason: "v",
          audio_owner: "original_dialogue",
          narration_job: "none",
          original_dialogue_text: "这第一呀重要的情报没人向上汇报这第二啊你是共党那我很高兴这第三呢", // 35字，需约7秒
          audio_transition: "hard_cut",
          subtitle_mode: "dialogue_highlight",
          duration_fit: true,
        });
      },
      (err) => {
        assert.ok(err instanceof DirectorValidationError);
        assert.ok(err.message.includes("dialogue_truncation"));
        assert.ok(err.message.includes("存在截断半句话风险"));
        return true;
      }
    );
  });

  // 14. A7.1 核心：Topic B 真实选题全部分段 duration_fit = true
  it("14. A7.1 核心：Topic B 真实选题每个 Segment 均证明可说完全部文案 (duration_fit = true)", () => {
    const planB = directorService.buildDirectorPlanTopicB();
    assert.ok(planB);
    assert.strictEqual(planB.topic_id, "topic_qf18_dangerous_probe");
    assert.strictEqual(planB.segments.length, 4);
    assert.strictEqual(planB.duration_budget_summary.all_segments_fit, true);

    planB.segments.forEach((seg, idx) => {
      assert.strictEqual(seg.duration_fit, true, `Topic B 第 ${idx + 1} 段 (${seg.segment_id}) 必须 duration_fit = true`);
      assert.ok(seg.estimated_tts_duration_sec <= seg.available_narration_duration_sec + 0.05);
      assert.strictEqual(seg.duration_overflow_sec, 0.0);
    });
  });

  // 15. A7.1 核心：Topic A 真实选题只保留 3 个生产分段且全部 duration_fit = true
  it("15. A7.1 核心：Topic A 真实选题只生成 3 个真实生产分段，正确执行 merge 且全量 duration_fit = true", () => {
    const planA = directorService.buildDirectorPlanTopicA();
    assert.ok(planA);
    assert.strictEqual(planA.topic_id, "topic_qf18_wu_suspicion");
    assert.strictEqual(planA.segments.length, 3, "Topic A 必须仅有 3 个真实生产分段，绝不为 req_wu_03 伪造分段");
    assert.strictEqual(planA.director_resolution_summary.insufficient_evidence_count, 1);

    const res = planA.director_resolution_summary.resolutions[0];
    assert.strictEqual(res.requirement_id, "req_wu_03");
    assert.strictEqual(res.resolution_action, "merge");
    assert.strictEqual(res.production_segment_created, false);
    assert.strictEqual(res.merged_into_beat_id, "beat_wu_04_conclusion");

    // 确认 segments 列表中绝无 req_wu_03
    assert.strictEqual(planA.segments.some((s) => s.requirement_id === "req_wu_03"), false);

    // 确认剩余 3 个分段全部 duration_fit = true
    planA.segments.forEach((seg, idx) => {
      assert.strictEqual(seg.duration_fit, true, `Topic A 第 ${idx + 1} 段 (${seg.segment_id}) 必须 duration_fit = true`);
      assert.ok(seg.estimated_tts_duration_sec <= seg.available_narration_duration_sec + 0.05);
      assert.strictEqual(seg.duration_overflow_sec, 0.0);
    });
  });

  // 16. VMV adapter consumer contract 校验与 A8 blocker 声明
  it("16. VMV adapter consumer contract：保留 duration budget 元数据并诚实将真实运行标为 A8 Blocker", () => {
    const planB = directorService.buildDirectorPlanTopicB();
    const vmvOrder = VMVProductionAdapter.adaptPlanToProductionOrder(planB, {
      orderId: "order_test_contract_b",
    });

    assert.ok(vmvOrder);
    assert.strictEqual(vmvOrder.version, "1.0.0");
    assert.strictEqual(vmvOrder.order_id, "order_test_contract_b");
    assert.strictEqual(vmvOrder.segments.length, 4);

    // 检查 metadata 中的 duration_budget
    vmvOrder.segments.forEach((seg, idx) => {
      assert.ok(seg.metadata.duration_budget, `分段 ${idx + 1} 必须包含 duration_budget 元数据`);
      assert.strictEqual(seg.metadata.duration_budget.duration_fit, true);
    });

    // 验证 VMV Consumer Contract 兼容性报告
    const report = VMVProductionAdapter.getCompatibilityReport();
    assert.strictEqual(report.contract_status, "PASSED_SCHEMA_VALIDATION");
    assert.strictEqual(report.real_runtime_status, "A8_BLOCKER");
    assert.ok(report.limitations.some((lim) => lim.includes("A8 Blocker")));
  });
});
