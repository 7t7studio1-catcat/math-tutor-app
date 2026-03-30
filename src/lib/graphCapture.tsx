"use client";

/**
 * 그래프 프리렌더 — resvg-js 서버 렌더링
 *
 * /api/render-graph에 GraphSpec을 보내면 서버에서 순수 SVG를 생성하고
 * resvg-js(Rust WASM)로 고해상도 PNG를 반환.
 * Playwright/Chromium 불필요 — Vercel 서버리스에서 완벽 동작.
 */

import type { GraphSpec } from "@/lib/graphSvg";

const GRAPH_BLOCK_RE = /`{3,}(?:language-)?graph[^\n]*\n([\s\S]*?)\n\s*`{3,}/g;
const GRAPH_MARKER_PREFIX = "[GRAPH_IMG:";
const GRAPH_MARKER_SUFFIX = "]";

export async function preRenderGraphs(sections: string[]): Promise<{
  processedSections: string[];
  graphImages: string[];
}> {
  const specs: GraphSpec[] = [];
  const processedSections: string[] = [];

  for (const section of sections) {
    let processed = section;
    const re = new RegExp(GRAPH_BLOCK_RE.source, GRAPH_BLOCK_RE.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(section)) !== null) {
      try {
        const spec = JSON.parse(match[1].trim()) as GraphSpec;
        const idx = specs.length;
        specs.push(spec);
        processed = processed.replace(
          match[0],
          `\n${GRAPH_MARKER_PREFIX}${idx}${GRAPH_MARKER_SUFFIX}\n`,
        );
      } catch { /* skip */ }
    }
    processedSections.push(processed);
  }

  if (specs.length === 0) return { processedSections: sections, graphImages: [] };
  const graphImages = await captureViaServer(specs);
  return { processedSections, graphImages };
}

/** 복사 버튼용: 단일 그래프를 서버에서 PNG로 렌더 */
export async function captureOneGraph(spec: GraphSpec): Promise<Blob | null> {
  try {
    const res = await fetch("/api/render-graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec, scale: 3 }),
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

async function captureOneSpec(spec: GraphSpec): Promise<string> {
  try {
    const res = await fetch("/api/render-graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec, scale: 3 }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("[graphCapture] server render failed:", res.status);
      return "";
    }
    const blob = await res.blob();
    const buf = await blob.arrayBuffer();
    return btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
  } catch (err) {
    console.error("[graphCapture]", err);
    return "";
  }
}

async function captureViaServer(specs: GraphSpec[]): Promise<string[]> {
  const CONCURRENCY = 4;
  const results: string[] = new Array(specs.length).fill("");
  const queue = specs.map((spec, i) => ({ spec, i }));

  const workers = Array.from({ length: Math.min(CONCURRENCY, specs.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      results[item.i] = await captureOneSpec(item.spec);
    }
  });
  await Promise.all(workers);
  return results;
}
