# POC-AGENT A6.1 动态 Perspective Re-reading + Retrieval Top3 门禁隔离报告

> **执行周期**: 2026-10-05  
> **前置依赖**: POC-AGENT A5 (`6849dcbbb767e96ac9c293c751c1975a6622a63a`) / A6 Review Fixes (`5d45f83bda4292aa666d29c0293fb48ab78302eb`)  
> **阶段目标**: 实现独立 Gate Evaluation 层，严格分离“系统算法推荐”与“真人门禁判定”；生成 8 个真实素材需求独立人工验收包（Markdown 与 JSON）；显式声明当前模型 Fallback 边界；验证系统自评覆盖率 (100%) 与待审门禁阻断机制；完成全套 75 项自动化测试。  
> **当前状态**: `A6.1 awaiting_human_review` (系统自评完成，独立人工验收包已就绪，等待真人审核，严禁进入 A7)

---

## 一、 A6 / A6.1 核心定位与多层素材铁律

### 1.1 A5、A6 与 Gate Evaluation 职责划分
* **A5 解决的问题**：“从全片 2702 秒、235 个客观镜头中，哪些素材客观上可能有用？”（纯客观特征多路召回，严禁博主观点与定性推论）；
* **A6 解决的问题**：“站在当前博主（老周追剧）+ 当前选题 + 当前核心观点 + 当前故事节拍的角度，这个镜头到底能不能用？能支撑什么观点？不能支撑什么观点？”；
* **A6.1 解决的问题（Gate 真实性）**：
  * **系统推荐 vs 人工门禁分离**：系统只负责输出候选 Top3、主观解读、证据边界与算法推荐标签（`system_recommendation`）；
  * **严禁自评冒充 Gate PASS**：在真人审核前，`human_verdict` 必须保持为 `pending`，正式 Gate 状态保持为 `awaiting_human_review`，`gate_passed` 为 `false`；
  * **严禁提前进入 A7**：未完成真人审核或可用率不足 $80\%$ 时，流水线彻底阻断。

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
                      [A6.1 独立 Gate Evaluation 层]
                      ├─ 系统自评指标 (System Candidate Coverage: 100%)
                      ├─ 8个需求独立人工验收包 (Markdown + JSON)
                      ├─ 默认状态: human_verdict = pending, gate = awaiting_human_review
                      └─ 真人审核确认 (Top3 至少 1 个 usable 即为需求通过，总率 ≥ 80% 方可 PASS)
