"""
隔离防护与安全路径校验模块
确保盲 Ingest 过程绝对不接触任何含剧情先验的文件、旧审计/报告、旧交接文件、旧测试数据。
"""
import os
import re

FORBIDDEN_PATTERNS = [
    r"PROGRESS(\.md)?$",
    r"handoff",
    r"handover",
    r"reports/x0",
    r"reports/audit",
    r"(^|/)audit/",
    r"src/evidence",
    r"src/retrieval",
    r"src/perspective",
    r"src/director",
    r"Topic/",
    r"Requirements/",
    r"Storyboards/",
    r"gold/",
]

# 允许的匿名元数据标识
ANON_MEDIA_ID = "source_media_001"
ANON_SERIES_ID = "series_anon_001"
ANON_EPISODE_ID = "ep_anon_001"

class SafePathViolationError(PermissionError):
    """当尝试读取或引用被禁止的含先验路径时抛出"""
    pass

def assert_safe_path(path: str) -> None:
    norm = os.path.normpath(path).replace("\\", "/")
    for pat in FORBIDDEN_PATTERNS:
        if re.search(pat, norm, re.IGNORECASE):
            raise SafePathViolationError(f"安全隔离拒绝：路径 '{path}' 命中禁用规则 '{pat}'，含剧情或历史先验！")

def sanitize_metadata_for_model(input_metadata: dict) -> dict:
    """
    去除所有真实剧名、人名、文件路径等元数据，只输出匿名标识
    """
    return {
        "media_id": ANON_MEDIA_ID,
        "series_id": ANON_SERIES_ID,
        "episode_id": ANON_EPISODE_ID,
    }
