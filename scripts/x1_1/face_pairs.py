"""
scripts/x1_1/face_pairs.py
真实 YuNet + SFace 人脸检测、128D Embedding 与跨 Shot 匿名 Pair 生成模块 (X1.1 真实标准)

核心特性:
1. 保护已有生成结果: 若 benchmarks/x1/predictions/x1_1/face_pairs_anonymous.json 已存在，默认保护不重跑/不改动 pairID，防止人工标签漂移;
2. 真实 ONNX 权重加载与 128D SFace 归一化特征提取;
3. 隐藏内部分值，留空 human_label;
4. 独立校准逻辑交由 calibrate_face.py 严格执行。
"""
import argparse
import hashlib
import json
import math
import os
import random
import sys
import time
from typing import List, Dict, Any, Tuple, Optional
import cv2
import numpy as np

from scripts.x1_1.lifecycle import setup_lifecycle_guard
from scripts.x1_1.isolation_guard import assert_safe_path

TMP_DIR = "/private/tmp/x1_1"
SELECTED_15_PATH = "benchmarks/x1/development/x1_0/selected_15_shots.json"
PAIRS_OUTPUT_PATH = "benchmarks/x1/predictions/x1_1/face_pairs_anonymous.json"

class FaceWeightsNotFoundError(FileNotFoundError):
    pass

def resolve_model_weights() -> Tuple[str, str]:
    yunet_candidates = [
        os.environ.get("YUNET_PATH", ""),
        "/private/tmp/x1_0/models/face_detection_yunet_2023mar.onnx",
        "/private/tmp/x1_1/models/face_detection_yunet_2023mar.onnx",
        "/private/tmp/x1_0/models/face_detection_yunet.onnx",
        "/Users/yoyotaozhou/.gemini/antigravity-cli/models/face_detection_yunet_2023mar.onnx",
    ]
    sface_candidates = [
        os.environ.get("SFACE_PATH", ""),
        "/private/tmp/x1_0/models/face_recognition_sface_2021dec.onnx",
        "/private/tmp/x1_1/models/face_recognition_sface_2021dec.onnx",
        "/private/tmp/x1_0/models/face_recognition_sface.onnx",
        "/Users/yoyotaozhou/.gemini/antigravity-cli/models/face_recognition_sface_2021dec.onnx",
    ]
    yunet_path = next((p for p in yunet_candidates if p and os.path.exists(p)), None)
    sface_path = next((p for p in sface_candidates if p and os.path.exists(p)), None)

    if not yunet_path or not sface_path:
        raise FaceWeightsNotFoundError(
            f"未找到真实 YuNet/SFace ONNX 权重！\n"
            f"YuNet: {yunet_path}\n"
            f"SFace: {sface_path}\n"
            f"请将模型放置于 /private/tmp/x1_0/models/ 或配置环境变量 YUNET_PATH / SFACE_PATH，严禁任何降级伪造！"
        )
    return yunet_path, sface_path

def compute_cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return max(-1.0, min(1.0, dot / (norm1 * norm2)))

def extract_faces_from_anchor_frames(frames_dir: str) -> List[Dict[str, Any]]:
    yunet_path, sface_path = resolve_model_weights()
    recognizer = cv2.FaceRecognizerSF.create(sface_path, "")

    crops_dir = os.path.join(TMP_DIR, "face_crops")
    os.makedirs(crops_dir, exist_ok=True)

    with open(SELECTED_15_PATH, "r", encoding="utf-8") as f:
        selected_15 = json.load(f)

    detected_faces = []
    face_idx = 1

    for s in selected_15:
        s_id = s["shot_id"]
        for pct in ["25", "50", "75"]:
            cands = [
                os.path.join(frames_dir, s_id, f"frame_{pct}.jpg"),
                os.path.join("/private/tmp/x1_0/frames", s_id, f"frame_{pct}.jpg"),
                os.path.join("/private/tmp/x1_1/frames", s_id, f"frame_{pct}.jpg"),
            ]
            frame_path = next((c for c in cands if os.path.exists(c)), None)
            if not frame_path:
                continue

            img = cv2.imread(frame_path)
            if img is None:
                continue

            h, w = img.shape[:2]
            detector = cv2.FaceDetectorYN.create(
                yunet_path, "", (w, h),
                score_threshold=0.6,
                nms_threshold=0.3,
                top_k=5000
            )

            _, faces = detector.detect(img)
            if faces is None:
                continue

            for face in faces:
                bx, by, bw, bh = map(int, face[:4])
                conf = float(face[-1])
                bx = max(0, bx)
                by = max(0, by)
                bw = min(w - bx, bw)
                bh = min(h - by, bh)
                if bw < 16 or bh < 16:
                    continue

                aligned_face = recognizer.alignCrop(img, face)
                feature = recognizer.feature(aligned_face)
                norm_feat = cv2.normalize(feature, None, alpha=1.0, beta=0.0, norm_type=cv2.NORM_L2)
                vec_128d = norm_feat.flatten().tolist()
                assert len(vec_128d) == 128, f"SFace 维度异常: {len(vec_128d)}"

                crop = img[by:by+bh, bx:bx+bw]
                crop_name = f"face_{s_id}_{pct}_{face_idx:04d}.jpg"
                crop_path = os.path.join(crops_dir, crop_name)
                cv2.imwrite(crop_path, crop)

                emb_hash = hashlib.sha256(np.array(vec_128d, dtype=np.float32).tobytes()).hexdigest()

                detected_faces.append({
                    "face_id": f"face_{face_idx:04d}",
                    "shot_id": s_id,
                    "frame_pct": pct,
                    "bbox": [bx, by, bw, bh],
                    "detector_confidence": round(conf, 4),
                    "crop_path": crop_path,
                    "embedding": vec_128d,
                    "embedding_hash": emb_hash,
                })
                face_idx += 1

    return detected_faces

