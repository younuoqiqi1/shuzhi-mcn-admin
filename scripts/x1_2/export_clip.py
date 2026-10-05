#!/usr/bin/env python3
"""
scripts/x1_2/export_clip.py
X1.2 单 Shot 视频片段切片导出工具 (人工质检与音频核对专用)

核心设计与合规要求:
1. 目的与隔离: 仅用于导出指定单个 shot_id 的轻量 MP4 视频切片，供人工审核员在质检看板中
   直观核对 PySceneDetect 镜头切点边界是否干净，以及收听音频对白；
2. 严禁自动化: 此切片绝不作为输入传递给任何 VLM 模型推理，亦不生成任何伪造的 Gold 真值；
3. 生命周期安全: 全局受控于 scripts.x1_1.lifecycle.setup_lifecycle_guard(55)，
   每个 ffmpeg 进程必须执行 register_subprocess，并在 finally 块中通过 kill_and_wait_proc
   彻底终止，绝不泄漏孤儿后台进程；
4. 标准转码参数:
   ffmpeg -y -ss {start} -t {duration} -i {source} -vf scale=640:-2
          -c:v libx264 -preset veryfast -crf 28 -threads 2
          -c:a aac -b:a 64k -movflags +faststart {out_path}
5. 默认输出路径: /private/tmp/x1_2/clips/{shot_id}.mp4
"""

import argparse
import hashlib
import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Add project root to sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.x1_1.lifecycle import (
    setup_lifecycle_guard,
    register_subprocess,
    unregister_subprocess,
    kill_and_wait_proc,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("x1_2_export_clip")

DEFAULT_MANIFEST_PATH = REPO_ROOT / "benchmarks/x1/runs/x1_2/manifest.json"
DEFAULT_OUT_DIR = Path("/private/tmp/x1_2/clips")


def compute_file_sha256(filepath: Path) -> Optional[str]:
    if not filepath.exists() or not filepath.is_file():
        return None
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def export_single_clip(
    shot_id: str,
    manifest_file: Path,
    source_video: Path,
    out_dir: Path = DEFAULT_OUT_DIR,
    timeout_sec: float = 50.0,
) -> Dict[str, Any]:
    """Export single lightweight mp4 clip for human boundary review and audio verification.
    Guarded by x1_1 lifecycle process registry and timeout <= 55s.
    """
    if not manifest_file.exists():
        # Fallback check for development manifest
        dev_manifest = REPO_ROOT / "benchmarks/x1/development/x1_2/manifest.json"
        if dev_manifest.exists():
            manifest_file = dev_manifest
        else:
            raise FileNotFoundError(f"Frozen manifest not found: {manifest_file}")

    if not source_video.exists():
        raise FileNotFoundError(f"Source video not found: {source_video}")

    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    shots = manifest.get("shots", [])
    target_shot = None
    for s in shots:
        if s.get("shot_id") == shot_id:
            target_shot = s
            break

    if not target_shot:
        raise ValueError(f"Shot '{shot_id}' not found in frozen manifest: {manifest_file}")

    start_sec = float(target_shot.get("start", 0.0))
    duration_sec = float(target_shot.get("duration", target_shot.get("end", start_sec) - start_sec))

    if duration_sec <= 0:
        raise ValueError(f"Invalid duration {duration_sec} for shot '{shot_id}'")

    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{shot_id}.mp4"

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", f"{start_sec:.4f}",
        "-t", f"{duration_sec:.4f}",
        "-i", str(source_video),
        "-vf", "scale=640:-2",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "28",
        "-threads", "2",
        "-c:a", "aac",
        "-b:a", "64k",
        "-movflags", "+faststart",
        str(out_file),
    ]

    logger.info("Exporting clip for %s (start=%.3fs, dur=%.3fs) -> %s", shot_id, start_sec, duration_sec, out_file)
    proc = None
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        register_subprocess(proc)
        stdout, stderr = proc.communicate(timeout=timeout_sec)
        if proc.returncode != 0:
            err_msg = stderr.decode("utf-8", errors="replace")[-500:]
            raise RuntimeError(f"FFmpeg failed with code {proc.returncode}: {err_msg}")
    except subprocess.TimeoutExpired:
        if proc:
            kill_and_wait_proc(proc)
        raise TimeoutError(f"FFmpeg export timed out after {timeout_sec}s for {shot_id}")
    finally:
        if proc:
            kill_and_wait_proc(proc)
            unregister_subprocess(proc)

    if not out_file.exists() or out_file.stat().st_size == 0:
        raise RuntimeError(f"Exported clip is missing or empty: {out_file}")

    clip_sha = compute_file_sha256(out_file)
    logger.info("Successfully exported clip %s (size=%d bytes, sha256=%s)", out_file.name, out_file.stat().st_size, clip_sha[:8])

    return {
        "shot_id": shot_id,
        "start": start_sec,
        "duration": duration_sec,
        "out_file": str(out_file),
        "file_size_bytes": out_file.stat().st_size,
        "clip_sha256": clip_sha,
        "usage": "human_boundary_and_audio_review_only",
    }


def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser(description="Export single shot MP4 clip for human boundary review")
    parser.add_argument("--shot-id", type=str, required=True, help="Target shot ID (e.g. shot_B0001)")
    parser.add_argument(
        "--manifest-file",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help="Path to frozen manifest.json",
    )
    parser.add_argument(
        "--source-video",
        type=Path,
        default=Path(os.environ.get("SHUZHI_VIDEO_PATH", "video.mp4")),
        help="Path to source full video",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help="Output directory for clips",
    )

    args = parser.parse_args()

    result = export_single_clip(
        shot_id=args.shot_id,
        manifest_file=args.manifest_file,
        source_video=args.source_video,
        out_dir=args.out_dir,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
