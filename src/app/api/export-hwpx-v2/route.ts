import { NextRequest } from "next/server";
import { execFile } from "child_process";
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";

export async function POST(req: NextRequest) {
  let tempDir = "";
  try {
    const body = (await req.json()) as {
      mode: "single" | "batch";
      sections?: string[];
      problems?: Array<{ num: number; sections: string[] }>;
    };

    tempDir = await mkdtemp(join(tmpdir(), "hwpx-v2-"));
    const inputPath = join(tempDir, "solution.json");
    const outputPath = join(tempDir, "output.hwpx");

    let jsonData: Record<string, unknown>;
    if (body.mode === "batch" && body.problems) {
      jsonData = {
        problems: body.problems.map((p) => ({
          num: p.num,
          sections: p.sections,
        })),
      };
    } else {
      jsonData = { sections: body.sections || [] };
    }

    await writeFile(inputPath, JSON.stringify(jsonData, null, 2), "utf-8");

    const scriptPath = join(process.cwd(), "scripts", "hwpx_generator_v2.py");

    await new Promise<void>((resolve, reject) => {
      execFile(
        "python",
        [
          scriptPath,
          "--input",
          inputPath,
          "--output",
          outputPath,
          "--mode",
          body.mode,
        ],
        { timeout: 600_000, windowsHide: true },
        (error, _stdout, stderr) => {
          if (stderr) console.log("[hwpx-v2]", stderr);
          if (error) {
            if (existsSync(outputPath)) {
              console.log("[hwpx-v2] Python exited with error but output file exists — treating as success");
              resolve();
              return;
            }
            reject(new Error(error.message));
          } else {
            resolve();
          }
        },
      );
    });

    const fileBuffer = await readFile(outputPath);

    cleanup(tempDir, inputPath, outputPath);

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="solution.hwpx"`,
      },
    });
  } catch (err) {
    if (tempDir) cleanup(tempDir).catch(() => {});
    const msg = err instanceof Error ? err.message : "HWPX 생성 오류";
    console.error("[export-hwpx-v2]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function cleanup(dir: string, ...files: string[]) {
  for (const f of files) {
    try {
      await unlink(f);
    } catch {
      /* ignore */
    }
  }
  try {
    const { rmdir } = await import("fs/promises");
    await rmdir(dir);
  } catch {
    /* ignore */
  }
}
