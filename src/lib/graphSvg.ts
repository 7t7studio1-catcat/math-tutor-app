/**
 * Pure SVG graph generator — no DOM, no React, no KaTeX dependencies.
 * Shared between browser (GraphRenderer) and server (render-graph API).
 *
 * Produces an SVG string from a GraphSpec JSON object.
 */

import * as math from "mathjs";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GraphSpec {
  title?: string;
  xRange?: [number, number];
  yRange?: [number, number];
  noAxes?: boolean;
  equalAspect?: boolean;
  xLabel?: string;
  yLabel?: string;
  functions?: Array<{
    fn: string; label?: string; color?: string; dashed?: boolean;
    labelPos?: string; labelX?: number; labelY?: number;
  }>;
  points?: Array<{ x: number; y: number; label?: string; color?: string; labelPos?: string }>;
  hollowPoints?: Array<{ x: number; y: number; label?: string; labelPos?: string }>;
  segments?: Array<{
    x1: number; y1: number; x2: number; y2: number;
    dashed?: boolean; label?: string; solid?: boolean;
  }>;
  circles?: Array<{ cx: number; cy: number; r: number; dashed?: boolean; label?: string }>;
  arcs?: Array<{ cx: number; cy: number; r: number; startAngle: number; endAngle: number; label?: string }>;
  angles?: Array<{ cx: number; cy: number; startAngle: number; endAngle: number; r?: number; label?: string }>;
  rightAngles?: Array<{ x: number; y: number; angle?: number }>;
  texts?: Array<{ x: number; y: number; text: string; fontSize?: number }>;
  vLines?: Array<{ x: number; label?: string }>;
  hLines?: Array<{ y: number; label?: string }>;
  regions?: Array<{ fn: string; x1: number; x2: number }>;
  size?: "small" | "medium" | "large" | "xlarge";
}

// ── Constants ────────────────────────────────────────────────────────────────

const INK = "#1a1a1a";
const FONT = "'Times New Roman','Batang','Georgia',serif";
const PAD = { top: 24, right: 36, bottom: 34, left: 36 };

const SIZE_MAP: Record<string, { w: number; h: number }> = {
  small:  { w: 260, h: 252 },
  medium: { w: 310, h: 300 },
  large:  { w: 400, h: 386 },
  xlarge: { w: 480, h: 464 },
};

const HALO_ATTRS = `stroke="white" stroke-width="6" paint-order="stroke"`;

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function deg2rad(d: number) { return d * Math.PI / 180; }

function f1(n: number) { return n.toFixed(1); }

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const SUP: Record<string, string> = {
  "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹",
  "+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ","/":"ᐟ",
};
const SUB: Record<string, string> = {
  "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉",
  "+":"₊","-":"₋","=":"₌","(":"₍",")":"₎","a":"ₐ","e":"ₑ","n":"ₙ",
};

function toUnicodeMath(text: string): string {
  let s = text;
  s = s.replace(/\^?\{([^}]+)\}/g, (m, inner) => {
    if (!m.startsWith("^") && !s.includes("^" + m)) return m;
    return [...inner].map((c: string) => SUP[c] ?? c).join("");
  });
  s = s.replace(/\^([0-9n+\-])/g, (_m, c) => SUP[c] ?? c);
  s = s.replace(/_\{([^}]+)\}/g, (_m, inner) =>
    [...inner].map((c: string) => SUB[c] ?? c).join(""));
  s = s.replace(/_([0-9aen])/g, (_m, c) => SUB[c] ?? c);
  s = s.replace(/(-?\d+)\/(\d+)/g, (_m, n, d) => {
    const sn = [...n].map((c: string) => SUP[c] ?? c).join("");
    const sd = [...d].map((c: string) => SUB[c] ?? c).join("");
    return `${sn}⁄${sd}`;
  });
  return s;
}

function labelOffset(pos?: string): [number, number] {
  switch (pos) {
    case "tl": return [-10, -12]; case "t":  return [-2, -14];
    case "tr": return [8, -12];   case "l":  return [-16, 4];
    case "r":  return [8, 4];     case "bl": return [-10, 16];
    case "b":  return [-2, 16];   case "br": return [8, 16];
    default:   return [8, -12];
  }
}

