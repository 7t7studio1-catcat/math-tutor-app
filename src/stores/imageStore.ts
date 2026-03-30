"use client";

/**
 * 이미지 모드 상태 — 업로드, AI 분석, 내보내기
 */

import { create } from "zustand";
import type {
  SectionState, SectionTuple, SolveMode, TaskMode,
  VariationDifficulty, VariationQuestionType,
} from "@/types/solution";
import type { ProblemMeta } from "@/lib/subjects";

const IDLE: SectionState = { status: "idle", content: "", error: null };

interface ImageState {
  selectedImage: string | null;
  sections: SectionTuple;
  overallStatus: "idle" | "running" | "done" | "error";
  taskMode: TaskMode;
  solveModes: SolveMode[];
  varDifficulty: VariationDifficulty;
  varCount: number;
  varQuestionType: VariationQuestionType;
  meta: ProblemMeta | null;
  isExporting: { pdf: boolean; hwpx: boolean };

  setImage: (img: string | null) => void;
  setTaskMode: (mode: TaskMode) => void;
  toggleSolveMode: (mode: SolveMode) => void;
  setSolveModes: (modes: SolveMode[]) => void;
  setVarDifficulty: (d: VariationDifficulty) => void;
  setVarCount: (c: number) => void;
  setVarQuestionType: (t: VariationQuestionType) => void;
  updateSection: (idx: number, patch: Partial<SectionState>) => void;
  setOverallStatus: (status: "idle" | "running" | "done" | "error") => void;
  setMeta: (meta: ProblemMeta | null) => void;
  setExporting: (key: "pdf" | "hwpx", value: boolean) => void;
  reset: () => void;
}

export const useImageStore = create<ImageState>((set) => ({
  selectedImage: null,
  sections: [IDLE, IDLE, IDLE, IDLE],
  overallStatus: "idle",
  taskMode: "solve",
  solveModes: ["simple"],
  varDifficulty: "same",
  varCount: 5,
  varQuestionType: "multiple-choice",
  meta: null,
  isExporting: { pdf: false, hwpx: false },

  setImage: (img) => set({
    selectedImage: img,
    sections: [IDLE, IDLE, IDLE, IDLE],
    overallStatus: "idle",
    meta: null,
  }),
  setTaskMode: (mode) => set({ taskMode: mode }),
  toggleSolveMode: (mode) =>
    set((state) => {
      const has = state.solveModes.includes(mode);
      if (has && state.solveModes.length === 1) return state;
      return {
        solveModes: has
          ? state.solveModes.filter((m) => m !== mode)
          : [...state.solveModes, mode],
      };
    }),
  setSolveModes: (modes) => set({ solveModes: modes }),
  setVarDifficulty: (d) => set({ varDifficulty: d }),
  setVarCount: (c) => set({ varCount: c }),
  setVarQuestionType: (t) => set({ varQuestionType: t }),
  updateSection: (idx, patch) =>
    set((state) => {
      const sections = [...state.sections] as SectionTuple;
      sections[idx] = { ...sections[idx], ...patch };
      return { sections };
    }),
  setOverallStatus: (status) => set({ overallStatus: status }),
  setMeta: (meta) => set({ meta }),
  setExporting: (key, value) =>
    set((state) => ({
      isExporting: { ...state.isExporting, [key]: value },
    })),
  reset: () =>
    set({
      selectedImage: null,
      sections: [IDLE, IDLE, IDLE, IDLE],
      overallStatus: "idle",
      meta: null,
      isExporting: { pdf: false, hwpx: false },
    }),
}));
