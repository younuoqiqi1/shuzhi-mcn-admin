"""
Shot 采样与划分模块
按全集时长前中后三分，使用 seeded random 严格盲选 15 个完整算法 Shot，并固化 hash。
严格防御性检验：负时间、超出 duration、重复 ID、无穷 NaN。
"""
from dataclasses import dataclass, asdict
import hashlib
import json
import math
import random
from typing import List, Dict, Any, Set

@dataclass
class ShotItem:
    shot_id: str
    start_sec: float
    end_sec: float

    def __post_init__(self):
        if not math.isfinite(self.start_sec) or not math.isfinite(self.end_sec):
            raise ValueError(f"Shot '{self.shot_id}' 时间必须为有限数值，拒绝 NaN/Inf: [{self.start_sec}, {self.end_sec}]")
        if self.start_sec < 0 or self.end_sec < 0:
            raise ValueError(f"Shot '{self.shot_id}' 包含负时间: start={self.start_sec}, end={self.end_sec}")
        if self.end_sec <= self.start_sec:
            raise ValueError(f"Shot '{self.shot_id}' 终止时间必须大于起始时间: [{self.start_sec}, {self.end_sec}]")

    @property
    def duration(self) -> float:
        return max(0.0, self.end_sec - self.start_sec)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "shot_id": self.shot_id,
            "start_sec": round(self.start_sec, 3),
            "end_sec": round(self.end_sec, 3),
            "duration": round(self.duration, 3),
        }

def compute_manifest_hash(shots: List[ShotItem]) -> str:
    raw = json.dumps([s.to_dict() for s in shots], sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def sample_15_shots(
    manifest: List[ShotItem],
    total_duration: float,
    seed: int = 42,
    shots_per_partition: int = 5
) -> List[ShotItem]:
    if total_duration <= 0 or math.isnan(total_duration) or math.isinf(total_duration):
        raise ValueError(f"无效的视频总时长: {total_duration}")
    if not manifest:
        raise ValueError("候选 ShotManifest 为空")

    seen_ids: Set[str] = set()
    for s in manifest:
        # 1. 检查 NaN / Inf
        if math.isnan(s.start_sec) or math.isinf(s.start_sec) or math.isnan(s.end_sec) or math.isinf(s.end_sec):
            raise ValueError(f"Shot '{s.shot_id}' 包含非法的 NaN 或无穷大时间数值！")
        # 2. 检查负时间
        if s.start_sec < 0 or s.end_sec < 0 or s.end_sec < s.start_sec:
            raise ValueError(f"Shot '{s.shot_id}' 包含负时间或起止倒置: [{s.start_sec}, {s.end_sec}]")
        # 3. 检查超出总时长
        if s.end_sec > total_duration:
            raise ValueError(f"Shot '{s.shot_id}' 终止时间 {s.end_sec} 超出视频总时长 {total_duration}")
        # 4. 检查重复 ID
        if s.shot_id in seen_ids:
            raise ValueError(f"发现重复的 shot_id: '{s.shot_id}'")
        seen_ids.add(s.shot_id)

    p1_end = total_duration / 3.0
    p2_end = 2.0 * total_duration / 3.0

    p1_candidates = [s for s in manifest if s.start_sec < p1_end]
    p2_candidates = [s for s in manifest if p1_end <= s.start_sec < p2_end]
    p3_candidates = [s for s in manifest if p2_end <= s.start_sec <= total_duration]

    for idx, cands in enumerate([p1_candidates, p2_candidates, p3_candidates], 1):
        if len(cands) < shots_per_partition:
            raise ValueError(f"分段 {idx} 内的候选 Shot 数量 ({len(cands)}) 不足 {shots_per_partition} 个！")

    rng = random.Random(seed)
    s1 = rng.sample(p1_candidates, shots_per_partition)
    s2 = rng.sample(p2_candidates, shots_per_partition)
    s3 = rng.sample(p3_candidates, shots_per_partition)

    selected = sorted(s1 + s2 + s3, key=lambda x: x.start_sec)
    return selected
