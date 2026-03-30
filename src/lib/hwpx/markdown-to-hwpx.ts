/**
 * Markdown → HWPX Document Model converter.
 *
 * Python scripts/hwpx/content.py 의 TS 이식.
 * 서식을 보존: 볼드, 수식(HwpEqn), 제목, 리스트, 인용, 이미지.
 */

import type {
  HwpxDocument, HwpxSection, HwpxParagraph, HwpxRun,
  HwpxImage, HwpxSettings,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { parseMarkdown, type MdToken } from "./markdown-parser";
import { latexToHwpEqn } from "./latex-to-hwpeqn";

interface ConvertOptions {
  sections: string[];
  graphImages?: Array<{ data: Buffer | Uint8Array; mimeType?: string }>;
  problemImage?: { data: Buffer | Uint8Array; mimeType?: string };
  settings?: Partial<HwpxSettings>;
}

export function markdownToHwpx(options: ConvertOptions): HwpxDocument {
  const settings: HwpxSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  const images: HwpxImage[] = [];
  const hwpxSections: HwpxSection[] = [];

  if (options.problemImage) {
    images.push({
      id: "problem_image",
      data: options.problemImage.data,
      mimeType: options.problemImage.mimeType ?? "image/png",
      filename: "problem_image.png",
    });
  }
  if (options.graphImages) {
    for (let i = 0; i < options.graphImages.length; i++) {
      const gi = options.graphImages[i];
      if (!gi?.data) continue;
      images.push({
        id: `graph_${i}`,
        data: gi.data,
        mimeType: gi.mimeType ?? "image/png",
        filename: `graph_${i}.png`,
      });
    }
  }

  for (let si = 0; si < options.sections.length; si++) {
    const content = options.sections[si];
    if (!content?.trim()) continue;

    const hasHwpEqnMarkers = content.includes("[EQ]") || content.includes("[DEQ]");
    let paragraphs: HwpxParagraph[];

    if (hasHwpEqnMarkers) {
      paragraphs = convertHwpEqnContent(content);
    } else {
      const tokens = parseMarkdown(content);
      paragraphs = convertTokens(tokens);
    }

    hwpxSections.push({ paragraphs, pageBreakBefore: si > 0 });
  }

  return { sections: hwpxSections, images, settings };
}

const HWPEQN_COMBINED_RE = /\[DEQ\](.*?)\[\/DEQ\]|\[EQ\](.*?)\[\/EQ\]/g;
const DISPLAY_MATH_RE = /\$\$([\s\S]+?)\$\$/g;
const INLINE_MATH_RE = /\$((?:[^$\n\\]|\\.)+?)\$/g;

function convertHwpEqnContent(content: string): HwpxParagraph[] {
  const paragraphs: HwpxParagraph[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push({ runs: [{ type: "text", text: " " }] });
      continue;
    }

    const runs: HwpxRun[] = [];
    let cursor = 0;
    let m: RegExpExecArray | null;
    HWPEQN_COMBINED_RE.lastIndex = 0;

    while ((m = HWPEQN_COMBINED_RE.exec(trimmed)) !== null) {
      const before = trimmed.slice(cursor, m.index).trim();
      if (before) pushTextRuns(runs, before);

      const deq = m[1];
      const eq = m[2];

      if (deq !== undefined && deq.trim()) {
        runs.push({ type: "equation", hwpEqn: deq.trim(), display: true });
      } else if (eq !== undefined && eq.trim()) {
        runs.push({ type: "equation", hwpEqn: eq.trim(), display: false });
      }
      cursor = m.index + m[0].length;
    }

    const after = trimmed.slice(cursor).trim();
    if (after) pushTextRuns(runs, after);

    if (runs.length === 0) runs.push({ type: "text", text: " " });
    paragraphs.push({ runs });
  }

  return paragraphs;
}

