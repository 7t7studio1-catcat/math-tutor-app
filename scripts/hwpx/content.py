"""
콘텐츠 렌더링 — 마크다운/HwpEqn을 HWP 문서에 삽입

두 가지 경로:
1. AI 변환된 [EQ]/[DEQ] 마커 → process_hwpeqn_content() (정규식 변환 우회)
2. 일반 마크다운 → process_markdown_content() (parse_markdown → 토큰 렌더링)
"""

import os
import sys
import re
import time
from typing import Dict, List, Any

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from markdown_parser import parse_markdown, Token
from latex_to_hwpeqn import latex_to_hwpeqn

from .equation import insert_equation
from .layout import (
    sf, it, bp, set_body_font, ensure_left_align,
    insert_divider, insert_thin_line,
    _insert_text_with_inline_math,
    FONT, COLOR, SAFE_IMG_WIDTH_MM,
)


# ═══════════════════════════════════════════════════════════════════════════════
# 유니코드 정리
# ═══════════════════════════════════════════════════════════════════════════════

def clean_unicode(text: str) -> str:
    text = text.replace("\\neq", "≠").replace("\\mid", "|")
    text = text.replace("<=>", "⇔").replace("<>", "≠")
    text = text.replace(">=", "≥").replace("<=", "≤")
    text = re.sub(r"(?<!=)=>(?!=)", "⇒", text)
    text = re.sub(r"(?<!=)=<(?!=)", "⇐", text)
    text = text.replace("->", "→").replace("<-", "←")
    for ch in ("\u2066", "\u2067", "\u2068", "\u2069",
               "\u200e", "\u200f", "\u202a", "\u202b",
               "\u202c", "\u202d", "\u202e",
               "\u200b", "\u200c", "\u200d", "\ufeff"):
        text = text.replace(ch, "")
    return text


_LATEX_TO_UNICODE = {
    r"\Rightarrow": "⇒",
    r"\rightarrow": "→",
    r"\Leftarrow": "⇐",
    r"\leftarrow": "←",
    r"\Leftrightarrow": "⇔",
    r"\leftrightarrow": "↔",
    r"\implies": "⇒",
    r"\iff": "⇔",
    r"\to": "→",
    r"\leq": "≤",
    r"\le": "≤",
    r"\geq": "≥",
    r"\ge": "≥",
    r"\neq": "≠",
    r"\ne": "≠",
    r"\not=": "≠",
    r"\times": "×",
    r"\cdot": "·",
    r"\div": "÷",
    r"\pm": "±",
    r"\mp": "∓",
    r"\approx": "≈",
    r"\equiv": "≡",
    r"\sim": "∼",
    r"\propto": "∝",
    r"\infty": "∞",
    r"\partial": "∂",
    r"\nabla": "∇",
    r"\alpha": "α",
    r"\beta": "β",
    r"\gamma": "γ",
    r"\delta": "δ",
    r"\epsilon": "ε",
    r"\varepsilon": "ε",
    r"\zeta": "ζ",
    r"\eta": "η",
    r"\theta": "θ",
    r"\vartheta": "ϑ",
    r"\iota": "ι",
    r"\kappa": "κ",
    r"\lambda": "λ",
    r"\mu": "μ",
    r"\nu": "ν",
    r"\xi": "ξ",
    r"\pi": "π",
    r"\rho": "ρ",
    r"\sigma": "σ",
    r"\tau": "τ",
    r"\upsilon": "υ",
    r"\phi": "φ",
    r"\varphi": "φ",
    r"\chi": "χ",
    r"\psi": "ψ",
    r"\omega": "ω",
    r"\Gamma": "Γ",
    r"\Delta": "Δ",
    r"\Theta": "Θ",
    r"\Lambda": "Λ",
    r"\Xi": "Ξ",
    r"\Pi": "Π",
    r"\Sigma": "Σ",
    r"\Phi": "Φ",
    r"\Psi": "Ψ",
    r"\Omega": "Ω",
    r"\in": "∈",
    r"\notin": "∉",
    r"\subset": "⊂",
    r"\supset": "⊃",
    r"\subseteq": "⊆",
    r"\supseteq": "⊇",
    r"\cup": "∪",
    r"\cap": "∩",
    r"\emptyset": "∅",
    r"\forall": "∀",
    r"\exists": "∃",
    r"\angle": "∠",
    r"\triangle": "△",
    r"\perp": "⊥",
    r"\parallel": "∥",
    r"\therefore": "∴",
    r"\because": "∵",
    r"\ldots": "…",
    r"\cdots": "⋯",
    r"\vdots": "⋮",
    r"\ddots": "⋱",
    r"\degree": "°",
    r"\circ": "°",
    r"\bullet": "•",
    r"\neg": "¬",
    r"\lfloor": "⌊",
    r"\rfloor": "⌋",
    r"\lceil": "⌈",
    r"\rceil": "⌉",
    r"\langle": "〈",
    r"\rangle": "〉",
    r"\quad": " ",
    r"\qquad": "  ",
    r"\,": " ",
    r"\;": " ",
    r"\:": " ",
    r"\!": "",
}

