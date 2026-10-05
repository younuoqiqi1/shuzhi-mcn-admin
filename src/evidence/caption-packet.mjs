/**
 * @file caption-packet.mjs
 * @description POC-AGENT A4.5: VMV 规范 Caption Packet 生成器。
 * 复用 VMV 架构设计中的 Caption Packet 模式，
 * 将客观镜头/场景切片打包为包含时码窗口、中点抽样时间戳及源媒体元数据的标准数据包，
 * 供后续自动化视觉描述采样与多模态台词对齐使用。
 */

import { secondsToTimecode, parseTimecodeToSeconds } from "./objective-evidence.mjs";

/**
 * 校验 CaptionPacket 结构合法性
 * @param {Object} packet
 * @returns {boolean}
 */
export function validateCaptionPacket(packet) {
  if (!packet || typeof packet !== "object") {
    throw new Error("CaptionPacket 必须是非空对象");
  }
  const required = ["packet_id", "media_id", "scene_id", "timecode", "sample_points_sec"];
  for (const field of required) {
    if (!(field in packet)) {
      throw new Error(`CaptionPacket 缺失必填字段: '${field}'`);
    }
  }
  if (!packet.timecode.in || !packet.timecode.out || typeof packet.timecode.duration_sec !== "number") {
    throw new Error("CaptionPacket timecode 必须包含 in, out, duration_sec");
  }
  if (!Array.isArray(packet.sample_points_sec) || packet.sample_points_sec.length === 0) {
    throw new Error("CaptionPacket sample_points_sec 必须包含至少一个采样时间点");
  }
  return true;
}

/**
 * 为单个场景生成标准 CaptionPacket
 * @param {Object} scene 场景条目 { index, start_sec, end_sec, start_timecode, end_timecode, duration_sec }
 * @param {Object} mediaInfo 媒体基础信息 { media_id, filename, fps, resolution }
 * @param {Object} [options]
 * @returns {Object} 规范的 CaptionPacket
 */
export function generateCaptionPacket(scene, mediaInfo, options = {}) {
  const sceneIndex = scene.index || 1;
  const sceneId = scene.scene_id || `scene_${String(sceneIndex).padStart(4, "0")}`;
  const mediaId = mediaInfo.media_id || "qianfu_ep18_720p_25fps";
  const fps = Number(mediaInfo.fps) || 25.0;

  const startSec = typeof scene.start_sec === "number" ? scene.start_sec : parseTimecodeToSeconds(scene.start_timecode);
  const endSec = typeof scene.end_sec === "number" ? scene.end_sec : parseTimecodeToSeconds(scene.end_timecode);
  const durationSec = typeof scene.duration_sec === "number" ? scene.duration_sec : Math.round((endSec - startSec) * 1000) / 1000;

  const inTimecode = scene.start_timecode || secondsToTimecode(startSec);
  const outTimecode = scene.end_timecode || secondsToTimecode(endSec);

  // 计算采样点 (中点，长镜头补充前1/4与后3/4点)
  const samplePoints = [];
  const midPoint = Math.round(((startSec + endSec) / 2) * 100) / 100;
  samplePoints.push(midPoint);

  if (durationSec > 6.0) {
    const q1 = Math.round((startSec + durationSec * 0.25) * 100) / 100;
    const q3 = Math.round((startSec + durationSec * 0.75) * 100) / 100;
    samplePoints.unshift(q1);
    samplePoints.push(q3);
  }

  const packet = {
    packet_id: `pkt-${mediaId}-${sceneId}`,
    media_id: mediaId,
    scene_id: sceneId,
    scene_index: sceneIndex,
    timecode: {
      in: inTimecode,
      out: outTimecode,
      duration_sec: durationSec,
      start_sec: startSec,
      end_sec: endSec,
      start_frame: scene.start_frame !== undefined ? scene.start_frame : Math.round(startSec * fps),
      end_frame: scene.end_frame !== undefined ? scene.end_frame : Math.round(endSec * fps),
      fps,
    },
    sample_points_sec: samplePoints,
    metadata: {
      filename: mediaInfo.filename || "qianfu_ep18.mp4",
      resolution: mediaInfo.resolution || "1280x720",
      video_codec: mediaInfo.video_codec || "h264",
      audio_codec: mediaInfo.audio_codec || "aac",
      extraction_protocol: "vmv_caption_packet_v1",
      created_at: new Date().toISOString(),
    },
  };

  validateCaptionPacket(packet);
  return Object.freeze(packet);
}

/**
 * 批量生成 CaptionPacket 集合
 * @param {Array<Object>} scenes
 * @param {Object} mediaInfo
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
export function batchGenerateCaptionPackets(scenes, mediaInfo, options = {}) {
  if (!Array.isArray(scenes)) {
    throw new Error("scenes 必须是数组");
  }
  return scenes.map((scene) => generateCaptionPacket(scene, mediaInfo, options));
}
