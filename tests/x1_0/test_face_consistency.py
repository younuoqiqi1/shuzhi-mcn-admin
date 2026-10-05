import pytest
import re
import numpy as np
from scripts.x1_0.face_consistency import FaceMatcher

def test_no_face_detected_is_empty_or_unknown():
    matcher = FaceMatcher(threshold=0.55)
    res = matcher.match_faces(shot_id="shot_0001", frame_ref="shot_0001_mid.jpg", face_embeddings=[])
    assert len(res) == 0

def test_new_identity_records_actual_similarity_not_fake_1():
    matcher = FaceMatcher(threshold=0.55)
    v1 = np.random.randn(128)
    v1 = v1 / np.linalg.norm(v1)

    # 第一个人脸应登记为 new_identity，similarity 应为 None 或最佳历史相似度，而不是伪造 1.0！
    res = matcher.match_faces(shot_id="shot_0001", frame_ref="frame_1.jpg", face_embeddings=[v1])
    assert len(res) == 1
    record = res[0]
    assert record["match_status"] == "new_identity"
    assert re.match(r"^person_\d{3,}$", record["person_id"])
    # 首次注册无已有对比，best_existing_similarity 记录 None 或 0.0，绝不写 1.0
    assert record["best_existing_similarity"] is None or record["best_existing_similarity"] < 1.0

def test_same_face_cross_shot_matching():
    matcher = FaceMatcher(threshold=0.55)
    v1 = np.random.randn(128)
    v1 = v1 / np.linalg.norm(v1)

    matcher.match_faces(shot_id="shot_0001", frame_ref="frame_1.jpg", face_embeddings=[v1])
    # 相同人脸跨 shot 匹配
    res2 = matcher.match_faces(shot_id="shot_0002", frame_ref="frame_2.jpg", face_embeddings=[v1])
    assert len(res2) == 1
    assert res2[0]["match_status"] == "matched_existing"
    assert res2[0]["person_id"] == "person_001"
    assert res2[0]["similarity"] >= 0.99

def test_same_frame_multi_faces_exclusive_ids():
    matcher = FaceMatcher(threshold=0.55)
    # 两个不同的人脸在同一帧
    v1 = np.random.randn(128)
    v1 = v1 / np.linalg.norm(v1)
    v2 = np.random.randn(128)
    v2 = v2 - np.dot(v2, v1) * v1
    v2 = v2 / np.linalg.norm(v2)

    res = matcher.match_faces(
        shot_id="shot_0001",
        frame_ref="frame_multi.jpg",
        face_embeddings=[v1, v2],
        bboxes=[[10, 10, 50, 50], [100, 100, 50, 50]]
    )
    assert len(res) == 2
    # 同一帧内检测到的两张脸绝对不能获得相同的 ID！
    assert res[0]["person_id"] != res[1]["person_id"]

def test_anonymous_id_format_strictly_enforced():
    matcher = FaceMatcher(threshold=0.55)
    v = np.random.randn(128)
    v = v / np.linalg.norm(v)
    res = matcher.match_faces("shot_0001", "frame_1.jpg", [v])
    for r in res:
        assert re.match(r"^person_\d{3,}$", r["person_id"])
