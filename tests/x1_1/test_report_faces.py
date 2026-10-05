"""
tests/x1_1/test_report_faces.py
针对 assemble_report.py 中 aggregate_face_pairs 独立校验门禁与指标聚合的单元测试

测试约束与规范:
1. 测试标签仅 fixtures (纯合成夹具数据，绝不修改、依赖或覆盖真实样本与冻结产物);
2. 覆盖有效报告正常采纳 (provenance='human_review', reviewer 非空, pairs_sha256 匹配, status='calibrated_successfully');
3. 覆盖 pairs_sha256 哈希不匹配时安全拒绝并保持 pending;
4. 覆盖 reviewer 为空或非 human_review 时的安全拒绝;
5. 冻结 pairs 不可改，未提供真实报告仍保持 pending。
"""
import hashlib
import json
import os
import tempfile
import unittest

from scripts.x1_1.assemble_report import aggregate_face_pairs

class TestReportFacePairsAggregation(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dir_path = self.temp_dir.name

        # 构造测试专用的 pairs fixture 文件 (冻结不可变夹具)
        self.pairs_fixture_path = os.path.join(self.dir_path, "face_pairs_fixture.json")
        self.pairs_fixture_data = {
            "pair_count": 2,
            "status": "pending_human_annotation",
            "pairs": [
                {
                    "pair_id": "pair_001",
                    "face_a": {"face_id": "face_001"},
                    "face_b": {"face_id": "face_002"},
                    "human_label": None,
                },
                {
                    "pair_id": "pair_002",
                    "face_a": {"face_id": "face_003"},
                    "face_b": {"face_id": "face_004"},
                    "human_label": None,
                },
            ]
        }
        with open(self.pairs_fixture_path, "w", encoding="utf-8") as f:
            json.dump(self.pairs_fixture_data, f)

        # 计算 pairs fixture 的实际 SHA256
        with open(self.pairs_fixture_path, "rb") as f:
            self.expected_pairs_sha256 = hashlib.sha256(f.read()).hexdigest()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_valid_calibration_report_accepted(self):
        """测试仅接受合规报告：provenance='human_review', reviewer非空, pairs_sha256一致, status='calibrated_successfully'"""
        calib_report_path = os.path.join(self.dir_path, "valid_calib_report.json")
        calib_data = {
            "status": "calibrated_successfully",
            "provenance": "human_review",
            "reviewer": "test_human_auditor_01",
            "pairs_sha256": self.expected_pairs_sha256,
            "annotated_count": 12,
            "chosen_threshold": 0.62,
            "recommended_threshold": 0.62,
            "holdout_sample_count": 6,
            "holdout_balanced_acc": 0.8333,
            "holdout_f1": 0.8000,
            "holdout_precision": 0.8500,
            "holdout_recall": 0.7600,
            "holdout_confusion": {"tp": 3, "fp": 1, "fn": 1, "tn": 1},
            "holdout_false_positives": ["pair_001"],
            "holdout_false_negatives": ["pair_002"],
            "notes": "fixtures holdout verification"
        }
        with open(calib_report_path, "w", encoding="utf-8") as f:
            json.dump(calib_data, f)

        res = aggregate_face_pairs(self.pairs_fixture_path, calib_report_path)

        # 验证报告被正常采纳，状态及 holdout 指标完成汇总
        self.assertEqual(res["calibration_status"], "calibrated_successfully")
        self.assertEqual(res["recommended_threshold"], 0.62)
        self.assertEqual(res["annotated_pairs"], 12)
        self.assertEqual(res["status"], "calibrated")

        # 验证实际 holdout 指标已汇总入 objective_metrics
        obj_metrics = res["objective_metrics"]
        self.assertEqual(obj_metrics["holdout_balanced_accuracy"], 0.8333)
        self.assertEqual(obj_metrics["holdout_f1"], 0.8000)
        self.assertEqual(obj_metrics["accuracy"], 0.8333)
        self.assertEqual(obj_metrics["f1"], 0.8000)
        self.assertEqual(obj_metrics["holdout_sample_count"], 6)
        self.assertEqual(obj_metrics["holdout_false_positives"], ["pair_001"])
        self.assertEqual(obj_metrics["holdout_false_negatives"], ["pair_002"])

    def test_mismatched_pairs_sha256_rejected(self):
        """测试当 pairs_sha256 与当前 pairs 文件不匹配时，拒绝采纳并保持 pending"""
        calib_report_path = os.path.join(self.dir_path, "mismatched_calib_report.json")
        calib_data = {
            "status": "calibrated_successfully",
            "provenance": "human_review",
            "reviewer": "test_human_auditor_01",
            "pairs_sha256": "fake_sha256_mismatched_hash_value_99999",
            "annotated_count": 12,
            "chosen_threshold": 0.62,
            "recommended_threshold": 0.62,
            "holdout_metrics": {
                "balanced_accuracy": 0.90,
                "f1": 0.88
            }
        }
        with open(calib_report_path, "w", encoding="utf-8") as f:
            json.dump(calib_data, f)

        res = aggregate_face_pairs(self.pairs_fixture_path, calib_report_path)

        # 验证门禁拒绝，指标与状态依然保持 pending
        self.assertEqual(res["calibration_status"], "pending")
        self.assertEqual(res["recommended_threshold"], "pending")
        self.assertEqual(res["status"], "pending_human_annotation")
        self.assertEqual(res["objective_metrics"]["accuracy"], "pending")
        self.assertEqual(res["objective_metrics"]["f1"], "pending")

    def test_missing_reviewer_or_non_human_review_rejected(self):
        """测试 reviewer 为空或 provenance 非 human_review 时拒绝采纳"""
        # 1. 空 reviewer 报告拒绝
        calib_path_empty_rev = os.path.join(self.dir_path, "empty_reviewer_report.json")
        with open(calib_path_empty_rev, "w", encoding="utf-8") as f:
            json.dump({
                "status": "calibrated_successfully",
                "provenance": "human_review",
                "reviewer": "   ",
                "pairs_sha256": self.expected_pairs_sha256,
            }, f)
        res1 = aggregate_face_pairs(self.pairs_fixture_path, calib_path_empty_rev)
        self.assertEqual(res1["calibration_status"], "pending")
        self.assertEqual(res1["recommended_threshold"], "pending")

        # 2. provenance 非 human_review 报告拒绝
        calib_path_synthetic = os.path.join(self.dir_path, "synthetic_report.json")
        with open(calib_path_synthetic, "w", encoding="utf-8") as f:
            json.dump({
                "status": "calibrated_successfully",
                "provenance": "synthetic_model_auto",
                "reviewer": "bot",
                "pairs_sha256": self.expected_pairs_sha256,
            }, f)
        res2 = aggregate_face_pairs(self.pairs_fixture_path, calib_path_synthetic)
        self.assertEqual(res2["calibration_status"], "pending")
        self.assertEqual(res2["recommended_threshold"], "pending")

    def test_nonexistent_report_keeps_pending(self):
        """测试未提供报告文件时保持 pending，冻结 pairs 不可改"""
        non_existent_report = os.path.join(self.dir_path, "not_exist_report.json")
        res = aggregate_face_pairs(self.pairs_fixture_path, non_existent_report)
        self.assertEqual(res["calibration_status"], "pending")
        self.assertEqual(res["recommended_threshold"], "pending")
        self.assertEqual(res["status"], "pending_human_annotation")
        self.assertEqual(res["objective_metrics"]["accuracy"], "pending")
        self.assertEqual(res["objective_metrics"]["f1"], "pending")

if __name__ == "__main__":
    unittest.main()
