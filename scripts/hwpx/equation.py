"""
수식 삽입 및 렌더링 갱신

안정성 기준:
- 개별 수식 실패 시 텍스트 폴백 (문서 전체가 죽지 않음)
- EquationCreate 실패 시 2회 재시도
- _equation_refresh 실패는 무시 (수식은 생성됨, 폰트만 약간 다를 수 있음)
- 연속 실패 카운터로 HWP 상태 감시
"""

import sys
import time

_consecutive_failures = 0
_MAX_CONSECUTIVE_FAILURES = 10


def _equation_refresh(hwp):
    """수식 폰트 재렌더링. 실패해도 수식 자체는 유효."""
    try:
        hwp.FindCtrl()
        pset = hwp.HParameterSet.HEqEdit
        hwp.HAction.GetDefault("EquationModify", pset.HSet)
        pset.string = pset.VisualString
        pset.Version = "Equation Version 60"
        hwp.HAction.Execute("EquationModify", pset.HSet)
        return True
    except Exception:
        return False


def _try_insert_equation(hwp, eqn: str, base_size: float, treat_as_char: bool) -> bool:
    """수식 삽입 단일 시도. 개별 refresh로 즉시 렌더링 보장."""
    hwp.HAction.GetDefault("EquationCreate", hwp.HParameterSet.HEqEdit.HSet)
    hwp.HParameterSet.HEqEdit.EqFontName = "HYhwpEQ"
    hwp.HParameterSet.HEqEdit.string = eqn
    hwp.HParameterSet.HEqEdit.BaseUnit = hwp.PointToHwpUnit(base_size)
    result = hwp.HAction.Execute("EquationCreate", hwp.HParameterSet.HEqEdit.HSet)
    if not result:
        return False

    _equation_refresh(hwp)

    if treat_as_char:
        try:
            hwp.FindCtrl()
            hwp.HAction.GetDefault(
                "EquationPropertyDialog",
                hwp.HParameterSet.HShapeObject.HSet,
            )
            ps = hwp.HParameterSet.HShapeObject
            ps.HSet.SetItem("TreatAsChar", 1)
            ps.TextWrap = 2
            ps.HSet.SetItem("ApplyTo", 0)
            hwp.HAction.Execute("EquationPropertyDialog", ps.HSet)
            hwp.Run("Cancel")
        except Exception:
            pass

    try:
        hwp.Run("MoveRight")
    except Exception:
        pass
    return True


_UNICODE_JUNK = str.maketrans("", "", (
    "\u2066\u2067\u2068\u2069"  # bidi isolates (LRI, RLI, FSI, PDI)
    "\u200e\u200f"              # LRM, RLM
    "\u202a\u202b\u202c\u202d\u202e"  # bidi embedding/override
    "\u200b\u200c\u200d"        # zero-width space/joiner
    "\ufeff"                    # BOM
    "\u00ad"                    # soft hyphen
    "\u200a\u2009\u2008\u2007"  # hair/thin/punctuation/figure space
))


def insert_equation(hwp, hwpeqn_text: str, base_size: float = 10.0,
                    treat_as_char: bool = True) -> bool:
    """HwpEqn 수식을 문서에 삽입. 2회 재시도. 최종 실패 시 False 반환.
    
    절대 예외를 발생시키지 않음 — 문서 생성이 중단되어서는 안 됨.
    """
    global _consecutive_failures

    if not hwpeqn_text or not hwpeqn_text.strip():
        return False

    eqn = hwpeqn_text.translate(_UNICODE_JUNK).strip()

    if _consecutive_failures >= _MAX_CONSECUTIVE_FAILURES:
        return False

    for attempt in range(2):
        try:
            ok = _try_insert_equation(hwp, eqn, base_size, treat_as_char)
            if ok:
                _consecutive_failures = 0
                return True
        except Exception as e:
            if attempt == 0:
                time.sleep(0.1)
                try:
                    hwp.Run("Cancel")
                except Exception:
                    pass

    _consecutive_failures += 1
    if _consecutive_failures % 5 == 0:
        print(f"[WARN] {_consecutive_failures} consecutive equation failures | last: {eqn[:40]}",
              file=sys.stderr)
    return False


def reset_equation_counter():
    """문서 생성 시작 시 카운터 초기화."""
    global _consecutive_failures
    _consecutive_failures = 0


def refresh_all_equations(hwp) -> int:
    """문서 내 모든 수식의 렌더링을 일괄 갱신."""
    try:
        ctrl = hwp.HeadCtrl
    except Exception:
        return 0
    count = 0
    while ctrl:
        try:
            if ctrl.UserDesc == "수식":
                hwp.SetPosBySet(ctrl.GetAnchorPos(0))
                hwp.FindCtrl()
                pset = hwp.HParameterSet.HEqEdit
                hwp.HAction.GetDefault("EquationModify", pset.HSet)
                pset.string = pset.VisualString
                pset.Version = "Equation Version 60"
                hwp.HAction.Execute("EquationModify", pset.HSet)
                time.sleep(0.03)
                count += 1
        except Exception:
            pass
        try:
            ctrl = ctrl.Next
        except Exception:
            break
    if count > 0:
        print(f"[INFO] Refreshed {count} equation(s)", file=sys.stderr)
    return count
