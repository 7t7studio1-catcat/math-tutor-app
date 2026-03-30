/**
 * LaTeX → HwpEqn 규칙 기반 변환기 (Python scripts/latex_to_hwpeqn.py 이식)
 *
 * Gemini AI 변환의 폴백 또는 대체로 사용.
 * 프롬프트 비용 없이 빠르고 결정적인 변환을 제공.
 */

const UNICODE_JUNK = /[\u2066-\u2069\u200e\u200f\u202a-\u202e\u200b-\u200d\ufeff\u00ad\u200a\u2009\u2008\u2007]/g;

export function latexToHwpEqn(latex: string): string {
  let s = latex.replace(UNICODE_JUNK, "").trim();
  s = s.replace(/\\displaystyle/g, "").trim();
  s = convertBold(s);
  s = convertEnvironments(s);
  s = convertFracBinom(s);
  s = convertSqrt(s);
  s = convertLeftRight(s);
  s = convertFunctions(s);
  s = convertDecorations(s);
  s = convertGreek(s);
  s = convertOperators(s);
  s = convertSymbols(s);
  s = convertSubSup(s);
  s = convertSpaces(s);
  s = cleanup(s);
  return s.trim();
}

function extractBrace(s: string): [string | null, number] {
  const t = s.replace(/^\s+/, "");
  const skip = s.length - t.length;
  if (!t || t[0] !== "{") return [null, 0];
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "{") depth++;
    else if (t[i] === "}") {
      depth--;
      if (depth === 0) return [t.slice(1, i), skip + i + 1];
    }
  }
  return [null, 0];
}

function replaceTwoArgCmd(s: string, cmd: string, operator: string): string {
  const prefix = "\\" + cmd;
  for (;;) {
    const idx = s.indexOf(prefix);
    if (idx === -1) break;
    const after = s.slice(idx + prefix.length);
    if (after && /[a-zA-Z]/.test(after[0])) break;
    const [arg1, end1] = extractBrace(after);
    if (arg1 === null) break;
    const [arg2, end2] = extractBrace(after.slice(end1));
    if (arg2 === null) break;
    const conv1 = latexToHwpEqn(arg1);
    const conv2 = latexToHwpEqn(arg2);
    s = s.slice(0, idx) + `{${conv1}} ${operator} {${conv2}}` + after.slice(end1 + end2);
  }
  return s;
}

function convertBold(s: string): string {
  for (const cmd of ["mathbf", "boldsymbol", "bm", "textbf"]) {
    s = s.replace(
      new RegExp(`\\\\${cmd}\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`, "g"),
      (_m, content: string) => {
        const c = content.trim();
        if (c.length === 1 && /[a-z]/.test(c)) return `{rmbold${c}}`;
        if (c.length === 1 && /[A-Z]/.test(c)) return `{rm bold${c}}`;
        return `rm {bold{${c}}} it`;
      },
    );
  }
  return s;
}

function convertEnvironments(s: string): string {
  s = s.replace(
    /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g,
    (_m, body: string) => {
      const b = body.replace(/\\\\/g, " # ").replace(/&/g, " & ").trim();
      return `{cases{${b}}}`;
    },
  );
  const envs: [string, string][] = [
    ["pmatrix", "pmatrix"], ["bmatrix", "bmatrix"],
    ["vmatrix", "dmatrix"], ["matrix", "matrix"],
  ];
  for (const [env, cmd] of envs) {
    s = s.replace(
      new RegExp(`\\\\begin\\{${env}\\}([\\s\\S]*?)\\\\end\\{${env}\\}`, "g"),
      (_m, body: string) => {
        const b = body.replace(/\\\\/g, " # ").replace(/&/g, " & ").trim();
        return `{${cmd}{${b}}}`;
      },
    );
  }
  return s;
}

function convertFracBinom(s: string): string {
  for (const [cmd, op] of [["dfrac", "OVER"], ["tfrac", "OVER"], ["frac", "OVER"],
    ["dbinom", "CHOOSE"], ["binom", "CHOOSE"]] as const) {
    s = replaceTwoArgCmd(s, cmd, op);
  }
  return s;
}

function convertSqrt(s: string): string {
  s = s.replace(
    /\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (_m, n: string, x: string) => `root {${latexToHwpEqn(n)}} of {${latexToHwpEqn(x)}}`,
  );
  s = s.replace(
    /\\sqrt\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (_m, x: string) => `SQRT {${latexToHwpEqn(x)}}`,
  );
  s = s.replace(/\\sqrt\s*(\w)/g, (_m, c: string) => `SQRT {${c}}`);
  return s;
}

