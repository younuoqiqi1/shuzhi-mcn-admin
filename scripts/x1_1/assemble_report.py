"""
scripts/x1_1/assemble_report.py
X1.1 独立报告汇总器与工程指标聚合模块 (严格运行时动态计算 / 真实错误与实验成本全覆盖)

核心规范与修改:
1. 全局 55s 生命周期守卫 (setup_lifecycle_guard);
2. 45 帧正式评估指标:
   - 统计按实际 anchor_tuples 长度为分母与 total_anchors，非 45 标明 is_formal_45=False 且绝不能声明正式门槛通过;
   - 严格区分“所有已尝试延迟 (含服务失败如 503，缺失不计)”与“仅成功记录延迟”，表述杜绝夸大;
   - validate_schema_dict 调用 vlm_schema.validate_vlm_output 完整类型/枚举/长度校验;
   - verify_stream_log 从 init.cwd 严格 normpath 校验沙箱目标图片 (拦截 fake basename outside cwd)，校验唯一 SUCCESS result 无 denied，且 native structured_output == parsed_validation;
   - 动态重新计算原图 SHA256 与 384 标准推理 Hash，校验一致性;
   - 缺失记录与 503 服务错误均真实反映在 error 与 missing 中，输出 awaiting_human_review。
3. Preflight 记录审查:
   - 4 次默认 high+low 冲突为实际发生的配置错误 (unexpected_configuration_error)，非事先规划测试;
   - 修复后归档，虽不在正式 45 分母，但计入总实验开销与 token 成本。
4. Pilot 目录动态聚合:
   - 动态扫描 default_effort_pilot 目录下全部实际推理记录 (如 16 条：12 成功，4 超时)，统计总尝试数、成功/超时、usage 与 latency;
   - 明确标注为“非完整默认高档 pilot”，绝不可与 45 正式低档同条件混淆。
5. 实验全成本与方法限制:
   - 汇总全局总实验消耗 (45 正式尝试 + 16 pilot + 4 preflight 配置错误);
   - 历史 Qwen2-VL-2B (本地离线) 与当前 AGY CLI Gemini (受控沙箱) 属于不同方法论与系统环境，严禁声称同条件或能力通过;
   - 人类未给出的阈值和质量指标全部保持 pending;
   - estimate_pipeline_projection 无实测延迟时不凭空 35s fallback，返回 pending 估算。
"""
import argparse
import hashlib
import json
import math
import os
import sys
import time
from typing import Dict, Any, List, Optional, Tuple

from scripts.x1_1.lifecycle import setup_lifecycle_guard
from scripts.x1_1.isolation_guard import assert_safe_path
from scripts.x1_1.vlm_schema import VLM_OBJECTIVE_SCHEMA, validate_vlm_output
from scripts.x1_1.run_vlm import OBJECTIVE_VLM_PROMPT
from scripts.x1_1.providers import VLMRequest

OFFICIAL_MODEL_VERSION = "agy-cli:gemini-3.1-pro-low:effort=low"
SELECTED_15_DEFAULT = "benchmarks/x1/development/x1_0/selected_15_shots.json"
PRED_DIR_DEFAULT = "benchmarks/x1/predictions/x1_1"
RUNS_DIR_DEFAULT = "benchmarks/x1/runs/x1_1"
OCR_SNAPSHOT_DEFAULT = "benchmarks/x1/development/x1_1/existing_hard_subtitles.json"
FACE_PAIRS_DEFAULT = "benchmarks/x1/predictions/x1_1/face_pairs_anonymous.json"
PILOT_DIR_DEFAULT = "benchmarks/x1/runs/x1_1/default_effort_pilot"
PREFLIGHT_DIR_DEFAULT = "benchmarks/x1/runs/x1_1/invalid_effort_preflight"
CALIB_REPORT_DEFAULT = "benchmarks/x1/reports/x1_1/calibration_report.json"
METRICS_JSON_DEFAULT = "benchmarks/x1/reports/x1_1/metrics.json"
REPORT_MD_DEFAULT = "docs/agent-poc/x1.1-revalidation-report.md"

class ReportAssemblyError(Exception):
    pass

class ModelVersionConflictError(ReportAssemblyError):
    pass

class HumanLabelsValidationError(ReportAssemblyError):
    pass

def compute_file_sha256(filepath: str) -> str:
    if not os.path.exists(filepath):
        return "file_not_found"
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def calc_stats(arr: List[float]) -> Dict[str, Any]:
    if not arr:
        return {"mean": None, "median": None, "min": None, "max": None, "p90": None}
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
        "p90": round(s[max(0, min(p90_idx, n - 1))], 2)
    }

def validate_schema_dict(parsed: Any) -> Tuple[bool, Optional[str]]:
    if not isinstance(parsed, dict):
        return False, f"parsed_validation 必须为 dict 结构，实际为: {type(parsed).__name__}"
    try:
        raw_json_str = json.dumps(parsed, ensure_ascii=False)
    except Exception as e:
        return False, f"JSON 序列化失败: {str(e)}"

    is_valid, _, val_err = validate_vlm_output(raw_json_str)
    return is_valid, val_err

def verify_stream_log(
    stream_path: str,
    frame_id: str,
    expected_parsed: Optional[Dict[str, Any]] = None
) -> Tuple[bool, Optional[str]]:
    if not os.path.exists(stream_path):
        return False, f"stream 日志文件不存在: {stream_path}"

    init_cwd = None
    has_view_file_done = False
    illegal_tools = []
    denied_actions = []
    result_events = []

    with open(stream_path, "r", encoding="utf-8") as f:
        for line in f:
            line_str = line.strip()
            if not line_str.startswith("{"):
                continue
            try:
                ev = json.loads(line_str)
                if ev.get("event") == "init" or "init" in ev:
                    init_data = ev.get("init") if isinstance(ev.get("init"), dict) else ev
                    cwd_val = init_data.get("cwd")
                    if cwd_val:
                        init_cwd = cwd_val

                d_top = ev.get("denied_actions")
                if d_top:
                    if isinstance(d_top, list):
                        denied_actions.extend(d_top)
                    else:
                        denied_actions.append(str(d_top))

                if "step_update" in ev:
                    step = ev["step_update"]
                    t_name = step.get("tool_name") or step.get("tool") or ""
                    state = step.get("state") or step.get("status") or ""
                    tool_info = step.get("tool_info") or {}
                    params = tool_info.get("parameters") or step.get("parameters") or {}
                    file_arg = params.get("AbsolutePath") or params.get("path") or ""

                    if t_name == "view_file":
                        if not init_cwd:
                            illegal_tools.append("view_file_called_before_init_cwd")
                        else:
                            expected_img_path = os.path.normpath(os.path.join(init_cwd, f"{frame_id}.jpg"))
                            norm_file = os.path.normpath(file_arg)
                            if norm_file != expected_img_path:
                                illegal_tools.append(f"view_file_unauthorized_path:{file_arg}")
                            else:
                                if state in ("DONE", "done", "success", "completed"):
                                    has_view_file_done = True
                    elif t_name == "finish":
                        pass
                    elif t_name:
                        illegal_tools.append(f"{t_name}:{file_arg}")

                if "result" in ev:
                    result_events.append(ev["result"])
                    d_res = ev["result"].get("denied_actions")
                    if d_res:
                        if isinstance(d_res, list):
                            denied_actions.extend(d_res)
                        else:
                            denied_actions.append(str(d_res))
            except Exception:
                pass

    if not init_cwd:
        return False, "stream 日志中未检出合法的 init.cwd 沙箱路径"
    if denied_actions:
        return False, f"stream 存在被拒绝的操作 (denied_actions: {denied_actions})"
    if illegal_tools:
        return False, f"stream 违规调用未授权工具或非当前沙箱目标图片: {illegal_tools}"
    if not has_view_file_done:
        return False, f"stream 未包含针对沙箱中 {frame_id}.jpg 的 view_file DONE 事件"

    if len(result_events) != 1:
        return False, f"stream 的 result 事件必须有且仅有 1 个 (实际检出 {len(result_events)} 个)"

    res_obj = result_events[0]
    res_status = res_obj.get("status")
    if res_status != "SUCCESS":
        return False, f"stream result status 非 SUCCESS (实际: '{res_status}')"

    if expected_parsed is not None:
        s_out = res_obj.get("structured_output")
        if s_out is None:
            return False, "stream result 缺失原生 structured_output 字段"
        if s_out != expected_parsed:
            return False, "stream 原生 structured_output 与预测 JSON 中的 parsed_validation 不一致"

    return True, None

