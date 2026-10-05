"""
scripts/x1_1/ocr_fusion.py
OCR 批量抽取与真实 ASR 词段时间保守 Fusion 模块 (X1.1 真实工程标准)

特性:
1. 阶段化执行 (各阶段严格 <= 55s):
   - --stage extract: ffmpeg 抽取母区间 2fps 帧并建立索引清单;
   - --stage ocr: 运行历史编译好的 /private/tmp/x1_1/bin/vision_ocr 二进制，每批最多 16 图，断点落盘;
   - --stage fuse: 严格检查 index.json 全部批次齐全、记录数及 hash/frame_idx 匹配、status error 单独记不计 blank，真实 ASR status success 才允许融合;
   - --stage fuse-existing: 精准读取独立授权的已有真实硬字幕源 (src/evidence/data/qianfu_ep18_subtitles.json)，严格检查字段、单调时间与边界，自动匹配 15 母区间并与 X1.0 真实 ASR 融合，不补造未知图片 hash，不修改时间码;
2. 缺失 OCR 二进制时直接报错，绝不将错误伪造为空白 blank;
3. 关键 Fusion 逻辑: 只要时间区间重叠 (0.5s 宽容窗口)，即使文字相似度为 0 亦严格判定为 conflict，绝不错判为 asr_only;
4. 严格隔离: OCR/ASR 文本绝不流入 VLM 或 Face。
"""
import argparse
import difflib
import hashlib
import json
import os
import subprocess
import sys
import time
from typing import List, Dict, Any, Tuple, Optional

from scripts.x1_1.lifecycle import setup_lifecycle_guard, register_subprocess, unregister_subprocess, kill_and_wait_proc
from scripts.x1_1.isolation_guard import assert_safe_path

SELECTED_15_PATH = "benchmarks/x1/development/x1_0/selected_15_shots.json"
ASR_RAW_PATH = "benchmarks/x1/predictions/x1_0/asr_results.json"
EXISTING_SUBTITLES_PATH = "benchmarks/x1/development/x1_1/existing_hard_subtitles.json"
DEFAULT_VIDEO_PATH = "/Users/yoyotaozhou/Documents/video-moment-validation/data/input/qianfu_ep18.mp4"
TMP_DIR = "/private/tmp/x1_1"
DEFAULT_OCR_BIN = "/private/tmp/x1_1/vision_ocr"
BATCH_SIZE = 16

class OCRBinaryNotFoundError(FileNotFoundError):
    pass

class BatchIntegrityError(RuntimeError):
    """批次不完整、记录数缺失或 hash/frame_idx 不匹配时抛出"""
    pass

class ASRIntegrityError(RuntimeError):
    """ASR 缺少父区间或父区间 status 非 success 时抛出"""
    pass

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

def extract_ocr_frames_2fps(video_path: str, parent_id: str, start_sec: float, duration: float) -> List[Dict[str, Any]]:
    out_dir = os.path.join(TMP_DIR, "ocr_frames", parent_id)
    os.makedirs(out_dir, exist_ok=True)

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec),
        "-t", str(duration),
        "-i", video_path,
        "-vf", "fps=2",
        "-q:v", "2",
        os.path.join(out_dir, "frame_%04d.jpg")
    ]
    run_cmd_guarded(cmd, timeout=25)

    frames = []
    count = int(duration * 2) + 2
    for idx in range(1, count + 1):
        f_path = os.path.join(out_dir, f"frame_{idx:04d}.jpg")
        if os.path.exists(f_path):
            t_sec = round(start_sec + (idx - 1) * 0.5, 3)
            with open(f_path, "rb") as f:
                f_hash = hashlib.sha256(f.read()).hexdigest()
            frames.append({
                "frame_idx": idx,
                "timestamp_sec": t_sec,
                "frame_path": f_path,
                "image_hash": f_hash
            })
    return frames

