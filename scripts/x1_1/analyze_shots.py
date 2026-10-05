"""
scripts/x1_1/analyze_shots.py
Shot 细粒度场景切分与欠切修复模块 (X1.1 真实 API 修正版)

修正点:
1. 修正 PySceneDetect StatsManager API: 使用真实的 stats_mgr.get_metrics(f_num, [keys])，严禁调用不存在的 get_metric;
2. 动态查询 ContentDetector 与 AdaptiveDetector 真实注册的 metric keys (如 content_val, adaptive_ratio)，严禁伪造常数分值;
3. 严格使用绝对时间秒数，严禁重复叠加 start_sec;
4. 阶段拆分 (detect / extract)，生成 5fps 真实 contactsheet 拼图;
5. 进程超时严格 killpg + wait 后才允许 unregister。
"""
import argparse
import json
import math
import os
import subprocess
import sys
import time
from typing import List, Dict, Any, Tuple
import cv2
import numpy as np

from scripts.x1_1.lifecycle import setup_lifecycle_guard, register_subprocess, unregister_subprocess, kill_and_wait_proc
from scripts.x1_1.isolation_guard import assert_safe_path

SELECTED_15_PATH = "benchmarks/x1/development/x1_0/selected_15_shots.json"
DEFAULT_VIDEO_PATH = "/Users/yoyotaozhou/Documents/video-moment-validation/data/input/qianfu_ep18.mp4"
TMP_DIR = "/private/tmp/x1_1"

def run_cmd_guarded(cmd: List[str], timeout: int = 50) -> Tuple[str, str]:
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
            raise RuntimeError(f"命令执行失败 (code {p.returncode}): {stderr[:400]}")
        return stdout, stderr
    except subprocess.TimeoutExpired:
        kill_and_wait_proc(p, timeout=2.0)
        raise TimeoutError(f"命令超时 (> {timeout}s): {' '.join(cmd)}")
    finally:
        kill_and_wait_proc(p, timeout=1.0)
        unregister_subprocess(p)

def detect_cuts_pyscenedetect(
    video_path: str,
    start_sec: float,
    end_sec: float
) -> Tuple[List[float], List[Dict[str, Any]]]:
    try:
        from scenedetect import SceneManager, open_video, ContentDetector, AdaptiveDetector, StatsManager
        video = open_video(video_path)
        fps = video.frame_rate

        stats_mgr = StatsManager()
        scene_mgr = SceneManager(stats_manager=stats_mgr)

        content_detector = ContentDetector(threshold=27.0, min_scene_len=3)
        adaptive_detector = AdaptiveDetector(adaptive_threshold=3.0, min_scene_len=3, min_content_val=27.0)
        scene_mgr.add_detector(content_detector)
        scene_mgr.add_detector(adaptive_detector)

        start_frame = int(round(start_sec * fps))
        end_frame = int(round(end_sec * fps))
        duration_frames = max(1, end_frame - start_frame)

        video.seek(start_frame)
        scene_mgr.detect_scenes(video=video, duration=duration_frames)
        scene_list = scene_mgr.get_scene_list()

        cuts = []
        for s in scene_list:
            # 真实绝对时间秒数，不重复加 start_sec！
            abs_cut = round(s[0].get_seconds(), 3)
            if start_sec + 0.12 < abs_cut < end_sec - 0.12:
                cuts.append(abs_cut)

        cuts = sorted(list(set(cuts)))

        # 动态获取实际注册的 metric key 列表
        c_keys = content_detector.get_metrics()
        a_keys = adaptive_detector.get_metrics()
        req_keys = list(set(c_keys + a_keys))

        scores = []
        for c in cuts:
            f_num = int(round(c * fps))
            # 真实 API: stats_mgr.get_metrics(frame_num, [keys]) 返回的是 list
            metric_vals = stats_mgr.get_metrics(f_num, req_keys)
            c_val = None
            a_val = None
            if metric_vals:
                metric_dict = dict(zip(req_keys, metric_vals)) if isinstance(metric_vals, (list, tuple)) else metric_vals
                c_val = metric_dict.get("content_val")
                for k in a_keys:
                    if k.startswith("adaptive_ratio"):
                        a_val = metric_dict.get(k)
                        break

            scores.append({
                "time_sec": c,
                "frame_num": f_num,
                "content_val": round(float(c_val), 4) if c_val is not None else "unknown",
                "adaptive_ratio": round(float(a_val), 4) if a_val is not None else "unknown",
            })
        return cuts, scores

    except ImportError:
        return detect_cuts_cv2_fallback(video_path, start_sec, end_sec)

