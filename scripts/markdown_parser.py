"""
마크다운 파서 — Gemini 해설 마크다운을 토큰 배열로 분리.
한글 COM 자동화에 순서대로 전달하기 위한 중간 표현.
"""

import re
from typing import List, Dict, Any

Token = Dict[str, Any]


def _wrap_naked_latex(text: str) -> str:
    """$...$ 밖에 있는 LaTeX 명령어를 자동으로 $ 로 감싸기.

    AI가 가끔 '최종 답: \\displaystyle\\frac{1}{3e^2}' 처럼
    $ delimiter 없이 LaTeX를 출력한다. 이를 자동 감지하여 래핑.
    """
    # 1) 기존 $...$ / $$...$$ 보호
    safe_parts: List[str] = []
    PH = "\uE030"
    ctr = [0]

    def _protect(m: re.Match) -> str:
        key = f"{PH}{ctr[0]}{PH}"
        safe_parts.append(m.group(0))
        ctr[0] += 1
        return key

    out = re.sub(r"\$\$[\s\S]+?\$\$", _protect, text)
    out = re.sub(r"\$(?:[^$\n\\]|\\.)+?\$", _protect, out)

    # 2) 보호된 텍스트에서 naked LaTeX 감지
    #    \displaystyle\frac{...}{...}, \frac{}{}, \sqrt{}, \sum_{}^{} 등
    CMDS = r"\\(?:displaystyle\s*\\?)?(?:frac|dfrac|tfrac|sqrt|sum|prod|lim|int|oint|binom|dbinom)"

    def _grab_latex(text: str, start: int) -> int:
        """start 부터 LaTeX 수식 끝 위치를 반환 (brace/sub/sup 소비)."""
        j = start
        while j < len(text):
            if text[j] == "{":
                depth = 1
                j += 1
                while j < len(text) and depth > 0:
                    if text[j] == "{":
                        depth += 1
                    elif text[j] == "}":
                        depth -= 1
                    j += 1
            elif text[j] in ("^", "_"):
                j += 1
                if j < len(text) and text[j] == "{":
                    depth = 1
                    j += 1
                    while j < len(text) and depth > 0:
                        if text[j] == "{":
                            depth += 1
                        elif text[j] == "}":
                            depth -= 1
                        j += 1
                elif j < len(text) and (text[j].isalnum() or text[j] == "\\"):
                    j += 1
            elif text[j] == "\\" and j + 1 < len(text) and text[j + 1].isalpha():
                m2 = re.match(CMDS, text[j:])
                if m2:
                    j += m2.end()
                else:
                    cmd_m = re.match(r"\\[a-zA-Z]+", text[j:])
                    if cmd_m:
                        j += cmd_m.end()
                    else:
                        break
            elif text[j] in (" ", "\t") and j + 1 < len(text) and text[j + 1] in ("\\", "{", "^", "_"):
                j += 1
            elif text[j] in "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+-*/=.,()[]|!<>':; ":
                peek = j + 1
                while peek < len(text) and text[peek] in " \t":
                    peek += 1
                if peek < len(text) and text[peek] in ("\\", "{", "^", "_", "$"):
                    j += 1
                else:
                    break
            else:
                break
        return j

    result_parts: List[str] = []
    i = 0
    while i < len(out):
        m = re.match(CMDS, out[i:])
        if m:
            expr_end = _grab_latex(out, i + m.end())
            latex_expr = out[i:expr_end].strip()
            result_parts.append(f"${latex_expr}$")
            i = expr_end
        else:
            result_parts.append(out[i])
            i += 1
    out = "".join(result_parts)

    # 3) 보호 해제
    for idx, orig in enumerate(safe_parts):
        out = out.replace(f"{PH}{idx}{PH}", orig, 1)

    return out


