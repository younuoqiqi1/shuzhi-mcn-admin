# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前阶段：**POC-AGENT A0**  
当前状态：`awaiting_review`（根据 A0 审查意见已全面修订，重新等待审查）  
执行责任：🏛️ 全栈架构师 & 🚀 DevOps/SRE  

---

## 阶段门禁总览 (Two-Gate System)

- 🚪 **Gate 1: A0 Review Gate**（当前卡点：Topic-First 架构方案与三层素材理解机制审查）
- 🚪 **Gate 2: Retrieval Top3 实测 Gate**（A6 阶段：真实影视素材 Top-3 候选可用率 ≥ 80% 实测门禁）

---

## A0–A10 分阶段路线与完成度 (总体完成度：10%)

| 阶段 | 权重 | 状态 | 交付物 / 验收入口 | 关键说明 |
|:---|---:|:---|:---|:---|
| **A0. 架构设计与 Topic-First 接线** | 10% | `awaiting_review` | [`docs/agent-poc/agent-poc-architecture.md`](docs/agent-poc/agent-poc-architecture.md) | **Gate 1 卡点**：已根据审查反馈恢复 Topic-first 与三层素材理解，待确认 |
| **A1. 运营中枢后台交互与协议改造** | 8% | 待开始 | 运营Agent 入口界面与异步 Job 订阅器 | 剥离前端定时器；以运营Agent为唯一交互入口 |
| **A2. 客观 Evidence 库 (L1) 接入** | 8% | 待开始 | `evidence_store.py` / 物理时间码元数据库 | 接入 VMV Stage 1 产物，绝对客观中立防污染 |
| **A3. 共享 Narrative Affordances (L2)** | 8% | 待开始 | `affordance_registry.json` / 增量接口 | 戏剧功能分类与通用叙事潜能库 |
| **A4. Topic-First 创意生成链路** | 10% | 待开始 | Topic / Story Beats / 画面需求生成器 | 真人运营 ↔ 运营Agent 对话构思 |
| **A5. 候选镜头召回检索管道** | 10% | 待开始 | Top-3 镜头召回检索服务 | 联合 L1+L2 召回镜头候选集 |
| **A6. 动态 Perspective Re-reading** | 12% | 待开始 | 博主视角透镜 (L3) 二次解读服务 | **Gate 2 卡点**：实测候选可用率达标线 ≥ 80% |
| **A7. Director 真实证据终编服务** | 10% | 待开始 | Final Director Plan 锁定生成器 | 依据真实镜头证据敲定台词、原声、IN-OUT |
| **A8. VMV Stage 4/5 真实生产对接** | 10% | 待开始 | 本地生产 Runner 与真实 1080p MP4 | 阿里云 TTS 真实配音与 FFmpeg 精准压制 |
| **A9. 动态解释向通用 Affordance 回流** | 6% | 待开始 | 知识回流提纯流水线 | 验证有效模式回流至 L2，严格隔离 L1 |
| **A10. 双博主同素材 A/B 验证验收** | 8% | 待开始 | 两支不同人设的真实 MP4 样片与指标报告 | 终极交付物：同一部剧同素材池、双博主截然不同视听成品 |

---

## A0 检查表与审查历史

- [x] **首次提交被拒记录**：状态一度转为 `changes_requested`。审查意见指出：需恢复 Topic-First 架构；明确素材理解三层模型及回流隔离机制；恢复 A0–A10 路线与双 Gate；明确运营Agent 为唯一面向真人入口。
- [x] **架构全面修正**：
  - [x] 恢复 Topic-First 链条（真人运营↔运营Agent → Persona/Topic → Story Beats → Requirements → 检索 → Perspective Re-reading → Director Plan → 真实MP4）
  - [x] 明确素材理解三层：①稳定客观 Evidence、②共享可持续增量 Generic Narrative Affordances、③动态生成 Blogger/Topic Perspective Reading
  - [x] 确立动态解释向 ② 受控回流、绝不污染 ① 的防护隔离机制
  - [x] 明确运营Agent 为唯一交互入口，Director/Retrieval 为纯后台能力，禁止全员 Agent 化
  - [x] 规划 A0–A10 完整阶段与 Gate 1（A0 Review）、Gate 2（Retrieval Top3 实测）
  - [x] 保留 A10 终极目标：双博主同素材 A/B 实测
- [x] 更新 [`docs/agent-poc/agent-poc-architecture.md`](docs/agent-poc/agent-poc-architecture.md)
- [x] 更新 `PROGRESS.md` 并重新将状态设为 `awaiting_review`
- [ ] 等待真人用户最终确认通过 Gate 1 (A0 Review Gate)
