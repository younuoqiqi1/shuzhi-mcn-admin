# Human Anchor Development Calibration 预注册 v4

**原 v4 基线在人工标注前冻结；标注开始后的勘误见第 7、8 节并保留旧哈希。** 30 分钟仅是页面低操作复杂度的内部设计目标，不计时、不记录耗时、不限制标注者完成时间，也不是 PASS/FAIL 指标。本版保持既定字段与非时间指标；旧版逐字转写、CER/ASR 校准指标撤销。Agent 本轮仅修正表单，不运行推理实验或 AI Judge，不代标或读取人工答案。

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

冻结字段见 schema.json：镜头边界、人物数量 0/1/2/3/4+/不确定、匿名视觉 Pair 一致性、场景分类、动作分类、物体分类、语音状态、仅在语音状态为“可辨语音”时必需的画面人物/画外音/两者都有/不确定 Speaker 来源（混合类别按 §11 勘误），以及可选原帧位置坐标。位置不可辨时留空；坐标不参与完成率或主要评分。其他项文字最多 24 字，不参与主要评分。

本批不采集对白逐字转写、CER/WER、speaker_person_id 或 speaker_confidence Anchor 真值。Evidence Contract 中 speaker_person_id/confidence 与 ASR/CER 在本 Anchor 内未校准，保持 Pending，不得宣称已经过 Anchor 验证。若未来需要 ASR 真值，另行批准最小子集和时间预算。

## 3. 页面操作目标与提交

30 分钟是维护者用于控制页面交互复杂度的设计目标，不是要求标注者遵守的时限。页面不显示倒计时，不采集单项或全任务耗时，不因时间经过而锁定。标注者可以按自己的节奏完成；所有必需项填完后，在最后一项点击“提交标注”。密文自动保存支持中途离开后继续。

页面提供“用原口令解锁”和“新建空白标注并开始”两条入口。新建入口使用独立 IndexedDB 数据库与独立密钥，不读取、覆盖或删除旧记录；旧版记录继续使用其原冻结 KDF 配置解锁。两条路径使用同一 Schema、同一 30-shot Manifest 和同一 20 对。旧密文中可能存在的历史计时字段不再读取为指标，也不再写入后续保存。

## 4. 指标、分母及缺失规则

| Metric | 算法与固定分母 |
|---|---|
| 完成率 | 适用必需分类完整的 Shot / 30；明确提交的 Pair / 20。Speaker 来源仅在“可辨语音”时必需；无可辨说话为不适用，语音不确定为未评估；其余必需分类不变。漏填不得剔除 |
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

## 7. 标注开始后的非评分表单勘误（2026-10-07）

用户已开始人工标注，本次属于界面与非评分 provenance 勘误，不得描述为人工开始前的新冻结。原 v4 冻结哈希保留在 hash-commitment.json 的 ui_amendments 中。原有 30-shot Manifest、20 Pair、分类字段、所有评分公式/分母/阈值/95% CI、盲法与模型配置均不改变。

Speaker 原帧位置仅为可选溯源；画面模糊时可以留空，不要求猜测位置，不阻塞下一条。可见说话人来源仍按原始视频/帧独立选择，不能为了绕过位置验证而将已确定的来源改为不确定。未知坐标保留为缺省，不由 Agent 自动补齐。人物 Pair 的同一/不同决策仍要求两端目标位置；选择不确定时无需点图。既有答案不读取、不自动修改；本轮不运行 Judge 或实验。

## 8. Speaker 条件适用性勘误（2026-10-07）

用户标注进行中发现表单在无说话时仍强制选择 Speaker，导致“不适用”被迫填成“不确定”。本勘误纠正字段适用性，并明确修改完成率检查中的 Speaker 必填条件；不得称为所有评测定义完全未变，也不得据此升级 Scientific 状态。原 UI1 与 v4 协议哈希保留在 hash-commitment.json 的 ui_amendments 中。本轮不读取人工答案、不补写标签、不运行 Judge。

- 可辨语音：Speaker 来源必选；位置仍可选。
- 无可辨说话：Speaker 不适用，隐藏选项和位置图，无需作答；不确定不是无说话的替代答案。
- 语音状态不确定：Speaker 未评估，无需选择；与不适用分别报告。

界面根据标注者明确选择的语音状态显示适用性，不向答案中猜测、填充或删除 Speaker 值。保留历史原始值；后续评估在语音非可辨时忽略 Speaker 来源/位置，将其解释为不适用或未评估。原 Speaker Accuracy 仅在 Anchor 可辨语音 Shot 上计算的评分资格不变；完成率固定分母 30/20、其他指标公式与分母、阈值、95% CI、30-shot/20-pair 样本及模型配置保持不变。所有报告须注明本勘误版本，不能混用修正前后完成率检查口径。

## 9. 可选位置标记撤销勘误（2026-10-07）

