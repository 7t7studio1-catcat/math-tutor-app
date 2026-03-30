"""
LaTeX → HwpEqn 정규식 변환기 (폴백용)

1차: AI 기반 변환 (/api/convert-hwpeqn) — Nova AI 규칙 프롬프트로 문맥 이해 변환
2차: 이 정규식 변환기 — AI 변환 실패 시 폴백

AI 변환이 정상 작동하면 이 파일의 함수는 호출되지 않는다.
AI 변환이 실패하거나 [EQ]/[DEQ] 마커가 없는 경우에만 이 변환기가 사용된다.
"""

import re


_UNICODE_JUNK = str.maketrans("", "", (
    "\u2066\u2067\u2068\u2069"
    "\u200e\u200f"
    "\u202a\u202b\u202c\u202d\u202e"
    "\u200b\u200c\u200d"
    "\ufeff\u00ad"
    "\u200a\u2009\u2008\u2007"
))


def latex_to_hwpeqn(latex: str) -> str:
    s = latex.translate(_UNICODE_JUNK).strip()
    s = s.replace("\\displaystyle", "").strip()
    s = _convert_bold(s)
    s = _convert_environments(s)
    s = _convert_frac_binom(s)
    s = _convert_sqrt(s)
    s = _convert_leftright(s)
    s = _convert_functions(s)
    s = _convert_decorations(s)
    s = _convert_greek(s)
    s = _convert_operators(s)
    s = _convert_symbols(s)
    s = _convert_subsup(s)
    s = _convert_spaces(s)
    s = _cleanup(s)
    return s.strip()


def _convert_bold(s: str) -> str:
    """\\mathbf{X}, \\boldsymbol{x}, \\bm{v} -> HwpEqn bold 토큰.
    Nova AI 규칙: 소문자 단일 문자는 {rmboldx}, 대문자는 {rm boldX}."""
    def _bold_repl(m):
        content = m.group(1).strip()
        if len(content) == 1 and content.islower():
            return f"{{rmbold{content}}}"
        elif len(content) == 1 and content.isupper():
            return f"{{rm bold{content}}}"
        else:
            return f"rm {{bold{{{content}}}}} it"
    for cmd in ["mathbf", "boldsymbol", "bm", "textbf"]:
        s = re.sub(rf"\\{cmd}\s*\{{([^{{}}]*(?:\{{[^{{}}]*\}}[^{{}}]*)*)\}}", _bold_repl, s)
    return s


def _convert_environments(s: str) -> str:
    def _cases_repl(m):
        body = m.group(1).replace("\\\\", " # ").replace("&", " & ")
        return "{cases{" + body.strip() + "}}"
    s = re.sub(r"\\begin\{cases\}([\s\S]*?)\\end\{cases\}", _cases_repl, s)

    for env, cmd in [("pmatrix", "pmatrix"), ("bmatrix", "bmatrix"),
                     ("vmatrix", "dmatrix"), ("matrix", "matrix")]:
        def _mat(m, c=cmd):
            body = m.group(1).replace("\\\\", " # ").replace("&", " & ")
            return "{" + c + "{" + body.strip() + "}}"
        s = re.sub(rf"\\begin\{{{env}\}}([\s\S]*?)\\end\{{{env}\}}", _mat, s)
    return s


def _convert_frac_binom(s: str) -> str:
    for cmd, fmt in [("dfrac", "OVER"), ("tfrac", "OVER"), ("frac", "OVER"),
                     ("dbinom", "CHOOSE"), ("binom", "CHOOSE")]:
        s = _replace_two_arg_cmd(s, cmd, fmt)
    return s


