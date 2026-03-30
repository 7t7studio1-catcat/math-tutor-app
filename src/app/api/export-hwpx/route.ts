import { NextRequest } from "next/server";
import { execFile, execSync } from "child_process";
import { writeFile, readFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";

let generating = false;

function killHwpProcesses() {
  try {
    execSync('taskkill /IM Hwp.exe /F', { timeout: 5000, windowsHide: true, stdio: 'ignore' });
    console.log("[hwpx] Killed leftover Hwp.exe");
  } catch { /* no process to kill */ }
}

const TRANSCRIBE_MODEL = "gemini-2.5-flash";

interface ProblemBlock {
  type: "text" | "equation" | "crop";
  content?: string;
  coords?: [number, number, number, number];
  description?: string;
}

interface HybridTranscription {
  blocks: ProblemBlock[];
  plainText: string;
}

const HYBRID_TRANSCRIBE_PROMPT = [
  "이 수학 문제 이미지를 분석하여 JSON 형식으로 반환하세요.",
  "",
  "=== 기본 규칙 (Nova AI 방식) ===",
  "- 텍스트와 수식은 반드시 타이핑, 도형/그래프/다이어그램만 크롭 지정",
  "- 위→아래, 왼→오른쪽 읽기 순서 준수",
  "- 모든 텍스트/수식/선지를 빠짐없이 타이핑",
  "- 손글씨 메모, 체크마크, 동그라미 등 무시 (인쇄된 내용만)",
  "",
  "=== 블록 타입 ===",
  '- {"type":"text","content":"..."} — 일반 텍스트 (문제 번호, 본문, 선지, [점수] 등)',
  '- {"type":"equation","content":"..."} — HwpEqn 수식 (아래 규칙 준수)',
  '- {"type":"crop","coords":[x1,y1,x2,y2],"description":"..."} — 도형/그래프 크롭 영역',
  "",
  "=== 크롭 규칙 ===",
  "좌표: 0.0~1.0 비율. 크롭 대상: 기하 도형, 함수 그래프, 좌표 다이어그램, 회로도, 실험 장치, 벤 다이어그램.",
  "크롭 금지: 순수 텍스트, 수식, 표, 선지 ①②③④⑤. 혼합 영역: 텍스트 타이핑 + 도형만 크롭.",
  "도형/그래프 없는 문제는 crop 없이 text/equation만.",
  "",
  "=== HwpEqn 수식 규칙 (한글 수식편집기 문법) ===",
  "equation 블록의 content는 반드시 HwpEqn 문법으로 작성. LaTeX 잔재(\\frac, \\sqrt 등) 절대 금지.",
  "",
  "[분수] {분자} over {분모}. 여러 항이면 전체를 중괄호로.",
  "  ✓ {a + b} over {2}   ✗ a + {b} over {2}",
  "[근호] sqrt {x}, n제곱근: {root {n} of {x}}",
  "[함수 괄호] f LEFT ( x RIGHT ), 대괄호: LEFT [ RIGHT ], 절댓값: LEFT | RIGHT |",
  "[첨자] a _{n}, x ^{2}, a _{n+1}",
  "[편미분] Partial (대문자 P 필수). ✗ partial",
  "[적분] 이중: dint, 삼중: tint. ✗ iint, int int",
  "[프라임] f` prime LEFT ( x RIGHT ). ✗ f', PRIME",
  "[극한] lim _{n -> inf}",
  "[시그마] sum _{k=1} ^{n} a _{k}",
  "[행렬] {pmatrix{a&b#c&d}}, {bmatrix{...}}, {dmatrix{...}}",
  "[연립] {cases{line1#line2}}. cases 바깥에 LEFT lbrace 금지.",
  "[화살표] ->, =>, <=>, <-",
  "[그리스] alpha, beta, theta, pi, inf, nabla (소문자)",
  "[연산자] times, cdot, pm, <=, >=, !=, approx, == (합동)",
  "[집합] CUP(합), INTER(교), subset, in, emptyset",
  "[기타] BOT(수직), DEG(각도), CENTIGRADE(온도), sim(닮음)",
  "[조건 집합] LEFT lbrace x `vert` 조건 RIGHT rbrace",
  "[미분소] dx dy dz (띄어 쓰기. dxdydz 금지)",
  "",
  "=== rm/it 규칙 (로만체 vs 이탤릭) ===",
  "변수는 이탤릭(기본), 이름표/라벨은 로만(rm).",
  "",
  "[점 이름] {rmA}, {rmB}, {rmP}, {rmQ}, {rmp}, {rmq}",
  "[선분] rm {bar{AB}} (반드시 rm으로 감싸기)",
  "  ✓ rm {bar{AB}} = rm {bar{AC}}",
  "  ✗ bar {AB} (이탤릭으로 렌더링됨)",
  "[확률] {rm P} LEFT ( A CUP B RIGHT )",
  "[물체/첨자 라벨] v _{rm A}, mu _{rm I}, W _{rm II}",
  "  물리량 변수(F, V, v, R, a, T) 자체는 이탤릭 유지!",
  "[단위] {rm kg}, {rm m}, {rm s}, {rm N}, {rm V}, {rm eV}",
  "[화학식] {rm H _{2} O}, {rm CO _{2}}",
  "[벡터 bold] 소문자: {rmboldv}, 대문자: {rm boldF}",
  "  혼합 수식: rm {bold{x}} it",
  "",
  "rm 금지 (이탤릭 유지): 수학 변수(x,y,f,g,n), 물리량(F,V,v,R,a,T), 오비탈(s,p,d,f), 시간(t,T)",
  "",
  "=== 절대 금지 ===",
  "✗ \\frac, \\sqrt, \\left, \\right (LaTeX 잔재)",
  "✗ iint, iiint, int int (→ dint, tint)",
  "✗ partial (소문자) (→ Partial)",
  "✗ mathbfv, boldsymbolx (→ {rmboldv})",
  "✗ bar {AB} (→ rm {bar{AB}})",
  "",
  '=== 응답 형식 (JSON만) ===',
  '{"blocks":[...]}',
  "",
  "예시 (도형 없는 문제):",
  '{"blocks":[',
  '  {"type":"text","content":"9. 닫힌구간 [1,3]에서 함수"},',
  '  {"type":"equation","content":"f LEFT ( x RIGHT ) = 2x ^{3} - 3x ^{2} - 12x + a"},',
  '  {"type":"text","content":"가 최댓값 M, 최솟값 4를 가질 때, M의 값은? (단, a는 상수이다.) [4점]"},',
  '  {"type":"text","content":"① 13  ② 14  ③ 15  ④ 16  ⑤ 17"}',
  "]}",
  "",
  "예시 (도형 있는 문제):",
  '{"blocks":[',
  '  {"type":"text","content":"10. 양수 k에 대하여 곡선"},',
  '  {"type":"equation","content":"y = log _{2} LEFT ( x - k RIGHT )"},',
  '  {"type":"text","content":"가 x축과 만나는 점을 A라 하자."},',
  '  {"type":"crop","coords":[0.55,0.05,0.95,0.55],"description":"좌표평면 위의 곡선과 직선 그래프"},',
  '  {"type":"text","content":"① 4  ② 6  ③ 8  ④ 10  ⑤ 12"}',
  "]}",
  "",
  "예시 (선분/점 이름):",
  '{"blocks":[',
  '  {"type":"text","content":"11. 삼각형 ABC에서"},',
  '  {"type":"equation","content":"rm {bar{AB}} = rm {bar{AC}}"},',
  '  {"type":"text","content":"일 때, 삼각형 ABC의 넓이는? [4점]"},',
  '  {"type":"text","content":"① 4  ② 6  ③ 8  ④ 10  ⑤ 12"}',
  "]}",
].join("\n");

async function transcribeProblemHybrid(
  imageBase64: string,
  mimeType: string,
): Promise<HybridTranscription | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !imageBase64) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: HYBRID_TRANSCRIBE_PROMPT },
          ],
        }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.log(`[hwpx] hybrid transcribe failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawText) return null;

    const parsed = JSON.parse(rawText) as { blocks?: ProblemBlock[] };
    if (!parsed.blocks || !Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
      return null;
    }

    const plainText = parsed.blocks
      .filter((b) => b.type === "text" || b.type === "equation")
      .map((b) => b.type === "equation" ? `$${b.content}$` : b.content)
      .join("\n");

    console.log(`[hwpx] Hybrid transcription: ${parsed.blocks.length} blocks (${parsed.blocks.filter(b => b.type === "crop").length} crops)`);
    return { blocks: parsed.blocks, plainText };
  } catch (e) {
    console.log("[hwpx] hybrid transcribe error:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function transcribeProblemImage(
  imageBase64: string,
  mimeType: string,
): Promise<string> {
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
            { text: [
              "이 수학 문제를 정확하게 타이핑해주세요.",
              "- 수식은 LaTeX 형식($...$, $$...$$)으로 작성",
              "- 선지는 ①②③④⑤로 표기",
              "- 문제 번호가 있으면 포함",
              "- 풀이나 해설은 절대 작성하지 말고 문제 본문만 작성",
              "- 마크다운 형식으로 작성",
            ].join("\n") },
          ],
        }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.log(`[hwpx] transcribe failed: ${res.status}`);
      return "";
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (text) console.log(`[hwpx] Problem transcribed (${text.length} chars)`);
    return text;
  } catch (e) {
    console.log("[hwpx] transcribe error:", e instanceof Error ? e.message : e);
    return "";
  }
}

async function cropImageRegion(
  imagePath: string,
  coords: [number, number, number, number],
  outputPath: string,
): Promise<string | null> {
  const cropScript = join(process.cwd(), "scripts", "crop_image.py");
  const coordStr = coords.join(",");
  return new Promise((resolve) => {
    execFile(
      "python",
      [cropScript, "--input", imagePath, "--output", outputPath, "--coords", coordStr],
      { timeout: 15_000, windowsHide: true },
      (error, _stdout, stderr) => {
        if (stderr) console.log("[hwpx-crop]", stderr);
        if (error || !existsSync(outputPath)) {
          resolve(null);
        } else {
          resolve(outputPath);
        }
      },
    );
  });
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
    const body = await req.json() as {
      mode: "single" | "batch";
      sections?: string[];
      problems?: Array<{ num: number; sections: string[]; croppedImage?: string | null }>;
      problemImage?: string | null;
      problemImageMime?: string | null;
      graphImages?: string[];
    };

    killHwpProcesses();

    tempDir = await mkdtemp(join(tmpdir(), "hwpx-"));
    const inputPath = join(tempDir, "solution.json");
    const outputPath = join(tempDir, "output.hwpx");

    const graphImagePaths: string[] = [];
    if (body.graphImages && body.graphImages.length > 0) {
      for (let i = 0; i < body.graphImages.length; i++) {
        const b64 = body.graphImages[i];
        if (!b64) { graphImagePaths.push(""); continue; }
        const imgPath = join(tempDir, `graph_${i}.png`);
        await writeFile(imgPath, Buffer.from(b64, "base64"));
        graphImagePaths.push(imgPath);
      }
      console.log(`[hwpx] ${graphImagePaths.filter(p => p).length} graph image(s) saved from web capture`);
    }

    let problemImagePath: string | null = null;
    if (body.mode === "single" && body.problemImage) {
      const ext = (body.problemImageMime ?? "image/png").includes("jpeg") ? ".jpg" : ".png";
      problemImagePath = join(tempDir, `problem_image${ext}`);
      await writeFile(problemImagePath, Buffer.from(body.problemImage, "base64"));
    }

    let jsonData: Record<string, unknown>;
    if (body.mode === "batch" && body.problems) {
      const transcriptions = await Promise.all(
        body.problems.map((p) =>
          p.croppedImage
            ? transcribeProblemImage(p.croppedImage, "image/jpeg")
            : Promise.resolve(""),
        ),
      );

      const problems = [];
      for (let i = 0; i < body.problems.length; i++) {
        const p = body.problems[i];
        let imgPath: string | null = null;
        if (p.croppedImage) {
          imgPath = join(tempDir, `problem_${p.num}.jpg`);
          await writeFile(imgPath, Buffer.from(p.croppedImage, "base64"));
        }
        problems.push({
          num: p.num,
          sections: p.sections,
          imagePath: imgPath,
          problemContent: transcriptions[i] || "",
        });
      }
      jsonData = {
        problems,
        graphImagePaths: graphImagePaths.length > 0 ? graphImagePaths : undefined,
      };
    } else {
      let problemContent = "";
      if (body.problemImage) {
        problemContent = await transcribeProblemImage(
          body.problemImage,
          body.problemImageMime ?? "image/png",
        );
      }

      jsonData = {
        sections: body.sections || [],
        problemContent,
        problemImagePath,
        graphImagePaths: graphImagePaths.length > 0 ? graphImagePaths : undefined,
      };
    }

    await writeFile(inputPath, JSON.stringify(jsonData, null, 2), "utf-8");

    const scriptPath = join(process.cwd(), "scripts", "hwpx_workbook_generator.py");
    const fmt = body.mode === "batch" ? "solution-batch" : "solution";

    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        "python",
        [scriptPath, "--input", inputPath, "--output", outputPath, "--format", fmt],
        {
          timeout: 120_000,
          windowsHide: true,
          cwd: process.cwd(),
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, _stdout, stderr) => {
          if (stderr) console.log("[hwpx]", stderr);
          if (error) {
            if (existsSync(outputPath)) {
              console.log("[hwpx] Python exited with error but output file exists — treating as success");
              resolve();
              return;
            }
            killHwpProcesses();
            const msg = error.message || "스크립트 실행 실패";
            if (String(msg).includes("ETIMEDOUT") || String(msg).includes("timeout") || String(msg).includes("killed")) {
              reject(new Error("한글 생성 시간 초과. 한글 프로그램이 실행 중이거나 대화상자가 떠 있으면 닫아 주세요."));
            } else {
              reject(new Error(msg));
            }
          } else {
            resolve();
          }
        },
      );

      child.on("error", (err) => {
        killHwpProcesses();
        reject(new Error(`프로세스 실행 실패: ${err.message}`));
      });
    });

    const fileBuffer = await readFile(outputPath);
    cleanup(tempDir);

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="solution.hwpx"`,
      },
    });
  } catch (err) {
    killHwpProcesses();
    if (tempDir) cleanup(tempDir);
    const msg = err instanceof Error ? err.message : "HWPX 생성 오류";
    console.error("[export-hwpx]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    generating = false;
  }
}

async function cleanup(dir: string) {
  try { await rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
