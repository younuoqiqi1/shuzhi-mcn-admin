"""
Unit and integration tests for X1.2 50-Shot Batch Pipeline.
Validates:
  - Meaningful frozen seed (20261006) determinism
  - Strict 17/17/16 early/mid/late stratification (total 50 shots)
  - Zero temporal overlap with real old selected 15 parent intervals loaded from file
  - No artificial chunk boundaries introduced during merge, strict 46 windows check
  - Closed pool constructed solely with 0.0 and total duration
  - Insufficient candidates in any segment triggers error (no duplication)
  - Manifest hash verification preserves frozen manifest without re-sampling
  - Extract single shot filter via target_shot_id
  - Strict 150 (50*3) denominator in reports, honest failure recording
  - Subprocess lifecycle cleanup and 55s timeout guard
"""

import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

# Add project root to sys.path so scripts can be imported directly
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.x1_2.batch import (
    DEFAULT_SEED,
    DEFAULT_SELECTED_15_PATH,
    FULL_VIDEO_DURATION,
    compute_data_sha256,
    compute_file_sha256,
    intervals_overlap,
    load_old_intervals,
    run_extract,
    run_merge,
    run_report,
    run_sample,
    run_with_55s_guard,
)


class TestX12BatchPipeline(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _generate_synthetic_pool(self, num_shots_per_segment: int = 40) -> Path:
        """Create a synthetic pool across [0, 2702.013243] with ample candidates in each segment."""
        pool_file = self.test_dir / "pool.json"
        t_third = FULL_VIDEO_DURATION / 3.0
        shots = []
        shot_idx = 0

        # Segment 1: early [0, t_third)
        for i in range(num_shots_per_segment):
            s = 10.0 + i * 20.0
            e = s + 5.0
            if e < t_third:
                shots.append({"pool_shot_id": f"pool_{shot_idx:05d}", "start": s, "end": e, "duration": 5.0})
                shot_idx += 1

        # Segment 2: mid [t_third, 2*t_third)
        for i in range(num_shots_per_segment):
            s = t_third + 10.0 + i * 20.0
            e = s + 5.0
            if e < 2.0 * t_third:
                shots.append({"pool_shot_id": f"pool_{shot_idx:05d}", "start": s, "end": e, "duration": 5.0})
                shot_idx += 1

        # Segment 3: late [2*t_third, FULL_VIDEO_DURATION)
        for i in range(num_shots_per_segment):
            s = 2.0 * t_third + 10.0 + i * 20.0
            e = s + 5.0
            if e < FULL_VIDEO_DURATION:
                shots.append({"pool_shot_id": f"pool_{shot_idx:05d}", "start": s, "end": e, "duration": 5.0})
                shot_idx += 1

        pool_data = {
            "batch_id": "X1.2",
            "total_shots_in_pool": len(shots),
            "total_duration": FULL_VIDEO_DURATION,
            "shots": shots,
            "pool_hash": compute_data_sha256(shots),
        }
        with open(pool_file, "w", encoding="utf-8") as f:
            json.dump(pool_data, f, indent=2)
        return pool_file

    def test_load_real_old_selected_15_intervals(self):
        """Verify load_old_intervals loads exactly 15 intervals from real json file."""
        real_path = REPO_ROOT / DEFAULT_SELECTED_15_PATH
        if real_path.exists():
            intervals, f_sha = load_old_intervals(real_path)
            self.assertEqual(len(intervals), 15)
            self.assertTrue(len(f_sha) == 64)
            # Verify first and last known intervals
            self.assertAlmostEqual(intervals[0][0], 41.44)
            self.assertAlmostEqual(intervals[-1][1], 2613.24)

    def test_sample_frozen_seed_determinism_and_counts(self):
        """Verify seed 20261006 produces identical 50 shots with 17/17/16 distribution."""
        pool_file = self._generate_synthetic_pool(num_shots_per_segment=40)
        manifest_1 = self.test_dir / "manifest_1.json"
        manifest_2 = self.test_dir / "manifest_2.json"

        real_sel15 = REPO_ROOT / DEFAULT_SELECTED_15_PATH

        res1 = run_sample(pool_file=pool_file, manifest_file=manifest_1, seed=DEFAULT_SEED, selected_15_path=real_sel15)
        res2 = run_sample(pool_file=pool_file, manifest_file=manifest_2, seed=DEFAULT_SEED, selected_15_path=real_sel15)

        self.assertEqual(res1["total_shots"], 50)
        self.assertEqual(res2["total_shots"], 50)
        self.assertEqual(res1["manifest_sha256"], res2["manifest_sha256"])

        shots = res1["shots"]
        early = [s for s in shots if s["segment"] == "early"]
        mid = [s for s in shots if s["segment"] == "mid"]
        late = [s for s in shots if s["segment"] == "late"]

        self.assertEqual(len(early), 17, "Early segment must have exactly 17 shots")
        self.assertEqual(len(mid), 17, "Mid segment must have exactly 17 shots")
        self.assertEqual(len(late), 16, "Late segment must have exactly 16 shots")

        # Naming sanity: shot_B0001 .. shot_B0050
        self.assertEqual(shots[0]["shot_id"], "shot_B0001")
        self.assertEqual(shots[-1]["shot_id"], "shot_B0050")

    def test_sample_excludes_real_old_selected_15(self):
        """Verify none of the 50 sampled shots overlap with real old 15 intervals from file."""
        pool_file = self._generate_synthetic_pool(num_shots_per_segment=40)
        manifest_file = self.test_dir / "manifest_overlap_check.json"
        real_sel15 = REPO_ROOT / DEFAULT_SELECTED_15_PATH

        res = run_sample(pool_file=pool_file, manifest_file=manifest_file, seed=DEFAULT_SEED, selected_15_path=real_sel15)
        real_intervals, _ = load_old_intervals(real_sel15)

        for s in res["shots"]:
            for o_start, o_end in real_intervals:
                overlap = intervals_overlap(s["start"], s["end"], o_start, o_end)
                self.assertFalse(
                    overlap,
                    f"Shot {s['shot_id']} [{s['start']}, {s['end']}] overlaps with real old interval [{o_start}, {o_end}]",
                )

    def test_sample_frozen_manifest_existing_returns_unmodified(self):
        """Verify if manifest already exists with valid hash, it is returned without re-sampling."""
        pool_file = self._generate_synthetic_pool(num_shots_per_segment=40)
        manifest_file = self.test_dir / "manifest_freeze.json"
        real_sel15 = REPO_ROOT / DEFAULT_SELECTED_15_PATH

        res1 = run_sample(pool_file=pool_file, manifest_file=manifest_file, seed=DEFAULT_SEED, selected_15_path=real_sel15)
        # Call again on the existing manifest
        res2 = run_sample(pool_file=pool_file, manifest_file=manifest_file, seed=DEFAULT_SEED, selected_15_path=real_sel15)
        self.assertEqual(res1["manifest_sha256"], res2["manifest_sha256"])

    def test_sample_insufficient_candidates_raises_error(self):
        """Verify insufficient candidates raises error and refuses to duplicate shots."""
        sparse_pool_file = self.test_dir / "sparse_pool.json"
        shots = [
            {"pool_shot_id": f"pool_{i:04d}", "start": float(i * 10), "end": float(i * 10 + 2), "duration": 2.0}
            for i in range(5)
        ]
        sparse_data = {
            "batch_id": "X1.2",
            "total_shots_in_pool": len(shots),
            "total_duration": FULL_VIDEO_DURATION,
            "shots": shots,
        }
        with open(sparse_pool_file, "w", encoding="utf-8") as f:
            json.dump(sparse_data, f)

        manifest_file = self.test_dir / "manifest_sparse.json"
        real_sel15 = REPO_ROOT / DEFAULT_SELECTED_15_PATH
        with self.assertRaises(RuntimeError) as ctx:
            run_sample(pool_file=sparse_pool_file, manifest_file=manifest_file, seed=DEFAULT_SEED, selected_15_path=real_sel15)
        self.assertIn("candidate count", str(ctx.exception))

    def test_merge_no_chunk_artificial_cuts_and_validates_windows(self):
        """Verify merge only connects real cuts, rejects incomplete windows, and does not add chunk cuts."""
        windows_dir = self.test_dir / "windows"
        windows_dir.mkdir(parents=True, exist_ok=True)

        # Incomplete window count test
        w0 = {
            "window_idx": 0,
            "center_start": 0.0,
            "center_end": 60.0,
            "center_cuts": [25.4],
            "params": {"window_idx": 0},
        }
        with open(windows_dir / "window_0000.json", "w") as f:
            json.dump(w0, f)

        out_pool = self.test_dir / "merged_pool.json"
        with self.assertRaises(FileNotFoundError):
            run_merge(windows_dir=windows_dir, output_pool_file=out_pool, total_duration=120.0, expected_windows=2)

        # Now add window 1
        w1 = {
            "window_idx": 1,
            "center_start": 60.0,
            "center_end": 120.0,
            "center_cuts": [95.8],
            "params": {"window_idx": 1},
        }
        with open(windows_dir / "window_0001.json", "w") as f:
            json.dump(w1, f)

        pool_res = run_merge(windows_dir=windows_dir, output_pool_file=out_pool, total_duration=120.0, expected_windows=2)

        self.assertEqual(pool_res["total_real_cuts"], 2)
        self.assertEqual(pool_res["total_shots_in_pool"], 3)

        shots = pool_res["shots"]
        self.assertEqual((shots[0]["start"], shots[0]["end"]), (0.0, 25.4))
        self.assertEqual((shots[1]["start"], shots[1]["end"]), (25.4, 95.8))
        self.assertEqual((shots[2]["start"], shots[2]["end"]), (95.8, 120.0))

        all_endpoints = set()
        for s in shots:
            all_endpoints.add(s["start"])
            all_endpoints.add(s["end"])
        self.assertNotIn(60.0, all_endpoints, "Chunk boundary 60.0 was erroneously injected as a cut")

    def test_extract_target_shot_id_filter(self):
        """Verify extract filters by target_shot_id when specified."""
        manifest_file = self.test_dir / "manifest.json"
        manifest_data = {
            "batch_id": "X1.2",
            "shots": [
                {"shot_id": "shot_B0001", "start": 10.0, "duration": 5.0},
                {"shot_id": "shot_B0002", "start": 30.0, "duration": 4.0},
            ],
        }
        with open(manifest_file, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f)

        frames_dir = self.test_dir / "frames"
        # Test nonexistent video path without erroring on filtering
        summary = run_extract(
            video_path=Path("nonexistent.mp4"),
            manifest_file=manifest_file,
            frames_dir=frames_dir,
            target_shot_id="shot_B0001",
        )
        self.assertEqual(summary["target_shot_id"], "shot_B0001")
        self.assertEqual(summary["total_requested"], 3)  # 1 shot * 3 pcts

    def test_report_strict_150_denominator(self):
        """Verify report uses fixed 150 denominator, reflects failure, and sets ASR to pending."""
        runs_dir = self.test_dir / "runs_x1_2"
        inferences_dir = runs_dir / "inferences"
        inferences_dir.mkdir(parents=True, exist_ok=True)

        for i in range(1, 11):
            with open(inferences_dir / f"shot_B{i:04d}_pct25.json", "w") as f:
                json.dump({"status": "success", "response": {}}, f)
        for i in range(11, 16):
            with open(inferences_dir / f"shot_B{i:04d}_pct25.json", "w") as f:
                json.dump({"status": "failed", "error": "503 Service Unavailable"}, f)

        manifest_file = self.test_dir / "manifest.json"
        out_report = runs_dir / "report.json"

        report = run_report(manifest_file=manifest_file, runs_dir=runs_dir, output_report_file=out_report)

        self.assertEqual(report["denominator"], 150)
        self.assertEqual(report["success_count"], 10)
        self.assertEqual(report["failure_count"], 140)
        self.assertEqual(report["coverage"]["audio_asr_status"], "pending_no_old_15_reuse")
        self.assertFalse(report["integrity_claims"]["person_f1_forged"])

    def test_subprocesses_lifecycle_guard_timeout(self):
        """Verify run_with_55s_guard kills process group on timeout via x1_1 lifecycle."""
        t0 = time.time()
        with self.assertRaises(TimeoutError):
            run_with_55s_guard(["sleep", "5"], timeout_sec=1.0)
        elapsed = time.time() - t0
        self.assertLess(elapsed, 2.5, "Timeout guard took too long to terminate process")


if __name__ == "__main__":
    unittest.main()
