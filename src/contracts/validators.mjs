/**
 * @file validators.js
 * @description POC-AGENT A1: 通用纯逻辑数据校验器。
 * 严禁包含任何针对特定人物、剧名或时间码的硬编码逻辑。
 */

const TIMECODE_REGEX = /^\d{2}:\d{2}:\d{2}\.\d{3}$/;

export class ValidationError extends Error {
  constructor(entityName, field, message, details = {}) {
    super(`[${entityName}ValidationError] 字段 '${field}': ${message}`);
    this.name = "ValidationError";
    this.entityName = entityName;
    this.field = field;
    this.details = details;
  }
}

/**
 * 将 HH:MM:SS.mmm 时间码转为秒数（浮点数）
 * @param {string} tc
 * @returns {number}
 */
export function parseTimecodeToSeconds(tc) {
  if (typeof tc !== "string" || !TIMECODE_REGEX.test(tc)) {
    throw new Error(`无效的时间码格式: '${tc}'，期望为 'HH:MM:SS.mmm'`);
  }
  const [hms, ms] = tc.split(".");
  const [hours, minutes, seconds] = hms.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds + Number(ms) / 1000;
}

function assertObject(data, entityName) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ValidationError(entityName, "root", "必须是非空对象");
  }
}

function assertNonEmptyString(val, entityName, field) {
  if (typeof val !== "string" || val.trim().length === 0) {
    throw new ValidationError(entityName, field, "必须是非空字符串");
  }
}

function assertPositiveNumber(val, entityName, field) {
  if (typeof val !== "number" || isNaN(val) || val <= 0) {
    throw new ValidationError(entityName, field, "必须是大于 0 的有效数字");
  }
}

function assertValidTimecodeRange(inTc, outTc, durationSec, entityName, prefix = "") {
  assertNonEmptyString(inTc, entityName, `${prefix}in_timecode`);
  assertNonEmptyString(outTc, entityName, `${prefix}out_timecode`);
  if (!TIMECODE_REGEX.test(inTc)) {
    throw new ValidationError(entityName, `${prefix}in_timecode`, `格式必须为 HH:MM:SS.mmm，收到 '${inTc}'`);
  }
  if (!TIMECODE_REGEX.test(outTc)) {
    throw new ValidationError(entityName, `${prefix}out_timecode`, `格式必须为 HH:MM:SS.mmm，收到 '${outTc}'`);
  }
  const inSec = parseTimecodeToSeconds(inTc);
  const outSec = parseTimecodeToSeconds(outTc);
  if (outSec <= inSec) {
    throw new ValidationError(entityName, `${prefix}out_timecode`, `出点时间码 (${outTc}) 必须大于入点时间码 (${inTc})`);
  }
  if (typeof durationSec === "number") {
    const diff = Math.round((outSec - inSec) * 1000) / 1000;
    const specified = Math.round(durationSec * 1000) / 1000;
    // 允许 0.05 秒内的计算精度误差
    if (Math.abs(diff - specified) > 0.05) {
      throw new ValidationError(
        entityName,
        `${prefix}duration_sec`,
        `指定的 duration_sec (${durationSec}s) 与时间码差值 (${diff}s) 不一致`
      );
    }
  }
}

export function validatePersona(data) {
  assertObject(data, "Persona");
  assertNonEmptyString(data.id, "Persona", "id");
  assertNonEmptyString(data.name, "Persona", "name");
  assertNonEmptyString(data.tone, "Persona", "tone");
  assertNonEmptyString(data.core_lens, "Persona", "core_lens");

  if (!data.voice_config || typeof data.voice_config !== "object") {
    throw new ValidationError("Persona", "voice_config", "必须包含 voice_config 配置对象");
  }
  assertNonEmptyString(data.voice_config.provider, "Persona", "voice_config.provider");
  assertNonEmptyString(data.voice_config.voice_id, "Persona", "voice_config.voice_id");
  if (data.voice_config.speech_rate !== undefined) {
    if (typeof data.voice_config.speech_rate !== "number" || data.voice_config.speech_rate <= 0) {
      throw new ValidationError("Persona", "voice_config.speech_rate", "语速倍率必须为大于 0 的数字");
    }
  }
  return true;
}

export function validateTopic(data) {
  assertObject(data, "Topic");
  assertNonEmptyString(data.id, "Topic", "id");
  assertNonEmptyString(data.blogger_id, "Topic", "blogger_id");
  assertNonEmptyString(data.title, "Topic", "title");
  assertNonEmptyString(data.source_media_id, "Topic", "source_media_id");
  if (!["16:9", "9:16"].includes(data.aspect_ratio)) {
    throw new ValidationError("Topic", "aspect_ratio", "画幅必须为 '16:9' 或 '9:16'");
  }
  assertPositiveNumber(data.target_duration_sec, "Topic", "target_duration_sec");
  return true;
}

