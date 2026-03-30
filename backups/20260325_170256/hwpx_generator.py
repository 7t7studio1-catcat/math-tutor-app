"""
한글 COM 자동화 — 출판 품질 해설서 생성
표(table) 미사용 — 폰트 색상/크기 + 유니코드 장식만으로 교재급 디자인
"""

import json
import sys
import os
import re
import time
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from markdown_parser import parse_markdown, Token
from latex_to_hwpeqn import latex_to_hwpeqn
from design_themes import get_theme, BRAND, STEP_COLORS, BOX_STYLES, FONT
from typing import List, Optional, Dict, Any

DUPLICATE_HEADING_PATTERNS = [
    re.compile(r"^#+\s*STEP\s*\d+\s*[:：]", re.IGNORECASE),
    re.compile(r"^파트\s*\d+\s*[:：]", re.UNICODE),
    re.compile(r"^아래에\s.*작성", re.UNICODE),
    re.compile(r"^모든 문제를 먼저", re.UNICODE),
    re.compile(r"^그 뒤에 정답과 풀이를", re.UNICODE),
    re.compile(r"^아래에 풀이를", re.UNICODE),
    re.compile(r"^아래에서 풀이", re.UNICODE),
    re.compile(r"^이하 동일", re.UNICODE),
    re.compile(r"^동일한 형식", re.UNICODE),
]

LABEL_PATTERNS = {
    "key":    re.compile(r"\[핵심\]|\[KEY\]|\[핵심 관찰\]|\[핵심 개념\]", re.IGNORECASE),
    "tip":    re.compile(r"\[TIP\]|\[팁\]|\[참고\]", re.IGNORECASE),
    "warn":   re.compile(r"\[주의\]|\[WARN\]|\[함정\]", re.IGNORECASE),
    "answer": re.compile(r"\[✅\s*답\]|\[정답\]|\[답\]", re.IGNORECASE),
}

STEP_HEADING_RE = re.compile(r"^(\d+)\s*단계", re.UNICODE)
VARIATION_HEADING_RE = re.compile(r"^변형\s*(\d+)", re.UNICODE)


# ═══════════════════════════════════════════════════════════════════════════════
# COM 기본 함수
# ═══════════════════════════════════════════════════════════════════════════════

def _kill_existing_hwp():
    """기존 HWP 프로세스가 남아있으면 강제 종료 (COM 충돌 방지)."""
    import subprocess
    try:
        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq Hwp.exe", "/NH"],
            capture_output=True, text=True, timeout=5,
        )
        if "Hwp.exe" in result.stdout:
            subprocess.run(["taskkill", "/IM", "Hwp.exe", "/F"],
                          capture_output=True, timeout=5)
            time.sleep(1)
            print("[INFO] Killed leftover Hwp.exe before COM init", file=sys.stderr)
    except Exception:
        pass


def create_hwp():
    _kill_existing_hwp()

    import win32com.client as win32
    import ctypes
    hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
    hwp.XHwpWindows.Item(0).Visible = False
    time.sleep(0.1)
    hwnd = ctypes.windll.user32.FindWindowW("HwpFrame", None)
    while hwnd:
        ctypes.windll.user32.ShowWindow(hwnd, 0)
        hwnd = ctypes.windll.user32.FindWindowW("HwpFrame", None)
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 0)
            break
    try: hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    except Exception: pass
    try: hwp.SetMessageBoxMode(0x10000)
    except Exception: pass
    try:
        hwp.Run("FileNew")
        time.sleep(0.1)
    except Exception:
        try: hwp.Clear(1)
        except Exception: pass
    return hwp


