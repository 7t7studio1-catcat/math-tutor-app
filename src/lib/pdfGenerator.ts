"use client";

/**
 * PDF 생성 — 메인 스레드에서 파싱, Worker에서 렌더링
 *
 * 파싱(마크다운→블록): 메인 스레드 (TypeScript, 디버깅 가능, <1ms)
 * 렌더링(블록→PDF): Web Worker (별도 스레드, UI 영향 없음)
 */

// ── 타입 ─────────────────────────────────────────────────────────────────────

export interface SectionData {
  num: "01" | "02" | "03" | "04";
  title: string;
  content: string;
  color: [number, number, number];
}

export interface ProblemData {
  num: number;
  sections: SectionData[];
}

// Worker에 보내는 직렬화된 블록
export type PdfBlock =
  | { k: "h"; lv: number; t: string }
  | { k: "p"; t: string }
  | { k: "m"; t: string }
  | { k: "hr" }
  | { k: "li"; ord: boolean; items: string[] }
  | { k: "label"; label: string; color: string; t: string }
  | { k: "step"; label: string; t: string };

export interface PdfSection {
  num: string;
  title: string;
  color: [number, number, number];
  blocks: PdfBlock[];
}

export interface PdfProblem {
  num: number;
  sections: PdfSection[];
}

// ── LaTeX → 유니코드 (메인 스레드에서 실행) ─────────────────────────────────

