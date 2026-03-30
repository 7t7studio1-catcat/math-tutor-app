"""
한글 COM 자동화 — 2단 문제집 형식 (워크북 레이아웃)

메가스터디/대성/시대인재 납품용 EBS 변형문제집 스타일
A4 2단(다단) 배치, 단 나누기(BreakColumn)로 좌/우 분리

레이아웃:
  [문제 영역] — 다단 2단 + BreakColumn
    페이지1: 원본 문제(좌) | 변형 1(우)
    페이지2: 변형 2(좌) | 변형 3(우)
    페이지3: 변형 4(좌) | 변형 5(우)
  [정답 및 풀이] — 새 구역(Section) + 다단 2단
    전폭 타이틀 + 콤팩트 2단 풀이
"""

import json
import sys
import os
import re
import time
import tempfile
import argparse
import shutil
from typing import List, Dict, Tuple, Optional, Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hwpx_generator import (
    create_hwp, sf, it, bp, insert_equation, save_document,
    _insert_text_with_inline_math,
)
from markdown_parser import parse_markdown, Token
from latex_to_hwpeqn import latex_to_hwpeqn
from hwpx_generator_v2 import (
    extract_and_render_graphs, insert_graph_image,
    _clean_unicode, GRAPH_MARKER_PREFIX, GRAPH_MARKER_RE,
    _insert_web_graph, GRAPH_BLOCK_RE, GRAPH_MARKER_SUFFIX,
)
from graph_generator import generate_graph as _gen_graph


# ═══════════════════════════════════════════════════════════════════════════════
# 워크북 전용 상수 — 콤팩트 타이포그래피
# ═══════════════════════════════════════════════════════════════════════════════

WB_MARGIN = {
    "left":   15,
    "right":  15,
    "top":    15,
    "bottom": 15,
    "header":  0,
    "footer":  8,
    "col_gap": 6,
}

WB_FONT = {
    "problem_num":     12.5,
    "variation_title":  9,
    "body":             8,
    "body_sm":          7.5,
    "equation":         8.5,
    "equation_lg":      9.5,
    "choices":          8,
    "caption":          6.5,
    "answer_header":   11.5,
    "solution_num":     8.5,
    "source_label":     7,
    "instruction":      6.5,
    "divider":          4.5,
}

WB_COLOR = {
    "num_blue":      0xFF5B2D,
    "title_dark":    0x2E1A1A,
    "body":          0x1A1A1A,
    "caption":       0x999999,
    "instruction":   0xAAAAAA,
    "line":          0xD0D0D0,
    "line_dark":     0x909090,
    "answer_green":  0x699605,
    "point_purple":  0xED3A7C,
    "white":         0xFFFFFF,
    "black":         0x000000,
}

COLUMN_WIDTH_MM = (210 - WB_MARGIN["left"] - WB_MARGIN["right"] - WB_MARGIN["col_gap"]) / 2


def _wb_render_graph(spec: Dict, output_path: str, temp_dir: str) -> Dict:
    """워크북 전용 그래프 렌더: printMode + wb_medium 자동 적용."""
    wb_spec = {**spec}
    wb_spec["printMode"] = True
    if "size" not in wb_spec:
        wb_spec["size"] = "wb_medium"
    return _gen_graph(wb_spec, output_path, dpi=300)

CIRCLED_NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"]


# ═══════════════════════════════════════════════════════════════════════════════
# 페이지 · 다단 설정
# ═══════════════════════════════════════════════════════════════════════════════

def setup_workbook_page(hwp):
    try:
        hwp.HAction.GetDefault("PageSetup", hwp.HParameterSet.HSecDef.HSet)
        p = hwp.HParameterSet.HSecDef
        p.PageDef.PaperWidth  = hwp.MiliToHwpUnit(210)
        p.PageDef.PaperHeight = hwp.MiliToHwpUnit(297)
        p.PageDef.LeftMargin  = hwp.MiliToHwpUnit(WB_MARGIN["left"])
        p.PageDef.RightMargin = hwp.MiliToHwpUnit(WB_MARGIN["right"])
        p.PageDef.TopMargin   = hwp.MiliToHwpUnit(WB_MARGIN["top"])
        p.PageDef.BottomMargin= hwp.MiliToHwpUnit(WB_MARGIN["bottom"])
        p.PageDef.HeaderLen   = hwp.MiliToHwpUnit(WB_MARGIN["header"])
        p.PageDef.FooterLen   = hwp.MiliToHwpUnit(WB_MARGIN["footer"])
        hwp.HAction.Execute("PageSetup", p.HSet)
    except Exception as e:
        print(f"[WARN] WorkbookPageSetup: {e}", file=sys.stderr)


def _apply_multi_column(hwp, count, gap_mm=None):
    gap = gap_mm or WB_MARGIN["col_gap"]
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


def column_break(hwp):
    try:
        hwp.Run("BreakColumn")
    except Exception:
        try:
            hwp.HAction.Run("BreakColumn")
        except Exception as e:
            print(f"[WARN] BreakColumn: {e}", file=sys.stderr)
    _ensure_left_align(hwp)


def page_break(hwp):
    try:
        hwp.HAction.Run("BreakPage")
    except Exception:
        try:
            hwp.Run("BreakPage")
        except Exception:
            for _ in range(5):
                bp(hwp)
    _ensure_left_align(hwp)


def section_break(hwp):
    try:
        hwp.Run("BreakSection")
    except Exception:
        try:
            hwp.HAction.Run("BreakSection")
        except Exception:
            page_break(hwp)
    _ensure_left_align(hwp)


def col_def_break(hwp):
    try:
        hwp.Run("BreakColDef")
    except Exception:
        try:
            hwp.HAction.Run("BreakColDef")
        except Exception as e:
            print(f"[WARN] BreakColDef: {e}", file=sys.stderr)


# ═══════════════════════════════════════════════════════════════════════════════
# 디자인 유틸리티
# ═══════════════════════════════════════════════════════════════════════════════

def _wb_divider(hwp, color=None, char="─", count=42, size=None):
    c = color or WB_COLOR["line"]
    s = size or WB_FONT["divider"]
    sf(hwp, "함초롬돋움", s, False, c)
    it(hwp, char * count)
    bp(hwp)


def _wb_thick_divider(hwp, color=None):
    _wb_divider(hwp, color or WB_COLOR["line_dark"], "━", 42)


def _wb_thin_line(hwp):
    _wb_divider(hwp, WB_COLOR["line"], "─", 42, 4.5)


def _set_body_font(hwp, size=None, bold=False, color=None):
    sf(hwp, "함초롬바탕", size or WB_FONT["body"], bold, color or WB_COLOR["body"])


