/**
 * 통합 HWPX 내보내기 API
 *
 * 기존 3개 라우트(export-hwpx, export-hwpx-v2, export-workbook)를 하나로 통합.
 * format 파라미터로 분기: solution / solution-batch / workbook / workbook-multi
 *
 * 내부적으로 convert-hwpeqn 로직도 인라인하여 별도 API 호출 제거.
 */

import { NextRequest } from "next/server";
import { execFile, execSync } from "child_process";
import { writeFile, readFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";

import type { ExportFormat } from "@/types/export";

let generating = false;

function killHwpProcesses() {
  try {
    execSync("taskkill /IM Hwp.exe /F", { timeout: 5000, windowsHide: true, stdio: "ignore" });
  } catch { /* no process */ }
}

async function cleanup(dir: string) {
  try { await rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── AI 수식 변환 (convert-hwpeqn 인라인) ─────────────────────────────────────

const HWPEQN_MODEL = "gemini-2.5-flash";

const HWPEQN_SYSTEM_PROMPT = `당신은 LaTeX 수학 수식을 한글 수식편집기(HwpEqn) 문법으로 변환하는 전문가입니다.

마크다운 텍스트를 받으면, 그 안의 모든 LaTeX 수식($...$, $$...$$)을 HwpEqn 문법으로 변환하여 반환하세요.
수식이 아닌 일반 텍스트는 그대로 유지하세요.

변환 후 형식:
- 인라인 수식: $...$ → [EQ]HwpEqn 문자열[/EQ]
- 디스플레이 수식: $$...$$ → [DEQ]HwpEqn 문자열[/DEQ]
- 일반 텍스트: 그대로 유지

[핵심 변환 규칙]
분수: \\frac{a}{b} → {a} over {b} (항이 여러 개면 전체를 중괄호)
근호: \\sqrt{x} → sqrt {x}, \\sqrt[n]{x} → root {n} of {x}
함수 괄호: f(x) → f LEFT ( x RIGHT )
첨자: a_n → a _{n}, x^2 → x ^{2}
편미분: \\partial → Partial (대문자 P 필수)
적분: \\iint → dint, \\iiint → tint (iint/iiint 절대 금지)
프라임: f'(x) → f\` prime LEFT ( x RIGHT )
극한: \\lim → lim, \\sum → sum
화살표: \\to → ->, \\Rightarrow → =>
그리스: \\alpha → alpha, \\infty → inf
연산자: \\times → times, \\leq → <=, \\neq → !=, \\equiv → ==
벡터: \\vec{a} → vec {a}, \\overline{AB} → rm {bar{AB}}
볼드: \\mathbf{v} → {rmboldv}
행렬: \\begin{pmatrix} → {pmatrix{행1#행2}}
cases: \\begin{cases} → {cases{행1#행2}}
집합: \\cup → CUP, \\cap → INTER, \\in → in
조건 집합: {x | 조건} → LEFT lbrace x \`vert\` 조건 RIGHT rbrace
점 이름: {rmA}, {rmB}, 선분: rm {bar{AB}}, 확률: {rm P}
단위: {rm kg}, {rm m}

절대 금지: \\frac, \\sqrt, \\left, \\right, iint, partial(소문자), mathbfv`;

async function convertSectionsToHwpEqn(sections: string[]): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return sections;

  const hasLatex = sections.some((s) => s && /\$[^$]+\$/.test(s));
  if (!hasLatex) return sections;

  try {
    const allContent = sections.filter(Boolean).join("\n\n---SECTION_BREAK---\n\n");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${HWPEQN_MODEL}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: HWPEQN_SYSTEM_PROMPT }] },
        contents: [{
          parts: [{
            text: `아래 마크다운 텍스트의 모든 LaTeX 수식을 HwpEqn으로 변환하세요.\n인라인 수식 $...$ → [EQ]...[/EQ]\n디스플레이 수식 $$...$$ → [DEQ]...[/DEQ]\n일반 텍스트는 그대로 유지.\n\n${allContent}`,
          }],
        }],
        generationConfig: { maxOutputTokens: 65536, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      console.error(`[export] HwpEqn conversion failed: ${res.status}`);
      return sections;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      .map((p: { text: string }) => p.text)
      .join("") ?? "";

    if (!text) return sections;

    const converted = text.split("---SECTION_BREAK---").map((s: string) => s.trim());
    console.log(`[export] HwpEqn converted ${converted.length} section(s)`);
    return converted.length === sections.length ? converted : sections;
  } catch (e) {
    console.error("[export] HwpEqn conversion error:", e instanceof Error ? e.message : e);
    return sections;
  }
}

