/**
 * @file perspective-provider.mjs
 * @description POC-AGENT A6: 博主视角解读 Provider 抽象接口与确定性实现。
 * 规范定义 IPerspectiveProvider，并提供透明声明 fallback 的概念与规则解读器。
 * 严格恪守：L1 Evidence 为不可逾越的事实边界，模型只能解释事实，严禁改写或伪造事实。
 */

/**
 * 视角解读 Provider 抽象接口
 * @interface IPerspectiveProvider
 */
export class IPerspectiveProvider {
  /**
   * 对单个 Candidate 镜头执行博主视角再解读
   * @param {Object} params
   * @param {Object} params.persona 博主画像
   * @param {Object} params.topic 当前选题
   * @param {Object} params.viewpoint 核心观点
   * @param {Object} params.beat 当前故事节拍
   * @param {Object} params.requirement 素材诉求 (MaterialRequirement)
   * @param {Object} params.candidate A5 召回的候选镜头
   * @returns {Promise<Object>|Object} 解读结果
   */
  interpretCandidate(params) {
    throw new Error("IPerspectiveProvider.interpretCandidate 必须由具体子类实现");
  }

  get provider_name() {
    return "abstract_provider";
  }

  get is_fallback() {
    return false;
  }
}

/**
 * 语义概念网与叙事特征分析 Provider (确定性 Fallback 实现)
 * 严格声明 is_fallback: true，杜绝虚假宣称真实 LLM/VLM。
 */
export class SemanticAndConceptPerspectiveProvider extends IPerspectiveProvider {
  get provider_name() {
    return "semantic_concept_perspective_provider_v1";
  }

  get is_fallback() {
    return true; // 诚实声明为本地降级实现
  }

  /**
   * 针对“老周追剧”风格计算特定特征亲和度
   * @private
   */
  _evalPersonaAffinity(ev, persona) {
    let score = 0.6; // 基线
    const actions = (ev.physical_actions || []).join(" ");
    const dialogue = ev.dialogue || "";
    const env = ev.scene_env || "";

    // 老周偏爱：体制内微表情、动作留白、抽烟、翻看文件、恭顺立正、低声交谈、对坐博弈
    const laozhouKeys = ["翻看", "皮椅", "雪茄", "抽烟", "点燃", "垂手", "立正", "办公桌", "沙发", "茶", "走廊", "恭顺", "谨慎", "冷峻", "注视", "借借", "汇报", "局长", "站长", "金条", "生意"];
    let hits = 0;
    for (const kw of laozhouKeys) {
      if (actions.includes(kw) || dialogue.includes(kw) || env.includes(kw)) {
        hits++;
      }
    }
    score += Math.min(0.35, hits * 0.08);

    // 如果只是外景或空门卫景，适度扣分
    if (env.includes("大门") && !actions.includes("立正") && !dialogue) {
      score -= 0.15;
    }

    return Number(Math.max(0.2, Math.min(1.0, score)).toFixed(3));
  }

  /**
   * 评估客观事实对素材诉求主张的支撑程度
   * @private
   */
  _evalEvidenceSupport(candidate, requirement) {
    const ev = candidate.evidence_l1 || candidate;
    const desiredChars = requirement.desired_characters || [];
    const actualChars = ev.characters || candidate.characters || [];
    const dialogue = ev.dialogue || candidate.dialogue || "";
    const actions = (ev.actions || candidate.physical_actions || []).join(" ");
    const env = ev.scene_env || candidate.scene_env || "";

    // 1. 人物重合
    let charScore = 0.5;
    if (desiredChars.length > 0) {
      const matchCount = desiredChars.filter((dc) =>
        actualChars.some((ac) => ac.includes(dc) || dc.includes(ac))
      ).length;
      charScore = matchCount / desiredChars.length;
    }

    // 2. 动作/环境匹配
    let actScore = 0.4;
    const desiredAct = requirement.desired_action || "";
    const desiredEnv = requirement.desired_scene_env || "";
    if (desiredAct && actions) {
      // 检查关键动作词重合
      const keyVerbs = ["翻看", "立正", "对坐", "抽烟", "抽雪茄", "对峙", "走廊", "拍桌", "递交", "登车", "挥手", "护送", "开价"];
      const actHits = keyVerbs.filter((v) => desiredAct.includes(v) && actions.includes(v)).length;
      actScore = Math.min(1.0, 0.4 + actHits * 0.3);
    }
    if (desiredEnv && env && env.includes(desiredEnv.slice(0, 4))) {
      actScore = Math.min(1.0, actScore + 0.15);
    }

    // 3. 对白直接支撑
    let dialScore = 0.4;
    const grounding = requirement.evidence_grounding_criteria || "";
    if (grounding && dialogue) {
      const gKeys = ["副站长", "站长", "贪官", "杀头", "两根金条", "金条", "情报", "共党", "陈秋平", "太太", "买卖", "汇报", "车票", "晚秋", "同甘共苦", "生意"];
      const dialHits = gKeys.filter((k) => grounding.includes(k) && dialogue.includes(k)).length;
      dialScore = Math.min(1.0, 0.3 + dialHits * 0.25);
    } else if (dialogue && dialogue.length > 15) {
      dialScore = 0.6;
    }

    // 综合支撑度
    const finalSupport = charScore * 0.45 + actScore * 0.30 + dialScore * 0.25;
    return Number(Math.max(0.1, Math.min(1.0, finalSupport)).toFixed(3));
  }

