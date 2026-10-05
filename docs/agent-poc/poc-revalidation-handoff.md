# 数智博主 AI 视频 POC｜重新验证开发交接文档

**日期：** 2026-10-05  
**用途：** 本地 Codex Work 接管项目并协调 AGY 后续开发  
**当前策略：** 冻结原 A8/A9/A10，先完成 X0/X1/X2 核心技术验证  
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

### 冻结
X1/X2 通过前：
- A8 冻结。
- A9/A10 禁止开始。
- 不继续修旧 A5 关键词表。
- 不继续给 A6 增加剧情规则。
- 不继续给 Grounding Gate 增加事故黑名单。
- 不针对 Topic A/B 手写素材答案。
- 不生成新的正式验收 MP4。

旧 A5/A6/A7 仅作为 legacy baseline。

## 5. 新验证路线

```
X0 技术选型与复用 Spike
        ↓ 人审
X1 L1 自动素材理解 Benchmark
        ↓ Blind Gate PASS
X2 单集 Semantic Retrieval Benchmark
        ↓ Blind Gate PASS
X3 多集统一 Evidence Store / 跨集人物统一
        ↓
X4 跨集 Retrieval + Director + 多集混剪
        ↓
恢复 Persona / Production / MCN E2E
```

成功标准不是“测试全绿”，而是面对未知素材和未知内容需求仍能泛化。

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

# X1｜L1 自动素材理解 Benchmark

## 核心问题

> 在不知道剧情答案的情况下，一集影视素材能否自动生成可靠、可追溯、可复用的 Objective Evidence？

X1 不生成成片。

## 严格隔离

自动 Ingest 禁止读取：
- `EP18_REAL_SCENE_MAP`
- Topic A/B
- 旧 Requirements
- A5/A6/A7 Results
- Director Plan
- Storyboard
- A8/A8.1 报告
- 人工剧情简介/百科
- 旧 dialogue_aligned_unit
- Benchmark Gold

第一轮 VLM 最好不告诉模型剧名《潜伏》，避免模型先验剧情知识污染。

## Pipeline

Source Video  
→ Shot Detection  
→ Representative Frames  
→ OCR + ASR  
→ VLM Objective Observation  
→ Timeline Fusion  
→ Objective Evidence

### Shot
每个 Shot 至少：
- shot_id
- start_sec
- end_sec
- duration_sec

边界必须来自媒体分析，不允许人工剧情时间区间。

### Representative Frames
默认每 Shot 25% / 50% / 75% 抽真实 JPG；长镜头可增加。所有视觉 Evidence 必须带 `frame_refs[]`。

### Dialogue
分别保留：
- OCR text
- ASR text
- resolved/fused text
- provenance

VLM 不得凭空生成台词。

### 人物
第一阶段只做匿名 ID：
`person_001`, `person_002`。

先验证跨 Shot 人物一致性，再单独做姓名映射：
`person_001 → 余则成`。

不要把人物聚类与姓名识别混成一个指标。

## 建议 Evidence Contract

```json
{
  "series_id": "qianfu",
  "episode_id": "18",
  "media_id": "qianfu_ep18",
  "shot_id": "shot_0127",
  "timecode": {"start_sec": 0, "end_sec": 0},
  "visible_person_ids": [],
  "scene": {"location_type": "", "environment": ""},
  "observable_actions": [],
  "objects": [],
  "camera": {"shot_scale": "", "movement": ""},
  "dialogue": {
    "ocr_text": "",
    "asr_text": "",
    "resolved_text": "",
    "source": []
  },
  "frame_refs": [],
  "uncertainty": [],
  "confidence": {}
}
```

Objective Evidence 禁止写：
“开始怀疑 / 试探 / 看穿 / 掩护 / 忠诚 / 背叛 / 情报交易 / 化解危机 / 利益交换 / 心理状态”等解释性结论，除非只是原台词引用。

## Gold Set

EP18 随机分层抽至少 50 个 Shot：
- 前/中/后
- 有/无对白
- 单人/多人
- 室内/室外

人工直接看真实视频/帧/音频制作 Gold。

目录：
```
benchmarks/x1/
  development/
  holdout/
  gold/
  predictions/
  runs/
  reports/
```

生产代码禁止 import/read `benchmarks/x1/gold`。

## X1 Gate

| Metric | Gate |
|---|---:|
| Shot Boundary Usable Rate | ≥90% |
| Person Consistency F1 | ≥0.85 |
| Scene/Environment Accuracy | ≥0.80 |
| Observable Action Acceptable Rate | ≥0.75 |
| Hallucinated Objective Fact Rate | ≤5% |

Dialogue 单独报告 OCR / ASR / Fusion 的 WER/CER。

## Blind Holdout

EP18 是 Development Episode。最终必须再选《潜伏》另一集 Blind Holdout。

锁定实现后：
- 不改代码
- 不改 Prompt
- 不加人物规则
- 不加剧情词典

直接跑 Holdout。核心指标相对 EP18 衰减建议 ≤15%，否则 X1 FAIL。

---

# X2｜单集 Semantic Retrieval Benchmark

只有 X1 PASS 后开始。

## 核心问题