def _ensure_left_align(hwp):
    """현재 문단 및 이후 문단을 왼쪽 정렬로 설정.
    양쪽 정렬(justify)은 줄 넘김 시 단어 간격이 균등 분배되어
    가독성이 떨어지므로, 문제집에서는 왼쪽 정렬을 사용한다.
    HWP Align: 0=양쪽, 1=왼쪽, 2=오른쪽, 3=가운데, 4=배분
    """
    try:
        act = hwp.CreateAction("ParagraphShape")
        pset = act.CreateSet()
        act.GetDefault(pset)
        pset.SetItem("Align", 1)
        act.Execute(pset)
    except Exception:
        pass


def _set_line_spacing(hwp, percent=160):
    """줄간격 설정 (Nova AI 참조: 160%).
    LineSpacingType: 0=PERCENT, 1=FIXED, 2=BETWEENLINES, 3=ATLEAST
    """
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
# 콤팩트 토큰 렌더링 — 워크북 전용
# ═══════════════════════════════════════════════════════════════════════════════

HWPEQN_INLINE_RE = re.compile(r"\[EQ\](.*?)\[/EQ\]")
HWPEQN_DISPLAY_RE = re.compile(r"\[DEQ\](.*?)\[/DEQ\]")


def _has_hwpeqn_markers(content: str) -> bool:
    return "[EQ]" in content or "[DEQ]" in content


def _process_content_hwpeqn_direct(hwp, content: str, font_size=None, graph_infos=None,
                                   graph_max_w: float = None, graph_max_h: float = None):
    """AI가 변환한 HwpEqn 마커([EQ]...[/EQ], [DEQ]...[/DEQ])를 직접 사용.
    latex_to_hwpeqn 변환기를 완전히 우회하여 AI 지능으로 변환된 수식을 직접 삽입.
    Nova AI 참조: 수식 크기 = 본문 크기 (8pt), 분수 포함 시도 동일."""
    size = font_size or WB_FONT["body"]
    eq_size = size
    gi = graph_infos or {}
    _gw = graph_max_w
    _gh = graph_max_h
    _ensure_left_align(hwp)

    lines = content.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            bp(hwp)
            continue

        if HWPEQN_DISPLAY_RE.search(line):
            for m in HWPEQN_DISPLAY_RE.finditer(line):
                hwpeqn = m.group(1).strip()
                if hwpeqn:
                    bp(hwp)
                    _ensure_left_align(hwp)
                    insert_equation(hwp, hwpeqn, base_size=eq_size + 0.5, treat_as_char=True)
                    bp(hwp)
                    _ensure_left_align(hwp)
            sf(hwp, "함초롬바탕", size, False, WB_COLOR["body"])
            continue

        parts = HWPEQN_INLINE_RE.split(line)
        markers = HWPEQN_INLINE_RE.findall(line)
        marker_idx = 0
        for i, part in enumerate(parts):
            if i % 2 == 0:
                txt = _clean_unicode(part.strip())
                if txt:
                    if GRAPH_MARKER_PREFIX in txt:
                        _render_graph_markers(hwp, txt, gi, max_w=_gw, max_h=_gh)
                    else:
                        _set_body_font(hwp, size)
                        it(hwp, txt)
            else:
                hwpeqn = part.strip()
                if hwpeqn:
                    insert_equation(hwp, hwpeqn, base_size=eq_size)
        bp(hwp)

    _ensure_left_align(hwp)


def _process_content_compact(hwp, content: str, font_size=None, graph_infos=None,
                             graph_max_w: float = None, graph_max_h: float = None):
    if not content or not content.strip():
        return

    if _has_hwpeqn_markers(content):
        _process_content_hwpeqn_direct(hwp, content, font_size, graph_infos,
                                       graph_max_w=graph_max_w, graph_max_h=graph_max_h)
        return

    _ensure_left_align(hwp)
    size = font_size or WB_FONT["body"]
    gi = graph_infos or {}
    tokens = parse_markdown(content)
    _render_tokens_compact(hwp, tokens, size, gi, graph_max_w=graph_max_w, graph_max_h=graph_max_h)
    _ensure_left_align(hwp)


def _render_tokens_compact(hwp, tokens: List[Token], body_size: float, graph_infos: Dict,
                           graph_max_w: float = None, graph_max_h: float = None):
    """Nova AI 참조: 수식 크기 = 본문 크기(8pt), display만 +0.5pt."""
    eq_size = body_size
    _gw = graph_max_w
    _gh = graph_max_h
    consecutive_breaks = 0

    for token in tokens:
        tp = token["type"]

        if tp in ("paragraph_break", "line_break"):
            consecutive_breaks += 1
            if consecutive_breaks <= 1:
                bp(hwp)
            continue

        consecutive_breaks = 0

        if tp == "text":
            txt = _clean_unicode(token["text"])
            if GRAPH_MARKER_PREFIX in txt:
                _render_graph_markers(hwp, txt, graph_infos, max_w=_gw, max_h=_gh)
            elif "$" in txt:
                _insert_text_with_inline_math(
                    hwp, txt, "함초롬바탕", body_size, False
                )
            else:
                it(hwp, txt)

        elif tp == "bold":
            children = token.get("children", [])
            if not children and token.get("text"):
                children = [{"type": "text", "text": token["text"]}]
            sf(hwp, "함초롬바탕", body_size, True, WB_COLOR["title_dark"])
            for child in children:
                if child["type"] == "inline_math":
                    hwpeqn = latex_to_hwpeqn(child["latex"])
                    insert_equation(hwp, hwpeqn, base_size=eq_size)
                else:
                    txt = child.get("text", "")
                    if txt:
                        it(hwp, _clean_unicode(txt))
            sf(hwp, "함초롬바탕", body_size, False, WB_COLOR["body"])

        elif tp == "inline_math":
            hwpeqn = latex_to_hwpeqn(token["latex"])
            ok = insert_equation(hwp, hwpeqn, base_size=eq_size)
            if not ok:
                it(hwp, token["latex"])

        elif tp == "display_math":
            bp(hwp)
            _ensure_left_align(hwp)
            hwpeqn = latex_to_hwpeqn(token["latex"])
            ok = insert_equation(hwp, hwpeqn, base_size=eq_size + 0.5, treat_as_char=True)
            if not ok:
                it(hwp, token["latex"])
            bp(hwp)
            _ensure_left_align(hwp)
            sf(hwp, "함초롬바탕", body_size, False, WB_COLOR["body"])

        elif tp == "heading":
            bp(hwp)
            sf(hwp, "함초롬돋움", body_size + 1, True, WB_COLOR["title_dark"])
            _insert_text_with_inline_math(
                hwp, token["text"], "함초롬돋움", body_size + 1, True
            )
            bp(hwp)
            sf(hwp, "함초롬바탕", body_size, False, WB_COLOR["body"])

        elif tp == "list_item":
            indent = "  " * token.get("level", 0)
            it(hwp, indent + "· ")
            if "children" in token:
                _render_tokens_compact(hwp, token["children"], body_size, graph_infos)
            bp(hwp)

        elif tp == "horizontal_rule":
            _wb_thin_line(hwp)

        elif tp == "blockquote":
            sf(hwp, "함초롬바탕", body_size, False, WB_COLOR["line_dark"])
            it(hwp, "  │ ")
            sf(hwp, "함초롬바탕", body_size, False, WB_COLOR["body"])
            if "children" in token:
                _render_tokens_compact(hwp, token["children"], body_size, graph_infos)
            bp(hwp)

        elif tp == "code":
            it(hwp, token["text"])


