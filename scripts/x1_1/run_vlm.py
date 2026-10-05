"""
scripts/x1_1/run_vlm.py
VLM 推理执行单次原子 Runner (X1.1 标准)

特性:
1. 全局 55s 守卫;
2. 严格限定处理原 45 个 Anchor 帧之一;
3. 提示词严禁推测情绪、关系、目的、剧情、名字或对白，禁从单帧推测运镜;
4. 生产入口仅允许 --provider agy-gemini (默认)，已删除全部本地模型，历史类保留但生产入口禁止运行本地模型;
5. 结果原子落盘至 benchmarks/x1/predictions/x1_1/。
"""
import argparse
import json
import os
import re
import sys
import time

from scripts.x1_1.lifecycle import setup_lifecycle_guard
from scripts.x1_1.isolation_guard import assert_safe_path, assert_vlm_input_safe
from scripts.x1_1.vlm_schema import VLM_OBJECTIVE_SCHEMA
from scripts.x1_1.providers import (
    VLMRequest,
    LocalMLXProvider,
    AGYCLIGeminiProvider,
    CloudOpenAICompatibleProvider,
)

VALID_PARENT_SHOTS = [
    "shot_0010", "shot_0018", "shot_0019", "shot_0026", "shot_0035",
    "shot_0053", "shot_0055", "shot_0056", "shot_0069", "shot_0070",
    "shot_0095", "shot_0117", "shot_0133", "shot_0137", "shot_0149"
]

OBJECTIVE_VLM_PROMPT = (
    "Analyze the single video frame objectively. "
    "Strictly output a valid JSON object matching the requested schema with all 6 required fields. "
    "Do NOT infer emotion, interpersonal relationships, subjective goals, narrative plot, character names, or dialogue. "
    "Describe only visually observable features. "
    "Do NOT infer camera movement from a single frame. "
    "In 'uncertainty', explicitly note any visible occlusions, blurriness, darkness, or reflections."
)

def parse_frame_id(frame_id: str):
    m = re.match(r"^(shot_\d{4})_(?:frame_)?(25|50|75)$", frame_id)
    if not m:
        raise ValueError(
            f"非法的 frame-id: '{frame_id}'。必须属于原 45 个 Anchor 帧之一 (如 shot_0010_25, shot_0055_50)"
        )
    shot_id, pct = m.group(1), m.group(2)
    if shot_id not in VALID_PARENT_SHOTS:
        raise ValueError(f"Shot '{shot_id}' 不在 X1.0 锁定的 15 个盲样母区间内")
    return shot_id, pct

def locate_frame_file(frames_dir: str, shot_id: str, pct: str) -> str:
    candidates = [
        os.path.join(frames_dir, shot_id, f"frame_{pct}.jpg"),
        os.path.join("/private/tmp/x1_0/frames", shot_id, f"frame_{pct}.jpg"),
        os.path.join("/private/tmp/x1_1/frames", shot_id, f"frame_{pct}.jpg"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]

def main():
    setup_lifecycle_guard(55)

    parser = argparse.ArgumentParser(description="VLM 单帧原子化推理评测 Runner (<=55s)")
    parser.add_argument(
        "--provider",
        type=str,
        default="agy-gemini",
        choices=["agy-gemini", "local-mlx", "cloud-disabled"],
        help="VLM Provider: 生产入口仅允许 agy-gemini (默认: agy-gemini)。已删除全部本地模型，禁止运行 local-mlx。"
    )
    parser.add_argument(
        "--frame-id",
        type=str,
        required=True,
        help="目标 Anchor 帧 ID (如 shot_0010_25, shot_0055_50)"
    )
    parser.add_argument(
        "--frames-dir",
        type=str,
        default="/private/tmp/x1_0/frames",
        help="抽取帧根目录"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="benchmarks/x1/predictions/x1_1",
        help="结果落盘目录"
    )
    args = parser.parse_args()

    assert_safe_path(args.frames_dir)
    assert_safe_path(args.output_dir)
    assert_vlm_input_safe(OBJECTIVE_VLM_PROMPT)

    # 严格生产入口防护: 已删除全部下载模型，不再运行本地模型；仅允许已登录 CLI 的 agy-gemini
    if args.provider != "agy-gemini":
        print(
            f"错误: 生产入口仅允许 'agy-gemini'。已删除全部本地下载模型，禁止运行本地模型 (请求: {args.provider})。",
            file=sys.stderr
        )
        raise RuntimeError(
            f"生产入口禁止运行 '{args.provider}'。已删除全部下载模型，仅允许经已登录 CLI 的 agy-gemini。"
        )

    shot_id, pct = parse_frame_id(args.frame_id)
    frame_path = locate_frame_file(args.frames_dir, shot_id, pct)

    print(f"=== [VLM Runner] Provider={args.provider} | Target Frame={args.frame_id} ===")
    print(f"帧路径: {frame_path}")

    if not os.path.exists(frame_path):
        print(f"错误: 目标帧文件不存在: {frame_path}", file=sys.stderr)
        sys.exit(2)

    with open(frame_path, "rb") as f:
        frame_bytes = f.read()

    req = VLMRequest(
        frame_id=f"{shot_id}_frame_{pct}",
        frame_bytes=frame_bytes,
        prompt=OBJECTIVE_VLM_PROMPT,
        schema=VLM_OBJECTIVE_SCHEMA,
        max_tokens=512,
        temperature=0.0,
        resize_dim=384
    )

    # 历史 LocalMLXProvider/CloudOpenAICompatibleProvider 类保留在 codebase 中作为参考，但生产入口仅运行 agy-gemini
    provider = AGYCLIGeminiProvider()

    resp = provider.generate(req)

    os.makedirs(args.output_dir, exist_ok=True)
    out_file = os.path.join(args.output_dir, f"vlm_{args.provider.replace('-', '_')}_{shot_id}_f{pct}.json")

    record = {
        "provider": args.provider,
        "frame_id": req.frame_id,
        "shot_id": shot_id,
        "frame_pct": pct,
        "frame_path": frame_path,
        "response": resp.to_dict(),
        "timestamp": time.time(),
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)

    print(f"推理完成! 状态: {'成功' if resp.error is None else '失败/告警'}")
    if resp.error:
        print(f"错误详情: {resp.error}", file=sys.stderr)
    print(f"耗时: {resp.latency_ms:.1f}ms | 结果落盘: {out_file}")

    if resp.error is not None:
        sys.exit(1)

if __name__ == "__main__":
    main()
