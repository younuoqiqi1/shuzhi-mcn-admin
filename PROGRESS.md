# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-05（Asia/Shanghai）  
当前分支：`agent-poc/a1-contracts`  
当前阶段：**X1.1: L1 自动素材理解重验与结构化基线 (Revalidation Baseline)**
当前状态：**`X1.1 awaiting_human_review`（人脸 35/40 真实标注已校准阈值 0.4067；视觉仅 partial 20/45 完成，含 2 条真实幻觉，无 50-shot Gold，维持 STOP 等待 Review）**
核心决议：**2026-10-05 完成人脸 40 匿名对真实人工审核与校准（真实 35/40 有效标注已 calibrated，推荐阈值 0.4067，Holdout 18 混淆 7/0/0/11，但受限于共享 11 face_id 仅 pair-disjoint，不可夸大为全集 Gate）；视觉事实审核确认仅为 partial 20/45 覆盖（已审 178 事实 / 真实 2 条幻觉，分母 180，幻觉率 1.11% 仅代表已审子集；用户口头抽查基本正确但采用画面左右坐标系，定性意见不覆盖真实 2 条幻觉标注）；无 50-shot Gold，语音 WER/CER 保持 pending；完整 X1.1 尚待闭环，不宣称科学 PASS；X1 整体维持未通过，X2/A8/A9/A10 维持冻结；严格 STOP 等待真人审核与 Review。**
执行责任：🏛️ 全栈架构师 & ⚡ 算法与性能专家 & 📝 技术文档架构师

---

## 阶段门禁状态 (Revalidation Path & Gate System)

| 门禁/阶段名称 | 阶段点 | 当前状态 | 准入/通过标准与说明 |
|:---|:---:|:---:|:---|
| **X0 Technology Spike Gate** | X0 结束点 | ✅ **approved** | **2026-10-05 用户明确批准**。完成开源项目源码/License/依赖与认证机制核查；完成 EP18 中立短段（900-930s）四种镜头检测横向对比（VMV原函数/PySceneDetect Content与Adaptive/video-recap-skills）、15张代表帧提取、macOS 原生 Vision OCR 实测；完成成本外推公式与参数化估算；报告交付于 [`docs/agent-poc/x0-technology-spike.md`](docs/agent-poc/x0-technology-spike.md)；正式授权开启 X1.0 |
| **X1 L1 Understanding Benchmark** | X1.1 节点 | 🚪 **awaiting_human_review (人脸 35/40 已校准阈值 0.4067，视觉 partial 20/45 含 2 条真实幻觉，无 50 Gold 待 Review STOP / X1 整体未通过)** | 完成 45 正式 Gemini 低档全部尝试（44 成功 / 1 服务 503 无重试，逐帧独立核验 44/45=97.8%）；15 母区间完成 47 children（max 26.52s）；OCR/ASR fusion 15 完成；人脸 35/40 真实人工标注已 calibrated 阈值 0.4067（Holdout 18 混淆 7/0/0/11，共享 11 face 非 person-disjoint）；视觉仅 partial 20/45 事实审核（178 事实 / 真实 2 条幻觉，分母 180，1.11% 仅代表已审子集；用户口头抽查采用画面坐标系，定性意见不覆盖 2 条真实幻觉）；无 50-shot Gold，语音 WER/CER 保持 pending；完整 X1.1 未闭环，不宣称科学 PASS，不说全部 X1.1 已通过；X1 整体未通过，不进入 50-shot Gold / X2 / A8/A9/A10，严格 STOP 等待真人审核与 Review |
| **X2 Semantic Retrieval Benchmark** | X2 节点 | ⏳ **冻结中 (需等待 X1 真正通过)** | 50 条多类别需求（显式/抽象/改写/对抗负例/荒谬输入）盲测检索与 INSUFFICIENT 拒识率验证；X1 未通过前严格冻结 |
| **A8/A9/A10 (旧生产管线)** | 旧节点 | 🛑 **全面冻结** | 因 L1 虚假描述/时间表依赖、A5 人名关键词依赖、A6 预写模板及成片伪造字幕/画面不符事故，已全面冻结，不修改其实现，不继续投入 |

---

## X1.1 重验基线与执行状态 (Revalidation awaiting_human_review)

