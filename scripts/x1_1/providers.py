"""
scripts/x1_1/providers.py
VLM 抽象 Provider 接口体系 (X1.1 真实 Stream 结构与像素统一标准)

修正点:
1. LocalMLXProvider: 严格从 mlx_vlm.prompt_utils 导入 apply_chat_template;
2. 统一输入 384x384 JPEG 像素处理，消除 PIL 与 CLI 重新编码差异，并分别记录 source_image_hash 与 inference_image_hash;
3. AGYCLIGeminiProvider:
   - 正确解析真实 stream-json 结构: event["step_update"] (仅允许精确目标 view_file 与无 I/O 结果提交工具 finish) 与 event["result"] (优先 structured_output 原生六字段对象，缺失时回退 response/usage);
   - 增加 --json-schema jsonstring 严格约束结构;
   - 显式配置默认 model 为 gemini-3.1-pro-low 和 --effort low，支持 AGY_VISION_MODEL/AGY_VISION_EFFORT 环境变量白名单校验及各自 low/high 匹配，记录真实 model_version；
   - cwd 设为 /private/tmp/x1_1/agy_sandbox 隔绝工作区历史;
   - 严格审查 tooltrace: 仅允许精确目标 view_file 和 finish，出现任何其他工具立刻判定为非法工具调用错误，result.denied_actions 优先拒绝;
   - 记录完整 rawstream 日志至 benchmarks/x1/runs/x1_1/。
"""
import base64
from dataclasses import dataclass, field
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
from typing import Any, Dict, Optional, List, Tuple
from PIL import Image
import io

from scripts.x1_1.vlm_schema import VLM_OBJECTIVE_SCHEMA, validate_vlm_output
from scripts.x1_1.lifecycle import register_subprocess, unregister_subprocess, kill_and_wait_proc

ANON_IMG_DIR = "/private/tmp/x1_1/anonymous_frames"
AGY_SANDBOX_DIR = "/private/tmp/x1_1/agy_sandbox"
RUNS_DIR = "benchmarks/x1/runs/x1_1"

ALLOWED_AGY_MODELS = {"gemini-3.1-pro-low", "gemini-3.1-pro-high"}
ALLOWED_AGY_EFFORTS = {"low", "high"}
MODEL_TO_EFFORT_MAP = {
    "gemini-3.1-pro-low": "low",
    "gemini-3.1-pro-high": "high",
}
DEFAULT_AGY_MODEL = "gemini-3.1-pro-low"
DEFAULT_AGY_EFFORT = "low"

class ProviderUnavailableError(RuntimeError):
    pass

class MissingCredentialsError(RuntimeError):
    pass

class ProviderExecutionError(RuntimeError):
    pass

@dataclass
class VLMRequest:
    frame_id: str
    frame_bytes: bytes
    prompt: str
    schema: Dict[str, Any] = field(default_factory=lambda: VLM_OBJECTIVE_SCHEMA)
    max_tokens: int = 512
    temperature: float = 0.0
    resize_dim: int = 384

    def compute_source_hash(self) -> str:
        return hashlib.sha256(self.frame_bytes).hexdigest()

    def get_standardized_inference_bytes(self) -> Tuple[bytes, str]:
        """
        统一将原始图像一次性缩放并编码为 384x384 JPEG，供两 Provider 共享相同像素与真实哈希
        """
        pil_img = Image.open(io.BytesIO(self.frame_bytes)).convert("RGB")
        pil_img = pil_img.resize((self.resize_dim, self.resize_dim))
        buf = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=90)
        std_bytes = buf.getvalue()
        inf_hash = hashlib.sha256(std_bytes).hexdigest()
        return std_bytes, inf_hash

    def compute_prompt_schema_hash(self) -> str:
        content = self.prompt + json.dumps(self.schema, sort_keys=True)
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

@dataclass
class VLMResponse:
    raw_text: str
    parsed_validation: Optional[Dict[str, Any]]
    error: Optional[str]
    latency_ms: float
    model_version: str
    usage: Dict[str, Any]
    source_image_hash: str
    inference_image_hash: str
    prompt_schema_hash: str
    cost: str = "unknown"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "raw_text": self.raw_text,
            "parsed_validation": self.parsed_validation,
            "error": self.error,
            "latency_ms": round(self.latency_ms, 2),
            "model_version": self.model_version,
            "usage": self.usage,
            "source_image_hash": self.source_image_hash,
            "inference_image_hash": self.inference_image_hash,
            "prompt_schema_hash": self.prompt_schema_hash,
            "cost": self.cost,
        }

