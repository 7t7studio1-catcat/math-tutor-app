"""
페이지 설정, 다단(2단) 레이아웃, 디자인 유틸리티

모든 포맷에서 동일한 2단 레이아웃 사용 (참조: 2026 3모 해설.hwpx):
  - A4 (210x297mm), 마진 15mm 사방
  - 헤더 0mm, 푸터 8mm
  - 2단, 단 간격 6mm
  - 본문 8pt 함초롬바탕
"""

import os
import sys
import re
from .equation import insert_equation

# ═══════════════════════════════════════════════════════════════════════════════
# 페이지/레이아웃 상수
# ═══════════════════════════════════════════════════════════════════════════════

MARGIN = {
    "left": 15, "right": 15, "top": 15, "bottom": 15,
    "header": 0, "footer": 8,
    "col_gap": 6,
}

COLUMN_WIDTH_MM = (210 - MARGIN["left"] - MARGIN["right"] - MARGIN["col_gap"]) / 2
SAFE_IMG_WIDTH_MM = COLUMN_WIDTH_MM * 0.9

FONT = {
    "problem_num": 12.5,
    "variation_title": 9,
    "body": 8,
    "body_sm": 7.5,
    "equation": 8,
    "equation_display": 8.5,
    "choices": 8,
    "caption": 6.5,
    "answer_header": 11.5,
    "solution_num": 8.5,
    "source_label": 7,
    "instruction": 6.5,
    "divider": 4.5,
    "heading": 9,
}

COLOR = {
    "num_blue": 0xFF5B2D,      # BGR for #2D5BFF
    "title_dark": 0x2E1A1A,
    "body": 0x1A1A1A,
    "caption": 0x999999,
    "instruction": 0xAAAAAA,
    "line": 0xD0D0D0,
    "line_dark": 0x909090,
    "answer_green": 0x699605,
    "point_purple": 0xED3A7C,
    "white": 0xFFFFFF,
    "black": 0x000000,
}

CIRCLED_NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"]


# ═══════════════════════════════════════════════════════════════════════════════
# 기본 텍스트 삽입 헬퍼
# ═══════════════════════════════════════════════════════════════════════════════

def sf(hwp, name="함초롬바탕", size=10, bold=False, color=0x000000):
    """글자 모양 설정."""
    try:
        act = hwp.CreateAction("CharShape")
        pset = act.CreateSet()
        act.GetDefault(pset)
        for i in range(7):
            pset.SetItem(f"FaceName{i}", name)
        pset.SetItem("Height", hwp.PointToHwpUnit(float(size)))
        pset.SetItem("Bold", 1 if bold else 0)
        pset.SetItem("TextColor", color)
        act.Execute(pset)
    except Exception:
        pass


def it(hwp, text: str):
    """텍스트 삽입."""
    try:
        act = hwp.CreateAction("InsertText")
        pset = act.CreateSet()
        pset.SetItem("Text", text)
        act.Execute(pset)
    except Exception:
        pass


def bp(hwp):
    """줄바꿈(BreakPara)."""
    try:
        hwp.BreakPara()
    except Exception:
        try:
            hwp.HAction.Run("BreakPara")
        except Exception:
            pass


def set_body_font(hwp, size=None, bold=False, color=None):
    sf(hwp, "함초롬바탕", size or FONT["body"], bold, color or COLOR["body"])


# ═══════════════════════════════════════════════════════════════════════════════
# 페이지 설정
# ═══════════════════════════════════════════════════════════════════════════════

def setup_page(hwp):
    """A4 페이지 설정 — 2단 레이아웃용 (15mm 마진, 0mm 헤더, 8mm 푸터)."""
    try:
        hwp.HAction.GetDefault("PageSetup", hwp.HParameterSet.HSecDef.HSet)
        p = hwp.HParameterSet.HSecDef
        p.PageDef.PaperWidth = hwp.MiliToHwpUnit(210)
        p.PageDef.PaperHeight = hwp.MiliToHwpUnit(297)
        p.PageDef.LeftMargin = hwp.MiliToHwpUnit(MARGIN["left"])
        p.PageDef.RightMargin = hwp.MiliToHwpUnit(MARGIN["right"])
        p.PageDef.TopMargin = hwp.MiliToHwpUnit(MARGIN["top"])
        p.PageDef.BottomMargin = hwp.MiliToHwpUnit(MARGIN["bottom"])
        p.PageDef.HeaderLen = hwp.MiliToHwpUnit(MARGIN["header"])
        p.PageDef.FooterLen = hwp.MiliToHwpUnit(MARGIN["footer"])
        hwp.HAction.Execute("PageSetup", p.HSet)
    except Exception as e:
        print(f"[WARN] PageSetup: {e}", file=sys.stderr)


# ═══════════════════════════════════════════════════════════════════════════════
# 다단 설정
# ═══════════════════════════════════════════════════════════════════════════════

