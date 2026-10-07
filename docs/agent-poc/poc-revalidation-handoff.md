# 数智博主 AI 视频 POC｜重新验证开发交接文档

**日期：** 2026-10-07（Human Anchor 用户标注进行中；非评分 UI 勘误留档）
**用途：** 本地 Codex Work 接管项目并协调 AGY 后续开发  
**当前策略：** 冻结原 A8/A9/A10；全面落实 **Human Anchor + 独立 AI Judge 校准** 与 **X2.5 盲测** 机制；本规范明确 **supersede** 旧 X1/X2 指标/样本定义以及“只有 X1 Gate 通过后才能任何 X2 探针”的旧条款；当前实验暂停，优先固化新验证路线与预注册规范。
**最终目标：** 影视多集素材一次入库后，可针对任意新选题跨集检索、多集混剪，并从 MCN 后台生成真实视频。

## 1. 项目与当前基线

主仓库：`younuoqiqi1/shuzhi-mcn-admin`  
当前开发分支：`agent-poc/a1-contracts`  
A8.1 已知基线：`a1ce864610c7e558a5cf4cd26fa39d264757db4a`

本地：
`/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin`

VMV：
`younuoqiqi1/video-moment-validation`  
本地：`/Users/yoyotaozhou/Documents/video-moment-validation`  
EP18 源片：`/Users/yoyotaozhou/Documents/video-moment-validation/data/input/qianfu_ep18.mp4`

必须先读：
- `docs/agent-poc/poc-independent-audit.md`
- `docs/agent-poc/a8.1-independent-storyboard-review.md`
- `docs/agent-poc/a8-failure-root-cause-audit.md`

## 2. 最终产品目标

最终不是做“EP18 自动剪辑 Demo”，而是：

影视节目多集素材 → 每集一次自动 Ingest → 统一 Objective Evidence Library → Persona + Topic → 跨集 Retrieval → Perspective / Director → 多集混剪 → VMV Render → MCN 后台预览/审核/发布。

核心原则：

> 素材理解一次，多博主、多选题、多内容长期复用。

当前先用 EP18 做单集实验，但所有 Contract 必须从第一天支持：
- `series_id`
- `episode_id`
- `media_id`
- `shot_id`
- `episode_scope[]`

EP18 只是第一份 collection，禁止任何 EP18/Topic A/Topic B 专用架构。

## 3. 第三方审计后的状态重置

第三方独立审计结论：当前 POC 已证明“结构化剪辑单 → 真实 MP4”的工程管线可工作，但核心 AI 假设尚未得到有效验证。

已确认问题：

1. L1 并非真正自动素材理解。现有 `build_canonical_evidence.mjs` 仍含人工 `EP18_REAL_SCENE_MAP`、规则人物/场景和部分取模/模板视觉字段。
2. A8.1 为修复事故人工注入 `unit_dial_vice_director_01`、`unit_dial_gold_bars_01`、`unit_dial_promotion_01`、`unit_dial_celebration_01`，形成答案泄漏。
3. 旧 A5 “semantic” 主要是人物名、关键词、人工 concept dictionary 和 OCR overlap；荒谬需求也可能被判 SUFFICIENT。
4. 旧 A6 Perspective Provider 根据 `topicId.includes("wu")` / `topicId.includes("probe")` 和剧情关键词返回预写文本，不是真正 Persona-conditioned reasoning。
5. A7 Director Plan 大量预写，不能证明 AI Director 自主决策。
6. A8 Backend 实际主要在两个固定 Topic Plan 之间路由，不支持任意新选题。
7. 旧测试和 Gate 存在自评、答案泄漏、针对事故补规则的问题。

因此：原 A0–A7 的 Approved 只代表软件结构/实验实现曾完成，不代表 AI 能力已验证。

## 4. 保留与冻结

### 保留
- VMV Stage 4/5：真实 cut / TTS / original audio / ducking / subtitle / FFmpeg / MP4 / technical QC。
- EP18 真实 OCR 字幕，可后续与 ASR fusion。
- VMV/现成 Shot Detection 能力，可与 PySceneDetect 比较。
- Topic-first 产品方向。
- L1 Objective Evidence 与 L3 Persona/Topic Interpretation 分离原则。
- Evidence / Candidate / INSUFFICIENT / Director Plan / Production Order 等数据契约思想。

### 冻结与受控探针规则 (Superseding Rule)
旧条款“只有 X1 Gate 全部通过后才能开始任何 X2 探针”**已被正式废止替换 (Superseded)**。
现行规则如下：
1. **主干冻结**：
   - A8 冻结，A9/A10 禁止开始；
   - 不修改旧 A5 关键词表、不给 A6 增加剧情规则、不给 Grounding Gate 增加事故黑名单；
   - 不针对 Topic A/B 手写素材答案，不生成新的正式验收 MP4。
