"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * DiagramRenderer — language-diagram 코드 블록을 Gemini 이미지 생성으로 렌더링.
 *
 * 설명 텍스트를 받아 /api/generate-diagram에 요청하고 결과 이미지를 표시.
 * 동일한 설명에 대해 세션 내 캐시.
 */

const cache = new Map<string, string>();

export default function DiagramRenderer({ description }: { description: string }) {
  const [imageData, setImageData] = useState<string | null>(cache.get(description) ?? null);
  const [loading, setLoading] = useState(!cache.has(description));
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (cache.has(description)) {
      setImageData(cache.get(description)!);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.image) {
        const src = `data:${data.mimeType ?? "image/png"};base64,${data.image}`;
        cache.set(description, src);
        setImageData(src);
      } else {
        throw new Error("이미지 데이터 없음");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "다이어그램 생성 실패");
    } finally {
      setLoading(false);
    }
  }, [description]);

  useEffect(() => { generate(); }, [generate]);

  if (loading) {
    return (
      <div className="my-4 flex items-center justify-center p-8 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <span className="text-[13px] text-[var(--text-3)] font-medium">다이어그램 생성 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-4 p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
        <p className="text-[13px] text-red-600 dark:text-red-400 font-medium">다이어그램 생성 실패: {error}</p>
        <button
          onClick={generate}
          className="mt-2 px-3 py-1 text-[12px] font-bold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!imageData) return null;

  return (
    <div className="my-4 mx-auto rounded-lg bg-white dark:bg-[var(--bg-card-solid)] overflow-hidden" style={{ maxWidth: 480 }}>
      <img src={imageData} alt="수학 다이어그램" className="w-full object-contain" />
    </div>
  );
}