WB_GRAPH_MAX_W = 55
WB_GRAPH_MAX_H = 50

SAFE_IMG_WIDTH_MM = COLUMN_WIDTH_MM * 0.9
SOL_GRAPH_MAX_W = SAFE_IMG_WIDTH_MM
SOL_GRAPH_MAX_H = 999

def _render_graph_markers(hwp, text: str, graph_infos: Dict, max_w: float = None, max_h: float = None):
    gw = max_w or WB_GRAPH_MAX_W
    parts = GRAPH_MARKER_RE.split(text)
    for i, part in enumerate(parts):
        if i % 2 == 0:
            clean = part.strip()
            if clean:
                it(hwp, clean)
        else:
            info = graph_infos.get(part)
            if info and os.path.exists(info.get("path", "")):
                src_w = info.get("width_mm", gw)
                src_h = info.get("height_mm", gw * 0.95)
                if src_w > gw:
                    ratio = gw / src_w
                    src_w = gw
                    src_h = src_h * ratio
                insert_graph_image(hwp, info["path"], src_w, src_h)
                _ensure_left_align(hwp)
            else:
                it(hwp, f"[그래프: {part}]")


# ═══════════════════════════════════════════════════════════════════════════════
# 선지(choices) 렌더링
# ═══════════════════════════════════════════════════════════════════════════════

def _insert_choices(hwp, choices: List[str]):
    if not choices:
        return
    bp(hwp)
    sf(hwp, "함초롬바탕", WB_FONT["choices"], False, WB_COLOR["body"])
    parts = []
    for i, ch in enumerate(choices):
        sym = CIRCLED_NUMS[i] if i < len(CIRCLED_NUMS) else f"({i+1})"
        parts.append(f"{sym} {ch}")
    it(hwp, "  ".join(parts))
    bp(hwp)


def _insert_choices_with_math(hwp, choices: List[str]):
    if not choices:
        return
    bp(hwp)
    sf(hwp, "함초롬바탕", WB_FONT["choices"], False, WB_COLOR["body"])
    for i, ch in enumerate(choices):
        sym = CIRCLED_NUMS[i] if i < len(CIRCLED_NUMS) else f"({i+1})"
        it(hwp, f"{sym} ")
        _insert_text_with_inline_math(
            hwp, ch, "함초롬바탕", WB_FONT["choices"], False
        )
        if i < len(choices) - 1:
            it(hwp, "  ")
    bp(hwp)


_EQ_MARKER_RE = re.compile(r"\[DEQ\](.*?)\[/DEQ\]|\[EQ\](.*?)\[/EQ\]")


def _insert_choices_with_eq_markers(hwp, choices: List[str]):
    """[EQ]/[DEQ] 마커가 포함된 선지 처리."""
    if not choices:
        return
    bp(hwp)
    sf(hwp, "함초롬바탕", WB_FONT["choices"], False, WB_COLOR["body"])
    for i, ch in enumerate(choices):
        sym = CIRCLED_NUMS[i] if i < len(CIRCLED_NUMS) else f"({i+1})"
        it(hwp, f"{sym} ")
        cursor = 0
        for m in _EQ_MARKER_RE.finditer(ch):
            before = ch[cursor:m.start()].strip()
            if before:
                sf(hwp, "함초롬바탕", WB_FONT["choices"], False, WB_COLOR["body"])
                if "$" in before:
                    _insert_text_with_inline_math(hwp, before, "함초롬바탕", WB_FONT["choices"], False)
                else:
                    it(hwp, before)
            hwpeqn = (m.group(1) or m.group(2) or "").strip()
            if hwpeqn:
                insert_equation(hwp, hwpeqn, base_size=WB_FONT.get("equation", 8))
            cursor = m.end()
        after = ch[cursor:].strip()
        if after:
            sf(hwp, "함초롬바탕", WB_FONT["choices"], False, WB_COLOR["body"])
            if "$" in after:
                _insert_text_with_inline_math(hwp, after, "함초롬바탕", WB_FONT["choices"], False)
            else:
                it(hwp, after)
        if i < len(choices) - 1:
            it(hwp, "  ")
    bp(hwp)


# ═══════════════════════════════════════════════════════════════════════════════
# 문제 영역 — 원본 문제 블록
# ═══════════════════════════════════════════════════════════════════════════════

def insert_original_problem_block(hwp, data: Dict, temp_dir: str):
    source = data.get("source", "")
    content = data.get("content", "")
    image_path = data.get("imagePath")

    _wb_divider(hwp)
    sf(hwp, "함초롬돋움", WB_FONT["body"] + 1, True, WB_COLOR["num_blue"])
    it(hwp, "■ 원본 문제")
    bp(hwp)

    if source:
        sf(hwp, "함초롬돋움", WB_FONT["source_label"], True, WB_COLOR["title_dark"])
        it(hwp, f"  {source}")
        bp(hwp)

    _wb_divider(hwp)

    if content:
        _set_body_font(hwp)
        _process_content_compact(hwp, content)
    elif image_path and os.path.exists(str(image_path)):
        _insert_problem_image(hwp, image_path, temp_dir)
        _ensure_left_align(hwp)

    bp(hwp)
    _set_body_font(hwp)


def _insert_problem_image(hwp, image_path: str, temp_dir: str):
    """변형문제집용 원본 문제 이미지 — 원본 비율 그대로, 컬럼 폭에 맞춤."""
    try:
        from PIL import Image
        img = Image.open(image_path)
        w, h = img.size
        if w < 800:
            scale = max(800 / w, 2.0)
            new_w, new_h = int(w * scale), int(h * scale)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            upscaled = os.path.join(temp_dir, "wb_problem_upscaled.png")
            img.save(upscaled, "PNG", quality=95)
            image_path = upscaled
            w, h = new_w, new_h
        aspect = h / w
        width_mm = SAFE_IMG_WIDTH_MM
        height_mm = width_mm * aspect
    except Exception:
        width_mm = SAFE_IMG_WIDTH_MM
        height_mm = width_mm * 0.75
    print(f"[INFO] Problem image: {width_mm:.0f}x{height_mm:.0f}mm", file=sys.stderr)
    insert_graph_image(hwp, image_path, width_mm, height_mm)