- **授权与执行说明**：
  - 当前阶段状态变更为 **`X1.1 awaiting_human_review`（人脸 35/40 真实标注已校准阈值 0.4067；视觉仅 partial 20/45 完成，含 2 条真实幻觉，无 50-shot Gold，维持 STOP 等待 Review）**；
  - 报告 [`docs/agent-poc/x1.1-revalidation-report.md`](docs/agent-poc/x1.1-revalidation-report.md) 已由真实汇总器重新生成，不采用 AGY 自写统计；
  - **真人审核材料入口**：[`review.html`](/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/x1_1-review/review.html)（真实本地地址：`/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/x1_1-review/review.html`，含 40 pairs 45 帧）；
  - 保留历史 X1.0 `awaiting_review` 记录为当时阶段终点，不改旧 A5–A8 Legacy 能力口径、不宣称用户批准 X1.0 科学通过；
  - 人脸 35/40 真实人工标注已完成校准（阈值 0.4067，Holdout 18 混淆 7/0/0/11，共享 11 face 局限）；视觉事实核验当前仅为 partial 20/45 覆盖（已审 178 事实 / 2 真实幻觉，分母 180，幻觉率 1.11% 仅代表已审子集；用户口头抽查基本正确采用画面坐标系，定性意见不覆盖 2 条真实幻觉）；语音 WER / CER 仍 pending；无 50-shot Gold，**不说全部 X1.1 已通过，不宣称科学 PASS**；
  - **X1 整体未通过，X2/A8/A9/A10 维持冻结，不进入 50-shot Gold**；
  - 本轮提交后严格 **STOP 等待真人审核与 Review**；所有“完成率/通过”指标严禁从自评推断。
- **X1.1 四项核心工作基线与实测执行事实**：
  1. **固定 45 代表帧与云端大模型推理 (VLM)**：
     - 基于原 15 个盲抽 Shot（15 blind）固定的 45 个代表帧锚点（45 anchors）；
     - 模型调用：采用 Gemini Pro low（低推理档，温度由Provider管理且未知）经由 AGY CLI 执行全部 45 次正式尝试（无商业 API、无本地模型）；
     - 实测结果：**44 次成功，1 次遭遇服务端 503，无重试**；
     - 独立核验：通过 Native Schema + Trace + 原图与推理 ImageHash 逐帧独立核验，合规成功 **44/45 = 97.8%**；实际包含 1 次 503 异常，严禁预写 45/45。
  2. **镜头切分与时长控制 (Shot Splitting)**：
     - 对原 15 个盲抽父镜头切分为 47 个子镜头（47 children / 32 cuts），实现 15 个父区间全覆盖（15 全 coverage）；
     - 实测最长子镜头26.52秒（非人工设置上限）（三个 50+ 秒 parent 超长镜头分别切分为 9、8、7 个子镜头）；
     - 完全基于纯视觉客观变化切分，**绝无剧情假设、绝无人名关联、绝无人工边界干预**。
  3. **多模态台词比对 (OCR + ASR Timeline Alignment)**：
     - 15 个母区间 OCR/ASR timeline fusion 全部完成；涵盖 90 段 existing OCR 台词数据与 90 段 existing real X1.0 ASR（mlx-whisper tiny）音频识别结果；
     - 对齐分布情况：产生 **34 条共识 (consensus)、43 条冲突 (conflict)、13 条仅 OCR 检测到 (ocr-only)、27 条仅 ASR 检测到 (asr-only)**；
     - 原文完整保留冲突与独立检出；**因缺乏独立真实语音/字幕真值标注（Ground Truth），缺 CER/WER 真值，绝不自宣科学 PASS**。
  4. **人脸特征校准与视觉部分审核事实 (Face Calibration & Partial Human Review)**：
     - 人脸 40 匿名对基于 35 真实真人标注（14 same, 21 different, 2 uncertain, 3 null）完成校准，推荐阈值 **0.4067**；Holdout 18 对混淆矩阵为 7/0/0/11（F1=1.0），明确限制声明：两集共享 11 face_id 仅保证 pair-disjoint 而非 person-disjoint，不可夸大为全集 Gate；
     - 45 帧客观视觉事实判定当前仅为 **partial 20/45 审核覆盖**（已审 178 事实陈述，包含真实 2 条幻觉标注，总分母 180，幻觉率 1.11% 仅代表已审子集，不可声称全体）；
     - 用户口头抽查基本正确（采用画面左右坐标系，不确定不用人物解剖学左右），但定性意见绝不覆盖 JSON 中真实标注的 2 条幻觉记录；
     - 无 50-shot Gold，语音 WER / CER 待人工校对；严格维持 STOP 等待 Review。

---

## X1.0 真实模型小样摸底交付记录 (Smoke Validation Baseline - 历史阶段终点)

- **范围与科学性声明**：
  - 本次交付为 **X1.0 真实模型小样摸底（Smoke Validation）**，仅验证本地开源模型推理管道的可执行性与真实输出表现；
  - **因无独立 Gold 标注文档，绝不自宣科学 PASS**；
  - **缺少 macOS Vision OCR 与 OCR/ASR Timeline Fusion 等完整 X1 范围，明确声明不属于完整 X1 交付**；
  - **X1.0 阶段当时记录：X1 整体未通过，当时不进入 X1.1 与 X2；用户要求结果提交后严格 STOP review，全面停止后续开发，等待人工审核裁决**。
- **报告与产物索引**：
  - 摸底评估报告：[`docs/agent-poc/x1.0-smoke-validation.md`](docs/agent-poc/x1.0-smoke-validation.md)
  - 实验产物与数据目录：[`benchmarks/x1/`](benchmarks/x1/)
