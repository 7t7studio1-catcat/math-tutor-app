"use client";

import React, { useMemo, useId, useRef, useCallback, useState } from "react";
import * as math from "mathjs";
import katex from "katex";

export type { GraphSpec } from "@/lib/graphSvg";
import type { GraphSpec } from "@/lib/graphSvg";

interface GraphSpecWithExport extends GraphSpec {
  exportMode?: boolean;
}

const INK = "#1a1a1a";
const FONT = "'Times New Roman','Batang','Georgia',serif";
const PAD = { top: 24, right: 36, bottom: 34, left: 36 };

const SIZE_MAP = {
  small:  { w: 260, h: 252 },
  medium: { w: 310, h: 300 },
  large:  { w: 400, h: 386 },
  xlarge: { w: 480, h: 464 },
} as const;

const HALO = { stroke: "white", strokeWidth: 6, paintOrder: "stroke" as const };

function compileFn(expr: string): ((x: number) => number) | null {
  try {
    const compiled = math.compile(expr);
    return (x: number) => {
      try {
        const v = compiled.evaluate({ x });
        return typeof v === "number" && isFinite(v) ? v : NaN;
      } catch { return NaN; }
    };
  } catch { return null; }
}

function labelOffset(pos?: string): [number, number] {
  switch (pos) {
    case "tl": return [-10, -12];
    case "t":  return [-2, -14];
    case "tr": return [8, -12];
    case "l":  return [-16, 4];
    case "r":  return [8, 4];
    case "bl": return [-10, 16];
    case "b":  return [-2, 16];
    case "br": return [8, 16];
    default:   return [8, -12];
  }
}

type LabelCtx = "func" | "point" | "value";

function labelToLatex(text: string, ctx?: LabelCtx): string {
  if (!ctx) return text;
  let s = text;
  if (ctx === "point" || ctx === "value") {
    s = s.replace(/[A-Z]+/g, (m) => `\\mathrm{${m}}`);
  }
  // a/b → \frac{a}{b}, -a/b → -\frac{a}{b}
  s = s.replace(
    /(-?)((?:\d+|\([^)]+\)|[a-zA-Z]))\s*\/\s*(-?)((?:\d+|\([^)]+\)|[a-zA-Z]))/g,
    (_m, nN, num, nD, den) => `${nN === "-" ? "-" : ""}${nD === "-" ? "-" : ""}\\frac{${num}}{${den}}`,
  );
  s = s.replace(/_\{([^}]+)\}/g, "_{$1}");
  s = s.replace(/_([A-Za-z0-9])/g, "_{$1}");
  s = s.replace(/\^([A-Za-z0-9])/g, "^{$1}");
  return s;
}

const KATEX_HALO = "drop-shadow(0 0 2.5px white) drop-shadow(0 0 2.5px white) drop-shadow(0 0 1px white)";

function MathLabel({ x, y, text, fontSize, labelCtx, textAnchor: anchor, exportMode, ...rest }: {
  x: number; y: number; text: string; fontSize: number; labelCtx?: LabelCtx;
  textAnchor?: string; exportMode?: boolean;
  [k: string]: unknown;
}) {
  if (!text) return null;

  const svgText = (content: string) => (
    <text x={x} y={y} fontSize={fontSize} fill={INK} fontFamily={FONT}
      fontStyle="italic"
      textAnchor={anchor as "start" | "middle" | "end" | undefined} {...HALO}>{content}</text>
  );

  // export 모드: foreignObject 없이 순수 SVG text로 렌더 (캡처 호환)
  if (exportMode) {
    return svgText(toUnicodeMath(text));
  }

  if (!labelCtx) return svgText(text);

  const latex = labelToLatex(text, labelCtx);
  let html: string;
  try {
    html = katex.renderToString(latex, { throwOnError: false, displayMode: false, output: "html" });
  } catch {
    return svgText(text);
  }

  const estW = Math.max(text.length * fontSize * 0.55, 20);
  const estH = fontSize * 1.6;

  let ox = x;
  if (anchor === "middle") ox -= estW / 2;
  else if (anchor === "end") ox -= estW;

  return (
    <foreignObject x={ox} y={y - estH * 0.7} width={estW + 16} height={estH + 8}
      style={{ overflow: "visible", pointerEvents: "none" }}>
      <div style={{
        fontSize: `${fontSize * 0.82}px`,
        color: INK,
        whiteSpace: "nowrap",
        lineHeight: 1,
        filter: KATEX_HALO,
      }} dangerouslySetInnerHTML={{ __html: html }} />
    </foreignObject>
  );
}