// ── 문제 이미지 AI 전사 ──────────────────────────────────────────────────────

const TRANSCRIBE_MODEL = "gemini-2.5-flash";

async function transcribeProblemImage(imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !imageBase64) return "";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: "이 수학 문제를 정확하게 타이핑해주세요.\n- 수식은 LaTeX 형식($...$, $$...$$)으로 작성\n- 선지는 ①②③④⑤로 표기\n- 문제 번호가 있으면 포함\n- 풀이나 해설은 절대 작성하지 말고 문제 본문만 작성\n- 마크다운 형식으로 작성" },
          ],
        }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (text) console.log(`[export] Transcribed (${text.length} chars)`);
    return text;
  } catch {
    return "";
  }
}

// ── 이미지/그래프 base64 → 임시 파일 저장 ─────────────────────────────────────

async function saveBase64Images(
  tempDir: string,
  graphImages?: string[],
  problemImage?: string | null,
  problemMime?: string | null,
): Promise<{ graphPaths: string[]; problemPath: string | null }> {
  const graphPaths: string[] = [];
  const promises: Promise<void>[] = [];

  if (graphImages) {
    for (let i = 0; i < graphImages.length; i++) {
      const b64 = graphImages[i];
      if (!b64) {
        graphPaths.push("");
        continue;
      }
      const imgPath = join(tempDir, `graph_${i}.png`);
      graphPaths.push(imgPath);
      promises.push(writeFile(imgPath, Buffer.from(b64, "base64")));
    }
  }

  let problemPath: string | null = null;
  if (problemImage) {
    const ext = (problemMime ?? "image/png").includes("jpeg") ? ".jpg" : ".png";
    problemPath = join(tempDir, `problem_image${ext}`);
    promises.push(writeFile(problemPath, Buffer.from(problemImage, "base64")));
  }

  await Promise.all(promises);
  return { graphPaths, problemPath };
}

// ── Python 스크립트 실행 ──────────────────────────────────────────────────────

function runPythonGenerator(
  format: string,
  inputPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const child = execFile(
      "python",
      ["-m", "scripts.hwpx", "--format", format, "--input", inputPath, "--output", outputPath],
      {
        timeout: 600_000,
        windowsHide: true,
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, _stdout, stderr) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (stderr) console.log("[export]", stderr);

        // 파일이 생성되었고 최소 크기를 넘으면 무조건 성공
        if (existsSync(outputPath)) {
          try {
            const { statSync } = require("fs");
            const size = statSync(outputPath).size;
            if (size > 100) {
              if (error) {
                console.log(`[export] Python exited with error but HWPX exists (${size}B, ${elapsed}s) — success`);
              } else {
                console.log(`[export] HWPX generated (${size}B, ${elapsed}s)`);
              }
              resolve();
              return;
            }
          } catch { /* stat failed, fall through */ }
        }

        if (error) {
          killHwpProcesses();
          const msg = error.message || "스크립트 실행 실패";
          if (/ETIMEDOUT|timeout|killed/i.test(String(msg))) {
            reject(new Error(`한글 생성 시간 초과 (${elapsed}s). 한글 프로그램이 실행 중이면 닫아 주세요.`));
          } else {
            reject(new Error(`HWPX 생성 실패 (${elapsed}s): ${msg}`));
          }
        } else {
          reject(new Error("HWPX 파일이 생성되지 않았습니다."));
        }
      },
    );
    child.on("error", (err) => {
      killHwpProcesses();
      reject(new Error(`Python 프로세스 실행 실패: ${err.message}`));
    });
  });
}