- **真实小样实测事实记录**：
  1. **盲抽采样与代表帧**：从 EP18 全片按视频前、中、后时段各 5 个 Shot 进行盲抽，共 15 个 Shot；每 Shot 按 25%、50%、75% 提取真实代表帧，共提取 45 张代表帧。
  2. **语音转写 (ASR)**：真实调用本地 `mlx-whisper tiny`，15 次调用全部成功，产出 10 条有文本输出与 5 条空文本；5 条空文本原因未核验，可能无语音或 tiny 漏识别，10 条有输出不可称识别真实正确对白；WER/CER 未评定。
  3. **视觉多模态大模型 (VLM)**：真实调用本地 `Qwen2-VL-2B 4bit` 对 45 张代表帧进行结构化推理；45 帧中 **20 帧 Schema 输出成功，25 帧 rejected**（模型输出格式/结构未合规被拒）；15 个 Shot 中 **3 个 Shot 实现三帧全结构成功，12 个 Shot 包含拒识**；**所有生成的视觉语义观察待人工审核**。
  4. **人脸检测与匿名特征聚类**：采用 `YuNet + SFace`，共产生 50 次人脸检测记录，聚类生成 **31 个匿名算法特征簇**（余弦相似度阈值 0.55 尚未校准，跨镜头一致性 F1 未评定，**明确记为算法特征簇，不称 31 人**）。
  5. **当时流程控制**：旧 A8/A9/A10 维持冻结；当时原地 STOP，等待审核。（现已由用户明确授权开启 X1.1 重验基线）。

---

## 旧 A0–A10 历史实施状态表（Legacy Baseline，AI 能力未经独立科学验证）

> [!WARNING]
> **口径重置与免责声明**：下表记录的是项目历史工程实施与阶段验收产物。**所有历史“Approved”和自动化测试全绿仅证明当时的代码工程结构、接口契约与手工固件测试通过，绝对不代表 AI 核心能力已验证、不代表通过科学 Benchmark、亦不代表真实人工内容验收通过。** 原“总体完成度 95%”系指代码工程搭建进度，存在严重能力误导，现已彻底废除。根据 2026-10-05 独立技术审计（`poc-independent-audit.md`），旧实现未调用任何 LLM/VLM，检索与视角解读基于硬编码词表与模板。A8/A9/A10 维持冻结状态，不修改其实现。

