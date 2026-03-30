"use client";

import { useState, useCallback, useRef } from "react";
import Header from "@/components/Header";
import ImageUploader, { type ImageUploaderHandle } from "@/components/ImageUploader";
import PdfUploader, { type PdfUploaderHandle, type PdfPageData } from "@/components/PdfUploader";
import SolutionViewer from "@/components/SolutionViewer";
import PdfBatchViewer, {
  type PdfModeState,
  type ProblemState,
  type SectionState,
  makeWaitingProblem,
} from "@/components/PdfBatchViewer";
import { Sparkles, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProblemInfo } from "@/app/api/pdf-identify/route";
import HistoryView from "@/components/HistoryView";
import SubjectSelector, { MultiSubjectSelector } from "@/components/SubjectSelector";
import { saveSolution } from "@/lib/solutionStore";
import { type SubjectId, getDifficultyFromRate, SUBJECTS } from "@/lib/subjects";

// ── 공통 상수 — Before · During · After ─────────────────────────────────────
const SEC_META = [
  { num: "01" as const, title: "문제 읽기",   color: [124, 58, 237] as [number, number, number] },
  { num: "02" as const, title: "실전풀이",   color: [37, 99, 235] as [number, number, number] },
  { num: "03" as const, title: "숏컷",       color: [217, 119, 6] as [number, number, number] },
  { num: "04" as const, title: "변형 대비",   color: [16, 185, 129] as [number, number, number] },
] as const;

// ── 이미지 모드 타입 ──────────────────────────────────────────────────────────
interface ImgSectionState {
  status: "idle" | "streaming" | "done" | "error";
  content: string;
  error: string | null;
}
const IDLE_IMG_SEC: ImgSectionState = { status: "idle", content: "", error: null };
interface ImageModeState {
  sections: [ImgSectionState, ImgSectionState, ImgSectionState, ImgSectionState];
  overallStatus: "idle" | "running" | "done" | "error";
}
const INITIAL_IMG_STATE: ImageModeState = {
  sections: [IDLE_IMG_SEC, IDLE_IMG_SEC, IDLE_IMG_SEC, IDLE_IMG_SEC],
  overallStatus: "idle",
};

// ── 동시성 제어 ────────────────────────────────────────────────────────────────
async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

// ── 범용 SSE 스트림 유틸 ─────────────────────────────────────────────────────
// streamSection(이미지 모드)과 streamPdfSection(PDF 모드)을 하나로 통합

interface StreamOpts {
  url: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  maxAttempts?: number;
  retryDelay?: number;
}

async function streamSSE(opts: StreamOpts, attempt = 1): Promise<void> {
  const { url, body, signal, onChunk, onDone, onError } = opts;
  const maxAttempts = opts.maxAttempts ?? 3;
  const retryDelay = opts.retryDelay ?? 4000;

  const canRetry = () => attempt < maxAttempts && !signal.aborted;
  const backoff = () => {
    const delay = Math.min(retryDelay * Math.pow(2, attempt - 1), 30_000);
    console.log(`[streamSSE] 재시도 ${attempt}/${maxAttempts} (${Math.round(delay)}ms 대기)`);
    return new Promise<void>((r) => setTimeout(r, delay));
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      let message = `서버 오류 (${response.status})`;
      try { const d = await response.json(); if (d.error) message = d.error; } catch { /* ignore */ }
      // 502/503/504만 재시도 (리버스 프록시 오류). 429/500은 서버가 이미 재시도 후 포기한 것이므로 재시도 금지.
      const gatewayError = [502, 503, 504].includes(response.status);
      if (gatewayError && canRetry()) { await backoff(); return streamSSE(opts, attempt + 1); }
      onError(message);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { onError("스트리밍 시작 불가"); return; }

    // SSE 라인 버퍼: TCP 청크 경계에서 잘린 라인을 올바르게 이어 붙임
    const decoder = new TextDecoder();
    let lineBuf = "";

    const processLine = (line: string): "done" | "error" | null => {
      if (!line.startsWith("data: ")) return null;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return "done";
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) { onError(parsed.error); return "error"; }
        if (parsed.text) onChunk(parsed.text);
      } catch { /* 파싱 불가 라인 무시 */ }
      return null;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuf += decoder.decode(value, { stream: true });
      const lines = lineBuf.split("\n");
      // 마지막 요소는 아직 완성되지 않은 라인일 수 있으므로 버퍼에 남김
      lineBuf = lines.pop() ?? "";

      for (const line of lines) {
        const result = processLine(line);
        if (result === "done") { onDone(); return; }
        if (result === "error") return;
      }
    }

    // 스트림 종료 후 버퍼에 남은 마지막 라인 처리
    if (lineBuf.trim()) {
      const result = processLine(lineBuf.trim());
      if (result === "done") { onDone(); return; }
      if (result === "error") return;
    }

    // 스트림이 정상 종료됐으면 완료 처리 ([DONE] 없이 끝난 경우에도)
    onDone();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    const msg = err instanceof Error ? err.message : "네트워크 오류";
    // 네트워크 단절 같은 물리적 에러만 재시도
    if (canRetry()) { await backoff(); return streamSSE(opts, attempt + 1); }
    onError(msg);
  }
}

// ── Phase 1: 문제 목록 식별 ──────────────────────────────────────────────────

async function identifyProblems(pages: PdfPageData[], signal: AbortSignal): Promise<ProblemInfo[]> {
  const response = await fetch("/api/pdf-identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages: pages.map((p) => p.base64), mimeType: "image/jpeg" }),
    signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? `식별 오류 (${response.status})`);
  }
  const data = await response.json() as { problems: ProblemInfo[] };
  return data.problems ?? [];
}

// ── 문제 이미지 크롭 유틸 ────────────────────────────────────────────────────
async function cropProblemImage(
  pageBase64: string,
  yStartPct: number,
  yEndPct: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const yStart = Math.round((yStartPct / 100) * img.height);
      const yEnd = Math.round((yEndPct / 100) * img.height);
      const cropH = Math.max(1, yEnd - yStart);

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas context 실패")); return; }

      ctx.drawImage(img, 0, yStart, img.width, cropH, 0, 0, img.width, cropH);
      const dataUrl = canvas.toDataURL("image/png");
      resolve(dataUrl.replace(/^data:image\/png;base64,/, ""));
    };
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = `data:image/jpeg;base64,${pageBase64}`;
  });
}

async function cropAllProblems(
  identified: ProblemInfo[],
  pdfPages: PdfPageData[],
): Promise<Map<number, string>> {
  const crops = new Map<number, string>();
  const results = await Promise.all(
    identified.map(async (p) => {
      try {
        const pageIdx = p.pages[0] ?? 0;
        const pageData = pdfPages[pageIdx];
        if (!pageData) return null;
        const cropped = await cropProblemImage(pageData.base64, p.yStart, p.yEnd);
        return { num: p.num, cropped };
      } catch {
        return null;
      }
    })
  );
  for (const r of results) {
    if (r) crops.set(r.num, r.cropped);
  }
  return crops;
}

