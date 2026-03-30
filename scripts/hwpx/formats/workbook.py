"""
변형문제 워크북 생성 — workbook / workbook-multi 포맷

2단 다단 레이아웃으로 원본+변형문제를 배치하고,
마지막에 정답 및 풀이를 합본.
"""

import os
import sys
from typing import Dict, Any, List

from ..core import save_document
from ..layout import (
    setup_page, setup_two_column, ensure_left_align, set_line_spacing,
    set_body_font, column_break, page_break, section_break, col_def_break,
    insert_divider, insert_thick_divider, insert_answer_section_header,
    insert_choices, insert_choices_with_math, insert_choices_smart,
    sf, it, bp, FONT, COLOR, SAFE_IMG_WIDTH_MM,
    _insert_text_with_inline_math,
)
from ..content import (
    process_content, insert_graph_image, extract_and_render_graphs,
    GRAPH_BLOCK_RE,
)
from ..extract import extract_workbook_data_from_markdown


def _insert_problem_image(hwp, image_path: str, temp_dir: str):
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


def _insert_original_problem_block(hwp, data: Dict, temp_dir: str):
    source = data.get("source", "")
    content = data.get("content", "")
    image_path = data.get("imagePath")

    insert_divider(hwp)
    sf(hwp, "함초롬돋움", FONT["body"] + 1, True, COLOR["num_blue"])
    it(hwp, "■ 원본 문제")
    bp(hwp)

    if source:
        sf(hwp, "함초롬돋움", FONT["source_label"], True, COLOR["title_dark"])
        it(hwp, f"  {source}")
        bp(hwp)

    insert_divider(hwp)

    if content:
        set_body_font(hwp)
        process_content(hwp, content)
    elif image_path and os.path.exists(str(image_path)):
        _insert_problem_image(hwp, image_path, temp_dir)
        ensure_left_align(hwp)

    bp(hwp)
    set_body_font(hwp)


def _insert_variation_block(hwp, num: int, data: Dict,
                            graph_infos: Dict, temp_dir: str):
    content = data.get("content", "")
    choices = data.get("choices", [])
    graph_path = data.get("graphImagePath")

    insert_divider(hwp)
    sf(hwp, "함초롬돋움", FONT["problem_num"], True, COLOR["num_blue"])
    it(hwp, f"  {num:02d}")
    sf(hwp, "함초롬돋움", FONT["variation_title"], True, COLOR["title_dark"])
    it(hwp, f"   변형 {num}")
    bp(hwp)
    insert_divider(hwp)

    if content:
        set_body_font(hwp)
        process_content(hwp, content, FONT["body"], graph_infos)

    if graph_path and os.path.exists(str(graph_path)):
        bp(hwp)
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
        ensure_left_align(hwp)

    if choices:
        bp(hwp)
        insert_choices_smart(hwp, choices)

    bp(hwp)
    set_body_font(hwp)


def _insert_solution_block(hwp, num: int, sol_data: Dict, graph_infos: Dict = None):
    answer_text = sol_data.get("answer_text", "")
    point = sol_data.get("variation_point", "")
    explanation = sol_data.get("explanation", "")
    bs = FONT["body_sm"]
    gi = graph_infos or {}

    sf(hwp, "함초롬돋움", FONT["solution_num"], True, COLOR["answer_green"])
    it(hwp, f"▐{num:02d}. 정답  ")
    sf(hwp, "함초롬돋움", FONT["solution_num"], True, COLOR["title_dark"])
    if "[EQ]" in answer_text or "[DEQ]" in answer_text:
        from ..content import process_hwpeqn_content
        process_hwpeqn_content(hwp, answer_text, FONT["solution_num"])
    elif "$" in answer_text:
        _insert_text_with_inline_math(hwp, answer_text, "함초롬돋움", FONT["solution_num"], True)
    else:
        it(hwp, answer_text)
    bp(hwp)

    if point:
        sf(hwp, "함초롬돋움", bs, True, COLOR["point_purple"])
        it(hwp, "[변형 포인트] ")
        sf(hwp, "함초롬바탕", bs, False, COLOR["body"])
        process_content(hwp, point, bs, gi)
        bp(hwp)

    if explanation:
        bp(hwp)
        sf(hwp, "함초롬돋움", bs, True, COLOR["title_dark"])
        it(hwp, "[간단 풀이]")
        bp(hwp)
        sf(hwp, "함초롬바탕", bs, False, COLOR["body"])
        process_content(hwp, explanation, bs, gi)
        bp(hwp)

    bp(hwp)
    set_body_font(hwp, bs)


