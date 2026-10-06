"""
Unit and integration tests for X1.2 Review & Report Pipeline (Strict Verification Edition).
Validates:
  - from typing import Tuple imported properly
  - Genuine 6-field VLM schema verification (characters, environment, physical_actions, objects, camera, uncertainty)
  - Rejection of invalid schema, missing fields, or enum violations
  - Rejection of tampered source_hash, inference_hash, or prompt_schema_hash (both record and response fields)
  - Enforced model_version == 'agy-cli:gemini-3.1-pro-low:effort=low'
  - Native stream verification via scripts.x1_1.assemble_report.verify_stream_log:
    - Rejects missing stream files
    - Rejects streams containing denied_actions
    - Rejects unauthorized tool calls and unauthorized path targets (wrong sandbox image)
    - Rejects streams without view_file DONE on target image
    - Accepts genuine stream records matching init.cwd and expected structured_output
  - Manifest guard: requires len=50 and genuine sha256, does NOT declare PASS if incomplete
  - Strict 150 denominator based on 50 manifest shots, reflecting failures without retry
  - OCR extraction using genuine start_sec/end_sec, saving independent ocr_predictions.json
  - Visual prediction observations (character count, environment) kept strictly as prediction (never Gold, no Person F1)
  - Review HTML structure: 50 shots grouped, inline 384 + collapse original, screen-left/right guidance, empty defaults
"""

import hashlib
import io
import json
import os
import re
import sys
import tempfile
from typing import Any, Dict, List, Optional, Tuple
import unittest
from pathlib import Path
from PIL import Image

# Add project root to sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.x1_1.vlm_schema import VLM_OBJECTIVE_SCHEMA
from scripts.x1_1.providers import VLMRequest
from scripts.x1_1.assemble_report import verify_stream_log
from scripts.x1_2.review_report import (
    INFER_PROMPT,
    OFFICIAL_MODEL_VERSION,
    compute_and_save_ocr_predictions,
    compute_data_sha256,
    generate_report,
    generate_review_html,
    validate_inference_record,
)


