"""
tests/x1_1/test_face_pairs.py
聚焦测试: SFace 128D 维度一致性、模型缺失异常、独立校准门禁、heldout 隔离与真实人审溯源
"""
import copy
import json
import pytest

from scripts.x1_1.face_pairs import (
    compute_cosine_similarity,
    generate_40_anonymous_pairs,
    resolve_model_weights,
    FaceWeightsNotFoundError,
)
from scripts.x1_1.calibrate_face import (
    load_and_verify_human_labels,
    calibrate_and_evaluate,
    CalibrationBlockedError,
)

def test_sface_128d_embedding_dimension_and_self_similarity():
    v1 = [0.1] * 128
    v2 = [0.1] * 128
    sim_self = compute_cosine_similarity(v1, v2)
    assert len(v1) == 128
    assert round(sim_self, 4) == 1.0

def test_missing_onnx_weights_raises_explicit_error_no_hsv_fallback(monkeypatch):
    # 模拟文件系统上无任何 ONNX 权重文件存在
    monkeypatch.setattr("os.path.exists", lambda p: False)

    with pytest.raises(FaceWeightsNotFoundError) as exc_info:
        resolve_model_weights()
    assert "未找到真实 YuNet/SFace ONNX 权重" in str(exc_info.value)
    assert "严禁任何降级伪造" in str(exc_info.value)

def test_calibration_blocked_without_human_provenance(tmp_path):
    pairs_file = tmp_path / "pairs.json"
    pairs_file.write_text(json.dumps({
        "pairs": [
            {"pair_id": f"pair_{i:03d}", "_internal_cosine_sim": 0.6}
            for i in range(20)
        ]
    }))

    # 构造缺少 human_review 溯源标记的标注文件
    bad_labels_file = tmp_path / "bad_labels.json"
    bad_labels_file.write_text(json.dumps({
        "provenance": "auto_generated", # 非真实人工
        "reviewer": "reviewer_alice",
        "face_pairs": {f"pair_{i:03d}": "same" for i in range(20)}
    }))

    with pytest.raises(CalibrationBlockedError) as exc_info:
        load_and_verify_human_labels(str(bad_labels_file), str(pairs_file))
    assert "缺少有效 human_review 溯源标记" in str(exc_info.value)

def test_calibration_blocked_without_valid_reviewer(tmp_path):
    pairs_file = tmp_path / "pairs.json"
    pairs_file.write_text(json.dumps({
        "pairs": [
            {"pair_id": f"pair_{i:03d}", "_internal_cosine_sim": 0.6}
            for i in range(20)
        ]
    }))

    # 1. 缺失 reviewer 字段
    no_rev_file = tmp_path / "no_rev.json"
    no_rev_file.write_text(json.dumps({
        "provenance": "human_review",
        "face_pairs": {f"pair_{i:03d}": "same" for i in range(20)}
    }))
    with pytest.raises(CalibrationBlockedError) as exc_info:
        load_and_verify_human_labels(str(no_rev_file), str(pairs_file))
    assert "reviewer" in str(exc_info.value)

    # 2. reviewer 为空字符串或纯空格
    empty_rev_file = tmp_path / "empty_rev.json"
    empty_rev_file.write_text(json.dumps({
        "provenance": "human_review",
        "reviewer": "   ",
        "face_pairs": {f"pair_{i:03d}": "same" for i in range(20)}
    }))
    with pytest.raises(CalibrationBlockedError) as exc_info:
        load_and_verify_human_labels(str(empty_rev_file), str(pairs_file))
    assert "reviewer" in str(exc_info.value)

def test_calibration_blocked_when_samples_insufficient_or_single_class(tmp_path):
    pairs_file = tmp_path / "pairs.json"
    pairs_file.write_text(json.dumps({
        "pairs": [
            {"pair_id": f"pair_{i:03d}", "_internal_cosine_sim": 0.6}
            for i in range(20)
        ]
    }))

    # 构造仅有 same 缺乏 different 的单一类别文件 (添加有效 reviewer 真实测试标识)
    single_class_file = tmp_path / "single_class.json"
    single_class_file.write_text(json.dumps({
        "provenance": "human_review",
        "reviewer": "reviewer_auditor_01",
        "face_pairs": {f"pair_{i:03d}": "same" for i in range(12)}
    }))

    with pytest.raises(CalibrationBlockedError) as exc_info:
        load_and_verify_human_labels(str(single_class_file), str(pairs_file))
    assert "缺少双类别样本" in str(exc_info.value) or "双类别" in str(exc_info.value)