def setup_page(hwp, header_mm=14, footer_mm=12):
    try:
        hwp.HAction.GetDefault("PageSetup", hwp.HParameterSet.HSecDef.HSet)
        p = hwp.HParameterSet.HSecDef
        p.PageDef.PaperWidth = hwp.MiliToHwpUnit(210)
        p.PageDef.PaperHeight = hwp.MiliToHwpUnit(297)
        p.PageDef.LeftMargin = hwp.MiliToHwpUnit(20)
        p.PageDef.RightMargin = hwp.MiliToHwpUnit(20)
        p.PageDef.TopMargin = hwp.MiliToHwpUnit(15)
        p.PageDef.BottomMargin = hwp.MiliToHwpUnit(15)
        p.PageDef.HeaderLen = hwp.MiliToHwpUnit(header_mm)
        p.PageDef.FooterLen = hwp.MiliToHwpUnit(footer_mm)
        hwp.HAction.Execute("PageSetup", p.HSet)
    except Exception as e:
        print(f"[WARN] PageSetup: {e}", file=sys.stderr)


def sf(hwp, name="함초롬바탕", size=10, bold=False, color=0x000000):
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
    except Exception: pass


def it(hwp, text):
    try:
        act = hwp.CreateAction("InsertText")
        pset = act.CreateSet()
        pset.SetItem("Text", text)
        act.Execute(pset)
    except Exception: pass


def bp(hwp):
    try: hwp.BreakPara()
    except Exception:
        try: hwp.HAction.Run("BreakPara")
        except Exception: pass


def _equation_refresh(hwp):
    """pyhwpx EquationRefresh 패턴: EquationModify + HEqEdit로 수식을 재렌더링.
    EquationCreate 직후 저품질 폰트가 적용되는 한컴오피스 버그의 근본 해결."""
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


def insert_equation(hwp, hwpeqn_text, base_size=10.0, treat_as_char=True):
    if not hwpeqn_text or not hwpeqn_text.strip():
        return False
    eqn = hwpeqn_text.strip()
    try:
        hwp.HAction.GetDefault("EquationCreate", hwp.HParameterSet.HEqEdit.HSet)
        hwp.HParameterSet.HEqEdit.EqFontName = "HancomEQN"
        hwp.HParameterSet.HEqEdit.string = eqn
        hwp.HParameterSet.HEqEdit.BaseUnit = hwp.PointToHwpUnit(base_size)
        result = hwp.HAction.Execute("EquationCreate", hwp.HParameterSet.HEqEdit.HSet)
        if not result: return False
        time.sleep(0.02)
        _equation_refresh(hwp)
        if treat_as_char:
            try:
                hwp.FindCtrl()
                hwp.HAction.GetDefault("EquationPropertyDialog", hwp.HParameterSet.HShapeObject.HSet)
                ps = hwp.HParameterSet.HShapeObject
                ps.HSet.SetItem("TreatAsChar", 1)
                ps.TextWrap = 2
                ps.HSet.SetItem("ApplyTo", 0)
                hwp.HAction.Execute("EquationPropertyDialog", ps.HSet)
                hwp.Run("Cancel")
            except Exception: pass
        try: hwp.Run("MoveRight")
        except Exception: pass
        return True
    except Exception as e:
        print(f"[WARN] Eq: {e} | {eqn[:50]}", file=sys.stderr)
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# 디자인 요소 — 텍스트/유니코드만 사용 (100% 동작 보장)
# ═══════════════════════════════════════════════════════════════════════════════

def insert_divider(hwp, color=None, thick=False):
    """구분선: 유니코드 수평선 문자"""
    c = color or BRAND["line_light"]
    char = "━" if thick else "─"
    size = 6 if thick else 5
    sf(hwp, "함초롬돋움", size, False, c)
    it(hwp, char * 55)
    bp(hwp)
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])


def insert_colored_divider(hwp, color=0xCCCCCC, width=120):
    insert_divider(hwp, color, thick=False)


def insert_header_bar_table(hwp, theme):
    """헤더 바: 굵은 텍스트 + 골드 구분선"""
    name = theme.get("name", "스마트풀이")
    subject = theme.get("subject", "수학")
    title = theme.get("book_title", "4단계 완전 해설")
    accent = theme.get("header_accent", BRAND["gold"])
    primary = theme.get("header_bg", BRAND["primary"])

    sf(hwp, "함초롬돋움", FONT["title_lg"], True, primary)
    it(hwp, f"  {name}")
    sf(hwp, "함초롬돋움", FONT["title_sm"], False, accent)
    it(hwp, f"  ◆  ")
    sf(hwp, "함초롬돋움", FONT["title_sm"], False, primary)
    it(hwp, f"{subject}  |  {title}")
    bp(hwp)
    insert_divider(hwp, accent, thick=True)
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])


