# Human Anchor Calibration：v4 最终评估 FAIL

日期：2026-10-07。**Calibration 总结论：FAIL。人工标注已完成且完整，但本轮 Independent Judge 未达到可信标准，不可用于扩大自动评测。不进入下一阶段，STOP 等待 Review。** X1.2 继续为 Engineering PASS / Scientific Pending。

## 锁定规则与盲法

- 用户明确确认使用当前冻结 preregistration v4 及已留档勘误；Schema 为 human-anchor/1.2.4。原 30-shot Manifest、20 Person Pairs、原始图片、评价阈值和 X1 Prompt 不修改。
- 用户确认标注前未看过这些相同 Shot 的 AI 预测。盲法以用户声明登记，不伪称外部审计。
- 实际人工活跃时间：**未采集**。v4 按用户此前要求移除计时，30 分钟为内部页面简化目标，不作预算 PASS/FAIL。不得用聊天、文件时间或运行时长代替。
- evaluator 已核验最终提交标志为 true；人工完成率 Shot 30/30、Pair 20/20、整体 50/50，均为 100%，Completion PASS。
- 密文文件 SHA256：`6265c6c383231720ac12854eae957a27fc9016184719c71a1fa0969069ee2bbb`。
- 答案 commitment：`2e244c5a4208929a87bbefbb68646b5ba7867197ce3203de054e5d8651c5b10e`。Judge 封存后由本地 evaluator 认证密文、核验 Manifest 并重算 canonical 答案摘要，全部与锁定值一致；原备份、答案和口令不进入 Git。

## Independent Judge commitment

Judge 使用三个独立新上下文分片，同一冻结任务说明，仅接收原始媒体与匿名任务定义，不继承主会话，不读取 Human Anchor、旧预测或其他分片答案。路由为当前继承的 Codex 模型；具体服务端模型版本未由工具暴露，不能伪造版本或称本轮为 Gemini Judge。只保存首次答案，无改善重跑。

- Judge 任务预注册 SHA256：`20dee778dcab5d964a8200c5c1c291cec3d7f99e1514137c70232f6e0618aa77`。
- Judge 结果 SHA256：`c9e7f51af00f584e313cc22877188a4a26f20b5ea1cad9eb605cf4be3e7d68be`。
- 输出 30 Shot + 20 Pair，共 50 条，无缺失任务。不能将“有记录”等同于“各字段已成功判定”。
- 原始 Judge 结果及分片存仓库外 `artifacts/human-anchor-calibration/independent-judge/`，封存后只读；仓库保存摘要和状态，不保存人工答案。

| Judge 字段 | 实际可用输出 | 失败 / 限制 |
|---|---:|---|
| Boundary | 15/30 | 15 failed；可用的 15 项通过原片 5 fps 顺序联系表观察，未实时播放，存在 0.2 秒采样限制 |
| Person count / Scene / Action / Object | 各 30/30 | 已查看原始 25/50/75% 帧；一致性结果见下表 |
| Speech status | 0/30 | 音轨尝试输出后工具明确不支持音频输入，全部 null/failed，不用字幕或嘴型猜测 |
| Speaker source | 0/30 | 同上，全部 null/failed，后续按冻结的 Human 可辨语音资格计错或不适用 |
| Person consistency | 20/20 | 6 个 uncertain 是 Judge 明确答案，不是 failed；固定 50% 帧且双方各自选择目标，保留目标歧义限制 |

## Evaluator 与揭盲状态

`scripts/human_anchor/evaluate.mjs` 为纯计分模块；`sealed-run.mjs` 为独立本地 evaluator。先核验密文、Judge 与代码/协议 commitment，再通过系统隐藏口令框取得原标注口令。在 evaluator 进程内解密、认证 AES-GCM、重算答案摘要并评估；口令、原始答案不写日志或文件，只导出聚合指标及不一致项 ID/字段/候选类型。

