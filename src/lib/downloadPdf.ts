"use client";

const STYLE_ID = "__pdf_premium_style__";
const PDF_CLASS = "pdf-render";

const C = {
  s1: {
    cardBorder: "#2563eb",
    headerFrom: "#0f2878", headerTo: "#2563eb",
    watermark: "01",
    mathBg: "#eef5ff", mathBorder: "#93c5fd", mathAccent: "#2563eb",
    mathShadow: "rgba(37,99,235,0.10)",
    h2Border: "#3b82f6", h3Border: "#93c5fd",
    headingColor: "#1e3a8a",
    bqBg: "#eff6ff", bqBorder: "#2563eb",
  },
  s2: {
    cardBorder: "#7c3aed",
    headerFrom: "#1e0550", headerTo: "#7c3aed",
    watermark: "02",
    mathBg: "#f3f0ff", mathBorder: "#a78bfa", mathAccent: "#6d28d9",
    mathShadow: "rgba(109,40,217,0.10)",
    h2Border: "#8b5cf6", h3Border: "#c4b5fd",
    headingColor: "#3b0764",
    bqBg: "#f5f3ff", bqBorder: "#7c3aed",
  },
  s3: {
    cardBorder: "#ea580c",
    headerFrom: "#431407", headerTo: "#ea580c",
    watermark: "03",
    mathBg: "#fff8f1", mathBorder: "#fdba74", mathAccent: "#c2410c",
    mathShadow: "rgba(194,65,12,0.10)",
    h2Border: "#f97316", h3Border: "#fed7aa",
    headingColor: "#7c2d12",
    bqBg: "#fff7ed", bqBorder: "#ea580c",
  },
};
type SC = typeof C.s1;