def detect_cuts_cv2_fallback(
    video_path: str,
    start_sec: float,
    end_sec: float
) -> Tuple[List[float], List[Dict[str, Any]]]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"无法打开视频: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    start_frame = int(round(start_sec * fps))
    end_frame = int(round(end_sec * fps))

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    prev_hist = None
    cuts = []
    scores = []

    cur_f = start_frame
    try:
        while cur_f <= end_frame:
            ret, frame = cap.read()
            if not ret:
                break
            small = cv2.resize(frame, (160, 90))
            hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
            hist = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256])
            cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

            if prev_hist is not None:
                correl = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL)
                diff_score = 1.0 - correl
                abs_time = round(cur_f / fps, 3)

                if diff_score > 0.45 and (not cuts or (abs_time - cuts[-1] >= 0.12)):
                    if start_sec + 0.12 < abs_time < end_sec - 0.12:
                        cuts.append(abs_time)
                        scores.append({
                            "time_sec": abs_time,
                            "frame_num": cur_f,
                            "diff_score": round(float(diff_score), 4)
                        })
            prev_hist = hist
            cur_f += 1
    finally:
        cap.release()

    return cuts, scores

def build_children_shots(parent_id: str, start_sec: float, end_sec: float, cuts: List[float]) -> List[Dict[str, Any]]:
    boundaries = [start_sec] + [c for c in cuts if start_sec < c < end_sec] + [end_sec]
    boundaries = sorted(list(set([round(b, 3) for b in boundaries])))

    children = []
    for i in range(len(boundaries) - 1):
        c_start = boundaries[i]
        c_end = boundaries[i + 1]
        c_dur = round(c_end - c_start, 3)
        mid_sec = round(c_start + c_dur * 0.5, 3)
        end_sample = round(max(c_start, c_end - 0.04), 3) if c_dur >= 0.08 else round(c_end, 3)
        children.append({
            "child_id": f"{parent_id}_c{i+1:03d}",
            "parent_shot_id": parent_id,
            "start_sec": c_start,
            "end_sec": c_end,
            "duration": c_dur,
            "review_frames": {
                "start": round(c_start, 3),
                "mid": mid_sec,
                "end": end_sample,
            },
            "review_frame_indices": {
                "start_sec": round(c_start, 3),
                "mid_sec": mid_sec,
                "end_sec": round(c_end, 3),
            },
        })
    return children

def verify_coverage(start_sec: float, end_sec: float, children: List[Dict[str, Any]]) -> bool:
    if not children:
        return False
    if abs(children[0]["start_sec"] - start_sec) > 0.05:
        return False
    if abs(children[-1]["end_sec"] - end_sec) > 0.05:
        return False
    for i in range(len(children) - 1):
        if abs(children[i]["end_sec"] - children[i+1]["start_sec"]) > 0.05:
            return False
    return True