| 阶段 | 历史权重 | 当前定位与状态 | 历史交付物 / 产物链接 | 状态说明与审计口径重置 |
|:---|---:|:---:|:---|:---|
| **A0. 架构设计与 Topic-First 接线方案** | 10% | ⚠️ **Legacy 架构设计** | [`docs/agent-poc/agent-poc-architecture.md`](docs/agent-poc/agent-poc-architecture.md) | 确立 Topic-First 与 L1/L3 分离思想（保留）；但原 A0–A10 阶段拆分过度，实现层绑死特定剧集与硬编码规则 |
| **A1. 跨模块数据契约与 Job 状态机** | 8% | ⚠️ **Legacy 工程契约** | [`src/contracts/`](src/contracts/)<br>[`tests/contracts.test.mjs`](tests/contracts.test.mjs) | 核心 Schema 与状态机在工程代码层面可用（测试 14/14）；作为软件结构保留，但业务模型能力未经独立验证 |
| **A2. 稳定客观 Evidence 库 (L1) 摄取** | 8% | ⚠️ **Legacy (自动客观理解未验证)** | [`src/evidence/`](src/evidence/)<br>[`tests/evidence-store.test.mjs`](tests/evidence-store.test.mjs) | 仅实现数据存储与 VMV Stage 1 解析结构；经审计核查当时仅覆盖前 1800s 且依赖规则，**自动客观素材理解完全未经验证** |
| **A3. 共享 Generic Narrative Affordances (L2) 库** | 8% | ⚠️ **Legacy (能力未验证)** | [`src/affordances/`](src/affordances/)<br>[`tests/affordance-store.test.mjs`](tests/affordance-store.test.mjs) | 仅建立静态标签匹配框架（`aff.tag.includes`），对 POC 核心 AI 假设无实质贡献，推迟至多集阶段验证 |
| **A4. Topic-First 创意生成链路** | 10% | ⚠️ **Legacy (未接主链路/未验证)** | [`src/operations/`](src/operations/)<br>[`tests/operations-orchestrator.test.mjs`](tests/operations-orchestrator.test.mjs) | 确立 Topic-first 状态机；但实际上未被 A5 或主生成脚本调用，未真实接入主生产链路，业务泛化能力未经验证 |
| **A4.5. 真实 L1 Evidence 补齐与覆盖率核验** | 4% | ⚠️ **Legacy (自动客观理解未验证)** | [`docs/agent-poc/a4.5-evidence-enrichment-report.md`](docs/agent-poc/a4.5-evidence-enrichment-report.md) | 提取 857 条真实 OCR 台词；但场景切分与视觉信息仍包含人工规则与模板，自动客观理解未验证 |
| **A4.5.1 尾部连续补齐与生成来源审计** | 4% | ⚠️ **Legacy (自动客观理解未验证)** | [`docs/agent-poc/a4.5.1-review-fix-report.md`](docs/agent-poc/a4.5.1-review-fix-report.md)<br>[`tests/evidence-enrichment.test.mjs`](tests/evidence-enrichment.test.mjs) | 补齐 235 个连续场景；但核心场景划分依赖人工手写 `EP18_REAL_SCENE_MAP`，动作描述含人工模板与取模生成，自动客观理解未经验证 |
| **A5. 候选镜头召回检索管道** | 10% | 🛑 **Legacy (能力未经独立验证 / 被审计否决)** | [`src/retrieval/`](src/retrieval/)<br>[`docs/agent-poc/a5-retrieval-report.md`](docs/agent-poc/a5-retrieval-report.md)<br>[`tests/candidate-retrieval.test.mjs`](tests/candidate-retrieval.test.mjs) | 历史测试 62/62 仅证明代码流转。经审计对抗实验证实：所谓语义匹配实为专有人名与剧情关键词 fallback，分词词典写死人名与台词，不是真 semantic；去掉人名后无法召回意图需求，荒谬需求同样能通过，能力未经独立验证 |
| **A6. 动态 Perspective Re-reading** | 12% | 🛑 **Legacy (能力未经独立验证 / 被审计否决)** | [`src/perspective/`](src/perspective/)<br>[`docs/agent-poc/a6-human-gate-review.md`](docs/agent-poc/a6-human-gate-review.md)<br>[`docs/agent-poc/a6.3-evidence-closing-report.md`](docs/agent-poc/a6.3-evidence-closing-report.md)<br>[`tests/perspective-rereading.test.mjs`](tests/perspective-rereading.test.mjs) | 历史解读文本为根据 topic_id 分支的手写模板，换 Persona 产生逐字相同文本，非 persona-conditioned 模型推理；87.5% 仅为系统自评（human pending，gate_passed: false），未经真实人工通过；修正原关于“零出镜”等未验证剧情断言；已被审计否决 |
| **A7. Director 真实证据终编服务** | 10% | 🛑 **Legacy (能力未经独立验证 / 被审计否决)** | [`src/director/`](src/director/)<br>[`docs/agent-poc/a7-director-report.md`](docs/agent-poc/a7-director-report.md)<br>[`docs/agent-poc/a7-director-preview-topic-b.md`](docs/agent-poc/a7-director-preview-topic-b.md)<br>[`tests/director-final.test.mjs`](tests/director-final.test.mjs) | Plan 基于人工预写并原样写回，非自主 AI Director；Topic B 违反 A6 Top3 约束；门禁实为针对已知事故写死的特定规则；能力未经独立验证 |
| **A8. VMV Stage 4/5 真实生产对接与 MP4** | 8% | 🛑 **Legacy (人工视听 FAIL / 全面冻结)** | [`outputs/production/topic_b_final.mp4`](outputs/production/topic_b_final.mp4)<br>[`outputs/production/topic_a_final.mp4`](outputs/production/topic_a_final.mp4)<br>[`docs/agent-poc/a8-e2e-production-report.md`](docs/agent-poc/a8-e2e-production-report.md)<br>[`tests/production-e2e.test.mjs`](tests/production-e2e.test.mjs) | 仅证明结构化剪辑单到真实 MP4 的底层工程渲染管道可运行；内容层面成片含伪造台词字幕与严重音画不符，人工视听审查判 FAIL 并冻结，不能叫泛化 E2E 成功；不修改其实现 |
| **A9. 动态解释向通用 Affordance 受控回流** | 4% | 🛑 **全面冻结** | 知识回流流水线设计 | 全面冻结，在 X1/X2 核心假设验证通过前严禁启动 |
| **A10. 双博主同素材 A/B 验证验收** | 4% | 🛑 **全面冻结** | 双博主视听成品设计 | 全面冻结，在 X1/X2 核心假设验证通过前严禁启动 |

---

## 阶段产物与历史执行清单 (A1→A8 Legacy Baseline，保留历史链接)

> [!NOTE]
> **历史存根说明**：以下保留历史工程实施过程中沉淀的各阶段交付物、代码及测试链接。**所有历史标记为“(Approved)”的条目仅代表当时特定的代码工程结构与测试固件通过，绝不能代表 AI 核心能力已通过科学 Benchmark 或真实人工内容验收。** 根据独立技术审计结论，旧实现未调用任何 LLM/VLM，旧 A5–A8 核心逻辑已被审计否决，旧 A2–A4 自动客观理解均未经验证。A8/A9/A10 维持冻结状态，不修改其实现。