# ═══════════════════════════════════════════════════════════════════════════════
# 문제 영역 — 변형 문제 블록
# ═══════════════════════════════════════════════════════════════════════════════

def insert_variation_block(
    hwp, num: int, data: Dict,
    graph_infos: Dict, temp_dir: str,
):
    content = data.get("content", "")
    choices = data.get("choices", [])
    graph_path = data.get("graphImagePath")

    _wb_divider(hwp)
    sf(hwp, "함초롬돋움", WB_FONT["problem_num"], True, WB_COLOR["num_blue"])
    it(hwp, f"  {num:02d}")
    sf(hwp, "함초롬돋움", WB_FONT["variation_title"], True, WB_COLOR["title_dark"])
    it(hwp, f"   변형 {num}")
    bp(hwp)
    _wb_divider(hwp)

    if content:
        _set_body_font(hwp)
        _process_content_compact(hwp, content, WB_FONT["body"], graph_infos)

    if graph_path and os.path.exists(str(graph_path)):
        bp(hwp)
        _insert_variation_graph(hwp, graph_path)
        _ensure_left_align(hwp)

    if choices:
        bp(hwp)
        has_math = any("$" in c for c in choices)
        has_eq = any("[EQ]" in c or "[DEQ]" in c for c in choices)
        if has_eq:
            _insert_choices_with_eq_markers(hwp, choices)
        elif has_math:
            _insert_choices_with_math(hwp, choices)
        else:
            _insert_choices(hwp, choices)

    bp(hwp)
    _set_body_font(hwp)


def _insert_variation_graph(hwp, graph_path: str):
    """변형 블록 그래프 — 원본 비율 그대로, 컬럼 폭에 맞춤."""
    try:
        from PIL import Image
        img = Image.open(graph_path)
        w, h = img.size
        aspect = h / w
        width_mm = SAFE_IMG_WIDTH_MM
        height_mm = width_mm * aspect
    except Exception:
        width_mm = SAFE_IMG_WIDTH_MM
        height_mm = width_mm * 0.95
    insert_graph_image(hwp, graph_path, width_mm, height_mm)


# ═══════════════════════════════════════════════════════════════════════════════
# 정답 및 풀이 — 헤더
# ═══════════════════════════════════════════════════════════════════════════════

def insert_answer_section_header(hwp):
    sf(hwp, "함초롬돋움", WB_FONT["answer_header"], True, WB_COLOR["title_dark"])
    it(hwp, "정답 및 풀이")
    bp(hwp)
    _wb_thick_divider(hwp, WB_COLOR["line_dark"])
    bp(hwp)
    _set_body_font(hwp, WB_FONT["body_sm"])


# ═══════════════════════════════════════════════════════════════════════════════
# 정답 및 풀이 — 개별 솔루션
# ═══════════════════════════════════════════════════════════════════════════════

def insert_solution_block(hwp, num: int, sol_data: Dict, graph_infos: Dict = None):
    answer_text = sol_data.get("answer_text", "")
    point = sol_data.get("variation_point", "")
    explanation = sol_data.get("explanation", "")
    bs = WB_FONT["body_sm"]
    gi = graph_infos or {}

    sf(hwp, "함초롬돋움", WB_FONT["solution_num"], True, WB_COLOR["answer_green"])
    it(hwp, f"▐{num:02d}. 정답  ")
    sf(hwp, "함초롬돋움", WB_FONT["solution_num"], True, WB_COLOR["title_dark"])
    it(hwp, answer_text)
    bp(hwp)

    if point:
        sf(hwp, "함초롬돋움", bs, True, WB_COLOR["point_purple"])
        it(hwp, "[변형 포인트] ")
        sf(hwp, "함초롬바탕", bs, False, WB_COLOR["body"])
        _process_content_compact(hwp, point, bs, gi)
        bp(hwp)

    if explanation:
        bp(hwp)
        sf(hwp, "함초롬돋움", bs, True, WB_COLOR["title_dark"])
        it(hwp, "[간단 풀이]")
        bp(hwp)
        sf(hwp, "함초롬바탕", bs, False, WB_COLOR["body"])
        _process_content_compact(hwp, explanation, bs, gi)
        bp(hwp)

    bp(hwp)
    _set_body_font(hwp, bs)


# ═══════════════════════════════════════════════════════════════════════════════
# 메인 문서 생성
# ═══════════════════════════════════════════════════════════════════════════════

def generate_workbook(
    hwp, data: Dict, output_path: str, temp_dir: str,
) -> Dict:
    original = data.get("original_problem", {})
    variations = data.get("variations", [])
    solutions = data.get("solutions", [])
    graph_image_paths = data.get("graphImagePaths", [])
    all_graph_infos: Dict[str, Any] = {}

    # 웹 캡처 그래프 이미지 매핑
    for i, gp in enumerate(graph_image_paths):
        if gp and os.path.exists(str(gp)):
            all_graph_infos[f"webgraph_{i}"] = {
                "path": gp,
                "web_capture": True,
            }

    # ─── 1. 페이지 설정 ───────────────────────────────────────────────
    setup_workbook_page(hwp)

    # ─── 2. 다단 2단 설정 + 왼쪽 정렬 ──────────────────────────────────
    setup_two_column(hwp)
    _ensure_left_align(hwp)

    # ─── 2b. 변형 content 내 language-graph 블록 → matplotlib 렌더링 ──
    for v in variations:
        content = v.get("content", "")
        if content and GRAPH_BLOCK_RE.search(content):
            rendered_content, gi = extract_and_render_graphs(content, temp_dir, f"var{v.get('num', 0)}")
            v["content"] = rendered_content
            all_graph_infos.update(gi)

    # ─── 3. 문제 영역 배치 ────────────────────────────────────────────
    all_items = []  # (type, data)
    if original:
        all_items.append(("original", original))
    for v in variations:
        all_items.append(("variation", v))

    for idx, (item_type, item_data) in enumerate(all_items):
        col_pos = idx % 2  # 0=left, 1=right

        if idx > 0 and col_pos == 0:
            page_break(hwp)

        if col_pos == 1:
            column_break(hwp)

        if item_type == "original":
            insert_original_problem_block(hwp, item_data, temp_dir)
        else:
            vnum = item_data.get("num", (idx if not original else idx))
            insert_variation_block(
                hwp, vnum, item_data, all_graph_infos, temp_dir,
            )

    # ─── 3b. 솔루션 내 language-graph 블록 렌더링 ────────────────────
    for sol in solutions:
        for field in ("explanation", "variation_point"):
            content = sol.get(field, "")
            if content and GRAPH_BLOCK_RE.search(content):
                rendered, gi = extract_and_render_graphs(content, temp_dir, f"sol{sol.get('num', 0)}_{field}")
                sol[field] = rendered
                all_graph_infos.update(gi)

    # ─── 4. 정답 및 풀이 섹션 ─────────────────────────────────────────
    if solutions:
        _build_answer_section(hwp, solutions, all_graph_infos)

    # ─── 5. 저장 ──────────────────────────────────────────────────────
    save_document(hwp, output_path)
    return all_graph_infos


