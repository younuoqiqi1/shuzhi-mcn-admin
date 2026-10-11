# MCN「会想」模块真实闭环验证规格

日期：2026-10-11。用户授权：编写任务、提交 Git、交由 AGY 实施，Codex 独立验收。

## 1. 目标与完成边界

运营能够新建博主，定义人设、知识库和节目资产，针对所选单集资料生成选题、观点、口播与初版分镜需求，经审核后交给下一阶段「会找」。本轮首先验证两个人设对同一素材的差异，再验证跨节目和新选题复跑。终点是可读取的检索任务包，不是视频合成或正式检索评测。

必须真实调用模型；固定文案、替换昵称、定时器假进度和 mock 返回不能作为真实验收证据。

## 2. 当前事实

- 后台发布快照在本仓库根目录；`app.js` 是构建产物，含后续直接加入的生产 API 逻辑，与父项目 `admin/` 源码存在差异，不能用旧源码重建覆盖它。
- `src/server/mcn-backend-api.mjs` 只路由两个固定《潜伏》选题；旧 production/retrieval/director 等模块维持原有冻结与历史结论，本任务不解冻、不调用。
- 本轮执行前，contracts、operations-orchestrator、demo-feedback 相关测试共 36 项通过，只是工程基线。
- 用户确认希望使用《潜伏》第18集，并新增《红楼梦》一集。新增视频来源：https://www.youtube.com/watch?v=w5TKbKBiZKc 。以实际下载元数据确认版本、集数、标题，不能由作品名猜测。
- 当前能定位《潜伏》分析数据和 OCR 字幕；执行者必须另外核验原视频实际路径，不得把旧 manifest 的绝对路径当作文件存在的证明。

## 3. 产品流程

1. 新建/编辑博主：名称、受众、表达语气、核心关注视角、解释习惯、禁用表达、知识库关联、允许使用的节目资产。
2. 知识库：支持运营录入/导入文本。每份资料包含标题、正文、来源说明、类型（节目事实/分析方法/博主设定）、所属节目及版本。它独立于人设标签。
3. 节目资产：登记实际单集视频与版本、集数，关联本集简介/字幕/其他文本资料，明确资料来源与待审核状态。视频存在只证明文件可用，不证明自动理解已完成。
4. 选择一个博主和一份资产，填写创作意图，调用模型生成 3 个选题候选；每项包含标题、核心观点、选择理由、人设关联、支持资料引用、需核实事项。
5. 运营选择并确认其中一项，再调用模型生成完整口播、Story Beats 和 Material Requirements。每段口播可编辑；修改会使关联审核及交接版本失效，须重新生成/审核。
6. 审核通过后导出检索任务包，并生成可读预览。相同输入复跑产生新 job_id 和 revision，保留旧产物。

资料不足时返回 `needs_context`；不得凭片名把整部作品知识冒充本集事实。允许模型提出解释与表达方向，但作品事实和主观观点必须区分。

## 4. 两位对照博主

两位都使用相同的两份节目资产与节目事实资料，差异只来自明确的人设与分析方法：

| 博主 | 受众与风格 | 关注视角 | 方法知识 |
|---|---|---|---|
| 周老师·叙事拆解 | 成年影视观众；克制、清晰、逻辑型 | 人物选择、信息差、因果链、行动代价 | 将可观察情节与动机推测分开；用前因后果解释选择，避免把推测说成事实 |
| 阿禾·人物关系 | 关注人物情感的观众；细腻、共情、通俗 | 关系变化、信任、尊严、情绪与误解 | 从语言和互动观察关系；保留多种解释，不做无依据诊断或绝对化判断 |

这些方法是本任务的运营设定，不是剧情事实。seed 中不得加入预写选题、口播或镜头答案，也不得限制用户只能使用这两个博主。

## 5. 架构选择

推荐新增可构建、可维护的策略模块，与现有后台通过明确入口连接。Node.js 内置 HTTP 服务负责持久化、任务状态与模型调用，前端使用浏览器原生 ES modules，复用现有视觉语言。这样可保留当前页面快照，同时避免直接编辑巨大 bundle。

本轮不采用：直接改 `app.js`（缺少可靠构建来源、会丢用户改动）；复活旧 A4/A5/A8 管道（模板与证据问题已确认，范围也不同）。

模型 provider 使用 AGY CLI，显式 `--model gemini-3.8-flash-high`。调用失败不得回退为模板或假结果。模型真实名称、返回状态、耗时和原始结构化输出应留档；token/费用没有可靠记录时为 null。