- [x] **A1 (Legacy 工程实现)**：正式数据契约、通用校验器、Job 状态机、VMV Stage 4/5 适配器与测试固件，测试 14/14 通过。仅验证了工程数据结构，业务模型能力未经验证。产物：[`src/contracts/`](src/contracts/)、[`tests/contracts.test.mjs`](tests/contracts.test.mjs)。
- [x] **A2 (Legacy 工程实现 - 自动客观理解未验证)**：L1 客观 Evidence Schema 规范、VMV Stage 1 产物解析、防污染只读 EvidenceStore，测试 5/5 通过。仅摄取了前 1800s 数据结构，场景区间依赖人工时间表与规则，**全片自动客观素材理解完全未经验证**。产物：[`src/evidence/`](src/evidence/)、[`tests/evidence-store.test.mjs`](tests/evidence-store.test.mjs)。
- [x] **A3 (Legacy 工程实现 - 能力未验证)**：L2 Generic Narrative Affordance 数据模型、一对多增量 AffordanceStore、受控晋升接口骨架，测试 3/3 通过。仅建立标签匹配框架（`aff.tag.includes`），对 POC 核心 AI 假设无实质贡献，能力未经验证，推迟至多集阶段。产物：[`src/affordances/`](src/affordances/)、[`tests/affordance-store.test.mjs`](tests/affordance-store.test.mjs)。
- [x] **A4 (Legacy 工程实现 - 未接主链路/未验证)**：Topic-First 运营任务编排服务 ([`src/operations/operations-orchestrator.mjs`](src/operations/operations-orchestrator.mjs))：
  - 确立 Topic-first 状态机：`ideating` $\rightarrow$ `awaiting_direction_review` $\rightarrow$ `retrieving`；
  - `MaterialRequirement` 重构为 `desired_*` 诉求语义与防伪装测试（测试 4/4 通过）；
  - **审计核实**：该模块实际未被 A5 或主生成脚本调用，未真实接入主生产链路，业务泛化能力未经验证。
- [x] **A4.5 (Legacy 工程实现 - 自动客观理解未验证)**：真实 L1 Objective Evidence 基础补齐与 130 vs 325 场景分析报告：[`docs/agent-poc/a4.5-evidence-enrichment-report.md`](docs/agent-poc/a4.5-evidence-enrichment-report.md)。提取了 857 条真实 OCR 台词，但场景划分仍基于人工规则，自动客观理解未验证。
- [x] **A4.5.1 (Legacy 工程实现 - 自动客观理解未验证)**：Canonical Evidence 尾部补齐与来源审计（测试 50/50 通过）：
  - 权威检索数据集：[`src/evidence/data/canonical_evidence_qianfu_ep18.json`](src/evidence/data/canonical_evidence_qianfu_ep18.json)；
  - 来源审计与段级继承衰减机制落地（`independent_keyframe` vs `segment_inherited`）；
  - 保留复现配置：[`src/evidence/config/canonical-manifest.json`](src/evidence/config/canonical-manifest.json)；
  - **审计核实**：全片场景切分基于人工手写 `EP18_REAL_SCENE_MAP`，动作描述含人工模板与序号取模生成（`actions_pool`），**全片自动客观理解完全未经验证**。
- [x] **A5 (Legacy 工程实现 - 能力未经独立验证 / 后被审计否决)**：候选镜头召回检索管道（测试 62/62 仅代表代码流转）：
  - 交付接口服务 [`src/retrieval/retrieval-service.mjs`](src/retrieval/retrieval-service.mjs)、L2 种子库 [`src/retrieval/data/seed_l2_affordances.json`](src/retrieval/data/seed_l2_affordances.json) 与技术报告 [`docs/agent-poc/a5-retrieval-report.md`](docs/agent-poc/a5-retrieval-report.md)；
  - **审计结论与对抗实验否决**：所谓语义检索实为 5 组固定专有词（晚秋/翠平/站长/南京/金条等）命中次数的关键词 fallback，代码内自标 `is_fallback: true` 但下游报告误称为 semantic；分词词典写死角色名与特定台词；去人名后意图召回失效，荒谬输入（如“橘猫追鸽子”）与真实需求得分无法区分；**能力未经独立验证，已被技术审计否决**。
