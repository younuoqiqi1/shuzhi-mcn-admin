/**
 * @file objective-evidence.mjs
 * @description POC-AGENT A2: L1 稳定客观 Evidence 规范与校验器。
 * 严格只包含物理与观测事实，禁止任何主观解读，缺失项必须标记为 'unavailable'。
 */

import { parseTimecodeToSeconds } from "../contracts/validators.mjs";

export { parseTimecodeToSeconds };

export const UNAVAILABLE = "unavailable";

export class L1PollutionError extends Error {
  constructor(field, message) {
    super(`[L1PollutionError] 严禁向 L1 客观事实层注入主观数据: 字段 '${field}' - ${message}`);
    this.name = "L1PollutionError";
    this.field = field;
  }
}

/**
 * 将秒数转换为标准 HH:MM:SS.mmm 时间码
 * @param {number} sec
 * @returns {string}
 */
export function secondsToTimecode(sec) {
  if (typeof sec !== "number" || isNaN(sec) || sec < 0) {
    throw new Error(`无效的秒数: ${sec}`);
  }
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const millis = Math.round((sec - Math.floor(sec)) * 1000);

  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

/**
 * 将 SMPTE 格式 (HH:MM:SS:FF) 根据 fps 转换为标准 HH:MM:SS.mmm 时间码
 * @param {string} smpte
 * @param {number} fps
 * @returns {string}
 */
export function smpteToTimecode(smpte, fps = 25.0) {
  if (typeof smpte !== "string") {
    throw new Error(`无效的 SMPTE 字符串: ${smpte}`);
  }
  const parts = smpte.split(":");
  if (parts.length === 4) {
    const [h, m, s, f] = parts.map(Number);
    const totalSec = h * 3600 + m * 60 + s + f / fps;
    return secondsToTimecode(totalSec);
  }
  if (smpte.includes(".")) {
    return smpte;
  }
  throw new Error(`无法识别的时间码格式: ${smpte}`);
}

/**
 * 严格校验 L1 客观 Evidence 对象
 * @param {Object} ev
 * @returns {boolean}
 */
export function validateObjectiveEvidence(ev) {
  if (!ev || typeof ev !== "object") {
    throw new Error("ObjectiveEvidence 必须是非空对象");
  }

  // 严格防污染检查：严禁任何主观关键词存在于 L1 属性中
  const forbiddenKeys = [
    "persona",
    "blogger",
    "viewpoint",
    "interpretation",
    "narrative_function",
    "perspective_reading",
    "affordance",
    "subtext",
    "director_plan",
    "narration",
  ];
  for (const k of forbiddenKeys) {
    if (k in ev) {
      throw new L1PollutionError(k, "L1 只允许存放客观事实，检测到非法主观语义字段");
    }
  }

  const requiredFields = [
    "evidence_id",
    "media_id",
    "scene_id",
    "timecode",
    "source",
    "dialogue",
    "characters",
    "physical_actions",
    "camera",
    "audio",
  ];
  for (const field of requiredFields) {
    if (!(field in ev)) {
      throw new Error(`ObjectiveEvidence 缺失必填字段: '${field}'`);
    }
  }

  if (typeof ev.evidence_id !== "string" || !ev.evidence_id) {
    throw new Error("evidence_id 必须为非空字符串");
  }
  if (typeof ev.media_id !== "string" || !ev.media_id) {
    throw new Error("media_id 必须为非空字符串");
  }
  if (typeof ev.scene_id !== "string" || !ev.scene_id) {
    throw new Error("scene_id 必须为非空字符串");
  }

  // 检查时间码
  const tc = ev.timecode;
  if (!tc || typeof tc !== "object" || !tc.in || !tc.out || typeof tc.duration_sec !== "number") {
    throw new Error("timecode 必须包含 in, out, duration_sec");
  }
  const inSec = parseTimecodeToSeconds(tc.in);
  const outSec = parseTimecodeToSeconds(tc.out);
  if (outSec <= inSec) {
    throw new Error(`出点时间码 (${tc.out}) 必须大于入点时间码 (${tc.in})`);
  }

  // 检查非臆造字段
  if (ev.dialogue !== UNAVAILABLE && typeof ev.dialogue !== "string") {
    throw new Error("dialogue 必须为字符串或标记为 'unavailable'");
  }
  if (ev.characters !== UNAVAILABLE && !Array.isArray(ev.characters)) {
    throw new Error("characters 必须为数组或标记为 'unavailable'");
  }
  if (ev.physical_actions !== UNAVAILABLE && !Array.isArray(ev.physical_actions)) {
    throw new Error("physical_actions 必须为数组或标记为 'unavailable'");
  }
  if (ev.camera !== UNAVAILABLE && typeof ev.camera !== "object") {
    throw new Error("camera 必须为对象或标记为 'unavailable'");
  }

  return true;
}