_LATEX_CMD_RE = re.compile(r"\\([a-zA-Z]+)")


_LATEX_SORTED_PAIRS = sorted(_LATEX_TO_UNICODE.items(), key=lambda x: len(x[0]), reverse=True)


def _sanitize_leaked_latex(text: str) -> str:
    """[EQ]/[DEQ] 바깥에 남은 LaTeX 명령어를 유니코드로 치환.
    
    Gemini가 변환하지 못하거나 마커 바깥에 남긴 LaTeX 잔여물을 안전하게 정리.
    긴 명령어부터 먼저 치환하여 \\cdot이 \\cdots를 잡아먹는 등의 문제를 방지.
    """
    for latex_cmd, unicode_char in _LATEX_SORTED_PAIRS:
        text = text.replace(latex_cmd, unicode_char)
    
    text = re.sub(r"\\text\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\mathrm\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\mathbf\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\textbf\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\overline\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\underline\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\frac\{([^{}]*)\}\{([^{}]*)\}", r"\1/\2", text)
    text = re.sub(r"\\sqrt\{([^{}]*)\}", r"√(\1)", text)
    text = re.sub(r"\\left\s*([(\[|])", r"\1", text)
    text = re.sub(r"\\right\s*([)\]|])", r"\1", text)
    text = re.sub(r"\\left\s*\\{", "{", text)
    text = re.sub(r"\\right\s*\\}", "}", text)
    text = re.sub(r"\\left\s*\.", "", text)
    text = re.sub(r"\\right\s*\.", "", text)

    text = _LATEX_CMD_RE.sub(lambda m: m.group(1) if len(m.group(1)) <= 3 else m.group(1), text)
    
    text = text.replace("\\", "")
    text = re.sub(r"\s{3,}", "  ", text)
    return text.strip()


# ═══════════════════════════════════════════════════════════════════════════════
# 그래프 마커 / 이미지 삽입
# ═══════════════════════════════════════════════════════════════════════════════

GRAPH_MARKER_PREFIX = "\u27E6GRAPH:"
GRAPH_MARKER_SUFFIX = "\u27E7"
GRAPH_MARKER_RE = re.compile(
    re.escape(GRAPH_MARKER_PREFIX) + r"(.+?)" + re.escape(GRAPH_MARKER_SUFFIX)
)
GRAPH_BLOCK_RE = re.compile(
    r"`{3,}(?:language-)?graph[^\n]*\n([\s\S]*?)\n\s*`{3,}",
    re.MULTILINE,
)

WB_GRAPH_MAX_W = 55
WB_GRAPH_MAX_H = 50


def insert_graph_image(hwp, image_path: str,
                       width_mm: float = 120.0,
                       height_mm: float = 110.0) -> bool:
    """이미지를 HWP 문서에 인라인 삽입."""
    abs_path = os.path.abspath(image_path).replace("/", "\\")
    if not os.path.exists(abs_path):
        print(f"[WARN] Image not found: {abs_path}", file=sys.stderr)
        return False

    bp(hwp)
    ensure_left_align(hwp)

    width_hwp = hwp.MiliToHwpUnit(width_mm)
    height_hwp = hwp.MiliToHwpUnit(height_mm)

    ctrl = None
    try:
        ctrl = hwp.InsertPicture(abs_path, True, 0, False, False, 0, width_hwp, height_hwp)
    except TypeError:
        try:
            ctrl = hwp.InsertPicture(abs_path, True, 0)
        except Exception:
            try:
                ctrl = hwp.InsertPicture(abs_path, True)
            except Exception as e:
                print(f"[WARN] InsertPicture: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[WARN] InsertPicture: {e}", file=sys.stderr)

    if not ctrl:
        it(hwp, "[이미지 삽입 실패]")
        bp(hwp)
        return False

    time.sleep(0.02)

    try:
        pic_prop = ctrl.Properties
        pic_prop.SetItem("TreatAsChar", True)
        ctrl.Properties = pic_prop
    except Exception:
        try:
            hwp.FindCtrl()
            hwp.HAction.GetDefault("ShapeObjDialog", hwp.HParameterSet.HShapeObject.HSet)
            ps = hwp.HParameterSet.HShapeObject
            ps.HSet.SetItem("TreatAsChar", 1)
            ps.TextWrap = 2
            ps.HSet.SetItem("ApplyTo", 0)
            hwp.HAction.Execute("ShapeObjDialog", ps.HSet)
            hwp.Run("Cancel")
        except Exception as e:
            print(f"[WARN] ShapeObjDialog: {e}", file=sys.stderr)

    try:
        hwp.Run("MoveRight")
    except Exception:
        pass

    bp(hwp)
    ensure_left_align(hwp)
    set_body_font(hwp)
    return True


