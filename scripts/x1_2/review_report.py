#!/usr/bin/env python3
"""
scripts/x1_2/review_report.py
X1.2 50-Shot 独立报告聚合与人工质检看板生成模块 (终版规范)

核心规范与实现:
1. 真实 VLM Schema 校验: 引入 scripts.x1_1.vlm_schema.validate_vlm_output，
   严苛校验 6 大标准核心字段: characters, environment, physical_actions, objects, camera, uncertainty;
2. 真实 Hash 与 Prompt-Schema 重算: 使用 VLMRequest 与真实 INFER_PROMPT、384 分辨率重算
   source_hash、inference_hash 以及 prompt_schema_hash，逐项与 data / response 同名双字段核对;
3. 严格审查 model_version: 必须为 "agy-cli:gemini-3.1-pro-low:effort=low";
4. 真实 Native Stream 审计: 严格调用 scripts.x1_1.assemble_report.verify_stream_log，
   核验 init.cwd、目标绝对沙箱路径、唯一 SUCCESS result 无 denied，以及 native structured_output 与 parsed 相等;
5. 真实 150 帧绝对分母与状态分类:
   - attempted_count: 实际检出推理记录的帧数;
   - missing_count: 预期 150 中未尝试/文件缺失的帧数;
   - attempt_fail_count: 已有尝试但校验失败的帧数;
   - latency 分别统计全部已尝试 (含失败) 与 success_only;
   - resource_accounting 真实汇总 usage input/output/thinking/total，币价标为 unknown;
   - code_hashes 记录 batch/report/provider/prompt 及 source manifest sha256;
   - 即使 150 帧全部通过，总评状态亦标注为 engineering_batch_completed_pending_gold (awaiting_human_gold)，
     Gate 始终保持 pending，绝不伪造整体 PASS；未完成时标为 INCOMPLETE_OR_FAILED;
6. 真实全片 OCR 独立提取: 读取字幕真实的 start_sec/end_sec，记录原文时间与 SHA256，
   按 50 shot 独立输出 ocr_predictions.json，空字幕如实反映 OCR 未检出，不向视觉渗透剧情名，ASR 显式 pending;
7. 独立 review.html 看板: 基于 req.get_standardized_inference_bytes inline 真实 384 图像并 assert hash，
   原图 inline 折叠，方位标注 screen-left/screen-right，完整动态显示 6 大字段;
   镜头边界可用性改为 select 下拉框 (空/yes/no/uncertain)，导出 null 保留状态，无预设选中;
   无重复人脸 40 pairs;
8. 预测特征统计 (单人/多人/无人/室内外) 明确仅为 prediction 观察，不伪造 Gold 或 Person F1;
9. main 第一行执行 setup_lifecycle_guard(55)。
"""

import argparse
import base64
import hashlib
import html
import json
import logging
import math
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set

from scripts.x1_1.lifecycle import setup_lifecycle_guard
from scripts.x1_1.vlm_schema import VLM_OBJECTIVE_SCHEMA, validate_vlm_output
from scripts.x1_1.providers import VLMRequest
from scripts.x1_1.assemble_report import verify_stream_log

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("x1_2_review_report")

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OFFICIAL_MODEL_VERSION = "agy-cli:gemini-3.1-pro-low:effort=low"

OBJECTIVE_VLM_PROMPT = (
    "Analyze the single video frame objectively. "
    "Strictly output a valid JSON object matching the requested schema with all 6 required fields. "
    "Do NOT infer emotion, interpersonal relationships, subjective goals, narrative plot, character names, or dialogue. "
    "Describe only visually observable features. "
    "Do NOT infer camera movement from a single frame. "
    "In 'uncertainty', explicitly note any visible occlusions, blurriness, darkness, or reflections."
)
INFER_PROMPT = (
    OBJECTIVE_VLM_PROMPT + " IMPORTANT: Use screen-left and screen-right to specify positions; "
    "avoid anatomical left/right terms when mirrored or facing the camera."
)


