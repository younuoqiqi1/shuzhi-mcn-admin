# 数智博主生产工作台 (POC-AGENT) 进度看板

更新时间：2026-10-07（Asia/Shanghai）
当前分支：`agent-poc/a1-contracts`  
当前阶段：**Objective Evidence Schema v2 设计 Review 已通过（未接入）；Limited Probe v1 中性 Existence Query Gold 闭环**
当前状态：**`legacy_evidence_retrieval_diagnostic; neutral_gold_sealed; full_audiovisual_verification_not_completed; overall_execution_freeze_incomplete; retrieval_not_executed`。用户授权纠正尚未执行的 Probe：Q1–Q5 不预设 Positive/Hard Negative，五条 Query 字节与旧 Evidence 不变。新独立原片评审已封存五项处理记录，但工具连续视觉/真实听觉感知不足，不能宣称整集视听核验完成。不接收或公开逐条答案/状态；Gold封存后 STOP。历史 Independent Judge Calibration FAIL 永久保留，X1.2 仍为 Engineering PASS / Scientific Pending。**
核心决议：**本 Probe 仍只作 Legacy Evidence Retrieval Diagnostic；Top K=3、事实完全支持 AND IoU≥0.5 保持。旧固定4/1分母由当前授权的中性协议替代：首次检索结果封存后，隔离 Evaluator 才以实际 present/absent/unverifiable 分组；present 评 Top3 区间，absent 应返回 INSUFFICIENT，unverifiable 不计 PASS/FAIL。整集 Gold 不缩到50-shot范围。实际 runner、费用及权限 guard 仍须后续冻结与 Review。本轮不检索、不新增 Evidence/样本、不进入 X1.3/正式 X2/X2.5/A8/A9/A10。**
执行责任：🏛️ 全栈架构师 & ⚡ 算法与性能专家 & 📝 技术文档架构师

---

## Limited Probe v1 中性 Gold 闭环（2026-10-07）

- 当前协议：[Limited Probe v1](docs/agent-poc/limited-x2-retrieval-probe-v1.md)；冻结附件：[中性任务与 hash](docs/agent-poc/limited-x2-existence-gold/README.md)。Query SHA256 `e684d6d384ae04a7c707317f8486fbb67ccd5f78086153156f7a261cb7c8f711`，保持旧作者文本；协议 SHA256 `a9b0fe2835465d76cd9de068748a7aeb3ce276470b35909a21918f630225497f`。
- Q3 要求真实原声音频；不能听则 unverifiable。Q1/Q2/Q4/Q5 继续完整视觉核验，不因音频失败停止。稀疏抽帧或全 Shot 关键帧不等于完整时序覆盖，无法确认全部事件/不存在性时须保留不可判。
- 新独立评审不读旧 Gold、Evidence、旧评审日志或检索结果。Gold 明文及私有日志保持仓库外；公开只登记承诺、实际能力/覆盖与五项处理完成摘要，不显示逐条 Gold 状态或数量。Retriever 不得继承本会话/评审会话，实际权限隔离须在后续运行前落实。
- 五项处理已封存，新 Gold SHA256 `c26e03c5df0bdfd127af9b61f62c6fd31621d1e977747e25f304bbe250313634`；实际 hash 操作回执已核对，未读 Gold 明文。详见[封存与能力限制报告](docs/agent-poc/limited-x2-existence-gold/GOLD-CLOSURE-REPORT.md)。媒体成功返回不证明连续视觉或真实听觉感知，整集核验/全部区间枚举未能确认。
- Gold仓库外保存；chmod 400仅为所有者可读的只读权限，不是角色访问隔离。实际Retriever guard未落实，未来必须禁止读取Gold及私有日志/缓存。原片评审已结束，观察用临时媒体已清理；本轮不检索，旧准备/承诺/历史实验/Schema/旧输入不回改，STOP等待Review。

## Limited Probe v1 历史准备归档（commit 96682a0，当前规则已替代）

- 当前说明与公开附件：[准备状态 README](docs/agent-poc/limited-x2-probe-v1-preparation/README.md)。5条Query保持独立作者原文；原50-shot范围不增不换；输入快照154个原文件的字节hash留档，150次视觉记录含130 success/20 failed，失败未剔除。旧Evidence原样，不做v1→v2伪映射。
- 公开音频工具回执已核对：view_file调用后返回DONE、audio/wav媒体；只证明实际音频媒体接入，不证明听觉判定百分之百准确或Gate盲于Query。原评审已登记Q3补核验，Codex未读取Gold明文、未重复原声/口型评审。
- 旧Gold SHA256 `b135166511b4fece7cc216067a47a422358d486fa0084848ea293e4b720653e1`保留；新Gold SHA256 `26da138c9e517722d79bd26a05cf8b26b52d9809b0dc6688419989155683dc94`已由原隔离评审封存，并核到实际任务完成哈希回执。仓库只存公开承诺、配置/清单与报告，不存Gold答案、Gold时间区间、音频、视频或私有评审日志。
- 该历史检查点的逐条状态与固定4/1分母不作为本轮中性评审的输入或答案。chmod 000恢复仅为原评审声明；实际Retriever权限边界、runner/最终配置与费用边界尚未闭合。历史准备INCONCLUSIVE、检索未授权，不产生能力PASS/FAIL分数。
- 本次用户授权提交当前情况。v1.1限定负例到搜索范围仅为建议，未批准、未实施，不改本轮规则。完成现状commit后STOP，不开始后续实验。

## Objective Evidence v2 / Limited Probe v1 历史设计交付（2026-10-07）

- 设计：[objective-evidence-schema-v2.md](docs/agent-poc/objective-evidence-schema-v2.md)、[JSON Schema](docs/agent-poc/objective-evidence-schema-v2.json)、[limited-x2-retrieval-probe-v1.md](docs/agent-poc/limited-x2-retrieval-probe-v1.md)。架构与交接同步新规范及当前状态，旧v1示例标历史，不迁移旧Evidence。
- content_region_type增加正片/片头/片尾/预告/其他非正片/unknown；状态与事件分别定义时间支持；key_objects[]允许空并以通用可见准则选择，不推断关系/用途/动机；Speech保留OCR/ASR与冲突，Speaker不确定时unknown。
- Person Count降optional辅助，Person Consistency保留；boundary与usability独立。所有字段列明下游价值假设，无明确用途的Camera/全局分数等暂移出核心。可选5Query有限消融只作为待单独授权设计，没有运行。
- 当时 Probe 设计固定4正例+1在场人物型困难负例；此预设及分母已被当前中性 Existence 协议替代。历史设计和实验不回改；不宣称 v2 或 X2 Scientific PASS。
- 静态自查：JSON解析、引用/required/闭合定义及约束子集合成检查、本地文档链接、git diff格式通过；未运行完整Draft-07验证器或真实素材实验。748个非本轮修改的已跟踪文件hash不变；AGY文档写入启动受限未执行，Codex完成设计落地。
- 历史13有效Pair、BA0.95/macro-F1 0.9737/CI N/A与INCONCLUSIVE不变；无音频Judge的Speech/Speaker失败不修补；旧Human/Judge/Manifest/Schema/preregistration/报告均保持封存。本轮提交推送后STOP。

## Human Anchor Calibration 准备记录（2026-10-07）

- 只从既有 X1.2 50-shot 按 early/mid/late 各取 10 个，固定随机种子 20261007，不新增样本。
- 冻结附件：`docs/agent-poc/human-anchor-calibration/manifest.json`、`schema.json`、`annotation-guidelines.md`、`preregistration.md`、`hash-commitment.json`。
- 仓库外盲标页：`/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/human-anchor-calibration/annotation.html`。用户已完成标注；独立 Judge 已封存后，由本地 evaluator 核验最终提交、答案摘要和 30/30 Shot、20/20 Pair 完整性。Agent 只读取公开指标，未取得人工明文；未生成 Evidence、未进行 X2 Probe、未进入 X1.3/X2/X2.5。
- 人工答案密文须存仓库外；答案 SHA256 在标注后、Judge 读答案前登记。Holdout 顺序为同剧自动 Ingest，再跨剧自动 Ingest；不得逐集重复 Anchor。人工修正辅助入库即 X1 FAIL。
- 标注进行中的 UI3 勘误：增加可选 Speaker 位置的清除按钮，仅由用户主动撤销当前位置；保留其他答案，加密保存与评分规则不变。未读取人工答案，未运行 Judge/实验；X1.2 仍为 Engineering PASS / Scientific Pending。
- 标注进行中的 UI4 勘误：未填完整可返回上一条，必填校验仅限制下一条和提交；保留部分答案并自动加密保存。样本与评测规则不变，未读取人工答案，未运行 Judge/实验。

