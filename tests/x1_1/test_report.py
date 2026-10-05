"""
tests/x1_1/test_report.py
聚焦测试: X1.1 独立报告汇总器校验逻辑回归

测试要点:
1. 缺文件不能 PASS (帧预测缺失或 stream 日志缺失时正确计入 missing/error，禁止计入成功);
2. 延迟双口径准确性: all_attempts_latency_stats_ms 包含所有发生尝试 (含 503 等失败)，success_only 严格排除失败记录;
3. Preflight 性质: 验证为 unexpected_configuration_error (非事先规划测试，计入实验总开销);
4. Pilot 动态聚合: 动态统计目录下多记录 (如成功与超时)，标记为非完整默认高档 pilot;
5. Stream 防伪: 从 init.cwd 校验绝对路径，拦截 fake basename outside cwd，拦截非法工具与 denied_actions，校验 native structured_output 一致性;
6. Schema 类型与枚举完整校验: 拦截类型错误与景别非法枚举;
7. 图像与提示词 Hash 验真: 拦截篡改的 source_image_hash 或 inference_image_hash;
8. 人工标签缺失保持 pending / 伪造非人类标签 (provenance != 'human_review' 或 reviewer 空) 严格拒绝拦截;
9. 人工事实率分母严格为 (factual + hallucinated)，以陈述数为分母；scene/action accuracy 以全 45 帧为基准分母 (未标注与 uncertain 均非正确);
10. 全局总实验开销统计: 汇总 45 正式尝试、pilot 与 preflight 消耗。
"""
import io
import json
import os
from PIL import Image
import pytest

from scripts.x1_1.assemble_report import (
    validate_schema_dict,
    verify_stream_log,
    aggregate_vlm_45,
    load_pilot_and_preflight,
    calculate_total_experimental_overhead,
    evaluate_human_labels,
    estimate_pipeline_projection,
    OFFICIAL_MODEL_VERSION,
    ModelVersionConflictError,
    HumanLabelsValidationError,
    ReportAssemblyError,
)
from scripts.x1_1.vlm_schema import VLM_OBJECTIVE_SCHEMA
from scripts.x1_1.run_vlm import OBJECTIVE_VLM_PROMPT
from scripts.x1_1.providers import VLMRequest

SAMPLE_VALID_SCHEMA = {
    "characters": ["一名人物"],
    "environment": "室内昏暗光线",
    "physical_actions": ["站立不动"],
    "objects": ["木桌", "茶杯"],
    "camera": "medium_shot",
    "uncertainty": "画面边缘略有暗角",
}

@pytest.fixture
def dummy_image_file(tmp_path) -> str:
    """生成合法的 16x16 JPEG 测试图片文件"""
    img_path = tmp_path / "test_frame.jpg"
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), color=(50, 100, 150)).save(buf, format="JPEG")
    with open(img_path, "wb") as f:
        f.write(buf.getvalue())
    return str(img_path)

def test_missing_files_cannot_pass():
    anchor_tuples = [
        ("shot_0010", "25", "shot_0010_frame_25"),
        ("shot_0010", "50", "shot_0010_frame_50"),
    ]

    result = aggregate_vlm_45(anchor_tuples, pred_dir="/private/tmp/not_exist_pred", runs_dir="/private/tmp/not_exist_runs")

    assert result["missing_count"] == 2
    assert result["firstpass_success_count"] == 0
    assert result["firstpass_rate"] == 0.0
    for r in result["records"]:
        assert r["present"] is False
        assert r["firstpass_success"] is False
        assert r["error"] == "预测文件缺失"