// ── PDF 모드: 문제 1개의 4섹션 완전 처리 ──────────────────────────────────────
function solveProblemAllSections(
  problem: ProblemInfo,
  allPages: PdfPageData[],
  croppedImage: string | undefined,
  signal: AbortSignal,
  updateSection: (num: number, secIdx: 0 | 1 | 2 | 3, patch: Partial<SectionState>) => void,
  onProblemDone: (num: number, hasError: boolean) => void,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { onProblemDone(problem.num, true); resolve(); return; }

    const pageImages = croppedImage
      ? [croppedImage]
      : (problem.pages.length > 0
        ? problem.pages.map((idx) => allPages[idx]?.base64).filter(Boolean) as string[]
        : allPages.map((p) => p.base64));

    const makeBody = (section: 1 | 2 | 3 | 4, s2Content = "") => ({
      pages: pageImages,
      problemNum: problem.num,
      section,
      section1Content: s2Content,
      mimeType: "image/jpeg",
      ...(croppedImage ? { croppedImage: true } : {}),
    });

    let sec2Content = "";
    let acc2Main = "";
    let sec2Failed = false;

    const startSections134 = (s2: string) => {
      if (signal.aborted) { onProblemDone(problem.num, true); resolve(); return; }

      let remaining = 3;
      let anyError = sec2Failed;

      const finish = (isError: boolean) => {
        if (isError) anyError = true;
        remaining--;
        if (remaining === 0) { onProblemDone(problem.num, anyError); resolve(); }
      };

      let acc1 = "";
      streamSSE({
        url: "/api/pdf-solve", body: makeBody(1, s2), signal, maxAttempts: 3, retryDelay: 2000,
        onChunk: (t) => { acc1 += t; updateSection(problem.num, 0, { content: acc1 }); },
        onDone:  () => { updateSection(problem.num, 0, { status: "done" }); finish(false); },
        onError: (e) => { updateSection(problem.num, 0, { status: "error", error: e }); finish(true); },
      });

      let acc3 = "";
      streamSSE({
        url: "/api/pdf-solve", body: makeBody(3, s2), signal, maxAttempts: 3, retryDelay: 2000,
        onChunk: (t) => { acc3 += t; updateSection(problem.num, 2, { content: acc3 }); },
        onDone:  () => { updateSection(problem.num, 2, { status: "done" }); finish(false); },
        onError: (e) => { updateSection(problem.num, 2, { status: "error", error: e }); finish(true); },
      });

      let acc4 = "";
      streamSSE({
        url: "/api/pdf-solve", body: makeBody(4, s2), signal, maxAttempts: 3, retryDelay: 2000,
        onChunk: (t) => { acc4 += t; updateSection(problem.num, 3, { content: acc4 }); },
        onDone:  () => { updateSection(problem.num, 3, { status: "done" }); finish(false); },
        onError: (e) => { updateSection(problem.num, 3, { status: "error", error: e }); finish(true); },
      });
    };

    updateSection(problem.num, 0, { status: "streaming" });
    updateSection(problem.num, 1, { status: "streaming" });
    updateSection(problem.num, 2, { status: "streaming" });
    updateSection(problem.num, 3, { status: "streaming" });

    streamSSE({
      url: "/api/pdf-solve", body: makeBody(2), signal, maxAttempts: 3, retryDelay: 2000,
      onChunk: (t) => { acc2Main += t; sec2Content = acc2Main; updateSection(problem.num, 1, { content: acc2Main }); },
      onDone: () => { updateSection(problem.num, 1, { status: "done" }); startSections134(sec2Content); },
      onError: (e) => {
        sec2Failed = true;
        updateSection(problem.num, 1, { status: "error", error: e });
        startSections134("");
      },
    });
  });
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export type SolveMode = "simple" | "detailed" | "shortcut";