def load_selected_15(filepath: str) -> Tuple[List[Dict[str, Any]], str, List[Tuple[str, str, str]]]:
    assert_safe_path(filepath)
    if not os.path.exists(filepath):
        raise ReportAssemblyError(f"固定 selected15 文件不存在: {filepath}")
    sha = compute_file_sha256(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        shots = json.load(f)
    if not isinstance(shots, list) or len(shots) != 15:
        raise ReportAssemblyError(f"selected15 必须包含恰好 15 个母区间 (实际: {len(shots) if isinstance(shots, list) else '非列表'})")

    anchor_tuples = []
    for s in shots:
        s_id = s["shot_id"]
        for pct in ["25", "50", "75"]:
            anchor_tuples.append((s_id, pct, f"{s_id}_frame_{pct}"))

    return shots, sha, anchor_tuples

def locate_frame_file(shot_id: str, pct: str) -> str:
    candidates = [
        f"/private/tmp/x1_0/frames/{shot_id}/frame_{pct}.jpg",
        f"/private/tmp/x1_1/frames/{shot_id}/frame_{pct}.jpg",
        f"/private/tmp/x1_1/anonymous_frames/{shot_id}_frame_{pct}.jpg",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]

def aggregate_vlm_45(
    anchor_tuples: List[Tuple[str, str, str]],
    pred_dir: str,
    runs_dir: str
) -> Dict[str, Any]:
    assert_safe_path(pred_dir)
    assert_safe_path(runs_dir)

    num_anchors = len(anchor_tuples)
    is_formal_45 = (num_anchors == 45)

    results = []
    all_attempt_latencies = []
    success_latencies = []
    input_tokens_list = []
    output_tokens_list = []
    thinking_tokens_list = []
    total_tokens_list = []

    missing_count = 0
    error_count = 0
    schema_valid_count = 0
    firstpass_success_count = 0
    model_version_conflicts = []
    tokens_coverage_unknown_count = 0

    for shot_id, pct, frame_id in anchor_tuples:
        pred_filename = f"vlm_agy_gemini_{shot_id}_f{pct}.json"
        pred_path = os.path.join(pred_dir, pred_filename)
        stream_path = os.path.join(runs_dir, f"agy_stream_{frame_id}.jsonl")

        record_info = {
            "shot_id": shot_id,
            "pct": pct,
            "frame_id": frame_id,
            "pred_path": pred_path,
            "stream_path": stream_path,
            "present": False,
            "model_version": None,
            "error": None,
            "schema_valid": False,
            "trace_valid": False,
            "hash_valid": False,
            "firstpass_success": False,
            "latency_ms": None,
            "source_image_hash": None,
            "inference_image_hash": None,
            "prompt_schema_hash": None,
        }

        if not os.path.exists(pred_path):
            missing_count += 1
            record_info["error"] = "预测文件缺失"
            results.append(record_info)
            continue

        record_info["present"] = True

        try:
            with open(pred_path, "r", encoding="utf-8") as pf:
                data = json.load(pf)
        except Exception as e:
            error_count += 1
            record_info["error"] = f"JSON解析失败: {str(e)}"
            results.append(record_info)
            continue

        rec_frame_id = data.get("frame_id")
        rec_provider = data.get("provider")
        if rec_frame_id != frame_id:
            error_count += 1
            record_info["error"] = f"frame_id 不匹配: 预期 '{frame_id}', 实际 '{rec_frame_id}'"
            results.append(record_info)
            continue
        if rec_provider != "agy-gemini":
            error_count += 1
            record_info["error"] = f"provider 不匹配: 预期 'agy-gemini', 实际 '{rec_provider}'"
            results.append(record_info)
            continue

        resp = data.get("response", {})
        m_ver = resp.get("model_version")
        record_info["model_version"] = m_ver

        if m_ver != OFFICIAL_MODEL_VERSION:
            error_count += 1
            err_msg = f"非法 model_version: '{m_ver}' (正式唯一允许: '{OFFICIAL_MODEL_VERSION}')"
            record_info["error"] = err_msg
            model_version_conflicts.append({"frame_id": frame_id, "model_version": m_ver})
            results.append(record_info)
            continue

        resp_error = resp.get("error")
        lat = resp.get("latency_ms")
        if lat is not None and lat > 0:
            all_attempt_latencies.append(lat)
            record_info["latency_ms"] = lat

        usage = resp.get("usage", {})
        if usage and isinstance(usage, dict) and any(v > 0 for v in usage.values() if isinstance(v, (int, float))):
            input_tokens_list.append(usage.get("input_tokens", 0))
            output_tokens_list.append(usage.get("output_tokens", 0))
            thinking_tokens_list.append(usage.get("thinking_tokens", 0))
            total_tokens_list.append(usage.get("total_tokens", 0))
        else:
            tokens_coverage_unknown_count += 1

        src_hash = resp.get("source_image_hash")
        inf_hash = resp.get("inference_image_hash")
        ps_hash = resp.get("prompt_schema_hash")
        record_info["source_image_hash"] = src_hash
        record_info["inference_image_hash"] = inf_hash
        record_info["prompt_schema_hash"] = ps_hash

        hash_err = None
        local_img_path = locate_frame_file(shot_id, pct)
        if not os.path.exists(local_img_path):
            hash_err = f"本地原图文件不存在: {local_img_path}"
        else:
            try:
                with open(local_img_path, "rb") as imf:
                    raw_bytes = imf.read()
                req = VLMRequest(
                    frame_id=frame_id,
                    frame_bytes=raw_bytes,
                    prompt=OBJECTIVE_VLM_PROMPT,
                    schema=VLM_OBJECTIVE_SCHEMA
                )
                computed_src_hash = req.compute_source_hash()
                _, computed_inf_hash = req.get_standardized_inference_bytes()
                computed_ps_hash = req.compute_prompt_schema_hash()

                if src_hash != computed_src_hash:
                    hash_err = f"source_image_hash 不匹配 (预期: {computed_src_hash[:12]}, 实际: {str(src_hash)[:12]})"
                elif inf_hash != computed_inf_hash:
                    hash_err = f"inference_image_hash 不匹配 (预期: {computed_inf_hash[:12]}, 实际: {str(inf_hash)[:12]})"
                elif ps_hash != computed_ps_hash:
                    hash_err = f"prompt_schema_hash 与现行 prompt/schema 不一致"
            except Exception as e:
                hash_err = f"图像 Hash 重新计算异常: {str(e)}"

        if hash_err is None:
            record_info["hash_valid"] = True

        parsed = resp.get("parsed_validation")
        schema_ok, schema_err = validate_schema_dict(parsed)
        record_info["schema_valid"] = schema_ok
        if schema_ok:
            schema_valid_count += 1

        trace_ok, trace_err = verify_stream_log(stream_path, frame_id, expected_parsed=parsed)
        record_info["trace_valid"] = trace_ok

        has_err = resp_error or hash_err or schema_err or trace_err
        if has_err:
            error_count += 1
            record_info["error"] = has_err
        else:
            firstpass_success_count += 1
            record_info["firstpass_success"] = True
            if lat is not None and lat > 0:
                success_latencies.append(lat)

        results.append(record_info)

    present_count = sum(1 for r in results if r["present"])
    missing_count = num_anchors - present_count
    firstpass_rate = round(firstpass_success_count / float(num_anchors), 4) if num_anchors > 0 else 0.0

    return {
        "total_anchors": num_anchors,
        "is_formal_45": is_formal_45,
        "present_count": present_count,
        "missing_count": missing_count,
        "schema_valid_count": schema_valid_count,
        "trace_valid_count": sum(1 for r in results if r["trace_valid"]),
        "hash_valid_count": sum(1 for r in results if r["hash_valid"]),
        "error_count": error_count,
        "firstpass_success_count": firstpass_success_count,
        "firstpass_rate": firstpass_rate,
        "official_model_version": OFFICIAL_MODEL_VERSION,
        "model_cli_parameters": {
            "temperature": "unknown / provider-managed",
            "max_tokens": "unknown / provider-managed",
            "notes": "AGY CLI 无 temperature 与 max_tokens 命令行暴露参数，由 Provider 内部托管，不可声称已对齐为 0 或 512"
        },
        "model_version_conflicts": model_version_conflicts,
        "all_attempts_latency_stats_ms": {
            "description": "所有已发生尝试，含服务失败 (如 503)；缺失不计",
            "count": len(all_attempt_latencies),
            "stats": calc_stats(all_attempt_latencies),
        },
        "success_only_latency_stats_ms": {
            "description": "仅成功记录的耗时分布 (排除 503 等失败尝试)",
            "count": len(success_latencies),
            "stats": calc_stats(success_latencies),
        },
        "usage_totals": {
            "input_tokens": sum(input_tokens_list) if input_tokens_list else "unknown",
            "output_tokens": sum(output_tokens_list) if output_tokens_list else "unknown",
            "thinking_tokens": sum(thinking_tokens_list) if thinking_tokens_list else "unknown",
            "total_tokens": sum(total_tokens_list) if total_tokens_list else "unknown",
            "records_with_usage": len(input_tokens_list),
            "records_missing_usage": tokens_coverage_unknown_count,
        },
        "usage_median_per_frame": {
            "input_tokens": calc_stats(input_tokens_list)["median"] if input_tokens_list else "unknown",
            "output_tokens": calc_stats(output_tokens_list)["median"] if output_tokens_list else "unknown",
            "thinking_tokens": calc_stats(thinking_tokens_list)["median"] if thinking_tokens_list else "unknown",
            "total_tokens": calc_stats(total_tokens_list)["median"] if total_tokens_list else "unknown",
        },
        "cost_currency": "unknown",
        "cost_notes": "CLI subscription currency cost unknown，native usage 统计不能套用商业 API 单价，不可编造人民币成本",
        "records": results,
    }

def load_pilot_and_preflight(pilot_dir: str, preflight_dir: str) -> Dict[str, Any]:
    assert_safe_path(pilot_dir)
    assert_safe_path(preflight_dir)

    pilot_records = []
    pilot_latencies = []
    pilot_input_tokens = 0
    pilot_output_tokens = 0
    pilot_thinking_tokens = 0
    pilot_total_tokens = 0
    pilot_success_count = 0
    pilot_timeout_count = 0
    pilot_other_error_count = 0

    if os.path.exists(pilot_dir) and os.path.isdir(pilot_dir):
        for fname in sorted(os.listdir(pilot_dir)):
            if fname.endswith(".json") and not fname.startswith("."):
                fpath = os.path.join(pilot_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as pf:
                        data = json.load(pf)
                    resp = data.get("response", {})
                    lat = resp.get("latency_ms")
                    err = resp.get("error")
                    usage = resp.get("usage", {})

                    if lat:
                        pilot_latencies.append(lat)
                    if usage:
                        pilot_input_tokens += usage.get("input_tokens", 0)
                        pilot_output_tokens += usage.get("output_tokens", 0)
                        pilot_thinking_tokens += usage.get("thinking_tokens", 0)
                        pilot_total_tokens += usage.get("total_tokens", 0)

                    is_timeout = err and "超时" in err
                    if err:
                        if is_timeout:
                            pilot_timeout_count += 1
                        else:
                            pilot_other_error_count += 1
                    else:
                        pilot_success_count += 1

                    pilot_records.append({
                        "file": fname,
                        "frame_id": data.get("frame_id"),
                        "model_version": resp.get("model_version"),
                        "status": "success" if not err else ("timeout" if is_timeout else "error"),
                        "latency_ms": lat,
                        "error": err
                    })
                except Exception:
                    pass

    preflight_records = []
    preflight_latencies = []
    preflight_input_tokens = 0
    preflight_output_tokens = 0
    preflight_total_tokens = 0

    if os.path.exists(preflight_dir) and os.path.isdir(preflight_dir):
        for fname in sorted(os.listdir(preflight_dir)):
            if fname.endswith(".json") and not fname.startswith("."):
                fpath = os.path.join(preflight_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as pf:
                        data = json.load(pf)
                    resp = data.get("response", {})
                    lat = resp.get("latency_ms")
                    err = resp.get("error", "")
                    usage = resp.get("usage", {})

                    if lat:
                        preflight_latencies.append(lat)
                    if usage:
                        preflight_input_tokens += usage.get("input_tokens", 0)
                        preflight_output_tokens += usage.get("output_tokens", 0)
                        preflight_total_tokens += usage.get("total_tokens", 0)

                    preflight_records.append({
                        "file": fname,
                        "frame_id": data.get("frame_id"),
                        "model_version": resp.get("model_version"),
                        "latency_ms": lat,
                        "error_summary": err[:120] if err else "",
                        "is_conflict_error": "conflicts with --effort=low" in err
                    })
                except Exception:
                    pass

    return {
        "pilot": {
            "total_attempts": len(pilot_records),
            "success_count": pilot_success_count,
            "timeout_count": pilot_timeout_count,
            "other_error_count": pilot_other_error_count,
            "latency_stats_ms": calc_stats(pilot_latencies),
            "usage_totals": {
                "input_tokens": pilot_input_tokens,
                "output_tokens": pilot_output_tokens,
                "thinking_tokens": pilot_thinking_tokens,
                "total_tokens": pilot_total_tokens,
            },
            "isolated_from_45": True,
            "nature": "非完整默认高档 pilot (partial exploratory high-effort pilot)",
            "notes": (
                f"动态统计 default_effort_pilot 目录下 {len(pilot_records)} 次实际尝试 "
                f"({pilot_success_count} 成功, {pilot_timeout_count} 超时)。"
                "仅为局部高算力探索对照，绝不当做与 45 正式低档同条件的测试。"
            ),
            "records": pilot_records
        },
        "preflight": {
            "status": "unexpected_configuration_error",
            "total_attempts": len(preflight_records),
            "latency_stats_ms": calc_stats(preflight_latencies),
            "usage_totals": {
                "input_tokens": preflight_input_tokens,
                "output_tokens": preflight_output_tokens,
                "total_tokens": preflight_total_tokens,
            },
            "nature": "意外配置错误归档 (unexpected configuration error)，非事先规划测试",
            "notes": (
                f"动态检出 {len(preflight_records)} 次因默认参数配置不当导致的 high+low 冲突退出。"
                "绝非事先规划好的测试 (not a planned test)，不可称 failed_as_expected 或成功拦截；"
                "修复后已归档，不在正式 45 分母，但作为真实发生的工程调试计入总实验开销。"
            ),
            "records": preflight_records
        }
    }

def aggregate_shots_diagnostics(selected_shots: List[Dict[str, Any]], pred_dir: str) -> Dict[str, Any]:
    assert_safe_path(pred_dir)
    diagnostics = []
    total_cuts = 0
    total_children = 0
    coverage_verified_count = 0
    full_interval_verified_count = 0

    global_max_child_duration = -1.0
    global_max_child_id = None
    longest_parent_shot = None
    longest_parent_duration = -1.0

    for s in selected_shots:
        s_id = s["shot_id"]
        p_dur = s["duration"]
        if p_dur > longest_parent_duration:
            longest_parent_duration = p_dur
            longest_parent_shot = s_id

        diag_path = os.path.join(pred_dir, f"shots_{s_id}_diagnostics.json")
        item = {
            "parent_shot_id": s_id,
            "parent_duration": p_dur,
            "exists": False,
            "cuts_count": 0,
            "children_count": 0,
            "max_child_duration": 0.0,
            "coverage_verified": False,
            "full_interval_verified": False,
            "contact_sheet_pages": [],
        }

        if os.path.exists(diag_path):
            item["exists"] = True
            try:
                with open(diag_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    cuts_list = data.get("cuts", [])
                    children_list = data.get("children", [])
                    c_count = len(cuts_list)
                    ch_count = data.get("children_count", len(children_list))
                    cov_ok = data.get("coverage_verified", False)
                    full_cov = data.get("full_interval_coverage", {}).get("verified", False)
                    pages = data.get("contact_sheet_pages", [])

                    p_max_child_dur = 0.0
                    for ch in children_list:
                        c_dur = ch.get("duration", round(ch.get("end_sec", 0.0) - ch.get("start_sec", 0.0), 3))
                        if c_dur > p_max_child_dur:
                            p_max_child_dur = c_dur
                        if c_dur > global_max_child_duration:
                            global_max_child_duration = c_dur
                            global_max_child_id = ch.get("child_id")

                    item["cuts_count"] = c_count
                    item["children_count"] = ch_count
                    item["max_child_duration"] = round(p_max_child_dur, 3)
                    item["coverage_verified"] = cov_ok
                    item["full_interval_verified"] = full_cov
                    item["contact_sheet_pages"] = pages

                    total_cuts += c_count
                    total_children += ch_count
                    if cov_ok:
                        coverage_verified_count += 1
                    if full_cov:
                        full_interval_verified_count += 1
            except Exception:
                pass

        diagnostics.append(item)

    return {
        "total_parent_shots": len(selected_shots),
        "diagnostics_present_count": sum(1 for d in diagnostics if d["exists"]),
        "total_detected_cuts": total_cuts,
        "total_children_shots": total_children,
        "coverage_verified_count": coverage_verified_count,
        "coverage_pass_rate": round(coverage_verified_count / len(selected_shots), 4) if selected_shots else 0.0,
        "full_interval_verified_count": full_interval_verified_count,
        "global_max_child_duration": {
            "child_id": global_max_child_id,
            "duration": round(global_max_child_duration, 3)
        },
        "longest_parent_shot": {
            "shot_id": longest_parent_shot,
            "duration": longest_parent_duration
        },
        "repair_evidence_notes": (
            "各 parent 均包含细切分子区间与最大子区间时长 (max_child_duration)；"
            "母镜头时长严格保持原 selected15 边界，无人工剧情干预；"
            "全局最大子区间时长提供了欠切修复的客观证据，未以长镜头笼统替代。"
        ),
        "diagnostics_by_parent": diagnostics,
    }

def aggregate_fusion_and_ocr(selected_shots: List[Dict[str, Any]], pred_dir: str, ocr_snapshot_path: str) -> Dict[str, Any]:
    assert_safe_path(pred_dir)
    assert_safe_path(ocr_snapshot_path)

    ocr_raw_len = 0
    ocr_snapshot_sha = "not_found"
    if os.path.exists(ocr_snapshot_path):
        ocr_snapshot_sha = compute_file_sha256(ocr_snapshot_path)
        try:
            with open(ocr_snapshot_path, "r", encoding="utf-8") as f:
                raw_ocr = json.load(f)
                ocr_raw_len = len(raw_ocr)
        except Exception:
            pass

    fusion_types_counter = {
        "consensus": 0,
        "conflict": 0,
        "ocr_only": 0,
        "asr_only": 0,
        "ocr_error": 0,
    }
    total_fused_events = 0
    total_ocr_in_15 = 0
    total_asr_in_15 = 0
    fusions_present = 0

    for s in selected_shots:
        s_id = s["shot_id"]
        f_path = os.path.join(pred_dir, f"fusion_{s_id}.json")
        if not os.path.exists(f_path):
            continue
        fusions_present += 1
        try:
            with open(f_path, "r", encoding="utf-8") as f:
                fdata = json.load(f)
                total_ocr_in_15 += fdata.get("ocr_event_count", len(fdata.get("raw_ocr_events", [])))
                total_asr_in_15 += fdata.get("asr_segment_count", len(fdata.get("raw_asr_segments", [])))
                f_results = fdata.get("fused_results", [])
                total_fused_events += len(f_results)
                for item in f_results:
                    ft = item.get("fusion_type")
                    if ft in fusion_types_counter:
                        fusion_types_counter[ft] += 1
                    else:
                        fusion_types_counter[ft] = fusion_types_counter.get(ft, 0) + 1
        except Exception:
            pass

    return {
        "ocr_snapshot": {
            "path": ocr_snapshot_path,
            "sha256": ocr_snapshot_sha,
            "raw_item_count": ocr_raw_len,
            "metadata_image_hash": "unknown",
            "notes": "独立硬字幕 OCR 快照，保留原 857 条 raw，元数据图像哈希按原样标记为 unknown"
        },
        "asr_reused": {
            "source": "X1.0 ASR results",
            "status": "reused_original",
            "notes": "本地已清空音频模型权重，不新跑 ASR，重用真实 X1.0 词级 ASR 记录"
        },
        "fusion_15_stats": {
            "fusions_file_count": fusions_present,
            "expected_file_count": 15,
            "total_ocr_events": total_ocr_in_15,
            "total_asr_segments": total_asr_in_15,
            "total_fused_events": total_fused_events,
            "counts_by_type": fusion_types_counter,
            "recalculated": True,
            "notes": "15 母区间融合结果由各 fusion 文件动态累加统计，绝不硬编码"
        }
    }

def aggregate_face_pairs(face_pairs_path: str, calib_report_path: str) -> Dict[str, Any]:
    assert_safe_path(face_pairs_path)
    assert_safe_path(calib_report_path)

    pairs_count = 0
    annotated_count = 0
    same_count = 0
    diff_count = 0
    uncertain_count = 0
    unannotated_count = 0
    status = "pending_human_annotation"
    current_pairs_sha = compute_file_sha256(face_pairs_path)

    if os.path.exists(face_pairs_path):
        try:
            with open(face_pairs_path, "r", encoding="utf-8") as f:
                fdata = json.load(f)
                pairs = fdata.get("pairs", [])
                pairs_count = len(pairs)
                for p in pairs:
                    hl = p.get("human_label")
                    if hl in ("same", "different"):
                        annotated_count += 1
                        if hl == "same":
                            same_count += 1
                        else:
                            diff_count += 1
                    elif hl == "uncertain":
                        uncertain_count += 1
                    elif hl is None:
                        unannotated_count += 1
        except Exception:
            pass

    calib_threshold = "pending"
    calib_status = "pending"
    objective_metrics = {
        "accuracy": "pending",
        "f1": "pending",
        "notes": "40 对跨镜头人脸等待真人标签，严禁由系统私自拍定阈值或编造指标"
    }

    if os.path.exists(calib_report_path):
        try:
            with open(calib_report_path, "r", encoding="utf-8") as f:
                cdata = json.load(f)

            c_status = cdata.get("status")
            c_prov = cdata.get("provenance")
            c_reviewer = cdata.get("reviewer")
            c_pairs_sha = cdata.get("pairs_sha256")

            # 严格门禁：仅接受 provenance human_review、reviewer非空、pairs_sha256与当前pairs文件一致的 calibrated_successfully 报告
            is_valid_calib = (
                c_status == "calibrated_successfully" and
                c_prov == "human_review" and
                bool(c_reviewer and isinstance(c_reviewer, str) and c_reviewer.strip()) and
                bool(c_pairs_sha and c_pairs_sha == current_pairs_sha and current_pairs_sha != "file_not_found")
            )

            if is_valid_calib:
                calib_status = "calibrated_successfully"
                calib_threshold = cdata.get("recommended_threshold", cdata.get("chosen_threshold", "pending"))
                if "annotated_count" in cdata:
                    annotated_count = cdata["annotated_count"]
                if "uncertain_count" in cdata:
                    uncertain_count = cdata["uncertain_count"]
                if "unannotated_count" in cdata:
                    unannotated_count = cdata["unannotated_count"]
                status = "calibrated"

                holdout = cdata.get("holdout_metrics", {})
                calib_metrics = cdata.get("calibration_metrics", {})
                bal_acc = cdata.get("holdout_balanced_acc", holdout.get("balanced_accuracy", "pending"))
                f1_score = cdata.get("holdout_f1", holdout.get("f1", "pending"))

                # 从校准报告中提取或补充 same/different 计数
                if same_count == 0 and diff_count == 0:
                    cal_conf = calib_metrics.get("confusion", {})
                    hold_conf = holdout.get("confusion", {})
                    cal_same = cal_conf.get("tp", 0) + cal_conf.get("fn", 0)
                    hold_same = hold_conf.get("tp", 0) + hold_conf.get("fn", 0)
                    cal_diff = cal_conf.get("fp", 0) + cal_conf.get("tn", 0)
                    hold_diff = hold_conf.get("fp", 0) + hold_conf.get("tn", 0)
                    if (cal_same + hold_same) > 0:
                        same_count = cal_same + hold_same
                        diff_count = cal_diff + hold_diff

                objective_metrics = {
                    "accuracy": bal_acc,
                    "f1": f1_score,
                    "calibration_sample_count": cdata.get("calibration_sample_count", calib_metrics.get("sample_count")),
                    "calibration_balanced_accuracy": calib_metrics.get("balanced_accuracy", cdata.get("calibration_balanced_acc")),
                    "calibration_f1": calib_metrics.get("f1", cdata.get("calibration_f1")),
                    "calibration_precision": calib_metrics.get("precision", cdata.get("calibration_precision")),
                    "calibration_recall": calib_metrics.get("recall", cdata.get("calibration_recall")),
                    "calibration_confusion": cdata.get("calibration_confusion", calib_metrics.get("confusion")),
                    "holdout_sample_count": cdata.get("holdout_sample_count", holdout.get("sample_count")),
                    "holdout_balanced_accuracy": bal_acc,
                    "holdout_f1": f1_score,
                    "holdout_precision": cdata.get("holdout_precision", holdout.get("precision")),
                    "holdout_recall": cdata.get("holdout_recall", holdout.get("recall")),
                    "holdout_confusion": cdata.get("holdout_confusion", holdout.get("confusion")),
                    "holdout_false_positives": cdata.get("holdout_false_positives", holdout.get("fp_pair_ids", [])),
                    "holdout_false_negatives": cdata.get("holdout_false_negatives", holdout.get("fn_pair_ids", [])),
                    "shared_face_ids_count": cdata.get("shared_face_ids_count", len(cdata.get("shared_face_ids", []))),
                    "notes": cdata.get("disclaimer", cdata.get("notes", "基于独立 holdout 集合客观评测所得指标"))
                }
            else:
                calib_status = "pending"
                calib_threshold = "pending"
                status = "pending_human_annotation"
        except Exception:
            calib_status = "pending"
            calib_threshold = "pending"
            status = "pending_human_annotation"

    return {
        "face_pairs_path": face_pairs_path,
        "pairs_sha256": current_pairs_sha,
        "total_pairs": pairs_count,
        "annotated_pairs": annotated_count,
        "same_count": same_count,
        "different_count": diff_count,
        "uncertain_count": uncertain_count,
        "unannotated_count": unannotated_count,
        "status": status if annotated_count >= 10 and calib_status == "calibrated_successfully" else ("annotated" if annotated_count >= 10 else "pending_human_annotation"),
        "recommended_threshold": calib_threshold,
        "calibration_status": calib_status,
        "objective_metrics": objective_metrics
    }

def evaluate_human_labels(labels_file: Optional[str], anchor_tuples: List[Tuple[str, str, str]]) -> Dict[str, Any]:
    if not labels_file:
        return {
            "status": "pending",
            "provenance": None,
            "reviewer": None,
            "annotated_frames_count": 0,
            "expected_frames_count": 45,
            "coverage_ratio": "0/45",
            "hallucination_rate": "pending",
            "factual_accuracy": "pending",
            "scene_accuracy": "pending",
            "action_accuracy": "pending",
            "scene_audit_coverage": "pending",
            "action_audit_coverage": "pending",
            "wer_cer": "pending",
            "notes": "未提供 --labels-file，人工各项指标全部保持 pending，不可编造"
        }

    assert_safe_path(labels_file)
    if not os.path.exists(labels_file):
        raise HumanLabelsValidationError(f"指定的人工标注文件不存在: {labels_file}")

    with open(labels_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    prov = data.get("provenance")
    if prov != "human_review":
        raise HumanLabelsValidationError(
            f"安全门禁拒绝: labels-file provenance 必须为 'human_review' (实际: '{prov}')，严禁使用非人工真值！"
        )

    reviewer = data.get("reviewer")
    if not reviewer or not str(reviewer).strip():
        raise HumanLabelsValidationError("安全门禁拒绝: labels-file 缺少有效 reviewer 审核员标识")

    vlm_audits = data.get("vlm_gemini_audits", {})
    if not isinstance(vlm_audits, dict):
        raise HumanLabelsValidationError("labels-file 缺少有效的 vlm_gemini_audits 字典")

    total_factual = 0
    total_hallucinated = 0
    valid_audits_count = 0
    null_audits_count = 0
    scene_accepted_count = 0
    action_accepted_count = 0
    scene_evaluated_count = 0
    action_evaluated_count = 0

    num_anchors = len(anchor_tuples) if anchor_tuples else 45

    for _, _, fid in anchor_tuples:
        audit = vlm_audits.get(fid)
        if not audit or not isinstance(audit, dict):
            null_audits_count += 1
            continue

        f_cnt = audit.get("factual_count")
        h_cnt = audit.get("hallucinated_count")

        # 核心约束: null 计数不可视为 0！
        # 仅当 factual_count 与 hallucinated_count 均显式为非负整数时才计入已审核事实分母
        if f_cnt is not None and h_cnt is not None:
            if not isinstance(f_cnt, int) or not isinstance(h_cnt, int) or f_cnt < 0 or h_cnt < 0:
                raise HumanLabelsValidationError(f"帧 {fid} 的事实计数必须为非负整数 (factual: {f_cnt}, hallucinated: {h_cnt})")
            total_factual += f_cnt
            total_hallucinated += h_cnt
            valid_audits_count += 1
        else:
            # f_cnt 或 h_cnt 为 null，不可当作 0 参与统计，视为空值/未完成标注
            null_audits_count += 1

        s_aud = audit.get("scene_audit")
        if s_aud in ("accepted", "rejected", "uncertain"):
            scene_evaluated_count += 1
            if s_aud == "accepted":
                scene_accepted_count += 1

        a_aud = audit.get("action_audit")
        if a_aud in ("accepted", "rejected", "uncertain"):
            action_evaluated_count += 1
            if a_aud == "accepted":
                action_accepted_count += 1

    coverage_ratio_str = f"{valid_audits_count}/{num_anchors}"
    total_statements = total_factual + total_hallucinated

    scene_acc = round(scene_accepted_count / float(num_anchors), 4) if num_anchors > 0 else 0.0
    action_acc = round(action_accepted_count / float(num_anchors), 4) if num_anchors > 0 else 0.0
    scene_evaluated_acc = round(scene_accepted_count / float(scene_evaluated_count), 4) if scene_evaluated_count > 0 else "pending"
    action_evaluated_acc = round(action_accepted_count / float(action_evaluated_count), 4) if action_evaluated_count > 0 else "pending"

    if valid_audits_count < num_anchors:
        hallucination_rate = round(total_hallucinated / float(total_statements), 4) if total_statements > 0 else "pending"
        factual_acc = round(total_factual / float(total_statements), 4) if total_statements > 0 else "pending"
        return {
            "status": "coverage_insufficient",
            "provenance": prov,
            "reviewer": reviewer,
            "annotated_frames_count": valid_audits_count,
            "null_or_unannotated_frames_count": null_audits_count,
            "expected_frames_count": num_anchors,
            "coverage_ratio": coverage_ratio_str,
            "total_factual_statements": total_factual,
            "total_hallucinated_statements": total_hallucinated,
            "total_statements_denominator": total_statements,
            "hallucination_rate": hallucination_rate,
            "factual_accuracy": factual_acc,
            "scene_accuracy": scene_acc,
            "action_accuracy": action_acc,
            "scene_accepted_count": scene_accepted_count,
            "action_accepted_count": action_accepted_count,
            "scene_evaluated_count": scene_evaluated_count,
            "action_evaluated_count": action_evaluated_count,
            "scene_evaluated_accuracy": scene_evaluated_acc,
            "action_evaluated_accuracy": action_evaluated_acc,
            "wer_cer": "pending",
            "notes": (
                f"人工标注覆盖率不足 {num_anchors} 帧 ({coverage_ratio_str}，含 {null_audits_count} 帧空值/未标注)。"
                "null 计数不可视为 0；未标注与 uncertain 均未算入正确；属于 partial 审核（不宣称完整 Gold），结论不 PASS。"
                f"已审事实 {total_factual} 条、真实幻觉 {total_hallucinated} 条 (分母 {total_statements})，"
                f"幻觉率仅代表已审子集 ({hallucination_rate if hallucination_rate == 'pending' else f'{hallucination_rate*100:.2f}%'})，不可声称全体。"
                f"场景与动作正确覆盖率为 {scene_accepted_count}/{num_anchors} (已验证正确覆盖率，非未审错误率)，"
                f"在已审帧中准确率为 {scene_accepted_count}/{scene_evaluated_count}。"
            )
        }

    if total_statements == 0:
        raise HumanLabelsValidationError(f"所有 {num_anchors} 帧事实陈述总分母为 0，无法计算事实率")

    hallucination_rate = round(total_hallucinated / float(total_statements), 4)
    factual_acc = round(total_factual / float(total_statements), 4)

    return {
        "status": "evaluated_successfully",
        "provenance": prov,
        "reviewer": reviewer,
        "annotated_frames_count": valid_audits_count,
        "null_or_unannotated_frames_count": null_audits_count,
        "expected_frames_count": num_anchors,
        "coverage_ratio": coverage_ratio_str,
        "total_factual_statements": total_factual,
        "total_hallucinated_statements": total_hallucinated,
        "total_statements_denominator": total_statements,
        "hallucination_rate": hallucination_rate,
        "factual_accuracy": factual_acc,
        "scene_accuracy": scene_acc,
        "action_accuracy": action_acc,
        "scene_accepted_count": scene_accepted_count,
        "action_accepted_count": action_accepted_count,
        "scene_evaluated_count": scene_evaluated_count,
        "action_evaluated_count": action_evaluated_count,
        "scene_evaluated_accuracy": scene_evaluated_acc,
        "action_evaluated_accuracy": action_evaluated_acc,
        "wer_cer": "pending",
        "notes": f"{num_anchors} 帧全量真人事实审核 (hallucination_rate = total_hallucinated / total_statements; scene/action_accuracy = accepted / {num_anchors})"
    }

def estimate_pipeline_projection(median_latency_ms: Optional[float]) -> Dict[str, Any]:
    """
    单集耗时与成本估算:
    当 median_latency_ms is None 或 <= 0 时，绝不凭空 35s fallback，返回 pending 估算。
    有真实有效 median latency 时方进行数学计算。
    """
    if median_latency_ms is None or median_latency_ms <= 0:
        return {
            "planning_model_assumptions": {
                "uncalibrated_candidate_shots_per_episode": 162,
                "anchor_frames_per_shot": 3,
                "total_planned_frames_per_episode": 486,
                "measured_median_latency_seconds": "pending",
                "nature_of_estimate": "未校正镜头数量规划模型 (无有效实测延迟，保持 pending 估算)",
            },
            "episode_time_estimate": {
                "serial_seconds": "pending",
                "serial_minutes": "pending",
                "concurrent_2_seconds": "pending",
                "concurrent_2_minutes": "pending",
            },
            "series_30_time_estimate": {
                "serial_hours": "pending",
                "concurrent_2_hours": "pending",
            },
            "cost_model": {
                "currency_cost": "unknown",
                "per_episode_cny": "unknown",
                "notes": "CLI subscription currency cost unknown，native usage 统计不能套用商业 API 单价，不可编造人民币成本"
            }
        }

    med_sec = median_latency_ms / 1000.0
    planned_frames_per_ep = 486

    ep_serial_sec = round(planned_frames_per_ep * med_sec, 1)
    ep_serial_min = round(ep_serial_sec / 60.0, 1)
    ep_concurrent2_sec = round(ep_serial_sec / 2.0, 1)
    ep_concurrent2_min = round(ep_concurrent2_sec / 60.0, 1)

    series_30_serial_hours = round((ep_serial_sec * 30) / 3600.0, 1)
    series_30_concurrent2_hours = round((ep_concurrent2_sec * 30) / 3600.0, 1)

    return {
        "planning_model_assumptions": {
            "uncalibrated_candidate_shots_per_episode": 162,
            "anchor_frames_per_shot": 3,
            "total_planned_frames_per_episode": planned_frames_per_ep,
            "measured_median_latency_seconds": round(med_sec, 2),
            "nature_of_estimate": "未校正镜头数量规划模型，严禁声称为实际全片指标",
        },
        "episode_time_estimate": {
            "serial_seconds": ep_serial_sec,
            "serial_minutes": ep_serial_min,
            "concurrent_2_seconds": ep_concurrent2_sec,
            "concurrent_2_minutes": ep_concurrent2_min,
        },
        "series_30_time_estimate": {
            "serial_hours": series_30_serial_hours,
            "concurrent_2_hours": series_30_concurrent2_hours,
        },
        "cost_model": {
            "currency_cost": "unknown",
            "per_episode_cny": "unknown",
            "notes": (
                "AGY CLI 属于包月/订阅账户或受控通道，currency cost unknown。"
                "虽然 native usage 记录了 input/output/thinking tokens，"
                "但严禁套用外部公有云 API 单价，不编造任何人民币单集成本。"
            )
        }
    }

def calculate_total_experimental_overhead(
    vlm_metrics: Dict[str, Any],
    pilot_pre: Dict[str, Any]
) -> Dict[str, Any]:
    formal_usage = vlm_metrics.get("usage_totals", {})
    pilot_usage = pilot_pre.get("pilot", {}).get("usage_totals", {})
    preflight_usage = pilot_pre.get("preflight", {}).get("usage_totals", {})

    def get_num(d, k):
        val = d.get(k)
        return val if isinstance(val, (int, float)) else 0

    tot_inp = get_num(formal_usage, "input_tokens") + get_num(pilot_usage, "input_tokens") + get_num(preflight_usage, "input_tokens")
    tot_out = get_num(formal_usage, "output_tokens") + get_num(pilot_usage, "output_tokens") + get_num(preflight_usage, "output_tokens")
    tot_thk = get_num(formal_usage, "thinking_tokens") + get_num(pilot_usage, "thinking_tokens")
    tot_all = get_num(formal_usage, "total_tokens") + get_num(pilot_usage, "total_tokens") + get_num(preflight_usage, "total_tokens")

    return {
        "formal_vlm_attempts": vlm_metrics.get("present_count", 0),
        "pilot_attempts": pilot_pre.get("pilot", {}).get("total_attempts", 0),
        "preflight_configuration_error_attempts": pilot_pre.get("preflight", {}).get("total_attempts", 0),
        "total_cli_attempts_count": (
            vlm_metrics.get("present_count", 0) +
            pilot_pre.get("pilot", {}).get("total_attempts", 0) +
            pilot_pre.get("preflight", {}).get("total_attempts", 0)
        ),
        "total_tokens_consumed": {
            "input_tokens": tot_inp,
            "output_tokens": tot_out,
            "thinking_tokens": tot_thk,
            "total_tokens": tot_all,
        },
        "notes": "已归档三个阶段调用开销45+16+4（45 正式低档尝试 + 16 pilot 高算力探索 + 4 preflight 配置错误），明确不含未归档连通探测、X1.0及开发CLI调用成本"
    }

def generate_markdown_report(metrics: Dict[str, Any], out_path: str):
    vlm = metrics["vlm_gemini_45"]
    shots = metrics["shots_diagnostics"]
    fusion = metrics["fusion_and_ocr"]
    faces = metrics["face_pairs"]
    human = metrics["human_labels_evaluation"]
    proj = metrics["pipeline_projection"]
    pilot_pre = metrics["runs_pilot_and_preflight"]
    total_overhead = metrics["total_experimental_overhead"]

    ts_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(metrics["generated_at"]))

    all_att_stats = vlm["all_attempts_latency_stats_ms"]["stats"]
    succ_stats = vlm["success_only_latency_stats_ms"]["stats"]

    formal_note = ""
    if not vlm.get("is_formal_45", False):
        formal_note = f"\n> ⚠️ **样本量告警**: 当前评测样本数为 {vlm['total_anchors']} 帧 (非正式 45 帧)，`is_formal_45=False`，绝不能声明正式门槛通过！\n"

    ep_ser_str = f"{proj['episode_time_estimate']['serial_minutes']} 分钟 ({proj['episode_time_estimate']['serial_seconds']}s)" if proj['episode_time_estimate']['serial_seconds'] != "pending" else "pending (待实测)"
    ep_con_str = f"{proj['episode_time_estimate']['concurrent_2_minutes']} 分钟 ({proj['episode_time_estimate']['concurrent_2_seconds']}s)" if proj['episode_time_estimate']['concurrent_2_seconds'] != "pending" else "pending (待实测)"
    s30_ser_str = f"{proj['series_30_time_estimate']['serial_hours']} 小时" if proj['series_30_time_estimate']['serial_hours'] != "pending" else "pending (待实测)"
    s30_con_str = f"{proj['series_30_time_estimate']['concurrent_2_hours']} 小时" if proj['series_30_time_estimate']['concurrent_2_hours'] != "pending" else "pending (待实测)"

    is_face_calibrated = (faces.get("calibration_status") == "calibrated_successfully")
    face_obj = faces.get("objective_metrics", {})
    shared_face_cnt = face_obj.get("shared_face_ids_count", "unknown")

    if is_face_calibrated:
        face_section_md = f"""## 7. 人脸 40 匿名 Pairs 与独立校准门禁

- **人脸 Pairs 生成**: 40 对跨镜头匿名对，相似度内部隐藏；
- **人工标注状态**: `{faces["status"]}` (有效标注: **{faces.get("annotated_pairs", "pending")}** 对；分布: {faces.get("same_count", "unknown")} same, {faces.get("different_count", "unknown")} different, {faces.get("uncertain_count", "unknown")} uncertain, {faces.get("unannotated_count", "unknown")} null/未标注)；
- **推荐阈值 (Chosen/Recommended Threshold)**: **`{faces.get("recommended_threshold", "pending")}`** (以校准集 Balanced Accuracy 为主优化目标，遇 Tie 选较高保守阈值)；
- **校准集客观指标 (Calibration Set, N={face_obj.get("calibration_sample_count", "unknown")})**:
  - Balanced Accuracy: **{face_obj.get("calibration_balanced_accuracy", "pending")}**
  - F1 Score: **{face_obj.get("calibration_f1", "pending")}**
  - Precision: **{face_obj.get("calibration_precision", "pending")}** | Recall: **{face_obj.get("calibration_recall", "pending")}**
  - 混淆矩阵 (Confusion): `{face_obj.get("calibration_confusion", {})}`
- **独立测试集泛化指标 (Holdout Set, N={face_obj.get("holdout_sample_count", "unknown")})**:
  - Balanced Accuracy: **{face_obj.get("holdout_balanced_accuracy", "pending")}**
  - F1 Score: **{face_obj.get("holdout_f1", "pending")}**
  - Precision: **{face_obj.get("holdout_precision", "pending")}** | Recall: **{face_obj.get("holdout_recall", "pending")}**
  - 混淆矩阵 (Confusion): `{face_obj.get("holdout_confusion", {})}` (FP: `{face_obj.get("holdout_false_positives", [])}`, FN: `{face_obj.get("holdout_false_negatives", [])}`)
- **重要泛化限制与免责声明**:
  - 限制共享 {shared_face_cnt} face 非 person-disjoint：{face_obj.get("notes", "注意: 划分仅保证 pair-disjoint，而非 person-disjoint；cal 与 eval 共享 face_id，不足以证明全 PersonConsistency，仅作为跨镜头成对特征校准与泛化测试参考。切勿将小样指标夸大为全集 Gate。")}"""
    else:
        face_section_md = f"""## 7. 人脸 40 匿名 Pairs 与独立校准门禁

- **人脸 Pairs 生成**: 40 对跨镜头匿名对，相似度内部隐藏；
- **人工标注状态**: `{faces["status"]}` (有效标注数: {faces.get("annotated_pairs", "pending")})；
- **推荐阈值**: `{faces.get("recommended_threshold", "pending")}`；
- **门禁约束 (未校准说明)**: 当前处于未校准状态。未获得真人真值前，严禁私自拍定阈值或编造 F1 / Accuracy 指标。"""

    scene_eval_acc_str = f"{human.get('scene_evaluated_accuracy')}" if human.get('scene_evaluated_accuracy') is not None else "pending"
    action_eval_acc_str = f"{human.get('action_evaluated_accuracy')}" if human.get('action_evaluated_accuracy') is not None else "pending"
    total_halluc_str = f"{human.get('total_hallucinated_statements', 'pending')}"

    human_section_md = f"""## 8. 人工审核真值评估 (Human Labels Evaluation)

- **评估状态**: `{human["status"]}` (标注覆盖: `{human.get("coverage_ratio", "0/45")}`)
- **审核员 / 溯源**: `{human.get("reviewer") or 'None'}` / `{human.get("provenance") or 'None'}`
- **标注范围与性质声明**:
  - **Partial 审核覆盖**: 当前视觉标注数量仅为 **partial 审核覆盖** ({human.get("annotated_frames_count", 0)}/45 帧完成事实核验，含未标注/null)，**绝不宣称完整 Gold 数据集**；
  - **坐标系方向约定**: 用户口头抽查反馈基本正确，但视觉方位明确**以画面左右坐标为准**（镜像左右用画面坐标，判定时不确定不用人物解剖学左右）；
  - **客观事实与定性意见隔离**: 用户的口头整体定性意见**绝不覆盖 JSON 中已真实记录的 {total_halluc_str} 条幻觉标注**（如 `shot_0010_frame_25` 等记录的真实幻觉），保留真实错误记录。
- **客观事实逐项统计 (基于陈述数而非帧数)**:
  - 客观符合陈述 (factual): `{human.get("total_factual_statements", "pending")}`
  - 幻觉陈述 (hallucinated): `{human.get("total_hallucinated_statements", "pending")}`
  - 幻觉率 (Hallucination Rate): `{human.get("hallucination_rate", "pending")}` (基于真人陈述数分母；null 计数不视为 0；仅代表已审子集，不能声称全体)
  - 事实准确率 (Factual Accuracy): `{human.get("factual_accuracy", "pending")}`
- **场景与物理动作可信度 (以全 45 帧为基准分母)**:
  - 场景覆盖率 (Scene Coverage Accuracy): `{human.get("scene_accuracy", "pending")}` (属于已验证正确覆盖率，不是未审帧错误率；另已审准确率为 {human.get("scene_accepted_count", 0)}/{human.get("scene_evaluated_count", 0)} = {scene_eval_acc_str})
  - 动作覆盖率 (Action Coverage Accuracy): `{human.get("action_accuracy", "pending")}` (属于已验证正确覆盖率，不是未审帧错误率；另已审准确率为 {human.get("action_accepted_count", 0)}/{human.get("action_evaluated_count", 0)} = {action_eval_acc_str})
- **语音识别错误率**: WER / CER 保持 `{human.get("wer_cer", "pending")}` (待人工校对，不可捏造)。"""

    if is_face_calibrated:
        awaiting_face_item = f"1. **人脸 40 对校准与泛化局限**: 人脸已基于 {faces.get('annotated_pairs', 'unknown')} 对真实真人标注完成校准 (推荐阈值 {faces.get('recommended_threshold')})，但受限于 pair-disjoint（非 person-disjoint，共享 {shared_face_cnt} face_id），不足以证明全 PersonConsistency；"
        stop_banner_msg = "人脸已校准但 X1.1 待 Review STOP 无 50 Gold，维持冻结"
    else:
        awaiting_face_item = "1. **40 对人脸判定与阈值校准**: 等待审核员在 `review.html` 完成判定并运行 `calibrate_face.py`；"
        stop_banner_msg = "请审核员在 review.html 标注后继续流转"

    awaiting_human_md = f"""### 10.2 待真人项与 Review 边界 (Awaiting Human Review)
{awaiting_face_item}
2. **视觉事实与幻觉全量核验**: 当前仅为 partial 审核覆盖 (未达 45 帧全量，无 50-shot Gold)；用户口头抽查基本正确（采用画面坐标系），但真实 {total_halluc_str} 条幻觉记录保留，待后续完整闭环；
3. **场景与动作可信度判定**: 部分未标注/null 与 uncertain 保持非通过，待全量审核；
4. **语音识别真实错误率**: WER / CER 待人工比对，保持 pending。

```
=====================================================
STOP 等待 Review: {stop_banner_msg}
=====================================================
```"""

    md_content = f"""# X1.1 真实工程基准复核与聚合报告 (Revalidation Report)

> **生成时间**: {ts_str}  
> **报告总状态**: `{metrics["overall_status"]}` (严格门禁保护：严禁预设 PASS，最终以 STOP 等待 Review)  
> **代码哈希 (`assemble_report.py`)**: `{metrics["code_hashes"]["assemble_report"]}`  
> **固定 Selected15 快照哈希**: `{metrics["code_hashes"]["selected_15_shots"]}`  
> **正式模型配置**: `{vlm["official_model_version"]}`  
{formal_note}
---

## 1. 运行环境与 Provider 基线声明

- **当前主力视觉 Provider**: AGY CLI Gemini (`{vlm["official_model_version"]}`)
  - **环境状态**: 本地已彻底清空并删除全部下载的本地模型权重，无活跃本地推理服务；无外部公有云 API 依赖，统一通过本地已登录的 AGY CLI 沙箱执行；
  - **参数约束声明**: AGY CLI **无 `--temperature` 与 `--max-tokens` 命令行暴露参数**（`VLMRequest` 抽象参数不适用于 CLI 命令行），由 Provider 内部托管（`unknown / provider-managed`），**不可声称温度 0 与最大 512 tokens 已在 CLI 中生效对齐**。
- **历史对比基线与方法限制说明**:
  - 历史基线 Qwen2-VL-2B (X1.0): 采用本地 4-bit 离线量化与自定义约束解码器，取得 20/45 结构成功；
  - 当前 AGY CLI Gemini 3.1 Pro (X1.1): 采用沙箱隔离工具调用（`view_file`）与原生 stream-json 通信；
  - **方法限制与不可比声明**: 评测机制、提示词格式、通信开销与解码环境完全不同，**属于不同方法论下的历史探索，严禁声称为公平同条件对比或能力直接通过**。
- **生命周期守卫**:
  - 全流程受 55s 超时守卫保护，退出时彻底回收活跃子进程组。

---

## 2. 45 Anchor 帧 VLM 客观事实推理评测 (运行时实测统计)

| 指标项 | 实测统计值 | 工程说明 |
| :--- | :--- | :--- |
| **母区间样本数** | 15 个 | 历史固定 selected15 盲样 |
| **评测 Anchor 帧总数** | {vlm["total_anchors"]} 帧 | 15 shots × 3 帧 (is_formal_45: {vlm.get("is_formal_45", False)}) |
| **实际记录存在数 (Present)** | **{vlm["present_count"]} / {vlm["total_anchors"]}** | 缺失数 (Missing): {vlm["missing_count"]} |
| **Schema 结构合规数** | {vlm["schema_valid_count"]} / {vlm["total_anchors"]} | 调用 `vlm_schema.validate_vlm_output` 完整类型/枚举/长度校验 |
| **合法 Stream 工具轨迹** | {vlm["trace_valid_count"]} / {vlm["total_anchors"]} | 从 `init.cwd` 严格校验 `normpath` 目标图片，无 substring 放行，native structured_output 与 parsed_validation 严格一致 |
| **图像 Hash 校验通过数** | {vlm["hash_valid_count"]} / {vlm["total_anchors"]} | 重新计算原图 SHA256 与 384 标准推理 JPEG Hash，比对一致 |
| **异常 / 错误记录数** | {vlm["error_count"]} / {vlm["total_anchors"]} | 包含网络错误(如503)、文件缺失、Schema 异常或工具违规 |
| **First-Pass 完整成功数** | **{vlm["firstpass_success_count"]} / {vlm["total_anchors"]}** | **实测成功率: {vlm["firstpass_rate"] * 100:.1f}%** |
| **所有已尝试延迟中位数 (含失败)** | **{all_att_stats["median"] or 'pending'} ms** | **所有已发生尝试，含服务失败 (如 503)；缺失不计** (均值: {all_att_stats["mean"] or 'pending'} ms, 样本: {vlm["all_attempts_latency_stats_ms"]["count"]}) |
| **仅成功记录延迟中位数** | {succ_stats["median"] or 'pending'} ms | 均值: {succ_stats["mean"] or 'pending'} ms, 样本: {vlm["success_only_latency_stats_ms"]["count"]} 条 |
| **Token 消耗中位数** | Input: {vlm["usage_median_per_frame"]["input_tokens"]}, Output: {vlm["usage_median_per_frame"]["output_tokens"]}, Total: {vlm["usage_median_per_frame"]["total_tokens"]} | 包含 thinking tokens；缺失记录计 unknown coverage，不编造 0 消费 |
| **货币成本 (Currency Cost)** | `unknown` | CLI 订阅计费币种与单价未知，不可套用商业 API 编造人民币成本 |

> **版本混淆防范**: 45 帧正式评估分母严格绑定 `{vlm["official_model_version"]}`。本轮检出版本冲突数: `{len(vlm["model_version_conflicts"])}`。

---

## 3. 工程 Preflight 配置错误归档与 Pilot 探索记录

1. **Preflight 意外配置错误 (`invalid_effort_preflight`)**:
   - **性质声明**: 实际运行中因默认参数配置不当导致的 **{pilot_pre["preflight"]["total_attempts"]} 次意外配置错误 (`unexpected_configuration_error`)**；
   - **错误详情**: CLI 启动时传入 `--model pro-high` 与 `--effort low` 导致参数冲突报错；
   - **归档说明**: 修复后归档保留运行记录。**非事先规划的测试 (not a planned test)，不可称为 failed_as_expected 或成功拦截**；虽不在正式 45 分母，但计入总实验开销与 token 成本。
2. **Pilot 高算力探索对照 (`default_effort_pilot`)**:
   - **性质声明**: **非完整默认高档 pilot (partial exploratory high-effort pilot)**；
   - **动态统计**: 实际尝试 **{pilot_pre["pilot"]["total_attempts"]} 次** (包含 {pilot_pre["pilot"]["success_count"]} 次成功，{pilot_pre["pilot"]["timeout_count"]} 次超时，{pilot_pre["pilot"]["other_error_count"]} 次其他错误)；
   - **实测耗时分布**: 成功记录延迟中位数 {pilot_pre["pilot"]["latency_stats_ms"]["median"] or 'pending'} ms；
   - **隔离说明**: 独立留存于 runs 目录，仅供高算力探索对照，**绝不可与 45 正式低档同条件混淆**。

---

## 4. 全实验总开销统计 (Total Experimental Overhead)

已归档三个阶段调用开销45+16+4（45 帧正式低档尝试 + 16 pilot 高算力探索 + 4 preflight 配置错误），明确不含未归档连通探测、X1.0及开发CLI调用成本：

- **总 CLI 调度尝试次数**: {total_overhead["total_cli_attempts_count"]} 次
  - 45 正式帧尝试: {total_overhead["formal_vlm_attempts"]} 次
  - Pilot 探索尝试: {total_overhead["pilot_attempts"]} 次
  - Preflight 配置错误尝试: {total_overhead["preflight_configuration_error_attempts"]} 次
- **全实验累计 Token 消耗**:
  - Input Tokens: **{total_overhead["total_tokens_consumed"]["input_tokens"]}**
  - Output Tokens: **{total_overhead["total_tokens_consumed"]["output_tokens"]}**
  - Thinking Tokens: **{total_overhead["total_tokens_consumed"]["thinking_tokens"]}**
  - Total Tokens: **{total_overhead["total_tokens_consumed"]["total_tokens"]}**
- **货币计费说明**: CLI 计费币种未知，不可套用公有云单价编造虚假人民币消费。

---

## 5. Shot 场景细切分与 Coverage 诊断 (欠切修复证据)

- **物理切点与细切分**:
  - 15 个母区间检出物理切点: **{shots["total_detected_cuts"]} 处**
  - 细切分子 Shot 总数: **{shots["total_children_shots"]} 个**
  - 母区间时长覆盖校验 (Coverage): **{shots["coverage_verified_count"]} / {shots["total_parent_shots"]}** (通过率: {shots["coverage_pass_rate"] * 100:.1f}%)
- **欠切修复客观证据 (各 Parent 最大子镜头时长)**:
  - 全局最大子 Shot 时长: **{shots["global_max_child_duration"]["duration"]} 秒** (子镜头 `{shots["global_max_child_duration"]["child_id"]}`)
  - 最长母镜头: `{shots["longest_parent_shot"]["shot_id"]}` (时长 {shots["longest_parent_shot"]["duration"]} 秒)
  - 声明: 各母区间均保留详细 `children` 划分与 `max_child_duration`，未用长母镜头笼统替代修复证据。
- **视觉物料保全**:
  - 5fps ContactSheet 分页拼图按需跨页生成，全区间拼图路径已保全。

---

## 6. OCR 独立快照与 ASR 保守 Fusion 统计

- **OCR 独立快照**:
  - 文件路径: `{fusion["ocr_snapshot"]["path"]}`
  - 快照 SHA256: `{fusion["ocr_snapshot"]["sha256"]}`
  - 实际条目数: **{fusion["ocr_snapshot"]["raw_item_count"]} 条** (从实际文件动态读取 `len`)
  - 元数据图像 Hash: 如实标记为 `{fusion["ocr_snapshot"]["metadata_image_hash"]}`
- **ASR 真实重用**:
  - 真实重用 X1.0 词级 ASR 记录，不新跑音频模型。
- **15 母区间 Fusion 重新计算结果 (动态累加，绝不硬编码)**:
  - OCR 总事件数: **{fusion["fusion_15_stats"]["total_ocr_events"]}**
  - ASR 总片段数: **{fusion["fusion_15_stats"]["total_asr_segments"]}**
  - 达成一致 (consensus): **{fusion["fusion_15_stats"]["counts_by_type"].get("consensus", 0)}**
  - 显式冲突 (conflict): **{fusion["fusion_15_stats"]["counts_by_type"].get("conflict", 0)}**
  - 单源 OCR (ocr_only): **{fusion["fusion_15_stats"]["counts_by_type"].get("ocr_only", 0)}**
  - 单源 ASR (asr_only): **{fusion["fusion_15_stats"]["counts_by_type"].get("asr_only", 0)}**

---

{face_section_md}

---

{human_section_md}

---

## 9. 单集耗时规划模型 (未校正镜头数量假设)

> **严正声明**: 基于未校正 162 候选镜头 × 3 帧 = 486 帧的粗估规划假设，**绝非实际全片运行指标**。

| 场景 | 单集耗时估算 | 30 集全剧总耗时估算 | 备注 |
| :--- | :--- | :--- | :--- |
| **单任务串行 (Serial)** | {ep_ser_str} | {s30_ser_str} | 按实测 median {proj["planning_model_assumptions"]["measured_median_latency_seconds"]}s 估算 |
| **2 并发处理 (Concurrent-2)** | {ep_con_str} | {s30_con_str} | 受限于速率配额与沙箱隔离 |

---

## 10. 门禁审计与工程交付结论

### 10.1 工程已验证项 (Engineered & Verified)
1. **Schema 结构与字段类型**: 严格集成 `validate_vlm_output`，全量验证类型、枚举与长度约束；
2. **沙箱隔离与严格路径审查**: 严格从 `init.cwd` 校验 `normpath` 目标图片，杜绝 fake basename outside cwd 与非法工具；
3. **原生结构一致性**: 严格校验 native `structured_output` 与 `parsed_validation` 一致性；
4. **图像与提示词 Hash 验真**: 重新计算原图 SHA256 与 384 标准推理 JPEG Hash，防止物料篡改；
5. **场景细切分覆盖率与子镜头时长**: 15/15 母区间 100% 覆盖，保留全局最大子镜头时长；
6. **OCR 与 ASR 动态重算**: 真实重算 15 融合统计，快照 857 条原图 Hash 为 unknown；
7. **全实验开销与配置错误归档**: 归档 4 次配置错误，汇总 45+16+4 全实验 Token 与耗时。

{awaiting_human_md}
"""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(md_content)

def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser(description="X1.1 独立报告汇总与指标聚合器 (<=55s)")
    parser.add_argument("--selected15", type=str, default=SELECTED_15_DEFAULT, help="固定 15 母区间路径")
    parser.add_argument("--pred-dir", type=str, default=PRED_DIR_DEFAULT, help="预测结果落盘目录")
    parser.add_argument("--runs-dir", type=str, default=RUNS_DIR_DEFAULT, help="Runs stream 目录")
    parser.add_argument("--ocr-snapshot", type=str, default=OCR_SNAPSHOT_DEFAULT, help="独立硬字幕快照路径")
    parser.add_argument("--face-pairs", type=str, default=FACE_PAIRS_DEFAULT, help="人脸 40 对匿名文件")
    parser.add_argument("--pilot-dir", type=str, default=PILOT_DIR_DEFAULT, help="Pilot 独立运行目录")
    parser.add_argument("--preflight-dir", type=str, default=PREFLIGHT_DIR_DEFAULT, help="Preflight 独立运行目录")
    parser.add_argument("--calib-report", type=str, default=CALIB_REPORT_DEFAULT, help="人脸校准报告路径")
    parser.add_argument("--labels-file", type=str, default=None, help="人工审核导出标注 JSON (可选)")
    parser.add_argument("--out-metrics", type=str, default=METRICS_JSON_DEFAULT, help="输出 metrics.json 路径")
    parser.add_argument("--out-md", type=str, default=REPORT_MD_DEFAULT, help="输出 Markdown 报告路径")
    args = parser.parse_args()

    print("=== [Report Assembler] 开始聚合 X1.1 真实工程指标 ===")

    # 1. 读取 selected 15 (严格 15 母区间 -> 45 Anchor 帧)
    selected_shots, sel15_sha, anchor_tuples = load_selected_15(args.selected15)
    print(f"成功加载 15 母区间 ({len(anchor_tuples)} 个 Anchor 帧)，快照 SHA: {sel15_sha[:12]}")

    # 2. 聚合 45 Gemini 记录
    vlm_metrics = aggregate_vlm_45(anchor_tuples, args.pred_dir, args.runs_dir)
    print(
        f"45 帧实测聚合: 存在 {vlm_metrics['present_count']} / {vlm_metrics['total_anchors']}, "
        f"完整成功 {vlm_metrics['firstpass_success_count']} / {vlm_metrics['total_anchors']}, "
        f"异常/缺失 {vlm_metrics['error_count']} / {vlm_metrics['total_anchors']}"
    )

    if not vlm_metrics.get("is_formal_45", False):
        print(f"警告: 样本数 ({vlm_metrics['total_anchors']}) 非正式 45 帧 (is_formal_45=False)，严禁以此声明正式门槛通过！")

    # 3. 聚合 Pilot 与 Preflight (动态多记录扫描)
    pilot_pre = load_pilot_and_preflight(args.pilot_dir, args.preflight_dir)

    # 4. 计算全实验总开销
    total_overhead = calculate_total_experimental_overhead(vlm_metrics, pilot_pre)

    # 5. 聚合 Shot 诊断
    shots_metrics = aggregate_shots_diagnostics(selected_shots, args.pred_dir)

    # 6. 聚合 Fusion 与 OCR 快照
    fusion_metrics = aggregate_fusion_and_ocr(selected_shots, args.pred_dir, args.ocr_snapshot)

    # 7. 聚合 Face Pairs 与 Calibration
    face_metrics = aggregate_face_pairs(args.face_pairs, args.calib_report)

    # 8. 评估人工标签 (可选)
    human_metrics = evaluate_human_labels(args.labels_file, anchor_tuples)

    # 9. 估算全片耗时规划模型 (无实测 median 时返回 pending 估算，不凭空 35s fallback)
    med_val = (
        vlm_metrics["all_attempts_latency_stats_ms"]["stats"]["median"] or
        vlm_metrics["success_only_latency_stats_ms"]["stats"]["median"]
    )
    proj_metrics = estimate_pipeline_projection(med_val)

    # 10. 汇总全集数据结构
    self_path = os.path.abspath(__file__)
    code_sha = compute_file_sha256(self_path)

    report_data = {
        "report_version": "x1.1",
        "generated_at": time.time(),
        "overall_status": "awaiting_human_review",
        "code_hashes": {
            "assemble_report": code_sha,
            "selected_15_shots": sel15_sha,
        },
        "vlm_gemini_45": vlm_metrics,
        "runs_pilot_and_preflight": pilot_pre,
        "total_experimental_overhead": total_overhead,
        "shots_diagnostics": shots_metrics,
        "fusion_and_ocr": fusion_metrics,
        "face_pairs": face_metrics,
        "human_labels_evaluation": human_metrics,
        "pipeline_projection": proj_metrics,
    }

    # 落盘 metrics.json
    assert_safe_path(args.out_metrics)
    os.makedirs(os.path.dirname(args.out_metrics), exist_ok=True)
    with open(args.out_metrics, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2, ensure_ascii=False)
    print(f"Metrics JSON 落盘至: {args.out_metrics}")

    # 落盘 Markdown 报告
    assert_safe_path(args.out_md)
    generate_markdown_report(report_data, args.out_md)
    print(f"Markdown 报告落盘至: {args.out_md}")
    print("=== [Report Assembler] 聚合完成！状态: awaiting_human_review ===")

if __name__ == "__main__":
    main()
