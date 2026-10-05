# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前分支：`agent-poc/a1-contracts`  
当前阶段：**POC-AGENT A7.1: Director Plan 成片可执行性与时长预算收口**  
当前状态：`A7.1 awaiting_final_review` (A7 changes_requested 已全量收口：INSUFFICIENT_EVIDENCE 默认严禁创建生产分段，Topic A 缩编为 3 段且立意自然合并；落地 Narration Duration Budget 集中估算体系，双选题全分段 100% duration_fit = true；99/99 测试全绿；已彻底停机，严禁进入 A8)  
执行责任：🏛️ 全栈架构师 & 🧪 测试与质量专家 & ⚡ 算法与性能专家 & 🎬 影视编导专家  

---

## 阶段门禁状态 (Two-Gate System)

| 门禁名称 | 阶段点 | 当前状态 | 准入/通过标准 |
|:---|:---:|:---:|:---|
| **A0 Review Gate** | A0 结束点 | ✅ **已通过** (2026-10-05) | Topic-First 架构方案与三层素材模型审查通过 |
| **Retrieval Top3 实测 Gate** | A6 结束点 | ✅ **已通过** (2026-10-05) | 真实影视素材（《潜伏》第18集全片约45:02，共 2702.013 秒）检索与视角重读：有效覆盖率 7/8 = 87.5% >= 80%；`req_wu_03` 查实为全集无机要室且李涯零出镜，判定为 `INSUFFICIENT_EVIDENCE` 属真实正确结果，门禁正式批准通过。 |
| **Director Final Review Gate** | A7 结束点 | ⏳ **等待终审 (awaiting_final_review)** (2026-10-05) | Final Director Plan 必须 100% 消费 A6 Top3 真实候选；INSUFFICIENT_EVIDENCE 需求默认严禁产生虚假生产分段 (merge/drop)；旁白时长预算系统证明全量说得完 (100% duration_fit = true)；原声完整性防截断；VMV Consumer Contract 验证通过并声明 A8 Blocker。 |

---

## A0–A10 分阶段实施路线图 (总体完成度：90%)

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
| **A6. 动态 Perspective Re-reading** | 12% | ✅ **completed** | [`src/perspective/`](src/perspective/)<br>[`docs/agent-poc/a6-human-gate-review.md`](docs/agent-poc/a6-human-gate-review.md)<br>[`docs/agent-poc/a6.3-evidence-closing-report.md`](docs/agent-poc/a6.3-evidence-closing-report.md)<br>[`tests/perspective-rereading.test.mjs`](tests/perspective-rereading.test.mjs) | A6 Final Review Approved。完成 A6.3 Evidence 对齐收口、演职员/歌词 OCR 彻底清洗、`req_wu_03` 查实为全集无机要室且李涯零出镜判定为 `INSUFFICIENT_EVIDENCE`；Top3 Gate 87.5% 正式批准通过 |
| **A7. Director 真实证据终编服务** | 10% | 🚪 **awaiting_review** | [`src/director/`](src/director/)<br>[`docs/agent-poc/a7-director-report.md`](docs/agent-poc/a7-director-report.md)<br>[`docs/agent-poc/a7-director-preview-topic-b.md`](docs/agent-poc/a7-director-preview-topic-b.md)<br>[`tests/director-final.test.mjs`](tests/director-final.test.mjs) | 消费真实 A6 Top3；原声与旁白职责先行；严禁未支撑伪断言；处理 `req_wu_03` 显式决议；输出双真实选题 Plan、VMV 生产单与 Markdown 视听预览；测试 95/95 全绿 |
| **A8. VMV Stage 4/5 真实生产对接** | 8% | 待开始 | 本地生产 Runner 与真实 MP4 输出 | **严禁提前进入**；等待真人完成 A7 终审；阿里云 TTS 真实配音与 FFmpeg 剪辑压制 |
| **A9. 动态解释向通用 Affordance 受控回流** | 4% | 待开始 | 知识回流提纯流水线 | 验证有效模式回流至 L2，绝对隔离 L1 |
| **A10. 双博主同素材 A/B 验证验收** | 4% | 待开始 | 两支不同风格的真实 1080p MP4 与指标报告 | 终极验收：同一部剧同素材池、双博主截然不同视听成品 |

---

