"""
tests/x1_1/test_providers.py
聚焦测试: 6 字段真实 Schema 校验、AGY CLI 真实 Stream 结构解析与图像工具隔离审计
"""
import io
import json
from PIL import Image
import pytest

from scripts.x1_1.vlm_schema import (
    VLM_OBJECTIVE_SCHEMA,
    validate_vlm_output,
)
from scripts.x1_1.providers import (
    VLMRequest,
    CloudOpenAICompatibleProvider,
    AGYCLIGeminiProvider,
)

SAMPLE_VALID_DATA = {
    "characters": ["A person in dark coat standing upright"],
    "environment": "Dimly lit interior corridor with stone walls",
    "physical_actions": ["Standing motionless facing forward"],
    "objects": ["Wooden door", "Metal handle", "Overhead lamp"],
    "camera": "medium_shot",
    "uncertainty": "Partial facial shadow on the left side, slightly low ambient lighting",
}

@pytest.fixture
def dummy_jpeg_bytes() -> bytes:
    """生成真实的 RGB JPEG 图像字节，供 384x384 标准化函数无异常解码"""
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), color=(50, 100, 150)).save(buf, format="JPEG")
    return buf.getvalue()

def test_schema_valid_passes():
    raw = json.dumps(SAMPLE_VALID_DATA)
    is_valid, parsed, err = validate_vlm_output(raw)
    assert is_valid is True
    assert err is None
    assert parsed == SAMPLE_VALID_DATA

def test_missing_required_field_rejected():
    for req_field in ["characters", "environment", "physical_actions", "objects", "camera", "uncertainty"]:
        bad = dict(SAMPLE_VALID_DATA)
        del bad[req_field]
        is_valid, _, err = validate_vlm_output(json.dumps(bad))
        assert is_valid is False
        assert f"缺失必填字段: ['{req_field}']" in err

def test_extra_fields_rejected():
    bad = dict(SAMPLE_VALID_DATA, plot_guess="Secret agent meeting")
    is_valid, _, err = validate_vlm_output(json.dumps(bad))
    assert is_valid is False
    assert "违反 additionalProperties=False" in err

def test_camera_movement_inference_forbidden():
    bad = dict(SAMPLE_VALID_DATA, camera="fast_pan_left")
    is_valid, _, err = validate_vlm_output(json.dumps(bad))
    assert is_valid is False
    assert "camera 景别值非法" in err