def _build_answer_section(hwp, solutions: List[Dict], graph_infos: Dict = None):
    """정답 및 풀이 섹션: 새 구역 + 전폭 타이틀 + 2단 솔루션."""
    gi = graph_infos or {}

    # 방법 1: BreakSection → 1단 타이틀 → BreakColDef → 2단 솔루션
    try:
        section_break(hwp)
        setup_workbook_page(hwp)
        _ensure_left_align(hwp)

        insert_answer_section_header(hwp)

        col_def_break(hwp)
        setup_two_column(hwp)
        _ensure_left_align(hwp)

        for sol in solutions:
            num = sol.get("num", 0)
            insert_solution_block(hwp, num, sol, gi)

        print("[INFO] Answer section: section-break + col-def-break mode", file=sys.stderr)
        return
    except Exception as e:
        print(f"[WARN] Answer section method 1 failed: {e}", file=sys.stderr)

    # 방법 2: 폴백 — PageBreak + 2단 유지, 타이틀은 좌측 단
    try:
        page_break(hwp)
        _ensure_left_align(hwp)
        insert_answer_section_header(hwp)

        for sol in solutions:
            num = sol.get("num", 0)
            insert_solution_block(hwp, num, sol, gi)

        print("[INFO] Answer section: fallback (left-column title)", file=sys.stderr)
    except Exception as e:
        print(f"[ERROR] Answer section failed: {e}", file=sys.stderr)


# ═══════════════════════════════════════════════════════════════════════════════
# 다문항 합본 워크북 — PDF에서 식별된 여러 문제의 변형을 하나로
# ═══════════════════════════════════════════════════════════════════════════════

def generate_multi_workbook(
    hwp, data: Dict, output_path: str, temp_dir: str,
) -> Dict:
    """PDF 다문항 변형문제 합본: 문제들 쭉 → 해설들 쭉 → 하나의 HWPX."""
    problems = data.get("problems", [])
    include_original = data.get("includeOriginal", True)
    graph_image_paths = data.get("graphImagePaths", [])
    all_graph_infos: Dict[str, Any] = {}

    for i, gp in enumerate(graph_image_paths):
        if gp and os.path.exists(str(gp)):
            all_graph_infos[f"webgraph_{i}"] = {"path": gp, "web_capture": True}

    setup_workbook_page(hwp)
    setup_two_column(hwp)
    _ensure_left_align(hwp)

    all_solutions: List[Dict] = []
    global_var_num = 0

    for pi, prob in enumerate(problems):
        prob_num = prob.get("num", pi + 1)
        sections = prob.get("sections", [])
        crop_path = prob.get("cropImagePath")
        content = "\n\n".join(s for s in sections if s and s.strip())

        wb_data = extract_workbook_data_from_markdown([content], crop_path if include_original else None)

        # language-graph 블록 렌더링
        for v in wb_data.get("variations", []):
            vc = v.get("content", "")
            if vc and GRAPH_BLOCK_RE.search(vc):
                rendered, gi = extract_and_render_graphs(vc, temp_dir, f"p{pi}_var{v.get('num', 0)}")
                v["content"] = rendered
                all_graph_infos.update(gi)

        variations = wb_data.get("variations", [])
        original = wb_data.get("original_problem", {})

        # 문제별 구분 헤더
        if pi > 0:
            page_break(hwp)

        sf(hwp, "함초롬돋움", WB_FONT["body"] + 2, True, WB_COLOR["num_blue"])
        it(hwp, f"  ■ {prob_num}번")
        bp(hwp)
        _wb_thick_divider(hwp)

        # 원본 + 변형을 2단에 배치
        items = []
        if include_original and (original.get("content") or original.get("imagePath")):
            items.append(("original", original))
        for v in variations:
            items.append(("variation", v))

        for idx, (item_type, item_data) in enumerate(items):
            col_pos = idx % 2

            if idx > 0 and col_pos == 0:
                page_break(hwp)
            if col_pos == 1:
                column_break(hwp)

            if item_type == "original":
                insert_original_problem_block(hwp, item_data, temp_dir)
            else:
                global_var_num += 1
                vnum = item_data.get("num", global_var_num)
                insert_variation_block(hwp, vnum, item_data, all_graph_infos, temp_dir)

        # 풀이는 나중에 한꺼번에
        for sol in wb_data.get("solutions", []):
            sol["_prob_num"] = prob_num
            all_solutions.append(sol)

    # ── 정답 및 풀이 합본 ────────────────────────────────────────────────
    if all_solutions:
        _build_answer_section(hwp, all_solutions, all_graph_infos)

    save_document(hwp, output_path)
    return all_graph_infos


# ═══════════════════════════════════════════════════════════════════════════════
# 해설 워크북 — 해설 sections를 워크북 스타일(2단 콤팩트)로 생성
# ═══════════════════════════════════════════════════════════════════════════════

SOLUTION_TITLES = ["실전풀이", "해체분석", "숏컷 + 고급기법", "변형 대비"]
SOLUTION_COLORS = [
    WB_COLOR["num_blue"],
    0x6B4C9A,
    0x0677D9,
    0x699605,
]


def _insert_solution_section_header(hwp, sec_idx: int):
    title = SOLUTION_TITLES[sec_idx] if sec_idx < len(SOLUTION_TITLES) else f"섹션 {sec_idx + 1}"
    color = SOLUTION_COLORS[sec_idx] if sec_idx < len(SOLUTION_COLORS) else WB_COLOR["num_blue"]

    _wb_divider(hwp)
    sf(hwp, "함초롬돋움", WB_FONT["problem_num"], True, color)
    it(hwp, f"  {sec_idx + 1:02d}")
    sf(hwp, "함초롬돋움", WB_FONT["variation_title"], True, WB_COLOR["title_dark"])
    it(hwp, f"   {title}")
    bp(hwp)
    _wb_divider(hwp)
    _set_body_font(hwp)