2. **受控 X2 Downstream Probe 例外**：
   - 在 X1 首版 Evidence 产物生成且满足 Schema 及 Provenance 门禁后，**允许且仅允许对冻结小子集执行小规模 X2 downstream probe**；
   - 该 probe 的唯一目标是获得下游检索支持率、拒答率等反馈，反向校准并修正 X1 的数据质量与指标定义；
   - **绝对不可**凭 probe 宣称 X1 或 X2 Gate 通过，严禁私自扩样；probe 须单独预注册，本次不执行。

旧 A5/A6/A7 仅作为 legacy baseline。

## 5. 新验证路线 (Updated Benchmark Roadmap)

新验证路线由原线性流水线升级为 **Human Anchor 校准驱动的闭环评估体系**：

```
[阶段 0] Human Anchor 准备与独立 AI Judge 校准 (一次性 POC 成本，非生产流程)
         ↓ Judge 与 Anchor 一致性达标
[阶段 1] X1 Objective Evidence v1 生成 (严格执行冻结分母与 Pre-registration)
         ↓ 记录 Schema & Provenance 结果
[阶段 2] 有限 X2 Downstream Probe (仅限冻结小子集，获取支持率/拒答反馈以修正 X1 定义)
         ↓ 反馈校准
[阶段 3] 冻结并核验 X1 终版指标 (执行 X1 Blind Gate)
         ↓ X1 Gate PASS
[阶段 4] X2 Gold 主评 (以原始视频时间区间为唯一主标注的 Semantic Retrieval Benchmark)
         ↓ X2 Gate PASS
[阶段 5] X2.5 Persona/Plan Blind Test (作者/标注者/运行者三权分立，盲测 Persona 条件化 Plan)
         ↓ Review 综合裁决
[阶段 6] X3 多集统一 Evidence Store (当前严格锁定)
         ↓
[阶段 7] X4 跨集混剪与端到端交付 (当前严格锁定)
```

**核心科学原则**：
- **工程测试通过 ≠ 实验基准通过 ≠ 内容验收通过**。
- X1、X2、X2.5及Probe统一采用本文件预注册的分母、失败/缺失计法、置信区间与PASS/FAIL规则；下游章节补充各自指标公式。置信区间跨门槛为inconclusive，不得事后更换统计口径。
- 核心指标分母不足直接标为 `N/A`，绝不允许将缺失数据视为 0 或视为通过。
- 系统面对未知素材与全新选题仍能泛化并具备 INSUFFICIENT 拒识能力，是唯一的成功标准。

---

# X0｜技术选型与复用 Spike

## 目标

不要从零造视频理解系统。先实际研究、运行和比较成熟 Skill/开源项目，为 X1 选择最短可靠路线，不修改现有 POC 主链。

优先研究：

1. `zenstory-ai/video-recap-skills`
   - 重点：`video-understanding`
   - scene detection / frame sampling / ASR / VLM observations / timeline fusion。
2. PySceneDetect
   - ContentDetector / AdaptiveDetector。
3. Marlin video-understanding
   - Apple Silicon 本地 caption/find/bounded clip 能力，作为低成本 baseline 候选。
4. 当前 `video-moment-validation` Stage1。
5. VideoRAG 等长视频/多模态 Retrieval 项目，只做未来多集架构研究，X0 不直接集成。
6. 允许继续 GitHub 深搜更合适的 Skill，但必须检查源码、License、维护状态、依赖和实际输出，不得只看 README。

用 EP18 的短片段做真实 Spike。

必须评估：
- shot detection
- representative frames
- OCR/ASR
- objective VLM observation
- person consistency / identity
- timeline fusion
- provenance
- M2/Apple Silicon 本地能力
- API/VLM 需求
- 单集耗时/成本
- 30 集扩展成本
- 是否形成多集架构死路

唯一正式交付：
`docs/agent-poc/x0-technology-spike.md`

完成后更新 `PROGRESS.md`：
`X0 awaiting_review`

commit 后 STOP，不自行进入 X1。

---

# X1｜L1 自动素材理解 Benchmark (Human Anchor + AI Judge 架构)

## 核心问题

> 在不知道剧情答案的情况下，一集影视素材能否自动生成可靠、可追溯、可复用的 Objective Evidence？

X1 绝不生成成片，只产出标准化客观证据资产。

## 架构升级：Human Anchor + 独立 AI Judge 校准机制

