# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前分支：`agent-poc/a1-contracts`  
当前阶段：**POC-AGENT A4: Topic-First 运营任务骨架**  
当前状态：`awaiting_review` (A1 completed, A2 completed, A3 completed, A4 awaiting_review; 已停止，等待 Review)  
执行责任：🏛️ 全栈架构师 & 📐 API规范专家 & 🚀 DevOps/SRE  

---

## 阶段门禁状态 (Two-Gate System)

| 门禁名称 | 阶段点 | 当前状态 | 准入/通过标准 |
|:---|:---:|:---:|:---|
| **A0 Review Gate** | A0 结束点 | ✅ **已通过** (2026-10-05) | Topic-First 架构方案与三层素材模型审查通过 |
| **Retrieval Top3 实测 Gate** | A6 结束点 | 未到达 (严格守界未激活) | 真实影视素材（《潜伏》25分钟）检索实测：**前 3 个候选中至少有 1 个可用镜头的脚本段落占比 ≥ 80%**；未达标严禁进入 A7/A8 大规模合成 |

---

## A0–A10 分阶段实施路线图 (总体完成度：44%)

| 阶段 | 权重 | 状态 | 交付物 / 验收入口 | 核心说明 |
|:---|---:|:---:|:---|:---|
| **A0. 架构设计与 Topic-First 接线方案** | 10% | ✅ **completed** | [`docs/agent-poc/agent-poc-architecture.md`](docs/agent-poc/agent-poc-architecture.md) | A0 Review Gate 已通过；确立 Topic-First 与三层素材模型 |
| **A1. 跨模块数据契约与 Job 状态机** | 8% | ✅ **completed** | [`src/contracts/`](src/contracts/)<br>[`tests/contracts.test.mjs`](tests/contracts.test.mjs) | 9 个核心 Schema、通用校验器、Job 状态机、VMV Stage 4/5 适配器与测试 (13/13通过) |
| **A2. 稳定客观 Evidence 库 (L1) 摄取** | 8% | ✅ **completed** | [`src/evidence/`](src/evidence/)<br>[`tests/evidence-store.test.mjs`](tests/evidence-store.test.mjs) | 摄取 VMV Stage 1 真实产物（130个镜头）；客观字段绝对防污染；测试 5/5 通过 |
| **A3. 共享 Generic Narrative Affordances (L2) 库** | 8% | ✅ **completed** | [`src/affordances/`](src/affordances/)<br>[`tests/affordance-store.test.mjs`](tests/affordance-store.test.mjs) | 戏剧功能分类、增量索引、一对多映射与受控 promotion 接口；测试 3/3 通过 |
| **A4. Topic-First 创意生成链路** | 10% | 🚪 **awaiting_review** | [`src/operations/`](src/operations/)<br>[`tests/operations-orchestrator.test.mjs`](tests/operations-orchestrator.test.mjs) | 运营Agent 为唯一交互入口；支持多轮修改并保留完整修订历史；测试 4/4 通过 |
| **A5. 候选镜头召回检索管道** | 10% | 待开始 | Top-3 候选镜头召回服务 | **严禁提前进入**；等待 A4 审查通过与 Gate 2 前置条件就绪 |
| **A6. 动态 Perspective Re-reading** | 12% | 待开始 | 博主视角透镜 (L3) 二次解读服务 | **Retrieval Top3 实测 Gate 卡点**（可用率 ≥ 80%） |
| **A7. Director 真实证据终编服务** | 10% | 待开始 | Final Director Plan 锁定生成器 | 依据真实证据敲定台词、原声、IN-OUT |
| **A8. VMV Stage 4/5 真实生产对接** | 10% | 待开始 | 本地生产 Runner 与真实 MP4 输出 | 阿里云 TTS 真实配音与 FFmpeg 剪辑压制 |
| **A9. 动态解释向通用 Affordance 受控回流** | 6% | 待开始 | 知识回流提纯流水线 | 验证有效模式回流至 L2，绝对隔离 L1 |
| **A10. 双博主同素材 A/B 验证验收** | 8% | 待开始 | 两支不同风格的真实 1080p MP4 与指标报告 | 终极验收：同一部剧同素材池、双博主截然不同视听成品 |

---

## 阶段产物与执行清单 (A1→A4)

- [x] **A1 (Commit `a2f91ef`)**：正式数据契约、通用校验器、Job 状态机、VMV Stage 4/5 适配器与测试固件，测试 13/13 通过。
- [x] **A2 (Commit `dd5f0d9`)**：L1 客观 Evidence Schema 规范、VMV Stage 1 真实产物摄取（130 个场景）、防污染只读 EvidenceStore，测试 5/5 通过。
- [x] **A3 (Commit `64f915a`)**：L2 Generic Narrative Affordance 数据模型、一对多增量 AffordanceStore、受控晋升 (Selective Promotion) 接口骨架，测试 3/3 通过。
- [x] **A4 (本阶段提交)**：Topic-First 运营任务编排服务 ([`src/operations/operations-orchestrator.mjs`](src/operations/operations-orchestrator.mjs))：
  - 运营Agent 为唯一面向真人入口；
  - 结构化推导 Persona + Intent $\rightarrow$ Topic $\rightarrow$ Core Viewpoint $\rightarrow$ Story Beats $\rightarrow$ Material Requirements；
  - 多轮真人交互修订机制：原地保留完整 `revisions` 历史，绝不新建无关任务；
  - 守界铁律：Beats 阶段严禁在无证据前写死物理时间码或镜头 ID；
  - 测试套件 ([`tests/operations-orchestrator.test.mjs`](tests/operations-orchestrator.test.mjs)) 4/4 全部通过。
- [x] **总结交付物**：生成夜间阶段总结报告 [`docs/agent-poc/overnight-a1-a4-report.md`](docs/agent-poc/overnight-a1-a4-report.md)。
- [x] **测试总量与回归**：43/43 全部通过，零回归问题。
- [x] **严格守界**：**严禁进入 A5/A6 Retrieval，原地停止等待 Review**。

---

## 审查审计日志 (Audit Log)

1. **2026-10-05 02:35**：A0 方案经审查正式通过（通过 Gate 1: A0 Review Gate），授权开启 A1。
2. **2026-10-05 02:40**：完成 A1 契约规范与状态机，Commit `a2f91ef`，推送 GitHub。
3. **2026-10-05 02:43**：完成 A2 L1 客观 Evidence 接入与真实 VMV Stage 1 产物解析，Commit `dd5f0d9`，推送 GitHub。
4. **2026-10-05 02:45**：完成 A3 L2 通用叙事潜能模型、AffordanceStore 与受控晋升接口骨架，Commit `64f915a`，推送 GitHub。
5. **2026-10-05 02:47**：完成 A4 Topic-First 运营任务骨架与多轮修订历史，全套 43/43 测试全绿，输出总结报告，当前状态正式标记为 **`awaiting_review`**，停止操作等待审查。
