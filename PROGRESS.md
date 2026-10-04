# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前分支：`agent-poc/a1-contracts`  
当前阶段：**POC-AGENT A3: L2 通用叙事可能性索引骨架**  
当前状态：`in_progress`（A1 completed, A2 completed, A3 completed, 准备进入 A4）  
执行责任：🏛️ 全栈架构师 & 📐 API规范专家 & 🚀 DevOps/SRE  

---

## 阶段门禁状态 (Two-Gate System)

| 门禁名称 | 阶段点 | 当前状态 | 准入/通过标准 |
|:---|:---:|:---:|:---|
| **A0 Review Gate** | A0 结束点 | ✅ **已通过** (2026-10-05) | Topic-First 架构方案与三层素材模型审查通过 |
| **Retrieval Top3 实测 Gate** | A6 结束点 | 未到达 (待激活) | 真实影视素材（《潜伏》25分钟）检索实测：**前 3 个候选中至少有 1 个可用镜头的脚本段落占比 ≥ 80%**；未达标严禁进入 A7/A8 大规模合成 |

---

## A0–A10 分阶段实施路线图 (总体完成度：34%)

| 阶段 | 权重 | 状态 | 交付物 / 验收入口 | 核心说明 |
|:---|---:|:---:|:---|:---|
| **A0. 架构设计与 Topic-First 接线方案** | 10% | ✅ **已完成** | [`docs/agent-poc/agent-poc-architecture.md`](docs/agent-poc/agent-poc-architecture.md) | A0 Review Gate 已通过；确立 Topic-First 与三层素材模型 |
| **A1. 跨模块数据契约与 Job 状态机** | 8% | ✅ **已完成** | [`src/contracts/`](src/contracts/)<br>[`tests/contracts.test.mjs`](tests/contracts.test.mjs) | 9 个核心 Schema、通用校验器、Job 状态机、VMV Stage 4/5 适配器与测试 (13/13通过) |
| **A2. 稳定客观 Evidence 库 (L1) 摄取** | 8% | ✅ **已完成** | [`src/evidence/`](src/evidence/)<br>[`tests/evidence-store.test.mjs`](tests/evidence-store.test.mjs) | 摄取 VMV Stage 1 真实产物（130个镜头）；客观字段绝对防污染；测试 5/5 通过 |
| **A3. 共享 Generic Narrative Affordances (L2) 库** | 8% | ✅ **已完成** | [`src/affordances/`](src/affordances/)<br>[`tests/affordance-store.test.mjs`](tests/affordance-store.test.mjs) | 戏剧功能分类、可持续增量索引、一对多映射与受控 promotion 接口；测试 3/3 通过 |
| **A4. Topic-First 创意生成链路** | 10% | 待开始 | `src/operations/`<br>`tests/operations-orchestrator.test.mjs` | 真人运营 ↔ 运营Agent 对话构思；修订历史保留与诉求结构化 |
| **A5. 候选镜头召回检索管道** | 10% | 待开始 | Top-3 候选镜头召回服务 | 联合 L1+L2 召回候选片段（按指令今晚不进入） |
| **A6. 动态 Perspective Re-reading** | 12% | 待开始 | 博主视角透镜 (L3) 二次解读服务 | **Retrieval Top3 实测 Gate 卡点**（可用率 ≥ 80%） |
| **A7. Director 真实证据终编服务** | 10% | 待开始 | Final Director Plan 锁定生成器 | 依据真实证据敲定台词、原声、IN-OUT |
| **A8. VMV Stage 4/5 真实生产对接** | 10% | 待开始 | 本地生产 Runner 与真实 MP4 输出 | 阿里云 TTS 真实配音与 FFmpeg 剪辑压制 |
| **A9. 动态解释向通用 Affordance 受控回流** | 6% | 待开始 | 知识回流提纯流水线 | 验证有效模式回流至 L2，绝对隔离 L1 |
| **A10. 双博主同素材 A/B 验证验收** | 8% | 待开始 | 两支不同风格的真实 1080p MP4 与指标报告 | 终极验收：同一部剧同素材池、双博主截然不同视听成品 |

---