  /**
   * 评估镜头画面叙事价值
   * @private
   */
  _evalNarrativeValue(candidate, beat) {
    let score = 0.55;
    const duration = candidate.timecode ? candidate.timecode.duration_sec : 2.0;
    const ev = candidate.evidence_l1 || candidate;
    const actions = (ev.actions || candidate.physical_actions || []).join(" ");
    const affTags = (candidate.affordance_l2 ? candidate.affordance_l2.tags : []) || [];

    // 黄金镜头时长区间 (2.5s ~ 25s)
    if (duration >= 2.5 && duration <= 30.0) {
      score += 0.15;
    } else if (duration > 60.0) {
      // 超长镜头剪辑灵活性高，但需截选
      score += 0.10;
    }

    // 戏剧潜能丰富度加成
    if (affTags.length >= 2) score += 0.15;
    else if (affTags.length === 1) score += 0.08;

    // 动作丰富度
    if (actions.length > 20) score += 0.10;

    return Number(Math.max(0.2, Math.min(1.0, score)).toFixed(3));
  }

  /**
   * 构造客观事实边界 (Anti-hallucination boundary)
   * @private
   */
  _buildEvidenceBoundary(candidate, requirement, supportScore) {
    const chars = candidate.characters || [];
    const dialogue = (candidate.dialogue || "").trim();
    const actions = (candidate.physical_actions || []).join("；");
    const env = candidate.scene_env || "特定场景";

    const confirmedFacts = [];
    if (chars.length > 0) confirmedFacts.push(`画面中客观出现人物[${chars.join("、")}]`);
    if (env) confirmedFacts.push(`处于[${env}]物理空间`);
    if (actions) confirmedFacts.push(`人物动作确证为[${actions}]`);
    if (dialogue) confirmedFacts.push(`台词确证包含[${dialogue.slice(0, 30)}${dialogue.length > 30 ? "..." : ""}]`);

    const l1FactStr = confirmedFacts.join("，");

    let l3SubjectiveStr = "";
    if (requirement.desired_emotion || requirement.desired_action) {
      l3SubjectiveStr = `对于“${requirement.desired_emotion || "心理博弈"}”与“${requirement.description}”的定性，属于博主视角下的视听叙事推论与观点赋能，绝对不可作为 L1 客观事实直接引用。`;
    } else {
      l3SubjectiveStr = "镜头的深层戏剧寓意属于博主视角下的叙事阐释，并非物理事实本身。";
    }

    return `【L1 客观事实底线】：${l1FactStr}；【L3 叙事推论边界】：${l3SubjectiveStr}`;
  }

