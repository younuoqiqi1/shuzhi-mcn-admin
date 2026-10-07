# Limited X2 Retrieval Probe v1 设计

日期：2026-10-07。状态：`design_only; not_executed; awaiting_review`。目标是检验Objective Evidence字段是否对真实检索有帮助，反推下一轮X1质量指标；不是正式X2、Scientific PASS或Persona/Plan测试。

## 1. 范围、输入与当前阻塞

计划固定**5条Query：4正例+1 Hard Negative**。仅复用既有X1.2的50个Blind Shot所对应的原视频区间，不抽新Shot、不更换30-shot Anchor、不新增推理/新Evidence。索引范围是50个区间的并集，时间使用原视频绝对轴；重叠区间合并计算覆盖，不按Shot当Gold。

本轮只交付Query设计模板，没有确认原片中模板目标真的存在，也没有选择具体person_id/台词/物体、标Gold、读取Human答案或运行Retriever。旧Evidence不自动符合v2；若下一轮获准，须先Review是采用已存在的可审计Evidence快照、还是另行授权产出v2，不能用本设计偷偷开启模型实验。真实Query文本、独立Gold、Evidence快照、配置、阈值及hash未齐全之前**禁止执行**。

匿名Query可使用原素材可见外观描述而非依赖执行Agent的内部person_id；若未来使用person_id绑定，须由隔离协调者冻结身份对应，不泄漏Gold区间，不靠人物姓名规则。

5条模板不是5条已冻结有效测试题，不伪造Manifest/hash。未来由独立作者只看原素材按下面同类约束绑定具体Query，不看Evidence/模型输出/Gold时间；独立标注者在原素材制作Gold，检索执行Agent只收Query与冻结输入，不读Gold。作者/Gold制作属于下一阶段待授权准备，本轮不执行。

## 2. 五条Query模板与目标

| ID / 类型 | 模板（待独立原素材绑定） | 主要检验字段 | 支持/失败边界 |
|---|---|---|---|
| Q1 明确事实 | “找出两位可见人物在室内同一画面出现的区间。” | person_observations、scene、span | 必须同时可见、室内有证据；不推关系；人数optional不能作为唯一通道 |
| Q2 动作 | “找出人物把一个可见物体拿起来的过程。” | observable_actions的event、target_object_id与时间证据 | 需要拿起前后变化；仅持有、镜头切换不算命中 |
| Q3 台词/语义 | “找出有人说出『某句已由原声确认的话的通用改述』的区间。” | OCR/ASR/Fusion、speech_segments | 原声独立确认字面与改述等价，保留否定/时态/限定；不以剧情或未听到的字幕证明对白 |
| Q4 关键物体 | “找出一个有可辨特征的可见物体成为画面主体或参与可见动作的区间。” | key_objects、selection_basis、span | 作者需绑定原片实际对象的中性描述；不能以用途/归属/动机找对象 |
| Q5 Hard Negative | “找出在素材中真实出现的匿名人物，实施某个原素材确认不存在的可观察事件的区间。” | 匿名Person、动作证据、INSUFFICIENT | 人物确实在场，事件不存在；禁止用全集不存在姓名/物体作为容易负例 |

Q1–Q4每类1条，Q5共1条，因此困难负例的在场人物型占比1/1=100%，满足至少一半要求。本轮不用作品名、人名、旧A5/A6/A7、叙事词典或人工剧情时间表。具体模板如果原素材没有正例/无法验证负例，下一轮在执行前记录无法绑定并STOP，不在看结果后替换Query。

## 3. Gold与负例范围

Gold只保存原媒体`media_id + [start_sec,end_sec)`的相关事件区间，必要时跨Shot；Gold制作者直接看/听原素材，不读L1输出或Shot ID。只有完成原视频标注后，evaluator可把Gold与50-shot搜索范围求交得到可检索部分；若事件所需前后条件不完整包含，不能算正例。正例在冻结搜索范围至少有一处完整目标，否则准备INCONCLUSIVE并停止。

