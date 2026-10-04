/**
 * @file vmv-adapter.js
 * @description POC-AGENT A1: DirectorPlan -> VMV Stage 4/5 Production Order 映射适配器。
 * 确保数智博主后台与底层 VMV 引擎输入协议 100% 兼容对齐。
 */

import { validateDirectorPlan, parseTimecodeToSeconds, ValidationError } from "./validators.mjs";

/**
 * 将 DirectorPlan 映射为 VMV Stage 4/5 标准生产单数据结构
 * @param {Object} directorPlan 经校验合法的 DirectorPlan
 * @param {Object} [options] 可选定制参数 (如自定义 orderId)
 * @returns {Object} 能够直接被 VMV Stage 4/5 消费的 Production Order
 */
export function mapDirectorPlanToVMVProductionOrder(directorPlan, options = {}) {
  validateDirectorPlan(directorPlan);

  const orderId = options.orderId || `order-${directorPlan.plan_id}-${Date.now().toString(36)}`;
  const isVertical = directorPlan.aspect_ratio === "9:16";

  const order = {
    version: "1.0.0",
    order_id: orderId,
    plan_id: directorPlan.plan_id,
    topic_id: directorPlan.topic_id,
    blogger_id: directorPlan.blogger_id,
    created_at: new Date().toISOString(),
    target_format: {
      resolution: isVertical ? "1080x1920" : "1920x1080",
      aspect_ratio: directorPlan.aspect_ratio,
      fps: 25.0,
      format: "mp4",
      burn_subtitles: true,
    },
    audio_track: {
      provider: directorPlan.voice_config.provider,
      voice_id: directorPlan.voice_config.voice_id,
      speech_rate: directorPlan.voice_config.speech_rate || 1.0,
      pitch_rate: directorPlan.voice_config.pitch_rate || 1.0,
    },
    segments: directorPlan.shots.map((shot, index) => {
      const inSec = parseTimecodeToSeconds(shot.in_timecode);
      const outSec = parseTimecodeToSeconds(shot.out_timecode);
      const calculatedDuration = Math.round((outSec - inSec) * 1000) / 1000;

      return {
        segment_index: shot.shot_index || index + 1,
        beat_id: shot.beat_id,
        narration_text: shot.narration.text,
        narration_delay_sec: shot.narration.start_delay_sec || 0.0,
        clip: {
          media_id: shot.media_id,
          scene_id: shot.scene_id,
          in_timecode: shot.in_timecode,
          out_timecode: shot.out_timecode,
          duration_sec: shot.duration_sec || calculatedDuration,
        },
        original_audio: {
          preserve: Boolean(shot.original_audio.preserve),
          volume_percent: shot.original_audio.volume_percent !== undefined ? shot.original_audio.volume_percent : 100,
          time_range: shot.original_audio.time_range || null,
        },
        burn_subtitles: shot.burn_subtitles !== undefined ? shot.burn_subtitles : true,
      };
    }),
  };

  validateVMVProductionOrder(order);
  return order;
}

/**
 * 校验生成的 VMV Production Order 是否满足规范
 * @param {Object} order
 * @returns {boolean}
 */
export function validateVMVProductionOrder(order) {
  if (!order || typeof order !== "object") {
    throw new ValidationError("VMVProductionOrder", "root", "必须是非空对象");
  }
  if (order.version !== "1.0.0") {
    throw new ValidationError("VMVProductionOrder", "version", "生产单版本必须为 '1.0.0'");
  }
  if (!order.order_id || typeof order.order_id !== "string") {
    throw new ValidationError("VMVProductionOrder", "order_id", "必须包含非空 order_id");
  }
  if (!order.target_format || typeof order.target_format !== "object") {
    throw new ValidationError("VMVProductionOrder", "target_format", "必须包含输出画幅格式参数");
  }
  if (!order.audio_track || typeof order.audio_track !== "object") {
    throw new ValidationError("VMVProductionOrder", "audio_track", "必须包含配音音轨配置");
  }
  if (!Array.isArray(order.segments) || order.segments.length === 0) {
    throw new ValidationError("VMVProductionOrder", "segments", "分段列表必须为非空数组");
  }

  order.segments.forEach((seg, idx) => {
    const prefix = `segments[${idx}].`;
    if (!seg.clip || !seg.clip.media_id || !seg.clip.in_timecode || !seg.clip.out_timecode) {
      throw new ValidationError("VMVProductionOrder", `${prefix}clip`, "片段信息缺失必填时间码或素材标识");
    }
    if (!seg.narration_text || typeof seg.narration_text !== "string") {
      throw new ValidationError("VMVProductionOrder", `${prefix}narration_text`, "解说文本必须是非空字符串");
    }
  });

  return true;
}
