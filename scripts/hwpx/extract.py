"""
마크다운에서 워크북 구조 데이터 추출

AI가 생성한 변형문제 마크다운에서:
  - 원본 문제 텍스트
  - 변형 N개 (본문 + 선지)
  - 정답 및 풀이 N개
를 구조화하여 추출한다.
"""

import re
from typing import Dict, List, Any

from .layout import CIRCLED_NUMS

# AI 출력 형식: **변형 N** content / **변형 N [정답]** ③
# 기존 형식: ## 변형 N content / ■ N. 정답 ③
VARIATION_EXTRACT_RE = re.compile(
    r"(?:#{1,3}\s+|\*\*)변형\s*(\d+)\*{0,2}\s*(.*?)"
    r"(?=(?:#{1,3}\s+|\*\*)변형\s*\d+|#{1,3}\s*정답|$)",
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

ORIGINAL_PROBLEM_RE = re.compile(
    r"#{1,3}\s*원본\s*문제\s*(.*?)"
    r"(?=#{1,3}\s*문제\b|(?:#{1,3}\s+|\*\*)변형\s*\d+|$)",
    re.DOTALL,
)

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


def strip_duplicate_step_heading(md_content: str) -> str:
    """AI가 생성한 중복 헤딩/지시문을 제거."""
    lines = md_content.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if any(p.search(stripped) for p in DUPLICATE_HEADING_PATTERNS):
            continue
        cleaned.append(line)
    return "\n".join(cleaned)


def extract_workbook_data_from_markdown(
    sections: List[str], problem_image: str = None,
) -> Dict[str, Any]:
    """sections 배열(마크다운)에서 워크북 구조 데이터를 추출."""
    full_md = "\n\n".join(s for s in sections if s and s.strip())

    result: Dict[str, Any] = {
        "original_problem": {},
        "variations": [],
        "solutions": [],
    }

    if problem_image:
        result["original_problem"]["imagePath"] = problem_image

    orig_m = ORIGINAL_PROBLEM_RE.search(full_md)
    if orig_m:
        orig_text = orig_m.group(1).strip()
        orig_text = re.sub(r"^---+\s*$", "", orig_text, flags=re.MULTILINE).strip()
        if orig_text:
            result["original_problem"]["content"] = orig_text

    ans_m = ANSWER_EXTRACT_RE.search(full_md)
    problem_section = full_md[:ans_m.start()] if ans_m else full_md

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

    if ans_m:
        ans_body = ans_m.group(1)
        for sm in SINGLE_ANSWER_RE.finditer(ans_body):
            snum = int(sm.group("n1") or sm.group("n2"))
            answer = sm.group("ans").strip()
            detail = sm.group("rest").strip()

            point = ""
            explanation = detail

            point_m = re.search(
                r"(?:\*\*\s*)?\[변형\s*포인트\](?:\s*\*\*)?\s*(.*?)"
                r"(?=(?:\*\*\s*)?\[간단\s*풀이\]|$)",
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
    for idx, sym in enumerate(CIRCLED_NUMS[:5]):
        next_sym = CIRCLED_NUMS[idx + 1] if idx < 4 else None
        pattern = rf"{re.escape(sym)}\s*(.+?)(?={re.escape(next_sym) if next_sym else '$'})"
        m = re.search(pattern, body)
        if m:
            choices.append(m.group(1).strip())
    if not choices:
        line_m = re.search(r"[①②③④⑤].*[①②③④⑤].*", body)
        if line_m:
            line = line_m.group(0)
            for sym in CIRCLED_NUMS[:5]:
                parts = line.split(sym)
                if len(parts) > 1:
                    val = (parts[1].split("②")[0].split("③")[0]
                           .split("④")[0].split("⑤")[0].strip())
                    if val:
                        choices.append(val)
    return choices


def _remove_choices_from_body(body: str) -> str:
    lines = body.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if stripped and stripped[0] in "①②③④⑤":
            continue
        if re.match(r"^\s*[①②③④⑤]\s", line):
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip()