用户标注进行中补充“清除位置标记”操作。只有标注者主动点击时，页面删除当前 Shot 的可选 speakerPoint；保留 Speaker 来源、其他分类、其他 Shot 与 Pair 答案，并沿用加密自动保存。没有位置时无需清除。原 UI2 页面和协议哈希留档；样本、字段适用性、完成条件、评分公式/分母/阈值/95% CI 均不变。Agent 不读取人工答案，不运行 Judge 或实验；X1.2 仍为 Engineering PASS / Scientific Pending。

## 10. 上一条导航勘误（2026-10-07）

当前条目未填完整时，允许点击“上一条”或使用对应快捷键返回，保留当前部分答案并沿用加密自动保存。必填校验仅阻止“下一条”和提交；首条不能继续向前返回。原 UI3 页面与协议哈希留档。本次仅修正导航限制，样本、完成条件、评分公式/分母/阈值/95% CI 与字段适用性不变；不读取人工答案，不运行 Judge 或实验。

## 11. Speaker 混合来源类别勘误（2026-10-07）

用户标注中遇到同一 Shot 既有画面人物讲话又有画外音，原单选三分类无法准确表达。增加“两者都有”（both_on_and_off_screen），仍为单选；表示同一 Shot 内两类可辨说话来源同时或先后出现，仅多人入镜不构成混合来源。混合来源的画面人物位置依然可选，可清除，不要求逐句或逐人标注。旧答案保持原值，不读取、自动迁移或推断旧条目是否为混合来源。

这是标注开始后的类别空间扩展，不能声称 Speaker 分类定义未变。原 UI4 页面/协议哈希保留，使用 schema human-anchor/1.2.3。未来 Speaker source Accuracy 仍以 Anchor 可辨语音 Shot 数为分母，分子为四分类完全一致数；混合真值只有显式预测混合才计正确，仅预测一种来源、missing/failed 均计错，不得剔除混合样本或折算部分正确。覆盖率、门槛、Wilson 95% CI 与其他指标保持原规则。Judge 在任何正式运行前必须冻结包含该四分类的输出规则，并在报告中注明本勘误；不能混用旧三分类评测口径。样本不变，不读取人工答案，不运行 Judge 或新实验；X1.2 仍为 Engineering PASS / Scientific Pending。

## 12. 内容类型元数据勘误（2026-10-07）

schema human-anchor/1.2.4 增加可选 `program_segment_type`，页面键为 programSegment，类别为正文 / 片头 / 片尾 / 不确定（main_content / opening / ending / uncertain）。标注员只按原始媒体独立选择；缺省保持 missing、不自动补为正文，不要求补标已完成条目。混合/不明区间可选不确定。本轮不校准或评分此字段，不为它定义或宣称类型识别 PASS。

原 UI5 页面及协议哈希留档。内容类型不改变原有必填项、完成率或任何评分分母/阈值/CI；选片头/片尾仍按原规则标注，不删除任何冻结 Shot/Pair、不从指标中排除片头片尾，也不把人工类型标签用于生产 Ingest。未来自动包装识别及正文筛选须另行冻结实现与评测规则再验证，不在本轮执行。保留既有答案；不读取人工答案，不运行 Judge、模型实验或切片。X1.2 仍为 Engineering PASS / Scientific Pending。

## 13. 人物配对材料质量问题与后续准备门禁（2026-10-07）

用户截图报告 pair_06 左侧 shot_B0028 的固定 50% 原帧没有可辨人物，属于比较材料质量问题，不能把“没有可比较人物”当作“不同人”。公开页面定义显示 pair_09 复用同一原帧，须一并披露该来源问题。此处仅记录用户报告和页面来源关系，不记录或推断 Human Anchor 的同一/不同/不确定答案。

本批配对规则为在所有 Shot 对中随机抽取，未设置人物可见性预检，存在将空景/物体特写分配到人物比较的准备缺陷。当前标注已经开始，原 30-shot、20-pair 和图片不变，不替换、删除或自动代填。标注者遇到无可辨人物、目标无法对应或模糊时可独立选择不确定，无需点图；原覆盖率分母仍为 20，可判准确率与有效 Pair ≥15/20 门槛不变。有效样本不足仍为 INCONCLUSIVE，不得因材料问题缩小分母再宣称 PASS。

后续如获准准备新轮人物对，必须在冻结和人工开始前完成材料质量预检：图像可加载；两边都有清晰可定位的可辨人物；目标人物位置无歧义（多人帧须预先冻结目标位置，禁止给出身份预测）；不得以空景、物体、片头包装或不可辨人物帧代替人物比较。预检只判断材料是否可用，不提前生成身份一致性标签。预检失败不进入新轮配对，记录筛选规则、候选及排除数量和原因并冻结 hash，不能根据 same/different 结果挑选样本。本轮不启动新筛选、重抽样、模型推理、Judge 或读取答案；生产自动 Ingest 不增加人工配对流程。
