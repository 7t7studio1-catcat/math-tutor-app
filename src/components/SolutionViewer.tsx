"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { Eye, BookOpen, Zap, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import GraphRenderer, { type GraphSpec } from "@/components/GraphRenderer";
import DiagramRenderer from "@/components/DiagramRenderer";

interface SectionState {
  status: "idle" | "streaming" | "done" | "error";
  content: string;
  error: string | null;
}

interface SolutionViewerProps {
  sections: [SectionState, SectionState, SectionState, SectionState];
  tabLabels?: string[];
  tabColors?: string[];
}

const TABS = [
  { key: "simple",  icon: <Eye size={14} />,      title: "실전풀이", color: "bg-blue-600",    text: "text-blue-600 dark:text-blue-400" },
  { key: "detailed",icon: <BookOpen size={14} />,  title: "해체분석",  color: "bg-violet-600",  text: "text-violet-600 dark:text-violet-400" },
  { key: "shortcut",icon: <Zap size={14} />,       title: "숏컷",     color: "bg-amber-600",   text: "text-amber-600 dark:text-amber-400" },
  { key: "extra",   icon: <Shield size={14} />,    title: "변형",     color: "bg-emerald-600", text: "text-emerald-600 dark:text-emerald-400" },
];

// 콘텐츠를 $$...$$ 블록이나 ## 기준으로 페이지 분할
function splitPages(content: string): string[] {
  if (!content) return [""];
  
  // "단계" 또는 "**[레이블]**" 기준으로 의미 단위 분할
  const sections: string[] = [];
  const lines = content.split("\n");
  let current: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    // 새 단계/레이블이 시작되면 끊기 (현재 축적분이 있을 때만)
    const isBreakPoint = 
      /^\d+단계/.test(t) ||
      /^\*\*\[/.test(t) ||
      /^#{1,3}\s/.test(t);
    
    if (isBreakPoint && current.length > 3) {
      sections.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) sections.push(current.join("\n"));

  // 너무 짧은 섹션은 앞 섹션에 합침
  const merged: string[] = [];
  for (const sec of sections) {
    const lineCount = sec.split("\n").filter(l => l.trim()).length;
    if (merged.length > 0 && lineCount < 5) {
      merged[merged.length - 1] += "\n" + sec;
    } else {
      merged.push(sec);
    }
  }

  return merged.length > 0 ? merged : [""];
}

// 마크다운 컴포넌트 (간결)
const md = {
  h1: ({ children, ...p }: React.ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-[19px] font-bold text-[var(--text-1)] mt-6 mb-3 tracking-tight" {...p}>{children}</h1>
  ),
  h2: ({ children, ...p }: React.ComponentPropsWithoutRef<"h2">) => {
    const text = typeof children === "string" ? children : String(children ?? "");
    if (/^문제$/.test(text.trim())) {
      return <h2 className="text-[18px] font-black text-[var(--text-1)] mt-6 mb-4 pb-2 border-b-2 border-[var(--text-1)]" {...p}>{children}</h2>;
    }
    if (text.includes("정답") && text.includes("풀이")) {
      return <h2 className="text-[18px] font-black text-emerald-600 dark:text-emerald-400 mt-10 mb-4 pt-4 pb-2 border-t-[3px] border-emerald-500 border-b border-emerald-200 dark:border-emerald-800" {...p}>📝 {children}</h2>;
    }
    return <h2 className="text-[16px] font-bold text-[var(--text-1)] mt-5 mb-2" {...p}>{children}</h2>;
  },
  h3: ({ children, ...p }: React.ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-[14px] font-semibold text-[var(--text-1)] mt-4 mb-2" {...p}>{children}</h3>
  ),
  p: ({ children }: React.ComponentPropsWithoutRef<"p">) => {
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === "string") return node;
      if (typeof node === "number") return String(node);
      if (Array.isArray(node)) return node.map(extractText).join("");
      if (React.isValidElement(node) && node.props) {
        const p = node.props as { children?: React.ReactNode };
        return p.children ? extractText(p.children) : "";
      }
      return "";
    };
    const text = extractText(children);
    const isChoiceLine = /[①②③④⑤]/.test(text);
    if (isChoiceLine) {
      const choices = splitChoiceChildren(children);
      if (choices && choices.length >= 2) {
        const cols = choices.length <= 3 ? choices.length : choices.length <= 4 ? 2 : 3;
        return (
          <div className="my-4 text-[15px] text-[var(--text-1)]"
            style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "6px 28px" }}>
            {choices.map((choice, i) => (
              <span key={i} className="leading-[1.8]">{choice}</span>
            ))}
          </div>
        );
      }
      return <p className="text-[var(--text-1)] leading-[2] mb-4 mt-3 text-[15px]" style={{ wordSpacing: "0.35em" }}>{children}</p>;
    }
    return <p className="text-[var(--text-2)] leading-[2] mb-3 text-[15px]">{children}</p>;
  },
  ul: ({ children, ...p }: React.ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc list-outside space-y-1.5 mb-3 text-[var(--text-2)] text-[15px] pl-5" {...p}>{children}</ul>
  ),
  ol: ({ children, ...p }: React.ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal list-outside space-y-1.5 mb-3 text-[var(--text-2)] text-[15px] pl-5" {...p}>{children}</ol>
  ),
  li: ({ children, ...p }: React.ComponentPropsWithoutRef<"li">) => (
    <li className="leading-[2]" {...p}>{children}</li>
  ),
  blockquote: ({ children, ...p }: React.ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="pl-4 my-4 text-[var(--text-1)] leading-[2] bg-blue-50/60 dark:bg-blue-950/30 py-3 pr-4 rounded-r-xl text-[15px] border border-blue-200 dark:border-blue-900/50 !border-l-[3px] !border-l-[#2563eb]" {...p}>{children}</blockquote>
  ),
  hr: (p: React.ComponentPropsWithoutRef<"hr">) => (
    <hr className="border-t-[2px] border-[var(--border)] my-6" {...p} />
  ),
  strong: ({ children }: React.ComponentPropsWithoutRef<"strong">) => {
    const text = typeof children === "string" ? children : String(children ?? "");
    if (/^변형\s*\d+/.test(text)) {
      return <strong className="inline-flex items-center gap-1.5 font-black text-[16px] text-blue-700 dark:text-blue-400 mt-4 mb-2 px-3 py-1 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg">{children}</strong>;
    }
    if (/✅.*최종\s*답/.test(text)) {
      return <strong className="inline-flex items-center gap-1.5 font-black text-[15px] text-emerald-700 dark:text-emerald-300 mt-3 mb-1 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg">{children}</strong>;
    }
    if (/^\d+단계/.test(text)) {
      return <strong className="block font-black text-[15px] text-blue-700 dark:text-blue-400 mt-5 mb-1 pl-3 border-l-[3px] border-blue-500">{children}</strong>;
    }
    if (/\[핵심 통찰\]|\[핵심통찰\]/.test(text)) {
      return <strong className="inline-flex items-center font-black text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 text-[14px]">{children}</strong>;
    }
    if (/\[빠른 풀이\]/.test(text)) {
      return <strong className="inline-flex items-center font-black text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 px-2.5 py-0.5 rounded-md border border-violet-200 dark:border-violet-800 text-[14px]">{children}</strong>;
    }
    if (/\[왜 이게 더 나은가\]/.test(text)) {
      return <strong className="inline-flex items-center font-bold text-teal-700 dark:text-teal-400 text-[13px] mt-2">{children}</strong>;
    }
    if (/\[정답\]/.test(text)) {
      return <strong className="font-black text-emerald-600 dark:text-emerald-400">{children}</strong>;
    }
    if (/\[변형 포인트\]/.test(text)) {
      return <strong className="font-bold text-amber-600 dark:text-amber-400 text-[13px]">{children}</strong>;
    }
    if (/\[간단 풀이\]|\[핵심\]|\[KEY\]/.test(text)) {
      return <strong className="font-bold text-blue-600 dark:text-blue-400">{children}</strong>;
    }
    if (/\[급소\]/.test(text)) {
      return <strong className="inline-flex items-center font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded text-[14px]">{children}</strong>;
    }
    if (/\[출제 의도\]/.test(text)) {
      return <strong className="inline-flex items-center font-bold text-indigo-600 dark:text-indigo-400 text-[14px]">{children}</strong>;
    }
    if (/\[첫 수\]|\[함정 주의\]/.test(text)) {
      return <strong className="inline-flex items-center font-bold text-orange-600 dark:text-orange-400 text-[14px]">{children}</strong>;
    }
    if (/\[개념 연결\]|\[주의\]/.test(text)) {
      return <strong className="inline-flex items-center font-bold text-purple-600 dark:text-purple-400 text-[13px] bg-purple-50 dark:bg-purple-950/30 px-2 py-0.5 rounded">{children}</strong>;
    }
    if (/\[고급 기법\]/.test(text)) {
      return <strong className="inline-flex items-center font-bold text-cyan-700 dark:text-cyan-400 text-[13px]">{children}</strong>;
    }
    return <strong className="font-bold text-[var(--text-1)]">{children}</strong>;
  },
  pre: ({ children }: React.ComponentPropsWithoutRef<"pre">) => {
    // react-markdown v10: fenced code block → <pre><code className="language-xxx">
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
        <pre className="bg-[var(--bg-inset)] border border-[var(--border)] p-3 rounded-xl text-[13px] font-mono overflow-x-auto text-[var(--text-1)] my-3">
          <code>{text}</code>
        </pre>
      );
    }
    return <pre className="bg-[var(--bg-inset)] p-3 rounded-xl overflow-x-auto my-3">{children}</pre>;
  },
  code: ({ children, className, ...p }: React.ComponentPropsWithoutRef<"code">) => {
    // 인라인 코드 또는 폴백
    if (className?.includes("language-graph")) {
      try { return <GraphRenderer spec={JSON.parse(String(children).trim()) as GraphSpec} />; }
      catch { return null; }
    }
    if (className?.includes("language-diagram")) {
      return <DiagramRenderer description={String(children).trim()} />;
    }
    if (className?.includes("language-meta")) return null;
    return (
      <code className="bg-[var(--bg-inset)] text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded-md text-[13px] font-mono" {...p}>{children}</code>
    );
  },
};

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

