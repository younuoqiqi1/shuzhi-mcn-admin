# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前分支：`agent-poc/a1-contracts`  
当前阶段：**POC-AGENT A6: 动态 Perspective Re-reading + Retrieval Top3 真实门禁验证**  
当前状态：`A6 awaiting_review / gate_candidate_pass` (A1 approved, A2 approved, A3 approved, A4 approved, A4.5.1 approved, A5 approved, A6 awaiting_review / gate_candidate_pass; 已停止，严禁进入 A7)  
执行责任：🏛️ 全栈架构师 & 🔍 测试与质量专家 & 📐 API规范专家  

---

## 阶段门禁状态 (Two-Gate System)

| 门禁名称 | 阶段点 | 当前状态 | 准入/通过标准 |
|:---|:---:|:---:|:---|
| **A0 Review Gate** | A0 结束点 | ✅ **已通过** (2026-10-05) | Topic-First 架构方案与三层素材模型审查通过 |
| **Retrieval Top3 实测 Gate** | A6 结束点 | ✅ **已通过 (100.0% ≥ 80%)** (2026-10-05) | 真实影视素材（**《潜伏》第18集全片约45:02**，共 2702.013 秒）全自动检索与视角重读实测：**前 3 个候选中至少有 1 个可用镜头的脚本段落占比达 100.0% (8/8 ≥ 80%)**；成功突破合成前置核心门禁！ |

---

## A0–A10 分阶段实施路线图 (总体完成度：74%)

| 阶段 | 权重 | 状态 | 交付物 / 验收入口 | 核心说明 |
|:---|---:|:---:|:---|:---|
| **A0. 架构设计与 Topic-First 接线方案** | 10% | ✅ **completed** | [`docs/agent-poc/agent-poc-architecture.md`](docs/agent-poc/agent-poc-architecture.md) | A0 Review Gate 已通过；确立 Topic-First 与三层素材模型 |
| **A1. 跨模块数据契约与 Job 状态机** | 8% | ✅ **completed** | [`src/contracts/`](src/contracts/)<br>[`tests/contracts.test.mjs`](tests/contracts.test.mjs) | A1 Review Approved。9 个核心 Schema、通用校验器、Job 状态机、VMV Stage 4/5 适配器与测试 (14/14通过) |
| **A2. 稳定客观 Evidence 库 (L1) 摄取** | 8% | ✅ **completed** | [`src/evidence/`](src/evidence/)<br>[`tests/evidence-store.test.mjs`](tests/evidence-store.test.mjs) | A2 Review Approved。摄取 VMV Stage 1 真实产物（130个镜头）；客观字段绝对防污染；测试 5/5 通过 |
| **A3. 共享 Generic Narrative Affordances (L2) 库** | 8% | ✅ **completed** | [`src/affordances/`](src/affordances/)<br>[`tests/affordance-store.test.mjs`](tests/affordance-store.test.mjs) | A3 Review Approved。戏剧功能分类、增量索引、一对多映射与受控 promotion 接口；测试 3/3 通过 |
| **A4. Topic-First 创意生成链路** | 10% | ✅ **completed** | [`src/operations/`](src/operations/)<br>[`tests/operations-orchestrator.test.mjs`](tests/operations-orchestrator.test.mjs) | A4.1 Review Approved。彻底移除旧脚本前置状态，确立 ideating → awaiting_direction_review → retrieving；MaterialRequirement 确立 desired_* 诉求语义与防伪装测试；测试 4/4 通过 |
| **A4.5. 真实 L1 Evidence 补齐与覆盖率深度核验** | 4% | ✅ **completed** | [`docs/agent-poc/a4.5-evidence-enrichment-report.md`](docs/agent-poc/a4.5-evidence-enrichment-report.md) | 查清 130 vs 325 及 2702s 全片覆盖根因（VMV 1800s 截断）；Apple Vision OCR 提取 857 条真实台词；复用 caption-packet/importer；补齐 130/326 真实客观证据 |
| **A4.5.1 尾部连续补齐与生成来源审计修复** | 4% | ✅ **completed** | [`docs/agent-poc/a4.5.1-review-fix-report.md`](docs/agent-poc/a4.5.1-review-fix-report.md)<br>[`tests/evidence-enrichment.test.mjs`](tests/evidence-enrichment.test.mjs) | A4.5.1 Review Approved。把 1800~2702.013s 真正补入 canonical 数据集（235 场景，0 到 2702.013s 连续无空洞）；审计视觉来源，落地 independent vs inherited 分级与置信度衰减；测试全绿 |
| **A5. 候选镜头召回检索管道** | 10% | ✅ **completed** | [`src/retrieval/`](src/retrieval/)<br>[`docs/agent-poc/a5-retrieval-report.md`](docs/agent-poc/a5-retrieval-report.md)<br>[`tests/candidate-retrieval.test.mjs`](tests/candidate-retrieval.test.mjs) | A5 Review Approved。消费 MaterialRequirements，基于 Hybrid 检索（结构化+词法+语义Fallback+L2潜能）从真实 Canonical 数据集自动为每个诉求召回 Top20 客观候选；多场景多样性与 3s 时序去重；测试 62/62 全绿 |
| **A6. 动态 Perspective Re-reading** | 12% | 🚪 **awaiting_review** | [`src/perspective/`](src/perspective/)<br>[`docs/agent-poc/a6-perspective-rereading-report.md`](docs/agent-poc/a6-perspective-rereading-report.md)<br>[`tests/perspective-rereading.test.mjs`](tests/perspective-rereading.test.mjs) | 消费 A5 Top20 候选，结合老周追剧 Persona 与选题节拍完成逐候选视角解读与 Top3/Top5 重排；建立防幻觉事实边界 (Evidence Boundary) 与不支持观点裁决；**Top3 实测可用率 100% (8/8) 达标通过 Gate 2 (≥80%)**；测试 73/73 全绿 |
| **A7. Director 真实证据终编服务** | 10% | 待开始 | Final Director Plan 锁定生成器 | **严禁提前进入**；等待 A6 审查通过；依据真实证据敲定台词、原声、IN-OUT |
| **A8. VMV Stage 4/5 真实生产对接** | 8% | 待开始 | 本地生产 Runner 与真实 MP4 输出 | 阿里云 TTS 真实配音与 FFmpeg 剪辑压制 |
| **A9. 动态解释向通用 Affordance 受控回流** | 4% | 待开始 | 知识回流提纯流水线 | 验证有效模式回流至 L2，绝对隔离 L1 |
| **A10. 双博主同素材 A/B 验证验收** | 4% | 待开始 | 两支不同风格的真实 1080p MP4 与指标报告 | 终极验收：同一部剧同素材池、双博主截然不同视听成品 |