function convertLeftRight(s: string): string {
  const pairs: [RegExp, string][] = [
    [/\\left\s*\(/g, " LEFT ( "], [/\\right\s*\)/g, " RIGHT ) "],
    [/\\left\s*\[/g, " LEFT [ "], [/\\right\s*\]/g, " RIGHT ] "],
    [/\\left\s*\|/g, " LEFT | "], [/\\right\s*\|/g, " RIGHT | "],
    [/\\left\s*\\{/g, " LEFT lbrace "], [/\\right\s*\\}/g, " RIGHT rbrace "],
    [/\\left\s*\\lbrace/g, " LEFT lbrace "], [/\\right\s*\\rbrace/g, " RIGHT rbrace "],
    [/\\left\s*\\lfloor/g, " LEFT lfloor "], [/\\right\s*\\rfloor/g, " RIGHT rfloor "],
    [/\\left\s*\\lceil/g, " LEFT lceil "], [/\\right\s*\\rceil/g, " RIGHT rceil "],
    [/\\left\s*\\langle/g, " LEFT langle "], [/\\right\s*\\rangle/g, " RIGHT rangle "],
    [/\\left\s*\./g, " "], [/\\right\s*\./g, " "],
  ];
  for (const [pat, rep] of pairs) s = s.replace(pat, rep);
  return s;
}

function convertFunctions(s: string): string {
  s = s.replace(/\\lim(?![a-zA-Z])/g, " lim ");
  s = s.replace(/\\to\b/g, "->");
  s = s.replace(/\\rightarrow\b/g, "->");
  s = s.replace(/\\Rightarrow\b/g, "=>");
  s = s.replace(/\\implies\b/g, "=>");
  s = s.replace(/\\Leftarrow\b/g, "<=");
  s = s.replace(/\\Leftrightarrow\b/g, "<=>");
  s = s.replace(/\\iff\b/g, "<=>");
  s = s.replace(/\\leftarrow\b/g, "<-");
  s = s.replace(/\\sum(?![a-zA-Z])/g, " sum ");
  s = s.replace(/\\prod(?![a-zA-Z])/g, " PROD ");
  s = s.replace(/\\iiint(?![a-zA-Z])/g, " tint ");
  s = s.replace(/\\iint(?![a-zA-Z])/g, " dint ");
  s = s.replace(/\\oint(?![a-zA-Z])/g, " oint ");
  s = s.replace(/\\int(?![a-zA-Z])/g, " int ");

  const fns = [
    "log", "ln", "sin", "cos", "tan", "sec", "csc", "cot",
    "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
    "exp", "max", "min", "sup", "inf", "det", "dim", "ker",
    "arg", "deg", "gcd", "hom", "mod",
  ];
  for (const fn of fns) s = s.replace(new RegExp(`\\\\${fn}\\b`, "g"), fn);

  s = s.replace(/\\mathrm\{([^{}]*)\}/g, "rm $1");
  s = s.replace(/\\text\{([^{}]*)\}/g, '"$1"');
  return s;
}

function convertDecorations(s: string): string {
  s = s.replace(
    /\\overline\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (_m, inner: string) => {
      const c = inner.trim();
      if (/^[A-Z]{2,}$/.test(c)) return `rm {bar{${c}}}`;
      return `bar {${c}}`;
    },
  );
  s = s.replace(/\\bar\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, "bar {$1}");
  const dmap: [string, string][] = [
    ["underline", "under"], ["vec", "vec"], ["overrightarrow", "dyad"],
    ["hat", "hat"], ["widehat", "hat"], ["tilde", "tilde"], ["widetilde", "tilde"],
    ["dot", "dot"], ["ddot", "ddot"], ["acute", "acute"],
    ["grave", "grave"], ["check", "check"], ["breve", "arch"],
  ];
  for (const [lc, hc] of dmap) {
    s = s.replace(new RegExp(`\\\\${lc}\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`, "g"), `${hc} {$1}`);
    s = s.replace(new RegExp(`\\\\${lc}\\s+(\\w)`, "g"), `${hc} $1`);
  }
  return s;
}

