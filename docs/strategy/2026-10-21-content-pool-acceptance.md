# 博主内容池与节目计数：实现与验收记录

日期：2026-10-21

状态：本次限定功能已在本地实现并经 Codex 独立复跑验证；未执行云端部署，未上传媒资或既存业务代码。

产品依据：[统一后台与 AI Native 博主库方案](2026-10-20-ai-native-creator-library.md)，第 3.5、11 节。

## 实现结果

主要编码执行者为 AGY CLI，显式模型 gemini-3.8-flash-high；Codex 负责需求边界、代码审查与独立验证。本次通过交互模式逐项处理所需命令授权，没有开启全局跳过权限。

1. 博主风格与媒资匹配条件分开保存，创建/编辑页新增“内容池设置”。
2. 题材与节目标签同时满足，所选内容类型任选其一；未选择的条件不限制。
3. 点击“统计节目数量”后显示“覆盖节目 N 部”，不展示命中节目清单或内部版本号。
4. 区分待统计、统计中、零命中、目录未配置、目录异常及统计失败；失败后仍可保存博主配置。
5. 保存筛选条件和有来源依据的统计快照；刷新和重新编辑可恢复。条件或目录版本变化后，旧数量失效；目录尚未核对成功时不展示旧数。
6. 晚到响应与切换博主隔离；改变条件时取消在途统计，允许重新发起。
7. 原有 asset_ids 生产授权保持独立。目录命中不代表原片、事实资料或使用条件已满足，不自动改写生产资产授权。

## 媒资目录

- 原始文件 CONTENT_EXPORT_793.csv 保持原样，仅本地保存。
- 实际读取 608 行；以 oid 优先、节目编码兜底去重，导入后 424 个节目标识。
- 只导入必要的节目标识、名称、内容类型、流派及标签，不复制图片 URL、许可证等字段。
- 目录存放在 Git 忽略的 .local-data/catalog/content-catalog.json。
- 目录版本由规范化内容计算，记录实际 UTC 导入时间；原子写入，失败保留旧文件。
- 当前 424 部是这批目录的覆盖规模，不是已接入原片或具备生成条件的节目数量。

## 修改范围

| 文件 | 作用 |
|---|---|
| admin-runtime/views/creator.mjs | 内容池界面、统计状态、请求隔离与保存恢复 |
| admin-runtime/creator-options.mjs | 默认配置及前端快照校验 |
| admin-runtime/api.mjs | 内容池选项、数量接口及原 AI 参数隔离 |
| src/server/strategy-backend.mjs | 可信本地目录加载、选项与数量 API |
| src/strategy/schema.mjs | 内容池配置及快照校验，兼容旧档案 |
| src/strategy/content-pool.mjs | 匹配、去重与快照判断 |
| scripts/strategy/import-content-catalog.py | 本地 CSV 导入 |
| scripts/strategy/verify-content-pool.mjs | 临时数据下的真实浏览器验收与截图 |
| tests/strategy-content-pool.test.mjs | 匹配、接口、校验与导入测试 |

对开发前备份中的 63 个普通文件逐一比较，实际变化只有上表前五个允许修改的既有文件；其他实现文件为本次新增。未覆盖其他用户已有改动。

## 独立验证结果

### 相关回归：45 项通过，0 失败

Codex 实际复跑以下 Node 测试文件：

- tests/strategy-content-pool.test.mjs
- tests/strategy-api.test.mjs
- tests/strategy-creator-options.test.mjs
- tests/strategy-admin-integration.test.mjs
- tests/strategy-ui-binding.test.mjs
- tests/strategy-security-edge.test.mjs
- tests/strategy-generation.test.mjs
- tests/strategy-serve.test.mjs

覆盖去重、标签 AND / 类型 OR、零命中与缺目录区别、异常输入、档案兼容与保存、目录版本及快照失效、导入版本与原子写入，以及原有相关流程。

### 真实浏览器验收：通过，退出码 0

Codex 独立执行 node scripts/strategy/verify-content-pool.mjs，使用临时业务数据副本与虚构小目录，没有修改正式记录或调用真实内容生成模型。

- 标签点击、按需统计、只显示数量；原资产授权 ID 集合不变。
- 条件变化、延迟响应与切换博主的隔离。
- 统计接口失败后仍可保存，随后可重试。
- 保存后重新编辑与真实 page.reload() 恢复。
- 目录选项读取延迟或失败时不展示未经核对的旧数量。
- 目录版本变化使旧快照回到待统计。
- 1440 宽、608 宽及内容池区块截图；Codex 已查看区块和窄屏结果。
- 55 秒看门狗、随机端口、真实 BrowserServer PID 跟踪及退出清理。

截图保存在本地 .local-data/evidence/content-pool/，其中“覆盖节目 1 部”为虚构验收目录结果，不代表正式媒资筛选结果。

### 数据保护

- 正式 persona、knowledge、job、asset 共 23 份 JSON 文件 SHA-256 校验一致。
- app.js、styles.css、demo-logic.js、src/strategy/service.mjs 四个冻结核心文件校验一致。
- 原始媒资 CSV 校验一致。
- git diff --check 通过。

本地独立验证日志位于父项目 artifacts/mcn-coding-2026-10-21/：codex-regression.log、codex-browser-verification.log、formal-data-after.log。

## 已知边界

全量策略回归中，既有媒体探测测试受本机 FFmpeg 工具依赖限制，不能宣称全量回归全部通过。本次独立复跑的上述 45 项与真实浏览器验收均通过；没有删改旧测试或安装依赖以绕过限制。

本次未扩展五类角色资料库、完整 AI 创建编排、跨内容池自动选题或云端部署。代码保留在当前本地工作区；本轮 GitHub 文档更新不包含原始媒资及其他既存业务代码。
