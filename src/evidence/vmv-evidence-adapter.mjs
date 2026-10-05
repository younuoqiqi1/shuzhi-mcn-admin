/**
 * @file vmv-evidence-adapter.mjs
 * @description POC-AGENT A2: VMV Stage 1 产物接入适配器。
 * 读取并复用 video-moment-validation Stage 1 真实产物，不重新实现视频分析。
 * 缺失字段强制标记为 'unavailable'，禁止模型臆造。
 */

import { readFileSync } from "node:fs";
import {
  UNAVAILABLE,
  secondsToTimecode,
  smpteToTimecode,
  validateObjectiveEvidence,
} from "./objective-evidence.mjs";

/**
 * 从 VMV Stage 1 的 manifest 与 scenes 文件载入并转换为标准 ObjectiveEvidence 数组
 * @param {string|Object} manifestInput manifest 文件绝对路径或已解析的 JSON 对象
 * @param {string|Object} scenesInput scenes 文件绝对路径或已解析的 JSON 对象
 * @returns {Array<Object>} 统一规范的 ObjectiveEvidence 对象列表
 */
export function loadVMVStage1Artifacts(manifestInput, scenesInput) {
  let manifest = typeof manifestInput === "string" ? JSON.parse(readFileSync(manifestInput, "utf8")) : manifestInput;
  let scenesDoc = typeof scenesInput === "string" ? JSON.parse(readFileSync(scenesInput, "utf8")) : scenesInput;

  if (!manifest || !manifest.media) {
    throw new Error("无效的 VMV media_manifest 结构: 缺少 media 对象");
  }
  if (!scenesDoc || !Array.isArray(scenesDoc.scenes)) {
    throw new Error("无效的 VMV scenes 清单结构: 缺少 scenes 数组");
  }

  const media = manifest.media;
  const mediaId = media.media_id;
  const fps = Number(scenesDoc.fps) || Number(media.video?.fps) || 25.0;

  const evidenceList = scenesDoc.scenes.map((scene, idx) => {
    const sceneIndex = scene.index || idx + 1;
    const sceneId = `scene_${String(sceneIndex).padStart(4, "0")}`;
    const evidenceId = `${mediaId}:${sceneId}`;

    // 处理时间码
    let inTimecode;
    let outTimecode;
    if (typeof scene.start_sec === "number" && typeof scene.end_sec === "number") {
      inTimecode = secondsToTimecode(scene.start_sec);
      outTimecode = secondsToTimecode(scene.end_sec);
    } else if (scene.start_timecode && scene.end_timecode) {
      inTimecode = smpteToTimecode(scene.start_timecode, fps);
      outTimecode = smpteToTimecode(scene.end_timecode, fps);
    } else {
      throw new Error(`Scene ${sceneId} 缺失有效时间信息`);
    }

    const durationSec =
      typeof scene.duration_sec === "number"
        ? scene.duration_sec
        : Math.round(((scene.end_sec || 0) - (scene.start_sec || 0)) * 1000) / 1000;

    // 对齐客观源信息
    const sourceInfo = {
      type: "vmv_stage1_manifest",
      filename: media.filename || UNAVAILABLE,
      relative_path: media.relative_path || UNAVAILABLE,
      resolution: media.video ? `${media.video.width}x${media.video.height}` : UNAVAILABLE,
      video_codec: media.video?.codec || UNAVAILABLE,
      audio_codec: media.audio?.codec || UNAVAILABLE,
      fps,
      total_media_duration_sec: media.duration_sec || UNAVAILABLE,
    };

    // 客观字段判断：如果 VMV 没有，一律标记为 UNAVAILABLE，禁止任何臆造
    let dialogueValue = UNAVAILABLE;
    if (scene.dialogue && typeof scene.dialogue === "string" && scene.dialogue.trim()) {
      dialogueValue = scene.dialogue.trim();
    } else if (media.subtitles && media.subtitles.length > 0) {
      // 若将来 VMV 有字幕流提取，可在此处取值，当前无则保持 UNAVAILABLE
      dialogueValue = UNAVAILABLE;
    }

    const charactersValue = Array.isArray(scene.characters) && scene.characters.length > 0 ? scene.characters : UNAVAILABLE;
    const actionsValue = Array.isArray(scene.actions) && scene.actions.length > 0 ? scene.actions : UNAVAILABLE;
    const cameraValue = scene.camera && typeof scene.camera === "object" ? scene.camera : UNAVAILABLE;

    const audioInfo = {
      codec: media.audio?.codec || UNAVAILABLE,
      channels: media.audio?.channels || UNAVAILABLE,
      sample_rate: media.audio?.sample_rate || UNAVAILABLE,
      audio_features: UNAVAILABLE,
    };

    const evidence = {
      evidence_id: evidenceId,
      media_id: mediaId,
      scene_id: sceneId,
      timecode: {
        in: inTimecode,
        out: outTimecode,
        duration_sec: durationSec,
        start_frame: scene.start_frame !== undefined ? scene.start_frame : null,
        end_frame: scene.end_frame !== undefined ? scene.end_frame : null,
        fps,
      },
      source: sourceInfo,
      dialogue: dialogueValue,
      characters: charactersValue,
      physical_actions: actionsValue,
      camera: cameraValue,
      audio: audioInfo,
    };

    validateObjectiveEvidence(evidence);
    return Object.freeze(evidence);
  });

  return evidenceList;
}

/**
 * 载入经过 A4.5 真实对齐富集后的 L1 Evidence 集合
 * 包含从真实视频 OCR 提取的对白台词、人物角色识别、客观动作、场景环境、视觉描述与 provenance
 * @param {string|Array<Object>} [input] 文件路径或已解析的 JSON 数组 (默认读取内置 enriched_evidence_qianfu_ep18.json)
 * @returns {Array<Object>} 经过 validateObjectiveEvidence 严格校验的 ObjectiveEvidence 数组
 */
export function loadEnrichedEvidenceArtifacts(input) {
  let list;
  if (!input) {
    const defaultPath = new URL("./data/enriched_evidence_qianfu_ep18.json", import.meta.url).pathname;
    list = JSON.parse(readFileSync(defaultPath, "utf8"));
  } else if (typeof input === "string") {
    list = JSON.parse(readFileSync(input, "utf8"));
  } else if (Array.isArray(input)) {
    list = input;
  } else {
    throw new Error("无效的富集 Evidence 输入");
  }

  return list.map((item) => {
    validateObjectiveEvidence(item);
    return Object.freeze(item);
  });
}