def test_latency_dual_metrics_handles_failure_elapsed(tmp_path, monkeypatch, dummy_image_file):
    """
    延迟统计口径回归:
    1. all_attempts_latency_stats_ms 必须包含发生尝试的 elapsed (含 503 等服务失败);
    2. success_only_latency_stats_ms 严格只统计无错误记录。
    """
    pred_dir = tmp_path / "preds"
    runs_dir = tmp_path / "runs"
    pred_dir.mkdir()
    runs_dir.mkdir()

    with open(dummy_image_file, "rb") as f:
        raw_b = f.read()
    req = VLMRequest("f", raw_b, OBJECTIVE_VLM_PROMPT, VLM_OBJECTIVE_SCHEMA)
    src_h = req.compute_source_hash()
    _, inf_h = req.get_standardized_inference_bytes()
    ps_h = req.compute_prompt_schema_hash()

    monkeypatch.setattr("scripts.x1_1.assemble_report.locate_frame_file", lambda s, p: dummy_image_file)

    # 1. 成功记录 (latency = 30000ms)
    succ_pred = {
        "provider": "agy-gemini", "frame_id": "shot_0010_frame_25", "shot_id": "shot_0010", "frame_pct": "25",
        "response": {
            "raw_text": json.dumps(SAMPLE_VALID_SCHEMA), "parsed_validation": SAMPLE_VALID_SCHEMA, "error": None,
            "latency_ms": 30000.0, "model_version": OFFICIAL_MODEL_VERSION, "usage": {"input_tokens": 100, "output_tokens": 50},
            "source_image_hash": src_h, "inference_image_hash": inf_h, "prompt_schema_hash": ps_h
        }
    }
    with open(pred_dir / "vlm_agy_gemini_shot_0010_f25.json", "w") as f:
        json.dump(succ_pred, f)

    stream_file_succ = runs_dir / "agy_stream_shot_0010_frame_25.jsonl"
    sandbox_dir = tmp_path / "sandbox"
    sandbox_dir.mkdir()
    target_img = sandbox_dir / "shot_0010_frame_25.jpg"
    target_img.touch()
    with open(stream_file_succ, "w") as f:
        f.write(json.dumps({"event": "init", "init": {"cwd": str(sandbox_dir)}}) + "\n")
        f.write(json.dumps({"event": "step_update", "step_update": {"tool_name": "view_file", "state": "DONE", "tool_info": {"parameters": {"AbsolutePath": str(target_img)}}}}) + "\n")
        f.write(json.dumps({"event": "result", "result": {"status": "SUCCESS", "structured_output": SAMPLE_VALID_SCHEMA}}) + "\n")

    # 2. 失败记录 (503 服务错误，但产生了耗时 15000ms)
    fail_pred = {
        "provider": "agy-gemini", "frame_id": "shot_0010_frame_50", "shot_id": "shot_0010", "frame_pct": "50",
        "response": {
            "raw_text": "", "parsed_validation": None, "error": "HTTP 503 Service Unavailable",
            "latency_ms": 15000.0, "model_version": OFFICIAL_MODEL_VERSION, "usage": {},
            "source_image_hash": src_h, "inference_image_hash": inf_h, "prompt_schema_hash": ps_h
        }
    }
    with open(pred_dir / "vlm_agy_gemini_shot_0010_f50.json", "w") as f:
        json.dump(fail_pred, f)

    anchor_tuples = [
        ("shot_0010", "25", "shot_0010_frame_25"),
        ("shot_0010", "50", "shot_0010_frame_50"),
    ]
    res = aggregate_vlm_45(anchor_tuples, str(pred_dir), str(runs_dir))

    assert res["present_count"] == 2
    assert res["firstpass_success_count"] == 1
    assert res["error_count"] == 1

    # all_attempts 包含 2 个已发生尝试 (含 503 的 15000ms 与成功的 30000ms)
    all_stats = res["all_attempts_latency_stats_ms"]
    assert all_stats["count"] == 2
    assert all_stats["stats"]["min"] == 15000.0
    assert all_stats["stats"]["max"] == 30000.0
    assert all_stats["stats"]["median"] == 22500.0

    # success_only 严格只包含成功记录 (只有 30000ms)
    succ_stats = res["success_only_latency_stats_ms"]
    assert succ_stats["count"] == 1
    assert succ_stats["stats"]["median"] == 30000.0