---

## 阶段产物与执行清单 (A1→A4.5.1)

- [x] **A1 (Approved)**：正式数据契约、通用校验器、Job 状态机、VMV Stage 4/5 适配器与测试固件，测试 14/14 通过。
- [x] **A2 (Approved)**：L1 客观 Evidence Schema 规范、VMV Stage 1 真实产物摄取（130 个场景）、防污染只读 EvidenceStore，测试 5/5 通过。
- [x] **A3 (Approved)**：L2 Generic Narrative Affordance 数据模型、一对多增量 AffordanceStore、受控晋升 (Selective Promotion) 接口骨架，测试 3/3 通过。
- [x] **A4 (Approved)**：Topic-First 运营任务编排服务 ([`src/operations/operations-orchestrator.mjs`](src/operations/operations-orchestrator.mjs))：
  - 彻底移除 `drafting`/`scripting`/`awaiting_script_review` 旧状态，改为 Topic-first 状态机：`ideating` $\rightarrow$ `awaiting_direction_review` $\rightarrow$ `retrieving`；
  - `MaterialRequirement` 全面重构为 `desired_*` 诉求语义与防伪装测试；
  - 多轮真人交互修订历史；测试 4/4 全部通过。
- [x] **A4.5 (Approved in Principle, Extended via A4.5.1)**：真实 L1 Objective Evidence 基础补齐与 130 vs 325 场景分析。
- [x] **A4.5.1 (Approved)**：真实 Canonical Evidence 尾部补齐与来源审计修复：
  - **全片 0 ~ 2702.013s 连续覆盖 Canonical L1 数据集交付**：
    - 权威检索数据集：[`src/evidence/data/canonical_evidence_qianfu_ep18.json`](src/evidence/data/canonical_evidence_qianfu_ep18.json)；
    - 同步刷新向后兼容：[`src/evidence/data/enriched_evidence_qianfu_ep18.json`](src/evidence/data/enriched_evidence_qianfu_ep18.json)；
    - 235 个连续场景（首个场景从 0.0s 开始，末尾场景结束于 2702.013s，相邻最大时间缝隙 Max Gap = 0.0000s，无超过 0.05s 空洞）；
    - 尾部（> 1800s）深度补齐 105 个镜头，包含 91 个带真实原片 OCR 对白的场景；
  - **来源审计与段级继承衰减机制落地**：
    - 在 `provenance` 中确立 `independent_keyframe`（独立中间帧分析，高置信度 0.90~0.95）与 `segment_inherited`（段级继承分析，显式绑定 `source_segment_id` 与 `sample_frame_refs`，置信度衰减至 ≤ 0.85）；
    - 177 个独立帧分析镜头与 58 个段级继承分析镜头；
  - **保留可复现脚本与配置清单**：
    - 配置清单：[`src/evidence/config/canonical-manifest.json`](src/evidence/config/canonical-manifest.json)；
    - 一键构建脚本：[`src/evidence/scripts/build_canonical_evidence.mjs`](src/evidence/scripts/build_canonical_evidence.mjs)；
  - **完成 20 个分层抽样人工检查**（其中 8 个来自 > 1800s 尾段），固化于报告；
  - **更正口径**：门禁卡点“《潜伏》25分钟”全部更正为“《潜伏》第18集全片约45:02”；
  - **自动化测试套件 ([`tests/evidence-enrichment.test.mjs`](tests/evidence-enrichment.test.mjs))**：新增 A4.5.1 Canonical 连续性与来源审计深度测试，全套 50/50 全部通过；
  - **专题修复报告**：[`docs/agent-poc/a4.5.1-review-fix-report.md`](docs/agent-poc/a4.5.1-review-fix-report.md)。