def _convert_slash_fractions(md: str) -> str:
    """$...$ 내부의 a/b 슬래시 분수를 \\frac{a}{b}로 변환."""
    def _conv_inner(latex: str) -> str:
        if "/" not in latex:
            return latex
        # 이미 \frac 보호
        safe_parts: List[str] = []
        def _protect(m: re.Match) -> str:
            safe_parts.append(m.group(0))
            return f"\uE050{len(safe_parts)-1}\uE050"
        s = re.sub(r"\\(?:d?frac|tfrac)\s*\{[^}]*\}\s*\{[^}]*\}", _protect, latex)
        # {a}/{b} → \frac{a}{b}
        s = re.sub(r"\{([^}]+)\}\s*/\s*\{([^}]+)\}", r"\\frac{\1}{\2}", s)
        # a/b → \frac{a}{b}, -a/b → -\frac{a}{b}
        def _repl(m: re.Match) -> str:
            neg_n, num, neg_d, den = m.group(1), m.group(2), m.group(3), m.group(4)
            sign = ("-" if neg_n == "-" else "") + ("-" if neg_d == "-" else "")
            return f"{sign}\\frac{{{num}}}{{{den}}}"
        s = re.sub(
            r"(-?)((?:\d+|[a-zA-Z]|\([^)]+\)))\s*/\s*(-?)((?:\d+|[a-zA-Z]|\([^)]+\)))",
            _repl, s)
        # 보호 해제
        for i, orig in enumerate(safe_parts):
            s = s.replace(f"\uE050{i}\uE050", orig)
        return s

    # display math
    md = re.sub(r"\$\$([\s\S]+?)\$\$", lambda m: "$$" + _conv_inner(m.group(1)) + "$$", md)
    # inline math
    md = re.sub(r"\$(?!\$)((?:[^$\n\\]|\\.)+?)\$", lambda m: "$" + _conv_inner(m.group(1)) + "$", md)
    return md


def parse_markdown(md: str) -> List[Token]:
    md = _wrap_naked_latex(md)
    md = _convert_slash_fractions(md)
    tokens: List[Token] = []
    lines = md.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]

        # 빈 줄 → 단락 구분
        if not line.strip():
            if tokens and tokens[-1].get("type") != "paragraph_break":
                tokens.append({"type": "paragraph_break"})
            i += 1
            continue

        # 코드 펜스 블록 ``` ... ``` — 그래프 마커 미처리 잔여분 건너뛰기
        if line.strip().startswith("```"):
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                i += 1
            if i < len(lines):
                i += 1
            continue

        # 디스플레이 수식 블록 $$ ... $$
        if line.strip().startswith("$$"):
            math_lines = [line.strip()[2:]]
            if "$$" in math_lines[0] and math_lines[0].index("$$") > 0:
                # 한 줄에 $$ ... $$ 있는 경우
                inner = math_lines[0][:math_lines[0].index("$$")]
                tokens.append({"type": "display_math", "latex": inner.strip()})
                i += 1
                continue
            i += 1
            while i < len(lines):
                if "$$" in lines[i]:
                    before = lines[i].split("$$")[0]
                    if before.strip():
                        math_lines.append(before.strip())
                    i += 1
                    break
                math_lines.append(lines[i])
                i += 1
            latex = "\n".join(math_lines).strip()
            if latex:
                tokens.append({"type": "display_math", "latex": latex})
            continue

        # 제목 ## / ###
        heading_match = re.match(r"^(#{1,4})\s+(.+)$", line)
        if heading_match:
            level = len(heading_match.group(1))
            text = heading_match.group(2).strip()
            text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
            tokens.append({"type": "heading", "level": level, "text": text})
            i += 1
            continue

        # 제목이 아닌데 볼드로만 된 줄 (Gemini가 **1단계: ...** 형태로 씀)
        bold_heading = re.match(r"^\*\*(.+)\*\*\s*$", line.strip())
        if bold_heading and len(bold_heading.group(1)) < 60:
            tokens.append({"type": "heading", "level": 3, "text": bold_heading.group(1)})
            i += 1
            continue

        # 수평선
        if re.match(r"^[-*_]{3,}\s*$", line.strip()):
            tokens.append({"type": "horizontal_rule"})
            i += 1
            continue

        # 리스트 아이템
        list_match = re.match(r"^(\s*)([-*+]|\d+\.)\s+(.+)$", line)
        if list_match:
            indent = len(list_match.group(1))
            content = list_match.group(3)
            level = indent // 2
            inline_tokens = _parse_inline(content)
            tokens.append({"type": "list_item", "level": level, "children": inline_tokens})
            i += 1
            continue

        # 인용문
        quote_match = re.match(r"^>\s*(.*)$", line)
        if quote_match:
            content = quote_match.group(1)
            inline_tokens = _parse_inline(content)
            tokens.append({"type": "blockquote", "children": inline_tokens})
            i += 1
            continue

        # 일반 텍스트 (인라인 수식·볼드 포함)
        inline_tokens = _parse_inline(line)
        tokens.extend(inline_tokens)
        tokens.append({"type": "line_break"})
        i += 1

    # 끝의 불필요한 break 정리
    while tokens and tokens[-1].get("type") in ("paragraph_break", "line_break"):
        tokens.pop()

    return tokens