- 标注进行中的 UI5 勘误：Speaker 增加“两者都有”，可选位置亦适用；schema 1.2.3，Speaker 来源扩为四分类完全一致评分，分母/阈值/CI 不变，旧标签不自动改写。Judge 输出规则须在运行前冻结，当前未运行 Judge 或实验。
- 标注进行中的 UI6 勘误：schema 1.2.4 与页面增加可选“正文/片头/片尾/不确定”元数据；无需补标，不改变必填项和本轮评分，不剔除冻结样本。交接文档规定未来正文证据池与切片自动排除片头/片尾包装，保留原时间轴；生产实现与验证待后续授权，本轮不改动或运行冻结切分/推理代码、不读取人工答案。
- QA1 材料缺陷：用户截图指出 pair_06 的左帧无可辨人物；pair_09 复用同一来源。配对随机生成且缺少人物可见性预检。预注册 §13 记录问题及后续冻结前预检门禁；本轮不换图/删对/代填，覆盖率分母 20 和原有效样本门槛不变，不读取人工答案、不运行实验。

- 用户完成确认（2026-10-07）：用户报告“好了 完成了”。仅据此登记人工操作完成；最终提交、密文备份及 answer_sha256 尚未核验。下一步只接收仓库外加密备份并登记摘要，不获取口令、不解密、不运行 Judge；X1.2 仍为 Engineering PASS / Scientific Pending。

- 加密备份登记（2026-10-07）：接收仓库外 human-anchor-encrypted-backup.hanchor，外层格式、Manifest 与现有协议文件哈希核验通过；文件摘要 `6265c6c383231720ac12854eae957a27fc9016184719c71a1fa0969069ee2bbb`，浏览器声明答案 commitment `2e244c5a4208929a87bbefbb68646b5ba7867197ce3203de054e5d8651c5b10e`。只提交摘要和状态，不提交密文/答案/口令；未解密重算答案哈希，未认证密文或核验最终提交与完整性。等待 Review，不运行 Judge 或实验；X1.2 仍为 Engineering PASS / Scientific Pending。

- 本轮授权进展（2026-10-07）：用户确认 v4（耗时不评判）与未看过相同 Shot AI 预测；独立 Judge 50 条首次输出已封存，结果 SHA256 `c9e7f51af00f584e313cc22877188a4a26f20b5ea1cad9eb605cf4be3e7d68be`。30 Speech、30 Speaker、15 Boundary 因媒体访问失败留档。evaluator 合成测试 10/10 通过；首次本地隐藏口令输入超时，未解密、未计算真实一致性。当前等待标注者在本地解锁，不能宣称 Calibration PASS。详见 calibration-report.md；下游阶段持续暂停。

- 本地揭盲完成（2026-10-07，承接上文历史记录）：第二次本地解锁成功，仅 evaluator 在内存读取人工答案；密文认证、Manifest、答案重算摘要及冻结 Judge/代码/协议均核验一致。最终提交 true、完成率100%；公开报告 SHA256 `001d2687fce160589265672cfb1ad38b139569f32e54809230d5a7a8051baa10`。Boundary 46.67%、人物数66.67%、Scene 83.33%、Action micro-F1 0.7478 / exact-set 30%、Object micro-F1 0.4938 / exact-set 23.33%；人物一致性 BA 0.95 / macro-F1 0.9737，但有效 Pair 13/20、CI N/A 导致 INCONCLUSIVE；音频因 failed 计错。总裁决 FAIL，126个适用评分差异逐项保留候选分类，非缺失类根因未独立裁决。人工耗时未采集，v4不评判预算。详见 `docs/agent-poc/human-anchor-calibration/calibration-report.md`；STOP 等待 Review。

- Visual Disagreement封存时记录（2026-10-07，来源汇总前的历史状态）：用户接受Independent Judge Calibration FAIL并要求仅诊断现有三个视觉字段。固定54项来自原30 Shot，没有新样本、改标或重跑原Judge。每项A/B随机隐藏来源，mapping加密；人数10、动作21、物体23个首次裁决已封存，commitment SHA256 `29aaf93c4afb6b0d169f0f580ef13c556fab0a351d137efaeb05d805ef33a0ae`。当时来源汇总因桌面弹窗超时未完成，不填写猜测值。

- Visual Disagreement完成（2026-10-07）：用户远程操控看不到Mac系统弹窗；首次裁决封存后，改由本地evaluator将匿名提案与冻结原Judge分类精确匹配，54/54来源唯一确定，不读取人工密文或口令。后处理方式补充单独留档，不回改原预注册。人数10项为Human/Judge/歧义/不足/技术失败=0/6/4/0/0；动作21项=12/4/4/1/0；物体23项=0/1/16/6/0。公开结果SHA256 `2b39988d4f4c3564e2e2d0c7a0beb17c0b73faa472c5336e0203597729f48260`，54条逐项裁决保留。Object关键性/背景纳入/类别重叠定义不足，Action状态/事件、移动及持物边界有歧义；建议仅供Review，不实施Schema或新实验。17项合成测试通过；原Judge、Calibration公开结果、Human commitment、协议/代码/Manifest哈希不变。Person有效Pair13、BA=0.95、macro-F1=0.9737保持INCONCLUSIVE；Speech/Speaker未做视觉裁决，未来须真实音频Judge。详见 `docs/agent-poc/human-anchor-calibration/visual-adjudication-report.md`；STOP等待Review。

## 阶段门禁状态 (Revalidation Path & Gate System)

