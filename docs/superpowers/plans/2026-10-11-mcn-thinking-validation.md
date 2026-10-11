# MCN「会想」模块 Implementation Plan / AGY 执行任务

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 用户已明确选定 AGY 执行、Codex 验收。本任务不得自行再次要求用户批准同一范围。

**Goal:** 在后台真实完成「新建博主 → 人设/知识/单集资产 → 选题观点 → 口播与初版分镜需求 → 审核 → 会找交接」。

**Architecture:** 新增独立策略工作台和 Node API，保留现有后台页面快照和旧 POC；所有可变业务记录落盘，模型通过显式 provider 调用，审核后的需求导出为通用 JSON。

**Tech Stack:** Node.js 24、内置 HTTP/fs/crypto/child_process、浏览器 ES modules、node:test；AGY CLI `gemini-3.8-flash-high`。

**Spec:** `docs/superpowers/specs/2026-10-11-mcn-thinking-validation-design.md`。

## Global Constraints

- 仅在 `/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin` 编写本任务代码。AGY 必须显式 `--add-dir` 指定该绝对目录，coding 调用显式 `--model gemini-3.8-flash-high`。
- **允许新增**：`src/strategy/**`、`src/server/strategy-backend.mjs`、`strategy/**`、`tests/strategy-*.test.mjs`、`scripts/strategy/**`、`docs/strategy/**`。
- **仅允许小改**：`index.html`（新增「策略运营」导航入口）；`.gitignore`（忽略本轮运行数据）。
- **冻结**：`app.js`、`styles.css`、`demo-logic.js`、`PROGRESS.md`、既有 `src/contracts/operations/retrieval/evidence/affordances/perspective/director/production`、`src/server/mcn-backend-api.mjs`、所有 Gold/冻结评测资料、父项目 `admin/`、用户未跟踪的 `video/`。SHA256 见 `docs/strategy/task-frozen-files-2026-10-11.json`，执行前后都要比对。
- 禁止修改/重跑旧 A5-A10 或 X1/X2 Gold/Probe，禁止正式检索或成片渲染。不得迁移/覆盖浏览器已有 demo 数据。
- 所有脚本/模型子进程需全局退出清理、≤60s 总超时、随机端口、异常/中断/正常退出均回收。本轮临时服务必须交付前终止。
- 不安装大型模型、商业 SDK 或全局依赖，不提交视频、字幕全文、模型原始输入、个人知识库、凭证或未经核实剧情内容。
- 用户已明确授权本任务写入 Git 并由 AGY 实施；本次实现可分阶段提交，不推送未检查的代码。

## Review Focus

1. 输入只给节目名、没有本集资料：显示 needs_context，不能生成看似真实的本集剧情。
2. 换人设但同素材：模型收到实质不同的人设和方法，结果不是改昵称、换句式的固定模板。
3. 口播编辑后再次导出：旧审核与旧素材需求必须失效，不能混用旧 revision。
4. 失败/刷新/服务重启：任务和历史可恢复，失败不变成 completed，无重复模型调用。
5. 源资料含指令、越权 asset_id 或不存在的引用：作为数据处理，无法跨博主读取或生成已证实的镜头。

## Task 1：档案、知识、资产、任务契约与持久化

**Files:** 新增 `src/strategy/schema.mjs`、`store.mjs`、`seed-personas.mjs`、`tests/strategy-store.test.mjs`；小改 `.gitignore`。

**Interfaces:** `validatePersona(input)`、`validateKnowledge(input)`、`validateAsset(input)`、`validateGeneration(stage, output, snapshot)`；`StrategyStore({dataDir})` 提供 `create(kind,input), update(kind,id,patch), get(kind,id), list(kind), appendRevision(jobId,revision)`。实体类型 persona/knowledge/asset/job；保存原子文件，ID/version 由服务生成。

- [ ] 先写失败测试：创建两个博主、知识和资产绑定、空字段/越权绑定拒绝、重启恢复、同毫秒 ID 唯一、旧 revision 保留。
- [ ] 运行 `node --test tests/strategy-store.test.mjs`，记录真实失败。
- [ ] 实现上述接口；seed 只有规格中的两位人设及通用分析方法，不含预写选题/口播。
- [ ] 再运行，核对传入未知字段不会绕过校验；无 `.local-data` 敏感数据被 git 跟踪。
- [ ] 提交本任务允许文件，并在 `docs/strategy/implementation-log.md` 简短记录命令、结果与限制。

## Task 2：真实模型 provider 与策略服务

**Files:** 新增 `src/strategy/agy-provider.mjs`、`prompts.mjs`、`service.mjs`、`handoff.mjs`、`tests/strategy-generation.test.mjs`、`tests/strategy-handoff.test.mjs`。

**Interfaces:** `AgyProvider.generate({stage,input,signal}) → {output,provenance}`；`StrategyService({store,provider})` 提供 `createJob({personaId,assetId,operatorIntent}), generateTopics(jobId), selectTopic(jobId,topicId), generatePlan(jobId), editDraft(jobId,patch), approve(jobId,{reviewer}), export(jobId)`。异步生成返回保存后的 job，API 层负责后台执行与轮询，不用定时器生成结果。

