"use client";

import { useEffect, useState } from "react";
import { FileDown, Loader2, Printer, Moon, Sun, Image, FileText, Clock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppMode = "image" | "pdf" | "history";

interface HeaderProps {
  mode: AppMode;
  onModeChange: (m: AppMode) => void;
  hasSolution: boolean;
  onPrint: () => void;
  onDownloadPdf: () => void;
  onDownloadHwpx?: () => void;
  isDownloading: boolean;
  isDownloadingHwpx?: boolean;
  meta?: { title?: string; chapter?: string; section?: string; difficulty?: string; rate?: number; diffColor?: string };
  onBack?: () => void;
  solutionTab?: number;
  onSolutionTabChange?: (t: number) => void;
  showSolutionTabs?: boolean;
  onNewQuestion?: () => void;
}

const MODES: { id: AppMode; icon: React.ReactNode; label: string }[] = [
  { id: "image", icon: <Image size={13} />, label: "이미지" },
  { id: "pdf",   icon: <FileText size={13} />, label: "PDF" },
  { id: "history", icon: <Clock size={13} />, label: "기록" },
];

const SOL_TABS = [
  { label: "문제 읽기", color: "bg-violet-600" },
  { label: "실전풀이", color: "bg-blue-600" },
  { label: "숏컷", color: "bg-amber-600" },
  { label: "변형 대비", color: "bg-emerald-600" },
];

export default function Header({
  mode, onModeChange,
  hasSolution, onPrint, onDownloadPdf, onDownloadHwpx, isDownloading, isDownloadingHwpx,
  meta, onBack,
  solutionTab, onSolutionTabChange, showSolutionTabs,
  onNewQuestion,
}: HeaderProps) {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  const toggleDark = () => {
    const n = !dark; setDark(n);
    document.documentElement.classList.toggle("dark", n);
    try { localStorage.setItem("theme", n ? "dark" : "light"); } catch {}
  };

  return (
    <header className="sticky top-0 z-50 glass border-b border-[var(--border)] print:hidden">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 flex items-center gap-2" style={{ height: "3.25rem" }}>

        {/* 로고 — 클릭 시 첫 화면 */}
        <button onClick={() => { onNewQuestion?.(); onModeChange("image"); }} className="flex items-center gap-1.5 flex-shrink-0 hover:opacity-80 transition-opacity">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <span className="text-white text-[9px] font-black font-mono">Sx</span>
          </div>
          <span className="text-[var(--text-1)] font-bold text-[13px] tracking-tight hidden sm:inline">스마트풀이</span>
        </button>

        {/* 구분선 */}
        {(meta || showSolutionTabs) && <div className="w-px h-4 bg-[var(--border)] flex-shrink-0" />}

        {/* 메타 정보 (상세 보기 시) */}
        {meta && (
          <div className="flex items-center gap-1.5 min-w-0 flex-shrink">
            {onBack && (
              <button onClick={onBack} className="p-1 rounded-md hover:bg-[var(--bg-inset)] text-[var(--text-3)] hover:text-[var(--text-1)] transition-all flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            )}
            <span className="text-[11px] font-semibold text-[var(--text-1)] truncate">{meta.title}</span>
            <span className="text-[10px] text-[var(--text-3)] truncate hidden md:inline">{meta.chapter}›{meta.section}</span>
            {meta.difficulty && (
              <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: meta.diffColor }}>
                {meta.difficulty} {meta.rate}%
              </span>
            )}
          </div>
        )}

        {/* 3단 해설 탭 */}
        {showSolutionTabs && onSolutionTabChange && (
          <div className="flex gap-0.5 bg-[var(--bg-inset)] rounded-lg p-0.5 flex-shrink-0 ml-auto">
            {SOL_TABS.map((t, i) => (
              <button
                key={i}
                onClick={() => onSolutionTabChange(i)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all",
                  solutionTab === i ? `${t.color} text-white shadow-sm` : "text-[var(--text-3)] hover:text-[var(--text-2)]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* 우측 공간 채우기 */}
        {!showSolutionTabs && <div className="flex-1" />}

        {/* 새 문제 + 모드 탭 (우측) */}
        {onNewQuestion && (
          <button
            onClick={onNewQuestion}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-inset)] transition-all flex-shrink-0"
          >
            <Plus size={13} />
            <span className="hidden sm:inline">새 문제</span>
          </button>
        )}
        <div className="flex gap-0.5 bg-[var(--bg-inset)] rounded-lg p-0.5 flex-shrink-0">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all",
                mode === m.id ? "bg-[var(--bg-card-solid)] text-[var(--text-1)] shadow-sm" : "text-[var(--text-3)] hover:text-[var(--text-2)]"
              )}
            >
              {m.icon}
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>

        {/* 액션 */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {hasSolution && (
            <>
              <button
                onClick={onDownloadPdf}
                disabled={isDownloading}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-40 text-white text-[11px] font-semibold rounded-lg transition-all shadow-sm"
              >
                {isDownloading ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
                <span className="hidden sm:inline">PDF</span>
              </button>
              {onDownloadHwpx && (
                <button
                  onClick={onDownloadHwpx}
                  disabled={isDownloadingHwpx}
                  className="flex items-center gap-1 px-2.5 py-1 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 text-white text-[11px] font-semibold rounded-lg transition-all shadow-sm"
                >
                  {isDownloadingHwpx ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
                  <span className="hidden sm:inline">한글</span>
                </button>
              )}
              <button onClick={onPrint} className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-inset)] transition-all">
                <Printer size={14} />
              </button>
            </>
          )}
          <button onClick={toggleDark} className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-inset)] transition-all">
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>
    </header>
  );
}