| 门禁/阶段名称 | 阶段点 | 当前状态 | 准入/通过标准与说明 |
|:---|:---:|:---:|:---|
| **X0 Technology Spike Gate** | X0 结束点 | ✅ **approved** | **2026-10-05 用户明确批准**。完成开源项目源码/License/依赖与认证机制核查；完成 EP18 中立短段（900-930s）四种镜头检测横向对比（VMV原函数/PySceneDetect Content与Adaptive/video-recap-skills）、15张代表帧提取、macOS 原生 Vision OCR 实测；完成成本外推公式与参数化估算；报告交付于 [`docs/agent-poc/x0-technology-spike.md`](docs/agent-poc/x0-technology-spike.md)；正式授权开启 X1.0 |
| **X1.1 Understanding Benchmark** | X1.1 节点 | 🤝 **accepted_for_expansion (保留历史 35/40 人脸与 partial 20/45 视觉，非全 Gate 通过，经用户授权进入 X1.2)** | 完成 45 正式 Gemini 低档全部尝试（44 成功 / 1 服务 503 无重试，核验 44/45=97.8%）；15 母区间完成 47 children（max 26.52s）；OCR/ASR fusion 15 完成；人脸 35/40 校准阈值 0.4067；视觉 partial 20/45 审核覆盖（已审 178 事实 / 真实 2 幻觉）；历史数值完整保留，非全 Gate 科学通过，经 2026-10-06 用户明确授权进入下一批 50 镜头扩展，不再停留于 STOP 旧节点 |
| **X1.2 50-Shot Understanding Benchmark** | X1.2 节点 | ✅ **Engineering PASS / Scientific Pending** | 工程批次完成；首轮 130/150 成功、20 失败、86.67% 是历史结构调用结果，不是科学能力门槛；Codex 已完成 50 个 Shot 的 AI 复核，对照 130 条有效输出标注需修正/不确定项；Human Anchor 已完成、独立 Judge 校准 FAIL，新版 Scientific Gold Gate 尚未通过；20 次模型调用失败沿用原始实验记录；49/50 镜头至少 1 帧成功，35/50 全 3 帧成功，shot_B0031 三帧失败；最长 64.76s 须复核切点；硬字幕快照 45/50 重叠，另 5 未匹配不等于无对白；禁止据工程完成宣称 Scientific PASS |
| **Human Anchor Calibration** | X1 关键校准点 | 🔴 **历史 Independent Judge Calibration FAIL / Review accepted** | d6ac6ca原结论和分数永久保留，不能解释为Gemini Evidence Scientific FAIL；原冻结30 Shot + 20 Pair不变，人工完整度100%。6项FAIL、Scene与Person consistency INCONCLUSIVE。30 Speech、30 Speaker、15 Boundary技术失败已留档，其中65个适用失败纳入评分差异。Person有效Pair13/20未达到15；v4无耗时预算裁决。完整CI与126条适用差异见原calibration-report.md及公开JSON，不按后续裁决回改。一次性Anchor不进入日常Ingest；该Judge路由不继续调参，下游暂停 |
| **Visual Disagreement Adjudication** | X1 诊断，非新Gate | ✅ **已完成 / STOP 等待 Review** | 原30 Shot的count/action/object共54项首次匿名A/B裁决已封存；来源仅在封存后精确匹配恢复，不解密人工备份。Human/Judge正确数12/11、分类歧义24、证据不足7、技术失败0。逐字段与逐项结果见visual-adjudication-report.md及公开JSON。物体关键性/背景/类别重叠，动作状态/事件与范围存在定义问题；裁决不等于绝对人工Gold、不重算历史分数，也不构成Gemini Scientific PASS/FAIL。新建议未实施，无新样本、原Judge重跑或X1.3/X2 |
| **Human Anchor 校准指标预注册** | X1 校准前置 | ✅ **Calibration 指标已冻结** | Human Anchor 各项公式、分母、unknown/missing/failed、CI 及 PASS/FAIL/INCONCLUSIVE 见 `docs/agent-poc/human-anchor-calibration/preregistration.md`。这不是 X1 全量 Scientific Gate；X1 正式门槛仍待预注册 |
| **Objective Evidence Schema v2** | L1 契约设计 | ✅ **design approved（未接入）** | 用户Review已通过设计；内容类型、boundary/usability分离、状态/事件、key_objects、匿名人物与OCR/ASR/Speaker。人物数optional。运行Schema与冻结Anchor未改，未迁移/生成v2 Evidence；本Probe使用旧快照，不验证v2能力 |
| **X1 Evidence v1 (客观证据底座 v1)** | X1 产物节点 | ⏳ **pending (前置未达成)** | 聚合多模态客观证据（镜头时序、代表帧语义、对齐台词、校准后人物聚类），形成防污染、免推断的 L1 结构化证据底座；前置依赖 Human Anchor 校准与 X1 指标冻结正式通过，当前未达成 |
| **有限 X2 probe (Limited X2 Probe)** | X2 探索前置 | ⏸️ **中性 Gold 已封存 / 整集视听未完成 / STOP** | Legacy Evidence Retrieval Diagnostic：Q1–Q5 原文不变、不预设极性；五项处理记录封存，工具能力不足，逐条状态不公开。揭盲后动态分组，unverifiable 不计 PASS/FAIL。原50-shot输入不扩，runner/费用/实际权限 guard 仍待闭合；检索0次，不宣称 Scientific PASS |
| **X2 Gold (检索金标准数据集)** | X2 评测基础 | ⏳ **pending (待构建与预注册)** | **明确 X2 Gold 为原视频时间区间 (Ground Truth Time Ranges in Source Video)**，作为跨镜头语义召回的真实时间对齐真值；**旧 50 query count 仅称历史口径**，新评测集分类（显式/抽象/改写/对抗负例/荒谬输入）、具体样本量及时间区间真值待后续正式预注册 |
| **X2 Semantic Retrieval Benchmark (主评)** | X2 主评节点 | 🛑 **未获准 / 冻结中 (需等待 X1 正式通过与 X2 Gold 就绪)** | 多类别需求盲测检索、跨镜头时序召回准确率及 INSUFFICIENT 拒识率验证；**旧 X2 阈值及旧 50 query 仅称历史口径，新阈值待预注册**；主评测当前严格未获准，维持冻结 |
| **X2.5 Persona / Plan (角色与编导盲测)** | X2.5 节点 | 🛑 **未获准 / 冻结中** | 后续最低设计 2 Persona × 5 Topic；Agent 接收匿名 Persona 卡生成条件化 Plan，Persona 标签映射对 Agent 与独立评审隐藏；评审盲判 Persona 归属并核验证据支持和事实错误；当前未获准且不执行 |
| **X3 / X4 (成片生产与双博主验证)** | X3/X4 最终节点 | 🔒 **锁定 (Locked)** | X3 全流程成片视听渲染质检与 X4 双博主同素材差异化 A/B 视听验收；在底层理解与检索能力未建立扎实金标准门禁前全面锁定，禁止启动 |
| **A8/A9/A10 (旧生产管线)** | 旧节点 | 🛑 **全面冻结** | 因 L1 虚假描述/时间表依赖、A5 人名关键词依赖、A6 预写模板及成片伪造字幕/画面不符事故，已全面冻结，不修改其实现，不继续投入 |

---

## X1.1 重验基线与执行状态 (Revalidation awaiting_human_review)

- **授权与执行说明**：
  - 当前阶段状态变更为 **`X1.1 awaiting_human_review`（人脸 35/40 真实标注已校准阈值 0.4067；视觉仅 partial 20/45 完成，含 2 条真实幻觉，无 50-shot Gold，维持 STOP 等待 Review）**；
  - 报告 [`docs/agent-poc/x1.1-revalidation-report.md`](docs/agent-poc/x1.1-revalidation-report.md) 已由真实汇总器重新生成，不采用 AGY 自写统计；
  - **真人审核材料入口**：[`review.html`](/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/x1_1-review/review.html)（真实本地地址：`/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/x1_1-review/review.html`，含 40 pairs 45 帧）；
  - 保留历史 X1.0 `awaiting_review` 记录为当时阶段终点，不改旧 A5–A8 Legacy 能力口径、不宣称用户批准 X1.0 科学通过；
  - 人脸 35/40 真实人工标注已完成校准（阈值 0.4067，Holdout 18 混淆 7/0/0/11，共享 11 face 局限）；视觉事实核验当前仅为 partial 20/45 覆盖（已审 178 事实 / 2 真实幻觉，分母 180，幻觉率 1.11% 仅代表已审子集；用户口头抽查基本正确采用画面坐标系，定性意见不覆盖 2 条真实幻觉）；语音 WER / CER 仍 pending；无 50-shot Gold，**不说全部 X1.1 已通过，不宣称科学 PASS**；
  - **X1 整体未通过，X2/A8/A9/A10 维持冻结，不进入 50-shot Gold**；
  - 本轮提交后严格 **STOP 等待真人审核与 Review**；所有“完成率/通过”指标严禁从自评推断。
