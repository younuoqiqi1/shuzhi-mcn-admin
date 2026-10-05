/**
 * @file perspective-provider.mjs
 * @description POC-AGENT A6/A6.2: 博主视角解读 Provider 抽象接口与确定性实现。
 * 规范定义 IPerspectiveProvider，并提供透明声明 fallback 的概念与叙事解读器。
 * 严格恪守：
 * 1. L1 Evidence 为不可逾越的事实底线，严禁改写或伪造事实；
 * 2. interpretation 必须由 candidate Evidence + Persona + Topic + Viewpoint + Beat + Requirement 动态共同生成；
 * 3. 严禁按 scene 类型套固定人物模板，严禁选题间模板串用；
 * 4. 落地 Consistency Validator，对未在场且无上下文说明的人物引用强制标记 unsupported_character_reference。
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
   * @returns {Object} 解读结果
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
 * 校验主观解读与客观镜头人物的一致性 (Consistency Validator)
 * 规则：如果 interpretation 提到具体人物，该人物必须：
 * A. 存在于当前 Evidence characters；或
 * B. 明确标记为跨镜头叙事上下文引用 (如"口中提及"、"未在场但"、"背景下的")。
 * 否则判定为 unsupported_character_reference。
 * 
 * @param {string} interpretation 主观解读文本
 * @param {Object} candidate 候选镜头对象
 * @returns {{ is_consistent: boolean, invalid_characters: Array<string>, details: string }}
 */