- [x] **A6.1 / A6.2 / A6.3 (Legacy 工程实现 - 能力未经独立验证 / 后被审计否决)**：动态 Perspective Re-reading 与门禁（测试 83/83 仅代表代码流转）：
  - 交付产物：[`src/perspective/`](src/perspective/)、[`docs/agent-poc/a6-human-gate-review.md`](docs/agent-poc/a6-human-gate-review.md)、[`docs/agent-poc/a6.3-evidence-closing-report.md`](docs/agent-poc/a6.3-evidence-closing-report.md) 与评测记录 [`src/perspective/results/a6_human_gate_review.json`](src/perspective/results/a6_human_gate_review.json)；
  - **审计结论与模板问题否决**：A6 视角解读文本系按 `topicId` 分支（`isWuTopic` / `isProbeTopic`）调用的手写预置段落，非 persona-conditioned 模型推理；换 Persona 生成逐字相同文本；
  - **自评冒充通过否决**：历史上宣称的“Top3 Gate 87.5% 正式批准通过”实为系统自评（实际记录为 `reviewed_requirements: 0`，24 个 candidate 的 `human_verdict` 全部为 `pending`，`gate_passed: false`），未经真实人工审核，已被审计否决；
  - **修正错误剧情断言**：修正历史记录中将角色未记录作为事实宣称的断言（原依据 L1 记录判退，不应断言为客观全片事实）；修正“Top3 100% 回归真实火车站台蒸汽告别镜头”等错误剧情断言（真实抽帧已证实该段画面并非车站告别），不新增任何剧情推测。
- [x] **A7 / A7.1 (Legacy 工程实现 - 能力未经独立验证 / 后被审计否决)**：Director 证据终编与时长预算（测试 99/99 仅代表代码流转）：
  - 交付时长预算工具 [`src/director/duration-budget-config.mjs`](src/director/duration-budget-config.mjs)、技术报告 [`docs/agent-poc/a7-director-report.md`](docs/agent-poc/a7-director-report.md)、双选题预算表 [`docs/agent-poc/a7.1-duration-budget-topic-b.md`](docs/agent-poc/a7.1-duration-budget-topic-b.md) / [`docs/agent-poc/a7.1-duration-budget-topic-a.md`](docs/agent-poc/a7.1-duration-budget-topic-a.md) 及预写 Plan/工单产物；
  - **审计结论与决策能力否决**：Plan 基于人工预写 JSON 并原样写回，非自主 AI Director；Topic B 甚至违反自身的 A6 Top3 约束；所谓五维门禁为已知事故写死的特定规则；能力未经独立验证。时长预算与工程框架可供后续参考。
- [x] **A8 (Legacy 工程实现 - 内容人工视听 FAIL / 全面冻结)**：MCN 后台 → 真实生产链 → MP4 真实端到端交付（测试 106/106 仅代表工程测试通过）：
  - 交付产物：[`outputs/production/topic_b_final.mp4`](outputs/production/topic_b_final.mp4)、[`outputs/production/topic_a_final.mp4`](outputs/production/topic_a_final.mp4) 与报告 [`docs/agent-poc/a8-e2e-production-report.md`](docs/agent-poc/a8-e2e-production-report.md)；
  - **工程管道可运行性**：验证了 MCN 后台任务调度与 VMV Stage 4/5 剪辑单驱动真实裁切、TTS 合成、混音降噪、字幕烧录与 FFmpeg 封装的底层工程渲染管道可跑通；
  - **内容人工视听 FAIL 与冻结决议**：两支 MP4 在人工视听审查中严重失真，画面出现伪造台词字幕重叠（叠在原片硬字幕上）与严重音画脱节事故（如“暗夜撤离”配白天田野、台词与出镜人物不符），人工审查已判 FAIL 并冻结，绝不能称为泛化 E2E 成功；
  - **当前状态**：全面冻结，不修改其代码实现；不生成新正式成片，核心能力全面交由 X0–X4 重新验证。
- [x] **A9 / A10 (全面冻结)**：严格禁止进入 A9 知识回流与 A10 双博主验收；在 X1/X2 核心假设验证通过前全面冻结。

---

## 审查审计日志 (Audit Log)

> [!NOTE]
> **历史存根说明**：本日志完整保留历史开发流转过程记录。**其中所有历史记录的“Approved”仅代表当时特定的软件工程阶段性代码交付状态，并不代表 AI 核心能力得到验证或内容通过验收。** 历史实现已被 2026-10-05 独立技术审计（`poc-independent-audit.md`）全面否决与重置。

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
21. **2026-10-05 12:45**：完成 POC-AGENT A6.3 全部收口修复：基于当时 L1 缺少机要室与特定人物记录，`req_wu_03` 判为 `INSUFFICIENT_EVIDENCE`（注：原“李涯零出镜”属历史未验断言，不可作为事实宣称）；演职员表与歌词过滤清洗（污染率 0%）；测试 83/83 全绿；Commit `28accfb`。
22. **2026-10-05 12:50**：A6 Final Review 审查正式批准通过（**APPROVED**），授权进入 POC-AGENT A7: Director Final 阶段。
23. **2026-10-05 13:05**：完成 POC-AGENT A7 初版交付，Commit `6a2ef5f`。
24. **2026-10-05 13:10**：A7 Review 审查反馈：**`changes_requested`**。指出 `req_wu_03` 不应创建虚假生产分段且成片不应对观众解释缺失，以及必须建立 Narration Duration Budget 证明每段说得完。
25. **2026-10-05 13:20**：完成 POC-AGENT A7.1 全部收口修复：
    - `req_wu_03` 落实 merge 决议，不产生虚假生产分段，Topic A 精简为 3 段且立意自然合并；
    - 落地 Narration Duration Budget 集中配置与估算体系，双选题全分段 **100% duration_fit = true**；
    - 全工程 **99/99 自动化测试全绿**（新增 4 项 A7.1 专项测试）；
    - 导出独立时长预算审计表与更新真人视听预览；
    - 当前状态正式设为 **`A7.1 awaiting_final_review`**，原地彻底停止，严禁进入 A8。
