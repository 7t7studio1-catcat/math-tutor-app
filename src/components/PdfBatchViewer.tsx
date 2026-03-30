"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import {
  Eye, BookOpen, Swords,
  ChevronDown, ChevronUp, Maximize2, X,
  Loader2, CheckCircle2, AlertCircle, Clock,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import GraphRenderer, { type GraphSpec } from "@/components/GraphRenderer";
import DiagramRenderer from "@/components/DiagramRenderer";

// ── 타입 ─────────────────────────────────────────────────────────────────────
export interface SectionState {
  status: "idle" | "streaming" | "done" | "error";
  content: string;
  error: string | null;
}

const IDLE_SECTION: SectionState = { status: "idle", content: "", error: null };

export interface ProblemState {
  num: number;
  pages: number[];
  croppedImage?: string;
  overallStatus: "waiting" | "solving" | "done" | "error";
  sections: [SectionState, SectionState, SectionState, SectionState];
}

export interface PdfModeState {
  phase: "idle" | "identifying" | "solving" | "done";
  problems: ProblemState[];
}

export function makeWaitingProblem(num: number, pages: number[], croppedImage?: string): ProblemState {
  return {
    num, pages, croppedImage,
    overallStatus: "waiting",
    sections: [IDLE_SECTION, IDLE_SECTION, IDLE_SECTION, IDLE_SECTION],
  };
}

interface PdfBatchViewerProps {
  pdfState: PdfModeState;
  onRetryProblem: (num: number) => void;
  onRetryAllFailed?: () => void;
}

// ── 섹션 설정 (SolutionViewer와 동일) ────────────────────────────────────────
interface SectionConfig {
  key: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  topBorderClass: string;
  iconBg: string;
  numColor: string;
}

const SECTION_CONFIGS: SectionConfig[] = [
  {
    key: "s1", icon: <Eye size={14} />,
    title: "문제 읽기", subtitle: "READ",
    description: "급소 · 출제 의도 · 첫 수",
    accentColor: "text-violet-600", topBorderClass: "border-t-violet-500",
    iconBg: "bg-violet-100 border-violet-300/60 text-violet-700",
    numColor: "text-violet-400/30",
  },
  {
    key: "s2", icon: <BookOpen size={14} />,
    title: "실전풀이", subtitle: "PRACTICAL",
    description: "시험장 현실적 풀이 · 직관+효율",
    accentColor: "text-blue-600", topBorderClass: "border-t-blue-500",
    iconBg: "bg-blue-100 border-blue-300/60 text-blue-700",
    numColor: "text-blue-400/30",
  },
  {
    key: "s3", icon: <Swords size={14} />,
    title: "숏컷", subtitle: "SHORTCUT",
    description: "정석과 다른 관점의 빠른 풀이",
    accentColor: "text-amber-600", topBorderClass: "border-t-amber-500",
    iconBg: "bg-amber-100 border-amber-300/60 text-amber-700",
    numColor: "text-amber-400/30",
  },
  {
    key: "s4", icon: <Swords size={14} />,
    title: "변형 대비", subtitle: "VARIANT",
    description: "이 구조가 변형되면 어떻게 달라지는가",
    accentColor: "text-emerald-600", topBorderClass: "border-t-emerald-500",
    iconBg: "bg-emerald-100 border-emerald-300/60 text-emerald-700",
    numColor: "text-emerald-400/30",
  },
];

import { fixMidNotation, injectDisplayStyle, convertSlashFractions, widenChoices, collapseBlankLines, stylePartHeaders, preRenderMath } from "@/lib/mathPreprocess";