本规范确立 **Human Anchor 一次性校准** 模式：
1. **成本定性**：Human Anchor 仅为 **一次性 POC 评估校准成本**，**绝对不进入每集素材 Ingest 或生产入库主链**；日后每集上线只运行已冻结的自动 Agent Ingest 流水线。
2. **人工盲标**：标注员必须直接观看原始视频/帧（需要声音标签时直接听原声），先独立完成人工标注并锁定；标注前不得查看 AI/Agent 预测、检索结果或其他标注员答案。
3. **物理隔离与职责**：Anchor 由独立标注员对抽样子集精细标注，存放在执行 Agent 无权读取且不在 Agent 可读仓库内的隔离位置，绝不提交到该仓库。Human Anchor 是一次性 POC 校准/审计成本，不进入每集 Ingest 或生产入库主链。Agent 与 Judge 推理进程均不得读取 Anchor/Gold 明文。AI Judge 必须独立于被测 Agent 的会话与预测者；Judge 只看待评媒体与结果，不看 Anchor 标签。Judge 输出锁定后，隔离的离线评估程序才可对齐人工标签并计算一致性。
4. **校准门槛与抽查**：在预注册的 Anchor 样本上先校准 AI Judge；一致性及置信区间达到预注册可信标准后，方可用于扩大自动评测。扩大后随机保留至少 10% 项目作持续人工抽查监测漂移。若 Judge 未达校准门槛，停止优化 Judge，该指标仅保留小规模人工评测，不扩大自动评估。

自动 Ingest 严格禁止读取：
- `EP18_REAL_SCENE_MAP`
- Topic A/B
- 旧 Requirements
- A5/A6/A7 Results
- Director Plan / Storyboard
- A8/A8.1 报告
- 人工剧情简介/百科/分集梗概
- 旧 dialogue_aligned_unit
- Benchmark Gold / Human Anchor 明文

第一轮 VLM 绝不告知剧名《潜伏》，避免模型产生先验剧情知识污染。

## Pipeline

Source Video  
→ Shot Detection  
→ Representative Frames  
→ OCR + ASR  
→ VLM Objective Observation  
→ Timeline Fusion  
→ Objective Evidence

### Shot
每个 Shot 必须包含：
- `shot_id`
- `start_sec`
- `end_sec`
- `duration_sec`

边界必须来自媒体分析算法（如 PySceneDetect / Adaptive），严禁手工填报剧情时间区间。

### Representative Frames
默认每 Shot 取 25% / 50% / 75% 真实代表帧，长镜头可自适应增加。所有视觉 Evidence 必须带 `frame_refs[]`。

### Dialogue 与 Speaker 归属
分别保留：
- `ocr_text`
- `asr_text`
- `resolved_text`
- `speaker_person_id`（说话人匿名 ID，无法确定时填 `unknown` 或 `null`，严禁无证据强行认定）
- `confidence`（置信度评分，0.0~1.0）
- `provenance`（识别来源标记）

VLM 不得凭空捏造对白。

### 人物
第一阶段只做匿名 ID：`person_001`, `person_002`。
先验证跨 Shot 人物一致性，再单独做姓名映射：`person_001 → 余则成`。
禁止将人物特征聚类与姓名语义推断混为一个指标。

## 标准 Evidence Contract

```json
{
  "series_id": "qianfu",
  "episode_id": "18",
  "media_id": "qianfu_ep18",
  "shot_id": "shot_0127",
  "timecode": {"start_sec": 0.0, "end_sec": 0.0},
  "visible_person_ids": [],
  "scene": {"location_type": "", "environment": ""},
  "observable_actions": [],
  "objects": [],
  "camera": {"shot_scale": "", "movement": ""},
  "dialogue": {
    "ocr_text": "",
    "asr_text": "",
    "resolved_text": "",
    "speaker_person_id": null,
    "speaker_confidence": null,
    "provenance": []
  },
  "frame_refs": [],
  "uncertainty": [],
  "confidence": {}
}
```

`speaker_person_id` 仅接受匿名人物 ID；`unknown` 表示已检测到说话人但无法归属，`null` 表示当前片段没有可判定说话人/未输出归属。`speaker_confidence` 是说话人归属的置信度（0–1）；归属为 `unknown` 或 `null` 时必须为 `null`。它不代表对白转写或整条 Evidence 的置信度。每项保留 `provenance` 与 `uncertainty`。

> **禁令**：Objective Evidence 禁止出现“开始怀疑 / 试探 / 看穿 / 掩护 / 忠诚 / 背叛 / 情报交易 / 化解危机 / 利益交换 / 心理状态”等解释性或叙事性词汇，除非为原字幕字面引用。无法判定的说话人明确标注 `unknown` 或 `null`，绝不可强行认定。

## 指标分母公式与边界规则 (Execution Definitions)

所有评测在执行前必须预注册绝对样本数、分层、分母公式、边界匹配规则、排除规则、失败/缺失样本计法、置信区间和阈值。以下指标阈值均为**待预注册**。若分母为 0、分层不足或 Anchor 覆盖不足，标注 `N/A` 并停止 Gate 判断，不得将缺失视为 0 或通过。二项比例用 95% Wilson 区间；按镜头/Query聚类的指标使用预注册随机种子和重采样次数计算 95% cluster bootstrap。仅当区间整体落在预注册通过侧时 PASS，整体在失败侧时 FAIL，区间跨门槛则为 inconclusive，不得宣称通过。调用失败保留在计划尝试分母并作为该次结构失败：