export default function Home() {
  const [mode, setMode] = useState<"image" | "pdf" | "history">("history");
  const [selectedSubject, setSelectedSubject] = useState<SubjectId | null>(null);
  const [taskMode, setTaskMode] = useState<"solve" | "variation">("solve");
  const [solveModes, setSolveModes] = useState<SolveMode[]>(["simple"]);
  const [varDifficulty, setVarDifficulty] = useState<"easier" | "same" | "harder">("same");
  const [varCount, setVarCount] = useState(1);
  const [varQuestionType, setVarQuestionType] = useState<"multiple-choice" | "short-answer">("multiple-choice");
  const toggleSolveMode = (m: SolveMode) => {
    setSolveModes(prev => {
      if (prev.includes(m)) {
        const next = prev.filter(x => x !== m);
        return next.length === 0 ? [m] : next;
      }
      return [...prev, m];
    });
  };

  // ── 이미지 모드 ──────────────────────────────────────────────────────────────
  const [selectedImage, setSelectedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [imgState, setImgState] = useState<ImageModeState>(INITIAL_IMG_STATE);
  const [isDownloadingImgPdf, setIsDownloadingImgPdf] = useState(false);
  const [isDownloadingImgHwpx, setIsDownloadingImgHwpx] = useState(false);
  const [imgMeta, setImgMeta] = useState<import("@/lib/subjects").ProblemMeta | undefined>(undefined);
  const imgAbortRef = useRef<AbortController | null>(null);
  const uploaderRef = useRef<ImageUploaderHandle>(null);
  const imgForExportRef = useRef<{ base64: string; mimeType: string } | null>(null);

  // ── PDF 모드 ─────────────────────────────────────────────────────────────────
  const [pdfPages, setPdfPages] = useState<PdfPageData[]>([]);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [pdfState, setPdfState] = useState<PdfModeState>({ phase: "idle", problems: [] });
  const [isDownloadingBatchPdf, setIsDownloadingBatchPdf] = useState(false);
  const [isDownloadingBatchHwpx, setIsDownloadingBatchHwpx] = useState(false);
  const [pdfSubjects, setPdfSubjects] = useState<SubjectId[]>([]);
  const pdfAbortRef = useRef<AbortController | null>(null);
  const pdfUploaderRef = useRef<PdfUploaderHandle>(null);

  // ── PDF 변형문제 모드 ──────────────────────────────────────────────────────
  const [pdfTaskMode, setPdfTaskMode] = useState<"solve" | "variation">("solve");
  const [pdfIncludeOriginal, setPdfIncludeOriginal] = useState(true);
  const [pdfVarDifficulty, setPdfVarDifficulty] = useState<"same" | "harder">("same");
  const [pdfVarType, setPdfVarType] = useState<"multiple-choice" | "short-answer" | "follow-original">("follow-original");
  const [pdfVarCount, setPdfVarCount] = useState(5);
  const [pdfVarResults, setPdfVarResults] = useState<Array<{ num: number; content: string; cropImage?: string }>>([]);
  const [pdfVarPhase, setPdfVarPhase] = useState<"idle" | "identifying" | "generating" | "done">("idle");
  const [pdfVarProgress, setPdfVarProgress] = useState({ done: 0, total: 0 });
  const [isDownloadingVarHwpx, setIsDownloadingVarHwpx] = useState(false);

  // ── 이미지 모드 핸들러 ────────────────────────────────────────────────────────
  const handleImageSelect = useCallback((base64: string, mimeType: string, preview: string) => {
    if (!selectedSubject) {
      alert("과목을 반드시 선택하세요.");
      return;
    }
    setSelectedImage({ base64, mimeType, preview });
    setImgState(INITIAL_IMG_STATE);
  }, [selectedSubject]);

  const handleAnalyze = useCallback(() => {
    if (!selectedImage || imgState.overallStatus === "running") return;
    imgAbortRef.current = new AbortController();
    const { signal } = imgAbortRef.current;
    const img = selectedImage;
    imgForExportRef.current = { base64: img.base64, mimeType: img.mimeType };

    // 선택된 모드에 따라 섹션 매핑: [0]=simple, [1]=detailed, [2]=shortcut, [3]=미사용
    const modeMap: Record<SolveMode, 0 | 1 | 2> = { simple: 0, detailed: 1, shortcut: 2 };
    const activeModes = solveModes.length > 0 ? solveModes : ["simple" as SolveMode];

    setImgState({
      sections: [
        activeModes.includes("simple") ? { status: "streaming", content: "", error: null } : IDLE_IMG_SEC,
        activeModes.includes("detailed") ? { status: "streaming", content: "", error: null } : IDLE_IMG_SEC,
        activeModes.includes("shortcut") ? { status: "streaming", content: "", error: null } : IDLE_IMG_SEC,
        IDLE_IMG_SEC,
      ],
      overallStatus: "running",
    });

    const updateSection = (idx: 0 | 1 | 2 | 3, patch: Partial<ImgSectionState>) =>
      setImgState((prev) => {
        const next = [...prev.sections] as [ImgSectionState, ImgSectionState, ImgSectionState, ImgSectionState];
        next[idx] = { ...next[idx], ...patch };
        const allDone = activeModes.every(m => {
          const i = modeMap[m];
          return next[i].status === "done" || next[i].status === "error";
        });
        if (allDone && next.some((s) => s.content)) {
          (async () => {
            try {
              const bestContent = next[1].content || next[0].content || next[2].content;
              const r = await fetch("/api/analyze-meta", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  imageBase64: img.base64, mimeType: img.mimeType,
                  solutionContent: bestContent,
                  subject: selectedSubject ? SUBJECTS.find(s => s.id === selectedSubject)?.label ?? selectedSubject : "",
                }),
              });
              const raw = await r.json();
              const rate = typeof raw.estimatedRate === "number" ? raw.estimatedRate : 50;
              const isMC = raw.isMultipleChoice !== false;
              const meta = {
                subject: selectedSubject ?? ("common1" as SubjectId),
                unit1: raw.unit1 ?? "", unit2: raw.unit2 ?? "", unit3: raw.unit3 ?? "", unit4: raw.unit4 ?? "",
                chapter: raw.unit1 ?? "", section: raw.unit2 ?? "", topic: raw.unit4 || raw.unit3 || "",
                isMultipleChoice: isMC, estimatedRate: rate,
                difficulty: getDifficultyFromRate(rate, isMC),
              };
              setImgMeta(meta);
              await saveSolution({ mode: "image", imagePreview: img.preview, subject: selectedSubject ?? undefined, meta, sections: [next[0].content, next[1].content, next[2].content, next[3].content] });
            } catch {
              await saveSolution({ mode: "image", imagePreview: img.preview, subject: selectedSubject ?? undefined, sections: [next[0].content, next[1].content, next[2].content, next[3].content] }).catch(() => {});
            }
          })();
        }
        return { sections: next, overallStatus: allDone ? "done" : prev.overallStatus };
      });

    const subjectLabel = selectedSubject ? SUBJECTS.find(s => s.id === selectedSubject)?.label ?? "" : "";

    // 선택된 모드별로 병렬 생성
    for (const sm of activeModes) {
      const idx = modeMap[sm];
      let acc = "";
      streamSSE({
        url: "/api/analyze",
        body: { imageBase64: img.base64, mimeType: img.mimeType, solveMode: sm, subject: subjectLabel },
        signal,
        onChunk: (t) => { acc += t; updateSection(idx, { content: acc }); },
        onDone: () => updateSection(idx, { status: "done" }),
        onError: (e) => updateSection(idx, { status: "error", error: e }),
      });
    }
  }, [selectedImage, imgState.overallStatus, solveModes, selectedSubject]);

  const handleImgReset = () => {
    imgAbortRef.current?.abort();
    setSelectedImage(null);
    setImgState(INITIAL_IMG_STATE);
    setImgMeta(undefined);
    uploaderRef.current?.reset();
  };

  const handleDownloadImgPdf = async () => {
    if (isDownloadingImgPdf) return;
    setIsDownloadingImgPdf(true);
    try {
      const { exportSinglePdf } = await import("@/lib/pdfExport");
      const sections = imgState.sections.map(s => ({ content: s.content })) as [
        { content: string }, { content: string }, { content: string }, { content: string }
      ];
      await exportSinglePdf(sections, "수학해설", selectedImage?.preview);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PDF 생성 오류");
    } finally {
      setIsDownloadingImgPdf(false);
    }
  };

  const handleDownloadImgHwpx = async () => {
    if (isDownloadingImgHwpx) return;
    setIsDownloadingImgHwpx(true);
    try {
      const rawSections = imgState.sections.map(s => s.content);
      const { preRenderGraphs } = await import("@/lib/graphCapture");
      const { processedSections, graphImages } = await preRenderGraphs(rawSections);

      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 3_600_000);

      const isVariation = taskMode === "variation";
      const endpoint = isVariation ? "/api/export-workbook" : "/api/export-hwpx";
      const body = isVariation
        ? {
            format: "markdown",
            sections: processedSections,
            graphImages,
            problemImage: imgForExportRef.current?.base64 ?? selectedImage?.base64 ?? null,
            problemImageMime: imgForExportRef.current?.mimeType ?? selectedImage?.mimeType ?? null,
          }
        : {
            mode: "single",
            sections: processedSections,
            graphImages,
            problemImage: imgForExportRef.current?.base64 ?? selectedImage?.base64 ?? null,
            problemImageMime: imgForExportRef.current?.mimeType ?? selectedImage?.mimeType ?? null,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `한글 생성 오류 (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = isVariation ? "변형문제.hwpx" : "수학해설.hwpx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "AbortError"
          ? "한글 생성 시간 초과. 한글이 실행 중이거나 대화상자가 떠 있으면 닫아 주세요."
          : err instanceof Error ? err.message : "한글 파일 생성 오류";
      alert(msg);
    } finally {
      setIsDownloadingImgHwpx(false);
    }
  };

  // ── PDF 모드: state 업데이트 헬퍼 ─────────────────────────────────────────
  const updateProblemSection = useCallback((
    num: number,
    secIdx: 0 | 1 | 2 | 3,
    patch: Partial<SectionState>,
  ) => {
    setPdfState((prev) => ({
      ...prev,
      problems: prev.problems.map((p) => {
        if (p.num !== num) return p;
        const next = [...p.sections] as [SectionState, SectionState, SectionState, SectionState];
        next[secIdx] = { ...next[secIdx], ...patch };
        return { ...p, sections: next };
      }),
    }));
  }, []);

  const onProblemDone = useCallback((num: number, hasError: boolean) => {
    setPdfState((prev) => {
      const problems = prev.problems.map((p) => {
        if (p.num !== num) return p;
        const updated = { ...p, overallStatus: (hasError ? "error" : "done") as ProblemState["overallStatus"] };
        if (!hasError && updated.sections.some((s) => s.content)) {
          saveSolution({
            mode: "pdf",
            pdfFileName: pdfFileName,
            problemNum: num,
            sections: [updated.sections[0].content, updated.sections[1].content, updated.sections[2].content, updated.sections[3].content],
          }).catch(() => {});
        }
        return updated;
      });
      const allFinished = problems.every(
        (p) => p.overallStatus === "done" || p.overallStatus === "error"
      );
      return { problems, phase: allFinished ? "done" : prev.phase };
    });
  }, [pdfFileName]);

  // ── PDF 모드 핸들러 ───────────────────────────────────────────────────────
  const handlePagesReady = useCallback((pages: PdfPageData[], fileName: string) => {
    pdfAbortRef.current?.abort();
    setPdfPages(pages);
    setPdfFileName(fileName);
    setPdfState({ phase: "idle", problems: [] });
  }, []);

  const handlePdfAnalyze = useCallback(async () => {
    if (pdfPages.length === 0 || pdfState.phase === "identifying" || pdfState.phase === "solving") return;

    pdfAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    pdfAbortRef.current = abortCtrl;
    const { signal } = abortCtrl;

    setPdfState({ phase: "identifying", problems: [] });

    let identified: ProblemInfo[];
    try {
      identified = await identifyProblems(pdfPages, signal);
    } catch (err) {
      if (signal.aborted) return;
      alert(`문제 목록 분석 실패: ${err instanceof Error ? err.message : "오류"}`);
      setPdfState({ phase: "idle", problems: [] });
      return;
    }
    if (signal.aborted) return;

    if (identified.length === 0) {
      alert("문제를 찾을 수 없습니다. PDF를 확인해주세요.");
      setPdfState({ phase: "idle", problems: [] });
      return;
    }

    // 문제별 이미지 크롭
    const crops = await cropAllProblems(identified, pdfPages);
    if (signal.aborted) return;

    const initialProblems: ProblemState[] = identified.map((info) =>
      makeWaitingProblem(info.num, info.pages, crops.get(info.num))
    );
    setPdfState({ phase: "solving", problems: initialProblems });

    const CONCURRENCY = 3;

    await withConcurrency(identified, CONCURRENCY, async (problem) => {
      if (signal.aborted) return;
      setPdfState((prev) => ({
        ...prev,
        problems: prev.problems.map((p) =>
          p.num === problem.num ? { ...p, overallStatus: "solving" } : p
        ),
      }));
      await solveProblemAllSections(
        problem, pdfPages, crops.get(problem.num),
        signal, updateProblemSection, onProblemDone,
      );
    });
  }, [pdfPages, pdfState.phase, updateProblemSection, onProblemDone]);

  const handlePdfReset = () => {
    pdfAbortRef.current?.abort();
    setPdfPages([]);
    setPdfFileName("");
    setPdfState({ phase: "idle", problems: [] });
    setPdfVarPhase("idle");
    setPdfVarResults([]);
    setPdfVarProgress({ done: 0, total: 0 });
    pdfUploaderRef.current?.reset();
  };

  // ── PDF 변형문제 일괄 생성 ─────────────────────────────────────────────
  const handlePdfVariation = useCallback(async () => {
    if (pdfPages.length === 0 || pdfVarPhase === "identifying" || pdfVarPhase === "generating") return;

    pdfAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    pdfAbortRef.current = abortCtrl;
    const { signal } = abortCtrl;

    setPdfVarPhase("identifying");
    setPdfVarResults([]);

    let identified: ProblemInfo[];
    try {
      identified = await identifyProblems(pdfPages, signal);
    } catch (err) {
      if (signal.aborted) return;
      alert(`문제 목록 분석 실패: ${err instanceof Error ? err.message : "오류"}`);
      setPdfVarPhase("idle");
      return;
    }
    if (signal.aborted) return;
    if (identified.length === 0) {
      alert("문제를 찾을 수 없습니다.");
      setPdfVarPhase("idle");
      return;
    }

    const crops = await cropAllProblems(identified, pdfPages);
    if (signal.aborted) return;

    setPdfVarPhase("generating");
    setPdfVarProgress({ done: 0, total: identified.length });

    const results: Array<{ num: number; content: string; cropImage?: string }> = [];
    const subjectLabel = pdfSubjects.length > 0
      ? pdfSubjects.map(id => SUBJECTS.find(s => s.id === id)?.label).filter(Boolean).join(", ")
      : "";
    const qType = pdfVarType === "follow-original" ? undefined : pdfVarType;

    await withConcurrency(identified, 3, async (problem) => {
      if (signal.aborted) return;
      const cropBase64 = crops.get(problem.num);
      const pageImages = cropBase64
        ? [cropBase64]
        : problem.pages.map(idx => pdfPages[idx]?.base64).filter(Boolean) as string[];
      const imageBase64 = pageImages[0] ?? pdfPages[0]?.base64;
      if (!imageBase64) return;

      let acc = "";
      await streamSSE({
        url: "/api/analyze",
        body: {
          imageBase64,
          mimeType: "image/jpeg",
          variationDifficulty: pdfVarDifficulty,
          variationCount: pdfVarCount,
          ...(qType ? { variationQuestionType: qType } : {}),
          subject: subjectLabel,
        },
        signal,
        onChunk: (t) => { acc += t; },
        onDone: () => {
          results.push({ num: problem.num, content: acc, cropImage: cropBase64 });
          setPdfVarProgress(prev => ({ ...prev, done: prev.done + 1 }));
        },
        onError: (e) => {
          console.error(`[pdfVar] Problem ${problem.num} error:`, e);
          setPdfVarProgress(prev => ({ ...prev, done: prev.done + 1 }));
        },
      });
    });

    if (signal.aborted) return;
    results.sort((a, b) => a.num - b.num);
    setPdfVarResults(results);
    setPdfVarPhase("done");
  }, [pdfPages, pdfVarPhase, pdfSubjects, pdfVarDifficulty, pdfVarCount, pdfVarType]);

  // ── PDF 변형문제집 한글 다운로드 ──────────────────────────────────────────
  const handleDownloadVarHwpx = async () => {
    if (isDownloadingVarHwpx || pdfVarResults.length === 0) return;
    setIsDownloadingVarHwpx(true);
    try {
      const { preRenderGraphs } = await import("@/lib/graphCapture");

      const rendered = await Promise.all(
        pdfVarResults.map(async (r) => {
          const { processedSections, graphImages } = await preRenderGraphs([r.content]);
          return { num: r.num, processedSections, graphImages, cropImage: r.cropImage ?? null };
        })
      );

      let allGraphImages: string[] = [];
      const processedProblems = rendered.map(r => {
        const baseIdx = allGraphImages.length;
        const reindexed = r.processedSections.map(s =>
          s.replace(/\[GRAPH_IMG:(\d+)\]/g, (_m: string, n: string) => `[GRAPH_IMG:${baseIdx + parseInt(n)}]`),
        );
        allGraphImages = allGraphImages.concat(r.graphImages);
        return { num: r.num, sections: reindexed, cropImage: r.cropImage };
      });

      const res = await fetch("/api/export-workbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "multi",
          problems: processedProblems,
          includeOriginal: pdfIncludeOriginal,
          graphImages: allGraphImages,
        }),
        signal: AbortSignal.timeout(600_000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `한글 생성 오류 (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pdfFileName.replace(/\.pdf$/i, "")}_변형문제집.hwpx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "한글 파일 생성 오류");
    } finally {
      setIsDownloadingVarHwpx(false);
    }
  };

  const handleRetryProblem = useCallback((num: number) => {
    const problem = pdfState.problems.find((p) => p.num === num);
    if (!problem) return;

    let abortCtrl = pdfAbortRef.current;
    if (!abortCtrl || abortCtrl.signal.aborted) {
      abortCtrl = new AbortController();
      pdfAbortRef.current = abortCtrl;
    }

    const info: ProblemInfo = { num: problem.num, pages: problem.pages, yStart: 0, yEnd: 100 };
    const freshProblem = makeWaitingProblem(problem.num, problem.pages, problem.croppedImage);
    freshProblem.overallStatus = "solving";
    setPdfState((prev) => ({
      ...prev,
      phase: prev.phase === "done" ? "solving" : prev.phase,
      problems: prev.problems.map((p) => p.num === num ? freshProblem : p),
    }));

    solveProblemAllSections(
      info, pdfPages, problem.croppedImage,
      abortCtrl.signal, updateProblemSection, onProblemDone,
    );
  }, [pdfState.problems, pdfPages, updateProblemSection, onProblemDone]);

  const handleDownloadBatchPdf = async () => {
    if (isDownloadingBatchPdf) return;
    setIsDownloadingBatchPdf(true);
    try {
      const { exportBatchPdf } = await import("@/lib/pdfExport");
      const baseName = pdfFileName.replace(/\.pdf$/i, "");
      await exportBatchPdf(pdfState.problems, pdfPages, `${baseName}_풀이`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PDF 생성 오류");
    } finally {
      setIsDownloadingBatchPdf(false);
    }
  };

  const handleDownloadBatchHwpx = async () => {
    if (isDownloadingBatchHwpx) return;
    setIsDownloadingBatchHwpx(true);
    try {
      const { preRenderGraphs } = await import("@/lib/graphCapture");

      const validProblems = pdfState.problems
        .filter(p => p.sections.some(s => s.content))
        .map(p => ({ num: p.num, sections: p.sections.map(s => s.content), croppedImage: p.croppedImage ?? null }));

      const rendered = await Promise.all(
        validProblems.map(async (p) => {
          const { processedSections, graphImages } = await preRenderGraphs(p.sections);
          return { ...p, processedSections, graphImages };
        })
      );

      let allGraphImages: string[] = [];
      const processedProblems = rendered.map(r => {
        const baseIdx = allGraphImages.length;
        const reindexed = r.processedSections.map(s =>
          s.replace(/\[GRAPH_IMG:(\d+)\]/g, (_m: string, n: string) => `[GRAPH_IMG:${baseIdx + parseInt(n)}]`),
        );
        allGraphImages = allGraphImages.concat(r.graphImages);
        return { num: r.num, sections: reindexed, croppedImage: r.croppedImage };
      });

      const res = await fetch("/api/export-hwpx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "batch", problems: processedProblems, graphImages: allGraphImages }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `한글 생성 오류 (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pdfFileName.replace(/\.pdf$/i, "")}_풀이.hwpx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "한글 파일 생성 오류");
    } finally {
      setIsDownloadingBatchHwpx(false);
    }
  };

  // ── 파생 상태 ──────────────────────────────────────────────────────────────
  const isImgRunning   = imgState.overallStatus === "running";
  const isImgDone      = imgState.overallStatus === "done";
  const hasImgSolution = isImgDone && imgState.sections.some((s) => s.content);
  const hasImgContent  = imgState.sections.some((s) => s.content);

  const isPdfActive    = pdfState.phase !== "idle";
  const isPdfRunning   = pdfState.phase === "identifying" || pdfState.phase === "solving";
  const isPdfDone      = pdfState.phase === "done";
  const hasPdfSolution = isPdfDone && pdfState.problems.some((p) => p.sections.some((s) => s.content));

  return (
    <>
      <Header
        mode={mode}
        onModeChange={setMode}
        hasSolution={mode === "image" ? hasImgSolution : hasPdfSolution}
        onPrint={() => window.print()}
        onDownloadPdf={mode === "image" ? handleDownloadImgPdf : handleDownloadBatchPdf}
        onDownloadHwpx={mode === "image" ? handleDownloadImgHwpx : handleDownloadBatchHwpx}
        isDownloading={mode === "image" ? isDownloadingImgPdf : isDownloadingBatchPdf}
        isDownloadingHwpx={mode === "image" ? isDownloadingImgHwpx : isDownloadingBatchHwpx}
        onNewQuestion={() => { handleImgReset(); setMode("image"); }}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-24">

        {/* 모드 탭은 Header에 통합됨 */}

        {/* ══════════════════════ 이미지 모드 ══════════════════════ */}
        {mode === "image" && (
          <>
            {/* 과목 선택 + 해설 모드 — 풀이 시작 전에만 표시 */}
            {!hasImgContent && !isImgRunning && (
              <div className="mb-4 print:hidden">
                <p className="text-[12px] font-bold text-[var(--text-3)] mb-2">
                  과목 선택 <span className="text-red-500">*</span>
                </p>
                <SubjectSelector value={selectedSubject} onChange={setSelectedSubject} />
                {!selectedSubject && (
                  <p className="text-[11px] text-red-500 mt-1.5">문제를 올리기 전에 과목을 반드시 선택하세요.</p>
                )}

                {/* 작업 선택: 해설 vs 변형문제 */}
                <p className="text-[12px] font-bold text-[var(--text-3)] mt-4 mb-2">작업 선택</p>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setTaskMode("solve")}
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
                    onClick={() => setTaskMode("variation")}
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

                {/* 해설 모드 옵션 */}
                {taskMode === "solve" && (
                  <>
                    <p className="text-[11px] text-[var(--text-3)] mb-2">해설 모드 <span className="text-blue-500">(중복 선택 가능)</span></p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { id: "simple" as SolveMode, label: "실전풀이", desc: "시험장 현실적 풀이 · 직관+효율", color: "blue" },
                        { id: "detailed" as SolveMode, label: "해체분석", desc: "구조 분석 · 상세 설명", color: "violet" },
                        { id: "shortcut" as SolveMode, label: "숏컷 + 고급기법", desc: "빠른 풀이 · 기법 설명", color: "amber" },
                      ]).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => toggleSolveMode(m.id)}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[11px] font-bold border-2 transition-all",
                            solveModes.includes(m.id)
                              ? m.color === "blue" ? "bg-blue-600 text-white border-blue-600"
                                : m.color === "violet" ? "bg-violet-600 text-white border-violet-600"
                                : "bg-amber-600 text-white border-amber-600"
                              : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-blue-400"
                          )}
                        >
                          <span>{m.label}</span>
                          <span className="block text-[9px] font-normal opacity-75">{m.desc}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* 변형문제 옵션 */}
                {taskMode === "variation" && (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <div>
                        <p className="text-[11px] text-[var(--text-3)] mb-1.5">문제 유형</p>
                        <div className="flex gap-1">
                          {([
                            { id: "multiple-choice" as const, label: "객관식" },
                            { id: "short-answer" as const, label: "주관식" },
                          ]).map((t) => (
                            <button
                              key={t.id}
                              onClick={() => setVarQuestionType(t.id)}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
                                varQuestionType === t.id
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                              )}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] text-[var(--text-3)] mb-1.5">난이도</p>
                        <div className="flex gap-1">
                          {([
                            { id: "easier" as const, label: "보다 쉽게" },
                            { id: "same" as const, label: "동일하게" },
                            { id: "harder" as const, label: "보다 어렵게" },
                          ]).map((d) => (
                            <button
                              key={d.id}
                              onClick={() => setVarDifficulty(d.id)}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
                                varDifficulty === d.id
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                              )}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] text-[var(--text-3)] mb-1.5">문제 수</p>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              onClick={() => setVarCount(n)}
                              className={cn(
                                "w-7 h-7 rounded-lg text-[11px] font-bold border-2 transition-all",
                                varCount === n
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                              )}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className={`rounded-2xl glass overflow-hidden upload-area mb-6 ${hasImgContent || isImgRunning ? "hidden" : ""}`}>
              {(selectedImage || hasImgContent) && (
                <div className="flex items-center justify-between px-5 py-3 border-b-[3px] border-[var(--border)]">
                  <span className="text-[12px] font-semibold text-[var(--text-3)]">문제 이미지</span>
                  <button onClick={handleImgReset} className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors">
                    <RotateCcw size={12} />다시 시작
                  </button>
                </div>
              )}
              <div className="p-5">
                <ImageUploader ref={uploaderRef} onImageSelect={handleImageSelect} isAnalyzing={isImgRunning} />
                {imgState.sections.some((s) => s.status === "error") && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border-[3px] border-red-200 rounded-xl mt-4 text-[14px] text-red-700 font-medium">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{imgState.sections.find((s) => s.status === "error")?.error}</span>
                  </div>
                )}
                {selectedImage && !isImgDone && (
                  <div className="mt-4">
                    {taskMode === "solve" ? (
                      <button id="analyze-btn" onClick={handleAnalyze} disabled={isImgRunning}
                        className="w-full flex items-center justify-center gap-3 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black rounded-xl transition-all text-[16px] hover:shadow-[0_4px_22px_rgba(37,99,235,0.32)]">
                        {isImgRunning ? (
                          <><div className="flex gap-1.5">{[0,1,2].map((i) => <div key={i} className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                            <span>해설 생성 중…</span>
                          </>
                        ) : (
                          <><Sparkles size={17} /><span>해설 생성하기</span></>
                        )}
                      </button>
                    ) : (
                      <button disabled={isImgRunning}
                        onClick={() => {
                          if (!selectedImage || imgState.overallStatus === "running") return;
                          imgAbortRef.current = new AbortController();
                          const { signal } = imgAbortRef.current;
                          const img = selectedImage;
                          imgForExportRef.current = { base64: img.base64, mimeType: img.mimeType };
                          setImgState({
                            sections: [
                              { status: "streaming", content: "", error: null },
                              IDLE_IMG_SEC, IDLE_IMG_SEC, IDLE_IMG_SEC,
                            ],
                            overallStatus: "running",
                          });
                          let acc = "";
                          const subjectLabel = selectedSubject ? SUBJECTS.find(s => s.id === selectedSubject)?.label ?? "" : "";
                          streamSSE({
                            url: "/api/analyze",
                            body: {
                              imageBase64: img.base64, mimeType: img.mimeType,
                              variationDifficulty: varDifficulty, variationCount: varCount,
                              variationQuestionType: varQuestionType,
                              subject: subjectLabel,
                            },
                            signal,
                            onChunk: (t) => { acc += t; setImgState(prev => ({ ...prev, sections: [{ status: "streaming", content: acc, error: null }, prev.sections[1], prev.sections[2], prev.sections[3]] })); },
                            onDone: () => {
                              setImgState(prev => ({ ...prev, sections: [{ status: "done", content: acc, error: null }, prev.sections[1], prev.sections[2], prev.sections[3]], overallStatus: "done" }));
                              saveSolution({ mode: "image", taskType: "variation", imagePreview: img.preview, subject: selectedSubject ?? undefined, sections: [acc, "", "", ""] }).catch(() => {});
                            },
                            onError: (e) => setImgState(prev => ({ ...prev, sections: [{ status: "error", content: acc, error: e }, prev.sections[1], prev.sections[2], prev.sections[3]], overallStatus: "error" })),
                          });
                        }}
                        className="w-full flex items-center justify-center gap-3 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl transition-all text-[16px] hover:shadow-[0_4px_22px_rgba(5,150,105,0.32)]">
                        {isImgRunning ? (
                          <><div className="flex gap-1.5">{[0,1,2].map((i) => <div key={i} className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                            <span>변형문제 생성 중…</span>
                          </>
                        ) : (
                          <><Sparkles size={17} /><span>변형문제 {varCount}개 생성하기</span></>
                        )}
                      </button>
                    )}
                  </div>
                )}
                {isImgDone && (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-600 text-[14px] font-semibold">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />생성 완료
                    </div>
                    <button onClick={handleAnalyze} className="flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold text-[var(--text-2)] hover:text-[var(--text-1)] bg-[var(--bg-card)] hover:bg-[var(--bg-inset)] border border-[var(--border)] rounded-lg">
                      <RotateCcw size={12} />재생성
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* 좌우 2분할 — 와이어프레임 구조 */}
            {(hasImgContent || isImgRunning) && selectedImage && (
              <div className="flex flex-col lg:flex-row gap-4">
                {/* ── 왼쪽 컬럼: 메타 + 원본 문제 ── */}
                <div className="lg:w-[42%] lg:flex-shrink-0">
                  {/* 대단원 › 중단원 › 소단원 · 유형 */}
                  {imgMeta && (() => {
                    const units = [imgMeta.unit1, imgMeta.unit2, imgMeta.unit3, imgMeta.unit4].filter(Boolean);
                    const diffColors: Record<string,string> = {"기본":"#10b981","중하":"#3b82f6","중상":"#8b5cf6","고난도":"#f59e0b","킬러":"#ef4444"};
                    return (
                      <div className="mb-2 text-[11px] text-[var(--text-2)] font-medium flex items-center flex-wrap gap-1">
                        <span>{units.map((u, i) => (<span key={i}>{i > 0 && <span className="text-[var(--text-4)]"> › </span>}{u}</span>))}</span>
                        {/* 정답률 표시 — 데이터 정확도 확보 후 활성화 */}
                      </div>
                    );
                  })()}
                  {/* 원본 문제 이미지 */}
                  <div className="lg:sticky lg:top-[3.5rem] glass rounded-2xl overflow-hidden">
                    <img src={selectedImage.preview} alt="문제" className="w-full object-contain" />
                  </div>
                </div>
                {/* ── 오른쪽 컬럼: 탭 + 해설 ── */}
                <div className="lg:flex-1 min-w-0">
                  <SolutionViewer sections={imgState.sections} tabLabels={taskMode === "variation" ? ["변형문제"] : undefined} tabColors={taskMode === "variation" ? ["bg-emerald-600"] : undefined} />
                </div>
              </div>
            )}
            {hasImgContent && !selectedImage && <SolutionViewer sections={imgState.sections} tabLabels={taskMode === "variation" ? ["변형문제"] : undefined} tabColors={taskMode === "variation" ? ["bg-emerald-600"] : undefined} />}
            {!selectedImage && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 print:hidden">
                {[
                  { num:"01", title:"이미지 업로드", desc:"스크린샷·사진·클립보드 붙여넣기", border:"border-blue-400/35 hover:border-blue-500/60", dot:"bg-blue-500", numColor:"text-blue-400/28" },
                  { num:"02", title:"4단계 AI 해설", desc:"Gemini 3.1 Pro HIGH로 4섹션 생성", border:"border-violet-400/35 hover:border-violet-500/60", dot:"bg-violet-500", numColor:"text-violet-400/28" },
                  { num:"03", title:"PDF 저장", desc:"프리미엄 해설 PDF 즉시 다운로드", border:"border-amber-400/35 hover:border-amber-500/60", dot:"bg-amber-500", numColor:"text-amber-400/28" },
                ].map((item) => (
                  <div key={item.num} className={`bg-[var(--bg-card)]/70 rounded-xl p-5 border-[3px] ${item.border} transition-all hover:bg-white/75`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 ${item.dot}`} />
                      <span className={`text-[2.75rem] font-black font-mono leading-none ${item.numColor}`}>{item.num}</span>
                    </div>
                    <h3 className="font-extrabold text-[#2C2418] text-[15px] mb-1.5">{item.title}</h3>
                    <p className="text-[13px] font-medium text-[var(--text-3)] leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══════════════════════ PDF 모드 ══════════════════════ */}
        {mode === "pdf" && (
          <>
            {/* 과목 선택 + 작업 모드 — 시작 전에만 표시 */}
            {!isPdfActive && pdfVarPhase === "idle" && (
              <div className="mb-4 print:hidden">
                <p className="text-[12px] font-bold text-[var(--text-3)] mb-2">
                  과목 선택 <span className="text-violet-500 font-normal">(해당하는 과목을 모두 선택하세요)</span>
                </p>
                <MultiSubjectSelector value={pdfSubjects} onChange={setPdfSubjects} />

                {/* 작업 선택: 해설 vs 변형문제 */}
                <p className="text-[12px] font-bold text-[var(--text-3)] mt-4 mb-2">작업 선택</p>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setPdfTaskMode("solve")}
                    className={cn("flex-1 py-2.5 rounded-xl text-[13px] font-bold border-2 transition-all",
                      pdfTaskMode === "solve" ? "bg-violet-600 text-white border-violet-600" : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-violet-400"
                    )}>해설 생성</button>
                  <button onClick={() => setPdfTaskMode("variation")}
                    className={cn("flex-1 py-2.5 rounded-xl text-[13px] font-bold border-2 transition-all",
                      pdfTaskMode === "variation" ? "bg-emerald-600 text-white border-emerald-600" : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                    )}>변형문제 일괄 생성</button>
                </div>

                {/* 변형문제 전체 설정 */}
                {pdfTaskMode === "variation" && (
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <div>
                      <p className="text-[11px] text-[var(--text-3)] mb-1.5">원본 포함</p>
                      <div className="flex gap-1">
                        {([{ id: true, label: "포함" }, { id: false, label: "미포함" }] as const).map(o => (
                          <button key={String(o.id)} onClick={() => setPdfIncludeOriginal(o.id)}
                            className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
                              pdfIncludeOriginal === o.id ? "bg-emerald-600 text-white border-emerald-600" : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                            )}>{o.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-3)] mb-1.5">난이도</p>
                      <div className="flex gap-1">
                        {([{ id: "same" as const, label: "동일하게" }, { id: "harder" as const, label: "더 어렵게" }]).map(d => (
                          <button key={d.id} onClick={() => setPdfVarDifficulty(d.id)}
                            className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
                              pdfVarDifficulty === d.id ? "bg-emerald-600 text-white border-emerald-600" : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                            )}>{d.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-3)] mb-1.5">문제 유형</p>
                      <div className="flex gap-1">
                        {([{ id: "follow-original" as const, label: "원본따라" }, { id: "multiple-choice" as const, label: "객관식" }, { id: "short-answer" as const, label: "주관식" }]).map(t => (
                          <button key={t.id} onClick={() => setPdfVarType(t.id)}
                            className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
                              pdfVarType === t.id ? "bg-emerald-600 text-white border-emerald-600" : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                            )}>{t.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-[var(--text-3)] mb-1.5">변형 수</p>
                      <div className="flex gap-1">
                        {[3, 4, 5].map(n => (
                          <button key={n} onClick={() => setPdfVarCount(n)}
                            className={cn("w-7 h-7 rounded-lg text-[11px] font-bold border-2 transition-all",
                              pdfVarCount === n ? "bg-emerald-600 text-white border-emerald-600" : "bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:border-emerald-400"
                            )}>{n}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl glass overflow-hidden mb-6 print:hidden">
              {pdfPages.length > 0 && (
                <div className="flex items-center justify-between px-5 py-3 border-b-[3px] border-[var(--border)]">
                  <span className="text-[12px] font-semibold text-[var(--text-3)]">시험지 PDF</span>
                  <div className="flex items-center gap-3">
                    {pdfSubjects.length > 0 && (
                      <span className="text-[11px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                        {pdfSubjects.map(id => SUBJECTS.find(s => s.id === id)?.label).filter(Boolean).join(" · ")}
                      </span>
                    )}
                    <button onClick={handlePdfReset} className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors">
                      <RotateCcw size={12} />다시 시작
                    </button>
                  </div>
                </div>
              )}
              <div className="p-5">
                <PdfUploader ref={pdfUploaderRef} onPagesReady={handlePagesReady} isAnalyzing={isPdfRunning} />
                {pdfPages.length > 0 && !isPdfDone && pdfVarPhase === "idle" && pdfTaskMode === "solve" && (
                  <div className="mt-4">
                    <button onClick={handlePdfAnalyze} disabled={isPdfRunning}
                      className="w-full flex items-center justify-center gap-3 py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black rounded-xl transition-all text-[16px] hover:shadow-[0_4px_22px_rgba(124,58,237,0.32)]">
                      {isPdfRunning ? (
                        <><div className="flex gap-1.5">{[0,1,2].map((i) => <div key={i} className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                          <span>{pdfState.phase === "identifying" ? "문제 목록 분석 중…" : "문제별 3단계 해설 생성 중…"}</span>
                        </>
                      ) : (
                        <><Sparkles size={17} /><span>전체 문제 3단계 해설 생성하기</span></>
                      )}
                    </button>
                    {pdfState.phase === "solving" && (
                      <p className="text-center text-[13px] font-medium text-[var(--text-3)] mt-2">
                        {pdfState.problems.length}개 문제 × 4섹션 · Gemini 3.1 Pro HIGH · 동시 3문제
                      </p>
                    )}
                  </div>
                )}
                {pdfPages.length > 0 && !isPdfDone && pdfVarPhase !== "done" && pdfTaskMode === "variation" && (
                  <div className="mt-4">
                    <button onClick={handlePdfVariation} disabled={pdfVarPhase === "identifying" || pdfVarPhase === "generating"}
                      className="w-full flex items-center justify-center gap-3 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl transition-all text-[16px] hover:shadow-[0_4px_22px_rgba(5,150,105,0.32)]">
                      {pdfVarPhase === "identifying" ? (
                        <><div className="flex gap-1.5">{[0,1,2].map((i) => <div key={i} className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                          <span>문제 목록 분석 중…</span></>
                      ) : pdfVarPhase === "generating" ? (
                        <><div className="flex gap-1.5">{[0,1,2].map((i) => <div key={i} className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                          <span>변형문제 생성 중… ({pdfVarProgress.done}/{pdfVarProgress.total})</span></>
                      ) : (
                        <><Sparkles size={17} /><span>전체 문제 변형문제 일괄 생성</span></>
                      )}
                    </button>
                  </div>
                )}
                {isPdfDone && pdfTaskMode === "solve" && (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-600 text-[14px] font-semibold">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />전체 3단계 해설 완료
                    </div>
                    <button onClick={handlePdfAnalyze} className="flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold text-[var(--text-2)] hover:text-[var(--text-1)] bg-[var(--bg-card)] hover:bg-[var(--bg-inset)] border border-[var(--border)] rounded-lg">
                      <RotateCcw size={12} />재생성
                    </button>
                  </div>
                )}
                {pdfVarPhase === "done" && (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-600 text-[14px] font-semibold">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />{pdfVarResults.length}개 문제 변형문제 생성 완료
                    </div>
                    <button onClick={handleDownloadVarHwpx} disabled={isDownloadingVarHwpx}
                      className="flex items-center gap-2 px-4 py-2 text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-all">
                      {isDownloadingVarHwpx ? "생성 중…" : "변형문제집 한글 다운로드"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <PdfBatchViewer
              pdfState={pdfState}
              onRetryProblem={handleRetryProblem}
              onRetryAllFailed={() => {
                const failed = pdfState.problems.filter(p => p.overallStatus === "error");
                failed.forEach(p => handleRetryProblem(p.num));
              }}
            />

            {pdfPages.length === 0 && !isPdfActive && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 print:hidden">
                {[
                  { num:"01", title:"PDF 업로드", desc:"수학 시험지 PDF 선택 (페이지 무제한)", border:"border-violet-400/35 hover:border-violet-500/60", dot:"bg-violet-500", numColor:"text-violet-400/28" },
                  { num:"02", title:"4단계 자동 해설", desc:"문제 읽기 + 실전풀이 + 숏컷 + 변형 대비", border:"border-violet-400/35 hover:border-violet-500/60", dot:"bg-violet-400", numColor:"text-violet-400/28" },
                  { num:"03", title:"풀이 PDF 저장", desc:"전체 해설 PDF 즉시 다운로드", border:"border-violet-400/35 hover:border-violet-500/60", dot:"bg-violet-300", numColor:"text-violet-400/28" },
                ].map((item) => (
                  <div key={item.num} className={`bg-[var(--bg-card)]/70 rounded-xl p-5 border-[3px] ${item.border} transition-all hover:bg-white/75`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 ${item.dot}`} />
                      <span className={`text-[2.75rem] font-black font-mono leading-none ${item.numColor}`}>{item.num}</span>
                    </div>
                    <h3 className="font-extrabold text-[#2C2418] text-[15px] mb-1.5">{item.title}</h3>
                    <p className="text-[13px] font-medium text-[var(--text-3)] leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══════════════════════ 히스토리 모드 ══════════════════════ */}
        {mode === "history" && <HistoryView />}
      </main>
    </>
  );
}
