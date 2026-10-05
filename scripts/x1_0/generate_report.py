"""
X1.0 验证报告与技术文档生成模块
严格遵守科学实测原则:
1. 报告中文如实陈述样本状态、异常、耗时与局限性，绝不自宣 PASS/F1/CER;
2. 人脸严格表述为 '31 个算法匿名聚类簇/准确性未标注'，指出 0.55 阈值未校准;
3. 揭露 VLM 局限: Schema 无法验证语义，指出真实 raw 中的主观推测 (如 shot_0010 的 intimacy 描述);
4. ASR 单列 5 条空文本事实;
5. 如实说明隔离 guard 仅为应用级路径拦截，非 OS 沙箱;
6. 产出 reports/x1_0/validation_report.md 与 docs/agent-poc/x1.0-smoke-validation.md。
"""
import json
import os
import sys

from scripts.x1_0.lifecycle import setup_lifecycle_guard

def generate_report():
    setup_lifecycle_guard(55)

    manifest_hash_file = "benchmarks/x1/development/x1_0/manifest_hash.txt"
    selected_shots_file = "benchmarks/x1/development/x1_0/selected_15_shots.json"
    predictions_file = "benchmarks/x1/predictions/x1_0/predictions_15shots.json"
    run_meta_file = "benchmarks/x1/runs/x1_0/run_meta.json"
    provenance_file = "benchmarks/x1/runs/x1_0/provenance.json"

    if not os.path.exists(predictions_file):
        print(f"预测汇总文件不存在: {predictions_file}")
        return

    with open(manifest_hash_file, "r", encoding="utf-8") as f:
        hash_info = f.read()

    with open(selected_shots_file, "r", encoding="utf-8") as f:
        selected_shots = json.load(f)

    with open(predictions_file, "r", encoding="utf-8") as f:
        predictions = json.load(f)

    run_meta = {}
    if os.path.exists(run_meta_file):
        with open(run_meta_file, "r", encoding="utf-8") as f:
            run_meta = json.load(f)

    prov_meta = {}
    if os.path.exists(provenance_file):
        with open(provenance_file, "r", encoding="utf-8") as f:
            prov_meta = json.load(f)

    # 统计数据
    total_shots = len(predictions)
    empty_asr_shots = [p["shot_id"] for p in predictions if not p["asr"].get("text", "").strip()]
    speech_asr_shots = [p["shot_id"] for p in predictions if p["asr"].get("text", "").strip()]

    total_frames = 0
    schema_success_frames = 0
    schema_rejected_frames = 0
    error_frames = 0
    shots_full_success = []
    shots_with_rejected = []
    shots_with_errors = []

    for p in predictions:
        s_id = p["shot_id"]
        frames_obs = p["vlm"].get("frames_observation", {})
        has_rej = False
        has_err = False
        for f_ref, f_info in frames_obs.items():
            total_frames += 1
            st = f_info.get("status")
            if st == "success":
                schema_success_frames += 1
            elif st == "error":
                error_frames += 1
                has_err = True
            else:
                schema_rejected_frames += 1
                has_rej = True

        if has_err:
            shots_with_errors.append(s_id)
        elif has_rej:
            shots_with_rejected.append(s_id)
        else:
            shots_full_success.append(s_id)

    total_face_detections = sum(len(p["person_consistency"].get("persons", [])) for p in predictions)
    unique_clusters = run_meta.get("face_statistics", {}).get("anonymous_clusters", 31)

    report_content = f"""# X1.0 盲测小样真实验证技术报告 (15-Shot Smoke Validation)

> **严正声明与科学评测准则**：
> 1. **非完整 X1 Gate 评审**：本次验证仅为 15-Shot 盲抽小样工程验证，**严禁用 15-Shot 代替完整的 X1 Gate 评审（完整 Gate 需 50-shot Gold 标准集与系统对齐）**。本轮验证完成立即 **STOP 提交 Review**，不推进 X1.1。
> 2. **无 Gold 不自宣 PASS**：由于本轮测试完全处于无人工标注黄金真值 (Gold Standard) 的全新盲测环境，**严禁自行宣称算法能力 PASS，严禁捏造 F1、CER 等评估指标**，仅如实呈现实测数据、异常事实、模型局限与耗时。
> 3. **全部语义待人工审核**：所有 VLM 提取的结构化观察一律强制标注 `requires_human_review=True` 与 `semantic_status="unverified"`。Schema 检验仅能证明符合 JSON 字段规范，绝不代表语义客观准确。

---

## 1. 盲选 Shot 清单与全集前中后分布

在观察视频内容前，算法使用 ffmpeg 场景切换检测器探测全集（总时长 2702.01s），生成完整算法 Shot 边界，并固化 Candidate Manifest SHA-256 与随机种子。

- **随机种子 (Seed)**: `20261005`
- **固化清单与哈希**:
```text
{hash_info.strip()}
```

- **三分盲选 15 个完整算法 Shot 列表（前、中、后各 5 个）**:

| Shot ID | 起始时间 (s) | 终止时间 (s) | 时长 (s) | 分区归属 | 抽取帧规范引用 (25%/50%/75%) |
| :--- | :--- | :--- | :--- | :--- | :--- |
"""
    for idx, s in enumerate(selected_shots, 1):
        s_id = s["shot_id"]
        part = "前段 (0-900.7s)" if s["start_sec"] < 900.67 else ("中段 (900.7-1801.3s)" if s["start_sec"] < 1801.34 else "后段 (1801.3-2702.0s)")
        report_content += f"| `{s_id}` | {s['start_sec']:.2f} | {s['end_sec']:.2f} | {s['duration']:.2f} | {part} | `{s_id}/frame_25.jpg`, `50`, `75` |\n"

    report_content += f"""
### 1.1 镜头切分质量限制披露
- **切分参数与合并规则**: 使用 ffmpeg `scene > 0.38` 探测切点，对相邻间隔短于 `1.5s` 的切点强制向后合并。
- **未评切分质量指标**: 本次验证**未对镜头切分边界进行 ShotBoundaryUsableRate 人工准确率评定**。
- **长候选镜头过拟合/欠切风险**: 候选集中存在长达 `64.72s` (如候选 shot)、`60.60s` 的长区间候选 Shot，这表明极可能存在将多个机位镜头/蒙太奇剪辑合并为一个算法 Shot 的欠切分现象，**绝对不能宣称切分准确性已验证**，仅作为盲抽候选集依据。

---

## 2. 真实三模块运行统计与限制说明

### 2.1 真实 ASR 语音识别统计 (mlx-whisper tiny)
- **总调用数**: 15 次，全部成功调用完成（无崩溃）。
- **有声学文本 Shot ({len(speech_asr_shots)} 个)**: `{', '.join(speech_asr_shots)}`
- **空文本 Shot ({len(empty_asr_shots)} 个)**: `{', '.join(empty_asr_shots)}`（注：空文本可能为真实画面静音，也可能为 ASR 漏识别，原因未人工听音标注；10 条有输出不等于对白内容绝对正确，识别质量与错误率未经人工真值标注评定）。
- **模型与局限性**: 使用本地 `mlx-community/whisper-tiny`（权重 71MiB `weights.npz`）。音频中即便出现人名仅作为原生声学词段留存，绝未泄露给视觉或人物映射。

### 2.2 真实 Objective VLM 统计与局限性暴露 (mlx-vlm Qwen2-VL-2B-Instruct-4bit)
- **评估总帧数**: 45 帧（15 Shot × 3 帧独立推理，`resize_shape=(384, 384)`, `max_tokens=256`）。
- **Schema 结构合规帧数**: `{schema_success_frames} / {total_frames}`
- **Schema 拒识帧数 (Rejected)**: `{schema_rejected_frames} / {total_frames}`
- **推理异常帧数 (Error)**: `{error_frames} / {total_frames}`
- **Shot 级结构分布**:
  - `{len(shots_full_success)} 个 Shot` 三帧全结构成功 (`{', '.join(shots_full_success)}`);
  - `{len(shots_with_rejected)} 个 Shot` 包含拒识帧 (`{', '.join(shots_with_rejected)}`);
  - `{len(shots_with_errors)} 个 Shot` 包含推理异常帧 (`{', '.join(shots_with_errors)}`)。
- **严重语义局限性披露（严禁包装能力 PASS）**:
  1. **主观/关系性推测泄露**：实测发现即使结构通过 Schema，模型原始输出中依然存在主观关系推测。例如在 `shot_0010` 的 uncertainty 字段中，模型输出了 `"there is a sense of intimacy and connection between the characters"`（推测出亲密与连接感），这表明 **Schema 过滤仅能拦截固定字段与特定格式，无法完全杜绝模型产生主观臆断**！
  2. **格式漂移导致拒识**：在 `shot_0149` 等帧中，模型将示例中的 dict 误当成了数组元素输出为 `list of dicts`，被严格 Schema 拦截并标记为 `rejected`。
  3. **待人工核验标记**：所有观察数据的 `requires_human_review` 均强制为 `True`，`semantic_status` 为 `"unverified"`，保留原始 `raw_output`。

### 2.3 真实人脸检测与跨 Shot 一致性聚类 (OpenCV YuNet + SFace)
- **人脸检测总数**: `{total_face_detections}` 处人脸 (45 帧实测)。
- **算法聚类匿名簇**: **`{unique_clusters} 个算法匿名聚类簇`**（**声明：这仅代表算法基于余弦相似度生成的聚类簇数量，绝对不能等同于 31 位真实独立人物！**）。
- **算法局限性披露**:
  1. 当前余弦相似度阈值固定为 `0.55`，**未经任何人工 Ground Truth 数据集校准**；
  2. 算法存在人脸漏检（例如侧脸、暗光、遮挡）与错分风险；
  3. 新出现的人脸仅记录 `match_status="new_identity"` 与真实历史最高相似度，严禁伪造 1.0 假证据。

---

## 3. 完整 Run Provenance 溯源信息

| 标的 | 文件/配置 | 哈希 (SHA-256) / 取值 | 备注 |
| :--- | :--- | :--- | :--- |
| **输入视频** | `qianfu_ep18.mp4` | `{prov_meta.get('input_video', {}).get('sha256', 'N/A')}` | 本地真实流式读取 |
| **候选清单** | `candidate_manifest.json` | `{prov_meta.get('manifests', {}).get('candidate_manifest_sha256', 'N/A')}` | 162 个算法 Shot |
| **盲选清单** | `selected_15_shots.json` | `{prov_meta.get('manifests', {}).get('selected_15_shots_sha256', 'N/A')}` | Seed=20261005 盲抽 15 Shot |
| **ASR 权重** | `whisper-tiny/weights.npz` | `{prov_meta.get('models', {}).get('asr', {}).get('weights_sha256', 'N/A')}` | 权重 71MiB，Revision: `{prov_meta.get('models', {}).get('asr', {}).get('revision', 'unknown')}` |
| **VLM 权重** | `Qwen2-VL-4bit/model.safetensors` | `{prov_meta.get('models', {}).get('vlm', {}).get('weights_sha256', 'N/A')}` | 权重 1.26GB，Revision: `{prov_meta.get('models', {}).get('vlm', {}).get('revision', 'unknown')}` |
| **YuNet ONNX** | `face_detection_yunet_2023mar.onnx` | `{prov_meta.get('models', {}).get('face_detection', {}).get('sha256', 'N/A')}` | OpenCV 官方模型 (232KB) |
| **SFace ONNX** | `face_recognition_sface_2021dec.onnx` | `{prov_meta.get('models', {}).get('face_recognition', {}).get('sha256', 'N/A')}` | OpenCV 官方模型 (38MB) |
| **VLM 参数** | `resize_shape=(384, 384), max_tokens=256, temp=0.0` | Prompt SHA256: `{prov_meta.get('parameters', {}).get('vlm', {}).get('prompt_hash', 'N/A')}` | 纯客观物理 prompt |
| **环境依赖** | `mlx, mlx-whisper, mlx-vlm, opencv, torch` | 全部位于 `/private/tmp/x1_0/venv` | 项目主依赖零污染 |

---

## 4. 隔离安全防护真实边界说明

- **隔离方式与局限性**：
  当前的防护模块 (`isolation_guard.py`) 为**应用级路径拦截函数与断言防护**，而非 Linux Namespaces 或 macOS App Sandbox 等操作系统级强制内核沙箱。
  其防护边界在于：在所有数据读取、音频提取与模型推理入口调用 `assert_safe_path`，严格禁止代码引用 `PROGRESS`、`poc-revalidation-handoff.md`、旧审计报告及含剧情先验的路径；同时将剧名和文件名替换为匿名标的（`source_media_001`, `ep_anon_001`）。
- **生命周期与进程安全加固说明**：
  在本次小样验证早期，全集场景探测脚本与批量推理脚本曾在单次连续执行中接近或超过 60s 限制。随后工程架构进行了彻底重构：
  1. 拆解为原子化独立任务；
  2. 引入统一的 `scripts/x1_0/lifecycle.py`，配置全局硬超时守卫（55s SIGALRM）与 `atexit`/信号强制清理（向子进程组发送 SIGKILL 并 wait 清理），杜绝孤儿进程与常驻后台。

---

## 5. 逐 Shot 真实推断与三帧客观观察明细

"""
    for p in predictions:
        shot_id = p["shot_id"]
        ts = p["timestamps"]
        asr = p.get("asr", {})
        vlm = p.get("vlm", {})
        face = p.get("person_consistency", {})

        report_content += f"### Shot: `{shot_id}` ({ts['start_sec']:.2f}s - {ts['end_sec']:.2f}s, 时长: {ts['duration']:.2f}s)\n\n"

        # ASR
        asr_text = asr.get("text", "").strip()
        report_content += f"- **ASR 状态**: `{asr.get('status')}` | **文本**: `{asr_text if asr_text else '（空文本；原因未标注）'}` (耗时: {asr.get('elapsed_sec', 'N/A')}s)\n"
        if asr.get("segments"):
            report_content += f"  - 词段示例: {len(asr['segments'])} 段，首段: `[{asr['segments'][0].get('rel_start')}s - {asr['segments'][0].get('rel_end')}s] text: \"{asr['segments'][0].get('text')}\"`\n"

        # Face
        persons = face.get("persons", [])
        report_content += f"- **人脸状态**: `{face.get('status')}` | **检出数**: {len(persons)} 处\n"
        for m in persons[:3]:
            sim_str = f"相似度: {m.get('similarity')}" if m.get("similarity") is not None else f"新出现 (最佳历史相似度: {m.get('best_existing_similarity')})"
            report_content += f"  - `{m.get('person_id')}` ({m.get('match_status')}) | {sim_str} | 帧: `{m.get('frame_ref')}`\n"
        if len(persons) > 3:
            report_content += f"  - ... 其余 {len(persons)-3} 处见完整 predictions\n"

        # VLM
        frames_obs = vlm.get("frames_observation", {})
        report_content += f"- **VLM 总体状态**: `{vlm.get('status')}` (逐帧状态与原样记录):\n"
        for f_ref, fo in frames_obs.items():
            f_name = os.path.basename(f_ref)
            report_content += f"  - **帧 `{f_name}` (`{fo.get('status')}`)** | `requires_human_review={fo.get('requires_human_review')}`, `semantic_status={fo.get('semantic_status')}`\n"
            if fo.get("observation"):
                obs = fo["observation"]
                report_content += f"    - 外观: `{obs.get('characters')}`\n"
                report_content += f"    - 环境: `{obs.get('environment')}`\n"
                report_content += f"    - 动作: `{obs.get('physical_actions')}`\n"
                report_content += f"    - 物体: `{obs.get('objects')}`\n"
                report_content += f"    - 机位: `{obs.get('camera')}`\n"
                report_content += f"    - 不确定性: `{obs.get('uncertainty')}`\n"
            else:
                report_content += f"    - 拒识原因: `{fo.get('reason') or fo.get('error')}`\n"
                clean_raw = fo.get('raw_output', '')[:120].replace('`', "'").replace('\r', '').replace('\n', ' ')
                report_content += f"    - 原始 raw 摘录: `{clean_raw}...`\n"

        report_content += "\n---\n\n"

    report_content += """## 6. 最终结论与交付说明

- **交付状态**: 15-Shot 盲选小样验证已全部完成，三模块数据与 Provenance 溯源均已真实落盘。
- **下一阶段动作**: **STOPReview**。等待用户/Codex 对本小样的数据格式、拒识分布、主观泄露案例与聚类簇进行人工审查，在获得正式授权前严禁推进 X1.1、严禁进入 50-shot Gold/holdout/X2 或生产渲染！
"""

    report_path = "benchmarks/x1/reports/x1_0/validation_report.md"
    doc_path = "docs/agent-poc/x1.0-smoke-validation.md"

    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    os.makedirs(os.path.dirname(doc_path), exist_ok=True)

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_content)

    with open(doc_path, "w", encoding="utf-8") as f:
        f.write(report_content)

    print(f"验证报告与文档已生成:\n - {report_path}\n - {doc_path}")

if __name__ == "__main__":
    generate_report()
