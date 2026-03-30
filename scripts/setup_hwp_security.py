"""
한글 자동화 보안 모듈 영구 등록 — 1회만 실행하면 됨.
이후 모든 한글 COM 자동화에서 보안 팝업이 뜨지 않음.
"""
import os
import sys
import glob
import winreg

def find_security_dll():
    """보안 모듈 DLL 찾기 — pyhwpx 패키지 또는 한글 설치 경로"""
    candidates = []

    # 1. pyhwpx 패키지 내부
    try:
        import pyhwpx
        pkg_dir = os.path.dirname(pyhwpx.__file__)
        candidates.extend(glob.glob(os.path.join(pkg_dir, "**", "FilePathChecker*.*"), recursive=True))
    except ImportError:
        pass

    # 2. 한글 설치 경로
    for base in [
        r"C:\Program Files (x86)\Hnc",
        r"C:\Program Files\Hnc",
        r"C:\HNC",
        os.path.expanduser(r"~\AppData\Local\Hnc"),
    ]:
        if os.path.exists(base):
            candidates.extend(glob.glob(os.path.join(base, "**", "FilePathChecker*.dll"), recursive=True))

    # 3. 한컴디벨로퍼 다운로드 위치
    for base in [
        os.path.expanduser(r"~\Downloads"),
        os.path.expanduser(r"~\Desktop"),
    ]:
        candidates.extend(glob.glob(os.path.join(base, "**", "FilePathChecker*.dll"), recursive=True))

    return candidates


def register_in_registry(dll_path):
    """레지스트리에 보안 모듈 등록"""
    key_path = r"Software\HNC\HwpAutomation\Modules"
    try:
        key = winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_WRITE)
        winreg.SetValueEx(key, "FilePathCheckerModule", 0, winreg.REG_SZ, dll_path)
        winreg.CloseKey(key)
        return True
    except Exception as e:
        print(f"[ERROR] Registry write failed: {e}")
        return False


def check_registry():
    """현재 등록 상태 확인"""
    key_path = r"Software\HNC\HwpAutomation\Modules"
    try:
        key = winreg.OpenKeyEx(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
        value, _ = winreg.QueryValueEx(key, "FilePathCheckerModule")
        winreg.CloseKey(key)
        return value
    except Exception:
        return None


def main():
    print("=== 한글 자동화 보안 모듈 설정 ===\n")

    # 현재 상태 확인
    current = check_registry()
    if current:
        print(f"[현재 등록됨] {current}")
        if os.path.exists(current):
            print("[OK] DLL 파일 존재 확인. 이미 설정 완료.")
            return
        else:
            print(f"[WARN] 등록된 경로에 파일 없음. 재등록 필요.")

    # DLL 찾기
    dlls = find_security_dll()
    if not dlls:
        print("[ERROR] FilePathCheckerModule DLL을 찾을 수 없습니다.")
        print("  한컴디벨로퍼(developer.hancom.com)에서 '보안모듈(Automation).zip'을 다운로드하세요.")
        print("  또는 한글 설치 경로에서 FilePathCheckerModuleExample.dll을 찾아주세요.")
        sys.exit(1)

    print(f"[발견] {len(dlls)}개 DLL:")
    for i, d in enumerate(dlls):
        print(f"  [{i}] {d}")

    # 첫 번째 DLL 등록
    dll_path = dlls[0]
    print(f"\n[등록] {dll_path}")
    if register_in_registry(dll_path):
        print("[OK] 레지스트리 등록 성공!")
        print("  이제 한글 자동화 시 보안 팝업이 뜨지 않습니다.")
    else:
        print("[FAIL] 등록 실패.")


if __name__ == "__main__":
    main()