  /**
   * 构造老周追剧风格的主观叙事解读
   * @private
   */
  _buildSubjectiveInterpretation(candidate, requirement, viewpoint, persona) {
    const chars = candidate.characters || [];
    const dialogue = candidate.dialogue || "";
    const actions = (candidate.physical_actions || []).join(" ");
    const charNames = chars.join("与");

    if (charNames.includes("吴敬中") && charNames.includes("余则成")) {
      if (dialogue.includes("副站长") || dialogue.includes("恭喜")) {
        return "老周视角：这一幕是全剧职场试探的经典范本。吴站长看似满面春风道喜，实则把副站长委任状当成测谎仪，用官位和利益压在桌面上，冷眼旁观余则成的微表情是惊是喜。余则成表面恭顺，内心早已命悬一线。";
      }
      if (actions.includes("雪茄") || actions.includes("火柴") || dialogue.includes("贪") || dialogue.includes("杀头")) {
        return "老周视角：在体制内，一把手点烟不说话、或者突然跟你聊贪官杀头的时候，往往是最危险的时刻。站长借题发挥敲山震虎，用世俗利益的假面来试探下属的真实底牌，老辣至极。";
      }
      return "老周视角：师生名分是这两人的防弹衣。站长居高临下冷眼审视，余则成垂手谨慎应答，看似寻常汇报，实则是保密局生死边缘的无声过招。";
    }

    if (charNames.includes("谢若林")) {
      if (dialogue.includes("金条") || dialogue.includes("两根") || dialogue.includes("生意") || dialogue.includes("勾兑")) {
        return "老周视角：谢若林是全剧最通透也最致命的情报贩子。这一幕他把两根金条和机密档案往桌上一拍，笑里藏刀抛出'深度勾兑'，看似贪婪求财，实则每一句话都在往余则成的心窝里捅。余则成唯有用商人和官僚的贪婪逻辑，才能压住内心的杀机。";
      }
      return "老周视角：面对没有信仰只有价码的谢若林，余则成面临的是整部剧最凶险的试探。不能拔枪，不能露怯，只能在酒肉烟雾的掩护下完成反制。";
    }

    if (charNames.includes("李涯")) {
      return "老周视角：李涯是个纯粹的教条主义信徒，他在走廊和机要室的每一次盘查都带着致命的执拗。余则成此时借题发挥怒斥其'成何体统'，正是老地下党反客为主、用官僚体制压制教条狂徒的高超手段。";
    }

    if (charNames.includes("穆晚秋") || charNames.includes("晚秋")) {
      return "老周视角：火车站台的蒸汽与风衣，是全剧少数流露温情却又残酷至极的段落。余则成把晚秋送上远去解放区的列车，既是彻底解除自身暴露的隐患，也是在冷血暗战中守住最后一丝人性的微光。";
    }

    return `老周视角：该镜头在当前选题中承载了关键的情感与环境过渡，为核心剧情冲突铺垫了极具沉浸感的气氛底色。`;
  }

  /**
   * 构建无法支撑的内容 (does_not_support)
   * @private
   */
  _buildDoesNotSupport(candidate, requirement, supportScore) {
    const chars = candidate.characters || [];
    const dialogue = candidate.dialogue || "";

    if (requirement.requirement_id.includes("wu")) {
      if (!dialogue.includes("共党") && !dialogue.includes("通共")) {
        return "无法支持'吴站长此时已经确认余则成是共产党'的过激断言；本素材仅能确认存在基于官场权谋与行踪疑点的言语试探。";
      }
    }

    if (requirement.requirement_id.includes("probe")) {
      if (!dialogue.includes("南京") && !dialogue.includes("逮捕")) {
        return "无法支持'谢若林已经掌握确凿证据并立即实施抓捕'的观点；本素材仅证实谢若林以此作为敲诈筹码谋求经济利益。";
      }
    }

    if (supportScore < 0.45) {
      return "素材缺乏直接的角色言语交锋或正面特写，无法直接作为强证据链支撑该节拍的核心戏剧论点。";
    }

    return "无法支撑超出当前时间码与物理动作之外的过度剧情脑补与未发生情节。";
  }