// ── POST 핸들러 ──────────────────────────────────────────────────────────────

interface ExportBody {
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
}

export async function POST(req: NextRequest) {
  if (generating) {
    return new Response(
      JSON.stringify({ error: "이미 한글 파일을 생성 중입니다. 잠시 후 다시 시도해주세요." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  generating = true;
  let tempDir = "";

  try {
    const body = (await req.json()) as ExportBody;
    const { format } = body;

    killHwpProcesses();
    tempDir = await mkdtemp(join(tmpdir(), "hwpx-"));
    const inputPath = join(tempDir, "data.json");
    const outputPath = join(tempDir, "output.hwpx");

    const { graphPaths, problemPath } = await saveBase64Images(
      tempDir, body.graphImages, body.problemImage, body.problemImageMime,
    );

    let jsonData: Record<string, unknown>;

    if (format === "solution") {
      const problemContent = "";
      const convertedSections = body.sections || [];
      jsonData = {
        sections: convertedSections,
        problemContent,
        problemImagePath: problemPath,
        graphImagePaths: graphPaths.length > 0 ? graphPaths : undefined,
      };

    } else if (format === "solution-batch") {
      const problems = [];
      for (let i = 0; i < (body.problems || []).length; i++) {
        const p = body.problems![i];
        let imgPath: string | null = null;
        if (p.croppedImage) {
          imgPath = join(tempDir, `problem_${p.num}.jpg`);
          await writeFile(imgPath, Buffer.from(p.croppedImage, "base64"));
        }
        problems.push({
          num: p.num,
          sections: p.sections,
          imagePath: imgPath,
          problemContent: "",
        });
      }
      jsonData = {
        problems,
        graphImagePaths: graphPaths.length > 0 ? graphPaths : undefined,
      };

    } else if (format === "workbook") {
      // Gemini HwpEqn 변환 생략 — Python 내장 latex_to_hwpeqn이 처리.
      // Gemini API 호출(~60s)을 제거하여 Cloudflare 100s 제한 내에 완료.
      const allSections = (body.sections || []).filter(Boolean);
      jsonData = {
        sections: allSections,
        problemImage: problemPath,
        graphImagePaths: graphPaths.length > 0 ? graphPaths : undefined,
      };

    } else if (format === "workbook-multi") {
      const problems = [];
      const imgPromises: Promise<void>[] = [];
      for (const p of body.problems || []) {
        const sections = p.sections.filter(Boolean);
        let cropPath: string | undefined;
        if (p.croppedImage) {
          cropPath = join(tempDir, `crop_${p.num}.jpg`);
          imgPromises.push(writeFile(cropPath, Buffer.from(p.croppedImage, "base64")));
        }
        problems.push({
          num: p.num,
          sections,
          cropImagePath: cropPath,
        });
      }
      await Promise.all(imgPromises);
      jsonData = {
        problems,
        includeOriginal: body.includeOriginal ?? true,
        graphImagePaths: graphPaths.length > 0 ? graphPaths : undefined,
      };

    } else {
      return new Response(
        JSON.stringify({ error: `Unknown format: ${format}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    await writeFile(inputPath, JSON.stringify(jsonData, null, 2), "utf-8");

    await runPythonGenerator(format, inputPath, outputPath);

    if (!existsSync(outputPath)) {
      throw new Error("HWPX 파일이 생성되지 않았습니다.");
    }

    const fileBuffer = await readFile(outputPath);
    cleanup(tempDir);

    const filename = format.startsWith("workbook") ? "workbook.hwpx" : "solution.hwpx";
    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

  } catch (err) {
    killHwpProcesses();
    if (tempDir) cleanup(tempDir);
    const msg = err instanceof Error ? err.message : "HWPX 생성 오류";
    console.error("[export]", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  } finally {
    generating = false;
  }
}
