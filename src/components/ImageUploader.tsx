"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Upload, X, Clipboard } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploaderProps {
  onImageSelect: (base64: string, mimeType: string, preview: string) => void;
  isAnalyzing: boolean;
}

export interface ImageUploaderHandle {
  reset: () => void;
}

const ImageUploader = forwardRef<ImageUploaderHandle, ImageUploaderProps>(
function ImageUploader({ onImageSelect, isAnalyzing }, ref) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    reset() {
      setPreview(null);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  }));

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) { alert("이미지 파일만 업로드할 수 있습니다."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const mime = file.type || "image/jpeg";
      const base64 = dataUrl.split(",")[1];
      setPreview(dataUrl);
      onImageSelect(base64, mime, dataUrl);
    };
    reader.readAsDataURL(file);
  }, [onImageSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0]; if (file) processFile(file);
  }, [processFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile(); if (file) { processFile(file); return; }
      }
    }
  }, [processFile]);

  const handleClipboardButton = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            processFile(new File([blob], "clipboard.png", { type })); return;
          }
        }
      }
      alert("클립보드에 이미지가 없습니다.");
    } catch {
      alert("클립보드 접근 권한이 필요합니다. Ctrl+V로 시도해보세요.");
    }
  }, [processFile]);

  if (preview) {
    return (
      <div className="relative rounded-xl overflow-hidden bg-[#FAF7F2] border border-[#CEC5B4]">
        <img src={preview} alt="업로드된 수학 문제" className="w-full object-contain" />
        {!isAnalyzing && (
          <button
            onClick={() => setPreview(null)}
            className="absolute top-2.5 right-2.5 bg-white/85 hover:bg-white text-[#6A5C4E] hover:text-[#2C2418] rounded-full p-1.5 transition-colors border-2 border-[#CEC5B4] shadow-sm"
          >
            <X size={15} />
          </button>
        )}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-[#FAF7F2]/75 backdrop-blur-[2px] flex items-center justify-center">
            <div className="bg-[#FAF7F2] border border-[#CEC5B4] rounded-xl px-6 py-4 shadow-md flex items-center gap-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-[#2C2418] font-bold text-[15px] font-mono">Gemini 분석 중...</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onPaste={handlePaste}
      onClick={() => fileInputRef.current?.click()}
      tabIndex={0}
      className={cn(
        "relative border border-dashed rounded-xl cursor-pointer transition-all duration-200 outline-none select-none",
        isDragging
          ? "border-blue-400 bg-blue-50 shadow-[0_0_22px_rgba(37,99,235,0.13)]"
          : "border-[#CEC5B4] hover:border-blue-400/60 hover:bg-blue-50/30 focus:border-blue-400/60"
      )}
    >
      <input
        ref={fileInputRef}
        type="file" accept="image/*"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
        className="hidden"
      />

      <div className="py-12 px-6 flex flex-col items-center gap-5">
        {/* 아이콘 */}
        <div className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center transition-all border",
          isDragging
            ? "bg-blue-100 border-blue-300 shadow-[0_0_18px_rgba(37,99,235,0.16)]"
            : "bg-[#EAE3D8] border-[#CEC5B4]"
        )}>
          <svg viewBox="0 0 24 24" fill="none" className={cn("w-7 h-7", isDragging ? "stroke-blue-500" : "stroke-[#9A8E82]")} strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>

        {/* 텍스트 */}
        <div className="text-center">
          <p className="font-bold text-[#2C2418] text-[16px]">
            {isDragging ? "여기에 놓으세요" : "수학 문제 이미지 업로드"}
          </p>
          <p className="text-[13px] text-[#9A8E82] mt-1.5 font-mono">
            드래그 & 드롭 · 클릭 · <kbd className="px-1.5 py-0.5 bg-[#EAE3D8] border-2 border-[#CEC5B4] rounded text-[11px] text-[#6A5C4E] font-semibold">Ctrl+V</kbd>
          </p>
        </div>

        {/* 버튼 */}
        <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-[14px] font-bold rounded-lg transition-all hover:shadow-[0_2px_12px_rgba(37,99,235,0.32)]"
          >
            <Upload size={15} />
            파일 선택
          </button>
          <button
            type="button"
            onClick={handleClipboardButton}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#FAF7F2] hover:bg-[#EAE3D8] border border-[#CEC5B4] hover:border-[#B8AFA0] text-[#6A5C4E] hover:text-[#2C2418] text-[14px] font-semibold rounded-lg transition-colors"
          >
            <Clipboard size={15} />
            클립보드
          </button>
        </div>

        <p className="text-[12px] text-[#C0B5A8] font-mono font-medium">JPG · PNG · WEBP · GIF &nbsp;·&nbsp; 최대 20MB</p>
      </div>
    </div>
  );
});

ImageUploader.displayName = "ImageUploader";

export default ImageUploader;
