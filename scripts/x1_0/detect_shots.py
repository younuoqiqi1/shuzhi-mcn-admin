"""
算法 Shot 检测与 15-Shot 盲选清单生成模块
安全与规范约束:
1. 若已有 manifest_hash.txt 锁定记录，主入口禁止默默覆写已锁数据，必须显式保护;
2. 引入 setup_lifecycle_guard(55)，全局 55s 超时与子进程强制清理;
3. 严格隔离路径防护 (assert_safe_path);
4. 保持现有固化 Manifest 不变。
"""
import argparse
import atexit
import json
import os
import re
import signal
import subprocess
import sys
import time
from typing import List, Set

from scripts.x1_0.isolation_guard import assert_safe_path, ANON_MEDIA_ID
from scripts.x1_0.lifecycle import setup_lifecycle_guard, register_subprocess, unregister_subprocess
from scripts.x1_0.shot_sampler import ShotItem, compute_manifest_hash, sample_15_shots

def run_cmd_with_guard(cmd: List[str], timeout: int = 50) -> str:
    p = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        preexec_fn=os.setsid
    )
    register_subprocess(p)
    try:
        stdout, stderr = p.communicate(timeout=timeout)
        if p.returncode != 0:
            raise RuntimeError(f"命令执行失败 (code {p.returncode}): {stderr[:500]}")
        return stdout + "\n" + stderr
    except subprocess.TimeoutExpired:
        try:
            pgid = os.getpgid(p.pid)
            os.killpg(pgid, signal.SIGKILL)
            p.wait(timeout=2.0)
        except Exception:
            pass
        raise TimeoutError(f"命令超时 (> {timeout}s): {' '.join(cmd)}")
    finally:
        unregister_subprocess(p)

def detect_scenes_chunk(video_path: str, start_sec: float, duration: float) -> List[float]:
    assert_safe_path(video_path)
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec),
        "-t", str(duration),
        "-i", video_path,
        "-vf", "scale=320:180,select=gt(scene\\,0.38),showinfo",
        "-f", "null", "-"
    ]
    output = run_cmd_with_guard(cmd, timeout=45)
    cuts = []
    for line in output.splitlines():
        if "pts_time:" in line:
            m = re.search(r"pts_time:([0-9\.]+)", line)
            if m:
                cuts.append(round(start_sec + float(m.group(1)), 3))
    return cuts

def extract_shot_media(video_path: str, shot: ShotItem) -> None:
    assert_safe_path(video_path)
    s_dir = f"/private/tmp/x1_0/frames/{shot.shot_id}"
    os.makedirs(s_dir, exist_ok=True)
    dur = shot.duration

    for pct_name, pct_val in [("25", 0.25), ("50", 0.50), ("75", 0.75)]:
        out_jpg = f"{s_dir}/frame_{pct_name}.jpg"
        t_val = round(shot.start_sec + dur * pct_val, 3)
        frame_cmd = [
            "ffmpeg", "-y",
            "-ss", str(t_val),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            out_jpg
        ]
        run_cmd_with_guard(frame_cmd, timeout=12)

    out_wav = f"/private/tmp/x1_0/audio/{shot.shot_id}.wav"
    os.makedirs(os.path.dirname(out_wav), exist_ok=True)
    audio_cmd = [
        "ffmpeg", "-y",
        "-ss", str(shot.start_sec),
        "-t", str(dur),
        "-i", video_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        out_wav
    ]
    run_cmd_with_guard(audio_cmd, timeout=12)

