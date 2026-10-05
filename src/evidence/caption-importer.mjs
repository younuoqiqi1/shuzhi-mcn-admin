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
 * 片尾曲/插曲歌词模式库（针对《潜伏》主题曲《深海》及背景歌词）
 */
export const LYRICS_PATTERNS = [
  /我的(信仰|泪水|涓水|信).*?深海/,
  /澎湃着心中火焰/,
  /燃烧无尽的力量/,
  /那是(忠诚|真爱)永在/,
  /是真爱永在/,
  /温暖若停在你心里/,
  /生命只.*?一个信仰/,
  /对你的爱已无言/,
  /在黑夜里梦.*?着光/,
  /心中覆盖悲伤/,
  /在悲伤里忍受孤独/,
  /空守一丝温暖/,
  /无论谁能听见/,
  /愿用一生祝愿/,
  /相信无尽的力量/,
  /那是感m[^\s]*/,
];

/**
 * 职员表、演员表、制作单位等 Credits 模式库
 */
export const CREDITS_PATTERNS = [
  /演员表|演职员表?|职员表|参加演出|富品表/,
  /出品人?|制片人?|执行制片|总监制|监制|总策划|策划/,
  /副导潢|副导演|导演|编剧|摄一影|摄像|摄影|剪辑|男辑|美一术|美术|录\s*音|录音/,
  /灯光|服装|化\s*妆|化妆|道具|置景|场记|统筹|统算|场务|剧务|司机/,
  /生活制片|现场制片|现场道具|道具设计|制片主任|责任编辑|摄影助理|服装助理|化妆助理|灯光助理|动画视效.*?/,
  /旁一白|旁\s*白|旁白|鸣谢.*?|许可证号?.*?|剧审字.*?号|同名小说改编|原二?著.*?/,
  /作词|作曲|音乐制作人?|音乐录音|演奏|指挥|合唱|独唱|主题歌.*?/,
  /新浪娱乐.*?|影视文化.*?公司|电视台|广播电视集团|独家发行|联合拍摄|联合出品|第\d+集|\(?粤\)?剧审字.*?号/,
  /(余则成|翠平|李涯|吴站长|站长|陆桥山|左蓝|晚秋|穆晚秋|谢若林|马奎|秋掌柜|吴太太|廖三民|李海丰|徐宝凤|王占金|洪秘书|盛乡|吕宗方|罗掌柜)[\s\S]{0,3}(一一|——|--|-|一二)\s*[\u4e00-\u9fa5]{2,4}/,
  /(一一|——|--)\s*[\u4e00-\u9fa5]{2,4}/,
  /《?姜伟\s*付玮》?/,
  /张宏震|区念中|陈炜|张靜|张静|余瑞金|陆群|华明|何继昌|卢锋|王海涛|徐红兵|张译水|李继麟|黄嘉超|尚菲璇|王\s*然|冯震|王晓锋|韩\s*葆|周新霞|张玮|刘永梅|李\s*苏|张虹颖|李晓燕|娄亚江|施维聪|董清萍|薛迎娣|马树英|胡庭鑫|赵书平|陈家余|孙书明|薛耿亚|张玉彬|雷云华|高琳|杨焰|汪\s*壮|完美动力|刘昕|史炜|阿•亚历山大罗夫|亚洲爱乐|杨屹|赵坤宇|关正跃|朱昆强|刘麟|中国交响乐团|中国爱乐乐团|李岳松|赵海健|王飞|董源平|严红|徐桂花|周晓燕|马旭|蔡传艳|周元庆|王兴龙|钱林宏|谢涛|将永成|孙\s*亮|蔺\s*丹|郑彦庆|边晓九|杨宏|杜志军|朱建华|陈君君|李辉|陆旭健|孔伟|张进刚|申有恩|应新华|韦文洪|任玉红|张小志|韩红民|羊妙龙|张子嫣|周志海|饶\s*刚|葛石柱|张国庆|李金蔚|于子宽|冬\s*軍波|张家俊|王建亚|任学海|叶新宇|毛建平|韩振华|田\s*野|齐为|张国锋|何志涛|杨军|刚\s*瀑|王\s*宏|童剑刚|白利卫|冯瀑|陈培莉|魏\s*斌|金永明|崔蔓莉|饶金杰|高一清|吴利华|李铁军|王宏波|赵昌峰|李\s*军|杨晓强|宋纪成|焦建伟|杨念波|郝宗君|赵思全|窦莉莉|爱媒森|青雨影视|南方电视台|南京启播|广州诗咏/
];

/**
 * 校验并清洗文本中的演员表、职员表、片尾歌词等非剧情台词
 * @param {string} text 原始 OCR 字幕文本
 * @param {Object} [context] { start_sec, end_sec }
 * @returns {{ cleanText: string, is_credits: boolean, is_lyrics: boolean, text_type: "dialogue" | "credits" | "lyrics" | "empty" }}
 */
