# 中性 Existence Query：Gold闭环修正

2026-10-07用户授权修正未执行的Limited Probe v1。五条Query字节不变；不预设任何Positive/Hard Negative。旧准备目录保留历史，不是当前Gold答案或分母配置。

当前规则见../limited-x2-retrieval-probe-v1.md；matching-rules.json定义P/A/U动态分母、TopK=3与匹配。原片评审只读original-media-review-task.json、Query、原片及当前任务规则，不读旧Gold/旧Evidence/检索结果。

本次步骤：冻结任务与协议hash；独立评审继续完整原片核验；Gold答案及区间仅在仓库外隔离保存；只接收新SHA256和不泄漏答案的公开摘要；同步状态并提交后STOP。不能因标注文件已封存就宣称观察完整/五项均可评分。Q3无真实音频则unverifiable，其余四条继续视觉核验。

旧5条作者文本、旧Schema/旧输入与历史实验均不改。未检索，未执行Judge/下游，未新增Evidence或检索样本。公开状态、评审完成摘要与commitment在收到后登记；运行guard/最终配置与费用边界仍未闭合。新Reviewer与未来Retriever必须分离，不能继承评审答案上下文。