function splitChoiceChildren(children: React.ReactNode): React.ReactNode[][] | null {
  const flat = React.Children.toArray(children);
  const groups: React.ReactNode[][] = [];
  let buf: React.ReactNode[] = [];
  let hasMarker = false;

  for (const child of flat) {
    if (typeof child !== "string") {
      buf.push(child);
      continue;
    }
    const parts = child.split(/(?=[\u2003\s]*[①②③④⑤⑥⑦⑧⑨⑩])/);
    for (const part of parts) {
      const clean = part.replace(/[\u2003\u2002]+/g, " ").trim();
      if (!clean) continue;
      if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(clean)) {
        if (hasMarker) groups.push(buf);
        buf = [clean];
        hasMarker = true;
      } else {
        buf.push(" " + clean);
      }
    }
  }
  if (buf.length > 0 && hasMarker) groups.push(buf);
  return groups.length >= 2 ? groups : null;
}

function preprocess(text: string): string {
  return widenChoices(preRenderMath(addSentenceBreaks(convertSlashFractions(injectDisplayStyle(fixMidNotation(collapseBlankLines(stylePartHeaders(text))))))));
}

// ── 단락 구분 ─────────────────────────────────────────────────────────────────
function addSentenceBreaks(text: string): string {
  const tokens: string[] = [];
  const escaped = text.replace(
    /(\$\$[\s\S]*?\$\$|\$(?:[^$\n\\]|\\.)+?\$|`[^`]*`)/g,
    (m) => { tokens.push(m); return `\x00${tokens.length - 1}\x00`; }
  );
  let p = escaped;
  p = p.replace(/([다요까죠임])([.!?])\s+(?=[가-힣\[(①-⑩■▶])/g, "$1$2\n\n");
  p = p.replace(
    /([.!?,])\s+(따라서|그러므로|그러나|그런데|반면에?|한편|이제|여기서|결국|즉,|또한|나아가)/g,
    "$1\n\n$2"
  );
  p = p.replace(/(이므로|이어서|이기에)(,)\s+(?=[가-힣A-Z])/g, "$1$2\n");
  p = p.replace(/([^\n])(\x00(\d+)\x00)/g, (_, pre, tok, idx) =>
    tokens[parseInt(idx)]?.startsWith("$$") ? `${pre}\n\n${tok}` : `${pre}${tok}`
  );
  p = p.replace(/(\x00(\d+)\x00)([^\n])/g, (_, tok, idx, post) =>
    tokens[parseInt(idx)]?.startsWith("$$") ? `${tok}\n\n${post}` : `${tok}${post}`
  );
  return p.replace(/\x00(\d+)\x00/g, (_, i) => tokens[parseInt(i)]);
}

// ── 마크다운 컴포넌트 ─────────────────────────────────────────────────────────
const LABEL_CONFIG: Record<string, { label: string; headerBg: string; headerText: string; contentBg: string; border: string }> = {
  "[핵심 관찰]": { label: "핵심 관찰", headerBg: "bg-orange-600", headerText: "text-white", contentBg: "bg-orange-50", border: "border-orange-200" },
  "[계산]":      { label: "계산",      headerBg: "bg-[#8A7C70]", headerText: "text-white", contentBg: "bg-[#F5F1EA]", border: "border-[var(--border)]" },
  "[✅ 답]":     { label: "✅ 최종 답", headerBg: "bg-emerald-600", headerText: "text-white", contentBg: "bg-emerald-50", border: "border-emerald-200" },
  "[KEY]":       { label: "⭐ KEY",     headerBg: "bg-amber-500",   headerText: "text-white", contentBg: "bg-amber-50",   border: "border-amber-200" },
  "[급소]":      { label: "급소",      headerBg: "bg-red-600",     headerText: "text-white", contentBg: "bg-red-50",     border: "border-red-200" },
  "[핵심 통찰]": { label: "핵심 통찰", headerBg: "bg-amber-600",   headerText: "text-white", contentBg: "bg-amber-50",   border: "border-amber-200" },
  "[빠른 풀이]": { label: "빠른 풀이", headerBg: "bg-violet-600",  headerText: "text-white", contentBg: "bg-violet-50",  border: "border-violet-200" },
  "[개념 연결]": { label: "개념 연결", headerBg: "bg-purple-600",  headerText: "text-white", contentBg: "bg-purple-50",  border: "border-purple-200" },
};

const mdComponents = {
  h1: ({ children, ...p }: React.ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-[18px] font-extrabold text-[var(--text-1)] mt-6 mb-3 leading-snug" {...p}>{children}</h1>
  ),
  h2: ({ children, ...p }: React.ComponentPropsWithoutRef<"h2">) => (
    <h2 className="text-[16px] font-extrabold text-[var(--text-1)] mt-5 mb-2 leading-snug" {...p}>{children}</h2>
  ),
  h3: ({ children, ...p }: React.ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-[14px] font-bold text-[#3C3020] mt-4 mb-2 leading-snug" {...p}>{children}</h3>
  ),
  ul: ({ children, ...p }: React.ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc list-outside space-y-1.5 mb-3 text-[var(--text-2)] text-[14px] pl-5" {...p}>{children}</ul>
  ),
  ol: ({ children, ...p }: React.ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal list-outside space-y-1.5 mb-3 text-[var(--text-2)] text-[14px] pl-5" {...p}>{children}</ol>
  ),
  li: ({ children, ...p }: React.ComponentPropsWithoutRef<"li">) => (
    <li className="leading-[2]" {...p}>{children}</li>
  ),
  blockquote: ({ children, ...p }: React.ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="pl-3 my-3 text-[var(--text-1)] leading-[1.8] bg-blue-50/60 dark:bg-blue-950/30 py-2 pr-3 rounded-r-lg border border-blue-200 dark:border-blue-900/50 !border-l-[3px] !border-l-[#2563eb]" {...p}>{children}</blockquote>
  ),
  hr: (p: React.ComponentPropsWithoutRef<"hr">) => (
    <hr className="border-t-[2px] border-[var(--border)] my-5" {...p} />
  ),
  strong: ({ children }: React.ComponentPropsWithoutRef<"strong">) => {
    const text = typeof children === "string" ? children : String(children ?? "");
    const cfg = LABEL_CONFIG[text];
    if (cfg) {
      return (
        <span
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...{ "data-label": text } as any}
          className={cn("inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-black tracking-wide mr-1", cfg.headerBg, cfg.headerText)}
        >
          {cfg.label}
        </span>
      );
    }
    const rawText = typeof children === "string" ? children : String(children ?? "");
    if (/✅.*최종\s*답/.test(rawText)) {
      return <strong className="inline-flex items-center font-black text-[14px] text-emerald-700 mt-2 mb-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">{children}</strong>;
    }
    if (/^\d+단계/.test(rawText)) {
      return <strong className="block font-black text-[14px] text-blue-700 mt-4 mb-1 pl-2.5 border-l-[3px] border-blue-500">{children}</strong>;
    }
    return <strong className="font-extrabold text-[var(--text-1)]">{children}</strong>;
  },
  p: ({ children }: React.ComponentPropsWithoutRef<"p">) => {
    const arr = React.Children.toArray(children);
    if (arr.length > 0) {
      const first = arr[0];
      if (React.isValidElement(first)) {
        const fp = first.props as Record<string, unknown>;
        const label = fp["data-label"] as string | undefined;
        if (label && LABEL_CONFIG[label]) {
          const cfg = LABEL_CONFIG[label];
          const rest = arr.slice(1);
          const hasContent = rest.some((c) => (typeof c === "string" ? c.trim() : true));
          return (
            <div className={cn("rounded-lg border overflow-hidden mb-2.5", cfg.border)}>
              <div className={cn("px-3 py-1.5 flex items-center", cfg.headerBg)}>
                <span className={cn("text-[11px] font-black tracking-widest uppercase", cfg.headerText)}>{cfg.label}</span>
              </div>
              {hasContent && (
                <div className={cn("px-3 py-2.5 text-[var(--text-2)] text-[14px] leading-[1.8]", cfg.contentBg)}>{rest}</div>
              )}
            </div>
          );
        }
      }
    }
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === "string") return node;
      if (typeof node === "number") return String(node);
      if (Array.isArray(node)) return node.map(extractText).join("");
      if (React.isValidElement(node) && node.props) {
        const pp = node.props as { children?: React.ReactNode };
        return pp.children ? extractText(pp.children) : "";
      }
      return "";
    };
    const fullText = extractText(children);
    if (/[①②③④⑤]/.test(fullText)) {
      const choices = splitChoiceChildren(children);
      if (choices && choices.length >= 2) {
        const cols = choices.length <= 3 ? choices.length : choices.length <= 4 ? 2 : 3;
        return (
          <div className="my-3 text-[14px] text-[var(--text-1)]"
            style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "4px 24px" }}>
            {choices.map((choice, i) => (
              <span key={i} className="leading-[1.8]">{choice}</span>
            ))}
          </div>
        );
      }
      return <p className="text-[var(--text-2)] leading-[2] mb-4 mt-3 text-[14px]" style={{ wordSpacing: "0.3em" }}>{children}</p>;
    }
    return <p className="text-[var(--text-2)] leading-[2] mb-3 text-[14px]">{children}</p>;
  },
  pre: ({ children }: React.ComponentPropsWithoutRef<"pre">) => {
    const child = React.Children.toArray(children)[0];
    if (React.isValidElement(child) && child.type === "code") {
      const codeProps = child.props as { className?: string; children?: React.ReactNode };
      const lang = codeProps.className ?? "";
      const text = String(codeProps.children ?? "").trim();
      if (lang.includes("language-graph")) {
        try { return <GraphRenderer spec={JSON.parse(text) as GraphSpec} />; }
        catch { return null; }
      }
      if (lang.includes("language-diagram")) {
        return <DiagramRenderer description={text} />;
      }
      if (lang.includes("language-meta")) return null;
      return (
        <pre className="bg-[var(--bg-inset)] border border-[var(--border)] p-2.5 rounded-lg text-[13px] font-mono overflow-x-auto my-3">
          <code>{text}</code>
        </pre>
      );
    }
    return <pre className="bg-[var(--bg-inset)] p-2.5 rounded-lg overflow-x-auto my-3">{children}</pre>;
  },
  code: ({ children, className, ...p }: React.ComponentPropsWithoutRef<"code">) => {
    if (className?.includes("language-graph")) {
      try { return <GraphRenderer spec={JSON.parse(String(children).trim()) as GraphSpec} />; }
      catch { return null; }
    }
    if (className?.includes("language-diagram")) {
      return <DiagramRenderer description={String(children).trim()} />;
    }
    if (className?.includes("language-meta")) return null;
    return className?.includes("language-")
      ? <code className="block bg-[var(--bg-inset)] border border-[var(--border)] p-2.5 rounded-lg text-[13px] font-mono overflow-x-auto text-[#3C3020]" {...p}>{children}</code>
      : <code className="bg-[var(--bg-inset)] text-blue-700 px-1 py-0.5 rounded text-[13px] font-mono border border-[var(--border)] font-semibold" {...p}>{children}</code>;
  },
};

// ── 섹션 패널 (문제 카드 내부) ─────────────────────────────────────────────────
function SectionPanel({
  cfg, idx, sec,
}: {
  cfg: SectionConfig;
  idx: number;
  sec: SectionState;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const isStreaming = sec.status === "streaming";
  const hasContent  = !!sec.content;

  const open = !collapsed;

  return (
    <>
      {showModal && sec.content && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[#2C2418]/40 backdrop-blur-sm p-4 sm:p-8 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="relative w-full max-w-3xl bg-[var(--bg-card)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden">
            <div className={cn("flex items-center justify-between px-6 py-4 border-b-[3px] border-[var(--border)] border-t-[3px]", cfg.topBorderClass)}>
              <div className="flex items-center gap-3">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border", cfg.iconBg)}>{cfg.icon}</div>
                <div>
                  <p className={cn("text-[10px] font-black tracking-widest font-mono", cfg.accentColor)}>{cfg.subtitle}</p>
                  <h2 className="text-[var(--text-1)] font-extrabold text-[16px]">{cfg.title}</h2>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-lg bg-[var(--bg-inset)] flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text-1)] border border-[var(--border)]">
                <X size={15} />
              </button>
            </div>
            <div className="px-8 py-7 prose-math max-w-none">
              <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkRehypeOptions={{ allowDangerousHtml: true }} components={mdComponents}>
                {preprocess(sec.content)}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      <div className={cn(
        "rounded-xl border overflow-hidden border-t-[3px]",
        cfg.topBorderClass,
        "border-[var(--border)] bg-[var(--bg-card)]"
      )}>
        <div
          className="flex items-center gap-2.5 px-4 py-3 cursor-pointer"
          onClick={() => setCollapsed((v) => !v)}
        >
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border", cfg.iconBg)}>
            {isStreaming ? <Loader2 size={12} className="animate-spin" /> : cfg.icon}
          </div>
          <div className="flex-1 min-w-0">
            <span className={cn("text-[10px] font-black tracking-[0.18em] font-mono", cfg.accentColor)}>{cfg.subtitle}</span>
            <p className="text-[13px] font-extrabold text-[var(--text-1)] leading-none">{cfg.title}</p>
          </div>
          <span className={cn("text-[2.5rem] font-black font-mono leading-none select-none flex-shrink-0", cfg.numColor)}>
            {["01", "02", "03", "04"][idx]}
          </span>
          <div className="flex items-center gap-0.5 flex-shrink-0 print:hidden">
            {hasContent && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
                className="p-1.5 text-[var(--text-4)] hover:text-[var(--text-2)] hover:bg-[var(--bg-inset)] rounded-lg transition-colors"
              >
                <Maximize2 size={11} />
              </button>
            )}
            <button className="p-1.5 text-[var(--text-4)] hover:text-[var(--text-2)] hover:bg-[var(--bg-inset)] rounded-lg transition-colors">
              {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </div>

        {open && (
          <>
            <div className="border-t-[2px] border-[var(--border)]" />
            <div className="px-5 py-4">
              {sec.status === "error" ? (
                <div className="text-[13px] text-red-600">{sec.error ?? "오류"}</div>
              ) : hasContent ? (
                <div className="prose-math max-w-none">
                  <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkRehypeOptions={{ allowDangerousHtml: true }} components={mdComponents}>
                    {preprocess(sec.content)}
                  </ReactMarkdown>
                  {isStreaming && (
                    <div className="flex gap-1 mt-2">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  )}
                </div>
              ) : isStreaming ? (
                <div className="flex items-center gap-2 text-[var(--text-4)] text-[13px] py-6 justify-center">
                  <Loader2 size={13} className="animate-spin" />
                  <span>생성 중...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[var(--text-4)] text-[13px] py-6 justify-center">
                  <Clock size={13} />
                  <span>대기 중</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── 문제 카드 ─────────────────────────────────────────────────────────────────
function ProblemCard({
  problem,
  onRetry,
  forceExpanded,
}: {
  problem: ProblemState;
  onRetry: () => void;
  forceExpanded?: boolean;
}) {
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const collapsed = forceExpanded !== undefined ? !forceExpanded : localCollapsed;
  const setCollapsed = (v: boolean | ((prev: boolean) => boolean)) => {
    const val = typeof v === "function" ? v(localCollapsed) : v;
    setLocalCollapsed(val);
  };
  const { overallStatus, sections, num } = problem;
  const isDone     = overallStatus === "done";
  const isSolving  = overallStatus === "solving";
  const isWaiting  = overallStatus === "waiting";
  const hasError   = overallStatus === "error";
  const hasAnySec  = sections.some((s) => s.content);

  const open = !collapsed;

  return (
    <div className={cn(
      "rounded-2xl border overflow-hidden transition-all",
      isDone    ? "border-emerald-300/70 bg-white" :
      isSolving ? "border-violet-300 bg-white shadow-[0_0_16px_rgba(124,58,237,0.10)]" :
      hasError  ? "border-red-200 bg-white" :
                  "border-[var(--border)] bg-[var(--bg-card)]"
    )}>
      {/* 카드 헤더 — 문제 번호 + 상태 */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none"
        onClick={() => setCollapsed((v) => !v)}
      >
        {isWaiting  && <Clock size={15} className="text-[var(--text-4)] flex-shrink-0" />}
        {isSolving  && <Loader2 size={15} className="text-violet-500 animate-spin flex-shrink-0" />}
        {isDone     && <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />}
        {hasError   && <AlertCircle size={15} className="text-red-500 flex-shrink-0" />}

        <span className="font-black text-[var(--text-1)] text-[16px] font-mono">{num}번</span>

        <span className={cn("text-[12px] font-semibold font-mono flex-1",
          isSolving ? "text-violet-600" :
          isDone    ? "text-emerald-600" :
          hasError  ? "text-red-600" :
                      "text-[var(--text-4)]"
        )}>
          {isWaiting  ? "대기 중" :
           isSolving  ? (
            <span className="flex items-center gap-1.5">
              3단계 해설 생성 중
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1 h-1 bg-violet-400 rounded-full animate-bounce inline-block" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </span>
           ) :
           isDone     ? "3단계 해설 완료" :
           "오류"}
        </span>

        <div className="flex items-center gap-1 flex-shrink-0 print:hidden">
          {hasError && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(); }}
              className="flex items-center gap-1 px-2 py-1 text-[12px] font-bold text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
            >
              <RefreshCw size={11} />
              재시도
            </button>
          )}
          <button className="p-1.5 text-[var(--text-4)] hover:text-[var(--text-2)] hover:bg-[var(--bg-inset)] rounded-lg transition-colors">
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* 크롭 이미지 + 4섹션 콘텐츠 */}
      {open && (hasAnySec || isSolving) && (
        <>
          <div className="border-t-[3px] border-[var(--border)]" />

          {problem.croppedImage && (
            <div className="px-4 pt-4">
              <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[#fafafa]">
                <div className="px-3 py-2 bg-[var(--bg-inset)] border-b border-[var(--border)]">
                  <span className="text-[10px] font-black tracking-[0.15em] text-[var(--text-4)] uppercase">원본 문제</span>
                </div>
                <div className="p-3 flex justify-center">
                  <img
                    src={`data:image/jpeg;base64,${problem.croppedImage}`}
                    alt={`${num}번 문제`}
                    className="max-w-full object-contain rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="p-4 space-y-2.5">
            {SECTION_CONFIGS.map((cfg, idx) => (
              <SectionPanel
                key={cfg.key}
                cfg={cfg}
                idx={idx}
                sec={sections[idx]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── 진행률 헤더 (섹션 단위 세분화) ──────────────────────────────────────────────
function ProgressHeader({ pdfState, onRetryAllFailed }: { pdfState: PdfModeState; onRetryAllFailed?: () => void }) {
  const { phase, problems } = pdfState;
  const total   = problems.length;
  const done    = problems.filter((p) => p.overallStatus === "done").length;
  const errors  = problems.filter((p) => p.overallStatus === "error").length;
  const solving = problems.filter((p) => p.overallStatus === "solving").length;

  const totalSections = total * 4;
  const doneSections = problems.reduce((sum, p) =>
    sum + p.sections.filter(s => s.status === "done").length, 0
  );
  const percent = totalSections > 0 ? Math.round((doneSections / totalSections) * 100) : 0;

  if (phase === "identifying") {
    return (
      <div className="flex items-center gap-3 px-5 py-4 bg-violet-50 border-b-[2px] border-violet-200">
        <Loader2 size={16} className="text-violet-500 animate-spin flex-shrink-0" />
        <div>
          <p className="font-bold text-violet-800 text-[14px]">문제 목록 분석 중...</p>
          <p className="text-[12px] text-violet-600/70 font-mono mt-0.5">시험지에서 문제 번호와 위치를 파악하고 있습니다</p>
        </div>
      </div>
    );
  }

  if (phase === "idle" || total === 0) return null;

  return (
    <div className="px-5 py-4 border-b-[2px] border-[var(--border)]">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-extrabold text-[var(--text-1)] text-[15px] font-mono">{done} / {total} 완료</span>
          {solving > 0 && (
            <span className="text-[12px] text-violet-600 font-semibold font-mono bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
              {solving}개 풀이 중
            </span>
          )}
          {errors > 0 && (
            <span className="text-[12px] text-red-600 font-semibold font-mono bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              {errors}개 오류
              {onRetryAllFailed && (
                <button
                  onClick={onRetryAllFailed}
                  className="ml-1 underline hover:no-underline"
                >
                  전체 재시도
                </button>
              )}
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="text-[13px] font-black font-mono text-[var(--text-3)]">{percent}%</span>
          <span className="text-[11px] text-[var(--text-4)] font-mono ml-1.5">({doneSections}/{totalSections}섹션)</span>
        </div>
      </div>
      <div className="w-full bg-[var(--bg-inset)] rounded-full h-2.5 border border-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            background: errors > 0
              ? "linear-gradient(90deg,#10b981,#f59e0b)"
              : "linear-gradient(90deg,#7c3aed,#a78bfa)",
          }}
        />
      </div>
      {phase === "done" && errors === 0 && (
        <p className="text-[12px] text-emerald-600 font-semibold mt-2">전체 4단계 해설 완료</p>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function PdfBatchViewer({ pdfState, onRetryProblem, onRetryAllFailed }: PdfBatchViewerProps) {
  const { phase, problems } = pdfState;
  const [allExpanded, setAllExpanded] = useState(true);

  if (phase === "idle") return null;

  const hasErrors = problems.some(p => p.overallStatus === "error");
  const isDone = phase === "done";

  return (
    <div id="pdf-solution-content" className="mt-6">
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] overflow-hidden border-t-[4px] border-t-violet-500">
        <div className="flex items-center gap-3 px-5 py-4 border-b-[2px] border-[var(--border)]">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-violet-100 border border-violet-300/60 text-violet-700">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <div className="flex-1">
            <span className="text-[11px] font-black tracking-[0.18em] font-mono text-violet-600">PDF BATCH · 4단계 완벽 해설</span>
            <h2 className="text-[15px] font-extrabold text-[var(--text-1)]">전체 문제 일괄 풀이</h2>
          </div>
          {problems.length > 0 && (
            <div className="flex items-center gap-2 print:hidden">
              {isDone && hasErrors && onRetryAllFailed && (
                <button
                  onClick={onRetryAllFailed}
                  className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-bold text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
                >
                  <RefreshCw size={11} />
                  실패 전체 재시도
                </button>
              )}
              <button
                onClick={() => setAllExpanded(v => !v)}
                className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-bold text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-inset)] rounded-lg border border-[var(--border)]"
              >
                {allExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {allExpanded ? "모두 접기" : "모두 펼치기"}
              </button>
            </div>
          )}
        </div>

        <ProgressHeader pdfState={pdfState} onRetryAllFailed={isDone && hasErrors ? onRetryAllFailed : undefined} />

        {problems.length > 0 && (
          <div className="p-4 space-y-3">
            {problems.map((problem) => (
              <ProblemCard
                key={problem.num}
                problem={problem}
                onRetry={() => onRetryProblem(problem.num)}
                forceExpanded={allExpanded}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
