/**
 * @file structured-matcher.mjs
 * @description POC-AGENT A5: 结构化物理属性匹配器。
 * 对人物角色、场景物理环境、镜头语言与时间码范围提示进行严格结构化相关性评分。
 */

import { parseTimecodeToSeconds } from "../../contracts/validators.mjs";

export class StructuredMatcher {
  /**
   * 计算结构化匹配得分
   * @param {Object} requirement MaterialRequirement 诉求
   * @param {Object} evidence ObjectiveEvidence 物理证据
   * @returns {{ score: number, details: Object }}
   */
  match(requirement, evidence) {
    let charScore = 1.0;
    const matchedChars = [];

    // 1. 角色交集匹配
    if (Array.isArray(requirement.desired_characters) && requirement.desired_characters.length > 0) {
      const desired = requirement.desired_characters;
      const actual = evidence.characters || [];

      let hits = 0;
      for (const dc of desired) {
        if (actual.some((ac) => ac.includes(dc) || dc.includes(ac))) {
          hits++;
          matchedChars.push(dc);
        }
      }

      // 如果诉求了 2 个人物且全部命中，得满分；命中 1 个得 0.6；全无得 0.0
      if (desired.length === 1) {
        charScore = hits > 0 ? 1.0 : 0.0;
      } else {
        charScore = hits === desired.length ? 1.0 : hits > 0 ? 0.6 : 0.0;
      }
    }

    // 2. 场景空间环境匹配
    let envScore = 0.5; // 默认中性得分
    let envMatched = false;
    if (requirement.desired_scene_env && typeof requirement.desired_scene_env === "string") {
      const targetEnv = requirement.desired_scene_env.toLowerCase();
      const actualEnv = (evidence.scene_env || "").toLowerCase();
      const actualDesc = (evidence.visual_description || "").toLowerCase();

      // 提取核心关键词（如 办公室, 客厅, 走廊, 站台, 列车, 卧室, 餐厅, 街道）
      const keywords = ["办公室", "客厅", "走廊", "站台", "列车", "火车", "卧室", "餐厅", "街道", "机要室", "大门"];
      for (const kw of keywords) {
        if (targetEnv.includes(kw)) {
          if (actualEnv.includes(kw) || actualDesc.includes(kw)) {
            envScore = 1.0;
            envMatched = true;
            break;
          }
        }
      }

      if (!envMatched && (actualEnv.includes(targetEnv) || targetEnv.includes(actualEnv))) {
        envScore = 0.9;
        envMatched = true;
      } else if (!envMatched) {
        envScore = 0.2; // 明确不匹配时扣分
      }
    }

    // 3. 时码范围提示匹配（如有）
    let timeHintScore = 1.0;
    if (requirement.time_range_hint) {
      let inSec = 0;
      if (evidence.timecode) {
        if (typeof evidence.timecode.in === "string") {
          try {
            inSec = parseTimecodeToSeconds(evidence.timecode.in);
          } catch {
            inSec = (evidence.timecode.start_frame || 0) / 25;
          }
        } else {
          inSec = (evidence.timecode.start_frame || 0) / 25;
        }
      }
      const { min_sec, max_sec } = requirement.time_range_hint;
      if (min_sec !== undefined && inSec < min_sec) {
        timeHintScore = 0.5;
      } else if (max_sec !== undefined && inSec > max_sec) {
        timeHintScore = 0.5;
      }
    }

    // 综合加权
    // 角色权重 0.65，环境权重 0.25，时间提示 0.10
    const finalScore = charScore * 0.65 + envScore * 0.25 + timeHintScore * 0.10;

    return {
      score: Math.min(1.0, Math.max(0.0, Number(finalScore.toFixed(3)))),
      details: {
        character_score: charScore,
        matched_characters: matchedChars,
        scene_env_score: envScore,
        env_matched: envMatched,
        time_hint_score: timeHintScore,
      },
    };
  }
}
