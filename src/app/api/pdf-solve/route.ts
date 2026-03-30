import { NextRequest } from "next/server";
import {
  buildPdfSection2Prompt,
  buildPdfSection1Prompt,
  buildPdfSection3Prompt,
  buildPdfSection4Prompt,
} from "@/lib/pdfBatchPrompts";

const MODEL = "gemini-3.1-pro-preview";
const THINKING_BUDGET = 16384;

const SSE_HEADERS = {
  "Content-Type":           "text/event-stream",
  "Cache-Control":          "no-cache, no-transform",
  "Connection":             "keep-alive",
  "X-Accel-Buffering":      "no",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function POST(req: NextRequest) {
  try {
    const {
      pages,
      problemNum,
      section = 1,
      section1Content = "",
      mimeType = "image/jpeg",
      croppedImage = false,
    } = await req.json() as {
      pages: string[];
      problemNum: number;
      section?: 1 | 2 | 3;
      section1Content?: string;
      mimeType?: string;
      croppedImage?: boolean;
    };

    if (!pages || pages.length === 0)
      return new Response(JSON.stringify({ error: "페이지 없음" }), { status: 400 });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY 미설정" }), { status: 500 });

    const sectionNum = section as 1 | 2 | 3 | 4;

    let prompt;
    if (croppedImage) {
      const { SECTION_PROMPTS, buildSection1Prompt, buildSection3Prompt, buildSection4Prompt } = await import("@/lib/prompts");
      if (sectionNum === 2) {
        prompt = SECTION_PROMPTS[2];
      } else if (sectionNum === 1) {
        prompt = section1Content ? buildSection1Prompt(section1Content) : SECTION_PROMPTS[1];
      } else if (sectionNum === 3) {
        prompt = section1Content ? buildSection3Prompt(section1Content) : SECTION_PROMPTS[3];
      } else {
        prompt = section1Content ? buildSection4Prompt(section1Content) : SECTION_PROMPTS[4];
      }
    } else {
      prompt =
        sectionNum === 2 ? buildPdfSection2Prompt(problemNum) :
        sectionNum === 1 ? buildPdfSection1Prompt(problemNum, section1Content) :
        sectionNum === 3 ? buildPdfSection3Prompt(problemNum, section1Content) :
                           buildPdfSection4Prompt(problemNum, section1Content);
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const imageParts = pages.map((b64) => ({ inlineData: { mimeType, data: b64 } }));

    const geminiBody = {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{
        parts: [...imageParts, { text: prompt.user }],
      }],
      generationConfig: {
        maxOutputTokens: 65536,
        temperature: 0.6,
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      },
    };

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error(`[pdf-solve] Gemini ${geminiRes.status}:`, errText.slice(0, 300));
      return new Response(
        JSON.stringify({ error: `Gemini API 오류 (${geminiRes.status})` }),
        { status: geminiRes.status === 429 ? 429 : geminiRes.status === 503 ? 503 : 500 },
      );
    }

    if (!geminiRes.body) {
      return new Response(JSON.stringify({ error: "스트림 없음" }), { status: 500 });
    }

    const enc = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      async start(ctrl) {
        const send = (raw: string) => {
          try { ctrl.enqueue(enc.encode(raw)); } catch { /* closed */ }
        };
        const ping = setInterval(() => send(": ping\n\n"), 12_000);

        try {
          const reader = geminiRes.body!.getReader();
          let buf = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });

            const lines = buf.split("\n");
            buf = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const parts = parsed?.candidates?.[0]?.content?.parts;
                if (!parts) continue;
                for (const part of parts) {
                  if (part.thought) continue;
                  if (part.text) {
                    send(`data: ${JSON.stringify({ text: part.text })}\n\n`);
                  }
                }
              } catch { /* skip */ }
            }
          }

          if (buf.trim() && buf.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(buf.slice(6).trim());
              const parts = parsed?.candidates?.[0]?.content?.parts;
              if (parts) {
                for (const part of parts) {
                  if (!part.thought && part.text) {
                    send(`data: ${JSON.stringify({ text: part.text })}\n\n`);
                  }
                }
              }
            } catch { /* skip */ }
          }

          send("data: [DONE]\n\n");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "스트리밍 오류";
          send(`data: ${JSON.stringify({ error: msg })}\n\n`);
        } finally {
          clearInterval(ping);
          ctrl.close();
        }
      },
    });

    return new Response(readable, { headers: SSE_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "서버 오류";
    console.error("[pdf-solve]", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
