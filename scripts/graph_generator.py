"""
수능 스타일 수학 그래프 생성기 — matplotlib 기반 (출판 품질 v2)

출판사 납품 수준 (메가스터디/대성/시대인재) 그래프 이미지 생성.
v2 개선: SVG/EMF 벡터 출력, 인쇄용 선폭 캘리브레이션,
적응형 샘플링, 고급 불연속 감지, 그리드+물리 라벨 배치,
조건부 함수, 매개변수 곡선, |x| 표기, log_a,
빗금(hatching) 영역, 두 함수 사이 영역, 자동 정수 눈금.

GraphSpec 형식 (v2 확장):
{
  "title?": "그래프 제목",
  "xRange?": [-5, 5],
  "yRange?": [-5, 5],
  "noAxes?": false,
  "showTicks?": false,           // 자동 정수 눈금
  "printMode?": false,           // 인쇄 최적화 (순검정, 보정 선폭)
  "functions?": [
    {"fn": "x^2", "label?": "f(x)", "dashed?": false},
    {"pieces?": [{"fn":"x^2","cond":"x>=0"},{"fn":"-x","cond":"x<0"}], "label?": "g(x)"}
  ],
  "parametric?": [{"x":"cos(t)","y":"sin(t)","tRange":[0,6.28],"label?":"C"}],
  "points?": [{"x":1,"y":2,"label?":"A","labelPos?":"tr"}],
  "hollowPoints?": [...],
  "segments?": [{"x1":0,"y1":0,"x2":1,"y2":2,"dashed?":true,"solid?":false,"label?":""}],
  "circles?": [...], "arcs?": [...], "angles?": [...], "rightAngles?": [...],
  "texts?": [{"x":1,"y":1,"text":"S(t)","fontSize?":10}],
  "vLines?": [{"x":1,"label?":"1"}], "hLines?": [{"y":0,"label?":""}],
  "regions?": [
    {"fn":"x^2","x1":0,"x2":2},
    {"fn":"x^2","fn2":"x","x1":0,"x2":1,"hatch?":true}   // 두 함수 사이 + 빗금
  ]
}

의존성: pip install matplotlib numpy
"""

import json
import os
import re
import warnings
from typing import Optional, Dict, Any, Callable, List, Tuple

import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib import font_manager, rcParams
from matplotlib.patches import Polygon as MplPolygon

warnings.filterwarnings("ignore", category=UserWarning, module="matplotlib")


# ═══════════════════════════════════════════════════════════════════════════════
# 한글 폰트 설정
# ═══════════════════════════════════════════════════════════════════════════════

_KOREAN_FONT_CANDIDATES = [
    "Malgun Gothic", "맑은 고딕", "NanumGothic", "나눔고딕",
    "NanumBarunGothic", "함초롬바탕", "바탕", "Batang",
    "굴림", "Gulim", "AppleGothic", "Noto Sans KR", "Noto Sans CJK KR",
]


def _setup_korean_font() -> Optional[str]:
    for name in _KOREAN_FONT_CANDIDATES:
        try:
            path = font_manager.findfont(
                font_manager.FontProperties(family=name),
                fallback_to_default=False,
            )
            if path and os.path.exists(path) and "DejaVu" not in path:
                rcParams["font.family"] = name
                rcParams["axes.unicode_minus"] = False
                return name
        except Exception:
            continue
    win_font_dir = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    for fname in ("malgun.ttf", "malgunbd.ttf", "batang.ttc", "gulim.ttc", "NanumGothic.ttf"):
        fpath = os.path.join(win_font_dir, fname)
        if os.path.exists(fpath):
            try:
                font_manager.fontManager.addfont(fpath)
                prop = font_manager.FontProperties(fname=fpath)
                family = prop.get_name()
                rcParams["font.family"] = family
                rcParams["axes.unicode_minus"] = False
                return family
            except Exception:
                continue
    rcParams["axes.unicode_minus"] = False
    return None


_ACTIVE_FONT = _setup_korean_font()
_SERIF = ["STIXGeneral", "Times New Roman", "serif"]


# ═══════════════════════════════════════════════════════════════════════════════
# 스타일 상수 — 인쇄 캘리브레이션 포함
# ═══════════════════════════════════════════════════════════════════════════════

def _make_style(print_mode: bool = False) -> Dict[str, Any]:
    """화면용/인쇄용 스타일 상수 생성."""
    p = 1.25 if print_mode else 1.0
    return {
        "ink":             "#000000" if print_mode else "#1a1a1a",
        "axis_lw":         1.2 * p,
        "curve_lw":        2.0 * p,
        "curve_dash":      (7, 4),
        "seg_solid_lw":    1.8 * p,
        "seg_solid_alpha":  1.0,
        "seg_dash_lw":     1.2 * p,
        "seg_dash_alpha":  0.7,
        "seg_dash_pat":    (6, 3.5),
        "aux_lw":          1.0 * p,
        "aux_dash":        (5, 3),
        "aux_alpha":       0.55,
        "circle_lw":       1.8 * p,
        "circle_dash":     (7, 4),
        "arc_lw":          1.8 * p,
        "angle_lw":        0.9 * p,
        "ra_lw":           0.9 * p,
        "point_ms":        5.5 * p,
        "hollow_ms":       5.5 * p,
        "hollow_edge_lw":  2.2 * p,
        "tick_lw":         0.8 * p,
        "tick_len":        3.5,
        "font_axis":       14,
        "font_origin":     13,
        "font_point":      11.5,
        "font_func":       12,
        "font_seg":        10,
        "font_arc":        10.5,
        "font_circ":       10.5,
        "font_angle":      10,
        "font_text":       12,
        "font_vh":         9.5,
        "font_tick":       9,
        "arrow_w":         0.45,
        "arrow_l":         0.65,
        "region_alpha":    0.15,
        "hatch_density":   "////",
        "hatch_lw":        0.6 * p,
        "halo_lw":         3.5 * p,
    }


