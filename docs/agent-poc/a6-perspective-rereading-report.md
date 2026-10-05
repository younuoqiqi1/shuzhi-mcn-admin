# POC-AGENT A6 动态 Perspective Re-reading + Retrieval Top3 Gate 验收报告

> **执行周期**: 2026-10-05  
> **前置依赖**: POC-AGENT A5 (`6849dcbbb767e96ac9c293c751c1975a6622a63a`)  
> **阶段目标**: 实现稳定生产级 `PerspectiveReReadingService`，消费 A5 Top20 客观候选，从特定博主（老周追剧）与选题视角执行逐候选深度再解读、证据边界锁定、主张支持度裁决与 Top3/Top5 重排；完成全剧真实素材上的 **Retrieval Top3 Gate (≥ 80%)** 严苛实测。  
> **当前状态**: `A6 awaiting_review / gate_candidate_pass` (Gate 达标，原地停止，严禁进入 A7)

---

## 一、 A6 核心定位与多层素材铁律

### 1.1 A5 与 A6 核心边界
* **A5 解决的问题**：“从全片 2702 秒、235 个客观镜头中，哪些素材客观上可能有用？”（纯客观特征匹配，严禁博主观点与定性推论）；
* **A6 解决的问题**：“站在当前博主（老周追剧）+ 当前选题 + 当前核心观点 + 当前故事节拍的角度，这个镜头到底能不能用？能支撑什么观点？不能支撑什么观点？”。

```
[A4 素材诉求] ──► [A5 Candidate Retrieval] ──► [Top20 客观候选]
                                                       │
                                                       ▼
                      [A6 Perspective Re-reading (L3 动态解释层)]
                      ├─ 博主透镜重读 (老周追剧)
                      ├─ 证据边界严控 (防幻觉机制: Fact vs Narrative)
                      ├─ 主张支持度裁决 (true / partial / false)
                      ├─ 证据不足告警 (INSUFFICIENT_EVIDENCE)
                      └─ Top3 / Top5 重排 (A5 Retrieval + A6 Perspective)
                                                       │
                                                       ▼
                               [Retrieval Top3 Gate 实测 (≥ 80%)]
```

### 1.2 严格防污染与生命周期铁律
1. **绝对保护 L1 Objective Evidence**：A6 是上层解释，严禁修改任何 L1 物理事实数据；
2. **绝对不私自写回 L2 Generic Affordance**：L3 主观解读不等于通用戏剧潜能，必须等待 A9 知识回流流水线经过人工审核后方可受控晋升；
3. **绝对不提前进入 A7 导演决策**：原声策略在此仅作为建议（`audio_suggestion`），最终剪辑 IN/OUT、原声与解说词锁定严格留给 A7；
4. **绝无偷换镜头**：A6 的 Top3/Top5 重排必须 100% 源自 A5 检索返回的 Top20 候选池，严禁人工指定外部镜头。

---

## 二、 模型与 Provider 架构实现

### 2.1 抽象 Provider 接口规范
系统在 [`src/perspective/providers/perspective-provider.mjs`](../../src/perspective/providers/perspective-provider.mjs) 中建立了标准规范：
```javascript
export class IPerspectiveProvider {
  interpretCandidate({ persona, topic, viewpoint, beat, requirement, candidate }) { ... }
  get provider_name() { ... }
  get is_fallback() { return false; }
}
```

### 2.2 实际采用的 Provider 与透明 Fallback 声明
* **当前环境现状**：本地开发环境尚未直连远端大模型在线 API（如 Gemini 1.5 Pro / Claude 3.5 Sonnet）；
* **实现方案**：实现了确定性语义概念网与叙事特征分析 Provider `SemanticAndConceptPerspectiveProvider`；
* **透明声明**：在代码、打分元数据与输出对象中**显式声明 `provider_name: "semantic_concept_perspective_provider_v1"`，并强制标注 `is_fallback: true`**；
* **模型/算法判断与规则分界**：
  * **算法/概念网计算**：人物亲和度向量投影、动作关键词影视语义交集、叙事镜头时长与戏剧潜能多维加权、主张支撑度动态判定（$S_{\text{support}} \ge 0.55 \rightarrow \text{true}$，$< 0.40 \rightarrow \text{false}$）；
  * **规则/模板保护**：事实边界拼接模板（强制提取 L1 确证人物、动作、台词与场景）、无法支撑内容的硬性边界锁定。