def _replace_two_arg_cmd(s: str, cmd: str, operator: str) -> str:
    """\\cmd{arg1}{arg2} → {arg1_converted} OPERATOR {arg2_converted}"""
    prefix = "\\" + cmd
    while True:
        idx = s.find(prefix)
        if idx == -1:
            break
        after = s[idx + len(prefix):]
        if after and after[0].isalpha():
            break
        arg1, end1 = _extract_brace(after)
        if arg1 is None:
            break
        arg2, end2 = _extract_brace(after[end1:])
        if arg2 is None:
            break
        conv1 = latex_to_hwpeqn(arg1)
        conv2 = latex_to_hwpeqn(arg2)
        replacement = f"{{{conv1}}} {operator} {{{conv2}}}"
        s = s[:idx] + replacement + after[end1 + end2:]
    return s


def _convert_sqrt(s: str) -> str:
    def _sqrt_nth(m):
        n, x = m.group(1), m.group(2)
        return f"root {{{latex_to_hwpeqn(n)}}} of {{{latex_to_hwpeqn(x)}}}"

    def _sqrt_plain(m):
        x = m.group(1)
        return f"SQRT {{{latex_to_hwpeqn(x)}}}"

    s = re.sub(r"\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", _sqrt_nth, s)
    s = re.sub(r"\\sqrt\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", _sqrt_plain, s)
    s = re.sub(r"\\sqrt\s*(\w)", lambda m: f"SQRT {{{m.group(1)}}}", s)
    return s


def _convert_leftright(s: str) -> str:
    pairs = [
        (r"\\left\s*\(", " LEFT ( "), (r"\\right\s*\)", " RIGHT ) "),
        (r"\\left\s*\[", " LEFT [ "), (r"\\right\s*\]", " RIGHT ] "),
        (r"\\left\s*\|", " LEFT | "), (r"\\right\s*\|", " RIGHT | "),
        (r"\\left\s*\\{", " LEFT lbrace "), (r"\\right\s*\\}", " RIGHT rbrace "),
        (r"\\left\s*\\lbrace", " LEFT lbrace "), (r"\\right\s*\\rbrace", " RIGHT rbrace "),
        (r"\\left\s*\\lfloor", " LEFT lfloor "), (r"\\right\s*\\rfloor", " RIGHT rfloor "),
        (r"\\left\s*\\lceil", " LEFT lceil "), (r"\\right\s*\\rceil", " RIGHT rceil "),
        (r"\\left\s*\\langle", " LEFT langle "), (r"\\right\s*\\rangle", " RIGHT rangle "),
        (r"\\left\s*\.", " "), (r"\\right\s*\.", " "),
    ]
    for pat, rep in pairs:
        s = re.sub(pat, rep, s)
    return s


def _convert_functions(s: str) -> str:
    s = re.sub(r"\\lim(?![a-zA-Z])", " lim ", s)
    s = re.sub(r"\\to\b", "->", s)
    s = re.sub(r"\\rightarrow\b", "->", s)
    s = re.sub(r"\\Rightarrow\b", "=>", s)
    s = re.sub(r"\\implies\b", "=>", s)
    s = re.sub(r"\\Leftarrow\b", "<=", s)
    s = re.sub(r"\\impliedby\b", "<=", s)
    s = re.sub(r"\\Leftrightarrow\b", "<=>", s)
    s = re.sub(r"\\iff\b", "<=>", s)
    s = re.sub(r"\\leftarrow\b", "<-", s)

    s = re.sub(r"\\sum(?![a-zA-Z])", " sum ", s)
    s = re.sub(r"\\prod(?![a-zA-Z])", " PROD ", s)
    s = re.sub(r"\\iiint(?![a-zA-Z])", " tint ", s)
    s = re.sub(r"\\iint(?![a-zA-Z])", " dint ", s)
    s = re.sub(r"\\oint(?![a-zA-Z])", " oint ", s)
    s = re.sub(r"\\int(?![a-zA-Z])", " int ", s)

    named_fns = ["log", "ln", "sin", "cos", "tan", "sec", "csc", "cot",
                 "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
                 "exp", "max", "min", "sup", "inf", "det", "dim", "ker",
                 "arg", "deg", "gcd", "hom", "mod"]
    for fn in named_fns:
        s = re.sub(rf"\\{fn}\b", fn, s)

    s = re.sub(r"\\mathcal\s*\{\s*L\s*\}", "LAPLACE", s)
    s = re.sub(r"\\mathcal\s*\{([^{}]*)\}", r"cal \1", s)
    s = re.sub(r"\\mathrm\{([^{}]*)\}", r"rm \1", s)
    s = re.sub(r"\\text\{([^{}]*)\}", r'"\1"', s)
    return s