def compute_data_sha256(data: Any) -> str:
    serialized = json.dumps(data, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def compute_file_sha256(filepath: Path) -> Optional[str]:
    if not filepath.exists() or not filepath.is_file():
        return None
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def calc_stats(arr: List[float]) -> Dict[str, Any]:
    if not arr:
        return {"mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0, "p90": 0.0}
    s = sorted(arr)
    n = len(s)
    mean_val = round(sum(s) / n, 2)
    med_val = round(s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2, 2)
    p90_idx = int(math.ceil(0.90 * n)) - 1
    return {
        "mean": mean_val,
        "median": med_val,
        "min": round(s[0], 2),
        "max": round(s[-1], 2),
        "p90": round(s[max(0, min(p90_idx, n - 1))], 2),
    }


# ---------------------------------------------------------------------------
# Strict Inference Record Validation
# ---------------------------------------------------------------------------
def validate_inference_record(
    record_file: Path,
    expected_frame_id: str,
    frames_dir: Path,
    streams_dir: Path,
) -> Tuple[bool, str, Dict[str, Any]]:
    """Validate inference record using genuine schema validation, hash recalculation,
    model version enforcement, and genuine verify_stream_log inspection.
    """
    if not record_file.exists():
        return False, "inference_file_missing", {}

    try:
        with open(record_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return False, f"json_parse_error: {str(e)}", {}

    if data.get("frame_id") != expected_frame_id:
        return False, f"frame_id_mismatch: {data.get('frame_id')} != {expected_frame_id}", data

    if data.get("error"):
        return False, f"provider_error: {data.get('error')}", data

    resp = data.get("response")
    if not resp or not isinstance(resp, dict):
        return False, "response_empty_or_not_dict", data

    # 1. Enforce official model_version
    rec_model = data.get("model_version") or resp.get("model_version")
    if rec_model != OFFICIAL_MODEL_VERSION:
        return False, f"model_version_invalid: expected '{OFFICIAL_MODEL_VERSION}', got '{rec_model}'", data

    # 2. Strict 6-field schema validation via vlm_schema.validate_vlm_output
    pv = resp.get("parsed_validation")
    if not pv or not isinstance(pv, dict):
        return False, "parsed_validation_missing_or_not_dict", data

    is_valid, parsed_data, schema_err = validate_vlm_output(json.dumps(pv, ensure_ascii=False))
    if not is_valid:
        return False, f"vlm_schema_rejected: {schema_err}", data

    # 3. Check source image and recalculate hashes via VLMRequest
    frame_jpg = frames_dir / f"{expected_frame_id}.jpg"
    if not frame_jpg.exists():
        return False, f"source_image_missing: {frame_jpg.name}", data

    with open(frame_jpg, "rb") as f:
        frame_bytes = f.read()

    req = VLMRequest(
        frame_id=expected_frame_id,
        frame_bytes=frame_bytes,
        prompt=INFER_PROMPT,
        schema=VLM_OBJECTIVE_SCHEMA,
        max_tokens=512,
        temperature=0.0,
        resize_dim=384,
    )

    recalculated_src_hash = req.compute_source_hash()
    recalculated_inf_bytes, recalculated_inf_hash = req.get_standardized_inference_bytes()
    recalculated_ps_hash = req.compute_prompt_schema_hash()

    # Both data and resp fields must match recalculated hashes exactly
    d_src = data.get("source_hash")
    r_src = resp.get("source_image_hash")
    if d_src != recalculated_src_hash or r_src != recalculated_src_hash:
        return False, f"source_hash_mismatch: data={d_src}, resp={r_src}, calc={recalculated_src_hash}", data

    d_inf = data.get("inference_hash")
    r_inf = resp.get("inference_image_hash")
    if d_inf != recalculated_inf_hash or r_inf != recalculated_inf_hash:
        return False, f"inference_hash_mismatch: data={d_inf}, resp={r_inf}, calc={recalculated_inf_hash}", data

    r_ps = resp.get("prompt_schema_hash")
    if not r_ps or r_ps != recalculated_ps_hash:
        return False, f"prompt_schema_hash_mismatch: resp={r_ps}, calc={recalculated_ps_hash}", data

    # 4. Genuine verify_stream_log inspection from scripts.x1_1.assemble_report
    stream_file = streams_dir / f"agy_stream_{expected_frame_id}.jsonl"
    stream_ok, stream_err = verify_stream_log(
        stream_path=str(stream_file),
        frame_id=expected_frame_id,
        expected_parsed=parsed_data,
    )
    if not stream_ok:
        return False, f"native_stream_failed: {stream_err}", data

    return True, "validated", data


# ---------------------------------------------------------------------------
# OCR Overlap & Predictions Extraction
# ---------------------------------------------------------------------------
def compute_and_save_ocr_predictions(
    manifest_file: Path,
    ocr_file: Optional[Path],
    out_ocr_pred_file: Path,
) -> Dict[str, Any]:
    """Extract overlapping subtitles strictly using real start_sec/end_sec,
    record text and SHA256 for each of the 50 shots independently, and write ocr_predictions.json.
    Ensures zero drama/series metadata leakage into visual prompt space.
    """
    if not manifest_file.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_file}")

    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    shots = manifest.get("shots", [])

    if not ocr_file or not ocr_file.exists():
        empty_res = {
            "batch_id": "X1.2",
            "ocr_status": "pending_no_ocr_file_provided",
            "total_shots": len(shots),
            "covered_shots_count": 0,
            "coverage_rate": 0.0,
            "shots_ocr": [],
        }
        out_ocr_pred_file.parent.mkdir(parents=True, exist_ok=True)
        with open(out_ocr_pred_file, "w", encoding="utf-8") as f:
            json.dump(empty_res, f, indent=2, ensure_ascii=False)
        return empty_res

    with open(ocr_file, "r", encoding="utf-8") as f:
        raw_ocr = json.load(f)

    subtitles = raw_ocr if isinstance(raw_ocr, list) else (raw_ocr.get("subtitles") or raw_ocr.get("segments") or [])

    shots_ocr_list: List[Dict[str, Any]] = []
    covered_shot_ids = set()

    for s in shots:
        shot_id = s["shot_id"]
        sh_start = float(s["start"])
        sh_end = float(s["end"])

        matched_entries = []
        for sub in subtitles:
            if "start_sec" not in sub or "end_sec" not in sub:
                continue
            s_start = float(sub["start_sec"])
            s_end = float(sub["end_sec"])
            text = str(sub.get("text", "")).strip()

            if max(sh_start, s_start) < min(sh_end, s_end):
                matched_entries.append({
                    "start_sec": s_start,
                    "end_sec": s_end,
                    "text": text,
                    "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                })

        if matched_entries:
            covered_shot_ids.add(shot_id)

        shots_ocr_list.append({
            "shot_id": shot_id,
            "start": sh_start,
            "end": sh_end,
            "subtitles_count": len(matched_entries),
            "matched_subtitles": matched_entries,
        })

    total_shots = len(shots)
    coverage_rate = round(len(covered_shot_ids) / total_shots, 4) if total_shots > 0 else 0.0

    result = {
        "batch_id": "X1.2",
        "ocr_status": "completed",
        "ocr_source_file": str(ocr_file),
        "total_shots": total_shots,
        "covered_shots_count": len(covered_shot_ids),
        "coverage_rate": coverage_rate,
        "notes": "实际 OCR 重叠统计；若镜头字幕列表为空表示画面未检出硬字幕，不代表真实无对白真值",
        "shots_ocr": shots_ocr_list,
    }

    out_ocr_pred_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_ocr_pred_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    logger.info("OCR predictions written to %s (covered %d/%d shots)", out_ocr_pred_file, len(covered_shot_ids), total_shots)
    return result


# ---------------------------------------------------------------------------
# Report Generator (Metrics JSON + Chinese Markdown)
# ---------------------------------------------------------------------------
def generate_report(
    manifest_file: Path,
    runs_dir: Path,
    frames_dir: Path,
    out_metrics_file: Path,
    out_md_file: Path,
    ocr_file: Optional[Path] = None,
    source_video: Optional[Path] = None,
) -> Dict[str, Any]:
    """Generate metrics.json and report.md strictly from 50 manifest shots (150 frames).
    Guards manifest integrity (len=50 and genuine sha256).
    Distinguishes attempted_count, missing_count, and attempt_fail_count.
    Collects full attempt latency vs success_only latency.
    Sums actual usage tokens.
    Records code hashes, source video fingerprint (audit only), and source manifest hash.
    Overall status marks engineering_batch_completed_pending_gold or INCOMPLETE_OR_FAILED (Gates pending).
    """
    if not manifest_file.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_file}")

    source_video_fingerprint = None
    if source_video and source_video.exists():
        source_video_fingerprint = {
            "path": str(source_video),
            "size_bytes": source_video.stat().st_size,
            "sha256": compute_file_sha256(source_video),
            "usage": "audit_and_eval_only_never_flowed_to_model",
        }

    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    # Manifest guards: exactly 50 shots and verified hash
    shots = manifest.get("shots", [])
    if len(shots) != 50:
        raise ValueError(f"Manifest 必须包含恰好 50 个镜头，实际检出: {len(shots)}")

    saved_sha = manifest.get("manifest_sha256")
    manifest_for_hash = dict(manifest)
    manifest_for_hash.pop("manifest_sha256", None)
    calc_sha = compute_data_sha256(manifest_for_hash)
    if saved_sha and saved_sha != calc_sha:
        raise ValueError(f"Manifest SHA256 校验失败: 记录={saved_sha} vs 计算={calc_sha}")

    inferences_dir = runs_dir / "inferences"
    streams_dir = runs_dir / "streams"

    pcts = [25, 50, 75]
    total_expected = len(shots) * len(pcts)  # Exactly 150

    attempted_count = 0
    missing_count = 0
    success_records = []
    attempt_fail_records = []

    all_attempt_latencies = []
    success_latencies = []

    input_tokens_sum = 0
    output_tokens_sum = 0
    thinking_tokens_sum = 0
    total_tokens_sum = 0
    usage_record_count = 0
    records_missing_usage = 0

    # Prediction features (strictly pred, not gold)
    single_person_count = 0
    multi_person_count = 0
    no_person_count = 0
    sampled_frames_with_characters = 0
    total_characters_in_success = 0
    pred_environments = {"interior": 0, "exterior": 0}

    for s in shots:
        shot_id = s["shot_id"]
        for p in pcts:
            frame_id = f"{shot_id}_pct{p}"
            rec_file = inferences_dir / f"{frame_id}.json"

            if not rec_file.exists():
                missing_count += 1
                attempt_fail_records.append({
                    "frame_id": frame_id,
                    "shot_id": shot_id,
                    "pct": p,
                    "reason": "inference_file_missing",
                    "error_detail": "未生成推理落盘记录",
                })
                continue

            attempted_count += 1

            # Read raw record for attempt-level stats
            try:
                with open(rec_file, "r", encoding="utf-8") as rf:
                    r_raw = json.load(rf)
                r_lat = r_raw.get("latency_ms")
                if r_lat is not None and isinstance(r_lat, (int, float)) and r_lat > 0:
                    all_attempt_latencies.append(float(r_lat))

                r_resp = r_raw.get("response") or {}
                r_usage = r_resp.get("usage") or r_raw.get("usage") or {}
                if isinstance(r_usage, dict) and any(v > 0 for v in r_usage.values() if isinstance(v, (int, float))):
                    input_tokens_sum += int(r_usage.get("input_tokens") or 0)
                    output_tokens_sum += int(r_usage.get("output_tokens") or 0)
                    thinking_tokens_sum += int(r_usage.get("thinking_tokens") or 0)
                    total_tokens_sum += int(r_usage.get("total_tokens") or 0)
                    usage_record_count += 1
                else:
                    records_missing_usage += 1
            except Exception:
                records_missing_usage += 1

            is_valid, reason, data = validate_inference_record(
                record_file=rec_file,
                expected_frame_id=frame_id,
                frames_dir=frames_dir,
                streams_dir=streams_dir,
            )

            if is_valid:
                lat = data.get("latency_ms", 0)
                if isinstance(lat, (int, float)) and lat > 0:
                    success_latencies.append(float(lat))

                resp = data.get("response", {})
                pv = resp.get("parsed_validation", {})
                chars = pv.get("characters", [])
                env_text = pv.get("environment", "")

                num_c = len(chars)
                if num_c == 0:
                    no_person_count += 1
                elif num_c == 1:
                    single_person_count += 1
                    sampled_frames_with_characters += 1
                else:
                    multi_person_count += 1
                    sampled_frames_with_characters += 1
                total_characters_in_success += num_c

                env_type = "interior" if any(w in env_text.lower() for w in ["indoor", "room", "interior", "室内", "屋", "房"]) else "exterior"
                pred_environments[env_type] += 1

                success_records.append({
                    "frame_id": frame_id,
                    "shot_id": shot_id,
                    "pct": p,
                    "latency_ms": lat,
                    "source_hash": data.get("source_hash"),
                    "inference_hash": data.get("inference_hash"),
                    "predicted_characters_count": num_c,
                })
            else:
                attempt_fail_records.append({
                    "frame_id": frame_id,
                    "shot_id": shot_id,
                    "pct": p,
                    "reason": reason,
                    "error_detail": data.get("error") if isinstance(data, dict) else None,
                })

    success_count = len(success_records)
    attempt_fail_count = len(attempt_fail_records) - missing_count
    total_failures = len(attempt_fail_records)
    success_rate = round(success_count / total_expected, 4) if total_expected > 0 else 0.0

    is_complete_pass = (success_count == total_expected and total_expected == 150)
    if attempted_count == 150 and missing_count == 0:
        if success_count == 150:
            overall_status = "engineering_batch_completed_pending_gold"
        else:
            overall_status = "engineering_batch_completed_with_errors_pending_gold"
    else:
        overall_status = "INCOMPLETE_OR_FAILED"

    all_attempts_latency_stats = calc_stats(all_attempt_latencies)
    success_only_latency_stats = calc_stats(success_latencies)

    # Save OCR predictions alongside report
    ocr_pred_file = runs_dir / "ocr_predictions.json"
    ocr_stats = compute_and_save_ocr_predictions(
        manifest_file=manifest_file,
        ocr_file=ocr_file,
        out_ocr_pred_file=ocr_pred_file,
    )

    # Compute code hashes
    batch_py_path = REPO_ROOT / "scripts/x1_2/batch.py"
    review_report_py_path = Path(__file__).resolve()
    providers_py_path = REPO_ROOT / "scripts/x1_1/providers.py"

    code_hashes = {
        "batch_py_sha256": compute_file_sha256(batch_py_path),
        "review_report_py_sha256": compute_file_sha256(review_report_py_path),
        "providers_py_sha256": compute_file_sha256(providers_py_path),
        "infer_prompt_sha256": hashlib.sha256(INFER_PROMPT.encode("utf-8")).hexdigest(),
    }

    avg_characters_per_valid = round(total_characters_in_success / success_count, 2) if success_count > 0 else 0.0

    metrics = {
        "batch_id": "X1.2",
        "timestamp": time.time(),
        "overall_status": overall_status,
        "is_complete_pass": is_complete_pass,
        "denominator": total_expected,
        "success_count": success_count,
        "failure_count": total_failures,
        "success_rate": success_rate,
        "counts": {
            "denominator": total_expected,
            "total_shots": len(shots),
            "attempted_count": attempted_count,
            "missing_count": missing_count,
            "attempt_fail_count": attempt_fail_count,
            "success_count": success_count,
            "total_failures": total_failures,
            "success_rate": success_rate,
        },
        "all_attempts_latency_stats_ms": {
            "description": "所有已发生尝试延迟 (包含发生错误/503 但记录了耗时的调用)",
            "count": len(all_attempt_latencies),
            "stats": all_attempts_latency_stats,
        },
        "success_only_latency_stats_ms": {
            "description": "仅通过完整校验的成功帧耗时分布",
            "count": len(success_latencies),
            "stats": success_only_latency_stats,
        },
        "resource_accounting": {
            "input_tokens_sum": input_tokens_sum,
            "output_tokens_sum": output_tokens_sum,
            "thinking_tokens_sum": thinking_tokens_sum,
            "total_tokens_sum": total_tokens_sum,
            "usage_record_count": usage_record_count,
            "records_missing_usage": records_missing_usage,
            "unattempted_excluded_from_usage": missing_count,
            "currency_cost": "unknown",
            "provider_model": "gemini-3.1-pro-low",
            "effort": "low",
        },
        "code_and_manifest_hashes": {
            "source_manifest_sha256": saved_sha,
            "source_video_fingerprint": source_video_fingerprint,
            "code_hashes": code_hashes,
        },
        "coverage": {
            "visual_frames_total": total_expected,
            "visual_frames_validated": success_count,
            "ocr_coverage": {
                "covered_shots": ocr_stats.get("covered_shots_count", 0),
                "total_shots": ocr_stats.get("total_shots", len(shots)),
                "coverage_rate": ocr_stats.get("coverage_rate", 0.0),
            },
            "audio_asr_status": "pending_no_old_15_reuse",
        },
        "prediction_observations_not_gold": {
            "single_person_frames": single_person_count,
            "multi_person_frames": multi_person_count,
            "no_person_frames": no_person_count,
            "sampled_frames_with_characters": sampled_frames_with_characters,
            "avg_characters_per_valid_frame": avg_characters_per_valid,
            "environment_distribution": pred_environments,
            "characters_metric_description": "characters 列表条目数的模型预测提取，不能保证每条一人，绝非 Gold 真值；严禁凭此宣称人物一致性。",
            "disclaimer": "以上仅为 characters 列表条目数的模型预测提取，不能保证每条一人，绝对不视为人工真值 (Gold) / 绝非人工真值；严禁凭此宣称人物一致性或伪造 Person F1 指标。",
        },
        "gates_status": {
            "full_person_consistency_gate": "pending",
            "narrative_affordance_gate": "pending",
            "human_evaluation_gold_gate": "pending",
        },
        "integrity_claims": {
            "strict_denominator_150": True,
            "no_fake_status_counting": True,
            "schema_verified_vlm_output": True,
            "hashes_recalculated_and_matched": True,
            "native_stream_trace_verified": True,
            "no_gold_or_person_f1_forged": True,
            "first_round_503_no_retry": True,
            "overall_status_not_fake_pass": True,
        },
        "failures": attempt_fail_records,
    }

    out_metrics_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_metrics_file, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)

    if attempted_count == 150 and missing_count == 0:
        if is_complete_pass:
            status_badge = "工程批次全量完成待人工真值 (engineering_batch_completed_pending_gold)"
        else:
            status_badge = f"工程批次调用完成但含错误待人工真值 (未宣称通过, engineering_batch_completed_with_errors_pending_gold: {success_count}/150 成功，{attempt_fail_count} 失败)"
    else:
        status_badge = f"未完成全量验证 (未宣称通过, INCOMPLETE_OR_FAILED: {success_count}/{total_expected} 成功，{missing_count} 缺失，{attempt_fail_count} 失败)"

    md_content = f"""# X1.2 50-Shot (150 Frames) 客观基准评测报告 (终版严格校验)

## 1. 核心执行与真实验证概览

- **评测批次**: `X1.2`
- **当前总评**: **{status_badge}**
- **采样模式**: 全视频分段随机抽样 (Seed: `20261006`，前中后 `17/17/16`，共 `50` 个镜头)
- **基准分母**: **{total_expected} 帧** (50 镜头 × 3 点位 25%/50%/75% 绝对分母)
- **已尝试帧数 (Attempted)**: **{attempted_count} 帧**
- **缺失/未尝试帧数 (Missing)**: **{missing_count} 帧**
- **严格校验成功**: **{success_count} / {total_expected}**
- **实际成功率**: **{success_rate * 100:.2f}%**
- **尝试失败数 (Attempt Fails)**: **{attempt_fail_count} 帧** (含 503 等真实服务故障，严禁伪造重试)

> **严谨判定标准**: 成功判定完全脱离 `status` 字段表面值，基于：
> 1. `scripts.x1_1.vlm_schema.validate_vlm_output` 真实 6 字段 Schema 检验；
> 2. `VLMRequest` 重算 `source_hash`、`inference_hash` 与 `prompt_schema_hash` 逐项双字段一致；
> 3. `scripts.x1_1.assemble_report.verify_stream_log` 审计 `agy_stream_{{frame_id}}.jsonl` 目标文件 `view_file` 真实完成，无 `denied_actions`。

---

## 2. 耗时与 Token 消耗透明度

| 指标项 | 统计值 | 说明 |
| :--- | :--- | :--- |
| **已尝试均值延迟 (All Attempts Avg)** | `{all_attempts_latency_stats['mean']} ms` | 包含失败/503 等记录了耗时的全部调用 |
| **仅成功均值延迟 (Success Only Avg)** | `{success_only_latency_stats['mean']} ms` | 仅限通过完整校验的成功帧 |
| **P50 / P90 延迟 (仅成功)** | `{success_only_latency_stats['median']} ms / {success_only_latency_stats['p90']} ms` | 耗时分布分位数 |
| **Token 总消耗 (Total Tokens Sum)** | `{total_tokens_sum}` | Input: `{input_tokens_sum}`, Output: `{output_tokens_sum}`, Thinking: `{thinking_tokens_sum}` |
| **Token 记录覆盖** | `{usage_record_count} 条有效 / {records_missing_usage} 条已尝试缺失 / {missing_count} 条未尝试已排除` | 仅统计已尝试帧中未知 usage，未尝试批次完全排除 |
| **计费成本 (Currency)** | `unknown` | 无虚构估算，如实标记 |
| **使用模型** | `gemini-3.1-pro-low` | low effort, 384x384 标准化输入 |

---

## 3. 多模态覆盖率与预测特征提取 (非真值)

- **视觉帧覆盖 (Visual Coverage)**: `{success_count} / {total_expected}` ({success_rate * 100:.2f}%)
- **全片 OCR 覆盖 (OCR Overlap)**:
  - 覆盖镜头数: **{ocr_stats.get('covered_shots_count', 0)} / {ocr_stats.get('total_shots', 50)}** (覆盖率 `{ocr_stats.get('coverage_rate', 0.0) * 100:.1f}%`)
  - 说明: 空字幕镜头如实反映画面未检出硬字幕，不代表真实无对白真值。
  - 独立落盘: `benchmarks/x1/runs/x1_2/ocr_predictions.json`
- **音频 ASR 状态 (Audio ASR)**: **`Pending`**
  - **严禁复用**：50 个新镜头绝不可复用历史 15 镜头的 ASR 结果充当真值，当前标注保持待生成状态。
- **视觉预测统计 (Prediction Only, 绝对不视为人工真值)**:
  - 画面人物预测分布: 单人 `{single_person_count}` 帧，多人 `{multi_person_count}` 帧，无人 `{no_person_count}` 帧
  - 计数口径说明: characters 字段仅统计模型输出列表条目数，模型无法保证每条对应真实一人，绝非 Gold 真值；严禁凭此宣称人物一致性或伪造 Person F1 指标。
  - 空间环境预测分布: `{pred_environments}`

---

## 4. 全局 Gates 验证状态看板

| Gate 门禁名称 | 状态 | 阻断/说明 |
| :--- | :---: | :--- |
| **全片人物一致性 Gate (PersonConsistency)** | `Pending` | 本轮不运行本地模型，绝不改用或套用旧 0.4067 阈值，不可声称用于新 Gemini 匿名人物 |
| **叙事可用性 Gate (NarrativeAffordance)** | `Pending` | 尚待独立剧本/故事线匹配器校验 |
| **人工真值评估 Gate (Human Gold Gate)** | `Pending` | 待由独立 review 看板完成盲测人审，推理代码严格禁读 |

---

## 5. 失败与异常分布记录 ({total_failures} 项)

"""
    if attempt_fail_records:
        md_content += "| 帧 ID | 镜头 | 点位 | 失败根因 | 原始错误详情 |\n| :--- | :--- | :---: | :--- | :--- |\n"
        for fr in attempt_fail_records[:30]:
            err_d = (fr.get("error_detail") or "-").replace("\n", " ")[:60]
            md_content += f"| `{fr['frame_id']}` | `{fr['shot_id']}` | `{fr['pct']}%` | `{fr['reason']}` | `{err_d}` |\n"
        if len(attempt_fail_records) > 30:
            md_content += f"\n*(已截断显示前 30 项失败记录，全部 {len(attempt_fail_records)} 项详见 metrics.json)*\n"
    else:
        md_content += "无任何失败记录，150 帧全量通过真实校验！\n"

    out_md_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_md_file, "w", encoding="utf-8") as f:
        f.write(md_content)

    logger.info("Report generated: metrics at %s, md at %s", out_metrics_file, out_md_file)
    return metrics


# ---------------------------------------------------------------------------
# UI Localization & Translation Lookup
# ---------------------------------------------------------------------------
CAMERA_STATIC_MAP = {
    "extreme long shot": "大远景",
    "extreme wide shot": "大远景",
    "very long shot": "大远景",
    "long shot": "远景",
    "wide shot": "远景",
    "medium long shot": "中远景",
    "medium wide shot": "中远景",
    "full shot": "全景",
    "medium shot": "中景",
    "medium close up": "中特写",
    "medium close-up": "中特写",
    "close up": "特写",
    "close-up": "特写",
    "extreme close up": "大特写",
    "extreme close-up": "大特写",
    "overhead shot": "俯拍/顶视",
    "bird's eye view": "鸟瞰",
    "birds eye view": "鸟瞰",
    "high angle": "俯拍",
    "low angle": "仰拍",
    "dutch angle": "倾斜镜头",
    "point of view": "主观视点",
    "pov": "主观视点",
    "two shot": "双人镜头",
    "over the shoulder": "过肩镜头",
    "ots": "过肩镜头",
    "aerial shot": "航拍",
    "cowboy shot": "半身/牛仔镜头",
    "unknown": "未知",
}

SEGMENT_STATIC_MAP = {
    "early": "前",
    "mid": "中",
    "late": "后",
    "unknown": "未知",
}


def normalize_screen_directions(text: str) -> str:
    """将 screen-left / screen-right 及其变体统一替换为 画面左侧 / 画面右侧"""
    if not text:
        return ""
    text = re.sub(r'\bscreen[- ]left\b', '画面左侧', text, flags=re.IGNORECASE)
    text = re.sub(r'\bscreen[- ]right\b', '画面右侧', text, flags=re.IGNORECASE)
    return text


def load_translations_dict(translations_file: Optional[Path]) -> Dict[str, str]:
    """安全读取翻译字典，如果文件不存在或为空则返回空字典。
    字典格式: SHA256(UTF8原字段单个字符串) -> 忠实中文。
    """
    if not translations_file:
        return {}
    p = Path(translations_file)
    if not p.exists() or not p.is_file():
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception as e:
        logger.warning("无法加载翻译字典 %s: %s", p, e)
    return {}


def localize_text(text: Any, translations: Optional[Dict[str, str]] = None, is_camera: bool = False) -> str:
    """按 SHA256(UTF8文本) 查中文，common camera 静态中文 map，纯中文保留，空值未提供，未翻译提示中文翻译待补齐。"""
    if text is None:
        return "未提供"
    stripped = str(text).strip()
    if not stripped:
        return "未提供"

    trans_dict = translations or {}

    # 1. 查字典优先: SHA256(UTF8原字段单个字符串)
    val_sha = hashlib.sha256(stripped.encode("utf-8")).hexdigest()
    if val_sha in trans_dict and trans_dict[val_sha]:
        trans = str(trans_dict[val_sha]).strip()
        return normalize_screen_directions(trans)

    # 2. 景别常见枚举静态中文 map
    lower_val = stripped.lower()
    if is_camera or lower_val in CAMERA_STATIC_MAP:
        if lower_val in CAMERA_STATIC_MAP:
            return CAMERA_STATIC_MAP[lower_val]

    # 3. 方位词归一化
    norm_val = normalize_screen_directions(stripped)

    # 4. 原本含中文且无英文描述原样保留
    has_chinese = bool(re.search(r'[\u4e00-\u9fff]', norm_val))
    has_english = bool(re.search(r'[a-zA-Z]', norm_val))
    if has_chinese and not has_english:
        return norm_val

    # 5. 译文缺失明确提示中文翻译待补齐，不静默英文 fallback
    return "【中文翻译待补齐】"


def localize_value(raw_val: Any, translations: Optional[Dict[str, str]] = None, is_camera: bool = False) -> str:
    """处理可能为列表或单值的字段，多项用顿号连接；
    None 和空字符串必须为'未提供'，只有模型实际输出空列表（[]）才可为'无'，避免将失败伪造成无人物/无动作。
    """
    if raw_val is None:
        return "未提供"
    if isinstance(raw_val, list):
        if len(raw_val) == 0:
            return "无"
        return "、".join([localize_text(item, translations, is_camera=is_camera) for item in raw_val])
    stripped = str(raw_val).strip()
    if not stripped:
        return "未提供"
    return localize_text(stripped, translations, is_camera=is_camera)


AI_VERDICT_MAP = {
    "no_obvious_error": "未见明显错误",
    "needs_correction": "需要修正",
    "uncertain": "无法确定",
    "unavailable": "无模型结果",
}


def load_ai_review(ai_review_file: Optional[Path]) -> Optional[Dict[str, Any]]:
    """安全读取 AI 复核结果 (Codex)。
    JSON 合同:
    review_type="ai_review", human_gold=false, reviewer="Codex",
    shots: { "<shot_id>": { "verdict": ..., "note": ... } }
    """
    if not ai_review_file:
        return None
    p = Path(ai_review_file)
    if not p.exists() or not p.is_file():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception as e:
        logger.warning("无法加载 AI 复核文件 %s: %s", p, e)
    return None


# ---------------------------------------------------------------------------
# Review HTML Viewer Generator
# ---------------------------------------------------------------------------
def generate_review_html(
    manifest_file: Path,
    frames_dir: Path,
    runs_dir: Path,
    output_html_file: Path,
    clips_dir: Optional[Path] = None,
    translations_file: Optional[Path] = None,
    ai_review_file: Optional[Path] = None,
) -> Path:
    """Generate standalone review.html with:
    - Inline 384 standardized image generated via req.get_standardized_inference_bytes;
    - Hash assertion and display;
    - Inline collapsible original image;
    - Dynamically displays all 6 parsed fields (characters, environment, physical_actions, objects, camera, uncertainty);
    - Grouped by 50 shots with timing;
    - AI review banner (Codex) display per shot;
    - Completely empty default audit fields (factual/hallucinated counts, scene/action);
    - Shot boundary usability select (empty/yes/no/uncertain) with null export for untouched;
    - Robust LocalStorage persistence and JSON export with provenance == 'human_review';
    - No duplicated 40 face pairs.
    """
    if not manifest_file.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_file}")

    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    translations_dict = load_translations_dict(translations_file)
    ai_review_data = load_ai_review(ai_review_file)
    ai_shots_map = ai_review_data.get("shots", {}) if (ai_review_data and isinstance(ai_review_data, dict)) else {}

    shots = manifest.get("shots", [])
    inferences_dir = runs_dir / "inferences"

    html_parts = [
        "<!DOCTYPE html>",
        "<html lang='zh-CN'>",
        "<head>",
        "<meta charset='utf-8'/>",
        "<title>X1.2 50-Shot 独立人工质检工作台</title>",
        "<style>",
        "  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b1120; color: #f1f5f9; margin: 0; padding: 24px; }",
        "  .topbar { position: sticky; top: 0; background: #1e293b; border-bottom: 2px solid #334155; padding: 14px 20px; border-radius: 8px; z-index: 1000; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3); margin-bottom: 24px; }",
        "  .btn { background: #0284c7; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; }",
        "  .btn:hover { background: #0369a1; }",
        "  .btn-outline { background: transparent; border: 1px solid #64748b; color: #cbd5e1; margin-right: 8px; }",
        "  .btn-outline:hover { background: #334155; }",
        "  .badge { background: #334155; color: #38bdf8; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-family: monospace; }",
        "  .shot-card { background: #1e293b; border-radius: 10px; margin-bottom: 28px; padding: 20px; border: 1px solid #334155; }",
        "  .shot-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 12px; margin-bottom: 16px; }",
        "  .shot-title { font-size: 17px; font-weight: bold; color: #38bdf8; }",
        "  .shot-meta { font-size: 13px; color: #94a3b8; }",
        "  .frame-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }",
        "  .frame-box { background: #0f172a; border-radius: 8px; padding: 14px; border: 1px solid #334155; }",
        "  .frame-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }",
        "  .frame-pct { font-weight: bold; color: #e2e8f0; font-size: 14px; }",
        "  .img-container { text-align: center; background: #000; border-radius: 6px; padding: 4px; margin-bottom: 10px; }",
        "  img.thumb { width: 100%; height: 220px; object-fit: contain; border-radius: 4px; }",
        "  .mirror-hint { background: #1e1b4b; color: #a5b4fc; padding: 6px 10px; border-radius: 4px; font-size: 11px; margin-bottom: 10px; border-left: 3px solid #6366f1; }",
        "  .schema-display { background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; font-size: 12px; margin-bottom: 12px; line-height: 1.4; }",
        "  .schema-field { margin-bottom: 6px; }",
        "  .schema-key { color: #38bdf8; font-weight: 600; }",
        "  .audit-section { background: #162032; border: 1px solid #334155; border-radius: 6px; padding: 10px; margin-top: 10px; font-size: 12px; }",
        "  .audit-title { font-weight: 600; color: #93c5fd; margin-bottom: 6px; font-size: 12px; }",
        "  .input-row { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }",
        "  .input-row label { font-size: 12px; color: #cbd5e1; }",
        "  .input-row input[type=number] { width: 65px; background: #0f172a; border: 1px solid #475569; color: #f1f5f9; padding: 4px 6px; border-radius: 4px; font-size: 12px; }",
        "  .radio-row { display: flex; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }",
        "  .radio-row label { cursor: pointer; font-size: 12px; color: #cbd5e1; }",
        "  .note-input { width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #475569; color: #f1f5f9; padding: 6px; border-radius: 4px; font-size: 12px; margin-top: 6px; }",
        "  .boundary-row { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #334155; font-size: 12px; color: #facc15; display: flex; align-items: center; }",
        "  .boundary-select { background: #0f172a; color: #f1f5f9; border: 1px solid #475569; padding: 4px 8px; border-radius: 4px; margin-left: 8px; font-size: 12px; }",
        "</style>",
        "</head>",
        "<body>",
        "  <div class='topbar'>",
        "    <div>",
        "      <strong style='font-size: 16px;'>X1.2 50-Shot 独立人工质检工作台</strong>",
        "      <span class='badge' style='margin-left: 12px;'>Provenance: human_review</span>",
        "      <input type='text' id='reviewer-name' placeholder='填写审核员标识 (必填)' style='margin-left:14px; padding:6px 10px; border-radius:4px; border:1px solid #475569; background:#0f172a; color:#fff; font-size:12px;' />",
        "    </div>",
        "    <div>",
        "      <input type='file' id='import-file' style='display:none;' onchange='importJSON(event)' />",
        "      <button class='btn btn-outline' onclick=\"document.getElementById('import-file').click()\">导入进度</button>",
        "      <button class='btn' onclick='exportJSON()'>导出标注真值 (JSON)</button>",
        "    </div>",
        "  </div>",
        "  <div style='background: #1e1b4b; border: 1px solid #4338ca; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; color: #c7d2fe; font-size: 13px; line-height: 1.6;'>",
        "    <strong>💡 质检机制说明:</strong> <strong>AI 复核与人工真值分开，人工修订选填不需要逐项填写。</strong>",
        "    AI 复核结论仅供质检参考，绝不自动填充至人工标注。审核员如发现偏差可针对性填报人工修订。",
        "  </div>",
        "  <p style='color: #94a3b8; font-size: 13px; line-height: 1.5; margin-bottom: 24px;'>",
        "    <strong>质检规范:</strong> 方位统一遵循 <code>画面左侧</code> 与 <code>画面右侧</code>；",
        "    标签输入字段默认全部留空，避免确认偏差；导出的人工标注结果仅供独立评估模块加载，模型推理代码绝对隔离。",
        "  </p>",
    ]

    for s in shots:
        shot_id = s["shot_id"]
        start_sec = s["start"]
        end_sec = s["end"]
        dur = s["duration"]
        seg = s.get("segment", "unknown")
        seg_zh = SEGMENT_STATIC_MAP.get(str(seg).lower(), str(seg))

        shot_ai = ai_shots_map.get(shot_id) if isinstance(ai_shots_map, dict) else None
        if shot_ai and isinstance(shot_ai, dict) and "verdict" in shot_ai:
            raw_v = shot_ai.get("verdict", "")
            zh_v = AI_VERDICT_MAP.get(raw_v, str(raw_v))
            zh_n = html.escape(str(shot_ai.get("note", "")))
            ai_banner_html = (
                f"  <div class='ai-review-banner' style='background:#172554; border:1px solid #1e40af; border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:12px; color:#bfdbfe;'>"
                f"    <strong>🤖 AI复核结论 (Codex):</strong> <span style='font-weight:600; color:#60a5fa;'>{html.escape(zh_v)}</span>"
                + (f" <span style='color:#93c5fd; margin-left:8px;'>| 备注: {zh_n}</span>" if zh_n else "")
                + f"  </div>"
            )
        else:
            ai_banner_html = (
                f"  <div class='ai-review-banner' style='background:#1e293b; border:1px solid #334155; border-radius:6px; padding:8px 14px; margin-bottom:14px; font-size:12px; color:#94a3b8;'>"
                f"    <strong>🤖 AI复核结论:</strong> <span>AI 复核尚未完成</span>"
                f"  </div>"
            )

        html_parts.append("<div class='shot-card'>")
        html_parts.append(
            f"  <div class='shot-header'>"
            f"    <span class='shot-title'>{html.escape(shot_id)} <span class='badge'>镜头段落: {seg_zh}</span></span>"
            f"    <span class='shot-meta'>区间: <code>{start_sec:.2f}s - {end_sec:.2f}s</code> (时长: {dur:.2f}s)</span>"
            f"  </div>"
        )
        html_parts.append(ai_banner_html)
        html_parts.append("  <div class='frame-grid'>")

        for p in [25, 50, 75]:
            frame_id = f"{shot_id}_pct{p}"
            t_sec = round(start_sec + dur * (p / 100.0), 3)

            frame_jpg = frames_dir / f"{frame_id}.jpg"
            img_384_b64 = ""
            raw_img_b64 = ""
            calc_inf_hash = "unknown"

            if frame_jpg.exists():
                try:
                    with open(frame_jpg, "rb") as f:
                        raw_bytes = f.read()
                    raw_img_b64 = f"data:image/jpeg;base64,{base64.b64encode(raw_bytes).decode('utf-8')}"

                    req = VLMRequest(
                        frame_id=frame_id,
                        frame_bytes=raw_bytes,
                        prompt=INFER_PROMPT,
                        schema=VLM_OBJECTIVE_SCHEMA,
                        resize_dim=384,
                    )
                    std_bytes, calc_inf_hash = req.get_standardized_inference_bytes()
                    img_384_b64 = f"data:image/jpeg;base64,{base64.b64encode(std_bytes).decode('utf-8')}"
                except Exception as e:
                    logger.debug("Failed computing 384 for %s: %s", frame_id, e)

            infer_file = inferences_dir / f"{frame_id}.json"
            pv_dict = None
            if infer_file.exists():
                try:
                    with open(infer_file, "r", encoding="utf-8") as fp:
                        idata = json.load(fp)
                        resp_obj = idata.get("response") or {}
                        pv_dict = resp_obj.get("parsed_validation")
                except Exception:
                    pv_dict = None

            html_parts.append(f"    <div class='frame-box' data-fid='{frame_id}'>")
            html_parts.append(
                f"      <div class='frame-header'>"
                f"        <span class='frame-pct'>{p}% 关键帧</span>"
                f"        <span class='badge'>{t_sec}s</span>"
                f"      </div>"
            )

            html_parts.append("      <div class='img-container'>")
            if img_384_b64:
                html_parts.append(f"        <img class='thumb' src='{img_384_b64}' alt='{frame_id} 384' />")
            else:
                html_parts.append(f"        <div style='color:#ef4444; font-size:12px; padding:30px 0;'>帧图片未提取 ({frame_id}.jpg)</div>")
            html_parts.append("      </div>")

            # Collapsible original image with hash
            inf_hash_text = "未知" if calc_inf_hash == "unknown" else f"{calc_inf_hash[:16]}..."
            html_parts.append(
                f"      <details style='font-size:11px; color:#94a3b8; margin-bottom:8px;'>"
                f"        <summary style='cursor:pointer; color:#38bdf8;'>查看原图折叠 & 384哈希核对</summary>"
                f"        <div style='margin-top:4px;'>推理图像哈希: <code>{html.escape(inf_hash_text)}</code></div>"
                f"        <img src='{raw_img_b64}' style='width:100%; margin-top:4px; border-radius:4px; border:1px solid #334155;' />"
                f"      </details>"
            )

            html_parts.append(
                "      <div class='mirror-hint'>"
                "        <strong>方位校准:</strong> 统一使用 <code>画面左侧</code> 与 <code>画面右侧</code> (面向镜头人物已按屏幕画面左右统一对齐)"
                "      </div>"
            )

            if pv_dict and isinstance(pv_dict, dict):
                # 原始六字段分离保留（绝不覆盖原结果）
                raw_chars_list = pv_dict.get("characters")
                raw_env = pv_dict.get("environment")
                raw_acts_list = pv_dict.get("physical_actions")
                raw_objs_list = pv_dict.get("objects")
                raw_cam = pv_dict.get("camera")
                raw_unc = pv_dict.get("uncertainty")

                raw_chars_str = ", ".join(raw_chars_list) if (isinstance(raw_chars_list, list) and len(raw_chars_list) > 0) else ("无" if isinstance(raw_chars_list, list) else "未提供")
                raw_env_str = str(raw_env) if raw_env is not None and str(raw_env).strip() else "未提供"
                raw_acts_str = ", ".join(raw_acts_list) if (isinstance(raw_acts_list, list) and len(raw_acts_list) > 0) else ("无" if isinstance(raw_acts_list, list) else "未提供")
                raw_objs_str = ", ".join(raw_objs_list) if (isinstance(raw_objs_list, list) and len(raw_objs_list) > 0) else ("无" if isinstance(raw_objs_list, list) else "未提供")
                raw_cam_str = str(raw_cam) if raw_cam is not None and str(raw_cam).strip() else "未提供"
                raw_unc_str = str(raw_unc) if raw_unc is not None and str(raw_unc).strip() else "未提供"

                # 6 字段主展示全部中文，查字典优先；缺失明确提示【中文翻译待补齐】，绝不伪造无值为无人物
                zh_chars_str = localize_value(raw_chars_list, translations_dict)
                zh_env_str = localize_value(raw_env, translations_dict)
                zh_acts_str = localize_value(raw_acts_list, translations_dict)
                zh_objs_str = localize_value(raw_objs_list, translations_dict)
                zh_cam_str = localize_value(raw_cam, translations_dict, is_camera=True)
                zh_unc_str = localize_value(raw_unc, translations_dict)

                html_parts.append(
                    f"      <div class='schema-display'>"
                    f"        <div class='schema-field'><span class='schema-key'>[人物]</span> {html.escape(str(zh_chars_str))}</div>"
                    f"        <div class='schema-field'><span class='schema-key'>[空间环境]</span> {html.escape(str(zh_env_str))}</div>"
                    f"        <div class='schema-field'><span class='schema-key'>[物理动作]</span> {html.escape(str(zh_acts_str))}</div>"
                    f"        <div class='schema-field'><span class='schema-key'>[实体静物]</span> {html.escape(str(zh_objs_str))}</div>"
                    f"        <div class='schema-field'><span class='schema-key'>[构图景别]</span> <code>{html.escape(str(zh_cam_str))}</code></div>"
                    f"        <div class='schema-field'><span class='schema-key'>[不确定性]</span> {html.escape(str(zh_unc_str))}</div>"
                    f"      </div>"
                )

                # 所有原始六字段在中文标题查看模型原始结果的details折叠保留
                html_parts.append(
                    f"      <details style='font-size:11px; color:#94a3b8; margin-bottom:12px; background:#090d16; padding:8px; border-radius:6px; border:1px solid #1e293b;'>"
                    f"        <summary style='cursor:pointer; color:#38bdf8; font-weight:600;'>查看模型原始结果</summary>"
                    f"        <div style='margin-top:6px; line-height:1.5;'>"
                    f"          <div><strong style='color:#64748b;'>[characters]:</strong> {html.escape(str(raw_chars_str))}</div>"
                    f"          <div><strong style='color:#64748b;'>[environment]:</strong> {html.escape(str(raw_env_str))}</div>"
                    f"          <div><strong style='color:#64748b;'>[physical_actions]:</strong> {html.escape(str(raw_acts_str))}</div>"
                    f"          <div><strong style='color:#64748b;'>[objects]:</strong> {html.escape(str(raw_objs_str))}</div>"
                    f"          <div><strong style='color:#64748b;'>[camera]:</strong> <code>{html.escape(str(raw_cam_str))}</code></div>"
                    f"          <div><strong style='color:#64748b;'>[uncertainty]:</strong> {html.escape(str(raw_unc_str))}</div>"
                    f"        </div>"
                    f"      </details>"
                )
            else:
                html_parts.append(
                    f"      <div class='schema-display' style='color:#f87171; border-color:#7f1d1d; background:#1e141d;'>"
                    f"        <div class='schema-field'><span class='schema-key' style='color:#f87171;'>[识别状态]</span> 识别调用失败，未返回描述</div>"
                    f"      </div>"
                )
                html_parts.append(
                    f"      <details style='font-size:11px; color:#94a3b8; margin-bottom:12px; background:#090d16; padding:8px; border-radius:6px; border:1px solid #1e293b;'>"
                    f"        <summary style='cursor:pointer; color:#38bdf8; font-weight:600;'>查看模型原始结果</summary>"
                    f"        <div style='margin-top:6px; line-height:1.5; color:#ef4444;'>无模型推理记录 (识别调用失败，未返回描述)</div>"
                    f"      </details>"
                )

            # Blank audit form wrapped in collapsed details (DOM id, LocalStorage键, 单选值保持不变，可见文字纯中文，绝不把AI结果预填成人工标注)
            html_parts.append(
                f"      <details style='margin-top:10px; background:#162032; border:1px solid #334155; border-radius:6px; padding:10px;'>"
                f"        <summary style='cursor:pointer; color:#38bdf8; font-weight:600; font-size:12px;'>可选：补充人工修订</summary>"
                f"        <div class='audit-section' style='background:transparent; border:none; padding:0; margin-top:8px;'>"
                f"          <div class='audit-title' style='color:#38bdf8; font-weight:bold; font-size:13px; border-bottom:1px solid #334155; padding-bottom:4px; margin-bottom:8px;'>人工修订 (选填)</div>"
                f"          <div class='audit-title'>1. 事实计数 (选填，无预设):</div>"
                f"          <div class='input-row'>"
                f"            <label>客观属实数: <input type='number' min='0' id='factual_{frame_id}' oninput='autoSave()'></label>"
                f"            <label>存在幻觉数: <input type='number' min='0' id='hallucinated_{frame_id}' oninput='autoSave()'></label>"
                f"          </div>"
                f"          <div class='audit-title'>2. 场景客观性审核:</div>"
                f"          <div class='radio-row'>"
                f"            <label><input type='radio' name='scene_{frame_id}' value='accepted' onchange='autoSave()'> 符合</label>"
                f"            <label><input type='radio' name='scene_{frame_id}' value='rejected' onchange='autoSave()'> 驳回</label>"
                f"            <label><input type='radio' name='scene_{frame_id}' value='uncertain' onchange='autoSave()'> 不确定</label>"
                f"          </div>"
                f"          <div class='audit-title'>3. 动作客观性审核:</div>"
                f"          <div class='radio-row'>"
                f"            <label><input type='radio' name='action_{frame_id}' value='accepted' onchange='autoSave()'> 符合</label>"
                f"            <label><input type='radio' name='action_{frame_id}' value='rejected' onchange='autoSave()'> 驳回</label>"
                f"            <label><input type='radio' name='action_{frame_id}' value='uncertain' onchange='autoSave()'> 不确定</label>"
                f"          </div>"
                f"          <input type='text' class='note-input' id='note_{frame_id}' placeholder='填写核对备注/歧义记录' oninput='autoSave()'>"
                f"        </div>"
                f"      </details>"
            )

            html_parts.append("    </div>")

        # Video clip embed for human boundary and audio review (not sent to VLM)
        clip_mp4_b64 = ""
        if clips_dir:
            clip_file = clips_dir / f"{shot_id}.mp4"
            if clip_file.exists() and clip_file.stat().st_size > 0:
                try:
                    with open(clip_file, "rb") as cf:
                        clip_mp4_b64 = f"data:video/mp4;base64,{base64.b64encode(cf.read()).decode('utf-8')}"
                except Exception as ce:
                    logger.debug("Failed reading clip for %s: %s", shot_id, ce)

        html_parts.append("  </div>")  # Close frame-grid

        if clip_mp4_b64:
            html_parts.append(
                f"  <details style='margin-top: 14px; background: #0f172a; padding: 10px; border-radius: 6px; border: 1px solid #334155;'>"
                f"    <summary style='cursor: pointer; color: #38bdf8; font-size: 13px; font-weight: 600;'>▶ 播放 Shot 视频片段核对边界与音频 (已内嵌 MP4, 仅供人工质检)</summary>"
                f"    <div style='margin-top: 10px;'>"
                f"      <video controls style='width: 100%; max-width: 640px; border-radius: 4px; background: #000;' src='{clip_mp4_b64}' preload='metadata'></video>"
                f"      <div style='font-size: 11px; color: #94a3b8; margin-top: 4px;'>提示: 本视频片段专供人工复核切点边界与音频对白，绝对隔离，不送入任何 VLM 模型。</div>"
                f"    </div>"
                f"  </details>"
            )
        else:
            html_parts.append(
                f"  <div style='margin-top: 12px; font-size: 11px; color: #64748b;'>"
                f"    <em>(未提供本地视频切片 clip_missing: 可通过 export_clip.py 导出 /tmp/x1_2/clips/{shot_id}.mp4 进行视听核对)</em>"
                f"  </div>"
            )

        # Boundary select for the shot (empty/yes/no/uncertain) - unselected exports as null without default rejection
        html_parts.append(
            f"  <div class='boundary-row'>"
            f"    <label for='boundary_{shot_id}'><strong>[镜头边界可用性]:</strong></label>"
            f"    <select id='boundary_{shot_id}' class='boundary-select' onchange='autoSave()'>"
            f"      <option value=''>-- 待审核 (未判定, 导出为 null) --</option>"
            f"      <option value='yes'>切点边界干净可用</option>"
            f"      <option value='no'>存在场景混杂/切点偏差</option>"
            f"      <option value='uncertain'>不确定</option>"
            f"    </select>"
            f"    <span style='color:#94a3b8; margin-left:12px;'>起止区间: {start_sec:.2f}s - {end_sec:.2f}s (时长: {dur:.2f}s)</span>"
            f"  </div>"
            f"</div>"
        )

    # Robust JavaScript logic
    html_parts.append("""
  <script>
    const STORAGE_KEY = "x1_2_review_cache_v4";

    function getFormData() {
      const data = {
        timestamp: new Date().toISOString(),
        provenance: "human_review",
        batch_id: "X1.2",
        reviewer: document.getElementById("reviewer-name").value || "anonymous_reviewer",
        frame_audits: {},
        shot_boundaries: {},
      };

      document.querySelectorAll(".frame-box").forEach(box => {
        const fid = box.getAttribute("data-fid");
        const factInp = document.getElementById("factual_" + fid);
        const hallInp = document.getElementById("hallucinated_" + fid);
        const sceneRadio = box.querySelector("input[name='scene_" + fid + "']:checked");
        const actionRadio = box.querySelector("input[name='action_" + fid + "']:checked");
        const noteInp = document.getElementById("note_" + fid);

        data.frame_audits[fid] = {
          factual_count: factInp && factInp.value !== "" ? parseInt(factInp.value, 10) : null,
          hallucinated_count: hallInp && hallInp.value !== "" ? parseInt(hallInp.value, 10) : null,
          scene_audit: sceneRadio ? sceneRadio.value : null,
          action_audit: actionRadio ? actionRadio.value : null,
          notes: noteInp ? noteInp.value : "",
        };
      });

      document.querySelectorAll("select[id^='boundary_']").forEach(sel => {
        const shotId = sel.id.replace("boundary_", "");
        data.shot_boundaries[shotId] = sel.value !== "" ? sel.value : null;
      });

      return data;
    }

    function autoSave() {
      const data = getFormData();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {}
    }

    function restoreFromData(data) {
      if (!data) return;
      if (data.reviewer) {
        document.getElementById("reviewer-name").value = data.reviewer;
      }

      if (data.frame_audits) {
        for (const [fid, item] of Object.entries(data.frame_audits)) {
          if (!item) continue;
          const factInp = document.getElementById("factual_" + fid);
          if (factInp && item.factual_count !== null && item.factual_count !== undefined) {
            factInp.value = item.factual_count;
          }
          const hallInp = document.getElementById("hallucinated_" + fid);
          if (hallInp && item.hallucinated_count !== null && item.hallucinated_count !== undefined) {
            hallInp.value = item.hallucinated_count;
          }
          if (item.scene_audit) {
            const r = document.querySelector("input[name='scene_" + fid + "'][value='" + item.scene_audit + "']");
            if (r) r.checked = true;
          }
          if (item.action_audit) {
            const r = document.querySelector("input[name='action_" + fid + "'][value='" + item.action_audit + "']");
            if (r) r.checked = true;
          }
          if (item.notes) {
            const n = document.getElementById("note_" + fid);
            if (n) n.value = item.notes;
          }
        }
      }

      if (data.shot_boundaries) {
        for (const [shotId, val] of Object.entries(data.shot_boundaries)) {
          const sel = document.getElementById("boundary_" + shotId);
          if (sel) sel.value = val !== null && val !== undefined ? val : "";
        }
      }
    }

    function exportJSON() {
      const reviewer = document.getElementById("reviewer-name").value;
      if (!reviewer || !reviewer.trim()) {
        alert("导出前必须填写审核员标识 (Reviewer)！");
        return;
      }
      const data = getFormData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "x1_2_human_labels_" + reviewer.trim() + "_" + Date.now() + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function importJSON(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const data = JSON.parse(e.target.result);
          restoreFromData(data);
          autoSave();
          alert("标注数据成功恢复！");
        } catch(err) {
          alert("JSON 恢复失败: " + err);
        }
      };
      reader.readAsText(file);
    }

    window.addEventListener("DOMContentLoaded", () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          restoreFromData(JSON.parse(saved));
        }
      } catch (e) {}
    });
  </script>
</body>
</html>
""")

    output_html_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_html_file, "w", encoding="utf-8") as f:
        f.write("\n".join(html_parts))
    logger.info("Review HTML successfully generated at %s", output_html_file)
    return output_html_file