首次本地口令输入超时关闭，未产生结果。用户确认可以操作后第二次本地解锁成功；只有 evaluator 在内存读取 Human 明文。Agent 只读取公开指标与不一致项 ID/字段/候选分类。冻结 Judge、人工答案、阈值、公式、代码、Prompt、模型配置和样本均未改写，没有为改善得分重新运行 Judge。

| 指标 | 点估计 / 分母 | 双侧 95% CI | 本项裁决 |
|---|---|---|---|
| Boundary Accuracy | 14/30 = 46.67% | 30.23–63.86% | FAIL |
| Boundary κ | 0.0769 | 0.0000–0.1498 | FAIL |
| Person Count Accuracy | 20/30 = 66.67% | 48.78–80.77% | FAIL |
| Person Count κ | 0.4083 | 0.1682–0.6487 | FAIL |
| Scene Accuracy | 25/30 = 83.33% | 66.44–92.66% | 与 κ 联合：INCONCLUSIVE |
| Scene κ | 0.4828 | N/A | INCONCLUSIVE |
| Action micro-F1 | 0.7478；TP/FP/FN = 43/11/18 | 0.6598–0.8264 | 与 exact-set 联合：FAIL |
| Action exact-set | 9/30 = 30.00% | 13.33–46.67% | FAIL |
| Object micro-F1 | 0.4938；TP/FP/FN = 20/24/17 | 0.3429–0.6190 | FAIL |
| Object exact-set | 7/30 = 23.33% | 10.00–40.00% | FAIL |
| Person consistency Balanced Accuracy | 0.9500；有效 Pair 13/20 | N/A | INCONCLUSIVE |
| Person consistency macro-F1 | 0.9737；有效类别支持数 3/10 | N/A | INCONCLUSIVE |
| Speech Status Accuracy | 0/30 = 0% | 0–11.35% | FAIL |
| Speaker Source Accuracy | 0/20 = 0% | 0–16.11% | FAIL |
| Speaker Source 适用覆盖率 | 20/30 = 66.67% | 该覆盖率为描述性分母，无单独 PASS 门槛 | — |
| 人工完成率 | Shot 30/30、Pair 20/20 | 完整性检查，不作概率估计 | PASS |
| 人工实际耗时 / 30 分钟预算 | 未采集 / v4 不评判 | N/A | NOT_APPLICABLE_V4 |
| Calibration 总结论 | 6 项 FAIL，2 项 INCONCLUSIVE | 按冻结主指标裁决汇总 | **FAIL** |

Action Precision/Recall 为 79.63% / 70.49%；Object 为 45.45% / 54.05%。人物对覆盖率 65%，7 个 Human 不确定 Pair 保留在 /20 覆盖率分母，按 v4 不进入可判准确率，未替换或删对；13 个有效 Pair 低于预注册至少 15 个的要求。其高点估计不能作为 PASS。

Scene κ 在 10,000 次 bootstrap 中有 3 次未定义；人物 BA/macro-F1 各有 2,016 次未定义，故相应 CI 为 N/A。没有丢弃未定义抽样后选择性报告区间。Speaker 的 20 是人工可辨语音子集；Judge 在该子集可用输出为 0/20，其余 10 项不适用，不计错。音频项 0% 表示技术失败依冻结规则计错，不是已听音频后全部判错。

公开机器报告：[calibration-public-report.json](calibration-public-report.json)，SHA256 `001d2687fce160589265672cfb1ad38b139569f32e54809230d5a7a8051baa10`。仓库外原文件位于 `/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/human-anchor-calibration/independent-judge/calibration-public-report.json`。它不含人工逐项答案、点位、短文本或口令，仅保存聚合指标及适用评分差异目录。

实现保持 v4 Wilson 二项区间、按 early/mid/late 的 Shot cluster percentile bootstrap（10,000 次，seed 20261007）；Pair 用两端 Shot 抽样重数之积落实双端 cluster。未定义的重采样统计量使相应 CI 为 N/A，不删掉这些抽样后宣称 PASS；实现细节在读取 Human 前以代码 hash 锁定。没有调整分母、阈值或重新标注。