1. **Schema 结构合规率 (Schema Success Rate)**：
   $$\text{Rate}_{\text{schema}} = \frac{\text{严格符合 6 字段 Schema 且原生 Stream 验证通过的记录数}}{\text{预注册严格计划抽取的绝对分母总帧数}}$$
   （例如：X1.2 预注册 50 镜头 × 3 帧 = 150 帧，发生 503 或超时直接计入分母且算为失败，严禁剔除分母或擅自重试）。
2. **Shot boundary matching**：参考切点与预测切点在预注册容差内作一对一最小距离匹配；每个预测切点至多匹配一个 Gold 切点。TP 为匹配数，未匹配预测为 FP，未匹配 Gold 为 FN；Precision=TP/(TP+FP)、Recall=TP/(TP+FN)、F1=2PR/(P+R)。容差、起止边界处理和按 Shot 的可用率（合格 Shot/所有被抽 Shot）均须预注册。
3. **客观事实准确率与幻觉率**：每条claim标为 supported、contradicted、unsupported 或 unverifiable。分母为已由Anchor裁定的可核验claims（supported+contradicted+unsupported）；Accuracy=supported/该分母；Hallucination rate=(contradicted+unsupported)/该分母。unverifiable、Judge/Anchor尚未裁定项另报，不进分母。同步报告总claims、Anchor覆盖数和未裁定数；未审核内容不能记作无幻觉。
4. **人物一致性**：在独立标注的 same/different 人脸 pair 上，以预测 same 为正类计算 Precision、Recall、F1；unknown 预测另报。主分数按预注册规则处理 unknown（默认不从分母剔除），并报告覆盖率及 pair-disjoint/person-disjoint。分母为已标注 pair 数。
5. **OCR/ASR/Fusion**：与人工转录 Gold 对齐后，WER=词级编辑距离/Gold 词数，CER=字级编辑距离/Gold 字符数；OCR、ASR、Fusion 分别计算。对齐、标点/空白规范化、重叠语音和零长度 Gold 处理须预注册；参考字/词分母为 0 或无 Gold 时 N/A。
6. **Speaker attribution**：正确归属的已判定说话轮次/Anchor 中可归属说话轮次；unknown/null 覆盖率单独报告。置信度不能代替真值标签。
7. **单集成本与耗时**：成本=批次实际模型/计算/存储费用总和÷成功完成 Ingest 的集数；耗时=预注册起止点间墙钟时间总和÷成功完成 Ingest 的集数，并另报失败运行耗费。Episode 分母为 0 时 N/A；币种、缓存、重试和并发口径预注册。
8. **AI Judge 校准**：Judge 输出锁定后，由离线评估程序对齐 Anchor 标签；报告混淆矩阵、Cohen’s κ 与逐类召回率，分母为双方均有标签的 Anchor 项数。Judge 本身不读取 Anchor 明文。

## X1 历史门禁参考与新规范声明

> [!WARNING]
> **旧阈值口径说明**：下表中的历史数值（如 $\ge 90\%$, $\ge 0.85$ 等）仅作为**历史设计口径留存**。根据最新架构，**新门禁阈值必须与 Human Anchor 和 AI Judge 一致性校准后重新预注册，绝不可作为现行有效通过门槛**。

| 指标名称 | 历史设计口径 (旧门禁) | 现行状态与规则说明 |
|:---|---:|:---|
| Shot Boundary Usable Rate | ≥90% | 待与 Anchor 切分精度预注册新阈值 |
| Person Consistency F1 | ≥0.85 | 待脱离旧 0.4067 单一特征对，预注册新多镜头一致性阈值 |
| Scene/Environment Accuracy | ≥0.80 | 待与 Anchor 环境标签对齐 |
| Observable Action Acceptable Rate | ≥0.75 | 待经由 AI Judge 校准后评定 |
| Hallucinated Objective Fact Rate | ≤5% | 待基于全量审定陈述项核验 |

## Blind Holdout (历史设计，执行前重新预注册)

EP18 是 Development Episode。最终必须再选《潜伏》另一集 Blind Holdout。

锁定实现后：
- 不改代码
- 不改 Prompt
- 不加人物规则
- 不加剧情词典

Holdout 拆分、集数和域间比较指标须执行前预注册；旧“衰减≤15%”仅为历史建议，不是当前 Gate。

---

# X2｜单集 Semantic Retrieval Benchmark (原始时间区间主标注)

## 核心问题

> 面对系统事先不知道的新内容需求，能否从 X1 自动 Evidence 中找到真正支持需求的素材；不存在时能否可靠返回 INSUFFICIENT？