/** 라벨 텍스트를 유니코드 수학 표기로 변환 (export용, foreignObject 불필요) */
function toUnicodeMath(text: string): string {
  let s = text;
  const sup: Record<string, string> = {
    "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹",
    "+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ","/":"ᐟ",
  };
  const sub: Record<string, string> = {
    "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉",
    "+":"₊","-":"₋","=":"₌","(":"₍",")":"₎","a":"ₐ","e":"ₑ","n":"ₙ",
  };
  // ^{...} → superscript
  s = s.replace(/\^?\{([^}]+)\}/g, (m, inner) => {
    if (!m.startsWith("^") && !s.includes("^" + m)) return m;
    return [...inner].map((c: string) => sup[c] ?? c).join("");
  });
  s = s.replace(/\^([0-9n+\-])/g, (_m, c) => sup[c] ?? c);
  // _{...} → subscript
  s = s.replace(/_\{([^}]+)\}/g, (_m, inner) => {
    return [...inner].map((c: string) => sub[c] ?? c).join("");
  });
  s = s.replace(/_([0-9aen])/g, (_m, c) => sub[c] ?? c);
  // 분수 a/b → 유니코드
  s = s.replace(/(-?\d+)\/(\d+)/g, (_m, n, d) => {
    const sn = [...n].map((c: string) => sup[c] ?? c).join("");
    const sd = [...d].map((c: string) => sub[c] ?? c).join("");
    return `${sn}⁄${sd}`;
  });
  return s;
}

function deg2rad(d: number) { return d * Math.PI / 180; }