def _prepare_section_content(
    content: str, graph_paths: List[str],
    all_graph_infos: Dict, temp_dir: str, prefix: str,
) -> str:
    from hwpx_generator import strip_duplicate_step_heading
    processed = strip_duplicate_step_heading(content)

    if graph_paths:
        from hwpx_generator_v2 import WEB_GRAPH_MARKER_RE
        def _repl(m):
            idx = int(m.group(1))
            if idx < len(graph_paths) and graph_paths[idx]:
                mid = f"webgraph_{idx}"
                all_graph_infos[mid] = {"path": graph_paths[idx], "web_capture": True}
                return f"\n{GRAPH_MARKER_PREFIX}{mid}{GRAPH_MARKER_SUFFIX}\n"
            return m.group(0)
        processed = WEB_GRAPH_MARKER_RE.sub(_repl, processed)

    if GRAPH_BLOCK_RE.search(processed):
        rendered, gi = extract_and_render_graphs(processed, temp_dir, prefix)
        processed = rendered
        all_graph_infos.update(gi)

    return processed


def _insert_problem_image_sol(hwp, image_path: str, temp_dir: str):
    """해설 워크북용 원본 문제 이미지 — 원본 비율 그대로, 컬럼 폭에 맞춤."""
    try:
        from PIL import Image
        img = Image.open(image_path)
        w, h = img.size
        if w < 800:
            scale = max(800 / w, 2.0)
            new_w, new_h = int(w * scale), int(h * scale)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            upscaled = os.path.join(temp_dir, "sol_problem_upscaled.png")
            img.save(upscaled, "PNG", quality=95)
            image_path = upscaled
            w, h = new_w, new_h
        aspect = h / w
        width_mm = SAFE_IMG_WIDTH_MM
        height_mm = width_mm * aspect
    except Exception:
        width_mm = SAFE_IMG_WIDTH_MM
        height_mm = width_mm * 0.75
    print(f"[INFO] Problem image: {width_mm:.0f}x{height_mm:.0f}mm", file=sys.stderr)
    insert_graph_image(hwp, image_path, width_mm, height_mm)


def _insert_cropped_diagram(hwp, image_path: str):
    """크롭된 도형/그래프 이미지 — 원본 비율 그대로, 컬럼 폭 90%에 맞춤."""
    try:
        from PIL import Image
        img = Image.open(image_path)
        w, h = img.size
        aspect = h / w
        width_mm = SAFE_IMG_WIDTH_MM
        height_mm = width_mm * aspect
    except Exception:
        width_mm = SAFE_IMG_WIDTH_MM
        height_mm = width_mm * 0.75
    insert_graph_image(hwp, image_path, width_mm, height_mm)


def _insert_problem_hybrid_block(hwp, blocks: List[Dict], temp_dir: str):
    """Nova AI 스타일 하이브리드 렌더링: 텍스트 타이핑 + HwpEqn 직접 삽입 + 도형 크롭.

    equation 블록은 Gemini가 HwpEqn 문법으로 직접 출력한 것이므로
    latex_to_hwpeqn 변환 없이 insert_equation에 직접 전달한다.
    만약 LaTeX 잔재(\\frac 등)가 감지되면 폴백으로 latex_to_hwpeqn을 적용한다.
    """
    _wb_divider(hwp)
    sf(hwp, "함초롬돋움", 9.5, True, WB_COLOR["num_blue"])
    it(hwp, "  ■ 원본 문제")
    bp(hwp)
    _wb_divider(hwp)
    bp(hwp)

    _set_body_font(hwp, WB_FONT["body"])

    for block in blocks:
        btype = block.get("type", "")

        if btype == "text":
            content = block.get("content", "")
            if not content:
                continue
            _set_body_font(hwp, WB_FONT["body"])
            if "$" in content:
                _insert_text_with_inline_math(
                    hwp, content, "함초롬바탕", WB_FONT["body"], False
                )
            else:
                it(hwp, content)
            bp(hwp)

        elif btype == "equation":
            eqn = block.get("content", "")
            if not eqn:
                continue
            if "\\" in eqn and ("\\frac" in eqn or "\\sqrt" in eqn or "\\left" in eqn):
                eqn = latex_to_hwpeqn(eqn)
            bp(hwp)
            _ensure_left_align(hwp)
            insert_equation(hwp, eqn, base_size=WB_FONT["body"], treat_as_char=True)
            bp(hwp)
            _set_body_font(hwp, WB_FONT["body"])

        elif btype == "crop":
            image_path = block.get("imagePath", "")
            if image_path and os.path.exists(str(image_path)):
                bp(hwp)
                _insert_cropped_diagram(hwp, image_path)
                _ensure_left_align(hwp)
                bp(hwp)

    _set_body_font(hwp)


def _insert_sol_problem_block(hwp, data: Dict, temp_dir: str, graph_infos: Dict = None):
    """원본 문제 블록 — 전사 텍스트(수식 포함) + 원본 이미지 동시 표시."""
    content = data.get("content", "")
    image_path = data.get("imagePath")
    gi = graph_infos or {}

    _wb_divider(hwp)
    sf(hwp, "함초롬돋움", 9.5, True, WB_COLOR["num_blue"])
    it(hwp, "  ■ 원본 문제")
    bp(hwp)
    _wb_divider(hwp)

    if content:
        bp(hwp)
        _set_body_font(hwp, WB_FONT["body"])
        _process_content_compact(hwp, content, WB_FONT["body"], gi)

    if image_path and os.path.exists(str(image_path)):
        bp(hwp)
        _insert_problem_image_sol(hwp, image_path, temp_dir)
        _ensure_left_align(hwp)

    bp(hwp)
    _set_body_font(hwp)


