/**
 * 풀이/해설 관련 공유 타입
 * 프론트엔드 전체에서 import하여 사용
 */

export interface SectionState {
  status: "idle" | "streaming" | "done" | "error";
  content: string;
  error: string | null;
}

export type SectionTuple = [SectionState, SectionState, SectionState, SectionState];

export const IDLE_SECTION: SectionState = { status: "idle", content: "", error: null };

export const INITIAL_SECTIONS: SectionTuple = [
  IDLE_SECTION, IDLE_SECTION, IDLE_SECTION, IDLE_SECTION,
];

export const SEC_META = [
  { num: "01" as const, title: "문제 읽기", color: [124, 58, 237] as const },
  { num: "02" as const, title: "실전풀이", color: [37, 99, 235] as const },
  { num: "03" as const, title: "숏컷", color: [217, 119, 6] as const },
  { num: "04" as const, title: "변형 대비", color: [16, 185, 129] as const },
] as const;

export type SolveMode = "simple" | "detailed" | "shortcut";

export type TaskMode = "solve" | "variation";

export type VariationDifficulty = "same" | "harder";

export type VariationQuestionType = "multiple-choice" | "short-answer";

export type PdfVariationType = "multiple-choice" | "short-answer" | "follow-original";