def insert_headtail_footer(hwp, unit_name="", theme=None):
    """푸터: 브랜드명 + 단원 + 페이지"""
    th = theme or {}
    accent = th.get("footer_accent", BRAND["accent"])
    name = th.get("name", "스마트풀이")
    try:
        act = hwp.CreateAction("InsertHeadTail")
        pset = act.CreateSet()
        act.GetDefault(pset)
        pset.SetItem("HeadTailType", 1)
        pset.SetItem("ApplyTo", 1)
        act.Execute(pset)
        time.sleep(0.05)
        sf(hwp, "함초롬돋움", FONT["caption"], True, accent)
        it(hwp, f"  {name}")
        sf(hwp, "함초롬돋움", FONT["caption"], False, BRAND["text_mid"])
        if unit_name:
            it(hwp, f"  │  {unit_name}")
        it(hwp, "  │  ")
        try: hwp.Run("FieldPageNum")
        except Exception: it(hwp, "p.")
        bp(hwp)
        try: hwp.Run("MoveDocBegin")
        except Exception: pass
    except Exception as e:
        print(f"[WARN] Footer: {e}", file=sys.stderr)


def insert_document_header(hwp, title="4단계 완전 해설", theme=None, use_header_bar=False):
    th = theme or {}
    if use_header_bar:
        insert_header_bar_table(hwp, th)
    else:
        sf(hwp, "함초롬돋움", FONT["title_xl"], True, BRAND["primary"])
        it(hwp, title)
        bp(hwp)
        insert_divider(hwp, BRAND["line_mid"])
    bp(hwp)
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])


def insert_section_header(hwp, idx, theme=None):
    """STEP 헤더: 큰 아이콘 + 컬러 제목 + 구분선"""
    step = STEP_COLORS.get(idx + 1, STEP_COLORS[1])
    th = theme or {}

    if idx > 0:
        bp(hwp)
        insert_divider(hwp, th.get("divider_thick", BRAND["line_mid"]), thick=True)
        bp(hwp)

    sf(hwp, "함초롬돋움", FONT["step_num"] + 4, True, step["main"])
    it(hwp, f"  {step['icon']} ")
    sf(hwp, "함초롬돋움", FONT["step_title"] + 2, True, step["main"])
    it(hwp, step["title"])
    bp(hwp)
    insert_divider(hwp, step["main"], thick=False)
    bp(hwp)
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])


def insert_concept_box(hwp, box_type, content_tokens):
    """개념 박스: 컬러 세로선 + 라벨"""
    style = BOX_STYLES.get(box_type, BOX_STYLES["key"])
    bp(hwp)
    sf(hwp, "함초롬돋움", FONT["body"], True, style["border"])
    it(hwp, f"  ▐ {style['label']}  ")
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["text_dark"])
    process_tokens(hwp, content_tokens)
    bp(hwp)
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])


def insert_problem_number(hwp, num, theme):
    """문제 번호: 큰 컬러 숫자 + 골드 구분선"""
    num_color = theme.get("problem_num_color", BRAND["accent"])
    gold = theme.get("header_accent", BRAND["gold"])

    sf(hwp, "함초롬돋움", FONT["problem_num"], True, num_color)
    it(hwp, f"{num:02d}")
    sf(hwp, "함초롬돋움", FONT["title_md"], True, BRAND["text_dark"])
    it(hwp, f"   {num}번 해설")
    bp(hwp)
    insert_divider(hwp, gold, thick=True)
    bp(hwp)
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])