def test_load_pilot_and_preflight_dynamic_aggregation(tmp_path):
    """
    动态扫描 Pilot 与 Preflight 目录:
    1. Pilot: 扫描目录下多条记录 (包含成功与超时)，标记为非完整默认高档 pilot;
    2. Preflight: 标记为 unexpected_configuration_error，非事先规划测试。
    """
    pilot_dir = tmp_path / "pilot"
    preflight_dir = tmp_path / "preflight"
    pilot_dir.mkdir()
    preflight_dir.mkdir()

    # 构造 2 条 pilot 记录 (1 成功 1 超时)
    with open(pilot_dir / "vlm_agy_gemini_p1.json", "w") as f:
        json.dump({
            "frame_id": "f_p1",
            "response": {"model_version": "agy-cli:gemini-3.1-pro-high", "latency_ms": 30000.0, "error": None, "usage": {"input_tokens": 1000, "total_tokens": 1100}}
        }, f)
    with open(pilot_dir / "vlm_agy_gemini_p2.json", "w") as f:
        json.dump({
            "frame_id": "f_p2",
            "response": {"model_version": "agy-cli:gemini-3.1-pro-high", "latency_ms": 50000.0, "error": "AGY CLI 执行超时 (>50s)", "usage": {"input_tokens": 1000, "total_tokens": 1050}}
        }, f)

    # 构造 2 条 preflight 配置错误记录
    for i in range(2):
        with open(preflight_dir / f"vlm_agy_gemini_err_{i}.json", "w") as f:
            json.dump({
                "frame_id": f"f_err_{i}",
                "response": {"model_version": "agy-cli:gemini-3.1-pro-high:effort=low", "latency_ms": 12000.0, "error": "conflicts with --effort=low", "usage": {}}
            }, f)

    res = load_pilot_and_preflight(str(pilot_dir), str(preflight_dir))

    # Pilot 检验
    pilot_info = res["pilot"]
    assert pilot_info["total_attempts"] == 2
    assert pilot_info["success_count"] == 1
    assert pilot_info["timeout_count"] == 1
    assert "非完整默认高档 pilot" in pilot_info["nature"]
    assert pilot_info["usage_totals"]["input_tokens"] == 2000

    # Preflight 检验
    preflight_info = res["preflight"]
    assert preflight_info["status"] == "unexpected_configuration_error"
    assert preflight_info["total_attempts"] == 2
    assert "意外配置错误归档" in preflight_info["nature"]
    assert "非事先规划测试" in preflight_info["nature"]

def test_total_experimental_overhead_calculation():
    """
    全实验总开销计算: 汇总正式尝试 + pilot + preflight
    """
    vlm_metrics = {
        "present_count": 32,
        "usage_totals": {"input_tokens": 50000, "output_tokens": 2000, "thinking_tokens": 1000, "total_tokens": 52000}
    }
    pilot_pre = {
        "pilot": {
            "total_attempts": 16,
            "usage_totals": {"input_tokens": 20000, "output_tokens": 1000, "thinking_tokens": 500, "total_tokens": 21000}
        },
        "preflight": {
            "total_attempts": 4,
            "usage_totals": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        }
    }

    tot = calculate_total_experimental_overhead(vlm_metrics, pilot_pre)
    assert tot["formal_vlm_attempts"] == 32
    assert tot["pilot_attempts"] == 16
    assert tot["preflight_configuration_error_attempts"] == 4
    assert tot["total_cli_attempts_count"] == 52
    assert tot["total_tokens_consumed"]["input_tokens"] == 70000
    assert tot["total_tokens_consumed"]["total_tokens"] == 73000