严禁使用旧 canonical evidence、EP18_REAL_SCENE_MAP、dialogue aligned units、旧 Topic A/B hard-code、旧 A5/A6 Results、旧人工 Requirements/Director Plan。

## 受控 X2 Downstream Probe 规则

依据最新验证规范，在 X1 首版 Evidence 产物生成后：
- **允许范围**：仅允许针对冻结的极小样本子集执行受控探针（Probe）；
- **目的限制**：仅用于获取下游检索支持率、拒答率等实测反馈，以反向修正 X1 的数据质量定义与字段规范；
- **红线约束**：Probe 必须单独预注册，**绝不可作为宣称 X1 或 X2 Gate 通过的依据，严禁私自扩样**。本次接管不执行任何 Probe。

## Query Set 与 Hard Negative 严格定义

旧“至少 50 条、五类各 10 条”仅为历史设计，不是现行有效门槛。样本量与分层须执行前预注册；本轮不增加样本。Query 作者不得看 Evidence、时间码或模型结果，使用匿名人物和可观察事件描述，不写作品专用规则。

1. **Explicit**：指定片中人物和可观察动作。
2. **Semantic**：描述可由画面/声音证据支持的互动，不预设剧情结论。
3. **Paraphrase / Abstract**：对同一证据目标作抽象改述。
4. **Hard Negative（严格困难负例）**：负例集合中至少一半必须是**“真实在场人物 + 实际不存在的事件/关系/行为”**。Query中人物确实在原片出现，但所指定事件经全片核验后不存在（如片中人物甲、乙都出现，却从未握手交接文件）。标注者必须全片核验；不能主要依赖全集不存在的人名或物体实现拒识。无法核验的Query不进入可判定分母并触发停止条件。
5. **OOD / Absurd**：域外查询单独报告，仅作补充评估，不能替代上述Hard Negative。

## Gold 标注规范：以原视频原始时间区间为唯一主标注

- **主标注原则**：X2 Gold 必须以**原视频的绝对时间区间 (`start_sec` - `end_sec`) 作为唯一主标注依据**；
- **关联定位**：算法生成的 Evidence 条目或 `shot_id` 仅作为检索命中的关联索引，不作为真值载体；
- **跨镜头事件**：允许真实语义事件跨越多个物理镜头；区间匹配判定边界及容差范围（如 $\pm 1.0\text{s}$）必须在实验前预注册承诺。

## 指标分母公式与边界规则

执行前须冻结查询数、正负例分层、区间匹配容差、95%置信区间方法、缺失计法和PASS/FAIL规则。每个Gold事件以原视频时间区间标注，允许跨Shot；预测/Evidence区间按Temporal IoU达到预注册门槛作一对一匹配，重叠区间和多Gold事件处理规则一并预注册。任一分母为0、分层不足或有效标签不足时为 `N/A`，不得算作0或通过。

1. **区间 Recall@K**：TopK按一对一匹配命中的Gold区间数 / 正例Query对应Gold区间总数；另报Query-level Recall@K（TopK至少命中一个Gold区间的正例Query数 / 正例Query数）。
2. **Precision@3**：Top3中匹配Gold的预测区间数 / (3 × 正例Query数)，空位按未命中计。
3. **MRR**：正例Query的首个匹配区间排名倒数之和 / 正例Query数；无匹配Query的倒数排名记0。
4. **INSUFFICIENT**：正例误拒率=错误返回INSUFFICIENT的正例Query数/正例Query数；负例误收率=未返回INSUFFICIENT的负例Query数/负例Query数；负例正确拒答率=正确返回INSUFFICIENT的负例Query数/负例Query数。Hard Negative与OOD分层报告。
5. **Hard Negative正确拒答率**：正确拒答数 / 已全片核验“人物在场但事件不存在”的可判定Query数。全部未拒答的这类负例亦计作错误。
6. **去人物名影响**：同一正例Query具名/匿名配对版本分别算区间Recall@K；变化率=(具名Recall−匿名Recall)/具名Recall，具名Recall为0时N/A。
7. **Evidence Support Rate**：已裁定为完全支持的返回区间数 / 已完成审核的返回区间数；未审核项单独报告，不算支持。

所有Gate阈值待预注册。

## X2 历史门禁参考声明

> [!WARNING]
> **旧阈值口径说明**：历史旧指标（Recall@20 $\ge 0.80$, Precision@3 $\ge 0.60$, MRR $\ge 0.65$, Hard Negative Precision $\ge 0.85$, 去人名衰减 $\le 20\%$ 等）仅为**历史探索口径存根**。新阶段有效阈值必须在下游探针反馈后与 AI Judge 联合预注册，不可作为现行有效通过门槛。

