# X1.0 盲测小样工程模块与重跑复核指南

本目录包含 X1.0 小样验证的完整可复现脚本。所有输出严格归于 `benchmarks/x1/` 规范目录，隔离虚拟环境位于 `/private/tmp/x1_0/venv`。

---

## 1. 环境依赖复现与模型下载来源

### 1.1 Python 隔离虚拟环境
```bash
python3.12 -m venv /private/tmp/x1_0/venv
/private/tmp/x1_0/venv/bin/pip install mlx mlx-whisper mlx-vlm opencv-python-headless pytest
```

| 核心依赖包 | 实际运行版本 (Provenance) | 职责 |
| :--- | :--- | :--- |
| `mlx` | `0.32.3` | Apple Silicon 本地硬件加速底层 |
| `mlx-whisper` | `0.4.3` | 本地 ASR 语音识别与词级时间戳提取 |
| `mlx-vlm` | `0.7.4` | 本地轻量 Objective VLM 视觉推理 |
| `opencv-python-headless` | `4.10.0.84` | YuNet 人脸检测与 SFace 特征向量提取 |
| `transformers` | `5.18.0` | 模型分词器与多模态预处理支持 |
| `torch` | `2.14.1` | 依赖底层张量兼容工具 |

### 1.2 本地轻量模型权重与存储路径
所有模型保存在 `/private/tmp/x1_0/models/`，绝不提交至 git 仓库：

| 模块 | 官方/开源来源 Repo | 本地持久化路径 | 核心权重文件与体积 | 实际 Query Revision |
| :--- | :--- | :--- | :--- | :--- |
| **ASR** | `mlx-community/whisper-tiny` | `/private/tmp/x1_0/models/whisper-tiny` | `weights.npz` (71 MiB) | `unknown` (本地离线快照，未含 commit 哈希) |
| **VLM** | `mlx-community/Qwen2-VL-2B-Instruct-4bit` | `/private/tmp/x1_0/models/Qwen2-VL-2B-Instruct-4bit` | `model.safetensors` (1.26 GB) | `unknown` (本地离线快照，未含 commit 哈希) |
| **Face Detect** | OpenCV Zoo `YuNet` | `/private/tmp/x1_0/models/face_detection_yunet_2023mar.onnx` | ONNX (232 KB) | 官方固定发布版 |
| **Face Recog** | OpenCV Zoo `SFace` | `/private/tmp/x1_0/models/face_recognition_sface_2021dec.onnx` | ONNX (38 MB) | 官方固定发布版 |

---

## 2. 核心脚本体系与职责

| 脚本文件 | 职责说明 | 超时保护与清理策略 |
| :--- | :--- | :--- |
| `scripts/x1_0/lifecycle.py` | 统一生命周期守护模块 | 注册 55s SIGALRM 硬超时，atexit/signal 时对子进程组强制发送 SIGKILL 并 wait 清理 |
| `scripts/x1_0/isolation_guard.py` | 隔离与路径安全校验模块 | 严格拦截 `PROGRESS`、`poc-revalidation-handoff.md`、旧审计与剧情先验路径 |
| `scripts/x1_0/contract.py` | 数据契约与严苛 Schema 校验 | `requires_human_review=True`, `semantic_status="unverified"`, `episode_scope` 数组校验 |
| `scripts/x1_0/shot_sampler.py` | 算法 Shot 前中后三分盲选采样器 | 校验负时间、超长、重复 ID、NaN/Inf，固化 Seed=20261005 |
| `scripts/x1_0/detect_shots.py` | 分阶段场景探测与素材抽取 | 支持 `--stage detect/finalize/extract`，单任务 <= 55s，已有锁禁止覆写 |
| `scripts/x1_0/run_face_batch.py` | 15-Shot 纯人脸全局聚类批处理 | 全局维护 `known_persons` 状态，实测耗时 ~3.6s |
| `scripts/x1_0/run_asr_batch.py` | 15-Shot 真实语音识别批处理 | 基于本地 `whisper-tiny` 权重，实测耗时 ~11.9s |
| `scripts/x1_0/run_vlm_single.py` | 单 Shot 三帧 VLM 客观推理原子任务 | 基于本地 `Qwen2-VL-4bit` 权重，单 Shot 耗时 ~22-25s |
| `scripts/x1_0/run_vlm_batch.py` | 15-Shot VLM 调度器 | 支持 `--budget 1..55`，断点续跑，子进程超时 killpg 并 wait |
| `scripts/x1_0/assemble_final_deliverables.py` | 交付物汇总组装与 Provenance 记录 | 重新解析原始 raw，生成 predictions, runs, provenance 并触发报告 |
| `scripts/x1_0/generate_report.py` | 事实性验证报告与文档生成器 | 如实呈现实测数据、异常与局限，严禁自宣 PASS |