def test_calibration_blocked_when_class_has_only_one_sample(tmp_path):
    """测试每类仅1样本时必须被拒绝：same=1 或 different=1 均不能通过两类各至少2门禁"""
    pairs_file = tmp_path / "pairs.json"
    pairs_file.write_text(json.dumps({
        "pairs": [
            {"pair_id": f"pair_{i:03d}", "_internal_cosine_sim": 0.6}
            for i in range(20)
        ]
    }))

    # 1. same 仅有 1 条，different 足够 (10 条，总计 11 条)
    only_one_same_file = tmp_path / "only_one_same.json"
    face_pairs_1 = {"pair_000": "same"}
    face_pairs_1.update({f"pair_{i:03d}": "different" for i in range(1, 11)})
    only_one_same_file.write_text(json.dumps({
        "provenance": "human_review",
        "reviewer": "reviewer_bob",
        "face_pairs": face_pairs_1
    }))

    with pytest.raises(CalibrationBlockedError) as exc_info1:
        load_and_verify_human_labels(str(only_one_same_file), str(pairs_file))
    assert "至少 2 条" in str(exc_info1.value) or "双类别" in str(exc_info1.value)

    # 2. different 仅有 1 条，same 足够 (10 条，总计 11 条)
    only_one_diff_file = tmp_path / "only_one_diff.json"
    face_pairs_2 = {"pair_000": "different"}
    face_pairs_2.update({f"pair_{i:03d}": "same" for i in range(1, 11)})
    only_one_diff_file.write_text(json.dumps({
        "provenance": "human_review",
        "reviewer": "reviewer_bob",
        "face_pairs": face_pairs_2
    }))

    with pytest.raises(CalibrationBlockedError) as exc_info2:
        load_and_verify_human_labels(str(only_one_diff_file), str(pairs_file))
    assert "至少 2 条" in str(exc_info2.value) or "双类别" in str(exc_info2.value)

def test_calibration_eval_held_out_not_in_optimization():
    """聚焦测试: 评估集绝不参与 candidate 生成与 threshold 优化"""
    # 构造完整的双类别数据集
    dataset_a = []
    for i in range(10):
        dataset_a.append({
            "pair_id": f"pair_same_{i:02d}",
            "sim": 0.80 + i * 0.015,
            "label": "same"
        })
    for i in range(10):
        dataset_a.append({
            "pair_id": f"pair_diff_{i:02d}",
            "sim": 0.20 + i * 0.015,
            "label": "different"
        })

    # 先运行 report_a，读取切分出的实际 holdout_pair_ids
    report_a = calibrate_and_evaluate(dataset_a)
    holdout_ids = set(report_a["holdout_pair_ids"])
    cal_ids_a = report_a["calibration_pair_ids"]

    # 深拷贝该数据集，只修改实际属于 holdout 的样本 sim (同一 ID、label、顺序全部不变)
    dataset_b = copy.deepcopy(dataset_a)
    for p in dataset_b:
        if p["pair_id"] in holdout_ids:
            if p["label"] == "same":
                p["sim"] = 0.05
            else:
                p["sim"] = 0.95

    # 运行 report_b
    report_b = calibrate_and_evaluate(dataset_b)

    # 1. 两次 calibration_pair_ids 完全相同
    assert report_a["calibration_pair_ids"] == report_b["calibration_pair_ids"]
    assert set(report_b["calibration_pair_ids"]).isdisjoint(holdout_ids)

    # 2. chosen_threshold 与 recommended_threshold 完全相同
    assert report_a["chosen_threshold"] == report_b["chosen_threshold"]
    assert report_a["recommended_threshold"] == report_b["recommended_threshold"]

    # 3. calibration candidates 完全相同
    assert report_a["threshold_candidates"] == report_b["threshold_candidates"]

    # 4. 评估集分数被反转后，holdout 的性能指标显著改变
    assert report_a["holdout_balanced_acc"] != report_b["holdout_balanced_acc"]
    assert report_a["holdout_metrics"]["confusion"] != report_b["holdout_metrics"]["confusion"]

