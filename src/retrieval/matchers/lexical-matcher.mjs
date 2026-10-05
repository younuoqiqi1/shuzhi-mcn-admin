/**
 * @file lexical-matcher.mjs
 * @description POC-AGENT A5: 词法多字段匹配器。
 * 针对 dialogue、physical_actions、visual_description 进行多字段词项重合度与 BM25-like 权重评分。
 */

/**
 * 停用词过滤表
 */
const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
  "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
  "这", "那", "里", "来", "把", "向", "与", "及", "等", "进行", "处于", "表现出",
]);

/**
 * 简易中文高效分词器（2-gram + 常见专有名词词表切分）
 * @param {string} text 
 * @returns {Array<string>}
 */
export function tokenizeChinese(text) {
  if (!text || typeof text !== "string") return [];
  const clean = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ").trim();
  const tokens = [];

  // 1. 常见词表正向贪婪切分
  const dict = [
    "吴敬中", "余则成", "李涯", "翠平", "谢若林", "穆晚秋", "陆桥山", "马奎",
    "站长", "机要室", "办公室", "保密局", "天津站", "档案", "绝密", "通缉令", "陈秋平",
    "试探", "怀疑", "金条", "生意", "叛徒", "照片", "火车站", "列车", "车票", "暗战",
    "汇报", "雪茄", "皮椅", "恭顺", "谨慎", "微笑", "试探性", "翻看", "抽烟", "点燃",
    "冷笑", "点头", "送别", "挥手", "汽笛", "走廊", "客厅", "卧室", "餐厅", "街道",
    "秘密", "交易", "胶卷", "钢笔", "抽屉", "录音", "电报", "密码本", "杀头",
    "东来顺", "涮肉", "涮羊肉",
  ];

  let remaining = clean;
  while (remaining.length > 0) {
    let matched = false;
    for (const word of dict) {
      if (remaining.startsWith(word)) {
        tokens.push(word);
        remaining = remaining.slice(word.length).trim();
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 提取单字或 2-gram
      if (remaining.length >= 2) {
        const bi = remaining.slice(0, 2);
        if (!STOP_WORDS.has(bi)) {
          tokens.push(bi);
        }
      }
      remaining = remaining.slice(1).trim();
    }
  }

  return tokens.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export class LexicalMatcher {
  /**
   * 计算词法匹配分
   * @param {Object} requirement MaterialRequirement 诉求
   * @param {Object} evidence ObjectiveEvidence 物理证据
   * @returns {{ score: number, details: Object }}
   */
  match(requirement, evidence) {
    // 构造查询语料
    const queryParts = [
      requirement.desired_action || "",
      requirement.desired_emotion || "",
      requirement.evidence_grounding_criteria || "",
      requirement.description || "",
    ];
    const queryText = queryParts.join(" ");
    const queryTokens = Array.from(new Set(tokenizeChinese(queryText)));

    if (queryTokens.length === 0) {
      return { score: 0.5, details: { matched_tokens: [], dialogue_hits: 0 } };
    }

    // 构造证据被检字段
    const dialogue = evidence.dialogue || "";
    const actions = (evidence.physical_actions || []).join(" ");
    const visual = evidence.visual_description || "";
    const env = evidence.scene_env || "";

    const docText = `${dialogue} ${actions} ${visual} ${env}`;
    const docTokens = new Set(tokenizeChinese(docText));

    const dialogueTokens = new Set(tokenizeChinese(dialogue));
    const actionTokens = new Set(tokenizeChinese(actions));

    // 计算交集词
    const matchedTokens = [];
    let dialogueHits = 0;
    let actionHits = 0;

    for (const qt of queryTokens) {
      if (docTokens.has(qt) || docText.includes(qt)) {
        matchedTokens.push(qt);
      }
      if (dialogueTokens.has(qt) || dialogue.includes(qt)) {
        dialogueHits++;
      }
      if (actionTokens.has(qt) || actions.includes(qt)) {
        actionHits++;
      }
    }

    // 基础命中率
    const matchRatio = matchedTokens.length / queryTokens.length;

    // 对白与动作额外权重加成（台词若精准命中关键词，叙事价值极高）
    const dialogueBonus = dialogueHits > 0 ? Math.min(0.3, dialogueHits * 0.1) : 0.0;
    const actionBonus = actionHits > 0 ? Math.min(0.2, actionHits * 0.08) : 0.0;

    const rawScore = matchRatio * 0.7 + dialogueBonus + actionBonus;
    const finalScore = Math.min(1.0, Math.max(0.0, Number(rawScore.toFixed(3))));

    return {
      score: finalScore,
      details: {
        matched_tokens: matchedTokens,
        query_token_count: queryTokens.length,
        dialogue_hits: dialogueHits,
        action_hits: actionHits,
      },
    };
  }
}