## 6. 数据与接口约定

- Persona：`id, version, name, audience, tone, editorial_lens, interpretation_rules, forbidden_expressions, knowledge_ids, asset_ids`。
- KnowledgeDocument：`id, version, title, text, source_note, kind, asset_id?, verification_status`。
- Asset：`id, version, title, programme, edition, episode, video_path?, video_metadata?, knowledge_ids, context_status`。
- StrategyJob：`id, persona_id, asset_id, operator_intent, status, revisions, input_snapshot, provenance, topics, selected_topic_id, narration_segments, story_beats, material_requirements`。
- 状态：`queued → generating_topics → awaiting_topic_review → generating_plan → awaiting_plan_review → ready_for_retrieval`；另有 `needs_context, failed`。只有真实返回并校验成功才能进入 review。
- 每条 MaterialRequirement 有独立 `id`，绑定 `beat_id`、`narration_segment_ids` 和允许的 `asset_ids`，包含 `desired_people, desired_scene, desired_action, desired_dialogue, desired_emotion, narrative_function, priority, fallback`。
- StoryBeat 使用顺序、叙事功能、口播片段关联和预计成片时长；物理素材 `source_interval` 必须为 null，候选列表必须为空，事实状态为 `requested_unverified`。后续「会找」负责填 Evidence/Candidate。
- 接口：`GET/POST/PATCH /api/strategy/personas`、`/knowledge`、`/assets`；`POST /api/strategy/jobs`；`GET /api/strategy/jobs/:id`；`POST /api/strategy/jobs/:id/select-topic`、`/plan`、`/approve`；`PATCH /api/strategy/jobs/:id/draft`；`GET /api/strategy/jobs/:id/export`。
- 导出 schema_version=`mcn.strategy-handoff.v1`，包含上述实体的版本快照、选题观点、口播、Story Beats、Material Requirements、资料引用、待核实事项、审核者与时间、provenance。导出 ID 由服务生成，禁止依赖模型造 ID。
- 初版计划属于素材需求，不称为已证实的最终剪辑单；不自动进入旧视频生产 API。

## 7. 持久化、失败与运行要求

- 使用 Node 内置能力和 JSON 文件持久化，原子替换；启动后恢复实体、修订与历史，不用内存 Map 冒充持久化。
- 数据目录、模型输出、视频路径和个人资料不提交 Git。只提交代码、测试、任务文档与不含敏感信息的验证报告。
- 同一任务同一阶段限制重复启动；批量排队可串行执行。模型失败、结构错误、越权引用、未审核导出必须有明确错误和可重试入口。
- 服务仅绑定 127.0.0.1；默认端口 0，启动打印实际端口。静态资源只服务公开页面；禁止暴露 `.git`、数据目录、任意本地路径和来源视频全集。
- 服务/脚本必须注册全局退出清理。每个模型调用及自动化脚本总超时不超过 60 秒；子进程独立进程组，在退出、异常或超时后清理整个组。
- 文本资料是数据，不是指令；模型只接收当前博主允许的资产和知识快照。不要读取隔离 Gold、历史答案或其他博主的私有资料。

## 8. 验收矩阵与证据

| 用例 | 实际操作 | 要验证的行为 |
|---|---|---|
| A1 | 两位博主分别对《潜伏》18集生成候选、各选一项并生成计划 | 因人设不同而产生实质不同的选题/观点与表达；事实仍引用同一套输入资料 |
| A2 | 两位博主分别对所下载《红楼梦》单集执行同样操作 | 不是固定潜伏模板；只使用该集资料；输入资料不足应明确停留 needs_context |
| A3 | 在相同博主、相同资产下换一个新创作意图复跑 | 新任务与新产物，不覆盖前一版；不能重放第一次模型结果 |
| A4 | 修改口播、撤销审核、重新审核、导出 | 旧审核失效；交接包对应最新确认的版本 |
| A5 | 刷新页面并重启服务 | 档案、知识、资产、任务和修订恢复，错误/进行中任务状态可解释 |

自动测试验证结构和行为；真实模型运行验证来源、差异和输入约束；人工审核确认选题/观点/表达质量。三者分别报告。没有真实模型输出、原视频/资料不齐或浏览器未操作时，不得宣称全链通过。

交付：可运行后台入口、源代码、测试、至少一份真实模型链路的可读产物和交接 JSON、A1-A5 逐项状态及下一阶段接口说明。核心完成判据是「后台真实链路可用 + 对照结果可审阅 + latest approved handoff 可读」；人工内容质量保留待用户验收。