def render_graph_markers(hwp, text: str, graph_infos: Dict,
                         max_w: float = None, max_h: float = None):
    """텍스트 내 그래프 마커(⟦GRAPH:id⟧)를 이미지로 치환."""
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
                ensure_left_align(hwp)
            else:
                it(hwp, f"[그래프: {part}]")


def extract_and_render_graphs(md_text: str, temp_dir: str,
                              prefix: str = "graph"):
    """마크다운 내 language-graph 블록을 matplotlib로 렌더링하고 마커로 치환."""
    from graph_generator import generate_graph

    graph_infos: Dict[str, Dict[str, Any]] = {}
    counter = [0]

    def _replace(match: re.Match) -> str:
        json_str = match.group(1).strip()
        try:
            import json
            spec = json.loads(json_str)
        except Exception as e:
            print(f"[WARN] Graph JSON parse error: {e}", file=sys.stderr)
            return match.group(0)

        counter[0] += 1
        marker_id = f"{prefix}_{counter[0]:03d}"
        output_path = os.path.join(temp_dir, f"{marker_id}.png")

        try:
            info = generate_graph(spec, output_path, dpi=300)
            graph_infos[marker_id] = info
            return f"\n{GRAPH_MARKER_PREFIX}{marker_id}{GRAPH_MARKER_SUFFIX}\n"
        except Exception as e:
            print(f"[WARN] Graph render failed ({marker_id}): {e}", file=sys.stderr)
            return match.group(0)

    modified = GRAPH_BLOCK_RE.sub(_replace, md_text)
    return modified, graph_infos


# ═══════════════════════════════════════════════════════════════════════════════
# HwpEqn 마커 직접 처리 (AI 변환 경로)
# ═══════════════════════════════════════════════════════════════════════════════

HWPEQN_INLINE_RE = re.compile(r"\[EQ\](.*?)\[/EQ\]")
HWPEQN_DISPLAY_RE = re.compile(r"\[DEQ\](.*?)\[/DEQ\]")


def has_hwpeqn_markers(content: str) -> bool:
    return "[EQ]" in content or "[DEQ]" in content


_COMBINED_EQ_RE = re.compile(r"\[DEQ\](.*?)\[/DEQ\]|\[EQ\](.*?)\[/EQ\]")


def process_hwpeqn_content(hwp, content: str, font_size=None,
                           graph_infos=None, graph_max_w=None, graph_max_h=None):
    """AI가 변환한 [EQ]...[/EQ], [DEQ]...[/DEQ] 마커를 직접 사용.
    latex_to_hwpeqn을 완전히 우회하여 AI 지능으로 변환된 수식을 직접 삽입.
    
    [DEQ]와 [EQ]를 통합 정규식으로 처리하여 주변 텍스트 누락을 방지."""
    size = font_size or FONT["body"]
    eq_size = size
    gi = graph_infos or {}
    ensure_left_align(hwp)

    lines = content.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            bp(hwp)
            continue

        cursor = 0
        for m in _COMBINED_EQ_RE.finditer(line):
            before = line[cursor:m.start()].strip()
            if before:
                _insert_text_segment(hwp, before, size, gi, graph_max_w, graph_max_h)

            deq_content = m.group(1)
            eq_content = m.group(2)

            if deq_content is not None:
                hwpeqn = deq_content.strip()
                if hwpeqn:
                    bp(hwp)
                    ensure_left_align(hwp)
                    insert_equation(hwp, hwpeqn, base_size=eq_size + 0.5, treat_as_char=True)
                    bp(hwp)
                    ensure_left_align(hwp)
                    sf(hwp, "함초롬바탕", size, False, COLOR["body"])
            else:
                hwpeqn = (eq_content or "").strip()
                if hwpeqn:
                    insert_equation(hwp, hwpeqn, base_size=eq_size)

            cursor = m.end()

        after = line[cursor:].strip()
        if after:
            _insert_text_segment(hwp, after, size, gi, graph_max_w, graph_max_h)
        bp(hwp)

    ensure_left_align(hwp)


def _insert_text_segment(hwp, text: str, size: float, gi: Dict,
                         graph_max_w=None, graph_max_h=None):
    """텍스트 세그먼트를 삽입. 잔여 LaTeX, 그래프 마커 등을 안전하게 처리."""
    text = clean_unicode(text)
    text = _sanitize_leaked_latex(text)
    if not text:
        return
    if GRAPH_MARKER_PREFIX in text:
        render_graph_markers(hwp, text, gi, max_w=graph_max_w, max_h=graph_max_h)
    elif "$" in text:
        _insert_text_with_inline_math(hwp, text, "함초롬바탕", size, False)
    else:
        set_body_font(hwp, size)
        it(hwp, text)