function pushTextRuns(runs: HwpxRun[], text: string): void {
  // 1차: $$...$$ 디스플레이 수식 추출
  let remaining = text;
  const displayRe = new RegExp(DISPLAY_MATH_RE.source, "g");
  const parts: Array<{ type: "text" | "deq"; value: string }> = [];
  let cursor = 0;
  let dm: RegExpExecArray | null;

  while ((dm = displayRe.exec(remaining)) !== null) {
    if (dm.index > cursor) {
      parts.push({ type: "text", value: remaining.slice(cursor, dm.index) });
    }
    parts.push({ type: "deq", value: dm[1].trim() });
    cursor = dm.index + dm[0].length;
  }
  if (cursor < remaining.length) {
    parts.push({ type: "text", value: remaining.slice(cursor) });
  }
  if (parts.length === 0 && remaining) {
    parts.push({ type: "text", value: remaining });
  }

  for (const part of parts) {
    if (part.type === "deq") {
      const hwpEqn = latexToHwpEqn(part.value);
      runs.push({ type: "equation", hwpEqn, display: true });
      continue;
    }

    // 2차: $...$ 인라인 수식 추출
    const inlineRe = new RegExp(INLINE_MATH_RE.source, "g");
    let ic = 0;
    let im: RegExpExecArray | null;
    const segment = part.value;

    while ((im = inlineRe.exec(segment)) !== null) {
      const before = segment.slice(ic, im.index);
      if (before) runs.push({ type: "text", text: before });

      const latex = im[1].replace(/\\displaystyle/g, "").trim();
      const hwpEqn = latexToHwpEqn(latex);
      runs.push({ type: "equation", hwpEqn, display: false });
      ic = im.index + im[0].length;
    }

    const after = segment.slice(ic);
    if (after) runs.push({ type: "text", text: after });
  }
}

function convertTokens(tokens: MdToken[]): HwpxParagraph[] {
  const paragraphs: HwpxParagraph[] = [];
  let currentRuns: HwpxRun[] = [];

  function flushParagraph(align?: "left" | "center") {
    if (currentRuns.length > 0) {
      paragraphs.push({ runs: currentRuns, align: align ?? "left" });
      currentRuns = [];
    }
  }

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        if (token.text) currentRuns.push({ type: "text", text: token.text });
        break;

      case "bold":
        if (token.children) {
          for (const child of token.children) {
            if (child.type === "inline_math" && child.latex) {
              currentRuns.push({
                type: "equation",
                hwpEqn: latexToHwpEqn(child.latex),
                display: false,
              });
            } else if (child.text) {
              currentRuns.push({ type: "text", text: child.text, bold: true });
            }
          }
        }
        break;

      case "inline_math":
        if (token.latex) {
          currentRuns.push({
            type: "equation",
            hwpEqn: latexToHwpEqn(token.latex),
            display: false,
          });
        }
        break;

      case "display_math":
        flushParagraph();
        if (token.latex) {
          paragraphs.push({
            runs: [{
              type: "equation",
              hwpEqn: latexToHwpEqn(token.latex),
              display: true,
            }],
            align: "left",
          });
        }
        break;

      case "heading":
        flushParagraph();
        currentRuns.push({
          type: "text",
          text: token.text ?? "",
          bold: true,
          fontSize: (token.level ?? 3) <= 2 ? 11 : 9,
          fontFace: "함초롬돋움",
        });
        flushParagraph();
        break;

      case "list_item": {
        flushParagraph();
        const indent = "  ".repeat(token.level ?? 0);
        currentRuns.push({ type: "text", text: `${indent}· ` });
        if (token.children) {
          for (const child of token.children) {
            if (child.type === "inline_math" && child.latex) {
              currentRuns.push({
                type: "equation",
                hwpEqn: latexToHwpEqn(child.latex),
                display: false,
              });
            } else if (child.type === "bold" && child.children) {
              for (const bc of child.children) {
                if (bc.type === "inline_math" && bc.latex) {
                  currentRuns.push({ type: "equation", hwpEqn: latexToHwpEqn(bc.latex), display: false });
                } else if (bc.text) {
                  currentRuns.push({ type: "text", text: bc.text, bold: true });
                }
              }
            } else if (child.text) {
              currentRuns.push({ type: "text", text: child.text });
            }
          }
        }
        flushParagraph();
        break;
      }

      case "blockquote": {
        flushParagraph();
        currentRuns.push({ type: "text", text: "  │ " });
        if (token.children) {
          for (const child of token.children) {
            if (child.type === "inline_math" && child.latex) {
              currentRuns.push({ type: "equation", hwpEqn: latexToHwpEqn(child.latex), display: false });
            } else if (child.text) {
              currentRuns.push({ type: "text", text: child.text });
            }
          }
        }
        flushParagraph();
        break;
      }

      case "horizontal_rule":
        flushParagraph();
        paragraphs.push({
          runs: [{ type: "text", text: "─".repeat(42), fontSize: 5, color: "#D0D0D0" }],
        });
        break;

      case "paragraph_break":
        flushParagraph();
        paragraphs.push({ runs: [{ type: "text", text: " " }] });
        break;

      case "line_break":
        flushParagraph();
        break;

      case "code":
        if (token.text) currentRuns.push({ type: "text", text: token.text });
        break;
    }
  }

  flushParagraph();
  if (paragraphs.length === 0) paragraphs.push({ runs: [{ type: "text", text: " " }] });
  return paragraphs;
}
