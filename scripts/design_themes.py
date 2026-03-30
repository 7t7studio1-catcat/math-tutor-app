"""
출판 디자인 테마 — 시중 수학 교재(N티켓, 4의규칙, 스탠다드, N제) 수준
색상은 한글 COM 0xBBGGRR 형식
"""

from typing import Dict, Any

# ═══════════════════════════════════════════════════════════════════════════════
# 브랜드 컬러 시스템 — "스마트풀이"
# ═══════════════════════════════════════════════════════════════════════════════

BRAND = {
    "primary":       0x4A2A1B,   # 딥 네이비    #1B2A4A
    "primary_light": 0x6E4A2D,   # 미드 네이비  #2D4A6E
    "accent":        0xFF5B2D,   # 코발트 블루  #2D5BFF
    "accent_light":  0xFFAA77,   # 연한 블루    #77AAFF
    "accent_bg":     0xFFF0E8,   # 극연한 블루  #E8F0FF
    "gold":          0x53A8D4,   # 웜 골드      #D4A853
    "gold_light":    0x80CCEE,   # 연한 골드    #EECC80
    "gold_bg":       0xE8F5FA,   # 극연한 골드  #FAF5E8
    "white":         0xFFFFFF,
    "black":         0x000000,
    "text_dark":     0x2E1A1A,   # 본문 텍스트  #1A1A2E
    "text_mid":      0x555555,   # 보조 텍스트
    "text_light":    0x999999,   # 연한 텍스트
    "line_light":    0xE0E0E0,   # 연한 구분선
    "line_mid":      0xBBBBBB,   # 중간 구분선
    "bg_ivory":      0xF5FAFA,   # 아이보리     #FAFAF5
    "bg_blue_gray":  0xF8F3F0,   # 블루그레이   #F0F3F8
}

# STEP 1~4 색상 (교재급 톤 조정)
STEP_COLORS = {
    1: {
        "main":   0xED3A7C,   # 보라       #7C3AED
        "light":  0xF5D5E8,   # 연보라     #E8D5F5
        "bg":     0xFAF0F5,   # 극연보라   #F5F0FA
        "icon":   "◆",
        "title":  "STEP 1  문제 읽기",
    },
    2: {
        "main":   0xEB6325,   # 블루       #2563EB
        "light":  0xF5DDD0,   # 연블루     #D0DDF5
        "bg":     0xFAF3EE,   # 극연블루   #EEF3FA
        "icon":   "◇",
        "title":  "STEP 2  실전풀이",
    },
    3: {
        "main":   0x0677D9,   # 앰버       #D97706
        "light":  0xCCEEF5,   # 연앰버     #F5EECC
        "bg":     0xE8F8FC,   # 극연앰버   #FCF8E8
        "icon":   "▶",
        "title":  "STEP 3  숏컷",
    },
    4: {
        "main":   0x699605,   # 에메랄드   #059669
        "light":  0xCCF0D5,   # 연에메랄드 #D5F0CC
        "bg":     0xE8FAF0,   # 극연에메   #F0FAE8
        "icon":   "★",
        "title":  "STEP 4  변형 대비",
    },
}

# 개념 박스 / 팁 박스 색상
BOX_STYLES = {
    "key": {
        "bg":     BRAND["accent_bg"],
        "border": BRAND["accent"],
        "label_bg": BRAND["accent"],
        "label_text": BRAND["white"],
        "label": "핵심",
    },
    "tip": {
        "bg":     BRAND["gold_bg"],
        "border": BRAND["gold"],
        "label_bg": BRAND["gold"],
        "label_text": BRAND["white"],
        "label": "TIP",
    },
    "warn": {
        "bg":     0xF0F0FA,   # 연보라 배경
        "border": STEP_COLORS[1]["main"],
        "label_bg": STEP_COLORS[1]["main"],
        "label_text": BRAND["white"],
        "label": "주의",
    },
    "answer": {
        "bg":     STEP_COLORS[4]["bg"],
        "border": STEP_COLORS[4]["main"],
        "label_bg": STEP_COLORS[4]["main"],
        "label_text": BRAND["white"],
        "label": "정답",
    },
}

# 폰트 크기 체계
FONT = {
    "title_xl":   20,
    "title_lg":   16,
    "title_md":   13,
    "title_sm":   11,
    "body":       11,
    "body_sm":    10,
    "caption":     8,
    "equation":   11,
    "equation_lg": 12,
    "problem_num": 34,
    "step_num":   14,
    "step_title": 12,
}

