import { NextRequest, NextResponse } from "next/server";
import { generateGraphSvg, type GraphSpec } from "@/lib/graphSvg";
import { Resvg } from "@resvg/resvg-js";

/**
 * POST /api/render-graph
 *
 * GraphSpec JSON → high-resolution PNG via pure SVG + resvg-js.
 * No Playwright, no Chromium — works on Vercel serverless.
 */
export async function POST(req: NextRequest) {
  try {
    const { spec, scale = 4 } = (await req.json()) as { spec: GraphSpec; scale?: number };
    if (!spec) {
      return NextResponse.json({ error: "spec required" }, { status: 400 });
    }

    const svg = generateGraphSvg(spec);

    const resvg = new Resvg(svg, {
      fitTo: { mode: "zoom" as const, value: scale },
      font: {
        loadSystemFonts: false,
      },
      background: "white",
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    return new Response(new Uint8Array(pngBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[render-graph]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "render failed" },
      { status: 500 },
    );
  }
}