## 阶段产物与执行清单 (A1→A7)

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
- [x] **A7.1 (Awaiting Final Review)**：Director Plan 成片可执行性与时长预算收口：
  - **INSUFFICIENT_EVIDENCE 需求生产拦截与自然合并**：
    - `req_wu_03` 决议为 `merge`，将“站长不看卷宗看利益与人心”的心战立意自然合并入终章 `seg_wu_04`；
    - 严格落实**不产生虚假生产分段**（`production_segment_created: false`），成片绝不向观众违和解释“没有这个镜头”；Topic A 精简为 3 个真实生产分段；
  - **Narration Duration Budget 旁白时长预算系统交付**：
    - [`src/director/duration-budget-config.mjs`](src/director/duration-budget-config.mjs)：集中配置 4.0 字/秒常态解说估算语速、0.5s 安全余量与 2.0s duck 引导时长，杜绝散落 magic number；
    - 证明进入 A8 前每段旁白 100% 说得完，严禁单纯调高语速硬塞；
    - 原声对白完整性保护（不得截断半句话）；
    - 导出独立时长预算审计表：[`docs/agent-poc/a7.1-duration-budget-topic-b.md`](docs/agent-poc/a7.1-duration-budget-topic-b.md) 与 [`docs/agent-poc/a7.1-duration-budget-topic-a.md`](docs/agent-poc/a7.1-duration-budget-topic-a.md)，双选题全分段 **100% duration_fit = true**；
  - **更新 Final Director Plan 与 VMV 生产单**：
    - 选题 B（优先成片）[`src/director/results/director_plan_topic_b.json`](src/director/results/director_plan_topic_b.json) 及生产单 [`src/director/results/vmv_order_topic_b.json`](src/director/results/vmv_order_topic_b.json)；
    - 选题 A [`src/director/results/director_plan_topic_a.json`](src/director/results/director_plan_topic_a.json) 及生产单 [`src/director/results/vmv_order_topic_a.json`](src/director/results/vmv_order_topic_a.json)；
  - **自动化测试套件全量更新与通过**：
    - 全工程测试扩展至 **99/99 passed**（新增 4 项 A7.1 时长预算与假分段拦截专项测试）；
  - **交付技术报告**：[`docs/agent-poc/a7-director-report.md`](docs/agent-poc/a7-director-report.md)。
- [x] **技术债与集成状态说明**：
  - **VMV 消费端真实跨语言执行标为 A8 Blocker**：当前适配器已通过真实 VMV Consumer Contract Schema 校验，但由于 `video-moment-validation` 仓库尚未部署 Stage 4/5 真实的 Python CLI (`python -m vmv render`) 与 ffmpeg / TTS 执行环境，真实的跨进程端到端集成测试标为 **A8 Blocker**，严禁虚假宣称“100%兼容”。
- [x] **严格守界**：**严禁进入 A8，严禁开始视频合成、真实 TTS 与 MP4 导出，原地彻底停止等待真人审核**。

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
21. **2026-10-05 12:45**：完成 POC-AGENT A6.3 全部收口修复：查实第18集无机要室且李涯零出镜，`req_wu_03` 正确返回 `INSUFFICIENT_EVIDENCE`；演职员表与歌词彻底清洗（污染率 0%）；测试 83/83 全绿；Commit `28accfb`。
22. **2026-10-05 12:50**：A6 Final Review 审查正式批准通过（**APPROVED**），授权进入 POC-AGENT A7: Director Final 阶段。
23. **2026-10-05 13:05**：完成 POC-AGENT A7 初版交付，Commit `6a2ef5f`。
24. **2026-10-05 13:10**：A7 Review 审查反馈：**`changes_requested`**。指出 `req_wu_03` 不应创建虚假生产分段且成片不应对观众解释缺失，以及必须建立 Narration Duration Budget 证明每段说得完。
25. **2026-10-05 13:20**：完成 POC-AGENT A7.1 全部收口修复：
    - `req_wu_03` 落实 merge 决议，不产生虚假生产分段，Topic A 精简为 3 段且立意自然合并；
    - 落地 Narration Duration Budget 集中配置与估算体系，双选题全分段 **100% duration_fit = true**；
    - 全工程 **99/99 自动化测试全绿**（新增 4 项 A7.1 专项测试）；
    - 导出独立时长预算审计表与更新真人视听预览；
    - 当前状态正式设为 **`A7.1 awaiting_final_review`**，原地彻底停止，严禁进入 A8。