- **X1.1 四项核心工作基线与实测执行事实**：
  1. **固定 45 代表帧与云端大模型推理 (VLM)**：
     - 基于原 15 个盲抽 Shot（15 blind）固定的 45 个代表帧锚点（45 anchors）；
     - 模型调用：采用 Gemini Pro low（低推理档，温度由Provider管理且未知）经由 AGY CLI 执行全部 45 次正式尝试（无商业 API、无本地模型）；
     - 实测结果：**44 次成功，1 次遭遇服务端 503，无重试**；
     - 独立核验：通过 Native Schema + Trace + 原图与推理 ImageHash 逐帧独立核验，合规成功 **44/45 = 97.8%**；实际包含 1 次 503 异常，严禁预写 45/45。
  2. **镜头切分与时长控制 (Shot Splitting)**：
     - 对原 15 个盲抽父镜头切分为 47 个子镜头（47 children / 32 cuts），实现 15 个父区间全覆盖（15 全 coverage）；
     - 实测最长子镜头26.52秒（非人工设置上限）（三个 50+ 秒 parent 超长镜头分别切分为 9、8、7 个子镜头）；
     - 完全基于纯视觉客观变化切分，**绝无剧情假设、绝无人名关联、绝无人工边界干预**。
  3. **多模态台词比对 (OCR + ASR Timeline Alignment)**：
     - 15 个母区间 OCR/ASR timeline fusion 全部完成；涵盖 90 段 existing OCR 台词数据与 90 段 existing real X1.0 ASR（mlx-whisper tiny）音频识别结果；
     - 对齐分布情况：产生 **34 条共识 (consensus)、43 条冲突 (conflict)、13 条仅 OCR 检测到 (ocr-only)、27 条仅 ASR 检测到 (asr-only)**；
     - 原文完整保留冲突与独立检出；**因缺乏独立真实语音/字幕真值标注（Ground Truth），缺 CER/WER 真值，绝不自宣科学 PASS**。
  4. **人脸特征校准与视觉部分审核事实 (Face Calibration & Partial Human Review)**：
     - 人脸 40 匿名对基于 35 真实真人标注（14 same, 21 different, 2 uncertain, 3 null）完成校准，推荐阈值 **0.4067**；Holdout 18 对混淆矩阵为 7/0/0/11（F1=1.0），明确限制声明：两集共享 11 face_id 仅保证 pair-disjoint 而非 person-disjoint，不可夸大为全集 Gate；
     - 45 帧客观视觉事实判定当前仅为 **partial 20/45 审核覆盖**（已审 178 事实陈述，包含真实 2 条幻觉标注，总分母 180，幻觉率 1.11% 仅代表已审子集，不可声称全体）；
     - 用户口头抽查基本正确（采用画面左右坐标系，不确定不用人物解剖学左右），但定性意见绝不覆盖 JSON 中真实标注的 2 条幻觉记录；
     - 无 50-shot Gold，语音 WER / CER 待人工校对；严格维持 STOP 等待 Review。

---

## X1.0 真实模型小样摸底交付记录 (Smoke Validation Baseline - 历史阶段终点)

- **范围与科学性声明**：
  - 本次交付为 **X1.0 真实模型小样摸底（Smoke Validation）**，仅验证本地开源模型推理管道的可执行性与真实输出表现；
  - **因无独立 Gold 标注文档，绝不自宣科学 PASS**；
  - **缺少 macOS Vision OCR 与 OCR/ASR Timeline Fusion 等完整 X1 范围，明确声明不属于完整 X1 交付**；
  - **X1.0 阶段当时记录：X1 整体未通过，当时不进入 X1.1 与 X2；用户要求结果提交后严格 STOP review，全面停止后续开发，等待人工审核裁决**。
- **报告与产物索引**：
  - 摸底评估报告：[`docs/agent-poc/x1.0-smoke-validation.md`](docs/agent-poc/x1.0-smoke-validation.md)
  - 实验产物与数据目录：[`benchmarks/x1/`](benchmarks/x1/)
- **真实小样实测事实记录**：
  1. **盲抽采样与代表帧**：从 EP18 全片按视频前、中、后时段各 5 个 Shot 进行盲抽，共 15 个 Shot；每 Shot 按 25%、50%、75% 提取真实代表帧，共提取 45 张代表帧。
  2. **语音转写 (ASR)**：真实调用本地 `mlx-whisper tiny`，15 次调用全部成功，产出 10 条有文本输出与 5 条空文本；5 条空文本原因未核验，可能无语音或 tiny 漏识别，10 条有输出不可称识别真实正确对白；WER/CER 未评定。
  3. **视觉多模态大模型 (VLM)**：真实调用本地 `Qwen2-VL-2B 4bit` 对 45 张代表帧进行结构化推理；45 帧中 **20 帧 Schema 输出成功，25 帧 rejected**（模型输出格式/结构未合规被拒）；15 个 Shot 中 **3 个 Shot 实现三帧全结构成功，12 个 Shot 包含拒识**；**所有生成的视觉语义观察待人工审核**。
  4. **人脸检测与匿名特征聚类**：采用 `YuNet + SFace`，共产生 50 次人脸检测记录，聚类生成 **31 个匿名算法特征簇**（余弦相似度阈值 0.55 尚未校准，跨镜头一致性 F1 未评定，**明确记为算法特征簇，不称 31 人**）。
  5. **当时流程控制**：旧 A8/A9/A10 维持冻结；当时原地 STOP，等待审核。（现已由用户明确授权开启 X1.1 重验基线）。

---

## 旧 A0–A10 历史实施状态表（Legacy Baseline，AI 能力未经独立科学验证）

> [!WARNING]
> **口径重置与免责声明**：下表记录的是项目历史工程实施与阶段验收产物。**所有历史“Approved”和自动化测试全绿仅证明当时的代码工程结构、接口契约与手工固件测试通过，绝对不代表 AI 核心能力已验证、不代表通过科学 Benchmark、亦不代表真实人工内容验收通过。** 原“总体完成度 95%”系指代码工程搭建进度，存在严重能力误导，现已彻底废除。根据 2026-10-05 独立技术审计（`poc-independent-audit.md`），旧实现未调用任何 LLM/VLM，检索与视角解读基于硬编码词表与模板。A8/A9/A10 维持冻结状态，不修改其实现。

| 阶段 | 历史权重 | 当前定位与状态 | 历史交付物 / 产物链接 | 状态说明与审计口径重置 |
|:---|---:|:---:|:---|:---|
| **A0. 架构设计与 Topic-First 接线方案** | 10% | ⚠️ **Legacy 架构设计** | [`docs/agent-poc/agent-poc-architecture.md`](docs/agent-poc/agent-poc-architecture.md) | 确立 Topic-First 与 L1/L3 分离思想（保留）；但原 A0–A10 阶段拆分过度，实现层绑死特定剧集与硬编码规则 |
| **A1. 跨模块数据契约与 Job 状态机** | 8% | ⚠️ **Legacy 工程契约** | [`src/contracts/`](src/contracts/)<br>[`tests/contracts.test.mjs`](tests/contracts.test.mjs) | 核心 Schema 与状态机在工程代码层面可用（测试 14/14）；作为软件结构保留，但业务模型能力未经独立验证 |
| **A2. 稳定客观 Evidence 库 (L1) 摄取** | 8% | ⚠️ **Legacy (自动客观理解未验证)** | [`src/evidence/`](src/evidence/)<br>[`tests/evidence-store.test.mjs`](tests/evidence-store.test.mjs) | 仅实现数据存储与 VMV Stage 1 解析结构；经审计核查当时仅覆盖前 1800s 且依赖规则，**自动客观素材理解完全未经验证** |
| **A3. 共享 Generic Narrative Affordances (L2) 库** | 8% | ⚠️ **Legacy (能力未验证)** | [`src/affordances/`](src/affordances/)<br>[`tests/affordance-store.test.mjs`](tests/affordance-store.test.mjs) | 仅建立静态标签匹配框架（`aff.tag.includes`），对 POC 核心 AI 假设无实质贡献，推迟至多集阶段验证 |
| **A4. Topic-First 创意生成链路** | 10% | ⚠️ **Legacy (未接主链路/未验证)** | [`src/operations/`](src/operations/)<br>[`tests/operations-orchestrator.test.mjs`](tests/operations-orchestrator.test.mjs) | 确立 Topic-first 状态机；但实际上未被 A5 或主生成脚本调用，未真实接入主生产链路，业务泛化能力未经验证 |
| **A4.5. 真实 L1 Evidence 补齐与覆盖率核验** | 4% | ⚠️ **Legacy (自动客观理解未验证)** | [`docs/agent-poc/a4.5-evidence-enrichment-report.md`](docs/agent-poc/a4.5-evidence-enrichment-report.md) | 提取 857 条真实 OCR 台词；但场景切分与视觉信息仍包含人工规则与模板，自动客观理解未验证 |
| **A4.5.1 尾部连续补齐与生成来源审计** | 4% | ⚠️ **Legacy (自动客观理解未验证)** | [`docs/agent-poc/a4.5.1-review-fix-report.md`](docs/agent-poc/a4.5.1-review-fix-report.md)<br>[`tests/evidence-enrichment.test.mjs`](tests/evidence-enrichment.test.mjs) | 补齐 235 个连续场景；但核心场景划分依赖人工手写 `EP18_REAL_SCENE_MAP`，动作描述含人工模板与取模生成，自动客观理解未经验证 |
| **A5. 候选镜头召回检索管道** | 10% | 🛑 **Legacy (能力未经独立验证 / 被审计否决)** | [`src/retrieval/`](src/retrieval/)<br>[`docs/agent-poc/a5-retrieval-report.md`](docs/agent-poc/a5-retrieval-report.md)<br>[`tests/candidate-retrieval.test.mjs`](tests/candidate-retrieval.test.mjs) | 历史测试 62/62 仅证明代码流转。经审计对抗实验证实：所谓语义匹配实为专有人名与剧情关键词 fallback，分词词典写死人名与台词，不是真 semantic；去掉人名后无法召回意图需求，荒谬需求同样能通过，能力未经独立验证 |
| **A6. 动态 Perspective Re-reading** | 12% | 🛑 **Legacy (能力未经独立验证 / 被审计否决)** | [`src/perspective/`](src/perspective/)<br>[`docs/agent-poc/a6-human-gate-review.md`](docs/agent-poc/a6-human-gate-review.md)<br>[`docs/agent-poc/a6.3-evidence-closing-report.md`](docs/agent-poc/a6.3-evidence-closing-report.md)<br>[`tests/perspective-rereading.test.mjs`](tests/perspective-rereading.test.mjs) | 历史解读文本为根据 topic_id 分支的手写模板，换 Persona 产生逐字相同文本，非 persona-conditioned 模型推理；87.5% 仅为系统自评（human pending，gate_passed: false），未经真实人工通过；修正原关于“零出镜”等未验证剧情断言；已被审计否决 |
| **A7. Director 真实证据终编服务** | 10% | 🛑 **Legacy (能力未经独立验证 / 被审计否决)** | [`src/director/`](src/director/)<br>[`docs/agent-poc/a7-director-report.md`](docs/agent-poc/a7-director-report.md)<br>[`docs/agent-poc/a7-director-preview-topic-b.md`](docs/agent-poc/a7-director-preview-topic-b.md)<br>[`tests/director-final.test.mjs`](tests/director-final.test.mjs) | Plan 基于人工预写并原样写回，非自主 AI Director；Topic B 违反 A6 Top3 约束；门禁实为针对已知事故写死的特定规则；能力未经独立验证 |
| **A8. VMV Stage 4/5 真实生产对接与 MP4** | 8% | 🛑 **Legacy (人工视听 FAIL / 全面冻结)** | [`outputs/production/topic_b_final.mp4`](outputs/production/topic_b_final.mp4)<br>[`outputs/production/topic_a_final.mp4`](outputs/production/topic_a_final.mp4)<br>[`docs/agent-poc/a8-e2e-production-report.md`](docs/agent-poc/a8-e2e-production-report.md)<br>[`tests/production-e2e.test.mjs`](tests/production-e2e.test.mjs) | 仅证明结构化剪辑单到真实 MP4 的底层工程渲染管道可运行；内容层面成片含伪造台词字幕与严重音画不符，人工视听审查判 FAIL 并冻结，不能叫泛化 E2E 成功；不修改其实现 |
| **A9. 动态解释向通用 Affordance 受控回流** | 4% | 🛑 **全面冻结** | 知识回流流水线设计 | 全面冻结，在 X1/X2 核心假设验证通过前严禁启动 |
| **A10. 双博主同素材 A/B 验证验收** | 4% | 🛑 **全面冻结** | 双博主视听成品设计 | 全面冻结，在 X1/X2 核心假设验证通过前严禁启动 |