def insert_variation_header(hwp, num):
    """변형문제: 교재급 번호 헤더"""
    bp(hwp)
    sf(hwp, "함초롬돋움", 5.5, False, BRAND["line_mid"])
    it(hwp, "─" * 60)
    bp(hwp)
    bp(hwp)
    sf(hwp, "함초롬돋움", FONT["title_md"] + 4, True, BRAND["accent"])
    it(hwp, f"  {num:02d} ")
    sf(hwp, "함초롬돋움", FONT["title_md"] + 1, True, BRAND["text_dark"])
    it(hwp, f"  변형 {num}")
    bp(hwp)
    sf(hwp, "함초롬돋움", 5.5, False, BRAND["line_mid"])
    it(hwp, "─" * 60)
    bp(hwp)
    bp(hwp)
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])


def insert_step_marker(hwp, step_num):
    sf(hwp, "함초롬돋움", FONT["body"], True, BRAND["accent"])
    it(hwp, f"  ◉ {step_num}단계  ")
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])


def insert_solution_space(hwp, label="풀이:", lines=6):
    sf(hwp, "함초롬돋움", FONT["body"], False, BRAND["text_light"])
    it(hwp, f"  {label}")
    bp(hwp)
    for _ in range(lines):
        bp(hwp)
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])


# ═══════════════════════════════════════════════════════════════════════════════
# 토큰 처리
# ═══════════════════════════════════════════════════════════════════════════════

def strip_duplicate_step_heading(md_content):
    lines = md_content.split("\n")
    return "\n".join(l for l in lines if not any(p.search(l.strip()) for p in DUPLICATE_HEADING_PATTERNS))


def _detect_box_label(text):
    for box_type, pattern in LABEL_PATTERNS.items():
        if pattern.search(text):
            return box_type
    return None


