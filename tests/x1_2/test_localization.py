#!/usr/bin/env python3
"""
tests/x1_2/test_localization.py
精简合成单元测试：验证 AI 复核结论、人工修订选填、None/空串不冒充无、
服务调用失败提示、方位纯中文及表单保存键不变。
注意：不读取任何生产环境真实数据，全流程使用 mock 数据。
"""

import hashlib
import json
import tempfile
from pathlib import Path

from scripts.x1_2.review_report import (
    localize_text,
    localize_value,
    generate_review_html,
    load_ai_review,
    AI_VERDICT_MAP,
)


def test_none_and_empty_string_not_faking_empty_list():
    """验证 None 和空字符串必须为'未提供'，只有实际输出空列表才为'无'，避免把服务失败伪造成无人/无动作"""
    # None 和空串必须为未提供
    assert localize_value(None) == "未提供"
    assert localize_value("") == "未提供"
    assert localize_value("   ") == "未提供"

    # 只有空列表才可为无
    assert localize_value([]) == "无"

    # 列表有元素但缺翻译时，绝不伪造成“无”
    raw_chars = ["person A", "person B"]
    val_res = localize_value(raw_chars, {})
    assert "无" not in val_res
    assert val_res == "【中文翻译待补齐】、【中文翻译待补齐】"


def test_sha256_lookup_and_pure_chinese_and_camera():
    """验证按 SHA256 查字典、纯中文保留及景别静态映射"""
    raw_str = "a man standing quietly"
    sha = hashlib.sha256(raw_str.encode("utf-8")).hexdigest()
    trans_dict = {sha: "一名男子静静地站着"}

    assert localize_text(raw_str, trans_dict) == "一名男子静静地站着"
    assert localize_text("medium shot", {}) == "中景"
    assert localize_text("特写镜头", {}) == "特写镜头"


def test_ai_review_and_review_html_contracts():
    """验证 AI 复核 banner 展示、人工修订选填、无 pv_dict 识别失败提示、纯中文方位及 LocalStorage 键"""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        manifest_file = tmp_path / "manifest.json"
        frames_dir = tmp_path / "frames"
        runs_dir = tmp_path / "runs"
        inferences_dir = runs_dir / "inferences"
        frames_dir.mkdir(parents=True, exist_ok=True)
        inferences_dir.mkdir(parents=True, exist_ok=True)

        # 包含 2 个 shot: shot_001 有 AI 结论和成功推理，shot_002 缺 AI 结论且推理服务调用失败
        manifest_data = {
            "batch_id": "X1.2",
            "shots": [
                {
                    "shot_id": "shot_001",
                    "start": 0.0,
                    "end": 2.5,
                    "duration": 2.5,
                    "segment": "early",
                },
                {
                    "shot_id": "shot_002",
                    "start": 2.5,
                    "end": 5.0,
                    "duration": 2.5,
                    "segment": "mid",
                },
            ],
        }
        with open(manifest_file, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f)

        # shot_001 pct25 推理记录
        raw_char_en = "young woman sitting by table"
        mock_infer_001 = {
            "frame_id": "shot_001_pct25",
            "response": {
                "parsed_validation": {
                    "characters": [raw_char_en],
                    "environment": "brightly lit classroom",
                    "physical_actions": ["writing notes"],
                    "objects": ["wooden desk"],
                    "camera": "medium shot",
                    "uncertainty": "none",
                }
            },
        }
        with open(inferences_dir / "shot_001_pct25.json", "w", encoding="utf-8") as f:
            json.dump(mock_infer_001, f)

        # shot_002 模拟 20 服务失败：不创建 inference 记录或返回无 parsed_validation

        # 构造 AI 复核合同文件 (Codex)
        ai_review_data = {
            "review_type": "ai_review",
            "human_gold": False,
            "reviewer": "Codex",
            "shots": {
                "shot_001": {
                    "verdict": "no_obvious_error",
                    "note": "人物与环境描述高度吻合，边界切点干净",
                }
            },
        }
        ai_review_file = tmp_path / "ai_review.json"
        with open(ai_review_file, "w", encoding="utf-8") as f:
            json.dump(ai_review_data, f)

        # 构造翻译字典
        char_sha = hashlib.sha256(raw_char_en.encode("utf-8")).hexdigest()
        trans_file = tmp_path / "translations.zh.json"
        with open(trans_file, "w", encoding="utf-8") as f:
            json.dump({char_sha: "坐在桌旁的年轻女子"}, f)

        out_html = tmp_path / "review.html"
        generate_review_html(
            manifest_file=manifest_file,
            frames_dir=frames_dir,
            runs_dir=runs_dir,
            output_html_file=out_html,
            translations_file=trans_file,
            ai_review_file=ai_review_file,
        )

        assert out_html.exists()
        html_content = out_html.read_text(encoding="utf-8")

        # 1. 验证页首提示
        assert "AI 复核与人工真值分开，人工修订选填不需要逐项填写" in html_content

        # 2. 验证 shot_001 显示 AI 复核结论 (Codex)
        assert "🤖 AI复核结论 (Codex):" in html_content
        assert "未见明显错误" in html_content
        assert "人物与环境描述高度吻合，边界切点干净" in html_content

        # 3. 验证 shot_002 缺失 AI 结论时显示提示
        assert "AI 复核尚未完成" in html_content

        # 4. 验证 shot_002 识别失败时，不伪造无人无动作，而是显示明确提示
        assert "识别调用失败，未返回描述" in html_content

        # 5. 验证表单标题变更为“人工修订 (选填)”，且外层被包入默认折叠的 details，summary 为“可选：补充人工修订”
        assert "人工修订 (选填)" in html_content
        assert "可选：补充人工修订" in html_content

        # 6. 验证方位校准仅写画面左侧/右侧，不包含 screen 英文括号
        assert "(screen-left)" not in html_content
        assert "(screen-right)" not in html_content
        assert "统一使用 <code>画面左侧</code> 与 <code>画面右侧</code>" in html_content

        # 7. 验证保留原始结果 details 折叠
        assert "查看模型原始结果" in html_content
        assert raw_char_en in html_content

        # 8. 验证表单 DOM id、实际 LocalStorage 键保持完全不变，且未将 AI 结果自动填入表单
        assert "id='factual_shot_001_pct25'" in html_content
        assert "id='hallucinated_shot_001_pct25'" in html_content
        assert "name='scene_shot_001_pct25'" in html_content
        assert "id='boundary_shot_001'" in html_content
        assert 'const STORAGE_KEY = "x1_2_review_cache_v4";' in html_content
        assert 'provenance: "human_review"' in html_content


if __name__ == "__main__":
    test_none_and_empty_string_not_faking_empty_list()
    test_sha256_lookup_and_pure_chinese_and_camera()
    test_ai_review_and_review_html_contracts()
    print("All contracts and localization tests passed successfully.")