---

## 阶段产物与历史执行清单 (A1→A8 Legacy Baseline，保留历史链接)

> [!NOTE]
> **历史存根说明**：以下保留历史工程实施过程中沉淀的各阶段交付物、代码及测试链接。**所有历史标记为“(Approved)”的条目仅代表当时特定的代码工程结构与测试固件通过，绝不能代表 AI 核心能力已通过科学 Benchmark 或真实人工内容验收。** 根据独立技术审计结论，旧实现未调用任何 LLM/VLM，旧 A5–A8 核心逻辑已被审计否决，旧 A2–A4 自动客观理解均未经验证。A8/A9/A10 维持冻结状态，不修改其实现。

- [x] **A1 (Legacy 工程实现)**：正式数据契约、通用校验器、Job 状态机、VMV Stage 4/5 适配器与测试固件，测试 14/14 通过。仅验证了工程数据结构，业务模型能力未经验证。产物：[`src/contracts/`](src/contracts/)、[`tests/contracts.test.mjs`](tests/contracts.test.mjs)。
- [x] **A2 (Legacy 工程实现 - 自动客观理解未验证)**：L1 客观 Evidence Schema 规范、VMV Stage 1 产物解析、防污染只读 EvidenceStore，测试 5/5 通过。仅摄取了前 1800s 数据结构，场景区间依赖人工时间表与规则，**全片自动客观素材理解完全未经验证**。产物：[`src/evidence/`](src/evidence/)、[`tests/evidence-store.test.mjs`](tests/evidence-store.test.mjs)。
- [x] **A3 (Legacy 工程实现 - 能力未验证)**：L2 Generic Narrative Affordance 数据模型、一对多增量 AffordanceStore、受控晋升接口骨架，测试 3/3 通过。仅建立标签匹配框架（`aff.tag.includes`），对 POC 核心 AI 假设无实质贡献，能力未经验证，推迟至多集阶段。产物：[`src/affordances/`](src/affordances/)、[`tests/affordance-store.test.mjs`](tests/affordance-store.test.mjs)。
- [x] **A4 (Legacy 工程实现 - 未接主链路/未验证)**：Topic-First 运营任务编排服务 ([`src/operations/operations-orchestrator.mjs`](src/operations/operations-orchestrator.mjs))：
  - 确立 Topic-first 状态机：`ideating` $\rightarrow$ `awaiting_direction_review` $\rightarrow$ `retrieving`；
  - `MaterialRequirement` 重构为 `desired_*` 诉求语义与防伪装测试（测试 4/4 通过）；
  - **审计核实**：该模块实际未被 A5 或主生成脚本调用，未真实接入主生产链路，业务泛化能力未经验证。
- [x] **A4.5 (Legacy 工程实现 - 自动客观理解未验证)**：真实 L1 Objective Evidence 基础补齐与 130 vs 325 场景分析报告：[`docs/agent-poc/a4.5-evidence-enrichment-report.md`](docs/agent-poc/a4.5-evidence-enrichment-report.md)。提取了 857 条真实 OCR 台词，但场景划分仍基于人工规则，自动客观理解未验证。
- [x] **A4.5.1 (Legacy 工程实现 - 自动客观理解未验证)**：Canonical Evidence 尾部补齐与来源审计（测试 50/50 通过）：
  - 权威检索数据集：[`src/evidence/data/canonical_evidence_qianfu_ep18.json`](src/evidence/data/canonical_evidence_qianfu_ep18.json)；
  - 来源审计与段级继承衰减机制落地（`independent_keyframe` vs `segment_inherited`）；
  - 保留复现配置：[`src/evidence/config/canonical-manifest.json`](src/evidence/config/canonical-manifest.json)；
  - **审计核实**：全片场景切分基于人工手写 `EP18_REAL_SCENE_MAP`，动作描述含人工模板与序号取模生成（`actions_pool`），**全片自动客观理解完全未经验证**。
- [x] **A5 (Legacy 工程实现 - 能力未经独立验证 / 后被审计否决)**：候选镜头召回检索管道（测试 62/62 仅代表代码流转）：
  - 交付接口服务 [`src/retrieval/retrieval-service.mjs`](src/retrieval/retrieval-service.mjs)、L2 种子库 [`src/retrieval/data/seed_l2_affordances.json`](src/retrieval/data/seed_l2_affordances.json) 与技术报告 [`docs/agent-poc/a5-retrieval-report.md`](docs/agent-poc/a5-retrieval-report.md)；
  - **审计结论与对抗实验否决**：所谓语义检索实为 5 组固定专有词（晚秋/翠平/站长/南京/金条等）命中次数的关键词 fallback，代码内自标 `is_fallback: true` 但下游报告误称为 semantic；分词词典写死角色名与特定台词；去人名后意图召回失效，荒谬输入（如“橘猫追鸽子”）与真实需求得分无法区分；**能力未经独立验证，已被技术审计否决**。