26. **2026-10-05 13:38**：A7.1 Final Review 审查正式批准通过（**APPROVED**），授权开启 POC-AGENT A8 阶段。
27. **2026-10-05 14:00**：完成 POC-AGENT A8 端到端全链路交付：
    - 接通真实 `video-moment-validation` Stage 4/5 消费端，落地 `src/vmv/render.py` 与 `vmv render` 命令；
    - 建立真实 `ProductionJobService` 与流式视频服务器 `McnBackendServer`，并在 MCN 后台嵌入原生视频播放器；
    - 真实执行《潜伏》第18集源片裁切、TTS 合成、原声/旁白/闪避/L-cut 混合与字幕烧录；
    - 成功生产第一条成片《余则成最危险的一次试探》（40.44s）并通过全量技术 QC；
    - 零改代码成功复跑第二条成片《吴站长什么时候开始怀疑余则成？》（39.48s），生成独立新 Job、新工单与新 SHA-256；
    - 全工程自动化测试扩展至 **106/106 passed**（0 failed）；
    - 交付验收报告 [`docs/agent-poc/a8-e2e-production-report.md`](docs/agent-poc/a8-e2e-production-report.md)；
    - 当前状态正式设为 **`A8 awaiting_human_video_review`**，原地彻底停机，等待用户亲自播放检视两条 MP4，严禁进入 A9。
28. **2026-10-05 14:35**：A8 人工视听审查反馈：**`FAIL / changes_requested`**。用户指出 Topic B 没看到金条台词不成立、Topic A 出现重复镜头且没有“副站长就是你”台词；核心为 Content Grounding 失败；执行全面 Root Cause Audit，完成逐 Segment 真实源片反查，交付 [`docs/agent-poc/a8-failure-root-cause-audit.md`](docs/agent-poc/a8-failure-root-cause-audit.md)，确立五维生产级门禁与可视化 Storyboard Proof 机制；状态设为 **`A8 changes_requested_root_cause_audit`**；严格停止，不修改成片，不进入 A9。
29. **2026-10-05 16:00**：**第三方独立技术审计报告交付与口径全面重置**（[`docs/agent-poc/poc-independent-audit.md`](docs/agent-poc/poc-independent-audit.md)）：
    - 审计判定：旧 POC 仅证明了“结构化剪辑单 → 真实 MP4”的底层工程渲染管道可运行；全链路核心大模型调用次数为 0，八个核心 AI 假设均未验证或已被证伪；
    - 揭露关键问题：L1 包含手写时间表与序号取模、A8.1 手工注入单元形成答案泄露、A5 语义为硬编码专有词表、A6 视角解读为硬编码模板且 87.5% 仅为系统自评（human pending, gate_passed: false）、A7 Plan 为人工预写、成片包含伪造字幕及音画脱节事故；
    - 正式决议：全面冻结原 A8/A9/A10 及旧 A5/A6/A7 规则，不修改其代码实现；废除总体 95% 能力完成度宣称；历史 Approved 和测试全绿仅证明当时代码工程状态，不代表 AI 能力、科学 benchmark 或人工验收；确立以 X0–X4 为核心的重验路线。
30. **2026-10-05 17:30**：**X0 技术选型与复用 Spike 交付**：
    - 完成开源项目源码、License、认证机制审计（`video-recap-skills` / `PySceneDetect` / `marlin-cli` / `VMV Stage 1`）；
    - 在 EP18 中立短段（900-930s）完成切点、代表帧、macOS 原生 Vision OCR 真实横向实测与多集架构推演；
    - 交付报告 [`docs/agent-poc/x0-technology-spike.md`](docs/agent-poc/x0-technology-spike.md)，状态设为 `X0 awaiting_review`。
31. **2026-10-05**：**用户明确批准 X0 评审，授权开启 X1.0**：
    - 用户正式批准 X0 Spike 审查并授权开启 X1.0（L1 自动素材理解 Benchmark）；
    - 阶段推进为 `X1.0 in_progress`；
    - 修正进度看板口径：旧 A5–A8 明确标记为 legacy 工程实现且未经独立验证，旧 A2–A4 备注自动客观理解未验证；修正仍作为事实宣称的历史错误剧情断言；A8/A9/A10 维持冻结不修改实现。
