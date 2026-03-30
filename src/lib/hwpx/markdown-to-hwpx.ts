/**
 * Markdown → HWPX Document Model converter.
 *
 * Strips all formatting. Each line = one paragraph.
 * LaTeX equations converted to readable plain text.
 */

import type {
  HwpxDocument, HwpxSection, HwpxParagraph,
  HwpxImage, HwpxSettings,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";

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
    images.push({ id: "problem_image", data: options.problemImage.data, mimeType: options.problemImage.mimeType ?? "image/png", filename: "problem_image.png" });
  }
  if (options.graphImages) {
    for (let i = 0; i < options.graphImages.length; i++) {
      const gi = options.graphImages[i];
      if (!gi?.data) continue;
      images.push({ id: `graph_${i}`, data: gi.data, mimeType: gi.mimeType ?? "image/png", filename: `graph_${i}.png` });
    }
  }

  for (let si = 0; si < options.sections.length; si++) {
    const content = options.sections[si];
    if (!content?.trim()) continue;
    const cleaned = stripEverything(content);
    const paragraphs = linesToParagraphs(cleaned);
    hwpxSections.push({ paragraphs, pageBreakBefore: si > 0 });
  }

  return { sections: hwpxSections, images, settings };
}

function stripEverything(md: string): string {
  let t = md;

  t = t.replace(/```[\s\S]*?```/g, "");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/\[GRAPH_IMG:\d+\]/g, "");
  t = t.replace(/\[DEQ\](.*?)\[\/DEQ\]/g, "  $1");
  t = t.replace(/\[EQ\](.*?)\[\/EQ\]/g, "$1");
  t = t.replace(/\$\$([\s\S]+?)\$\$/g, "  $1");
  t = t.replace(/\$([^$\n]+)\$/g, "$1");
  t = latexToPlainText(t);
  t = t.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/~~([^~]+)~~/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^(\s*)[-*+]\s+/gm, "$1");
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/^>\s*/gm, "");
  t = t.replace(/✅/g, "[정답]"); t = t.replace(/❌/g, "[오답]");
  t = t.replace(/[\u{1F000}-\u{1FFFF}]/gu, "");
  t = t.replace(/[\u{2600}-\u{27BF}]/gu, "");
  t = t.replace(/[\u{FE00}-\u{FE0F}]/gu, "");
  t = t.replace(/[\u200B-\u200F\u2028-\u2029\u2060-\u2064\uFEFF\u00AD]/g, "");
  t = t.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F\u0080-\u009F]/g, "");
  t = t.replace(/\u00A0/g, " ");
  t = t.replace(/\r\n/g, "\n"); t = t.replace(/\n{3,}/g, "\n\n"); t = t.trim();
  return t;
}

function latexToPlainText(t: string): string {
  t = t.replace(/\\mathrm\{([^}]*)\}/g, "$1");
  t = t.replace(/\\text\{([^}]*)\}/g, "$1");
  t = t.replace(/\\overline\{([^}]*)\}/g, "$1");
  t = t.replace(/\\overrightarrow\{([^}]*)\}/g, "$1");
  t = t.replace(/\\vec\{([^}]*)\}/g, "$1");
  t = t.replace(/\\hat\{([^}]*)\}/g, "$1");
  t = t.replace(/\\bar\{([^}]*)\}/g, "$1");
  t = t.replace(/\\mathbf\{([^}]*)\}/g, "$1");
  t = t.replace(/\\d?frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2");
  t = t.replace(/\\displaystyle/g, "");
  t = t.replace(/\\sqrt\[([^\]]*)\]\{([^}]*)\}/g, "$1-root($2)");
  t = t.replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)");
  t = t.replace(/\\angle/g, "angle "); t = t.replace(/\\triangle/g, "triangle ");
  t = t.replace(/\\parallel/g, "//"); t = t.replace(/\\perp/g, "_|_");
  t = t.replace(/\\times/g, "x"); t = t.replace(/\\cdot/g, ".");
  t = t.replace(/\\circ/g, "deg"); t = t.replace(/\\cos/g, "cos");
  t = t.replace(/\\sin/g, "sin"); t = t.replace(/\\tan/g, "tan");
  t = t.replace(/\\log/g, "log"); t = t.replace(/\\lim/g, "lim");
  t = t.replace(/\\alpha/g, "alpha"); t = t.replace(/\\beta/g, "beta");
  t = t.replace(/\\theta/g, "theta"); t = t.replace(/\\pi/g, "pi");
  t = t.replace(/\\infty/g, "INF");
  t = t.replace(/\\leq/g, "<="); t = t.replace(/\\geq/g, ">=");
  t = t.replace(/\\neq/g, "!="); t = t.replace(/\\to/g, "->");
  t = t.replace(/\\left/g, ""); t = t.replace(/\\right/g, "");
  t = t.replace(/\\quad/g, "  "); t = t.replace(/\\,/g, " ");
  t = t.replace(/\\[a-zA-Z]+/g, " ");
  t = t.replace(/[{}]/g, "");
  t = t.replace(/  +/g, " ");
  return t;
}

function linesToParagraphs(text: string): HwpxParagraph[] {
  const paragraphs: HwpxParagraph[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trimEnd();
    paragraphs.push({
      runs: [{ type: "text", text: trimmed || " " }],
      align: "left",
    });
  }
  return paragraphs;
}