负例须同时满足：指定人物在搜索范围可由原素材确认；所需事件在**整个冻结搜索范围**不存在；并遵守交接文档更严格的**整集原视频不存在性核验**，防止把抽样外事件误称全集不存在。仅查50片段或Evidence空数组不足以认证。不能全片独立核验时Q5不可判，整个Probe INCONCLUSIVE，不把它当正确拒答。不得给Agent负例标签或Gold。

Gold/Anchor明文继续存执行Agent/Judge无权读取的隔离位置；仓库只存结构规则、输入清单/Query文本、pre-registration与真值SHA256 commitment，禁止存Gold区间/人工答案。Query冻结后才允许运行、首次输出封存后由隔离evaluator比对。

## 4. 运行前预注册（下一阶段必须完成）

冻结且Review：5个真实Query及ID、原50-shot Manifest hash、原媒体和搜索区间Manifest、实际Evidence输入快照及schema版本、Gold commitment/独立角色、Retriever/索引/embedding/rerank模型和代码/Prompt/运行配置hash、费用计量来源、最大输出K=3、最多5次主检索、不重试、缺失和CI规则、返回结构、拒答阈值、timebox。没有可用费用计量时记unknown，不报零费用。

不得依据Gold/Evidence挑容易Query；Query作者不得看模型预测。所有匹配参数与semantic支持规则在揭盲之前冻结。揭盲后修改只是下一版设计，不回改本轮输出/Gold/阈值或宣称同轮PASS。

## 5. 返回与区间匹配

每个Query返回`FOUND`及有序候选（最多3项），或`INSUFFICIENT`；技术失败记`ERROR`，不能伪装拒答。候选含evidence_id、media_id、原视频start/end、支持的claim引用及原文/来源索引；无需生成视频/新描述。

匹配要求**claim确实支持Query AND Temporal IoU≥0.5**。Temporal IoU=区间交集秒数/并集秒数，不加临时边界容差。错误行为、相反台词、只共现、动机推断即使时间吻合也不匹配。按rank从1到3依次，将候选匹配给尚未匹配且IoU最大的Gold区间；并列按Gold原起点/终点排序。一个候选至多匹配一个Gold，一个Gold至多匹配一个候选；同一事件碎片/重复候选只可命中一次。Gold在冻结前明确事件区间，不靠较长镜头区间放宽IoU。

## 6. 指标、分母、失败与95%CI

固定5条尝试、4正例、1困难负例，全部计划Query保留在分母。unknown Gold或没有完整正例触发准备INCONCLUSIVE，不能剔除后改成4/4。输出缺失、ERROR、超时和结构非法：完成率记失败、正例命中记0、负例拒答记0；不重试。返回INSUFFICIENT是可评分有效输出，正例记误拒，负例才可能正确。

| Metric | 固定计算定义 | 95% CI |
|---|---|---|
| 完成率 | 合法FOUND/INSUFFICIENT数 / 5；FOUND必须有1–3合法候选 | Wilson二项95% |
| Query Hit@3 | 至少一个完整支持匹配的正例Query数 / 4 | Wilson二项95% |
| 区间Recall@3 | 一对一命中Gold事件数 / 4正例全部独立Gold事件数G；ERROR按0 | Query cluster bootstrap |
| Precision@3 | 正例Top3一对一匹配数 / 12；空位、重复、错误均不命中 | Query cluster bootstrap，单位每Query3个槽位 |
| MRR@3 | 4条正例首个匹配rank倒数之和 / 4；未命中为0 | Query cluster bootstrap |
| 正例误拒 | 正例返回INSUFFICIENT数 / 4；另报技术失败数/4 | Wilson二项95% |
| Hard Negative正确拒答 | Q5合法且明确INSUFFICIENT数 / 1；FOUND/ERROR/无输出计0 | Wilson二项95%（n=1不能代表泛化） |
| 负例误收 | Q5返回FOUND数 / 1；技术失败单报不能当正确拒答 | Wilson二项95% |
| Evidence Support | 4正例所返回可唯一定位的candidate claim完全支持数 / 所有返回candidate claim数R；每候选固定一个支持Query的claim，最多12 | Query cluster bootstrap；无法审核计不支持并另报coverage；R=0为N/A |
| 输入溯源/正片过滤 | 引用可复现候选数 / 所有返回候选数；误收非正片候选数 / 所有返回候选数；定位非法/unknown另报 | Query cluster bootstrap；无候选N/A |
| 时间/成本 | 首次检索开始至第5个结果或失败封存的墙钟秒数；实际费用总额与每计划Query费用/5；失败费用保留 | 描述性，不以5次给系统SLA；不可得unknown |