def process_tokens(hwp, tokens):
    last_was_break = False
    consecutive_breaks = 0
    i = 0
    while i < len(tokens):
        token = tokens[i]
        tp = token["type"]

        if tp == "paragraph_break":
            consecutive_breaks += 1
            if consecutive_breaks <= 2:
                bp(hwp)
            last_was_break = True
            i += 1
            continue
        elif tp == "line_break":
            consecutive_breaks += 1
            if consecutive_breaks <= 2:
                bp(hwp)
            last_was_break = True
            i += 1
            continue

        last_was_break = False
        consecutive_breaks = 0

        if tp == "text":
            txt = token["text"]
            txt = txt.replace("\\neq", "≠").replace("\\mid", "|")
            txt = txt.replace("<=>", "⇔").replace("<>", "≠")
            txt = txt.replace(">=", "≥").replace("<=", "≤")
            txt = re.sub(r"(?<!=)=>(?!=)", "⇒", txt)
            txt = txt.replace("->", "→").replace("<-", "←")
            for ch in ("\u2066", "\u2067", "\u2068", "\u2069",
                       "\u200e", "\u200f", "\u202a", "\u202b",
                       "\u202c", "\u202d", "\u202e",
                       "\u200b", "\u200c", "\u200d", "\ufeff"):
                txt = txt.replace(ch, "")
            it(hwp, txt)

        elif tp == "bold":
            children = token.get("children", [])
            bold_text = token.get("text", "")
            if not children and bold_text:
                children = [{"type": "text", "text": bold_text}]
            flat = "".join(c.get("text", "") or c.get("latex", "") for c in children)

            box_type = _detect_box_label(flat)
            if box_type:
                remaining = []
                j = i + 1
                while j < len(tokens) and tokens[j]["type"] not in ("paragraph_break", "heading", "horizontal_rule"):
                    remaining.append(tokens[j])
                    j += 1
                insert_concept_box(hwp, box_type, remaining)
                i = j
                continue

            step_m = STEP_HEADING_RE.match(flat)
            if step_m:
                insert_step_marker(hwp, int(step_m.group(1)))
                rest = flat[step_m.end():].strip()
                if rest:
                    sf(hwp, "함초롬바탕", FONT["body"], True, BRAND["text_dark"])
                    it(hwp, rest)
                sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])
                i += 1
                continue

            sf(hwp, "함초롬바탕", FONT["body"], True, BRAND["text_dark"])
            for child in children:
                if child["type"] == "inline_math":
                    hwpeqn = latex_to_hwpeqn(child["latex"])
                    ok = insert_equation(hwp, hwpeqn, base_size=FONT["equation"])
                    if not ok:
                        it(hwp, child["latex"])
                else:
                    txt = child.get("text", "")
                    if txt:
                        it(hwp, txt)
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])

        elif tp == "heading":
            level = token["level"]
            heading_text = token["text"]

            if "정답" in heading_text and "풀이" in heading_text:
                try: hwp.HAction.Run("BreakPage")
                except Exception:
                    for _ in range(3): bp(hwp)

            var_m = VARIATION_HEADING_RE.match(heading_text)
            if var_m:
                for _ in range(3): bp(hwp)
                insert_variation_header(hwp, int(var_m.group(1)))
                i += 1
                continue

            sizes = {1: FONT["title_lg"], 2: FONT["title_md"], 3: FONT["title_sm"], 4: FONT["body"]}
            colors = {1: BRAND["primary"], 2: BRAND["accent"], 3: BRAND["text_dark"], 4: BRAND["text_dark"]}
            sz = sizes.get(level, FONT["body"])
            cl = colors.get(level, BRAND["black"])

            bp(hwp)
            sf(hwp, "함초롬돋움", sz, True, cl)
            _insert_text_with_inline_math(hwp, heading_text, "함초롬돋움", sz, True)
            bp(hwp)
            if level <= 2:
                insert_divider(hwp, BRAND["accent"] if level == 1 else BRAND["line_light"])
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])

        elif tp == "inline_math":
            hwpeqn = latex_to_hwpeqn(token["latex"])
            has_frac = "OVER" in hwpeqn
            size = FONT["equation"] - 0.5 if has_frac else FONT["equation"]
            ok = insert_equation(hwp, hwpeqn, base_size=size)
            if not ok: it(hwp, token["latex"])

        elif tp == "display_math":
            bp(hwp)
            hwpeqn = latex_to_hwpeqn(token["latex"])
            ok = insert_equation(hwp, hwpeqn, base_size=FONT["equation_lg"], treat_as_char=True)
            if not ok: it(hwp, token["latex"])
            bp(hwp)
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])

        elif tp == "list_item":
            indent = "  " * token.get("level", 0)
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["accent"])
            it(hwp, indent + "• ")
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])
            if "children" in token:
                process_tokens(hwp, token["children"])
            bp(hwp)

        elif tp == "blockquote":
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["accent"])
            it(hwp, "  ┃ ")
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["text_dark"])
            if "children" in token:
                process_tokens(hwp, token["children"])
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])
            bp(hwp)

        elif tp == "horizontal_rule":
            insert_divider(hwp, BRAND["line_light"])

        elif tp == "code":
            it(hwp, token["text"])

        i += 1


def _insert_text_with_inline_math(hwp, text, font_name, font_size, bold):
    pattern = re.compile(r"\$([^$]+)\$")
    last = 0
    for m in pattern.finditer(text):
        if m.start() > last:
            it(hwp, text[last:m.start()])
        latex = m.group(1).replace("\\displaystyle", "").strip()
        hwpeqn = latex_to_hwpeqn(latex)
        ok = insert_equation(hwp, hwpeqn, base_size=float(font_size))
        if not ok: it(hwp, latex)
        sf(hwp, font_name, font_size, bold)
        last = m.end()
    if last < len(text):
        it(hwp, text[last:])


# ═══════════════════════════════════════════════════════════════════════════════
# 문서 생성
# ═══════════════════════════════════════════════════════════════════════════════