def _build_answer_section(hwp, solutions: List[Dict], graph_infos: Dict = None):
    gi = graph_infos or {}
    try:
        section_break(hwp)
        setup_page(hwp)
        ensure_left_align(hwp)
        insert_answer_section_header(hwp)
        col_def_break(hwp)
        setup_two_column(hwp)
        ensure_left_align(hwp)
        for sol in solutions:
            num = sol.get("num", 0)
            _insert_solution_block(hwp, num, sol, gi)
        return
    except Exception as e:
        print(f"[WARN] Answer section method 1 failed: {e}", file=sys.stderr)
    try:
        page_break(hwp)
        ensure_left_align(hwp)
        insert_answer_section_header(hwp)
        for sol in solutions:
            num = sol.get("num", 0)
            _insert_solution_block(hwp, num, sol, gi)
    except Exception as e:
        print(f"[ERROR] Answer section failed: {e}", file=sys.stderr)


def generate_workbook(hwp, data: Dict, output_path: str, temp_dir: str) -> Dict:
    """변형문제 워크북 — single 모드.

    원본 + 변형 N개를 2단 배치 → 정답 및 풀이.
    """
    original = data.get("original_problem", {})
    variations = data.get("variations", [])
    solutions = data.get("solutions", [])
    graph_image_paths = data.get("graphImagePaths", [])
    all_graph_infos: Dict[str, Any] = {}

    for i, gp in enumerate(graph_image_paths):
        if gp and os.path.exists(str(gp)):
            all_graph_infos[f"webgraph_{i}"] = {"path": gp, "web_capture": True}

    setup_page(hwp)
    setup_two_column(hwp)
    ensure_left_align(hwp)

    for v in variations:
        content = v.get("content", "")
        if content and GRAPH_BLOCK_RE.search(content):
            rendered, gi = extract_and_render_graphs(content, temp_dir, f"var{v.get('num', 0)}")
            v["content"] = rendered
            all_graph_infos.update(gi)

    all_items = []
    if original:
        all_items.append(("original", original))
    for v in variations:
        all_items.append(("variation", v))

    for idx, (item_type, item_data) in enumerate(all_items):
        col_pos = idx % 2
        if idx > 0 and col_pos == 0:
            page_break(hwp)
        if col_pos == 1:
            column_break(hwp)
        if item_type == "original":
            _insert_original_problem_block(hwp, item_data, temp_dir)
        else:
            vnum = item_data.get("num", idx if not original else idx)
            _insert_variation_block(hwp, vnum, item_data, all_graph_infos, temp_dir)

    for sol in solutions:
        for field in ("explanation", "variation_point"):
            content = sol.get(field, "")
            if content and GRAPH_BLOCK_RE.search(content):
                rendered, gi = extract_and_render_graphs(content, temp_dir, f"sol{sol.get('num', 0)}_{field}")
                sol[field] = rendered
                all_graph_infos.update(gi)

    if solutions:
        _build_answer_section(hwp, solutions, all_graph_infos)

    save_document(hwp, output_path)
    return all_graph_infos


def generate_workbook_multi(hwp, data: Dict, output_path: str, temp_dir: str) -> Dict:
    """변형문제 워크북 — multi 모드 (PDF 다문항 합본).

    문제 N개 x 변형 M개를 순차 배치 → 전체 정답 및 풀이 합본.
    """
    problems = data.get("problems", [])
    include_original = data.get("includeOriginal", True)
    graph_image_paths = data.get("graphImagePaths", [])
    all_graph_infos: Dict[str, Any] = {}

    for i, gp in enumerate(graph_image_paths):
        if gp and os.path.exists(str(gp)):
            all_graph_infos[f"webgraph_{i}"] = {"path": gp, "web_capture": True}

    setup_page(hwp)
    setup_two_column(hwp)
    ensure_left_align(hwp)

    all_solutions: List[Dict] = []
    global_var_num = 0

    for pi, prob in enumerate(problems):
        prob_num = prob.get("num", pi + 1)
        sections = prob.get("sections", [])
        crop_path = prob.get("cropImagePath")
        content = "\n\n".join(s for s in sections if s and s.strip())

        wb_data = extract_workbook_data_from_markdown(
            [content], crop_path if include_original else None,
        )

        for v in wb_data.get("variations", []):
            vc = v.get("content", "")
            if vc and GRAPH_BLOCK_RE.search(vc):
                rendered, gi = extract_and_render_graphs(vc, temp_dir, f"p{pi}_var{v.get('num', 0)}")
                v["content"] = rendered
                all_graph_infos.update(gi)

        variations = wb_data.get("variations", [])
        original = wb_data.get("original_problem", {})

        if pi > 0:
            page_break(hwp)

        sf(hwp, "함초롬돋움", FONT["body"] + 2, True, COLOR["num_blue"])
        it(hwp, f"  ■ {prob_num}번")
        bp(hwp)
        insert_thick_divider(hwp)

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
                _insert_original_problem_block(hwp, item_data, temp_dir)
            else:
                global_var_num += 1
                vnum = item_data.get("num", global_var_num)
                _insert_variation_block(hwp, vnum, item_data, all_graph_infos, temp_dir)

        for sol in wb_data.get("solutions", []):
            sol["_prob_num"] = prob_num
            all_solutions.append(sol)

    if all_solutions:
        _build_answer_section(hwp, all_solutions, all_graph_infos)

    save_document(hwp, output_path)
    return all_graph_infos