function sectionCss(cls: string, c: SC, num: string) {
  return `
/* ── ${cls} ── */
#solution-content.${PDF_CLASS} .${cls} {
  background: white !important;
  border: none !important;
  border-left: 5px solid ${c.cardBorder} !important;
  border-radius: 0 20px 20px 0 !important;
  box-shadow: 0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06) !important;
  overflow: visible !important;
  margin-bottom: 28px !important;
  position: relative !important;
}

/* 헤더: 딥 그라디언트 배너 — child(1) */
#solution-content.${PDF_CLASS} .${cls} > div:first-child {
  background: linear-gradient(130deg, ${c.headerFrom} 0%, ${c.headerTo} 100%) !important;
  border-bottom: none !important;
  padding: 20px 32px !important;
  position: relative !important;
  overflow: hidden !important;
}

/* 워터마크 숫자 */
#solution-content.${PDF_CLASS} .${cls} > div:first-child::after {
  content: "${num}";
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 100px;
  font-weight: 900;
  color: rgba(255,255,255,0.09);
  line-height: 1;
  font-family: Arial Black, Arial, sans-serif;
  letter-spacing: -6px;
  user-select: none;
  pointer-events: none;
}

/* 헤더 내 모든 텍스트 → 흰색 */
#solution-content.${PDF_CLASS} .${cls} > div:first-child * {
  color: white !important;
  border-color: rgba(255,255,255,0.2) !important;
}
/* 아이콘 */
#solution-content.${PDF_CLASS} .${cls} > div:first-child > div:first-child {
  background: rgba(255,255,255,0.15) !important;
  border: 2px solid rgba(255,255,255,0.3) !important;
  width: 40px !important; height: 40px !important;
  border-radius: 10px !important;
}
/* 섹션 번호 (SECTION 01) */
#solution-content.${PDF_CLASS} .${cls} > div:first-child span[class*="text-\\[11px\\]"] {
  color: rgba(255,255,255,0.65) !important;
  font-size: 10px !important;
  letter-spacing: 0.15em !important;
}
/* 섹션 타이틀 h2 */
#solution-content.${PDF_CLASS} .${cls} > div:first-child h2 {
  color: white !important;
  font-size: 20px !important;
  font-weight: 900 !important;
  letter-spacing: -0.3px !important;
  margin: 0 !important;
  border: none !important;
}
/* 설명 텍스트 */
#solution-content.${PDF_CLASS} .${cls} > div:first-child p {
  display: block !important;
  color: rgba(255,255,255,0.55) !important;
  font-size: 11px !important;
  margin-top: 3px !important;
}

/* 구분선 리셋 — child(2): 얇은 선으로만 표시 */
#solution-content.${PDF_CLASS} .${cls} > div:nth-child(2) {
  padding: 0 !important;
  margin: 0 !important;
  height: 2px !important;
  min-height: 0 !important;
  max-height: 2px !important;
  background: rgba(0,0,0,0.07) !important;
  border: none !important;
  border-top: none !important;
}

/* 콘텐츠 영역 — child(3): 적절한 패딩 */
#solution-content.${PDF_CLASS} .${cls} > div:nth-child(3) {
  padding: 16px 36px 24px !important;
  background: white !important;
}

/* 콘텐츠 첫 번째 요소 상단 마진 제거 */
#solution-content.${PDF_CLASS} .${cls} > div:nth-child(3) > div > *:first-child {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

/* h2 — 컬러 언더라인 */
#solution-content.${PDF_CLASS} .${cls} h2 {
  color: ${c.headingColor} !important;
  font-size: 15px !important;
  font-weight: 800 !important;
  padding-bottom: 6px !important;
  border-bottom: 2.5px solid ${c.h2Border} !important;
  margin-top: 20px !important;
  margin-bottom: 10px !important;
}
/* h3 — 좌측 컬러 바 */
#solution-content.${PDF_CLASS} .${cls} h3 {
  color: ${c.headingColor} !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  padding-left: 11px !important;
  border-left: 3px solid ${c.h3Border} !important;
  margin-top: 16px !important;
  margin-bottom: 8px !important;
}

/* 본문 */
#solution-content.${PDF_CLASS} .${cls} p {
  font-size: 14.5px !important;
  line-height: 1.9 !important;
  color: #1e293b !important;
  margin-bottom: 9px !important;
}
#solution-content.${PDF_CLASS} .${cls} li {
  font-size: 14.5px !important;
  line-height: 1.9 !important;
  color: #1e293b !important;
}
#solution-content.${PDF_CLASS} .${cls} strong {
  color: #0c1730 !important;
  font-weight: 800 !important;
}

/* blockquote / KEY 박스 */
#solution-content.${PDF_CLASS} .${cls} blockquote {
  background: ${c.bqBg} !important;
  border-left: 4px solid ${c.bqBorder} !important;
  border-top: 1px solid ${c.h3Border} !important;
  border-right: 1px solid ${c.h3Border} !important;
  border-bottom: 1px solid ${c.h3Border} !important;
  border-radius: 0 10px 10px 0 !important;
  padding: 12px 16px !important;
  margin: 14px 0 !important;
  font-style: normal !important;
  color: #1e293b !important;
}

/* hr */
#solution-content.${PDF_CLASS} .${cls} hr {
  border: none !important;
  border-top: 2px dashed ${c.h3Border} !important;
  margin: 18px 0 !important;
}

/* 수식 박스 — 수능 시험지 스타일 */
#solution-content.${PDF_CLASS} .${cls} .katex-display {
  background: ${c.mathBg} !important;
  border: 1.5px solid ${c.mathBorder} !important;
  border-left: 5px solid ${c.mathAccent} !important;
  border-radius: 0 12px 12px 0 !important;
  padding: 18px 28px !important;
  margin: 18px 0 !important;
  overflow: visible !important; overflow-x: visible !important; overflow-y: visible !important;
  scrollbar-width: none !important;
  box-shadow: 0 2px 10px ${c.mathShadow} !important;
}
/* 수능 스타일 수식 크기·굵기 */
#solution-content.${PDF_CLASS} .${cls} .katex { font-size: 1.2em !important; }
#solution-content.${PDF_CLASS} .${cls} .katex-display > .katex { font-size: 1.45em !important; }
#solution-content.${PDF_CLASS} .${cls} .katex .frac-line { border-bottom-width: 0.08em !important; min-height: 0.08em !important; }
#solution-content.${PDF_CLASS} .${cls} .katex .sqrt > .sqrt-sign { font-weight: 700 !important; }
#solution-content.${PDF_CLASS} .${cls} .katex .sqrt-line { border-bottom-width: 0.08em !important; min-height: 0.08em !important; }
#solution-content.${PDF_CLASS} .${cls} .katex .op-symbol.large-op { font-size: 1.8em !important; }
#solution-content.${PDF_CLASS} .${cls} .katex .mop { font-weight: 500 !important; }
#solution-content.${PDF_CLASS} .${cls} .katex .mopen, #solution-content.${PDF_CLASS} .${cls} .katex .mclose { font-weight: 500 !important; }
#solution-content.${PDF_CLASS} .${cls} .katex .mrel { margin: 0 0.35em !important; }

/* 레이블 카드 (핵심 관찰/계산/답/KEY) */
#solution-content.${PDF_CLASS} .${cls} .rounded-xl.overflow-hidden {
  box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
  margin-bottom: 16px !important;
}
`;
}

