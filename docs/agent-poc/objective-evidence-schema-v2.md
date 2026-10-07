# Objective Evidence Schema v2 设计

日期：2026-10-07。版本：`2.0.0-design`。状态：`design_complete; awaiting_review; experiments_paused`。

本轮仅设计契约和评测，不运行模型、Judge、检索、标注或迁移。基线为 `84c41690341f14669c363d345d2ee7f9d8488d3b` 的视觉差异裁决。历史 `d6ac6ca` 永久保留 **Independent Judge Calibration FAIL**；不解释为 Gemini Evidence Scientific FAIL。X1.2 仍为 **Engineering PASS / Scientific Pending**。

机器可读定义：[objective-evidence-schema-v2.json](objective-evidence-schema-v2.json)。下游验证设计：[limited-x2-retrieval-probe-v1.md](limited-x2-retrieval-probe-v1.md)。两份文件均是待 Review 的新版本，不改变 `human-anchor-calibration/` 冻结文件、人工答案、首次 Judge、旧分数、原 Manifest 或现有 `src/` 契约。

## 1. 设计依据与取舍

视觉差异诊断共54项：count 10、action 21、object 23。Object有16/23分类歧义、6/23证据不足；Action有4/21歧义、1/21证据不足；Count有4/10歧义。这是差异子集的独立AI诊断意见，不能当新的人工Gold或全系统准确率。

采用“原视频绝对时间范围 + 原子可观察事实 + 来源/不确定性”的契约。保留整镜头分类会延续状态/事件与关键性歧义；完全自由叙述难以追踪对象、动作、说话人和失败。v2在两者之间使用少量结构字段，场景保持轻量，动作有明确时间语义，物体不用旧大类 taxonomy。字段价值是待检索探针验证的假设，不声称已证明有下游增益。

只允许L1物理可观察事实。情绪含义、关系、动机、意图、身份姓名、剧情意义、因果解释、Persona、Topic与叙事潜能不进入L1。原OCR/ASR字面引语可以含这类词，但必须留在原文/引语通道，不能升级为已发生事实。可观察姿态、面部运动不等于“愤怒/紧张/怀疑”。

## 2. 字段与下游价值假设

| 字段 | 级别与用途 | 为什么可能对Retrieval有用 / 验证方式 |
|---|---|---|
| schema_version / evidence_id / media_id / span / shot_refs | 必需的定位元数据 | 返回原视频可核验区间、去重与版本隔离；不作为语义答案。Gold不以Shot为基础 |
| content_regions[].content_region_type | 必需；五类+unknown | 默认正片过滤，避免片头/片尾/预告污染；检查非正片误收与正片误删 |
| boundary_correctness | 必需容器，通常not_evaluated；独立QA | 诊断切镜质量，**不参与语义排序**；没有可判真值不能声称correct |
| evidence_usability | 必需容器，通常not_evaluated；独立QA | 决定哪些原时间范围的证据可被引用；不从boundary推导；正式策略另行冻结 |
| person_observations | 必需，可unknown/failed | 匿名人物跨片段检索及动作/Speaker关联；空items只在observed时表示本次覆盖未见可定位人物 |
| person_count_observations | **optional，仅辅助QA** | 不作为Gate或必要检索条件；默认不建检索索引，不因人数多/少猜身份 |
| person_consistency | **保留能力；optional关联记录** | 同人聚类/跨Shot召回，支持匿名身份；正式评测独立于人数；没有配对任务时可省略 |
| scene | 必需轻量容器 | 室内/室外及简短可见环境支持明确场景检索；unknown可接受，不产出细剧情地点分类 |
| observable_actions | 必需，可空/unknown/failed | 直接回答“做了什么”，以状态/事件+时间范围验证动作召回与支持率 |
| key_objects[] / key_objects_status | 必需但数组允许空 | 记录值得检索的可见对象，不追求列全背景；验证物体Q、关联动作Q与消融变化 |
| speech_status / speech_segments | 必需，可空/unknown/failed | 台词字面/语义检索、可确认的说话人过滤；保留OCR与ASR独立通道 |
| confidence / provenance / uncertainty | 必需审计元数据，分项保存 | 复核原图/原声，区分缺证据和反证、限制引用范围；confidence不是事实真值也不是已校准概率 |

**删除/降级：** 删除旧Object taxonomy与`objects`类别集合，删除L1姓名列表`characters`、剧情解释及泛情绪标签；人物数降为optional QA；全局置信度总分、摄影机/景别、细粒度固定场景taxonomy暂不进入v2核心。它们没有当前5类Probe的明确必要性。若未来需求证明有价值，必须另提版本并评审。人物一致性是保留能力，optional仅指单条Evidence内是否有配对记录，不能据此取消人物一致性评测。

