"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Upload, X, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PdfPageData {
  base64: string;
  thumbnail: string;
}

interface PdfUploaderProps {
  onPagesReady: (pages: PdfPageData[], fileName: string) => void;
  isAnalyzing: boolean;
}

export interface PdfUploaderHandle {
  reset: () => void;
}

const PdfUploader = forwardRef<PdfUploaderHandle, PdfUploaderProps>(
function PdfUploader({ onPagesReady, isAnalyzing }, ref) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pages, setPages] = useState<PdfPageData[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    reset() {
      setPages([]);
      setFileName("");
      setPreviewIndex(0);
      setLoadingProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  }));

  const renderPdfToImages = useCallback(async (file: File) => {
    setIsLoading(true);
    setLoadingProgress(null);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
      }).promise;
      const totalPages = pdf.numPages;

      setLoadingProgress({ current: 0, total: totalPages });

      const rendered: PdfPageData[] = [];

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);

        // 고해상도 렌더링 — 로컬 전용이므로 최고 품질
        const highResScale = 3.0;
        const highResViewport = page.getViewport({ scale: highResScale });
        const highCanvas = document.createElement("canvas");
        highCanvas.width = highResViewport.width;
        highCanvas.height = highResViewport.height;
        const highCtx = highCanvas.getContext("2d")!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: highCtx, viewport: highResViewport, canvas: highCanvas } as any).promise;
        const highBase64 = highCanvas.toDataURL("image/png").split(",")[1];

        // 썸네일 렌더링 (미리보기용)
        const thumbScale = 1.5;
        const thumbViewport = page.getViewport({ scale: thumbScale });
        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = thumbViewport.width;
        thumbCanvas.height = thumbViewport.height;
        const thumbCtx = thumbCanvas.getContext("2d")!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: thumbCtx, viewport: thumbViewport, canvas: thumbCanvas } as any).promise;
        const thumbnail = thumbCanvas.toDataURL("image/jpeg", 0.95);

        rendered.push({ base64: highBase64, thumbnail });
        setLoadingProgress({ current: i, total: totalPages });
      }

      setPages(rendered);
      setFileName(file.name);
      setPreviewIndex(0);
      onPagesReady(rendered, file.name);
    } catch (err) {
      console.error("PDF 렌더링 오류:", err);
      alert("PDF를 읽을 수 없습니다. 올바른 PDF 파일인지 확인해주세요.");
    } finally {
      setIsLoading(false);
      setLoadingProgress(null);
    }
  }, [onPagesReady]);

  const processFile = useCallback((file: File) => {
    if (file.type !== "application/pdf") {
      alert("PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    renderPdfToImages(file);
  }, [renderPdfToImages]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  // PDF 로드 완료 → 미리보기 + 분석 대기 상태
  if (pages.length > 0) {
    return (
      <div className="relative rounded-xl overflow-hidden bg-[#FAF7F2] border border-[#CEC5B4]">
        {/* 파일 정보 바 */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b-[3px] border-[#CEC5B4] bg-[#EAE3D8]">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={15} className="text-blue-600 flex-shrink-0" />
            <span className="text-[13px] font-bold text-[#2C2418] truncate">{fileName}</span>
            <span className="text-[12px] font-mono text-[#9A8E82] flex-shrink-0">{pages.length}페이지</span>
          </div>
          {!isAnalyzing && (
            <button
              onClick={() => {
                setPages([]);
                setFileName("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-[#9A8E82] hover:text-[#2C2418] transition-colors flex-shrink-0 ml-2"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* 페이지 미리보기 */}
        <div className="p-4">
          <div className="relative bg-white rounded-lg border border-[#CEC5B4] overflow-hidden">
            <img
              src={pages[previewIndex]?.thumbnail}
              alt={`${previewIndex + 1}페이지`}
              className="w-full object-contain"
            />
            {isAnalyzing && (
              <div className="absolute inset-0 bg-[#FAF7F2]/80 backdrop-blur-[2px] flex items-center justify-center">
                <div className="bg-[#FAF7F2] border border-[#CEC5B4] rounded-xl px-6 py-4 shadow-md flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="text-[#2C2418] font-bold text-[15px] font-mono">AI 일괄 분석 중...</span>
                </div>
              </div>
            )}
          </div>

          {/* 페이지 네비게이션 */}
          {pages.length > 1 && (
            <div className="flex items-center justify-center gap-3 mt-3">
              <button
                onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
                disabled={previewIndex === 0}
                className="p-1.5 rounded-lg text-[#9A8E82] hover:text-[#2C2418] hover:bg-[#EAE3D8] disabled:opacity-30 transition-colors border-2 border-[#CEC5B4]"
              >
                <ChevronLeft size={15} />
              </button>

              {/* 썸네일 스트립 */}
              <div className="flex gap-1.5 overflow-x-auto max-w-xs py-1 px-1">
                {pages.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setPreviewIndex(i)}
                    className={cn(
                      "flex-shrink-0 w-10 h-14 rounded border-2 overflow-hidden transition-all",
                      i === previewIndex
                        ? "border-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.3)]"
                        : "border-[#CEC5B4] hover:border-[#9A8E82]"
                    )}
                  >
                    <img src={p.thumbnail} alt={`${i + 1}p`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              <button
                onClick={() => setPreviewIndex((p) => Math.min(pages.length - 1, p + 1))}
                disabled={previewIndex === pages.length - 1}
                className="p-1.5 rounded-lg text-[#9A8E82] hover:text-[#2C2418] hover:bg-[#EAE3D8] disabled:opacity-30 transition-colors border-2 border-[#CEC5B4]"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          <p className="text-center text-[12px] font-mono text-[#9A8E82] mt-2">
            {previewIndex + 1} / {pages.length} 페이지
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
          className="hidden"
        />
      </div>
    );
  }

  // 로딩 중
  if (isLoading) {
    return (
      <div className="rounded-xl border border-[#CEC5B4] bg-[#FAF7F2] p-8 flex flex-col items-center gap-4">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        <div className="text-center">
          <p className="font-bold text-[#2C2418] text-[15px]">PDF 변환 중...</p>
          {loadingProgress && (
            <p className="text-[13px] text-[#9A8E82] font-mono mt-1">
              {loadingProgress.current} / {loadingProgress.total} 페이지
            </p>
          )}
        </div>
        {loadingProgress && (
          <div className="w-full max-w-xs bg-[#EAE3D8] rounded-full h-2 border-2 border-[#CEC5B4] overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  // 업로드 영역
  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => fileInputRef.current?.click()}
      tabIndex={0}
      className={cn(
        "relative border border-dashed rounded-xl cursor-pointer transition-all duration-200 outline-none select-none",
        isDragging
          ? "border-violet-400 bg-violet-50 shadow-[0_0_22px_rgba(124,58,237,0.13)]"
          : "border-[#CEC5B4] hover:border-violet-400/60 hover:bg-violet-50/30 focus:border-violet-400/60"
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
        className="hidden"
      />

      <div className="py-12 px-6 flex flex-col items-center gap-5">
        <div className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center transition-all border",
          isDragging
            ? "bg-violet-100 border-violet-300 shadow-[0_0_18px_rgba(124,58,237,0.16)]"
            : "bg-[#EAE3D8] border-[#CEC5B4]"
        )}>
          <FileText className={cn("w-7 h-7", isDragging ? "stroke-violet-500" : "stroke-[#9A8E82]")} strokeWidth={1.8} />
        </div>

        <div className="text-center">
          <p className="font-bold text-[#2C2418] text-[16px]">
            {isDragging ? "여기에 놓으세요" : "수학 시험지 PDF 업로드"}
          </p>
          <p className="text-[13px] text-[#9A8E82] mt-1.5 font-mono">
            드래그 & 드롭 · 클릭
          </p>
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-[14px] font-bold rounded-lg transition-all hover:shadow-[0_2px_12px_rgba(124,58,237,0.32)]"
          >
            <Upload size={15} />
            PDF 선택
          </button>
        </div>

        <p className="text-[12px] text-[#C0B5A8] font-mono font-medium">PDF · 페이지 무제한 · Gemini 3.1 Pro HIGH</p>
      </div>
    </div>
  );
});

PdfUploader.displayName = "PdfUploader";

export default PdfUploader;