def test_cloud_provider_globally_disabled(dummy_jpeg_bytes):
    prov = CloudOpenAICompatibleProvider()
    dummy_req = VLMRequest("shot_0010_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)
    assert resp.error is not None
    assert "disabled" in resp.error

def test_agy_cli_parses_real_stream_json_structure(monkeypatch, dummy_jpeg_bytes):
    """回退场景测试: 当 result 缺少 structured_output 时，回退使用 response 解析"""
    prov = AGYCLIGeminiProvider()
    expected_anon_filename = "shot_test_f25.jpg"

    stream_events = [
        {"type": "init", "session_id": "sess_123"},
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "view_file",
                "state": "DONE",
                "tool_info": {
                    "parameters": {"AbsolutePath": expected_anon_filename}
                }
            }
        },
        {
            "type": "result",
            "result": {
                "response": json.dumps(SAMPLE_VALID_DATA),
                "usage": {"input_tokens": 120, "output_tokens": 85}
            }
        }
    ]
    stdout_feed = "\n".join(json.dumps(e) for e in stream_events)

    class MockProc:
        returncode = 0
        pid = 12345
        def communicate(self, timeout=None):
            return stdout_feed, ""
        def poll(self):
            return 0

    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: MockProc())
    monkeypatch.setattr("os.getpgid", lambda pid: pid)
    monkeypatch.setattr("os.killpg", lambda pgid, sig: None)

    dummy_req = VLMRequest("shot_test_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)

    assert resp.error is None
    assert resp.parsed_validation == SAMPLE_VALID_DATA
    assert resp.usage == {"input_tokens": 120, "output_tokens": 85}

def test_agy_cli_native_structured_output_and_finish_allowed(monkeypatch, dummy_jpeg_bytes):
    """
    真实 stream-json 核心路径测试:
    1. 允许精确目标 view_file 与无 I/O 结果提交工具 finish;
    2. result.structured_output 为原生 6 字段字典，而 result.response 包含额外元字段 (toolAction/toolSummary);
    3. 优先使用 json.dumps(result.structured_output) 校验成功，不手工删除 response 字段补造结果。
    """
    prov = AGYCLIGeminiProvider()
    expected_anon_filename = "shot_test_f25.jpg"

    polluted_response_data = dict(
        SAMPLE_VALID_DATA,
        toolAction="Submitting objective visual analysis",
        toolSummary="Visual task finish"
    )

    stream_events = [
        {"type": "init", "session_id": "sess_456"},
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "view_file",
                "state": "DONE",
                "tool_info": {
                    "parameters": {"AbsolutePath": expected_anon_filename}
                }
            }
        },
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "finish",
                "state": "DONE",
                "tool_info": {
                    "parameters": {"toolAction": "Submitting analysis", "toolSummary": "Finish"}
                }
            }
        },
        {
            "type": "result",
            "result": {
                "structured_output": SAMPLE_VALID_DATA,
                "response": json.dumps(polluted_response_data),
                "usage": {"input_tokens": 150, "output_tokens": 90}
            }
        }
    ]
    stdout_feed = "\n".join(json.dumps(e) for e in stream_events)

    class MockProc:
        returncode = 0
        pid = 12349
        def communicate(self, timeout=None):
            return stdout_feed, ""
        def poll(self):
            return 0

    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: MockProc())
    monkeypatch.setattr("os.getpgid", lambda pid: pid)
    monkeypatch.setattr("os.killpg", lambda pgid, sig: None)

    dummy_req = VLMRequest("shot_test_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)

    assert resp.error is None
    assert resp.parsed_validation == SAMPLE_VALID_DATA
    assert resp.raw_text == json.dumps(SAMPLE_VALID_DATA, ensure_ascii=False)
    assert resp.usage == {"input_tokens": 150, "output_tokens": 90}

def test_agy_cli_finish_without_view_file_rejected(monkeypatch, dummy_jpeg_bytes):
    """
    仅调用 finish 但未调用 view_file 检查目标图像，必须判定为假成功并拒绝
    """
    prov = AGYCLIGeminiProvider()

    stream_events = [
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "finish",
                "state": "DONE",
                "tool_info": {"parameters": {}}
            }
        },
        {
            "type": "result",
            "result": {
                "structured_output": SAMPLE_VALID_DATA,
                "usage": {}
            }
        }
    ]
    stdout_feed = "\n".join(json.dumps(e) for e in stream_events)

    class MockProc:
        returncode = 0
        pid = 12350
        def communicate(self, timeout=None):
            return stdout_feed, ""
        def poll(self):
            return 0

    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: MockProc())
    monkeypatch.setattr("os.getpgid", lambda pid: pid)
    monkeypatch.setattr("os.killpg", lambda pgid, sig: None)

    dummy_req = VLMRequest("shot_test_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)

    assert resp.error is not None
    assert "未检测到针对目标图片" in resp.error
    assert resp.parsed_validation is None

def test_agy_cli_rejects_illegal_tools_called(monkeypatch, dummy_jpeg_bytes):
    prov = AGYCLIGeminiProvider()
    stream_events = [
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "run_command",
                "state": "DONE",
                "tool_info": {"parameters": {"command": "ls"}}
            }
        },
        {
            "type": "result",
            "result": {
                "response": json.dumps(SAMPLE_VALID_DATA),
                "usage": {}
            }
        }
    ]
    stdout_feed = "\n".join(json.dumps(e) for e in stream_events)

    class MockProc:
        returncode = 0
        pid = 12346
        def communicate(self, timeout=None):
            return stdout_feed, ""
        def poll(self):
            return 0

    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: MockProc())
    monkeypatch.setattr("os.getpgid", lambda pid: pid)
    monkeypatch.setattr("os.killpg", lambda pgid, sig: None)

    dummy_req = VLMRequest("shot_test_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)

    assert resp.error is not None
    assert "违规调用了未经授权的工具" in resp.error

def test_agy_cli_rejects_view_file_on_unauthorized_path(monkeypatch, dummy_jpeg_bytes):
    prov = AGYCLIGeminiProvider()
    unauthorized_path = "/Users/yoyotaozhou/Documents/secret.txt"

    stream_events = [
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "view_file",
                "state": "DONE",
                "tool_info": {
                    "parameters": {"AbsolutePath": unauthorized_path}
                }
            }
        },
        {
            "type": "result",
            "result": {
                "response": json.dumps(SAMPLE_VALID_DATA),
                "usage": {}
            }
        }
    ]
    stdout_feed = "\n".join(json.dumps(e) for e in stream_events)

    class MockProc:
        returncode = 0
        pid = 12347
        def communicate(self, timeout=None):
            return stdout_feed, ""
        def poll(self):
            return 0

    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: MockProc())
    monkeypatch.setattr("os.getpgid", lambda pid: pid)
    monkeypatch.setattr("os.killpg", lambda pgid, sig: None)

    dummy_req = VLMRequest("shot_test_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)

    assert resp.error is not None
    assert "非目标文件路径" in resp.error

def test_agy_cli_denied_actions_takes_precedence_over_done(monkeypatch, dummy_jpeg_bytes):
    """
    关键断言: 即使精确目标 view_file 和 finish 工具均返回 DONE，且包含 structured_output，
    若 result.denied_actions 包含拒绝记录 (如 read_file/ViewFile)，必须优先判定为错误，绝不能以工具 DONE 伪造成功！
    """
    prov = AGYCLIGeminiProvider()
    expected_anon_filename = "shot_test_f25.jpg"

    stream_events = [
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "view_file",
                "state": "DONE",
                "tool_info": {
                    "parameters": {"AbsolutePath": expected_anon_filename}
                }
            }
        },
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "finish",
                "state": "DONE",
                "tool_info": {}
            }
        },
        {
            "type": "result",
            "result": {
                "structured_output": SAMPLE_VALID_DATA,
                "response": json.dumps(SAMPLE_VALID_DATA),
                "usage": {"input_tokens": 100, "output_tokens": 50},
                "denied_actions": ["read_file", "ViewFile"]
            }
        }
    ]
    stdout_feed = "\n".join(json.dumps(e) for e in stream_events)

    class MockProc:
        returncode = 0
        pid = 12348
        def communicate(self, timeout=None):
            return stdout_feed, ""
        def poll(self):
            return 0

    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: MockProc())
    monkeypatch.setattr("os.getpgid", lambda pid: pid)
    monkeypatch.setattr("os.killpg", lambda pgid, sig: None)

    dummy_req = VLMRequest("shot_test_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)

    assert resp.error is not None
    assert "denied_actions" in resp.error
    assert "禁止计为成功" in resp.error
    assert resp.parsed_validation is None

def test_agy_cli_rejects_other_tools_even_with_finish(monkeypatch, dummy_jpeg_bytes):
    """
    即使包含合法目标 view_file 与 finish，只要混入其他任何未授权工具 (如 read_file)，仍必须立即拒绝
    """
    prov = AGYCLIGeminiProvider()
    expected_anon_filename = "shot_test_f25.jpg"
    stream_events = [
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "view_file",
                "state": "DONE",
                "tool_info": {"parameters": {"AbsolutePath": expected_anon_filename}}
            }
        },
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "read_file",
                "state": "DONE",
                "tool_info": {"parameters": {"AbsolutePath": "foo.txt"}}
            }
        },
        {
            "type": "step_update",
            "step_update": {
                "tool_name": "finish",
                "state": "DONE",
                "tool_info": {}
            }
        },
        {
            "type": "result",
            "result": {
                "structured_output": SAMPLE_VALID_DATA,
                "usage": {}
            }
        }
    ]
    stdout_feed = "\n".join(json.dumps(e) for e in stream_events)

    class MockProc:
        returncode = 0
        pid = 12351
        def communicate(self, timeout=None):
            return stdout_feed, ""
        def poll(self):
            return 0

    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: MockProc())
    monkeypatch.setattr("os.getpgid", lambda pid: pid)
    monkeypatch.setattr("os.killpg", lambda pgid, sig: None)

    dummy_req = VLMRequest("shot_test_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)

    assert resp.error is not None
    assert "违规调用了未经授权的工具" in resp.error
    assert "read_file:foo.txt" in resp.error
    assert resp.parsed_validation is None

def test_agy_cli_cmd_and_version_default_pro_low_low(monkeypatch, dummy_jpeg_bytes):
    """
    验证默认模型为 gemini-3.1-pro-low 且 effort 为 low，
    cmd 构造显式包含 --model gemini-3.1-pro-low 和 --effort low，
    model_version 真实记录包含 effort=low。
    """
    captured_cmds = []

    class MockProc:
        returncode = 0
        pid = 12360
        def communicate(self, timeout=None):
            resp_event = {
                "type": "result",
                "result": {"structured_output": SAMPLE_VALID_DATA}
            }
            step_event = {
                "type": "step_update",
                "step_update": {
                    "tool_name": "view_file",
                    "state": "DONE",
                    "tool_info": {"parameters": {"AbsolutePath": "shot_test_f25.jpg"}}
                }
            }
            return f"{json.dumps(step_event)}\n{json.dumps(resp_event)}", ""
        def poll(self):
            return 0

    def mock_popen(cmd, *args, **kwargs):
        captured_cmds.append(cmd)
        return MockProc()

    monkeypatch.setattr("subprocess.Popen", mock_popen)
    monkeypatch.setattr("os.getpgid", lambda pid: pid)
    monkeypatch.setattr("os.killpg", lambda pgid, sig: None)

    prov = AGYCLIGeminiProvider()
    assert prov.model_name == "gemini-3.1-pro-low"
    assert prov.effort == "low"
    assert prov.model_version == "agy-cli:gemini-3.1-pro-low:effort=low"
    assert "effort=low" in prov.model_version

    dummy_req = VLMRequest("shot_test_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)

    assert len(captured_cmds) == 1
    cmd = captured_cmds[0]
    assert "--model" in cmd
    assert cmd[cmd.index("--model") + 1] == "gemini-3.1-pro-low"
    assert "--effort" in cmd
    assert cmd[cmd.index("--effort") + 1] == "low"
    assert resp.model_version == "agy-cli:gemini-3.1-pro-low:effort=low"
    assert resp.error is None
    assert resp.parsed_validation == SAMPLE_VALID_DATA

def test_agy_cli_high_model_with_high_effort_matched(monkeypatch, dummy_jpeg_bytes):
    """
    验证显式配置 gemini-3.1-pro-high 与 effort=high 正确匹配，
    cmd 构造与 model_version 真实记录 high 属性，不误称为低 effort。
    """
    captured_cmds = []

    class MockProc:
        returncode = 0
        pid = 12361
        def communicate(self, timeout=None):
            resp_event = {
                "type": "result",
                "result": {"structured_output": SAMPLE_VALID_DATA}
            }
            step_event = {
                "type": "step_update",
                "step_update": {
                    "tool_name": "view_file",
                    "state": "DONE",
                    "tool_info": {"parameters": {"AbsolutePath": "shot_test_f25.jpg"}}
                }
            }
            return f"{json.dumps(step_event)}\n{json.dumps(resp_event)}", ""
        def poll(self):
            return 0

    def mock_popen(cmd, *args, **kwargs):
        captured_cmds.append(cmd)
        return MockProc()

    monkeypatch.setattr("subprocess.Popen", mock_popen)
    monkeypatch.setattr("os.getpgid", lambda pid: pid)
    monkeypatch.setattr("os.killpg", lambda pgid, sig: None)

    prov = AGYCLIGeminiProvider(model_name="gemini-3.1-pro-high", effort="high")
    assert prov.model_name == "gemini-3.1-pro-high"
    assert prov.effort == "high"
    assert prov.model_version == "agy-cli:gemini-3.1-pro-high:effort=high"

    dummy_req = VLMRequest("shot_test_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)

    cmd = captured_cmds[0]
    assert cmd[cmd.index("--model") + 1] == "gemini-3.1-pro-high"
    assert cmd[cmd.index("--effort") + 1] == "high"
    assert resp.model_version == "agy-cli:gemini-3.1-pro-high:effort=high"

def test_agy_cli_env_variables_matched_and_applied(monkeypatch):
    """
    验证通过 AGY_VISION_MODEL 和 AGY_VISION_EFFORT 环境变量配置且匹配成功。
    """
    monkeypatch.setenv("AGY_VISION_MODEL", "gemini-3.1-pro-high")
    monkeypatch.setenv("AGY_VISION_EFFORT", "high")
    prov = AGYCLIGeminiProvider()
    assert prov.model_name == "gemini-3.1-pro-high"
    assert prov.effort == "high"
    assert prov.model_version == "agy-cli:gemini-3.1-pro-high:effort=high"

def test_agy_cli_combination_conflicts_rejected(monkeypatch):
    """
    验证真实组合冲突在构造时被拦截抛出 ValueError:
    1. pro-high + effort=low 冲突；
    2. 默认 effort(low) 下只传 pro-high 冲突；
    3. pro-low + effort=high 冲突；
    4. 环境变量组合冲突 (pro-high + low)。
    """
    # 1. 显式 high + low
    with pytest.raises(ValueError, match="冲突.*不匹配"):
        AGYCLIGeminiProvider(model_name="gemini-3.1-pro-high", effort="low")

    # 2. 默认 effort(low) + 仅指定 high 模型
    with pytest.raises(ValueError, match="冲突.*不匹配"):
        AGYCLIGeminiProvider(model_name="gemini-3.1-pro-high")

    # 3. 显式 low + high
    with pytest.raises(ValueError, match="冲突.*不匹配"):
        AGYCLIGeminiProvider(model_name="gemini-3.1-pro-low", effort="high")

    # 4. 环境变量导致冲突
    monkeypatch.setenv("AGY_VISION_MODEL", "gemini-3.1-pro-high")
    monkeypatch.setenv("AGY_VISION_EFFORT", "low")
    with pytest.raises(ValueError, match="冲突.*不匹配"):
        AGYCLIGeminiProvider()

def test_agy_cli_whitelist_rejection_for_unknown_model_or_effort(monkeypatch):
    """
    验证非白名单模型与 effort 在构造时被白名单拦截抛出 ValueError。
    """
    with pytest.raises(ValueError, match="非法 AGY vision model"):
        AGYCLIGeminiProvider(model_name="gemini-1.5-pro", effort="low")

    with pytest.raises(ValueError, match="非法 AGY vision effort"):
        AGYCLIGeminiProvider(model_name="gemini-3.1-pro-low", effort="medium")

    monkeypatch.setenv("AGY_VISION_MODEL", "unsupported-model")
    with pytest.raises(ValueError, match="非法 AGY vision model"):
        AGYCLIGeminiProvider()

def test_agy_cli_conflict_cli_exit_code_failure_not_treated_as_success(monkeypatch, dummy_jpeg_bytes):
    """
    验证如果 CLI 出现冲突退出 (退出码非零，stderr 返回冲突信息)，
    必须将错误记录在 error 中，parsed_validation 必须为 None，绝对不能算推理成功！
    """
    class MockConflictProc:
        returncode = 1
        pid = 12362
        def communicate(self, timeout=None):
            return "", "invalid model selection: --model gemini-3.1-pro-high conflicts with --effort=low"
        def poll(self):
            return 1

    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: MockConflictProc())
    monkeypatch.setattr("os.getpgid", lambda pid: pid)
    monkeypatch.setattr("os.killpg", lambda pgid, sig: None)

    prov = AGYCLIGeminiProvider()
    dummy_req = VLMRequest("shot_test_f25", dummy_jpeg_bytes, "prompt")
    resp = prov.generate(dummy_req)

    assert resp.error is not None
    assert "AGY CLI 退出码非零 (1)" in resp.error
    assert "conflicts with --effort=low" in resp.error
    assert resp.parsed_validation is None

