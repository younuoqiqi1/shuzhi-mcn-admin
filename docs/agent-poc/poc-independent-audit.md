# 数智博主 AI 视频 POC：独立技术审计报告

**审计对象**
- `shuzhi-mcn-admin` @ `agent-poc/a1-contracts` = `a1ce864`（工作区干净）
- `video-moment-validation` @ `feat/local-task-runner` = `b33feb8`

**审计方法**：README、PROGRESS 和报告一律不作为依据。依据只有：源码、数据文件、`git log -S` 的变更追溯、我自己写的对抗实验脚本（[adversarial_probe.mjs](file:///Users/yoyotaozhou/.gemini/antigravity/brain/1ac04a63-f557-41f3-975b-803141e3e5fd/scratch/adversarial_probe.mjs)，只读调用项目里的真实 A5/A6 代码），以及对已提交 MP4 的抽帧。

---

## 0. 一句话结论

> **这个 POC 证明了“按结构化剪辑单渲染 MP4”这条工程管线能跑通；但它还没有验证任何一个核心 AI 假设。** 从 L1 Evidence、A5 检索、A6 视角重读到 A7 导演，每一层的“智能”都是人工预先知道答案后写进代码或数据里的。整条链路调用 LLM / VLM / Embedding 的次数是 **0**。

---

## 1. 关键证据（按严重程度排序）

### 🔴 F1. L1“客观 Evidence”不是从素材理解来的，而是手写的剧情时间表加取模生成

[build_canonical_evidence.mjs](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/evidence/scripts/build_canonical_evidence.mjs#L14-L85)：
- `EP18_REAL_SCENE_MAP` 是人工写的 14 段时间区间，每段对应固定的人物和场景。全集 374 个检索单元的 `characters` / `scene_env` 都直接由所在时间段决定，没有任何视觉识别。
- `shot_type = shotTypes[i % 5]`（[L265-266](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/evidence/scripts/build_canonical_evidence.mjs#L265-L266)）：景别按序号**取模轮换**，属于捏造。
- `isIndependent = durSec >= 3.5 || (i % 3 === 0)`：“独立关键帧/继承帧”这个 provenance 和置信度也是按序号取模得出的。
- `physical_actions`：374 个单元里只有 **21 种不同取值**，其中 124 个是 `observable_action_unverified`，其余基本是“X与Y在Z对话交谈”这类模板句。
- **A5/A6 通过“Top3 Gate”时用的历史版本**（`6849dcb`）里，动作是这样分配的：`actionIndex = (i + floor(midSec/100)) % actions_pool.length`，从手写剧情池里**取模**挑一句，例如“余则成将微缩胶卷藏入钢笔套筒”“余则成提着皮箱护送晚秋登上绿皮列车”。这些情节后来被证实在第 18 集中并不存在。

**结论**：A5/A6 宣称的“通过”是建立在捏造的 L1 上的。之后 A6.2 和 A8.1 两次重写 Evidence，都发生在质量问题暴露**之后**，属于事后修补。

### 🔴 F2. 先知道答案，再反向往 Evidence 里注入数据（答案泄露）

A8.1（`a1ce864`）在 L1 中手工加入了 4 个 `dialogue_aligned_unit`（[L413-530](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/evidence/scripts/build_canonical_evidence.mjs#L413-L530)），置信度都写成 `0.99`，动作描述也是手写的，例如“吴站长满面堆笑亲切拍打余则成肩膀”。

| 注入单元 | 对应的 Requirement 原文 | 最终是否进入成片 |
|---|---|---|
| `unit_dial_promotion_01` | req_wu_01 | ✅ seg_wu_01 |
| `unit_dial_vice_director_01` | req_wu_02「副站长」 | ✅ seg_wu_02 |
| `unit_dial_celebration_01` | req_wu_04「拍余则成肩膀…同甘共苦」 | ✅ seg_wu_04 |
| `unit_dial_gold_bars_01` | req_probe_03「两根金条」 | ✅ seg_probe_02 |

**4 个手工单元全部被成片用上**，Topic A 的 3 个镜头 100% 来自手工注入。这不是检索找到了答案，而是答案被直接放进了素材库。

### 🔴 F3. A5 的“语义匹配”是《潜伏》专用关键词表

- [semantic-matcher.mjs](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/retrieval/matchers/semantic-matcher.mjs#L40-L66)：所谓“概念向量”是 5 组关键词的命中次数，词表里直接写着“晚秋”“翠平”“站长”“南京”“金条”“火车站”。代码自己标注了 `is_fallback: true`，但下游所有报告都把它称作 semantic。
- [lexical-matcher.mjs](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/retrieval/matchers/lexical-matcher.mjs#L27-L35)：分词词典里写死了“吴敬中、余则成、谢若林……东来顺、涮羊肉”。
- 权重组成：结构化 0.30（人物 0.65 + 场景 0.25）+ 词法 0.30 + 关键词“语义” 0.25 + L2 0.15。**实际的召回逻辑是：先用人物名定位到手写时间段，再按 OCR 字幕的关键词重合度排序。**
- `retrieveForRequirement` **没有任何阈值**，永远返回 20 条结果。
- Requirement fixture（[topic_a](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/retrieval/fixtures/topic_a_suspicion.json)、[topic_b](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/retrieval/fixtures/topic_b_dangerous_probe.json)）是人工写的，`evidence_grounding_criteria` 里直接嵌入了剧中台词，如“陈秋平”“两根金条”“同甘共苦”“涮羊肉”。写需求的人显然事先看过素材。

### 🔴 F4. A5/A6 对抗实验（我在项目真实代码上跑的结果）

| 实验 | 输入 | A6 判定 | Top3 实际内容 |
|---|---|---|---|
| E0 原始 req_wu_04 | 含人名和台词关键词 | SUFFICIENT | 正确（因为命中了注入的“同甘共苦”单元） |
| E1 同义改写（保留人名） | “上司在提拔场合表面道贺实则拉拢” | SUFFICIENT | 基本正确 ← **靠人名和“办公室”定位到时间段** |
| E2 **去掉人名，只描述叙事意图** | “掌权者用好处拉拢手下” | SUFFICIENT | Top1 在 A5 中排第 15，标记为 atmosphere；与 E4 无法区分 |
| E3 **不存在的事件 + 人名** | “余则成在站台击毙李涯” | INSUFFICIENT ✅ | 拒绝成功，但仅仅因为李涯在 L1 中出现 0 次 |
| E4 **荒谬需求** | “橘猫在屋顶追鸽子” | **SUFFICIENT，gate_pass=true** ❌ | 吴敬中办公室；A5 Top1 得分 0.466，**和原始需求的 0.508 几乎一样** |
| E5 原 req_probe_04（火车站送晚秋） | 剧中不存在此事件 | **SUFFICIENT** ❌ | 余家客厅里翠平谈手枪；L3 却写着“火车站台的蒸汽与风衣…” |

**结论**：
- 换种说法但语义不变：只有保留人名时才能工作。
- 加入素材中不存在的事件：只有当某个人名在 L1 中不存在时才会拒绝；如果是“存在的人物 + 不存在的事件”或纯语义描述，**系统不会拒绝**。
- 去掉人名，只描述叙事意图：基本没有召回能力，得分和荒谬输入分不开。
- 项目自己的 INSUFFICIENT 单元测试（[perspective-rereading.test.mjs L148](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/tests/perspective-rereading.test.mjs#L148-L180)）用的是一个手写 fixture：人物为“卫兵”、得分 0.1，没有经过真实 A5。这是为当前实现量身写的测试。

### 🔴 F5. A6 Perspective Re-reading 是按 topic_id 分支的手写段落

[perspective-provider.mjs L289-348](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/perspective/providers/perspective-provider.mjs#L289-L348)：
```js
const isWuTopic = topicId.includes("wu");
const isProbeTopic = topicId.includes("probe");
if (isWuTopic) { if (dialogue.includes("副站长")) return "老周视角：这一幕是全剧职场试探的经典范本……"; ...
```
- 解读文本是**整段预写好的**，按人名和台词关键词挑选。
- Persona 的作用仅仅是把 `persona_name` 拼进 `selection_reason` 里。
- 实验 P：把 Persona 换成“职场心理研究所”后，**Top20 排序完全相同，20 条解读逐字相同，开头仍然是“老周视角：”**。
- 实验 T：只把 topic_id 改名（去掉 `wu`），解读立刻退化成通用兜底句。
- [validatePerspectiveConsistency](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/perspective/providers/perspective-provider.mjs#L61-L70) 里的人物别名表也写死了《潜伏》角色。

### 🔴 F6. A7 Director 没有在做决策，计划 JSON 是人工写好的

- `buildDirectorPlanTopicA/B()` 的实现只是读取 `results/director_plan_topic_*.json` 再做校验。[run_a7_director_generation.mjs](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/scripts/run_a7_director_generation.mjs#L27-L35) 把读出来的内容**原样写回同一个文件**，形成循环。
- 回溯到最初版本 `6a2ef5f`：candidate_id、旁白全文、音频归属都以字面量写在代码里，旁边还有 `// Top1`、`// Top2` 这样的注释。
- **Topic B 违反了 A6 Top3 约束**：seg_probe_02、03、04 选用的 candidate **都不在**对应 requirement 的 A6 Top3 里。seg_probe_04 还把 req_probe_04 的候选挂到了 req_probe_03 名下。`validatePlan()` 不检查 Top3 归属（只有 `createSegment()` 会检查），而现在的 plan 根本不经过 `createSegment()`。
- req_probe_04 被 A6 判为 SUFFICIENT，实际是误判；Director 随后**悄悄去掉了这一段**，没有留下 INSUFFICIENT 记录。
- [production-grounding-gate.mjs](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/production-grounding-gate.mjs#L84-L149) 所谓的“五维门禁”，实际是针对已知事故写死的规则（`scene_0059`、`scene_0139`、`scene_0147`、2350–2530s、“副站长就是你”、“金条”）；不在这些规则里的情况一律判为 `Level 5`。[director-evidence-validator](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/director/director-evidence-validator.mjs#L215-L222) 的禁止断言列表也是写死的。

### 🔴 F7. 后台“自动生产”是二选一的路由

- 前端 [app.js L25391](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/app.js#L25391)：标题包含“怀疑”就走 A，否则一律走 B。请求失败时，**3 秒后静默调用 `finishJob`，界面显示为成功**。
- 后端 [mcn-backend-api.mjs L134](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/server/mcn-backend-api.mjs#L129-L158)：`topicId.includes("wu_suspicion")` 时读 A 的预制 plan，**其他任何选题都会生成 Topic B 的视频**。
- 值得肯定的部分：`spawn python -m vmv render` 是真实渲染，进度来自 `[VMV_PROGRESS]` 的真实解析。**渲染这一步是真的，但上游内容全部是静态的。**
- PROGRESS 中“第二条零改代码复跑成功”的说法，本质是读取了另一个预写的文件。
- A4 的 `OperationsOrchestrator` 没有被 A5 或任何脚本调用。Persona → Topic → Viewpoint → Beats → Requirements 这段**实际上没有接进链路**。

### 🔴 F8. 当前仓库里提交的 MP4 含伪造台词字幕，而且和当前 plan 不一致

- MP4 渲染时间是 13:53，**早于** VMV `b33feb8`（15:25“remove hardcoded fake subtitles”）。A8.1 之后**没有重新渲染**。
- manifest 中各段时长（A：16.72/6/16.72，B 有 evacuation 段）与当前 plan（A：13.72/9.04/14）不一致。

![Topic B 14s：伪造字幕“两根金条放在这，你能告诉我哪一根是高尚的…”叠在原片硬字幕上方](/Users/yoyotaozhou/.gemini/antigravity/brain/1ac04a63-f557-41f3-975b-803141e3e5fd/scratch/frame_b_14.jpg)

![Topic A 20s：伪造字幕“吴敬中：没人信大义…”，画面里实际是戴眼镜的余则成](/Users/yoyotaozhou/.gemini/antigravity/brain/1ac04a63-f557-41f3-975b-803141e3e5fd/scratch/frame_a_20.jpg)

![Topic B 35s：旁白说“暗夜撤离”，画面是白天田野里微笑的晚秋](/Users/yoyotaozhou/.gemini/antigravity/brain/1ac04a63-f557-41f3-975b-803141e3e5fd/scratch/frame_b_35.jpg)

### 🟠 F9. 自评结果被当作门禁通过

- [a6_human_gate_review.json](file:///Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin/src/perspective/results/a6_human_gate_review.json)：`reviewed_requirements: 0`，24 个 verdict 全部为 `pending`，`gate_passed: false`。PROGRESS 却写着“A6 Final Review Approved / Top3 Gate 87.5% 正式批准通过”，A7 和 A8 随后照常推进。
- 87.5% 是系统用自己的打分、按自己的阈值算出来的覆盖率。
- 113/113 测试全部通过，但大量测试断言的是具体的 scene_id、req_id 和人名（perspective 测试 34 处、grounding 测试 19 处），**验证的是“当前实现输出当前答案”，而不是产品假设**。

### 🟢 真实且有价值的部分
- 硬字幕 OCR（857 条，1 秒粒度，有噪声）是来自原片的真实数据。
- VMV Stage 4/5 渲染器能按剪辑单完成真实的裁切、`say` TTS、闪避混音、字幕烧录和 ffmpeg 合成。
- MCN 后台 → spawn → 进度回传 → 产出 MP4 的管道是通的。
- 数据契约、状态机、“INSUFFICIENT 不得生成 segment”的设计意图、Director 只能从 Top-K 中选镜头的约束思想，这些设计本身是对的。
- 项目在 A8 后做了失败根因审计，说明人工抽查能发现问题，但这些修复都是用更多 hard-code 补上的。

---

## 2. 八个核心假设的验证状态

| # | 假设 | 状态 | 依据 |
|---|---|---|---|
| H1 | 一次客观理解可以支持多个选题 | ❌ 未验证 | 不存在自动的“客观理解”；L1 是手写时间表 + OCR，而且为了选题被反复改写（F1、F2） |
| H2 | Topic-first 优于 Source-first | ❌ 未验证 | 没有对照实验；Requirement 是看过素材的人写的，实际上是 Source-first 伪装成 Topic-first |
| H3 | 同一 L1 可被不同 Persona 重新解释且不污染 L1 | ❌ 未验证（反向成立：L1 被选题污染） | 只有一个 Persona；换 Persona 输出逐字相同（实验 P）；L1 动作是为选题手写的（F2） |
| H4 | 能找到真正相关的镜头，而非关键词碰巧匹配 | ❌ 已证伪 | 实验 E2 和 E4：没有人名就没有召回能力，荒谬需求得分与真实需求相当 |
| H5 | 找不到时返回 INSUFFICIENT | ⚠️ 仅在“人名不存在”时成立 | E3 拒绝成功；E4、E5 都给出 SUFFICIENT；Director 静默丢弃 req_probe_04 |
| H6 | Perspective 真正改变了理解和排序 | ❌ 已证伪 | 手写模板加 topic_id 分支（F5） |
| H7 | Director 基于 Evidence 做决策 | ❌ 未验证 | plan 是人工编写的，且违反 Top3 约束（F6） |
| H8 | 从 MCN 后台直接生产真实 MP4 | ⚠️ 只有渲染部分成立 | 渲染是真实的；内容二选一；失败时显示为成功；已提交的成片含伪造字幕（F7、F8） |

---

## 3. 问题清单逐项回答

### 1. 核心问题定义是否成立？
**成立，而且是好问题。** “素材一次入库 → 多博主复用”有清晰的成本杠杆。Topic-first 符合 MCN 的内容生产方式。L1/L3 分离（事实与观点分开）是防止幻觉的正确抽象。真正的问题出在实现上，不在问题定义。

### 2. 技术架构是否合理？
**概念架构基本合理，工程拆分过度，实现层几乎是空壳。**
- 拆成 A0–A10 共 11 个阶段，每个阶段都有自己的 gate、报告和修复版本（A6.1/6.2/6.3、A7.1、A8.1），大量精力花在“流程合规的外观”上。
- L2 Affordance 目前只是一个标签匹配器（`aff.tag.includes(target)`），对 POC 没有贡献，**应推迟**。
- Retrieval、Perspective、Director 三层职责重叠：三层都在重复评估“人物是否匹配 + 关键词是否匹配”。
- **关键洞察**：单集只有 374 个单元，用文本描述约 3–5 万 token，**完整放得进一次 LLM 调用的上下文**。在 POC 阶段，检索层本身就不是必要的，它只在 100 集以上的素材库规模才有意义，应该单独做实验验证。

### 3. 哪些假设已被真实验证？
只有一个工程假设：**“结构化剪辑单 → 自动渲染 MP4”可行**。八个 AI 假设没有一个被验证。

### 4. 哪些只是代码实现了，但没有被验证？
数据契约和状态机、INSUFFICIENT 流转、Top3 约束、L1/L3 隔离字段、Persona 字段、时长预算、Grounding Gate。这些**结构都在，但里面没有真正的智能在运行**。

### 5. 最大的 5 个技术风险
1. **L1 自动标注的质量未知**（最大风险）：自动识别人物（含人脸 ID）、动作、场景的准确率，决定了整条路线是否成立，而目前完全没有测过。
2. **语义检索在去掉人名后能否工作**：真实博主的选题多为抽象意图（“职场 PUA”“利益交换”），这正是目前已被证伪的部分。
3. **L3 的幻觉控制**：LLM 生成的解读和旁白如何保证不越过 L1 的事实边界？目前靠的是 hard-code 黑名单，无法扩展。
4. **Persona 差异化是否真实存在**：在同一个小素材池里，两个博主会不会最终选中同样几个“高光镜头”，导致内容同质化？
5. **跨剧集泛化与成本**：换一部剧必须做到零改代码；VLM 标注全库的成本和时延也需要算清楚。

### 6. 是否存在明显的 hard-code / 数据泄露 / 自评 / 假集成？
**全部存在。**
- Hard-code：F1、F3、F5、F6、F7。
- 数据泄露：F2（注入的单元精准对应需求）；F3（需求文本里嵌着台词）。
- 自评冒充门禁：F9。
- 假集成：A4 没有接入链路；后台二选一；前端失败时显示成功；A6 的 Persona 实际没被使用；fallback 被包装成 semantic。
- 伪造内容：已提交 MP4 中的台词字幕（F8）。

### 7. 如果现在停止开发，这个 POC 证明了什么？
- 渲染管线（VMV Stage 4/5）可用。
- 硬字幕 OCR 可以作为 L1 的对白来源。
- “Topic-first + L1/L3 分离 + INSUFFICIENT + Top-K 约束”这套**产品与数据契约设计**已经写清楚，可以复用。
- **反面的收获同样重要**：用规则和关键词无法实现语义检索和视角解读；只要不让人看成片，自动化门禁就会对伪造内容放行。

### 8. A8 跑通以后，又能额外证明什么？
**几乎不能证明更多。** A8 证明的是“给定一个人工写好的剪辑单，能渲染出 MP4”，这在 VMV 层面已经成立。A8 跑得再顺，也不能为 H1–H7 中的任何一条提供证据。继续在 A8、A9 上投入，属于在一个未经验证的上游之上打磨下游。

### 9. 达到“可以继续投入开发”的标准，还缺哪几个实验？
| # | 实验 | 通过标准（建议） |
|---|---|---|
| X1 | **L1 自动标注基准**：在第 18 集上用 VLM + ASR/OCR 全自动标注，不用任何手写时间表；人工标注 50 个随机镜头作为金标 | 人物识别 F1 ≥ 0.85，场景 ≥ 0.8，动作描述人工可接受率 ≥ 70% |
| X2 | **盲测检索基准**：由**没看过 L1 的人**或 LLM 根据 Topic 生成 40 条需求，人工标注相关时间区间；每条需求另做 4 个变体：同义改写、去人名、加入不存在事件、荒谬输入 | Recall@20 ≥ 0.8，P@3 ≥ 0.6；去人名版本的召回下降 ≤ 20%；INSUFFICIENT 的精确率和召回率都 ≥ 0.8 |
| X3 | **Persona 区分度盲测**：2 个 Persona × 5 个选题，两边都用 LLM 生成；评审在不知道 Persona 的情况下判断归属并打分 | 归属判断准确率 ≥ 80%；Top3 镜头的 Jaccard 相似度 ≤ 0.5；事实错误 = 0 |
| X4 | **Topic-first vs Source-first 对照**：同一批选题、同样的预算，分别用两种流程生成，由人工盲评 | Topic-first 在“观点清晰度”和“可复用性”上显著更好，同时事实准确率不下降 |
| X5 | **跨剧泛化**：换一部剧（或至少换一集），**零代码改动** | X1–X3 的指标衰减 ≤ 15% |
| X6 | **真正的端到端**：在 UI 中输入一个**全新选题** → LLM 生成全部中间产物 → 渲染 → 人工打分；每个中间产物都可追溯 | 10 条中至少 6 条“无需人工修改即可发布或只需小修”，伪造事实 = 0 |

### 10. 如果由我重新设计
**保留**：VMV 渲染器；OCR 字幕；L1/L3 分离原则；INSUFFICIENT 语义；“Director 只能从候选集中选镜头”的约束；数据契约中的核心字段；时长预算。

**删除**：概念网“语义”匹配器；手写的 `EP18_REAL_SCENE_MAP` 和注入的单元；A6 的模板 Provider；写死规则的 Grounding Gate 和禁止断言列表；L2 Affordance Store（推迟到素材库规模足够时再做）；A0–A10 这种细碎拆分和多数 gate 报告；后台的 topic 路由。

**重做（最短可靠路线，3 步）**：
1. **Ingest（一次性）**：按镜头切分 → 用 Gemini 类视频模型逐镜头输出 JSON（人物、动作、场景、景别），结合 OCR 和 ASR 对白。**禁止输入剧名和剧情知识**，只允许看画面和听声音，然后用 X1 的金标来量化质量。
2. **Plan（每个选题一次 LLM 调用，带结构化输出）**：把 Persona + Topic + 整集 L1 索引一次性交给模型，输出 beats、每个 beat 选中的 `unit_id`（必须引用 L1 原文作为证据）、旁白和音频归属；或者对某个 beat 明确声明 INSUFFICIENT。程序侧只做**确定性校验**：unit_id 必须存在、引用的原文必须真实出现在 L1 中、时码合法。这一步等于把 A4、A5、A6、A7 合并成一次调用加一个校验器。
3. **Render**：沿用 VMV。

检索层（embedding + rerank）单独做 X2 实验，在素材库达到多集规模时再接入。

---

## 4. 评分

| 维度 | 分数 | 说明 |
|---|---|---|
| Architecture | **4 / 10** | 概念分层合理；拆分过细；实现层不可插拔，被选题和剧集绑死 |
| Evidence quality | **2 / 10** | 只有 OCR 对白是真实的；人物、场景、动作、景别、置信度均为手写或取模 |
| Retrieval validity | **1 / 10** | 人名 + 关键词匹配；荒谬需求也能通过 |
| Perspective reasoning validity | **1 / 10** | 按 topic_id 分支的手写模板，Persona 被忽略 |
| Director validity | **1 / 10** | 人工编写 plan，且违反自身的 Top3 约束 |
| E2E automation | **3 / 10** | 渲染和任务管道是真的；上游是静态的、二选一；失败显示成功；成片含伪造字幕 |
| POC scientific validity | **1 / 10** | 没有盲测、没有对照、没有金标；门禁全是自评；答案泄露 |
| Product potential | **6 / 10** | 问题定义有价值，有成本杠杆；但最关键的技术风险（X1、X2）还没开始验证 |

## 5. 最终判断

### **C. Demo 能跑，但技术验证不足**（接近 D）

- 之所以不是 D：**产品概念和数据契约不需要推倒**，Topic-first、L1/L3 分离、INSUFFICIENT、Top-K 约束都值得保留。
- 之所以接近 D：**A2、A5、A6、A7 的实现必须完全重写**，因为它们现在没有任何泛化能力，换一个选题或换一集就不能用。
- 建议立即做的事：
  1. 冻结 A8/A9；
  2. 撤回或标注已提交的两个含伪造字幕的 MP4；
  3. 把 PROGRESS 中“Gate 已通过”的表述改为“系统自评，未经人工审核”；
  4. 用 1–2 周时间先做 **X1 + X2**。这两个实验的结果决定这条路线是否值得继续。