SUNEUNG_RC = {
    "figure.facecolor": "white",
    "axes.facecolor":   "white",
    "axes.edgecolor":   "#333333",
    "axes.linewidth":   1.0,
    "grid.alpha":       0,
    "font.size":        11,
    "font.serif":       _SERIF,
    "mathtext.fontset":  "stix",
    "lines.antialiased": True,
    "figure.dpi":       100,
}

_SIZE_MAP = {
    "small":      (3.2, 3.0),
    "medium":     (4.2, 4.0),
    "large":      (5.4, 5.1),
    "xlarge":     (6.6, 6.3),
    "wb_small":   (2.56, 2.40),
    "wb_medium":  (2.95, 2.80),
    "wb_large":   (3.27, 3.07),
}


# ═══════════════════════════════════════════════════════════════════════════════
# 텍스트 Halo (path_effects) — 인쇄에서 배경 박스 잔상 없는 깔끔한 외곽선
# ═══════════════════════════════════════════════════════════════════════════════

def _halo(lw: float = 3.5):
    return [pe.withStroke(linewidth=lw, foreground="white")]


# ═══════════════════════════════════════════════════════════════════════════════
# 수식 표현 컴파일러 — 확장 (|x|, log_a, 조건부, 매개변수)
# ═══════════════════════════════════════════════════════════════════════════════

_SAFE_NAMESPACE: Dict[str, Any] = {
    "sin": np.sin, "cos": np.cos, "tan": np.tan,
    "asin": np.arcsin, "acos": np.arccos, "atan": np.arctan,
    "sinh": np.sinh, "cosh": np.cosh, "tanh": np.tanh,
    "log": np.log, "log2": np.log2, "log10": np.log10, "ln": np.log,
    "exp": np.exp, "sqrt": np.sqrt, "abs": np.abs,
    "ceil": np.ceil, "floor": np.floor, "sign": np.sign,
    "pi": np.pi, "e": np.e, "E": np.e, "inf": np.inf,
    "max": np.maximum, "min": np.minimum,
    "where": np.where,
}

_KNOWN_FUNCTIONS = {
    "sin", "cos", "tan", "log", "exp", "sqrt", "abs", "ln",
    "asin", "acos", "atan", "sinh", "cosh", "tanh",
    "log2", "log10", "ceil", "floor", "sign", "max", "min", "where",
}


def _transform_expr(expr: str) -> str:
    s = expr.strip()
    # |x| → abs(x), |x+1| → abs(x+1)
    s = re.sub(r"\|([^|]+)\|", r"abs(\1)", s)
    # log_a(x) → log(x)/log(a)
    s = re.sub(r"log_(\d+)\(([^)]+)\)", r"(log(\2)/log(\1))", s)
    s = re.sub(r"log_([a-zA-Z])\(([^)]+)\)", r"(log(\2)/log(\1))", s)
    s = s.replace("^", "**")
    s = re.sub(r"(\d)([a-zA-Z(])", r"\1*\2", s)
    s = re.sub(r"\)([a-zA-Z0-9(])", r")*\1", s)

    def _insert_mul(m: re.Match) -> str:
        start = m.start()
        word_start = start
        while word_start > 0 and s[word_start - 1].isalpha():
            word_start -= 1
        word = s[word_start:start + 1]
        if word in _KNOWN_FUNCTIONS:
            return m.group(0)
        return m.group(1) + "*" + m.group(2)

    s = re.sub(r"([a-zA-Z])(\()", _insert_mul, s)
    return s


def compile_fn(expr_str: str) -> Optional[Callable]:
    try:
        transformed = _transform_expr(expr_str)
        code = compile(transformed, f"<expr: {expr_str[:60]}>", "eval")

        def f(x: np.ndarray) -> np.ndarray:
            ns = {**_SAFE_NAMESPACE, "x": x, "__builtins__": {}}
            try:
                result = eval(code, ns)
                if isinstance(result, (int, float)):
                    return np.full_like(x, float(result), dtype=float)
                result = np.asarray(result, dtype=float)
                return np.where(np.isfinite(result), result, np.nan)
            except Exception:
                return np.full_like(x, np.nan, dtype=float)

        test_x = np.array([0.0, 1.0, -1.0, 0.5])
        f(test_x)
        return f
    except Exception:
        return None


def compile_piecewise(pieces: List[dict]) -> Optional[Callable]:
    """조건부 함수 컴파일: [{"fn":"x^2","cond":"x>=0"},{"fn":"-x","cond":"x<0"}]"""
    compiled = []
    for piece in pieces:
        fn = compile_fn(piece.get("fn", "0"))
        cond_str = piece.get("cond", "True")
        cond_str = cond_str.replace("and", "&").replace("or", "|")
        cond_str = _transform_expr(cond_str)
        try:
            cond_code = compile(cond_str, "<cond>", "eval")
        except Exception:
            continue
        if fn:
            compiled.append((fn, cond_code))

    if not compiled:
        return None

    def f(x: np.ndarray) -> np.ndarray:
        result = np.full_like(x, np.nan, dtype=float)
        for fn, cond_code in compiled:
            ns = {**_SAFE_NAMESPACE, "x": x, "__builtins__": {}}
            try:
                mask = eval(cond_code, ns)
                mask = np.asarray(mask, dtype=bool)
                vals = fn(x)
                result = np.where(mask & np.isnan(result), vals, result)
            except Exception:
                pass
        return result

    return f


def compile_parametric(param_spec: dict) -> Optional[Callable]:
    """매개변수 곡선: {"x":"cos(t)","y":"sin(t)","tRange":[0,6.28]}"""
    x_fn = compile_fn(param_spec.get("x", "0").replace("t", "x"))
    y_fn = compile_fn(param_spec.get("y", "0").replace("t", "x"))
    if not x_fn or not y_fn:
        return None
    return x_fn, y_fn


