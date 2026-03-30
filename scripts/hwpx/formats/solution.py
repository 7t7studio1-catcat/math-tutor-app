"""
해설 워크북 생성 — solution / solution-batch 포맷

2단 다단 + 8pt 콤팩트 레이아웃으로 해설 문서를 생성.
참조: 2026 3모 해설.hwpx
"""

import os
import sys
from typing import Dict, Any, List

from ..core import save_document
from ..layout import (
    setup_page, setup_two_column, ensure_left_align, set_line_spacing,
    set_body_font, column_break, page_break,
    insert_divider, insert_thick_divider,
    sf, it, bp, FONT, COLOR,
    _insert_text_with_inline_math,
)
from ..content import (
    process_content, insert_graph_image, extract_and_render_graphs,
    GRAPH_BLOCK_RE, GRAPH_MARKER_PREFIX, GRAPH_MARKER_SUFFIX,
    SAFE_IMG_WIDTH_MM,
)
from ..extract import strip_duplicate_step_heading


SOLUTION_TITLES = ["실전풀이", "해체분석", "숏컷 + 고급기법", "변형 대비"]
SOLUTION_COLORS = [COLOR["num_blue"], 0x6B4C9A, 0x0677D9, 0x699605]

SOL_GRAPH_MAX_W = SAFE_IMG_WIDTH_MM
SOL_GRAPH_MAX_H = 999

WEB_GRAPH_MARKER_RE = None


def _get_web_graph_re():
    global WEB_GRAPH_MARKER_RE
    if WEB_GRAPH_MARKER_RE is None:
        import re
        WEB_GRAPH_MARKER_RE = re.compile(r"\[GRAPH_IMG:(\d+)\]")
    return WEB_GRAPH_MARKER_RE


def _insert_section_header(hwp, sec_idx: int):
    title = SOLUTION_TITLES[sec_idx] if sec_idx < len(SOLUTION_TITLES) else f"섹션 {sec_idx + 1}"
    color = SOLUTION_COLORS[sec_idx] if sec_idx < len(SOLUTION_COLORS) else COLOR["num_blue"]

    insert_divider(hwp)
    sf(hwp, "함초롬돋움", FONT["problem_num"], True, color)
    it(hwp, f"  {sec_idx + 1:02d}")
    sf(hwp, "함초롬돋움", FONT["variation_title"], True, COLOR["title_dark"])
    it(hwp, f"   {title}")
    bp(hwp)
    insert_divider(hwp)
    set_body_font(hwp)


def _prepare_section_content(content: str, graph_paths: List[str],
                             all_graph_infos: Dict, temp_dir: str,
                             prefix: str) -> str:
    processed = strip_duplicate_step_heading(content)

    if graph_paths:
        re_pattern = _get_web_graph_re()
        def _repl(m):
            idx = int(m.group(1))
            if idx < len(graph_paths) and graph_paths[idx]:
                mid = f"webgraph_{idx}"
                all_graph_infos[mid] = {"path": graph_paths[idx], "web_capture": True}
                return f"\n{GRAPH_MARKER_PREFIX}{mid}{GRAPH_MARKER_SUFFIX}\n"
            return m.group(0)
        processed = re_pattern.sub(_repl, processed)

    if GRAPH_BLOCK_RE.search(processed):
        rendered, gi = extract_and_render_graphs(processed, temp_dir, prefix)
        processed = rendered
        all_graph_infos.update(gi)

    return processed


def _insert_problem_image(hwp, image_path: str, temp_dir: str):
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


def _insert_problem_block(hwp, data: Dict, temp_dir: str, graph_infos: Dict = None):
    content = data.get("content", "")
    image_path = data.get("imagePath")
    gi = graph_infos or {}

    insert_divider(hwp)
    sf(hwp, "함초롬돋움", 9.5, True, COLOR["num_blue"])
    it(hwp, "  ■ 원본 문제")
    bp(hwp)
    insert_divider(hwp)

    if content:
        bp(hwp)
        set_body_font(hwp, FONT["body"])
        process_content(hwp, content, FONT["body"], gi)

    if image_path and os.path.exists(str(image_path)):
        bp(hwp)
        _insert_problem_image(hwp, image_path, temp_dir)
        ensure_left_align(hwp)

    bp(hwp)
    set_body_font(hwp)