## 3. 通用时间与来源

- `span`为原媒体秒数的半开区间`[start_sec,end_sec)`，要求0≤start<end≤媒体时长；不重置正片时间、不填剧情时间码。
- Evidence可以跨Shot，`shot_refs`仅列关联索引；Action/Object/Speech/人物观察各有自己的span，必须包含在Evidence范围内。跨Shot的事件必须由完整所需变化支持，不把每个Shot拼成事件真值。
- `provenance`在本条内以唯一ref_id建表，保存原素材/派生输入引用、SHA256、原时间范围、producer与run_ref。模型未知版本在冻结run metadata明确标unknown，不能伪造版本。
- `frame_sec`只用于frame；单帧观察的span是该帧的显示持续时间，不能延伸为整镜头持续事实。frame_instant用对应帧区间；observed_interval需要时间顺序视频/帧证据，间隔、模糊或切换的不确定性保留。
- `observed` + 空数组是“在已记录观察范围未记录适用事实”，**不是整集不存在**。unknown是无法判断，failed是技术失败；禁止将后二者写成可信空集合。所有字段读取前须检查status。
- confidence为0–1或null（没有可报告置信度），不得用null等同0；只表明生产者自身估计。每条可检索事实必须有来源和uncertainty（可为空）。

## 4. content_region_type

值为`main_content / opening / ending / preview / other_non_main / unknown`。preview包括明确的节目预告或下集预告；other_non_main为广告、包装等其他非正片，不把剧情内屏幕、歌词字幕或正文蒙太奇自动当包装。

`content_regions[]`对Evidence范围作无重叠、无遗漏覆盖；跨类型区间分段，主字段命名为每段的`content_region_type`，不强迫混合镜头归单类。类型需来源，不靠固定第几秒/百分比、人物姓名、特定剧情、音乐或字幕单一信号推定。

未来默认索引只收main_content部分。opening/ending/preview/other_non_main保留审计并从默认正片召回排除；unknown保留隔离、不静默当正片；用户显式查询非正片可走独立范围。边界区间不确定不自动删原素材。上线前报告可判正片时间误删秒数/可判正片总秒数、非正片误收秒数/可判非正片总秒数、unknown秒数/全范围秒数，不以过滤后的样本重算旧指标。本轮未实现分类/过滤。

## 5. boundary_correctness 与 evidence_usability

两者独立，不互相赋值，不共用评分。

- boundary_correctness：在**原视频**切点真值与预注册容差下，判断范围是否尊重切镜；correct/incorrect/unknown/not_evaluated。只能由independent_evaluator填正确性结论；生产自动Ingest通常not_evaluated。算法切点confidence单独留运行记录，不冒充正确性。
- evidence_usability：usable/partially_usable/unusable/unknown/not_evaluated，按字段及可引用区间是否清楚、来源是否齐全、时间是否对齐判断。usable_spans仅是已核验可引用部分；automatic_check只能证明时间/来源等工程可用条件，不能冒充视觉事实验收。
- 多镜头合并可能boundary incorrect，但有局部清楚的动作/台词仍partially_usable；切镜正确也可能全模糊/无音频，evidence unusable。not_evaluated或unknown不等于unusable；Probe按其冻结规则核验返回事实，不因QA未知就删掉整批输入。
- QA不得把人工修订写回生产Evidence；隔离evaluator可提供派生QA视图，不能参与日常单集入库。术语“可用”须带criterion_ref和assessment_source，否则只能not_evaluated。

## 6. Anonymous Person 与一致性

person_id使用`person_*`，范围为media_id；跨媒体/跨剧映射另行验证，不能凭相同ID串人。person_observations记录observation_id、frame_ref、可选规范化bbox、观察span与来源。未知身份用unknown，不能把多个未知者合成同一人，也不凭片中对白推姓名。

optional person_count_observations按**指定frame_ref**记录可定位的人体实例数量，不用整镜头峰值/平均值。背影或部分身体能独立定位为一个人体实例才计数；无法区分重复/遮挡时unknown。镜子反射、屏幕内人像不重复计同一个物理实例，来源不清记unknown。身体可见不等于人脸可辨。人数字段不用于替代Person Consistency。

一致性配对仅对目标位置明确的两个人物观察作same/different/unknown，保存confidence/calibration_ref。首次历史13个有效Pair的BA=0.95、macro-F1=0.9737、CI N/A与INCONCLUSIVE原样保留，不换模型、不补Pair。本轮不设计或执行新的Pair样本；未来需冻结前先确认材料有效、pair/person层依赖及未知计法。

## 7. Observable Action：状态、事件与范围

`kind=state`表示某段观察中的姿态/持物状态；`event`表示可见变化。v2谓词是用于规范物理观察的最小词表，与旧宽泛动作集合无自动标签转换：

