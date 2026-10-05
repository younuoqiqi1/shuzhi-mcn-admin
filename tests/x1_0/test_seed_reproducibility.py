import pytest
import math
from scripts.x1_0.shot_sampler import sample_15_shots, ShotItem

def _create_mock_manifest(total_duration=2700.0, shot_len=10.0):
    shots = []
    t = 0.0
    idx = 0
    while t + shot_len <= total_duration:
        shots.append(ShotItem(shot_id=f"shot_{idx:04d}", start_sec=t, end_sec=t + shot_len))
        t += shot_len
        idx += 1
    return shots

def test_seed_reproducibility():
    manifest = _create_mock_manifest()
    seed = 42
    
    selected_1 = sample_15_shots(manifest, total_duration=2700.0, seed=seed)
    selected_2 = sample_15_shots(manifest, total_duration=2700.0, seed=seed)
    
    assert len(selected_1) == 15
    assert len(selected_2) == 15
    assert [s.shot_id for s in selected_1] == [s.shot_id for s in selected_2]

def test_three_partitions_distribution():
    manifest = _create_mock_manifest(total_duration=2700.0, shot_len=10.0)
    selected = sample_15_shots(manifest, total_duration=2700.0, seed=2026)
    
    # Check 5 from front [0, 900), 5 from middle [900, 1800), 5 from rear [1800, 2700]
    p1 = [s for s in selected if s.start_sec < 900.0]
    p2 = [s for s in selected if 900.0 <= s.start_sec < 1800.0]
    p3 = [s for s in selected if 1800.0 <= s.start_sec]
    
    assert len(p1) == 5
    assert len(p2) == 5
    assert len(p3) == 5

def test_out_of_bounds_rejection():
    manifest = _create_mock_manifest(total_duration=2700.0, shot_len=10.0)
    
    # Negative duration or empty manifest
    with pytest.raises(ValueError):
        sample_15_shots(manifest, total_duration=-100.0, seed=42)
    with pytest.raises(ValueError):
        sample_15_shots([], total_duration=2700.0, seed=42)
    with pytest.raises(ValueError):
        # Manifest does not have enough shots to sample 5 per partition
        sample_15_shots(manifest[:5], total_duration=2700.0, seed=42)

def test_negative_time_rejected():
    manifest = _create_mock_manifest()
    with pytest.raises(ValueError, match="负时间|negative"):
        manifest.append(ShotItem(shot_id="shot_bad_1", start_sec=-5.0, end_sec=5.0))
        sample_15_shots(manifest, total_duration=2700.0, seed=42)

def test_exceeding_duration_rejected():
    manifest = _create_mock_manifest()
    manifest.append(ShotItem(shot_id="shot_bad_2", start_sec=2690.0, end_sec=2800.0))
    with pytest.raises(ValueError, match="超出|exceed"):
        sample_15_shots(manifest, total_duration=2700.0, seed=42)

def test_duplicate_shot_ids_rejected():
    manifest = _create_mock_manifest()
    # 插入重复 ID
    manifest.append(ShotItem(shot_id=manifest[0].shot_id, start_sec=50.0, end_sec=60.0))
    with pytest.raises(ValueError, match="重复|duplicate"):
        sample_15_shots(manifest, total_duration=2700.0, seed=42)

def test_nan_or_inf_rejected():
    manifest = _create_mock_manifest()
    with pytest.raises(ValueError, match="NaN|Inf|无穷|有限数值"):
        manifest.append(ShotItem(shot_id="shot_nan", start_sec=float("nan"), end_sec=10.0))
        sample_15_shots(manifest, total_duration=2700.0, seed=42)

    manifest2 = _create_mock_manifest()
    with pytest.raises(ValueError, match="NaN|Inf|无穷|有限数值"):
        manifest2.append(ShotItem(shot_id="shot_inf", start_sec=10.0, end_sec=float("inf")))
        sample_15_shots(manifest2, total_duration=2700.0, seed=42)