- [ ] 先写失败测试：只提供资产标题返回 needs_context；模型超时/非法 JSON/不存在资料引用/越权资产/编造物理时间码被拒绝；同 job 并发启动只调用一次 provider。
- [ ] topics 生成 3 个候选；运营选一项后 plan 才能生成。叙事段、beats、requirements 相互引用闭合，ID 由服务分配并校验。
- [ ] provider 的每次 AGY 命令显式模型、`--print-timeout 55s`、JSON schema；全局超时 ≤60s，并杀进程组。不要使用危险跳过权限参数。原始输出先保存，再校验，再改变成功状态。
- [ ] 不依赖旧 A4 人名分支或 legacy evidence 模板；prompt 接收当前可用的文本资料和明确来源，事实与解释分开。
- [ ] draft 编辑后 version+1、approve=false，相关 plan 变为 stale；重新生成后再审核。未审核或 stale 不能导出。
- [ ] 导出 `mcn.strategy-handoff.v1`，每个 requirement 为 requested_unverified，source_interval=null；不填已找到的候选，不称为最终 DirectorPlan。
- [ ] 执行上述两个测试文件，分别记录 mock 工程测试与真实模型运行证据。
- [ ] 提交允许文件。

## Task 3：API 与可运行的后台界面

**Files:** 新增 `src/server/strategy-backend.mjs`、`strategy/index.html`、`strategy/app.mjs`、`strategy/style.css`、`tests/strategy-api.test.mjs`；小改根 `index.html`。

**Interfaces:** `createStrategyServer({port=0,dataDir,provider}) → {start(),stop(),address()}`；REST 路由和状态字段按规格第6节。静态 `/strategy/` 指向新工作台；根后台保留。

- [ ] API 先写失败测试：CRUD/错误状态码/正文上限/任务查询/未审核导出拒绝/任务恢复；port=0 使用随机端口；关闭服务和模型任务后无未关闭连接或子进程。
- [ ] 完成可实际点击的三个区域：博主/知识与资产配置、选题对照与运营选题、口播/分镜需求审核与交接导出。
- [ ] 支持用户创建第三个博主、录入资料和选择资产，不能把两位 seed 博主写死为唯一选项。
- [ ] 资产允许登记本地单集视频路径；用 ffprobe 读取元数据，存来源 URL。页面状态区分「视频存在」与「内容资料已具备」。若用户尚未提供字幕/简介，清晰提示录入本集资料；不要把上传视频当作自动理解完成。
- [ ] 显示真实 queued/generating/review/failed 状态；服务器未连接时明确显示，不调用模拟 finishJob。
- [ ] 保持后台简洁中文界面；新页面加入返回原后台入口；仅在根 index 增加正常导航入口，不直接修改巨大 app.js，不盖住原页面内容。
- [ ] 运行 `node --test tests/strategy-*.test.mjs` 与原基线36项；检查所有 frozen SHA。
- [ ] 提交允许文件。

## Task 4：真实对照、换题复跑和下一阶段交接

**Files:** 新增 `scripts/strategy/validate-real.mjs`、`verify-browser.mjs`、`docs/strategy/acceptance-2026-10-11.md`、`docs/strategy/retrieval-handoff.md`；运行素材和产出只放忽略目录。

- [ ] 先核验两个原视频的实际存在、ffprobe、标题/版本/集数及资料来源。红楼梦链接为用户指定 URL；下载路径由 Codex 在 `docs/strategy/local-media-receipt-2026-10-11.md` 记录。不要把剧集标题不匹配的片段当作该集。
- [ ] 从后台创建两位 seed 博主、公共节目事实资料、各自方法知识；实际逐步执行规格 A1-A5。每次脚本 ≤60s，一次只触发一项模型阶段；较长整体验证分多次调用，避免一个脚本挂数分钟。
- [ ] 至少完成同一份有真实资料的资产 × 两位博主的 topics+plan，对比观点和口播的实质差异。`真实模型调用/完成`、`工程检查`、`人工内容判断`分别记录，不能将测试 PASS 写成全部验证通过。
- [ ] 红楼梦资料不足时报告具体缺项，继续完成软件实现和其他不依赖项，不自造剧情梗概或假验证；未完成用例写 pending。
- [ ] 浏览器实际创建/选择/审核/编辑/导出/刷新测试，截图保存忽略目录，验证从界面生成的任务对应模型运行与落盘数据。自动化脚本带随机端口、60秒超时、finally+全局清理，失败也必须退出。
- [ ] 文档提供一个可读取的交接 JSON 结构样例及接口解释；未经用户授权不运行「会找」正式 Probe，不调用旧渲染器。
- [ ] 最后 `git diff --name-only`、冻结哈希比对、完整相关测试、无本轮遗留服务/进程检查，提交代码和诚实报告。不要 push 未经 Codex 核对的代码。

## 执行与回报

按 T1→T4 执行；模型/资料/权限阻塞时先完成不依赖项，报告错误原文、已完成文件和下一步。禁止只更新任务勾选而无真实文件。每个阶段向 Codex 返回：变更文件、测试命令/结果、实际模型运行标识、待验收项、临时进程清理结果。

用户已明确批准本任务范围和 AGY 执行方式，本任务文档就是实施授权。若需超出 allowlist、调用付费新服务、解冻历史管线或改变验收标准，停在具体边界向 Codex 报告，不能自行扩大。