def generate_solution_workbook(
    hwp, data: Dict, output_path: str, temp_dir: str,
) -> Dict:
    """해설 워크북 — single 모드 (참조: 2026 3모 해설.hwpx).

    2단 다단 + 8pt 콤팩트 레이아웃:
      ■ 원본 문제 (텍스트 or 이미지)
      01 실전풀이 / 02 해체분석 / 03 숏컷+고급기법 / 04 변형 대비
    """
    sections = data.get("sections", [])
    problem_content = data.get("problemContent", "")
    problem_img = data.get("problemImagePath")
    graph_paths = data.get("graphImagePaths", [])
    all_graph_infos: Dict[str, Any] = {}

    for i, gp in enumerate(graph_paths):
        if gp and os.path.exists(str(gp)):
            all_graph_infos[f"webgraph_{i}"] = {"path": gp, "web_capture": True}

    # ── 페이지 설정 (참조 양식: 15mm 사방, 8mm 푸터) ──────────────
    setup_workbook_page(hwp)

    # ── 2단 다단 설정 (참조 양식: colCount=2, 6mm gap) ────────────
    setup_two_column(hwp)
    _ensure_left_align(hwp)

    # ── 줄간격 160% (Nova AI 참조) ────────────────────────────────
    _set_line_spacing(hwp, 160)

    # ── 원본 문제 (Nova 하이브리드 or 기존 방식) ────────────────────
    problem_blocks = data.get("problemBlocks")
    has_problem = bool(problem_blocks) or bool(problem_content) or (
        problem_img and os.path.exists(str(problem_img))
    )
    if has_problem:
        block_data: Dict[str, Any] = {}
        if problem_blocks:
            block_data["problemBlocks"] = problem_blocks
        if problem_content:
            block_data["content"] = problem_content
        if problem_img:
            block_data["imagePath"] = problem_img
        _insert_sol_problem_block(hwp, block_data, temp_dir, all_graph_infos)

    # ── 해설 섹션 ─────────────────────────────────────────────────
    for sec_idx, content in enumerate(sections):
        if not content or not content.strip():
            continue

        _insert_solution_section_header(hwp, sec_idx)

        processed = _prepare_section_content(
            content, graph_paths, all_graph_infos, temp_dir, f"s{sec_idx}",
        )

        _set_body_font(hwp)
        _process_content_compact(hwp, processed, WB_FONT["body"], all_graph_infos,
                                 graph_max_w=SOL_GRAPH_MAX_W, graph_max_h=SOL_GRAPH_MAX_H)
        bp(hwp)

    save_document(hwp, output_path)
    return all_graph_infos


def generate_solution_batch_workbook(
    hwp, data: Dict, output_path: str, temp_dir: str,
) -> Dict:
    """해설 워크북 — batch 모드 (참조: 2026 3모 해설.hwpx).

    2단 다단 + 8pt 콤팩트 레이아웃:
    각 문제: 문제 번호 + 원본 문제 + 해설 섹션, column/page break로 구분.
    """
    problems = data.get("problems", [])
    graph_paths = data.get("graphImagePaths", [])
    all_graph_infos: Dict[str, Any] = {}

    for i, gp in enumerate(graph_paths):
        if gp and os.path.exists(str(gp)):
            all_graph_infos[f"webgraph_{i}"] = {"path": gp, "web_capture": True}

    # ── 페이지 설정 (참조 양식: 15mm 사방, 8mm 푸터) ──────────────
    setup_workbook_page(hwp)

    # ── 2단 다단 설정 (참조 양식: colCount=2, 6mm gap) ────────────
    setup_two_column(hwp)
    _ensure_left_align(hwp)

    # ── 줄간격 160% (Nova AI 참조) ────────────────────────────────
    _set_line_spacing(hwp, 160)

    for pi, prob in enumerate(problems):
        num = prob.get("num", pi + 1)
        secs = prob.get("sections", [])
        prob_content = prob.get("problemContent", "")
        crop_img = prob.get("imagePath")

        if pi > 0:
            column_break(hwp)

        # ── 문제 번호 + 원본 문제 ─────────────────────────────────
        _wb_thick_divider(hwp, WB_COLOR["num_blue"])
        sf(hwp, "함초롬돋움", WB_FONT["problem_num"], True, WB_COLOR["num_blue"])
        it(hwp, f"  {num:02d}")
        sf(hwp, "함초롬돋움", WB_FONT["variation_title"] + 1, True, WB_COLOR["title_dark"])
        it(hwp, f"   {num}번 해설")
        bp(hwp)

        prob_blocks = prob.get("problemBlocks")
        block_data: Dict[str, Any] = {}
        if prob_blocks:
            block_data["problemBlocks"] = prob_blocks
        if prob_content:
            block_data["content"] = prob_content
        if crop_img and os.path.exists(str(crop_img)):
            block_data["imagePath"] = crop_img

        if block_data:
            _insert_sol_problem_block(hwp, block_data, temp_dir, all_graph_infos)

        # ── 해설 섹션 ─────────────────────────────────────────────
        for sec_idx, content in enumerate(secs):
            if not content or not content.strip():
                continue

            _insert_solution_section_header(hwp, sec_idx)

            processed = _prepare_section_content(
                content, graph_paths, all_graph_infos, temp_dir, f"p{pi}_s{sec_idx}",
            )

            _set_body_font(hwp)
            _process_content_compact(hwp, processed, WB_FONT["body"], all_graph_infos,
                                     graph_max_w=SOL_GRAPH_MAX_W, graph_max_h=SOL_GRAPH_MAX_H)
            bp(hwp)

    save_document(hwp, output_path)
    return all_graph_infos


# ═══════════════════════════════════════════════════════════════════════════════
# 마크다운 기반 워크북 — 기존 sections 형식에서 변형 추출
# ═══════════════════════════════════════════════════════════════════════════════

# AI 출력 형식: **변형 N** content / **변형 N [정답]** ③
# 기존 형식: ## 변형 N content / ■ N. 정답 ③
VARIATION_EXTRACT_RE = re.compile(
    r"(?:#{1,3}\s+|\*\*)변형\s*(\d+)\*{0,2}\s*(.*?)(?=(?:#{1,3}\s+|\*\*)변형\s*\d+|#{1,3}\s*정답|$)",
    re.DOTALL,
)

ANSWER_EXTRACT_RE = re.compile(
    r"#{1,3}\s*(?:정답\s*및\s*풀이|정답과\s*풀이)(.*)",
    re.DOTALL,
)

SINGLE_ANSWER_RE = re.compile(
    r"(?:"
    r"(?:■\s*)?(?P<n1>\d+)\.\s*정답\s*"
    r"|"
    r"\*\*\s*변형\s*(?P<n2>\d+)\s*\[정답\]\s*\*\*\s*"
    r")"
    r"(?P<ans>[①②③④⑤⑥⑦⑧⑨⑩\d]+)"
    r"(?P<rest>.*?)"
    r"(?="
    r"(?:■\s*)?\d+\.\s*정답"
    r"|"
    r"\*\*\s*변형\s*\d+\s*\[정답\]\s*\*\*"
    r"|---"
    r"|$"
    r")",
    re.DOTALL,
)

CHOICES_LINE_RE = re.compile(
    r"^\s*[①②③④⑤]\s*[-–]?\s*\d",
    re.MULTILINE,
)


ORIGINAL_PROBLEM_RE = re.compile(
    r"#{1,3}\s*원본\s*문제\s*(.*?)(?=#{1,3}\s*문제\b|(?:#{1,3}\s+|\*\*)변형\s*\d+|$)",
    re.DOTALL,
)


