# Human Anchor Calibration：Judge 已封存，等待本地揭盲

日期：2026-10-07。**本文件为中间封存记录，尚非最终 Calibration 报告；未计算 Human/Judge 一致性，不能宣称 PASS。**

## 锁定规则与盲法

- 用户明确确认使用当前冻结 preregistration v4 及已留档勘误；Schema 为 human-anchor/1.2.4。原 30-shot Manifest、20 Person Pairs、原始图片、评价阈值和 X1 Prompt 不修改。
- 用户确认标注前未看过这些相同 Shot 的 AI 预测。盲法以用户声明登记，不伪称外部审计。
- 实际人工活跃时间：**未采集**。v4 按用户此前要求移除计时，30 分钟为内部页面简化目标，不作预算 PASS/FAIL。不得用聊天、文件时间或运行时长代替。
- 人工完成率及最终提交标志：待 evaluator 揭盲核验；用户已报告完成，不据此先填 100%。
- 密文文件 SHA256：`6265c6c383231720ac12854eae957a27fc9016184719c71a1fa0969069ee2bbb`。
- 浏览器声明答案 commitment：`2e244c5a4208929a87bbefbb68646b5ba7867197ce3203de054e5d8651c5b10e`。尚未解密重算；原备份和答案不进入 Git。

## Independent Judge commitment

Judge 使用三个独立新上下文分片，同一冻结任务说明，仅接收原始媒体与匿名任务定义，不继承主会话，不读取 Human Anchor、旧预测或其他分片答案。路由为当前继承的 Codex 模型；具体服务端模型版本未由工具暴露，不能伪造版本或称本轮为 Gemini Judge。只保存首次答案，无改善重跑。

- Judge 任务预注册 SHA256：`20dee778dcab5d964a8200c5c1c291cec3d7f99e1514137c70232f6e0618aa77`。
- Judge 结果 SHA256：`c9e7f51af00f584e313cc22877188a4a26f20b5ea1cad9eb605cf4be3e7d68be`。
- 输出 30 Shot + 20 Pair，共 50 条，无缺失任务。不能将“有记录”等同于“各字段已成功判定”。
- 原始 Judge 结果及分片存仓库外 `artifacts/human-anchor-calibration/independent-judge/`，封存后只读；仓库保存摘要和状态，不保存人工答案。

| Judge 字段 | 实际可用输出 | 失败 / 限制 |
|---|---:|---|
| Boundary | 15/30 | 15 failed；可用的 15 项通过原片 5 fps 顺序联系表观察，未实时播放，存在 0.2 秒采样限制 |
| Person count / Scene / Action / Object | 各 30/30 | 已查看原始 25/50/75% 帧；具体准确性尚未揭盲 |
| Speech status | 0/30 | 音轨尝试输出后工具明确不支持音频输入，全部 null/failed，不用字幕或嘴型猜测 |
| Speaker source | 0/30 | 同上，全部 null/failed，后续按冻结的 Human 可辨语音资格计错或不适用 |
| Person consistency | 20/20 | 6 个 uncertain 是 Judge 明确答案，不是 failed；固定 50% 帧且双方各自选择目标，保留目标歧义限制 |

## Evaluator 与揭盲状态

`scripts/human_anchor/evaluate.mjs` 为纯计分模块；`sealed-run.mjs` 为独立本地 evaluator。先核验密文、Judge 与代码/协议 commitment，再通过系统隐藏口令框取得原标注口令。在 evaluator 进程内解密、认证 AES-GCM、重算答案摘要并评估；口令、原始答案不写日志或文件，只导出聚合指标及不一致项 ID/字段/候选类型。

首次本地口令输入超时关闭，**尚未揭盲、没有最终指标文件**。等待标注者在本地输入口令，不向聊天或模型提供口令。Judge 已完成封存，后续解锁不再改变 Judge。

| 计划指标 | 固定口径 | 当前结果 |
|---|---|---|
| Completion | Shot /30、Pair /20 | 未计算 |
| Boundary、Person Count | Accuracy、κ、95% CI | 未计算 |
| Scene | Accuracy、κ、95% CI | 未计算 |
| Action、Object | micro-F1、exact-set、CI | 未计算 |
| Person consistency | 可判 Pair /20、Balanced Accuracy、macro-F1、CI | 未计算 |
| Speech Status | Accuracy /30、CI | 未计算 |
| Speaker Source | Human 可辨语音子集 Accuracy、coverage、CI | 未计算 |
| Calibration 总结论 | 冻结 v4 规则 | **未计算，等待本地揭盲** |

实现保持 v4 Wilson 二项区间、按 early/mid/late 的 Shot cluster percentile bootstrap（10,000 次，seed 20261007）；Pair 用两端 Shot 抽样重数之积落实双端 cluster。未定义的重采样统计量使相应 CI 为 N/A，不删掉这些抽样后宣称 PASS；实现细节在读取 Human 前以代码 hash 锁定。没有调整分母、阈值或重新标注。

## Failure Analysis 状态

已确认的工程失败为 Judge 音频不可感知（60 个字段）与一组时间内容不可感知（15 个 Boundary 字段）。这些不是 Human/Judge 不一致统计。所有真正不一致项须揭盲后逐项保留，分为模型视觉理解错误、Shot 切分问题、人物一致性错误、分类定义歧义、Human Anchor 可能存在歧义、Judge missing/failed、其他。

计分程序能确定缺失输出；其余依据字段产生的候选原因必须标记为“未独立裁决”，不得仅凭不一致就断言人工错误或模型幻觉。Pair 独立选择的目标若有歧义应报告，不能事后用该理由删除不一致项或改变得分。

## 验证与阶段建议

- 新 evaluator 的 10 项合成数据测试通过，包括已知统计数值、缺失计错、条件 Speaker、commitment 变化阻断、错误口令不泄露、两份输入不改写。
- 全库 Node 测试 118/120 通过；失败为现有 `McnBackendServer HTTP API 与视频流 Range 播放支持验证` 及其所属 A8 父测试，原因是沙箱禁止监听已有测试固定端口 3199（EPERM）。未修改或重启旧生产链，未生成视频；旧测试结果不构成当前 Scientific Gate。
- **不建议进入下一阶段**：Judge 本轮存在显著媒体访问失败，Calibration 指标尚未计算。继续保持 X1.2 Engineering PASS / Scientific Pending。没有 X2 Probe、X1.3、X2/X2.5、新素材实验或视频生产。最终报告须在本地揭盲完成后替换本中间状态，再 STOP 等待 Review。

统计定义核对：[Wilson 方法](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats._result_classes.BinomTestResult.proportion_ci.html)、[Cohen κ](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.cohen_kappa_score.html)、[Balanced Accuracy](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.balanced_accuracy_score.html)。计算门槛以冻结 v4 为准。
