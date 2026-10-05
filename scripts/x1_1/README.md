# X1.1 真实工程运行与审核汇总指南 (单次 <= 55s)

> **重要环境与基线声明**:
> 1. **当前真实环境**: 本项目**无外部商业云 API 凭证**，且**本地已彻底清空并删除全部下载的本地视觉/语言大模型权重**，严禁在生产入口启动任何本地模型服务；
> 2. **唯一视觉 Provider**: 生产推理唯一允许配置为已登录的 AGY CLI 通道（`gemini-3.1-pro-low`，`--effort low`），每次请求在独立沙箱目录隔离运行；
> 3. **旧局部 Vision OCR 仅为历史**: 历史本地编译的 `vision_ocr` 与旧抽取流程仅作为阶段归档参考，**当前环境不可执行**。当前阶段采用独立硬字幕 OCR 快照与真实 X1.0 ASR 进行保守融合；
> 4. **生命周期规范**: 所有脚本均受全局 55s 超时守卫保护（`setup_lifecycle_guard(55)`），超时时强制 `SIGKILL` 回收子进程组，无常驻后台进程。

---

## 1. 运行聚焦单元测试 (含真实 Stream 结构与汇总校验)

```bash
source /private/tmp/x1_0/venv/bin/activate

# 运行全套聚焦单元测试 (含 Schema 校验、Stream 解析、人脸隔离、场景细切分及报告汇聚门禁)
pytest tests/x1_1/ -v
```

---

## 2. Shot 细粒度场景切分与 5fps ContactSheet 诊断

```bash
# 2.1 探测物理切点、获取 stats_mgr 指标、校验 100% 覆盖率并生成 5fps contactsheet 拼图
python3 -m scripts.x1_1.analyze_shots --stage detect --parent-id shot_0055

# 2.2 抽取指定子 Shot 代表帧 (start/mid/end)
python3 -m scripts.x1_1.analyze_shots --stage extract --parent-id shot_0055 --child-id shot_0055_c001
```

---

## 3. OCR 独立快照与真实 ASR 保守 Fusion

```bash
# 读取独立硬字幕快照 (benchmarks/x1/development/x1_1/existing_hard_subtitles.json) 与真实 X1.0 ASR 进行时间窗口重叠对齐
# 时间重叠且相似度为 0 显式判为 conflict，无对应者分别标记 ocr_only / asr_only
python3 -m scripts.x1_1.ocr_fusion --stage fuse-existing --parent-id shot_0055
```

---

## 4. 人脸 128D Embedding 与 40 匿名 Pairs

```bash
# 基于 SFace 提取 128 维特征，计算内部余弦相似度并隐藏，生成跨镜头匿名 Pairs (已安全保护，无需重复生成)
python3 -m scripts.x1_1.face_pairs
```

---

## 5. 人工审核与报告汇总全闭环流程

### 步骤 5.1: 生成单 HTML 静态人工审核平台
```bash
# 生成包含 40 对匿名人脸与 45 Anchor 帧的独立审核工作台
python3 -m scripts.x1_1.review --section all --out-html /private/tmp/x1_1/review/review.html
```

### 步骤 5.2: 人工手工核验并导出标注 JSON
1. 审核员在浏览器打开 `/private/tmp/x1_1/review/review.html`；
2. 输入审核员代号（如 `auditor_01`）；
3. 针对 40 对跨镜头人脸肉眼比对判定（同一人 / 不同人 / 不确定）；
4. 针对 45 Anchor 帧手工核对事实陈述（逐项填写 `factual_count` 与 `hallucinated_count`，并对 scene 与 action 独立客观选择）；
5. 点击顶栏 **"导出标注 JSON"**，保存为 `x1_1_human_labels_<reviewer>_<timestamp>.json`。

### 步骤 5.3: 独立人脸阈值校准门禁 (必须具有真人标注)
```bash
# 仅在导出真实 human_review JSON 后运行，模型推理代码绝不触碰标注真值
python3 -m scripts.x1_1.calibrate_face \
  --labels-file benchmarks/x1/predictions/x1_1/human_labels.json \
  --out-report benchmarks/x1/reports/x1_1/calibration_report.json
```

### 步骤 5.4: 执行独立报告汇总器 (生成指标与 Markdown 报告)
```bash
# 基础聚合模式 (未提供人工标签时，人工指标客观保持 pending)
python3 -m scripts.x1_1.assemble_report

# 完整门禁模式 (接入已审核导出的人工真值 JSON)
python3 -m scripts.x1_1.assemble_report \
  --labels-file benchmarks/x1/predictions/x1_1/human_labels.json \
  --calib-report benchmarks/x1/reports/x1_1/calibration_report.json \
  --out-metrics benchmarks/x1/reports/x1_1/metrics.json \
  --out-md docs/agent-poc/x1.1-revalidation-report.md
```

> **门禁提醒**:
> 完整报告输出状态始终为 `awaiting_human_review`，最终以 `STOP 等待 Review` 结束，在人工审核签字前绝不预设或声明 PASS。
