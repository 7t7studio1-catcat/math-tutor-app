"use client";

/**
 * 이미지 모드 — 수학 문제 이미지 업로드 → AI 해설/변형문제 생성
 *
 * Zustand imageStore에서 모든 상태를 가져온다.
 * 서비스 레이어를 통해 API를 호출한다.
 */

import { useCallback, useRef } from "react";
import { useImageStore } from "@/stores";
import { useUiStore } from "@/stores";
import ImageUploader, { type ImageUploaderHandle } from "@/components/ImageUploader";
import SolutionViewer from "@/components/SolutionViewer";
import SubjectSelector from "@/components/SubjectSelector";
import { Sparkles, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { streamSSE, analyzeMeta } from "@/services/analyzeService";
import { exportHwpx, downloadBlob } from "@/services/exportService";
import { preRenderGraphs } from "@/services/graphService";
import { saveSolution } from "@/lib/solutionStore";
import { SUBJECTS, getDifficultyFromRate } from "@/lib/subjects";
import type { SubjectId } from "@/lib/subjects";
import type { SolveMode, SectionState } from "@/types/solution";

const SOLVE_MODE_OPTIONS: { id: SolveMode; label: string; desc: string; color: string }[] = [
  { id: "simple", label: "실전풀이", desc: "시험장 현실적 풀이 · 직관+효율", color: "blue" },
  { id: "detailed", label: "해체분석", desc: "구조 분석 · 상세 설명", color: "violet" },
  { id: "shortcut", label: "숏컷 + 고급기법", desc: "빠른 풀이 · 기법 설명", color: "amber" },
];

const VAR_TYPE_OPTIONS = [
  { id: "multiple-choice" as const, label: "객관식" },
  { id: "short-answer" as const, label: "주관식" },
];

const VAR_DIFF_OPTIONS = [
  { id: "same" as const, label: "동일하게" },
  { id: "harder" as const, label: "보다 어렵게" },
];

export default function ImageMode() {
  const { selectedSubject, setSubject } = useUiStore();
  const store = useImageStore();
  const imgAbortRef = useRef<AbortController | null>(null);
  const uploaderRef = useRef<ImageUploaderHandle>(null);
  const imgDataRef = useRef<{ base64: string; mimeType: string } | null>(null);

  const isRunning = store.overallStatus === "running";
  const isDone = store.overallStatus === "done";
  const hasSolution = isDone && store.sections.some((s) => s.content);
  const hasContent = store.sections.some((s) => s.content);

  const handleImageSelect = useCallback((base64: string, mimeType: string, preview: string) => {
    if (!selectedSubject) {
      alert("과목을 반드시 선택하세요.");
      return;
    }
    store.setImage(preview);
    imgDataRef.current = { base64, mimeType };
  }, [selectedSubject, store]);

  const handleAnalyze = useCallback(() => {
    if (!imgDataRef.current || isRunning) return;
    imgAbortRef.current = new AbortController();
    const { signal } = imgAbortRef.current;
    const img = imgDataRef.current;

    const modeMap: Record<SolveMode, 0 | 1 | 2> = { simple: 0, detailed: 1, shortcut: 2 };
    const activeModes = store.solveModes.length > 0 ? store.solveModes : ["simple" as SolveMode];

    const IDLE: SectionState = { status: "idle", content: "", error: null };
    const STREAMING: SectionState = { status: "streaming", content: "", error: null };

    store.updateSection(0, activeModes.includes("simple") ? STREAMING : IDLE);
    store.updateSection(1, activeModes.includes("detailed") ? STREAMING : IDLE);
    store.updateSection(2, activeModes.includes("shortcut") ? STREAMING : IDLE);
    store.updateSection(3, IDLE);
    store.setOverallStatus("running");

    const subjectLabel = selectedSubject ? SUBJECTS.find(s => s.id === selectedSubject)?.label ?? "" : "";
    let doneCount = 0;

    for (const sm of activeModes) {
      const idx = modeMap[sm];
      let acc = "";
      streamSSE({
        url: "/api/analyze",
        body: {
          imageBase64: img.base64,
          mimeType: img.mimeType,
          solveMode: store.taskMode === "variation" ? undefined : sm,
          subject: subjectLabel,
          ...(store.taskMode === "variation" ? {
            variationDifficulty: store.varDifficulty,
            variationCount: store.varCount,
            variationQuestionType: store.varQuestionType,
          } : {}),
        },
        signal,
        onChunk: (t) => { acc += t; store.updateSection(idx, { content: acc }); },
        onDone: () => {
          store.updateSection(idx, { status: "done" });
          doneCount++;
          if (doneCount >= activeModes.length) {
            store.setOverallStatus("done");
            const sections = useImageStore.getState().sections;
            const best = sections[1].content || sections[0].content || sections[2].content;
            analyzeMeta(img.base64, best, subjectLabel).then((raw) => {
              if (raw) {
                const rate = typeof raw.estimatedRate === "number" ? raw.estimatedRate as number : 50;
                const isMC = raw.isMultipleChoice !== false;
                const meta = {
                  subject: (selectedSubject ?? "common1") as SubjectId,
                  unit1: (raw.unit1 as string) ?? "", unit2: (raw.unit2 as string) ?? "",
                  unit3: (raw.unit3 as string) ?? "", unit4: (raw.unit4 as string) ?? "",
                  chapter: (raw.unit1 as string) ?? "", section: (raw.unit2 as string) ?? "",
                  topic: ((raw.unit4 || raw.unit3) as string) ?? "",
                  isMultipleChoice: isMC, estimatedRate: rate,
                  difficulty: getDifficultyFromRate(rate, isMC),
                };
                store.setMeta(meta);
              }
              saveSolution({
                mode: "image",
                imagePreview: store.selectedImage ?? undefined,
                subject: selectedSubject ?? undefined,
                sections: [sections[0].content, sections[1].content, sections[2].content, sections[3].content],
              }).catch(() => {});
            });
          }
        },
        onError: (e) => {
          store.updateSection(idx, { status: "error", error: e });
          doneCount++;
          if (doneCount >= activeModes.length) store.setOverallStatus("error");
        },
      });
    }
  }, [isRunning, store, selectedSubject]);

  const handleReset = useCallback(() => {
    imgAbortRef.current?.abort();
    store.reset();
    imgDataRef.current = null;
    uploaderRef.current?.reset();
  }, [store]);

  const handleDownloadHwpx = useCallback(async () => {
    if (store.isExporting.hwpx) return;
    store.setExporting("hwpx", true);
    try {
      const sections = store.sections.map((s) => s.content);
      const { processedSections, graphImages } = await preRenderGraphs(sections);
      const blob = await exportHwpx({
        format: store.taskMode === "variation" ? "workbook" : "solution",
        sections: processedSections,
        graphImages,
        problemImage: imgDataRef.current?.base64 ?? undefined,
        problemImageMime: imgDataRef.current?.mimeType ?? undefined,
      });
      downloadBlob(blob, store.taskMode === "variation" ? "변형문제.hwpx" : "수학해설.hwpx");
    } catch (err) {
      alert(err instanceof Error ? err.message : "한글 파일 생성 오류");
    } finally {
      store.setExporting("hwpx", false);
    }
  }, [store]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-24">
      {!hasContent && !isRunning && (
        <div className="mb-4 print:hidden">
          <p className="text-[12px] font-bold text-[var(--text-3)] mb-2">
            과목 선택 <span className="text-red-500">*</span>
          </p>
          <SubjectSelector value={selectedSubject} onChange={setSubject} />
          {!selectedSubject && (
            <p className="text-[11px] text-red-500 mt-1.5">문제를 올리기 전에 과목을 반드시 선택하세요.</p>
          )}

          <p className="text-[12px] font-bold text-[var(--text-3)] mt-4 mb-2">작업 선택</p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => store.setTaskMode("solve")}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-[13px] font-bold border-2 transition-all",
                store.taskMode === "solve"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-blue-400"
              )}
            >
              해설 생성
            </button>
            <button
              onClick={() => store.setTaskMode("variation")}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-[13px] font-bold border-2 transition-all",
                store.taskMode === "variation"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
              )}
            >
              변형문제 생성
            </button>
          </div>

          {store.taskMode === "solve" && (
            <>
              <p className="text-[11px] text-[var(--text-3)] mb-2">
                해설 모드 <span className="text-blue-500">(중복 선택 가능)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {SOLVE_MODE_OPTIONS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => store.toggleSolveMode(m.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-[11px] font-bold border-2 transition-all",
                      store.solveModes.includes(m.id)
                        ? m.color === "blue" ? "bg-blue-600 text-white border-blue-600"
                          : m.color === "violet" ? "bg-violet-600 text-white border-violet-600"
                          : "bg-amber-600 text-white border-amber-600"
                        : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-blue-400"
                    )}
                  >
                    <span>{m.label}</span>
                    <span className="block text-[9px] font-normal opacity-75">{m.desc}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {store.taskMode === "variation" && (
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-[11px] text-[var(--text-3)] mb-1.5">문제 유형</p>
                <div className="flex gap-1">
                  {VAR_TYPE_OPTIONS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => store.setVarQuestionType(t.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
                        store.varQuestionType === t.id
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-3)] mb-1.5">난이도</p>
                <div className="flex gap-1">
                  {VAR_DIFF_OPTIONS.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => store.setVarDifficulty(d.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
                        store.varDifficulty === d.id
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-3)] mb-1.5">문제 수</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => store.setVarCount(n)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-[12px] font-bold border-2 transition-all",
                        store.varCount === n
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!hasContent && !isRunning && selectedSubject && (
        <ImageUploader
          ref={uploaderRef}
          onImageSelect={handleImageSelect}
          isAnalyzing={isRunning}
        />
      )}

      {store.selectedImage && !hasContent && !isRunning && (
        <div className="mt-4 flex gap-2 print:hidden">
          <button
            onClick={handleAnalyze}
            className="flex-1 py-3 rounded-xl text-[14px] font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {store.taskMode === "solve" ? "해설 생성하기" : `변형문제 ${store.varCount}개 생성하기`}
          </button>
        </div>
      )}

      {isRunning && (
        <div className="mt-4 flex items-center justify-center gap-2 text-blue-500">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] font-medium">
            {store.taskMode === "solve" ? "해설 생성 중..." : "변형문제 생성 중..."}
          </span>
        </div>
      )}

      {hasContent && (
        <>
          <SolutionViewer sections={store.sections} />

          <div className="mt-4 flex gap-2 print:hidden">
            {hasSolution && (
              <button
                onClick={handleDownloadHwpx}
                disabled={store.isExporting.hwpx}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-all"
              >
                {store.isExporting.hwpx ? "한글 파일 생성 중..." : "한글 파일 다운로드"}
              </button>
            )}
            <button
              onClick={handleReset}
              className="py-2.5 px-4 rounded-xl text-[13px] font-bold bg-[var(--bg-card)] text-[var(--text-3)] border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              새 문제
            </button>
          </div>
        </>
      )}
    </div>
  );
}
