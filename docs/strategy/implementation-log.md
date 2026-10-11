# MCN 策略后台实现与验证日志

> 本文件保留AGY逐阶段执行记录，其中阶段性声明和测试数字不是最终验收结论。以 [Codex独立执行验收](acceptance-2026-10-11.md) 和 [任务看板](任务看板.md) 为准；本轮最新65项相关测试通过，5个真实任务完成审核导出。

日期：2026-10-11
执行仓库：`/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin`
执行代理：AGY (Gemini 3.8 Flash High)
验收方：Codex

---

## Task 1 实施记录 (2026-10-11)

### 1. 交付物
- `src/strategy/schema.mjs`: 原生 ES 模块，包含 `validatePersona`, `validateKnowledge`, `validateAsset`, `validateJob`, `validateGeneration`。具有防 bypass 的严格属性校验、3 个候选选题检查、引用授权检查、Story Beats 物理时间码锁定拒绝（source_interval 强制 null）、素材需求引用闭合校验。
- `src/strategy/store.mjs`: 基于 Node.js `fs/promises` 和 `crypto` 的原子文件持久化实现 `StrategyStore`，支持实体创建、自增版本、按 ID 检索、列表列出、修订版本追加（`appendRevision`）、重启自动恢复与高并发同毫秒 ID 唯一性。
- `src/strategy/seed-personas.mjs`: 包含周老师（叙事拆解/逻辑型）与阿禾（人物关系/共情型）两位对照博主，以及各自独立的分析方法知识。严禁包含任何预写选题、口播草稿或剧集事实答案。
- `.gitignore`: 确保 `.local-data/`, `strategy-data/`, `local-data/`, `video/` 等运行时及素材数据不被 Git 跟踪。
- `tests/strategy-store.test.mjs`: 4 项单元测试全部通过。

### 2. 测试执行命令与结果
- 先验失败验证：`node --test tests/strategy-store.test.mjs` -> `ERR_MODULE_NOT_FOUND`（符合 TDD 规范）。
- 实施后验证：`node --test tests/strategy-store.test.mjs` -> 4 pass, 0 fail (93ms)。
- 基线回归验证：`node --test tests/contracts.test.mjs tests/operations-orchestrator.test.mjs tests/demo-feedback.test.mjs` -> 36 pass, 0 fail (579ms)。

---

## Task 2 实施记录 (2026-10-11)

### 1. 交付物
- `src/strategy/agy-provider.mjs`: 真实模型调用适配器，使用 AGY CLI (`/Users/yoyotaozhou/.local/bin/agy`)，显式参数 `--model gemini-3.8-flash-high`、`--add-dir /Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/shuzhi-mcn-admin`、`--print-timeout 55s`、`--disable-slash-commands`；超时控制严格在 58s (<=60s)；使用 `detached: true` 独立子进程组并在退出/异常/超时信号下使用 `process.kill(-child.pid)` 清理；解析提取严格 JSON 并保存 provenance 元数据（模型标识、耗时、退出码、输出长度等）。
- `src/strategy/prompts.mjs`: 构建严格的数据-指令隔离 Prompt，将事实作为数据传入，严禁编造未引用资料；明确要求输出 3 个 candidates；plan 阶段严格约束 `source_interval = null`、`candidates = []`、`verification_status = 'requested_unverified'`，防止编造物理时间码。
- `src/strategy/service.mjs`: `StrategyService` 领域服务，编排 job 生命周期；内置 `inFlight` Map 拦截同 job 并发重复调用；资产无文本资料时直接短路返回 `needs_context`，不调用模型；校验输出并在异常时落盘为 `failed` 与 `error_message`；支持选定选题、草稿二次编辑（修改即废除旧审核，标记 stale 待重审）、审核以及交接包导出。
- `src/strategy/handoff.mjs`: `exportHandoffPackage` 实现，导出遵循 `mcn.strategy-handoff.v1` 架构契约，仅允许已审核任务导出；服务生成全局唯一 `handoff-` 导出 ID。
- `tests/strategy-generation.test.mjs`: 针对 missing context、并发防重、非法时间码与未授权引用拦截的单元测试。
- `tests/strategy-handoff.test.mjs`: 针对未审核导出拦截、已审核导出、草稿编辑致审核失效与重审后导出的单元测试。

### 2. 测试执行命令与结果
- 先验失败验证：`node --test tests/strategy-generation.test.mjs tests/strategy-handoff.test.mjs` -> `ERR_MODULE_NOT_FOUND`。
- 实施后验证：`node --test tests/strategy-generation.test.mjs tests/strategy-handoff.test.mjs` -> 5 pass, 0 fail (155ms)。
- 累计策略测试：`node --test tests/strategy-store.test.mjs tests/strategy-generation.test.mjs tests/strategy-handoff.test.mjs` -> 9 pass, 0 fail (159ms)。
- 基线回归验证：36 项基线测试持续全通。

---

## Task 3 实施记录 (2026-10-11)

### 1. 交付物
- `src/server/strategy-backend.mjs`: Node 原生内置 HTTP 服务，仅绑定 127.0.0.1，支持随机端口 (`port=0`)；提供完整的 `/api/strategy/*` REST API（人设/知识/资产 CRUD、Job 创建/生成选题/选定选题/生成分镜方案/草稿编辑/审核/交接导出）；严格限制请求体 1MB 防止内存溢出；静态映射 `/strategy/*` 工作台页面并防目录穿越。
- `strategy/index.html`: 原生策略运营工作台界面，划分三个核心区域：1. 人设、资产与资料配置；2. 选题候选与人设对照；3. 口播、分镜需求与交接导出；包含新建博主、录入资料、登记资产与查看交接 JSON 模态框。
- `strategy/style.css`: 复用现有后台的高质感深色主题（Slate / Zinc / Emerald），自适应网格布局与清晰状态指示。
- `strategy/app.mjs`: 浏览器原生 ES module 驱动，提供数据联动、异步任务轮询、选题比对、行内草稿编辑、审核失效重置以及一键导出交接包。
- `index.html`: 在根入口右上角添加「🎯 策略运营工作台 (会想)」导航入口，不改变原有 `app.js` 与布局内容。
- `tests/strategy-api.test.mjs`: 验证 API 生命周期、REST CRUD、选题生成、分镜编排、未审核导出拦截 (400)、审核通过后导出、超大正文拦截 (413) 与静态服务安全性。

### 2. 测试执行命令与结果
- 先验失败验证：`node --test tests/strategy-api.test.mjs` -> `ERR_MODULE_NOT_FOUND`。
- 实施后验证：`node --test tests/strategy-api.test.mjs` -> 1 pass, 0 fail (82ms)。
- 冻结文件校验：`docs/strategy/task-frozen-files-2026-10-11.json` 中 59 个受控文件 SHA256 100% 匹配。
- 累计策略测试：10 项策略测试全部通过。