- [x] **A6.1 / A6.2 / A6.3 (Legacy 工程实现 - 能力未经独立验证 / 后被审计否决)**：动态 Perspective Re-reading 与门禁（测试 83/83 仅代表代码流转）：
  - 交付产物：[`src/perspective/`](src/perspective/)、[`docs/agent-poc/a6-human-gate-review.md`](docs/agent-poc/a6-human-gate-review.md)、[`docs/agent-poc/a6.3-evidence-closing-report.md`](docs/agent-poc/a6.3-evidence-closing-report.md) 与评测记录 [`src/perspective/results/a6_human_gate_review.json`](src/perspective/results/a6_human_gate_review.json)；
  - **审计结论与模板问题否决**：A6 视角解读文本系按 `topicId` 分支（`isWuTopic` / `isProbeTopic`）调用的手写预置段落，非 persona-conditioned 模型推理；换 Persona 生成逐字相同文本；
  - **自评冒充通过否决**：历史上宣称的“Top3 Gate 87.5% 正式批准通过”实为系统自评（实际记录为 `reviewed_requirements: 0`，24 个 candidate 的 `human_verdict` 全部为 `pending`，`gate_passed: false`），未经真实人工审核，已被审计否决；
  - **修正错误剧情断言**：修正历史记录中将角色未记录作为事实宣称的断言（原依据 L1 记录判退，不应断言为客观全片事实）；修正“Top3 100% 回归真实火车站台蒸汽告别镜头”等错误剧情断言（真实抽帧已证实该段画面并非车站告别），不新增任何剧情推测。
- [x] **A7 / A7.1 (Legacy 工程实现 - 能力未经独立验证 / 后被审计否决)**：Director 证据终编与时长预算（测试 99/99 仅代表代码流转）：
  - 交付时长预算工具 [`src/director/duration-budget-config.mjs`](src/director/duration-budget-config.mjs)、技术报告 [`docs/agent-poc/a7-director-report.md`](docs/agent-poc/a7-director-report.md)、双选题预算表 [`docs/agent-poc/a7.1-duration-budget-topic-b.md`](docs/agent-poc/a7.1-duration-budget-topic-b.md) / [`docs/agent-poc/a7.1-duration-budget-topic-a.md`](docs/agent-poc/a7.1-duration-budget-topic-a.md) 及预写 Plan/工单产物；
  - **审计结论与决策能力否决**：Plan 基于人工预写 JSON 并原样写回，非自主 AI Director；Topic B 甚至违反自身的 A6 Top3 约束；所谓五维门禁为已知事故写死的特定规则；能力未经独立验证。时长预算与工程框架可供后续参考。
- [x] **A8 (Legacy 工程实现 - 内容人工视听 FAIL / 全面冻结)**：MCN 后台 → 真实生产链 → MP4 真实端到端交付（测试 106/106 仅代表工程测试通过）：
  - 交付产物：[`outputs/production/topic_b_final.mp4`](outputs/production/topic_b_final.mp4)、[`outputs/production/topic_a_final.mp4`](outputs/production/topic_a_final.mp4) 与报告 [`docs/agent-poc/a8-e2e-production-report.md`](docs/agent-poc/a8-e2e-production-report.md)；
  - **工程管道可运行性**：验证了 MCN 后台任务调度与 VMV Stage 4/5 剪辑单驱动真实裁切、TTS 合成、混音降噪、字幕烧录与 FFmpeg 封装的底层工程渲染管道可跑通；
  - **内容人工视听 FAIL 与冻结决议**：两支 MP4 在人工视听审查中严重失真，画面出现伪造台词字幕重叠（叠在原片硬字幕上）与严重音画脱节事故（如“暗夜撤离”配白天田野、台词与出镜人物不符），人工审查已判 FAIL 并冻结，绝不能称为泛化 E2E 成功；
  - **当前状态**：全面冻结，不修改其代码实现；不生成新正式成片，核心能力全面交由 X0–X4 重新验证。
- [x] **A9 / A10 (全面冻结)**：严格禁止进入 A9 知识回流与 A10 双博主验收；在 X1/X2 核心假设验证通过前全面冻结。

---

## 审查审计日志 (Audit Log)

> [!NOTE]
> **历史存根说明**：本日志完整保留历史开发流转过程记录。**其中所有历史记录的“Approved”仅代表当时特定的软件工程阶段性代码交付状态，并不代表 AI 核心能力得到验证或内容通过验收。** 历史实现已被 2026-10-05 独立技术审计（`poc-independent-audit.md`）全面否决与重置。

1. **2026-10-05 02:35**：A0 方案经审查正式通过（通过 Gate 1: A0 Review Gate），授权开启 A1。
2. **2026-10-05 02:40**：完成 A1 契约规范与状态机，Commit `a2f91ef`，推送 GitHub。
3. **2026-10-05 02:43**：完成 A2 L1 客观 Evidence 接入与真实 VMV Stage 1 产物解析，Commit `dd5f0d9`，推送 GitHub。
4. **2026-10-05 02:45**：完成 A3 L2 通用叙事潜能模型、AffordanceStore 与受控晋升接口骨架，Commit `64f915a`，推送 GitHub。
5. **2026-10-05 02:47**：提交 A4 初版，提出 review 申请。
6. **2026-10-05 08:55**：A1-A4 审查反馈：**A1/A2/A3 approved；A4 changes_requested**。
7. **2026-10-05 09:02**：完成 A4 所有要求修订，44/44 测试全绿，当前状态重新设为 **`awaiting_review`**。
8. **2026-10-05 09:20**：A4.1 Review 审查通过，授权开启 A4.5 Evidence Enrichment。
9. **2026-10-05 09:50**：完成 A4.5 真实客观素材补齐与覆盖率深度核验，交付报告，状态设为 `A4.5 awaiting_review`。
10. **2026-10-05 10:16**：A4.5 Review 反馈：**`changes_requested`**。
11. **2026-10-05 10:30**：完成 A4.5.1 阻塞问题全量修复，交付 Canonical 数据集（235 场景，0~2702.013s 连续无空洞）、来源审计机制、Manifest 配置与构建脚本、20 个抽查表，全工程 50/50 测试全绿，状态设为 **`A4.5.1 awaiting_review`**。
12. **2026-10-05 10:55**：A4.5.1 Review 审查正式通过（approved），授权进入 POC-AGENT A5 阶段。
13. **2026-10-05 11:05**：完成 POC-AGENT A5 全部交付：实现 CandidateRetrievalService、四路 Hybrid 匹配器、概念网透明 Fallback、L2 潜能库、多样性重排与质量衰减、双真实选题（吴站长怀疑 / 危险试探）E2E 检索与 Top20 持久化产物、Usability 人工抽样审计、全套 62/62 测试通过，状态设为 **`A5 awaiting_review`**。
14. **2026-10-05 11:15**：A5 Review 审查正式通过（approved），授权进入 POC-AGENT A6 阶段。
15. **2026-10-05 11:25**：完成 POC-AGENT A6 初版交付，提交报告，Commit `5d45f83`。
16. **2026-10-05 11:35**：A6 Review 反馈：**`changes_requested`**。指出系统自评冒充人工 Gate 以及 Fallback 边界不透明问题，要求执行 A6.1。
17. **2026-10-05 11:50**：完成 A6.1 审查修复：实现独立 `HumanGateEvaluator`，隔离系统推荐与真人门禁，生成 8 需求独立人工验收包（`human_verdict` 均为 `pending`），全工程 75/75 测试全绿，状态设为 `A6.1 awaiting_human_review`，Commit `d38bf9d`。
18. **2026-10-05 12:00**：A6.1 人工审查反馈：**`FAIL / changes_requested`**。指出 4 大核心内容质量阻塞，要求执行 A6.2 修复生成链。
19. **2026-10-05 12:10**：完成 A6.2 修复：重构 `build_canonical_evidence.mjs`，校准东来顺涮肉馆（谢若林/余则成），剔除 `scene_0125` 吴敬中，引入 370 个 Retrieval Units，落地一致性校验器，全工程 81/81 测试全绿，状态设为 `A6.2 awaiting_human_review`，Commit `2842165`。
20. **2026-10-05 12:40**：A6.2 人工审查核定 7/8 requirements usable（可用率 87.5% >= 80%），但指出两项收口问题（`req_wu_03` 检索偏离判定 unusable、`req_probe_04` 片尾 OCR 演职员表/歌词污染），要求执行 A6.3。
21. **2026-10-05 12:45**：完成 POC-AGENT A6.3 全部收口修复：基于当时 L1 缺少机要室与特定人物记录，`req_wu_03` 判为 `INSUFFICIENT_EVIDENCE`（注：原“李涯零出镜”属历史未验断言，不可作为事实宣称）；演职员表与歌词过滤清洗（污染率 0%）；测试 83/83 全绿；Commit `28accfb`。
22. **2026-10-05 12:50**：A6 Final Review 审查正式批准通过（**APPROVED**），授权进入 POC-AGENT A7: Director Final 阶段。
23. **2026-10-05 13:05**：完成 POC-AGENT A7 初版交付，Commit `6a2ef5f`。
24. **2026-10-05 13:10**：A7 Review 审查反馈：**`changes_requested`**。指出 `req_wu_03` 不应创建虚假生产分段且成片不应对观众解释缺失，以及必须建立 Narration Duration Budget 证明每段说得完。
25. **2026-10-05 13:20**：完成 POC-AGENT A7.1 全部收口修复：
    - `req_wu_03` 落实 merge 决议，不产生虚假生产分段，Topic A 精简为 3 段且立意自然合并；
    - 落地 Narration Duration Budget 集中配置与估算体系，双选题全分段 **100% duration_fit = true**；
    - 全工程 **99/99 自动化测试全绿**（新增 4 项 A7.1 专项测试）；
    - 导出独立时长预算审计表与更新真人视听预览；
    - 当前状态正式设为 **`A7.1 awaiting_final_review`**，原地彻底停止，严禁进入 A8。