def _convert_decorations(s: str) -> str:
    def _overline_repl(m):
        inner = m.group(1).strip()
        if re.fullmatch(r"[A-Z]{2,}", inner):
            return f"rm {{bar{{{inner}}}}}"
        return f"bar {{{inner}}}"

    s = re.sub(
        r"\\overline\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}",
        _overline_repl, s,
    )
    s = re.sub(r"\\bar\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", r"bar {\1}", s)

    dmap = {
        "underline": "under",
        "vec": "vec", "overrightarrow": "dyad", "hat": "hat",
        "widehat": "hat", "tilde": "tilde", "widetilde": "tilde",
        "dot": "dot", "ddot": "ddot", "acute": "acute",
        "grave": "grave", "check": "check", "breve": "arch",
    }
    for lc, hc in dmap.items():
        s = re.sub(rf"\\{lc}\s*\{{([^{{}}]*(?:\{{[^{{}}]*\}}[^{{}}]*)*)\}}", rf"{hc} {{\1}}", s)
        s = re.sub(rf"\\{lc}\s+(\w)", rf"{hc} \1", s)
    return s


def _convert_greek(s: str) -> str:
    greeks = [
        "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
        "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho",
        "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
        "varepsilon", "vartheta", "varpi", "varrho", "varsigma", "varphi",
        "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi",
        "Sigma", "Upsilon", "Phi", "Psi", "Omega",
    ]
    for g in greeks:
        s = re.sub(rf"\\{g}\b", f" {g} ", s)
    s = re.sub(r"\\infty\b", " inf ", s)
    s = re.sub(r"\\partial\b", " Partial ", s)
    s = re.sub(r"\\nabla\b", " nabla ", s)
    s = re.sub(r"\\ell\b", " ell ", s)
    return s


def _convert_operators(s: str) -> str:
    s = s.replace("\\times", " times ")
    s = s.replace("\\cdot", " cdot ")
    s = s.replace("\\div", " div ")
    s = s.replace("\\pm", " +- ")
    s = s.replace("\\mp", " -+ ")
    s = s.replace("\\leq", " <= ")
    s = re.sub(r"\\le\b", " <= ", s)
    s = s.replace("\\geq", " >= ")
    s = re.sub(r"\\ge\b", " >= ", s)
    s = s.replace("\\neq", " != ")
    s = re.sub(r"\\ne\b", " != ", s)
    s = s.replace("\\approx", " approx ")
    s = s.replace("\\equiv", " == ")
    s = s.replace("\\simeq", " simeq ")
    s = re.sub(r"\\sim\b", " sim ", s)
    s = s.replace("\\propto", " propto ")
    s = s.replace("\\ll", " << ")
    s = s.replace("\\gg", " >> ")
    s = s.replace("\\not=", " not = ")
    s = re.sub(r"\\not\b", " not ", s)
    return s