# ═══════════════════════════════════════════════════════════════════════════════
# 마크다운 토큰 렌더링 (정규식 폴백 경로)
# ═══════════════════════════════════════════════════════════════════════════════

def render_tokens_compact(hwp, tokens: List[Token], body_size: float,
                          graph_infos: Dict, graph_max_w=None, graph_max_h=None):
    """워크북 스타일 콤팩트 토큰 렌더링.
    Nova AI 참조: 수식 크기 = 본문 크기(8pt), display만 +0.5pt."""
    eq_size = body_size
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
            txt = clean_unicode(token["text"])
            txt = _sanitize_leaked_latex(txt)
            if not txt:
                continue
            if GRAPH_MARKER_PREFIX in txt:
                render_graph_markers(hwp, txt, graph_infos,
                                     max_w=graph_max_w, max_h=graph_max_h)
            elif "$" in txt:
                _insert_text_with_inline_math(hwp, txt, "함초롬바탕", body_size, False)
            else:
                it(hwp, txt)

        elif tp == "bold":
            children = token.get("children", [])
            if not children and token.get("text"):
                children = [{"type": "text", "text": token["text"]}]
            sf(hwp, "함초롬바탕", body_size, True, COLOR["title_dark"])
            for child in children:
                if child["type"] == "inline_math":
                    hwpeqn = latex_to_hwpeqn(child["latex"])
                    insert_equation(hwp, hwpeqn, base_size=eq_size)
                else:
                    txt = child.get("text", "")
                    if txt:
                        it(hwp, clean_unicode(txt))
            sf(hwp, "함초롬바탕", body_size, False, COLOR["body"])

        elif tp == "inline_math":
            hwpeqn = latex_to_hwpeqn(token["latex"])
            ok = insert_equation(hwp, hwpeqn, base_size=eq_size)
            if not ok:
                fallback = _sanitize_leaked_latex(clean_unicode(token["latex"]))
                it(hwp, fallback or token["latex"])

        elif tp == "display_math":
            bp(hwp)
            ensure_left_align(hwp)
            hwpeqn = latex_to_hwpeqn(token["latex"])
            ok = insert_equation(hwp, hwpeqn, base_size=eq_size + 0.5, treat_as_char=True)
            if not ok:
                fallback = _sanitize_leaked_latex(clean_unicode(token["latex"]))
                it(hwp, fallback or token["latex"])
            bp(hwp)
            ensure_left_align(hwp)
            sf(hwp, "함초롬바탕", body_size, False, COLOR["body"])

        elif tp == "heading":
            bp(hwp)
            sf(hwp, "함초롬돋움", body_size + 1, True, COLOR["title_dark"])
            _insert_text_with_inline_math(hwp, token["text"], "함초롬돋움", body_size + 1, True)
            bp(hwp)
            sf(hwp, "함초롬바탕", body_size, False, COLOR["body"])

        elif tp == "list_item":
            indent = "  " * token.get("level", 0)
            it(hwp, indent + "· ")
            if "children" in token:
                render_tokens_compact(hwp, token["children"], body_size, graph_infos)
            bp(hwp)

        elif tp == "horizontal_rule":
            insert_thin_line(hwp)

        elif tp == "blockquote":
            sf(hwp, "함초롬바탕", body_size, False, COLOR["line_dark"])
            it(hwp, "  │ ")
            sf(hwp, "함초롬바탕", body_size, False, COLOR["body"])
            if "children" in token:
                render_tokens_compact(hwp, token["children"], body_size, graph_infos)
            bp(hwp)

        elif tp == "code":
            it(hwp, token["text"])


# ═══════════════════════════════════════════════════════════════════════════════
# 통합 콘텐츠 처리 함수
# ═══════════════════════════════════════════════════════════════════════════════

def process_content(hwp, content: str, font_size=None,
                    graph_infos=None, graph_max_w=None, graph_max_h=None):
    """콘텐츠를 HWP에 삽입. HwpEqn 마커가 있으면 AI 경로, 없으면 마크다운 파싱 경로."""
    if not content or not content.strip():
        return

    if has_hwpeqn_markers(content):
        process_hwpeqn_content(hwp, content, font_size, graph_infos,
                               graph_max_w=graph_max_w, graph_max_h=graph_max_h)
        return

    ensure_left_align(hwp)
    size = font_size or FONT["body"]
    gi = graph_infos or {}
    tokens = parse_markdown(content)
    render_tokens_compact(hwp, tokens, size, gi,
                          graph_max_w=graph_max_w, graph_max_h=graph_max_h)
    ensure_left_align(hwp)