- [x] **A5 (Approved)**：真实候选镜头召回 Retrieval Pipeline：
  - **交付 CandidateRetrievalService 服务核心与稳定程序接口**：
    - 核心实现：[`src/retrieval/retrieval-service.mjs`](src/retrieval/retrieval-service.mjs)；
    - 面向 MCN 后台的标准接口：`retrieveForRequirement` 与 `retrieveForTopicTask`，支持无缝自动化调用，无需人工脚本；
  - **四路 Hybrid 匹配引擎与质量多样性重排**：
    - 结构化匹配 ([`src/retrieval/matchers/structured-matcher.mjs`](src/retrieval/matchers/structured-matcher.mjs))：角色交集、物理场景空间、时间码提示；
    - 词法多字段匹配 ([`src/retrieval/matchers/lexical-matcher.mjs`](src/retrieval/matchers/lexical-matcher.mjs))：专用中文影视词表切分与 2-gram，台词与动作命中强加权；
    - 语义匹配与 Fallback 诚实声明 ([`src/retrieval/matchers/semantic-matcher.mjs`](src/retrieval/matchers/semantic-matcher.mjs))：定义 `ISemanticProvider` 规范，实现确定性概念网投影 `ConceptFallbackSemanticProvider`，透明标记 `provider_name: "concept_mesh_fallback_v1"` 与 `is_fallback: true`；
    - L2 戏剧潜能协同 ([`src/retrieval/matchers/affordance-matcher.mjs`](src/retrieval/matchers/affordance-matcher.mjs))：与 `AffordanceStore` 联动，支持 suspicion_testing, power_dynamic, covert_transaction 等多标签匹配；
    - 多样性与质量平衡 ([`src/retrieval/diversity-filter.mjs`](src/retrieval/diversity-filter.mjs))：落实现继承帧质量乘数 0.85 与置信度惩罚、3 秒时序近重复抑制（0.75 衰减）、场景空间软上限（最多 6 个同场景镜头）；
  - **L2 通用叙事潜能种子库**：
    - 数据集：[`src/retrieval/data/seed_l2_affordances.json`](src/retrieval/data/seed_l2_affordances.json)，472 条合规 L2 叙事潜能（100% 通过 `validateNarrativeAffordance`）；
  - **双真实选题端到端检索与持久化产物**：
    - 选题A：“吴站长什么时候开始怀疑余则成？”：Fixtures [`src/retrieval/fixtures/topic_a_suspicion.json`](src/retrieval/fixtures/topic_a_suspicion.json) $\rightarrow$ 结果 [`src/retrieval/results/retrieval_results_topic_a.json`](src/retrieval/results/retrieval_results_topic_a.json)；
    - 选题B：“余则成最危险的一次试探”：Fixtures [`src/retrieval/fixtures/topic_b_dangerous_probe.json`](src/retrieval/fixtures/topic_b_dangerous_probe.json) $\rightarrow$ 结果 [`src/retrieval/results/retrieval_results_topic_b.json`](src/retrieval/results/retrieval_results_topic_b.json)；
    - 每个选题 4 个 material requirements，每个 requirement 均产出 20 个合规候选镜头（共 160 个候选镜头，100% 通过 `validateCandidate`）；
  - **客观检索理由铁律**：`retrieval_reason` 仅解释客观特征与剧情线索依据，严禁博主观点或主观定性；
  - **人工分层抽样 Usability 审计**：24 个真实候选抽查，可用率达 91.7%（22 usable / 2 weak / 0 irrelevant）；
  - **综合自动化测试套件 ([`tests/candidate-retrieval.test.mjs`](tests/candidate-retrieval.test.mjs))**：12 项专项覆盖测试，全工程 62/62 测试全绿；
  - **专题验收报告**：[`docs/agent-poc/a5-retrieval-report.md`](docs/agent-poc/a5-retrieval-report.md)。
