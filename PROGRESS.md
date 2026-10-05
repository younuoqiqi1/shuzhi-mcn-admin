# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前分支：`agent-poc/a1-contracts`  
当前阶段：**POC-AGENT A4.5: 《潜伏》第18集真实 L1 Evidence 补齐与覆盖率核验**  
当前状态：`A4.5 awaiting_review` (A1 approved, A2 approved, A3 approved, A4 approved, A4.5 awaiting_review; 已停止，等待 Review)  
执行责任：🏛️ 全栈架构师 & 🔍 测试与质量专家 & 📐 API规范专家  

---

## 阶段门禁状态 (Two-Gate System)

| 门禁名称 | 阶段点 | 当前状态 | 准入/通过标准 |
|:---|:---:|:---:|:---|
| **A0 Review Gate** | A0 结束点 | ✅ **已通过** (2026-10-05) | Topic-First 架构方案与三层素材模型审查通过 |
| **Retrieval Top3 实测 Gate** | A6 结束点 | 未到达 (严格守界未激活) | 真实影视素材（《潜伏》25分钟）检索实测：**前 3 个候选中至少有 1 个可用镜头的脚本段落占比 ≥ 80%**；未达标严禁进入 A7/A8 大规模合成 |

---

## A0–A10 分阶段实施路线图 (总体完成度：50%)

| 阶段 | 权重 | 状态 | 交付物 / 验收入口 | 核心说明 |
|:---|---:|:---:|:---|:---|
| **A0. 架构设计与 Topic-First 接线方案** | 10% | ✅ **completed** | [`docs/agent-poc/agent-poc-architecture.md`](docs/agent-poc/agent-poc-architecture.md) | A0 Review Gate 已通过；确立 Topic-First 与三层素材模型 |
| **A1. 跨模块数据契约与 Job 状态机** | 8% | ✅ **completed** | [`src/contracts/`](src/contracts/)<br>[`tests/contracts.test.mjs`](tests/contracts.test.mjs) | A1 Review Approved。9 个核心 Schema、通用校验器、Job 状态机、VMV Stage 4/5 适配器与测试 (14/14通过) |
| **A2. 稳定客观 Evidence 库 (L1) 摄取** | 8% | ✅ **completed** | [`src/evidence/`](src/evidence/)<br>[`tests/evidence-store.test.mjs`](tests/evidence-store.test.mjs) | A2 Review Approved。摄取 VMV Stage 1 真实产物（130个镜头）；客观字段绝对防污染；测试 5/5 通过 |
| **A3. 共享 Generic Narrative Affordances (L2) 库** | 8% | ✅ **completed** | [`src/affordances/`](src/affordances/)<br>[`tests/affordance-store.test.mjs`](tests/affordance-store.test.mjs) | A3 Review Approved。戏剧功能分类、增量索引、一对多映射与受控 promotion 接口；测试 3/3 通过 |
| **A4. Topic-First 创意生成链路** | 10% | ✅ **completed** | [`src/operations/`](src/operations/)<br>[`tests/operations-orchestrator.test.mjs`](tests/operations-orchestrator.test.mjs) | A4.1 Review Approved。彻底移除旧脚本前置状态，确立 ideating → awaiting_direction_review → retrieving；MaterialRequirement 确立 desired_* 诉求语义与防伪装隔离；测试 4/4 通过 |
| **A4.5. 真实 L1 Evidence 补齐与覆盖率深度核验** | 6% | 🚪 **awaiting_review** | [`docs/agent-poc/a4.5-evidence-enrichment-report.md`](docs/agent-poc/a4.5-evidence-enrichment-report.md)<br>[`tests/evidence-enrichment.test.mjs`](tests/evidence-enrichment.test.mjs) | 查清 130 vs 325 及 2702s 全片覆盖根因（VMV 1800s 截断）；Apple Vision OCR 提取 857 条真实台词；复用 caption-packet/importer；补齐 130/326 真实客观证据并严防主观污染；测试 5/5 通过 |
| **A5. 候选镜头召回检索管道** | 10% | 待开始 | Top-3 候选镜头召回服务 | **严禁提前进入**；等待 A4.5 审查通过与 Gate 2 前置条件就绪 |
| **A6. 动态 Perspective Re-reading** | 12% | 待开始 | 博主视角透镜 (L3) 二次解读服务 | **Retrieval Top3 实测 Gate 卡点**（可用率 ≥ 80%） |
| **A7. Director 真实证据终编服务** | 10% | 待开始 | Final Director Plan 锁定生成器 | 依据真实证据敲定台词、原声、IN-OUT |
| **A8. VMV Stage 4/5 真实生产对接** | 10% | 待开始 | 本地生产 Runner 与真实 MP4 输出 | 阿里云 TTS 真实配音与 FFmpeg 剪辑压制 |
| **A9. 动态解释向通用 Affordance 受控回流** | 4% | 待开始 | 知识回流提纯流水线 | 验证有效模式回流至 L2，绝对隔离 L1 |
| **A10. 双博主同素材 A/B 验证验收** | 4% | 待开始 | 两支不同风格的真实 1080p MP4 与指标报告 | 终极验收：同一部剧同素材池、双博主截然不同视听成品 |

---

## 阶段产物与执行清单 (A1→A4.5)

