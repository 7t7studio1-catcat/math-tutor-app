"use client";

/**
 * 앱 전역 UI 상태 — 모드 전환, 과목 선택, 테마
 */

import { create } from "zustand";
import type { SubjectId } from "@/lib/subjects";

export type AppMode = "image" | "pdf" | "history";

interface UiState {
  mode: AppMode;
  selectedSubject: SubjectId | null;
  pdfSubjects: Record<number, SubjectId>;

  setMode: (mode: AppMode) => void;
  setSubject: (subject: SubjectId) => void;
  setPdfSubject: (problemNum: number, subject: SubjectId) => void;
  resetPdfSubjects: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  mode: "history",
  selectedSubject: null,
  pdfSubjects: {},

  setMode: (mode) => set({ mode }),
  setSubject: (subject) => set({ selectedSubject: subject }),
  setPdfSubject: (problemNum, subject) =>
    set((state) => ({
      pdfSubjects: { ...state.pdfSubjects, [problemNum]: subject },
    })),
  resetPdfSubjects: () => set({ pdfSubjects: {} }),
}));
