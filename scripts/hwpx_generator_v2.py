"""
한글 COM 자동화 v2 — 그래프 이미지 삽입 + 교재급 디자인 시스템

기존 hwpx_generator.py의 모든 기능을 상속하면서,
마크다운 내 ```language-graph JSON 블록을 감지 -> matplotlib 렌더링 -> HWP 이미지 삽입.
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
    create_hwp, setup_page, sf, it, bp,
    insert_equation, insert_document_header, insert_section_header,
    strip_duplicate_step_heading, save_document,
    insert_headtail_footer, insert_divider, insert_problem_number,
    insert_variation_header, insert_concept_box, insert_step_marker,
    _insert_text_with_inline_math, _detect_box_label,
    process_tokens,
    DUPLICATE_HEADING_PATTERNS, LABEL_PATTERNS,
    STEP_HEADING_RE, VARIATION_HEADING_RE,
)
from design_themes import get_theme, BRAND, STEP_COLORS, BOX_STYLES, FONT
from markdown_parser import parse_markdown, Token
from latex_to_hwpeqn import latex_to_hwpeqn
from graph_generator import generate_graph


# ═══════════════════════════════════════════════════════════════════════════════
# 그래프 블록 감지 / 렌더링
# ═══════════════════════════════════════════════════════════════════════════════

GRAPH_BLOCK_RE = re.compile(
    r"`{3,}(?:language-)?graph[^\n]*\n([\s\S]*?)\n\s*`{3,}",
    re.MULTILINE,
)

GRAPH_MARKER_PREFIX = "\u27E6GRAPH:"
GRAPH_MARKER_SUFFIX = "\u27E7"

GRAPH_MARKER_RE = re.compile(
    re.escape(GRAPH_MARKER_PREFIX) + r"(.+?)" + re.escape(GRAPH_MARKER_SUFFIX)
)

DEFAULT_GRAPH_WIDTH_MM = 120.0
DEFAULT_GRAPH_HEIGHT_MM = 110.0


def extract_and_render_graphs(
    md_text: str, temp_dir: str, prefix: str = "graph",
) -> Tuple[str, Dict[str, Dict[str, Any]]]:
    graph_infos: Dict[str, Dict[str, Any]] = {}
    counter = [0]

    def _replace(match: re.Match) -> str:
        json_str = match.group(1).strip()
        try:
            spec = json.loads(json_str)
        except json.JSONDecodeError as e:
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
# HWP 이미지 삽입
# ═══════════════════════════════════════════════════════════════════════════════

def _set_paragraph_align(hwp, align: int) -> None:
    try:
        act = hwp.CreateAction("ParagraphShape")
        pset = act.CreateSet()
        act.GetDefault(pset)
        pset.SetItem("Align", align)
        act.Execute(pset)
    except Exception:
        pass


def insert_graph_image(
    hwp, image_path: str,
    width_mm: float = DEFAULT_GRAPH_WIDTH_MM,
    height_mm: float = DEFAULT_GRAPH_HEIGHT_MM,
) -> bool:
    """pyhwpx insert_picture 패턴 참고: InsertPicture 키워드 인자 + ctrl.Properties로 속성 설정."""
    abs_path = os.path.abspath(image_path).replace("/", "\\")
    if not os.path.exists(abs_path):
        print(f"[WARN] Image not found: {abs_path}", file=sys.stderr)
        return False

    bp(hwp)
    _set_paragraph_align(hwp, 1)

    width_hwp = hwp.MiliToHwpUnit(width_mm)
    height_hwp = hwp.MiliToHwpUnit(height_mm)

    ctrl = None
    try:
        ctrl = hwp.InsertPicture(
            abs_path, True, 0, False, False, 0, width_hwp, height_hwp,
        )
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
        _set_paragraph_align(hwp, 0)
        return False

    time.sleep(0.02)

    # pyhwpx 방식: ctrl.Properties를 통해 TreatAsChar 설정
    try:
        pic_prop = ctrl.Properties
        pic_prop.SetItem("TreatAsChar", True)
        ctrl.Properties = pic_prop
    except Exception:
        # 폴백: ShapeObjDialog를 통한 속성 설정
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
    _set_paragraph_align(hwp, 0)
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])
    return True


# ═══════════════════════════════════════════════════════════════════════════════
# 향상된 토큰 처리 — 그래프 마커 + 교재급 디자인 요소
# ═══════════════════════════════════════════════════════════════════════════════

def _clean_unicode(text: str) -> str:
    text = text.replace("\\neq", "≠").replace("\\mid", "|")
    text = text.replace("<=>", "⇔")
    text = text.replace("<>", "≠")
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


def _process_text_with_graphs(
    hwp, text: str, graph_infos: Dict[str, Dict[str, Any]]
) -> None:
    parts = GRAPH_MARKER_RE.split(text)
    for i, part in enumerate(parts):
        if i % 2 == 0:
            clean = part.strip()
            if clean:
                it(hwp, _clean_unicode(clean))
        else:
            info = graph_infos.get(part)
            if info and os.path.exists(info["path"]):
                if info.get("web_capture"):
                    _insert_web_graph(hwp, info["path"])
                else:
                    w = min(info.get("width_mm", DEFAULT_GRAPH_WIDTH_MM), 165)
                    h = min(info.get("height_mm", DEFAULT_GRAPH_HEIGHT_MM), 155)
                    insert_graph_image(hwp, info["path"], w, h)
            else:
                it(hwp, f"[그래프 생성 실패: {part}]")


def process_tokens_v2(
    hwp, tokens: List[Token],
    graph_infos: Dict[str, Dict[str, Any]],
) -> None:
    """process_tokens 확장판: 그래프 마커 + 교재급 디자인 요소."""
    last_was_break = False
    consecutive_breaks = 0

    idx = 0
    while idx < len(tokens):
        token = tokens[idx]
        tp = token["type"]

        if tp == "paragraph_break":
            consecutive_breaks += 1
            if consecutive_breaks <= 2:
                bp(hwp)
            last_was_break = True
            idx += 1
            continue
        elif tp == "line_break":
            consecutive_breaks += 1
            if consecutive_breaks <= 2:
                bp(hwp)
            last_was_break = True
            idx += 1
            continue

        last_was_break = False
        consecutive_breaks = 0

        if tp == "text":
            txt = token["text"]
            if GRAPH_MARKER_PREFIX in txt:
                _process_text_with_graphs(hwp, txt, graph_infos)
            else:
                it(hwp, _clean_unicode(txt))

        elif tp == "bold":
            # v2: bold 토큰은 children 배열을 가짐 (text, inline_math 혼합)
            children = token.get("children", [])
            bold_text = token.get("text", "")

            # children 이 없으면 기존 text 필드에서 복원 (하위 호환)
            if not children and bold_text:
                children = [{"type": "text", "text": bold_text}]

            # children 전체를 평문으로 합산 (box/step 감지용)
            flat = "".join(
                c.get("text", "") or c.get("latex", "")
                for c in children
            )

            if GRAPH_MARKER_PREFIX in flat:
                _process_text_with_graphs(hwp, flat, graph_infos)
                idx += 1
                continue

            box_type = _detect_box_label(flat)
            if box_type:
                remaining = []
                j = idx + 1
                while j < len(tokens) and tokens[j]["type"] not in ("paragraph_break", "heading", "horizontal_rule"):
                    remaining.append(tokens[j])
                    j += 1
                style = BOX_STYLES.get(box_type, BOX_STYLES["key"])
                bp(hwp)
                sf(hwp, "함초롬돋움", FONT["body"], True, style["border"])
                it(hwp, f"  ▐ {style['label']}  ")
                sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["text_dark"])
                process_tokens_v2(hwp, remaining, graph_infos)
                bp(hwp)
                sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])
                idx = j
                continue

            step_m = STEP_HEADING_RE.match(flat)
            if step_m:
                insert_step_marker(hwp, int(step_m.group(1)))
                rest = flat[step_m.end():].strip()
                if rest:
                    sf(hwp, "함초롬바탕", FONT["body"], True, BRAND["text_dark"])
                    it(hwp, rest)
                sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])
                idx += 1
                continue

            # 일반 볼드: children 을 순회하며 text/inline_math 각각 처리
            sf(hwp, "함초롬바탕", FONT["body"], True, BRAND["text_dark"])
            for child in children:
                if child["type"] == "inline_math":
                    hwpeqn = latex_to_hwpeqn(child["latex"])
                    has_frac = "OVER" in hwpeqn
                    size = FONT["equation"] - 0.5 if has_frac else FONT["equation"]
                    ok = insert_equation(hwp, hwpeqn, base_size=size)
                    if not ok:
                        it(hwp, child["latex"])
                else:
                    txt = child.get("text", "")
                    if txt:
                        it(hwp, _clean_unicode(txt))
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])

        elif tp == "heading":
            level = token["level"]
            heading_text = token["text"]

            if "정답" in heading_text and "풀이" in heading_text:
                try:
                    hwp.HAction.Run("BreakPage")
                except Exception:
                    for _ in range(3):
                        bp(hwp)

            var_m = VARIATION_HEADING_RE.match(heading_text)
            if var_m:
                bp(hwp)
                for _ in range(2):
                    bp(hwp)
                insert_variation_header(hwp, int(var_m.group(1)))
                idx += 1
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
            if not ok:
                it(hwp, token["latex"])

        elif tp == "display_math":
            bp(hwp)
            hwpeqn = latex_to_hwpeqn(token["latex"])
            ok = insert_equation(hwp, hwpeqn, base_size=FONT["equation_lg"], treat_as_char=True)
            if not ok:
                it(hwp, token["latex"])
            bp(hwp)
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])

        elif tp == "list_item":
            indent_str = "  " * token.get("level", 0)
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["accent"])
            it(hwp, indent_str + "• ")
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])
            if "children" in token:
                process_tokens_v2(hwp, token["children"], graph_infos)
            bp(hwp)

        elif tp == "blockquote":
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["accent"])
            it(hwp, "  ┃ ")
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["text_dark"])
            if "children" in token:
                process_tokens_v2(hwp, token["children"], graph_infos)
            sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])
            bp(hwp)

        elif tp == "horizontal_rule":
            insert_divider(hwp, BRAND["line_light"])

        elif tp == "code":
            it(hwp, token["text"])

        idx += 1


# ═══════════════════════════════════════════════════════════════════════════════
# 원본 문제 이미지 삽입 (업스케일링 포함)
# ═══════════════════════════════════════════════════════════════════════════════

MIN_WIDTH_PX = 800
PROBLEM_IMAGE_WIDTH_MM = 130.0

def _upscale_if_needed(image_path: str, temp_dir: str) -> str:
    """이미지 해상도가 낮으면 업스케일하여 새 파일 반환."""
    try:
        from PIL import Image
        img = Image.open(image_path)
        w, h = img.size
        if w >= MIN_WIDTH_PX:
            return image_path
        scale = max(MIN_WIDTH_PX / w, 2.0)
        new_w, new_h = int(w * scale), int(h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        out_path = os.path.join(temp_dir, "problem_upscaled.png")
        img.save(out_path, "PNG", quality=95)
        print(f"[INFO] Image upscaled: {w}x{h} -> {new_w}x{new_h}", file=sys.stderr)
        return out_path
    except ImportError:
        print("[WARN] PIL not installed, skipping upscale", file=sys.stderr)
        return image_path
    except Exception as e:
        print(f"[WARN] Upscale failed: {e}", file=sys.stderr)
        return image_path


def insert_problem_image(hwp, image_path: str, temp_dir: str) -> bool:
    """원본 문제 이미지를 문서에 삽입 (업스케일 + 테두리 스타일)."""
    if not image_path or not os.path.exists(image_path):
        return False

    final_path = _upscale_if_needed(image_path, temp_dir)

    # 이미지 비율 계산
    try:
        from PIL import Image
        img = Image.open(final_path)
        w, h = img.size
        aspect = h / w
        width_mm = PROBLEM_IMAGE_WIDTH_MM
        height_mm = width_mm * aspect
        height_mm = min(height_mm, 180.0)
    except Exception:
        width_mm = PROBLEM_IMAGE_WIDTH_MM
        height_mm = 100.0

    bp(hwp)
    sf(hwp, "함초롬돋움", 9.0, True, BRAND.get("accent", 0x6B4C9A))
    it(hwp, "  ■ 원본 문제")
    bp(hwp)
    sf(hwp, "함초롬바탕", FONT["body"], False, BRAND["black"])

    ok = insert_graph_image(hwp, final_path, width_mm, height_mm)

    bp(hwp)
    insert_divider(hwp, BRAND.get("line_light", 0xD4D4D4))
    bp(hwp)

    return ok


# ═══════════════════════════════════════════════════════════════════════════════
# [GRAPH_IMG:N] 마커 — 웹 캡처 그래프 처리
# ═══════════════════════════════════════════════════════════════════════════════

WEB_GRAPH_MARKER_RE = re.compile(r"\[GRAPH_IMG:(\d+)\]")

WEB_GRAPH_WIDTH_MM = 130.0


def _insert_web_graph(hwp, image_path: str) -> bool:
    """웹에서 캡처한 PNG 그래프를 HWP에 삽입."""
    if not image_path or not os.path.exists(image_path):
        return False
    try:
        from PIL import Image
        img = Image.open(image_path)
        w, h = img.size
        aspect = h / w
        width_mm = WEB_GRAPH_WIDTH_MM
        height_mm = width_mm * aspect
        height_mm = min(height_mm, 160.0)
    except Exception:
        width_mm = WEB_GRAPH_WIDTH_MM
        height_mm = 120.0
    return insert_graph_image(hwp, image_path, width_mm, height_mm)


# ═══════════════════════════════════════════════════════════════════════════════
# 섹션 처리
# ═══════════════════════════════════════════════════════════════════════════════

def _process_section_with_graphs(
    hwp, content: str, temp_dir: str, prefix: str,
    all_graph_infos: Dict[str, Dict[str, Any]],
    web_graph_paths: Optional[List[str]] = None,
) -> None:
    content = strip_duplicate_step_heading(content)

    # 웹 캡처 이미지가 있으면 [GRAPH_IMG:N] 마커를 내부 그래프 마커로 변환
    if web_graph_paths:
        def _web_replace(m: re.Match) -> str:
            idx = int(m.group(1))
            if idx < len(web_graph_paths) and web_graph_paths[idx]:
                marker_id = f"webgraph_{idx}"
                all_graph_infos[marker_id] = {
                    "path": web_graph_paths[idx],
                    "web_capture": True,
                }
                return f"\n{GRAPH_MARKER_PREFIX}{marker_id}{GRAPH_MARKER_SUFFIX}\n"
            return m.group(0)
        content = WEB_GRAPH_MARKER_RE.sub(_web_replace, content)

    # 웹 캡처로 치환되지 않은 나머지 graph 블록은 matplotlib 폴백
    content, graph_infos = extract_and_render_graphs(content, temp_dir, prefix)
    all_graph_infos.update(graph_infos)

    tokens = parse_markdown(content)
    process_tokens_v2(hwp, tokens, all_graph_infos)


# ═══════════════════════════════════════════════════════════════════════════════
# 문서 생성
# ═══════════════════════════════════════════════════════════════════════════════

def generate_single_v2(
    hwp, data: dict, output_path: str, temp_dir: str,
    theme_id: str = "default", unit_name: str = "",
    use_header_bar: bool = True, use_footer: bool = True,
) -> Dict:
    theme = get_theme(theme_id)
    setup_page(hwp, header_mm=14 if use_header_bar else 10, footer_mm=12 if use_footer else 8)

    if use_footer:
        insert_headtail_footer(hwp, unit_name or data.get("unit_name", ""), theme)
        time.sleep(0.1)

    insert_document_header(hwp, title=theme.get("book_title", "4단계 완전 해설"),
                           theme=theme, use_header_bar=use_header_bar)

    # 원본 문제 이미지 삽입
    problem_img = data.get("problemImagePath")
    print(f"[INFO] problemImagePath = {problem_img}", file=sys.stderr)
    if problem_img and os.path.exists(str(problem_img)):
        ok = insert_problem_image(hwp, problem_img, temp_dir)
        print(f"[INFO] Problem image inserted: {ok}", file=sys.stderr)
    elif problem_img:
        print(f"[WARN] Problem image file not found: {problem_img}", file=sys.stderr)

    all_graph_infos: Dict[str, Dict[str, Any]] = {}
    sections = data.get("sections", [])
    web_graph_paths = data.get("graphImagePaths")
    if web_graph_paths:
        n = len([p for p in web_graph_paths if p])
        print(f"[INFO] Using {n} web-captured graph image(s)", file=sys.stderr)

    for sec_idx, content in enumerate(sections):
        if not content or not content.strip():
            continue
        insert_section_header(hwp, sec_idx, theme=theme)
        _process_section_with_graphs(
            hwp, content, temp_dir, f"s{sec_idx}", all_graph_infos,
            web_graph_paths=web_graph_paths,
        )

    save_document(hwp, output_path)
    return all_graph_infos


def generate_batch_v2(
    hwp, data: dict, output_path: str, temp_dir: str,
    theme_id: str = "default", unit_name: str = "",
    use_header_bar: bool = True, use_footer: bool = True,
) -> Dict:
    theme = get_theme(theme_id)
    setup_page(hwp, header_mm=14 if use_header_bar else 10, footer_mm=12 if use_footer else 8)

    if use_footer:
        insert_headtail_footer(hwp, unit_name or data.get("unit_name", ""), theme)
        time.sleep(0.1)

    insert_document_header(hwp, title=theme.get("book_title", "4단계 완전 해설"),
                           theme=theme, use_header_bar=use_header_bar)

    all_graph_infos: Dict[str, Dict[str, Any]] = {}
    problems = data.get("problems", [])
    web_graph_paths = data.get("graphImagePaths")
    if web_graph_paths:
        n = len([p for p in web_graph_paths if p])
        print(f"[INFO] Using {n} web-captured graph image(s) (batch)", file=sys.stderr)

    for pi, prob in enumerate(problems):
        num = prob.get("num", pi + 1)
        sections = prob.get("sections", [])

        if pi > 0:
            try:
                hwp.HAction.Run("BreakPage")
            except Exception:
                bp(hwp)

        insert_problem_number(hwp, num, theme)

        prob_img = prob.get("imagePath")
        if prob_img:
            insert_problem_image(hwp, prob_img, temp_dir)

        for sec_idx, content in enumerate(sections):
            if not content or not content.strip():
                continue
            insert_section_header(hwp, sec_idx, theme=theme)
            _process_section_with_graphs(
                hwp, content, temp_dir, f"p{pi}_s{sec_idx}", all_graph_infos,
                web_graph_paths=web_graph_paths,
            )

    save_document(hwp, output_path)
    return all_graph_infos


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="한글 문서 생성기 v2 (그래프 이미지 삽입 + 교재급 디자인)"
    )
    parser.add_argument("--input", required=True, help="입력 JSON 파일")
    parser.add_argument("--output", required=True, help="출력 HWPX 파일 경로")
    parser.add_argument("--mode", default="single", choices=["single", "batch"])
    parser.add_argument("--theme", default="default",
                        choices=["default", "standard", "physical", "rule4", "gichul"],
                        help="교재 테마")
    parser.add_argument("--unit", default="", help="단원명 (푸터)")
    parser.add_argument("--no-header-bar", action="store_true")
    parser.add_argument("--no-footer", action="store_true")
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"[INFO] v2 {args.mode} theme={args.theme} -> {args.output}", file=sys.stderr)

    opts = {
        "theme_id": args.theme,
        "unit_name": args.unit,
        "use_header_bar": not args.no_header_bar,
        "use_footer": not args.no_footer,
    }
    temp_dir = tempfile.mkdtemp(prefix="mathgraph_")

    hwp = create_hwp()
    try:
        if args.mode == "batch":
            infos = generate_batch_v2(hwp, data, args.output, temp_dir, **opts)
        else:
            infos = generate_single_v2(hwp, data, args.output, temp_dir, **opts)

        n = len(infos)
        if n:
            print(f"[INFO] {n} graph(s) rendered & inserted", file=sys.stderr)
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
            subprocess.run(["taskkill", "/IM", "Hwp.exe", "/F"],
                         capture_output=True, timeout=5)
        except Exception:
            pass
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass


if __name__ == "__main__":
    main()