| 类型 | 谓词与判定边界 |
|---|---|
| state | sitting / standing / lying：明确身体姿态；holding：可见持续持有，不自动意味着拿取、使用或交接 |
| event | walking / running：人物可见位置移动，不含摄影机运动、头部转动或手臂动作 |
| event | picking_up / putting_down：支持拿起或放下的前后变化；handing_over：可见对象控制从一人转向另一人，不能以两人各持文件推断交接 |
| event | opening / closing：可见对象开/关变化；turning_body / gesturing：可见身体/手势变化；mouth_moving：只确认嘴部运动，不确认正在说什么/已听到说话 |
| state或event | other_observable：确有直接可见事实但不在词表，必须极短observable_text；不容纳动机、用途和剧情 |

不合并“说话/交流”，声音证据归Speech。记录subject_person_id（未知则unknown）、target_object_id（未能确认则null）以及不含解释的observable_text。事件需要observed_interval；只看到静帧中的手拿包应是holding，不是picking_up。稀疏前后帧无法排除切镜/遮挡就unknown或不输出事件，不能补写全过程。

状态只覆盖直接支持的观察时间；事件span覆盖变化，不能传播到整镜头。连续相同状态可以在无证据中断的可见区间合并；遇切镜/遮挡停止。不同状态/事件可并存，按可观察事实逐条保存，不要求穷举肢体微动。

## 8. key_objects：关键可见物体，不做旧taxonomy评分

`key_objects[]`允许`[]`。每项有object_id、参与关联的action_refs、普通可见label、可见attributes、span、来源、confidence、uncertainty和selection_basis。Object ID在本Evidence内唯一，跨镜头物体同一性不在本轮默认假定。

可进入key_objects的通用准则至少满足一项：

1. visible_action_participant：对象直接参与本段可见拿取、持有、放下或其他动作；必须关联至少一个有来源的action_id，缺乏可见交互不能选此依据，不得因剧情推断参与。
2. foreground_focus：非人物的对象特写，或观察区间中对象在前景且被清晰完整呈现为画面主体；必须指出对应原帧。仅背景面积大、位于中央或作为人物座椅不满足此依据。
3. distinctive_visible_detail：对象有能在原帧明确定位、可直接命名的文字/外形细节，且对象是前景主体或动作参与者；纯背景装饰细节不纳入，不推断文本来源、归属、保密性、用途。

这些是内容无关的索引准则，不依赖某个Topic/Query。selection_basis仅保存选择依据，不写“用于证明背叛”等主观下游故事。单条来源不清的对象可上位描述为“容器”，uncertainty标明细节未知；不能从容器猜内容，从衣物猜职业，从纸张猜情报/文件用途。容器和可见内容如果分别关键可各记一项，不把它们当同一旧taxonomy类别。不追求背景清单/Key Object Recall；背景墙桌柜仅在符合上述准则时记录。

Probe只能核验已记录对象存在性、描述正确性、物体Query是否有支持命中；“空数组是否漏掉有检索价值对象”只能由独立来源事件目标或新冻结标注验证，不能凭Object micro-F1继续评分旧taxonomy。不同裁定者对关键性有争议，单列选择歧义，不能当作视觉幻觉或偷偷扩展标准。

## 9. Speech：OCR / ASR独立证据与Speaker

- `speech_status`由真实音频通道确定speech_present/no_speech_detected；未接收声音为unknown/failed，不能因为无字幕就no_speech。
- Speech按说话轮次拆分，重叠语音可有重叠span。无语音可为空；仅OCR字幕保留segment且Speaker为unknown。OCR字幕不能独立确认可听语音、说话人或场外人物在场。
- 每segment保存ocr_text/asr_text（null表示不可得；no_text/no_speech和技术失败分别保存status）、ocr_text_type、resolved_text及fusion_status。OCR字幕与标题/歌词/屏幕文字区别；其他屏幕文字不自动合成对白。
- agreement需双方可用且字面/规范化一致；single_source只有一个可用且有来源；冲突保留双方原文、fusion_status=conflict，resolved_text=null，不由视觉常识/剧情补台词。available但空串非法；没有检测到语音/文本也不伪造available。
- Speaker可确认才关联匿名speaker_person_id，并给speaker_confidence与真实音视频/说话归属来源；否则`unknown`且confidence=null，speaker_source表示on_screen/off_screen/mixed/unknown/not_applicable。来源类别不等于已确定人物身份。无语音为not_applicable+unknown；多人/画外与画内同说而不能拆分则mixed+unknown，不能强行选单人。
- 边界/来源可程序核验；内容、可听性与Speaker事实须真正能接收原声音频的评审。历史无音频Judge失败不以嘴型、OCR或本轮视觉裁决修复。

