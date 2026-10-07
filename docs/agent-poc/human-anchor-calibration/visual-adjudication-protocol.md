# Visual Disagreement Adjudication：执行前定义

日期：2026-10-07。历史基线 commit：`d6ac6ca84830af6bdfb582b3468351f15b16c8ed`。

## 范围与不可修改项

本轮只解释既有 Human/Judge 的 visible person count（10 项）、action（21 项）、object（23 项）差异，共54个字段任务，来自原30-shot清单，不增加样本。历史结论永久保留为 **Independent Judge Calibration FAIL**，不能解释为 Gemini Evidence Scientific FAIL。本轮没有新 PASS Gate，不回改 Calibration 分数、人工答案、Judge 首次输出、Schema、阈值、公式、Prompt 或 Manifest。

Person consistency 不做裁决、不换模型：13个有效 Pair，BA=0.95、macro-F1=0.9737，因有效 Pair <15 保持 INCONCLUSIVE；原报告的 CI N/A 仍保留。未来人物对 benchmark 的可见性与目标预检需新一轮冻结，不能修改本轮。Speech/Speaker 不做视觉裁决；音频访问失败属于 Judge 工具限制，未来校准须具备真实音频输入能力。

## 隔离与顺序

1. 在本地 evaluator 内认证已封存的人工密文、原 Judge、公开差异目录及原协议/代码哈希。口令仅在本地隐藏弹窗输入，不进入模型或日志。
2. 每项独立随机交换 Answer A/B，仅导出该字段分类和同一原始素材路径/摘要。无来源标签、人工短文本、位置、其他答案、旧 Evidence 或旧 Review。Origin mapping 加密留在仓库外，评审不得读取。
3. 三个字段各由一个新上下文的独立视觉评审处理；不继承主会话或原 Judge 上下文，不读取其他评审输出、人工备份、来源 mapping、历史分数或仓库。路由为当前继承的 Codex 视觉模型，具体服务端版本未暴露；独立性指上下文与答案来源隔离，不声称已经证明不同模型家族的交叉验证。
4. 评审直接查看原始25/50/75%帧；必要时查看同一冻结原片的时间顺序帧。派生预览只能来自该原片，不属于新样本，不生成视频。必须记录实际看到的帧/时间覆盖，不能将稀疏帧称作完整视频观看。无法判断动作或人数时可选择证据不足。
5. 全部首次裁决先保存并计算 SHA256，再由本地 evaluator 解开来源 mapping，仅将 A/B 裁决翻译成 Human/Judge 统计。人工逐项原始答案、匿名 A/B 分类、密文和来源 mapping 均不进入 Git。仓库只保存协议、结果摘要、公开裁决报告与无答案值的差异目录。

## 固定裁决与计数

评审只返回以下五类：`A_CORRECT`、`B_CORRECT`、`BOTH_REASONABLE_TAXONOMY_AMBIGUITY`、`INSUFFICIENT_VISUAL_EVIDENCE`、`TECHNICAL_FAILURE`。来源揭盲后前两类对应 `HUMAN_CORRECT` / `JUDGE_CORRECT`。

- 正确：素材明确支持一方完整分类；不是仅因它标签更多或更少而偏好。
- 双方合理/分类歧义：原定义允许不同合理范围或分类，不能通过事后补充规则强判。
- 证据不足：原媒体可读，但遮挡、模糊、切换、时间覆盖或未明确的对象不足以裁决。
- 技术失败：无法访问或查看原媒体、无法完成任务。不得与证据不足混用。

各字段分母固定为10/21/23；五类计数之和必须等于该字段差异数。不只汇总可裁决项，不把歧义或失败剔除。多标签按整套 Answer 裁决，两个集合都不完整且没有唯一合理映射时不硬判一方正确；解释其分类定义或证据限制。本轮只报告描述性计数，不建立新的通过门槛，也不将差异子集的正确率当作系统整体准确率。

## Schema 分析

保持冻结定义，重点检查：人数统计在一个 Shot 中的时间范围与遮挡；动作的状态/事件、躺姿缺类、说话与可见互动、运动与切镜；物体的关键性、背景是否计入、容器/家具/工具的交叠、“其他”与无关键物体的边界。不能引入剧情、身份、动机或剧集专用规则。

每项返回可见事实观察、所看媒体及分类歧义 flags。公开统计只使用裁决类别及 flags；可见事实解释不得复制人工原答案。Schema 的改进建议与本轮计分严格分开，不实现或启动新 benchmark。

完成公开报告、PROGRESS、自查、commit + push 后 **STOP，等待 Review**；不运行 X1.3、X2 Probe、X2/X2.5 或视频生产。
