/**
 * 마크다운 파서 — Gemini 해설 마크다운을 토큰 배열로 분리.
 * Python scripts/markdown_parser.py 의 TypeScript 이식.
 */

export type TokenType =
  | "text" | "bold" | "inline_math" | "display_math"
  | "heading" | "list_item" | "blockquote" | "horizontal_rule"
  | "paragraph_break" | "line_break" | "code";

export interface MdToken {
  type: TokenType;
  text?: string;
  latex?: string;
  level?: number;
  children?: MdToken[];
}

const RE_INLINE_MATH = /\$(?!\$)((?:[^$\n\\]|\\.)+?)\$/g;
const UNICODE_JUNK = /[\u2066-\u2069\u200e\u200f\u202a-\u202e\u200b-\u200d\ufeff\u00ad]/g;

export function parseMarkdown(md: string): MdToken[] {
  md = wrapNakedLatex(md);
  md = convertSlashFractions(md);
  const tokens: MdToken[] = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      if (tokens.length > 0 && tokens[tokens.length - 1]?.type !== "paragraph_break") {
        tokens.push({ type: "paragraph_break" });
      }
      i++;
      continue;
    }

    if (line.trim().startsWith("```")) {
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) i++;
      if (i < lines.length) i++;
      continue;
    }

    if (line.trim().startsWith("$$")) {
      const mathLines = [line.trim().slice(2)];
      if (mathLines[0].includes("$$") && mathLines[0].indexOf("$$") > 0) {
        const inner = mathLines[0].slice(0, mathLines[0].indexOf("$$"));
        tokens.push({ type: "display_math", latex: inner.trim() });
        i++;
        continue;
      }
      i++;
      while (i < lines.length) {
        if (lines[i].includes("$$")) {
          const before = lines[i].split("$$")[0];
          if (before.trim()) mathLines.push(before.trim());
          i++;
          break;
        }
        mathLines.push(lines[i]);
        i++;
      }
      const latex = mathLines.join("\n").trim();
      if (latex) tokens.push({ type: "display_math", latex });
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim().replace(/\*\*(.+?)\*\*/g, "$1");
      tokens.push({ type: "heading", level, text });
      i++;
      continue;
    }

    const boldHeading = line.trim().match(/^\*\*(.+)\*\*\s*$/);
    if (boldHeading && boldHeading[1].length < 60) {
      tokens.push({ type: "heading", level: 3, text: boldHeading[1] });
      i++;
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      tokens.push({ type: "horizontal_rule" });
      i++;
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const content = listMatch[3];
      tokens.push({ type: "list_item", level: Math.floor(indent / 2), children: parseInline(content) });
      i++;
      continue;
    }

    const quoteMatch = line.match(/^>\s*(.*)$/);
    if (quoteMatch) {
      tokens.push({ type: "blockquote", children: parseInline(quoteMatch[1]) });
      i++;
      continue;
    }

    tokens.push(...parseInline(line));
    tokens.push({ type: "line_break" });
    i++;
  }

  while (tokens.length > 0 && (tokens[tokens.length - 1].type === "paragraph_break" || tokens[tokens.length - 1].type === "line_break")) {
    tokens.pop();
  }

  return tokens;
}