def generate_single(hwp, data, output_path, theme_id="default", unit_name="",
                    use_header_bar=True, use_footer=True):
    theme = get_theme(theme_id)
    setup_page(hwp, header_mm=14 if use_header_bar else 10, footer_mm=12 if use_footer else 8)
    if use_footer:
        insert_headtail_footer(hwp, unit_name or data.get("unit_name", ""), theme)
        time.sleep(0.1)
    insert_document_header(hwp, title=theme.get("book_title", "4단계 완전 해설"),
                           theme=theme, use_header_bar=use_header_bar)
    for idx, content in enumerate(data.get("sections", [])):
        if not content or not content.strip(): continue
        content = strip_duplicate_step_heading(content)
        insert_section_header(hwp, idx, theme=theme)
        tokens = parse_markdown(content)
        process_tokens(hwp, tokens)
    save_document(hwp, output_path)


def generate_batch(hwp, data, output_path, theme_id="default", unit_name="",
                   use_header_bar=True, use_footer=True):
    theme = get_theme(theme_id)
    setup_page(hwp, header_mm=14 if use_header_bar else 10, footer_mm=12 if use_footer else 8)
    if use_footer:
        insert_headtail_footer(hwp, unit_name or data.get("unit_name", ""), theme)
        time.sleep(0.1)
    insert_document_header(hwp, title=theme.get("book_title", "4단계 완전 해설"),
                           theme=theme, use_header_bar=use_header_bar)
    for pi, prob in enumerate(data.get("problems", [])):
        num = prob.get("num", pi + 1)
        if pi > 0:
            try: hwp.HAction.Run("BreakPage")
            except Exception: bp(hwp)
        insert_problem_number(hwp, num, theme)
        for idx, content in enumerate(prob.get("sections", [])):
            if not content or not content.strip(): continue
            content = strip_duplicate_step_heading(content)
            insert_section_header(hwp, idx, theme=theme)
            tokens = parse_markdown(content)
            process_tokens(hwp, tokens)
    save_document(hwp, output_path)


def refresh_all_equations(hwp):
    """문서 내 모든 수식의 렌더링을 일괄 갱신 (2층 안전망).
    pyhwpx EquationRefresh 패턴: EquationModify + HEqEdit로 수식 내용을 재처리하여
    저품질 폰트를 정상 폰트로 갱신한다. EquationPropertyDialog(모양 속성)가 아닌
    EquationModify(수식 내용 재처리)를 사용하는 것이 핵심."""
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


def save_document(hwp, output_path):
    abs_path = os.path.abspath(output_path)
    try:
        hwp.SaveAs(abs_path, "HWPX")
        print(f"[OK] HWPX: {abs_path}", file=sys.stderr)
    except Exception:
        try:
            hwp.SaveAs(abs_path)
            print(f"[OK] HWPX alt: {abs_path}", file=sys.stderr)
        except Exception as e:
            print(f"[ERROR] Save: {e}", file=sys.stderr)
            raise
    pdf_path = os.path.splitext(abs_path)[0] + ".pdf"
    try:
        hwp.SaveAs(pdf_path, "PDF")
        print(f"[OK] PDF: {pdf_path}", file=sys.stderr)
    except Exception as e:
        print(f"[WARN] PDF: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="한글 출판 품질 해설서 생성")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", default="single", choices=["single", "batch"])
    parser.add_argument("--theme", default="default",
                        choices=["default", "standard", "physical", "rule4", "gichul"])
    parser.add_argument("--unit", default="")
    parser.add_argument("--no-header-bar", action="store_true")
    parser.add_argument("--no-footer", action="store_true")
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"[INFO] {args.mode} theme={args.theme} -> {args.output}", file=sys.stderr)
    opts = {"theme_id": args.theme, "unit_name": args.unit,
            "use_header_bar": not args.no_header_bar, "use_footer": not args.no_footer}

    hwp = create_hwp()
    try:
        if args.mode == "batch":
            generate_batch(hwp, data, args.output, **opts)
        else:
            generate_single(hwp, data, args.output, **opts)
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        import traceback; traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    finally:
        try: hwp.Clear(1)
        except Exception: pass
        try: hwp.Quit()
        except Exception: pass
        time.sleep(0.5)
        try:
            import subprocess
            subprocess.run(["taskkill", "/IM", "Hwp.exe", "/F"], capture_output=True, timeout=5)
        except Exception: pass


if __name__ == "__main__":
    main()
