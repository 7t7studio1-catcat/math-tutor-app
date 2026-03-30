"use client";

/**
 * PDF/한글 내보내기 버튼 그룹 — 이미지/PDF 모드 공통
 */

import { cn } from "@/lib/utils";

interface ExportButtonsProps {
  onDownloadPdf?: () => void;
  onDownloadHwpx?: () => void;
  isDownloadingPdf?: boolean;
  isDownloadingHwpx?: boolean;
  disabled?: boolean;
}

export default function ExportButtons({
  onDownloadPdf,
  onDownloadHwpx,
  isDownloadingPdf,
  isDownloadingHwpx,
  disabled,
}: ExportButtonsProps) {
  return (
    <div className="flex gap-2 print:hidden">
      {onDownloadPdf && (
        <button
          onClick={onDownloadPdf}
          disabled={disabled || isDownloadingPdf}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all",
            "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50",
          )}
        >
          {isDownloadingPdf ? "PDF 생성 중..." : "PDF 다운로드"}
        </button>
      )}
      {onDownloadHwpx && (
        <button
          onClick={onDownloadHwpx}
          disabled={disabled || isDownloadingHwpx}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all",
            "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50",
          )}
        >
          {isDownloadingHwpx ? "한글 파일 생성 중..." : "한글 파일 다운로드"}
        </button>
      )}
    </div>
  );
}
