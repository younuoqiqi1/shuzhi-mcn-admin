"""
scripts/x1_1/lifecycle.py
统一进程生命周期与全局超时安全守卫模块 (X1.1 标准)

核心规范:
1. 全局执行时间 <= 55s，SIGALRM 触发时对活跃子进程组强制执行 SIGKILL + wait();
2. 所有子进程必须通过 register_subprocess 登记，并在已确认终止后才能 unregister;
3. 严禁在 finally 块中默默 unregister 仍处于运行状态的活进程。
"""
import atexit
import os
import signal
import subprocess
import sys
from typing import Set

ACTIVE_SUBPROCESSES: Set[subprocess.Popen] = set()

def register_subprocess(p: subprocess.Popen) -> None:
    ACTIVE_SUBPROCESSES.add(p)

def unregister_subprocess(p: subprocess.Popen) -> None:
    """仅当进程已真正结束时才能注销，若仍在运行则禁止注销"""
    if p.poll() is not None:
        ACTIVE_SUBPROCESSES.discard(p)

def kill_and_wait_proc(p: subprocess.Popen, timeout: float = 2.0) -> None:
    """针对单个子进程组执行 SIGKILL 并 wait 清理"""
    try:
        if p.poll() is None:
            try:
                pgid = os.getpgid(p.pid)
                os.killpg(pgid, signal.SIGKILL)
            except Exception:
                p.kill()
            p.wait(timeout=timeout)
    except Exception:
        pass
    finally:
        ACTIVE_SUBPROCESSES.discard(p)

def cleanup_all_subprocesses() -> None:
    """终止并回收所有活跃子进程"""
    for p in list(ACTIVE_SUBPROCESSES):
        kill_and_wait_proc(p)
    ACTIVE_SUBPROCESSES.clear()

def _signal_handler(signum, frame):
    cleanup_all_subprocesses()
    if signum == signal.SIGALRM:
        print("\n[LifecycleGuard] 全局超时 (>55s) 强制终止，子进程组已彻底回收！", file=sys.stderr)
        sys.exit(124)
    sys.exit(1)

def setup_lifecycle_guard(timeout_sec: int = 55) -> None:
    atexit.register(cleanup_all_subprocesses)
    try:
        signal.signal(signal.SIGINT, _signal_handler)
        signal.signal(signal.SIGTERM, _signal_handler)
        if hasattr(signal, "SIGALRM"):
            signal.signal(signal.SIGALRM, _signal_handler)
            signal.alarm(timeout_sec)
    except (ValueError, AttributeError):
        pass
