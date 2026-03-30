import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { MATH_TUTOR_SYSTEM_PROMPT, USER_PROMPT_TEMPLATE } from "./prompts.js";

const app = express();

// Railway는 상시 실행 서버 — 타임아웃 없음
app.use(express.json({ limit: "25mb" }));
app.use(cors({
  origin: process.env.FRONTEND_URL ?? "*",
  methods: ["POST", "GET", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

const MODEL = "gpt-5.4";
const EFFORT_LEVELS = ["high", "medium", "low"] as const;

app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: MODEL });
});

app.post("/analyze", async (req, res) => {
  const { imageBase64, mimeType = "image/jpeg", retryCount = 0 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: "이미지가 제공되지 않았습니다." });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "서버 설정 오류: OPENAI_API_KEY가 없습니다." });
  }

  const reasoning_effort = EFFORT_LEVELS[Math.min(retryCount, EFFORT_LEVELS.length - 1)];

  // SSE 헤더 설정
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx 버퍼링 비활성화

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const stream = await openai.chat.completions.create({
      model: MODEL,
      stream: true,
      max_completion_tokens: 32000,
      reasoning_effort,
      messages: [
        { role: "system", content: MATH_TUTOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
            { type: "text", text: USER_PROMPT_TEMPLATE },
          ],
        },
      ],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "스트리밍 오류";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

const PORT = parseInt(process.env.PORT ?? "3001", 10);
app.listen(PORT, () => {
  console.log(`Math Tutor API running on port ${PORT} (model: ${MODEL})`);
});
