"""
真实 Objective VLM 视觉理解管道 (mlx-vlm)
必须实际喂入每 Shot 的三帧 (25%/50%/75%) 并逐帧并列保存观察。
适配 mlx_vlm 返回对象包含 .text 属性的真实 API。
严格无先验、纯客观物理属性提取。
支持本地模型目录路径与官方 repo 标识。
"""
import hashlib
import json
import os
import time
from typing import List, Dict, Any
from scripts.x1_0.contract import parse_and_validate_vlm_output
from scripts.x1_0.isolation_guard import assert_safe_path

OBJECTIVE_VLM_PROMPT = """You are an objective computer vision observer.
Analyze the provided video frame strictly based on visible physical facts.
Rules:
1. Do NOT guess names, identities, emotions, intentions, character roles, or story plot.
2. Focus ONLY on visible physical characteristics: clothing, environment, physical actions, detected objects, camera framing, and uncertainties.
3. Respond ONLY with a valid JSON object matching the following structure:
{
  "characters": ["description of visible person appearances, e.g., 'a person wearing a dark coat'"],
  "environment": "description of physical setting, lighting, indoor/outdoor",
  "physical_actions": ["concrete physical movements, e.g., 'sitting at desk', 'walking'"],
  "objects": ["visible objects, e.g., 'wooden chair', 'telephone', 'lamp'"],
  "camera": "shot scale, e.g., 'close-up', 'medium shot', 'wide shot'",
  "uncertainty": "any blur, low light, or occlusions"
}
"""

def hash_file(file_path: str) -> str:
    with open(file_path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()

def run_vlm_on_shot(
    frames: List[str],
    model_name: str = "/private/tmp/x1_0/models/Qwen2-VL-2B-Instruct-4bit",
    prompt: str = OBJECTIVE_VLM_PROMPT,
    max_tokens: int = 256,
    temperature: float = 0.0
) -> Dict[str, Any]:
    assert_safe_path(model_name)
    if not frames:
        raise ValueError("输入帧列表为空，无法进行 VLM 分析")

    for f in frames:
        assert_safe_path(f)
        if not os.path.exists(f):
            raise FileNotFoundError(f"帧文件不存在: {f}")

    is_local_dir = os.path.isdir(model_name)
    valid_prefixes = ["mlx-community/", "HuggingFaceTB/"]
    is_valid_repo = any(model_name.startswith(p) for p in valid_prefixes)

    if not (is_local_dir or is_valid_repo):
        raise ValueError(f"未知或非法的 VLM 模型路径/名称: '{model_name}'。缺模型严禁模拟！")

    frame_hashes = {os.path.basename(f): hash_file(f) for f in frames}
    prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()

    import mlx_vlm
    from mlx_vlm import load, generate

    t0 = time.time()
    try:
        model, processor = load(model_name)
    except Exception as e:
        raise RuntimeError(f"VLM 模型加载失败: {e}")

    frames_observation = {}
    overall_status = "success"

    # 对传入的每一帧 (25%, 50%, 75%) 分别独立进行真实推理与并列保存
    for frame_path in frames:
        frame_name = os.path.basename(frame_path)
        t_frame_start = time.time()
        try:
            formatted_prompt = mlx_vlm.prompt_utils.apply_chat_template(
                processor,
                config=model.config,
                prompt=prompt,
                num_images=1
            )
            
            gen_res = generate(
                model,
                processor,
                formatted_prompt,
                image=[frame_path],
                resize_shape=(384, 384),
                max_tokens=max_tokens,
                temperature=temperature,
                verbose=False
            )
            raw_output = gen_res.text if hasattr(gen_res, "text") else str(gen_res)
            val_res = parse_and_validate_vlm_output(raw_output)
            
            if val_res["status"] != "success":
                overall_status = "has_rejected_frames"

            frames_observation[frame_name] = {
                "frame_ref": frame_name,
                "frame_hash": frame_hashes[frame_name],
                "status": val_res["status"],
                "observation": val_res["observation"],
                "raw_output": raw_output,
                "reason": val_res.get("reason"),
                "elapsed_sec": round(time.time() - t_frame_start, 3),
            }
        except Exception as fe:
            frames_observation[frame_name] = {
                "frame_ref": frame_name,
                "frame_hash": frame_hashes.get(frame_name, ""),
                "status": "error",
                "error": str(fe),
                "observation": None,
                "raw_output": "",
                "elapsed_sec": round(time.time() - t_frame_start, 3),
            }
            overall_status = "has_errors"

    total_elapsed = time.time() - t0

    return {
        "model": model_name,
        "prompt_hash": prompt_hash,
        "frame_hashes": frame_hashes,
        "elapsed_sec": round(total_elapsed, 3),
        "status": overall_status,
        "frames_observation": frames_observation,
    }