# ═══════════════════════════════════════════════════════════════════════════════
# 적응형 샘플링 + 고급 불연속 감지
# ═══════════════════════════════════════════════════════════════════════════════

def _adaptive_sample(
    f: Callable, x_min: float, x_max: float,
    min_pts: int = 500, max_pts: int = 5000, curvature_tol: float = 0.02,
) -> Tuple[np.ndarray, np.ndarray]:
    """곡률이 높은 구간에서 자동으로 점을 추가하는 적응형 샘플링."""
    x = np.linspace(x_min, x_max, min_pts)
    y = f(x)

    for _ in range(4):
        if len(x) >= max_pts:
            break
        finite = np.isfinite(y)
        if np.sum(finite) < 3:
            break

        dx = np.diff(x)
        dy = np.diff(y)
        safe = finite[:-1] & finite[1:]
        if not np.any(safe):
            break

        curvature = np.zeros(len(dx))
        curvature[safe] = np.abs(dy[safe]) / (dx[safe] + 1e-12)
        if len(curvature) > 1:
            d2 = np.abs(np.diff(curvature))
            d2 = np.concatenate([[0], d2])
            need_refine = d2 > np.percentile(d2[d2 > 0], 85) if np.any(d2 > 0) else np.zeros(len(d2), dtype=bool)
        else:
            break

        new_x = []
        for i in np.where(need_refine)[0]:
            if i < len(x) - 1:
                mid = (x[i] + x[i + 1]) / 2
                new_x.append(mid)

        if not new_x:
            break
        x = np.sort(np.concatenate([x, new_x]))
        y = f(x)

    return x, y