def generate_solution(hwp, data: Dict, output_path: str, temp_dir: str) -> Dict:
    """해설 워크북 — single 모드.

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

    setup_page(hwp)
    setup_two_column(hwp)
    ensure_left_align(hwp)
    set_line_spacing(hwp, 160)

    has_problem = bool(problem_content) or (problem_img and os.path.exists(str(problem_img)))
    if has_problem:
        block_data: Dict[str, Any] = {}
        if problem_content:
            block_data["content"] = problem_content
        if problem_img:
            block_data["imagePath"] = problem_img
        _insert_problem_block(hwp, block_data, temp_dir, all_graph_infos)

    for sec_idx, content in enumerate(sections):
        if not content or not content.strip():
            continue
        _insert_section_header(hwp, sec_idx)
        processed = _prepare_section_content(
            content, graph_paths, all_graph_infos, temp_dir, f"s{sec_idx}",
        )
        set_body_font(hwp)
        process_content(hwp, processed, FONT["body"], all_graph_infos,
                        graph_max_w=SOL_GRAPH_MAX_W, graph_max_h=SOL_GRAPH_MAX_H)
        bp(hwp)

    save_document(hwp, output_path)
    return all_graph_infos


def generate_solution_batch(hwp, data: Dict, output_path: str, temp_dir: str) -> Dict:
    """해설 워크북 — batch 모드.

    2단 다단 + 8pt 콤팩트 레이아웃:
    각 문제: 문제 번호 + 원본 문제 + 해설 섹션.
    """
    problems = data.get("problems", [])
    graph_paths = data.get("graphImagePaths", [])
    all_graph_infos: Dict[str, Any] = {}

    for i, gp in enumerate(graph_paths):
        if gp and os.path.exists(str(gp)):
            all_graph_infos[f"webgraph_{i}"] = {"path": gp, "web_capture": True}

    setup_page(hwp)
    setup_two_column(hwp)
    ensure_left_align(hwp)
    set_line_spacing(hwp, 160)

    for pi, prob in enumerate(problems):
        num = prob.get("num", pi + 1)
        secs = prob.get("sections", [])
        prob_content = prob.get("problemContent", "")
        crop_img = prob.get("imagePath")

        if pi > 0:
            column_break(hwp)

        insert_thick_divider(hwp, COLOR["num_blue"])
        sf(hwp, "함초롬돋움", FONT["problem_num"], True, COLOR["num_blue"])
        it(hwp, f"  {num:02d}")
        sf(hwp, "함초롬돋움", FONT["variation_title"] + 1, True, COLOR["title_dark"])
        it(hwp, f"   {num}번 해설")
        bp(hwp)

        block_data: Dict[str, Any] = {}
        if prob_content:
            block_data["content"] = prob_content
        if crop_img and os.path.exists(str(crop_img)):
            block_data["imagePath"] = crop_img
        if block_data:
            _insert_problem_block(hwp, block_data, temp_dir, all_graph_infos)

        for sec_idx, content in enumerate(secs):
            if not content or not content.strip():
                continue
            _insert_section_header(hwp, sec_idx)
            processed = _prepare_section_content(
                content, graph_paths, all_graph_infos, temp_dir, f"p{pi}_s{sec_idx}",
            )
            set_body_font(hwp)
            process_content(hwp, processed, FONT["body"], all_graph_infos,
                            graph_max_w=SOL_GRAPH_MAX_W, graph_max_h=SOL_GRAPH_MAX_H)
            bp(hwp)

    save_document(hwp, output_path)
    return all_graph_infos
