import { NextRequest } from "next/server";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { IDENTIFY_SYSTEM, IDENTIFY_USER } from "@/lib/pdfBatchPrompts";

const MODEL = "gemini-3.1-pro-preview";

export interface ProblemInfo {
  num: number;
  pages: number[];
  yStart: number;
  yEnd: number;
}

function buildFallback(pageCount: number): ProblemInfo[] {
  const PROBLEMS_PER_PAGE = 4;
  const total = Math.max(1, pageCount * PROBLEMS_PER_PAGE);
  return Array.from({ length: total }, (_, i) => {
    const posInPage = i % PROBLEMS_PER_PAGE;
    return {
      num: i + 1,
      pages: [Math.min(Math.floor(i / PROBLEMS_PER_PAGE), pageCount - 1)],
      yStart: Math.round((posInPage / PROBLEMS_PER_PAGE) * 100),
      yEnd: Math.round(((posInPage + 1) / PROBLEMS_PER_PAGE) * 100),
    };
  });
}

function parseProblems(raw: string): ProblemInfo[] | null {
  try {
    const match = raw.match(/\{[\s\S]*"problems"[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { problems: ProblemInfo[] };
    if (!Array.isArray(parsed.problems) || parsed.problems.length === 0) return null;
    return parsed.problems
      .filter((p) => typeof p.num === "number" && Array.isArray(p.pages) && p.pages.length > 0)
      .map((p) => ({
        ...p,
        yStart: typeof p.yStart === "number" ? Math.max(0, Math.min(100, p.yStart)) : 0,
        yEnd: typeof p.yEnd === "number" ? Math.max(0, Math.min(100, p.yEnd)) : 100,
      }))
      .sort((a, b) => a.num - b.num);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { pages, mimeType = "image/jpeg" } = await req.json() as {
      pages: string[];
      mimeType?: string;
    };

    if (!pages || pages.length === 0)
      return Response.json({ error: "페이지가 없습니다." }, { status: 400 });
    if (!process.env.GEMINI_API_KEY)
      return Response.json({ error: "GEMINI_API_KEY 미설정 (.env.local 확인)" }, { status: 500 });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const parts = [
      ...pages.map((b64) => ({ inlineData: { mimeType, data: b64 } })),
      { text: IDENTIFY_USER },
    ];

    let raw = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: MODEL,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: IDENTIFY_SYSTEM,
            maxOutputTokens: 8192,
            temperature: 0.1,
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          },
        });
        raw = res.text ?? "";
        break;
      } catch (err) {
        if (attempt === 4) throw err;
        const delay = Math.min(3000 * Math.pow(2, attempt), 60_000);
        console.log(`[pdf-identify] 재시도 ${attempt + 1}/5 (${delay}ms 대기)...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    const problems = parseProblems(raw) ?? buildFallback(pages.length);
    return Response.json({ problems });

  } catch (err) {
    console.error("[pdf-identify] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "식별 오류" },
      { status: 500 }
    );
  }
}