32. **2026-10-05**：**完成 X1.0 真实模型小样摸底，状态变更为 `awaiting_review`，严格 STOP**：
    - 完成 15 Shot（视频前中后各 5 盲抽）、45 张代表帧的本地全自动开源模型推理小样摸底；
    - 真实调用 `mlx-whisper tiny` ASR 15 次成功（产出 10 条有输出与 5 条空文本，5 条空文本原因未核验，可能无语音或 tiny 漏识别，10 条有输出不可称识别真实正确对白，WER/CER 未评）；
    - 真实调用 `Qwen2-VL-2B 4bit` 对 45 帧推理（20 帧 Schema 成功，25 帧 rejected；3 Shot 全结构成功，12 Shot 含拒识；所有语义观察待人工审核）；
    - 真实调用 `YuNet + SFace` 产生 50 次检测记录，聚类生成 31 个匿名算法特征簇（余弦阈值 0.55 未校准，跨镜头一致性 F1 未评，不称 31 人）；
    - 明确因无独立 Gold 标注不自宣科学 PASS；缺少 macOS Vision OCR 与 OCR/ASR Fusion 等完整 X1 范围明确不是本次交付；
    - **X1 整体未通过，不进入 X1.1 与 X2**；交付报告 [`docs/agent-poc/x1.0-smoke-validation.md`](docs/agent-poc/x1.0-smoke-validation.md) 与数据目录 [`benchmarks/x1/`](benchmarks/x1/)；
    - 当前阶段状态变更为 **`X1.0 awaiting_review`**；响应用户明确要求结果提交后严格 STOP review，全面停止后续开发，等待用户审核。
33. **2026-10-05**：**用户明确授权开启 X1.1，推进为 `X1.1 in_progress`**：
    - 用户明确授权并开启 X1.1 重验工作，更新状态为 `in_progress`（45 帧仍未全完 / 真人未标注）；
    - 确认保留历史 X1.0 `awaiting_review` 记录为当时阶段终点，不改旧 A5–A8 Legacy 能力口径，不宣称用户批准 X1.0 科学通过；
    - 确立 X1.1 四项核心工作基线（固定 45 anchors 经 AGY CLI、镜头切分、多模态台词比对、人脸与事实审核待标）；
    - X1 整体仍未通过，X2/A8/A9/A10 维持冻结，不进入 50-shot Gold。
34. **2026-10-05**：**完成 X1.1 自动化工程批次推理与独立核验，状态变更为 `X1.1 awaiting_human_review`，严格 STOP**：
    - 完成 45 次正式 Gemini low 全部尝试（经 AGY CLI，无商业 API、无本地模型）：实测 44 成功、1 遭遇服务 503，无重试；
    - Native Schema + Trace + 原图与推理 Hash 逐帧独立核验成功 44/45 = 97.8%（实际记录包含 1 次 503 异常，严禁预写 45/45）；
    - 15 母区间完成 47 children（max 26.52s，无剧情/人名/人工边界）；15 个母区间 OCR/ASR timeline fusion 全部完成（34 consensus / 43 conflict / 13 ocr-only / 27 asr-only，原文保留，缺 CER/WER 真值不宣科学 PASS）；
    - 报告 [`docs/agent-poc/x1.1-revalidation-report.md`](docs/agent-poc/x1.1-revalidation-report.md) 已由真实汇总器重新生成，不采用 AGY 自写统计；
    - 40 人脸 pairs 标签与 45 帧事实/幻觉审核待用户人工标注，人工 threshold/accuracy/hallucination/WER/CER 仍 pending；完整 X1.1 尚有人工指标待闭环，不说全部 X1.1 已通过；
    - X1 整体仍未通过，X2/A8/A9/A10 维持冻结，不进入 50-shot Gold；当前原地严格 STOP 等待真人审核与 Review。
35. **2026-10-05**：**完成人脸 35/40 真实标注校准与 partial 视觉事实审核复核，维持 `X1.1 awaiting_human_review`，严格 STOP**：
    - 人脸 40 匿名对基于 35 真实真人标注（14 same, 21 different, 2 uncertain, 3 null）完成校准，推荐阈值 **0.4067**（校准集 N=17 Balanced Acc=80.71%、F1=76.92%；独立 Holdout 集 N=18 Balanced Acc=100.0%、F1=100.0%）；声明两集共享 11 face_id 仅 pair-disjoint 而非 person-disjoint，不可夸大为全集 Gate；
    - 视觉事实确认 partial 20/45 审核覆盖（已审 178 事实 / 真实 2 条幻觉，分母 180，幻觉率 1.11% 仅代表已审子集；用户口头抽查基本正确采用画面坐标系，定性意见不覆盖 2 条真实幻觉记录）；场景/动作覆盖率为 22/45（已审准确率为 22/23）；
    - 汇总器修复 `coverage_insufficient` 分支缺 `wer_cer` KeyError 缺陷，严格保证 null 计数不可视为 0；
    - 无 50-shot Gold，语音 WER / CER 保持 pending；X1 整体维持未通过，X2/A8/A9/A10 维持冻结；当前原地严格 STOP 等待真人审核与 Review。




