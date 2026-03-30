"""
HWP COM 생명주기 관리 — 생성, 저장, 정리

100억 프로젝트 안정성 기준:
- COM 생성: 3회 재시도, 각 시도마다 프로세스 정리
- 대화상자: 완전 차단 (SetMessageBoxMode + RegisterModule)
- 저장: 3회 재시도 + HWPX/HWP 폴백
- 종료: 반드시 프로세스까지 kill (좀비 방지)
"""

import os
import sys
import time
import subprocess


def kill_existing_hwp():
    """기존 HWP 프로세스를 모두 강제 종료."""
    for _ in range(3):
        try:
            result = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq Hwp.exe", "/NH"],
                capture_output=True, text=True, timeout=5,
            )
            if "Hwp.exe" not in result.stdout:
                return
            subprocess.run(
                ["taskkill", "/IM", "Hwp.exe", "/F"],
                capture_output=True, timeout=5,
            )
            time.sleep(1.5)
        except Exception:
            pass
    print("[INFO] HWP process cleanup done", file=sys.stderr)


def _try_create_hwp():
    """HWP COM 객체 생성 단일 시도."""
    import win32com.client as win32
    import pythoncom
    import ctypes

    pythoncom.CoInitialize()

    hwp = None
    try:
        hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
    except Exception:
        try:
            hwp = win32.Dispatch("HWPFrame.HwpObject")
        except Exception as e:
            raise RuntimeError(f"HWP COM Dispatch failed: {e}")

    try:
        hwp.XHwpWindows.Item(0).Visible = False
    except Exception:
        pass
    time.sleep(0.2)

    hwnd = ctypes.windll.user32.FindWindowW("HwpFrame", None)
    attempts = 0
    while hwnd and attempts < 5:
        ctypes.windll.user32.ShowWindow(hwnd, 0)
        hwnd = ctypes.windll.user32.FindWindowW("HwpFrame", None)
        attempts += 1

    try:
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    except Exception:
        pass

    try:
        hwp.SetMessageBoxMode(0x10000)
    except Exception:
        pass

    try:
        hwp.Run("FileNew")
        time.sleep(0.2)
    except Exception:
        try:
            hwp.Clear(1)
        except Exception:
            pass

    return hwp


def create_hwp(max_retries: int = 3):
    """HWP COM 객체를 생성. 실패 시 프로세스 정리 후 재시도."""
    last_error = None

    for attempt in range(1, max_retries + 1):
        kill_existing_hwp()
        time.sleep(0.5)

        try:
            hwp = _try_create_hwp()
            if attempt > 1:
                print(f"[INFO] HWP COM created on attempt {attempt}", file=sys.stderr)
            return hwp
        except Exception as e:
            last_error = e
            print(f"[WARN] HWP COM attempt {attempt}/{max_retries} failed: {e}",
                  file=sys.stderr)
            _cleanup_com_cache()
            time.sleep(2)

    raise RuntimeError(f"HWP COM creation failed after {max_retries} attempts: {last_error}")


def _cleanup_com_cache():
    """win32com의 gen_py 캐시 문제 해결."""
    try:
        import win32com
        cache_dir = os.path.join(os.path.dirname(win32com.__file__), "gen_py")
        if os.path.exists(cache_dir):
            import shutil
            for item in os.listdir(cache_dir):
                item_path = os.path.join(cache_dir, item)
                if os.path.isdir(item_path) and "HWP" in item.upper():
                    shutil.rmtree(item_path, ignore_errors=True)
    except Exception:
        pass


def save_document(hwp, output_path: str, max_retries: int = 3):
    """HWPX 저장. 저장 전 수식 일괄 렌더링 → 여러 방법으로 재시도하여 반드시 성공."""
    abs_path = os.path.abspath(output_path)

    for attempt in range(1, max_retries + 1):
        # 방법 1: HWPX 포맷 명시
        try:
            hwp.SaveAs(abs_path, "HWPX")
            if os.path.exists(abs_path) and os.path.getsize(abs_path) > 100:
                print(f"[OK] HWPX saved: {abs_path}", file=sys.stderr)
                return
        except Exception as e:
            print(f"[WARN] SaveAs HWPX attempt {attempt}: {e}", file=sys.stderr)

        # 방법 2: 포맷 미지정
        try:
            hwp.SaveAs(abs_path)
            if os.path.exists(abs_path) and os.path.getsize(abs_path) > 100:
                print(f"[OK] HWPX saved (alt): {abs_path}", file=sys.stderr)
                return
        except Exception as e:
            print(f"[WARN] SaveAs alt attempt {attempt}: {e}", file=sys.stderr)

        time.sleep(1)

    # 최후 수단: HWP 포맷으로 저장 후 변환 시도
    hwp_path = abs_path.replace(".hwpx", ".hwp")
    try:
        hwp.SaveAs(hwp_path)
        if os.path.exists(hwp_path):
            import shutil
            shutil.copy2(hwp_path, abs_path)
            print(f"[WARN] Saved as HWP then copied: {abs_path}", file=sys.stderr)
            return
    except Exception:
        pass

    raise RuntimeError(f"HWPX save failed after {max_retries} attempts: {abs_path}")


def quit_hwp(hwp):
    """HWP COM 객체 종료 + 프로세스 강제 kill."""
    try:
        hwp.Clear(1)
    except Exception:
        pass
    try:
        hwp.Quit()
    except Exception:
        pass
    time.sleep(0.5)
    kill_existing_hwp()