每次评测必须输出详细的失败根因分类 (Failure Taxonomy)：人名依赖、关键词依赖、抽象语义失败、动作理解失败、场景理解失败、跨镜头事件失败、因果过度推断、INSUFFICIENT 判定失败。

---

# X2.5｜Persona/Plan Blind Test (三权分立盲测)

## 核心问题

> 给定具体 Persona 设定与新选题，系统能否在不依赖人工模板的前提下，由大模型自主生成结构合法、逻辑自洽且证据真实受控的 Downstream Plan？

## 规则机制：三权分立原则

为彻底杜绝旧 A6/A7“人工手写 Plan 原样写回”与“答案泄漏”弊端，X2.5 实行严格的三权分立盲测：
1. **作者 (Author)**：独立负责编写 Persona 设定、Topic 选题意图与内容边界约束；不得接触底层 Evidence 索引或 Gold 时间码。
2. **运行者 (Operator / System)**：负责执行自动 Ingest、检索以及 Director 生成 Pipeline；不得人工干预或后处理修改生成的 Plan。
3. **标注者 / 评审者 (Evaluator / Judge)**：负责针对生成的 Plan 进行盲审，核验 Beats 引用是否真实存在于 L1、台词与镜头是否严格对应；不得参与 Prompt 或 Plan 的编写。

**严禁任何形式的人工预写 Plan 注入系统伪充 AI 生成。**

## X2.5 评测指标与分母公式

1. **Plan Schema有效率**：Schema有效Plan数 / 全部预注册Plan尝试数，调用失败保留在分母。
2. **Plan约束有效率**：满足时间预算和确定性规则的Plan数 / 全部尝试数；逻辑连贯性另报Judge已裁定有效Plan数 / 有Anchor裁定的Plan数。
3. **Beat证据支持率**：Anchor裁定“Evidence存在且支持该Beat claim”的数量 / 已裁定Beat claim总数；缺证据、矛盾、无法裁定分别报告。
4. **Persona条件满足率**：满足预注册Persona约束的已裁定Plan数 / 有Anchor裁定的Plan数；约束项级分子、分母也须报告。
5. 样本数、分层、排除规则与阈值须在执行前预注册；分母为0或Anchor标签覆盖不足时N/A。


## X2.5 样本与 Persona 盲法

- 最低设计为 **2 个 Persona × 5 个 Topic**。Plan生成时系统收到不带目标标签的匿名Persona卡以实现条件化，卡片与真实Persona的映射由隔离协调者保管；独立评审不看系统使用的Persona卡或目标标签，盲看生成结果并从随机化候选Persona卡中判断归属，同时评Evidence是否支持观点、有无事实错误。
- Persona/Topic作者、执行Agent、Anchor标注者与评审者职责分离；评审者不参与Persona/Topic/Prompt/Plan编写。Anchor标注者直接看原始媒体，不看模型预测。
- Persona归属准确率=正确盲判Plan数/已裁定Plan数；另报各Persona召回率和95%置信区间。事实错误率=Anchor判为contradicted或unsupported的claims数/所有已裁定claims数；Evidence支持率=supported claims数/已裁定claims数。未裁定项单独报告，不视为正确。
- X2.5验证Persona差异和Plan/Director质量，并为Topic-first vs Source-first设计提供证据；后续比较需另行预注册与授权。


---

# 科学评测纪律：时间盒与 Kill Criteria (阻断停止条件)

## 严格时间盒管理 (Timeboxes)

为防止项目陷入无休止的模型调参或调试死循环，所有阶段设置严格的工作日时间盒：
- **Human Anchor 准备与 AI Judge 校准**：$\le 5$ 工作日；
- **切分 / Schema / 重试修复**：$\le 3$ 工作日；
- **受控 X2 Downstream Probe**：$\le 3$ 工作日；
- **X2 主评测**：$\le 5$ 工作日；
- **X2.5 Persona/Plan 盲测**：$\le 5$ 工作日。

> **超时复审机制**：若某阶段在时间盒内未完成，**仅允许进行一次书面范围与时间复审**；严禁擅自自动扩充样本量或随意更换模型继续拖延。

## 硬性停止条件 (Kill Criteria - 触发即停机)

发生以下任一情况，当前实验必须**立即中止停机并报告阻塞**：
1. **Judge 一致性失衡**：独立 AI Judge 与 Human Anchor 的一致性评分（Kappa 或 Balanced Acc）低于预注册阈值，无法形成可靠裁决；
2. **数据泄漏与哈希漂移**：发现 Gold / Anchor 明文暴露给模型，或预注册的代码、Prompt、数据 SHA256 发生非授权漂移；
3. **负例不可核验**：Hard Negative 的“全片不存在性”无法获得标注员真实核验；
4. **复现失败**：推理记录的 Schema 或 Stream Provenance 溯源不可复现；
5. **分母不足或失衡**：评估样本分母未达预注册绝对值，或抽样分层严重失衡；
6. **核心能力失效**：核心指标未达预注册 Gate，或 X2 probe 证实生成的 Objective Evidence 对下游完全无效。

