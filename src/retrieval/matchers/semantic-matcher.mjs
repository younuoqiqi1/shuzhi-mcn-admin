/**
 * @file semantic-matcher.mjs
 * @description POC-AGENT A5: 语义匹配器与可插拔 Provider 接口。
 * 针对 topic、viewpoint、beat purpose 及 material requirement 展开深层语义关联召回。
 * 明确区分真实向量嵌入服务与 Fallback 实现，严格守界并提供透明溯源标记。
 */

/**
 * 语义向量/语义计算服务抽象接口规范
 * @interface ISemanticProvider
 */
export class ISemanticProvider {
  /**
   * 计算两段文本的语义余弦相似度
   * @param {string} query 
   * @param {string} document 
   * @returns {Promise<number>|number} 0.0 ~ 1.0
   */
  computeSimilarity(query, document) {
    throw new Error("ISemanticProvider.computeSimilarity 必须由具体子类实现");
  }

  get provider_name() {
    return "abstract_interface";
  }

  get is_fallback() {
    return false;
  }
}

/**
 * 概念网降级语义 Provider（当前本地无 GPU/外部模型时的确定性实现）
 * 严格声明 is_fallback: true，杜绝虚假宣称。
 */
export class ConceptFallbackSemanticProvider extends ISemanticProvider {
  constructor() {
    super();
    // 概念主题语义维度定义（多维概念空间）
    this.conceptAxes = {
      // 怀疑与试探维度
      suspicion_testing: [
        "怀疑", "试探", "试探性", "测试", "试金石", "审查", "盘问", "眼神", "防备",
        "提防", "心机", "老谋深算", "看穿", "察言观色", "不信任", "动摇", "端倪",
      ],
      // 权力支配与官场威压维度
      power_dynamic: [
        "权力", "站长", "威压", "下属", "恭顺", "服从", "老师", "官场", "裁决",
        "生杀", "贪官", "南京", "杀头", "前途", "把柄", "压制", "控制",
      ],
      // 险境与谍战危机维度
      peril_crisis: [
        "危险", "危机", "暴露", "险境", "命悬一线", "走钢丝", "抓捕", "通缉",
        "叛徒", "特务", "绝密", "杀机", "死局", "致命", "圈套", "搜查",
      ],
      // 秘密情报与地下交易维度
      covert_transaction: [
        "情报", "交易", "买卖", "金条", "钞票", "黑市", "胶卷", "密件", "收音机",
        "密码本", "底牌", "开价", "价码", "利益", "做生意",
      ],
      // 情感依恋与离别抉择维度
      emotional_resolution: [
        "晚秋", "翠平", "眼泪", "离别", "撤离", "火车站", "车票", "解放区", "牵挂",
        "护送", "远走", "牺牲", "信仰", "深情", "告别", "相依",
      ],
    };
  }

  get provider_name() {
    return "concept_mesh_fallback_v1";
  }

  get is_fallback() {
    return true; // 诚实声明为降级实现
  }

  /**
   * 将文本投影为概念域频次向量并归一化
   * @param {string} text 
   * @returns {Array<number>}
   */
  _projectToConceptVector(text) {
    if (!text) return [0, 0, 0, 0, 0];
    const clean = text.toLowerCase();
    const vec = [];

    const keys = Object.keys(this.conceptAxes);
    for (const k of keys) {
      const words = this.conceptAxes[k];
      let hits = 0;
      for (const w of words) {
        if (clean.includes(w)) {
          hits += 1.0;
        }
      }
      vec.push(hits);
    }

    // 向量 L2 模长归一化
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return [0, 0, 0, 0, 0];
    return vec.map((v) => v / norm);
  }

  /**
   * 计算余弦相似度
   * @param {string} query 
   * @param {string} document 
   * @returns {number}
   */
  computeSimilarity(query, document) {
    const qVec = this._projectToConceptVector(query);
    const dVec = this._projectToConceptVector(document);

    let dot = 0;
    for (let i = 0; i < qVec.length; i++) {
      dot += qVec[i] * dVec[i];
    }

    // 余弦值范围 0 ~ 1
    return Number(Math.max(0.0, Math.min(1.0, dot)).toFixed(3));
  }
}

export class SemanticMatcher {
  /**
   * @param {ISemanticProvider} [provider] 可插拔 Provider，默认使用 ConceptFallbackSemanticProvider
   */
  constructor(provider = null) {
    this.provider = provider || new ConceptFallbackSemanticProvider();
  }

  /**
   * 执行语义匹配
   * @param {Object} context { topic, viewpoint, beat, requirement }
   * @param {Object} evidence ObjectiveEvidence
   * @returns {{ score: number, details: Object }}
   */
  match(context, evidence) {
    const { topic, viewpoint, beat, requirement } = context;

    // 组合宏观叙事与微观诉求意图
    const queryParts = [
      topic ? (topic.title || topic.core_thesis || "") : "",
      viewpoint ? (viewpoint.thesis || viewpoint.hook || "") : "",
      beat ? (beat.beat_title || beat.narrative_function || "") : "",
      requirement.description || "",
      requirement.desired_action || "",
      requirement.desired_emotion || "",
    ];
    const queryText = queryParts.filter(Boolean).join(" ");

    // 组合证据客观事实语料
    const docText = [
      evidence.dialogue || "",
      (evidence.physical_actions || []).join(" "),
      evidence.visual_description || "",
      evidence.scene_env || "",
    ].filter(Boolean).join(" ");

    const sim = this.provider.computeSimilarity(queryText, docText);

    return {
      score: sim,
      details: {
        provider: this.provider.provider_name,
        is_fallback: this.provider.is_fallback,
        semantic_similarity: sim,
      },
    };
  }
}