class BaseVLMProvider:
    def generate(self, req: VLMRequest) -> VLMResponse:
        raise NotImplementedError

class LocalMLXProvider(BaseVLMProvider):
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or os.environ.get(
            "LOCAL_MLX_MODEL_PATH",
            "/private/tmp/x1_0/models/Qwen2-VL-2B-Instruct-4bit"
        )
        self.model_version = f"local-mlx:{os.path.basename(self.model_path)}"
        self._model = None
        self._processor = None

    def _ensure_loaded(self):
        if self._model is not None:
            return
        if not os.path.exists(self.model_path):
            raise ProviderExecutionError(
                f"本地 MLX 模型路径不存在: {self.model_path}。请检查路径或配置 LOCAL_MLX_MODEL_PATH"
            )
        from mlx_vlm import load
        self._model, self._processor = load(self.model_path)

    def generate(self, req: VLMRequest) -> VLMResponse:
        src_hash = req.compute_source_hash()
        inf_bytes, inf_hash = req.get_standardized_inference_bytes()
        ps_hash = req.compute_prompt_schema_hash()
        start_time = time.perf_counter()

        try:
            self._ensure_loaded()
            from mlx_vlm import generate
            from mlx_vlm.structured import build_json_schema_logits_processor
            # 真实 API 路径: mlx_vlm.prompt_utils
            from mlx_vlm.prompt_utils import apply_chat_template

            pil_img = Image.open(io.BytesIO(inf_bytes))
            tokenizer = self._processor.tokenizer if hasattr(self._processor, "tokenizer") else self._processor
            lp = build_json_schema_logits_processor(tokenizer, req.schema)

            formatted_prompt = apply_chat_template(
                self._processor,
                config=self._model.config,
                prompt=req.prompt,
                num_images=1
            )

            gen_result = generate(
                self._model,
                self._processor,
                prompt=formatted_prompt,
                image=[pil_img],
                max_tokens=req.max_tokens,
                temperature=req.temperature,
                logits_processors=[lp],
                verbose=False
            )

            latency = (time.perf_counter() - start_time) * 1000.0
            raw_text = getattr(gen_result, "text", str(gen_result))

            prompt_tokens = getattr(gen_result, "prompt_tokens", "unknown")
            generation_tokens = getattr(gen_result, "generation_tokens", "unknown")

            is_valid, parsed, val_err = validate_vlm_output(raw_text)

            return VLMResponse(
                raw_text=raw_text,
                parsed_validation=parsed if is_valid else None,
                error=val_err,
                latency_ms=latency,
                model_version=self.model_version,
                usage={"prompt_tokens": prompt_tokens, "completion_tokens": generation_tokens},
                source_image_hash=src_hash,
                inference_image_hash=inf_hash,
                prompt_schema_hash=ps_hash,
                cost="unknown"
            )
        except Exception as e:
            latency = (time.perf_counter() - start_time) * 1000.0
            return VLMResponse(
                raw_text="",
                parsed_validation=None,
                error=f"LocalMLXProvider 异常: {str(e)}",
                latency_ms=latency,
                model_version=self.model_version,
                usage={"prompt_tokens": 0, "completion_tokens": 0},
                source_image_hash=src_hash,
                inference_image_hash=inf_hash,
                prompt_schema_hash=ps_hash,
                cost="unknown"
            )