def test_stream_log_rejects_fake_basename_outside_cwd(tmp_path):
    stream_file = tmp_path / "stream_fake_path.jsonl"
    sandbox_dir = tmp_path / "agy_sandbox" / "run_shot_0010_f25"
    outside_dir = tmp_path / "fake_outside_dir"
    sandbox_dir.mkdir(parents=True)
    outside_dir.mkdir(parents=True)

    fake_outside_img = outside_dir / "shot_0010_frame_25.jpg"
    with open(fake_outside_img, "w") as f:
        f.write("fake")

    events = [
        {"event": "init", "init": {"cwd": str(sandbox_dir), "model": "gemini-3.1-pro-low"}},
        {"event": "step_update", "step_update": {"tool_name": "view_file", "state": "DONE", "tool_info": {"parameters": {"AbsolutePath": str(fake_outside_img)}}}},
        {"event": "result", "result": {"status": "SUCCESS", "structured_output": SAMPLE_VALID_SCHEMA}}
    ]
    with open(stream_file, "w", encoding="utf-8") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")

    ok, err = verify_stream_log(str(stream_file), "shot_0010_frame_25", expected_parsed=SAMPLE_VALID_SCHEMA)
    assert ok is False
    assert "view_file_unauthorized_path" in err

def test_stream_log_verifies_structured_output_equality(tmp_path):
    stream_file = tmp_path / "stream_so_diff.jsonl"
    sandbox_dir = tmp_path / "agy_sandbox"
    sandbox_dir.mkdir(parents=True)
    target_img = sandbox_dir / "shot_0010_frame_25.jpg"
    target_img.touch()

    events = [
        {"event": "init", "init": {"cwd": str(sandbox_dir)}},
        {"event": "step_update", "step_update": {"tool_name": "view_file", "state": "DONE", "tool_info": {"parameters": {"AbsolutePath": str(target_img)}}}},
        {"event": "result", "result": {"status": "SUCCESS", "structured_output": dict(SAMPLE_VALID_SCHEMA, camera="close_up")}}
    ]
    with open(stream_file, "w", encoding="utf-8") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")

    ok, err = verify_stream_log(str(stream_file), "shot_0010_frame_25", expected_parsed=SAMPLE_VALID_SCHEMA)
    assert ok is False
    assert "structured_output 与预测 JSON 中的 parsed_validation 不一致" in err

def test_validate_schema_rejects_type_errors_and_out_of_range():
    bad_type = dict(SAMPLE_VALID_SCHEMA, characters=["正常描述", 12345])
    is_valid, err = validate_schema_dict(bad_type)
    assert is_valid is False

    bad_cam = dict(SAMPLE_VALID_SCHEMA, camera="pan_left")
    is_valid, err = validate_schema_dict(bad_cam)
    assert is_valid is False
    assert "camera 景别值非法" in err or "enum" in err.lower()

    bad_extra = dict(SAMPLE_VALID_SCHEMA, plot_inference="secret meeting")
    is_valid, err = validate_schema_dict(bad_extra)
    assert is_valid is False
    assert "additionalProperties=False" in err