### 未达目标后的停止与降级路径

触发 Kill Criteria 后停止该阶段及其扩展，不进入 X1.3，不通过反复换模型或调参追逐分数。后续 Review 可选择 **OCR+ASR 为主、视觉为辅**、**人工辅助入库**（须重新定义人工边界和单集成本）或**停止该技术路线**。人工辅助只作为另行授权的降级产品方案；Human Anchor 不成为每集常规入库步骤。

---

# 防作弊与预注册承诺 (Pre-registration & Hash Commitment)

## 每批冻结前预注册与 SHA256 承诺

在任何批次运行前，必须书面预注册并固化以下各项的 SHA256 哈希值：
1. **源代码**：推理、评估与指标统计脚本的绝对文件哈希；
2. **Prompts**：System Prompt 与 User Prompt 文本模板的绝对哈希；
3. **模型配置**：官方确切模型名称、版本、运行参数与供应商配置（如 `gemini-3.1-pro-low:effort=low`）；
4. **评测程序**：核验脚本与 Judge 逻辑的绝对哈希；
5. **样本清单**：抽样 Manifest 的绝对哈希；
6. **Gold / Anchor 承诺**：真值文件的 SHA256 承诺哈希（明文加密隔离存储）。

> **漂移处置**：Run 完成后核验哈希，若发现任何一项与预注册承诺不符，**本次运行一律作废，直接判定为全新未批准实验**。Agent 与 Judge 在任何情况下不得读取 Gold / Anchor 明文。

揭晓 Holdout / Gold 后，不得针对结果修改代码、Prompt、模型或阈值并宣称同轮 PASS。任何修改均是新实验，须重新预注册、生成新哈希并使用未揭晓的新盲测集；已揭晓集只可用于开发诊断。

## 严格禁止行为

- 测试失败后添加特定人名、专有词或剧情关键词；
- 添加特定剧情词典或 `scene_id`；
- 手工补写正确时间码或手写 `dialogue unit`；
- 针对失败案例追加 Grounding 黑名单；
- 根据 Holdout / Gold 结果反向微调或拟合代码。

---

# X3/X4｜最终多集方向

只有 X1、X2、X2.5 均按预注册 Gold Gate 通过且经后续 Review 明确授权后，才可解锁 X3/X4：

## X3 多集统一 Evidence Store

至少加入 EP17/18/19/20，完全复用同一 Ingest。

新增 Episode 必须是：
`add video → ingest → index`

而不是：
`add video → 改代码`

建立：
`episode_person_id → series_person_id → optional character name`

## X4 跨集 Retrieval + 多集混剪

新 Topic 在整个 series scope 中召回多个 Episode 的 Evidence，再由 Director 形成 Hook / Evidence / Turn / Conclusion，最终由 VMV 混剪成一条真实视频。

最终验收：

> 新增一集零改代码完成入库；新增十集仍只是入库；面对从未见过的新选题，系统可自动跨集取材、组织结构并生成多集混剪视频。

---

# 推荐未来简化架构

单集验证阶段优先：

```
INGEST
  ↓
PLAN
  ↓
RENDER
```

Plan 可先让强模型读取 Persona + Topic + 单集 L1，结构化输出 Beats / selected unit_id / evidence quote / narration / audio ownership / INSUFFICIENT。

程序只做确定性校验：
- unit 存在
- timecode 合法
- 引用文本真实存在
- Evidence 属于正确 episode

素材规模扩到几十/几百集后，再正式引入 embedding retrieval / rerank / perspective reread。

---

# 本地 Codex 接管后的第一任务 (2026-10-07 最新状态)

1. **确立规范基准**：确认本文件最新规范已全面生效，supersede 旧指标定义与旧单向冻结条款；X1.2 维持 Engineering PASS / Scientific Pending；
2. **遵守实验暂停**：当前状态为 `human_anchor_labeling_in_progress; experiments_paused`，已冻结 30-shot Manifest、通用 Schema、标注规范及 Calibration preregistration；**不运行新模型/AI Judge、不新增样本、Agent 不代标或读取人工答案、不生成 Evidence、不执行 X2 probe、不进入 X1.3/X2/X2.5**；
3. 用户已开始标注；Agent 仅修正页面，不读取人工答案。仍由未看过 AI 输出的标注员独立标注；标注后先登记答案 SHA256 commitment，再由独立 Judge 按冻结规则校准。该校准是一次性 POC 成本，不进入生产 Ingest。
4. 当前仅按用户反馈修正盲标页与相应说明；非评分 UI 勘误须保留原冻结哈希，不能冒充标注前的新冻结。随后 STOP；Agent 不运行模型、Judge、代标、读取人工答案、新 Evidence、新样本或下游实验。