// 단락 구분 — \uE000 (유니코드 사적 영역)을 토큰 플레이스홀더로 사용
function addBreaks(text: string): string {
  const tokens: string[] = [];
  const PH = "\uE000";
  const escaped = text.replace(
    /(\$\$[\s\S]*?\$\$|\$(?:[^$\n\\]|\\.)+?\$|`[^`]*`)/g,
    (m) => { tokens.push(m); return `${PH}${tokens.length - 1}${PH}`; }
  );
  let p = escaped;
  p = p.replace(/([다요까죠임])([.!?])\s+(?=[가-힣\[(①-⑩■▶])/g, "$1$2\n\n");
  p = p.replace(/([.!?,])\s+(따라서|그러므로|그러나|한편|이제|여기서|결국|또한)/g, "$1\n\n$2");
  const phRe = new RegExp(`${PH}(\\d+)${PH}`, "g");
  p = p.replace(new RegExp(`([^\\n])(${PH}(\\d+)${PH})`, "g"), (_, pre, tok, idx) =>
    tokens[parseInt(idx)]?.startsWith("$$") ? `${pre}\n\n${tok}` : `${pre}${tok}`
  );
  p = p.replace(new RegExp(`(${PH}(\\d+)${PH})([^\\n])`, "g"), (_, tok, idx, post) =>
    tokens[parseInt(idx)]?.startsWith("$$") ? `${tok}\n\n${post}` : `${tok}${post}`
  );
  return p.replace(phRe, (_, i) => tokens[parseInt(i)]);
}

function WaitingIndicator() {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  const timeStr = min > 0 ? `${min}분 ${sec}초` : `${sec}초`;

  return (
    <div className="flex flex-col items-center gap-3 text-[var(--text-4)] text-[14px] py-14 justify-center">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => <div key={i} className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.12}s` }} />)}
      </div>
      <span>{elapsed < 10 ? "AI가 문제를 분석하고 있습니다..." : `생성 중... (${timeStr})`}</span>
      {elapsed >= 30 && (
        <span className="text-[12px] text-[var(--text-5)]">
          {elapsed >= 120 ? "응답이 매우 오래 걸리고 있습니다. 취소 후 다시 시도해보세요." : "복잡한 문제는 1~2분 정도 소요될 수 있습니다"}
        </span>
      )}
    </div>
  );
}

