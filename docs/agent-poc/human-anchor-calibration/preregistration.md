# Human Anchor Development Calibration 预注册 v4

**人工标注前重新冻结。** 30 分钟仅是页面低操作复杂度的内部设计目标，不计时、不记录耗时、不限制标注者完成时间，也不是 PASS/FAIL 指标。本版保持既定字段与非时间指标；旧版逐字转写、CER/ASR 校准指标撤销。本轮不运行模型或 AI Judge，不开始人工标注。

## 1. 范围、样本与盲法

Human Anchor 用于一次性 POC 系统校准，不帮助单集或日常素材 Ingest。标注员必须直接看/听原始素材，完全盲于 Gemini Evidence、Codex Review、AI Judge 和其他模型预测。页面隐藏输出不能消除既往曝光；看过预测的人员不得标注，否则结果为 INCONCLUSIVE。

30-shot Manifest 保持原字节不变：仅从既有 X1.2 50-shot 中按 early/mid/late 各取 10 个，不新增、不重抽样。哈希见 hash-commitment.json。人物一致性任务从同一清单固定派生 20 组跨 Shot 比较，不增加素材样本：

| Pair | 左 Shot | 右 Shot |
|---|---|---|
| 01 | shot_B0031 | shot_B0034 |
| 02 | shot_B0014 | shot_B0042 |
| 03 | shot_B0010 | shot_B0013 |
| 04 | shot_B0036 | shot_B0047 |
| 05 | shot_B0008 | shot_B0025 |
| 06 | shot_B0028 | shot_B0034 |
| 07 | shot_B0021 | shot_B0025 |
| 08 | shot_B0021 | shot_B0048 |
| 09 | shot_B0028 | shot_B0048 |
| 10 | shot_B0033 | shot_B0046 |
| 11 | shot_B0002 | shot_B0019 |
| 12 | shot_B0002 | shot_B0018 |
| 13 | shot_B0010 | shot_B0047 |
| 14 | shot_B0012 | shot_B0050 |
| 15 | shot_B0036 | shot_B0044 |
| 16 | shot_B0033 | shot_B0042 |
| 17 | shot_B0038 | shot_B0044 |
| 18 | shot_B0016 | shot_B0038 |
| 19 | shot_B0013 | shot_B0019 |
| 20 | shot_B0005 | shot_B0046 |

配对生成：列出 Manifest 中所有无序 Shot pair，以 Python random.Random(20261007) 打乱，依序接受两端各自尚未被选超过两次的 pair，取前 20 对。Pair hash 记录在 hash-commitment.json，定义为按展示顺序列出的 `{pair_id,left_shot_id,right_shot_id}` 数组之 UTF-8 canonical JSON SHA-256（对象键按字典序排列、无空白分隔符）；不可替换低信息 pair。标注员分别点击两张原始 50% 帧中的目标人物位置，再选同一/不同/不确定；不维护人物 ID。

## 2. 冻结字段与排除项

冻结字段见 schema.json：镜头边界、人物数量 0/1/2/3/4+/不确定、匿名视觉 Pair 一致性、场景分类、动作分类、物体分类、语音状态、画面人物/画外音/不确定的 Speaker 来源及原帧位置坐标、其他项文字最多 24 字，不参与主要评分。

本批不采集对白逐字转写、CER/WER、speaker_person_id 或 speaker_confidence Anchor 真值。Evidence Contract 中 speaker_person_id/confidence 与 ASR/CER 在本 Anchor 内未校准，保持 Pending，不得宣称已经过 Anchor 验证。若未来需要 ASR 真值，另行批准最小子集和时间预算。

## 3. 页面操作目标与提交

30 分钟是维护者用于控制页面交互复杂度的设计目标，不是要求标注者遵守的时限。页面不显示倒计时，不采集单项或全任务耗时，不因时间经过而锁定。标注者可以按自己的节奏完成；所有必需项填完后，在最后一项点击“提交标注”。密文自动保存支持中途离开后继续。

