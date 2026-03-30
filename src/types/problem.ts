/**
 * 문제 식별/메타 관련 공유 타입
 */

import type { SectionState, SectionTuple } from "./solution";

export interface ProblemInfo {
  num: number;
  page: number;
  yStart: number;
  yEnd: number;
}

export interface ProblemState {
  num: number;
  pages: number[];
  croppedImage?: string;
  overallStatus: "waiting" | "solving" | "done" | "error";
  sections: SectionTuple;
}

export function makeWaitingProblem(
  num: number,
  pages: number[],
  croppedImage?: string,
): ProblemState {
  const idle: SectionState = { status: "idle", content: "", error: null };
  return {
    num,
    pages,
    croppedImage,
    overallStatus: "waiting",
    sections: [idle, idle, idle, idle],
  };
}

export interface PdfVariationResult {
  num: number;
  content: string;
  cropImage?: string;
}