---

## 3. Codex 独立验证与复核重跑指令

所有执行请使用隔离环境 Python：`/private/tmp/x1_0/venv/bin/python`

### 3.1 运行自动化测试套件
```bash
PYTHONPATH=. /private/tmp/x1_0/venv/bin/pytest tests/x1_0/
```

### 3.2 一键执行交付物汇总与报告生成 (无模型推理耗时，通常 <= 3 秒完成)
```bash
PYTHONPATH=. /private/tmp/x1_0/venv/bin/python scripts/x1_0/assemble_final_deliverables.py
```
该命令会自动：
1. 流式读取并校验输入源视频、候选清单与抽取帧的真实 SHA-256；
2. 重新严格解析 15-Shot 的已有真实 VLM raw 输出，确保注入 `requires_human_review=True` 与 `semantic_status="unverified"`；
3. 区分 error 与 rejected 帧；保留人脸 `partial_error` 诊断；
4. 汇总生成：
   - `benchmarks/x1/predictions/x1_0/predictions_15shots.json`
   - `benchmarks/x1/predictions/x1_0/predictions_single_shot.json`
   - `benchmarks/x1/runs/x1_0/run_meta.json`
   - `benchmarks/x1/runs/x1_0/provenance.json`
   - `benchmarks/x1/reports/x1_0/validation_report.md`
   - `docs/agent-poc/x1.0-smoke-validation.md`

### 3.3 分阶段原子复现指令 (若从原始视频重新探测与抽取):
1. **分块探测 (各 <= 55s)**:
   ```bash
   PYTHONPATH=. /private/tmp/x1_0/venv/bin/python scripts/x1_0/detect_shots.py --stage detect --chunk-index 0
   PYTHONPATH=. /private/tmp/x1_0/venv/bin/python scripts/x1_0/detect_shots.py --stage detect --chunk-index 1
   PYTHONPATH=. /private/tmp/x1_0/venv/bin/python scripts/x1_0/detect_shots.py --stage detect --chunk-index 2
   ```
2. **汇总固化锁定 Manifest (已有锁禁止覆写)**:
   ```bash
   PYTHONPATH=. /private/tmp/x1_0/venv/bin/python scripts/x1_0/detect_shots.py --stage finalize
   ```
3. **单 Shot 抽取素材 (例 shot_0010, <= 15s)**:
   ```bash
   PYTHONPATH=. /private/tmp/x1_0/venv/bin/python scripts/x1_0/detect_shots.py --stage extract --shot-id shot_0010
   ```

### 3.4 单独重跑推理模块:
- **重跑 15-Shot 纯人脸全局一致性 (耗时 ~3.6s)**:
  ```bash
  PYTHONPATH=. /private/tmp/x1_0/venv/bin/python scripts/x1_0/run_face_batch.py
  ```
- **重跑 15-Shot 纯 ASR 语音识别 (耗时 ~11.9s)**:
  ```bash
  PYTHONPATH=. /private/tmp/x1_0/venv/bin/python scripts/x1_0/run_asr_batch.py
  ```
- **单 Shot VLM 推理 (例 shot_0010, 耗时 ~22s)**:
  ```bash
  PYTHONPATH=. /private/tmp/x1_0/venv/bin/python scripts/x1_0/run_vlm_single.py --shot-id shot_0010
  ```
- **VLM 断点批处理调度 (--budget 1..55)**:
  ```bash
  PYTHONPATH=. /private/tmp/x1_0/venv/bin/python scripts/x1_0/run_vlm_batch.py --budget 55
  ```

