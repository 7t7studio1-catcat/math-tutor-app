"use client";

import { SUBJECTS, type SubjectId } from "@/lib/subjects";
import { cn } from "@/lib/utils";

interface SubjectSelectorProps {
  value: SubjectId | null;
  onChange: (id: SubjectId) => void;
}

export default function SubjectSelector({ value, onChange }: SubjectSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUBJECTS.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={cn(
            "px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all border",
            value === s.id
              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
              : "bg-[var(--bg-card)] text-[var(--text-2)] border-[var(--border)] hover:border-blue-400 hover:text-[var(--text-1)]"
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

interface MultiSubjectSelectorProps {
  value: SubjectId[];
  onChange: (ids: SubjectId[]) => void;
}

export function MultiSubjectSelector({ value, onChange }: MultiSubjectSelectorProps) {
  const toggle = (id: SubjectId) => {
    if (value.includes(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {SUBJECTS.map((s) => (
        <button
          key={s.id}
          onClick={() => toggle(s.id)}
          className={cn(
            "px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all border",
            value.includes(s.id)
              ? "bg-violet-600 text-white border-violet-600 shadow-sm"
              : "bg-[var(--bg-card)] text-[var(--text-2)] border-[var(--border)] hover:border-violet-400 hover:text-[var(--text-1)]"
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
