# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前分支：`agent-poc/a1-contracts`  
当前阶段：**POC-AGENT A6.1: 动态 Perspective Re-reading + Retrieval Top3 真实门禁隔离与人工验收包**  
当前状态：`A6.1 awaiting_human_review` (A1 approved, A2 approved, A3 approved, A4 approved, A4.5.1 approved, A5 approved, A6.1 awaiting_human_review; 系统自评覆盖率 100%，独立人工验收包已就绪，已彻底停止，严禁进入 A7)  
执行责任：🏛️ 全栈架构师 & 🧪 测试与质量专家 & 📐 API规范专家  

---

## 阶段门禁状态 (Two-Gate System)

| 门禁名称 | 阶段点 | 当前状态 | 准入/通过标准 |
|:---|:---:|:---:|:---|
| **A0 Review Gate** | A0 结束点 | ✅ **已通过** (2026-10-05) | Topic-First 架构方案与三层素材模型审查通过 |
| **Retrieval Top3 实测 Gate** | A6 结束点 | ⏳ **等待人工审核 (awaiting_human_review)** (2026-10-05) | 真实影视素材（**《潜伏》第18集全片约45:02**，共 2702.013 秒）全自动检索与视角重读：系统候选覆盖率自评为 **100.0% (8/8)**；已生成 8 需求独立人工验收包。**准入铁律：必须由真人完成全部 8 个需求审核，且每个需求 Top3 至少有 1 个镜头被人工核定为 `usable`，总可用率 $\ge 80.0\%$ 方可正式放行 A7！未审核前严禁系统自评冒充 Gate PASS**。 |

---

## A0–A10 分阶段实施路线图 (总体完成度：75%)

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
| **A6. 动态 Perspective Re-reading** | 12% | 🚪 **awaiting_human_review** | [`src/perspective/`](src/perspective/)<br>[`docs/agent-poc/a6-human-gate-review.md`](docs/agent-poc/a6-human-gate-review.md)<br>[`docs/agent-poc/a6-perspective-rereading-report.md`](docs/agent-poc/a6-perspective-rereading-report.md)<br>[`tests/perspective-rereading.test.mjs`](tests/perspective-rereading.test.mjs) | 完成 A6.1 门禁隔离与模型边界透明化：独立 Gate Evaluation 层，系统自评覆盖率 (100%) 与正式人工门禁严格分离；生成 8 需求独立人工验收包（默认 pending 严禁冒充）；测试 75/75 全绿 |
| **A7. Director 真实证据终编服务** | 10% | 待开始 | Final Director Plan 锁定生成器 | **严禁提前进入**；等待真人完成 A6.1 门禁审核；依据真实证据敲定台词、原声、IN-OUT |
| **A8. VMV Stage 4/5 真实生产对接** | 8% | 待开始 | 本地生产 Runner 与真实 MP4 输出 | 阿里云 TTS 真实配音与 FFmpeg 剪辑压制 |
| **A9. 动态解释向通用 Affordance 受控回流** | 4% | 待开始 | 知识回流提纯流水线 | 验证有效模式回流至 L2，绝对隔离 L1 |
| **A10. 双博主同素材 A/B 验证验收** | 4% | 待开始 | 两支不同风格的真实 1080p MP4 与指标报告 | 终极验收：同一部剧同素材池、双博主截然不同视听成品 |

---

## 阶段产物与执行清单 (A1→A6.1)

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
    - 235 个连续场景（0 到 2702.013s 连续无空洞，尾部补齐 105 个镜头）；
  - **来源审计与段级继承衰减机制落地**（`independent_keyframe` vs `segment_inherited`）；
  - **保留可复现脚本与配置清单**：[`src/evidence/config/canonical-manifest.json`](src/evidence/config/canonical-manifest.json)；
  - **完成 20 个分层抽样人工检查**；更正口径为“《潜伏》第18集全片约45:02”；测试 50/50 全部通过。
