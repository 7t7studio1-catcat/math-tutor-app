import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

/**
 * POST /api/generate-diagram
 *
 * 자연어 다이어그램 설명 → Gemini 네이티브 이미지 생성 → base64 PNG.
 * 복잡한 기하 도형, 3D 입체, 좌표 기하 등 GraphSpec으로 표현 불가능한 수학 다이어그램용.
 */

const IMAGE_MODEL = "gemini-2.5-flash-image";

const DIAGRAM_SYSTEM = [
  "당신은 한국 수능 수학 시험지에 들어가는 수학 다이어그램/도형을 그리는 전문 일러스트레이터입니다.",
  "",
  "규칙:",
  "- 흑백 다이어그램만 생성 (인쇄 최적화)",
  "- 깔끔하고 정밀한 선, 정확한 라벨 배치",
  "- 수능 시험지 스타일: 얇은 실선, 점선 보조선, 이탤릭 라벨",
  "- 배경은 순백색",
  "- 텍스트 라벨은 크고 명확하게",
  "- 불필요한 장식 없이 수학적으로 정확하게",
  "- 각도 표시, 직각 기호, 길이 표시 등을 정확히 포함",
  "",
  "설명을 받으면 해당 다이어그램 이미지를 생성하세요.",
].join("\n");

export async function POST(req: NextRequest) {
  try {
    const { description, referenceImage } = (await req.json()) as {
      description: string;
      referenceImage?: string;
    };

    if (!description) {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY 미설정" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemContext = DIAGRAM_SYSTEM;
    const userPrompt = referenceImage
      ? `참고 이미지를 기반으로 다음 수학 다이어그램을 생성하세요:\n\n${description}`
      : `다음 수학 다이어그램을 생성하세요:\n\n${description}`;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    parts.push({ text: `${systemContext}\n\n---\n\n${userPrompt}` });

    if (referenceImage) {
      parts.push({
        inlineData: { mimeType: "image/png", data: referenceImage },
      });
    }

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      return NextResponse.json({ error: "이미지 생성 실패" }, { status: 500 });
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData?.data) {
        return NextResponse.json({
          image: part.inlineData.data,
          mimeType: part.inlineData.mimeType ?? "image/png",
        });
      }
    }

    const textParts = candidate.content.parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("");

    return NextResponse.json(
      { error: "이미지를 생성할 수 없습니다", detail: textParts },
      { status: 500 },
    );
  } catch (err) {
    console.error("[generate-diagram]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "다이어그램 생성 오류" },
      { status: 500 },
    );
  }
}