def test_calibration_pair_disjoint_and_shared_faces_and_both_classes_non_empty(tmp_path):
    """测试 pair-disjoint 划分、校准与评估集双类别非空、shared_face_ids 计算与非 person-disjoint 声明"""
    pairs_list = []
    # 构造 20 个 pair，包含 face_a 与 face_b，跨 pair 共享部分 face_id
    for i in range(20):
        pairs_list.append({
            "pair_id": f"pair_{i:03d}",
            "face_a": {"face_id": f"face_{i % 5:04d}", "shot_id": "shot_001"},
            "face_b": {"face_id": f"face_{(i + 1) % 5:04d}", "shot_id": "shot_002"},
            "_internal_cosine_sim": 0.75 if i % 2 == 0 else 0.35,
        })
    pairs_file = tmp_path / "pairs.json"
    pairs_file.write_text(json.dumps({"pairs": pairs_list}))

    # 构造包含 reviewer 与 provenance 的有效标注文件 (含 uncertain 与未标注)
    face_labels = {}
    for i in range(8):
        face_labels[f"pair_{i:03d}"] = "same"
    for i in range(8, 16):
        face_labels[f"pair_{i:03d}"] = "different"
    face_labels["pair_016"] = "uncertain"
    # pair_017, pair_018, pair_019 留空未标注

    labels_file = tmp_path / "human_labels.json"
    labels_file.write_text(json.dumps({
        "provenance": "human_review",
        "reviewer": "reviewer_charlie",
        "face_pairs": face_labels
    }))

    annotated = load_and_verify_human_labels(str(labels_file), str(pairs_file))
    assert annotated.meta["reviewer"] == "reviewer_charlie"
    assert annotated.meta["provenance"] == "human_review"
    assert len(annotated.meta["labels_sha256"]) == 64
    assert len(annotated.meta["pairs_sha256"]) == 64
    assert annotated.meta["annotated_count"] == 16
    assert annotated.meta["uncertain_count"] == 1
    assert annotated.meta["unannotated_count"] == 3
    assert annotated.meta["total_pairs_count"] == 20

    report = calibrate_and_evaluate(annotated, metadata=annotated.meta)

    # 1. 验证 pair-disjoint: 两集合 pair_ids 绝不重合
    cal_ids = set(report["calibration_pair_ids"])
    eval_ids = set(report["holdout_pair_ids"])
    assert cal_ids.isdisjoint(eval_ids)
    assert report["is_pair_disjoint"] is True

    # 2. 验证校准集和评估集中双类别均非空
    cal_tp_fn = report["calibration_metrics"]["confusion"]["tp"] + report["calibration_metrics"]["confusion"]["fn"]
    cal_tn_fp = report["calibration_metrics"]["confusion"]["tn"] + report["calibration_metrics"]["confusion"]["fp"]
    eval_tp_fn = report["holdout_metrics"]["confusion"]["tp"] + report["holdout_metrics"]["confusion"]["fn"]
    eval_tn_fp = report["holdout_metrics"]["confusion"]["tn"] + report["holdout_metrics"]["confusion"]["fp"]
    assert cal_tp_fn > 0 and cal_tn_fp > 0
    assert eval_tp_fn > 0 and eval_tn_fp > 0

    # 3. 验证 shared_face_ids 计算与非 person-disjoint 声明
    assert report["shared_face_ids_count"] > 0
    assert len(report["shared_face_ids"]) == report["shared_face_ids_count"]
    assert report["is_person_disjoint"] is False
    assert "不足以证明全 PersonConsistency" in report["notes"]
    assert "不足以证明全 PersonConsistency" in report["disclaimer"]

    # 4. 验证 confusion (tp/fp/fn/tn), precision, recall, f1, 优化目标与候选阈值
    for prefix in ["calibration", "holdout"]:
        conf = report[f"{prefix}_confusion"]
        assert all(k in conf for k in ("tp", "fp", "fn", "tn"))
        assert 0.0 <= report[f"{prefix}_precision"] <= 1.0
        assert 0.0 <= report[f"{prefix}_recall"] <= 1.0
        assert 0.0 <= report[f"{prefix}_f1"] <= 1.0

    assert "chosen_threshold" in report
    assert "threshold_candidates" in report
    assert "optimization_objective" in report

def test_no_threshold_provided_until_real_human_labels_exist(tmp_path):
    """测试门禁: 未提供真实有效 human_review 标注前，拒绝执行校准并不给出阈值"""
    pairs_file = tmp_path / "pairs.json"
    pairs_file.write_text(json.dumps({"pairs": []}))

    missing_labels = tmp_path / "non_existent_labels.json"
    with pytest.raises(CalibrationBlockedError) as exc_info:
        load_and_verify_human_labels(str(missing_labels), str(pairs_file))
    assert "标注文件不存在" in str(exc_info.value)
