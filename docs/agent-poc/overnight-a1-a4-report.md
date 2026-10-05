# POC-AGENT: A1→A4 基础阶段夜间连续执行总结报告

**生成时间**: 2026-10-05 02:47 (Asia/Shanghai)  
**当前分支**: `agent-poc/a1-contracts`  
**总体执行状态**:
- **A1**: `completed`
- **A2**: `completed`
- **A3**: `completed`
- **A4**: `awaiting_review` (门禁卡点，原地停止，严禁进入 A5)

---

## 一、 各阶段 Commit SHA、交付物与测试结果汇总

| 阶段 | 核心任务 | 状态 / Commit | 测试数量与耗时 | 核心交付物 |
| :--- | :--- | :--- | :--- | :--- |
| **A1** | 正式数据契约 + Job 状态机 + VMV 适配器 | `approved` (`a2f91ef`) | 14/14 passed (~88ms) | [`src/contracts/`](../../src/contracts/)<br>[`tests/contracts.test.mjs`](../../tests/contracts.test.mjs) |
| **A2** | L1 客观 Evidence 接入与真实 VMV Stage 1 摄取 | `approved` (`dd5f0d9`) | 5/5 passed (~72ms) | [`src/evidence/`](../../src/evidence/)<br>[`tests/evidence-store.test.mjs`](../../tests/evidence-store.test.mjs) |
| **A3** | L2 通用叙事潜能索引骨架与受控晋升 | `approved` (`64f915a`) | 3/3 passed (~73ms) | [`src/affordances/`](../../src/affordances/)<br>[`tests/affordance-store.test.mjs`](../../tests/affordance-store.test.mjs) |
| **A4** | Topic-First 运营任务骨架与多轮修订历史 | `awaiting_review` (已依审查意见修订) | 4/4 passed (~75ms) | [`src/operations/`](../../src/operations/)<br>[`tests/operations-orchestrator.test.mjs`](../../tests/operations-orchestrator.test.mjs) |
| **回归** | 现有后台业务与逻辑回归验证 | 已验证 | 18/18 passed (~589ms) | [`tests/demo-feedback.test.mjs`](../../tests/demo-feedback.test.mjs) |
| **总计** | **A1–A4 全链路底层基础设施** | **4 阶段独立演进 + A4定向修订** | **44/44 全部通过** | **零业务源码修改，零硬编码** |

---

## 二、 实际复用的 VMV 真实文件与接口

本工程严格恪守“禁止重写 VMV Stage 1–6 已有能力”的铁律，在 A1–A4 中深度无缝复用了如下 VMV 底层规范与真实输出：