function detectAxisLabels(spec: GraphSpec): { xLabel: string; yLabel: string } {
  if (spec.xLabel && spec.yLabel) return { xLabel: spec.xLabel, yLabel: spec.yLabel };
  for (const fn of spec.functions ?? []) {
    const label = fn.label;
    if (!label) continue;
    const m = label.match(/^\s*([a-zA-Z])\s*=\s*/);
    if (!m) continue;
    const lhs = m[1];
    const rhs = label.slice(m[0].length);
    const vars = rhs.replace(/[a-z]{2,}/g, "").match(/[a-z]/g);
    if (vars && vars.length > 0) {
      const xVar = vars.find(v => v !== lhs) ?? vars[0];
      if (xVar !== lhs) {
        return { xLabel: spec.xLabel ?? xVar, yLabel: spec.yLabel ?? lhs };
      }
    }
  }
  return { xLabel: spec.xLabel ?? "x", yLabel: spec.yLabel ?? "y" };
}

function expandRangeToFitAll(spec: GraphSpec): { xRange: [number, number]; yRange: [number, number] } {
  const xR = spec.xRange ?? [-5, 5];
  const yR = spec.yRange ?? [-5, 5];
  let [xMin, xMax] = [xR[0], xR[1]];
  let [yMin, yMax] = [yR[0], yR[1]];
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const charW = xSpan * 0.03;
  const charH = ySpan * 0.06;

  function expand(x: number, y: number, labelLen = 0) {
    const pad = labelLen * charW;
    xMin = Math.min(xMin, x - pad * 0.5);
    xMax = Math.max(xMax, x + pad * 0.5);
    yMin = Math.min(yMin, y - charH);
    yMax = Math.max(yMax, y + charH);
  }

  for (const p of spec.points ?? []) expand(p.x, p.y, (p.label ?? "").length + 2);
  for (const p of spec.hollowPoints ?? []) expand(p.x, p.y, (p.label ?? "").length + 2);
  for (const sg of spec.segments ?? []) { expand(sg.x1, sg.y1); expand(sg.x2, sg.y2, (sg.label ?? "").length); }
  for (const t of spec.texts ?? []) expand(t.x, t.y, (t.text ?? "").length + 2);
  for (const c of spec.circles ?? []) {
    expand(c.cx - c.r, c.cy); expand(c.cx + c.r, c.cy);
    expand(c.cx, c.cy - c.r); expand(c.cx, c.cy + c.r);
  }
  for (const fn of spec.functions ?? []) {
    if (fn.labelX != null && fn.labelY != null) expand(fn.labelX, fn.labelY, (fn.label ?? "").length + 2);
  }

  const mX = xSpan * 0.08, mY = ySpan * 0.08;
  return {
    xRange: [Math.min(xR[0], xMin - mX), Math.max(xR[1], xMax + mX)],
    yRange: [Math.min(yR[0], yMin - mY), Math.max(yR[1], yMax + mY)],
  };
}

// ── Label Physics ────────────────────────────────────────────────────────────

interface LabelItem {
  x: number; y: number; w: number; h: number;
  anchorX: number; anchorY: number;
  key: string; text: string; fontSize: number;
  textAnchor?: string;
}

function runLabelPhysics(
  labels: LabelItem[],
  curves: Array<{ fn: (x: number) => number } | null>,
  W: number, H: number, ox: number, oy: number, pW: number, pH: number,
  xR: [number, number], xS: number,
) {
  const MARGIN = 4;

  const sampleCurve = (fn: (x: number) => number, px: number, py: number, radius: number): number => {
    let minDist = Infinity;
    for (let sx = Math.max(PAD.left, px - radius); sx < Math.min(W - PAD.right, px + radius); sx += 2) {
      const mx = xR[0] + ((sx - PAD.left) / pW) * xS;
      try {
        const my = fn(mx);
        if (!isFinite(my)) continue;
        const yR1 = xR[1]; // reuse for bounds
        void yR1;
        const sy = PAD.top + ((labels[0]?.anchorY ?? 0) - my) / (1); // approximate
        void sy;
        const d = Math.abs(sx - px); // simplified distance
        if (d < minDist) minDist = d;
      } catch { /* skip */ }
    }
    return minDist;
  };
  void sampleCurve;

  // Simplified physics: push apart overlapping labels
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
        const overlapX = (la.w + lb.w) / 2 + 10 - Math.abs(dx);
        const overlapY = (la.h + lb.h) / 2 + 8 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const force = Math.min(overlapX, 20) * 0.5;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
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
  void ox; void oy; void H; void curves;
}