def extract_workbook_data_from_markdown(sections: List[str], problem_image: str = None) -> Dict:
    """기존 sections 배열(마크다운)에서 워크북 구조 데이터를 추출."""
    full_md = "\n\n".join(s for s in sections if s and s.strip())

    result: Dict[str, Any] = {
        "original_problem": {},
        "variations": [],
        "solutions": [],
    }

    if problem_image:
        result["original_problem"]["imagePath"] = problem_image

    # 원본 문제 텍스트 추출 (AI가 타이핑한 원본)
    orig_m = ORIGINAL_PROBLEM_RE.search(full_md)
    if orig_m:
        orig_text = orig_m.group(1).strip()
        orig_text = re.sub(r"^---+\s*$", "", orig_text, flags=re.MULTILINE).strip()
        if orig_text:
            result["original_problem"]["content"] = orig_text

    # 정답 섹션 위치를 먼저 찾아서, 그 이전 텍스트에서만 변형문제를 추출
    ans_m = ANSWER_EXTRACT_RE.search(full_md)
    problem_section = full_md[:ans_m.start()] if ans_m else full_md

    # 변형 문제 추출 (정답 섹션 이전만)
    for m in VARIATION_EXTRACT_RE.finditer(problem_section):
        vnum = int(m.group(1))
        body = m.group(2).strip()

        choices = _extract_choices(body)
        body_clean = _remove_choices_from_body(body)

        result["variations"].append({
            "num": vnum,
            "content": body_clean,
            "choices": choices,
        })

    # 정답 섹션 추출
    if ans_m:
        ans_body = ans_m.group(1)
        for sm in SINGLE_ANSWER_RE.finditer(ans_body):
            snum = int(sm.group("n1") or sm.group("n2"))
            answer = sm.group("ans").strip()
            detail = sm.group("rest").strip()

            point = ""
            explanation = detail

            # **[변형 포인트]** 또는 [변형 포인트] 매칭
            point_m = re.search(
                r"(?:\*\*\s*)?\[변형\s*포인트\](?:\s*\*\*)?\s*(.*?)(?=(?:\*\*\s*)?\[간단\s*풀이\]|$)",
                detail, re.DOTALL,
            )
            if point_m:
                point = point_m.group(1).strip()
            expl_m = re.search(
                r"(?:\*\*\s*)?\[간단\s*풀이\](?:\s*\*\*)?\s*(.*)",
                detail, re.DOTALL,
            )
            if expl_m:
                explanation = expl_m.group(1).strip()

            result["solutions"].append({
                "num": snum,
                "answer_text": answer,
                "variation_point": point,
                "explanation": explanation,
            })

    return result


def _extract_choices(body: str) -> List[str]:
    choices = []
    for sym in CIRCLED_NUMS[:5]:
        m = re.search(rf"{re.escape(sym)}\s*(.+?)(?={re.escape(CIRCLED_NUMS[CIRCLED_NUMS.index(sym)+1]) if CIRCLED_NUMS.index(sym) < 4 else '$'})", body)
        if m:
            choices.append(m.group(1).strip())
    if not choices:
        line_m = re.search(r"[①②③④⑤].*[①②③④⑤].*", body)
        if line_m:
            line = line_m.group(0)
            for sym in CIRCLED_NUMS[:5]:
                parts = line.split(sym)
                if len(parts) > 1:
                    val = parts[1].split("②")[0].split("③")[0].split("④")[0].split("⑤")[0].strip()
                    if val:
                        choices.append(val)
    return choices


def _remove_choices_from_body(body: str) -> str:
    lines = body.split("\n")
    result = []
    for line in lines:
        if re.match(r"^\s*[①②③④⑤]", line.strip()):
            continue
        result.append(line)
    return "\n".join(result).strip()


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="한글 2단 문제집(워크북) 생성기"
    )
    parser.add_argument("--input", required=True, help="입력 JSON 파일")
    parser.add_argument("--output", required=True, help="출력 HWPX 파일 경로")
    parser.add_argument(
        "--format", default="auto",
        choices=["structured", "markdown", "auto", "multi", "solution", "solution-batch"],
        help="입력 형식: structured/markdown/auto/multi/solution/solution-batch",
    )
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)

    fmt = args.format
    if fmt == "auto":
        if data.get("format") == "multi":
            fmt = "multi"
        elif "variations" in data:
            fmt = "structured"
        elif "sections" in data:
            fmt = "markdown"
        else:
            fmt = "structured"
    if data.get("format") == "multi":
        fmt = "multi"

    if fmt == "markdown":
        sections = data.get("sections", [])
        problem_img = data.get("problemImagePath")
        graph_paths = data.get("graphImagePaths", [])

        # [GRAPH_IMG:N] 마커를 내부 그래프 마커(⟦GRAPH:webgraph_N⟧)로 변환
        if graph_paths:
            from hwpx_generator_v2 import WEB_GRAPH_MARKER_RE
            converted_sections = []
            for s in sections:
                if not s:
                    converted_sections.append(s)
                    continue
                def _wb_marker_replace(m):
                    idx = int(m.group(1))
                    if idx < len(graph_paths) and graph_paths[idx]:
                        return f"\n{GRAPH_MARKER_PREFIX}webgraph_{idx}{GRAPH_MARKER_SUFFIX}\n"
                    return m.group(0)
                converted_sections.append(WEB_GRAPH_MARKER_RE.sub(_wb_marker_replace, s))
            sections = converted_sections

        data = extract_workbook_data_from_markdown(sections, problem_img)
        data["graphImagePaths"] = graph_paths
        print(
            f"[INFO] Extracted {len(data['variations'])} variations, "
            f"{len(data['solutions'])} solutions from markdown",
            file=sys.stderr,
        )

    if fmt == "solution" or fmt == "solution-batch":
        if data.get("mode") == "batch" or data.get("problems"):
            fmt = "solution-batch"
        else:
            fmt = "solution"

    print(f"[INFO] Workbook generation (fmt={fmt}) -> {args.output}", file=sys.stderr)

    temp_dir = tempfile.mkdtemp(prefix="wb_graph_")
    hwp = create_hwp()
    try:
        if fmt == "solution":
            infos = generate_solution_workbook(hwp, data, args.output, temp_dir)
        elif fmt == "solution-batch":
            infos = generate_solution_batch_workbook(hwp, data, args.output, temp_dir)
        elif fmt == "multi":
            infos = generate_multi_workbook(hwp, data, args.output, temp_dir)
        else:
            infos = generate_workbook(hwp, data, args.output, temp_dir)
        n = len(infos)
        if n:
            print(f"[INFO] {n} graph(s) rendered", file=sys.stderr)
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    finally:
        try:
            hwp.Clear(1)
        except Exception:
            pass
        try:
            hwp.Quit()
        except Exception:
            pass
        time.sleep(0.5)
        try:
            import subprocess
            subprocess.run(
                ["taskkill", "/IM", "Hwp.exe", "/F"],
                capture_output=True, timeout=5,
            )
        except Exception:
            pass
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass


if __name__ == "__main__":
    main()