---

## 三、 防幻觉机制：Evidence Boundary 与 允许“不支持该观点”

### 3.1 事实边界 (Evidence Boundary) 规范
A6 设立了核心反幻觉锚点。每个候选解读均携带由程序自动生成的 `evidence_boundary`：
* **【L1 客观事实底线】**：只允许出现原片切片中客观存在的人物、物理动作、台词文本与物理空间；
* **【L3 叙事推论边界】**：明确声明“老谋深算试探”、“生死边缘的博弈”等主观定性是博主视角的叙事阐释，严禁冒充物理事实。

### 3.2 允许“不支持该观点”与 INSUFFICIENT_EVIDENCE
1. **主张不支持识别**：
   * 若素材仅显示角色在走廊擦肩而过或普通汇报，而无法证明“吴站长此时已经确认余则成是共产党”，系统将 `supports_claim` 明确标记为 `partial` 或 `false`，并在 `does_not_support` 中写明：“无法支持‘吴站长此时已经确认余则成是共产党’的过激断言；本素材仅能确认存在言语试探”。
2. **证据不足告警机制 (INSUFFICIENT_EVIDENCE)**：
   * 当一个 Story Beat 对应的 Top20 候选均无法提供及格的事实支撑（所有候选 $S_{\text{support}} < 0.40$ 或 `supports_claim === 'false'`）时，系统自动拦截并返回：
     ```json
     {
       "status": "INSUFFICIENT_EVIDENCE",
       "suggested_actions": ["soften_claim", "modify_viewpoint", "modify_beat", "retrieve_again"],
       "reason": "A5 召回的 20 个候选镜头均缺乏直接物理事实支撑该节拍的核心观点..."
     }
     ```
   * 这为后续 MCN 后台的运营 Agent 提供了确切的交互指导，避免大模型“凭空瞎编故事”。

---

## 四、 Top3 / Top5 重排机制与 Rank Delta 分析

### 4.1 综合打分公式
对于候选镜头 $c$：
$$S_{\text{a6\_perspective}} = 0.35 \cdot S_{\text{support}} + 0.25 \cdot S_{\text{persona}} + 0.25 \cdot S_{\text{narrative}} + 0.15 \cdot S_{\text{match}}$$
$$S_{\text{final}} = 0.40 \cdot S_{\text{a5\_retrieval}} + 0.60 \cdot S_{\text{a6\_perspective}}$$

### 4.2 排序变化深度审计 (Rank Delta 现象)
通过将博主视角引入打分，候选镜头产生了显著的合理跃迁：
* **跃迁案例 1（选题A `req_wu_04` 沉默收尾）**：
  * `scene_0057`（吴站长用火柴点燃雪茄，暗调办公室内烟雾弥漫）：
  * **A5 排名第 2 $\rightarrow$ A6 升至第 1 名 (Delta: +1)**；
  * **原因**：在老周视角下，站长点燃雪茄的静默微动作为节拍结论提供了极高的“动作留白”与“权谋沉思”叙事价值，$S_{\text{persona}}$ 与 $S_{\text{narrative}}$ 均达 0.85+，超越了原先靠纯台词得分的镜头。
* **跃迁案例 2（选题B `req_probe_01` 致命邀约）**：
  * `scene_0094`（谢若林在客厅沙发：“老子就开个刀剑工厂，这都是延安的，这都是过期的...”）：
  * **A5 排名第 10 $\rightarrow$ A6 跃升至第 4 名 (Delta: +6)**；
  * **原因**：谢若林与余则成直接就延安情报进行买卖试探，极度贴合老周追剧关注的“地下交易与利益勾兑”，证据支撑度大幅攀升。
