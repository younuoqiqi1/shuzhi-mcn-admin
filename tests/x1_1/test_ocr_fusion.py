"""
tests/x1_1/test_ocr_fusion.py
聚焦测试: 缺失 binary 报错不假装 blank、重叠相似度 0 严格判 conflict
"""
import pytest
from scripts.x1_1.ocr_fusion import fuse_ocr_and_asr, OCRBinaryNotFoundError

def test_time_overlap_with_zero_similarity_strictly_conflicts():
    """
    聚焦测试: 时间重叠但在文字相似度为 0 时 (如 OCR 误识或不同台词)，
    必须严格判定为 conflict，绝不能因为 best_sim==0 错漏成 asr_only！
    """
    ocr_events = [
        {"timestamp_sec": 100.0, "subtitle_text": "春风吹又生"}
    ]
    # 时间完全包含 100.0s (99.0 ~ 102.0)
    asr_segments = [
        {"abs_start": 99.0, "abs_end": 102.0, "text": "黑夜下大雨"}
    ]

    fused = fuse_ocr_and_asr(ocr_events, asr_segments, "shot_0055")
    assert len(fused) == 1
    item = fused[0]
    # 必须判为 conflict，严禁被误判为 asr_only 或 ocr_only
    assert item["fusion_type"] == "conflict"
    assert item["source"] == "explicit_conflict"
    assert item["ocr_text"] == "春风吹又生"
    assert item["asr_text"] == "黑夜下大雨"
    assert item["similarity"] == 0.0

def test_missing_ocr_binary_not_swallowed_as_blank():
    """
    聚焦测试: 缺失预编译二进制时，必须抛出明确异常，绝不能假装返回空 blank 列表
    """
    # 验证 OCRBinaryNotFoundError 类存在且可实例化
    err = OCRBinaryNotFoundError("未找到预编译的 Vision OCR 二进制文件")
    assert "未找到预编译的 Vision OCR 二进制文件" in str(err)

def test_fuse_existing_zero_similarity_strictly_conflicts_and_resolved_text_none():
    """
    测试 1: fuse-existing 零相似度冲突
    当已有硬字幕与 ASR 时间发生重叠但文字相似度为 0 时，必须严格判为 conflict，
    resolved_text 必须为 None，且不覆盖原始 ocr_text 与 asr_text！
    """
    from scripts.x1_1.ocr_fusion import fuse_existing_ocr_and_asr

    ocr_items = [
        {
            "index": 1,
            "start_sec": 100.0,
            "end_sec": 101.5,
            "text": "春风吹又生",
            "confidence": 0.95,
            "image_hash": "unknown",
            "time_source": "existing_ocr"
        }
    ]
    asr_segments = [
        {
            "abs_start": 99.5,
            "abs_end": 102.0,
            "text": "黑夜下大雨"
        }
    ]

    fused = fuse_existing_ocr_and_asr(ocr_items, asr_segments, "shot_0055")
    assert len(fused) == 1
    item = fused[0]
    assert item["fusion_type"] == "conflict"
    assert item["ocr_text"] == "春风吹又生"
    assert item["asr_text"] == "黑夜下大雨"
    assert item["similarity"] == 0.0
    assert item["resolved_text"] is None
    assert item["confidence"] == 0.95
    assert item["image_hash"] == "unknown"

def test_multi_source_raw_independent_preservation_and_single_source_notes():
    """
    测试 2: 多源 raw 独立保留与单源 unverified 标记
    单源 ocr_only 与 asr_only 的 resolved_text 为 None，并显式标注 unverified_single_source，绝不覆盖原文
    """
    from scripts.x1_1.ocr_fusion import fuse_existing_ocr_and_asr

    ocr_items = [
        {
            "index": 10,
            "start_sec": 50.0,
            "end_sec": 51.0,
            "text": "独立字幕",
            "confidence": 0.88,
            "image_hash": "unknown"
        }
    ]
    asr_segments = [
        {
            "abs_start": 80.0,
            "abs_end": 82.0,
            "text": "独立语音对白"
        }
    ]

    fused = fuse_existing_ocr_and_asr(ocr_items, asr_segments, "shot_0055")
    assert len(fused) == 2

    ocr_only_item = next(f for f in fused if f["fusion_type"] == "ocr_only")
    assert ocr_only_item["ocr_text"] == "独立字幕"
    assert ocr_only_item["asr_text"] is None
    assert ocr_only_item["resolved_text"] is None
    assert ocr_only_item["resolution_note"] == "unverified_single_source"

    asr_only_item = next(f for f in fused if f["fusion_type"] == "asr_only")
    assert asr_only_item["ocr_text"] is None
    assert asr_only_item["asr_text"] == "独立语音对白"
    assert asr_only_item["resolved_text"] is None
    assert asr_only_item["resolution_note"] == "unverified_single_source"

def test_safe_default_snapshot_path_and_hash():
    """
    测试 3: 安全默认快照路径与哈希一致性
    默认 EXISTING_SUBTITLES_PATH 必须指向安全快照 benchmarks/x1/development/x1_1/existing_hard_subtitles.json
    不放宽 isolation_guard 旧 Evidence 禁令
    """
    import os
    import hashlib
    from scripts.x1_1.ocr_fusion import EXISTING_SUBTITLES_PATH

    expected_path = "benchmarks/x1/development/x1_1/existing_hard_subtitles.json"
    assert EXISTING_SUBTITLES_PATH == expected_path

    if os.path.exists(expected_path):
        with open(expected_path, "rb") as f:
            content = f.read()
        sha = hashlib.sha256(content).hexdigest()
        assert sha == "dce24653f6b2f384b5e2b2f35952c8b30cb282d55a3af2c1d6a540a90d941254"

def test_ocr_local_model_entry_strictly_blocked(monkeypatch):
    """
    测试 4: 生产入口禁止 local 模型测试
    运行 python -m scripts.x1_1.ocr_fusion --stage ocr 必须直接抛出 RuntimeError 拒绝新本地推理
    """
    import sys
    from scripts.x1_1.ocr_fusion import main

    test_args = [
        "ocr_fusion.py",
        "--stage", "ocr",
        "--parent-id", "shot_0055",
        "--batch-index", "0"
    ]
    monkeypatch.setattr(sys, "argv", test_args)

    with pytest.raises(RuntimeError) as exc_info:
        main()
    assert "本地模型已被删除" in str(exc_info.value)

def test_face_pairs_main_blocks_recompute_and_protects_existing(monkeypatch):
    """
    测试 5: face_pairs.py main 入口禁止新本地推理并保护已有 40 pairs
    指定 --force-recompute 时必须抛出 RuntimeError 拒绝新本地推理
    """
    import sys
    from scripts.x1_1.face_pairs import main

    test_args = [
        "face_pairs.py",
        "--force-recompute"
    ]
    monkeypatch.setattr(sys, "argv", test_args)

    with pytest.raises(RuntimeError) as exc_info:
        main()
    assert "已删除本地模型，生产入口严禁重新运行本地人脸模型推理" in str(exc_info.value)