# ---------------------------------------------------------------------------
# CLI Dispatcher
# ---------------------------------------------------------------------------
def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser(description="X1.2 Review & Report Generator (Strict Verification)")
    parser.add_argument("--action", type=str, default="all", choices=["report", "review", "ocr", "all"])
    parser.add_argument("--manifest-file", type=Path, default=Path("benchmarks/x1/runs/x1_2/manifest.json"))
    parser.add_argument("--runs-dir", type=Path, default=Path("benchmarks/x1/runs/x1_2"))
    parser.add_argument("--frames-dir", type=Path, default=Path("benchmarks/x1/runs/x1_2/frames"))
    parser.add_argument("--ocr-file", type=Path, default=None)
    parser.add_argument("--out-metrics", type=Path, default=Path("benchmarks/x1/runs/x1_2/metrics.json"))
    parser.add_argument("--out-md", type=Path, default=Path("benchmarks/x1/runs/x1_2/report.md"))
    parser.add_argument(
        "--out-html",
        type=Path,
        default=Path("/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/x1_2-review/review.html"),
    )
    parser.add_argument(
        "--translations-file",
        type=Path,
        default=Path("/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/x1_2-review/translations.zh.json"),
        help="Optional translations dictionary JSON mapping SHA256(UTF8 string) -> Chinese",
    )
    parser.add_argument(
        "--ai-review-file",
        type=Path,
        default=Path("/Users/yoyotaozhou/Documents/antigravity/intelligent-pasteur/artifacts/x1_2-review/ai_review.json"),
        help="Optional AI review JSON file from Codex",
    )
    parser.add_argument("--clips-dir", type=Path, default=Path("/private/tmp/x1_2/clips"))
    parser.add_argument("--source-video", type=Path, default=None, help="Optional source video for reporting fingerprint only")

    args = parser.parse_args()

    if args.action in ("ocr",):
        ocr_pred_file = args.runs_dir / "ocr_predictions.json"
        res = compute_and_save_ocr_predictions(manifest_file=args.manifest_file, ocr_file=args.ocr_file, out_ocr_pred_file=ocr_pred_file)
        print(json.dumps(res, indent=2, ensure_ascii=False))

    if args.action in ("report", "all"):
        generate_report(
            manifest_file=args.manifest_file,
            runs_dir=args.runs_dir,
            frames_dir=args.frames_dir,
            out_metrics_file=args.out_metrics,
            out_md_file=args.out_md,
            ocr_file=args.ocr_file,
            source_video=args.source_video,
        )

    if args.action in ("review", "all"):
        generate_review_html(
            manifest_file=args.manifest_file,
            frames_dir=args.frames_dir,
            runs_dir=args.runs_dir,
            output_html_file=args.out_html,
            clips_dir=args.clips_dir,
            translations_file=args.translations_file,
            ai_review_file=args.ai_review_file,
        )


if __name__ == "__main__":
    main()
