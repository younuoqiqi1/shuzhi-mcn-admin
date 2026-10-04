# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前分支：`agent-poc/a1-contracts`  
当前阶段：**POC-AGENT A1: 跨模块数据契约与状态机**  
当前状态：`awaiting_review`（A1 契约、校验器、状态机、VMV 适配器与测试已就绪，等待 Review）  
执行责任：🏛️ 全栈架构师 & 📐 API规范专家 & 🚀 DevOps/SRE  

---

## 阶段门禁状态 (Two-Gate System)

| 门禁名称 | 阶段点 | 当前状态 | 准入/通过标准 |
|:---|:---:|:---:|:---|
| **A0 Review Gate** | A0 结束点 | ✅ **已通过** (2026-10-05) | Topic-First 架构方案与三层素材模型审查通过 |
| **Retrieval Top3 实测 Gate** | A6 结束点 | 未到达 (待激活) | 真实影视素材（《潜伏》25分钟）检索实测：**前 3 个候选中至少有 1 个可用镜头的脚本段落占比 ≥ 80%**；未达标严禁进入 A7/A8 大规模合成 |

---

## A0–A10 分阶段实施路线图 (总体完成度：18%)

| 阶段 | 权重 | 状态 | 交付物 / 验收入口 | 核心说明 |
|:---|---:|:---:|:---|:---|
| **A0. 架构设计与 Topic-First 接线方案** | 10% | ✅ **已完成** | [`docs/agent-poc/agent-poc-architecture.md`](docs/agent-poc/agent-poc-architecture.md) | A0 Review Gate 已通过；确立 Topic-First 与三层素材模型 |
| **A1. 跨模块数据契约与 Job 状态机** | 8% | `awaiting_review` | [`src/contracts/`](src/contracts/)<br>[`tests/contracts.test.mjs`](tests/contracts.test.mjs) | **当前交付**：9 个核心 Schema、通用校验器、Job 状态机、VMV Stage 4/5 适配器与老周潜伏 fixture |
| **A2. 稳定客观 Evidence 库 (L1) 摄取** | 8% | 待开始 | `evidence_store.py` / L1 数据校验套件 | 对接 VMV Stage 1 产物，绝对物理只读防污染 |
| **A3. 共享 Generic Narrative Affordances (L2) 库** | 8% | 待开始 | `affordance_registry.json` / 增量接口 | 戏剧功能分类与跨博主共享通用叙事潜能 |
| **A4. Topic-First 创意生成链路** | 10% | 待开始 | Topic / Story Beats / 画面诉求生成器 | 真人运营 ↔ 运营Agent 对话构思 |
| **A5. 候选镜头召回检索管道** | 10% | 待开始 | Top-3 候选镜头召回服务 | 联合 L1+L2 召回候选片段 |
| **A6. 动态 Perspective Re-reading** | 12% | 待开始 | 博主视角透镜 (L3) 二次解读服务 | **Retrieval Top3 实测 Gate 卡点**（可用率 ≥ 80%） |
| **A7. Director 真实证据终编服务** | 10% | 待开始 | Final Director Plan 锁定生成器 | 依据真实证据敲定台词、原声、IN-OUT |
| **A8. VMV Stage 4/5 真实生产对接** | 10% | 待开始 | 本地生产 Runner 与真实 MP4 输出 | 阿里云 TTS 真实配音与 FFmpeg 剪辑压制 |
| **A9. 动态解释向通用 Affordance 受控回流** | 6% | 待开始 | 知识回流提纯流水线 | 验证有效模式回流至 L2，绝对隔离 L1 |
| **A10. 双博主同素材 A/B 验证验收** | 8% | 待开始 | 两支不同风格的真实 1080p MP4 与指标报告 | 终极验收：同一部剧同素材池、双博主截然不同视听成品 |

---

## POC-AGENT A1 任务完成清单

