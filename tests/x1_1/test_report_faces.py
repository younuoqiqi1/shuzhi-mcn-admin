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

from scripts.x1_1.assemble_report import (
    aggregate_face_pairs,
    evaluate_human_labels,
    generate_markdown_report,
    calc_stats,
)

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

    def test_evaluate_human_labels_partial_nulls_returns_wer_cer_and_generates_markdown_without_keyerror(self):
        """
        回归测试:
        直接调用含部分真实格式空值 (partial nulls) 的 evaluate_human_labels，
        验证返回结果中包含 'wer_cer' 且不把 null 误当为 0，
        随后传入 generate_markdown_report 生成 Markdown 报告不发生 KeyError。
        """
        labels_fixture_path = os.path.join(self.dir_path, "partial_human_labels.json")
        labels_data = {
            "provenance": "human_review",
            "reviewer": "test_human_auditor",
            "face_pairs": {
                "pair_001": "same",
                "pair_002": None,
                "pair_003": "different",
                "pair_004": "uncertain"
            },
            "vlm_gemini_audits": {
                "shot_0010_frame_25": {
                    "factual_count": 3,
                    "hallucinated_count": 2,
                    "scene_audit": "rejected",
                    "action_audit": "accepted",
                },
                "shot_0010_frame_50": {
                    "factual_count": 14,
                    "hallucinated_count": 0,
                    "scene_audit": "accepted",
                    "action_audit": "accepted",
                },
                "shot_0010_frame_75": {
                    "factual_count": None,
                    "hallucinated_count": None,
                    "scene_audit": "accepted",
                    "action_audit": "accepted",
                },
                "shot_0070_frame_75": {
                    "factual_count": 19,
                    "hallucinated_count": None,
                    "scene_audit": "accepted",
                    "action_audit": "accepted",
                }
            }
        }
        with open(labels_fixture_path, "w", encoding="utf-8") as f:
            json.dump(labels_data, f)

        anchor_tuples = [
            ("shot_0010", "25", "shot_0010_frame_25"),
            ("shot_0010", "50", "shot_0010_frame_50"),
            ("shot_0010", "75", "shot_0010_frame_75"),
            ("shot_0070", "75", "shot_0070_frame_75"),
        ]
        # 补齐至 45 帧结构，使用绝对不重复的 shot_9xxx 保证不与已有 shot 冲突
        for idx in range(1, 42):
            anchor_tuples.append((f"shot_9{idx:03d}", "50", f"shot_9{idx:03d}_frame_50"))

        eval_res = evaluate_human_labels(labels_fixture_path, anchor_tuples)

        # 1. 验证 wer_cer 字段存在且为 pending，避免下游 KeyError
        self.assertIn("wer_cer", eval_res)
        self.assertEqual(eval_res["wer_cer"], "pending")
        self.assertEqual(eval_res["status"], "coverage_insufficient")

        # 2. 核心规则: null 计数不可视为 0
        # shot_0010_frame_75 (None, None) 与 shot_0070_frame_75 (19, None) 绝不可计入已审核事实
        self.assertEqual(eval_res["annotated_frames_count"], 2)
        self.assertEqual(eval_res["null_or_unannotated_frames_count"], 43)
        self.assertEqual(eval_res["total_factual_statements"], 17)  # 3 + 14
        self.assertEqual(eval_res["total_hallucinated_statements"], 2)  # 2 + 0
        self.assertEqual(eval_res["total_statements_denominator"], 19)
        self.assertEqual(eval_res["hallucination_rate"], round(2 / 19.0, 4))

        # 3. 验证 generate_markdown_report 执行不抛出 KeyError 并正确输出
        metrics_dict = {
            "overall_status": "awaiting_human_review",
            "generated_at": 1700000000,
            "code_hashes": {
                "assemble_report": "test_code_hash_01",
                "selected_15_shots": "test_code_hash_02",
            },
            "vlm_gemini_45": {
                "official_model_version": "agy-cli:gemini-3.1-pro-low:effort=low",
                "is_formal_45": True,
                "total_anchors": 45,
                "present_count": 44,
                "missing_count": 1,
                "schema_valid_count": 44,
                "trace_valid_count": 44,
                "hash_valid_count": 44,
                "error_count": 1,
                "firstpass_success_count": 44,
                "firstpass_rate": 0.9778,
                "model_version_conflicts": [],
                "all_attempts_latency_stats_ms": {"stats": calc_stats([2000.0, 2500.0]), "count": 2},
                "success_only_latency_stats_ms": {"stats": calc_stats([2000.0]), "count": 1},
                "usage_median_per_frame": {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
            },
            "shots_diagnostics": {
                "total_detected_cuts": 32,
                "total_children_shots": 47,
                "coverage_verified_count": 15,
                "total_parent_shots": 15,
                "coverage_pass_rate": 1.0,
                "global_max_child_duration": {"child_id": "shot_0055_child_01", "duration": 26.52},
                "longest_parent_shot": {"shot_id": "shot_0055", "duration": 65.2},
            },
            "fusion_and_ocr": {
                "ocr_snapshot": {"path": "dummy.json", "sha256": "dummy_sha", "raw_item_count": 857, "metadata_image_hash": "unknown"},
                "fusion_15_stats": {
                    "total_ocr_events": 90,
                    "total_asr_segments": 90,
                    "counts_by_type": {"consensus": 34, "conflict": 43, "ocr_only": 13, "asr_only": 27}
                }
            },
            "face_pairs": {
                "status": "calibrated",
                "annotated_pairs": 35,
                "same_count": 14,
                "different_count": 21,
                "uncertain_count": 2,
                "unannotated_count": 3,
                "recommended_threshold": 0.4067,
                "calibration_status": "calibrated_successfully",
                "objective_metrics": {
                    "calibration_sample_count": 17,
                    "calibration_balanced_accuracy": 0.8071,
                    "calibration_f1": 0.7692,
                    "calibration_precision": 0.8333,
                    "calibration_recall": 0.7143,
                    "calibration_confusion": {"tp": 5, "fp": 1, "fn": 2, "tn": 9},
                    "holdout_sample_count": 18,
                    "holdout_balanced_accuracy": 1.0,
                    "holdout_f1": 1.0,
                    "holdout_precision": 1.0,
                    "holdout_recall": 1.0,
                    "holdout_confusion": {"tp": 7, "fp": 0, "fn": 0, "tn": 11},
                    "holdout_false_positives": [],
                    "holdout_false_negatives": [],
                    "notes": "注意: 划分仅保证 pair-disjoint，而非 person-disjoint；cal 与 eval 共享 11 个 face_id"
                }
            },
            "human_labels_evaluation": eval_res,
            "pipeline_projection": {
                "planning_model_assumptions": {"measured_median_latency_seconds": 2.0},
                "episode_time_estimate": {"serial_minutes": 16.2, "serial_seconds": 972.0, "concurrent_2_minutes": 8.1, "concurrent_2_seconds": 486.0},
                "series_30_time_estimate": {"serial_hours": 8.1, "concurrent_2_hours": 4.1}
            },
            "runs_pilot_and_preflight": {
                "pilot": {"total_attempts": 16, "success_count": 12, "timeout_count": 4, "other_error_count": 0, "latency_stats_ms": calc_stats([5000.0])},
                "preflight": {"total_attempts": 4}
            },
            "total_experimental_overhead": {
                "total_cli_attempts_count": 65,
                "formal_vlm_attempts": 45,
                "pilot_attempts": 16,
                "preflight_configuration_error_attempts": 4,
                "total_tokens_consumed": {"input_tokens": 1000, "output_tokens": 500, "thinking_tokens": 200, "total_tokens": 1700}
            }
        }

        out_md_path = os.path.join(self.dir_path, "regression_report.md")
        try:
            generate_markdown_report(metrics_dict, out_md_path)
        except KeyError as e:
            self.fail(f"generate_markdown_report 抛出 KeyError: {e}")

        self.assertTrue(os.path.exists(out_md_path))
        with open(out_md_path, "r", encoding="utf-8") as f:
            md_content = f.read()
        self.assertIn("0.4067", md_content)
        self.assertIn("partial 审核覆盖", md_content)
        self.assertIn("pending", md_content)

if __name__ == "__main__":
    unittest.main()