## Failure Analysis

工程输出失败共 75 个字段：30 Speech、30 Speaker、15 Boundary。进入适用评分差异目录的失败为 65 个：30 Speech、20 适用 Speaker、15 Boundary；另外 10 个不适用 Speaker 没有混入差异或缩小其实际适用分母。

公开报告的 `disagreements` 逐项保留全部 126 个适用评分不一致 ID、字段和候选分类。计数单位是字段或 Pair，多个字段可属于同一 Shot，不能当作 126 个独立样本。非评分文本、坐标、内容类型和 Human 不确定的 7 个 Pair 不在该目录内，不宣称它们已经过逐项根因裁决。

| 分类 | 字段 / Pair 数 | 证据强度与解释 |
|---|---:|---|
| Judge missing / failed | 65 | 确定：冻结输出为空或 failed，媒体访问能力不足 |
| 模型视觉理解错误 | 54 | 候选：人物数、场景、动作、物体存在分类不一致；需区分理解错误、标注口径与信息覆盖，不等同于 54 次幻觉 |
| 分类定义歧义 | 2 | 候选：包含“其他”等类别的差异，未作独立根因裁决 |
| Human Anchor 本身可能存在歧义 | 4 | 候选：人工不确定等状态；不能直接断言人工标错 |
| 人物一致性错误 | 1 | 候选：pair_05；双方独立选择人物可能存在目标差异，未据此删除或改分 |
| Shot 切分问题 | 0 | 本目录没有可单独确认的此类差异；15 个 Boundary failed 不能作为切分正确的证据 |
| 其他 | 0 | 当前候选分类无此类条目 |

已知材料问题仍保留：pair_06 的左侧固定帧无可辨人物，pair_09 复用该来源；多人帧目标未共同预先冻结。这些是准备阶段的有效性风险，不能事后换图、选定同一目标或重新标注来改善本轮结果。

计分程序能确定缺失输出；其余依据字段产生的候选原因必须标记为“未独立裁决”，不得仅凭不一致就断言人工错误或模型幻觉。Pair 独立选择的目标若有歧义应报告，不能事后用该理由删除不一致项或改变得分。

## 验证与阶段建议

- 新 evaluator 的 10 项合成数据测试通过，包括已知统计数值、缺失计错、条件 Speaker、commitment 变化阻断、错误口令不泄露、两份输入不改写。
- 全库 Node 测试 118/120 通过；失败为现有 `McnBackendServer HTTP API 与视频流 Range 播放支持验证` 及其所属 A8 父测试，原因是沙箱禁止监听已有测试固定端口 3199（EPERM）。未修改或重启旧生产链，未生成视频；旧测试结果不构成当前 Scientific Gate。
- 最终公开报告摘要、Judge/答案/Manifest 摘要与 evaluator/协议/source 基线哈希均核验；本地 evaluator 和隐藏口令子进程已退出，无本轮遗留预览服务。仅更新报告、公开评估结果和项目状态。
- **不建议进入下一阶段**：本轮 Judge 校准 FAIL，不能扩大为可信自动评审；按 Kill Criteria 停止该 Judge 路由的继续调参，未校准指标保持小规模评测范围。是否另立具备音视频访问能力的评审方案、以及如何处理材料质量，应等待 Review，不能在本轮自动重跑。一次性 Human Anchor 仍不进入每集 Ingest。
- X1.2 继续保持 Engineering PASS / Scientific Pending。本轮 FAIL 是 Judge 校准结论，不直接等同于 Gemini Evidence 系统在正式 Scientific Gold Gate 的结论。没有 X2 Probe、X1.3、X2/X2.5、新素材实验或视频生产。**STOP 等待 Review。**

统计定义核对：[Wilson 方法](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats._result_classes.BinomTestResult.proportion_ci.html)、[Cohen κ](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.cohen_kappa_score.html)、[Balanced Accuracy](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.balanced_accuracy_score.html)。计算门槛以冻结 v4 为准。