const PREMIUM_CSS = `
/* ── 인터랙티브 요소 제거 ── */
#solution-content.${PDF_CLASS} [data-pdf-hide="true"] { display: none !important; }
#solution-content.${PDF_CLASS} button { display: none !important; }

/* ── 헤더 설명 강제 표시 ── */
#solution-content.${PDF_CLASS} .hidden { display: block !important; }

/* ── 스크롤바 완전 제거 ── */
#solution-content.${PDF_CLASS} * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
#solution-content.${PDF_CLASS} *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }

${sectionCss("section-rigorous",   C.s1, "01")}
${sectionCss("section-explanation", C.s2, "02")}
${sectionCss("section-shortcut",    C.s3, "03")}
`;

function injectPremiumStyle(): HTMLStyleElement {
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PREMIUM_CSS;
  document.head.appendChild(style);
  return style;
}

type OverflowSave = { el: HTMLElement; overflow: string; overflowX: string; overflowY: string };

function suppressScrollbars(root: HTMLElement): OverflowSave[] {
  const saved: OverflowSave[] = [];
  for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
    const cs = window.getComputedStyle(el);
    if (cs.overflowX === "auto" || cs.overflowX === "scroll" || cs.overflowY === "auto" || cs.overflowY === "scroll") {
      saved.push({ el, overflow: el.style.overflow, overflowX: el.style.overflowX, overflowY: el.style.overflowY });
      el.style.overflow = "visible"; el.style.overflowX = "visible"; el.style.overflowY = "visible";
    }
  }
  return saved;
}

function restoreScrollbars(saved: OverflowSave[]): void {
  for (const { el, overflow, overflowX, overflowY } of saved) {
    el.style.overflow = overflow; el.style.overflowX = overflowX; el.style.overflowY = overflowY;
  }
}

/**
 * 페이지 경계 근처에서 가장 안전한 자르기 행을 찾음.
 * 배경색(#eef0f4 ≈ 밝은 회백색)에 가까운 픽셀이 가장 많은 행을 선택.
 * — targetY 위로만 탐색해서 페이지를 늘리지 않음.
 */
function findSafeCutRow(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  targetY: number,
  searchRadius: number,
): number {
  const startY = Math.max(0, targetY - searchRadius);
  const endY   = Math.min(canvasHeight - 1, targetY);
  const scanH  = endY - startY + 1;
  if (scanH <= 0) return targetY;

  // 해당 범위를 한 번에 읽어 성능 최적화
  const data = ctx.getImageData(0, startY, canvasWidth, scanH).data;

  let bestRow   = targetY;
  let bestScore = -1;

  for (let row = 0; row < scanH; row++) {
    let lightCount = 0;
    const rowOffset = row * canvasWidth * 4;
    for (let col = 0; col < canvasWidth; col++) {
      const i = rowOffset + col * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // 배경색 #eef0f4 (238,240,244) 또는 흰색에 가까운 픽셀
      if (r > 218 && g > 216 && b > 210) lightCount++;
    }
    const score = lightCount / canvasWidth;
    if (score > bestScore) {
      bestScore = score;
      bestRow   = startY + row;
    }
  }

  // 75% 이상이 배경이면 안전한 행으로 판단, 아니면 원래 위치 사용
  return bestScore >= 0.75 ? bestRow : targetY;
}

// downloadBatchPdf removed — replaced by pdfExport.ts (KaTeX vector PDF via browser print)

