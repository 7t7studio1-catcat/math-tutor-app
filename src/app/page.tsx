"use client";

/**
 * 메인 페이지 — 모드 전환 라우터
 *
 * 이전 1368줄 모놀리스에서 ~80줄로 축소.
 * 모든 상태는 Zustand 스토어에, 모든 로직은 피처 모듈에 위임.
 */

import { useUiStore } from "@/stores";
import { useImageStore } from "@/stores";
import { usePdfStore } from "@/stores";
import Header from "@/components/Header";
import ImageMode from "@/features/image/ImageMode";
import PdfMode from "@/features/pdf/PdfMode";
import HistoryMode from "@/features/history/HistoryMode";

export default function Home() {
  const { mode, setMode } = useUiStore();
  const imageStore = useImageStore();
  const pdfStore = usePdfStore();

  const hasImgSolution = imageStore.overallStatus === "done" && imageStore.sections.some((s) => s.content);
  const hasPdfSolution = pdfStore.phase === "done" && pdfStore.problems.some((p) => p.sections.some((s) => s.content));

  return (
    <>
      <Header
        mode={mode}
        onModeChange={setMode}
        hasSolution={mode === "image" ? hasImgSolution : hasPdfSolution}
        onPrint={() => window.print()}
        onDownloadPdf={() => {}}
        isDownloading={mode === "image" ? imageStore.isExporting.pdf : pdfStore.isExporting.pdf}
        isDownloadingHwpx={mode === "image" ? imageStore.isExporting.hwpx : pdfStore.isExporting.hwpx}
        onNewQuestion={() => {
          imageStore.reset();
          setMode("image");
        }}
      />

      <main className="min-h-screen bg-[var(--bg-base)]">
        {mode === "image" && <ImageMode />}
        {mode === "pdf" && <PdfMode />}
        {mode === "history" && <HistoryMode />}
      </main>
    </>
  );
}
