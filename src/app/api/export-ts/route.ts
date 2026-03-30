/**
 * POST /api/export-ts
 *
 * Pure TypeScript HWPX export — no Python, no COM, no Windows dependency.
 *
 * `defer: true` 또는 헤더 `X-Hwpx-Async: 1` 이면 202 + jobId 반환 후 백그라운드 생성.
 * (Cloudflare Tunnel 단일 요청 ~100s 제한 회피 — 클라이언트는 /api/export-ts/status 폴링)
 */

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { generateHwpx } from "@/lib/hwpx";
import { generateGraphSvg } from "@/lib/graphSvg";
import type { GraphSpec } from "@/lib/graphSvg";
import { getPublisherStyle } from "@/lib/hwpx/styles";
import {
  createPendingJob,
  rejectExportJob,
  resolveExportJob,
} from "@/lib/exportTsJobs";

const HWPEQN_MODEL = "gemini-2.5-flash";
/** 섹션별 Gemini 병렬도 (한 요청 전체 시간 ≈ 가장 느린 섹션) */
const HWPX_SECTION_CONCURRENCY = 4;

const HWPEQN_PROMPT = `당신은 LaTeX 수학 수식을 한글 수식편집기(HwpEqn) 문법으로 변환하는 전문가입니다.

마크다운 텍스트를 받으면, 그 안의 모든 LaTeX 수식($...$, $$...$$)을 HwpEqn 문법으로 변환하여 반환하세요.
수식이 아닌 일반 텍스트는 그대로 유지하세요.

변환 후 형식:
- 인라인 수식: $...$ → [EQ]HwpEqn 문자열[/EQ]
- 디스플레이 수식: $$...$$ → [DEQ]HwpEqn 문자열[/DEQ]
- 일반 텍스트: 그대로 유지

[핵심 변환 규칙]
분수: \\frac{a}{b} → {a} over {b}
근호: \\sqrt{x} → sqrt {x}
함수 괄호: f(x) → f LEFT ( x RIGHT )
첨자: a_n → a _{n}, x^2 → x ^{2}
편미분: \\partial → Partial
적분: \\iint → dint, \\iiint → tint
프라임: f'(x) → f\` prime LEFT ( x RIGHT )
극한: \\lim → lim, \\sum → sum
화살표: \\to → ->, \\Rightarrow → =>
벡터: \\vec{a} → vec {a}, \\overline{AB} → rm {bar{AB}}

절대 금지: \\frac, \\sqrt, \\left, \\right, iint, partial(소문자), mathbfv`;

async function convertOneSectionToHwpEqn(
  section: string,
  apiKey: string,
): Promise<string> {
  if (!section?.trim()) return section;
  if (!/\$[^$]+\$/.test(section)) return section;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${HWPEQN_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: HWPEQN_PROMPT }] },
        contents: [
          {
            parts: [
              {
                text: `아래 텍스트의 LaTeX 수식을 HwpEqn으로 변환 (수식이 아닌 텍스트는 그대로):\n\n${section}`,
              },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 32768, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) return section;

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.filter((p: { text?: string }) => p.text)
        .map((p: { text: string }) => p.text)
        .join("") ?? "";

    return text.trim() || section;
  } catch {
    return section;
  }
}

async function convertSectionsToHwpEqn(sections: string[]): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return sections;
  const key = apiKey;

  const results = new Array<string>(sections.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= sections.length) break;
      const section = sections[i] ?? "";
      results[i] = await convertOneSectionToHwpEqn(section, key);
    }
  }

  const workers = Math.min(HWPX_SECTION_CONCURRENCY, Math.max(1, sections.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

const GRAPH_BLOCK_RE = /`{3,}(?:language-)?graph[^\n]*\n([\s\S]*?)\n\s*`{3,}/g;

async function extractAndRenderGraphs(sections: string[]): Promise<{
  processedSections: string[];
  graphImages: Array<{ data: Buffer; mimeType: string }>;
}> {
  const specs: Array<{ spec: GraphSpec; sectionIdx: number }> = [];
  const processedSections = sections.map((section, si) => {
    let processed = section;
    const re = new RegExp(GRAPH_BLOCK_RE.source, GRAPH_BLOCK_RE.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(section)) !== null) {
      try {
        const spec = JSON.parse(match[1].trim()) as GraphSpec;
        const idx = specs.length;
        specs.push({ spec, sectionIdx: si });
        processed = processed.replace(match[0], `\n[GRAPH_IMG:${idx}]\n`);
      } catch {
        /* skip invalid JSON */
      }
    }
    return processed;
  });

  if (specs.length === 0) return { processedSections: sections, graphImages: [] };

  const { Resvg } = await import("@resvg/resvg-js");
  const graphImages = specs.map(({ spec }) => {
    const svg = generateGraphSvg(spec);
    const resvg = new Resvg(svg, {
      fitTo: { mode: "zoom" as const, value: 3 },
      background: "white",
    });
    const pngBuffer = Buffer.from(resvg.render().asPng());
    return { data: pngBuffer, mimeType: "image/png" };
  });

  return { processedSections, graphImages };
}

export interface ExportBody {
  format: "solution" | "solution-batch" | "workbook" | "workbook-multi";
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
  defer?: boolean;
}

async function buildHwpxFromBody(body: ExportBody): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  let allSections: string[] = [];
  if (body.format === "solution" || body.format === "workbook") {
    allSections = body.sections ?? [];
  } else if (body.problems) {
    allSections = body.problems.flatMap((p) => p.sections);
  }

  const convertedSections = await convertSectionsToHwpEqn(allSections);
  const { processedSections, graphImages } =
    await extractAndRenderGraphs(convertedSections);

  let problemImage: { data: Buffer; mimeType: string } | undefined;
  if (body.problemImage) {
    problemImage = {
      data: Buffer.from(body.problemImage, "base64"),
      mimeType: body.problemImageMime ?? "image/png",
    };
  }

  const allGraphImages = [...graphImages];
  if (body.graphImages) {
    for (const b64 of body.graphImages) {
      if (b64) {
        allGraphImages.push({
          data: Buffer.from(b64, "base64"),
          mimeType: "image/png",
        });
      }
    }
  }

  const style = getPublisherStyle(body.publisherStyle ?? "default");
  const hwpxBuffer = await generateHwpx({
    sections: processedSections,
    graphImages: allGraphImages,
    problemImage,
    settings: {
      ...style.settings,
      columns: body.format.startsWith("workbook") ? 2 : style.settings.columns,
    },
  });

  const filename = body.format.startsWith("workbook")
    ? "workbook.hwpx"
    : "solution.hwpx";

  return { buffer: Buffer.from(hwpxBuffer), filename };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExportBody;
    const asyncMode =
      body.defer === true || req.headers.get("x-hwpx-async") === "1";

    if (asyncMode) {
      const jobId = randomUUID();
      createPendingJob(jobId);

      void (async () => {
        try {
          const { buffer, filename } = await buildHwpxFromBody(body);
          resolveExportJob(jobId, buffer, filename);
        } catch (err) {
          rejectExportJob(
            jobId,
            err instanceof Error ? err.message : "HWPX 생성 오류",
          );
        }
      })();

      return Response.json({ jobId }, { status: 202 });
    }

    const { buffer, filename } = await buildHwpxFromBody(body);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[export-ts]", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "HWPX 생성 오류",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
