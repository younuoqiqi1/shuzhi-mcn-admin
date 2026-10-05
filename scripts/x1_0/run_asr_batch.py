"""
15-Shot 纯 ASR 独立批处理模块 (<= 55s 独立任务)
基于本地已下载的 whisper-tiny 模型 (/private/tmp/x1_0/models/whisper-tiny)。
保留原始词级时间戳、原声 provenance、相对/绝对时间。
落盘至 benchmarks/x1/predictions/x1_0/asr_results.json。
"""
import atexit
import json
import os
import signal
import sys
import time

from scripts.x1_0.asr_pipeline import run_asr_on_shot
from scripts.x1_0.isolation_guard import assert_safe_path
from scripts.x1_0.lifecycle import setup_lifecycle_guard

def run_asr_batch():
    setup_lifecycle_guard(55)

    selected_file = "benchmarks/x1/development/x1_0/selected_15_shots.json"
    assert_safe_path(selected_file)
    if not os.path.exists(selected_file):
        print(f"错误: 盲选清单不存在: {selected_file}", file=sys.stderr)
        sys.exit(1)

    with open(selected_file, "r", encoding="utf-8") as f:
        shots = json.load(f)

    local_model = "/private/tmp/x1_0/models/whisper-tiny"
    assert_safe_path(local_model)
    if not os.path.isdir(local_model):
        print(f"错误: 本地 ASR 模型不存在: {local_model}，缺模型严禁模拟！", file=sys.stderr)
        sys.exit(1)

    print(f"=== 开始 15-Shot 真实 ASR 语音识别 (本地权重: {local_model}) ===")
    t0 = time.time()

    asr_results = {}
    for idx, s in enumerate(shots, 1):
        shot_id = s["shot_id"]
        start_sec = s["start_sec"]
        audio_path = f"/private/tmp/x1_0/audio/{shot_id}.wav"

        t_shot = time.time()
        try:
            res = run_asr_on_shot(
                audio_path=audio_path,
                shot_start_sec=start_sec,
                model_name=local_model
            )
            asr_results[shot_id] = res
            shot_elapsed = round(time.time() - t_shot, 3)
            print(f"[{idx}/15] {shot_id}: 状态=success, 文本='{res['text']}', 词段数={len(res['segments'])}, 耗时={shot_elapsed}s")
        except Exception as e:
            shot_elapsed = round(time.time() - t_shot, 3)
            asr_results[shot_id] = {
                "status": "error",
                "error": str(e),
                "text": "",
                "segments": [],
                "provenance": "raw_audio",
                "elapsed_sec": shot_elapsed
            }
            print(f"[{idx}/15] {shot_id}: 状态=error ({e}), 耗时={shot_elapsed}s")

    total_elapsed = round(time.time() - t0, 3)
    print(f"=== ASR 批处理完成！总耗时: {total_elapsed}s ===")

    out_dir = "benchmarks/x1/predictions/x1_0"
    os.makedirs(out_dir, exist_ok=True)
    out_file = f"{out_dir}/asr_results.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(asr_results, f, indent=2, ensure_ascii=False)

    print(f"ASR 识别结果已落盘至: {out_file}")

if __name__ == "__main__":
    run_asr_batch()
