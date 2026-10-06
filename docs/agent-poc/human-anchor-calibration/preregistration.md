# Human Anchor Development Calibration 预注册

状态：以下 Manifest、Schema、标注规范、代码/Prompt/模型配置哈希、指标及门槛在人工标注前冻结。本轮只准备；尚未标注、没有运行 AI Judge、没有生成新 Evidence。

## 1. 目的、适用范围与顺序

Human Anchor 校准自动素材理解系统，不帮助单集素材入库；日常素材目标是自动 Ingest。标注员直接看原始片段/帧及必要原声音频，独立完成并锁定答案。Agent 和 Judge 均不得读取 Anchor 明文。先锁定人工答案并计算 SHA256 commitment，再让独立 Judge 接触待评输出。Anchor 是一次性 POC 校准成本，不是每集处理成本。

Development Calibration 从既有 X1.2 50-shot Blind Pool 按 early / mid / late 各抽 10 个，共 30 Shot。固定种子 20261007；清单冻结于 `manifest.json`，不增加样本。若标注员曾看过这 30 个样本的 Evidence、AI/Codex Review 或 Judge 结果，盲法污染且整轮 INCONCLUSIVE；页面隐藏结果不能恢复已泄漏的盲法。

顺序：①人类独立标注并锁定；②在仓库外保存口令加密的答案，并在 Judge 运行前登记答案 SHA256 commitment；③独立 Judge 输出锁定后再比较。Judge 未达标准，停止优化 Judge，该指标保留小规模人工评测。Holdout 揭晓后针对结果修改代码/Prompt/模型/规则，只能登记为新实验，不能宣称同轮 PASS。

## 2. 冻结对象

- 30-shot Manifest、样本区间与分层：`manifest.json`。
- 通用标签字段与规则：`schema.json`、`annotation-guidelines.md`。不含剧名、集数、人物或剧情专用字段。
- 被校准系统：已存在的 X1.2 版本。本轮不重跑模型。代码、Prompt、模型配置、原始 Manifest、帧清单及 Schema 哈希见 `hash-commitment.json`。记录配置：Gemini 3.1 Pro Low、effort low、输入分辨率 384、帧位置 25/50/75%。
- Anchor 答案 SHA256 当前为空，须在人工标注完成后、Judge/评估器读答案前登记；空值不表示答案存在。

## 3. 指标单位、方式与分母

唯一抽样单位为 Shot（N=30）。Shot 内帧、人物/字段均聚类到所属 Shot；报告每字段可评分项目 n。

1. **边界可用性**：AI Judge 与人工三分类完全相同的 Shot 数 / 30；unknown 是独立类别；另报 Cohen κ。
2. **人物数量**：人数完全相同（或双方均 unknown）的 Shot 数 / 30；Judge missing/failed 计错；另报 κ。
3. **匿名人物对应**：在不同 Shot 的人物实例间构造所有无序 pair；人工同一匿名 ID 判 same，不同明确 ID 判 different，任一 Anchor ID unknown 则该 pair 不可判且计入 unknown 数。Judge same/different 对比 Anchor；Judge missing/failed 在可判 pair 计错。报告 Precision、Recall、F1、Balanced Accuracy、有效 pair n。
4. **环境、动作、物体**：各自独立计 30 Shot。文本规范化仅做 Unicode NFC、首尾 trim、连续空格折叠、拉丁字母小写和末尾标点规范化；不做同义词表、Embedding、事后人工改写。规范化字符串完全相同为一致；unknown 为单独类别；Judge missing/failed 计不一致。该指标是严格表面一致率，不冒称语义等价率。
5. **对白 CER**：先 Unicode NFC，再去除空白与标点。CER = 字符 Levenshtein 距离 / Anchor 可辨对白字符数。无可辨对白是状态类别，不是空转写；对白字符分母为 0 的 Shot 不计 CER，但计对白状态准确率。Judge 对有对白 Shot missing/failed 计 CER=1。CER 分母为 0 时 N/A。
6. **Speaker ID**：Anchor 明确 speaker 的对白段中，Judge `speaker_person_id` 完全一致数 / Anchor 可确认段数。Anchor unknown 不进入该分母但单列覆盖；Judge missing/failed 计错。
7. **speaker_confidence**：在可确认 speaker 段，Judge 置信值映射 high=0.90、medium=0.65、low=0.35；Brier = 平均 `(confidence - correct)^2`，correct 表示 speaker ID 是否正确；Judge unknown/missing/failed 计 1。无可确认 speaker 则 N/A。
8. **标注完成率**：全部必填项有明确值（包括 unknown）的 Shot 数 / 30；漏填不得删除 Shot。

