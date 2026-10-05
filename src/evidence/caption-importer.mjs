/**
 * @file caption-importer.mjs
 * @description POC-AGENT A4.5: VMV 规范 Caption Importer 与 Evidence 富集器。
 * 复用 VMV 架构中的 Caption Import 规范，
 * 将客观镜头/切片与真实字幕流 (ASR/OCR)、视觉画面采样、角色与物理动作观测数据对齐整合，
 * 产出符合 ObjectiveEvidence 严格规范的富集 L1 证据条目，并带有完整 provenance 与 confidence。
 * 
 * 严格铁律：禁止任何 Persona、博主视角、叙事解释 (affordance) 或解说词 (narration) 渗入 L1。
 */

import {
  UNAVAILABLE,
  secondsToTimecode,
  parseTimecodeToSeconds,
  validateObjectiveEvidence,
} from "./objective-evidence.mjs";

/**
 * 将时间码转为浮点秒数辅助函数
 * @param {string|number} tc 
 * @returns {number}
 */
function toSeconds(tc) {
  if (typeof tc === "number") return tc;
  return parseTimecodeToSeconds(tc);
}

/**
 * 根据场景的时码窗口，从字幕列表中提取属于该场景窗口的台词文本与置信度
 * @param {Object} timecode { in, out, start_sec, end_sec }
 * @param {Array<Object>} subtitles [{ start_sec, end_sec, text, confidence }]
 * @returns {{ dialogue: string, avgConfidence: number, matchCount: number }}
 */
export function matchDialoguesForTimecode(timecode, subtitles) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return { dialogue: "", avgConfidence: 1.0, matchCount: 0 };
  }

  const startSec = timecode.start_sec !== undefined ? timecode.start_sec : toSeconds(timecode.in);
  const endSec = timecode.end_sec !== undefined ? timecode.end_sec : toSeconds(timecode.out);

  const matched = [];
  let totalConf = 0;

  for (const sub of subtitles) {
    const subStart = sub.start_sec !== undefined ? sub.start_sec : toSeconds(sub.start_timecode);
    const subEnd = sub.end_sec !== undefined ? sub.end_sec : toSeconds(sub.end_timecode);

    // 检查时间窗口重叠：[subStart, subEnd] 与 [startSec, endSec]
    const overlapStart = Math.max(startSec, subStart);
    const overlapEnd = Math.min(endSec, subEnd);
    if (overlapEnd > overlapStart) {
      matched.push(sub.text.trim());
      totalConf += sub.confidence || 0.95;
    }
  }

  const uniqueTexts = Array.from(new Set(matched));
  const dialogueText = uniqueTexts.join(" ");
  const avgConf = matched.length > 0 ? Math.round((totalConf / matched.length) * 1000) / 1000 : 1.0;

  return {
    dialogue: dialogueText,
    avgConfidence: avgConf,
    matchCount: matched.length,
  };
}

/**
 * 导入并富集单个镜头场景为标准 ObjectiveEvidence
 * @param {Object} params
 * @param {Object} params.scene 场景数据 (来自 VMV Stage 1 或 cut-recheck)
 * @param {Object} params.mediaInfo 媒体元数据
 * @param {Array<Object>} [params.subtitles] 真实台词/字幕序列
 * @param {Object} [params.visualAnnotation] 对应场景的视觉观测标注 { characters, scene_env, physical_actions, visual_description, camera }
 * @returns {Object} 符合 validateObjectiveEvidence 校验的 L1 证据对象
 */
