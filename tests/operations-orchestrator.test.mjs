/**
 * @file operations-orchestrator.test.mjs
 * @description POC-AGENT A4: Topic-First 运营任务编排与多轮修订历史测试套件
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  OperationsOrchestrator,
  OrchestratorError,
} from "../src/operations/operations-orchestrator.mjs";
import { JOB_STATES } from "../src/contracts/job-state-machine.mjs";
import { laozhouPersonaFixture } from "../src/fixtures/laozhou-qianfu-fixture.mjs";

test("OperationsOrchestrator: initiates structured topic and viewpoint from operator intent", () => {
  const intent = "想做吴站长什么时候开始怀疑余则成";
  const job = OperationsOrchestrator.initiateJobFromIntent({
    persona: laozhouPersonaFixture,
    operatorIntent: intent,
    sourceMediaId: "qianfu_ep18_720p_25fps",
  });

  assert.equal(job.status, JOB_STATES.DRAFTING);
  assert.equal(job.blogger_id, laozhouPersonaFixture.id);
  assert.ok(job.payload.topic.id);
  assert.equal(job.payload.core_viewpoint.version, 1);
  assert.ok(job.payload.core_viewpoint.thesis.includes(laozhouPersonaFixture.name));
  assert.equal(job.payload.revisions.length, 0);
});

test("OperationsOrchestrator: preserves revision history when operator revises viewpoint without creating new task", () => {
  const originalIntent = "想做吴站长什么时候开始怀疑余则成";
  let job = OperationsOrchestrator.initiateJobFromIntent({
    persona: laozhouPersonaFixture,
    operatorIntent: originalIntent,
    sourceMediaId: "qianfu_ep18_720p_25fps",
    topicDefaults: {
      thesis: "吴站长早在第3集就通过录音笔彻底看穿了余则成，之后全是在演戏。",
    },
  });

  const originalJobId = job.job_id;
  assert.equal(job.payload.core_viewpoint.version, 1);
  const v1Thesis = job.payload.core_viewpoint.thesis;

  // 模拟真人运营反馈："这个结论太绝对了，收一点。"
  const feedback = "这个结论太绝对了，收一点。";
  job = OperationsOrchestrator.reviseCoreViewpoint(job, {
    feedback,
    revisedFields: {
      thesis: "吴站长在第3集产生了第一道怀疑线索，但老狐狸始终在试探与制衡之间拿捏分寸。",
      takeaway: "在复杂上级面前，即使露出一丝破绽，也不要慌张，利用利益共同体维持脆弱平衡。",
    },
  });

  // 核心断言 1：同一个 Job ID 保持不变，绝不新建一条无关任务！
  assert.equal(job.job_id, originalJobId);

  // 核心断言 2：版本号递增至 2
  assert.equal(job.payload.core_viewpoint.version, 2);
  assert.equal(
    job.payload.core_viewpoint.thesis,
    "吴站长在第3集产生了第一道怀疑线索，但老狐狸始终在试探与制衡之间拿捏分寸。"
  );

  // 核心断言 3：revisions 中完整保留修订记录与真人反馈
  assert.equal(job.payload.revisions.length, 1);
  const rev = job.payload.revisions[0];
  assert.equal(rev.target, "core_viewpoint");
  assert.equal(rev.version, 2);
  assert.equal(rev.operator_feedback, feedback);
  assert.equal(rev.previous_value.thesis, v1Thesis);
  assert.equal(rev.updated_value.thesis, job.payload.core_viewpoint.thesis);

  // 核心断言 4：状态机 history 中记录了流转原因
  const lastHistory = job.history[job.history.length - 1];
  assert.ok(lastHistory.reason.includes("Core Viewpoint 修订至 v2"));
});

test("OperationsOrchestrator: Story Beats expresses narrative intent without locking physical evidence", () => {
  let job = OperationsOrchestrator.initiateJobFromIntent({
    persona: laozhouPersonaFixture,
    operatorIntent: "从余则成两次倒水看汇报",
    sourceMediaId: "qianfu_ep18_720p_25fps",
  });

  // 1. 正常添加节拍
  const beats = [
    {
      beat_id: "beat-01",
      beat_title: "黄金悬念开场",
      narrative_function: "hook",
      target_duration_sec: 4.5,
      key_dialogue_or_claim: "很多人以为汇报工作是讲事实，其实老手看的是动作留白。",
    },
    {
      beat_id: "beat-02",
      beat_title: "动作克制展开",
      narrative_function: "conflict_demonstration",
      target_duration_sec: 5.5,
      key_dialogue_or_claim: "手腕悬停一秒半，这是给上位者思考的台阶。",
    },
  ];

  job = OperationsOrchestrator.generateStoryBeats(job, beats);
  assert.equal(job.status, JOB_STATES.SCRIPTING);
  assert.equal(job.payload.beats.length, 2);

  // 2. 守界红线：如果试图在 Story Beat 中写死具体时间码或物理片段，必须被拦截抛错！
  const pollutedBeats = [
    {
      beat_id: "beat-leak",
      beat_title: "泄露具体镜头",
      scene_id: "scene_0042", // 违规泄露真实片段
      in_timecode: "00:08:14.200", // 违规泄露物理时间码
    },
  ];

  assert.throws(
    () => OperationsOrchestrator.generateStoryBeats(job, pollutedBeats),
    (err) => {
      assert.ok(err instanceof OrchestratorError);
      assert.match(err.message, /严禁在无证据检索阶段写死物理时间码/);
      return true;
    }
  );
});

test("OperationsOrchestrator: derives Material Requirements and advances to human review gate", () => {
  let job = OperationsOrchestrator.initiateJobFromIntent({
    persona: laozhouPersonaFixture,
    operatorIntent: "从余则成两次倒水看汇报",
    sourceMediaId: "qianfu_ep18_720p_25fps",
  });

  const beats = [
    {
      beat_id: "beat-01",
      beat_title: "开场",
      narrative_function: "hook",
      target_duration_sec: 4.5,
      key_dialogue_or_claim: "台词意图",
    },
  ];
  job = OperationsOrchestrator.generateStoryBeats(job, beats);

  const requirements = [
    {
      beat_id: "beat-01",
      characters: ["余则成", "吴敬中"],
      scene_env: "站长办公室",
      action_cue: "双手递茶，低头动作克制",
      emotional_tone: "平静下的暗流试探",
      preferred_affordances: ["试探", "权力压迫"],
    },
  ];

  // 提交至审核卡点
  job = OperationsOrchestrator.deriveMaterialRequirementsAndSubmit(job, requirements);

  assert.equal(job.status, JOB_STATES.AWAITING_SCRIPT_REVIEW);
  assert.equal(job.progress_percent, 30);
  assert.equal(job.payload.material_requirements.length, 1);
  assert.equal(job.payload.material_requirements[0].action_cue, "双手递茶，低头动作克制");

  // 守界红线：如果在 Material Requirement 中泄露时间码，必须拦截
  assert.throws(
    () =>
      OperationsOrchestrator.deriveMaterialRequirementsAndSubmit(job, [
        {
          beat_id: "beat-01",
          action_cue: "违规动作",
          emotional_tone: "平静",
          out_timecode: "00:08:18.700",
        },
      ]),
    OrchestratorError
  );
});
