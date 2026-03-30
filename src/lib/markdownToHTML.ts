/**
 * markdownToHTML — PDF 내보내기용 마크다운 → HTML 변환
 *
 * 핵심 전략 (placeholder 방식):
 *   1. 모든 $...$ / $$...$$ 를 고유 텍스트 토큰(KATEXPH0END 등)으로 치환하면서
 *      KaTeX.renderToString 으로 HTML 을 미리 생성해 Map 에 저장한다.
 *   2. graph / meta 코드 블록은 제거한다.
 *   3. 나머지를 순수 마크다운으로 파싱 → HTML 문자열을 얻는다.
 *   4. HTML 문자열에서 placeholder 를 KaTeX HTML 로 교체한다.
 *
 * 이 방식은 remark-math 가 가진 한글 인접·볼드 중첩·따옴표 내부 등
 * 모든 edge-case 를 원천적으로 제거한다.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import katex from "katex";

import {
  fixMidNotation,
  injectDisplayStyle,
  convertSlashFractions,
  widenChoices,
  collapseBlankLines,
  stylePartHeaders,
} from "@/lib/mathPreprocess";

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeStringify);

const KATEX_INLINE: katex.KatexOptions = {
  displayMode: false,
  throwOnError: false,
  strict: false,
  minRuleThickness: 0.08,
};
const KATEX_DISPLAY: katex.KatexOptions = {
  displayMode: true,
  throwOnError: false,
  strict: false,
  minRuleThickness: 0.08,
};

export function markdownToHTML(md: string): string {
  let text = collapseBlankLines(md);
  text = stylePartHeaders(text);
  text = fixMidNotation(text);
  text = injectDisplayStyle(text);
  text = convertSlashFractions(text);

  /* ── Phase 1: 수식 추출 → placeholder + KaTeX 렌더링 ───────────────── */
  const mathMap = new Map<string, string>();
  let idx = 0;

  // display math $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, latex: string) => {
    const ph = `KATEXPH${idx++}END`;
    try {
      mathMap.set(ph, katex.renderToString(latex.trim(), KATEX_DISPLAY));
    } catch {
      mathMap.set(ph, `<code>${escapeHtml(latex.trim())}</code>`);
    }
    return `\n\n${ph}\n\n`;
  });

  // inline math $...$
  text = text.replace(
    /\$(?!\$)((?:[^$\n\\]|\\.)+?)\$/g,
    (_m, latex: string) => {
      const ph = `KATEXPH${idx++}END`;
      try {
        mathMap.set(ph, katex.renderToString(latex.trim(), KATEX_INLINE));
      } catch {
        mathMap.set(ph, `<code>${escapeHtml(latex.trim())}</code>`);
      }
      return ph;
    },
  );

  /* ── Phase 2: graph / meta 코드블록 제거 ───────────────────────────── */
  text = text.replace(/`{3,}(?:graph|meta)[^\n]*\n[\s\S]*?`{3,}/g, "");

  text = widenChoices(text);

  /* ── Phase 3: markdown → HTML (placeholder 는 안전한 평문 토큰) ──── */
  const file = processor.processSync(text);
  let html = String(file);

  /* ── Phase 4: placeholder → KaTeX HTML 복원 ────────────────────────── */
  for (const [ph, rendered] of mathMap) {
    html = html.replaceAll(ph, rendered);
  }

  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
