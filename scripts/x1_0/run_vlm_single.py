"""
单 Shot VLM 独立推理模块 (<= 55s 保护)
使用本地 Qwen2-VL-2B-Instruct-4bit (/private/tmp/x1_0/models/Qwen2-VL-2B-Instruct-4bit)。
对指定 Shot 的三帧 (frame_25, frame_50, frame_75) 进行真实逐帧纯客观推理并列保存。
输出到 benchmarks/x1/predictions/x1_0/vlm_shots/{shot_id}.json。
"""
import argparse
import atexit
import json
import os
import signal
import sys
import time

from scripts.x1_0.vlm_pipeline import run_vlm_on_shot
from scripts.x1_0.isolation_guard import assert_safe_path
from scripts.x1_0.lifecycle import setup_lifecycle_guard

def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser()
    parser.add_argument("--shot-id", type=str, required=True)
    parser.add_argument("--model-path", type=str, default="/private/tmp/x1_0/models/Qwen2-VL-2B-Instruct-4bit")
    args = parser.parse_args()

    assert_safe_path(args.model_path)
    shot_id = args.shot_id
    frames_dir = f"/private/tmp/x1_0/frames/{shot_id}"
    assert_safe_path(frames_dir)
    frame_files = [
        f"{frames_dir}/frame_25.jpg",
        f"{frames_dir}/frame_50.jpg",
        f"{frames_dir}/frame_75.jpg"
    ]

    for f in frame_files:
        if not os.path.exists(f):
            print(f"错误: 帧文件缺失: {f}", file=sys.stderr)
            sys.exit(1)

    print(f"=== 开始 Shot {shot_id} 三帧真实 VLM 推理 ===")
    t0 = time.time()
    try:
        vlm_res = run_vlm_on_shot(
            frames=frame_files,
            model_name=args.model_path
        )
    except Exception as e:
        vlm_res = {
            "model": args.model_path,
            "status": "error",
            "error": str(e),
            "frames_observation": {}
        }

    elapsed = round(time.time() - t0, 3)
    print(f"Shot {shot_id} VLM 推理完成，耗时: {elapsed}s，总体状态: {vlm_res.get('status')}")

    out_dir = "benchmarks/x1/predictions/x1_0/vlm_shots"
    os.makedirs(out_dir, exist_ok=True)
    out_file = f"{out_dir}/{shot_id}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(vlm_res, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    main()