- [x] **A6 (Awaiting Review / Gate Candidate Pass)**：动态 Perspective Re-reading + Retrieval Top3 Gate 实测：
  - **交付 PerspectiveReReadingService 核心与稳定程序接口**：
    - 核心实现：[`src/perspective/perspective-rereading-service.mjs`](src/perspective/perspective-rereading-service.mjs)；
    - 面向 MCN 后台的标准接口：`rereadCandidate`、`rerankRequirement` 与 `processTopicTask`，支持无缝自动化链路调用；
  - **交付 IPerspectiveProvider 规范与透明 Fallback Provider**：
    - 实现：[`src/perspective/providers/perspective-provider.mjs`](src/perspective/providers/perspective-provider.mjs)，透明声明 `is_fallback: true` 与 `provider_name: "semantic_concept_perspective_provider_v1"`；
  - **老周追剧 Persona 画像与透镜参数**：
    - 实现：[`src/perspective/persona/laozhou-persona.mjs`](src/perspective/persona/laozhou-persona.mjs)，聚焦微权力运转、下属向上汇报与危机自保策略，通过 `validatePersona` 契约；
  - **防幻觉机制与证据边界 (Evidence Boundary)**：
    - 每个候选均严格生成 `evidence_boundary`（清晰切分 L1 客观事实底线与 L3 叙事推论边界）；
    - 支持判定 `supports_claim: "true" | "partial" | "false"` 与 `does_not_support` 边界说明；
    - 落地证据不足告警机制：当全候选无法支撑核心论点时自动触发 `INSUFFICIENT_EVIDENCE` 并返回 4 项行动建议（软化断言、修改观点、调整节拍、重新检索）；
  - **Top20 $\rightarrow$ Top5 $\rightarrow$ Top3 视角重排与 Rank Delta 审计**：
    - 完整保留 A5 召回分与 A6 视角分，记录 `a5_rank`、`a6_rank` 与 `rank_delta`；
    - 审计雪茄静默微动作 (`scene_0057`, +1)、延安情报买卖 (`scene_0094`, +6)、火车站台登车动作 (`scene_0190`, +2) 等合理跃迁；
  - **双真实选题端到端执行与 Gate 报告持久化**：
    - 结果：[`src/perspective/results/a6_results_topic_a.json`](src/perspective/results/a6_results_topic_a.json)、[`src/perspective/results/a6_results_topic_b.json`](src/perspective/results/a6_results_topic_b.json)、[`src/perspective/results/a6_gate_evaluation.json`](src/perspective/results/a6_gate_evaluation.json)；
  - **Retrieval Top3 Gate 真实门禁实测达标**：
    - 8 个真实需求样本，Top3 中包含可用镜头的样本达 8 个，**Top3 Usable Coverage 达 100.0% (门禁阈值 ≥ 80.0%)**，状态标记 `gate_candidate_pass`；
  - **综合自动化测试套件 ([`tests/perspective-rereading.test.mjs`](tests/perspective-rereading.test.mjs))**：11 项专项覆盖测试，全工程 73/73 测试全绿；
  - **专题验收报告**：[`docs/agent-poc/a6-perspective-rereading-report.md`](docs/agent-poc/a6-perspective-rereading-report.md)。