* **跃迁案例 3（选题B `req_probe_04` 站台撤离）**：
  * `scene_0190`（余则成提着皮箱护送晚秋登上绿皮列车车厢踏板）：
  * **A5 排名第 3 $\rightarrow$ A6 升至第 1 名 (Delta: +2)**；
  * **原因**：在撤离节拍中，该镜头包含了核心动作执行（提皮箱、上踏板），物理事实最完备，成为该节拍的最优支撑点。

---

## 五、 Retrieval Top3 Gate 真实门禁实测 (100% 达标)

> **Gate 标准**：在真实素材与全自动程序链下，每个 MaterialRequirement 的 A6 Top3 候选中，**必须至少存在 1 个真正可用于该节拍的可用镜头**。
> **通过阈值**：Top3 Usable Coverage $\ge 80.0\%$。

### 5.1 人工 Gate 审查表 (8个真实需求样本全量审计)

| 序号 | 选题 ID | Requirement ID | 故事节拍 (Beat) | A6 Top 1 镜头 | A6 Top 2 镜头 | A6 Top 3 镜头 | Top3是否至少1个可用 | 最优可用镜头 (时码) | A5 $\rightarrow$ A6 排名 | Gate 判定 |
|:---:|:---|:---|:---|:---|:---|:---|:---:|:---|:---:|:---:|
| 1 | `topic_qf18_wu_suspicion` | `req_wu_01` | 师生假面下的眼神交锋 | `scene_0074` | `scene_0060` | `scene_0044` | **✅ 是** (3个均可用) | `scene_0074` (11:04-12:36) | 1 $\rightarrow$ 1 (0) | **PASS** |
| 2 | `topic_qf18_wu_suspicion` | `req_wu_02` | 敲山震虎与言语试探 | `scene_0074` | `scene_0044` | `scene_0073` | **✅ 是** (3个均可用) | `scene_0074` (11:04-12:36) | 1 $\rightarrow$ 1 (0) | **PASS** |
| 3 | `topic_qf18_wu_suspicion` | `req_wu_03` | 机要室档案与叛徒险情 | `scene_0142` | `scene_0149` | `scene_0134` | **✅ 是** (3个均可用) | `scene_0142` (33:00-33:04) | 1 $\rightarrow$ 1 (0) | **PASS** |
| 4 | `topic_qf18_wu_suspicion` | `req_wu_04` | 默契维系与生存法则 | `scene_0057` | `scene_0061` | `scene_0084` | **✅ 是** (2个可用) | `scene_0057` (09:09-09:14) | 2 $\rightarrow$ 1 (+1) | **PASS** |
| 5 | `topic_qf18_dangerous_probe` | `req_probe_01` | 涮肉请客背后的致命邀约 | `scene_0125` | `scene_0092` | `scene_0142` | **✅ 是** (2个可用) | `scene_0125` (26:32-28:32) | 1 $\rightarrow$ 1 (0) | **PASS** |
| 6 | `topic_qf18_dangerous_probe` | `req_probe_02` | 陈秋平档案与假夫妻危局 | `scene_0125` | `scene_0142` | `scene_0149` | **✅ 是** (3个均可用) | `scene_0125` (26:32-28:32) | 1 $\rightarrow$ 1 (0) | **PASS** |
| 7 | `topic_qf18_dangerous_probe` | `req_probe_03` | 两根金条与主义博弈 | `scene_0139` | `scene_0150` | `scene_0149` | **✅ 是** (3个均可用) | `scene_0139` (32:36-32:49) | 2 $\rightarrow$ 1 (+1) | **PASS** |
| 8 | `topic_qf18_dangerous_probe` | `req_probe_04` | 险境逢生与暗夜撤离 | `scene_0190` | `scene_0202` | `scene_0205` | **✅ 是** (3个均可用) | `scene_0190` (40:12-40:24) | 3 $\rightarrow$ 1 (+2) | **PASS** |