## POC-AGENT A1 任务完成清单 (✅ completed)

- [x] **创建独立分支**：基于 `e65a8f5b3e967ca995ab714c1020fc7c81d80d76` 创建并检出 `agent-poc/a1-contracts`
- [x] **定义 9 大核心 Schema** ([`src/contracts/schemas.mjs`](src/contracts/schemas.mjs))
- [x] **实现通用纯逻辑校验器** ([`src/contracts/validators.mjs`](src/contracts/validators.mjs))
- [x] **实现 Job 状态机流转引擎** ([`src/contracts/job-state-machine.mjs`](src/contracts/job-state-machine.mjs))
- [x] **实现 VMV Stage 4/5 生产单适配器** ([`src/contracts/vmv-adapter.mjs`](src/contracts/vmv-adapter.mjs))
- [x] **构建最小真实测试 Fixture** ([`src/fixtures/laozhou-qianfu-fixture.mjs`](src/fixtures/laozhou-qianfu-fixture.mjs))
- [x] **补齐自动化测试套件** ([`tests/contracts.test.mjs`](tests/contracts.test.mjs)): 13/13 通过

---

## POC-AGENT A2 任务完成清单 (✅ completed)

- [x] **L1 客观 Evidence Schema 规范** ([`src/evidence/objective-evidence.mjs`](src/evidence/objective-evidence.mjs))
- [x] **VMV Stage 1 产物适配器** ([`src/evidence/vmv-evidence-adapter.mjs`](src/evidence/vmv-evidence-adapter.mjs))
- [x] **客观 EvidenceStore 存储** ([`src/evidence/evidence-store.mjs`](src/evidence/evidence-store.mjs))
- [x] **自动化测试验证** ([`tests/evidence-store.test.mjs`](tests/evidence-store.test.mjs)): 5/5 通过

---

## POC-AGENT A3 任务完成清单 (✅ completed)

- [x] **L2 Generic Narrative Affordance 数据模型** ([`src/affordances/narrative-affordance.mjs`](src/affordances/narrative-affordance.mjs))：
  - 定义戏剧功能 (`dramatic_function`)、情绪张力 (`emotional_tension`)、原声留白 (`audio_silence`) 与节奏转折 (`pacing_shift`) 分类；
  - 规范置信度与严格溯源机制 (Provenance: `manual_seed`, `promoted_from_l3`, `heuristics`)；
  - 明确区分客观证据与叙事可能性。
- [x] **AffordanceStore 存储与多维索引** ([`src/affordances/affordance-store.mjs`](src/affordances/affordance-store.mjs))：
  - 原生支持**一个 Evidence 对应多个可持续增量 Affordance**；
  - 支持按 Evidence、按 Tag、按 Category 及按置信度阈值多维索引检索；
  - 严守只读与隔离防线，绝不触碰 L1。
- [x] **受控晋升接口骨架 (Selective Promotion)** ([`src/affordances/promotion-service.mjs`](src/affordances/promotion-service.mjs))：
  - 建立 L3 动态解释晋升门禁：必须经过审核 (`approved`) 且具有 L1 Evidence 真实锚定方可准入；
  - 去个性化抽象提纯，记录详细溯源；
  - 未过审或悬空解释直接拦截抛错，彻底杜绝 L1 污染。
- [x] **自动化测试验证** ([`tests/affordance-store.test.mjs`](tests/affordance-store.test.mjs)): 3/3 全部通过。

---

## 审查审计日志 (Audit Log)

1. **2026-10-05 02:35**：A0 方案经审查正式通过（通过 Gate 1: A0 Review Gate），授权开启 A1。
2. **2026-10-05 02:40**：完成 A1 契约规范与状态机，Commit `a2f91ef`，推送 GitHub。
3. **2026-10-05 02:43**：完成 A2 L1 客观 Evidence 接入与真实 VMV Stage 1 产物解析，Commit `dd5f0d9`，推送 GitHub。
4. **2026-10-05 02:45**：完成 A3 L2 通用叙事潜能模型、AffordanceStore 与受控晋升接口骨架，测试 3/3 通过，推送 GitHub。