26. **2026-10-05 13:38**：A7.1 Final Review 审查正式批准通过（**APPROVED**），授权开启 POC-AGENT A8 阶段。
27. **2026-10-05 14:00**：完成 POC-AGENT A8 端到端全链路交付：
    - 接通真实 `video-moment-validation` Stage 4/5 消费端，落地 `src/vmv/render.py` 与 `vmv render` 命令；
    - 建立真实 `ProductionJobService` 与流式视频服务器 `McnBackendServer`，并在 MCN 后台嵌入原生视频播放器；
    - 真实执行《潜伏》第18集源片裁切、TTS 合成、原声/旁白/闪避/L-cut 混合与字幕烧录；
    - 成功生产第一条成片《余则成最危险的一次试探》（40.44s）并通过全量技术 QC；
    - 零改代码成功复跑第二条成片《吴站长什么时候开始怀疑余则成？》（39.48s），生成独立新 Job、新工单与新 SHA-256；
    - 全工程自动化测试扩展至 **106/106 passed**（0 failed）；
    - 交付验收报告 [`docs/agent-poc/a8-e2e-production-report.md`](docs/agent-poc/a8-e2e-production-report.md)；
    - 当前状态正式设为 **`A8 awaiting_human_video_review`**，原地彻底停机，等待用户亲自播放检视两条 MP4，严禁进入 A9。
28. **2026-10-05 14:35**：A8 人工视听审查反馈：**`FAIL / changes_requested`**。用户指出 Topic B 没看到金条台词不成立、Topic A 出现重复镜头且没有“副站长就是你”台词；核心为 Content Grounding 失败；执行全面 Root Cause Audit，完成逐 Segment 真实源片反查，交付 [`docs/agent-poc/a8-failure-root-cause-audit.md`](docs/agent-poc/a8-failure-root-cause-audit.md)，确立五维生产级门禁与可视化 Storyboard Proof 机制；状态设为 **`A8 changes_requested_root_cause_audit`**；严格停止，不修改成片，不进入 A9。
29. **2026-10-05 16:00**：**第三方独立技术审计报告交付与口径全面重置**（[`docs/agent-poc/poc-independent-audit.md`](docs/agent-poc/poc-independent-audit.md)）：
    - 审计判定：旧 POC 仅证明了“结构化剪辑单 → 真实 MP4”的底层工程渲染管道可运行；全链路核心大模型调用次数为 0，八个核心 AI 假设均未验证或已被证伪；
    - 揭露关键问题：L1 包含手写时间表与序号取模、A8.1 手工注入单元形成答案泄露、A5 语义为硬编码专有词表、A6 视角解读为硬编码模板且 87.5% 仅为系统自评（human pending, gate_passed: false）、A7 Plan 为人工预写、成片包含伪造字幕及音画脱节事故；
    - 正式决议：全面冻结原 A8/A9/A10 及旧 A5/A6/A7 规则，不修改其代码实现；废除总体 95% 能力完成度宣称；历史 Approved 和测试全绿仅证明当时代码工程状态，不代表 AI 能力、科学 benchmark 或人工验收；确立以 X0–X4 为核心的重验路线。
30. **2026-10-05 17:30**：**X0 技术选型与复用 Spike 交付**：
    - 完成开源项目源码、License、认证机制审计（`video-recap-skills` / `PySceneDetect` / `marlin-cli` / `VMV Stage 1`）；
    - 在 EP18 中立短段（900-930s）完成切点、代表帧、macOS 原生 Vision OCR 真实横向实测与多集架构推演；
    - 交付报告 [`docs/agent-poc/x0-technology-spike.md`](docs/agent-poc/x0-technology-spike.md)，状态设为 `X0 awaiting_review`。
31. **2026-10-05**：**用户明确批准 X0 评审，授权开启 X1.0**：
    - 用户正式批准 X0 Spike 审查并授权开启 X1.0（L1 自动素材理解 Benchmark）；
    - 阶段推进为 `X1.0 in_progress`；
    - 修正进度看板口径：旧 A5–A8 明确标记为 legacy 工程实现且未经独立验证，旧 A2–A4 备注自动客观理解未验证；修正仍作为事实宣称的历史错误剧情断言；A8/A9/A10 维持冻结不修改实现。
32. **2026-10-05**：**完成 X1.0 真实模型小样摸底，状态变更为 `awaiting_review`，严格 STOP**：
    - 完成 15 Shot（视频前中后各 5 盲抽）、45 张代表帧的本地全自动开源模型推理小样摸底；
    - 真实调用 `mlx-whisper tiny` ASR 15 次成功（产出 10 条有输出与 5 条空文本，5 条空文本原因未核验，可能无语音或 tiny 漏识别，10 条有输出不可称识别真实正确对白，WER/CER 未评）；
    - 真实调用 `Qwen2-VL-2B 4bit` 对 45 帧推理（20 帧 Schema 成功，25 帧 rejected；3 Shot 全结构成功，12 Shot 含拒识；所有语义观察待人工审核）；
    - 真实调用 `YuNet + SFace` 产生 50 次检测记录，聚类生成 31 个匿名算法特征簇（余弦阈值 0.55 未校准，跨镜头一致性 F1 未评，不称 31 人）；
    - 明确因无独立 Gold 标注不自宣科学 PASS；缺少 macOS Vision OCR 与 OCR/ASR Fusion 等完整 X1 范围明确不是本次交付；
    - **X1 整体未通过，不进入 X1.1 与 X2**；交付报告 [`docs/agent-poc/x1.0-smoke-validation.md`](docs/agent-poc/x1.0-smoke-validation.md) 与数据目录 [`benchmarks/x1/`](benchmarks/x1/)；
    - 当前阶段状态变更为 **`X1.0 awaiting_review`**；响应用户明确要求结果提交后严格 STOP review，全面停止后续开发，等待用户审核。
33. **2026-10-05**：**用户明确授权开启 X1.1，推进为 `X1.1 in_progress`**：
    - 用户明确授权并开启 X1.1 重验工作，更新状态为 `in_progress`（45 帧仍未全完 / 真人未标注）；
    - 确认保留历史 X1.0 `awaiting_review` 记录为当时阶段终点，不改旧 A5–A8 Legacy 能力口径，不宣称用户批准 X1.0 科学通过；
    - 确立 X1.1 四项核心工作基线（固定 45 anchors 经 AGY CLI、镜头切分、多模态台词比对、人脸与事实审核待标）；
    - X1 整体仍未通过，X2/A8/A9/A10 维持冻结，不进入 50-shot Gold。