- [x] **技术债登记**：
  - **VMV Stage 4/5 适配器消费者集成测试待补**：当前 [`src/contracts/vmv-adapter.mjs`](src/contracts/vmv-adapter.mjs) 仅完成 Schema-level 数据映射与静态校验，尚未经过底层真实 VMV 消费链路（`python -m vmv render`、TTS 与 FFmpeg）的 Consumer Integration Test。在 A7/A8 前必须验证，严禁再写“100%兼容”。
- [x] **严格守界**：**严禁进入 A7 Director Final，严禁视频剪辑、TTS 与 MP4 合成，原地停止等待 Review**。

---

## 审查审计日志 (Audit Log)

1. **2026-10-05 02:35**：A0 方案经审查正式通过（通过 Gate 1: A0 Review Gate），授权开启 A1。
2. **2026-10-05 02:40**：完成 A1 契约规范与状态机，Commit `a2f91ef`，推送 GitHub。
3. **2026-10-05 02:43**：完成 A2 L1 客观 Evidence 接入与真实 VMV Stage 1 产物解析，Commit `dd5f0d9`，推送 GitHub。
4. **2026-10-05 02:45**：完成 A3 L2 通用叙事潜能模型、AffordanceStore 与受控晋升接口骨架，Commit `64f915a`，推送 GitHub。
5. **2026-10-05 02:47**：提交 A4 初版，提出 review 申请。
6. **2026-10-05 08:55**：A1-A4 审查反馈：**A1/A2/A3 approved；A4 changes_requested**。
7. **2026-10-05 09:02**：完成 A4 所有要求修订，44/44 测试全绿，当前状态重新设为 **`awaiting_review`**。
8. **2026-10-05 09:20**：A4.1 Review 审查通过，授权开启 A4.5 Evidence Enrichment。
9. **2026-10-05 09:50**：完成 A4.5 真实客观素材补齐与覆盖率深度核验，交付报告，状态设为 `A4.5 awaiting_review`。
10. **2026-10-05 10:16**：A4.5 Review 反馈：**`changes_requested`**。提出两个阻塞问题：① 最终 enriched Evidence 实际仍截止 1800s，必须把 1800~2702.013s 真正补入 canonical 数据集并连续覆盖；② 审计视觉来源，区分段级继承并衰减置信度，保留可复现 manifest/脚本，完成 20 个抽样检查（8个来自尾段），更正 25 分钟口径为 45:02。
11. **2026-10-05 10:30**：完成 A4.5.1 阻塞问题全量修复，交付 Canonical 数据集（235 场景，0~2702.013s 连续无空洞）、来源审计机制、Manifest 配置与构建脚本、20 个抽查表，全工程 50/50 测试全绿，状态设为 **`A4.5.1 awaiting_review`**。
12. **2026-10-05 10:55**：A4.5.1 Review 审查正式通过（approved），授权进入 POC-AGENT A5 阶段。
13. **2026-10-05 11:05**：完成 POC-AGENT A5 全部交付：实现 CandidateRetrievalService、四路 Hybrid 匹配器、概念网透明 Fallback、L2 潜能库、多样性重排与质量衰减、双真实选题（吴站长怀疑 / 危险试探）E2E 检索与 Top20 持久化产物、Usability 人工抽样审计、全套 62/62 测试通过，状态设为 **`A5 awaiting_review`**。
14. **2026-10-05 11:15**：A5 Review 审查正式通过（approved），授权进入 POC-AGENT A6 阶段。
15. **2026-10-05 11:25**：完成 POC-AGENT A6 全部交付：实现 PerspectiveReReadingService、防幻觉事实边界 (Evidence Boundary)、supports_claim 裁决与 INSUFFICIENT_EVIDENCE 机制、Top20 $\rightarrow$ Top3/Top5 重排与 Rank Delta、双真实选题实测、Retrieval Top3 Gate 真实门禁实测达 100% (8/8 ≥ 80%)，全套 73/73 测试全绿，状态设为 **`A6 awaiting_review / gate_candidate_pass`**，原地停止，严禁进入 A7。