def generate_40_anonymous_pairs(faces: List[Dict[str, Any]], seed: int = 20261005) -> List[Dict[str, Any]]:
    if len(faces) < 5:
        return []

    rng = random.Random(seed)
    all_candidates = []

    for i in range(len(faces)):
        for j in range(i + 1, len(faces)):
            f1 = faces[i]
            f2 = faces[j]
            if f1["shot_id"] != f2["shot_id"]:
                sim = compute_cosine_similarity(f1["embedding"], f2["embedding"])
                all_candidates.append((sim, f1, f2))

    if not all_candidates:
        return []

    all_candidates.sort(key=lambda x: x[0], reverse=True)

    high_pool = [c for c in all_candidates if c[0] >= 0.70]
    mid_pool = [c for c in all_candidates if 0.40 <= c[0] < 0.70]
    low_pool = [c for c in all_candidates if c[0] < 0.40]

    def sample_pool(pool, count):
        if len(pool) <= count:
            return pool
        return rng.sample(pool, count)

    selected = sample_pool(high_pool, 14) + sample_pool(mid_pool, 14) + sample_pool(low_pool, 12)
    if len(selected) < 40 and len(all_candidates) >= 40:
        remain = [c for c in all_candidates if c not in selected]
        selected += rng.sample(remain, 40 - len(selected))

    rng.shuffle(selected)
    pairs = []
    for idx, (sim, f1, f2) in enumerate(selected[:40], 1):
        pairs.append({
            "pair_id": f"pair_{idx:03d}",
            "face_a": {
                "face_id": f1["face_id"],
                "shot_id": f1["shot_id"],
                "bbox": f1["bbox"],
                "crop_path": f1["crop_path"],
                "embedding_hash": f1["embedding_hash"],
            },
            "face_b": {
                "face_id": f2["face_id"],
                "shot_id": f2["shot_id"],
                "bbox": f2["bbox"],
                "crop_path": f2["crop_path"],
                "embedding_hash": f2["embedding_hash"],
            },
            "_internal_cosine_sim": round(sim, 4),
            "human_label": None,
            "status": "pending_human_annotation"
        })
    return pairs

def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser(description="人脸 40 匿名 Pairs 管理入口 (<=55s)")
    parser.add_argument("--frames-dir", type=str, default="/private/tmp/x1_0/frames", help="原 45 帧目录")
    parser.add_argument("--out-dir", type=str, default="benchmarks/x1/predictions/x1_1", help="落盘目录")
    parser.add_argument("--force-recompute", action="store_true", default=False, help="是否强制覆写已有 pairs (已禁用)")
    args = parser.parse_args()

    assert_safe_path(args.frames_dir)
    assert_safe_path(args.out_dir)

    out_file = os.path.join(args.out_dir, "face_pairs_anonymous.json")

    # 严格防护: 已删除全部下载模型，生产入口严禁重新运行本地人脸模型推理，保护已有 40 Pairs 不被删除或覆盖
    if args.force_recompute:
        raise RuntimeError("已删除本地模型，生产入口严禁重新运行本地人脸模型推理，绝不能覆盖或删除已有 40 Pairs！")

    if os.path.exists(out_file):
        with open(out_file, "r", encoding="utf-8") as f:
            existing = json.load(f)
        pair_cnt = existing.get("pair_count", len(existing.get("pairs", [])))
        print(f"[FacePairsLock] 已存在固化生成的 {pair_cnt} 对人脸 Pairs ({out_file})，保持 pairIDs 不变以防人工标签漂移。安全退出。")
        sys.exit(0)

    # 若不存在固化文件，生产入口同样拒绝执行新本地推理
    raise RuntimeError(
        f"未找到固化的人脸 Pairs 文件: {out_file}。已删除全部下载模型，生产入口禁止运行本地人脸检测/特征提取推理！"
    )

if __name__ == "__main__":
    main()
