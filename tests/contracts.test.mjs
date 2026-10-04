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

test("MaterialRequirement validator: checks action cue and emotional tone", () => {
  qianfuMaterialRequirementsFixture.forEach((req) => {
    assert.ok(validateMaterialRequirement(req));
    assert.ok(validate("MaterialRequirement", req));
  });

  assert.throws(
    () => validateMaterialRequirement({ ...qianfuMaterialRequirementsFixture[0], action_cue: "" }),
    ValidationError
  );
  assert.throws(
    () => validateMaterialRequirement({ ...qianfuMaterialRequirementsFixture[0], emotional_tone: "" }),
    ValidationError
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

  assert.equal(job.status, JOB_STATES.DRAFTING);
  assert.equal(job.progress_percent, 5);
  assert.equal(job.history.length, 1);
  assert.ok(validateProductionJob(job));

  // 1. drafting -> scripting
  job = transitionJob(job, JOB_STATES.SCRIPTING, {
    reason: "Completed topic & viewpoint ideation",
    payloadUpdate: { beats: qianfuStoryBeatsFixture },
  });
  assert.equal(job.status, JOB_STATES.SCRIPTING);
  assert.equal(job.progress_percent, 15);

  // 2. scripting -> awaiting_script_review
  job = transitionJob(job, JOB_STATES.AWAITING_SCRIPT_REVIEW, {
    reason: "Submitted beats and material requirements for human review",
    payloadUpdate: { requirements: qianfuMaterialRequirementsFixture },
  });
  assert.equal(job.status, JOB_STATES.AWAITING_SCRIPT_REVIEW);
  assert.equal(job.progress_percent, 30);

  // 3. awaiting_script_review -> retrieving
  job = transitionJob(job, JOB_STATES.RETRIEVING, {
    reason: "Human operator approved script beats",
  });
  assert.equal(job.status, JOB_STATES.RETRIEVING);
  assert.equal(job.progress_percent, 45);

  // 4. retrieving -> perspective_reading
  job = transitionJob(job, JOB_STATES.PERSPECTIVE_READING, {
    reason: "Retrieved top-3 candidates for all beats",
    payloadUpdate: { candidates: qianfuCandidatesFixture },
  });
  assert.equal(job.status, JOB_STATES.PERSPECTIVE_READING);
  assert.equal(job.progress_percent, 60);

  // 5. perspective_reading -> directing
  job = transitionJob(job, JOB_STATES.DIRECTING, {
    reason: "Finished perspective re-reading",
    payloadUpdate: { perspective_readings: qianfuPerspectiveReadingsFixture },
  });
  assert.equal(job.status, JOB_STATES.DIRECTING);
  assert.equal(job.progress_percent, 75);

  // 6. directing -> awaiting_director_review
  job = transitionJob(job, JOB_STATES.AWAITING_DIRECTOR_REVIEW, {
    reason: "Director Plan synthesized from real evidence",
    payloadUpdate: { director_plan: qianfuDirectorPlanFixture },
  });
  assert.equal(job.status, JOB_STATES.AWAITING_DIRECTOR_REVIEW);
  assert.equal(job.progress_percent, 85);

  // 7. awaiting_director_review -> vmv_producing
  job = transitionJob(job, JOB_STATES.VMV_PRODUCING, {
    reason: "Director Plan approved for render",
  });
  assert.equal(job.status, JOB_STATES.VMV_PRODUCING);
  assert.equal(job.progress_percent, 95);

  // 8. vmv_producing -> completed
  job = transitionJob(job, JOB_STATES.COMPLETED, {
    reason: "Rendered 1080p MP4 successfully and registered into library",
    payloadUpdate: { output_mp4: "outputs/stage5/final_video.mp4" },
  });
  assert.equal(job.status, JOB_STATES.COMPLETED);
  assert.equal(job.progress_percent, 100);
  assert.equal(job.history.length, 9);
});

test("JobStateMachine: supports review rejection and loops back gracefully", () => {
  let job = createProductionJob({
    jobId: "job-loop-001",
    topicId: "t1",
    bloggerId: "b1",
  });

  job = transitionJob(job, JOB_STATES.SCRIPTING);
  job = transitionJob(job, JOB_STATES.AWAITING_SCRIPT_REVIEW);

  // 人工打回要求重修 beats
  job = transitionJob(job, JOB_STATES.SCRIPTING, { reason: "Script rejected for rewrite" });
  assert.equal(job.status, JOB_STATES.SCRIPTING);

  // 再次提审并通过
  job = transitionJob(job, JOB_STATES.AWAITING_SCRIPT_REVIEW);
  job = transitionJob(job, JOB_STATES.RETRIEVING);
  assert.equal(job.status, JOB_STATES.RETRIEVING);
});

test("JobStateMachine: rejects illegal state transitions strictly", () => {
  const job = createProductionJob({
    jobId: "job-illegal-001",
    topicId: "t1",
    bloggerId: "b1",
  });

  // 企图从 drafting 直接跳到 vmv_producing
  assert.throws(
    () => transitionJob(job, JOB_STATES.VMV_PRODUCING),
    (err) => {
      assert.ok(err instanceof InvalidStateTransitionError);
      assert.match(err.message, /无法从 'drafting' 跃迁至 'vmv_producing'/);
      assert.deepEqual(err.allowedStates, [JOB_STATES.SCRIPTING, JOB_STATES.CANCELLED]);
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
    () => transitionJob(completedJob, JOB_STATES.SCRIPTING),
    /无法从 'completed' 跃迁至 'scripting'/
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
