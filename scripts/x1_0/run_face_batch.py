"""
15-Shot 纯人脸独立批处理模块 (<= 55s 独立任务)
在单次完整会话中对全部 15-Shot 的 45 帧图像进行全局人脸聚类与跨 Shot 一致性追踪。
保证 known_persons 真实全局递增维护，防止单 shot 孤立重置带来的虚假一致性。
保留 partial_error 诊断信息，严禁掩盖错误。
引入 setup_lifecycle_guard(55) 进行统一生命周期与超时安全保护。
"""
import atexit
import json
import os
import sys
import time
from typing import Dict, Any, List

from scripts.x1_0.face_consistency import FaceMatcher
from scripts.x1_0.isolation_guard import assert_safe_path
from scripts.x1_0.lifecycle import setup_lifecycle_guard

def run_face_batch():
    # 统一 55s 硬超时生命周期守卫
    setup_lifecycle_guard(55)

    selected_file = "benchmarks/x1/development/x1_0/selected_15_shots.json"
    assert_safe_path(selected_file)
    if not os.path.exists(selected_file):
        print(f"错误: 盲选清单不存在: {selected_file}", file=sys.stderr)
        sys.exit(1)

    with open(selected_file, "r", encoding="utf-8") as f:
        shots = json.load(f)

    print(f"=== 开始 15-Shot 全局人脸检测与跨 Shot 一致性聚类 (共 {len(shots)} Shots, 45 帧) ===")
    t0 = time.time()

    matcher = FaceMatcher(threshold=0.55)
    shot_results = {}
    total_detections = 0

    for idx, s in enumerate(shots, 1):
        shot_id = s["shot_id"]
        frames_dir = f"/private/tmp/x1_0/frames/{shot_id}"
        frame_files = [
            f"{frames_dir}/frame_25.jpg",
            f"{frames_dir}/frame_50.jpg",
            f"{frames_dir}/frame_75.jpg"
        ]

        shot_matches = []
        frame_errors = []
        processed_frames_count = 0

        for f_path in frame_files:
            assert_safe_path(f_path)
            if not os.path.exists(f_path):
                frame_errors.append(f"文件不存在: {os.path.basename(f_path)}")
                continue

            f_name = os.path.basename(f_path)
            try:
                detections = matcher.detect_and_embed(f_path)
                processed_frames_count += 1
                if detections:
                    embs = [d[1] for d in detections]
                    bboxes = [d[0] for d in detections]
                    m_list = matcher.match_faces(
                        shot_id=shot_id,
                        frame_ref=f_name,
                        face_embeddings=embs,
                        bboxes=bboxes
                    )
                    shot_matches.extend(m_list)
                    total_detections += len(m_list)
            except Exception as e:
                # 图像无法解码或模型异常，真实记录 frame_errors，绝不静默掩盖
                frame_errors.append(f"{f_name}: {str(e)}")

        has_partial_error = len(frame_errors) > 0
        error_summary = "; ".join(frame_errors) if has_partial_error else None

        # 严格状态判定: 全部失败为 error；部分或全部成功时按检出情况判定 detected/unknown
        if processed_frames_count == 0 and has_partial_error:
            shot_status = "error"
        elif len(shot_matches) > 0:
            shot_status = "detected"
        else:
            shot_status = "unknown"

        shot_results[shot_id] = {
            "shot_id": shot_id,
            "status": shot_status,
            "has_face": len(shot_matches) > 0,
            "persons": shot_matches,
            "partial_error": error_summary,
            "error": error_summary if shot_status == "error" else None
        }
        print(f"[{idx}/15] {shot_id}: 状态={shot_status}, 检出人脸={len(shot_matches)}处, 累计匿名簇={len(matcher.known_persons)}, partial_error={has_partial_error}")

    elapsed = round(time.time() - t0, 3)
    print(f"=== 人脸全局批处理完成！耗时: {elapsed}s，共聚类出 {len(matcher.known_persons)} 个算法匿名簇 ===")

    out_dir = "benchmarks/x1/predictions/x1_0"
    os.makedirs(out_dir, exist_ok=True)

    face_pred_file = f"{out_dir}/face_consistency.json"
    with open(face_pred_file, "w", encoding="utf-8") as f:
        json.dump(shot_results, f, indent=2, ensure_ascii=False)

    registry_file = f"{out_dir}/face_registry.json"
    serializable_known = {}
    for p_id, p_info in matcher.known_persons.items():
        serializable_known[p_id] = {
            "embedding": p_info["embedding"].tolist(),
            "first_seen_shot": p_info.get("first_seen_shot", "")
        }

    registry_payload = {
        "person_counter": matcher.person_counter,
        "total_unique_persons": len(matcher.known_persons),
        "threshold": matcher.threshold,
        "elapsed_sec": elapsed,
        "known_persons": serializable_known,
        "note": "算法匿名聚类簇，未经人工GroundTruth校准，阈值0.55"
    }
    with open(registry_file, "w", encoding="utf-8") as f:
        json.dump(registry_payload, f, indent=2, ensure_ascii=False)

    print(f"人脸一致性数据已落盘至:\n - {face_pred_file}\n - {registry_file}")

if __name__ == "__main__":
    run_face_batch()
