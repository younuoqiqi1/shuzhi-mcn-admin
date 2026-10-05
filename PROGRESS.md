# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前分支：`agent-poc/a1-contracts`  
当前阶段：**POC-AGENT A6.3: Evidence 对齐收口、检索缺失审计与 OCR 污染清洗**  
当前状态：`A6.3 awaiting_final_review` (A1 approved, A2 approved, A3 approved, A4 approved, A4.5.1 approved, A5 approved, A6.3 awaiting_final_review; 83/83 测试全绿，系统自评覆盖率 87.5%，独立人工验收包已更新就绪，已彻底停止，严禁进入 A7)  
执行责任：🏛️ 全栈架构师 & 🧪 测试与质量专家 & ⚡ 算法与性能专家  

---

## 阶段门禁状态 (Two-Gate System)

| 门禁名称 | 阶段点 | 当前状态 | 准入/通过标准 |
|:---|:---:|:---:|:---|
| **A0 Review Gate** | A0 结束点 | ✅ **已通过** (2026-10-05) | Topic-First 架构方案与三层素材模型审查通过 |
| **Retrieval Top3 实测 Gate** | A6 结束点 | ⏳ **等待终审 (awaiting_final_review)** (2026-10-05) | 真实影视素材（**《潜伏》第18集全片约45:02**，共 2702.013 秒）全自动检索与视角重读：系统证据充分度与候选覆盖率客观自评为 **87.5% (7/8)**；`req_wu_03` 真实识别为 `INSUFFICIENT_EVIDENCE`；已生成 8 需求独立人工验收包（24 候选保持 pending）。**准入铁律：必须由真人完成全部 8 个需求审核，且每个需求 Top3 至少有 1 个镜头被人工核定为 `usable`，总可用率 $\ge 80.0\%$ 方可正式放行 A7！未审核前严禁系统自评冒充 Gate PASS**。 |

---

## A0–A10 分阶段实施路线图 (总体完成度：80%)

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
| **A6. 动态 Perspective Re-reading** | 12% | 🚪 **awaiting_final_review** | [`src/perspective/`](src/perspective/)<br>[`docs/agent-poc/a6-human-gate-review.md`](docs/agent-poc/a6-human-gate-review.md)<br>[`docs/agent-poc/a6.3-evidence-closing-report.md`](docs/agent-poc/a6.3-evidence-closing-report.md)<br>[`tests/perspective-rereading.test.mjs`](tests/perspective-rereading.test.mjs) | 完成 A6.3 Evidence 对齐收口、演职员/歌词 OCR 彻底清洗（全库污染率 0%）、`req_wu_03` 真实识别为 `INSUFFICIENT_EVIDENCE`；重跑 A5/A6 管道并更新 8 需求独立人工验收包；测试 83/83 全绿 |
| **A7. Director 真实证据终编服务** | 10% | 待开始 | Final Director Plan 锁定生成器 | **严禁提前进入**；等待真人完成 A6.3 终审；依据真实证据敲定台词、原声、IN-OUT |
| **A8. VMV Stage 4/5 真实生产对接** | 8% | 待开始 | 本地生产 Runner 与真实 MP4 输出 | 阿里云 TTS 真实配音与 FFmpeg 剪辑压制 |
| **A9. 动态解释向通用 Affordance 受控回流** | 4% | 待开始 | 知识回流提纯流水线 | 验证有效模式回流至 L2，绝对隔离 L1 |
| **A10. 双博主同素材 A/B 验证验收** | 4% | 待开始 | 两支不同风格的真实 1080p MP4 与指标报告 | 终极验收：同一部剧同素材池、双博主截然不同视听成品 |

---

## 阶段产物与执行清单 (A1→A6.3)

- [x] **A1 (Approved)**：正式数据契约、通用校验器、Job 状态机、VMV Stage 4/5 适配器与测试固件，测试 14/14 通过。
- [x] **A2 (Approved)**：L1 客观 Evidence Schema 规范、VMV Stage 1 真实产物解析（130 个场景）、防污染只读 EvidenceStore，测试 5/5 通过。
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
- [x] **A6.1 (Changes Requested)**：动态 Perspective Re-reading + 人工门禁隔离：
  - 实现独立 `HumanGateEvaluator`，确立系统自评与人工门禁隔离，输出 8 需求独立人工验收包。
- [x] **A6.2 (Review Approved in Principle, Closing via A6.3)**：Evidence 对齐修复、细粒度 Retrieval Unit 引入、视角解读质量与一致性验证：
  - 重构生成链，校准东来顺涮肉馆（1590~2160s）为谢若林/余则成，剔除李涯/机要档案室；
  - 剔除 `scene_0125` 中吴敬中错误标注；
  - 引入 370 个 3~15s 细粒度 `Retrieval Units` 数据集；
  - 视角重读与动态模板隔离，落地 `validatePerspectiveConsistency` 一致性校验器。