export function validateCoreViewpoint(data) {
  assertObject(data, "CoreViewpoint");
  assertNonEmptyString(data.topic_id, "CoreViewpoint", "topic_id");
  assertNonEmptyString(data.thesis, "CoreViewpoint", "thesis");
  assertNonEmptyString(data.hook, "CoreViewpoint", "hook");
  assertNonEmptyString(data.takeaway, "CoreViewpoint", "takeaway");
  if (data.tone_keywords && !Array.isArray(data.tone_keywords)) {
    throw new ValidationError("CoreViewpoint", "tone_keywords", "必须是字符串数组");
  }
  return true;
}

export function validateStoryBeat(data) {
  assertObject(data, "StoryBeat");
  assertNonEmptyString(data.beat_id, "StoryBeat", "beat_id");
  if (!Number.isInteger(data.order) || data.order < 1) {
    throw new ValidationError("StoryBeat", "order", "必须为大于等于 1 的正整数");
  }
  assertNonEmptyString(data.beat_title, "StoryBeat", "beat_title");
  assertNonEmptyString(data.narrative_function, "StoryBeat", "narrative_function");
  assertPositiveNumber(data.target_duration_sec, "StoryBeat", "target_duration_sec");
  return true;
}

export function validateMaterialRequirement(data) {
  assertObject(data, "MaterialRequirement");
  assertNonEmptyString(data.beat_id, "MaterialRequirement", "beat_id");
  assertNonEmptyString(data.desired_action, "MaterialRequirement", "desired_action");
  assertNonEmptyString(data.desired_emotion, "MaterialRequirement", "desired_emotion");
  if (data.desired_characters && !Array.isArray(data.desired_characters)) {
    throw new ValidationError("MaterialRequirement", "desired_characters", "必须是字符串数组");
  }
  if (data.target_affordances && !Array.isArray(data.target_affordances)) {
    throw new ValidationError("MaterialRequirement", "target_affordances", "必须是字符串数组");
  }
  if (data.forbidden_elements && !Array.isArray(data.forbidden_elements)) {
    throw new ValidationError("MaterialRequirement", "forbidden_elements", "必须是字符串数组");
  }
  return true;
}

export function validateCandidate(data) {
  assertObject(data, "Candidate");
  assertNonEmptyString(data.candidate_id, "Candidate", "candidate_id");
  assertNonEmptyString(data.beat_id, "Candidate", "beat_id");
  assertNonEmptyString(data.media_id, "Candidate", "media_id");
  assertNonEmptyString(data.scene_id, "Candidate", "scene_id");

  if (!data.timecode || typeof data.timecode !== "object") {
    throw new ValidationError("Candidate", "timecode", "必须是对象");
  }
  assertValidTimecodeRange(data.timecode.in, data.timecode.out, data.timecode.duration_sec, "Candidate", "timecode.");

  if (!data.evidence_l1 || typeof data.evidence_l1 !== "object") {
    throw new ValidationError("Candidate", "evidence_l1", "必须包含客观证据 L1 对象");
  }
  if (!Array.isArray(data.evidence_l1.characters)) {
    throw new ValidationError("Candidate", "evidence_l1.characters", "必须是数组");
  }
  if (!Array.isArray(data.evidence_l1.actions)) {
    throw new ValidationError("Candidate", "evidence_l1.actions", "必须是数组");
  }

  if (!data.affordance_l2 || typeof data.affordance_l2 !== "object") {
    throw new ValidationError("Candidate", "affordance_l2", "必须包含通用潜能 L2 对象");
  }
  if (!Array.isArray(data.affordance_l2.tags)) {
    throw new ValidationError("Candidate", "affordance_l2.tags", "必须是通用戏剧标签数组");
  }
  return true;
}

export function validatePerspectiveReading(data) {
  assertObject(data, "PerspectiveReading");
  assertNonEmptyString(data.candidate_id, "PerspectiveReading", "candidate_id");
  assertNonEmptyString(data.beat_id, "PerspectiveReading", "beat_id");
  assertNonEmptyString(data.blogger_id, "PerspectiveReading", "blogger_id");
  assertNonEmptyString(data.topic_id, "PerspectiveReading", "topic_id");
  assertNonEmptyString(data.perspective_lens, "PerspectiveReading", "perspective_lens");
  assertNonEmptyString(data.subjective_interpretation, "PerspectiveReading", "subjective_interpretation");

  if (!data.original_audio_strategy || typeof data.original_audio_strategy !== "object") {
    throw new ValidationError("PerspectiveReading", "original_audio_strategy", "必须包含原声策略对象");
  }
  if (typeof data.original_audio_strategy.keep !== "boolean") {
    throw new ValidationError("PerspectiveReading", "original_audio_strategy.keep", "必须是布尔值");
  }
  return true;
}