1. **VMV Stage 1 真实元数据与场景检测产物**：
   - 路径：[`video-moment-validation/outputs/stage1/media_manifest.json`](file:///Users/yoyotaozhou/Documents/video-moment-validation/outputs/stage1/media_manifest.json)
   - 路径：[`video-moment-validation/outputs/stage1/scenes_qianfu_ep18_720p_25fps.json`](file:///Users/yoyotaozhou/Documents/video-moment-validation/outputs/stage1/scenes_qianfu_ep18_720p_25fps.json)
   - 复用方式：由 `loadVMVStage1Artifacts` 真实读取，无损摄取其 130 个镜头的起止秒数、帧范围与媒体格式（1280x720, 25fps, AAC立体声），构建不可篡改的 L1 Evidence 数据库。
2. **VMV Stage 4/5 生产单协议规范**：
   - 规约依据：`video-moment-validation/docs/superpowers/plans/2026-09-30-video-moment-validation.md`
   - 复用方式：由 `mapDirectorPlanToVMVProductionOrder` 将数智博主终稿结构化映射为符合 `python -m vmv render --order outputs/stage4/production-order.json` 结构的生产单数据对象。

---

## 三、 架构设计与约束守界执行情况

1. **运营Agent 唯一入口与后台能力解耦**：
   - 真人运营人员仅通过 `OperationsOrchestrator`（运营Agent 会话通道）交互，系统内部的立项、节拍编排与诉求推导均为纯确定性程序流水线，杜绝无意义的多 Agent 握手。
2. **Topic-first 状态机彻底解耦**：
   - 彻底移除了“先脚本再检索”的旧状态语义，确立 `ideating` $\rightarrow$ `awaiting_direction_review` $\rightarrow$ `retrieving` $\rightarrow$ `perspective_reading` $\rightarrow$ `directing` $\rightarrow$ `awaiting_final_plan_review` $\rightarrow$ `vmv_producing`。
   - 最终脚本与解说词必须在 Retrieval + Perspective Reading $\rightarrow$ Director 后依据真实证据产生，立项阶段只审核选题方向与证据诉求。
3. **诉求语义 (desired / evidence_need) 与防伪装隔离**：
   - `MaterialRequirement` 全面采用 `desired_action`、`desired_emotion`、`desired_characters`、`desired_scene_env`、`target_affordances`、`evidence_grounding_criteria` 语义，明确表达“想寻找的证据”，不能伪装成已确认素材事实；
   - 建立反伪装校验测试，严禁 `MaterialRequirement` 作为 L1 Objective Evidence 被摄入。
4. **多轮修改与修订历史完整保留 (Revision History)**：
   - 在 A4 实测中，真人运营提出修改建议（如“这个结论太绝对了，收一点”），系统基于同一个 `job.job_id` 原地推进 Core Viewpoint 版本升级（v1 $\rightarrow$ v2），在 `revisions` 数组中完整保留了 `previous_value`、`updated_value`、`operator_feedback` 及时间戳，未新建任何无关任务。
5. **Story Beats 守界性**：
   - Beats 阶段仅输出叙事意图与画面动作诉求（`MaterialRequirements`）；测试断言强力证明：任何在无真实证据阶段试图硬编码具体物理时间码或锁定场景的行为均被立即拦截报错。
6. **素材三层理解与隔离防污染**：
   - L1（客观证据层）：物理只读，VMV 未提供字段严格标记为 `unavailable`，严禁模型凭空臆造，写入主观语义时直接抛出 `L1PollutionError`；
   - L2（通用潜能层）：支持一个 Evidence 对应多个增量 Affordance，具备完整 provenance 溯源；
   - L3 $\rightarrow$ L2 晋升通道：只有经过 `approved` 审核且具有 L1 Evidence 锚定的通用模式方可受控晋升，绝不触碰 L1。

---

## 四、 已知问题与技术局限说明 (含技术债登记)

1. **[技术债] VMV Stage 4/5 适配器消费端端到端集成测试待补**：
   - 当前 [`src/contracts/vmv-adapter.mjs`](../../src/contracts/vmv-adapter.mjs) 仅完成数据结构层面的 Schema-level mapping 与静态结构校验，尚未经过真实 VMV Stage 4/5 消费端执行链路（Python CLI `python -m vmv render`、真实阿里云 TTS 生成与 FFmpeg 压制）的 Consumer Integration Test。在进入 A7/A8 正式生产接入前必须通过真实端到端集成验证。文档与注释中严禁使用“100%兼容”等绝对化用语。
2. **影视原片硬字幕局限**：
   - 当前测试素材 `qianfu_ep18.mp4` 属于内嵌烧录硬字幕，VMV Stage 1 输出中 `subtitles` 为空数组。因此 A2 摄取时 `dialogue` 严格标为 `"unavailable"`。在未来 A5 检索如果需要台词匹配，需先由 VMV 或预处理模块补充 ASR 软字幕提取。
3. **人物视觉识别尚未入库**：
   - VMV Stage 1 当前未包含人脸检测聚类，因此 `characters` 标记为 `"unavailable"`。A5 阶段检索需依赖文本剧情关键词、通用戏剧潜能（L2 Affordance）及多模态特征检索。

---

## 五、 A5 (Retrieval 候选镜头检索) 准入前置条件

根据总原则，严禁在今晚自动进入 A5。后续进入 A5 阶段必须满足如下硬性前置条件：
1. **A4 Review 审查通过**：真人运营人员确认 A4 运营任务骨架与多轮修订机制符合预期；
2. **检索候选库就绪**：基于 A2 摄取的 130 个客观镜头与 A3 注册的戏剧潜能标签；
3. **激活 Gate 2 (Retrieval Top3 实测 Gate)**：在进入 A7/A8 大规模合成前，必须使用真实影视素材实测验证 **Top-3 候选可用率 $\ge 80\%$**。