def _parse_inline(text: str) -> List[Token]:
    """인라인 텍스트를 일반 텍스트 / 인라인 수식 / 볼드 등으로 분리.

    전략: 인라인 수식 $...$ 을 **먼저** 추출하여 placeholder 로 치환한 뒤
    볼드·코드를 파싱한다. 이렇게 하면 **볼드 안의 $수식$** 도 100% 잡힌다.
    """
    tokens: List[Token] = []

    # Phase 1: $...$ 인라인 수식 추출 → placeholder
    math_map: Dict[str, str] = {}
    counter = [0]
    MATH_PH = "\uE020"  # Private-use placeholder char

    _UNICODE_JUNK = str.maketrans("", "", (
        "\u2066\u2067\u2068\u2069\u200e\u200f"
        "\u202a\u202b\u202c\u202d\u202e"
        "\u200b\u200c\u200d\ufeff\u00ad"
    ))

    def _math_repl(m: re.Match) -> str:
        latex = m.group(1).translate(_UNICODE_JUNK)
        latex = latex.replace("\\displaystyle", "").strip()
        key = f"{MATH_PH}{counter[0]}{MATH_PH}"
        math_map[key] = latex
        counter[0] += 1
        return key

    safe = re.sub(r"\$(?!\$)((?:[^$\n\\]|\\.)+?)\$", _math_repl, text)

    # Phase 2: placeholder 가 들어간 텍스트에서 볼드·코드 파싱
    pattern = re.compile(
        r"(\*\*(?:[^*]|\*(?!\*))+?\*\*)"  # 볼드
        r"|(`[^`]+?`)"  # 인라인 코드
    )

    last_end = 0
    for m in pattern.finditer(safe):
        if m.start() > last_end:
            _expand_math(tokens, safe[last_end:m.start()], math_map)

        if m.group(1):
            bold_inner = m.group(1)[2:-2]
            children: List[Token] = []
            _expand_math(children, bold_inner, math_map)
            tokens.append({"type": "bold", "children": children})
        elif m.group(2):
            tokens.append({"type": "code", "text": m.group(2)[1:-1]})

        last_end = m.end()

    if last_end < len(safe):
        _expand_math(tokens, safe[last_end:], math_map)

    return tokens


def _expand_math(tokens: List[Token], text: str, math_map: Dict[str, str]) -> None:
    """placeholder 가 포함된 텍스트를 text / inline_math 토큰으로 분리."""
    MATH_PH = "\uE020"
    if MATH_PH not in text:
        if text:
            tokens.append({"type": "text", "text": text})
        return

    parts = re.split(f"({MATH_PH}\\d+{MATH_PH})", text)
    for part in parts:
        if not part:
            continue
        if part in math_map:
            tokens.append({"type": "inline_math", "latex": math_map[part]})
        else:
            tokens.append({"type": "text", "text": part})


if __name__ == "__main__":
    sample = r"""## 1단계: 조건 해석

함수 $f(x) = x^3 + ax^2 - bx$의 정의역이 양의 실수이므로 $x > 0$입니다.

$$f'(x) = 3x^2 + 2ax - b = 0$$

**따라서** $\displaystyle\lim_{n \to \infty} \frac{b}{a} = 24$가 성립합니다.

- 조건 1: $a > 0$
- 조건 2: $b > 0$

---

### 검증

**✅ 최종 답: 12**
"""

    print("=== Markdown Parser Test ===\n")
    tokens = parse_markdown(sample)
    for t in tokens:
        tp = t["type"]
        if tp == "heading":
            print(f"  [H{t['level']}] {t['text']}")
        elif tp == "text":
            print(f"  [TEXT] '{t['text']}'")
        elif tp == "bold":
            print(f"  [BOLD] '{t['text']}'")
        elif tp == "inline_math":
            print(f"  [IMATH] {t['latex']}")
        elif tp == "display_math":
            print(f"  [DMATH] {t['latex']}")
        elif tp == "list_item":
            children_str = " ".join(
                f"[{c['type']}:{c.get('text','') or c.get('latex','')}]"
                for c in t["children"]
            )
            print(f"  [LIST L{t['level']}] {children_str}")
        elif tp == "paragraph_break":
            print(f"  [PARA]")
        elif tp == "line_break":
            print(f"  [LF]")
        elif tp == "horizontal_rule":
            print(f"  [HR]")
        elif tp == "blockquote":
            print(f"  [QUOTE] ...")
        elif tp == "code":
            print(f"  [CODE] {t['text']}")
        else:
            print(f"  [{tp}] {t}")
