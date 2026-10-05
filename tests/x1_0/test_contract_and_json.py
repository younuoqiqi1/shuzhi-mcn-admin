import pytest
import json
from scripts.x1_0.contract import validate_shot_contract, parse_and_validate_vlm_output, ContractValidationError

def test_valid_contract():
    valid_record = {
        "series_id": "series_anon_001",
        "episode_id": "ep_anon_001",
        "media_id": "source_media_001",
        "shot_id": "shot_0001",
        "episode_scope": ["ep_anon_001"],
        "timestamps": {"start_sec": 10.0, "end_sec": 14.5, "duration": 4.5},
        "asr": {
            "text": "测试音频",
            "segments": [{"start": 10.0, "end": 12.0, "text": "测试音频"}],
            "provenance": "raw_audio"
        },
        "vlm": {
            "model": "qwen2-vl-2b-4bit",
            "raw_output": "{\"characters\": [\"a person in dark suit\"], \"environment\": \"indoor room\", \"physical_actions\": [\"sitting\"], \"objects\": [\"table\"], \"camera\": \"medium shot\", \"uncertainty\": \"none\"}",
            "status": "success",
            "frames_observation": {
                "shot_0001/frame_25.jpg": {
                    "characters": ["a person in dark suit"],
                    "environment": "indoor room",
                    "physical_actions": ["sitting"],
                    "objects": ["table"],
                    "camera": "medium shot",
                    "uncertainty": "none",
                    "requires_human_review": True,
                    "semantic_status": "unverified"
                }
            }
        },
        "person_consistency": {
            "persons": [],
            "has_face": False,
            "status": "unknown"
        }
    }
    validated = validate_shot_contract(valid_record)
    assert validated["shot_id"] == "shot_0001"

def test_requires_human_review_is_always_true():
    valid_json = json.dumps({
        "characters": ["a person in dark suit"],
        "environment": "indoor room",
        "physical_actions": ["sitting"],
        "objects": ["table"],
        "camera": "medium shot",
        "uncertainty": "none"
    })
    res = parse_and_validate_vlm_output(valid_json)
    assert res["status"] == "success"
    assert res["requires_human_review"] is True
    assert res["semantic_status"] == "unverified"
    assert res["observation"]["requires_human_review"] is True
    assert res["observation"]["semantic_status"] == "unverified"

def test_missing_face_results_must_be_error_not_unknown():
    record = {
        "series_id": "series_anon_001",
        "episode_id": "ep_anon_001",
        "media_id": "source_media_001",
        "shot_id": "shot_0001",
        "episode_scope": ["ep_anon_001"],
        "timestamps": {"start_sec": 10.0, "end_sec": 14.5, "duration": 4.5},
        "asr": {"status": "success", "text": "", "segments": []},
        "vlm": {"status": "success", "frames_observation": {}},
        "person_consistency": {
            "persons": [],
            "has_face": False,
            "status": "invalid_status_xyz"
        }
    }
    with pytest.raises(ContractValidationError):
        validate_shot_contract(record)

def test_episode_scope_as_shot_ids_must_be_rejected():
    bad_record = {
        "series_id": "series_anon_001",
        "episode_id": "ep_anon_001",
        "media_id": "source_media_001",
        "shot_id": "shot_0001",
        "episode_scope": ["shot_0001", "shot_0002"],
        "timestamps": {"start_sec": 10.0, "end_sec": 14.5, "duration": 4.5},
        "asr": {"status": "success", "text": "", "segments": []},
        "vlm": {"status": "success", "frames_observation": {}},
        "person_consistency": {"persons": [], "has_face": False, "status": "unknown"}
    }
    with pytest.raises(ContractValidationError, match="episode_id"):
        validate_shot_contract(bad_record)

def test_empty_dict_vlm_must_be_rejected():
    res = parse_and_validate_vlm_output("{}")
    assert res["status"] == "rejected"
    assert res["observation"] is None
    assert "Schema validation failed" in res["reason"]
    assert res["requires_human_review"] is True
    assert res["semantic_status"] == "unverified"

def test_missing_required_keys_vlm_rejected():
    incomplete = json.dumps({
        "environment": "room",
        "objects": ["chair"]
    })
    res = parse_and_validate_vlm_output(incomplete)
    assert res["status"] == "rejected"
    assert res["observation"] is None

def test_invalid_types_vlm_rejected():
    bad_type = json.dumps({
        "characters": "a man",
        "environment": "room",
        "physical_actions": ["standing"],
        "objects": [],
        "camera": "close up",
        "uncertainty": "none"
    })
    res = parse_and_validate_vlm_output(bad_type)
    assert res["status"] == "rejected"
    assert res["observation"] is None

def test_invalid_json_string_rejected():
    res = parse_and_validate_vlm_output("not a json string {")
    assert res["status"] == "rejected"
    assert res["observation"] is None
