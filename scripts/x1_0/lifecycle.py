"""
统一进程生命周期与超时安全守卫模块
确保所有 AI 脚本全局强制超时 <= 55s，并在 atexit / signal (SIGINT, SIGTERM, SIGALRM) 时
对子进程组强制执行 SIGKILL 并 wait 清理，严禁孤儿进程遗留。
"""
import atexit
import os
import signal
import subprocess
import sys
from typing import Set, Optional

ACTIVE_SUBPROCESSES: Set[subprocess.Popen] = set()

def register_subprocess(p: subprocess.Popen) -> None:
    ACTIVE_SUBPROCESSES.add(p)

def unregister_subprocess(p: subprocess.Popen) -> None:
    ACTIVE_SUBPROCESSES.discard(p)

def cleanup_all_subprocesses() -> None:
    """清理所有已登记的子进程及其进程组并 wait"""
    for p in list(ACTIVE_SUBPROCESSES):
        try:
            if p.poll() is None:
                # 尝试向进程组发送 SIGTERM，随后 SIGKILL
                pgid = os.getpgid(p.pid)
                os.killpg(pgid, signal.SIGKILL)
                p.wait(timeout=1.0)
        except Exception:
            try:
                p.kill()
                p.wait(timeout=1.0)
            except Exception:
                pass
    ACTIVE_SUBPROCESSES.clear()

def _signal_handler(signum, frame):
    cleanup_all_subprocesses()
    if signum == signal.SIGALRM:
        print("\n[LifecycleGuard] 全局执行超时 (>55s) 触发强制终止！", file=sys.stderr)
        sys.exit(124)
    sys.exit(1)

def setup_lifecycle_guard(timeout_sec: int = 55) -> None:
    """
    配置全局生命周期保护：
    1. 注册 atexit 清理函数；
    2. 捕获 SIGINT, SIGTERM, SIGALRM；
    3. 设置 signal.alarm(timeout_sec) 进行硬超时保护。
    """
    atexit.register(cleanup_all_subprocesses)
    try:
        signal.signal(signal.SIGINT, _signal_handler)
        signal.signal(signal.SIGTERM, _signal_handler)
        if hasattr(signal, "SIGALRM"):
            signal.signal(signal.SIGALRM, _signal_handler)
            signal.alarm(timeout_sec)
    except (ValueError, AttributeError):
        # 兼容非主线程调用或受限环境
        pass