class AGYCLIGeminiProvider(BaseVLMProvider):
    def __init__(self, model_name: Optional[str] = None, effort: Optional[str] = None):
        target_model = model_name
        if target_model is None:
            target_model = os.environ.get("AGY_VISION_MODEL", DEFAULT_AGY_MODEL)

        clean_model = target_model.strip().lower() if isinstance(target_model, str) else ""
        if clean_model not in ALLOWED_AGY_MODELS:
            raise ValueError(
                f"非法 AGY vision model 配置: '{target_model}'。白名单仅允许: {sorted(ALLOWED_AGY_MODELS)}"
            )

        target_effort = effort
        if target_effort is None:
            target_effort = os.environ.get("AGY_VISION_EFFORT", DEFAULT_AGY_EFFORT)

        clean_effort = target_effort.strip().lower() if isinstance(target_effort, str) else ""
        if clean_effort not in ALLOWED_AGY_EFFORTS:
            raise ValueError(
                f"非法 AGY vision effort 配置: '{target_effort}'。白名单仅允许: {sorted(ALLOWED_AGY_EFFORTS)}"
            )

        expected_effort = MODEL_TO_EFFORT_MAP[clean_model]
        if clean_effort != expected_effort:
            raise ValueError(
                f"模型与 effort 冲突: --model {clean_model} 与 --effort={clean_effort} 不匹配！"
                f"必须与各自 low/high 匹配 (--effort={expected_effort})，禁止将 high 模型说成低 effort"
            )

        self.model_name = clean_model
        self.effort = clean_effort
        self.model_version = f"agy-cli:{self.model_name}:effort={self.effort}"

    def generate(self, req: VLMRequest) -> VLMResponse:
        src_hash = req.compute_source_hash()
        inf_bytes, inf_hash = req.get_standardized_inference_bytes()
        ps_hash = req.compute_prompt_schema_hash()
        start_time = time.perf_counter()

        # 1. 每次请求建立独立子目录，自身只放置该匿名图片，并以此作为 cwd
        run_ts = int(time.time() * 1000)
        frame_sandbox_dir = os.path.join(AGY_SANDBOX_DIR, f"run_{req.frame_id}_{run_ts}")
        os.makedirs(frame_sandbox_dir, exist_ok=True)
        anon_img_path = os.path.join(frame_sandbox_dir, f"{req.frame_id}.jpg")
        with open(anon_img_path, "wb") as f:
            f.write(inf_bytes)

        schema_json_str = json.dumps(req.schema, ensure_ascii=False)

        cli_prompt = (
            f"You are an objective visual analysis system. "
            f"You MUST use the view_file tool to inspect the image at '{anon_img_path}'. "
            f"Do NOT call any search, bash, read, or web tools. Inspect only that single image file. "
            f"Requirements:\n"
            f"{req.prompt}\n"
            f"Strictly output the raw JSON object and nothing else."
        )

        cmd = [
            "agy",
            "--model", self.model_name,
            "--effort", self.effort,
            "--mode", "plan",
            "--output-format", "stream-json",
            "--print-timeout", "50s",
            "--json-schema", schema_json_str,
            "--print", cli_prompt
        ]

        p = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=frame_sandbox_dir, # 独立子目录自身只包含该图片
            preexec_fn=os.setsid
        )
        register_subprocess(p)

        raw_stream_lines: List[str] = []
        has_view_file_done = False
        illegal_tools_called = []
        denied_actions_list = []
        final_response_text = ""
        cli_usage = {}
        error_msg = None

        try:
            stdout_text, stderr_text = p.communicate(timeout=50.0)
            if p.returncode != 0 and p.returncode is not None:
                error_msg = f"AGY CLI 退出码非零 ({p.returncode}): {stderr_text[:300]}"

            for line in stdout_text.splitlines():
                raw_stream_lines.append(line)
                line_str = line.strip()
                if not line_str.startswith("{"):
                    continue
                try:
                    event = json.loads(line_str)

                    # 检查事件中的 denied_actions
                    d_top = event.get("denied_actions")
                    if d_top:
                        if isinstance(d_top, list):
                            denied_actions_list.extend(d_top)
                        else:
                            denied_actions_list.append(str(d_top))

                    # 真实结构 1: step_update
                    if "step_update" in event:
                        step_data = event["step_update"]
                        t_name = step_data.get("tool_name") or step_data.get("tool") or ""
                        state = step_data.get("state") or step_data.get("status") or ""
                        tool_info = step_data.get("tool_info") or {}
                        params = tool_info.get("parameters") or step_data.get("parameters") or {}
                        file_arg = params.get("AbsolutePath") or params.get("path") or ""

                        if t_name == "view_file":
                            # 核验路径必须是目标图片 (绝对路径或相对路径)
                            norm_file = os.path.normpath(file_arg) if file_arg else ""
                            norm_target = os.path.normpath(anon_img_path)
                            norm_rel = os.path.normpath(os.path.join(frame_sandbox_dir, file_arg)) if file_arg else ""
                            if norm_file != norm_target and norm_rel != norm_target and norm_file != f"{req.frame_id}.jpg":
                                illegal_tools_called.append(f"view_file_unauthorized_path:{file_arg}")
                            else:
                                if state in ("DONE", "done", "success", "completed"):
                                    has_view_file_done = True
                        elif t_name == "finish":
                            # finish 是 CLI 必需的无 I/O 结果提交工具，允许仅此 finish
                            pass
                        elif t_name:
                            illegal_tools_called.append(f"{t_name}:{file_arg}")

                    # 真实结构 2: result
                    if "result" in event:
                        res_data = event["result"]
                        # 优先直接使用符合 --json-schema 的原生 structured_output，保留原始 stream 不手工删除字段补造结果；无 structured_output 才使用 response
                        s_out = res_data.get("structured_output")
                        if s_out is not None:
                            final_response_text = json.dumps(s_out, ensure_ascii=False) if not isinstance(s_out, str) else s_out
                        else:
                            final_response_text = res_data.get("response") or res_data.get("result") or ""
                        cli_usage = res_data.get("usage") or {}
                        d_res = res_data.get("denied_actions")
                        if d_res:
                            if isinstance(d_res, list):
                                denied_actions_list.extend(d_res)
                            else:
                                denied_actions_list.append(str(d_res))

                except Exception:
                    pass

        except subprocess.TimeoutExpired as exc:
            kill_and_wait_proc(p, timeout=2.0)
            if exc.stdout:
                raw_stream_lines.extend(exc.stdout.splitlines())
            error_msg = f"AGY CLI 执行超时 (>50s)，已对进程组执行 SIGKILL 并保留 partial stdout"
        finally:
            kill_and_wait_proc(p, timeout=1.0)
            unregister_subprocess(p)

        latency = (time.perf_counter() - start_time) * 1000.0

        os.makedirs(RUNS_DIR, exist_ok=True)
        stream_log_path = os.path.join(RUNS_DIR, f"agy_stream_{req.frame_id}.jsonl")
        try:
            with open(stream_log_path, "w", encoding="utf-8") as f:
                f.write("\n".join(raw_stream_lines))
        except Exception:
            pass

        # 核心真实性准则: result.denied_actions 必须优先于 DONE 判定，不能以工具 DONE 证明读取成功
        if not error_msg:
            if denied_actions_list:
                error_msg = f"AGY CLI 存在被拒绝的操作 (denied_actions: {denied_actions_list})，禁止计为成功！"
            elif illegal_tools_called:
                error_msg = f"AGY CLI 违规调用了未经授权的工具或非目标文件路径: {illegal_tools_called}，违反图像审查隔离规则！"
            elif not has_view_file_done:
                error_msg = f"AGY CLI 未检测到针对目标图片 ({anon_img_path}) 的 view_file DONE 工具调用记录，禁止假成功！"
            elif not final_response_text:
                error_msg = "AGY CLI 未在 event[result] 中返回响应文本"

        is_valid, parsed, val_err = validate_vlm_output(final_response_text)
        final_err = error_msg or val_err

        return VLMResponse(
            raw_text=final_response_text,
            parsed_validation=parsed if is_valid and not error_msg else None,
            error=final_err,
            latency_ms=latency,
            model_version=self.model_version,
            usage=cli_usage,
            source_image_hash=src_hash,
            inference_image_hash=inf_hash,
            prompt_schema_hash=ps_hash,
            cost="unknown"
        )

class CloudOpenAICompatibleProvider(BaseVLMProvider):
    def __init__(self, **kwargs):
        self.enabled = False

    def generate(self, req: VLMRequest) -> VLMResponse:
        src_hash = req.compute_source_hash()
        _, inf_hash = req.get_standardized_inference_bytes()
        ps_hash = req.compute_prompt_schema_hash()
        return VLMResponse(
            raw_text="",
            parsed_validation=None,
            error="CloudOpenAICompatibleProvider 处于全局 disabled 状态，本轮严禁云 API 接入调用！",
            latency_ms=0.0,
            model_version="cloud-disabled",
            usage={},
            source_image_hash=src_hash,
            inference_image_hash=inf_hash,
            prompt_schema_hash=ps_hash,
            cost="unknown"
        )
