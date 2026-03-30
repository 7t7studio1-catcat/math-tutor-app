"use client";

/**
 * PDF 모드 — PDF 업로드 → 문제 식별 → 해설/변형문제 생성
 *
 * 기본 구조만 구현. 상세 PDF 처리 로직은 기존 PdfBatchViewer를 활용.
 */

import { useCallback, useRef } from "react";
import { usePdfStore, type PdfPageData } from "@/stores";
import { useUiStore } from "@/stores";
import PdfUploader, { type PdfUploaderHandle } from "@/components/PdfUploader";
import PdfBatchViewer from "@/components/PdfBatchViewer";
import SubjectSelector from "@/components/SubjectSelector";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PdfMode() {
  const { selectedSubject, setSubject } = useUiStore();
  const store = usePdfStore();
  const pdfAbortRef = useRef<AbortController | null>(null);
  const pdfUploaderRef = useRef<PdfUploaderHandle>(null);

  const isPdfActive = store.phase !== "idle";
  const isPdfRunning = store.phase === "identifying" || store.phase === "solving";
  const isPdfDone = store.phase === "done";
  const hasSolution = isPdfDone && store.problems.some((p) => p.sections.some((s) => s.content));

  const handlePagesReady = useCallback((pages: PdfPageData[], fileName: string) => {
    store.setPages(pages, fileName);
  }, [store]);

  const handleReset = useCallback(() => {
    pdfAbortRef.current?.abort();
    store.reset();
    pdfUploaderRef.current?.reset();
  }, [store]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-24">
      {store.pages.length === 0 && (
        <div className="mb-4 print:hidden">
          <p className="text-[12px] font-bold text-[var(--text-3)] mb-2">
            과목 선택 <span className="text-red-500">*</span>
          </p>
          <SubjectSelector value={selectedSubject} onChange={setSubject} />

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
              변형문제 일괄 생성
            </button>
          </div>
        </div>
      )}

      {store.pages.length === 0 && (
        <PdfUploader ref={pdfUploaderRef} onPagesReady={handlePagesReady} isAnalyzing={isPdfRunning} />
      )}

      {store.pages.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-bold text-[var(--text-2)]">
              {store.fileName} — {store.pages.length}페이지
            </p>
            <button
              onClick={handleReset}
              className="py-1.5 px-3 rounded-lg text-[12px] font-bold bg-[var(--bg-card)] text-[var(--text-3)] border border-[var(--border)] hover:bg-[var(--bg-hover)] transition-all flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              초기화
            </button>
          </div>

          {store.problems.length > 0 && (
            <PdfBatchViewer
              pdfState={{ phase: store.phase, problems: store.problems }}
              onRetryProblem={() => {}}
            />
          )}
        </div>
      )}
    </div>
  );
}
