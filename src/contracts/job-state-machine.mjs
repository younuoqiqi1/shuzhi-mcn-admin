/**
 * @file job-state-machine.js
 * @description POC-AGENT A1: ProductionJob 状态机逻辑与流转引擎。
 * 遵循严格的状态跃迁守则，拦截非法跃迁并记录历史痕迹。
 */

import { validateProductionJob } from "./validators.mjs";

export const JOB_STATES = Object.freeze({
  IDEATING: "ideating",
  AWAITING_DIRECTION_REVIEW: "awaiting_direction_review",
  RETRIEVING: "retrieving",
  PERSPECTIVE_READING: "perspective_reading",
  DIRECTING: "directing",
  AWAITING_FINAL_PLAN_REVIEW: "awaiting_final_plan_review",
  VMV_PRODUCING: "vmv_producing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

export const STAGE_PROGRESS_MAP = Object.freeze({
  [JOB_STATES.IDEATING]: 15,
  [JOB_STATES.AWAITING_DIRECTION_REVIEW]: 30,
  [JOB_STATES.RETRIEVING]: 45,
  [JOB_STATES.PERSPECTIVE_READING]: 60,
  [JOB_STATES.DIRECTING]: 75,
  [JOB_STATES.AWAITING_FINAL_PLAN_REVIEW]: 85,
  [JOB_STATES.VMV_PRODUCING]: 95,
  [JOB_STATES.COMPLETED]: 100,
});

export const ALLOWED_TRANSITIONS = Object.freeze({
  [JOB_STATES.IDEATING]: [JOB_STATES.AWAITING_DIRECTION_REVIEW, JOB_STATES.FAILED, JOB_STATES.CANCELLED],
  [JOB_STATES.AWAITING_DIRECTION_REVIEW]: [JOB_STATES.RETRIEVING, JOB_STATES.IDEATING, JOB_STATES.CANCELLED],
  [JOB_STATES.RETRIEVING]: [JOB_STATES.PERSPECTIVE_READING, JOB_STATES.FAILED, JOB_STATES.CANCELLED],
  [JOB_STATES.PERSPECTIVE_READING]: [JOB_STATES.DIRECTING, JOB_STATES.FAILED, JOB_STATES.CANCELLED],
  [JOB_STATES.DIRECTING]: [JOB_STATES.AWAITING_FINAL_PLAN_REVIEW, JOB_STATES.FAILED, JOB_STATES.CANCELLED],
  [JOB_STATES.AWAITING_FINAL_PLAN_REVIEW]: [JOB_STATES.VMV_PRODUCING, JOB_STATES.DIRECTING, JOB_STATES.CANCELLED],
  [JOB_STATES.VMV_PRODUCING]: [JOB_STATES.COMPLETED, JOB_STATES.FAILED, JOB_STATES.CANCELLED],
  [JOB_STATES.COMPLETED]: [],
  [JOB_STATES.FAILED]: [],
  [JOB_STATES.CANCELLED]: [],
});

export class InvalidStateTransitionError extends Error {
  constructor(currentState, attemptedState, allowedStates = []) {
    super(
      `[JobStateMachineError] 非法状态跃迁: 无法从 '${currentState}' 跃迁至 '${attemptedState}'。允许的目标状态: [${allowedStates.join(
        ", "
      )}]`
    );
    this.name = "InvalidStateTransitionError";
    this.currentState = currentState;
    this.attemptedState = attemptedState;
    this.allowedStates = allowedStates;
  }
}

/**
 * 创建新初始状态的 ProductionJob 实例
 * @param {Object} params
 * @param {string} params.jobId
 * @param {string} params.topicId
 * @param {string} params.bloggerId
 * @param {Object} [params.initialPayload]
 * @returns {Object} 符合 ProductionJob 规范的对象
 */
export function createProductionJob({ jobId, topicId, bloggerId, initialPayload = {} }) {
  const now = new Date().toISOString();
  const job = {
    job_id: jobId,
    topic_id: topicId,
    blogger_id: bloggerId,
    status: JOB_STATES.IDEATING,
    created_at: now,
    updated_at: now,
    progress_percent: STAGE_PROGRESS_MAP[JOB_STATES.IDEATING],
    current_stage: "1. 选题立意与需求策划 (Topic/Viewpoint/Beats/Requirements)",
    payload: { ...initialPayload },
    error: null,
    history: [
      {
        from: "none",
        to: JOB_STATES.IDEATING,
        timestamp: now,
        reason: "Job initialized",
      },
    ],
  };
  validateProductionJob(job);
  return job;
}

/**
 * 驱动状态机安全跃迁
 * @param {Object} job 当前任务对象
 * @param {string} nextState 期望流转的目标状态
 * @param {Object} [options]
 * @param {string} [options.reason] 流转原因说明
 * @param {Object} [options.payloadUpdate] 附加载荷增量更新
 * @param {Object} [options.error] 失败错误详情 (状态为 failed 时)
 * @param {string} [options.currentStage] 当前阶段人类可读名称
 * @param {number} [options.progressPercent] 自定义进度百分比
 * @returns {Object} 流转后的新 Job 副本（保持不可变性）
 */
export function transitionJob(job, nextState, options = {}) {
  validateProductionJob(job);

  const allowed = ALLOWED_TRANSITIONS[job.status] || [];
  if (!allowed.includes(nextState)) {
    throw new InvalidStateTransitionError(job.status, nextState, allowed);
  }

  const now = new Date().toISOString();
  const nextHistory = [
    ...job.history,
    {
      from: job.status,
      to: nextState,
      timestamp: now,
      reason: options.reason || `Transitioned to ${nextState}`,
    },
  ];

  const defaultProgress = STAGE_PROGRESS_MAP[nextState] ?? job.progress_percent;
  const nextProgress = typeof options.progressPercent === "number" ? options.progressPercent : defaultProgress;

  const nextJob = {
    ...job,
    status: nextState,
    updated_at: now,
    progress_percent: nextProgress,
    current_stage: options.currentStage || job.current_stage,
    payload: options.payloadUpdate ? { ...job.payload, ...options.payloadUpdate } : job.payload,
    error: nextState === JOB_STATES.FAILED ? (options.error || { message: "Job failed" }) : job.error,
    history: nextHistory,
  };

  validateProductionJob(nextJob);
  return nextJob;
}