## 10. JSON Schema与语义校验的边界

所有对象additionalProperties=false，拒绝旧objects/characters、情绪/关系等额外字段。JSON Schema验证结构、枚举、ID形状、必需元数据、state/event词表和unknown Speaker空置信度；不能证明文本内容客观或原素材可见。

未来实现时另需确定性语义校验（本轮仅定义、不实现）：

1. 所有时间范围有效、在源时长内；子span包含；content_regions完整不重叠；usable_spans包含且有criterion，not_evaluated不得有可用区间。
2. ref_id/观察/action/object/segment ID不重复；object.action_refs必须指向本条action，visible_action_participant至少有一个双向关联的动作；frame_ref与provenance_refs存在；bbox不越界；frame_sec在观察span内；action.target_object_id指向本条对象，人物ID关联实际观察或已冻结匿名人物注册表。
3. frame_instant有frame来源；event必为observed_interval并有时间变化支持；state不扩展超过真实观察；未获声源的speech_status不得no_speech或speech_present。
4. unknown/failed数组必须为空并有uncertainty，不可视为零事实；key_objects_status相同规则；object label不等于旧taxonomy含义推断。
5. 每份resolved_text可由原OCR/ASR及冻结规范化变换追溯；conflict/unavailable为null；字段status和provenance kind匹配；unknown Speaker的speaker_provenance_refs为空，已关联人物必须有真实归属支持；no_speech不得speaker绑定。
6. boundary not_evaluated的source也为not_evaluated、criterion=null；correct/incorrect必须独立evaluator和criterion；usability的来源/criterion符合相应核验范围，工程来源不得冒充内容验收。
7. 对事实、推断、引语通道作独立来源核验；闭合Schema不会自动阻止在observable_text里塞入动机/关系。否定查询不得以unknown/空key_objects生成“事件不存在”。

## 11. 评测设计与版本隔离

未来所有新分母、真值、Prompt、模型配置与代码须另行Review和预注册；不把旧Human Anchor答案转换成v2标签后宣称独立新校准。本轮无新标签、模型输出和评分。

| 能力 | 下一轮拟评测对象与分母（执行前冻结绝对数/阈值） |
|---|---|
| 内容区分 | 正片误删/非正片误收以原时间秒数为分母，unknown覆盖独立报告；重采样按独立片段聚类 |
| Boundary | 原视频切点一对一容差匹配的P/R/F1；不要用usability替代boundary真值 |
| Usability | 预注册返回claim/原区间的可引用支持率及适用覆盖，不按切镜好坏打分 |
| Person | 人物数仅描述性辅助；一致性仍BA/macro-F1/coverage，未知预测不能从分母删；有效数不足INCONCLUSIVE |
| Action | 状态/事件分层的原子claim支持率与有Gold目标的区间命中；不沿用整镜头taxonomy exact-set |
| Key Object | 可核验对象claim支持率、无法核验率、独立目标的检索命中；不用背景穷举micro-F1 |
| Speech | OCR/ASR/Fusion分别CER/WER；Speaker按可归属轮次准确率/覆盖；无音频评审不能评分 |
| Retrieval价值 | 5-Query Probe诊断和字段消融；很小样本只提出新指标/字段保留假设，不能建立泛化Gate |

每项未来协议必须在运行前填齐分母绝对数量、matching、missing/unknown/failed、95%CI、PASS/FAIL/INCONCLUSIVE与timebox。二项比例Wilson；依赖性指标以Shot/Query为簇bootstrap（必须固定种子/次数）。真值不足单列不可判覆盖，不把unknown当正确；调用失败留在计划尝试分母。没有新增可靠Anchor时不宣称v2客观事实质量PASS。

## 12. 本轮交付与停止边界

执行说明：AGY以显式`--model gemini-3.8-flash-high`尝试文档写入，但启动被本地权限限制拦截，且日志未能明确解析指定模型，未产生修改；设计文件由Codex写入。没有运行素材推理/新模型实验，不伪称AGY完成或该模型身份已验证。


架构与交接文档同步v2，PROGRESS登记设计完成、实验暂停；旧运行契约保持原样。静态自查覆盖JSON解析、内部引用/required/闭合对象、本文用到的约束子集及合成输入；未安装新依赖、未使用完整Draft-07标准验证器，未来接入时需完成标准验证和确定性语义校验。原748个非本轮修改的已跟踪文件摘要不变，包含运行代码、Anchor协议及历史报告；文档本地链接与STOP状态一致。

新JSON标为design，不导入现有流水线、不将旧Evidence自动改名/打补丁，不重跑Judge、不读人工答案、不执行Probe、不进入X1.3/X2/X2.5/A8/A9/A10。提交推送后STOP，等待Review。