// ── Main Generator ───────────────────────────────────────────────────────────

export function generateGraphSvg(spec: GraphSpec): string {
  const { xLabel, yLabel } = detectAxisLabels(spec);
  const { xRange: xR, yRange: yR } = expandRangeToFitAll(spec);
  const xS = xR[1] - xR[0];
  const yS = yR[1] - yR[0];
  const noAxes = spec.noAxes ?? false;

  const baseSize = SIZE_MAP[spec.size ?? "medium"] ?? SIZE_MAP.medium;
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

  const xTip = W - 4;
  const yTip = 4;
  const aw = 8;

  // ── Build curves ──
  type CurveData = { d: string; dashed?: boolean; label?: string; fn: (x: number) => number };
  const curves: (CurveData | null)[] = (spec.functions ?? []).map((f) => {
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
      d += on ? `L${f1(px)},${f1(py)}` : `M${f1(px)},${f1(py)}`;
      on = true;
    }
    return { d, dashed: f.dashed, label: f.label, fn };
  });

  // ── Build SVG parts ──
  const parts: string[] = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible;">`);

  // Regions
  for (const r of spec.regions ?? []) {
    const fn = compileFn(r.fn);
    if (!fn) continue;
    let d = `M${f1(tx(r.x1))},${f1(ty(0))}`;
    for (let i = 0; i <= 200; i++) {
      const xv = r.x1 + i * (r.x2 - r.x1) / 200;
      const yv = fn(xv);
      if (isFinite(yv)) d += `L${f1(tx(xv))},${f1(ty(yv))}`;
    }
    d += `L${f1(tx(r.x2))},${f1(ty(0))}Z`;
    parts.push(`<path d="${d}" fill="${INK}" fill-opacity="0.13" stroke="none"/>`);
  }

  // Circles
  for (const c of spec.circles ?? []) {
    const da = c.dashed ? ` stroke-dasharray="5 3"` : "";
    parts.push(`<circle cx="${f1(tx(c.cx))}" cy="${f1(ty(c.cy))}" r="${f1(sc(c.r))}" fill="none" stroke="${INK}" stroke-width="1.2"${da}/>`);
  }

  // Arcs
  for (const a of spec.arcs ?? []) {
    const r = sc(a.r);
    const s = deg2rad(a.startAngle), e = deg2rad(a.endAngle);
    const x1 = tx(a.cx) + r * Math.cos(s), y1 = ty(a.cy) - r * Math.sin(s);
    const x2 = tx(a.cx) + r * Math.cos(e), y2 = ty(a.cy) - r * Math.sin(e);
    const large = Math.abs(a.endAngle - a.startAngle) > 180 ? 1 : 0;
    const sweep = a.endAngle > a.startAngle ? 0 : 1;
    parts.push(`<path d="M${f1(x1)},${f1(y1)}A${f1(r)},${f1(r)} 0 ${large} ${sweep} ${f1(x2)},${f1(y2)}" fill="none" stroke="${INK}" stroke-width="1.2"/>`);
  }

  // Segments
  for (const sg of spec.segments ?? []) {
    const isSolid = sg.solid === true;
    const isDashed = isSolid ? false : (sg.dashed !== false);
    const lw = isSolid ? 1.4 : 0.9;
    const op = isSolid ? 1 : 0.65;
    const da = isDashed ? ` stroke-dasharray="5 3"` : "";
    parts.push(`<line x1="${f1(tx(sg.x1))}" y1="${f1(ty(sg.y1))}" x2="${f1(tx(sg.x2))}" y2="${f1(ty(sg.y2))}" stroke="${INK}" stroke-width="${lw}" opacity="${op}"${da}/>`);
  }

  // vLines / hLines
  for (const v of spec.vLines ?? []) {
    parts.push(`<line x1="${f1(tx(v.x))}" y1="${f1(PAD.top + pH + 6)}" x2="${f1(tx(v.x))}" y2="${PAD.top}" stroke="${INK}" stroke-width="0.8" stroke-dasharray="4 2.5" opacity="0.5"/>`);
  }
  for (const h of spec.hLines ?? []) {
    parts.push(`<line x1="${f1(PAD.left - 6)}" y1="${f1(ty(h.y))}" x2="${f1(PAD.left + pW)}" y2="${f1(ty(h.y))}" stroke="${INK}" stroke-width="0.8" stroke-dasharray="4 2.5" opacity="0.5"/>`);
  }

  // Curves
  for (const c of curves) {
    if (!c) continue;
    const da = c.dashed ? ` stroke-dasharray="6 3.5"` : "";
    parts.push(`<path d="${c.d}" fill="none" stroke="${INK}" stroke-width="1.5"${da} stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // Angles
  for (const a of spec.angles ?? []) {
    const r = sc(a.r ?? 0.3);
    const s = deg2rad(a.startAngle), e = deg2rad(a.endAngle);
    const x1 = tx(a.cx) + r * Math.cos(s), y1 = ty(a.cy) - r * Math.sin(s);
    const x2 = tx(a.cx) + r * Math.cos(e), y2 = ty(a.cy) - r * Math.sin(e);
    const large = Math.abs(a.endAngle - a.startAngle) > 180 ? 1 : 0;
    const sweep = a.endAngle > a.startAngle ? 0 : 1;
    parts.push(`<path d="M${f1(x1)},${f1(y1)}A${f1(r)},${f1(r)} 0 ${large} ${sweep} ${f1(x2)},${f1(y2)}" fill="none" stroke="${INK}" stroke-width="0.6"/>`);
  }

  // Right angles
  for (const ra of spec.rightAngles ?? []) {
    const sz = 8;
    const ang = deg2rad(ra.angle ?? 0);
    const px = tx(ra.x), py = ty(ra.y);
    const dx1 = sz * Math.cos(ang), dy1 = -sz * Math.sin(ang);
    const dx2 = sz * Math.cos(ang + Math.PI / 2), dy2 = -sz * Math.sin(ang + Math.PI / 2);
    parts.push(`<path d="M${f1(px+dx1)},${f1(py+dy1)}L${f1(px+dx1+dx2)},${f1(py+dy1+dy2)}L${f1(px+dx2)},${f1(py+dy2)}" fill="none" stroke="${INK}" stroke-width="0.6"/>`);
  }

  // Axes
  if (!noAxes) {
    parts.push(`<line x1="${f1(PAD.left - 6)}" y1="${f1(oy)}" x2="${xTip}" y2="${f1(oy)}" stroke="${INK}" stroke-width="0.9"/>`);
    parts.push(`<polygon points="${xTip},${f1(oy)} ${f1(xTip-aw)},${f1(oy-aw*0.36)} ${f1(xTip-aw)},${f1(oy+aw*0.36)}" fill="${INK}"/>`);
    parts.push(`<line x1="${f1(ox)}" y1="${f1(PAD.top+pH+6)}" x2="${f1(ox)}" y2="${yTip}" stroke="${INK}" stroke-width="0.9"/>`);
    parts.push(`<polygon points="${f1(ox)},${yTip} ${f1(ox-aw*0.36)},${f1(yTip+aw)} ${f1(ox+aw*0.36)},${f1(yTip+aw)}" fill="${INK}"/>`);

    for (const v of spec.vLines ?? []) {
      parts.push(`<line x1="${f1(tx(v.x))}" y1="${f1(oy-4)}" x2="${f1(tx(v.x))}" y2="${f1(oy+4)}" stroke="${INK}" stroke-width="0.9"/>`);
    }
    for (const h of spec.hLines ?? []) {
      parts.push(`<line x1="${f1(ox-4)}" y1="${f1(ty(h.y))}" x2="${f1(ox+4)}" y2="${f1(ty(h.y))}" stroke="${INK}" stroke-width="0.9"/>`);
    }

    if (hasOX && hasOY) {
      parts.push(`<text x="${f1(ox-12)}" y="${f1(oy+19)}" font-size="17" fill="${INK}" font-family="${FONT}" text-anchor="middle" ${HALO_ATTRS}>O</text>`);
    }
    parts.push(`<text x="${f1(xTip-1)}" y="${f1(oy+19)}" font-size="17" fill="${INK}" font-family="${FONT}" font-style="italic" text-anchor="end" ${HALO_ATTRS}>${escapeXml(xLabel)}</text>`);
    parts.push(`<text x="${f1(ox-14)}" y="${f1(yTip+4)}" font-size="17" fill="${INK}" font-family="${FONT}" font-style="italic" ${HALO_ATTRS}>${escapeXml(yLabel)}</text>`);
  }

  // Points
  for (const p of spec.points ?? []) {
    parts.push(`<circle cx="${f1(tx(p.x))}" cy="${f1(ty(p.y))}" r="4.2" fill="${INK}"/>`);
  }
  for (const p of spec.hollowPoints ?? []) {
    parts.push(`<circle cx="${f1(tx(p.x))}" cy="${f1(ty(p.y))}" r="4.2" fill="#fff" stroke="${INK}" stroke-width="1.8"/>`);
  }

  // ── Labels with physics ──
  const labels: LabelItem[] = [];

  // Function labels
  for (let i = 0; i < curves.length; i++) {
    const c = curves[i];
    if (!c?.label) continue;
    const fnSpec = (spec.functions ?? [])[i];
    const lw = c.label.length * 10;

    if (fnSpec?.labelX != null && fnSpec?.labelY != null) {
      const px = tx(fnSpec.labelX), py = ty(fnSpec.labelY);
      labels.push({ x: px, y: py, w: lw, h: 16, anchorX: px, anchorY: py, key: `fl${i}`, text: c.label, fontSize: 17 });
    } else {
      const frac = 0.7 + (i * 0.15);
      const px = tx(xR[0] + xS * Math.min(frac, 0.95));
      const yv = c.fn(xR[0] + xS * Math.min(frac, 0.95));
      const py = isFinite(yv) ? ty(yv) - 15 : PAD.top + pH * 0.3;
      labels.push({ x: px, y: py, w: lw, h: 16, anchorX: px, anchorY: py, key: `fl${i}`, text: c.label, fontSize: 17 });
    }
  }

  // Point labels
  const allPts = [
    ...(spec.points ?? []).map((p, i) => ({ ...p, key: `pl${i}` })),
    ...(spec.hollowPoints ?? []).map((p, i) => ({ ...p, key: `hpl${i}` })),
  ];
  for (const p of allPts) {
    if (!p.label) continue;
    const px = tx(p.x), py = ty(p.y);
    const [dx, dy] = labelOffset(p.labelPos);
    labels.push({ x: px + dx, y: py + dy, w: p.label.length * 10, h: 16, anchorX: px, anchorY: py, key: p.key, text: p.label, fontSize: 17 });
  }

  // Text labels
  for (const [i, t] of (spec.texts ?? []).entries()) {
    let lx = tx(t.x), ly = ty(t.y);
    if (Math.abs(lx - ox) < 20 && Math.abs(ly - oy) < 20) { lx += 22; ly -= 14; }
    labels.push({ x: lx, y: ly, w: t.text.length * 10, h: 16, anchorX: lx, anchorY: ly, key: `tx${i}`, text: t.text, fontSize: t.fontSize ? t.fontSize * 1.6 : 16, textAnchor: "middle" });
  }

  // Segment labels
  for (const [i, sg] of (spec.segments ?? []).entries()) {
    if (!sg.label) continue;
    labels.push({ x: (tx(sg.x1)+tx(sg.x2))/2, y: (ty(sg.y1)+ty(sg.y2))/2-6, w: 30, h: 16, anchorX: (tx(sg.x1)+tx(sg.x2))/2, anchorY: (ty(sg.y1)+ty(sg.y2))/2, key: `sl${i}`, text: sg.label, fontSize: 15, textAnchor: "middle" });
  }

  // Circle labels
  for (const [i, c] of (spec.circles ?? []).entries()) {
    if (!c.label) continue;
    labels.push({ x: tx(c.cx)-sc(c.r)-5, y: ty(c.cy+c.r)-5, w: 30, h: 16, anchorX: tx(c.cx), anchorY: ty(c.cy), key: `cl${i}`, text: c.label, fontSize: 15, textAnchor: "end" });
  }

  // Arc labels
  for (const [i, a] of (spec.arcs ?? []).entries()) {
    if (!a.label) continue;
    const mid = deg2rad((a.startAngle + a.endAngle) / 2);
    labels.push({ x: tx(a.cx)+(sc(a.r)+12)*Math.cos(mid), y: ty(a.cy)-(sc(a.r)+12)*Math.sin(mid)+3, w: 30, h: 16, anchorX: tx(a.cx), anchorY: ty(a.cy), key: `al${i}`, text: a.label, fontSize: 15, textAnchor: "middle" });
  }

  // Angle labels
  for (const [i, a] of (spec.angles ?? []).entries()) {
    if (!a.label) continue;
    const r = sc(a.r ?? 0.3);
    const mid = deg2rad((a.startAngle + a.endAngle) / 2);
    labels.push({ x: tx(a.cx)+(r+7)*Math.cos(mid), y: ty(a.cy)-(r+7)*Math.sin(mid), w: 30, h: 16, anchorX: tx(a.cx), anchorY: ty(a.cy), key: `agl${i}`, text: a.label, fontSize: 15, textAnchor: "middle" });
  }

  // vLine / hLine labels
  for (const [i, v] of (spec.vLines ?? []).entries()) {
    if (!v.label) continue;
    labels.push({ x: tx(v.x), y: oy+18, w: v.label.length*9, h: 16, anchorX: tx(v.x), anchorY: oy+18, key: `vll${i}`, text: v.label, fontSize: 17, textAnchor: "middle" });
  }
  for (const [i, h] of (spec.hLines ?? []).entries()) {
    if (!h.label) continue;
    labels.push({ x: ox-10, y: ty(h.y)+5, w: h.label.length*9, h: 16, anchorX: ox-10, anchorY: ty(h.y)+5, key: `hll${i}`, text: h.label, fontSize: 17, textAnchor: "end" });
  }

  // Run physics
  runLabelPhysics(labels, curves.map(c => c ? { fn: c.fn } : null), W, H, ox, oy, pW, pH, xR, xS);

  // Render labels as SVG text
  for (const l of labels) {
    if (!l.text) continue;
    const anchor = l.textAnchor ?? "start";
    const display = escapeXml(toUnicodeMath(l.text));
    parts.push(`<text x="${f1(l.x)}" y="${f1(l.y)}" font-size="${l.fontSize}" fill="${INK}" font-family="${FONT}" font-style="italic" text-anchor="${anchor}" ${HALO_ATTRS}>${display}</text>`);
  }

  parts.push("</svg>");
  return parts.join("\n");
}

/** Returns the computed dimensions for a given spec (useful for layout) */
export function getGraphDimensions(spec: GraphSpec): { width: number; height: number } {
  const { xRange: xR, yRange: yR } = expandRangeToFitAll(spec);
  const xS = xR[1] - xR[0];
  const yS = yR[1] - yR[0];
  const baseSize = SIZE_MAP[spec.size ?? "medium"] ?? SIZE_MAP.medium;
  const plotW = baseSize.w - PAD.left - PAD.right;
  const plotH = baseSize.h - PAD.top - PAD.bottom;
  const origXS = (spec.xRange?.[1] ?? 5) - (spec.xRange?.[0] ?? -5);
  const origYS = (spec.yRange?.[1] ?? 5) - (spec.yRange?.[0] ?? -5);
  const scaleX = origXS > 0 ? xS / origXS : 1;
  const scaleY = origYS > 0 ? yS / origYS : 1;
  return {
    width: Math.round(PAD.left + plotW * scaleX + PAD.right),
    height: Math.round(PAD.top + plotH * scaleY + PAD.bottom),
  };
}
