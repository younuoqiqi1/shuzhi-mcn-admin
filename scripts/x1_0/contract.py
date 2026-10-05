"""
数据契约与校验模块 (X1.0 严格版)
通用严苛 Schema 验证准则:
1. requires_human_review 必须一律为 True (结构符合不等于语义真实);
2. 增加 semantic_status="unverified";
3. 保留所有 raw_output 原文，仅做结构提取，不篡改模型观察;
4. episode_scope 严格定义为 episode_id 数组 (如 ["ep_anon_001"]);
5. 明确区分人脸状态: 'detected' (检出人脸), 'unknown' (无脸), 'error' (人脸结果缺失或异常).
"""
import json
import re
from typing import Dict, Any, List, Optional

class ContractValidationError(ValueError):
    """契约字段缺失或非法"""
    pass

def parse_and_validate_vlm_output(raw_text: str) -> Dict[str, Any]:
    """
    解析并进行通用严苛 Schema 校验。
    必须包含完整的纯客观物理观察字段：
    - characters: List[str]
    - environment: 非空 str
    - physical_actions: List[str]
    - objects: List[str]
    - camera: 非空 str
    - uncertainty: 非空 str

    规则:
    - 空 dict、缺失字段、非法类型立即判定为 rejected;
    - 无论结构是否通过校验，requires_human_review 必须一律为 True;
    - semantic_status 必须一律标记为 "unverified";
    - 绝对保留完整的 raw_output 原文。
    """
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
        if match:
            cleaned = match.group(1).strip()

    try:
        data = json.loads(cleaned)
    except Exception as e:
        return {
            "status": "rejected",
            "reason": f"非法 JSON 格式: {str(e)}",
            "raw_output": raw_text,
            "observation": None,
            "requires_human_review": True,
            "semantic_status": "unverified"
        }

    if not isinstance(data, dict):
        return {
            "status": "rejected",
            "reason": "Schema validation failed: VLM 输出必须为 JSON 对象",
            "raw_output": raw_text,
            "observation": None,
            "requires_human_review": True,
            "semantic_status": "unverified"
        }

    required_specs = {
        "characters": list,
        "environment": str,
        "physical_actions": list,
        "objects": list,
        "camera": str,
        "uncertainty": str
    }

    missing_or_invalid = []
    for field, expected_type in required_specs.items():
        if field not in data:
            missing_or_invalid.append(f"missing field '{field}'")
            continue
        val = data[field]
        if not isinstance(val, expected_type):
            missing_or_invalid.append(f"field '{field}' type {type(val).__name__} != expected {expected_type.__name__}")
            continue
        if expected_type is str and not val.strip():
            missing_or_invalid.append(f"field '{field}' cannot be empty string")
        if expected_type is list:
            if any(not isinstance(elem, str) for elem in val):
                missing_or_invalid.append(f"elements of '{field}' must be strings")

    if missing_or_invalid:
        return {
            "status": "rejected",
            "reason": f"Schema validation failed: {', '.join(missing_or_invalid)}",
            "raw_output": raw_text,
            "observation": None,
            "requires_human_review": True,
            "semantic_status": "unverified"
        }

    observation = {
        "characters": data["characters"],
        "environment": data["environment"].strip(),
        "physical_actions": data["physical_actions"],
        "objects": data["objects"],
        "camera": data["camera"].strip(),
        "uncertainty": data["uncertainty"].strip(),
        "requires_human_review": True,      # 绝不为 False
        "semantic_status": "unverified"     # 明确标注待人工核验
    }

    return {
        "status": "success",
        "raw_output": raw_text,
        "observation": observation,
        "requires_human_review": True,
        "semantic_status": "unverified"
    }

def validate_shot_contract(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    严格校验 Shot 数据契约
    必须包含:
    series_id, episode_id, media_id, shot_id, episode_scope, timestamps, asr, vlm, person_consistency
    """
    required_keys = [
        "series_id", "episode_id", "media_id", "shot_id",
        "episode_scope", "timestamps", "asr", "vlm", "person_consistency"
    ]
    for k in required_keys:
        if k not in record:
            raise ContractValidationError(f"契约缺失必要字段: '{k}'")

    # episode_scope 严格定义为 episode_id 数组，绝不可为 shot_id 数组
    scope = record["episode_scope"]
    if not isinstance(scope, list) or len(scope) == 0:
        raise ContractValidationError("episode_scope 必须是非空列表")
    for item in scope:
        if not isinstance(item, str):
            raise ContractValidationError(f"episode_scope 元素必须为字符串: {item}")
        if item.startswith("shot_"):
            raise ContractValidationError(f"episode_scope 必须是 episode_id 数组，不可为 shot_id 数组: '{item}'")

    ts = record["timestamps"]
    if not isinstance(ts, dict) or "start_sec" not in ts or "end_sec" not in ts or "duration" not in ts:
        raise ContractValidationError("timestamps 必须包含 start_sec, end_sec 和 duration")

    # 校验 person_consistency 状态合法性
    face = record["person_consistency"]
    if not isinstance(face, dict) or "status" not in face or "has_face" not in face or "persons" not in face:
        raise ContractValidationError("person_consistency 必须包含 status, has_face 与 persons 字段")
    valid_face_statuses = ["detected", "unknown", "error"]
    if face["status"] not in valid_face_statuses:
        raise ContractValidationError(f"person_consistency status '{face['status']}' 非法，必须为 {valid_face_statuses}")

    return record
