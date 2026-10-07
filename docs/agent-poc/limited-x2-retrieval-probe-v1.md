# Limited X2 Retrieval Probe v1：中性 Existence Query 与 Gold 闭环

日期：2026-10-07。用户授权修正尚未执行的 Probe 协议。定位仍为 **Legacy Evidence Retrieval Diagnostic**；Evidence Schema 与旧 X1.2 快照原样，未执行检索，未产出新 Evidence。

## 1. 任务、输入与历史边界

Q1–Q5 一律为中性 **Existence Query**。Gold 封存前不得预设任何 Query 为 Positive、Negative 或 Hard Negative；Q5 也可能存在。五条实际 Query 原文在 [queries.json](limited-x2-existence-gold/queries.json)，字节 SHA256 `e684d6d384ae04a7c707317f8486fbb67ccd5f78086153156f7a261cb7c8f711`。不换题、不改写、不新增 Query。

旧版“4正例+1负例/Q5预设Hard Negative”、旧分母及 earlier Gold 仅为历史，见 commit `96682a0f33e7da4362726acf80f807436cb6857a` 及 limited-x2-probe-v1-preparation。它们不是本次中性评审的答案或运行配置，不回改旧实验分数，也不把旧判断直接导入新 Gold。旧 Gold 文件与 SHA256 保留。不是此前建议的“仅核验50个区间”v1.1；本轮仍要求整集原片核验。

检索输入仍是原 X1.2 50-shot 范围内的 150 条原六字段视觉记录（130 success、20 failed）及原 OCR；20 failed 保留，不补事实、不做 v1→v2 映射。整集看听仅用于独立 Gold，不扩检索样本或 Evidence 输入，不运行 X1.3、正式 X2/X2.5 或视频生产。

## 2. 独立原片评审与隔离 Gold

独立评审只接收五条 Query、原 MP4 与冻结任务定义，不读 Evidence、检索输出、Human Anchor、旧 Gold 答案、剧情资料或旧人物规则。不得按 Query 作者的期望选择答案；以原素材实际观察为准。

对五条 Query 分别继续整集核验，隔离 Gold 中每条最终状态只取：

- `confirmed_present`：原素材完整支持 Query，记录全部匹配事件的原视频绝对时间区间 `[start_sec,end_sec)`；必要时跨镜头，不以 L1 Shot/Unit 当 Gold。不扩至整 Shot 来提高 IoU。
- `confirmed_absent`：完成该 Query 所需的整集真实观察，足以支持事件不存在。采样未见、Evidence空数组、人物未识别、字幕无匹配或媒体仅加载成功都不能证明 absent。
- `unverifiable`：观察能力、清晰度、覆盖或定义不足，无法可靠完成判定/全量区间标注；保留实际缺口，不猜答案。不能把有限候选区间伪称全部事件。

Q3 必须实际感知原声音频并核验画面中的说话者。字幕、OCR、ASR、文字稿、音频元信息、播放器播放成功均不能替代听原声。音频不可感知时 Q3=unverifiable。此前音频工具回执可证明该工具曾返回音频媒体，但本次真实核验与整集覆盖仍须据实记录，不能由回执推出答案必然正确。

Q1/Q2/Q4/Q5 主要依据完整视觉核验，独立完成，不因 Q3 音频失败停止。可以使用原视频片段作为观察载体；必须记录真实输入方式、时间覆盖与采样/无法辨认缺口。只审所有镜头的关键帧也可能漏掉镜头内短动作，不能称无间隙整集观察。不依赖剧名、人物姓名、剧情记忆或“本集是文戏”的概括。

完成与可判分开：五项均被处理并记录三态，即可封存一份包含不可判项的 Gold；不得把“已完成标注”写成五项均可评分或系统 PASS。

Gold 明文、三态与事件区间仅存原片评审/evaluator 的仓库外隔离位置。Retriever 必须在受限执行身份下无权读取 Gold、评审缓存/日志、状态映射、公开准备报告及本聊天历史；路径分开或同一所有者可恢复的 chmod 000 声明不独立证明该边界已落实。新旧 Gold 均保留，不覆盖历史。