- [x] **A5 (Approved)**：真实候选镜头召回 Retrieval Pipeline：
  - **交付 CandidateRetrievalService 服务核心与稳定程序接口** ([`src/retrieval/retrieval-service.mjs`](src/retrieval/retrieval-service.mjs))；
  - **四路 Hybrid 匹配引擎与质量多样性重排**（结构化、词法、语义Fallback、L2潜能协同、多样性去重）；
  - **L2 通用叙事潜能种子库** ([`src/retrieval/data/seed_l2_affordances.json`](src/retrieval/data/seed_l2_affordances.json)，472 条合规潜能）；
  - **双真实选题端到端检索与持久化产物**（8 个需求，每个产出 20 个合规候选镜头，共 160 个候选）；
  - **人工分层抽样 Usability 审计**：24 个候选抽查，可用率达 91.7%；测试 62/62 全绿。
- [x] **A6.1 (Awaiting Human Review)**：动态 Perspective Re-reading + 人工门禁隔离：
  - **交付 PerspectiveReReadingService 核心与稳定程序接口** ([`src/perspective/perspective-rereading-service.mjs`](src/perspective/perspective-rereading-service.mjs))；
  - **交付独立 Gate Evaluation 层与 Evaluator** ([`src/perspective/evaluator/human-gate-evaluator.mjs`](src/perspective/evaluator/human-gate-evaluator.mjs))：
    - 严格分离“系统推荐”与“真人门禁”，系统只提供 `system_recommendation` 与 `system_candidate_coverage` (自评 100%)；
    - 在真人审核前，所有候选 `human_verdict` 强制为 `pending`，严禁程序冒充真人，门禁保持 `awaiting_human_review`，`gate_passed: false`；
    - 判定规则：每个需求 Top3 至少有 1 个镜头被人工核定为 `usable` 即为该需求 PASS；全量 8 需求总可用率 $\ge 80.0\%$ 时正式通过 Gate；
  - **生成 8 个真实需求独立人工验收包**：
    - 审核文档：[`docs/agent-poc/a6-human-gate-review.md`](docs/agent-poc/a6-human-gate-review.md)；
    - 机器可读：[`src/perspective/results/a6_human_gate_review.json`](src/perspective/results/a6_human_gate_review.json)；
    - 包含真实时间码、台词、人物、动作、环境、帧引用、A5/A6 排名与打分、主观解读与事实边界、系统推荐与待填表格；
  - **显式界定真实模型边界与透明 Fallback**：
    - 明确 A6 当前验证的是 **Pipeline + deterministic fallback**，尚未验证真实 LLM/VLM 理解能力；已实现抽象规范 `IPerspectiveProvider`；
  - **防幻觉机制与证据边界 (Evidence Boundary)**：强制切分 L1 客观事实底线与 L3 叙事推论边界；
  - **综合自动化测试套件 ([`tests/perspective-rereading.test.mjs`](tests/perspective-rereading.test.mjs))**：13 项专项测试覆盖真实消费、防污染、系统与人工分离、防冒充断言与流转模拟，全工程 **75/75 测试全绿**；
  - **专题报告**：[`docs/agent-poc/a6-perspective-rereading-report.md`](docs/agent-poc/a6-perspective-rereading-report.md)。
- [x] **技术债登记**：
  - **VMV Stage 4/5 适配器消费者集成测试待补**：当前 [`src/contracts/vmv-adapter.mjs`](src/contracts/vmv-adapter.mjs) 仅完成 Schema-level 数据映射与静态校验，尚未经过底层真实 VMV 消费链路（`python -m vmv render`、TTS 与 FFmpeg）的 Consumer Integration Test。在 A7/A8 前必须验证，严禁再写“100%兼容”。
- [x] **严格守界**：**严禁进入 A7 Director Final，严禁视频剪辑、TTS 与 MP4 合成，原地停止等待真人审核**。

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
10. **2026-10-05 10:16**：A4.5 Review 反馈：**`changes_requested`**。
11. **2026-10-05 10:30**：完成 A4.5.1 阻塞问题全量修复，交付 Canonical 数据集（235 场景，0~2702.013s 连续无空洞）、来源审计机制、Manifest 配置与构建脚本、20 个抽查表，全工程 50/50 测试全绿，状态设为 **`A4.5.1 awaiting_review`**。
12. **2026-10-05 10:55**：A4.5.1 Review 审查正式通过（approved），授权进入 POC-AGENT A5 阶段。
13. **2026-10-05 11:05**：完成 POC-AGENT A5 全部交付：实现 CandidateRetrievalService、四路 Hybrid 匹配器、概念网透明 Fallback、L2 潜能库、多样性重排与质量衰减、双真实选题（吴站长怀疑 / 危险试探）E2E 检索与 Top20 持久化产物、Usability 人工抽样审计、全套 62/62 测试通过，状态设为 **`A5 awaiting_review`**。
14. **2026-10-05 11:15**：A5 Review 审查正式通过（approved），授权进入 POC-AGENT A6 阶段。
15. **2026-10-05 11:25**：完成 POC-AGENT A6 初版交付，提交报告，Commit `5d45f83`。
16. **2026-10-05 11:35**：A6 Review 反馈：**`changes_requested`**。指出两点：① Top3 Gate 的 PASS 属于系统自评，不等于真实人工验收，必须建立独立 Gate Evaluation 层，输出 8 需求独立人工验收包，`human_verdict` 默认必须为 `pending`，严禁冒充人工审核；② 明确当前验证的是 Perspective Re-reading pipeline + deterministic fallback，尚未验证真实 LLM/VLM 理解能力。要求执行 A6.1 修复并保持阻断，严禁进入 A7。
17. **2026-10-05 11:50**：完成 A6.1 全部审查修复：
    - 实现独立 `HumanGateEvaluator` 与评估流转；
    - 系统自评覆盖率 (100%) 与正式门禁严格分离，正式门禁状态置为 `awaiting_human_review`，`gate_passed: false`；
    - 生成 8 需求独立人工验收包：`docs/agent-poc/a6-human-gate-review.md` 与 `src/perspective/results/a6_human_gate_review.json`；
    - 报告中明确 Pipeline 验证 vs 真实模型理解边界；
    - 全工程 **75/75 测试全绿**（含 A6.1 专项 13 项测试）；
    - 状态设为 **`A6.1 awaiting_human_review`**，原地彻底停止，严禁进入 A7。
