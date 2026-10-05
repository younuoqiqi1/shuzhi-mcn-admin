import pytest
import os
from scripts.x1_0.isolation_guard import assert_safe_path, SafePathViolationError

def test_forbidden_paths_rejected():
    forbidden_samples = [
        "PROGRESS.md",
        "docs/PROGRESS.md",
        "poc-revalidation-handoff.md",
        "docs/poc-revalidation-handoff.md",
        "reports/x0/report.md",
        "reports/audit/audit_summary.md",
        "audit/old_audit.json",
        "src/evidence/retrieval/foo.py",
        "src/perspective/bar.py",
        "src/director/test.py",
        "Topic/story.txt",
        "Requirements/gold.json",
        "Storyboards/board1.png",
        "gold/results.json",
        "handover.md",
    ]
    for p in forbidden_samples:
        with pytest.raises(SafePathViolationError):
            assert_safe_path(p)

def test_allowed_paths_accepted():
    allowed_samples = [
        "/Users/yoyotaozhou/Documents/video-moment-validation/data/input/qianfu_ep18.mp4",
        "scripts/x1_0/pipeline.py",
        "tests/x1_0/test_seed.py",
        "predictions/x1_0/pred.json",
        "/private/tmp/x1_0/cache.json",
    ]
    for p in allowed_samples:
        assert_safe_path(p)