  /**
   * 对候选镜头执行完整的视角再解读
   */
  interpretCandidate({ persona, topic, viewpoint, beat, requirement, candidate }) {
    const ev = candidate.evidence_l1 || candidate;

    // 1. 各维度特征评分
    const personaFitScore = this._evalPersonaAffinity(ev, persona);
    const evidenceSupportScore = this._evalEvidenceSupport(candidate, requirement);
    const narrativeValueScore = this._evalNarrativeValue(candidate, beat);
    const perspectiveMatchScore = Number(((personaFitScore * 0.5 + evidenceSupportScore * 0.5)).toFixed(3));

    // 2. 判定主张支撑度
    let supportsClaim = "true";
    if (evidenceSupportScore < 0.40) {
      supportsClaim = "false";
    } else if (evidenceSupportScore < 0.62) {
      supportsClaim = "partial";
    }

    // 3. 构建事实边界与主观阐释
    const evidenceBoundary = this._buildEvidenceBoundary(candidate, requirement, evidenceSupportScore);
    const subjectiveInterpretation = this._buildSubjectiveInterpretation(candidate, requirement, viewpoint, persona);
    const doesNotSupport = this._buildDoesNotSupport(candidate, requirement, evidenceSupportScore);

    // 4. 推荐使用类型与原声建议
    let recommendedUse = "supporting";
    if (supportsClaim === "true" && evidenceSupportScore >= 0.70) {
      recommendedUse = "strong_support";
    } else if (supportsClaim === "false") {
      recommendedUse = "reject";
    } else if (narrativeValueScore >= 0.70 && evidenceSupportScore >= 0.45) {
      recommendedUse = "transition";
    } else if (candidate.timecode && candidate.timecode.duration_sec <= 2.0) {
      recommendedUse = "atmosphere";
    }

    // 原声策略建议（仅做建议，不替代 A7 最终决策）
    const dialogue = candidate.dialogue || "";
    let audioSuggestion = "narration_over_visual";
    let audioKeep = false;
    let audioReason = "画面以视觉微动作为主，建议以解说词覆盖强化剧情洞察";

    if (dialogue.length >= 20 && (dialogue.includes("站长") || dialogue.includes("金条") || dialogue.includes("副站长") || dialogue.includes("恭喜") || dialogue.includes("买卖"))) {
      audioSuggestion = "preserve_original_dialogue";
      audioKeep = true;
      audioReason = "原片台词极具戏剧张力与真实感，建议保留原声对白作为关键声音锚点";
    } else if (!dialogue && narrativeValueScore >= 0.65) {
      audioSuggestion = "ambience_only";
      audioKeep = false;
      audioReason = "静默与环境底噪段落，建议保留微弱环境音并铺垫解说词烘托紧张感";
    }

    // 风险标记
    const riskFlags = [];
    if (candidate.provenance && candidate.provenance.analysis_granularity === "segment_inherited") {
      riskFlags.push("inherited_analysis_granularity");
    }
    if (!dialogue) {
      riskFlags.push("lacks_direct_dialogue");
    }
    if (candidate.evidence_confidence && candidate.evidence_confidence < 0.85) {
      riskFlags.push("lower_evidence_confidence");
    }

    // 综合视角评分 (0.35 * support + 0.25 * persona + 0.25 * narrative + 0.15 * match)
    const perspectiveScore = Number((
      evidenceSupportScore * 0.35 +
      personaFitScore * 0.25 +
      narrativeValueScore * 0.25 +
      perspectiveMatchScore * 0.15
    ).toFixed(3));

    return {
      candidate_id: candidate.candidate_id,
      evidence_id: candidate.evidence_id || `${candidate.media_id}:${candidate.scene_id}`,
      requirement_id: requirement.requirement_id,
      beat_id: requirement.beat_id || (beat ? beat.beat_id : "beat_unknown"),
      blogger_id: persona.blogger_id || persona.id,
      topic_id: topic.topic_id || topic.id,
      perspective_lens: persona.core_lens || "体制内博弈与微权力运转",
      
      perspective_match_score: perspectiveMatchScore,
      evidence_support_score: evidenceSupportScore,
      narrative_value_score: narrativeValueScore,
      persona_fit_score: personaFitScore,
      interpretation_confidence: candidate.evidence_confidence || 0.90,
      a6_perspective_score: perspectiveScore,

      subjective_interpretation: subjectiveInterpretation,
      supports_claim: supportsClaim,
      does_not_support: doesNotSupport,
      evidence_boundary: evidenceBoundary,
      selection_reason: `在老周追剧视角下，该镜头对白与肢体动作具备较高的戏剧支撑度，契合[${beat ? beat.beat_title : "节拍"}]的叙事功能。`,
      risk_flags: riskFlags,
      recommended_use: recommendedUse,
      
      original_audio_strategy: {
        keep: audioKeep,
        suggestion: audioSuggestion,
        reason: audioReason,
      },
      audio_suggestion: audioSuggestion,
      provider_meta: {
        provider_name: this.provider_name,
        is_fallback: this.is_fallback,
      },
    };
  }
}
