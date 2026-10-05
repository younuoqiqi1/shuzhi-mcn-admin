"""
真实 ASR 语音识别管道 (mlx-whisper)
保存完整词段 word_timestamps、原始 words、no_speech_prob、相对与绝对时间。
保留原声文本 provenance，绝不用于身份/VLM 映射。
支持本地模型目录路径与官方 repo 标识。
"""
import os
import time
from typing import Dict, Any, List

from scripts.x1_0.isolation_guard import assert_safe_path

def run_asr_on_shot(
    audio_path: str,
    shot_start_sec: float = 0.0,
    model_name: str = "/private/tmp/x1_0/models/whisper-tiny"
) -> Dict[str, Any]:
    assert_safe_path(audio_path)
    assert_safe_path(model_name)
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"音频文件不存在: {audio_path}")

    # 验证是否为合法已下载的本地模型路径或已知合法 repo
    is_local_dir = os.path.isdir(model_name)
    valid_prefixes = ["mlx-community/whisper-", "openai/whisper-"]
    is_valid_repo = any(model_name.startswith(p) for p in valid_prefixes)

    if not (is_local_dir or is_valid_repo):
        raise ValueError(f"未知或非法的 ASR 模型路径/名称: '{model_name}'。缺模型严禁模拟！")

    import mlx_whisper

    t0 = time.time()
    try:
        result = mlx_whisper.transcribe(
            audio_path,
            path_or_hf_repo=model_name,
            language="zh",
            word_timestamps=True
        )
    except Exception as e:
        raise RuntimeError(f"MLX Whisper 转录执行失败: {e}")
    elapsed = time.time() - t0

    segments_detailed = []
    for s in result.get("segments", []):
        rel_start = round(float(s.get("start", 0.0)), 3)
        rel_end = round(float(s.get("end", 0.0)), 3)
        abs_start = round(shot_start_sec + rel_start, 3)
        abs_end = round(shot_start_sec + rel_end, 3)
        
        words_detail = []
        for w in s.get("words", []):
            w_rel_start = round(float(w.get("start", 0.0)), 3)
            w_rel_end = round(float(w.get("end", 0.0)), 3)
            words_detail.append({
                "word": w.get("word", ""),
                "rel_start": w_rel_start,
                "rel_end": w_rel_end,
                "abs_start": round(shot_start_sec + w_rel_start, 3),
                "abs_end": round(shot_start_sec + w_rel_end, 3),
                "probability": round(float(w.get("probability", 1.0)), 4) if "probability" in w else None
            })

        segments_detailed.append({
            "rel_start": rel_start,
            "rel_end": rel_end,
            "abs_start": abs_start,
            "abs_end": abs_end,
            "text": s.get("text", "").strip(),
            "no_speech_prob": round(float(s.get("no_speech_prob", 0.0)), 4) if "no_speech_prob" in s else None,
            "words": words_detail
        })

    return {
        "text": result.get("text", "").strip(),
        "segments": segments_detailed,
        "provenance": "raw_audio",
        "model": model_name,
        "elapsed_sec": round(elapsed, 3),
        "status": "success",
        "raw_response": result
    }