二项Wilson用z=1.959963984540054，边界不采用正态p±误差。Bootstrap固定seed=20261007、10000次，以4个正例Query为簇有放回抽样，整簇保留Gold与Top3，不把claim当独立样本；每次重新计算比值，2.5/97.5百分位取线性插值，零分母重采样记undefined并报占比，undefined>0或原分母0则CI N/A且该Metric INCONCLUSIVE。不用bootstrap越过极小Query集合的泛化限制；负例n=1用Wilson，单独报告分层不足。

Gold不可判与预测unknown分开：Gold不足使整个Probe INCONCLUSIVE并禁止结论；已定Gold但系统无法判断仍留分母，不能算匹配。所有分母原始量和coverage一并给出，未被审核候选不能以无幻觉计正确。

## 7. 诊断规则、字段价值与timebox

本Probe**不设X1/X2 Scientific PASS Gate**；n=4/1只作工程/诊断信号，不沿用旧门槛。执行有效性：5条首次输出或明确失败均封存、hash不漂移、Gold就绪为VALID；hash漂移/Gold泄漏为INVALID并STOP；Gold无法确定/语音评审无声音为INCONCLUSIVE。

有效运行的诊断标签预先定义：完成率5/5、Hit@3=4/4、支持候选全支持、溯源全可复现、无非正片误收、负例正确拒答1/1同时满足时`PROMISING`；否则`NEEDS_REVISION`。任一必要Metric/Gold不可判则`INCONCLUSIVE`优先，不能把CI N/A换为成功。PROMISING也不等于Scientific PASS，95% CI完整报告。本轮没有运行，因此不填任何标签/分数。

字段价值验证优先看相关Query是否有完全支持的首轮命中及能否定位引用；仅凭“用了字段”不能证明必要性。未来若获准，可在**同一冻结Evidence、同一Query/Gold**做一次预注册的有限消融：分别屏蔽scene、actions、key_objects、speech四组索引信息，各5次，共20次，加基线5次最多25次，不重推理或改Evidence。这是可选设计，**本轮不执行，下一轮也须明确授权并在基线结果前冻结**。person_count不进基线索引，没有必要做强制消融；person_consistency继续作为独立保留能力，不凭5Query删去。

消融比较每Query Hit@3、MRR、支持率的paired变化及失败类型；样本太少，不做显著性/因果必要性宣称。若替代字段重复信息，报告无可识别独立增益，不伪称该字段无价值。没有直接需求或证据价值的派生元数据不进语义索引；一轮小Probe无增益的字段仅可提议optional/下一版删除，须Review，不能改已冻结本轮Schema。

准备阶段timebox≤1个工作日（包括Query绑定与独立全片负例核验），首次基线运行≤2小时；包括可选消融在内总≤1个工作日。模型/工具成本上限必须下一阶段Review前明示冻结，未定义不得执行。超出时间/费用停止并保留失败结果，不无限换Query/调参。核心视觉查询无法获得支持时提出OCR+ASR为主/视觉辅助或停止路线等Review选项，不自行升级为人工逐集入库。

Failure Analysis逐Query列：source/input failure、内容类型误判、切镜影响、状态/事件混淆、匿名人物一致性、物体可见性/关键性歧义、OCR/ASR/Fusion或Speaker、retrieval排序、关键词依赖、否定/语义错误、unsupported inference、拒答失败、Gold ambiguity与other。只用封存输入/输出诊断，不修原答案。

## 8. 停止

本轮没有索引、Query绑定、Gold构建、模型调用、检索输出或新Evidence。方案与PROGRESS提交推送后STOP，等待Review；不得自动进入X1.3、正式X2、X2.5或视频生产。一次系统校准后，新素材仍以自动Ingest为目标；Human Anchor/Gold为POC验证成本，不进入每集生产。