34. **2026-10-05**：**完成 X1.1 自动化工程批次推理与独立核验，状态变更为 `X1.1 awaiting_human_review`，严格 STOP**：
    - 完成 45 次正式 Gemini low 全部尝试（经 AGY CLI，无商业 API、无本地模型）：实测 44 成功、1 遭遇服务 503，无重试；
    - Native Schema + Trace + 原图与推理 Hash 逐帧独立核验成功 44/45 = 97.8%（实际记录包含 1 次 503 异常，严禁预写 45/45）；
    - 15 母区间完成 47 children（max 26.52s，无剧情/人名/人工边界）；15 个母区间 OCR/ASR timeline fusion 全部完成（34 consensus / 43 conflict / 13 ocr-only / 27 asr-only，原文保留，缺 CER/WER 真值不宣科学 PASS）；
    - 报告 [`docs/agent-poc/x1.1-revalidation-report.md`](docs/agent-poc/x1.1-revalidation-report.md) 已由真实汇总器重新生成，不采用 AGY 自写统计；
    - 40 人脸 pairs 标签与 45 帧事实/幻觉审核待用户人工标注，人工 threshold/accuracy/hallucination/WER/CER 仍 pending；完整 X1.1 尚有人工指标待闭环，不说全部 X1.1 已通过；
    - X1 整体仍未通过，X2/A8/A9/A10 维持冻结，不进入 50-shot Gold；当前原地严格 STOP 等待真人审核与 Review。
35. **2026-10-05**：**完成人脸 35/40 真实标注校准与 partial 视觉事实审核复核，维持 `X1.1 awaiting_human_review`，严格 STOP**：
    - 人脸 40 匿名对基于 35 真实真人标注（14 same, 21 different, 2 uncertain, 3 null）完成校准，推荐阈值 **0.4067**（校准集 N=17 Balanced Acc=80.71%、F1=76.92%；独立 Holdout 集 N=18 Balanced Acc=100.0%、F1=100.0%）；声明两集共享 11 face_id 仅 pair-disjoint 而非 person-disjoint，不可夸大为全集 Gate；
    - 视觉事实确认 partial 20/45 审核覆盖（已审 178 事实 / 真实 2 条幻觉，分母 180，幻觉率 1.11% 仅代表已审子集；用户口头抽查基本正确采用画面坐标系，定性意见不覆盖 2 条真实幻觉记录）；场景/动作覆盖率为 22/45（已审准确率为 22/23）；
    - 汇总器修复 `coverage_insufficient` 分支缺 `wer_cer` KeyError 缺陷，严格保证 null 计数不可视为 0；
    - 无 50-shot Gold，语音 WER / CER 保持 pending；X1 整体维持未通过，X2/A8/A9/A10 维持冻结；当前原地严格 STOP 等待真人审核与 Review。
36. **2026-10-06**：**用户明确授权进入新 50-shot 扩展批次 X1.2，推进为 `X1.2 running`**：
    - 用户明确批准脱离旧 15 父区间/47 children 历史范围，正式进入全新 50 镜头 X1.2 扩展批次；
    - X1.1 结论界定为 `accepted_for_expansion`（保留历史数值及实验记录，非全 Gate 科学通过，经用户授权进入下一批，不再停留于 STOP 旧节点）；
    - 全视频 2702s 通过 PySceneDetect 产出 509 个候选镜头池，基于种子 `20261006` 前中后 `17/17/16` 随机抽取 50 个全新镜头，严格排除旧 15 区间；冻结 manifest SHA256 为 `2e02fc591f2cedbeb477ba08dddf1f4a562bebfbfd8e43dc179797be752340be`；
    - 150 帧原画质代表帧（25%/50%/75%）已全部提取，50 个用于人工视听核对的轻量 audio clips 已全部导出至 `/private/tmp/x1_2/clips/`（专供人工核对切点边界和音频对白，绝对隔离，不送入任何 VLM 模型）；
    - Gemini-3.1-pro-low 正在后台运行中，不提前预写最终成功数；局部结果由独立动态报告 `review_report.py` 严格基于 150 绝对分母如实汇总，模型结构门槛 90% 与事实 Gate（人物一致性、叙事可用性、人工真值）严格分开，Gate 保持 pending；首轮 503 等真实服务故障如实记录，绝不伪造重试；
    - 独立人工质检工作台 `/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/x1_2-review/review.html` 采用 select 下拉框（空值导出为 null，无预设判定），支持 LocalStorage 与 JSON 导出；
    - 全 Gold / ASR / Person 保持 pending，X2 保持冻结不进入；严禁向 git 上传视频/帧/html 产物。
37. **2026-10-06**：**完成 X1.2 全自动化工程推理与客观指标审计，状态推进为 `batch_completed_with_errors_awaiting_review`**：
    - 150/150 尝试全部完成（两并发执行结束），严格经 6 字段 Schema、重算哈希与原生 Stream 审计通过 130 帧，20 帧失败，首轮成功率 86.67%，未达 90% 结构门槛；
    - 20 项失败如实记入报告（18 次执行超时强制中断回收、1 次 Google 服务 503、1 次 profile 网络 EOF），首轮严格不重试；
    - 46 窗口 PySceneDetect 产出 509 候选池，前中后 17/17/16 抽样 50 镜头（排除旧 15），最长镜头 64.76s 需人工复核切点边界，不可自宣切分 Gate 通过；
    - 150 张代表帧原图与 50 个带音频 MP4 切片（640x360）全部就绪，硬字幕快照与 45/50 镜头有重叠，另外 5 镜头未匹配，不能据此判断无字幕或无对白；49/50 镜头至少 1 成功帧，35/50 全部 3 帧成功，shot_B0031 三帧均服务失败；
    - 全工程 76 项测试全量通过；独立质检看板就绪（`/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/x1_2-review/review.html`）；
    - 报告交付于 [`docs/agent-poc/x1.2-50shot-report.md`](docs/agent-poc/x1.2-50shot-report.md)；明确未达正式 Gold Gate，严禁伪造 Person F1、幻觉率或单集成本；
    - 明确数据与资产提交策略：禁止 commit 原视频、代表帧原图与 HTML；识别 JSON 与评估报告按项目隐私政策和用户授权范围处理，其中本次 X1.2 识别及 Codex 复核文本已获用户授权推送；
    - 完整人工 Gold / new ASR / new Person 保持 pending，X2 保持冻结不进入。
38. **2026-10-07**：**完成验证路线体系修订与基线口径对齐，状态推进为 `validation_route_revision_committed; experiments_paused`，严格 STOP 无实验**：
    - 本日仅修改验证路线与项目状态文档（`poc-revalidation-handoff.md`、`PROGRESS.md`）；未启动模型实验、未新增样本、未进行人审；随后提交本次文档变更；
    - 明确 X1.2 首轮 130/150 (86.67%) 为历史首轮结构化结果，绝非新版 Gold Gate；Codex AI 逐镜头复核已完成（全量审核 50 镜头，复核50个Shot的有效描述及原帧；20次模型调用失败沿用原始实验记录），Human Anchor 人工标签、Anchor 与独立 AI Judge 校准以及正式 Gold Gate 仍未完成；
    - 阶段门禁表完成路线升级：明确新增 Human Anchor、X1 Evidence v1、有限 X2 probe、X1 指标冻结、X2 Gold（写清为原视频时间区间）、X2.5 Persona/Plan、X3/X4 锁定等条目；
    - 旧 X1/X2 阈值及旧 X2 50 query count 仅作为历史口径记录，新阈值待预注册；
    - 明确 第一版L1形成后的小规模X2 probe仅为未来的校准手段且不是正式X2 PASS；本次不执行。暂停新增模型实验、新增样本和X1.3，不进入正式X2，X2.5未获准，X3/X4 维持锁定；
    - 资产提交合规口径对齐：禁止 commit 原视频、代表帧原图与 HTML；识别 JSON 与评估报告按项目隐私政策和用户授权范围处理，本次 X1.2 识别及 Codex 复核文本已获用户授权推送；
    - 全面维持 experiments_paused，原地严格 STOP 无实验。
