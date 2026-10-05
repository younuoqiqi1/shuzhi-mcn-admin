"""
真实人脸检测与跨 Shot 一致性模块
使用 OpenCV YuNet 检测与 SFace 特征提取，基于余弦相似度进行跨 Shot 匿名人员聚类与追踪。
严禁使用人名/剧情先验；新面孔记录 new_identity 与真实最高相似度（绝不伪造 1.0）；
同帧多脸排他性分配，防止同一帧重复归属同一 ID；
无脸返回空列表并标记 unknown。
"""
import hashlib
import os
import re
from typing import List, Dict, Any, Optional, Tuple, Set
import cv2
import numpy as np

from scripts.x1_0.isolation_guard import assert_safe_path

DEFAULT_YUNET_PATH = "/private/tmp/x1_0/models/face_detection_yunet_2023mar.onnx"
DEFAULT_SFACE_PATH = "/private/tmp/x1_0/models/face_recognition_sface_2021dec.onnx"

class FaceDetectionResult:
    def __init__(self, bbox: List[int], embedding: np.ndarray, score: float):
        self.bbox = bbox
        self.embedding = embedding
        self.score = score

class FaceMatcher:
    def __init__(
        self,
        threshold: float = 0.55,
        detector_path: str = DEFAULT_YUNET_PATH,
        recognizer_path: str = DEFAULT_SFACE_PATH
    ):
        assert_safe_path(detector_path)
        assert_safe_path(recognizer_path)
        self.threshold = threshold
        self.detector_path = detector_path
        self.recognizer_path = recognizer_path
        self._detector = None
        self._recognizer = None
        
        self.known_persons: Dict[str, Dict[str, Any]] = {}
        self.person_counter = 0

    def _ensure_models(self, width: int = 320, height: int = 320):
        if self._detector is None:
            if not os.path.exists(self.detector_path) or not os.path.exists(self.recognizer_path):
                raise FileNotFoundError("YuNet 或 SFace ONNX 权重文件不存在！缺模型严禁模拟！")
            self._detector = cv2.FaceDetectorYN.create(
                self.detector_path, "", (width, height), score_threshold=0.6, nms_threshold=0.3
            )
            self._recognizer = cv2.FaceRecognizerSF.create(self.recognizer_path, "")

    def detect_and_embed(self, image_path: str) -> List[Tuple[List[int], np.ndarray, float]]:
        """
        从单张图像中真实检测人脸并提取特征向量
        返回: List of (bbox [x, y, w, h], normalized_embedding, score)
        若图像无法解码，必须明确抛出 ValueError，严禁伪装为无脸 unknown！
        """
        assert_safe_path(image_path)
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"图像不存在: {image_path}")

        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"图像无法解码或文件已损坏: {image_path}")

        h, w = img.shape[:2]
        self._ensure_models(w, h)
        self._detector.setInputSize((w, h))

        _, faces = self._detector.detect(img)
        if faces is None or len(faces) == 0:
            return []

        results = []
        for face in faces:
            score = float(face[-1])
            bbox = [int(face[0]), int(face[1]), int(face[2]), int(face[3])]
            
            aligned_face = self._recognizer.alignCrop(img, face)
            feat = self._recognizer.feature(aligned_face)
            norm_feat = feat.flatten()
            norm = np.linalg.norm(norm_feat)
            if norm > 1e-6:
                norm_feat = norm_feat / norm
            results.append((bbox, norm_feat, score))

        return results

    def match_faces(
        self,
        shot_id: str,
        frame_ref: str,
        face_embeddings: List[np.ndarray],
        bboxes: Optional[List[List[int]]] = None
    ) -> List[Dict[str, Any]]:
        """
        跨 Shot 余弦相似度匹配。
        - 同一帧内检测到的多个人脸进行排他性分配（同一已分配 ID 不可被重复分配）。
        - 若匹配成功: match_status='matched_existing', 记录真实 similarity。
        - 若为新人员: match_status='new_identity', 记录真实的 best_existing_similarity（不伪造 1.0）。
        """
        if not face_embeddings:
            return []

        if bboxes is None:
            bboxes = [[0, 0, 0, 0] for _ in face_embeddings]

        records = []
        # 同帧内已被占用的 person_id 集合
        claimed_ids_in_frame: Set[str] = set()

        for emb, bbox in zip(face_embeddings, bboxes):
            norm_emb = emb.flatten()
            norm = np.linalg.norm(norm_emb)
            if norm > 1e-6:
                norm_emb = norm_emb / norm

            emb_hash = hashlib.sha256(norm_emb.tobytes()).hexdigest()[:16]

            # 遍历已知人员，寻找最佳匹配（排除同帧已认领的 ID）
            best_sim = -1.0
            best_person_id = None

            for p_id, p_info in self.known_persons.items():
                if p_id in claimed_ids_in_frame:
                    continue
                ref_emb = p_info["embedding"]
                sim = float(np.dot(norm_emb, ref_emb))
                if sim > best_sim:
                    best_sim = sim
                    best_person_id = p_id

            if best_person_id is not None and best_sim >= self.threshold:
                # 匹配已有已知身份
                matched_id = best_person_id
                claimed_ids_in_frame.add(matched_id)
                records.append({
                    "person_id": matched_id,
                    "match_status": "matched_existing",
                    "similarity": round(best_sim, 4),
                    "best_existing_similarity": round(best_sim, 4),
                    "threshold": self.threshold,
                    "bbox": bbox,
                    "frame_ref": frame_ref,
                    "embedding_hash": emb_hash,
                })
            else:
                # 新出现的身份，生成新的匿名 ID
                self.person_counter += 1
                matched_id = f"person_{self.person_counter:03d}"
                claimed_ids_in_frame.add(matched_id)
                
                self.known_persons[matched_id] = {
                    "embedding": norm_emb,
                    "first_seen_shot": shot_id,
                }
                
                actual_best_sim = round(best_sim, 4) if best_person_id is not None else None
                records.append({
                    "person_id": matched_id,
                    "match_status": "new_identity",
                    "similarity": None,  # 绝不写 1.0 假装一致性证据
                    "best_existing_similarity": actual_best_sim,
                    "threshold": self.threshold,
                    "bbox": bbox,
                    "frame_ref": frame_ref,
                    "embedding_hash": emb_hash,
                })

        return records