function tex(s: string): string {
  s = s.trim();
  s = s.replace(/\\text\s*\{([^{}]+)\}/g, "$1");
  s = s.replace(/\\mathrm\s*\{([^{}]+)\}/g, "$1");
  for (let i = 0; i < 4; i++)
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1/$2)");
  s = s.replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]+)\}/g, "$1√($2)");
  s = s.replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)");
  s = s.replace(/\\sqrt\b/g, "√");
  s = s.replace(/\^\{([^{}]+)\}/g, "^($1)");
  const sups: [RegExp, string][] = [[/\^0\b/g,"⁰"],[/\^1\b/g,"¹"],[/\^2\b/g,"²"],[/\^3\b/g,"³"],[/\^4\b/g,"⁴"],[/\^5\b/g,"⁵"],[/\^6\b/g,"⁶"],[/\^7\b/g,"⁷"],[/\^8\b/g,"⁸"],[/\^9\b/g,"⁹"],[/\^n\b/g,"ⁿ"]];
  for (const [r,v] of sups) s = s.replace(r, v);
  s = s.replace(/_\{([^{}]+)\}/g, "_($1)");
  s = s.replace(/_([a-zA-Z0-9])/g, "_$1");
  s = s.replace(/\\lim_\{([^{}]+)\}/g, "lim_($1) ");
  s = s.replace(/\\lim\b/g, "lim");
  s = s.replace(/\\sum_\{([^{}]+)\}\^\{([^{}]+)\}/g, "Σ_($1)^($2) ");
  s = s.replace(/\\int_\{([^{}]+)\}\^\{([^{}]+)\}/g, "∫_($1)^($2) ");
  s = s.replace(/\\sum\b/g, "Σ"); s = s.replace(/\\int\b/g, "∫"); s = s.replace(/\\prod\b/g, "Π");
  const G: Record<string,string> = {alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ε",zeta:"ζ",eta:"η",theta:"θ",iota:"ι",kappa:"κ",lambda:"λ",mu:"μ",nu:"ν",xi:"ξ",pi:"π",rho:"ρ",sigma:"σ",tau:"τ",phi:"φ",chi:"χ",psi:"ψ",omega:"ω",Gamma:"Γ",Delta:"Δ",Theta:"Θ",Lambda:"Λ",Xi:"Ξ",Pi:"Π",Sigma:"Σ",Phi:"Φ",Psi:"Ψ",Omega:"Ω",varepsilon:"ε",varphi:"φ"};
  for (const [n,c] of Object.entries(G)) s = s.replace(new RegExp(`\\\\${n}(?![a-zA-Z])`,"g"), c);
  const ops: [RegExp,string][] = [[/\\times\b/g,"×"],[/\\div\b/g,"÷"],[/\\pm\b/g,"±"],[/\\mp\b/g,"∓"],[/\\cdot\b/g,"·"],[/\\cdots\b/g,"⋯"],[/\\ldots\b/g,"…"],[/\\circ\b/g,"∘"],[/\\infty\b/g,"∞"],[/\\partial\b/g,"∂"],[/\\leq?\b/g,"≤"],[/\\geq?\b/g,"≥"],[/\\neq?\b/g,"≠"],[/\\approx\b/g,"≈"],[/\\equiv\b/g,"≡"],[/\\sim\b/g,"∼"],[/\\mid\b/g,"|"],[/\\nmid\b/g,"∤"],[/\\vert\b/g,"|"],[/\\lfloor\b/g,"⌊"],[/\\rfloor\b/g,"⌋"],[/\\lceil\b/g,"⌈"],[/\\rceil\b/g,"⌉"],[/\\in\b/g,"∈"],[/\\notin\b/g,"∉"],[/\\subset\b/g,"⊂"],[/\\supset\b/g,"⊃"],[/\\cup\b/g,"∪"],[/\\cap\b/g,"∩"],[/\\emptyset\b/g,"∅"],[/\\Rightarrow\b/g,"⇒"],[/\\Leftarrow\b/g,"⇐"],[/\\Leftrightarrow\b/g,"⟺"],[/\\rightarrow\b|\\to\b/g,"→"],[/\\leftarrow\b/g,"←"],[/\\leftrightarrow\b/g,"↔"],[/\\because\b/g,"∵"],[/\\therefore\b/g,"∴"],[/\\forall\b/g,"∀"],[/\\exists\b/g,"∃"],[/\\neg\b/g,"¬"],[/\\perp\b/g,"⊥"],[/\\parallel\b/g,"∥"],[/\\angle\b/g,"∠"],[/\\triangle\b/g,"△"],[/\\log\b/g,"log"],[/\\ln\b/g,"ln"],[/\\exp\b/g,"exp"],[/\\sin\b/g,"sin"],[/\\cos\b/g,"cos"],[/\\tan\b/g,"tan"],[/\\sec\b/g,"sec"],[/\\csc\b/g,"csc"],[/\\cot\b/g,"cot"],[/\\max\b/g,"max"],[/\\min\b/g,"min"],[/\\overrightarrow\{([^{}]+)\}/g,"$1→"],[/\\vec\{([^{}]+)\}/g,"$1⃗"],[/\\overline\{([^{}]+)\}/g,"$1̄"],[/\\hat\{([^{}]+)\}/g,"$1̂"]];
  for (const [r,v] of ops) s = s.replace(r, v);
  s = s.replace(/\\left\s*([(\[|{.])/g, "$1");
  s = s.replace(/\\right\s*([)\]|}.])/g, "$1");
  s = s.replace(/\\left\./g, ""); s = s.replace(/\\right\./g, "");
  s = s.replace(/\\\{/g, "{"); s = s.replace(/\\\}/g, "}");
  s = s.replace(/\\begin\{cases\}/g, "{ "); s = s.replace(/\\end\{cases\}/g, " }");
  s = s.replace(/\\\\/g, " ; "); s = s.replace(/&/g, " ");
  s = s.replace(/\{/g, "(").replace(/\}/g, ")");
  s = s.replace(/\\[a-zA-Z]+/g, "");
  s = s.replace(/\$/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function plain(t: string): string {
  // $$ 블록 처리
  let result = "";
  let pos = 0;
  while (pos < t.length) {
    const ddStart = t.indexOf("$$", pos);
    if (ddStart === -1) { result += t.slice(pos); break; }
    result += t.slice(pos, ddStart);
    const ddEnd = t.indexOf("$$", ddStart + 2);
    if (ddEnd === -1) { result += t.slice(ddStart); break; }
    result += tex(t.slice(ddStart + 2, ddEnd));
    pos = ddEnd + 2;
  }
  t = result;
  // $ 인라인 수식
  t = t.replace(/\$([^$\n]+?)\$/g, (_, m) => tex(m));
  t = t.replace(/\$/g, "");
  // 볼드 제거
  t = t.replace(/\*\*(.*?)\*\*/g, "$1");
  t = t.replace(/\*([^*\n]+?)\*/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  return t.replace(/\s+/g, " ").trim();
}

// ── 파서 (메인 스레드, TypeScript) ──────────────────────────────────────────

const LABELS: Record<string, string> = {
  "[급소]":"#7c3aed","[출제 의도]":"#7c3aed","[첫 수]":"#7c3aed",
  "[개념 지도]":"#2563eb","[다른 풀이]":"#d97706","[자기 검증]":"#d97706","[변형 대비]":"#d97706",
  "[핵심 관찰]":"#ea580c","[계산]":"#78716c","[✅ 답]":"#059669","[KEY]":"#d97706",
};

function parseContent(raw: string): PdfBlock[] {
  // 전처리
  let md = raw.replace(/^#{1,3}\s+(?:STEP|Section)\s*\d+[^\n]*/gmi, "");

  // 여러 줄 $...$ → 한 줄
  const r: string[] = [];
  let inInline = false;
  for (let i = 0; i < md.length; i++) {
    const c = md[i];
    if (c === "$" && md[i + 1] === "$") { r.push("$$"); i++; inInline = false; continue; }
    if (c === "$") { inInline = !inInline; r.push(c); continue; }
    r.push(c === "\n" && inInline ? " " : c);
  }
  md = r.join("");

  const blocks: PdfBlock[] = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) { i++; continue; }

    // 디스플레이 수식 $$
    if (t.startsWith("$$")) {
      // 한 줄 $$...$$
      if (t.endsWith("$$") && t.length > 4) {
        const converted = tex(t.slice(2, -2));
        if (converted) blocks.push({ k: "m", t: converted });
        i++; continue;
      }
      // 다행 $$
      if (t === "$$") {
        const ml: string[] = [];
        i++;
        let found = false;
        while (i < lines.length) {
          if (lines[i].trim() === "$$") { found = true; i++; break; }
          ml.push(lines[i]);
          i++;
        }
        if (!found) i++; // 닫는 $$ 없으면 그냥 넘김
        const converted = tex(ml.join(" "));
        if (converted) blocks.push({ k: "m", t: converted });
        continue;
      }
    }

    // 제목
    const mH = lines[i].match(/^(#{1,3})\s+(.+)$/);
    if (mH) { blocks.push({ k: "h", lv: mH[1].length, t: plain(mH[2]) }); i++; continue; }

    // 구분선
    if (/^---+$/.test(t)) { blocks.push({ k: "hr" }); i++; continue; }

    // **[레이블]** 패턴
    const mL = t.match(/^\*\*(\[.+?\])\*\*\s*([\s\S]*)/);
    if (mL) {
      const labelKey = mL[1];
      const restText = plain(mL[2] || "");
      if (LABELS[labelKey]) {
        blocks.push({ k: "label", label: labelKey.replace(/[\[\]]/g, ""), color: LABELS[labelKey], t: restText });
      } else {
        blocks.push({ k: "step", label: labelKey.replace(/[\[\]]/g, ""), t: restText });
      }
      i++; continue;
    }

    // 목록
    if (/^[-*+]\s/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        items.push(plain(lines[i].trim().slice(2)));
        i++;
      }
      blocks.push({ k: "li", ord: false, items });
      continue;
    }
    if (/^\d+\.\s/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(plain(lines[i].trim().replace(/^\d+\.\s/, "")));
        i++;
      }
      blocks.push({ k: "li", ord: true, items });
      continue;
    }

    // 문단
    const pl: string[] = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l || /^#{1,3}\s/.test(l) || l.startsWith("$$") || /^---/.test(l) ||
          /^[-*+]\s/.test(l) || /^\d+\.\s/.test(l) || /^\*\*\[/.test(l)) break;
      pl.push(lines[i]);
      i++;
    }
    if (pl.length) {
      const converted = plain(pl.join(" "));
      if (converted) blocks.push({ k: "p", t: converted });
    }
  }

  return blocks;
}

// ── Worker 호출 ─────────────────────────────────────────────────────────────

let fontB64Cache: string | null = null;

async function getFontB64(): Promise<string | null> {
  if (fontB64Cache) return fontB64Cache;
  try {
    const r = await fetch("/fonts/NanumGothic-Regular.ttf");
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const u = new Uint8Array(buf);
    const ch: string[] = [];
    for (let i = 0; i < u.length; i += 8192)
      ch.push(String.fromCharCode(...(u.subarray(i, i + 8192) as unknown as number[])));
    fontB64Cache = btoa(ch.join(""));
    return fontB64Cache;
  } catch { return null; }
}

function runWorker(msg: Record<string, unknown>): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const w = new Worker("/pdf-worker.js");
    const timeout = setTimeout(() => { w.terminate(); reject(new Error("PDF 생성 시간 초과")); }, 30_000);
    w.onmessage = (e) => { clearTimeout(timeout); w.terminate(); e.data.ok ? resolve(e.data.buffer) : reject(new Error(e.data.error)); };
    w.onerror = (e) => { clearTimeout(timeout); w.terminate(); reject(new Error(e.message || "Worker 오류")); };
    w.postMessage(msg);
  });
}

function downloadBlob(buf: ArrayBuffer, filename: string) {
  const blob = new Blob([buf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── 진입점 ──────────────────────────────────────────────────────────────────

export async function downloadSolutionPdf(sections: SectionData[], filename: string): Promise<void> {
  if (!sections.some((s) => s.content.trim())) throw new Error("내용이 없습니다.");

  // 메인 스레드에서 파싱 (TypeScript, 안전, <1ms)
  const parsed: PdfSection[] = sections.map((s) => ({
    num: s.num,
    title: s.title,
    color: s.color,
    blocks: s.content.trim() ? parseContent(s.content) : [],
  }));

  const fontData = await getFontB64();
  const buf = await runWorker({ type: "single", sections: parsed, fontData });
  downloadBlob(buf, filename);
}

// downloadBatchSolutionPdf removed — replaced by pdfExport.ts (KaTeX vector PDF)