- [x] **A6.3 (Awaiting Final Review)**：Evidence 对齐收口、检索缺失审计与 OCR 污染清洗：
  - **`req_wu_03` 客观审计与真实收口**：
    - 查实《潜伏》第18集全片根本无机要档案室场景，且李涯全片零出镜，该诉求属历史错设；
    - 算法严格收紧物理空间特征与 Grounding 约束，绝不为凑数制造假命中，全候选评定为 `reject`，系统正确返回 **`INSUFFICIENT_EVIDENCE`** 并输出修改建议；
  - **片尾与片头 OCR 演员表/歌词双引擎彻底过滤**：
    - 建立 `CREDITS_PATTERNS` 与 `LYRICS_PATTERNS` 过滤清洗管道（[`src/evidence/caption-importer.mjs`](src/evidence/caption-importer.mjs)）；
    - 全库 235 个 Canonical Scenes 与 370 个 Retrieval Units 的对白字段污染率降至 **0.0%**；
    - `unit_scene_0213_01` 对白置空并退出 `req_probe_04` 垄断，Top3 100% 回归真实火车站台蒸汽告别镜头（`scene_0193` / `scene_0188` / `scene_0191`）；
  - **端到端流水线重新执行与产物全量更新**：
    - 重新运行 A5 Hybrid 检索与 A6 视角重读，更新结果 JSON；
    - 重新生成 8 需求独立人工验收包：[`docs/agent-poc/a6-human-gate-review.md`](docs/agent-poc/a6-human-gate-review.md) 与 [`src/perspective/results/a6_human_gate_review.json`](src/perspective/results/a6_human_gate_review.json)；
    - 保持所有 24 个候选 `human_verdict` 为 `pending`，系统自评覆盖率更正为客观的 **87.5% (7/8)**，门禁状态置为 `awaiting_human_review`，`gate_passed: false`；
  - **自动化测试套件全量更新与通过**：
    - 工程总测试扩展至 **83/83 passed**（0 失败，新增 2 项 A6.3 专项测试）；
  - **专题修复报告**：[`docs/agent-poc/a6.3-evidence-closing-report.md`](docs/agent-poc/a6.3-evidence-closing-report.md)。
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
16. **2026-10-05 11:35**：A6 Review 反馈：**`changes_requested`**。指出系统自评冒充人工 Gate 以及 Fallback 边界不透明问题，要求执行 A6.1。
17. **2026-10-05 11:50**：完成 A6.1 审查修复：实现独立 `HumanGateEvaluator`，隔离系统推荐与真人门禁，生成 8 需求独立人工验收包（`human_verdict` 均为 `pending`），全工程 75/75 测试全绿，状态设为 `A6.1 awaiting_human_review`，Commit `d38bf9d`。
18. **2026-10-05 12:00**：A6.1 人工审查反馈：**`FAIL / changes_requested`**。指出 4 大核心内容质量阻塞，要求执行 A6.2 修复生成链。
19. **2026-10-05 12:10**：完成 A6.2 修复：重构 `build_canonical_evidence.mjs`，校准东来顺涮肉馆（谢若林/余则成），剔除 `scene_0125` 吴敬中，引入 370 个 Retrieval Units，落地一致性校验器，全工程 81/81 测试全绿，状态设为 `A6.2 awaiting_human_review`，Commit `2842165`。
20. **2026-10-05 12:40**：A6.2 人工审查核定 7/8 requirements usable（可用率 87.5% >= 80%），但指出两项收口问题（`req_wu_03` 检索偏离判定 unusable、`req_probe_04` 片尾 OCR 演职员表/歌词污染），要求执行 A6.3。
21. **2026-10-05 12:45**：完成 POC-AGENT A6.3 全部收口修复：
    - 查实《潜伏》第18集全片无机要档案室且李涯零出镜，`req_wu_03` 属历史错设；算法收紧物理空间特征与 Grounding 约束，全候选判定为 `reject`，正确返回 **`INSUFFICIENT_EVIDENCE`**，杜绝凑数假命中；
    - 落地演职员表（`CREDITS_PATTERNS`）与主题曲歌词（`LYRICS_PATTERNS`）清洗管道，全库对白污染率降至 0.0%；`unit_scene_0213_01` 对白置空并退出垄断，`req_probe_04` Top3 100% 回归真实站台蒸汽送别镜头（`scene_0193` / `scene_0188` / `scene_0191`）；
    - 重跑真实端到端 A5/A6，更新 8 需求独立人工验收包（保持 `pending`，系统自评覆盖率更正为 87.5%）；
    - 全工程 **83/83 自动化测试全绿**（新增 2 项 A6.3 专项测试）；
    - 交付专题收口报告 [`docs/agent-poc/a6.3-evidence-closing-report.md`](docs/agent-poc/a6.3-evidence-closing-report.md)；
    - 当前状态正式设为 **`A6.3 awaiting_final_review`**，原地彻底停止，严禁进入 A7。