def _detect_breaks(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """불연속점 감지: 부호 반전 + 급격한 변화 + NaN 전이."""
    breaks = np.zeros(len(y), dtype=bool)
    finite = np.isfinite(y)

    for i in range(1, len(y)):
        if not finite[i] or not finite[i - 1]:
            if finite[i] != finite[i - 1]:
                breaks[i] = True
            continue
        dy = abs(y[i] - y[i - 1])
        dx = abs(x[i] - x[i - 1])
        if dx < 1e-15:
            continue
        slope = dy / dx
        y_scale = max(abs(y[i]), abs(y[i - 1]), 1.0)
        if dy > y_scale * 0.5 and slope > 100:
            breaks[i] = True
        if i >= 2 and finite[i - 2]:
            slope_prev = (y[i - 1] - y[i - 2]) / max(abs(x[i - 1] - x[i - 2]), 1e-15)
            slope_curr = (y[i] - y[i - 1]) / max(dx, 1e-15)
            if abs(slope_curr) > 10 and abs(slope_prev) > 10:
                if np.sign(slope_curr) != np.sign(slope_prev):
                    breaks[i] = True

    return breaks


def _apply_breaks(y: np.ndarray, breaks: np.ndarray) -> np.ndarray:
    y_plot = y.copy()
    y_plot[breaks] = np.nan
    return y_plot


# ═══════════════════════════════════════════════════════════════════════════════
# 라벨 포맷팅
# ═══════════════════════════════════════════════════════════════════════════════

def _fmt_subscript(label: str) -> str:
    if label.startswith("$"):
        return label
    m = re.match(r"^([A-Za-z]+)_(\d+)$", label)
    if m:
        return f"${m.group(1)}_{{{m.group(2)}}}$"
    m2 = re.match(r"^([A-Za-z]+)(\d+)$", label)
    if m2:
        return f"${m2.group(1)}_{{{m2.group(2)}}}$"
    return label


def _fmt_func_label(label: str) -> str:
    if label.startswith("$"):
        return label
    return f"${label}$"


def _point_label_style(label: str) -> dict:
    clean = label.strip()
    if re.match(r"^[A-Z]$", clean):
        return {"fontfamily": _SERIF, "fontstyle": "normal", "fontweight": "medium"}
    return {"fontfamily": _SERIF, "fontstyle": "italic"}


# ═══════════════════════════════════════════════════════════════════════════════
# 좌표축 — 삼각형 화살표 + 자동 정수 눈금
# ═══════════════════════════════════════════════════════════════════════════════

def _detect_axis_labels(spec: dict) -> Tuple[str, str]:
    if spec.get("xLabel") and spec.get("yLabel"):
        return spec["xLabel"], spec["yLabel"]
    for fn in spec.get("functions", []):
        label = fn.get("label", "")
        m = re.match(r"^\s*([a-zA-Z])\s*=\s*", label)
        if not m:
            continue
        lhs = m.group(1)
        rhs = label[m.end():]
        cleaned = re.sub(r"[a-z]{2,}", "", rhs)
        chars = re.findall(r"[a-z]", cleaned)
        x_var = next((c for c in chars if c != lhs), None)
        if x_var and x_var != lhs:
            return spec.get("xLabel", x_var), spec.get("yLabel", lhs)
    return spec.get("xLabel", "x"), spec.get("yLabel", "y")


def _setup_axes(
    ax: plt.Axes, x_min: float, x_max: float, y_min: float, y_max: float,
    x_label: str, y_label: str, S: dict,
    show_ticks: bool = False, placed_obstacles: Optional[List] = None,
) -> None:
    ink = S["ink"]
    origin_in_x = x_min <= 0 <= x_max
    origin_in_y = y_min <= 0 <= y_max
    x_span = x_max - x_min
    y_span = y_max - y_min

    ox = 0.0 if origin_in_y else x_min
    oy = 0.0 if origin_in_x else y_min

    for sp in ax.spines.values():
        sp.set_visible(False)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.tick_params(length=0, width=0)
    ax.grid(False)

    neg_x = x_min - x_span * 0.06
    neg_y = y_min - y_span * 0.06
    x_tip = x_max + x_span * 0.08
    y_tip = y_max + y_span * 0.08

    ax.plot([neg_x, x_tip], [oy, oy], color=ink, lw=S["axis_lw"],
            zorder=1, solid_capstyle="butt")
    ax.plot([ox, ox], [neg_y, y_tip], color=ink, lw=S["axis_lw"],
            zorder=1, solid_capstyle="butt")

    aw = x_span * S["arrow_w"] * 0.08
    al = x_span * S["arrow_l"] * 0.08
    ax.add_patch(MplPolygon(
        [[x_tip, oy], [x_tip - al, oy - aw], [x_tip - al, oy + aw]],
        closed=True, fc=ink, ec=ink, lw=0.3, zorder=2,
    ))
    aw_y = y_span * S["arrow_w"] * 0.08
    al_y = y_span * S["arrow_l"] * 0.08
    ax.add_patch(MplPolygon(
        [[ox, y_tip], [ox - aw_y, y_tip - al_y], [ox + aw_y, y_tip - al_y]],
        closed=True, fc=ink, ec=ink, lw=0.3, zorder=2,
    ))

    halo_fx = _halo(S["halo_lw"])

    if origin_in_x and origin_in_y:
        ax.text(ox - x_span * 0.035, oy - y_span * 0.04, "O",
                fontsize=S["font_origin"], color=ink, ha="center", va="top",
                fontfamily=_SERIF, path_effects=halo_fx, zorder=20)
        if placed_obstacles is not None:
            placed_obstacles.append((ox, oy, x_span * 0.06, y_span * 0.06))

    ax.text(x_tip + x_span * 0.015, oy - y_span * 0.035,
            f"${x_label}$", fontsize=S["font_axis"], color=ink, ha="left", va="top",
            path_effects=halo_fx, zorder=20)
    ax.text(ox - x_span * 0.04, y_tip + y_span * 0.01,
            f"${y_label}$", fontsize=S["font_axis"], color=ink, ha="center", va="bottom",
            path_effects=halo_fx, zorder=20)

    if show_ticks:
        _draw_auto_ticks(ax, ox, oy, x_min, x_max, y_min, y_max, S, halo_fx)


def _draw_auto_ticks(
    ax: plt.Axes, ox: float, oy: float,
    x_min: float, x_max: float, y_min: float, y_max: float,
    S: dict, halo_fx: list,
) -> None:
    """축 위에 적절한 간격의 정수 눈금을 자동 생성."""
    ink = S["ink"]
    x_span = x_max - x_min
    y_span = y_max - y_min
    tl = x_span * 0.012

    step = 1
    if x_span > 20:
        step = 5
    elif x_span > 10:
        step = 2

    for v in range(int(np.ceil(x_min)), int(np.floor(x_max)) + 1, step):
        if v == 0:
            continue
        ax.plot([v, v], [oy - tl, oy + tl], color=ink, lw=S["tick_lw"], zorder=2)
        ax.text(v, oy - y_span * 0.045, str(v),
                fontsize=S["font_tick"], color=ink, ha="center", va="top",
                fontfamily=_SERIF, path_effects=halo_fx, zorder=20)

    y_step = step
    if y_span > 20:
        y_step = 5
    elif y_span > 10:
        y_step = 2

    tl_y = y_span * 0.012
    for v in range(int(np.ceil(y_min)), int(np.floor(y_max)) + 1, y_step):
        if v == 0:
            continue
        ax.plot([ox - tl_y, ox + tl_y], [v, v], color=ink, lw=S["tick_lw"], zorder=2)
        ax.text(ox - x_span * 0.035, v, str(v),
                fontsize=S["font_tick"], color=ink, ha="right", va="center",
                fontfamily=_SERIF, path_effects=halo_fx, zorder=20)


# ═══════════════════════════════════════════════════════════════════════════════
# 개별 요소 렌더링
# ═══════════════════════════════════════════════════════════════════════════════

def _draw_functions(
    ax: plt.Axes, functions: List[dict], x_min: float, x_max: float, S: dict,
) -> List[Optional[Callable]]:
    """함수 곡선 렌더링. 컴파일된 함수 목록 반환 (라벨 배치용)."""
    ink = S["ink"]
    margin = (x_max - x_min) * 0.05
    all_fns: List[Optional[Callable]] = []

    for fn_spec in functions:
        pieces = fn_spec.get("pieces")
        if pieces:
            f = compile_piecewise(pieces)
        else:
            f = compile_fn(fn_spec.get("fn", "0"))
        all_fns.append(f)
        if f is None:
            continue

        x, y = _adaptive_sample(f, x_min - margin, x_max + margin)
        breaks = _detect_breaks(x, y)
        y_plot = _apply_breaks(y, breaks)

        is_dashed = fn_spec.get("dashed", False)
        ls = "--" if is_dashed else "-"
        dash_kw = {"dashes": S["curve_dash"]} if is_dashed else {}
        lw = S["curve_lw"] * 0.85 if is_dashed else S["curve_lw"]

        ax.plot(x, y_plot, color=ink, linestyle=ls, linewidth=lw,
                zorder=5, solid_capstyle="round", **dash_kw)

    return all_fns


def _draw_parametric(ax: plt.Axes, parametric: List[dict], S: dict) -> None:
    ink = S["ink"]
    for p_spec in parametric:
        fns = compile_parametric(p_spec)
        if fns is None:
            continue
        x_fn, y_fn = fns
        t_range = p_spec.get("tRange", [0, 2 * np.pi])
        t = np.linspace(t_range[0], t_range[1], 2000)
        px = x_fn(t)
        py = y_fn(t)
        is_dashed = p_spec.get("dashed", False)
        ls = "--" if is_dashed else "-"
        dash_kw = {"dashes": S["curve_dash"]} if is_dashed else {}
        ax.plot(px, py, color=ink, linestyle=ls, linewidth=S["curve_lw"],
                zorder=5, solid_capstyle="round", **dash_kw)


def _draw_regions(
    ax: plt.Axes, regions: List[dict], x_min: float, x_max: float, S: dict,
) -> None:
    ink = S["ink"]
    for region in regions:
        f = compile_fn(region.get("fn", "0"))
        if f is None:
            continue
        rx1 = region.get("x1", x_min)
        rx2 = region.get("x2", x_max)
        x = np.linspace(rx1, rx2, 500)
        y = f(x)

        fn2_str = region.get("fn2")
        use_hatch = region.get("hatch", False)

        if fn2_str:
            f2 = compile_fn(fn2_str)
            y2 = f2(x) if f2 else np.zeros_like(x)
        else:
            y2 = np.zeros_like(x)

        if use_hatch:
            ax.fill_between(x, y2, y, facecolor="none", edgecolor=ink,
                            hatch=S["hatch_density"], linewidth=S["hatch_lw"],
                            alpha=0.6, zorder=1)
        else:
            ax.fill_between(x, y2, y, color=ink, alpha=S["region_alpha"], zorder=1)


def _draw_vlines(
    ax: plt.Axes, vlines: List[dict],
    x_min: float, x_max: float, y_min: float, y_max: float, S: dict,
) -> None:
    ink = S["ink"]
    y_span = y_max - y_min
    y_axis = 0.0 if y_min <= 0 <= y_max else y_min
    halo_fx = _halo(S["halo_lw"])
    for vl in vlines:
        ax.plot([vl["x"], vl["x"]], [y_min, y_max], color=ink,
                linestyle="--", linewidth=S["aux_lw"],
                dashes=S["aux_dash"], alpha=S["aux_alpha"], zorder=3)
        ax.plot([vl["x"]], [y_axis], marker="|", markersize=5, color=ink, zorder=5)
        if vl.get("label"):
            ax.text(vl["x"], y_axis - y_span * 0.06,
                    _fmt_subscript(vl["label"]),
                    fontsize=S["font_vh"], color=ink, ha="center", va="top",
                    path_effects=halo_fx, zorder=20)


def _draw_hlines(
    ax: plt.Axes, hlines: List[dict],
    x_min: float, x_max: float, y_min: float, y_max: float, S: dict,
) -> None:
    ink = S["ink"]
    x_span = x_max - x_min
    x_axis = 0.0 if x_min <= 0 <= x_max else x_min
    halo_fx = _halo(S["halo_lw"])
    for hl in hlines:
        ax.plot([x_min, x_max], [hl["y"], hl["y"]], color=ink,
                linestyle="--", linewidth=S["aux_lw"],
                dashes=S["aux_dash"], alpha=S["aux_alpha"], zorder=3)
        ax.plot([x_axis], [hl["y"]], marker="_", markersize=5, color=ink, zorder=5)
        if hl.get("label"):
            ax.text(x_axis - x_span * 0.04, hl["y"],
                    _fmt_subscript(hl["label"]),
                    fontsize=S["font_vh"], color=ink, ha="right", va="center",
                    path_effects=halo_fx, zorder=20)


def _draw_segments(ax: plt.Axes, segments: List[dict], S: dict) -> None:
    ink = S["ink"]
    halo_fx = _halo(S["halo_lw"])
    for sg in segments:
        x1, y1, x2, y2 = sg["x1"], sg["y1"], sg["x2"], sg["y2"]
        is_solid = sg.get("solid", False)
        is_dashed = False if is_solid else sg.get("dashed", True)
        lw = S["seg_solid_lw"] if is_solid else S["seg_dash_lw"]
        alpha = S["seg_solid_alpha"] if is_solid else S["seg_dash_alpha"]
        ls = "--" if is_dashed else "-"
        dash_kw = {"dashes": S["seg_dash_pat"]} if is_dashed else {}
        ax.plot([x1, x2], [y1, y2], color=ink, linestyle=ls, linewidth=lw,
                alpha=alpha, zorder=3, solid_capstyle="round", **dash_kw)
        label = sg.get("label")
        if label:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            dx, dy = x2 - x1, y2 - y1
            seg_len = np.hypot(dx, dy) or 1.0
            nx, ny = -dy / seg_len, dx / seg_len
            scale = max(abs(x2 - x1), abs(y2 - y1)) * 0.05
            scale = max(scale, 0.15)
            ax.annotate(_fmt_subscript(label),
                        xy=(mx + nx * scale, my + ny * scale),
                        fontsize=S["font_seg"], color=ink, ha="center", va="center",
                        path_effects=halo_fx, zorder=12)


def _draw_circles(ax: plt.Axes, circles: List[dict], S: dict) -> None:
    ink = S["ink"]
    halo_fx = _halo(S["halo_lw"])
    for c in circles:
        cx, cy, r = c["cx"], c["cy"], c["r"]
        is_dashed = c.get("dashed", False)
        ls = "--" if is_dashed else "-"
        dash_kw = {"dashes": S["circle_dash"]} if is_dashed else {}
        theta = np.linspace(0, 2 * np.pi, 500)
        ax.plot(cx + r * np.cos(theta), cy + r * np.sin(theta),
                color=ink, linewidth=S["circle_lw"], linestyle=ls, zorder=4, **dash_kw)
        if c.get("label"):
            ax.text(cx - r, cy + r, _fmt_subscript(c["label"]),
                    fontsize=S["font_circ"], color=ink, ha="right", va="bottom",
                    fontstyle="italic", path_effects=halo_fx, zorder=12)


def _draw_arcs(ax: plt.Axes, arcs: List[dict], S: dict) -> None:
    ink = S["ink"]
    halo_fx = _halo(S["halo_lw"])
    for a in arcs:
        cx, cy, r = a["cx"], a["cy"], a["r"]
        s_rad, e_rad = np.radians(a["startAngle"]), np.radians(a["endAngle"])
        theta = np.linspace(s_rad, e_rad, 200)
        ax.plot(cx + r * np.cos(theta), cy + r * np.sin(theta),
                color=ink, linewidth=S["arc_lw"], zorder=4)
        if a.get("label"):
            mid = (s_rad + e_rad) / 2
            ax.text(cx + (r + 0.15) * np.cos(mid), cy + (r + 0.15) * np.sin(mid),
                    a["label"], fontsize=S["font_arc"], color=ink,
                    ha="center", va="center", fontstyle="italic",
                    path_effects=halo_fx, zorder=12)


def _draw_angles(ax: plt.Axes, angles: List[dict], S: dict) -> None:
    ink = S["ink"]
    halo_fx = _halo(S["halo_lw"])
    for a in angles:
        cx, cy = a["cx"], a["cy"]
        r = a.get("r", 0.3)
        s_rad, e_rad = np.radians(a["startAngle"]), np.radians(a["endAngle"])
        theta = np.linspace(s_rad, e_rad, 100)
        ax.plot(cx + r * np.cos(theta), cy + r * np.sin(theta),
                color=ink, linewidth=S["angle_lw"], zorder=6)
        if a.get("label"):
            mid = (s_rad + e_rad) / 2
            ax.text(cx + (r + 0.2) * np.cos(mid), cy + (r + 0.2) * np.sin(mid),
                    a["label"], fontsize=S["font_angle"], color=ink,
                    ha="center", va="center", fontstyle="italic",
                    path_effects=halo_fx, zorder=12)


def _draw_right_angles(ax: plt.Axes, right_angles: List[dict], x_span: float, S: dict) -> None:
    ink = S["ink"]
    sz = x_span * 0.025
    for ra in right_angles:
        x, y = ra["x"], ra["y"]
        ang = np.radians(ra.get("angle", 0))
        dx1, dy1 = sz * np.cos(ang), sz * np.sin(ang)
        dx2, dy2 = sz * np.cos(ang + np.pi / 2), sz * np.sin(ang + np.pi / 2)
        sq = MplPolygon([
            [x + dx1, y + dy1],
            [x + dx1 + dx2, y + dy1 + dy2],
            [x + dx2, y + dy2],
        ], fill=False, edgecolor=ink, linewidth=S["ra_lw"], zorder=6)
        ax.add_patch(sq)


def _draw_points(ax: plt.Axes, points: List[dict], S: dict) -> None:
    ink = S["ink"]
    halo_fx = _halo(S["halo_lw"])
    for pt in points:
        ax.plot(pt["x"], pt["y"], marker="o", markersize=S["point_ms"],
                markerfacecolor=ink, markeredgecolor=ink, markeredgewidth=0.3, zorder=10)
        if pt.get("label"):
            pos = pt.get("labelPos", "tr")
            offset = _LABEL_POS_OFFSETS.get(pos, (5, 5))
            style = _point_label_style(pt["label"])
            ax.annotate(_fmt_subscript(pt["label"]), xy=(pt["x"], pt["y"]),
                        xytext=offset, textcoords="offset points",
                        fontsize=S["font_point"], color=ink, zorder=11,
                        path_effects=halo_fx, **style)


def _draw_hollow_points(ax: plt.Axes, hollow_points: List[dict], S: dict) -> None:
    ink = S["ink"]
    halo_fx = _halo(S["halo_lw"])
    for pt in hollow_points:
        ax.plot(pt["x"], pt["y"], marker="o", markersize=S["hollow_ms"],
                markerfacecolor="white", markeredgecolor=ink,
                markeredgewidth=S["hollow_edge_lw"], zorder=10)
        if pt.get("label"):
            pos = pt.get("labelPos", "tr")
            offset = _LABEL_POS_OFFSETS.get(pos, (5, 5))
            style = _point_label_style(pt["label"])
            ax.annotate(_fmt_subscript(pt["label"]), xy=(pt["x"], pt["y"]),
                        xytext=offset, textcoords="offset points",
                        fontsize=S["font_point"], color=ink, zorder=11,
                        path_effects=halo_fx, **style)


_LABEL_POS_OFFSETS = {
    "tr": (5, 5), "tl": (-12, 5), "br": (5, -10), "bl": (-12, -10),
    "t": (-2, 8), "b": (-2, -12), "l": (-14, 0), "r": (6, 0),
}


def _draw_texts(ax: plt.Axes, texts: List[dict], S: dict) -> None:
    ink = S["ink"]
    halo_fx = _halo(S["halo_lw"])
    for t in texts:
        ax.text(t["x"], t["y"], _fmt_subscript(t["text"]),
                fontsize=t.get("fontSize", S["font_text"]), color=ink,
                fontstyle="italic", fontfamily=_SERIF,
                ha="center", va="center", zorder=12, path_effects=halo_fx)


# ═══════════════════════════════════════════════════════════════════════════════
# 함수 라벨 — 그리드 탐색 + 물리 시뮬레이션 (TSX 포팅)
# ═══════════════════════════════════════════════════════════════════════════════

def _place_function_labels(
    ax: plt.Axes, spec: dict,
    x_min: float, x_max: float, y_min: float, y_max: float,
    all_fns: List[Optional[Callable]], S: dict,
) -> None:
    ink = S["ink"]
    halo_fx = _halo(S["halo_lw"])
    x_span = x_max - x_min
    y_span = y_max - y_min
    functions = spec.get("functions", [])

    labels: List[Dict[str, Any]] = []

    obstacles = []
    for pt in spec.get("points", []) + spec.get("hollowPoints", []):
        obstacles.append((pt["x"], pt["y"], x_span * 0.06, y_span * 0.06))
    for vl in spec.get("vLines", []):
        obstacles.append((vl["x"], (y_min + y_max) / 2, x_span * 0.03, y_span))
    for hl in spec.get("hLines", []):
        obstacles.append(((x_min + x_max) / 2, hl["y"], x_span, y_span * 0.03))
    origin_in_x = x_min <= 0 <= x_max
    origin_in_y = y_min <= 0 <= y_max
    if origin_in_x and origin_in_y:
        obstacles.append((0, 0, x_span * 0.08, y_span * 0.08))

    for i, fn_spec in enumerate(functions):
        label = fn_spec.get("label")
        if not label:
            continue
        f = all_fns[i] if i < len(all_fns) else None
        if f is None:
            continue

        est_w = len(label) * x_span * 0.03
        est_h = y_span * 0.06

        if fn_spec.get("labelX") is not None and fn_spec.get("labelY") is not None:
            labels.append({
                "x": fn_spec["labelX"], "y": fn_spec["labelY"],
                "w": est_w, "h": est_h, "text": label, "fn_idx": i,
            })
            continue

        best_pos = None
        best_score = -1e9

        for gx_frac in np.arange(0.1, 0.95, 0.05):
            for gy_off_frac in [-0.08, 0.08, -0.15, 0.15, -0.03, 0.03]:
                lx = x_min + x_span * gx_frac
                try:
                    curve_y = float(f(np.array([lx]))[0])
                except Exception:
                    continue
                if not np.isfinite(curve_y):
                    continue
                ly = curve_y + y_span * gy_off_frac

                if ly < y_min + y_span * 0.03 or ly > y_max - y_span * 0.03:
                    continue
                if lx < x_min + x_span * 0.03 or lx > x_max - x_span * 0.03:
                    continue

                score = 100.0

                for placed in labels:
                    if (abs(lx - placed["x"]) < max(est_w, placed["w"]) * 1.2 and
                            abs(ly - placed["y"]) < max(est_h, placed["h"]) * 1.2):
                        score -= 80

                for j, other_f in enumerate(all_fns):
                    if other_f is None:
                        continue
                    try:
                        cy = float(other_f(np.array([lx]))[0])
                    except Exception:
                        continue
                    if np.isfinite(cy):
                        d = abs(ly - cy)
                        if d < y_span * 0.04:
                            score -= (y_span * 0.04 - d) / (y_span * 0.04) * 50

                for (ox, oy, ow, oh) in obstacles:
                    if abs(lx - ox) < (est_w + ow) / 2 and abs(ly - oy) < (est_h + oh) / 2:
                        score -= 40

                if 0.55 < gx_frac < 0.9:
                    score += 5
                if abs(gy_off_frac) > 0.05:
                    score += 3

                if score > best_score:
                    best_score = score
                    best_pos = (lx, ly)

        if best_pos is None:
            lx = x_max - x_span * (0.15 + i * 0.08)
            try:
                ly = float(f(np.array([lx]))[0])
            except Exception:
                ly = y_max * 0.7
            if not np.isfinite(ly):
                ly = y_max * 0.7
            ly = max(y_min + y_span * 0.05, min(y_max - y_span * 0.05, ly + est_h * 0.5))
            best_pos = (lx, ly)

        labels.append({
            "x": best_pos[0], "y": best_pos[1],
            "w": est_w, "h": est_h, "text": label, "fn_idx": i,
        })

    _physics_relax(labels, all_fns, x_min, x_max, y_min, y_max, obstacles)

    for lbl in labels:
        ax.annotate(
            _fmt_func_label(lbl["text"]),
            xy=(lbl["x"], lbl["y"]),
            fontsize=S["font_func"], color=ink, va="bottom", ha="left",
            fontstyle="italic", fontfamily=_SERIF,
            path_effects=halo_fx, zorder=15,
        )


def _physics_relax(
    labels: List[Dict], all_fns: List, x_min: float, x_max: float,
    y_min: float, y_max: float, obstacles: List[Tuple],
    iterations: int = 25,
) -> None:
    """물리 시뮬레이션으로 라벨 간 충돌 및 곡선 겹침 해소."""
    x_span = x_max - x_min
    y_span = y_max - y_min

    for _ in range(iterations):
        for a_idx, la in enumerate(labels):
            fx, fy = 0.0, 0.0

            for b_idx, lb in enumerate(labels):
                if a_idx == b_idx:
                    continue
                dx = la["x"] - lb["x"]
                dy = la["y"] - lb["y"]
                dist = max(np.hypot(dx, dy), 0.001)
                overlap_x = (la["w"] + lb["w"]) / 2 + x_span * 0.02 - abs(dx)
                overlap_y = (la["h"] + lb["h"]) / 2 + y_span * 0.02 - abs(dy)
                if overlap_x > 0 and overlap_y > 0:
                    force = min(overlap_x, x_span * 0.05) * 0.3
                    fx += (dx / dist) * force
                    fy += (dy / dist) * force

            for fn in all_fns:
                if fn is None:
                    continue
                try:
                    cy = float(fn(np.array([la["x"]]))[0])
                except Exception:
                    continue
                if np.isfinite(cy):
                    d = la["y"] - cy
                    if abs(d) < y_span * 0.04:
                        fy += np.sign(d) * (y_span * 0.04 - abs(d)) * 0.4

            la["x"] += fx
            la["y"] += fy
            la["x"] = max(x_min + x_span * 0.03, min(x_max - x_span * 0.05, la["x"]))
            la["y"] = max(y_min + y_span * 0.03, min(y_max - y_span * 0.03, la["y"]))


# ═══════════════════════════════════════════════════════════════════════════════
# 메인 생성 함수
# ═══════════════════════════════════════════════════════════════════════════════

def generate_graph(
    spec: dict,
    output_path: str,
    dpi: int = 300,
    figsize: Optional[Tuple[float, float]] = None,
    output_format: Optional[str] = None,
) -> Dict[str, Any]:
    """GraphSpec → 수능 스타일 그래프 이미지.

    output_format: None(자동), "png", "svg", "emf", "pdf"
    자동 모드는 output_path 확장자로 결정. 기본 PNG.
    """
    print_mode = spec.get("printMode", False)
    S = _make_style(print_mode)

    if figsize is None:
        figsize = _SIZE_MAP.get(spec.get("size", "medium"), (4.2, 4.0))

    if output_format is None:
        ext = os.path.splitext(output_path)[1].lower()
        output_format = ext.lstrip(".") if ext else "png"
    if output_format not in ("png", "svg", "pdf", "emf"):
        output_format = "png"

    if output_format == "svg":
        save_dpi = 72
    elif output_format == "pdf":
        save_dpi = 72
    else:
        save_dpi = dpi

    with plt.rc_context(SUNEUNG_RC):
        fig, ax = plt.subplots(1, 1, figsize=figsize)

        x_range = spec.get("xRange", [-5, 5])
        y_range = spec.get("yRange", [-5, 5])
        x_min, x_max = float(x_range[0]), float(x_range[1])
        y_min, y_max = float(y_range[0]), float(y_range[1])

        functions = spec.get("functions", [])
        if functions and not spec.get("equalAspect", False):
            x_test = np.linspace(x_min, x_max, 500)
            all_y: List[float] = []
            for fn_spec in functions:
                pieces = fn_spec.get("pieces")
                f = compile_piecewise(pieces) if pieces else compile_fn(fn_spec.get("fn", "0"))
                if f is None:
                    continue
                y_vals = f(x_test)
                finite = y_vals[np.isfinite(y_vals)]
                if len(finite) > 0:
                    all_y.extend(finite.tolist())
            if all_y:
                fn_ymin, fn_ymax = min(all_y), max(all_y)
                fn_span = fn_ymax - fn_ymin
                spec_span = y_max - y_min
                if fn_span > 0 and fn_span < spec_span * 0.3:
                    pad = fn_span * 0.4
                    y_min = max(y_min, fn_ymin - pad)
                    y_max = min(y_max, fn_ymax + pad)
                    if y_range[0] <= 0 <= y_range[1]:
                        y_min = min(y_min, -abs(fn_span) * 0.15)
                        y_max = max(y_max, abs(fn_span) * 0.15)

        x_span = x_max - x_min
        y_span = y_max - y_min
        x_pad = x_span * 0.10
        y_pad = y_span * 0.10
        ax.set_xlim(x_min - x_pad, x_max + x_pad)
        ax.set_ylim(y_min - y_pad, y_max + y_pad)
        ax.set_aspect("equal", adjustable="box")

        no_axes = spec.get("noAxes", False)
        show_ticks = spec.get("showTicks", False)

        if not no_axes:
            xl, yl = _detect_axis_labels(spec)
            _setup_axes(ax, x_min, x_max, y_min, y_max,
                        x_label=xl, y_label=yl, S=S, show_ticks=show_ticks)
        else:
            for sp in ax.spines.values():
                sp.set_visible(False)
            ax.set_xticks([])
            ax.set_yticks([])

        ax.grid(False)
        ax.set_axisbelow(True)

        _draw_regions(ax, spec.get("regions", []), x_min, x_max, S)
        _draw_circles(ax, spec.get("circles", []), S)
        _draw_arcs(ax, spec.get("arcs", []), S)
        _draw_segments(ax, spec.get("segments", []), S)
        _draw_vlines(ax, spec.get("vLines", []), x_min, x_max, y_min, y_max, S)
        _draw_hlines(ax, spec.get("hLines", []), x_min, x_max, y_min, y_max, S)
        _draw_angles(ax, spec.get("angles", []), S)
        _draw_right_angles(ax, spec.get("rightAngles", []), x_span, S)

        all_fns = _draw_functions(ax, spec.get("functions", []), x_min, x_max, S)

        _draw_parametric(ax, spec.get("parametric", []), S)

        _draw_points(ax, spec.get("points", []), S)
        _draw_hollow_points(ax, spec.get("hollowPoints", []), S)
        _draw_texts(ax, spec.get("texts", []), S)

        _place_function_labels(ax, spec, x_min, x_max, y_min, y_max, all_fns, S)

        title = spec.get("title")
        if title:
            ax.set_title(title, fontsize=11, fontweight="bold", color=S["ink"], pad=8)

        fig.tight_layout(pad=0.3)
        out_dir = os.path.dirname(output_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        actual_path = output_path
        if output_format == "emf":
            svg_path = output_path.rsplit(".", 1)[0] + ".svg"
            fig.savefig(svg_path, format="svg", bbox_inches="tight",
                        facecolor="white", edgecolor="none", pad_inches=0.05)
            actual_path = svg_path
        elif output_format == "svg":
            fig.savefig(output_path, format="svg", bbox_inches="tight",
                        facecolor="white", edgecolor="none", pad_inches=0.05)
        elif output_format == "pdf":
            fig.savefig(output_path, format="pdf", bbox_inches="tight",
                        facecolor="white", edgecolor="none", pad_inches=0.05)
        else:
            fig.savefig(output_path, dpi=save_dpi, bbox_inches="tight",
                        facecolor="white", edgecolor="none", pad_inches=0.05)

        w_inches = fig.get_figwidth()
        h_inches = fig.get_figheight()
        plt.close(fig)

    return {
        "path": os.path.abspath(actual_path),
        "format": output_format,
        "width_px": int(w_inches * save_dpi),
        "height_px": int(h_inches * save_dpi),
        "width_mm": round(w_inches * 25.4, 1),
        "height_mm": round(h_inches * 25.4, 1),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    import argparse
    parser = argparse.ArgumentParser(description="수능 스타일 수학 그래프 생성기 v2 (출판 품질)")
    parser.add_argument("--input", required=True, help="GraphSpec JSON 파일 경로")
    parser.add_argument("--output", required=True, help="출력 파일 경로 (PNG/SVG/PDF)")
    parser.add_argument("--dpi", type=int, default=300, help="해상도 (기본 300)")
    parser.add_argument("--format", default=None, choices=["png", "svg", "pdf", "emf"],
                        help="출력 형식 (기본: 확장자 자동)")
    parser.add_argument("--print", action="store_true", dest="print_mode",
                        help="인쇄 최적화 모드 (순검정, 보정 선폭)")
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        spec = json.load(f)

    if args.print_mode:
        spec["printMode"] = True

    result = generate_graph(spec, args.output, dpi=args.dpi, output_format=args.format)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