export default function SolutionViewer({ sections, tabLabels, tabColors }: SolutionViewerProps) {
  const [tab, setTab] = useState(0);
  const [pageIdx, setPageIdx] = useState(0);

  const hasAny = sections.some((s) => s.content || s.status === "streaming");
  const sec = sections[tab];
  const pages = useMemo(() => splitPages(sec?.content || ""), [sec?.content]);
  const totalPages = pages.length;
  const currentPage = Math.min(pageIdx, totalPages - 1);
  const isStreaming = sec?.status === "streaming";

  const goPage = (idx: number) => setPageIdx(Math.max(0, Math.min(totalPages - 1, idx)));

  if (!hasAny) return null;

  return (
    <div id="solution-content">
      {/* 탭 */}
      <div className="flex gap-1 glass rounded-2xl p-1 mb-2">
        {TABS.filter((_, i) => sections[i]?.content || sections[i]?.status === "streaming").map((t, _fi) => {
          const i = TABS.indexOf(t);
          return (
          <button
            key={t.key}
            onClick={() => { setTab(i); setPageIdx(0); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[12px] font-semibold transition-all",
              tab === i
                ? `${tabColors?.[i] || t.color} text-white shadow-sm`
                : `${t.text} hover:bg-[var(--bg-inset)]`
            )}
          >
            {t.icon}
            <span className="hidden sm:inline">{tabLabels?.[i] || t.title}</span>
            <span className="sm:hidden text-[11px]">{tabLabels?.[i] || t.title}</span>
          </button>
        );
        })}
      </div>

      {/* 콘텐츠 영역 */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 sm:px-7 py-5 sm:py-6 prose-math max-w-none min-h-[200px]">
          {sec?.content ? (
            <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkRehypeOptions={{ allowDangerousHtml: true }} components={md}>
              {widenChoices(preRenderMath(addBreaks(convertSlashFractions(injectDisplayStyle(fixMidNotation(collapseBlankLines(stylePartHeaders(pages[currentPage] || ""))))))))}
            </ReactMarkdown>
          ) : isStreaming ? (
            <WaitingIndicator />
          ) : sec?.status === "error" ? (
            <div className="text-[14px] text-red-500 py-8 text-center">{sec.error}</div>
          ) : null}

          {isStreaming && sec?.content && (
            <div className="flex gap-1 mt-2">
              {[0, 1, 2].map((i) => <div key={i} className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.12}s` }} />)}
            </div>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && !isStreaming && (
          <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-[var(--border)]">
            <button
              onClick={() => goPage(currentPage - 1)}
              disabled={currentPage === 0}
              className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-inset)] disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => goPage(i)}
                  className={cn(
                    "w-7 h-7 rounded-lg text-[12px] font-semibold transition-all",
                    i === currentPage
                      ? "bg-[#0071E3] text-white shadow-sm"
                      : "text-[var(--text-3)] hover:bg-[var(--bg-inset)] hover:text-[var(--text-1)]"
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            <button
              onClick={() => goPage(currentPage + 1)}
              disabled={currentPage === totalPages - 1}
              className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-inset)] disabled:opacity-30 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
