"""
防御性边缘场景与安全守护自动化测试套件
覆盖核心原则:
1. 55s alarm 生命周期守护初始化验证;
2. 缺失图像抛 FileNotFoundError、损坏图像解码失败明确抛 ValueError (绝不返回空列表/不伪装 unknown);
3. 人脸状态严格区分: 缺失或异常必须为 error，绝不能混淆为 unknown;
4. VLM 严苛 Schema 拒绝: 空 dict、缺失字段、错误类型一律判定 rejected，强制 requires_human_review=True;
5. 采样器防御: 负时间戳、倒置时间、超界区间拦截。
"""
import os
import signal
import tempfile
import pytest

from scripts.x1_0.contract import (
    parse_and_validate_vlm_output,
    validate_shot_contract,
    ContractValidationError,
)
from scripts.x1_0.face_consistency import FaceMatcher
from scripts.x1_0.lifecycle import setup_lifecycle_guard
from scripts.x1_0.shot_sampler import ShotItem, sample_15_shots

def test_lifecycle_alarm_setup():
    """验证 55s alarm 守护能够正常安装且可重新设置"""
    setup_lifecycle_guard(55)
    # 验证 SIGALRM 处理器已注册 (非 SIG_DFL)
    handler = signal.getsignal(signal.SIGALRM)
    assert handler is not signal.SIG_DFL
    assert handler is not signal.SIG_IGN

def test_face_missing_image_raises_filenotfound():
    """缺失图像必须抛出 FileNotFoundError"""
    matcher = FaceMatcher(threshold=0.55)
    non_existent = "/private/tmp/x1_0/frames/shot_9999/non_existent.jpg"
    with pytest.raises(FileNotFoundError):
        matcher.detect_and_embed(non_existent)

def test_face_corrupted_image_raises_valueerror():
    """损坏或无法解码的图像必须 raise ValueError，绝不可返回空列表或伪装成 unknown"""
    matcher = FaceMatcher(threshold=0.55)
    with tempfile.NamedTemporaryFile(suffix=".jpg", dir="/private/tmp/x1_0", delete=False) as tf:
        tf.write(b"NOT_A_VALID_JPEG_HEADER_CORRUPTED_BYTES")
        corrupted_path = tf.name

    try:
        with pytest.raises(ValueError, match="图像无法解码或文件已损坏"):
            matcher.detect_and_embed(corrupted_path)
    finally:
        if os.path.exists(corrupted_path):
            os.remove(corrupted_path)

def test_contract_rejects_unknown_when_error_expected():
    """验证 person_consistency 状态非法时被拒绝，以及状态区分"""
    base_shot = {
        "series_id": "series_anon_001",
        "episode_id": "ep_anon_001",
        "media_id": "source_media_001",
        "shot_id": "shot_0001",
        "episode_scope": ["ep_anon_001"],
        "timestamps": {"start_sec": 10.0, "end_sec": 15.0, "duration": 5.0},
        "asr": {"status": "success", "text": "测试", "segments": []},
        "vlm": {"status": "success", "frames_observation": {}},
        "person_consistency": {
            "status": "invalid_status_xyz",
            "has_face": False,
            "persons": []
        }
    }
    with pytest.raises(ContractValidationError, match="status 'invalid_status_xyz' 非法"):
        validate_shot_contract(base_shot)

    # 合法的三种状态
    for valid_st in ["detected", "unknown", "error"]:
        base_shot["person_consistency"]["status"] = valid_st
        validated = validate_shot_contract(base_shot)
        assert validated["person_consistency"]["status"] == valid_st

def test_vlm_schema_rejects_empty_dict_and_missing_fields():
    """VLM 输出空 dict、缺失字段、非法类型必须判定为 rejected，且 requires_human_review 必须为 True"""
    # 1. 空 dict
    r1 = parse_and_validate_vlm_output("{}")
    assert r1["status"] == "rejected"
    assert r1["requires_human_review"] is True
    assert r1["semantic_status"] == "unverified"
    assert "missing field" in r1["reason"]

    # 2. 缺少 uncertainty
    partial_json = '{"characters": [], "environment": "indoor", "physical_actions": [], "objects": [], "camera": "medium"}'
    r2 = parse_and_validate_vlm_output(partial_json)
    assert r2["status"] == "rejected"
    assert "missing field 'uncertainty'" in r2["reason"]

    # 3. characters 字段不是列表
    wrong_type_json = '{"characters": "one man", "environment": "indoor", "physical_actions": [], "objects": [], "camera": "medium", "uncertainty": "none"}'
    r3 = parse_and_validate_vlm_output(wrong_type_json)
    assert r3["status"] == "rejected"
    assert "field 'characters' type str != expected list" in r3["reason"]

def test_shot_sampler_negative_and_invalid_timestamps():
    """时间戳异常（负时间、结束时间早于等于起始时间、NaN/Inf）必须在构造时拒绝"""
    with pytest.raises(ValueError, match="包含负时间"):
        ShotItem("shot_neg", start_sec=-5.0, end_sec=10.0)

    with pytest.raises(ValueError, match="终止时间必须大于起始时间"):
        ShotItem("shot_inverted", start_sec=20.0, end_sec=10.0)

    with pytest.raises(ValueError, match="终止时间必须大于起始时间"):
        ShotItem("shot_equal", start_sec=10.0, end_sec=10.0)

    with pytest.raises(ValueError, match="必须为有限数值"):
        ShotItem("shot_nan", start_sec=float("nan"), end_sec=10.0)

def test_sample_15_shots_exceeds_duration_or_duplicate_ids():
    """超出总时长或重复 ID 在 sample_15_shots 抽样阶段被严格拦截"""
    valid_shot = ShotItem("shot_0001", start_sec=10.0, end_sec=20.0)
    with pytest.raises(ValueError, match="超出视频总时长"):
        sample_15_shots([valid_shot], total_duration=15.0)

    duplicate_shots = [
        ShotItem("shot_0001", start_sec=1.0, end_sec=5.0),
        ShotItem("shot_0001", start_sec=6.0, end_sec=10.0)
    ]
    with pytest.raises(ValueError, match="重复的 shot_id"):
        sample_15_shots(duplicate_shots, total_duration=100.0)