export function filterCreditsAndLyrics(text, context = {}) {
  if (!text || typeof text !== "string") {
    return { cleanText: "", is_credits: false, is_lyrics: false, text_type: "empty" };
  }

  const startSec = context.start_sec !== undefined ? context.start_sec : 0;
  const endSec = context.end_sec !== undefined ? context.end_sec : 2702.013;

  // 1. 全局绝对片尾区间 (2530s~2702s 为全曲深海与滚屏演职员表，剧集剧情对白已在此前结束)
  if (startSec >= 2530.0) {
    const isCredit = CREDITS_PATTERNS.some((p) => p.test(text));
    return {
      cleanText: "",
      is_credits: isCredit,
      is_lyrics: true,
      text_type: isCredit ? "credits" : "lyrics",
    };
  }

  // 2. 片头字幕与演职员区间 (0~95s 为全片头报幕、剧审字与主创字幕，98s 陆桥山离去开始才有真实台词)
  if (endSec <= 95.0) {
    return {
      cleanText: "",
      is_credits: true,
      is_lyrics: false,
      text_type: "credits",
    };
  }

  // 3. 中间剧情段：精确识别并剥离嵌入的 credits 或歌词
  let isCredit = CREDITS_PATTERNS.some((p) => p.test(text));
  let isLyric = LYRICS_PATTERNS.some((p) => p.test(text));

  let cleaned = text;
  if (isCredit) {
    for (const cp of CREDITS_PATTERNS) {
      cleaned = cleaned.replace(cp, " ");
    }
  }
  if (isLyric) {
    for (const lp of LYRICS_PATTERNS) {
      cleaned = cleaned.replace(lp, " ");
    }
  }

  // 清理残余符号与多余空格
  cleaned = cleaned.replace(/[\(\)（）《》:：•一-]/g, " ").replace(/\s+/g, " ").trim();

  // 若清理后有效字数不足 3 且包含无意义字符，则视为空白对白
  if (cleaned.length < 3) {
    cleaned = "";
  }

  let textType = "dialogue";
  if (!cleaned) {
    if (isCredit) textType = "credits";
    else if (isLyric) textType = "lyrics";
    else textType = "empty";
  }

  return {
    cleanText: cleaned,
    is_credits: isCredit,
    is_lyrics: isLyric,
    text_type: textType,
  };
}

/**
 * 根据场景的时码窗口，从字幕列表中提取属于该场景窗口的台词文本与置信度
 * 严格过滤片尾演员表、歌词与片头主创 OCR 污染
 * @param {Object} timecode { in, out, start_sec, end_sec }
 * @param {Array<Object>} subtitles [{ start_sec, end_sec, text, confidence }]
 * @returns {{ dialogue: string, avgConfidence: number, matchCount: number, text_type: string, is_credits: boolean, is_lyrics: boolean }}
 */
export function matchDialoguesForTimecode(timecode, subtitles) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return { dialogue: "", avgConfidence: 1.0, matchCount: 0, text_type: "none", is_credits: false, is_lyrics: false };
  }

  const startSec = timecode.start_sec !== undefined ? timecode.start_sec : toSeconds(timecode.in);
  const endSec = timecode.end_sec !== undefined ? timecode.end_sec : toSeconds(timecode.out);

  const matched = [];
  let totalConf = 0;
  let hasCredits = false;
  let hasLyrics = false;
  let speechCount = 0;

  for (const sub of subtitles) {
    const subStart = sub.start_sec !== undefined ? sub.start_sec : toSeconds(sub.start_timecode);
    const subEnd = sub.end_sec !== undefined ? sub.end_sec : toSeconds(sub.end_timecode);

    // 检查时间窗口重叠：[subStart, subEnd] 与 [startSec, endSec]
    const overlapStart = Math.max(startSec, subStart);
    const overlapEnd = Math.min(endSec, subEnd);
    if (overlapEnd > overlapStart) {
      // 执行演职员表与歌词严格清洗
      const filtered = filterCreditsAndLyrics(sub.text.trim(), { start_sec: subStart, end_sec: subEnd });
      if (filtered.is_credits) hasCredits = true;
      if (filtered.is_lyrics) hasLyrics = true;

      if (filtered.cleanText) {
        matched.push(filtered.cleanText);
        speechCount++;
        totalConf += sub.confidence || 0.95;
      }
    }
  }

  const uniqueTexts = Array.from(new Set(matched));
  const dialogueText = uniqueTexts.join(" ");
  const avgConf = speechCount > 0 ? Math.round((totalConf / speechCount) * 1000) / 1000 : 1.0;

  let textType = "dialogue";
  if (!dialogueText) {
    if (hasCredits) textType = "credits";
    else if (hasLyrics) textType = "lyrics";
    else textType = "none";
  }

  return {
    dialogue: dialogueText,
    avgConfidence: avgConf,
    matchCount: speechCount,
    text_type: textType,
    is_credits: hasCredits,
    is_lyrics: hasLyrics,
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

  const hasSpeech = dialogueMatch.matchCount > 0 && !!dialogueMatch.dialogue;
  const audioInfo = {
    codec: mediaInfo.audio_codec || "aac",
    channels: mediaInfo.channels || 2,
    sample_rate: mediaInfo.sample_rate || 44100,
    has_speech: hasSpeech,
    text_type: dialogueMatch.text_type,
    audio_features: hasSpeech
      ? ["dialogue_present"]
      : (dialogueMatch.is_lyrics ? ["theme_song_or_music"] : ["ambient_or_music"]),
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
      pipeline: "vmv_caption_packet_v1 + vision_subtitle_ocr + visual_sampling + credits_filter_v1",
      analysis_granularity: visualAnnotation.analysis_granularity || "independent_keyframe",
      source_segment_id: visualAnnotation.source_segment_id || null,
      sample_frame_refs: visualAnnotation.sample_frame_refs || [Math.round(((startSec + endSec) / 2) * fps)],
      has_verified_ocr_dialogue: hasSpeech,
      dialogue_matches: dialogueMatch.matchCount,
      text_type: dialogueMatch.text_type,
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