function parseInline(text: string): MdToken[] {
  const tokens: MdToken[] = [];
  const mathMap = new Map<string, string>();
  let counter = 0;
  const PH = "\uE020";

  let safe = text.replace(RE_INLINE_MATH, (_m, latex: string) => {
    const cleaned = latex.replace(UNICODE_JUNK, "").replace(/\\displaystyle/g, "").trim();
    const key = `${PH}${counter}${PH}`;
    mathMap.set(key, cleaned);
    counter++;
    return key;
  });

  const pattern = /(\*\*(?:[^*]|\*(?!\*))+?\*\*)|(`[^`]+?`)/g;
  let lastEnd = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(safe)) !== null) {
    if (m.index > lastEnd) {
      expandMath(tokens, safe.slice(lastEnd, m.index), mathMap);
    }

    if (m[1]) {
      const boldInner = m[1].slice(2, -2);
      const children: MdToken[] = [];
      expandMath(children, boldInner, mathMap);
      tokens.push({ type: "bold", children });
    } else if (m[2]) {
      tokens.push({ type: "code", text: m[2].slice(1, -1) });
    }

    lastEnd = m.index + m[0].length;
  }

  if (lastEnd < safe.length) {
    expandMath(tokens, safe.slice(lastEnd), mathMap);
  }

  return tokens;
}

function expandMath(tokens: MdToken[], text: string, mathMap: Map<string, string>): void {
  const PH = "\uE020";
  if (!text.includes(PH)) {
    if (text) tokens.push({ type: "text", text });
    return;
  }
  const parts = text.split(new RegExp(`(${PH}\\d+${PH})`));
  for (const part of parts) {
    if (!part) continue;
    if (mathMap.has(part)) {
      tokens.push({ type: "inline_math", latex: mathMap.get(part)! });
    } else {
      tokens.push({ type: "text", text: part });
    }
  }
}

function wrapNakedLatex(text: string): string {
  const safeParts: string[] = [];
  const PH = "\uE030";
  let ctr = 0;

  let out = text.replace(/\$\$[\s\S]+?\$\$/g, (m) => {
    const key = `${PH}${ctr}${PH}`;
    safeParts.push(m);
    ctr++;
    return key;
  });
  out = out.replace(/\$(?:[^$\n\\]|\\.)+?\$/g, (m) => {
    const key = `${PH}${ctr}${PH}`;
    safeParts.push(m);
    ctr++;
    return key;
  });

  const CMDS = /\\(?:displaystyle\s*\\?)?(?:frac|dfrac|tfrac|sqrt|sum|prod|lim|int|oint|binom|dbinom)/;

  const resultParts: string[] = [];
  let i = 0;
  while (i < out.length) {
    const m = out.slice(i).match(CMDS);
    if (m && m.index === 0) {
      const exprEnd = grabLatex(out, i + m[0].length);
      const latexExpr = out.slice(i, exprEnd).trim();
      resultParts.push(`$${latexExpr}$`);
      i = exprEnd;
    } else {
      resultParts.push(out[i]);
      i++;
    }
  }
  out = resultParts.join("");

  for (let idx = 0; idx < safeParts.length; idx++) {
    out = out.replace(`${PH}${idx}${PH}`, safeParts[idx]);
  }
  return out;
}

function grabLatex(text: string, start: number): number {
  let j = start;
  while (j < text.length) {
    if (text[j] === "{") {
      let depth = 1;
      j++;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
    } else if (text[j] === "^" || text[j] === "_") {
      j++;
      if (j < text.length && text[j] === "{") {
        let depth = 1;
        j++;
        while (j < text.length && depth > 0) {
          if (text[j] === "{") depth++;
          else if (text[j] === "}") depth--;
          j++;
        }
      } else if (j < text.length && (/[a-zA-Z0-9]/.test(text[j]) || text[j] === "\\")) {
        j++;
      }
    } else if (text[j] === "\\" && j + 1 < text.length && /[a-zA-Z]/.test(text[j + 1])) {
      const cmdMatch = text.slice(j).match(/^\\[a-zA-Z]+/);
      if (cmdMatch) j += cmdMatch[0].length;
      else break;
    } else if (" \t".includes(text[j]) && j + 1 < text.length && "\\{^_".includes(text[j + 1])) {
      j++;
    } else if ("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+-*/=.,()[]|!<>':; ".includes(text[j])) {
      let peek = j + 1;
      while (peek < text.length && " \t".includes(text[peek])) peek++;
      if (peek < text.length && "\\{^_$".includes(text[peek])) j++;
      else break;
    } else {
      break;
    }
  }
  return j;
}

function convertSlashFractions(md: string): string {
  function convInner(latex: string): string {
    if (!latex.includes("/")) return latex;
    const safeParts: string[] = [];
    let s = latex.replace(/\\(?:d?frac|tfrac)\s*\{[^}]*\}\s*\{[^}]*\}/g, (m) => {
      safeParts.push(m);
      return `\uE050${safeParts.length - 1}\uE050`;
    });
    s = s.replace(/\{([^}]+)\}\s*\/\s*\{([^}]+)\}/g, "\\frac{$1}{$2}");
    s = s.replace(
      /(-?)((?:\d+|[a-zA-Z]|\([^)]+\)))\s*\/\s*(-?)((?:\d+|[a-zA-Z]|\([^)]+\)))/g,
      (_m, negNum, num, negDen, den) => {
        const sign = (negNum === "-" ? "-" : "") + (negDen === "-" ? "-" : "");
        return `${sign}\\frac{${num}}{${den}}`;
      },
    );
    for (let i = 0; i < safeParts.length; i++) {
      s = s.replace(`\uE050${i}\uE050`, safeParts[i]);
    }
    return s;
  }

  md = md.replace(/\$\$([\s\S]+?)\$\$/g, (match, inner: string) => {
    const converted = convInner(inner);
    return converted === inner ? match : `$$${converted}$$`;
  });
  md = md.replace(/\$(?!\$)((?:[^$\n\\]|\\.)+?)\$/g, (match, inner: string) => {
    const converted = convInner(inner);
    return converted === inner ? match : `$${converted}$`;
  });
  return md;
}