export function validateDirectorPlan(data) {
  assertObject(data, "DirectorPlan");
  assertNonEmptyString(data.plan_id, "DirectorPlan", "plan_id");
  assertNonEmptyString(data.topic_id, "DirectorPlan", "topic_id");
  assertNonEmptyString(data.blogger_id, "DirectorPlan", "blogger_id");
  if (!["16:9", "9:16"].includes(data.aspect_ratio)) {
    throw new ValidationError("DirectorPlan", "aspect_ratio", "画幅必须为 '16:9' 或 '9:16'");
  }

  if (!data.voice_config || typeof data.voice_config !== "object") {
    throw new ValidationError("DirectorPlan", "voice_config", "必须包含配音参数配置");
  }
  assertNonEmptyString(data.voice_config.provider, "DirectorPlan", "voice_config.provider");
  assertNonEmptyString(data.voice_config.voice_id, "DirectorPlan", "voice_config.voice_id");

  if (!Array.isArray(data.shots) || data.shots.length === 0) {
    throw new ValidationError("DirectorPlan", "shots", "镜头数组必须非空");
  }

  data.shots.forEach((shot, idx) => {
    const prefix = `shots[${idx}].`;
    assertObject(shot, "DirectorPlan");
    if (!Number.isInteger(shot.shot_index) || shot.shot_index < 1) {
      throw new ValidationError("DirectorPlan", `${prefix}shot_index`, "必须为大于等于 1 的整数");
    }
    assertNonEmptyString(shot.beat_id, "DirectorPlan", `${prefix}beat_id`);
    assertNonEmptyString(shot.selected_candidate_id, "DirectorPlan", `${prefix}selected_candidate_id`);
    assertNonEmptyString(shot.media_id, "DirectorPlan", `${prefix}media_id`);
    assertNonEmptyString(shot.scene_id, "DirectorPlan", `${prefix}scene_id`);
    assertValidTimecodeRange(shot.in_timecode, shot.out_timecode, shot.duration_sec, "DirectorPlan", prefix);

    if (!shot.narration || typeof shot.narration !== "object") {
      throw new ValidationError("DirectorPlan", `${prefix}narration`, "必须包含解说词配置");
    }
    assertNonEmptyString(shot.narration.text, "DirectorPlan", `${prefix}narration.text`);

    if (!shot.original_audio || typeof shot.original_audio !== "object") {
      throw new ValidationError("DirectorPlan", `${prefix}original_audio`, "必须包含原声配置");
    }
    if (typeof shot.original_audio.preserve !== "boolean") {
      throw new ValidationError("DirectorPlan", `${prefix}original_audio.preserve`, "必须是布尔值");
    }
  });
  return true;
}

export function validateProductionJob(data) {
  assertObject(data, "ProductionJob");
  assertNonEmptyString(data.job_id, "ProductionJob", "job_id");
  assertNonEmptyString(data.topic_id, "ProductionJob", "topic_id");
  assertNonEmptyString(data.blogger_id, "ProductionJob", "blogger_id");
  assertNonEmptyString(data.status, "ProductionJob", "status");
  assertNonEmptyString(data.created_at, "ProductionJob", "created_at");
  assertNonEmptyString(data.updated_at, "ProductionJob", "updated_at");

  if (typeof data.progress_percent !== "number" || data.progress_percent < 0 || data.progress_percent > 100) {
    throw new ValidationError("ProductionJob", "progress_percent", "进度百分比必须在 0 到 100 之间");
  }
  if (!Array.isArray(data.history)) {
    throw new ValidationError("ProductionJob", "history", "历史跃迁记录必须是数组");
  }
  return true;
}

export const VALIDATOR_MAP = {
  Persona: validatePersona,
  Topic: validateTopic,
  CoreViewpoint: validateCoreViewpoint,
  StoryBeat: validateStoryBeat,
  MaterialRequirement: validateMaterialRequirement,
  Candidate: validateCandidate,
  PerspectiveReading: validatePerspectiveReading,
  DirectorPlan: validateDirectorPlan,
  ProductionJob: validateProductionJob,
};

export function validate(type, data) {
  const validator = VALIDATOR_MAP[type];
  if (!validator) {
    throw new Error(`未知的契约类型: '${type}'`);
  }
  return validator(data);
}
