"use client";

import { Image, FileText, Clock } from "lucide-react";
import type { SavedSolution } from "@/lib/solutionStore";
import { DIFFICULTY_COLORS } from "@/lib/subjects";

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const dy = Math.floor(h / 24);
  if (dy < 30) return `${dy}일 전`;
  return new Date(ts).toLocaleDateString("ko-KR");
}

interface SolutionCardProps {
  sol: SavedSolution;
  onClick: () => void;
}

export default function SolutionCard({ sol, onClick }: SolutionCardProps) {
  const diff = sol.meta?.difficulty;
  const diffColor = diff ? DIFFICULTY_COLORS[diff] : undefined;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl glass overflow-hidden hover:shadow-[var(--shadow-lg)] transition-all duration-200 group"
    >
      {/* 썸네일 */}
      <div className="aspect-[4/3] bg-[var(--bg-inset)] flex items-center justify-center overflow-hidden">
        {sol.imagePreview ? (
          <img
            src={sol.imagePreview}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[var(--text-4)]">
            {sol.mode === "pdf" ? <FileText size={28} /> : <Image size={28} />}
            {sol.problemNum && <span className="text-[12px] font-mono font-bold">{sol.problemNum}번</span>}
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="p-3">
        {/* 제목 */}
        <p className="text-[13px] font-bold text-[var(--text-1)] truncate">
          {sol.meta?.topic
            ? sol.meta.topic
            : sol.mode === "pdf" && sol.problemNum
              ? `${sol.pdfFileName ?? "PDF"} — ${sol.problemNum}번`
              : "이미지 문제"}
        </p>

        {/* 단원 */}
        {sol.meta?.unit1 && (
          <p className="text-[10px] text-[var(--text-3)] truncate mt-0.5">
            {sol.meta.unit1} › {sol.meta.unit2}
          </p>
        )}

        {/* 하단: 난이도 + 시간 */}
        <div className="flex items-center justify-between mt-2">
          {diff && (
            <span
              className="text-[10px] font-black px-2 py-0.5 rounded-full"
              style={{ color: "white", backgroundColor: diffColor }}
            >
              {diff} {sol.meta?.estimatedRate}%
            </span>
          )}
          <span className="text-[10px] text-[var(--text-4)] flex items-center gap-0.5">
            <Clock size={10} />
            {timeAgo(sol.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
}
