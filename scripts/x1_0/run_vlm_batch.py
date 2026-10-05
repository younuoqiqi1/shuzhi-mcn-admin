"""
15-Shot VLM 独立子进程批处理调度器 (安全预算版)
支持:
1. --shot-id 指定单 Shot 原子执行;
2. 默认总执行预算 <= 55s，超时自动中断并安全退出;
3. 严格断点续跑，跳过已有结果，避免无限循环;
4. 统一 lifecycle 守护，SIGKILL 并 wait 子进程。
"""
import argparse
import json
import os
import subprocess
import sys
import time

from scripts.x1_0.lifecycle import setup_lifecycle_guard, register_subprocess, unregister_subprocess

import signal

def run_single(shot_id: str, timeout: int = 50) -> bool:
    cmd = [
        "/private/tmp/x1_0/venv/bin/python",
        "scripts/x1_0/run_vlm_single.py",
        "--shot-id", shot_id
    ]
    p = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        preexec_fn=os.setsid
    )
    register_subprocess(p)

    try:
        stdout, stderr = p.communicate(timeout=timeout)
        if p.returncode != 0:
            print(f"[{shot_id}] 执行异常 (code {p.returncode}): {stderr[:200]}", file=sys.stderr)
            return False
        print(stdout.strip())
        return True
    except subprocess.TimeoutExpired:
        print(f"[{shot_id}] 子进程超时 (> {timeout}s)，对进程组发送 SIGKILL 并 wait", file=sys.stderr)
        try:
            pgid = os.getpgid(p.pid)
            os.killpg(pgid, signal.SIGKILL)
            p.wait(timeout=2.0)
        except Exception:
            pass
        return False
    finally:
        unregister_subprocess(p)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--shot-id", type=str, default=None, help="指定跑单个 Shot")
    parser.add_argument("--budget", type=int, default=55, help="总执行时间预算 (1..55 秒)")
    args = parser.parse_args()

    if not (1 <= args.budget <= 55):
        print(f"错误: --budget 必须在 1..55 范围内，当前指定为 {args.budget}", file=sys.stderr)
        sys.exit(1)

    # 配置全局 <= 55s 守卫
    setup_lifecycle_guard(args.budget)

    selected_file = "benchmarks/x1/development/x1_0/selected_15_shots.json"
    if not os.path.exists(selected_file):
        print(f"错误: 盲选清单未找到: {selected_file}", file=sys.stderr)
        sys.exit(1)

    with open(selected_file, "r", encoding="utf-8") as f:
        shots = json.load(f)

    vlm_dir = "benchmarks/x1/predictions/x1_0/vlm_shots"
    os.makedirs(vlm_dir, exist_ok=True)

    if args.shot_id:
        print(f"=== 单 Shot VLM 原子任务: {args.shot_id} ===")
        success = run_single(args.shot_id, timeout=min(50, args.budget))
        sys.exit(0 if success else 1)

    print(f"=== 开始 VLM 断点批处理推进 (总时间预算: {args.budget}s) ===")
    t0 = time.time()

    for idx, s in enumerate(shots, 1):
        s_id = s["shot_id"]
        out_f = f"{vlm_dir}/{s_id}.json"

        # 检查剩余预算
        elapsed = time.time() - t0
        if elapsed >= args.budget - 5:
            print(f"已达到时间预算限制 ({elapsed:.1f}s >= {args.budget}s)，保存当前断点安全退出")
            break

        # 断点续跑检查
        if os.path.exists(out_f):
            try:
                with open(out_f, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if "frames_observation" in data:
                    print(f"[{idx}/15] Shot {s_id} 已存在有效结果，跳过")
                    continue
            except Exception:
                pass

        print(f">>> [{idx}/15] 正在执行 Shot {s_id} (剩余预算: {args.budget - elapsed:.1f}s) <<<")
        run_single(s_id, timeout=min(45, int(args.budget - elapsed)))

    print(f"批处理本轮完成，总耗时: {time.time() - t0:.2f}s")

if __name__ == "__main__":
    main()
