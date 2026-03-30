/**
 * 수학 마크다운 전처리 — 모든 렌더링 경로에서 공유
 *
 * 핵심: remark-math 파서에 의존하지 않고, KaTeX.renderToString 으로
 * 마크다운 파싱 **전에** 모든 $...$ / $$...$$ 를 HTML 로 선렌더링한다.
 * 이렇게 하면 한글 인접, bold 중첩, 따옴표 내부 등 어떤 맥락에서든
 * 수식이 100 % 렌더링된다.
 */

import katex from "katex";

/* ── 인라인 수식 매칭 정규식 (공유) ──────────────────────────── */
// 수학 전용 앱이므로 $는 항상 수식 delimiter.
// 공백 제약((?!\s), (?<!\s))을 제거하여 AI가 $ 안에 공백을 넣어도 매칭.
const RE_INLINE = /\$(?!\$)((?:[^$\n\\]|\\.)+?)\$/g;
const RE_DISPLAY = /\$\$([\s\S]+?)\$\$/g;

export function fixMidNotation(text: string): string {
  return text.replace(
    RE_INLINE,
    (match, inner: string) => {
      if (!inner.includes("\\mid")) return match;
      return match.replace(/\\mid\b/g, "\\mathrel{|}");
    }
  ).replace(
    RE_DISPLAY,
    (match, inner: string) => {
      if (!inner.includes("\\mid")) return match;
      return match.replace(/\\mid\b/g, "\\mathrel{|}");
    }
  );
}

export function injectDisplayStyle(text: string): string {
  const DISPLAY_CMDS = /\\(?:frac|dfrac|lim|sum|prod|int|iint|iiint|oint|binom|tbinom|dbinom)/;
  return text.replace(
    RE_INLINE,
    (match, inner: string) => {
      if (!DISPLAY_CMDS.test(inner)) return match;
      if (inner.trimStart().startsWith("\\displaystyle")) return match;
      return `$\\displaystyle ${inner}$`;
    }
  );
}

/**
 * $...$ 및 $$...$$ 내부의 a/b 슬래시 분수를 \frac{a}{b}로 변환.
 * 이미 \frac 안에 있는 슬래시는 건드리지 않음.
 */
export function convertSlashFractions(text: string): string {
  function convertInner(latex: string): string {
    if (!latex.includes("/")) return latex;
    // 이미 \frac이 있는 부분은 보호
    const safeParts: string[] = [];
    let safe = latex.replace(/\\(?:d?frac|tfrac)\s*\{[^}]*\}\s*\{[^}]*\}/g, (m) => {
      safeParts.push(m);
      return `\uE040${safeParts.length - 1}\uE040`;
    });

    // {expr}/{expr} → \frac{expr}{expr}
    safe = safe.replace(
      /\{([^}]+)\}\s*\/\s*\{([^}]+)\}/g,
      "\\frac{$1}{$2}",
    );
    // (digits or single-letter or group) / (digits or single-letter or group)
    // 음수인 경우 마이너스를 분수 바깥으로: -2/3 → -\frac{2}{3}
    safe = safe.replace(
      /(-?)((?:\d+|[a-zA-Z]|\([^)]+\)))\s*\/\s*(-?)((?:\d+|[a-zA-Z]|\([^)]+\)))/g,
      (_m, negNum, num, negDen, den) => {
        const sign = (negNum === "-" ? "-" : "") + (negDen === "-" ? "-" : "");
        return `${sign}\\frac{${num}}{${den}}`;
      },
    );

    // 보호 해제
    safe = safe.replace(/\uE040(\d+)\uE040/g, (_, i) => safeParts[parseInt(i)]);
    return safe;
  }

  // display math $$...$$
  text = text.replace(RE_DISPLAY, (match, inner: string) => {
    const converted = convertInner(inner);
    return converted === inner ? match : `$$${converted}$$`;
  });

  // inline math $...$
  text = text.replace(RE_INLINE, (match, inner: string) => {
    const converted = convertInner(inner);
    return converted === inner ? match : `$${converted}$`;
  });

  return text;
}

const KATEX_OPTS_INLINE: katex.KatexOptions = {
  displayMode: false,
  throwOnError: false,
  strict: false,
  minRuleThickness: 0.08,
};
const KATEX_OPTS_DISPLAY: katex.KatexOptions = {
  displayMode: true,
  throwOnError: false,
  strict: false,
  minRuleThickness: 0.08,
};

/**
 * 모든 $...$ / $$...$$ 를 KaTeX HTML 로 변환한다.
 * 이후 ReactMarkdown 에는 remarkMath / rehypeKatex 대신 rehypeRaw 만 사용.
 */
export function preRenderMath(text: string): string {
  // 1) 디스플레이 수식 $$...$$ 먼저 (더 긴 delimiter 우선)
  text = text.replace(RE_DISPLAY, (_match, latex: string) => {
    try {
      return katex.renderToString(latex.trim(), KATEX_OPTS_DISPLAY);
    } catch {
      return _match;
    }
  });

  // 2) 인라인 수식 $...$
  text = text.replace(RE_INLINE, (_match, latex: string) => {
    try {
      return katex.renderToString(latex.trim(), KATEX_OPTS_INLINE);
    } catch {
      return _match;
    }
  });

  return text;
}

export function widenChoices(text: string): string {
  return text.replace(
    /([①②③④⑤⑥⑦⑧⑨⑩])\s*/g,
    "\u2003$1\u2002"
  );
}

export function collapseBlankLines(text: string): string {
  return text.replace(/\n{4,}/g, "\n\n\n");
}

export function stylePartHeaders(text: string): string {
  return text
    .replace(/^파트\s*1[::]\s*(.+)$/gm, "---\n\n## 문제\n")
    .replace(/^파트\s*2[::]\s*(.+)$/gm, "---\n\n## 정답 및 풀이\n")
    .replace(/^아래에\s.*작성.*$/gm, "")
    .replace(/^모든 문제를 먼저.*$/gm, "")
    .replace(/^그 뒤에 정답과 풀이를.*$/gm, "")
    .replace(/^\(이하 동일.*\)$/gm, "")
    .replace(/^\(모든 문제를 나열.*\)$/gm, "")
    .replace(/^\[?동일한 형식\]?$/gm, "");
}