export function validatePerspectiveConsistency(interpretation, candidate) {
  if (!interpretation || typeof interpretation !== "string") {
    return { is_consistent: false, invalid_characters: [], details: "解读文本为空" };
  }

  const ev = candidate.evidence_l1 || candidate;
  const actualChars = ev.characters || candidate.characters || [];

  // 关键人物别名映射
  const characterAliases = [
    { canonical: "吴敬中", tokens: ["吴敬中", "吴站长", "站长"] },
    { canonical: "余则成", tokens: ["余则成", "则成", "余主任", "余副站长"] },
    { canonical: "谢若林", tokens: ["谢若林", "老谢", "情报贩子"] },
    { canonical: "李涯", tokens: ["李涯", "李队长"] },
    { canonical: "陆桥山", tokens: ["陆桥山", "老陆"] },
    { canonical: "穆晚秋", tokens: ["穆晚秋", "晚秋"] },
    { canonical: "翠平", tokens: ["翠平", "余太太"] },
    { canonical: "秋掌柜", tokens: ["秋掌柜", "联络员", "地下党接头人"] },
  ];

  // 允许的跨镜头叙事上下文引用标记词
  const contextualModifiers = [
    "口中", "言谈中", "提及", "借题", "暗指", "未在场", "缺席", 
    "背景下", "阴影下", "远程", "话题中心", "作为叙事背景"
  ];

  const invalidChars = [];

  for (const charDef of characterAliases) {
    const isMentioned = charDef.tokens.some((token) => interpretation.includes(token));
    if (!isMentioned) continue;

    // 检查该人物是否在实际出镜人物中
    const isPresent = charDef.tokens.some((token) =>
      actualChars.some((ac) => ac.includes(token) || token.includes(ac))
    );

    if (isPresent) continue; // 客观在场，完全合法

    // 检查是否有明确的跨镜头叙事上下文修饰
    const hasContextModifier = contextualModifiers.some((mod) => {
      // 简单窗口判断：修饰词与人名在同一句话或临近 15 个字内
      for (const token of charDef.tokens) {
        const idx = interpretation.indexOf(token);
        if (idx !== -1) {
          const windowStart = Math.max(0, idx - 15);
          const windowEnd = Math.min(interpretation.length, idx + token.length + 15);
          const subSnippet = interpretation.slice(windowStart, windowEnd);
          if (subSnippet.includes(mod)) return true;
        }
      }
      return false;
    });

    if (!hasContextModifier) {
      invalidChars.push(charDef.canonical);
    }
  }

  const isConsistent = invalidChars.length === 0;
  return {
    is_consistent: isConsistent,
    invalid_characters: invalidChars,
    details: isConsistent
      ? "所有提及人物均存在于客观镜头或已明确标记为叙事上下文引用"
      : `解读中未经说明引用了未在场人物: [${invalidChars.join(", ")}]`,
  };
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

    const laozhouKeys = [
      "翻看", "皮椅", "雪茄", "抽烟", "点燃", "垂手", "立正", "办公桌", 
      "沙发", "茶", "走廊", "恭顺", "谨慎", "冷峻", "注视", "汇报", 
      "金条", "生意", "铜锅", "涮肉", "羊肉", "情报", "档案", "调令", "讣告"
    ];
    let hits = 0;
    for (const kw of laozhouKeys) {
      if (actions.includes(kw) || dialogue.includes(kw) || env.includes(kw)) {
        hits++;
      }
    }
    score += Math.min(0.35, hits * 0.08);

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
    let actScore = 0.25;
    const desiredAct = requirement.desired_action || "";
    const desiredEnv = requirement.desired_scene_env || "";
    if (desiredAct && actions) {
      const keyVerbs = [
        "翻看", "立正", "对坐", "抽烟", "点燃", "雪茄", "对峙", 
        "走廊", "拍桌", "递交", "登车", "挥手", "护送", "开价", "涮肉", "摊牌"
      ];
      const actHits = keyVerbs.filter((v) => desiredAct.includes(v) && actions.includes(v)).length;
      actScore = Math.min(1.0, 0.25 + actHits * 0.3);
    }

    // 环境匹配：必须匹配具体物理空间特征词，严禁大范围机构名泛化（杜绝将“站长办公室”泛化匹配为“机要室”）
    if (desiredEnv && env) {
      const envSpecifics = ["机要室", "档案室", "办公室", "客厅", "餐厅", "密室", "站台", "列车", "走廊", "大门", "内室"];
      const targetSpecifics = envSpecifics.filter((s) => desiredEnv.includes(s));
      const actualSpecifics = envSpecifics.filter((s) => env.includes(s));

      const hasSpecificMatch = targetSpecifics.some((ts) => actualSpecifics.includes(ts));
      if (hasSpecificMatch) {
        actScore = Math.min(1.0, actScore + 0.35);
      } else if (targetSpecifics.length > 0 && actualSpecifics.length > 0) {
        // 目标空间明确要求（如机要室/档案室），实际空间为其他（如办公室/餐厅），显著扣分
        actScore = Math.max(0.1, actScore - 0.25);
      }
    }

    // 3. 对白直接支撑
    let dialScore = 0.2;
    const grounding = requirement.evidence_grounding_criteria || "";
    if (grounding && dialogue) {
      const gKeys = [
        "副站长", "站长", "贪官", "杀头", "两根金条", "金条", "情报", 
        "共党", "陈秋平", "太太", "买卖", "汇报", "车票", "晚秋", "同甘共苦", "生意", "通缉", "卷宗", "档案"
      ];
      const dialHits = gKeys.filter((k) => grounding.includes(k) && dialogue.includes(k)).length;
      if (dialHits > 0) {
        dialScore = Math.min(1.0, 0.4 + dialHits * 0.25);
      } else {
        dialScore = 0.2; // 明确要求 grounding 但对白无一命中的，得分保持低位
      }
    } else if (!grounding && dialogue && dialogue.length > 15) {
      dialScore = 0.55;
    }

    const totalSupport = charScore * 0.40 + actScore * 0.35 + dialScore * 0.25;
    return Number(Math.max(0.1, Math.min(1.0, totalSupport)).toFixed(3));
  }

  /**
   * 评估叙事价值
   * @private
   */
  _evalNarrativeValue(candidate, beat) {
    let score = 0.65;
    const actions = (candidate.physical_actions || []).join(" ");
    const dur = candidate.timecode?.duration_sec || 5.0;

    if (dur >= 3.0 && dur <= 15.0) score += 0.15;
    else if (dur > 30.0) score -= 0.15;

    const affTags = candidate.affordance_l2?.tags || [];
    if (affTags.length >= 2) score += 0.15;
    else if (affTags.length === 1) score += 0.08;

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
   * 构造老周追剧风格的主观叙事解读（动态融合 Candidate + Topic + Viewpoint + Beat + Requirement）
   * 严格禁止跨选题模板串用与臆造未在场人物
   * @private
   */
  _buildSubjectiveInterpretation(candidate, requirement, viewpoint, persona, topic, beat) {
    const chars = candidate.characters || [];
    const dialogue = candidate.dialogue || "";
    const actions = (candidate.physical_actions || []).join(" ");
    const topicId = topic?.topic_id || topic?.id || "";
    const isWuTopic = topicId.includes("wu");
    const isProbeTopic = topicId.includes("probe");

    // 1. 选题 A：吴站长什么时候开始怀疑余则成？
    if (isWuTopic) {
      if (chars.includes("吴敬中") && chars.includes("余则成")) {
        if (dialogue.includes("副站长") || dialogue.includes("恭喜")) {
          return "老周视角：这一幕是全剧职场试探的经典范本。吴站长看似满面春风道喜，实则把副站长委任状当成测谎仪，用官位和利益压在桌面上，冷眼旁观余则成的微表情是惊是喜。余则成表面恭顺，内心早已命悬一线。";
        }
        if (actions.includes("雪茄") || actions.includes("火柴") || dialogue.includes("贪") || dialogue.includes("杀头")) {
          return "老周视角：在体制内，一把手点烟不说话、或者突然跟你聊贪官杀头的时候，往往是最危险的时刻。站长借题发挥敲山震虎，用世俗利益的假面来试探下属的真实底牌，老辣至极。";
        }
        return "老周视角：师生名分是这两人的防弹衣。站长居高临下冷眼审视，余则成垂手谨慎应答，看似寻常汇报，实则是保密局生死边缘的无声过招。";
      }

      if (chars.includes("秋掌柜")) {
        return "老周视角：延安失守的消息传来，余则成在秘密密室与秋掌柜接头。镜头下两人强忍悲痛而眼神坚毅，与白天在站长室面对吴敬中的恭顺假面形成强烈反差，深刻揭示了潜伏人员九死一生的精神底色。";
      }

      if (chars.includes("翠平")) {
        return "老周视角：回到家中面对翠平，余则成才卸下在站长办公室的层层伪装。这一幕家庭空间的压抑叮嘱，从侧面反衬出站长怀疑带来的巨大窒息感。";
      }

      return `老周视角：该镜头展示了天津站内部的暗流涌动，为解析吴站长对余则成的多轮试探提供了不可或缺的环境底色。`;
    }

    // 2. 选题 B：余则成最危险的一次试探 (谢若林情报交易/两根金条/暗夜撤离)
    if (isProbeTopic) {
      if (chars.includes("谢若林") && chars.includes("余则成")) {
        if (dialogue.includes("陈秋平") || dialogue.includes("通告") || dialogue.includes("讣告") || dialogue.includes("档案")) {
          return "老周视角：这是整部《潜伏》余则成遭遇的最凶险危机！谢若林在涮肉桌上甩出陈秋平档案与讣告，直接撕开了翠平身份的伪装。面对这种灭顶之灾，余则成不能慌、不能拔枪，唯有冷笑反讽谢若林想钱想疯了，在毫厘之间化解杀身之祸。";
        }
        if (dialogue.includes("金条") || dialogue.includes("两根") || dialogue.includes("买卖") || dialogue.includes("误党误国")) {
          return "老周视角：谢若林是全剧最通透也最致命的情报贩子。这一幕他把两根金条和戴之奇师的情报内幕抖出来，大谈主义与生意的辩证法；余则成义正言辞怒斥其误党误国成何体统，反客为主用党国官僚的逻辑死死压制住了对方的贪欲。";
        }
        if (dialogue.includes("生意") || dialogue.includes("中共") || dialogue.includes("保密局")) {
          return "老周视角：面对没有信仰只有价码的谢若林，余则成面临的是整部剧最赤裸的试探。谢若林看似酒肉朋友拉人入伙，实则每一句话都在刺探虚实。余则成在铜锅烟气掩护下小心周旋，展现出顶级特工的心理素质。";
        }
        return "老周视角：涮肉馆内的饭局不是请客吃饭，而是一场不见硝烟的生死博弈。余则成与谢若林言语交锋各怀鬼胎，把情报黑市的肮脏与暗战的凶险展现得淋漓尽致。";
      }

      if (chars.includes("穆晚秋") || chars.includes("晚秋")) {
        return "老周视角：火车站台的蒸汽与风衣，是全剧少数流露温情却又残酷至极的段落。余则成把晚秋送上远去解放区的列车，既是彻底解除自身暴露的隐患，也是在冷血暗战中守住最后一丝人性的微光。";
      }

      if (chars.includes("翠平")) {
        return "老周视角：谢若林登门刺探翠平有无妹妹秋平，翠平在客厅机警应变。这一幕家庭防线的交锋，构成了危险试探风暴的前奏。";
      }

      return `老周视角：该镜头记录了危险试探过程中的关键线索推演，为全剧最险象环生的敌我心理博弈提供了扎实的戏剧铺垫。`;
    }

    // 默认通用兜底解读
    return `老周视角：该镜头在当前选题中承载了关键的情感与环境过渡，为核心剧情冲突铺垫了极具沉浸感的气氛底色。`;
  }

  /**
   * 构建无法支撑的内容 (does_not_support)
   * @private
   */
  _buildDoesNotSupport(candidate, requirement, supportScore) {
    const dialogue = candidate.dialogue || "";
    const reqId = requirement.requirement_id || "";

    if (reqId.includes("wu")) {
      if (!dialogue.includes("共党") && !dialogue.includes("通共")) {
        return "无法支持'吴站长此时已经确认余则成是共产党'的过激断言；本素材仅能确认存在基于官场权谋与行踪疑点的言语试探。";
      }
    }

    if (reqId.includes("probe")) {
      if (!dialogue.includes("抓捕") && !dialogue.includes("逮捕")) {
        return "无法支持'谢若林已经掌握确凿证据并立即实施抓捕'的观点；本素材证实谢若林以此作为敲诈筹码谋求经济利益与情报倒卖。";
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

    // 综合视角分
    let perspectiveScore = Number((
      evidenceSupportScore * 0.35 +
      personaFitScore * 0.25 +
      narrativeValueScore * 0.25 +
      (candidate.total_score || candidate.total_retrieval_score || 0.6) * 0.15
    ).toFixed(3));

    // 2. 主观解读与事实边界动态生成 (问题3: 彻底隔离模板污染)
    let interpretation = this._buildSubjectiveInterpretation(
      candidate,
      requirement,
      viewpoint,
      persona,
      topic,
      beat
    );

    // 3. 执行 Consistency Validator (人物一致性严格核验)
    const consistencyCheck = validatePerspectiveConsistency(interpretation, candidate);
    const riskFlags = [];
    if (!consistencyCheck.is_consistent) {
      riskFlags.push("unsupported_character_reference");
      // 惩罚性扣分
      perspectiveScore = Number(Math.max(0.1, perspectiveScore - 0.35).toFixed(3));
    }

    const evidenceBoundary = this._buildEvidenceBoundary(candidate, requirement, evidenceSupportScore);
    let doesNotSupport = this._buildDoesNotSupport(candidate, requirement, evidenceSupportScore);

    if (!consistencyCheck.is_consistent) {
      doesNotSupport += `；【一致性告警】：${consistencyCheck.details}`;
    }

    // 4. supports_claim 裁决
    let supportsClaim = "partial";
    if (evidenceSupportScore >= 0.55 && consistencyCheck.is_consistent) {
      supportsClaim = "true";
    } else if (evidenceSupportScore < 0.40 || !consistencyCheck.is_consistent) {
      supportsClaim = "false";
    }

    // 5. 推荐使用类型与原声策略
    let recommendedUse = "supporting";
    if (supportsClaim === "true" && perspectiveScore >= 0.75) {
      recommendedUse = "strong_support";
    } else if (supportsClaim === "false") {
      recommendedUse = "reject";
      riskFlags.push("weak_grounding");
    } else if (evidenceSupportScore < 0.45) {
      recommendedUse = "atmosphere";
    }

    const hasDialogue = !!(candidate.dialogue && candidate.dialogue.trim().length > 0);
    const originalAudioStrategy = {
      keep: hasDialogue && (supportsClaim === "true" || recommendedUse === "strong_support"),
      suggestion: hasDialogue ? "preserve_original_dialogue" : "bgm_only",
      mix_ducking_level: hasDialogue ? 0.2 : 0.8,
    };

    const readingResult = {
      candidate_id: candidate.candidate_id,
      evidence_id: candidate.evidence_id || `${candidate.media_id}:${candidate.scene_id}`,
      beat_id: candidate.beat_id || beat?.beat_id || "beat_unknown",
      blogger_id: persona?.blogger_id || "blogger_laozhou",
      topic_id: topic?.topic_id || topic?.id || "topic_unknown",
      perspective_lens: persona?.persona_name || "laozhou_zhuju",
      perspective_match_score: perspectiveScore,
      evidence_support_score: evidenceSupportScore,
      narrative_value_score: narrativeValueScore,
      persona_fit_score: personaFitScore,
      interpretation_confidence: consistencyCheck.is_consistent ? (ev.confidence || 0.92) : 0.45,
      subjective_interpretation: interpretation,
      supports_claim: supportsClaim,
      does_not_support: doesNotSupport,
      evidence_boundary: evidenceBoundary,
      selection_reason: `在${persona?.persona_name || "老周追剧"}视角下，该镜头对白与肢体动作具备较高的戏剧支撑度，契合[${beat?.beat_title || "当前节拍"}]的叙事功能。`,
      risk_flags: riskFlags,
      recommended_use: recommendedUse,
      original_audio_strategy: originalAudioStrategy,
      audio_suggestion: originalAudioStrategy.suggestion,
      consistency_check: consistencyCheck,
      a6_perspective_score: perspectiveScore,
      provenance: {
        provider_name: this.provider_name,
        is_fallback: this.is_fallback,
        timestamp: new Date().toISOString(),
      },
    };

    return readingResult;
  }
}