---



## Human Anchor Development Calibration 准备（2026-10-07）

Human Anchor 校准自动素材理解系统，不协助任何单集素材 Ingest。Schema 与项目/剧集/人物/剧情无关。30 个原 Shot Manifest 不变；只标边界、人物数量分类、20 组同一/不同/不确定人物帧对、场景/动作/物体分类、语音状态与 Speaker 来源/可选点击位置，不维护 P01/P02、不逐字转写。CER/ASR、speaker_person_id/confidence Anchor 真值从本轮校准指标中移除，保持 Pending。30 分钟仅是维护者控制页面操作复杂度的设计目标；页面不显示倒计时、不记录逐项或全程耗时，也不设置时间锁定。标注者按自己的节奏完成，并在全部必需项完成后点击“提交标注”；页面以口令加密自动保存。Speaker 来源只在“可辨语音”时必选；无可辨说话则不适用，语音不确定则未评估，两者均跳过 Speaker、不填充或删除旧答案。完成率必填条件的适用性勘误已在预注册留档，固定分母和 Speaker 评分资格不变。Speaker 位置仅为可选溯源，模糊可留空；已点选时可主动清除当前位置且保留其他答案，撤销 UI 勘误留档；画外音/不确定不显示点图区；位置 UI 勘误和 Speaker 条件适用性勘误均发生在用户开始标注后，原冻结哈希留档；不得升级 Scientific 状态。页面解锁提供分步状态/超时提示；原口令不可用时，可新建独立空白记录并保留旧密文，不覆盖或导入旧答案。未来第二集、第三集及以后必须自动 Ingest；Anchor 是一次性 POC 系统校准成本。

- **样本**：只从现有 X1.2 50-shot Manifest 按 early/mid/late 分层、固定种子 20261007 各取 10 个，共 30 个；冻结清单见 `docs/agent-poc/human-anchor-calibration/manifest.json`，不增加样本。
- **盲标页**：仓库外 `/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/human-anchor-calibration/annotation.html` 仅展示原始片段/帧/原声及通用字段，不展示任何 AI/Judge/Codex 预测。标注员直接观察并独立完成；页面答案仅以人工自设口令加密密文保存在浏览器 IndexedDB，支持导出加密备份，存放于仓库外，答案明文不得被 Agent/Judge 读取或提交。
- **盲法前提**：标注员须声明未看过这些 Shot 的 Evidence/AI/Codex Review。已看过预测者不能通过页面隐藏恢复盲法；若无法找到未暴露的标注员，校准须记为 INCONCLUSIVE。
- **冻结**：同目录 `schema.json`、`annotation-guidelines.md`、`preregistration.md`、`hash-commitment.json` 冻结 Schema、分层 Manifest、固定人物 Pair、页面/协议哈希、公式/分母、unknown/missing/failed、非计时的页面操作复杂度设计目标、阈值、CI 和 PASS/FAIL/INCONCLUSIVE。答案 SHA256 必须在标注完成后、任何 Judge/评估器读取前计算登记；目前为空值是待办，不代表答案已存在。
- **当前状态**：用户人工标注进行中、尚未完成；Agent 未读取答案、未运行 Judge、未生成 Evidence、未进行 X2 Probe、未进入 X1.3/X2/X2.5。X1.2 仍为 Engineering PASS / Scientific Pending。

### 校准后的泛化验证顺序

Development Calibration 完成并冻结代码、Prompt、模型配置及评测规则后，先运行 Same-title Blind Holdout（例如 EP19）全自动 Ingest；不得重做 Anchor，不得针对该集修改 Prompt/代码或添加人物/剧情规则。自动 Ingest 完成后才可少量事后人工抽检，抽检不得参与入库。若 Holdout 必须人工修正才能正常 Evidence 入库，X1 FAIL。之后以同一冻结系统运行另一部真人剧 Cross-title Holdout，仅事后小规模抽检。动画、综艺、纪录片等 Domain Shift 另做 Domain Qualification；不要求每部新素材重复 Anchor。

## 当前正式状态 (2026-10-07)

> **X1.2 为 Engineering PASS / Scientific Pending：自动推理与 Codex AI 逐镜头复核已完成；Human Anchor 盲标、Judge 校准及正式 Gold Gate 尚未完成；新增模型实验、新增样本和 X1.3 暂停，不进入正式 X2，X2 probe 与 X2.5 本次不执行；当前状态为 `human_anchor_labeling_in_progress; experiments_paused`。**

最高成功标准：

> **系统面对自己从未见过的新影视素材和新内容需求，仍能可靠理解素材、找到正确证据、找不到时坚决拒绝，并最终在多集素材库中自动取材和混剪成真实视频。**