def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser(description="分阶段原子化 Shot 检测与素材抽取工具 (<=55s/阶段)")
    parser.add_argument("--stage", type=str, choices=["detect", "finalize", "extract"], required=True,
                        help="执行阶段: detect(分块探测), finalize(汇总固化锁定), extract(单个素材抽取)")
    parser.add_argument("--chunk-index", type=int, choices=[0, 1, 2], default=None,
                        help="detect 阶段的分块索引 (0, 1, 2)")
    parser.add_argument("--shot-id", type=str, default=None,
                        help="extract 阶段抽取的单个 shot_id (如 shot_0010)")
    parser.add_argument("--video-path", type=str,
                        default="/Users/yoyotaozhou/Documents/video-moment-validation/data/input/qianfu_ep18.mp4",
                        help="输入源视频路径")
    args = parser.parse_args()

    assert_safe_path(args.video_path)

    hash_path = "benchmarks/x1/development/x1_0/manifest_hash.txt"
    manifest_path = "benchmarks/x1/development/x1_0/candidate_manifest.json"
    selected_path = "benchmarks/x1/development/x1_0/selected_15_shots.json"
    tmp_chunk_dir = "/private/tmp/x1_0"
    os.makedirs(tmp_chunk_dir, exist_ok=True)

    if args.stage == "detect":
        if args.chunk_index is None:
            print("错误: detect 阶段必须提供 --chunk-index (0, 1, 2)", file=sys.stderr)
            sys.exit(1)

        probe_cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            args.video_path
        ]
        dur_str = run_cmd_with_guard(probe_cmd, timeout=10).strip()
        total_duration = float(dur_str)
        chunk_size = total_duration / 3.0
        start_sec = args.chunk_index * chunk_size

        print(f"=== [Stage: detect] 正在探测 Chunk {args.chunk_index} ({start_sec:.2f}s - {start_sec + chunk_size:.2f}s) ===")
        cuts = detect_scenes_chunk(args.video_path, start_sec, chunk_size)
        out_chunk_file = f"{tmp_chunk_dir}/cut_chunk_{args.chunk_index}.json"
        with open(out_chunk_file, "w", encoding="utf-8") as f:
            json.dump({"chunk_index": args.chunk_index, "start_sec": start_sec, "duration": chunk_size, "cuts": cuts}, f, indent=2)
        print(f"Chunk {args.chunk_index} 探测完成，检出 {len(cuts)} 处切点，落盘至: {out_chunk_file}")

    elif args.stage == "finalize":
        print("=== [Stage: finalize] 汇总分块探测切点并固化锁定 Manifest ===")
        # 防覆写保护：若已有锁定，禁止覆写
        if os.path.exists(hash_path):
            print(f"[ManifestLock] 检测到已存在固化的 Manifest 锁文件 ({hash_path})，严禁覆写！安全退出。")
            sys.exit(0)

        probe_cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            args.video_path
        ]
        dur_str = run_cmd_with_guard(probe_cmd, timeout=10).strip()
        total_duration = float(dur_str)

        all_cuts = []
        for i in range(3):
            chunk_f = f"{tmp_chunk_dir}/cut_chunk_{i}.json"
            if not os.path.exists(chunk_f):
                print(f"错误: 缺少 Chunk {i} 结果: {chunk_f}，请先执行 --stage detect --chunk-index {i}", file=sys.stderr)
                sys.exit(1)
            with open(chunk_f, "r", encoding="utf-8") as f:
                c_data = json.load(f)
                all_cuts.extend(c_data.get("cuts", []))

        sorted_cuts = sorted(list(set(all_cuts)))
        raw_boundaries = [0.0] + sorted_cuts + [total_duration]

        shots: List[ShotItem] = []
        cur_start = raw_boundaries[0]
        shot_idx = 1
        for pt in raw_boundaries[1:]:
            if pt - cur_start >= 1.5:
                shots.append(ShotItem(shot_id=f"shot_{shot_idx:04d}", start_sec=cur_start, end_sec=pt))
                shot_idx += 1
                cur_start = pt

        manifest_dict = [s.to_dict() for s in shots]
        manifest_hash = compute_manifest_hash(shots)
        os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest_dict, f, indent=2, ensure_ascii=False)

        seed_val = 20261005
        with open(hash_path, "w", encoding="utf-8") as f:
            f.write(f"SEED={seed_val}\nMANIFEST_SHA256={manifest_hash}\nCANDIDATE_SHOT_COUNT={len(shots)}\nTOTAL_DURATION={total_duration}\n")

        selected_shots = sample_15_shots(shots, total_duration, seed=seed_val, shots_per_partition=5)
        with open(selected_path, "w", encoding="utf-8") as f:
            json.dump([s.to_dict() for s in selected_shots], f, indent=2, ensure_ascii=False)

        print(f"Manifest 固化完成！候选 Shot: {len(shots)}, 盲选 Shot: {len(selected_shots)}, Hash: {manifest_hash}")

    elif args.stage == "extract":
        if not args.shot_id:
            print("错误: extract 阶段必须提供 --shot-id (如 shot_0010)", file=sys.stderr)
            sys.exit(1)

        if not os.path.exists(selected_path):
            print(f"错误: 盲选清单不存在: {selected_path}", file=sys.stderr)
            sys.exit(1)

        with open(selected_path, "r", encoding="utf-8") as f:
            selected_list = json.load(f)

        target_shot = None
        for s in selected_list:
            if s["shot_id"] == args.shot_id:
                target_shot = ShotItem(s["shot_id"], s["start_sec"], s["end_sec"])
                break

        if not target_shot:
            print(f"错误: shot_id {args.shot_id} 未在盲选清单中找到", file=sys.stderr)
            sys.exit(1)

        print(f"=== [Stage: extract] 正在抽取 Shot {target_shot.shot_id} 帧 (25/50/75) 与音频 ===")
        extract_shot_media(args.video_path, target_shot)
        print(f"Shot {target_shot.shot_id} 素材抽取完成！")

if __name__ == "__main__":
    main()