公开摘要仅允许：原片 SHA256、新 Gold SHA256、协议/Query hash、五项处理是否完成、真实音频媒体接入是否确认、实际视觉覆盖是否完整、一般能力/覆盖缺口、隔离恢复声明。不得公开每条 Gold 状态、区间、逐字答案，亦不得公开 present/absent 数量来暗示结果。

## 3. 冻结、盲检索与揭盲顺序

在 Gold 评审前冻结五条 Query、状态/区间定义、指标/分母规则与本协议 hash；记录原片 SHA256，保持原 Evidence 组件 hash。最新任务附件与登记位于 [limited-x2-existence-gold](limited-x2-existence-gold/README.md)。旧匹配配置中的固定4/1分母已被本协议替代，不能误执行。

本轮只做 Gold，Gold 封存后 STOP。不执行索引/检索/Judge 或下游实验。未来检索仍需单独 Review，且实际 runner、模型配置、费用上限与物理权限 guard 完成 hash 闭合后才能执行；不能因为 Gold 文件已封存就自行开跑。

未来 Retriever 的任务文本只有五条中性 Query 与通用运行规则；数据输入只允许冻结旧 Evidence 和定位元数据。不给作者分类、期望极性、任何 Gold 状态、数量或答案。原准备中已接触 Gold 的本会话及原 Gold 评审会话均不能充当盲 Retriever。每 Query 新上下文、Top K=3、首次一次、0重试，输出缺失/错误也立即封存。

必须先完成五个检索输出/技术失败及其 SHA256 commitment，之后隔离 Evaluator 才读取本轮 Gold 和首次检索结果。Gold 制作者不得依据检索结果修改答案。若其后改变 Query/Gold/规则，只能作为下一轮，不回称同轮 PASS。

## 4. 区间匹配与搜索范围诊断

Gold=present：评有序 Top3 时间区间。匹配条件保持 **Query事实完全支持 AND Temporal IoU≥0.5**，IoU=交集秒数/并集秒数，额外边界容差0。按rank将候选一对一匹配最高IoU的未匹配Gold，并列按Gold原起点/终点；重复候选不重复计分。

Gold=absent：只有合法 `INSUFFICIENT` 为正确拒答；`FOUND` 为误收，`ERROR`/无输出为技术失败且不算正确拒答。

Gold=unverifiable：不计任务 PASS/FAIL，不计正例命中或负例拒答分母；报告未评估和原因。仍保留在计划请求数、完成率、耗时/成本的分母5中，不删题、不补题、不当正确拒答。

Gold 是整集原片事件区间，不能因旧 Evidence 仅覆盖50片段而改写 Gold。揭盲后报告 Gold 事件在索引范围完整包含/部分包含/不包含的数量与覆盖；present但目标不在输入范围时，命中指标仍记未命中并诊断为输入范围不足，不能把该问题自动归因于Retriever排序。所有全片事件纳入整集Gold区间Recall分母，另报可检索范围的覆盖，避免悄悄删除困难事件。

## 5. 指标、动态分母与95%CI（执行前定义）

固定总请求N=5。揭盲后，Evaluator定义P={confirmed_present}、A={confirmed_absent}、U={unverifiable}，nP+nA+nU=5。实际分组由封存Gold决定，运行前不暴露，不预设4/1。无该状态样本则对应指标N/A，不能称100%或通过。