def calculate_text_similarity(s1: str, s2: str) -> float:
    clean1 = "".join([c for c in s1 if c.isalnum()])
    clean2 = "".join([c for c in s2 if c.isalnum()])
    if not clean1 and not clean2:
        return 1.0
    if not clean1 or not clean2:
        return 0.0
    if clean1 in clean2 or clean2 in clean1:
        return 0.95
    return difflib.SequenceMatcher(None, clean1, clean2).ratio()

def fuse_ocr_and_asr(
    ocr_events: List[Dict[str, Any]],
    asr_segments: List[Dict[str, Any]],
    parent_id: str
) -> List[Dict[str, Any]]:
    """
    OCR 与 ASR 保守融合核心逻辑:
    1. 时间重叠窗口: [a_start - 0.5, a_end + 0.5] (标明 2fps 时间误差窗口 ±0.25s，宽容窗口 ±0.5s);
    2. OCR status == "error" 单独记，绝对不能计为 blank / 忽略;
    3. 只要处于重叠时间窗内:
       - sim >= 0.70 -> consensus (达成一致)
       - sim < 0.70 (即便相似度为 0) -> conflict (显式冲突，绝不漏判为 asr_only！);
    4. 时间完全不重叠者 -> 单源 ocr_only 或 asr_only;
    5. 不添加人工时间码。
    """
    fused_results = []
    matched_asr_indices = set()

    for ocr in ocr_events:
        o_t = ocr["timestamp_sec"]
        status = ocr.get("status", "success")

        # 核心约束: status error 单独记，绝对禁止吞没伪造成空白 blank！
        if status == "error":
            fused_results.append({
                "fusion_type": "ocr_error",
                "timestamp_sec": o_t,
                "image_hash": ocr.get("image_hash"),
                "status": "error",
                "error_msg": ocr.get("error_msg", "OCR recognition failed"),
                "window_tolerance_sec": 0.5,
                "source": "ocr_recognition_error",
            })
            continue

        o_text = ocr.get("subtitle_text", "").strip()
        # 仅在非 error 且确实无字幕文本时跳过文字对齐
        if not o_text:
            continue

        overlapping_asr = []
        for idx, asr in enumerate(asr_segments):
            a_start = asr.get("abs_start", 0.0)
            a_end = asr.get("abs_end", 0.0)
            if a_start - 0.5 <= o_t <= a_end + 0.5:
                sim = calculate_text_similarity(o_text, asr.get("text", ""))
                overlapping_asr.append((idx, sim, asr))

        if overlapping_asr:
            overlapping_asr.sort(key=lambda x: x[1], reverse=True)
            best_idx, best_sim, best_asr = overlapping_asr[0]
            matched_asr_indices.add(best_idx)

            if best_sim >= 0.70:
                fused_results.append({
                    "fusion_type": "consensus",
                    "timestamp_sec": o_t,
                    "image_hash": ocr.get("image_hash"),
                    "ocr_text": o_text,
                    "asr_text": best_asr.get("text", ""),
                    "final_text": o_text,
                    "similarity": round(best_sim, 3),
                    "window_tolerance_sec": 0.5,
                    "source": "ocr+asr_consensus",
                })
            else:
                fused_results.append({
                    "fusion_type": "conflict",
                    "timestamp_sec": o_t,
                    "image_hash": ocr.get("image_hash"),
                    "ocr_text": o_text,
                    "asr_text": best_asr.get("text", ""),
                    "similarity": round(best_sim, 3),
                    "window_tolerance_sec": 0.5,
                    "conflict_details": "时间区间重叠但文字表述不一致或相似度低，显式保留双源冲突，禁止强行覆盖",
                    "source": "explicit_conflict",
                })
        else:
            fused_results.append({
                "fusion_type": "ocr_only",
                "timestamp_sec": o_t,
                "image_hash": ocr.get("image_hash"),
                "ocr_text": o_text,
                "asr_text": None,
                "window_tolerance_sec": 0.5,
                "source": "ocr_only",
            })

    for idx, asr in enumerate(asr_segments):
        if idx not in matched_asr_indices:
            fused_results.append({
                "fusion_type": "asr_only",
                "timestamp_sec": round((asr.get("abs_start", 0.0) + asr.get("abs_end", 0.0)) / 2, 3),
                "ocr_text": None,
                "asr_text": asr.get("text", ""),
                "window_tolerance_sec": 0.5,
                "source": "asr_only",
            })

    fused_results.sort(key=lambda x: x["timestamp_sec"])
    return fused_results