- [x] **A1 (Approved)**：正式数据契约、通用校验器、Job 状态机、VMV Stage 4/5 适配器与测试固件，测试 14/14 通过。
- [x] **A2 (Approved)**：L1 客观 Evidence Schema 规范、VMV Stage 1 真实产物摄取（130 个场景）、防污染只读 EvidenceStore，测试 5/5 通过。
- [x] **A3 (Approved)**：L2 Generic Narrative Affordance 数据模型、一对多增量 AffordanceStore、受控晋升 (Selective Promotion) 接口骨架，测试 3/3 通过。
- [x] **A4 (Approved)**：Topic-First 运营任务编排服务 ([`src/operations/operations-orchestrator.mjs`](src/operations/operations-orchestrator.mjs))：
  - 彻底移除 `drafting`/`scripting`/`awaiting_script_review` 旧状态，改为 Topic-first 状态机：`ideating` $\rightarrow$ `awaiting_direction_review` $\rightarrow$ `retrieving`；
  - `MaterialRequirement` 全面重构为 `desired_*` 诉求语义；
  - 增加防伪装测试与多轮真人交互修订历史；
  - 测试套件 ([`tests/operations-orchestrator.test.mjs`](tests/operations-orchestrator.test.mjs)) 4/4 全部通过。
- [x] **A4.5 (Awaiting Review)**：真实 L1 Objective Evidence 补齐与全片覆盖核实：
  - **130 vs 325 场景与 2702 秒覆盖率真相核实**：定位 VMV `max_duration_sec: 1800.0` 截断根因，确认 130 场景为粗粒度检测，326 场景（325 切点）为自适应检测，补齐 1800s～2702s 尾部 106 个场景分析，形成 [`src/evidence/data/coverage_analysis.json`](src/evidence/data/coverage_analysis.json)；
  - **真实硬字幕 OCR 提取**：针对压制硬字幕现状，利用 Apple Vision 提取真实原片 `qianfu_ep18.mp4` 得到 857 条高精度中文台词库 ([`src/evidence/data/qianfu_ep18_subtitles.json`](src/evidence/data/qianfu_ep18_subtitles.json))；
  - **Caption-Packet 与 Caption-Importer 架构复用**：实现 [`src/evidence/caption-packet.mjs`](src/evidence/caption-packet.mjs) 和 [`src/evidence/caption-importer.mjs`](src/evidence/caption-importer.mjs)，支持时间码窗口对齐与多源组装；
  - **交付丰富真实 L1 Evidence 资产**：
    - [`src/evidence/data/enriched_evidence_qianfu_ep18.json`](src/evidence/data/enriched_evidence_qianfu_ep18.json)：130 场景，108 对白场景，130 动作/视觉，全部通过 `validateObjectiveEvidence`；
    - [`src/evidence/data/enriched_evidence_recheck_326.json`](src/evidence/data/enriched_evidence_recheck_326.json)：326 细切点场景丰富数据集，全部通过验证；
  - **绝对防污染测试通过**：0 个上层 Persona、Viewpoint 或主观解释渗入 L1；
  - **交付专题报告**：[`docs/agent-poc/a4.5-evidence-enrichment-report.md`](docs/agent-poc/a4.5-evidence-enrichment-report.md)；
  - **测试套件 ([`tests/evidence-enrichment.test.mjs`](tests/evidence-enrichment.test.mjs))**：5/5 全部通过；全局测试 49/49 全部通过。
- [x] **技术债登记**：
  - **VMV Stage 4/5 适配器消费者集成测试待补**：当前 [`src/contracts/vmv-adapter.mjs`](src/contracts/vmv-adapter.mjs) 仅完成 Schema-level 数据映射与静态校验，尚未经过底层真实 VMV 消费链路（`python -m vmv render`、TTS 与 FFmpeg）的 Consumer Integration Test。在 A7/A8 前必须验证，严禁再写“100%兼容”。
- [x] **严格守界**：**严禁进入 A5 Retrieval，原地停止等待 Review**。

---

## 审查审计日志 (Audit Log)

1. **2026-10-05 02:35**：A0 方案经审查正式通过（通过 Gate 1: A0 Review Gate），授权开启 A1。
2. **2026-10-05 02:40**：完成 A1 契约规范与状态机，Commit `a2f91ef`，推送 GitHub。
3. **2026-10-05 02:43**：完成 A2 L1 客观 Evidence 接入与真实 VMV Stage 1 产物解析，Commit `dd5f0d9`，推送 GitHub。
4. **2026-10-05 02:45**：完成 A3 L2 通用叙事潜能模型、AffordanceStore 与受控晋升接口骨架，Commit `64f915a`，推送 GitHub。
5. **2026-10-05 02:47**：提交 A4 初版，提出 review 申请。
6. **2026-10-05 08:55**：A1-A4 审查反馈：**A1/A2/A3 approved；A4 changes_requested**。要求：彻底移除“先脚本后检索”旧状态语义，将状态改为 Topic-first 方向审核；MaterialRequirement 改为 desired/evidence_need 语义并增加防伪装测试；补充 VMV adapter 尚未经过真实 consumer integration test 的技术债记录。
7. **2026-10-05 09:02**：完成 A4 所有要求修订，44/44 测试全绿，当前状态重新设为 **`awaiting_review`**。
8. **2026-10-05 09:20**：A4.1 Review 审查通过，授权开启 A4.5 Evidence Enrichment，要求彻底解决 130 vs 325 与全片 2702 秒覆盖率分歧，补齐真实素材台词人物动作，绝不进入 A5。
9. **2026-10-05 09:50**：完成 A4.5 真实客观素材补齐与覆盖率深度核验，交付报告 [`docs/agent-poc/a4.5-evidence-enrichment-report.md`](docs/agent-poc/a4.5-evidence-enrichment-report.md)，测试 49/49 全绿，状态设为 **`A4.5 awaiting_review`**，停止操作等待 Review。
