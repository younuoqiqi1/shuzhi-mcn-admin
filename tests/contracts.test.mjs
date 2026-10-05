/**
 * @file contracts.test.mjs
 * @description POC-AGENT A1: 跨模块数据契约、Schema校验、Job状态机与VMV适配器全量自动化测试
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  validatePersona,
  validateTopic,
  validateCoreViewpoint,
  validateStoryBeat,
  validateMaterialRequirement,
  validateCandidate,
  validatePerspectiveReading,
  validateDirectorPlan,
  validateProductionJob,
  parseTimecodeToSeconds,
  ValidationError,
  validate,
} from "../src/contracts/validators.mjs";
import { validateObjectiveEvidence } from "../src/evidence/objective-evidence.mjs";

import {
  JOB_STATES,
  ALLOWED_TRANSITIONS,
  InvalidStateTransitionError,
  createProductionJob,
  transitionJob,
} from "../src/contracts/job-state-machine.mjs";

import {
  mapDirectorPlanToVMVProductionOrder,
  validateVMVProductionOrder,
} from "../src/contracts/vmv-adapter.mjs";

import {
  laozhouPersonaFixture,
  qianfuTopicFixture,
  qianfuCoreViewpointFixture,
  qianfuStoryBeatsFixture,
  qianfuMaterialRequirementsFixture,
  qianfuCandidatesFixture,
  qianfuPerspectiveReadingsFixture,
  qianfuDirectorPlanFixture,
} from "../src/fixtures/laozhou-qianfu-fixture.mjs";

// ==========================================
// 1. 时间码解析与工具校验测试
// ==========================================
test("parseTimecodeToSeconds accurately converts timecode to float seconds", () => {
  assert.equal(parseTimecodeToSeconds("00:00:00.000"), 0);
  assert.equal(parseTimecodeToSeconds("00:01:00.000"), 60);
  assert.equal(parseTimecodeToSeconds("01:00:00.000"), 3600);
  assert.equal(parseTimecodeToSeconds("00:08:14.200"), 494.2);
  assert.throws(() => parseTimecodeToSeconds("08:14"), /无效的时间码格式/);
  assert.throws(() => parseTimecodeToSeconds("invalid"), /无效的时间码格式/);
});

// ==========================================
// 2. 9 大核心 Schema 校验器测试 (正向与逆向)
// ==========================================
test("Persona validator: accepts valid fixture and rejects invalid inputs", () => {
  assert.ok(validatePersona(laozhouPersonaFixture));
  assert.ok(validate("Persona", laozhouPersonaFixture));

  // 缺少必填字段 id
  assert.throws(() => validatePersona({ ...laozhouPersonaFixture, id: "" }), ValidationError);
  // 缺少 voice_config
  assert.throws(() => validatePersona({ ...laozhouPersonaFixture, voice_config: null }), ValidationError);
  // 非法 speech_rate
  assert.throws(
    () =>
      validatePersona({
        ...laozhouPersonaFixture,
        voice_config: { ...laozhouPersonaFixture.voice_config, speech_rate: -1 },
      }),
    ValidationError
  );
});

test("Topic validator: validates aspect ratio and duration bounds", () => {
  assert.ok(validateTopic(qianfuTopicFixture));
  assert.ok(validate("Topic", qianfuTopicFixture));

  // 非法画幅比例
  assert.throws(() => validateTopic({ ...qianfuTopicFixture, aspect_ratio: "4:3" }), ValidationError);
  // 目标时长必须大于 0
  assert.throws(() => validateTopic({ ...qianfuTopicFixture, target_duration_sec: 0 }), ValidationError);
});

test("CoreViewpoint validator: enforces thesis, hook, and takeaway", () => {
  assert.ok(validateCoreViewpoint(qianfuCoreViewpointFixture));
  assert.ok(validate("CoreViewpoint", qianfuCoreViewpointFixture));

  assert.throws(() => validateCoreViewpoint({ ...qianfuCoreViewpointFixture, thesis: "   " }), ValidationError);
  assert.throws(() => validateCoreViewpoint({ ...qianfuCoreViewpointFixture, hook: "" }), ValidationError);
});

test("StoryBeat validator: ensures positive order index and duration", () => {
  qianfuStoryBeatsFixture.forEach((beat) => {
    assert.ok(validateStoryBeat(beat));
    assert.ok(validate("StoryBeat", beat));
  });

  assert.throws(
    () => validateStoryBeat({ ...qianfuStoryBeatsFixture[0], order: 0 }),
    /必须为大于等于 1 的正整数/
  );
  assert.throws(
    () => validateStoryBeat({ ...qianfuStoryBeatsFixture[0], target_duration_sec: -5 }),
    ValidationError
  );
});

test("MaterialRequirement validator: checks desired action and desired emotion semantics", () => {
  qianfuMaterialRequirementsFixture.forEach((req) => {
    assert.ok(validateMaterialRequirement(req));
    assert.ok(validate("MaterialRequirement", req));
  });

  assert.throws(
    () => validateMaterialRequirement({ ...qianfuMaterialRequirementsFixture[0], desired_action: "" }),
    ValidationError
  );
  assert.throws(
    () => validateMaterialRequirement({ ...qianfuMaterialRequirementsFixture[0], desired_emotion: "" }),
    ValidationError
  );
});

test("MaterialRequirement anti-masquerade: strictly cannot be ingested as L1 Objective Evidence", () => {
  const req = qianfuMaterialRequirementsFixture[0];
  // MaterialRequirement 表达的是期望证据诉求 (desired/evidence_need)，绝不能伪装为客观素材事实 (L1 Evidence)
  assert.throws(
    () => validateObjectiveEvidence(req),
    (err) => {
      // 必须明确被 L1 校验器拦截拒绝（缺少证据事实物理字段，或包含主观诉求关键词）
      assert.ok(err instanceof Error);
      assert.match(err.message, /(ObjectiveEvidence 缺失必填字段|L1 只允许存放客观事实)/);
      return true;
    }
  );
});

test("Candidate validator: validates timecode order, duration match, and layers", () => {
  qianfuCandidatesFixture.forEach((cand) => {
    assert.ok(validateCandidate(cand));
    assert.ok(validate("Candidate", cand));
  });

  // 出点小于入点 (out <= in)
  const invalidRange = {
    ...qianfuCandidatesFixture[0],
    timecode: {
      in: "00:08:20.000",
      out: "00:08:10.000",
      duration_sec: 10.0,
    },
  };
  assert.throws(() => validateCandidate(invalidRange), /出点时间码 .* 必须大于入点时间码/);

  // 指定时长与时间码计算值矛盾
  const mismatchedDuration = {
    ...qianfuCandidatesFixture[0],
    timecode: {
      in: "00:08:10.000",
      out: "00:08:20.000",
      duration_sec: 5.0, // 实际为 10.0s
    },
  };
  assert.throws(() => validateCandidate(mismatchedDuration), /不一致/);
});

test("PerspectiveReading validator: validates subjective interpretation and audio strategy", () => {
  qianfuPerspectiveReadingsFixture.forEach((reading) => {
    assert.ok(validatePerspectiveReading(reading));
    assert.ok(validate("PerspectiveReading", reading));
  });

  assert.throws(
    () => validatePerspectiveReading({ ...qianfuPerspectiveReadingsFixture[0], subjective_interpretation: "" }),
    ValidationError
  );
  assert.throws(
    () => validatePerspectiveReading({ ...qianfuPerspectiveReadingsFixture[0], original_audio_strategy: null }),
    ValidationError
  );
});

test("DirectorPlan validator: checks shots array, timecode integrity, and narration", () => {
  assert.ok(validateDirectorPlan(qianfuDirectorPlanFixture));
  assert.ok(validate("DirectorPlan", qianfuDirectorPlanFixture));

  // shots 为空数组
  assert.throws(() => validateDirectorPlan({ ...qianfuDirectorPlanFixture, shots: [] }), ValidationError);

  // 某个 shot 缺失台词文本
  const badShot = {
    ...qianfuDirectorPlanFixture,
    shots: [
      {
        ...qianfuDirectorPlanFixture.shots[0],
        narration: { text: "" },
      },
    ],
  };
  assert.throws(() => validateDirectorPlan(badShot), ValidationError);
});

// ==========================================
// 3. Job 状态机流转与边界测试
// ==========================================
test("JobStateMachine: creates initial job and advances through complete Topic-first lifecycle", () => {
  let job = createProductionJob({
    jobId: "job-test-001",
    topicId: qianfuTopicFixture.id,
    bloggerId: laozhouPersonaFixture.id,
    initialPayload: { topic: qianfuTopicFixture },
  });

  assert.equal(job.status, JOB_STATES.IDEATING);
  assert.equal(job.progress_percent, 15);
  assert.equal(job.history.length, 1);
  assert.ok(validateProductionJob(job));

  // 1. ideating -> awaiting_direction_review (完成 Topic/Viewpoint/Beats/Material Requirements，提交真人方向审核)
  job = transitionJob(job, JOB_STATES.AWAITING_DIRECTION_REVIEW, {
    reason: "Submitted topic direction, beats and material requirements for human review",
    payloadUpdate: {
      beats: qianfuStoryBeatsFixture,
      requirements: qianfuMaterialRequirementsFixture,
    },
  });
  assert.equal(job.status, JOB_STATES.AWAITING_DIRECTION_REVIEW);
  assert.equal(job.progress_percent, 30);

  // 2. awaiting_direction_review -> retrieving (真人审核通过选题方向与素材诉求，正式进入客观证据库检索)
  job = transitionJob(job, JOB_STATES.RETRIEVING, {
    reason: "Human operator approved direction and material requirements",
  });
  assert.equal(job.status, JOB_STATES.RETRIEVING);
  assert.equal(job.progress_percent, 45);

  // 3. retrieving -> perspective_reading
  job = transitionJob(job, JOB_STATES.PERSPECTIVE_READING, {
    reason: "Retrieved top-3 candidates for all beats",
    payloadUpdate: { candidates: qianfuCandidatesFixture },
  });
  assert.equal(job.status, JOB_STATES.PERSPECTIVE_READING);
  assert.equal(job.progress_percent, 60);

  // 4. perspective_reading -> directing
  job = transitionJob(job, JOB_STATES.DIRECTING, {
    reason: "Finished perspective re-reading",
    payloadUpdate: { perspective_readings: qianfuPerspectiveReadingsFixture },
  });
  assert.equal(job.status, JOB_STATES.DIRECTING);
  assert.equal(job.progress_percent, 75);

  // 5. directing -> awaiting_final_plan_review (导演基于真实证据完成最终分镜与生产计划，挂起等待最终生产审核)
  job = transitionJob(job, JOB_STATES.AWAITING_FINAL_PLAN_REVIEW, {
    reason: "Director Plan synthesized from real evidence",
    payloadUpdate: { director_plan: qianfuDirectorPlanFixture },
  });
  assert.equal(job.status, JOB_STATES.AWAITING_FINAL_PLAN_REVIEW);
  assert.equal(job.progress_percent, 85);

  // 6. awaiting_final_plan_review -> vmv_producing
  job = transitionJob(job, JOB_STATES.VMV_PRODUCING, {
    reason: "Director Plan approved for render",
  });
  assert.equal(job.status, JOB_STATES.VMV_PRODUCING);
  assert.equal(job.progress_percent, 95);

  // 7. vmv_producing -> completed
  job = transitionJob(job, JOB_STATES.COMPLETED, {
    reason: "Rendered 1080p MP4 successfully and registered into library",
    payloadUpdate: { output_mp4: "outputs/stage5/final_video.mp4" },
  });
  assert.equal(job.status, JOB_STATES.COMPLETED);
  assert.equal(job.progress_percent, 100);
  assert.equal(job.history.length, 8);
});

test("JobStateMachine: supports review rejection and loops back gracefully", () => {
  let job = createProductionJob({
    jobId: "job-loop-001",
    topicId: "t1",
    bloggerId: "b1",
  });

  job = transitionJob(job, JOB_STATES.AWAITING_DIRECTION_REVIEW);

  // 人工打回要求重修选题方向与需求
  job = transitionJob(job, JOB_STATES.IDEATING, { reason: "Direction rejected for revision" });
  assert.equal(job.status, JOB_STATES.IDEATING);

  // 再次提审并通过
  job = transitionJob(job, JOB_STATES.AWAITING_DIRECTION_REVIEW);
  job = transitionJob(job, JOB_STATES.RETRIEVING);
  assert.equal(job.status, JOB_STATES.RETRIEVING);
});

test("JobStateMachine: rejects illegal state transitions strictly", () => {
  const job = createProductionJob({
    jobId: "job-illegal-001",
    topicId: "t1",
    bloggerId: "b1",
  });

  // 企图从 ideating 直接跳到 vmv_producing
  assert.throws(
    () => transitionJob(job, JOB_STATES.VMV_PRODUCING),
    (err) => {
      assert.ok(err instanceof InvalidStateTransitionError);
      assert.match(err.message, /无法从 'ideating' 跃迁至 'vmv_producing'/);
      assert.deepEqual(err.allowedStates, [JOB_STATES.AWAITING_DIRECTION_REVIEW, JOB_STATES.FAILED, JOB_STATES.CANCELLED]);
      return true;
    }
  );

  // 企图从 completed 终态再次跳转
  const completedJob = {
    ...job,
    status: JOB_STATES.COMPLETED,
    progress_percent: 100,
  };
  assert.throws(
    () => transitionJob(completedJob, JOB_STATES.IDEATING),
    /无法从 'completed' 跃迁至 'ideating'/
  );
});

// ==========================================
// 4. VMV Stage 4/5 生产单映射适配器测试
// ==========================================
test("VMV Adapter: transforms DirectorPlan to compliant Stage 4/5 Production Order", () => {
  const order = mapDirectorPlanToVMVProductionOrder(qianfuDirectorPlanFixture, {
    orderId: "order-test-qf-001",
  });

  assert.ok(validateVMVProductionOrder(order));
  assert.equal(order.version, "1.0.0");
  assert.equal(order.order_id, "order-test-qf-001");
  assert.equal(order.plan_id, qianfuDirectorPlanFixture.plan_id);
  assert.equal(order.topic_id, qianfuDirectorPlanFixture.topic_id);
  assert.equal(order.blogger_id, qianfuDirectorPlanFixture.blogger_id);

  // 16:9 画幅映射验证
  assert.equal(order.target_format.resolution, "1920x1080");
  assert.equal(order.target_format.aspect_ratio, "16:9");
  assert.equal(order.target_format.format, "mp4");
  assert.equal(order.target_format.burn_subtitles, true);

  // 配音参数映射验证
  assert.equal(order.audio_track.provider, "aliyun");
  assert.equal(order.audio_track.voice_id, "zh-laozhou-calm");
  assert.equal(order.audio_track.speech_rate, 1.05);

  // 分段数量与内容一致性验证
  assert.equal(order.segments.length, qianfuDirectorPlanFixture.shots.length);

  // 检查首个分段
  const seg1 = order.segments[0];
  assert.equal(seg1.segment_index, 1);
  assert.equal(seg1.beat_id, "beat-01");
  assert.equal(seg1.narration_text, "高手向上汇报，第一句话永远不在嘴上，而在这杯茶的轻重里。");
  assert.equal(seg1.narration_delay_sec, 1.3);
  assert.equal(seg1.clip.media_id, "qianfu_ep01");
  assert.equal(seg1.clip.scene_id, "scene_0042");
  assert.equal(seg1.clip.in_timecode, "00:08:14.200");
  assert.equal(seg1.clip.out_timecode, "00:08:18.700");
  assert.equal(seg1.clip.duration_sec, 4.5);
  assert.equal(seg1.original_audio.preserve, true);
  assert.equal(seg1.original_audio.volume_percent, 100);
  assert.equal(seg1.original_audio.time_range, "00:08:14.200 - 00:08:15.500");

  // 检查竖屏转换 (9:16)
  const verticalPlan = {
    ...qianfuDirectorPlanFixture,
    aspect_ratio: "9:16",
  };
  const verticalOrder = mapDirectorPlanToVMVProductionOrder(verticalPlan);
  assert.equal(verticalOrder.target_format.resolution, "1080x1920");
  assert.equal(verticalOrder.target_format.aspect_ratio, "9:16");
});
