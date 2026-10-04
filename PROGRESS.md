# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前阶段：**POC-AGENT A0**  
当前状态：`awaiting_review`（根据 A0 审查意见重构 Topic-First 架构与素材理解三层模型后，重新等待 Review）  
执行责任：🏛️ 全栈架构师 & 🚀 DevOps/SRE  

---

## 阶段门禁状态 (Two-Gate System)

| 门禁名称 | 阶段点 | 当前状态 | 准入/通过标准 |
|:---|:---:|:---:|:---|
| **A0 Review Gate** | A0 结束点 | 🚪 **当前卡点** (`awaiting_review`) | 架构方案、Topic-First 数据链路、三层素材模型与隔离回流机制审查通过；**未通过前严禁进入 A1** |
| **Retrieval Top3 实测 Gate** | A6 结束点 | 未到达 (待激活) | 真实影视素材（《潜伏》25分钟）镜头检索实测：**前 3 个候选中至少有 1 个可用镜头的脚本段落占比 ≥ 80%**；未达标严禁进入 A7/A8 大规模合成 |

---

## A0–A10 分阶段实施路线图 (总体完成度：10%)

| 阶段 | 权重 | 状态 | 交付物 / 验收入口 | 核心说明 |
|:---|---:|:---:|:---|:---|
| **A0. 架构设计与 Topic-First 接线方案** | 10% | `awaiting_review` | [`docs/agent-poc/agent-poc-architecture.md`](docs/agent-poc/agent-poc-architecture.md) | **A0 Review Gate 卡点**：恢复 Topic-First 闭环与三层素材模型；不开发业务功能 |
| **A1. 运营中枢后台交互与协议改造** | 8% | 待开始 | 运营Agent 交互窗口与异步 Job 订阅器 | 运营Agent 为唯一交互入口；剥离前端虚拟定时器 |
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

## 审查与状态流转历史 (Audit Log)

1. **2026-10-05 02:25**：A0 首次提交，标记为 `awaiting_review`。
2. **2026-10-05 02:27**：A0 Review 未通过，状态变更为 `changes_requested`。审查反馈要求：
   - 恢复正确的 Topic-first 架构（真人运营↔运营Agent→Persona/Topic/Core Viewpoint→Story Beats→Material Requirements→共享客观 Evidence Library 检索→Top候选→基于当前博主+选题的 Perspective Re-reading→Director 根据真实证据完成 Final Director Plan→最终 narration/original audio/IN-OUT→复用 VMV Stage4/5/6 Production→真实 MP4）；
   - 素材理解明确三层：①稳定客观 Evidence、②共享可持续增量 Generic Narrative Affordances、③每条内容动态生成 Blogger/Topic Perspective Reading，并设计向 ② 回流、绝不污染 ① 的机制；
   - 恢复 A0–A10 分阶段路线和两个 Gate（A0 Review Gate、Retrieval Top3 实测 Gate）；
   - 保留双博主同素材 A/B 验证；
   - 明确运营Agent 是唯一交互入口，Director/Retrieval 为纯后台能力，不搞全员 Agent 化。
3. **2026-10-05 02:32**：完成架构与看板全面修订，状态重新变更为 **`awaiting_review`**，停止操作等待审查。
