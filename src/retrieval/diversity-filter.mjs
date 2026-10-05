/**
 * @file diversity-filter.mjs
 * @description POC-AGENT A5: 证据质量加权、时序去重与场景多样性平衡器。
 * 落实独立帧与段级继承的质量分化，抑制高度相似或相邻镜头，保障 Top20 视野的多样性。
 */

import { parseTimecodeToSeconds } from "../contracts/validators.mjs";

export class DiversityFilter {
  /**
   * @param {Object} [options]
   * @param {number} [options.topK=20] 最终截取数量
   * @param {number} [options.inheritedMultiplier=0.85] 继承镜头的质量权重系数
   * @param {number} [options.sameSceneCap=6] 单一场景环境软上限
   * @param {number} [options.nearDupSuppression=0.75] 近重复镜头的衰减惩罚
   */
  constructor(options = {}) {
    this.topK = options.topK || 20;
    this.inheritedMultiplier = options.inheritedMultiplier || 0.85;
    this.sameSceneCap = options.sameSceneCap || 6;
    this.nearDupSuppression = options.nearDupSuppression || 0.75;
  }

  /**
   * 应用质量权重并执行多样性重排
   * @param {Array<Object>} candidatesRaw 初始评分后的候选列表
   * @returns {Array<Object>} 经过多样性平衡与质量校准的 Top20 候选列表
   */
  filterAndRank(candidatesRaw) {
    if (!Array.isArray(candidatesRaw) || candidatesRaw.length === 0) {
      return [];
    }

    // 1. 应用证据质量权重与置信度衰减
    const weighted = candidatesRaw.map((cand) => {
      const prov = cand.evidence.provenance || {};
      const isInherited = prov.analysis_granularity === "segment_inherited";
      const qualityMultiplier = isInherited ? this.inheritedMultiplier : 1.0;
      const confFactor = Math.max(0.65, Math.min(1.0, cand.evidence.confidence || 0.9));

      const rawScore = cand.raw_score;
      const qualityPenalty = Number((1.0 - qualityMultiplier * confFactor).toFixed(3));
      const adjustedScore = Number((rawScore * qualityMultiplier * confFactor).toFixed(3));

      return {
        ...cand,
        quality_penalty: qualityPenalty,
        adjusted_score: adjustedScore,
      };
    });

    // 2. 按加权后得分降序排序
    weighted.sort((a, b) => b.adjusted_score - a.adjusted_score);

    // 3. 执行时序近重复抑制与场景环境配额控制
    const selected = [];
    const remaining = [...weighted];
    const envCounts = new Map();

    while (selected.length < this.topK && remaining.length > 0) {
      // 动态更新剩余镜头的惩罚分
      remaining.forEach((item) => {
        let penalty = 1.0;

        // A. 场景多样性上限抑制
        const envKey = item.evidence.scene_env || "unknown";
        const curCount = envCounts.get(envKey) || 0;
        if (curCount >= this.sameSceneCap) {
          penalty *= 0.75; // 超过软上限时衰减
        }

        // B. 时序临近与内容高度重复抑制
        const getTimeSec = (ev) => {
          if (!ev || !ev.timecode) return { inSec: 0, outSec: 0 };
          let inSec = 0;
          let outSec = 0;
          if (typeof ev.timecode.in === "string" && typeof ev.timecode.out === "string") {
            try {
              inSec = parseTimecodeToSeconds(ev.timecode.in);
              outSec = parseTimecodeToSeconds(ev.timecode.out);
              return { inSec, outSec };
            } catch {}
          }
          const fps = ev.timecode.fps || 25;
          inSec = (ev.timecode.start_frame || 0) / fps;
          outSec = (ev.timecode.end_frame || 0) / fps;
          return { inSec, outSec };
        };

        const itemTimes = getTimeSec(item.evidence);

        for (const sel of selected) {
          const selTimes = getTimeSec(sel.evidence);
          const timeDist = Math.abs(itemTimes.inSec - selTimes.outSec);
          // 如果与已选镜头在 3 秒以内且对白或动作重复
          if (timeDist <= 3.0) {
            const sameDialogue = item.evidence.dialogue && item.evidence.dialogue === sel.evidence.dialogue;
            const sameActions = item.evidence.physical_actions && sel.evidence.physical_actions &&
              item.evidence.physical_actions[0] === sel.evidence.physical_actions[0];

            if (sameDialogue || sameActions) {
              penalty *= this.nearDupSuppression;
              break;
            }
          }
        }

        item.current_score = Number((item.adjusted_score * penalty).toFixed(3));
      });

      // 重新排序剩余池
      remaining.sort((a, b) => b.current_score - a.current_score);

      // 弹出最优者
      const best = remaining.shift();
      selected.push(best);

      // 更新场景环境计数
      const bestEnv = best.evidence.scene_env || "unknown";
      envCounts.set(bestEnv, (envCounts.get(bestEnv) || 0) + 1);
    }

    return selected;
  }
}
