# Limited X2 Retrieval Probe v1：当前准备状态

日期：2026-10-07。状态：**准备阶段 INCONCLUSIVE / 总冻结未完成 / 检索未执行**。本提交只归档已有准备材料，不构成运行授权。

## 定位与范围

Objective Evidence Schema v2 的设计已获用户 Review 通过，尚未接入运行。本 Probe 使用现有 X1.2 原始六字段视觉记录与原 OCR sidecar，仅定位 **Legacy Evidence Retrieval Diagnostic**。不做 v1→v2 字段伪映射，不把结果解释为 v2 能力验证。

5 条 Query 文本及组件哈希已锁定；输入范围仍是原 X1.2 的 50 个 Shot 对应原视频区间，不新增样本。原 150 条视觉记录含 130 success、20 failed，失败全部保留。snapshot-index.json 包含 154 个原文件的字节 SHA256；原输入在 baseline commit 中可定位，仓库外字节副本及 transport 文件位置见 checkpoint-file-hashes.json。transport 仅封装原 JSON 字节文本，并非新 Evidence。本提交不重复复制 Evidence 或媒体。

Retriever 组件配置为 Top K=3、5 条首次请求、0 重试，无消融；Prompt、输出审计 Schema、匹配规则及逐 Query 诊断模板见同目录。模板中的结果保持 null：实际使用的旧字段、旧 Schema 无法表达的需求、Evidence 与 Retriever 失败归因均须在未来获准运行并封存首次输出后记录，现在不填假结果。配置还缺实际 runner、权限 guard、最终运行配置/费用边界闭合，因此不是 run-ready。

## Gold 与 Q3 音频回执

原片 SHA256：`7987a13f4df2403d0eb3927a9c1f6b170821077e171afc72df4c95d935f17c9c`，Codex 已复算一致。

旧 Gold SHA256：`b135166511b4fece7cc216067a47a422358d486fa0084848ea293e4b720653e1`，原文件与承诺保留。

新 Gold SHA256：`26da138c9e517722d79bd26a05cf8b26b52d9809b0dc6688419989155683dc94`。原隔离 AGY 评审创建新版，只登记已有 Q3 补核验；新哈希出现在实际任务完成回执。Codex 未读取或独立散列 Gold 文件，也未自行重复听音或口型判断。

音频工具回执已独立核对：原评审会话 step 107 调用 view_file，step 108 返回 DONE、media MIME 为 audio/wav，媒体缓存当时实际存在。此记录证实工具返回音频媒体，不以模型自述代替回执；不证明听觉判定百分之百准确或 Access Gate 在未知 Query 内容的独立上下文中运行。公开回执报告 Q3 补核验已登记，并按原 Query 事件定义评分，未扩为完整 Shot 区间。

Gold 明文、逐条答案、素材 Gold 时间区间、台词核验答案、口令和私有日志均不入 Git。search-scope.json 中的时间仅来自原 50-shot Manifest，是允许公开的搜索范围元数据，不是 Gold。

## 仍未满足的准备条件

- Q5 保持 unverifiable：原全片抽样有间隙，不能据采样未见判事件不存在；本轮仍要求整集核验，不改为只查 50 个区间。
- 隔离 evaluator 尚未公开确认正例在固定 50-shot 范围内含完整目标；不据部分核验报告推定有效。
- 原评审报告已恢复 chmod 000；这是其权限恢复声明，不等于 Retriever 物理隔离边界已验证。未来执行身份须无法接触 Gold、评审日志及本准备报告；需落实实际访问 guard。
- 实际 runner、允许工具/输入、最终配置与代码 hash、费用边界仍待闭合。当前整体未完成冻结、未获准检索。

因此准备结论保持 **INCONCLUSIVE**；不是一次已执行的 Probe 分数，不是 Evidence 或 Retriever FAIL，不升级 Scientific 状态。后续“将负例限定在实际搜索范围”的 v1.1 仅是未批准建议：没有修改当前 Query、Gold 规则、匹配公式、分母或阈值，没有启动新版本。

## 历史与停止状态

本目录 PREPARATION.md 与 GOLD-READINESS-2026-10-07.md 记录较早时点；Q3-SUPPLEMENT-READINESS-2026-10-07.md 记录 Q3 补封存；本 README 与 overall-freeze-status.json 为最新状态。checkpoint-file-hashes.json 记录归档文件字节哈希。

用户授权现状 commit。无检索/Judge 重跑、新样本、新 Evidence 或视频生产；X1.3、正式 X2、X2.5、A8/A9/A10 不启动。历史 Independent Judge Calibration FAIL 永久保留，X1.2 仍为 Engineering PASS / Scientific Pending。完成现状提交后 STOP，等待 Review；本 checkpoint 不能被当作完整预注册或下一阶段授权。