```

### 1.2 严格防污染与生命周期铁律
1. **绝对保护 L1 Objective Evidence**：A6 是上层解释，严禁修改任何 L1 物理事实数据；
2. **绝对不私自写回 L2 Generic Affordance**：L3 主观解读不等于通用戏剧潜能，必须等待 A9 知识回流流水线经过人工审核后方可受控晋升；
3. **绝对不提前进入 A7 导演决策**：原声策略在此仅作为建议（`audio_suggestion`），最终剪辑 IN/OUT、原声与解说词锁定严格留给 A7；
4. **绝无偷换镜头**：A6 的 Top3/Top5 重排必须 100% 源自 A5 检索返回的 Top20 候选池，严禁人工指定外部镜头。

---

## 二、 模型与 Provider 架构现状：清晰界定 Pipeline 验证 vs 真实模型理解

### 2.1 抽象 Provider 接口规范
系统在 [`src/perspective/providers/perspective-provider.mjs`](../../src/perspective/providers/perspective-provider.mjs) 中建立了标准规范：
```javascript
export class IPerspectiveProvider {
  interpretCandidate({ persona, topic, viewpoint, beat, requirement, candidate }) { ... }
  get provider_name() { ... }
  get is_fallback() { return false; }
}
```

### 2.2 真实模型接入现状透明声明
> [!IMPORTANT]
> **真实模型状态声明**：  
> 当前 A6 验证的是 **Perspective Re-reading 数据链路 (Pipeline) + 确定性概念网 Fallback**。  
> **尚未验证真实 LLM / VLM Perspective Re-reading 理解能力**。

* **当前环境 Provider**：`SemanticAndConceptPerspectiveProvider` (`provider_name: "semantic_concept_perspective_provider_v1"`)；
* **透明 Fallback 标记**：强制标注 `is_fallback: true`；
* **当前能力范围**：验证了博主画像传入、观点与节拍注入、打分权重公式、证据边界生成逻辑、多候选对比重排算法以及数据链路契约校验；
* **后续接入**：一旦具备在线多模态 LLM/VLM 服务凭证，只需实现 `IPerspectiveProvider` 即可平滑切换，上层 A6 服务接口与契约无需变动。

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
  * **原因**：在老周视角下，站长点燃雪茄的静默微动作为节拍结论提供了极高的“动作留白”与“权谋沉思”叙事价值。
* **跃迁案例 2（选题B `req_probe_01` 致命邀约）**：
  * `scene_0094`（谢若林在客厅沙发：“老子就开个刀剑工厂，这都是延安的，这都是过期的...”）：
  * **A5 排名第 10 $\rightarrow$ A6 跃升至第 4 名 (Delta: +6)**；
  * **原因**：贴合老周追剧关注的“地下交易与利益勾兑”，证据支撑度大幅攀升。
* **跃迁案例 3（选题B `req_probe_04` 站台撤离）**：
  * `scene_0190`（余则成提着皮箱护送晚秋登上绿皮列车车厢踏板）：
  * **A5 排名第 3 $\rightarrow$ A6 升至第 1 名 (Delta: +2)**；
  * **原因**：在撤离节拍中，该镜头包含了核心动作执行（提皮箱、上踏板），物理事实最完备。

---

## 五、 A6.1 独立 Gate Evaluation 层与人工验收包规范

### 5.1 系统自评与正式门禁严格分离
针对 A6 Review 意见，系统彻底重构了 Gate 评估模型：
* **系统自评候选覆盖率 (System Candidate Coverage)**：**100.0% (8/8)**。系统算法认为每个需求均有可用候选；但这仅代表程序自评，**绝不能宣称为正式 Retrieval Top3 Gate PASS**；
* **正式人工门禁 (Human Gate)**：
  * 门禁状态当前为：**`awaiting_human_review`**；
  * `gate_passed` 为：**`false`**；
  * `human_usable_coverage` 为：**0.0% (0/8)**（等待真人审核）；
  * **准入铁律**：必须由人工完成全部 8 个需求的核验，每个需求 Top3 中至少存在 1 个镜头被标记为 `usable`，总可用率 $\ge 80.0\%$ 时，才正式判定为 `gate_human_pass`。

### 5.2 独立人工验收包产物
已为 2 个真实选题共 8 个需求生成独立验收包：
1. **人工审核文档 (Markdown)**：[`docs/agent-poc/a6-human-gate-review.md`](./a6-human-gate-review.md)；
2. **机器可读数据 (JSON)**：[`src/perspective/results/a6_human_gate_review.json`](../../src/perspective/results/a6_human_gate_review.json)。

每个需求完整输出：
- 选题信息、论点、故事节拍、素材诉求；
- Top1、Top2、Top3 候选项；
- 真实时间码（in/out/duration）、台词（dialogue）、人物（characters）、动作（physical_actions）、环境（scene_env）；
- 采样代表帧引用（sample_frame_refs）；
- A5 rank、A6 rank、Rank Delta、检索分、视角分、重排分；
- 主观解读（L3）与事实边界（Evidence Boundary）；
- 系统推荐（system_recommendation, system_supports_claim）；
- **人工审核留白字段**：`human_verdict: "pending"`, `human_reason: ""`, `reviewer: null`, `reviewed_at: null`。

### 5.3 8 个需求待审核概览表

| 需求编号 | 选题与节拍 | A6 Top 1 镜头 | A6 Top 2 镜头 | A6 Top 3 镜头 | 系统推荐 | 当前人工结论 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| 1 | 吴站长怀疑余则成 —— 师生眼神交锋 (`req_wu_01`) | `scene_0074` | `scene_0060` | `scene_0044` | strong_support | `pending` |
| 2 | 吴站长怀疑余则成 —— 敲山震虎言语试探 (`req_wu_02`) | `scene_0074` | `scene_0044` | `scene_0073` | strong_support | `pending` |
| 3 | 吴站长怀疑余则成 —— 档案与叛徒危局 (`req_wu_03`) | `scene_0142` | `scene_0149` | `scene_0134` | strong_support | `pending` |
| 4 | 吴站长怀疑余则成 —— 沉默收尾生存法则 (`req_wu_04`) | `scene_0057` | `scene_0061` | `scene_0084` | strong_support | `pending` |
| 5 | 最危险的一次试探 —— 致命邀约 (`req_probe_01`) | `scene_0125` | `scene_0092` | `scene_0142` | strong_support | `pending` |
| 6 | 最危险的一次试探 —— 假夫妻危局 (`req_probe_02`) | `scene_0125` | `scene_0142` | `scene_0149` | strong_support | `pending` |
| 7 | 最危险的一次试探 —— 金条主义博弈 (`req_probe_03`) | `scene_0139` | `scene_0150` | `scene_0149` | strong_support | `pending` |
| 8 | 最危险的一次试探 —— 暗夜车站撤离 (`req_probe_04`) | `scene_0190` | `scene_0202` | `scene_0205` | strong_support | `pending` |

---

## 六、 自动化测试验证矩阵

全套测试用例运行结果：**75 / 75 全部通过，0 失败**。
```bash
node --test tests/*.test.mjs
```
新增测试套件 [`tests/perspective-rereading.test.mjs`](../../tests/perspective-rereading.test.mjs) 专项覆盖 13 项重点：
1. 真实消费 A5 Top20 输入，每个 Requirement 接收完整 20 个候选；
2. PerspectiveProvider 接口与 Fallback 透明声明规范（`is_fallback: true`）；
3. 单候选 Re-reading 契约合规与 Schema 校验；
4. 防幻觉机制：严格确立 Evidence Boundary；
5. 允许“不支持该观点”：弱事实镜头置 supports_claim 为 partial/false；
6. 证据不足告警机制：不可行需求触发 INSUFFICIENT_EVIDENCE 与行动建议；
7. Top20 重排与 Rank Delta 计算（保留 A5 分数与 A6 分数）；
8. 绝无偷换镜头：Top3/Top5 严格出自 A5 Top20 集合；
9. L1 客观事实与 L2 通用潜能只读防污染保护；
10. **系统自评与正式门禁严格分离**：未审核前 `gate_passed: false`，状态为 `awaiting_human_review`；
11. **A6.1 独立人工验收包完整性与防冒充断言**：全量候选 `human_verdict === "pending"`；
12. **模拟人工审核流转与正式 Gate PASS 判定**：验证只有真人将 $\ge 80\%$ 需求的 Top3 至少 1 个候选置为 `usable` 时才正式通过；
13. 人工验收 Markdown 与 JSON 产物一致性校验。

---

## 七、 交付物清单与停止状态

1. **核心服务与 Evaluator 源码**：
   * `src/perspective/perspective-rereading-service.mjs` (视角重读服务与门禁代理)
   * `src/perspective/evaluator/human-gate-evaluator.mjs` (独立人工门禁评估器与验收包生成器)
   * `src/perspective/providers/perspective-provider.mjs` (Provider 接口与确定性概念网 fallback 实现)
   * `src/perspective/persona/laozhou-persona.mjs` (老周追剧博主画像)
2. **测试套件**：
   * `tests/perspective-rereading.test.mjs` (13 项专项测试，75/75 全绿)
3. **独立人工验收包产物**：
   * `docs/agent-poc/a6-human-gate-review.md` (标准 Markdown 审核手册)
   * `src/perspective/results/a6_human_gate_review.json` (机器可读待审数据包)
4. **视角重读与系统自评数据**：
   * `src/perspective/results/a6_results_topic_a.json`
   * `src/perspective/results/a6_results_topic_b.json`
   * `src/perspective/results/a6_gate_evaluation.json`
5. **执行脚本**：
   * `scripts/run_a6_perspective_evaluation.mjs` (全流程运行与产物生成脚本)

---

> [!CAUTION]
> **严格阻断声明 (STRICT HALT)**：  
> 当前阶段状态明确为 **`A6.1 awaiting_human_review`**。  
> **Retrieval Top3 Gate 在真人审核完成前保持未通过状态，严禁进入 A7 Director Final 阶段，严禁开始视频剪辑与语音合成！**