- [x] **创建独立分支**：基于 `e65a8f5b3e967ca995ab714c1020fc7c81d80d76` 创建并检出 `agent-poc/a1-contracts`
- [x] **定义 9 大核心 Schema** ([`src/contracts/schemas.mjs`](src/contracts/schemas.mjs))：
  - `Persona`（博主人设）
  - `Topic`（选题）
  - `CoreViewpoint`（核心立意）
  - `StoryBeat`（叙事节拍）
  - `MaterialRequirement`（画面/情节/情绪素材诉求）
  - `Candidate`（检索召回候选镜头，含 L1 客观事实与 L2 通用叙事潜能）
  - `PerspectiveReading`（基于当前博主+选题的动态视角解读）
  - `DirectorPlan`（基于真实证据的导演终稿方案，包含解说台词、原声留白与 IN-OUT）
  - `ProductionJob`（端到端作业状态与生命周期记录）
- [x] **实现通用纯逻辑校验器** ([`src/contracts/validators.mjs`](src/contracts/validators.mjs))：
  - 支持字段级必填校验、类型检查、枚举匹配与数值区间限制；
  - 精确时间码解析与出入点合法性校验（`out_timecode > in_timecode`，时长一致性匹配）；
  - **严禁硬编码**：校验器不包含任何角色、剧名或时间码系统事实。
- [x] **实现 Job 状态机流转引擎** ([`src/contracts/job-state-machine.mjs`](src/contracts/job-state-machine.mjs))：
  - 支持 `drafting` $\rightarrow$ `scripting` $\rightarrow$ `awaiting_script_review` $\rightarrow$ `retrieving` $\rightarrow$ `perspective_reading` $\rightarrow$ `directing` $\rightarrow$ `awaiting_director_review` $\rightarrow$ `vmv_producing` $\rightarrow$ `completed` 完整生命周期；
  - 支持审核打回循环与失败/取消终态管理；
  - 严格拦截非法跃迁（如 `drafting` 直接到 `vmv_producing`）并抛出明确语义错误；
  - 自动记录完整历史流转记录与阶段进度跟踪。
- [x] **实现 VMV Stage 4/5 生产单适配器** ([`src/contracts/vmv-adapter.mjs`](src/contracts/vmv-adapter.mjs))：
  - `mapDirectorPlanToVMVProductionOrder(directorPlan)` 确保终编计划无缝转换为现行 VMV Stage 4/5 `production-order.json` 标准格式；
  - 自动处理画幅分辨率映射（16:9 $\rightarrow$ 1920x1080，9:16 $\rightarrow$ 1080x1920）、原声保留度及字幕配置；
  - 杜绝重复自造不兼容协议。
- [x] **构建最小真实测试 Fixture** ([`src/fixtures/laozhou-qianfu-fixture.mjs`](src/fixtures/laozhou-qianfu-fixture.mjs))：
  - 以“老周追剧 + 潜伏”构建一条完整的端到端任务真实数据固件；
  - 所有人物、情节、台词、时间码只作为测试固件，完全不渗透至系统基础代码。
- [x] **补齐自动化测试套件** ([`tests/contracts.test.mjs`](tests/contracts.test.mjs))：
  - 13/13 单元测试全部通过（覆盖校验器正反向用例、状态机完整与异常跃迁、VMV 适配器转换）；
  - 原有测试套件 `tests/demo-feedback.test.mjs` 18/18 持续通过（总计 31/31 测试通过）。
- [x] **严格守界**：未开发完整 Agent、未调用大模型、未引入 Retrieval 真实搜索、未生成视频、未修改前端 UI。

---

## 审查审计日志 (Audit Log)

1. **2026-10-05 02:35**：A0 方案经审查正式通过（通过 Gate 1: A0 Review Gate），授权开启 A1。
2. **2026-10-05 02:40**：在 `agent-poc/a1-contracts` 分支上完成 A1 契约规范、校验逻辑、状态机引擎、VMV 适配器、测试固件与测试套件实现，全套自动化测试通过，状态更新为 **`awaiting_review`**，原地停止等待审查，未进入 A2。
