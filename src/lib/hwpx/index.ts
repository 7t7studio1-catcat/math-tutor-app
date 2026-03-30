/**
 * Pure TypeScript HWPX Generator — main API.
 *
 * No Python, no COM, no Windows dependency.
 * Works on Vercel serverless, Linux, Mac — anywhere Node.js runs.
 */

export { markdownToHwpx } from "./markdown-to-hwpx";
export { packageHwpx } from "./packager";
export { latexToHwpEqn } from "./latex-to-hwpeqn";
export { parseMarkdown } from "./markdown-parser";
export type {
  HwpxDocument, HwpxSection, HwpxParagraph, HwpxRun,
  HwpxTextRun, HwpxEquationRun, HwpxImageRun,
  HwpxImage, HwpxSettings,
} from "./types";
export { DEFAULT_SETTINGS } from "./types";

import { markdownToHwpx } from "./markdown-to-hwpx";
import { packageHwpx } from "./packager";
import type { HwpxSettings } from "./types";

/**
 * One-shot API: markdown sections → HWPX file buffer.
 */
export async function generateHwpx(options: {
  sections: string[];
  graphImages?: Array<{ data: Buffer | Uint8Array; mimeType?: string }>;
  problemImage?: { data: Buffer | Uint8Array; mimeType?: string };
  settings?: Partial<HwpxSettings>;
}): Promise<Buffer> {
  const doc = markdownToHwpx(options);
  return packageHwpx(doc);
}
