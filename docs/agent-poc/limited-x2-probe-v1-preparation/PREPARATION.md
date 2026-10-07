# Legacy Evidence Retrieval Diagnostic：组件封存，Gold pending

2026-10-07。用户明确选择现有X1.2旧版快照，只做诊断，不验证v2。当前不是完整冻结，不是运行授权；不commit/push完整冻结、不检索。用户确认AGY客户端尚未完成Gold。

## 已封存的部分

- 原始150条视觉记录字节复制：130 success、20 failed；20失败未删。OCR sidecar、原50-shot Manifest/frames Manifest与旧6字段Schema文件原样复制。
- snapshot-index.json记每文件字节SHA256；corpus-transport.json仅包裹原UTF-8字节文本，不是新Evidence、不修改旧字段/值、不作v1→v2映射。原始schema仍在scripts/x1_1/vlm_schema.py，本轮未改。
- 5条独立作者的真实需求文本保持原样封存；作者只看了原素材采样，没有看Evidence。Q3还需原声核验，Q5还需整集不存在性核验；不能把文本封存说成5条Gold已有效。
- Retriever配置指定既有Gemini 3.1 Pro Low路由、TopK=3、每Query首次一次、0重试、无embedding/rerank/消融；未调用Retriever。Prompt、匹配规则、审计响应Schema与逐Query诊断模板已准备。审计响应Schema不改变Evidence。

## 逐条诊断的冻结要求

Retriever首次输出记录实际使用旧字段的文件路径、JSON pointer和原文引用；不能虚构已使用字段。对需求缺少专用结构、只能自由文本弱表达、实际观察缺失/失败分别记录，不能混成“Schema不能表达”。

首次输出封存后，独立evaluator结合隔离Gold与冻结旧输入诊断Evidence缺失/错误、旧Schema局限、搜索范围不完整、Retriever漏召回/错误候选；只有原输入中已有足够支持证据却漏召回才能支持Retriever问题。检索没找到并不证明Evidence缺失；证据缺失也不代表原片无事件。不能确定归因时undetermined；5Query不证明因果或泛化。

旧输入没有v2 content_region_type、独立boundary/usability、结构化匿名Person/Speaker、Action状态事件范围、key_objects准则或真实ASR归属，不通过人工补写这些字段来让Probe跑通。旧自由文本可能描述部分相同事实，但不等同新结构能力。内容区分无法表达则单列限制，不用“过滤成功”替代缺字段；OCR台词不当原声真值。

模板所有result字段为null，表示尚未运行；不填写假结果、失败原因或“用了哪些字段”。完整结果只能解释为Legacy Evidence Retrieval Diagnostic，不能升级X1.2 Scientific或v2能力。

## 总冻结尚缺的条件

1. AGY公开Gold receipt：原片与Gold SHA256、5任务完成、真实音频感知、整集负例核验和覆盖缺口；不收Gold时间码/答案。
2. 隔离evaluator对4正例在原50-shot范围含完整目标及1真实在场人物不存在事件的适用性确认，仅返回公开布尔就绪状态/数量，不泄漏答案；否则准备INCONCLUSIVE。
3. Gold明文/类别映射/参考答案的实际物理访问隔离，明确未来Retriever无权读取（不能只用Prompt）。隔离路径与执行guard须由Gold负责人确认。
4. 实际Retriever执行方式、允许输入/工具、物理访问guard及执行代码/运行配置hash的最后锁定；只可用冻结数据，禁止读源视频/Gold或按结果换配置。未测试或未锁定不能宣称run-ready。

以上未齐，overall-freeze-status.json保持partial_components_locked / GOLD_PENDING，ready_for_review=false，retrieval_authorized=false。Schema v2及历史Human/Judge/报告不变。STOP等待Gold公开摘要，不自行进入下一阶段。