function convertGreek(s: string): string {
  const greeks = [
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
    "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho",
    "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
    "varepsilon", "vartheta", "varpi", "varrho", "varsigma", "varphi",
    "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi",
    "Sigma", "Upsilon", "Phi", "Psi", "Omega",
  ];
  for (const g of greeks) s = s.replace(new RegExp(`\\\\${g}\\b`, "g"), ` ${g} `);
  s = s.replace(/\\infty\b/g, " inf ");
  s = s.replace(/\\partial\b/g, " Partial ");
  s = s.replace(/\\nabla\b/g, " nabla ");
  s = s.replace(/\\ell\b/g, " ell ");
  return s;
}

function convertOperators(s: string): string {
  const ops: [string | RegExp, string][] = [
    ["\\times", " times "], ["\\cdot", " cdot "], ["\\div", " div "],
    ["\\pm", " +- "], ["\\mp", " -+ "],
    ["\\leq", " <= "], ["\\geq", " >= "],
    ["\\neq", " != "], ["\\approx", " approx "],
    ["\\equiv", " == "], ["\\simeq", " simeq "],
    ["\\propto", " propto "], ["\\ll", " << "], ["\\gg", " >> "],
    ["\\not=", " not = "],
  ];
  for (const [from, to] of ops) {
    if (typeof from === "string") s = s.split(from).join(to);
    else s = s.replace(from, to);
  }
  s = s.replace(/\\le\b/g, " <= ");
  s = s.replace(/\\ge\b/g, " >= ");
  s = s.replace(/\\ne\b/g, " != ");
  s = s.replace(/\\sim\b/g, " sim ");
  s = s.replace(/\\not\b/g, " not ");
  return s;
}

function convertSymbols(s: string): string {
  const syms: [string, string][] = [
    ["\\notin", " notin "], ["\\subseteq", " subseteq "], ["\\supseteq", " supseteq "],
    ["\\subset", " subset "], ["\\supset", " supset "],
    ["\\cup", " CUP "], ["\\cap", " INTER "],
    ["\\setminus", " setminus "], ["\\emptyset", " emptyset "],
    ["\\varnothing", " emptyset "],
    ["\\forall", " forall "], ["\\exists", " exists "], ["\\neg", " neg "],
    ["\\mid", " | "], ["\\vert", " | "], ["\\lvert", " | "], ["\\rvert", " | "],
    ["\\nmid", " nmid "],
    ["\\lfloor", " lfloor "], ["\\rfloor", " rfloor "],
    ["\\lceil", " lceil "], ["\\rceil", " rceil "],
    ["\\langle", " langle "], ["\\rangle", " rangle "],
    ["\\therefore", " therefore "], ["\\because", " because "],
    ["\\angle", " angle "], ["\\triangle", " triangle "],
    ["\\cong", " cong "], ["\\perp", " BOT "], ["\\parallel", " parallel "],
    ["\\circ", " circ "], ["\\bullet", " bullet "], ["\\degree", " DEG "],
    ["\\ldots", " cdots "], ["\\cdots", " cdots "],
    ["\\vdots", " vdots "], ["\\ddots", " ddots "],
  ];
  for (const [lx, hw] of syms) s = s.split(lx).join(hw);
  s = s.split("\\{").join(" LEFT lbrace ");
  s = s.split("\\}").join(" RIGHT rbrace ");
  s = s.replace(/\\in\b/g, " in ");
  return s;
}

function convertSubSup(s: string): string {
  s = s.replace(/\^\s*\\circ\b/g, " DEG ");
  s = s.replace(/\^\s*\{\\circ\}/g, " DEG ");
  s = s.replace(/_\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, " _{$1}");
  s = s.replace(/_([a-zA-Z0-9])/g, " _{$1}");
  s = s.replace(/\^\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, " ^{$1}");
  s = s.replace(/\^([a-zA-Z0-9])/g, " ^{$1}");
  s = s.replace(/\\prime/g, " prime ");
  s = s.replace(/'/g, " prime ");
  return s;
}

function convertSpaces(s: string): string {
  s = s.split("\\,").join("'");
  s = s.split("\\;").join("~");
  s = s.split("\\:").join("~");
  s = s.split("\\!").join("");
  s = s.split("\\quad").join("~~");
  s = s.split("\\qquad").join("~~~~");
  s = s.split("\\ ").join("~");
  return s;
}

function cleanup(s: string): string {
  s = s.replace(/\\([a-zA-Z]+)/g, "$1");
  s = s.replace(/ {2,}/g, " ");
  return s.trim();
}
