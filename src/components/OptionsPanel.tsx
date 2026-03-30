"use client";

/**
 * 해설/변형 옵션 패널 — 이미지/PDF 모드 공통 재사용
 */

import { cn } from "@/lib/utils";
import type { SolveMode, TaskMode, VariationDifficulty, VariationQuestionType, PdfVariationType } from "@/types/solution";

interface TaskSelectorProps {
  taskMode: TaskMode;
  onTaskModeChange: (mode: TaskMode) => void;
}

export function TaskSelector({ taskMode, onTaskModeChange }: TaskSelectorProps) {
  return (
    <div className="flex gap-2 mb-3">
      <button
        onClick={() => onTaskModeChange("solve")}
        className={cn(
          "flex-1 py-2.5 rounded-xl text-[13px] font-bold border-2 transition-all",
          taskMode === "solve"
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-blue-400"
        )}
      >
        해설 생성
      </button>
      <button
        onClick={() => onTaskModeChange("variation")}
        className={cn(
          "flex-1 py-2.5 rounded-xl text-[13px] font-bold border-2 transition-all",
          taskMode === "variation"
            ? "bg-emerald-600 text-white border-emerald-600"
            : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
        )}
      >
        변형문제 생성
      </button>
    </div>
  );
}

const SOLVE_MODES: { id: SolveMode; label: string; desc: string; color: string }[] = [
  { id: "simple", label: "실전풀이", desc: "시험장 현실적 풀이 · 직관+효율", color: "blue" },
  { id: "detailed", label: "해체분석", desc: "구조 분석 · 상세 설명", color: "violet" },
  { id: "shortcut", label: "숏컷 + 고급기법", desc: "빠른 풀이 · 기법 설명", color: "amber" },
];

interface SolveModePickerProps {
  selected: SolveMode[];
  onToggle: (mode: SolveMode) => void;
}

export function SolveModePicker({ selected, onToggle }: SolveModePickerProps) {
  return (
    <>
      <p className="text-[11px] text-[var(--text-3)] mb-2">
        해설 모드 <span className="text-blue-500">(중복 선택 가능)</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {SOLVE_MODES.map((m) => {
          const isOn = selected.includes(m.id);
          const colorClass = isOn
            ? m.color === "blue" ? "bg-blue-600 text-white border-blue-600"
              : m.color === "violet" ? "bg-violet-600 text-white border-violet-600"
              : "bg-amber-600 text-white border-amber-600"
            : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-blue-400";
          return (
            <button
              key={m.id}
              onClick={() => onToggle(m.id)}
              className={cn("px-3 py-1.5 rounded-xl text-[11px] font-bold border-2 transition-all", colorClass)}
            >
              <span>{m.label}</span>
              <span className="block text-[9px] font-normal opacity-75">{m.desc}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

interface VariationOptionsProps {
  questionType: VariationQuestionType;
  difficulty: VariationDifficulty;
  count: number;
  onQuestionTypeChange: (t: VariationQuestionType) => void;
  onDifficultyChange: (d: VariationDifficulty) => void;
  onCountChange: (c: number) => void;
}

export function VariationOptions({
  questionType, difficulty, count,
  onQuestionTypeChange, onDifficultyChange, onCountChange,
}: VariationOptionsProps) {
  const btn = (isOn: boolean, color = "emerald") =>
    cn(
      "px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
      isOn
        ? `bg-${color}-600 text-white border-${color}-600`
        : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
    );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div>
        <p className="text-[11px] text-[var(--text-3)] mb-1.5">문제 유형</p>
        <div className="flex gap-1">
          {([
            { id: "multiple-choice" as const, label: "객관식" },
            { id: "short-answer" as const, label: "주관식" },
          ]).map((t) => (
            <button key={t.id} onClick={() => onQuestionTypeChange(t.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
                questionType === t.id
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
              )}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11px] text-[var(--text-3)] mb-1.5">난이도</p>
        <div className="flex gap-1">
          {([
            { id: "same" as const, label: "동일하게" },
            { id: "harder" as const, label: "보다 어렵게" },
          ]).map((d) => (
            <button key={d.id} onClick={() => onDifficultyChange(d.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
                difficulty === d.id
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
              )}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11px] text-[var(--text-3)] mb-1.5">문제 수</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => onCountChange(n)}
              className={cn(
                "w-8 h-8 rounded-lg text-[12px] font-bold border-2 transition-all",
                count === n
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
              )}>
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