export async function downloadSolutionAsPdf(
  elementId: string,
  filename = "수학해설.pdf",
  problemImageUrl?: string
) {
  const element = document.getElementById(elementId);
  if (!element) throw new Error("해설 요소를 찾을 수 없습니다.");

  const [{ toJpeg }, { jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);

  const A4_W = 210, A4_H = 297, MARGIN = 12, HEADER_H = 14;
  const CONTENT_W       = A4_W - MARGIN * 2;
  const PAGE_CONTENT_H  = A4_H - MARGIN * 2 - HEADER_H;

  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 80));

  // ── 문제 이미지 블록을 solution-content 위에 임시 삽입 ─────────────────
  let problemBlock: HTMLElement | null = null;
  if (problemImageUrl) {
    problemBlock = document.createElement("div");
    problemBlock.style.cssText = `
      background: white;
      border-radius: 16px;
      padding: 20px 24px 16px;
      margin-bottom: 20px;
      border: 2px solid #CEC5B4;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    `;
    problemBlock.innerHTML = `
      <div style="font-size:11px;font-weight:900;color:#8A7C70;letter-spacing:0.15em;text-transform:uppercase;font-family:monospace;margin-bottom:10px;">
        ■ 문제 이미지
      </div>
      <div style="background:#FAF7F2;border-radius:10px;padding:12px;text-align:center;border:1.5px solid #CEC5B4;">
        <img src="${problemImageUrl}" alt="수학 문제"
          style="max-width:100%;object-fit:contain;border-radius:6px;" />
      </div>
    `;
    element.parentElement?.insertBefore(problemBlock, element);
  }

  const premiumStyle   = injectPremiumStyle();
  element.classList.add(PDF_CLASS);
  const overflowSaved  = suppressScrollbars(element);
  // CSS 적용 대기 — 한 번의 RAF로 충분
  await new Promise((r) => requestAnimationFrame(r));

  // 캡처 대상: 문제 이미지 블록 + 해설 내용 전체
  const captureTarget = problemBlock ?? element;
  const captureRoot   = problemBlock
    ? (problemBlock.parentElement ?? element)
    : element;

  // 임시 래퍼로 두 요소를 함께 캡처
  let wrapper: HTMLElement | null = null;
  if (problemBlock) {
    wrapper = document.createElement("div");
    wrapper.style.cssText = "background:#eef0f4;padding:0;";
    captureRoot.insertBefore(wrapper, problemBlock);
    wrapper.appendChild(problemBlock);
    wrapper.appendChild(element);
  }

  let dataUrl: string;
  try {
    dataUrl = await toJpeg(wrapper ?? element, {
      pixelRatio: 3.0,
      quality: 0.95,
      backgroundColor: "#eef0f4",
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.dataset.pdfHide === "true") return false;
        if (node.tagName === "BUTTON") return false;
        return true;
      },
    });
  } finally {
    // DOM 원상복구
    if (wrapper && captureRoot) {
      if (problemBlock) captureRoot.insertBefore(problemBlock, wrapper);
      captureRoot.insertBefore(element, wrapper.nextSibling ?? null);
      wrapper.remove();
    }
    if (problemBlock) {
      problemBlock.remove();
    }
    element.classList.remove(PDF_CLASS);
    restoreScrollbars(overflowSaved);
    if (document.head.contains(premiumStyle)) document.head.removeChild(premiumStyle);
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = dataUrl;
  });

  const fullCanvas = document.createElement("canvas");
  fullCanvas.width  = img.width;
  fullCanvas.height = img.height;
  const ctx = fullCanvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const pxPerMm = fullCanvas.width / CONTENT_W;

  // ── 스마트 페이지 경계 계산 ────────────────────────────────────────────────
  // 탐색 반경: ±15mm (픽셀 단위)
  const SEARCH_RADIUS = Math.round(pxPerMm * 15);
  const rawPageCount  = Math.ceil(fullCanvas.height / pxPerMm / PAGE_CONTENT_H);

  // 각 페이지 경계(원래 위치)를 안전한 행으로 조정
  const cutPoints: number[] = [0];
  for (let p = 1; p < rawPageCount; p++) {
    const rawY     = Math.round(p * PAGE_CONTENT_H * pxPerMm);
    const safeY    = findSafeCutRow(ctx, fullCanvas.width, fullCanvas.height, rawY, SEARCH_RADIUS);
    cutPoints.push(safeY);
  }
  cutPoints.push(fullCanvas.height);

  const totalPages = cutPoints.length - 1;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const addPageHeader = (page: number) => {
    pdf.setFillColor(10, 20, 60);
    pdf.rect(0, 0, A4_W, HEADER_H, "F");
    pdf.setFillColor(79, 70, 229);
    pdf.rect(0, 0, 4, HEADER_H, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "bold");
    pdf.text("스마트풀이", 8, 9);
    pdf.setTextColor(120, 120, 160);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("|", 32, 9);
    pdf.setTextColor(160, 165, 210);
    pdf.text("Gemini 3.1 Pro  ·  수학 해설", 36, 9);
    pdf.setTextColor(130, 135, 180);
    pdf.text(`${page} / ${totalPages}`, A4_W - MARGIN, 9, { align: "right" });
  };

  // ── 페이지별 렌더링 ───────────────────────────────────────────────────────
  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();
    addPageHeader(page + 1);

    const srcY = cutPoints[page];
    const srcH = cutPoints[page + 1] - srcY;
    if (srcH <= 0) continue;

    const slice  = document.createElement("canvas");
    slice.width  = fullCanvas.width;
    slice.height = Math.ceil(srcH);
    const sCtx   = slice.getContext("2d")!;
    sCtx.drawImage(fullCanvas, 0, srcY, fullCanvas.width, srcH, 0, 0, fullCanvas.width, srcH);

    const imgHmm = srcH / pxPerMm;
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.95), "JPEG",
      MARGIN, HEADER_H, CONTENT_W, imgHmm
    );
  }

  pdf.save(filename);
}
