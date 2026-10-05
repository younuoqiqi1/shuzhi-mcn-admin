"""
scripts/x1_1/isolation_guard.py
X1.1 隔离防护与安全路径/数据校验模块

安全规范:
1. 严禁读取旧 src/evidence, src/retrieval, src/perspective, src/director;
2. 严禁读取 PROGRESS, PROGRESS.md, 旧 A5/A6/A7 文档及产物;
3. 严禁读取任何含剧情先验、人名对应表、手工标注时间表的文件;
4. OCR 与 ASR 文本严禁流入 VLM prompt 或 face 身份检测;
5. 提供统一匿名化标识与路径审查函数。
"""
import os
import re
from typing import Dict, Any

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
    r"A5",
    r"A6",
    r"A7",
    r"character_map",
    r"role_mapping",
    r"ground_truth_narrative",
]

ANON_MEDIA_ID = "source_media_001"
ANON_SERIES_ID = "series_anon_001"
ANON_EPISODE_ID = "ep_anon_001"

class SafePathViolationError(PermissionError):
    """当尝试读取或引用被禁止的含剧情/历史先验路径时抛出"""
    pass

class DataLeakageError(ValueError):
    """当文本数据违法流入视觉/面部模型时抛出"""
    pass

def assert_safe_path(path: str) -> None:
    """
    检查路径是否安全，若触碰剧情、历史阶段文档或人工真值则拦截抛出异常
    """
    norm = os.path.normpath(path).replace("\\", "/")
    for pat in FORBIDDEN_PATTERNS:
        if re.search(pat, norm, re.IGNORECASE):
            raise SafePathViolationError(f"安全隔离拒绝：路径 '{path}' 命中禁用规则 '{pat}'，包含剧情或历史先验！")

def assert_vlm_input_safe(prompt_or_text: str) -> None:
    """
    确保输入到 VLM 的 Prompt 绝对不包含字幕文本、ASR 文本或剧情人名
    """
    # 禁止在 VLM prompt 中塞入台词/字幕/源文件名
    forbidden_tokens = ["subtitle", "ocr_text", "asr_text", "台词", "剧本", "qianfu"]
    lower = prompt_or_text.lower()
    for tok in forbidden_tokens:
        if tok in lower:
            raise DataLeakageError(f"VLM 输入隔离拒绝：Prompt 发现含有潜在文本泄漏词汇 '{tok}'")

def sanitize_metadata_for_model(input_metadata: dict) -> dict:
    """
    抹除所有非客观元数据，仅返回纯匿名化 ID
    """
    return {
        "media_id": ANON_MEDIA_ID,
        "series_id": ANON_SERIES_ID,
        "episode_id": ANON_EPISODE_ID,
    }
