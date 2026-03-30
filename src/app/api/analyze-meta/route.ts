import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash";

const SYSTEM = `당신은 수능 수학 문제 분류 및 정답률 분석 전문가입니다.
주어진 문제 이미지와 풀이를 분석하여 메타데이터를 JSON으로 반환하세요.

반드시 아래 형식의 JSON만 반환하세요. 다른 텍스트 없이 JSON만.
{
  "unit1": "대단원",
  "unit2": "중단원",
  "unit3": "소단원",
  "unit4": "세부 유형",
  "isMultipleChoice": true,
  "estimatedRate": 42,
  "source": "2024학년도 수능 22번",
  "difficulty": "킬러"
}

★ 가장 중요: 정답률(estimatedRate) 정확도

이 문제가 실제 수능 또는 모의고사 기출문제인 경우:
- 반드시 해당 시험의 실제 공개된 정답률 데이터를 사용하세요.
- 문제 번호, 시험 연도, 선택지 등으로 기출 여부를 판별하세요.
- source에 "2024학년도 수능 22번" 등 출처를 명시하세요.

수능 정답률 참고 (이것은 대략적 가이드일 뿐, 실제 데이터를 우선하세요):
- 수능 1~9번: 대부분 정답률 80~95%
- 수능 10~15번: 정답률 50~80%
- 수능 16~20번: 정답률 30~60%
- 수능 21번: 정답률 10~30% (준킬러)
- 수능 22번: 정답률 2~15% (킬러)
- 수능 28번: 정답률 15~40% (준킬러 주관식)
- 수능 29번: 정답률 5~20% (킬러 주관식)
- 수능 30번: 정답률 2~10% (최고 킬러)

기출이 아닌 경우 유사 문제 난이도 기반으로 추정하되, 보수적으로 판단하세요.
어려운 문제를 쉽다고 하면 학생에게 해가 됩니다.

difficulty 기준:
- 객관식: 90%+기본, 70~89중하, 50~69중상, 30~49고난도, 30%미만 킬러
- 주관식: 80%+기본, 60~79중하, 40~59중상, 20~39고난도, 20%미만 킬러

분류:
- unit1~4: 수능/모의고사 기출 분류표 기준. 가능한 한 상세하게.
- isMultipleChoice: 선택지(①②③④⑤)가 있으면 true, 없으면 false`;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType = "image/jpeg", solutionContent = "", subject = "" } = await req.json();

    if (!imageBase64) return Response.json({ error: "이미지 없음" }, { status: 400 });
    if (!process.env.GEMINI_API_KEY) return Response.json({ error: "GEMINI_API_KEY 미설정 (.env.local 확인)" }, { status: 500 });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const parts = [
      { inlineData: { mimeType, data: imageBase64 } },
      { text: [
          subject ? `이 문제의 과목: ${subject}` : "",
          solutionContent ? `풀이:\n${solutionContent}` : "",
          "위 이미지의 수학 문제를 분석하여 메타데이터 JSON만 반환하세요.",
        ].filter(Boolean).join("\n\n")
      },
    ];

    let raw = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: MODEL,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: SYSTEM,
            maxOutputTokens: 1024,
            temperature: 0,
          },
        });
        raw = res.text ?? "";
        break;
      } catch (err) {
        if (attempt === 4) throw err;
        const delay = Math.min(3000 * Math.pow(2, attempt), 60_000);
        console.log(`[analyze-meta] 재시도 ${attempt + 1}/5 (${delay}ms 대기)...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn("[analyze-meta] JSON parsing failed, returning defaults");
      return Response.json({
        unit1: "", unit2: "", unit3: "", unit4: "",
        isMultipleChoice: true, difficulty: "", estimatedRate: 50,
      });
    }

    const meta = JSON.parse(match[0]);
    return Response.json(meta);

  } catch (err) {
    console.error("[analyze-meta] error:", err instanceof Error ? err.message : err);
    return Response.json({
      unit1: "", unit2: "", unit3: "", unit4: "",
      isMultipleChoice: true, difficulty: "", estimatedRate: 50,
    });
  }
}
