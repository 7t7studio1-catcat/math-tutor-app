/**
 * HWPX 내보내기 서비스
 *
 * 로컬: /api/export (Python COM) → 실패 시 /api/export-ts.
 * trycloudflare 호스트는 524 방지를 위해 export-ts만 사용.
 */

import type { ExportFormat } from "@/types/export";

function preferTsOnlyHwpxExport(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_HWPX_USE_TS_ONLY === "1") return true;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (host.endsWith(".trycloudflare.com") || host.includes("trycloudflare.com"))
    return true;
  return false;
}

/** Cloudflare Tunnel: 단일 POST가 ~100s 넘으면 524 → 202 + job 폴링 */
async function fetchExportTsAsync(options: ExportOptions): Promise<Blob> {
  const post = await fetch("/api/export-ts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hwpx-Async": "1",
    },
    body: JSON.stringify({ ...options, defer: true }),
  });

  if (post.status === 202) {
    const data = (await post.json()) as { jobId?: string };
    const jobId = data.jobId;
    if (!jobId) throw new Error("HWPX 작업을 시작하지 못했습니다");

    const deadline = Date.now() + 15 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const r = await fetch(
        `/api/export-ts/status?jobId=${encodeURIComponent(jobId)}`,
      );
      if (r.status === 200) return await r.blob();
      if (r.status === 500) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "HWPX 생성 실패");
      }
      if (r.status === 404) {
        throw new Error("HWPX 작업을 찾을 수 없습니다");
      }
    }
    throw new Error("HWPX 생성 시간이 초과되었습니다");
  }

  if (post.ok) return await post.blob();
  const data = await post.json().catch(() => ({}));
  throw new Error(
    (data as { error?: string }).error || "HWPX 생성 실패",
  );
}

async function fetchExportTs(options: ExportOptions): Promise<Blob> {
  if (preferTsOnlyHwpxExport()) {
    return fetchExportTsAsync(options);
  }

  const res = await fetch("/api/export-ts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "HWPX 생성 실패");
  }
  return await res.blob();
}

export interface ExportOptions {
  format: ExportFormat;
  sections?: string[];
  problems?: Array<{
    num: number;
    sections: string[];
    croppedImage?: string | null;
  }>;
  problemImage?: string | null;
  problemImageMime?: string | null;
  graphImages?: string[];
  includeOriginal?: boolean;
  publisherStyle?: string;
}

export async function exportHwpx(options: ExportOptions): Promise<Blob> {
  if (preferTsOnlyHwpxExport()) {
    return fetchExportTs(options);
  }

  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
      signal: AbortSignal.timeout(600_000),
    });
    if (res.ok) return await res.blob();
  } catch {
    /* fall through */
  }

  return fetchExportTs(options);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