function arcPath(cxPx: number, cyPx: number, rPx: number, startDeg: number, endDeg: number): string {
  const s = deg2rad(startDeg);
  const e = deg2rad(endDeg);
  const x1 = cxPx + rPx * Math.cos(s);
  const y1 = cyPx - rPx * Math.sin(s);
  const x2 = cxPx + rPx * Math.cos(e);
  const y2 = cyPx - rPx * Math.sin(e);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg > startDeg ? 0 : 1;
  return `M${x1.toFixed(1)},${y1.toFixed(1)}A${rPx.toFixed(1)},${rPx.toFixed(1)} 0 ${large} ${sweep} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

/**
 * 함수 라벨에서 축 변수를 자동 감지.
 * "b = a^{-2/3}" → xLabel="a", yLabel="b"
 * "y = f(x)" → xLabel="x", yLabel="y"
 */
function detectAxisLabels(spec: GraphSpec): { xLabel: string; yLabel: string } {
  if (spec.xLabel && spec.yLabel) return { xLabel: spec.xLabel, yLabel: spec.yLabel };

  for (const fn of spec.functions ?? []) {
    const label = fn.label;
    if (!label) continue;
    // "b = a^{-2/3}", "y=f(x)", "b = a" 등의 패턴
    const m = label.match(/^\s*([a-zA-Z])\s*=\s*/);
    if (!m) continue;
    const lhs = m[1]; // 좌변 변수 = y축
    const rhs = label.slice(m[0].length);
    // 우변에서 가장 흔한 단일 소문자 변수 추출 (함수명 제외)
    const vars = rhs.replace(/[a-z]{2,}/g, "").match(/[a-z]/g);
    if (vars && vars.length > 0) {
      // lhs와 다른 변수 = x축
      const xVar = vars.find(v => v !== lhs) ?? vars[0];
      if (xVar !== lhs) {
        return {
          xLabel: spec.xLabel ?? xVar,
          yLabel: spec.yLabel ?? lhs,
        };
      }
    }
  }
  return { xLabel: spec.xLabel ?? "x", yLabel: spec.yLabel ?? "y" };
}

/**
 * 모든 요소의 데이터 좌표를 수집하여 xRange/yRange를 자동 확장.
 * 라벨 텍스트가 차지하는 공간까지 고려하여 데이터 범위를 넓힘.
 */
function expandRangeToFitAll(
  spec: GraphSpec,
): { xRange: [number, number]; yRange: [number, number] } {
  const xR = spec.xRange ?? [-5, 5];
  const yR = spec.yRange ?? [-5, 5];
  let [xMin, xMax] = [xR[0], xR[1]];
  let [yMin, yMax] = [yR[0], yR[1]];
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;

  // 라벨이 차지하는 데이터 좌표 여백 (글자 하나당 대략 span의 3%)
  const charW = xSpan * 0.03;
  const charH = ySpan * 0.06;

  function expandPt(x: number, y: number, labelLen = 0) {
    const pad = labelLen * charW;
    xMin = Math.min(xMin, x - pad * 0.5);
    xMax = Math.max(xMax, x + pad * 0.5);
    yMin = Math.min(yMin, y - charH);
    yMax = Math.max(yMax, y + charH);
  }

  for (const p of spec.points ?? []) {
    expandPt(p.x, p.y, (p.label ?? "").length + 2);
  }
  for (const p of spec.hollowPoints ?? []) {
    expandPt(p.x, p.y, (p.label ?? "").length + 2);
  }
  for (const sg of spec.segments ?? []) {
    expandPt(sg.x1, sg.y1);
    expandPt(sg.x2, sg.y2, (sg.label ?? "").length);
  }
  for (const t of spec.texts ?? []) {
    expandPt(t.x, t.y, (t.text ?? "").length + 2);
  }
  for (const c of spec.circles ?? []) {
    expandPt(c.cx - c.r, c.cy);
    expandPt(c.cx + c.r, c.cy);
    expandPt(c.cx, c.cy - c.r);
    expandPt(c.cx, c.cy + c.r);
  }
  for (const fn of spec.functions ?? []) {
    if (fn.labelX != null && fn.labelY != null) {
      expandPt(fn.labelX, fn.labelY, (fn.label ?? "").length + 2);
    }
  }

  // 최소 여백 보장 (원래 범위의 8%)
  const marginX = xSpan * 0.08;
  const marginY = ySpan * 0.08;
  xMin = Math.min(xR[0], xMin - marginX);
  xMax = Math.max(xR[1], xMax + marginX);
  yMin = Math.min(yR[0], yMin - marginY);
  yMax = Math.max(yR[1], yMax + marginY);

  return { xRange: [xMin, xMax], yRange: [yMin, yMax] };
}

export default function GraphRenderer({ spec }: { spec: GraphSpecWithExport }) {
  const clipId = useId().replace(/:/g, "_");

  // 함수 라벨에서 축 변수 자동 감지
  const { xLabel, yLabel } = useMemo(() => detectAxisLabels(spec), [spec]);

  // 모든 요소가 잘리지 않도록 데이터 범위 자동 확장
  const { xRange: autoXR, yRange: autoYR } = useMemo(() => expandRangeToFitAll(spec), [spec]);
  const xR = autoXR;
  const yR = autoYR;
  const xS = xR[1] - xR[0];
  const yS = yR[1] - yR[0];
  const noAxes = spec.noAxes ?? false;

  // 확장된 범위에 맞게 SVG 크기 자동 계산
  const baseSize = SIZE_MAP[spec.size ?? "medium"];
  const plotW = baseSize.w - PAD.left - PAD.right;
  const plotH = baseSize.h - PAD.top - PAD.bottom;
  const origXS = (spec.xRange?.[1] ?? 5) - (spec.xRange?.[0] ?? -5);
  const origYS = (spec.yRange?.[1] ?? 5) - (spec.yRange?.[0] ?? -5);
  const scaleX = origXS > 0 ? xS / origXS : 1;
  const scaleY = origYS > 0 ? yS / origYS : 1;
  const W = Math.round(PAD.left + plotW * scaleX + PAD.right);
  const H = Math.round(PAD.top + plotH * scaleY + PAD.bottom);

  const rawPW = W - PAD.left - PAD.right;
  const rawPH = H - PAD.top - PAD.bottom;
  const unitPx = Math.min(rawPW / xS, rawPH / yS);
  const pW = unitPx * xS;
  const pH = unitPx * yS;

  const tx = (x: number) => PAD.left + ((x - xR[0]) / xS) * pW;
  const ty = (y: number) => PAD.top + ((yR[1] - y) / yS) * pH;
  const sc = (v: number) => (v / xS) * pW;

  const hasOX = xR[0] <= 0 && 0 <= xR[1];
  const hasOY = yR[0] <= 0 && 0 <= yR[1];
  const ox = hasOY ? tx(0) : PAD.left;
  const oy = hasOX ? ty(0) : PAD.top + pH;

  const curves = useMemo(() => (spec.functions ?? []).map((f) => {
    const fn = compileFn(f.fn);
    if (!fn) return null;
    let d = "";
    let on = false;
    const ext = xS * 0.15;
    const N = 1000;
    for (let i = 0; i <= N; i++) {
      const xv = (xR[0] - ext) + i * (xS + 2 * ext) / N;
      const yv = fn(xv);
      if (!isFinite(yv)) { on = false; continue; }
      const px = tx(xv), py = ty(yv);
      if (py < -60 || py > H + 60) { on = false; continue; }
      d += on ? `L${px.toFixed(1)},${py.toFixed(1)}` : `M${px.toFixed(1)},${py.toFixed(1)}`;
      on = true;
    }
    return { d, dashed: f.dashed, label: f.label, fn };
  }), [spec.functions, xR, yR, xS, yS]);

  const regionPaths = useMemo(() => (spec.regions ?? []).map((r) => {
    const fn = compileFn(r.fn);
    if (!fn) return null;
    const N = 200;
    let d = `M${tx(r.x1).toFixed(1)},${ty(0).toFixed(1)}`;
    for (let i = 0; i <= N; i++) {
      const xv = r.x1 + i * (r.x2 - r.x1) / N;
      const yv = fn(xv);
      if (isFinite(yv)) d += `L${tx(xv).toFixed(1)},${ty(yv).toFixed(1)}`;
    }
    d += `L${tx(r.x2).toFixed(1)},${ty(0).toFixed(1)}Z`;
    return d;
  }), [spec.regions, xR, yR, xS, yS]);

  const xTip = W - 4;
  const yTip = 4;
  const aw = 8;
  const raSize = 8;

  const graphDivRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  const handleCopyGraph = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      const { captureOneGraph } = await import("@/lib/graphCapture");
      const blob = await captureOneGraph(spec);
      if (blob) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch {
          window.focus();
          await new Promise(r => setTimeout(r, 100));
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error("Graph copy failed:", err);
    }
    setCopying(false);
  }, [spec, copying]);

  return (
    <div className="my-4 group relative">
      {spec.title && (
        <div className="text-center text-[13px] font-semibold text-[var(--text-2)] mb-1">{spec.title}</div>
      )}
      <button
        onClick={handleCopyGraph}
        className="absolute top-1 right-1 z-10 px-2 py-1 rounded-lg text-[11px] font-semibold
          bg-white/80 dark:bg-black/60 border border-[var(--border)]
          text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-white
          opacity-0 group-hover:opacity-100 transition-all cursor-pointer print:hidden"
        title="그래프를 클립보드에 복사 (Ctrl+V로 붙여넣기)"
      >
        {copied ? "✓ 복사됨" : copying ? "⏳ 캡처 중..." : "📋 복사"}
      </button>
      <div ref={graphDivRef} className="mx-auto rounded-lg bg-white dark:bg-[var(--bg-card-solid)]" style={{ maxWidth: W, overflow: "visible" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
          <defs>
            <clipPath id={`gc${clipId}`}><rect x={0} y={0} width={W} height={H} /></clipPath>
          </defs>

          <g clipPath={`url(#gc${clipId})`}>
            {regionPaths.map((d, i) => d && <path key={`rg${i}`} d={d} fill={INK} fillOpacity={0.13} stroke="none" />)}

            {spec.circles?.map((c, i) => (
              <circle key={`ci${i}`} cx={tx(c.cx)} cy={ty(c.cy)} r={sc(c.r)}
                fill="none" stroke={INK} strokeWidth={1.2}
                strokeDasharray={c.dashed ? "5 3" : undefined} />
            ))}

            {spec.arcs?.map((a, i) => (
              <path key={`ar${i}`} d={arcPath(tx(a.cx), ty(a.cy), sc(a.r), a.startAngle, a.endAngle)}
                fill="none" stroke={INK} strokeWidth={1.2} />
            ))}

            {spec.segments?.map((sg, i) => {
              const isSolid = sg.solid === true;
              const isDashed = isSolid ? false : (sg.dashed !== false);
              return (
                <line key={`sg${i}`}
                  x1={tx(sg.x1)} y1={ty(sg.y1)} x2={tx(sg.x2)} y2={ty(sg.y2)}
                  stroke={INK}
                  strokeWidth={isSolid ? 1.4 : 0.9}
                  strokeDasharray={isDashed ? "5 3" : undefined}
                  opacity={isSolid ? 1 : 0.65} />
              );
            })}

            {spec.vLines?.map((v, i) => (
              <line key={`vl${i}`} x1={tx(v.x)} y1={PAD.top + pH + 6} x2={tx(v.x)} y2={PAD.top}
                stroke={INK} strokeWidth={0.8} strokeDasharray="4 2.5" opacity={0.5} />
            ))}
            {spec.hLines?.map((h, i) => (
              <line key={`hl${i}`} x1={PAD.left - 6} y1={ty(h.y)} x2={PAD.left + pW} y2={ty(h.y)}
                stroke={INK} strokeWidth={0.8} strokeDasharray="4 2.5" opacity={0.5} />
            ))}

            {curves.map((c, i) => c && (
              <path key={`fn${i}`} d={c.d} fill="none" stroke={INK} strokeWidth={1.5}
                strokeDasharray={c.dashed ? "6 3.5" : undefined}
                strokeLinecap="round" strokeLinejoin="round" />
            ))}

            {spec.angles?.map((a, i) => {
              const r = sc(a.r ?? 0.3);
              return (
                <g key={`ag${i}`}>
                  <path d={arcPath(tx(a.cx), ty(a.cy), r, a.startAngle, a.endAngle)}
                    fill="none" stroke={INK} strokeWidth={0.6} />
                  {a.label && (() => {
                    const mid = deg2rad((a.startAngle + a.endAngle) / 2);
                    const lx = tx(a.cx) + (r + 7) * Math.cos(mid);
                    const ly = ty(a.cy) - (r + 7) * Math.sin(mid);
                    return <MathLabel x={lx} y={ly} text={a.label} fontSize={17} labelCtx="func" exportMode={spec.exportMode}
                      textAnchor="middle" dominantBaseline="central" />;
                  })()}
                </g>
              );
            })}
          </g>

          {!noAxes && (
            <>
              <line x1={PAD.left - 6} y1={oy} x2={xTip} y2={oy} stroke={INK} strokeWidth={0.9} />
              <polygon points={`${xTip},${oy} ${xTip - aw},${oy - aw * 0.36} ${xTip - aw},${oy + aw * 0.36}`} fill={INK} />
              <line x1={ox} y1={PAD.top + pH + 6} x2={ox} y2={yTip} stroke={INK} strokeWidth={0.9} />
              <polygon points={`${ox},${yTip} ${ox - aw * 0.36},${yTip + aw} ${ox + aw * 0.36},${yTip + aw}`} fill={INK} />
              {/* 축 눈금 (tick marks) */}
              {spec.vLines?.map((v, i) => (
                <line key={`vlt${i}`} x1={tx(v.x)} y1={oy - 4} x2={tx(v.x)} y2={oy + 4}
                  stroke={INK} strokeWidth={0.9} />
              ))}
              {spec.hLines?.map((h, i) => (
                <line key={`hlt${i}`} x1={ox - 4} y1={ty(h.y)} x2={ox + 4} y2={ty(h.y)}
                  stroke={INK} strokeWidth={0.9} />
              ))}
              {hasOX && hasOY && (
                <text x={ox - 12} y={oy + 19} fontSize={17} fill={INK} fontFamily={FONT} textAnchor="middle"
                  {...HALO}>O</text>
              )}
              <text x={xTip - 1} y={oy + 19} fontSize={17} fill={INK} fontFamily={FONT} fontStyle="italic" textAnchor="end"
                {...HALO}>{xLabel}</text>
              <text x={ox - 14} y={yTip + 4} fontSize={17} fill={INK} fontFamily={FONT} fontStyle="italic"
                {...HALO}>{yLabel}</text>
            </>
          )}

          {spec.rightAngles?.map((ra, i) => {
            const ang = deg2rad(ra.angle ?? 0);
            const s = raSize;
            const px = tx(ra.x), py = ty(ra.y);
            const dx1 = s * Math.cos(ang), dy1 = -s * Math.sin(ang);
            const dx2 = s * Math.cos(ang + Math.PI / 2), dy2 = -s * Math.sin(ang + Math.PI / 2);
            return (
              <path key={`ra${i}`}
                d={`M${px + dx1},${py + dy1}L${px + dx1 + dx2},${py + dy1 + dy2}L${px + dx2},${py + dy2}`}
                fill="none" stroke={INK} strokeWidth={0.6} />
            );
          })}

          {spec.points?.map((p, i) => (
            <circle key={`pt${i}`} cx={tx(p.x)} cy={ty(p.y)} r={4.2} fill={INK} />
          ))}

          {spec.hollowPoints?.map((p, i) => (
            <circle key={`hp${i}`} cx={tx(p.x)} cy={ty(p.y)} r={4.2} fill="#fff" stroke={INK} strokeWidth={1.8} />
          ))}

          {/* 물리 시뮬레이션 기반 라벨 배치 시스템 */}
          {(() => {
            interface LabelItem { x: number; y: number; w: number; h: number; anchorX: number; anchorY: number }
            const labels: Array<LabelItem & { key: string; text: string; fontSize: number; labelCtx?: LabelCtx; textAnchor?: string }> = [];

            const MARGIN = 4;
            const inBounds = (lx: number, ly: number, lw: number) =>
              lx > MARGIN && lx + lw < W - MARGIN && ly > PAD.top && ly < PAD.top + pH;

            const sampleCurve = (fn: (x: number) => number, px: number, py: number, radius: number): number => {
              let minDist = Infinity;
              for (let sx = Math.max(PAD.left, px - radius); sx < Math.min(W - PAD.right, px + radius); sx += 2) {
                const mx = xR[0] + ((sx - PAD.left) / pW) * xS;
                try {
                  const my = fn(mx);
                  if (!isFinite(my)) continue;
                  const sy = ty(my);
                  const d = Math.hypot(sx - px, sy - py);
                  if (d < minDist) minDist = d;
                } catch { /* skip */ }
              }
              return minDist;
            };

            // 1) 함수 라벨 — AI 좌표 우선, 없으면 그래프 전체 그리드에서 최적 빈 공간 탐색
            for (let i = 0; i < curves.length; i++) {
              const c = curves[i];
              if (!c?.label) continue;
              const fnSpec = (spec.functions ?? [])[i];
              const fn = c.fn;
              const lw = c.label.length * 10;

              if (fnSpec?.labelX != null && fnSpec?.labelY != null) {
                const px = tx(fnSpec.labelX), py = ty(fnSpec.labelY);
                labels.push({ x: px, y: py, w: lw, h: 16, anchorX: px, anchorY: py,
                  key: `fl${i}`, text: c.label, fontSize: 17, labelCtx: "func" });
                continue;
              }

              let bestPx = tx(xR[0] + xS * 0.7), bestPy = PAD.top + pH * 0.3;
              let bestScore = -Infinity;

              for (let gx = 0.05; gx <= 0.95; gx += 0.05) {
                for (let gy = 0.05; gy <= 0.95; gy += 0.07) {
                  const px = PAD.left + pW * gx;
                  const py = PAD.top + pH * gy;
                  if (!inBounds(px, py, lw)) continue;

                  let score = 0;

                  let minCurveDist = Infinity;
                  for (const curve of curves) {
                    if (!curve) continue;
                    const cd = sampleCurve(curve.fn, px + lw / 2, py, lw);
                    minCurveDist = Math.min(minCurveDist, cd);
                  }
                  score += Math.min(minCurveDist, 60) * 3;

                  const ownCurveDist = sampleCurve(fn, px + lw / 2, py, lw);
                  if (ownCurveDist > 80) score -= 40;

                  for (const other of labels) {
                    const ddx = Math.abs(px - other.x), ddy = Math.abs(py - other.y);
                    if (ddx < (lw + other.w) / 2 + 10 && ddy < 26) score -= 100;
                  }

                  const edgeDist = Math.min(px - MARGIN, W - MARGIN - px - lw, py - PAD.top - 2, PAD.top + pH - py - 2);
                  score += Math.min(edgeDist, 25);

                  if (i % 2 === 0) score += gx * 12;
                  else score += (1 - gx) * 12;

                  if (score > bestScore) { bestScore = score; bestPx = px; bestPy = py; }
                }
              }

              labels.push({ x: bestPx, y: bestPy, w: lw, h: 16, anchorX: bestPx, anchorY: bestPy,
                key: `fl${i}`, text: c.label, fontSize: 17, labelCtx: "func" });
            }

            // 2) 점 라벨
            const allPts = [
              ...(spec.points ?? []).map((p, i) => ({ ...p, key: `pl${i}` })),
              ...(spec.hollowPoints ?? []).map((p, i) => ({ ...p, key: `hpl${i}` })),
            ];
            for (const p of allPts) {
              if (!p.label) continue;
              const px = tx(p.x), py = ty(p.y);
              const lw = p.label.length * 10;

              if (p.labelPos) {
                const [dx, dy] = labelOffset(p.labelPos);
                labels.push({ x: px + dx, y: py + dy, w: lw, h: 16, anchorX: px, anchorY: py,
                  key: p.key, text: p.label, fontSize: 17, labelCtx: "point" });
                continue;
              }

              const dirs: Array<[number, number]> = [[10,-14],[-18,-14],[10,18],[-18,18],[-2,-18],[-2,22],[18,4],[-24,4]];
              let bestDx = dirs[0][0], bestDy = dirs[0][1], bestScore = -Infinity;
              for (const [dx, dy] of dirs) {
                const cx = px + dx, cy = py + dy;
                let score = 0;
                for (const other of labels) {
                  const ddx = Math.abs(cx - other.x), ddy = Math.abs(cy - other.y);
                  if (ddx < (lw + other.w) / 2 + 8 && ddy < 24) score -= 100;
                }
                for (const curve of curves) {
                  if (!curve) continue;
                  const cd = sampleCurve(curve.fn, cx, cy, 20);
                  score += Math.min(cd, 25);
                }
                score += Math.min(Math.abs(cy - oy), Math.abs(cx - ox)) * 0.2;
                if (score > bestScore) { bestScore = score; bestDx = dx; bestDy = dy; }
              }
              labels.push({ x: px + bestDx, y: py + bestDy, w: lw, h: 16, anchorX: px, anchorY: py,
                key: p.key, text: p.label, fontSize: 17, labelCtx: "point" });
            }

            // 3) 텍스트 라벨 — 축 근처 라벨은 자동으로 겹침 회피
            for (const [i, t] of (spec.texts ?? []).entries()) {
              let lx = tx(t.x), ly = ty(t.y);
              const lw = t.text.length * 10;
              if (Math.abs(lx - ox) < 20 && Math.abs(ly - oy) < 20) {
                lx += 22; ly -= 14;
              }
              labels.push({ x: lx, y: ly, w: lw, h: 16, anchorX: lx, anchorY: ly,
                key: `tx${i}`, text: t.text, fontSize: t.fontSize ? t.fontSize * 1.6 : 16, labelCtx: "point" });
            }

            // 4) 기타 라벨
            for (const [i, c] of (spec.circles ?? []).entries()) {
              if (!c.label) continue;
              labels.push({ x: tx(c.cx) - sc(c.r) - 5, y: ty(c.cy + c.r) - 5, w: 30, h: 16, anchorX: tx(c.cx), anchorY: ty(c.cy),
                key: `cl${i}`, text: c.label, fontSize: 15, labelCtx: "func", textAnchor: "end" });
            }
            for (const [i, a] of (spec.arcs ?? []).entries()) {
              if (!a.label) continue;
              const mid = deg2rad((a.startAngle + a.endAngle) / 2);
              labels.push({ x: tx(a.cx) + (sc(a.r) + 12) * Math.cos(mid), y: ty(a.cy) - (sc(a.r) + 12) * Math.sin(mid) + 3,
                w: 30, h: 16, anchorX: tx(a.cx), anchorY: ty(a.cy),
                key: `al${i}`, text: a.label, fontSize: 15, labelCtx: "func", textAnchor: "middle" });
            }
            for (const [i, sg] of (spec.segments ?? []).entries()) {
              if (!sg.label) continue;
              labels.push({ x: (tx(sg.x1) + tx(sg.x2)) / 2, y: (ty(sg.y1) + ty(sg.y2)) / 2 - 6, w: 30, h: 16,
                anchorX: (tx(sg.x1) + tx(sg.x2)) / 2, anchorY: (ty(sg.y1) + ty(sg.y2)) / 2,
                key: `sl${i}`, text: sg.label, fontSize: 15, textAnchor: "middle" });
            }
            for (const [i, v] of (spec.vLines ?? []).entries()) {
              if (!v.label) continue;
              const lw = v.label.length * 9;
              labels.push({ x: tx(v.x) - lw / 2, y: oy + 18, w: lw, h: 16,
                anchorX: tx(v.x) - lw / 2, anchorY: oy + 18,
                key: `vll${i}`, text: v.label, fontSize: 17, labelCtx: "value", textAnchor: "middle" });
            }
            for (const [i, h] of (spec.hLines ?? []).entries()) {
              if (!h.label) continue;
              const lw = h.label.length * 9;
              labels.push({ x: ox - 10 - lw, y: ty(h.y) + 5, w: lw, h: 16,
                anchorX: ox - 10 - lw, anchorY: ty(h.y) + 5,
                key: `hll${i}`, text: h.label, fontSize: 17, labelCtx: "value", textAnchor: "end" });
            }

            // 5) 축 라벨(O, x, y) 장애물 등록 — 시뮬레이션에서 충돌 회피용
            if (!noAxes && hasOX && hasOY) {
              labels.push({ x: ox - 18, y: oy + 6, w: 16, h: 16, anchorX: ox - 10, anchorY: oy + 16,
                key: "_o", text: "", fontSize: 0 });
            }
            if (!noAxes) {
              labels.push({ x: xTip - 14, y: oy + 6, w: 14, h: 16, anchorX: xTip, anchorY: oy + 16,
                key: "_x", text: "", fontSize: 0 });
              labels.push({ x: ox - 20, y: yTip - 2, w: 14, h: 16, anchorX: ox - 12, anchorY: yTip + 4,
                key: "_y", text: "", fontSize: 0 });
            }

            // 6) 물리 시뮬레이션 — 30회 반복, 강화된 충돌/곡선 반발
            for (let iter = 0; iter < 30; iter++) {
              for (let a = 0; a < labels.length; a++) {
                if (!labels[a].text) continue;
                let fx = 0, fy = 0;
                const la = labels[a];

                for (let b = 0; b < labels.length; b++) {
                  if (a === b) continue;
                  const lb = labels[b];
                  const dx = la.x - lb.x, dy = la.y - lb.y;
                  const dist = Math.max(Math.hypot(dx, dy), 1);
                  const overlap = (la.w + lb.w) / 2 + 10 - Math.abs(dx);
                  const overlapY = (la.h + lb.h) / 2 + 8 - Math.abs(dy);
                  if (overlap > 0 && overlapY > 0) {
                    const force = Math.min(overlap, 20) * 0.5;
                    fx += (dx / dist) * force;
                    fy += (dy / dist) * force;
                  }
                }

                for (const curve of curves) {
                  if (!curve) continue;
                  const cd = sampleCurve(curve.fn, la.x + la.w / 2, la.y, la.w);
                  if (cd < 20) {
                    fy -= (20 - cd) * 0.5;
                  }
                }

                const adx = la.anchorX - la.x, ady = la.anchorY - la.y;
                fx += adx * 0.03;
                fy += ady * 0.03;

                la.x += fx;
                la.y += fy;
                la.x = Math.max(MARGIN, Math.min(W - MARGIN - la.w, la.x));
                la.y = Math.max(PAD.top + 2, Math.min(PAD.top + pH - 2, la.y));
              }
            }

            return labels.filter(l => l.text).map(l => (
              <MathLabel key={l.key} x={l.x} y={l.y} text={l.text} fontSize={l.fontSize}
                labelCtx={l.labelCtx} textAnchor={l.textAnchor} exportMode={spec.exportMode} />
            ));
          })()}
        </svg>
      </div>
    </div>
  );
}