页面提供“用原口令解锁”和“新建空白标注并开始”两条入口。新建入口使用独立 IndexedDB 数据库与独立密钥，不读取、覆盖或删除旧记录；旧版记录继续使用其原冻结 KDF 配置解锁。两条路径使用同一 Schema、同一 30-shot Manifest 和同一 20 对。旧密文中可能存在的历史计时字段不再读取为指标，也不再写入后续保存。

## 4. 指标、分母及缺失规则

| Metric | 算法与固定分母 |
|---|---|
| 完成率 | 必需分类完整的 Shot / 30；明确提交的 Pair / 20。漏填不得剔除 |
| Boundary agreement | 三分类完全一致 Shot / 30；报告 Accuracy 与 Cohen κ |
| 人物数量 agreement | 0/1/2/3/4+/不确定完全一致 Shot / 30；报告 Accuracy 与 κ |
| Scene agreement | 单选类别完全一致 Shot / 30；报告 Accuracy 与 κ；短文本不评分 |
| Action / object | 对固定多标签集合计算 micro Precision/Recall/F1 和 exact-set agreement；unknown/none 为独立状态，短文本不评分 |
| Person consistency | 20 Pair 上的人类同一/不同与 Judge 预测的 Balanced Accuracy 和 macro-F1。人类不确定仍计入覆盖率分母 20、不进可判准确率；Judge missing/failed 在可判 Pair 计错 |
| Speech / speaker source | 语音状态分母 30；speaker source 仅在 Anchor 认为有可辨语音的 Shot 上计 Accuracy，并报告覆盖率。点击坐标是人工 provenance，不转换为人物 ID |

unknown 是明确答案，单列类别及 coverage；missing 是漏标，failed 是素材/工具/Judge 无输出。三者不可互换。不得替换 Shot/Pair 或缩小原始分母；Judge missing/failed 在 Anchor 可判项按错误计。Anchor 缺失降低有效 n；可判人物 Pair 少于 15/20 时该指标只能 INCONCLUSIVE。

## 5. 95% CI 和阈值

双侧 95% CI。Shot 级二项比例用 Wilson score interval。κ、macro/micro-F1、Balanced Accuracy 用按 early/mid/late 分层、以 Shot 为 cluster 的 percentile bootstrap，10,000 次，seed 20261007；Pair 重采样以其两端 Shot 为 cluster。同 Shot 标签一起重采样，不把帧当独立样本。无法计算 CI 时 N/A，不可 PASS。

- Boundary、人物数：Accuracy ≥0.85 且 κ ≥0.70；CI 下界分别 ≥0.70、≥0.50。
- Scene：Accuracy ≥0.80 且 κ ≥0.60；CI 下界分别 ≥0.60、≥0.40。
- Action、object：micro-F1 ≥0.80 且 exact-set ≥0.70；下界分别 ≥0.60、≥0.50。
- 人物一致性：可判 Pair ≥15/20；Balanced Accuracy 与 macro-F1 均 ≥0.80，CI 下界均 ≥0.55。
- Speech status：Accuracy ≥0.85，CI 下界 ≥0.65。Speaker source：可判语音 Shot ≥15，Accuracy ≥0.80，CI 下界 ≥0.60。
- 全校准 PASS：盲法有效、完成率 100%，且所有适用主指标满足阈值。CI 全部落在阈值失败侧为该指标 FAIL；CI 跨阈值、有效样本不足或盲法污染均为 INCONCLUSIVE。时间不参与结论。

## 6. 后续盲测与产品解释

Calibration 完成后冻结代码、Prompt、模型配置和评测规则。Same-title Blind Holdout（如另一集）必须全自动 Ingest，不重做人类 Anchor、不为该集修改规则；只在 Ingest 完成后允许少量事后抽检。必须人工修正才能正常 Evidence 入库则 X1 FAIL。随后以同一冻结系统做另一部真人剧 Cross-title Holdout，只做事后小规模抽检。动画、综艺、纪录片等 Domain Shift 另做 Domain Qualification，不要求逐集 Anchor。