def _convert_symbols(s: str) -> str:
    syms = [
        ("\\notin", " notin "),
        ("\\subseteq", " subseteq "), ("\\supseteq", " supseteq "),
        ("\\subset", " subset "), ("\\supset", " supset "),
        ("\\cup", " CUP "), ("\\cap", " INTER "),
        ("\\setminus", " setminus "), ("\\emptyset", " emptyset "),
        ("\\varnothing", " emptyset "),
        ("\\forall", " forall "), ("\\exists", " exists "),
        ("\\neg", " neg "),
        ("\\mid", " | "), ("\\vert", " | "), ("\\lvert", " | "), ("\\rvert", " | "),
        ("\\nmid", " nmid "),
        ("\\lfloor", " lfloor "), ("\\rfloor", " rfloor "),
        ("\\lceil", " lceil "), ("\\rceil", " rceil "),
        ("\\langle", " langle "), ("\\rangle", " rangle "),
        ("\\therefore", " therefore "), ("\\because", " because "),
        ("\\angle", " angle "), ("\\triangle", " triangle "),
        ("\\cong", " cong "),
        ("\\perp", " BOT "), ("\\parallel", " parallel "),
        ("\\circ", " circ "), ("\\bullet", " bullet "),
        ("\\degree", " DEG "),
        ("\\ldots", " cdots "), ("\\cdots", " cdots "),
        ("\\vdots", " vdots "), ("\\ddots", " ddots "),
    ]
    for lx, hw in syms:
        s = s.replace(lx, hw)
    s = s.replace("\\{", " LEFT lbrace ")
    s = s.replace("\\}", " RIGHT rbrace ")
    s = re.sub(r"\\in\b", " in ", s)
    return s


def _convert_subsup(s: str) -> str:
    """_ → _{} 와 ^ → ^{} 를 HwpEqn 형식으로 변환"""
    s = re.sub(r"\^\s*\\circ\b", " DEG ", s)
    s = re.sub(r"\^\s*\{\\circ\}", " DEG ", s)
    s = re.sub(r"_\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", r" _{\1}", s)
    s = re.sub(r"_([a-zA-Z0-9])", r" _{\1}", s)
    s = re.sub(r"\^\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", r" ^{\1}", s)
    s = re.sub(r"\^([a-zA-Z0-9])", r" ^{\1}", s)
    s = s.replace("\\prime", " prime ")
    s = re.sub(r"'", " prime ", s)
    return s


def _convert_spaces(s: str) -> str:
    s = s.replace("\\,", "'")
    s = s.replace("\\;", "~")
    s = s.replace("\\:", "~")
    s = s.replace("\\!", "")
    s = s.replace("\\quad", "~~")
    s = s.replace("\\qquad", "~~~~")
    s = s.replace("\\ ", "~")
    return s


def _cleanup(s: str) -> str:
    s = re.sub(r"\\([a-zA-Z]+)", r"\1", s)
    s = re.sub(r"  +", " ", s)
    return s.strip()


def _extract_brace(s: str):
    """문자열 앞의 {…} 추출. 중첩 지원. (내용, 소비된 길이)."""
    t = s.lstrip()
    skip = len(s) - len(t)
    if not t or t[0] != "{":
        return None, 0
    depth = 0
    for i, ch in enumerate(t):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return t[1:i], skip + i + 1
    return None, 0


if __name__ == "__main__":
    tests = [
        (r"\frac{a}{b}", "{a} OVER {b}"),
        (r"\sqrt{x^2 + 1}", None),
        (r"\lim_{n \to \infty} \frac{a_n}{b_n}", None),
        (r"\sum_{k=1}^{n} a_k", None),
        (r"\int_{0}^{1} f(x)\,dx", None),
        (r"\overline{AB}", "bar {AB}"),
        (r"\vec{a} \cdot \vec{b}", None),
        (r"\begin{cases} x+1 & (x \geq 0) \\ -x & (x < 0) \end{cases}", None),
        (r"P(A \cup B)", "P(A UNION B)"),
        (r"\angle BAC", None),
        (r"f'(x) = 3x^2", None),
        (r"\displaystyle\lim_{n \to \infty} \frac{b}{a} = 24", None),
        (r"x^{n+1} + a_{n+1}", None),
        (r"\left| x - 1 \right|", None),
        (r"\binom{n}{r}", None),
    ]

    print("=== LaTeX -> HwpEqn Test ===\n")
    for latex_in, expected in tests:
        result = latex_to_hwpeqn(latex_in)
        if expected:
            status = "OK" if result == expected else "DIFF"
        else:
            status = "---"
        print(f"[{status}] {latex_in}")
        print(f"  -> {result}")
        if expected and status == "DIFF":
            print(f"  expected: {expected}")
        print()
