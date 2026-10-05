/**
 * @file duration-budget-config.mjs
 * @description POC-AGENT A7.1: 旁白时长预算集中配置与计算器。
 * 
 * 核心原则：
 * 1. 集中配置：中文播音估算语速集中定义，严禁散落 magic number。
 * 2. 诚实估算：明确这是基于字符数和语速的 estimate，不是伪称真实 TTS。
 * 3. 严格留白：为每段前后保留音频安全缓冲 (headroom)，避免声音顶格溢出。
 * 4. 视听协同：原声独占或原声引导时，精确计算扣除原声后的真实可用旁白时间。
 */

export const DURATION_BUDGET_CONFIG = {
  // 集中配置：中文常态解说估算语速（字/秒，包含标点与微呼吸停顿）
  estimated_chars_per_second: 4.0,
  // 集中配置：音频前后安全缓冲余量（秒），防止音频顶死切口
  audio_headroom_sec: 0.5,
  // 集中配置：当使用 duck 避让策略时，前导原声独占保留时间（秒）
  default_duck_lead_sec: 2.0,
  // 集中配置：浮点精度计算容差（秒）
  tolerance_sec: 0.05,
};

/**
 * 计算文本有效字符数（去除多余首尾与连续空白字符，统计汉字、英文字母、数字和标点）
 * @param {string} text 
 * @returns {number}
 */
export function countNarrationChars(text) {
  if (!text || typeof text !== "string") return 0;
  // 过滤空白换行，统计实际读音字符
  const cleaned = text.replace(/\s+/g, "");
  return cleaned.length;
}

/**
 * 为单个 Segment 计算旁白时长预算 (Narration Duration Budget)
 * @param {Object} params
 * @param {string} params.narration_text 旁白文案
 * @param {string} params.audio_owner 音频所有权 ("narration" | "original_dialogue" 等)
 * @param {string} params.audio_transition 音频转场 ("hard_cut" | "duck" | "L_cut" 等)
 * @param {number} params.planned_duration 镜头计划时长（秒）
 * @param {string} [params.original_dialogue_text] 原对白文案
 * @param {number} [params.custom_chars_per_sec] 可选自定义语速覆盖
 * @returns {Object} 预算计算结果
 */
export function calculateNarrationBudget(params) {
  const {
    narration_text = "",
    audio_owner = "narration",
    audio_transition = "hard_cut",
    planned_duration = 0,
    original_dialogue_text = "",
    custom_chars_per_sec = null,
  } = params;

  const charsPerSec = custom_chars_per_sec || DURATION_BUDGET_CONFIG.estimated_chars_per_second;
  const headroomSec = DURATION_BUDGET_CONFIG.audio_headroom_sec;
  const duckLeadSec = DURATION_BUDGET_CONFIG.default_duck_lead_sec;

  const charCount = countNarrationChars(narration_text);
  const estimatedTtsDuration = charCount > 0
    ? Math.round((charCount / charsPerSec) * 100) / 100
    : 0.0;

  let originalAudioSec = 0.0;
  let availableNarrationDuration = 0.0;

  if (audio_owner === "original_dialogue") {
    if (audio_transition === "duck") {
      // 原声先导独占一段，随后压低垫底，供旁白切入
      originalAudioSec = duckLeadSec;
      availableNarrationDuration = Math.max(0, Math.round((planned_duration - originalAudioSec - headroomSec) * 100) / 100);
    } else {
      // 纯原声保留，旁白不可占用
      originalAudioSec = planned_duration;
      availableNarrationDuration = 0.0;
    }
  } else if (audio_owner === "narration") {
    originalAudioSec = 0.0;
    availableNarrationDuration = Math.max(0, Math.round((planned_duration - headroomSec) * 100) / 100);
  } else {
    // ambience / silence 等
    originalAudioSec = 0.0;
    availableNarrationDuration = Math.max(0, Math.round((planned_duration - headroomSec) * 100) / 100);
  }

  // 是否说得完
  const durationOverflowSec = Math.max(
    0,
    Math.round((estimatedTtsDuration - availableNarrationDuration) * 100) / 100
  );
  const durationFit = durationOverflowSec <= DURATION_BUDGET_CONFIG.tolerance_sec;

  return {
    narration_char_count: charCount,
    estimated_tts_duration_sec: estimatedTtsDuration,
    original_audio_occupancy_sec: originalAudioSec,
    available_narration_duration_sec: availableNarrationDuration,
    duration_fit: durationFit,
    duration_overflow_sec: durationOverflowSec,
    budget_parameters: {
      chars_per_second: charsPerSec,
      headroom_sec: headroomSec,
      duck_lead_sec: duckLeadSec,
      is_estimate: true,
    },
  };
}