### 5.2 统计指标小结
* **总样本需求数**：8 个（2 真实选题 × 4 节拍需求）；
* **Top3 包含可用镜头的需求数**：**8 个**；
* **Top3 Usable Coverage**：**100.0%**；
* **门禁实测结果**：**✅ PASS (100.0% $\ge$ 80.0%)**；
* **Gate 状态标记**：`gate_candidate_pass`。

---

## 六、 自动化测试验证矩阵

全套测试用例运行结果：**73 / 73 全部通过，0 失败**。
```bash
node --test tests/*.test.mjs
```
新增测试套件 [`tests/perspective-rereading.test.mjs`](../../tests/perspective-rereading.test.mjs) 专项覆盖：
1. 真实消费 A5 Top20 输入，每个 Requirement 接收完整 20 个候选；
2. PerspectiveProvider 接口与 Fallback 透明声明规范；
3. 单候选 Re-reading 契约合规与 Schema 校验；
4. 防幻觉机制：严格确立 Evidence Boundary；
5. 允许“不支持该观点”：弱事实镜头置 supports_claim 为 partial/false；
6. 证据不足告警机制：不可行需求触发 INSUFFICIENT_EVIDENCE 与行动建议；
7. Top20 重排与 Rank Delta 计算（保留 A5 分数与 A6 分数）；
8. 绝无偷换镜头：Top3/Top5 严格出自 A5 Top20 集合；
9. L1 客观事实与 L2 通用潜能只读防污染保护；
10. 选题A 与 选题B 端到端执行与 Gate 判定；
11. 跨选题综合 Retrieval Top3 Gate 评估 (实测达标)。

---

## 七、 A7 消费规范与数据接口准备

A6 产生的高质量数据结构将直接交付给 A7 Director Final：
```javascript
// A7 消费的每个 Requirement 结构
{
  requirement_id: "req_wu_01",
  beat_id: "beat_wu_01_hook",
  status: "SUFFICIENT",
  top3: [
    {
      candidate_id: "cand_req_wu_01_scene_0074_1",
      evidence_id: "qianfu_ep18_720p_25fps:scene_0074",
      timecode: { in: "00:11:04.400", out: "00:12:36.680" },
      subjective_interpretation: "老周视角：这一幕是全剧职场试探的经典范本...",
      evidence_boundary: "【L1 客观事实底线】...【L3 叙事推论边界】...",
      original_audio_strategy: { keep: true, suggestion: "preserve_original_dialogue" },
      a5_retrieval_score: 0.693,
      a6_perspective_score: 0.83,
      final_ranking_score: 0.775
    },
    ...
  ]
}
```
**A7 职责**：从 Top3 中敲定最终入选镜头（1个或组合），依据 `subjective_interpretation` 撰写最终精准旁白 Narration，确定最终配音与原声混音策略，锁定切片精确出入点，生成生产级 `DirectorPlan`。

---

## 八、 交付物清单与停止状态

1. **核心服务源码**：
   * `src/perspective/perspective-rereading-service.mjs` (服务总控与 API)
   * `src/perspective/providers/perspective-provider.mjs` (Provider 抽象与概念网实现)
   * `src/perspective/persona/laozhou-persona.mjs` (老周追剧博主画像)
2. **测试套件**：
   * `tests/perspective-rereading.test.mjs` (11 项专项集成测试，73/73 全绿)
3. **两个真实选题的 A6 结果与 Gate 评估报告**：
   * `src/perspective/results/a6_results_topic_a.json`
   * `src/perspective/results/a6_results_topic_b.json`
   * `src/perspective/results/a6_gate_evaluation.json`
4. **验收报告与看板更新**：
   * `docs/agent-poc/a6-perspective-rereading-report.md` (本文档)
   * `PROGRESS.md` (状态设为 `A6 awaiting_review / gate_candidate_pass`)

---

**严格停止声明**：
本阶段已完整交付，状态设为 **`A6 awaiting_review / gate_candidate_pass`**。  
**已彻底停止，严禁进入 A7 Director Final，严禁开始视频剪辑与语音合成。**