export function importEnrichedEvidenceItem({
  scene,
  mediaInfo,
  subtitles = [],
  visualAnnotation = {},
}) {
  const mediaId = mediaInfo.media_id || "qianfu_ep18_720p_25fps";
  const sceneIndex = scene.index || 1;
  const sceneId = scene.scene_id || `scene_${String(sceneIndex).padStart(4, "0")}`;
  const evidenceId = `${mediaId}:${sceneId}`;
  const fps = Number(scene.fps) || Number(mediaInfo.fps) || 25.0;

  const startSec = typeof scene.start_sec === "number" ? scene.start_sec : toSeconds(scene.start_timecode);
  const endSec = typeof scene.end_sec === "number" ? scene.end_sec : toSeconds(scene.end_timecode);
  const durationSec = typeof scene.duration_sec === "number" ? scene.duration_sec : Math.round((endSec - startSec) * 1000) / 1000;

  const inTimecode = secondsToTimecode(startSec);
  const outTimecode = secondsToTimecode(endSec);

  // 1. 匹配对白
  const timecodeInfo = { in: inTimecode, out: outTimecode, start_sec: startSec, end_sec: endSec, duration_sec: durationSec };
  const dialogueMatch = matchDialoguesForTimecode(timecodeInfo, subtitles);

  // 2. 匹配视觉标注 (人物、动作、环境、构图)
  const characters = Array.isArray(visualAnnotation.characters) ? visualAnnotation.characters : [];
  const physicalActions = Array.isArray(visualAnnotation.physical_actions) ? visualAnnotation.physical_actions : [];
  const sceneEnv = typeof visualAnnotation.scene_env === "string" ? visualAnnotation.scene_env : "";
  const visualDesc = typeof visualAnnotation.visual_description === "string" ? visualAnnotation.visual_description : "";
  
  const camera = visualAnnotation.camera && typeof visualAnnotation.camera === "object"
    ? visualAnnotation.camera
    : {
        shot_type: visualAnnotation.shot_type || "medium_shot",
        angle: visualAnnotation.angle || "eye_level",
        movement: visualAnnotation.movement || "static",
      };

  const hasSpeech = dialogueMatch.matchCount > 0;
  const audioInfo = {
    codec: mediaInfo.audio_codec || "aac",
    channels: mediaInfo.channels || 2,
    sample_rate: mediaInfo.sample_rate || 44100,
    has_speech: hasSpeech,
    audio_features: hasSpeech ? ["dialogue_present"] : ["ambient_or_music"],
  };

  const sourceInfo = {
    type: "vmv_stage1_manifest",
    filename: mediaInfo.filename || "qianfu_ep18.mp4",
    relative_path: mediaInfo.relative_path || "data/input/qianfu_ep18.mp4",
    resolution: mediaInfo.resolution || "1280x720",
    video_codec: mediaInfo.video_codec || "h264",
    audio_codec: mediaInfo.audio_codec || "aac",
    fps,
    total_media_duration_sec: mediaInfo.duration_sec || 2702.013,
  };

  // 计算综合置信度
  const baseConfidence = visualAnnotation.confidence !== undefined ? visualAnnotation.confidence : 0.95;
  const finalConfidence = Math.min(baseConfidence, dialogueMatch.avgConfidence);

  const evidence = {
    evidence_id: evidenceId,
    media_id: mediaId,
    scene_id: sceneId,
    timecode: {
      in: inTimecode,
      out: outTimecode,
      duration_sec: durationSec,
      start_frame: scene.start_frame !== undefined ? scene.start_frame : Math.round(startSec * fps),
      end_frame: scene.end_frame !== undefined ? scene.end_frame : Math.round(endSec * fps),
      fps,
    },
    source: sourceInfo,
    dialogue: dialogueMatch.dialogue, // 空白时为空字符串，符合 string 类型要求
    characters: characters,           // 角色名数组
    physical_actions: physicalActions,// 物理动作事实数组
    camera: camera,                   // 景别运镜
    audio: audioInfo,
    scene_env: sceneEnv,              // 客观场景环境
    visual_description: visualDesc,   // 客观视觉画面描述
    provenance: {
      source: mediaInfo.filename || "qianfu_ep18.mp4",
      pipeline: "vmv_caption_packet_v1 + vision_subtitle_ocr + visual_sampling",
      analysis_granularity: visualAnnotation.analysis_granularity || "independent_keyframe",
      source_segment_id: visualAnnotation.source_segment_id || null,
      sample_frame_refs: visualAnnotation.sample_frame_refs || [Math.round(((startSec + endSec) / 2) * fps)],
      has_verified_ocr_dialogue: hasSpeech,
      dialogue_matches: dialogueMatch.matchCount,
      timestamp: new Date().toISOString(),
    },
    confidence: Math.round(finalConfidence * 1000) / 1000,
  };

  validateObjectiveEvidence(evidence);
  return Object.freeze(evidence);
}

/**
 * 批量导入富集 L1 Evidence
 * @param {Object} params
 * @param {Array<Object>} params.scenes
 * @param {Object} params.mediaInfo
 * @param {Array<Object>} [params.subtitles]
 * @param {Record<string, Object>} [params.visualAnnotationsMap] key: scene_id 或 sceneIndex
 * @returns {Array<Object>}
 */
export function importEnrichedEvidenceBatch({
  scenes,
  mediaInfo,
  subtitles = [],
  visualAnnotationsMap = {},
}) {
  if (!Array.isArray(scenes)) {
    throw new Error("scenes 必须是数组");
  }

  return scenes.map((scene, idx) => {
    const sceneIndex = scene.index || idx + 1;
    const sceneId = scene.scene_id || `scene_${String(sceneIndex).padStart(4, "0")}`;
    const annotation = visualAnnotationsMap[sceneId] || visualAnnotationsMap[String(sceneIndex)] || {};

    return importEnrichedEvidenceItem({
      scene,
      mediaInfo,
      subtitles,
      visualAnnotation: annotation,
    });
  });
}
