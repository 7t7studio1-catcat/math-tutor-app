"use client";

import { useEffect, useState, useCallback } from "react";
import { Trash2, Search, ArrowLeft, FileDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type SavedSolution,
  getAllSolutions,
  deleteSolution,
  clearAllSolutions,
} from "@/lib/solutionStore";
import { SUBJECTS, type SubjectId, DIFFICULTY_COLORS } from "@/lib/subjects";
import SolutionCard from "@/components/SolutionCard";
import SolutionViewer from "@/components/SolutionViewer";

// ── 상세 보기 — SolutionViewer 재사용 ────────────────────────────────────────

function DetailView({ sol, onBack }: { sol: SavedSolution; onBack: () => void }) {
  const [isDownloadingHwpx, setIsDownloadingHwpx] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const sections: [{ status: "done"; content: string; error: null }, { status: "done"; content: string; error: null }, { status: "done"; content: string; error: null }, { status: "done"; content: string; error: null }] = [
    { status: "done", content: sol.sections[0] || "", error: null },
    { status: "done", content: sol.sections[1] || "", error: null },
    { status: "done", content: sol.sections[2] || "", error: null },
    { status: "done", content: sol.sections[3] || "", error: null },
  ];

  const handleDownloadHwpx = async () => {
    if (isDownloadingHwpx) return;
    setIsDownloadingHwpx(true);
    try {
      const { exportHwpx, downloadBlob } = await import("@/services/exportService");
      const blob = await exportHwpx({
        format: "solution",
        sections: sol.sections,
      });
      const name = sol.meta?.topic || sol.meta?.unit4 || (sol.problemNum ? `${sol.problemNum}번` : "해설");
      downloadBlob(blob, `${name}.hwpx`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "한글 파일 생성 오류");
    } finally {
      setIsDownloadingHwpx(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      const { exportSinglePdf } = await import("@/lib/pdfExport");
      const secs: [{ content: string }, { content: string }, { content: string }, { content: string }] = [
        { content: sol.sections[0] || "" },
        { content: sol.sections[1] || "" },
        { content: sol.sections[2] || "" },
        { content: sol.sections[3] || "" },
      ];
      const name = sol.meta?.topic || sol.meta?.unit4 || (sol.problemNum ? `${sol.problemNum}번` : "해설");
      await exportSinglePdf(secs, name, sol.imagePreview);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PDF 생성 오류");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div>
      {/* 상단 바 — 뒤로가기 + 제목 + 내보내기 버튼 */}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-[var(--bg-inset)] text-[var(--text-3)] hover:text-[var(--text-1)] transition-all">
          <ArrowLeft size={16} />
        </button>
        <p className="text-[13px] font-semibold text-[var(--text-1)] truncate flex-1">
          {sol.meta?.unit4 || sol.meta?.topic || (sol.mode === "pdf" ? `${sol.pdfFileName} — ${sol.problemNum}번` : "문제")}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-40 text-white text-[11px] font-semibold rounded-lg transition-all shadow-sm"
          >
            {isDownloadingPdf ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
            PDF
          </button>
          <button
            onClick={handleDownloadHwpx}
            disabled={isDownloadingHwpx}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-40 text-white text-[11px] font-semibold rounded-lg transition-all shadow-sm"
          >
            {isDownloadingHwpx ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
            한글
          </button>
        </div>
      </div>

      {/* 좌우 2분할 — 와이어프레임 구조 */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* 왼쪽: 메타 + 문제 이미지 */}
        <div className={sol.imagePreview ? "lg:w-[42%] lg:flex-shrink-0" : "hidden"}>
          {sol.meta && (() => {
            const units = [sol.meta.unit1||sol.meta.chapter, sol.meta.unit2||sol.meta.section, sol.meta.unit3, sol.meta.unit4||sol.meta.topic].filter(Boolean);
            return units.length > 0 ? (
              <div className="mb-2 text-[11px] text-[var(--text-2)] font-medium flex items-center flex-wrap gap-1">
                <span>
                  {units.map((u, i) => (
                    <span key={i}>{i > 0 && <span className="text-[var(--text-4)]"> › </span>}{u}</span>
                  ))}
                </span>
                {sol.meta.difficulty && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white ml-1" style={{ backgroundColor: DIFFICULTY_COLORS[sol.meta.difficulty] }}>
                    {sol.meta.difficulty} {sol.meta.estimatedRate}%
                  </span>
                )}
              </div>
            ) : null;
          })()}
          {sol.imagePreview && (
            <div className="lg:sticky lg:top-[3.5rem] glass rounded-2xl overflow-hidden">
              <img src={sol.imagePreview} alt="" className="w-full object-contain" />
            </div>
          )}
        </div>
        {/* 오른쪽: 해설 */}
        <div className={sol.imagePreview ? "lg:flex-1 min-w-0" : "w-full"}>
          <SolutionViewer
            sections={sections}
            tabLabels={sol.taskType === "variation" ? ["변형문제"] : undefined}
            tabColors={sol.taskType === "variation" ? ["bg-emerald-600"] : undefined}
          />
        </div>
      </div>
    </div>
  );
}

// ── 메인 피드 ────────────────────────────────────────────────────────────────

export default function HistoryView() {
  const [solutions, setSolutions] = useState<SavedSolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SavedSolution | null>(null);
  const [historyTab, setHistoryTab] = useState<"solve" | "variation">("solve");
  const [filterSubject, setFilterSubject] = useState<SubjectId | "all">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try { setSolutions(await getAllSolutions()); } catch { setSolutions([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    await deleteSolution(id);
    setSolutions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleClearAll = async () => {
    if (!confirm("모든 풀이 기록을 삭제할까요?")) return;
    await clearAllSolutions();
    setSolutions([]);
  };

  // 상세 보기
  if (selected) return <DetailView sol={selected} onBack={() => setSelected(null)} />;

  // 필터링
  const filtered = solutions.filter((s) => {
    const isVariation = s.taskType === "variation";
    if (historyTab === "variation" && !isVariation) return false;
    if (historyTab === "solve" && isVariation) return false;
    if (filterSubject !== "all" && s.subject !== filterSubject && s.meta?.subject !== filterSubject) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = [s.meta?.chapter, s.meta?.section, s.meta?.topic, s.pdfFileName, s.problemNum?.toString()].join(" ").toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  if (loading) return <div className="flex items-center justify-center py-16 text-[var(--text-4)]">불러오는 중...</div>;

  return (
    <div>
      {/* 해설 / 변형문제 탭 */}
      <div className="flex gap-1 glass rounded-2xl p-1 mb-4">
        <button
          onClick={() => setHistoryTab("solve")}
          className={cn(
            "flex-1 py-2 rounded-xl text-[13px] font-bold transition-all",
            historyTab === "solve" ? "bg-blue-600 text-white shadow-sm" : "text-[var(--text-3)] hover:bg-[var(--bg-inset)]"
          )}
        >
          생성된 해설
        </button>
        <button
          onClick={() => setHistoryTab("variation")}
          className={cn(
            "flex-1 py-2 rounded-xl text-[13px] font-bold transition-all",
            historyTab === "variation" ? "bg-emerald-600 text-white shadow-sm" : "text-[var(--text-3)] hover:bg-[var(--bg-inset)]"
          )}
        >
          생성된 변형문제
        </button>
      </div>

      {/* 필터 바 */}
      <div className="space-y-3 mb-5">
        {/* 검색 */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-4)]" />
          <input
            type="text"
            placeholder="단원, 유형으로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[13px] text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:border-blue-400 focus:outline-none transition-colors"
          />
        </div>

        {/* 과목 필터 */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterSubject("all")}
            className={cn(
              "px-3 py-1 rounded-lg text-[12px] font-bold border-2 transition-all",
              filterSubject === "all"
                ? "bg-[var(--text-2)] text-white border-[var(--text-2)]"
                : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-[var(--text-3)]"
            )}
          >
            전체
          </button>
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setFilterSubject(s.id)}
              className={cn(
                "px-3 py-1 rounded-lg text-[12px] font-bold border-2 transition-all",
                filterSubject === s.id
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-blue-400"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 카운트 + 전체삭제 */}
      {solutions.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-bold text-[var(--text-3)] font-mono">{filtered.length}개의 풀이</span>
          <button onClick={handleClearAll} className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--text-4)] hover:text-red-500 rounded-lg transition-colors">
            <Trash2 size={11} />
            전체 삭제
          </button>
        </div>
      )}

      {/* 카드 그리드 */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((sol) => (
            <SolutionCard key={sol.id} sol={sol} onClick={() => setSelected(sol)} />
          ))}
        </div>
      ) : solutions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[15px] font-bold text-[var(--text-1)]">아직 풀이 기록이 없습니다</p>
          <p className="text-[13px] text-[var(--text-3)] mt-1">문제를 풀면 자동으로 저장됩니다</p>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-[14px] text-[var(--text-3)]">검색 결과가 없습니다</p>
        </div>
      )}
    </div>
  );
}
