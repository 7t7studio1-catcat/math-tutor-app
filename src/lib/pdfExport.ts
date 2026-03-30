"use client";

import type { ProblemState } from "@/components/PdfBatchViewer";
import type { PdfPageData } from "@/components/PdfUploader";
import { markdownToHTML } from "@/lib/markdownToHTML";

const SECTION_META = [
  { num: "01", title: "STEP 1: 문제 읽기", subtitle: "READ", color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
  { num: "02", title: "STEP 2: 정석 풀이", subtitle: "SOLVE", color: "#2563eb", bg: "#eff6ff", border: "#93c5fd" },
  { num: "03", title: "STEP 3: 숏컷", subtitle: "SHORTCUT", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
  { num: "04", title: "STEP 4: 변형 대비", subtitle: "VARIANT", color: "#059669", bg: "#ecfdf5", border: "#6ee7b7" },
] as const;

const BASE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, system-ui, "Noto Sans KR", sans-serif;
  font-size: 15px; line-height: 1.85; color: #1e293b; background: white;
  width: 760px; padding: 24px;
}
h1 { font-size: 20px; font-weight: 900; margin: 22px 0 8px; color: #0f172a; }
h2 { font-size: 17px; font-weight: 800; margin: 18px 0 6px; color: #1e293b; border-bottom: 2.5px solid #e2e8f0; padding-bottom: 4px; }
h3 { font-size: 15.5px; font-weight: 700; margin: 16px 0 5px; color: #334155; border-left: 3.5px solid #94a3b8; padding-left: 10px; }
p { margin-bottom: 10px; line-height: 2.1; }
ul, ol { padding-left: 24px; margin-bottom: 10px; }
li { margin-bottom: 4px; line-height: 2.1; }
strong { font-weight: 800; color: #0f172a; }
blockquote { border: 1.5px solid #c4b5fd; border-left: 4px solid #7c3aed; background: #f5f3ff; padding: 10px 16px; margin: 12px 0; border-radius: 0 8px 8px 0; font-style: normal; }
hr { border: none; border-top: 2px dashed #e2e8f0; margin: 16px 0; }
code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-size: 13px; }

/* ── 수능 시험지 스타일 수식 ── */
.katex-display {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #6366f1;
  border-radius: 0 10px 10px 0;
  padding: 14px 22px;
  margin: 14px 0;
  overflow-x: visible;
}
/* 선지 간격 — 교재급 가독성 */
p { word-spacing: 0.12em; line-height: 2.1; }
.katex { font-size: 1.2em; }
.katex-display > .katex { font-size: 1.45em; }

/* 분수 바 두껍게 */
.katex .frac-line { border-bottom-width: 0.08em !important; min-height: 0.08em !important; }
/* 루트 기호 굵게 */
.katex .sqrt > .sqrt-sign { font-weight: 700; }
.katex .sqrt-line { border-bottom-width: 0.08em !important; min-height: 0.08em !important; }
/* 극한·합·적분 크게 */
.katex .op-symbol.large-op { font-size: 1.8em; }
.katex .op-symbol.small-op { font-size: 1.3em; }
/* 함수명·괄호 또렷하게 */
.katex .mop { font-weight: 500; }
.katex .mopen, .katex .mclose, .katex .delimsizing { font-weight: 500; }
/* 등호 주변 넓게 */
.katex .mrel { margin: 0 0.35em; }
/* 위아래첨자 크기 */
.katex .msupsub .vlist-t { font-size: 0.88em; }
`;

async function getKatexCSS(): Promise<string> {
  const urls = [
    "https://cdn.jsdelivr.net/npm/katex@0.16.37/dist/katex.min.css",
    "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.37/katex.min.css",
    "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return await res.text();
    } catch { /* try next */ }
  }
  return "";
}

function sectionHTML(idx: number, content: string): string {
  if (!content.trim()) return "";
  const meta = SECTION_META[idx];
  const html = markdownToHTML(content);
  return `
    <div style="margin-bottom:24px;">
      <div style="background:${meta.color}; color:white; padding:10px 18px; border-radius:8px 8px 0 0; display:flex; align-items:center; gap:10px;">
        <span style="font-size:24px;font-weight:900;opacity:0.2;font-family:monospace;">${meta.num}</span>
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:0.15em;opacity:0.7;">${meta.subtitle}</div>
          <div style="font-size:14px;font-weight:800;">${meta.title}</div>
        </div>
      </div>
      <div style="border:1.5px solid ${meta.border}; border-top:none; border-radius:0 0 8px 8px; padding:16px 20px; background:${meta.bg};">
        ${html}
      </div>
    </div>`;
}

// ── 안전한 페이지 잘림 위치 탐색 ────────────────────────────────────────────
function findSafeCutRow(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  targetY: number,
  searchRadius: number,
): number {
  const startY = Math.max(0, targetY - searchRadius);
  const endY = Math.min(canvasHeight - 1, targetY);
  const scanH = endY - startY + 1;
  if (scanH <= 0) return targetY;

  const data = ctx.getImageData(0, startY, canvasWidth, scanH).data;
  let bestRow = targetY;
  let bestScore = -1;

  for (let row = 0; row < scanH; row++) {
    let lightCount = 0;
    const rowOffset = row * canvasWidth * 4;
    for (let col = 0; col < canvasWidth; col++) {
      const i = rowOffset + col * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 230 && g > 230 && b > 230) lightCount++;
    }
    const score = lightCount / canvasWidth;
    if (score > bestScore) {
      bestScore = score;
      bestRow = startY + row;
    }
  }

  return bestScore >= 0.70 ? bestRow : targetY;
}

function computeCutPoints(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  pxPerMm: number,
  pageContentH: number,
): number[] {
  const searchRadius = Math.round(pxPerMm * 18);
  const rawPageCount = Math.ceil(canvasHeight / pxPerMm / pageContentH);

  const cuts: number[] = [0];
  for (let p = 1; p < rawPageCount; p++) {
    const rawY = Math.round(p * pageContentH * pxPerMm);
    const safeY = findSafeCutRow(ctx, canvasWidth, canvasHeight, rawY, searchRadius);
    cuts.push(safeY);
  }
  cuts.push(canvasHeight);
  return cuts;
}

// ── iframe 렌더링 → 캡처 → 페이지 분할 공통 로직 ────────────────────────────

interface RenderResult {
  fullCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pxPerMm: number;
}

async function renderHTMLToCanvas(
  iframe: HTMLIFrameElement,
  html: string,
  contentW: number,
): Promise<RenderResult> {
  const { toJpeg } = await import("html-to-image");

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    iframe.onload = async () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc?.body) { reject(new Error("iframe body 접근 불가")); return; }

        await new Promise(r => setTimeout(r, 400));

        const dataUrl = await toJpeg(doc.body, {
          pixelRatio: 3.0,
          quality: 0.95,
          backgroundColor: "#ffffff",
        });

        URL.revokeObjectURL(url);

        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
        });

        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = img.width;
        fullCanvas.height = img.height;
        const ctx = fullCanvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);

        resolve({ fullCanvas, ctx, pxPerMm: img.width / contentW });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    iframe.onerror = () => { URL.revokeObjectURL(url); reject(new Error("렌더링 실패")); };
    iframe.src = url;
  });
}

function sliceAndAddPages(
  pdf: import("jspdf").jsPDF,
  fullCanvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  pxPerMm: number,
  layout: { A4_W: number; MARGIN: number; HEADER_H: number; CONTENT_W: number; PAGE_CONTENT_H: number },
  headerFn: (page: number) => void,
  startPageNum: number,
): number {
  const cuts = computeCutPoints(ctx, fullCanvas.width, fullCanvas.height, pxPerMm, layout.PAGE_CONTENT_H);
  const totalSlices = cuts.length - 1;
  let pageNum = startPageNum;

  for (let s = 0; s < totalSlices; s++) {
    if (pageNum > 0) pdf.addPage();
    pageNum++;

    const srcY = cuts[s];
    const srcH = cuts[s + 1] - srcY;
    if (srcH <= 0) continue;

    headerFn(pageNum);

    const slice = document.createElement("canvas");
    slice.width = fullCanvas.width;
    slice.height = Math.ceil(srcH);
    const sCtx = slice.getContext("2d")!;
    sCtx.drawImage(fullCanvas, 0, srcY, fullCanvas.width, srcH, 0, 0, fullCanvas.width, srcH);

    const imgHmm = srcH / pxPerMm;
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.95), "JPEG",
      layout.MARGIN, layout.HEADER_H + 1, layout.CONTENT_W, imgHmm
    );
  }

  return pageNum;
}

// ── 배치 모드 (PDF 일괄 풀이) ────────────────────────────────────────────────

function problemHTML(problem: ProblemState, pdfPages: PdfPageData[]): string {
  const imgSrc = problem.croppedImage
    ? `data:image/jpeg;base64,${problem.croppedImage}`
    : (problem.pages[0] !== undefined && pdfPages[problem.pages[0]]
      ? `data:image/jpeg;base64,${pdfPages[problem.pages[0]].base64}`
      : "");

  const imageSection = imgSrc
    ? `<div style="margin-bottom:20px; text-align:center; border:1.5px solid #d1d5db; border-radius:10px; padding:14px; background:#fafafa;">
        <div style="font-size:10px;font-weight:800;color:#6b7280;letter-spacing:0.12em;margin-bottom:10px;text-transform:uppercase;">원본 문제</div>
        <img src="${imgSrc}" style="max-width:100%;object-fit:contain;border-radius:6px;display:block;margin:0 auto;" />
      </div>`
    : "";

  return `
    <div style="background:linear-gradient(135deg,#1e0550,#7c3aed); color:white; padding:14px 22px; border-radius:12px; margin-bottom:18px; display:flex; align-items:center; gap:14px;">
      <span style="font-size:36px;font-weight:900;font-family:monospace;opacity:0.25;">${problem.num}</span>
      <div>
        <div style="font-size:9px;font-weight:800;letter-spacing:0.2em;opacity:0.6;">PROBLEM</div>
        <div style="font-size:20px;font-weight:900;">${problem.num}번 문제</div>
      </div>
    </div>
    ${imageSection}
    ${problem.sections.map((sec, idx) => sectionHTML(idx, sec.content)).join("")}`;
}

function wrapHTML(body: string, katexCSS: string): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><style>${katexCSS}\n${BASE_CSS}</style></head><body>${body}</body></html>`;
}

export async function exportBatchPdf(
  problems: ProblemState[],
  pdfPages: PdfPageData[],
  fileName: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const katexCSS = await getKatexCSS();

  const validProblems = problems.filter(
    p => (p.overallStatus === "done" || p.overallStatus === "error") && p.sections.some(s => s.content)
  );
  if (validProblems.length === 0) throw new Error("풀이 내용이 없습니다.");

  const A4_W = 210, A4_H = 297, MARGIN = 10, HEADER_H = 12;
  const CONTENT_W = A4_W - MARGIN * 2;
  const PAGE_CONTENT_H = A4_H - MARGIN * 2 - HEADER_H;
  const layout = { A4_W, MARGIN, HEADER_H, CONTENT_W, PAGE_CONTENT_H };

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let pageNum = 0;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:800px;height:600px;border:none;";
  document.body.appendChild(iframe);

  try {
    for (const problem of validProblems) {
      const html = wrapHTML(problemHTML(problem, pdfPages), katexCSS);
      const { fullCanvas, ctx, pxPerMm } = await renderHTMLToCanvas(iframe, html, CONTENT_W);

      const headerFn = (pg: number) => {
        pdf.setFillColor(30, 5, 80);
        pdf.rect(0, 0, A4_W, HEADER_H, "F");
        pdf.setFillColor(124, 58, 237);
        pdf.rect(0, 0, 3.5, HEADER_H, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.text("SolutionMaker", 7, 8);
        pdf.setTextColor(160, 165, 210);
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "normal");
        pdf.text(`${problem.num}번 해설`, 38, 8);
        pdf.setTextColor(130, 135, 180);
        pdf.text(`${pg}`, A4_W - MARGIN, 8, { align: "right" });
      };

      pageNum = sliceAndAddPages(pdf, fullCanvas, ctx, pxPerMm, layout, headerFn, pageNum);
    }

    pdf.save(`${fileName}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}

// ── 이미지 모드 (단일 문제) ──────────────────────────────────────────────────

interface SingleSectionInput { content: string; }

function buildSingleBody(
  sections: [SingleSectionInput, SingleSectionInput, SingleSectionInput, SingleSectionInput],
  problemImageUrl: string | undefined,
): string {
  const imageBlock = problemImageUrl
    ? `<div style="margin-bottom:24px; text-align:center; border:1.5px solid #d1d5db; border-radius:12px; padding:16px; background:#fafafa;">
        <div style="font-size:10px;font-weight:800;color:#6b7280;letter-spacing:0.12em;margin-bottom:12px;text-transform:uppercase;">원본 문제</div>
        <img src="${problemImageUrl}" style="max-width:100%;object-fit:contain;border-radius:8px;display:block;margin:0 auto;" />
      </div>`
    : "";

  return `
    <div style="background:linear-gradient(135deg,#0f2878,#2563eb); color:white; padding:16px 24px; border-radius:14px; margin-bottom:20px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;opacity:0.6;">SOLUTION MAKER</div>
      <div style="font-size:20px;font-weight:900;">4단계 완전 해설</div>
    </div>
    ${imageBlock}
    ${sections.map((sec, idx) => sectionHTML(idx, sec.content)).join("")}`;
}

export async function exportSinglePdf(
  sections: [SingleSectionInput, SingleSectionInput, SingleSectionInput, SingleSectionInput],
  fileName: string,
  problemImageUrl?: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const katexCSS = await getKatexCSS();

  const A4_W = 210, A4_H = 297, MARGIN = 10, HEADER_H = 12;
  const CONTENT_W = A4_W - MARGIN * 2;
  const PAGE_CONTENT_H = A4_H - MARGIN * 2 - HEADER_H;
  const layout = { A4_W, MARGIN, HEADER_H, CONTENT_W, PAGE_CONTENT_H };

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:800px;height:600px;border:none;";
  document.body.appendChild(iframe);

  const html = wrapHTML(buildSingleBody(sections, problemImageUrl), katexCSS);

  try {
    const { fullCanvas, ctx, pxPerMm } = await renderHTMLToCanvas(iframe, html, CONTENT_W);

    const headerFn = (pg: number) => {
      pdf.setFillColor(10, 20, 60);
      pdf.rect(0, 0, A4_W, HEADER_H, "F");
      pdf.setFillColor(37, 99, 235);
      pdf.rect(0, 0, 3.5, HEADER_H, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text("SolutionMaker", 7, 8);
      pdf.setTextColor(160, 165, 210);
      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "normal");
      pdf.text("4단계 해설", 38, 8);
      pdf.setTextColor(130, 135, 180);
      pdf.text(`${pg}`, A4_W - MARGIN, 8, { align: "right" });
    };

    sliceAndAddPages(pdf, fullCanvas, ctx, pxPerMm, layout, headerFn, 0);
    pdf.save(`${fileName}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}
