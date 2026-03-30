import sys
sys.path.insert(0, "scripts")
from markdown_parser import parse_markdown

test = r'수열 $\{a_n\}$이 양수이고 $\displaystyle\lim_{n \to \infty} a_n = 12$임을 알고 있습니다.'

tokens = parse_markdown(test)
for t in tokens:
    tp = t["type"]
    if tp == "text":
        print(f"  [TEXT] {repr(t['text'])}")
    elif tp == "inline_math":
        print(f"  [IMATH] {t['latex']}")
    elif tp in ("line_break", "paragraph_break"):
        print(f"  [{tp.upper()}]")
    else:
        print(f"  [{tp}] {t}")
