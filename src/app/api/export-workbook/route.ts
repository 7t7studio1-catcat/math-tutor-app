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
    console.log("[export-workbook] Killed leftover Hwp.exe");
  } catch { /* no process to kill */ }
}

interface VariationProblem {
  num: number;
  content: string;
  choices: string[];
  graphImagePath?: string | null;
}

interface SolutionItem {
  num: number;
  answer_text: string;
  variation_point: string;
  explanation: string;
}

interface WorkbookRequest {
  format?: "structured" | "markdown" | "auto" | "multi";
  original_problem?: {
    source?: string;
    content?: string;
    imagePath?: string | null;
  };
  variations?: VariationProblem[];
  solutions?: SolutionItem[];
  graphImagePaths?: (string | null)[];
  /* markdown 모드용 기존 필드 */
  sections?: string[];
  problemImagePath?: string | null;
  /* 프론트엔드에서 base64로 전달되는 이미지 */
  problemImage?: string | null;
  problemImageMime?: string | null;
  graphImages?: string[];
  /* multi 모드: PDF 다문항 변형문제 합본 */
  problems?: Array<{ num: number; sections: string[]; cropImage?: string | null }>;
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
    const body = (await req.json()) as WorkbookRequest;

    killHwpProcesses();

    tempDir = await mkdtemp(join(tmpdir(), "wb-"));
    const inputPath = join(tempDir, "workbook_input.json");
    const outputPath = join(tempDir, "workbook_output.hwpx");

    // 원본 문제 이미지 저장 (base64 → 파일)
    let problemImagePath: string | null = body.problemImagePath ?? null;
    if (!problemImagePath && body.problemImage) {
      const ext = (body.problemImageMime ?? "image/png").includes("jpeg") ? ".jpg" : ".png";
      problemImagePath = join(tempDir, `problem_image${ext}`);
      await writeFile(problemImagePath, Buffer.from(body.problemImage, "base64"));
      console.log("[export-workbook] Problem image saved:", problemImagePath);
    }

    // 그래프 이미지 저장 (base64 → 파일, 병렬)
    let graphImagePaths: string[] = [];
    if (body.graphImages && body.graphImages.length > 0) {
      const writePromises = body.graphImages.map(async (b64, i) => {
        if (!b64) return "";
        const imgPath = join(tempDir, `graph_${i}.png`);
        await writeFile(imgPath, Buffer.from(b64, "base64"));
        return imgPath;
      });
      graphImagePaths = await Promise.all(writePromises);
      console.log(`[export-workbook] ${graphImagePaths.filter(p => p).length} graph image(s) saved`);
    }

    // AI 기반 LaTeX→HwpEqn 변환 헬퍼
    const convertSections = async (sections: string[]): Promise<string[]> => {
      if (!sections.some(s => s && s.includes("$"))) return sections;
      try {
        const baseUrl = req.nextUrl.origin;
        const convRes = await fetch(`${baseUrl}/api/convert-hwpeqn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sections }),
          signal: AbortSignal.timeout(300_000),
        });
        const convData = await convRes.json() as { sections?: string[]; fallback?: boolean };
        if (convData.sections && !convData.fallback) {
          console.log("[export-workbook] AI HwpEqn conversion applied");
          return convData.sections;
        }
      } catch (e) {
        console.log("[export-workbook] AI conversion failed:", e);
      }
      return sections;
    };

    const jsonData: Record<string, unknown> = {};

    if (body.format === "multi" && body.problems) {
      // ── multi 모드: 전체 sections를 합쳐서 1번만 AI 변환 (N번 → 1번) ──
      const allSections = body.problems.flatMap(p => p.sections);
      const allConverted = await convertSections(allSections);
      let sectionIdx = 0;

      // 크롭 이미지 저장 (병렬)
      const cropPromises = body.problems.map(async (p) => {
        if (!p.cropImage) return null;
        const cropPath = join(tempDir, `crop_${p.num}.jpg`);
        await writeFile(cropPath, Buffer.from(p.cropImage, "base64"));
        return cropPath;
      });
      const cropPaths = await Promise.all(cropPromises);

      const multiProblems = body.problems.map((p, i) => {
        const count = p.sections.length;
        const sections = allConverted.slice(sectionIdx, sectionIdx + count);
        sectionIdx += count;
        return { num: p.num, sections, cropImagePath: cropPaths[i] };
      });
      jsonData.format = "multi";
      jsonData.problems = multiProblems;
      jsonData.includeOriginal = body.includeOriginal ?? true;
      jsonData.graphImagePaths = graphImagePaths.length > 0 ? graphImagePaths : [];
      console.log(`[export-workbook] multi mode: ${multiProblems.length} problems, 1 batch conversion`);
    } else {
      // ── 기존 단일문항 모드 (markdown/structured/auto) ──
      let convertedSections = body.sections;
      if (body.sections) {
        convertedSections = await convertSections(body.sections);
      }
      if (body.format) jsonData.format = body.format;
      if (convertedSections) jsonData.sections = convertedSections;
      if (body.original_problem) jsonData.original_problem = body.original_problem;
      if (body.variations) jsonData.variations = body.variations;
      if (body.solutions) jsonData.solutions = body.solutions;
      jsonData.problemImagePath = problemImagePath;
      jsonData.graphImagePaths = graphImagePaths.length > 0
        ? graphImagePaths
        : body.graphImagePaths ?? [];
    }

    await writeFile(inputPath, JSON.stringify(jsonData, null, 2), "utf-8");

    const scriptPath = join(
      process.cwd(),
      "scripts",
      "hwpx_workbook_generator.py"
    );

    const fmt = body.format ?? "auto";

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
          if (stderr) console.log("[export-workbook]", stderr);
          if (error) {
            if (existsSync(outputPath)) {
              console.log("[export-workbook] Python exited with error but output file exists — treating as success");
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
        }
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
        "Content-Disposition": `attachment; filename="workbook.hwpx"`,
      },
    });
  } catch (err) {
    killHwpProcesses();
    if (tempDir) cleanup(tempDir);
    const msg = err instanceof Error ? err.message : "워크북 생성 오류";
    console.error("[export-workbook]", msg);
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