| Metric | 计算与失败处理 | 95%CI |
|---|---|---|
| 完成率 | 合法FOUND或INSUFFICIENT数/5；FOUND须有1–3合法候选；ERROR、无输出、结构非法计0，包含U | Wilson二项95% |
| 可判覆盖 | (nP+nA)/5；另报nP/nA/nU，仅揭盲后公开 | Wilson二项95% |
| Query Hit@3 | P中至少一个完全支持且区间匹配的Query数/nP；缺失、ERROR、INSUFFICIENT、范围不足计0 | Wilson二项95% |
| 区间Recall@3 | P中一对一匹配的Gold事件数/全部P整集Gold事件数G；未命中/失败计0 | 以nP Query为簇bootstrap；Gold全量不可靠时该项N/A并报告原因 |
| Precision@3 | P中一对一匹配候选数/(3×nP)；空位、重复、错误与失败均不命中 | P Query簇bootstrap |
| MRR@3 | P中首个匹配rank倒数之和/nP；未命中/失败计0 | P Query簇bootstrap |
| present误拒 | P中合法INSUFFICIENT数/nP；另报技术失败数/nP | Wilson二项95% |
| absent正确拒答 | A中合法INSUFFICIENT数/nA；FOUND、ERROR、缺失计0 | Wilson二项95% |
| absent误收 | A中FOUND数/nA；技术失败单报且不能当正确拒答 | Wilson二项95% |
| Evidence Support | P中所返回可唯一定位且完全支持Query的candidate claim数/P中所有返回candidate claim数R；每候选一个claim，无法审核计不支持另报coverage；R=0为N/A | P Query簇bootstrap |
| 输入溯源/内容类型 | 可复现引用候选数/全部返回候选数；误收非正片数/全部返回候选数；非法/unknown单报，分母0为N/A；U不形成事实准确性PASS/FAIL | 全部5 Query簇bootstrap，仅描述性诊断 |
| Gold输入覆盖 | 完整落入索引范围的P Gold事件数/G；另报部分包含与范围外事件、至少一完整目标的P Query数/nP | 描述性，不能替换主要命中分母 |
| 时间/成本 | 首次检索开始至第5结果或失败封存的墙钟秒数；实际费用总额、每计划Query费用/5；失败费用保留；不可得unknown | 描述性，不由小样给出系统SLA |

Wilson z=1.959963984540054。bootstrap固定seed=20261007、10000次，按表中Query簇有放回抽样、整簇保留Gold与候选，重新计算比值；2.5/97.5百分位采用线性插值。分母0或簇数<2则CI N/A；零分母重采样记undefined并报比例，不换样本；有undefined时CI N/A。绝不把claim当独立样本。小样CI不证明泛化，不用N/A宣称成功。

U不计PASS/FAIL；P/A技术失败留各自分母。Gold三态与系统INSUFFICIENT不同：前者是评测真值不足，后者是检索输出，不能互相代填。所有原始分母、missing/failed与覆盖并报。

## 6. 结论、失败归因与timebox

不设置Scientific PASS Gate。未检索时无Probe结论。未来有效检索的分状态诊断只评价P/A；U单独未评估。全部5完成、nP>0且nA>0、P全部Hit@3、候选均完全支持/可溯源、无非正片误收、A全部正确拒答时，可判子集标`PROMISING_ON_VERIFIABLE_QUERIES`；否则可判子集为`NEEDS_REVISION`。nP+nA=0、必要指标不可判、或nP/nA某层为0时，整体诊断INCONCLUSIVE，并可报告已有分层数据；nU>0时必须标partial_coverage，不得宣称全5通过。hash漂移/Gold泄漏导致执行INVALID并停止。技术失败不变成Gold unverifiable。

每条未来检索须记录实际旧字段与引用、旧Schema无法表达/自由文本弱表达/观察缺失、Evidence缺失或错误/输入范围不足与Retriever漏召回或误收的证据；无法确定归因则undetermined。只凭没检索到不能证明Evidence缺失。不得为了指标回写答案或变更Schema。

Gold准备timebox≤1工作日；首次检索≤2小时，运行前明确费用上限，无上限不执行。无法完整核验的任务如实封存unverifiable，不无限增加截图或假称完整覆盖；Q3音频失败不阻止四项视觉评审。可选消融不在本轮执行，未来须另行授权和预注册。Gold/人工核验是POC成本，不进入逐集生产Ingest。

## 7. 当前交付与停止

本次按用户指令纠正未执行Probe的Gold闭环，保留Query字节、历史实验、Evidence Schema/旧输入及所有旧承诺。独立原片评审只完成Gold并输出不泄答案的commitment/完成摘要；后续输入/权限guard尚待单独冻结和Review。Gold封存后STOP，不检索，不进入X1.3、正式X2/X2.5、A8/A9/A10，不生成视频。