## 4. 缺失、unknown、failed、排除

unknown 是有意义标签，保留在类别准确率和覆盖率；missing 是漏标，failed 是工具/Judge 无输出，二者不可改记为 unknown。Shot 不因失败/缺失剔除：预测缺失按对应公式计错；Anchor 缺失减少可评分 n 并报告。不得替换 Shot 或缩小固定分母。任一主字段 n<20/30、人物关系有效 pair<20，或完成率<90%，相应字段/本轮不能 PASS，记 INCONCLUSIVE。

## 5. 95% CI

双侧 95%。Shot 级二项准确率/完成率用 Wilson score interval。人物 pair 指标、κ、CER、Brier 用按 early/mid/late 分层、以 Shot 为簇的 percentile cluster bootstrap：10,000 次，随机种子 20261007；整 Shot 的标签一起重采样，禁止把帧/pair 当独立样本。区间无法计算时 N/A，不能 PASS。

## 6. 冻结阈值与裁决

| 指标 | PASS 点估计 | 95% CI 要求 |
|---|---:|---:|
| 边界可用性、人物数 | Accuracy≥0.85 且 κ≥0.70 | Accuracy 下界≥0.70 且 κ 下界≥0.50 |
| 人物对应 | F1≥0.80 且 Balanced Accuracy≥0.80 | 两者下界均≥0.60 |
| 环境、动作、物体表面一致率 | 各字段≥0.70 | 各下界≥0.50 |
| Dialogue CER | ≤0.15 | 上界≤0.30 |
| Speaker ID | Accuracy≥0.80 | 下界≥0.60 |
| Speaker confidence Brier | ≤0.20 | 上界≤0.30 |
| 标注完成率 | ≥0.90 | 下界≥0.80 |

全局 **PASS**：盲法有效、样本量/完成率充足，所有主字段都满足点估计与 CI 要求。全局 **FAIL**：至少一个可评主字段的 CI 完全在失败侧（Accuracy/一致率/F1/Balanced Accuracy 的上界低于目标；CER/Brier 的下界高于上限），或有答案泄漏、揭盲后改规则并仍声称同轮通过。其他情况为 **INCONCLUSIVE**，包括 CI 跨阈值、样本不足、盲法污染。禁止宏平均掩盖字段失败。

## 7. 校准后盲测与产品解释

Calibration PASS 仅表示 Judge 在开发 Anchor 上达到了预注册一致性，不等于 X1 Scientific PASS，也不自动解锁 X1.3/X2/X2.5。冻结代码/Prompt/模型/规则后必须先做 Same-title Blind Holdout（EP19 或评审指定另一集）：全过程自动 Ingest，不重做 Anchor、不按该集修改系统或添加人物/剧情规则；Ingest 完成后才允许少量事后人工抽检，抽检不得帮助入库。若必须人工修正才能正常 Evidence 入库，X1 FAIL。之后以同一冻结系统对另一部真人剧做 Cross-title Holdout，只允许事后小规模抽检。动画、综艺、纪录片等 Domain Shift 另做 Domain Qualification，不要求每部新素材重复 Anchor。