# ═══════════════════════════════════════════════════════════════════════════════
# 테마 프리셋
# ═══════════════════════════════════════════════════════════════════════════════

THEME_PRESETS: Dict[str, Dict[str, Any]] = {
    "default": {
        "name":             "스마트풀이",
        "subject":          "수학",
        "book_title":       "4단계 완전 해설",
        "header_bg":        BRAND["primary"],
        "header_text":      BRAND["white"],
        "header_accent":    BRAND["gold"],
        "theme_color":      BRAND["accent"],
        "problem_num_size": FONT["problem_num"],
        "problem_num_color": BRAND["accent"],
        "divider_thick":    BRAND["accent"],
        "divider_thin":     BRAND["line_light"],
        "footer_color":     BRAND["text_mid"],
        "footer_accent":    BRAND["accent"],
    },
    "standard": {
        "name":             "스탠다드",
        "subject":          "수학",
        "book_title":       "4단계 완전 해설",
        "header_bg":        0x6FB88A,
        "header_text":      BRAND["white"],
        "header_accent":    0xCCF5E0,
        "theme_color":      0x2E8B6F,
        "problem_num_size": FONT["problem_num"],
        "problem_num_color": 0x1A6B4F,
        "divider_thick":    0x2E8B6F,
        "divider_thin":     0xD0E8D8,
        "footer_color":     BRAND["text_mid"],
        "footer_accent":    0x2E8B6F,
    },
    "physical": {
        "name":             "피지컬N제",
        "subject":          "수학",
        "book_title":       "4단계 완전 해설",
        "header_bg":        0x6E3BB8,
        "header_text":      BRAND["white"],
        "header_accent":    0xE0C5F0,
        "theme_color":      0xB83B6E,
        "problem_num_size": FONT["problem_num"],
        "problem_num_color": 0x8B2952,
        "divider_thick":    0xB83B6E,
        "divider_thin":     0xF0D0E0,
        "footer_color":     BRAND["text_mid"],
        "footer_accent":    0xB83B6E,
    },
    "rule4": {
        "name":             "4의규칙",
        "subject":          "수학",
        "book_title":       "4단계 완전 해설",
        "header_bg":        0x8A8A2B,
        "header_text":      BRAND["white"],
        "header_accent":    0xE5E5C5,
        "theme_color":      0x2B8A8A,
        "problem_num_size": FONT["problem_num"],
        "problem_num_color": 0x1A6B6B,
        "divider_thick":    0x2B8A8A,
        "divider_thin":     0xD5EDED,
        "footer_color":     BRAND["text_mid"],
        "footer_accent":    0x2B8A8A,
    },
    "gichul": {
        "name":             "기출끝",
        "subject":          "수학",
        "book_title":       "4단계 완전 해설",
        "header_bg":        0x9E4B6B,
        "header_text":      BRAND["white"],
        "header_accent":    0xE8C5D4,
        "theme_color":      0x6B4B9E,
        "problem_num_size": FONT["problem_num"],
        "problem_num_color": 0x4A3480,
        "divider_thick":    0x6B4B9E,
        "divider_thin":     0xE0D0ED,
        "footer_color":     BRAND["text_mid"],
        "footer_accent":    0x6B4B9E,
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# 워크북(문제집) 전용 테마 — 2단 콤팩트 레이아웃
# ═══════════════════════════════════════════════════════════════════════════════

WORKBOOK_FONT = {
    "problem_num":     14,
    "variation_title": 10,
    "body":             9,
    "body_sm":          8.5,
    "equation":         9.5,
    "equation_lg":     10.5,
    "choices":          9,
    "caption":          7.5,
    "answer_header":   13,
    "solution_num":     9.5,
    "source_label":     8,
    "instruction":      7.5,
    "divider":          5,
}

WORKBOOK_COLOR = {
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

WORKBOOK_MARGIN = {
    "left":   15,
    "right":  15,
    "top":    15,
    "bottom": 15,
    "header":  0,
    "footer":  8,
    "col_gap": 6,
}


def get_theme(theme_id: str = "default") -> Dict[str, Any]:
    """테마 ID로 설정 반환. 없으면 default."""
    return THEME_PRESETS.get(theme_id, THEME_PRESETS["default"]).copy()