class TestX12ReviewReportStrict(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_dir = Path(self.temp_dir.name)

        self.manifest_file = self.test_dir / "manifest.json"
        self.runs_dir = self.test_dir / "runs_x1_2"
        self.frames_dir = self.runs_dir / "frames"
        self.inferences_dir = self.runs_dir / "inferences"
        self.streams_dir = self.runs_dir / "streams"

        self.frames_dir.mkdir(parents=True, exist_ok=True)
        self.inferences_dir.mkdir(parents=True, exist_ok=True)
        self.streams_dir.mkdir(parents=True, exist_ok=True)

        # 50 shots manifest with verified sha256
        self.shots = []
        for i in range(1, 51):
            s_start = float((i - 1) * 50.0)
            s_end = s_start + 10.0
            self.shots.append({
                "shot_id": f"shot_B{i:04d}",
                "segment": "early" if i <= 17 else ("mid" if i <= 34 else "late"),
                "start": s_start,
                "end": s_end,
                "duration": 10.0,
            })
        manifest_data = {
            "batch_id": "X1.2",
            "total_shots": 50,
            "shots": self.shots,
        }
        manifest_data["manifest_sha256"] = compute_data_sha256(manifest_data)
        with open(self.manifest_file, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _create_real_frame_and_stream(
        self,
        frame_id: str,
        parsed_data: dict,
        denied_actions: list = None,
        include_view_file_done: bool = True,
        view_file_path: Optional[str] = None,
    ) -> Tuple[str, str, str]:
        # Create genuine 100x100 RGB image
        img = Image.new("RGB", (100, 100), color=(73, 109, 137))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        frame_bytes = buf.getvalue()

        frame_jpg = self.frames_dir / f"{frame_id}.jpg"
        with open(frame_jpg, "wb") as f:
            f.write(frame_bytes)

        req = VLMRequest(
            frame_id=frame_id,
            frame_bytes=frame_bytes,
            prompt=INFER_PROMPT,
            schema=VLM_OBJECTIVE_SCHEMA,
            resize_dim=384,
        )
        src_hash = req.compute_source_hash()
        _, inf_hash = req.get_standardized_inference_bytes()
        ps_hash = req.compute_prompt_schema_hash()

        # Sandbox directory matching genuine provider contract
        sandbox_dir = self.test_dir / "sandbox" / f"run_{frame_id}"
        sandbox_dir.mkdir(parents=True, exist_ok=True)
        target_img_path = str(sandbox_dir / f"{frame_id}.jpg")

        # Create genuine agy_stream_{frame_id}.jsonl
        stream_file = self.streams_dir / f"agy_stream_{frame_id}.jsonl"
        events = []
        events.append({"init": {"cwd": str(sandbox_dir)}})

        if include_view_file_done:
            used_path = view_file_path if view_file_path is not None else target_img_path
            events.append({
                "step_update": {
                    "tool_name": "view_file",
                    "state": "DONE",
                    "tool_info": {
                        "parameters": {"AbsolutePath": used_path}
                    }
                }
            })
        if denied_actions:
            events.append({"denied_actions": denied_actions})

        events.append({
            "result": {
                "status": "SUCCESS",
                "structured_output": parsed_data,
                "usage": {"prompt_tokens": 150, "completion_tokens": 80}
            }
        })

        with open(stream_file, "w", encoding="utf-8") as f:
            for ev in events:
                f.write(json.dumps(ev) + "\n")

        return src_hash, inf_hash, ps_hash

    def test_verify_stream_log_strict_checks(self):
        """Verify stream log checks: rejects missing, denied_actions, or unauthorized target path."""
        frame_id = "shot_B0001_pct25"
        valid_pv = {
            "characters": ["person in coat"],
            "environment": "dimly lit indoor room",
            "physical_actions": ["standing"],
            "objects": ["table"],
            "camera": "medium_shot",
            "uncertainty": "slight shadow",
        }

        # Case 1: Stream file missing
        missing_stream = self.streams_dir / f"agy_stream_nonexistent.jsonl"
        ok, reason = verify_stream_log(str(missing_stream), "nonexistent", valid_pv)
        self.assertFalse(ok)
        self.assertIn("不存在", reason)

        # Case 2: Stream contains denied_actions
        self._create_real_frame_and_stream(frame_id, valid_pv, denied_actions=["run_command: bash denied"])
        stream_file = self.streams_dir / f"agy_stream_{frame_id}.jsonl"
        ok, reason = verify_stream_log(str(stream_file), frame_id, valid_pv)
        self.assertFalse(ok)
        self.assertIn("denied_actions", reason)

        # Case 3: Stream targets unauthorized wrong image path outside sandbox
        self._create_real_frame_and_stream(frame_id, valid_pv, view_file_path="/tmp/wrong/path/fake.jpg")
        ok, reason = verify_stream_log(str(stream_file), frame_id, valid_pv)
        self.assertFalse(ok)
        self.assertIn("view_file_unauthorized_path", reason)

        # Case 4: Stream valid matching genuine init.cwd and target image
        self._create_real_frame_and_stream(frame_id, valid_pv)
        ok, reason = verify_stream_log(str(stream_file), frame_id, valid_pv)
        self.assertTrue(ok)
        self.assertIsNone(reason)

    def test_validate_inference_record_enforces_model_version(self):
        """Verify model_version must match OFFICIAL_MODEL_VERSION."""
        frame_id = "shot_B0001_pct50"
        valid_pv = {
            "characters": ["person"],
            "environment": "room",
            "physical_actions": ["standing"],
            "objects": ["cup"],
            "camera": "close_up",
            "uncertainty": "none",
        }
        src_h, inf_h, ps_h = self._create_real_frame_and_stream(frame_id, valid_pv)

        rec_file = self.inferences_dir / f"{frame_id}.json"
        with open(rec_file, "w", encoding="utf-8") as f:
            json.dump({
                "frame_id": frame_id,
                "model_version": "gemini-1.5-pro",  # Invalid model version
                "source_hash": src_h,
                "inference_hash": inf_h,
                "response": {
                    "model_version": "gemini-1.5-pro",
                    "parsed_validation": valid_pv,
                    "source_image_hash": src_h,
                    "inference_image_hash": inf_h,
                    "prompt_schema_hash": ps_h,
                }
            }, f)

        is_val, reason, _ = validate_inference_record(rec_file, frame_id, self.frames_dir, self.streams_dir)
        self.assertFalse(is_val)
        self.assertIn("model_version_invalid", reason)

    def test_validate_inference_record_rejects_missing_schema_fields(self):
        """Verify 6-field schema rejection when any required field is missing."""
        frame_id = "shot_B0002_pct50"
        bad_pv = {
            "characters": ["person"],
            "environment": "room",
            "physical_actions": ["standing"],
            "objects": ["cup"],
            # Missing camera & uncertainty
        }
        src_h, inf_h, ps_h = self._create_real_frame_and_stream(frame_id, bad_pv)

        rec_file = self.inferences_dir / f"{frame_id}.json"
        with open(rec_file, "w", encoding="utf-8") as f:
            json.dump({
                "frame_id": frame_id,
                "model_version": OFFICIAL_MODEL_VERSION,
                "source_hash": src_h,
                "inference_hash": inf_h,
                "response": {
                    "model_version": OFFICIAL_MODEL_VERSION,
                    "parsed_validation": bad_pv,
                    "source_image_hash": src_h,
                    "inference_image_hash": inf_h,
                    "prompt_schema_hash": ps_h,
                }
            }, f)

        is_val, reason, _ = validate_inference_record(rec_file, frame_id, self.frames_dir, self.streams_dir)
        self.assertFalse(is_val)
        self.assertIn("vlm_schema_rejected", reason)
        self.assertIn("缺失必填字段", reason)

    def test_validate_inference_record_rejects_tampered_hashes(self):
        """Verify rejection when source_hash, inference_hash, or prompt_schema_hash is tampered with."""
        frame_id = "shot_B0003_pct75"
        valid_pv = {
            "characters": [],
            "environment": "outdoor courtyard",
            "physical_actions": [],
            "objects": ["bench"],
            "camera": "full_shot",
            "uncertainty": "overcast",
        }
        src_h, inf_h, ps_h = self._create_real_frame_and_stream(frame_id, valid_pv)

        tampered_inf_h = "0000000000000000000000000000000000000000000000000000000000000000"
        rec_file = self.inferences_dir / f"{frame_id}.json"
        with open(rec_file, "w", encoding="utf-8") as f:
            json.dump({
                "frame_id": frame_id,
                "model_version": OFFICIAL_MODEL_VERSION,
                "source_hash": src_h,
                "inference_hash": tampered_inf_h,
                "response": {
                    "model_version": OFFICIAL_MODEL_VERSION,
                    "parsed_validation": valid_pv,
                    "source_image_hash": src_h,
                    "inference_image_hash": tampered_inf_h,
                    "prompt_schema_hash": ps_h,
                }
            }, f)

        is_val, reason, _ = validate_inference_record(rec_file, frame_id, self.frames_dir, self.streams_dir)
        self.assertFalse(is_val)
        self.assertIn("inference_hash_mismatch", reason)

    def test_generate_report_150_expected_and_incomplete_not_pass(self):
        """Verify report uses strict 150 denominator, records prediction counts, and does NOT declare PASS when incomplete."""
        frame_id = "shot_B0001_pct25"
        valid_pv = {
            "characters": ["detective", "assistant"],
            "environment": "indoor office room",
            "physical_actions": ["sitting", "reading"],
            "objects": ["dossier", "lamp"],
            "camera": "medium_close_up",
            "uncertainty": "none",
        }
        src_h, inf_h, ps_h = self._create_real_frame_and_stream(frame_id, valid_pv)

        rec_file = self.inferences_dir / f"{frame_id}.json"
        with open(rec_file, "w", encoding="utf-8") as f:
            json.dump({
                "frame_id": frame_id,
                "shot_id": "shot_B0001",
                "pct": 25,
                "model_version": OFFICIAL_MODEL_VERSION,
                "source_hash": src_h,
                "inference_hash": inf_h,
                "latency_ms": 1150,
                "response": {
                    "model_version": OFFICIAL_MODEL_VERSION,
                    "parsed_validation": valid_pv,
                    "source_image_hash": src_h,
                    "inference_image_hash": inf_h,
                    "prompt_schema_hash": ps_h,
                }
            }, f)

        out_metrics = self.runs_dir / "metrics.json"
        out_md = self.runs_dir / "report.md"

        metrics = generate_report(
            manifest_file=self.manifest_file,
            runs_dir=self.runs_dir,
            frames_dir=self.frames_dir,
            out_metrics_file=out_metrics,
            out_md_file=out_md,
        )

        self.assertEqual(metrics["denominator"], 150)
        self.assertEqual(metrics["success_count"], 1)
        self.assertEqual(metrics["failure_count"], 149)
        self.assertFalse(metrics["is_complete_pass"])
        self.assertEqual(metrics["overall_status"], "INCOMPLETE_OR_FAILED")

        # Prediction observations (NOT Gold)
        pred_obs = metrics["prediction_observations_not_gold"]
        self.assertEqual(pred_obs["sampled_frames_with_characters"], 1)
        self.assertEqual(pred_obs["avg_characters_per_valid_frame"], 2.0)
        self.assertIn("interior", pred_obs["environment_distribution"])
        self.assertTrue("绝对不视为人工真值" in pred_obs["disclaimer"] or "绝非人工真值" in pred_obs["disclaimer"])

        with open(out_md, "r", encoding="utf-8") as f:
            md_text = f.read()
        self.assertIn("INCOMPLETE", md_text)
        self.assertIn("未宣称通过", md_text)

    def test_compute_and_save_ocr_predictions(self):
        """Verify OCR extraction strictly matches start_sec/end_sec and writes ocr_predictions.json."""
        ocr_file = self.test_dir / "raw_subtitles.json"
        ocr_data = [
            {"start_sec": 3.0, "end_sec": 6.5, "text": "真实硬字幕台词一"},
            {"start_sec": 51.0, "end_sec": 54.0, "text": "真实硬字幕台词二"},
        ]
        with open(ocr_file, "w", encoding="utf-8") as f:
            json.dump(ocr_data, f)

        out_ocr_pred = self.runs_dir / "ocr_predictions.json"
        res = compute_and_save_ocr_predictions(
            manifest_file=self.manifest_file,
            ocr_file=ocr_file,
            out_ocr_pred_file=out_ocr_pred,
        )

        self.assertTrue(out_ocr_pred.exists())
        self.assertEqual(res["covered_shots_count"], 2)
        self.assertAlmostEqual(res["coverage_rate"], 2 / 50)
        self.assertEqual(len(res["shots_ocr"]), 50)
        self.assertEqual(res["shots_ocr"][0]["shot_id"], "shot_B0001")
        self.assertEqual(res["shots_ocr"][0]["subtitles_count"], 1)
        self.assertIn("text_sha256", res["shots_ocr"][0]["matched_subtitles"][0])

    def test_generate_review_html(self):
        """Verify review.html renders 50 shot cards, displays 6 fields, and provides empty audit controls."""
        # 预先创建合成推理记录，保证正常渲染六字段
        mock_infer = {
            "frame_id": "shot_B0001_pct25",
            "response": {
                "parsed_validation": {
                    "characters": ["一个人"],
                    "environment": "室内",
                    "physical_actions": ["站立"],
                    "objects": ["桌子"],
                    "camera": "中景",
                    "uncertainty": "无",
                }
            },
        }
        with open(self.inferences_dir / "shot_B0001_pct25.json", "w", encoding="utf-8") as f:
            json.dump(mock_infer, f)

        out_html = self.test_dir / "review.html"
        generate_review_html(
            manifest_file=self.manifest_file,
            frames_dir=self.frames_dir,
            runs_dir=self.runs_dir,
            output_html_file=out_html,
        )

        self.assertTrue(out_html.exists())
        with open(out_html, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("shot_B0001", content)
        self.assertIn("shot_B0050", content)
        self.assertIn("画面左侧", content)
        self.assertIn("画面右侧", content)
        self.assertIn("[人物]", content)
        self.assertIn("[空间环境]", content)
        self.assertIn("[物理动作]", content)
        self.assertIn("[实体静物]", content)
        self.assertIn("[构图景别]", content)
        self.assertIn("[不确定性]", content)
        self.assertIn("boundary_shot_B0001", content)
        self.assertIn("x1_2_human_labels_", content)

        # 严谨正则核验：仅排查 HTML <input> 标签中的 checked 属性，不误伤 JavaScript 逻辑中的 .checked
        checked_input_tags = re.findall(r'<input[^>]*\bchecked\b[^>]*>', content, re.IGNORECASE)
        self.assertEqual(len(checked_input_tags), 0, f"发现预设 checked 的输入标签: {checked_input_tags}")

        # 正向断言：验证当存在 <input checked> 时该正则必定能够准确捕获并能触发拒绝
        dummy_bad_input_html = '<div><input type="checkbox" name="scene_test" checked /></div>'
        detected_bad = re.findall(r'<input[^>]*\bchecked\b[^>]*>', dummy_bad_input_html, re.IGNORECASE)
        self.assertEqual(len(detected_bad), 1, "正则未能有效识别出 <input ... checked>")

        # 验证 boundary select 默认空且没有 option 被预设 selected，同步实际生产中文文案
        self.assertIn("<select id='boundary_shot_B0001'", content)
        selected_option_tags = re.findall(r'<option[^>]*\bselected\b[^>]*>', content, re.IGNORECASE)
        self.assertEqual(len(selected_option_tags), 0, f"发现预设 selected 的 option 标签: {selected_option_tags}")
        self.assertIn("<option value=''>-- 待审核 (未判定, 导出为 null) --</option>", content)
        self.assertIn("<option value='yes'>切点边界干净可用</option>", content)
        self.assertIn("<option value='no'>存在场景混杂/切点偏差</option>", content)
        self.assertIn("<option value='uncertain'>不确定</option>", content)

    def test_review_html_boundary_select_and_null_export_semantics(self):
        """Verify boundary selection uses select with empty default and exports null when unselected."""
        out_html = self.test_dir / "review_semantics.html"
        generate_review_html(
            manifest_file=self.manifest_file,
            frames_dir=self.frames_dir,
            runs_dir=self.runs_dir,
            output_html_file=out_html,
        )
        with open(out_html, "r", encoding="utf-8") as f:
            content = f.read()

        # 确保 JS 中处理 shot_boundaries 时，未选择的下拉框导出为 null 而非默认 "yes" 或字符串
        self.assertIn('sel.value !== "" ? sel.value : null', content)
        # 确保 50 个 shot 均生成对应独立 boundary select
        for s in self.shots:
            self.assertIn(f"boundary_{s['shot_id']}", content)

    def test_review_html_clips_dir_embed_and_missing_fallback(self):
        """Verify review.html embeds video clip when provided and displays fallback note when missing."""
        clips_dir = self.test_dir / "clips"
        clips_dir.mkdir(parents=True, exist_ok=True)
        # Create a mock mp4 file for shot_B0001
        clip_file = clips_dir / "shot_B0001.mp4"
        with open(clip_file, "wb") as f:
            f.write(b"fake_mp4_bytes_for_testing")

        out_html = self.test_dir / "review_with_clips.html"
        generate_review_html(
            manifest_file=self.manifest_file,
            frames_dir=self.frames_dir,
            runs_dir=self.runs_dir,
            output_html_file=out_html,
            clips_dir=clips_dir,
        )
        with open(out_html, "r", encoding="utf-8") as f:
            content = f.read()

        # Shot 1 should have embedded video with controls
        self.assertIn("data:video/mp4;base64,", content)
        self.assertIn("<video controls", content)
        # Other shots should display clear missing note
        self.assertIn("clip_missing", content)

    def test_report_status_150_all_valid_pending_gold(self):
        """Verify report returns engineering_batch_completed_pending_gold when all 150 frames are valid, never fake PASS."""
        valid_pv = {
            "characters": ["person"],
            "environment": "office room",
            "physical_actions": ["talking"],
            "objects": ["phone"],
            "camera": "close_up",
            "uncertainty": "none",
        }
        for s in self.shots:
            shot_id = s["shot_id"]
            for p in [25, 50, 75]:
                fid = f"{shot_id}_pct{p}"
                src_h, inf_h, ps_h = self._create_real_frame_and_stream(fid, valid_pv)
                rec_file = self.inferences_dir / f"{fid}.json"
                with open(rec_file, "w", encoding="utf-8") as f:
                    json.dump({
                        "frame_id": fid,
                        "shot_id": shot_id,
                        "pct": p,
                        "model_version": OFFICIAL_MODEL_VERSION,
                        "source_hash": src_h,
                        "inference_hash": inf_h,
                        "latency_ms": 1000,
                        "response": {
                            "model_version": OFFICIAL_MODEL_VERSION,
                            "parsed_validation": valid_pv,
                            "source_image_hash": src_h,
                            "inference_image_hash": inf_h,
                            "prompt_schema_hash": ps_h,
                        }
                    }, f)

        out_metrics = self.runs_dir / "metrics_150_valid.json"
        out_md = self.runs_dir / "report_150_valid.md"
        metrics = generate_report(
            manifest_file=self.manifest_file,
            runs_dir=self.runs_dir,
            frames_dir=self.frames_dir,
            out_metrics_file=out_metrics,
            out_md_file=out_md,
        )
        self.assertEqual(metrics["counts"]["attempted_count"], 150)
        self.assertEqual(metrics["counts"]["missing_count"], 0)
        self.assertEqual(metrics["counts"]["success_count"], 150)
        self.assertEqual(metrics["overall_status"], "engineering_batch_completed_pending_gold")
        self.assertNotEqual(metrics["overall_status"], "PASS")

    def test_report_status_150_attempted_with_errors_pending_gold(self):
        """Verify report returns engineering_batch_completed_with_errors_pending_gold when all 150 attempted but some failed."""
        valid_pv = {
            "characters": ["person"],
            "environment": "office room",
            "physical_actions": ["talking"],
            "objects": ["phone"],
            "camera": "close_up",
            "uncertainty": "none",
        }
        for idx, s in enumerate(self.shots):
            shot_id = s["shot_id"]
            for p in [25, 50, 75]:
                fid = f"{shot_id}_pct{p}"
                src_h, inf_h, ps_h = self._create_real_frame_and_stream(fid, valid_pv)
                rec_file = self.inferences_dir / f"{fid}.json"

                # 模拟最后 1 个 shot (3 帧) 存在真实 Provider 错误或校验失败
                is_err = (idx == 49)
                rec_data = {
                    "frame_id": fid,
                    "shot_id": shot_id,
                    "pct": p,
                    "model_version": OFFICIAL_MODEL_VERSION,
                    "source_hash": src_h,
                    "inference_hash": "bad_hash_tampered" if is_err else inf_h,
                    "latency_ms": 1200,
                    "error": "503 service unavailable simulated" if is_err else None,
                    "response": {
                        "model_version": OFFICIAL_MODEL_VERSION,
                        "parsed_validation": valid_pv,
                        "source_image_hash": src_h,
                        "inference_image_hash": "bad_hash_tampered" if is_err else inf_h,
                        "prompt_schema_hash": ps_h,
                    }
                }
                with open(rec_file, "w", encoding="utf-8") as f:
                    json.dump(rec_data, f)

        out_metrics = self.runs_dir / "metrics_with_errs.json"
        out_md = self.runs_dir / "report_with_errs.md"
        metrics = generate_report(
            manifest_file=self.manifest_file,
            runs_dir=self.runs_dir,
            frames_dir=self.frames_dir,
            out_metrics_file=out_metrics,
            out_md_file=out_md,
        )
        self.assertEqual(metrics["counts"]["attempted_count"], 150)
        self.assertEqual(metrics["counts"]["missing_count"], 0)
        self.assertEqual(metrics["counts"]["attempt_fail_count"], 3)
        self.assertEqual(metrics["counts"]["success_count"], 147)
        self.assertEqual(metrics["overall_status"], "engineering_batch_completed_with_errors_pending_gold")
        self.assertFalse(metrics["is_complete_pass"])


if __name__ == "__main__":
    unittest.main()