> 面对系统事先不知道的新内容需求，能否从 X1 自动 Evidence 中找到真正支持需求的素材；不存在时能否可靠返回 INSUFFICIENT？

严禁使用旧 canonical evidence、EP18_REAL_SCENE_MAP、dialogue aligned units、旧 Topic A/B hard-code、旧 A5/A6 Results、旧人工 Requirements/Director Plan。

## Query Set

至少 50 条，五类各 10：

1. Explicit  
   例：找余则成和谢若林正面交锋的片段。
2. Semantic  
   例：找上司表面给下属好处、同时观察对方反应的场面。
3. Paraphrase / Abstract  
   例：找权力人物通过利益绑定下属的镜头。
4. Hard Negative  
   例：找余则成在火车站击毙李涯。不存在则必须 INSUFFICIENT。
5. OOD / Absurd  
   例：找橘猫在屋顶追鸽子。必须 INSUFFICIENT。

部分真实 Query 生成：
Original → Paraphrase → No-person-name → Abstract intent。

## Blind Rule

Query Author 不得读取：
- L1
- 时间码
- Retrieval Result
- Gold Interval
- 旧 Requirements

避免“先知道台词再让系统找台词”。

## Gold

独立 Reviewer 标：
- strongly_relevant
- relevant
- weak
- irrelevant
- not_present
- gold_intervals

Gold 与 Retrieval 完全隔离。

## Baseline A｜Whole-L1 LLM

单集阶段把 Query + 完整 EP18 L1 一次交给强模型，输出：
- Top5 unit_id
- evidence quote
- reason
- confidence
- 或 INSUFFICIENT

这是单集上限 baseline，不是最终多集架构。

## Baseline B｜Embedding / Multimodal Retrieval

Query embedding  
→ Evidence embedding  
→ Top20  
→ rerank  
→ Top3

最终多集会需要这一类架构，但先用 Benchmark 决定是否值得复杂化。

## X2 Gate

| Metric | Gate |
|---|---:|
| Recall@20 | ≥0.80 |
| Precision@3 | ≥0.60 |
| MRR | ≥0.65 |
| Hard Negative Precision | ≥0.85 |
| Hard Negative Recall | ≥0.80 |
| 去人物名 Recall 相对下降 | ≤20% |
| Top3 Evidence Support Rate | ≥70% |

每次必须保存 Failure Taxonomy：
- 人物名依赖
- 关键词依赖
- 抽象语义失败
- 动作理解失败
- 场景理解失败
- 跨镜头事件失败
- 因果关系过推断
- INSUFFICIENT 失败

不能只汇报一个总通过率。

---

# 防作弊 / 防过拟合规则

严格禁止：
- 测试失败后加人物关键词。
- 加剧情词典。
- 加特定 scene_id。
- 手工补正确时间码。
- 手工写 dialogue unit。
- 针对失败案例加 Grounding 黑名单。
- AGY/Codex 根据 Holdout Gold 自动修代码。

Development failures 可以用于改通用算法；Holdout 在锁定版本前只应暴露 aggregate metrics。

Engineering Tests ≠ Scientific Benchmark ≠ Human Acceptance。

AGY 不得自行宣布实验通过；PASS/FAIL 只由预先定义的指标 + 独立 Gold + Blind Benchmark 决定。

---

# X3/X4｜最终多集方向

X1 + X2 PASS 后：

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

# 本地 Codex 接管后的第一任务

1. 先读本文件与 `docs/agent-poc/poc-independent-audit.md`。
2. 检查当前 Git 状态和源码，确认审计问题仍成立。
3. 不恢复 A8/A9，不修改旧 A5/A6/A7。
4. 给 AGY 下发 X0 技术 Spike。
5. X0 完成后 STOP，等待人工 Review。

## X0 执行摘要

目标：围绕最终“多集素材一次入库 → 跨集检索 → 多集混剪”，为 X1 单集自动理解选择技术路线。

必须实际检查并尽可能运行：
- zenstory-ai/video-recap-skills / video-understanding
- PySceneDetect
- Marlin video understanding/caption/find
- 当前 VMV Stage1
- 必要时其他高质量 GitHub video-understanding Skill

使用 EP18 短片段做真实 Spike；检查源码和 License，不得只读 README。

禁止：
- 使用 EP18_REAL_SCENE_MAP
- 使用 Topic A/B
- 使用旧 Requirement/A5/A6/A7/Storyboard
- 写任何《潜伏》人物/剧情 hard-code
- 修改主生产链
- 进入 X1
- 生成新正式 MP4
- 进入 A9

唯一正式交付：
`docs/agent-poc/x0-technology-spike.md`

完成：
- 更新 PROGRESS.md
- 状态 = `X0 awaiting_review`
- commit
- 报告 commit SHA
- STOP

---

## 当前正式状态

> **旧 POC 已证明渲染和部分工程链路可运行，但核心 AI 能力尚未得到有效验证；项目进入 X0/X1/X2 独立技术验证阶段。**

最高成功标准：

> **系统面对自己从未见过的新影视素材和新内容需求，仍能可靠理解素材、找到正确证据、找不到时拒绝，并最终在多集素材库中自动取材和混剪成真实视频。**
