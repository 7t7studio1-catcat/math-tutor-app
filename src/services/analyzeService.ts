/**
 * AI 풀이 스트리밍 서비스
 *
 * 컴포넌트에서 직접 fetch하지 않고 이 서비스를 통해 호출.
 * SSE 스트리밍 + 자동 재시도 + abort 관리.
 */

export interface StreamAnalyzeOpts {
  url: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  maxAttempts?: number;
  retryDelay?: number;
}

export async function streamSSE(opts: StreamAnalyzeOpts, attempt = 1): Promise<void> {
  const { url, body, signal, onChunk, onDone, onError } = opts;
  const maxAttempts = opts.maxAttempts ?? 3;
  const retryDelay = opts.retryDelay ?? 4000;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const status = res.status;
      if ((status === 429 || status === 503) && attempt < maxAttempts) {
        const wait = retryDelay * attempt;
        console.log(`[SSE] ${status} retry ${attempt}/${maxAttempts} in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        return streamSSE(opts, attempt + 1);
      }
      onError(`서버 오류 (${status})`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError("스트림을 열 수 없습니다.");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            onDone();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) onChunk(parsed.text);
          } catch {
            if (data.trim()) onChunk(data);
          }
        }
      }
    }

    onDone();
  } catch (e) {
    if (signal.aborted) return;
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    if (attempt < maxAttempts && !signal.aborted) {
      const wait = retryDelay * attempt;
      console.log(`[SSE] Error retry ${attempt}/${maxAttempts} in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      return streamSSE(opts, attempt + 1);
    }
    onError(msg);
  }
}

export async function analyzeMeta(
  imageBase64: string,
  solutionContent: string,
  subject?: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("/api/analyze-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, solutionContent, subject }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
