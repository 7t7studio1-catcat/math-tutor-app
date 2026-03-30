import { NextRequest } from "next/server";
import { SECTION_PROMPTS, buildSection1Prompt, buildSection3Prompt, buildSection4Prompt, MODE_SIMPLE, MODE_DETAILED, MODE_SHORTCUT } from "@/lib/prompts";
import { buildVariationWithGraphPrompt } from "@/lib/variationGraphPrompts";

const MODEL = "gemini-3.1-pro-preview";
const THINKING_BUDGET = 16384;

const SSE_HEADERS = {
  "Content-Type":           "text/event-stream",
  "Cache-Control":          "no-cache, no-transform",
  "Connection":             "keep-alive",
  "X-Accel-Buffering":      "no",
  "X-Content-Type-Options": "nosniff",
} as const;

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const {
      imageBase64,
      mimeType = "image/jpeg",
      section = 1,
      section1Content = "",
      subject = "",
      solveMode = "",
      variationDifficulty = "",
      variationCount = 0,
      variationQuestionType = "multiple-choice",
    } = await req.json();

    if (!imageBase64) return jsonError("이미지가 제공되지 않았습니다.", 400);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return jsonError("GEMINI_API_KEY 미설정", 500);

    const sectionNum = section as 1 | 2 | 3 | 4;
    const SOLVE_MODE_MAP: Record<string, { system: string; user: string }> = {
      simple: MODE_SIMPLE, detailed: MODE_DETAILED, shortcut: MODE_SHORTCUT,
    };

    let prompt: { system: string; user: string };
    if (variationDifficulty && variationCount > 0) {
      prompt = buildVariationWithGraphPrompt(
        variationDifficulty as "easier" | "same" | "harder",
        variationCount,
        variationQuestionType as "multiple-choice" | "short-answer",
      );
    } else if (solveMode && SOLVE_MODE_MAP[solveMode]) {
      prompt = SOLVE_MODE_MAP[solveMode];
    } else {
      prompt =
        sectionNum === 1 && section1Content ? buildSection1Prompt(section1Content) :
        sectionNum === 3 && section1Content ? buildSection3Prompt(section1Content) :
        sectionNum === 4 && section1Content ? buildSection4Prompt(section1Content) :
        SECTION_PROMPTS[sectionNum as keyof typeof SECTION_PROMPTS];
    }

    if (subject) {
      prompt = { system: prompt.system + `\n\n[참고] 이 문제의 과목은 "${subject}"입니다.`, user: prompt.user };
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const geminiBody = {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: prompt.user },
        ],
      }],
      generationConfig: {
        maxOutputTokens: 65536,
        temperature: 0.6,
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      },
    };

    const enc = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      async start(ctrl) {
        const send = (raw: string) => {
          try { ctrl.enqueue(enc.encode(raw)); } catch { /* closed */ }
        };
        // Start heartbeat IMMEDIATELY (before Gemini responds)
        const ping = setInterval(() => send(": ping\n\n"), 5_000);
        send(": connected\n\n");

        try {
          const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiBody),
          });

          if (!geminiRes.ok) {
            const errText = await geminiRes.text().catch(() => "");
            console.error(`[analyze] Gemini ${geminiRes.status}:`, errText.slice(0, 300));
            send(`data: ${JSON.stringify({ error: `Gemini API 오류 (${geminiRes.status})` })}\n\n`);
            send("data: [DONE]\n\n");
            clearInterval(ping);
            ctrl.close();
            return;
          }

          if (!geminiRes.body) {
            send(`data: ${JSON.stringify({ error: "스트림 없음" })}\n\n`);
            send("data: [DONE]\n\n");
            clearInterval(ping);
            ctrl.close();
            return;
          }

          const reader = geminiRes.body.getReader();
          let buf = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });

            const lines = buf.split("\n");
            buf = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const json_str = line.slice(6).trim();
              if (!json_str || json_str === "[DONE]") continue;
              try {
                const parsed = JSON.parse(json_str);
                const parts = parsed?.candidates?.[0]?.content?.parts;
                if (!parts) continue;
                for (const part of parts) {
                  if (part.thought) continue;
                  if (part.text) {
                    send(`data: ${JSON.stringify({ text: part.text })}\n\n`);
                  }
                }
              } catch { /* skip unparseable */ }
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
    return jsonError(err instanceof Error ? err.message : "서버 오류", 500);
  }
}