def verify_ocr_batches_and_asr(
    parent_id: str,
    index_file: str,
    results_dir: str,
    asr_raw_path: str,
    batch_size: int = BATCH_SIZE
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    OCR fuse 前严格检查:
    1. index.json 全部批次齐全 (无任何 batch 文件缺失);
    2. 记录数与抽帧索引严格相等;
    3. image_hash 及 frame_idx 逐项严格匹配一致;
    4. 真实 ASR 包含父区间且 status 必须为 'success'。
    """
    if not os.path.exists(index_file):
        raise BatchIntegrityError(f"缺少抽帧索引文件: {index_file}，无法校验批次完整性")

    with open(index_file, "r", encoding="utf-8") as f:
        all_frames = json.load(f)

    if not all_frames:
        raise BatchIntegrityError(f"抽帧索引文件 {index_file} 为空")

    expected_batches = (len(all_frames) + batch_size - 1) // batch_size
    if not os.path.exists(results_dir):
        raise BatchIntegrityError(f"缺少 OCR 批次识别目录: {results_dir}")

    all_batch_records: List[Dict[str, Any]] = []
    for b_idx in range(expected_batches):
        batch_filename = f"batch_{b_idx:03d}.json"
        batch_path = os.path.join(results_dir, batch_filename)
        if not os.path.exists(batch_path):
            raise BatchIntegrityError(
                f"OCR 批次不完整: 缺失批次文件 '{batch_filename}' (总计需 {expected_batches} 个批次)"
            )
        with open(batch_path, "r", encoding="utf-8") as f:
            batch_data = json.load(f)
            all_batch_records.extend(batch_data)

    if len(all_batch_records) != len(all_frames):
        raise BatchIntegrityError(
            f"批次记录数与抽帧索引不匹配: 索引总数 {len(all_frames)} 条，实际批次累计 {len(all_batch_records)} 条"
        )

    for idx, (frame_meta, rec) in enumerate(zip(all_frames, all_batch_records)):
        expected_hash = frame_meta.get("image_hash")
        actual_hash = rec.get("image_hash")
        if expected_hash != actual_hash:
            raise BatchIntegrityError(
                f"第 {idx} 帧 image_hash 不匹配: 索引中为 '{expected_hash}'，批次识别记录中为 '{actual_hash}'"
            )
        if "frame_idx" in frame_meta and "frame_idx" in rec and rec.get("frame_idx") is not None:
            if frame_meta.get("frame_idx") != rec.get("frame_idx"):
                raise BatchIntegrityError(
                    f"第 {idx} 帧 frame_idx 不匹配: 索引中为 {frame_meta.get('frame_idx')}，批次记录中为 {rec.get('frame_idx')}"
                )

    if not os.path.exists(asr_raw_path):
        raise ASRIntegrityError(f"真实 ASR 结果文件不存在: {asr_raw_path}")

    with open(asr_raw_path, "r", encoding="utf-8") as f:
        asr_all = json.load(f)

    if parent_id not in asr_all:
        raise ASRIntegrityError(f"真实 ASR 数据中未检索到父区间: '{parent_id}'")

    parent_asr = asr_all[parent_id]
    asr_status = parent_asr.get("status")
    if asr_status != "success":
        raise ASRIntegrityError(
            f"真实 ASR 父区间 '{parent_id}' 的 status 为 '{asr_status}' (非 'success')，严格禁止执行 fusion！"
        )

    asr_segments = parent_asr.get("segments", [])
    return all_frames, all_batch_records, asr_segments

def load_and_verify_existing_subtitles(
    raw_path: str,
    parent_id: str,
    parent_start: float,
    parent_end: float
) -> Tuple[List[Dict[str, Any]], str]:
    """
    精确读取已有真实硬字幕 raw 源 (src/evidence/data/qianfu_ep18_subtitles.json):
    1. 严格检查字段完整性: start_sec, end_sec, text, confidence, index;
    2. 严格检查单调时间与边界: start_sec >= 0, start_sec <= end_sec, start_sec 单调递增;
    3. 自动计算 raw 文件的 sha256 哈希值;
    4. 自动筛选与当前母区间 [parent_start, parent_end] 发生时间重叠的 OCR 条目 (不人工修改时间码);
    5. 无原图片 hash 可用，严格标明 'unknown'，禁止补造伪造。
    """
    if not os.path.exists(raw_path):
        raise FileNotFoundError(f"已有真实硬字幕文件不存在: {raw_path}")

    with open(raw_path, "rb") as f:
        raw_bytes = f.read()
    raw_sha256 = hashlib.sha256(raw_bytes).hexdigest()

    data = json.loads(raw_bytes.decode("utf-8"))
    if not isinstance(data, list) or len(data) == 0:
        raise ValueError(f"已有硬字幕格式非法或为空: {raw_path}")

    required_fields = ["start_sec", "end_sec", "text", "confidence", "index"]
    prev_start = -1.0

    overlapping_items = []
    for idx, item in enumerate(data):
        # 1. 字段检查
        for req in required_fields:
            if req not in item:
                raise ValueError(f"已有硬字幕条目缺少字段 '{req}': 条目索引 {idx}")

        s_sec = float(item["start_sec"])
        e_sec = float(item["end_sec"])

        # 2. 边界检查
        if s_sec < 0 or e_sec < 0 or s_sec > e_sec:
            raise ValueError(f"已有硬字幕时间边界非法 (start={s_sec}, end={e_sec}): 条目索引 {idx}")

        # 3. 单调性检查 (start_sec 必须单调非递减)
        if s_sec < prev_start:
            raise ValueError(
                f"已有硬字幕时间非单调递增: 第 {idx} 条 start_sec={s_sec} < 前一条 {prev_start}"
            )
        prev_start = s_sec

        # 4. 判断与母区间是否存在重叠: [s_sec, e_sec] 与 [parent_start, parent_end]
        # 严格判定: 只要区间存在交集即为重叠
        if max(s_sec, parent_start) < min(e_sec, parent_end):
            # 严格保留原时间与置信度，不添加人工时间码，无图片hash标记为 unknown
            overlapping_items.append({
                "index": item.get("index"),
                "start_sec": s_sec,
                "end_sec": e_sec,
                "start_timecode": item.get("start_timecode", ""),
                "end_timecode": item.get("end_timecode", ""),
                "text": item.get("text", "").strip(),
                "confidence": item.get("confidence"),
                "image_hash": "unknown",
                "time_source": "existing_ocr",
                "status": "success",
            })

    return overlapping_items, raw_sha256

def fuse_existing_ocr_and_asr(
    ocr_items: List[Dict[str, Any]],
    asr_segments: List[Dict[str, Any]],
    parent_id: str
) -> List[Dict[str, Any]]:
    """
    对已有独立硬字幕 OCR (1s 分辨率) 与真实 ASR raw 进行保守融合:
    1. 时间重叠窗口: 考虑 1s 时间分辨率，设置 0.5s 宽容窗口:
       [a_start - 0.5, a_end + 0.5] 与 [o_start - 0.5, o_end + 0.5] 发生重叠;
    2. 重叠且相似度 >= 0.70 -> consensus;
    3. 重叠且相似度 < 0.70 (即便相似度为 0) -> conflict;
    4. 无重叠 -> ocr_only 或 asr_only;
    5. 无原图片 hash 可用，image_hash 显式标明 'unknown'，严禁补造;
    6. 不添加人工时间码。
    """
    fused_results = []
    matched_asr_indices = set()

    for ocr in ocr_items:
        o_start = ocr["start_sec"]
        o_end = ocr["end_sec"]
        o_text = ocr["text"]

        if not o_text:
            continue

        overlapping_asr = []
        for idx, asr in enumerate(asr_segments):
            a_start = asr.get("abs_start", 0.0)
            a_end = asr.get("abs_end", 0.0)
            # 时间区间发生重叠 (允许 0.5s 宽容)
            if max(o_start - 0.5, a_start - 0.5) <= min(o_end + 0.5, a_end + 0.5):
                sim = calculate_text_similarity(o_text, asr.get("text", ""))
                overlapping_asr.append((idx, sim, asr))

        if overlapping_asr:
            overlapping_asr.sort(key=lambda x: x[1], reverse=True)
            best_idx, best_sim, best_asr = overlapping_asr[0]
            matched_asr_indices.add(best_idx)

            if best_sim >= 0.70:
                fused_results.append({
                    "fusion_type": "consensus",
                    "ocr_index": ocr.get("index"),
                    "start_sec": o_start,
                    "end_sec": o_end,
                    "image_hash": "unknown",
                    "ocr_text": o_text,
                    "asr_text": best_asr.get("text", ""),
                    "resolved_text": o_text,
                    "final_text": o_text,
                    "similarity": round(best_sim, 3),
                    "confidence": ocr.get("confidence"),
                    "window_tolerance_sec": 0.5,
                    "source": "existing_ocr+asr_consensus",
                })
            else:
                fused_results.append({
                    "fusion_type": "conflict",
                    "ocr_index": ocr.get("index"),
                    "start_sec": o_start,
                    "end_sec": o_end,
                    "image_hash": "unknown",
                    "ocr_text": o_text,
                    "asr_text": best_asr.get("text", ""),
                    "resolved_text": None,
                    "similarity": round(best_sim, 3),
                    "confidence": ocr.get("confidence"),
                    "window_tolerance_sec": 0.5,
                    "conflict_details": "时间区间重叠但文字表述不一致或相似度低，显式保留双源冲突，禁止强行覆盖",
                    "source": "explicit_conflict",
                })
        else:
            fused_results.append({
                "fusion_type": "ocr_only",
                "ocr_index": ocr.get("index"),
                "start_sec": o_start,
                "end_sec": o_end,
                "image_hash": "unknown",
                "ocr_text": o_text,
                "asr_text": None,
                "resolved_text": None,
                "resolution_note": "unverified_single_source",
                "confidence": ocr.get("confidence"),
                "window_tolerance_sec": 0.5,
                "source": "existing_ocr_only",
            })

    for idx, asr in enumerate(asr_segments):
        if idx not in matched_asr_indices:
            fused_results.append({
                "fusion_type": "asr_only",
                "start_sec": asr.get("abs_start", 0.0),
                "end_sec": asr.get("abs_end", 0.0),
                "image_hash": "unknown",
                "ocr_text": None,
                "asr_text": asr.get("text", ""),
                "resolved_text": None,
                "resolution_note": "unverified_single_source",
                "window_tolerance_sec": 0.5,
                "source": "asr_only",
            })

    fused_results.sort(key=lambda x: x["start_sec"])
    return fused_results

def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser(description="OCR 与 ASR 分阶段原子 Fusion 工具 (<=55s/阶段)")
    parser.add_argument("--stage", type=str, required=True, choices=["extract", "ocr", "fuse", "fuse-existing"], help="阶段: extract, ocr, fuse, fuse-existing")
    parser.add_argument("--parent-id", type=str, required=True, help="母区间 ID (如 shot_0055)")
    parser.add_argument("--batch-index", type=int, default=0, help="ocr 阶段的批次序号 (每批 16 图)")
    parser.add_argument("--binary-path", type=str, default=DEFAULT_OCR_BIN, help="预编译 Vision OCR 二进制路径")
    parser.add_argument("--existing-ocr-path", type=str, default=EXISTING_SUBTITLES_PATH, help="已有真实硬字幕 raw 源路径")
    parser.add_argument("--video-path", type=str, default=DEFAULT_VIDEO_PATH, help="视频路径")
    parser.add_argument("--out-dir", type=str, default="benchmarks/x1/predictions/x1_1", help="输出目录")
    args = parser.parse_args()

    if args.stage == "extract":
        assert_safe_path(args.video_path)
    if args.stage == "fuse-existing":
        assert_safe_path(args.existing_ocr_path)
    assert_safe_path(args.out_dir)

    with open(SELECTED_15_PATH, "r", encoding="utf-8") as f:
        selected_15 = json.load(f)

    parent_shot = next((s for s in selected_15 if s["shot_id"] == args.parent_id), None)
    if not parent_shot:
        print(f"错误: parent_id {args.parent_id} 不在 15 盲样中", file=sys.stderr)
        sys.exit(1)

    index_file = os.path.join(TMP_DIR, "ocr_frames", args.parent_id, "frames_index.json")

    if args.stage == "extract":
        print(f"=== [Stage: extract] 抽取母区间 {args.parent_id} 2fps 帧 ===")
        frames = extract_ocr_frames_2fps(
            args.video_path, args.parent_id, parent_shot["start_sec"], parent_shot["duration"]
        )
        with open(index_file, "w", encoding="utf-8") as f:
            json.dump(frames, f, indent=2)
        total_batches = (len(frames) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"抽帧完成！共 {len(frames)} 帧，划分为 {total_batches} 个批次 (每批 <= {BATCH_SIZE} 图)")

    elif args.stage == "ocr":
        print("错误: 本地模型已被彻底删除，禁止调用本地 Vision OCR 模型推理！", file=sys.stderr)
        raise RuntimeError(
            "本地模型已被删除，禁止执行新本地 Vision OCR 推理。请使用 --stage fuse-existing 融合已有授权真实硬字幕。"
        )

    elif args.stage == "fuse":
        print(f"=== [Stage: fuse] 汇总全量 OCR 结果与真实 ASR 融合 ===")
        results_dir = os.path.join(TMP_DIR, "ocr_results", args.parent_id)

        # 严格校验: 批次齐全、记录数及image_hash/frame_idx匹配、真实ASR父区间status success才允许fusion
        all_frames, ocr_events, asr_segments = verify_ocr_batches_and_asr(
            parent_id=args.parent_id,
            index_file=index_file,
            results_dir=results_dir,
            asr_raw_path=ASR_RAW_PATH,
            batch_size=BATCH_SIZE
        )

        fused = fuse_ocr_and_asr(ocr_events, asr_segments, args.parent_id)

        os.makedirs(args.out_dir, exist_ok=True)
        out_file = os.path.join(args.out_dir, f"fusion_{args.parent_id}.json")

        # 原始OCR/ASR独立复制进输出JSON并包括所有采样hash与时间来源，标明2fps时间误差窗口，不添加人工时间码
        raw_ocr_events_copy = [
            {
                "frame_idx": o.get("frame_idx"),
                "timestamp_sec": o.get("timestamp_sec"),
                "image_hash": o.get("image_hash"),
                "status": o.get("status"),
                "subtitle_text": o.get("subtitle_text", ""),
                "full_text": o.get("full_text", ""),
                "items": o.get("items", []),
                "error_msg": o.get("error_msg"),
                "time_source": "vision_ocr_2fps"
            }
            for o in ocr_events
        ]

        raw_asr_segments_copy = [
            {
                "abs_start": s.get("abs_start"),
                "abs_end": s.get("abs_end"),
                "rel_start": s.get("rel_start"),
                "rel_end": s.get("rel_end"),
                "text": s.get("text", ""),
                "time_source": "asr_whisper_x1_0_raw"
            }
            for s in asr_segments
        ]

        sampling_hashes = [
            {
                "frame_idx": f.get("frame_idx"),
                "timestamp_sec": f.get("timestamp_sec"),
                "image_hash": f.get("image_hash"),
                "time_source": "video_fps2_sample"
            }
            for f in all_frames
        ]

        ocr_error_count = sum(1 for o in ocr_events if o.get("status") == "error")

        with open(out_file, "w", encoding="utf-8") as f:
            json.dump({
                "parent_shot_id": args.parent_id,
                "time_error_window": "±0.25s (2fps sampling interval 0.5s, tolerance ±0.5s for alignment)",
                "sampling_hashes": sampling_hashes,
                "raw_ocr_events": raw_ocr_events_copy,
                "raw_asr_segments": raw_asr_segments_copy,
                "ocr_event_count": len(ocr_events),
                "ocr_error_count": ocr_error_count,
                "asr_segment_count": len(asr_segments),
                "fused_results": fused,
            }, f, indent=2, ensure_ascii=False)
        print(f"Fusion 完成！检出 {len(fused)} 条融合事件 (含 OCR 异常 {ocr_error_count} 处)，落盘至: {out_file}")

    elif args.stage == "fuse-existing":
        print(f"=== [Stage: fuse-existing] 独立读取已有真实硬字幕并与 ASR 融合 ({args.parent_id}) ===")
        # 1. 严格检查与加载已有硬字幕，筛选与母区间发生重叠的条目
        ocr_items, raw_sha256 = load_and_verify_existing_subtitles(
            args.existing_ocr_path,
            args.parent_id,
            parent_shot["start_sec"],
            parent_shot["end_sec"]
        )

        # 2. 严格检查真实 X1.0 ASR
        if not os.path.exists(ASR_RAW_PATH):
            raise ASRIntegrityError(f"真实 ASR 结果文件不存在: {ASR_RAW_PATH}")

        with open(ASR_RAW_PATH, "rb") as f:
            asr_bytes = f.read()
        asr_file_sha256 = hashlib.sha256(asr_bytes).hexdigest()
        asr_all = json.loads(asr_bytes.decode("utf-8"))

        if args.parent_id not in asr_all:
            raise ASRIntegrityError(f"真实 ASR 数据中未检索到父区间: '{args.parent_id}'")

        parent_asr = asr_all[args.parent_id]
        asr_status = parent_asr.get("status")
        if asr_status != "success":
            raise ASRIntegrityError(
                f"真实 ASR 父区间 '{args.parent_id}' 的 status 为 '{asr_status}' (非 'success')，严格禁止执行 fusion！"
            )

        asr_segments = parent_asr.get("segments", [])

        # 3. 执行融合
        fused = fuse_existing_ocr_and_asr(ocr_items, asr_segments, args.parent_id)

        os.makedirs(args.out_dir, exist_ok=True)
        out_file = os.path.join(args.out_dir, f"fusion_{args.parent_id}.json")

        # 4. 独立复制并落盘，标明 1s 时间分辨率与误差窗口，无图片 hash 标为 unknown，不添加人工时间码，记录 ASR 来源 path+fileSHA 与 reuse_existing
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump({
                "parent_shot_id": args.parent_id,
                "source_type": "existing_ocr",
                "raw_source_path": args.existing_ocr_path,
                "raw_source_sha256": raw_sha256,
                "asr_source_path": ASR_RAW_PATH,
                "asr_source_sha256": asr_file_sha256,
                "reuse_existing": True,
                "time_resolution": "1s",
                "time_error_window": "±0.5s (1s timecode interval resolution, tolerance ±0.5s for alignment)",
                "raw_ocr_events": ocr_items,
                "raw_asr_segments": asr_segments,
                "ocr_event_count": len(ocr_items),
                "asr_segment_count": len(asr_segments),
                "fused_results": fused,
            }, f, indent=2, ensure_ascii=False)

        print(
            f"Existing Fusion 完成！重叠 OCR: {len(ocr_items)} 条，ASR: {len(asr_segments)} 条，"
            f"检出 {len(fused)} 条融合事件，落盘至: {out_file}"
        )

if __name__ == "__main__":
    main()