def _apply_multi_column(hwp, count: int, gap_mm=None):
    gap = gap_mm or MARGIN["col_gap"]
    try:
        pset = hwp.HParameterSet.HColDef
        hwp.HAction.GetDefault("MultiColumn", pset.HSet)
        pset.Count = count
        if count > 1:
            pset.SameGap = hwp.MiliToHwpUnit(gap)
        pset.HSet.SetItem("ApplyClass", 832)
        pset.HSet.SetItem("ApplyTo", 6)
        hwp.HAction.Execute("MultiColumn", pset.HSet)
    except Exception as e:
        print(f"[WARN] MultiColumn(count={count}): {e}", file=sys.stderr)


def setup_two_column(hwp, gap_mm=None):
    _apply_multi_column(hwp, 2, gap_mm)


def reset_single_column(hwp):
    _apply_multi_column(hwp, 1)


# ═══════════════════════════════════════════════════════════════════════════════
# 문단 제어
# ═══════════════════════════════════════════════════════════════════════════════

def ensure_left_align(hwp):
    """왼쪽 정렬. 양쪽 정렬은 줄 넘김 시 가독성이 떨어지므로 문제집에서는 왼쪽 정렬 사용."""
    try:
        act = hwp.CreateAction("ParagraphShape")
        pset = act.CreateSet()
        act.GetDefault(pset)
        pset.SetItem("Align", 1)
        act.Execute(pset)
    except Exception:
        pass


def set_line_spacing(hwp, percent: int = 160):
    """줄간격 설정 (Nova AI 참조: 160%)."""
    try:
        act = hwp.CreateAction("ParagraphShape")
        pset = act.CreateSet()
        act.GetDefault(pset)
        pset.SetItem("LineSpacingType", 0)
        pset.SetItem("LineSpacing", percent)
        act.Execute(pset)
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════════════════════
# 브레이크 (단 나누기, 페이지 나누기, 섹션 나누기)
# ═══════════════════════════════════════════════════════════════════════════════

def column_break(hwp):
    try:
        hwp.Run("BreakColumn")
    except Exception:
        try:
            hwp.HAction.Run("BreakColumn")
        except Exception as e:
            print(f"[WARN] BreakColumn: {e}", file=sys.stderr)
    ensure_left_align(hwp)


def page_break(hwp):
    try:
        hwp.HAction.Run("BreakPage")
    except Exception:
        try:
            hwp.Run("BreakPage")
        except Exception:
            for _ in range(5):
                bp(hwp)
    ensure_left_align(hwp)


def section_break(hwp):
    try:
        hwp.Run("BreakSection")
    except Exception:
        try:
            hwp.HAction.Run("BreakSection")
        except Exception:
            page_break(hwp)
    ensure_left_align(hwp)


def col_def_break(hwp):
    try:
        hwp.Run("BreakColDef")
    except Exception:
        try:
            hwp.HAction.Run("BreakColDef")
        except Exception as e:
            print(f"[WARN] BreakColDef: {e}", file=sys.stderr)


# ═══════════════════════════════════════════════════════════════════════════════
# 구분선 / 디자인 요소
# ═══════════════════════════════════════════════════════════════════════════════

def insert_divider(hwp, color=None, char="─", count=42, size=None):
    c = color or COLOR["line"]
    s = size or FONT["divider"]
    sf(hwp, "함초롬돋움", s, False, c)
    it(hwp, char * count)
    bp(hwp)


def insert_thick_divider(hwp, color=None):
    insert_divider(hwp, color or COLOR["line_dark"], "━", 42)


def insert_thin_line(hwp):
    insert_divider(hwp, COLOR["line"], "─", 42, 4.5)


def insert_section_header(hwp, num: int, title: str):
    """섹션 헤더: 번호(파란) + 제목(검정) + 구분선."""
    insert_divider(hwp)
    sf(hwp, "함초롬돋움", FONT["problem_num"], True, COLOR["num_blue"])
    it(hwp, f"  {num:02d}")
    sf(hwp, "함초롬돋움", FONT["variation_title"], True, COLOR["title_dark"])
    it(hwp, f"   {title}")
    bp(hwp)
    insert_divider(hwp)


def insert_answer_section_header(hwp):
    """정답 및 풀이 전체 헤더."""
    sf(hwp, "함초롬돋움", FONT["answer_header"], True, COLOR["title_dark"])
    it(hwp, "정답 및 풀이")
    bp(hwp)
    insert_thick_divider(hwp, COLOR["line_dark"])
    bp(hwp)
    set_body_font(hwp, FONT["body_sm"])


# ═══════════════════════════════════════════════════════════════════════════════
# 선지(choices) 렌더링
# ═══════════════════════════════════════════════════════════════════════════════

