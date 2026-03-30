"use client";

/**
 * PDF 모드 상태 — 업로드, 문제 식별, 풀이/변형 생성
 */

import { create } from "zustand";
import type { SectionState, SectionTuple, PdfVariationType, VariationDifficulty } from "@/types/solution";
import type { ProblemState, PdfVariationResult } from "@/types/problem";

const IDLE: SectionState = { status: "idle", content: "", error: null };

export interface PdfPageData {
  base64: string;
  thumbnail: string;
}

interface PdfState {
  pages: PdfPageData[];
  fileName: string;
  phase: "idle" | "identifying" | "solving" | "done";
  problems: ProblemState[];
  taskMode: "solve" | "variation";
  varDifficulty: VariationDifficulty;
  varType: PdfVariationType;
  varCount: number;
  includeOriginal: boolean;
  varResults: PdfVariationResult[];
  varPhase: "idle" | "identifying" | "generating" | "done";
  varProgress: { done: number; total: number };
  isExporting: { pdf: boolean; hwpx: boolean; varHwpx: boolean };

  setPages: (pages: PdfPageData[], fileName: string) => void;
  setPhase: (phase: PdfState["phase"]) => void;
  setProblems: (problems: ProblemState[]) => void;
  updateProblem: (num: number, patch: Partial<ProblemState>) => void;
  updateProblemSection: (num: number, secIdx: number, patch: Partial<SectionState>) => void;
  setTaskMode: (mode: "solve" | "variation") => void;
  setVarDifficulty: (d: VariationDifficulty) => void;
  setVarType: (t: PdfVariationType) => void;
  setVarCount: (c: number) => void;
  setIncludeOriginal: (v: boolean) => void;
  setVarResults: (results: PdfVariationResult[]) => void;
  addVarResult: (result: PdfVariationResult) => void;
  setVarPhase: (phase: PdfState["varPhase"]) => void;
  setVarProgress: (done: number, total: number) => void;
  setExporting: (key: "pdf" | "hwpx" | "varHwpx", value: boolean) => void;
  reset: () => void;
}

export const usePdfStore = create<PdfState>((set) => ({
  pages: [],
  fileName: "",
  phase: "idle",
  problems: [],
  taskMode: "solve",
  varDifficulty: "same",
  varType: "follow-original",
  varCount: 5,
  includeOriginal: true,
  varResults: [],
  varPhase: "idle",
  varProgress: { done: 0, total: 0 },
  isExporting: { pdf: false, hwpx: false, varHwpx: false },

  setPages: (pages, fileName) => set({ pages, fileName }),
  setPhase: (phase) => set({ phase }),
  setProblems: (problems) => set({ problems }),
  updateProblem: (num, patch) =>
    set((state) => ({
      problems: state.problems.map((p) =>
        p.num === num ? { ...p, ...patch } : p,
      ),
    })),
  updateProblemSection: (num, secIdx, patch) =>
    set((state) => ({
      problems: state.problems.map((p) => {
        if (p.num !== num) return p;
        const sections = [...p.sections] as SectionTuple;
        sections[secIdx] = { ...sections[secIdx], ...patch };
        return { ...p, sections };
      }),
    })),
  setTaskMode: (mode) => set({ taskMode: mode }),
  setVarDifficulty: (d) => set({ varDifficulty: d }),
  setVarType: (t) => set({ varType: t }),
  setVarCount: (c) => set({ varCount: c }),
  setIncludeOriginal: (v) => set({ includeOriginal: v }),
  setVarResults: (results) => set({ varResults: results }),
  addVarResult: (result) =>
    set((state) => ({ varResults: [...state.varResults, result] })),
  setVarPhase: (phase) => set({ varPhase: phase }),
  setVarProgress: (done, total) => set({ varProgress: { done, total } }),
  setExporting: (key, value) =>
    set((state) => ({
      isExporting: { ...state.isExporting, [key]: value },
    })),
  reset: () =>
    set({
      pages: [],
      fileName: "",
      phase: "idle",
      problems: [],
      varResults: [],
      varPhase: "idle",
      varProgress: { done: 0, total: 0 },
      isExporting: { pdf: false, hwpx: false, varHwpx: false },
    }),
}));
