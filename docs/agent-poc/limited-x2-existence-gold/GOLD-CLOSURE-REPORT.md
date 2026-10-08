# 中性 Existence Gold：封存与实际观察限制

更新于 2026-10-08。定位为 Legacy Evidence Retrieval Diagnostic 的准备阶段；**冻结协议下的正式盲检索尚未执行**，没有正式 Probe 分数或 Scientific PASS。2026-10-08 另有一次非盲探索性检索与人工验收，现按其原始范围补记于下文及[独立测试记录](../exploratory-retrieval-human-acceptance-2026-10-08.md)。

## 封存结果与历史边界

五项任务处理记录已由新独立原片评审封存。**这不代表整集视听核验完成，也不代表五条均可评分。** Gold 的逐条三态、答案与区间不在本报告公开，不能从封存成功推断 Positive/Hard Negative 的数量。公开附件：[gold-public-receipt.json](gold-public-receipt.json)。

| 冻结项 | SHA256 |
|---|---|
| 原片 | `7987a13f4df2403d0eb3927a9c1f6b170821077e171afc72df4c95d935f17c9c` |
| 五条原 Query | `e684d6d384ae04a7c707317f8486fbb67ccd5f78086153156f7a261cb7c8f711` |
| 本轮中性协议 | `a9b0fe2835465d76cd9de068748a7aeb3ce276470b35909a21918f630225497f` |
| 新隔离 Gold | `c26e03c5df0bdfd127af9b61f62c6fd31621d1e977747e25f304bbe250313634` |

Q1–Q5 全为中性 Existence Query。旧4/1分母和Q5负例预设被当前用户授权替代，五条 Query 字节不改。旧检查点、旧 Gold commitment、历史实验、Evidence Schema、50-shot输入与 Anchor 协议均保留原样。新评审只读冻结任务与原片，不继承旧答案或 Evidence。预注册文件中的 Gold=null 为评审开始前的记录，封存后不回填改写；本回执另行登记新 commitment。

## 实际模态能力与覆盖

- 整片文件超过工具100MB输入限制。原片分段的 `view_file` 实际返回 `video/mp4` 媒体；评审声明其观察表现为离散1fps画面，无法确认连续时序感知。**不能将媒体成功返回或采样覆盖写成完整整集视觉核验，也不能证明未观测的短动作不存在。**
- AAC输入返回不支持的MIME错误；转为MP3后工具实际返回 `audio/mpeg` 媒体。评审声明只感知播放器占位界面，未能确认真实听觉输入。媒体回执不是“听过原声”的证明。本轮未用字幕/OCR/ASR补造音频真值。
- 视觉尝试先独立进行；音频失败没有使视觉任务变成已完成或已证实不存在。全片无间隙观察与全部事件区间枚举仍不能确认。当前协议要求不能可靠判定的任务留 unverifiable；具体三态只在隔离 Gold 中保存，本报告不泄漏逐条状态或数量。
- 音视频能力为评审自报；coordinator仅核对实际工具模态/状态与公开声明，不自行听看重新判定，也不读取 Gold 明文。`confirmed_absent` 的证明要求没有降低。

## 承诺核验、隔离与剩余限制

实际 SHA256 操作的完成工具回执包含新 Gold hash；独立核对仅检查工具元信息与公开摘要，不读取答案。原始公开回执留仓库外，仓库版删除可能暗示状态的泛化说明，并纠正权限表述；规范化不改 Gold 文件/状态或 hash。

Gold 明文位于仓库、项目工作区和 artifacts 之外。评审声明文件为 `chmod 400`：它限制写入但**所有者仍可读取**；同用户路径分离/权限不是完整角色隔离。未来 Retriever 必须使用真实受限执行身份或沙箱，禁止访问 Gold、评审私有缓存/日志、旧准备报告和本聊天。该 guard 尚未部署或验证，当前禁止检索；不能宣称已经具备防同用户越权能力。

本轮原片评审已结束，观察用临时MP4/AAC/MP3已清理；工具缓存/日志作为私有评审面保留，未来须由权限 guard 隔离。没有新增检索样本、Evidence、索引、检索结果或视频生产。

## 2026-10-08 Q5 探索性检索与人工验收补记

新提交的测试文档记录：用旧版50-shot描述进行了一次对话模型辅助的探索性查询，未找到完整支持 Q5 的记录；系统把一个外观/场景相似片段明确标成“相似参考”，并说明它不支持掏枪射击。用户接受这种结果呈现和参考价值，因此**Q5 探索性检索的人工验收通过**。

这次通过仅适用于交互呈现和相似参考的人工验收。它没有裁定原片是否存在目标事件，没有确认整集不存在或列出所有目标区间，也不代表冻结协议下的 Retriever、正确拒答率或正式 Q5 Gold 已通过。查询由当前对话模型在看过上下文并获得用户反馈后完成，不属于盲测；备选片段也没有逐一获得确认。不得将本次结果写成“Q5 Gold 已通过”或 Probe 的正式准确率。

此前报告中“本轮未检索”现在明确指**正式盲 Probe 未执行**；探索性检索单独留档，不回填预注册 `retrieval_runs=0`，不改 Gold 或历史评分。若要判正式 Q5 是否检索命中，仍需按隔离顺序先封存正式输出，再由隔离 Evaluator 揭盲；Gold 的整集覆盖限制与权限 guard 也仍待解决。

## 后续规则与 STOP

未来 Retriever 只接收冻结五条中性 Query、通用规则与旧输入，不知道 Gold 状态。首次五条结果先封存，隔离 Evaluator 才揭盲；present评Top3时间区间，absent须INSUFFICIENT，unverifiable不计PASS/FAIL。分母、CI、缺失/失败计法见冻结当前协议；不得沿用旧固定4/1配置。

Gold记录封存与完整核验能力是两件事。当前正式 Probe 状态：`neutral_gold_sealed; full_audiovisual_verification_not_completed; overall_execution_freeze_incomplete; formal_retrieval_not_executed`。实际 runner、费用上限与权限 guard 仍待冻结及 Review。本轮 **STOP**，不执行正式检索、X1.3、正式X2/X2.5、A8/A9/A10或新素材实验。
