"""
scripts/x1_1/vlm_schema.py
VLM 客观视觉特征约束 Schema 与严格校验模块 (X1.1 恢复与 X1.0 可比规范)

6 大核心字段规范:
1. characters: 画面人物可见衣着/外貌客观特征列表 (明禁人名/关系/情绪/剧情推断)
2. environment: 客观物理空间、光照、室内外与背景布局
3. physical_actions: 客观身体物理动作 (严禁推测主观目的/动机)
4. objects: 画面中清晰可见的静物道具与客观实体
5. camera: 纯单帧视觉构图与景别 (严禁从单帧静态图推断 camera movement 运动)
6. uncertainty: 客观画面可见遮挡、模糊、过暗、反光等视觉不确定性记录
"""
import hashlib
import json
from typing import Any, Dict, Optional, Tuple

VLM_OBJECTIVE_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "characters",
        "environment",
        "physical_actions",
        "objects",
        "camera",
        "uncertainty",
    ],
    "properties": {
        "characters": {
            "type": "array",
            "items": {"type": "string", "maxLength": 100},
            "maxItems": 10,
            "description": "画面中可见人物的衣着、发型或生理轮廓客观描述，严禁人名、关系、性格或情绪推断",
        },
        "environment": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200,
            "description": "客观物理空间、照明光线、室内外及背景构形描述",
        },
        "physical_actions": {
            "type": "array",
            "items": {"type": "string", "maxLength": 80},
            "maxItems": 8,
            "description": "可见的纯物理姿态或动作（如站立、坐卧、抬手），严禁推断主观意图或目的",
        },
        "objects": {
            "type": "array",
            "items": {"type": "string", "maxLength": 50},
            "maxItems": 15,
            "description": "画面中清晰可见的客观道具与实体物件清单",
        },
        "camera": {
            "type": "string",
            "enum": [
                "extreme_close_up",
                "close_up",
                "medium_close_up",
                "medium_shot",
                "full_shot",
                "long_shot",
                "over_the_shoulder",
                "high_angle",
                "low_angle",
                "eye_level",
                "unknown",
            ],
            "description": "单帧客观景别与构图视角，禁止从单张静态图推测镜头运镜 movement",
        },
        "uncertainty": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200,
            "description": "画面中客观存在的视觉障碍，如遮挡、运动模糊、过暗、逆光、面部不全等，若无明显遮挡如实记录",
        },
    },
}

def get_schema_hash() -> str:
    schema_str = json.dumps(VLM_OBJECTIVE_SCHEMA, sort_keys=True)
    return hashlib.sha256(schema_str.encode("utf-8")).hexdigest()

def validate_vlm_output(raw_text: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    if not raw_text or not raw_text.strip():
        return False, None, "输出内容为空"

    cleaned = raw_text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
    except Exception as e:
        return False, None, f"JSON 解码失败: {str(e)}"

    if not isinstance(data, dict):
        return False, None, f"顶层结构必须为 JSON Object，实际为: {type(data).__name__}"

    required_fields = set(VLM_OBJECTIVE_SCHEMA["required"])
    actual_fields = set(data.keys())

    missing = required_fields - actual_fields
    if missing:
        return False, None, f"缺失必填字段: {sorted(list(missing))}"

    extra = actual_fields - required_fields
    if extra:
        return False, None, f"违反 additionalProperties=False，包含多余字段: {sorted(list(extra))}"

    # 校验 characters
    chars = data.get("characters")
    if not isinstance(chars, list) or len(chars) > 10:
        return False, None, f"characters 必须为 list 且最多 10 项"
    for item in chars:
        if not isinstance(item, str) or len(item) > 100:
            return False, None, "characters 项必须为 <=100 字符的字符串"

    # 校验 environment
    env = data.get("environment")
    if not isinstance(env, str) or len(env) < 1 or len(env) > 200:
        return False, None, "environment 必须为 1~200 字符的非空字符串"

    # 校验 physical_actions
    acts = data.get("physical_actions")
    if not isinstance(acts, list) or len(acts) > 8:
        return False, None, "physical_actions 必须为 list 且最多 8 项"
    for item in acts:
        if not isinstance(item, str) or len(item) > 80:
            return False, None, "physical_actions 项必须为 <=80 字符的字符串"

    # 校验 objects
    objs = data.get("objects")
    if not isinstance(objs, list) or len(objs) > 15:
        return False, None, "objects 必须为 list 且最多 15 项"
    for item in objs:
        if not isinstance(item, str) or len(item) > 50:
            return False, None, "objects 项必须为 <=50 字符的字符串"

    # 校验 camera
    cam = data.get("camera")
    valid_cams = VLM_OBJECTIVE_SCHEMA["properties"]["camera"]["enum"]
    if cam not in valid_cams:
        return False, None, f"camera 景别值非法: '{cam}'"

    # 校验 uncertainty
    unc = data.get("uncertainty")
    if not isinstance(unc, str) or len(unc) < 1 or len(unc) > 200:
        return False, None, "uncertainty 必须为 1~200 字符的非空字符串"

    return True, data, None
