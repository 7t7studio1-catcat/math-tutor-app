/**
 * PDF 문제 식별 서비스
 */

import type { ProblemInfo } from "@/types/problem";

export async function identifyProblems(
  pageImages: string[],
): Promise<ProblemInfo[]> {
  const res = await fetch("/api/pdf-identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages: pageImages }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`문제 식별 실패 (${res.status})`);
  }

  const data = await res.json();
  return data.problems || [];
}

export async function cropProblemImage(
  pageCanvas: HTMLCanvasElement,
  yStart: number,
  yEnd: number,
): Promise<string> {
  const canvas = document.createElement("canvas");
  const sourceHeight = pageCanvas.height;
  const startPx = Math.floor(yStart * sourceHeight);
  const endPx = Math.ceil(yEnd * sourceHeight);
  const cropHeight = endPx - startPx;

  canvas.width = pageCanvas.width;
  canvas.height = cropHeight;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    pageCanvas,
    0, startPx, pageCanvas.width, cropHeight,
    0, 0, canvas.width, cropHeight,
  );

  return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
}