def test_tampered_image_hash_rejected(tmp_path, monkeypatch, dummy_image_file):
    pred_dir = tmp_path / "preds"
    runs_dir = tmp_path / "runs"
    pred_dir.mkdir()
    runs_dir.mkdir()

    shot_id = "shot_0010"
    pct = "25"
    frame_id = f"{shot_id}_frame_{pct}"

    with open(dummy_image_file, "rb") as f:
        raw_b = f.read()
    req = VLMRequest(frame_id=frame_id, frame_bytes=raw_b, prompt=OBJECTIVE_VLM_PROMPT, schema=VLM_OBJECTIVE_SCHEMA)
    real_src_hash = req.compute_source_hash()
    _, real_inf_hash = req.get_standardized_inference_bytes()
    real_ps_hash = req.compute_prompt_schema_hash()

    tampered_pred = {
        "provider": "agy-gemini", "frame_id": frame_id, "shot_id": shot_id, "frame_pct": pct,
        "response": {
            "raw_text": json.dumps(SAMPLE_VALID_SCHEMA), "parsed_validation": SAMPLE_VALID_SCHEMA, "error": None,
            "latency_ms": 32000.0, "model_version": OFFICIAL_MODEL_VERSION, "usage": {"input_tokens": 100, "output_tokens": 50},
            "source_image_hash": "tampered_fake_hash_12345", "inference_image_hash": real_inf_hash, "prompt_schema_hash": real_ps_hash,
        }
    }
    with open(pred_dir / f"vlm_agy_gemini_{shot_id}_f{pct}.json", "w", encoding="utf-8") as f:
        json.dump(tampered_pred, f)

    stream_file = runs_dir / f"agy_stream_{frame_id}.jsonl"
    sandbox_dir = tmp_path / "sandbox"
    sandbox_dir.mkdir()
    target_img = sandbox_dir / f"{frame_id}.jpg"
    target_img.touch()
    events = [
        {"event": "init", "init": {"cwd": str(sandbox_dir)}},
        {"event": "step_update", "step_update": {"tool_name": "view_file", "state": "DONE", "tool_info": {"parameters": {"AbsolutePath": str(target_img)}}}},
        {"event": "result", "result": {"status": "SUCCESS", "structured_output": SAMPLE_VALID_SCHEMA}}
    ]
    with open(stream_file, "w", encoding="utf-8") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")

    monkeypatch.setattr("scripts.x1_1.assemble_report.locate_frame_file", lambda s, p: dummy_image_file)

    anchor_tuples = [(shot_id, pct, frame_id)]
    result = aggregate_vlm_45(anchor_tuples, str(pred_dir), str(runs_dir))

    assert result["firstpass_success_count"] == 0
    rec = result["records"][0]
    assert rec["hash_valid"] is False
    assert "source_image_hash 不匹配" in rec["error"]

def test_human_labels_evaluates_real_coverage_and_scene_accuracy(tmp_path):
    labels_file = tmp_path / "labels_44_coverage.json"
    audits = {}
    for i in range(44):
        fid = f"shot_{i:04d}_frame_25"
        audits[fid] = {
            "factual_count": 8, "hallucinated_count": 2,
            "scene_audit": "accepted" if i < 30 else "uncertain",
            "action_audit": "accepted" if i < 35 else "rejected",
        }

    with open(labels_file, "w", encoding="utf-8") as f:
        json.dump({
            "provenance": "human_review", "reviewer": "auditor_bob", "vlm_gemini_audits": audits
        }, f)

    anchor_45 = [(f"shot_{i:04d}", "25", f"shot_{i:04d}_frame_25") for i in range(45)]
    res = evaluate_human_labels(str(labels_file), anchor_45)

    assert res["status"] == "coverage_insufficient"
    assert res["coverage_ratio"] == "44/45"
    assert res["annotated_frames_count"] == 44
    assert res["total_factual_statements"] == 352
    assert res["total_hallucinated_statements"] == 88
    assert res["hallucination_rate"] == round(88 / 440.0, 4)
    assert res["scene_accuracy"] == round(30 / 45.0, 4)
    assert res["action_accuracy"] == round(35 / 45.0, 4)

def test_non_human_provenance_strictly_rejected(tmp_path):
    labels_file = tmp_path / "fake_labels.json"
    with open(labels_file, "w", encoding="utf-8") as f:
        json.dump({
            "provenance": "auto_generated", "reviewer": "bot", "vlm_gemini_audits": {}
        }, f)

    anchor_tuples = [("shot_0010", "25", "shot_0010_frame_25")]
    with pytest.raises(HumanLabelsValidationError, match="provenance 必须为 'human_review'"):
        evaluate_human_labels(str(labels_file), anchor_tuples)

def test_pipeline_projection_assumptions_and_unknown_cost():
    proj = estimate_pipeline_projection(median_latency_ms=34500.0)
    assumptions = proj["planning_model_assumptions"]
    assert assumptions["total_planned_frames_per_episode"] == 486
    assert assumptions["measured_median_latency_seconds"] == 34.5
    assert proj["cost_model"]["currency_cost"] == "unknown"
    assert proj["cost_model"]["per_episode_cny"] == "unknown"