def insert_choices(hwp, choices: list):
    if not choices:
        return
    bp(hwp)
    sf(hwp, "함초롬바탕", FONT["choices"], False, COLOR["body"])
    parts = []
    for i, ch in enumerate(choices):
        sym = CIRCLED_NUMS[i] if i < len(CIRCLED_NUMS) else f"({i + 1})"
        parts.append(f"{sym} {ch}")
    it(hwp, "  ".join(parts))
    bp(hwp)


def insert_choices_with_math(hwp, choices: list):
    """수식이 포함된 선지 — 각 선지를 _insert_text_with_inline_math로 처리."""
    if not choices:
        return
    bp(hwp)
    sf(hwp, "함초롬바탕", FONT["choices"], False, COLOR["body"])
    for i, ch in enumerate(choices):
        sym = CIRCLED_NUMS[i] if i < len(CIRCLED_NUMS) else f"({i + 1})"
        it(hwp, f"{sym} ")
        _insert_text_with_inline_math(hwp, ch, "함초롬바탕", FONT["choices"], False)
        if i < len(choices) - 1:
            it(hwp, "  ")
    bp(hwp)


def insert_choices_smart(hwp, choices: list):
    """선지 삽입 — [EQ]/[DEQ] 마커, $...$ LaTeX, 일반 텍스트 모두 처리.
    
    우선순위:
    1. [EQ]...[/EQ] 마커가 있으면 → HwpEqn으로 직접 수식 삽입
    2. $...$ LaTeX가 있으면 → latex_to_hwpeqn 변환 후 수식 삽입
    3. 아무것도 없으면 → 평문 삽입
    """
    if not choices:
        return
    bp(hwp)
    sf(hwp, "함초롬바탕", FONT["choices"], False, COLOR["body"])
    for i, ch in enumerate(choices):
        sym = CIRCLED_NUMS[i] if i < len(CIRCLED_NUMS) else f"({i + 1})"
        it(hwp, f"{sym} ")
        _insert_choice_text(hwp, ch)
        if i < len(choices) - 1:
            it(hwp, "  ")
    bp(hwp)


_HWPEQN_INLINE_RE = re.compile(r"\[EQ\](.*?)\[/EQ\]")
_HWPEQN_DISPLAY_RE = re.compile(r"\[DEQ\](.*?)\[/DEQ\]")


def _insert_choice_text(hwp, text: str):
    """선지 하나를 [EQ]/[DEQ] → $...$ → 일반 텍스트 순서로 처리."""
    if "[EQ]" in text or "[DEQ]" in text:
        combined_re = re.compile(r"\[DEQ\](.*?)\[/DEQ\]|\[EQ\](.*?)\[/EQ\]")
        parts = combined_re.split(text)
        idx = 0
        for m in combined_re.finditer(text):
            before = text[idx:m.start()]
            if before.strip():
                sf(hwp, "함초롬바탕", FONT["choices"], False, COLOR["body"])
                _insert_plain_or_latex(hwp, before.strip())
            hwpeqn = (m.group(1) or m.group(2) or "").strip()
            if hwpeqn:
                insert_equation(hwp, hwpeqn, base_size=FONT["equation"])
            idx = m.end()
        after = text[idx:]
        if after.strip():
            sf(hwp, "함초롬바탕", FONT["choices"], False, COLOR["body"])
            _insert_plain_or_latex(hwp, after.strip())
    elif "$" in text:
        _insert_text_with_inline_math(hwp, text, "함초롬바탕", FONT["choices"], False)
    else:
        sf(hwp, "함초롬바탕", FONT["choices"], False, COLOR["body"])
        it(hwp, text)


def _insert_plain_or_latex(hwp, text: str):
    """잔여 $...$ LaTeX가 있으면 수식 처리, 없으면 평문."""
    if "$" in text:
        _insert_text_with_inline_math(hwp, text, "함초롬바탕", FONT["choices"], False)
    else:
        it(hwp, text)


# ═══════════════════════════════════════════════════════════════════════════════
# 인라인 수식이 포함된 텍스트 삽입
# ═══════════════════════════════════════════════════════════════════════════════

_INLINE_MATH_RE = re.compile(r"\$(.+?)\$")


def _insert_text_with_inline_math(hwp, text: str, font_name: str,
                                  font_size: float, bold: bool):
    """$..$ 구간을 수식으로, 나머지를 일반 텍스트로 삽입."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    from latex_to_hwpeqn import latex_to_hwpeqn as _l2h

    parts = _INLINE_MATH_RE.split(text)
    for i, part in enumerate(parts):
        if i % 2 == 0:
            if part:
                sf(hwp, font_name, font_size, bold, COLOR["body"])
                it(hwp, part)
        else:
            hwpeqn = _l2h(part)
            ok = insert_equation(hwp, hwpeqn, base_size=FONT["equation"])
            if not ok:
                sf(hwp, font_name, font_size, bold, COLOR["body"])
                it(hwp, part)