def generate_5fps_contactsheet(
    video_path: str,
    start_sec: float,
    duration: float,
    out_img_path: str,
    thumbs_per_page: int = 40
) -> Dict[str, Any]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {
            "page_paths": [],
            "page_count": 0,
            "total_sampled_frames": 0,
            "total_decoded_frames": 0,
            "coverage_start_sec": None,
            "coverage_end_sec": None,
            "coverage_duration_sec": 0.0,
            "full_interval_covered": False,
            "fps": 0.0,
            "step_frames": 0,
        }

    sampled_thumbs = []
    cur_offset = 0
    fps = 25.0
    step = 5
    start_frame = 0
    total_frames = 0

    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        start_frame = int(round(start_sec * fps))
        total_frames = int(round(duration * fps))
        step = max(1, int(round(fps / 5.0)))

        # 仅在初始时定位到母区间起始帧，随后全区间顺序连续 decode 采样，严禁每帧 seek 成本
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        while cur_offset < total_frames:
            ret, frame = cap.read()
            if not ret:
                break
            if cur_offset % step == 0:
                f_idx = start_frame + cur_offset
                t_sec = round(f_idx / fps, 2)
                thumb = cv2.resize(frame, (160, 90))
                cv2.putText(thumb, f"{t_sec}s", (5, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)
                sampled_thumbs.append({
                    "thumb": thumb,
                    "time_sec": t_sec,
                    "frame_idx": f_idx,
                })
            cur_offset += 1
    finally:
        # 无论正常解码完毕或出现异常，均在 finally 中释放视频句柄资源
        cap.release()

    base_dir = os.path.dirname(out_img_path)
    if base_dir:
        os.makedirs(base_dir, exist_ok=True)
    base_name = os.path.basename(out_img_path)
    stem, ext = os.path.splitext(base_name)
    if not ext:
        ext = ".jpg"

    cols = 5
    blank_thumb = np.zeros((90, 160, 3), dtype=np.uint8)
    page_paths = []

    total_sampled = len(sampled_thumbs)
    total_pages = math.ceil(total_sampled / thumbs_per_page) if total_sampled > 0 else 0

    # 分页每 40 图生成一张 *_p001.jpg 等，不要合成超大纵图
    for p_idx in range(total_pages):
        page_num = p_idx + 1
        page_filename = f"{stem}_p{page_num:03d}{ext}"
        page_out_path = os.path.join(base_dir, page_filename)

        p_items = sampled_thumbs[p_idx * thumbs_per_page : (p_idx + 1) * thumbs_per_page]
        p_thumbs = [item["thumb"] for item in p_items]

        rows = math.ceil(len(p_thumbs) / cols)
        row_imgs = []
        for r in range(rows):
            r_slice = p_thumbs[r * cols : (r + 1) * cols]
            while len(r_slice) < cols:
                r_slice.append(blank_thumb)
            row_imgs.append(np.hstack(r_slice))

        if row_imgs:
            page_img = np.vstack(row_imgs)
            cv2.imwrite(page_out_path, page_img)
            page_paths.append(page_out_path)

    # 兼容性同步: 若生成了分页，将第一页同步至原始 out_img_path，兼容单图路径调用且绝非超大纵图
    if page_paths and out_img_path != page_paths[0]:
        try:
            import shutil
            shutil.copyfile(page_paths[0], out_img_path)
        except Exception:
            pass

    if sampled_thumbs:
        cov_start_sec = sampled_thumbs[0]["time_sec"]
        cov_end_sec = sampled_thumbs[-1]["time_sec"]
        cov_dur = round(cov_end_sec - cov_start_sec, 3)
        expected_end = round(start_sec + duration, 3)
        cycle_sec = step / fps
        full_covered = (
            abs(cov_start_sec - start_sec) <= cycle_sec + 0.05 and
            (expected_end - cov_end_sec) <= cycle_sec + 0.05
        )
    else:
        cov_start_sec = None
        cov_end_sec = None
        cov_dur = 0.0
        full_covered = False

    return {
        "page_paths": page_paths,
        "page_count": len(page_paths),
        "total_sampled_frames": total_sampled,
        "total_decoded_frames": cur_offset,
        "coverage_start_sec": cov_start_sec,
        "coverage_end_sec": cov_end_sec,
        "coverage_duration_sec": cov_dur,
        "full_interval_covered": full_covered,
        "fps": round(float(fps), 3),
        "step_frames": step,
    }

def extract_single_child_media(video_path: str, child: Dict[str, Any], out_root: str):
    c_id = child["child_id"]
    c_dir = os.path.join(out_root, "children_frames", c_id)
    os.makedirs(c_dir, exist_ok=True)
    dur = child.get("duration", 0.0)

    # 抽取阶段单 child 三帧 (start/mid/end) 审核索引继续复用
    review_frames = child.get("review_frames")
    if not review_frames:
        c_start = child["start_sec"]
        c_end = child["end_sec"]
        review_frames = {
            "start": round(c_start, 3),
            "mid": round(c_start + dur * 0.5, 3),
            "end": round(max(c_start, c_end - 0.04), 3) if dur >= 0.08 else round(c_end, 3),
        }

    for tag, t in review_frames.items():
        out_jpg = os.path.join(c_dir, f"frame_{tag}.jpg")
        cmd = [
            "ffmpeg", "-y", "-ss", str(t), "-i", video_path,
            "-vframes", "1", "-q:v", "2", out_jpg
        ]
        run_cmd_guarded(cmd, timeout=12)

def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser(description="X1.1 场景细切分与素材抽取原子工具 (<=55s/阶段)")
    parser.add_argument("--stage", type=str, required=True, choices=["detect", "extract"], help="执行阶段: detect 或 extract")
    parser.add_argument("--parent-id", type=str, required=True, help="母区间 ID (如 shot_0055)")
    parser.add_argument("--child-id", type=str, default=None, help="extract 阶段抽取的单个子 Shot ID (如 shot_0055_c001)")
    parser.add_argument("--video-path", type=str, default=DEFAULT_VIDEO_PATH, help="视频路径")
    parser.add_argument("--out-dir", type=str, default="benchmarks/x1/predictions/x1_1", help="输出目录")
    args = parser.parse_args()

    assert_safe_path(args.video_path)
    assert_safe_path(args.out_dir)

    with open(SELECTED_15_PATH, "r", encoding="utf-8") as f:
        selected_15 = json.load(f)

    target_parent = next((s for s in selected_15 if s["shot_id"] == args.parent_id), None)
    if not target_parent:
        print(f"错误: parent_id '{args.parent_id}' 不在 X1.0 锁定的 15 个母区间中", file=sys.stderr)
        sys.exit(1)

    p_start = target_parent["start_sec"]
    p_end = target_parent["end_sec"]
    p_dur = target_parent["duration"]
    diag_file = os.path.join(args.out_dir, f"shots_{args.parent_id}_diagnostics.json")

    if args.stage == "detect":
        print(f"=== [Stage: detect] 母区间: {args.parent_id} [{p_start}s - {p_end}s, {p_dur}s] ===")
        cuts, scores = detect_cuts_pyscenedetect(args.video_path, p_start, p_end)
        children = build_children_shots(args.parent_id, p_start, p_end, cuts)
        coverage_ok = verify_coverage(p_start, p_end, children)

        cs_path = os.path.join(TMP_DIR, "contact_sheets", f"{args.parent_id}_5fps.jpg")
        cs_result = generate_5fps_contactsheet(args.video_path, p_start, p_dur, cs_path)

        os.makedirs(args.out_dir, exist_ok=True)
        diag = {
            "parent_shot_id": args.parent_id,
            "parent_start_sec": p_start,
            "parent_end_sec": p_end,
            "parent_duration": p_dur,
            "parameters": {
                "content_threshold": 27.0,
                "adaptive_threshold": 3.0,
                "min_content_val": 27.0,
                "min_scene_len_frames": 3,
                "no_1_5s_forced_merge": True,
                "no_forced_max_duration_split": True,
                "no_manual_or_plot_cuts": True,
            },
            "cuts": cuts,
            "cuts_scores": scores,
            "scores_sampled": scores[:25],
            "children_count": len(children),
            "children": children,
            "coverage_verified": coverage_ok,
            "full_interval_coverage": {
                "verified": coverage_ok and (cs_result.get("full_interval_covered", False) if cs_result else False),
                "parent_start_sec": p_start,
                "parent_end_sec": p_end,
                "contact_sheet_pages": cs_result.get("page_paths", []) if cs_result else [],
                "contact_sheet_coverage_start_sec": cs_result.get("coverage_start_sec") if cs_result else None,
                "contact_sheet_coverage_end_sec": cs_result.get("coverage_end_sec") if cs_result else None,
                "contact_sheet_coverage_duration_sec": cs_result.get("coverage_duration_sec", 0.0) if cs_result else 0.0,
                "total_sampled_frames": cs_result.get("total_sampled_frames", 0) if cs_result else 0,
                "total_pages": cs_result.get("page_count", 0) if cs_result else 0,
            },
            "contact_sheet_path": (cs_result.get("page_paths") or [cs_path])[0] if cs_result else cs_path,
            "contact_sheet_pages": cs_result.get("page_paths", []) if cs_result else [],
            "raw_diagnostics_notes": (
                "阈值 27.0 是 ContentDetector 默认阈值对齐到 AdaptiveDetector 的显式配置 (AdaptiveDetector 原生默认 min_content_val 为 15.0)，"
                "保持通用镜头检测阈值统一以消除固定机位双人镜头下局部人物运动导致的虚假硬切，未用人工Gold特定调参；"
                "未来人工 usable rate 仍待人工审核判定。"
            ),
        }
        with open(diag_file, "w", encoding="utf-8") as f:
            json.dump(diag, f, indent=2, ensure_ascii=False)
        print(f"探测完成！检出切点: {len(cuts)} 处, 子 Shot: {len(children)} 个, Coverage: {'PASS' if coverage_ok else 'FAIL'}")
        print(f"ContactSheet 分页生成: {cs_result.get('page_count', 0)} 页, 总采样: {cs_result.get('total_sampled_frames', 0)} 帧")
        for p in cs_result.get("page_paths", []):
            print(f"  - Page: {p}")

    elif args.stage == "extract":
        if not os.path.exists(diag_file):
            print(f"错误: 请先执行 --stage detect 生成诊断文件: {diag_file}", file=sys.stderr)
            sys.exit(1)
        with open(diag_file, "r", encoding="utf-8") as f:
            diag = json.load(f)
        children = diag.get("children", [])

        if args.child_id:
            target_child = next((c for c in children if c["child_id"] == args.child_id), None)
            if not target_child:
                print(f"错误: 未找到 child_id '{args.child_id}'", file=sys.stderr)
                sys.exit(1)
            print(f"=== [Stage: extract] 抽取单个子 Shot: {args.child_id} ===")
            extract_single_child_media(args.video_path, target_child, TMP_DIR)
        else:
            print(f"=== [Stage: extract] 抽取前 3 个子 Shot 代表帧 ===")
            for c in children[:3]:
                extract_single_child_media(args.video_path, c, TMP_DIR)
        print("抽取完成！")

if __name__ == "__main__":
    main()
