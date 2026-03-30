# 스마트풀이(math-tutor-app) — 프로젝트 기억 저장소

> **한 줄 체크리스트·디렉터리 맵**은 루트의 **`AGENTS.md`** 를 단일 진입점으로 쓴다.  
> 이 파일은 그보다 **맥락·이유·운영 함정**을 풀어 쓴 심층 기록이다.  
> 최종 정리일: 2026-03-29 (대화·구현 이력 기준)

**AI용**: 규칙 우선순위는 **`AGENTS.md` 품질·수행 원칙 + MUST/NEVER 표** > `.cursor/rules/execution-principles.mdc` > 이 문서의 서술. 이 문서는 “왜”와 운영 시나리오 보강용.

---

## 1. 제품 비전과 품질 기준

- **목표**: 메가스터디·대성·시대인재급 납품 및 EBS 변형문제집 수준의 **출판·인쇄 품질** 파이프라인.
- **변형(심화)**: 원본과 비슷한 수준의 “살짝 변형”이 아니라, **원본보다 확실히 어려운 심화**가 되도록 프롬프트에서 구조·체크리스트로 강제.
- **해설 톤**: 독자가 풀이를 “해독”하는 것이 아니라, **풀이가 독자를 이해시키는** 서술. 실전개념(교과서 밖 기법)을 쓸 때는 **이름을 명시**하고, 가능하면 **소개 → 이유 → 적용** 순으로 짧게 박아 넣을 것(프롬프트 `prompts.ts`에 반복 강조).
- **실전개념 명명 이슈**: 예를 들어 3차·이중근 구조에서는 관행적으로 **거리곱(27ak⁴, 4ak³ 등)** 표현을 독자에게 보여 주는 것이 요구사항. 모델이 인수분해만 하고 용어를 생략하면 안 되므로, 프롬프트에 **용어 강제**를 계속 보강하는 영역임.

---

## 2. 기술 스택 요약

| 영역 | 선택 |
|------|------|
| 웹 | Next.js 16, TypeScript, Tailwind 4 |
| 상태 | Zustand (`src/stores/`) |
| AI | Google Gemini (모델은 라우트별로 상이 — 아래 참고) |
| 브라우저 수식 | KaTeX |
| HWPX | **Windows + 한글 + Python COM (`win32com`)** 가 정식 경로 |
| 터널 | Cloudflare Tunnel (`cloudflared`) — **약 100초 제한**이 제품 설계에 직접 영향 |

---

## 3. HWPX 파이프라인 (가장 중요한 근본 구조)

### 3.1 단일 API

- **통합 엔드포인트**: `src/app/api/export/route.ts`  
- **포맷**: `solution` | `solution-batch` | `workbook` | `workbook-multi`
- **실행**: Node가 임시 디렉터리에 `data.json` 작성 후  
  `python -m scripts.hwpx --format ... --input ... --output ...` 실행.

### 3.2 Python 패키지

- 엔트리: `scripts/hwpx/__main__.py` (전체 프로세스 재시도·출력 파일 크기 검증)
- COM 생명주기·저장: `scripts/hwpx/core.py` (HWP 기동 재시도, 저장 재시도, HWPX 실패 시 HWP 폴백, 종료 시 프로세스 정리)
- 수식: `scripts/hwpx/equation.py` — `EqFontName`은 **`HYhwpEQ`**, 삽입 후 **`_equation_refresh`** 로 즉시 렌더 안정화
- LaTeX → HwpEqn: `scripts/latex_to_hwpeqn.py` (정규식·규칙 기반; **워크북보내기의 주 경로**)
- 마크다운: `scripts/markdown_parser.py`

### 3.3 Cloudflare / 타임아웃과의 타협

- 터널·엣지에서 긴 동기 요청이 끊기므로, **워크북(`workbook`, `workbook-multi`) 경로에서는 `/api/export` 내 Gemini 기반 일괄 HwpEqn 변환을 호출하지 않음.**  
  주석 요지: Gemini 한 번이 수십 초를 잡아먹어 **100초 제한**을 넘기기 쉬움 → **Python 내장 `latex_to_hwpeqn`만 사용**.
- `route.ts` 안에 `convertSectionsToHwpEqn` 등 **레거시/예비 코드**가 남아 있을 수 있으나, 워크북 분기에서는 실제로 호출하지 않도록 유지할 것.

### 3.4 Node 쪽 성공 판정

- `runPythonGenerator`: 프로세스 exit code만 믿지 않고, **출력 파일 존재 + 크기 > 100 bytes** 이면 성공으로 간주(한글 COM이 이상 종료코드를 내는 사례 대응).

### 3.5 프론트보내기

- `src/services/exportService.ts`: 우선 `/api/export`, 실패 시 `/api/export-ts` (순수 TS, **텍스트·비네이티브 수식 폴백**).  
- `HistoryView` 등은 **직접 구형 라우트 호출하지 말고** `exportHwpx` 통로 사용.

### 3.6 수식·문자 깨짐 방지 (누적 수정)

- `latex_to_hwpeqn.py`: `\{` `\}` → `LEFT lbrace` / `RIGHT rbrace` 등 HWP 방정식 문법 정합
- `\pm` → `+-`, `\mp` → `-+`
- `equation.py`, `latex_to_hwpeqn.py`, `markdown_parser.py`: **보이지 않는 유니코드 방향 제어 문자(LRI/RLI 등)** 제거용 `_UNICODE_JUNK` 처리

---

## 4. 기타 API·프론트 메모

- **`/api/analyze`**: 장시간 “생각” 구간 때문에 Cloudflare 524가 나지 않도록 **SSE 하트비트** 등으로 연결 유지(구현은 `analyze/route.ts` 쪽).
- **`/api/analyze-meta`**: 실패 시에도 **200 + 기본 메타데이터**로 UI가 죽지 않게 처리. 모델은 `gemini-2.5-flash` 등으로 조정된 이력 있음.
- **이미지 생성**: `generate-diagram` 등에서 이미지 모델명은 API에 맞게 갱신 (예: `gemini-2.5-flash-image`).
- **그래프 PNG**: `src/lib/graphSvg.ts` + `api/render-graph`에서 `@resvg/resvg-js` 기반 렌더.

---

## 5. 실전개념 데이터

- `src/lib/techniquesDB.ts`: 다수 기법 + (본질·신호·연결·확장 등) 구조화 필드.
- `src/lib/prompts.ts`: 수능 표기 규칙, 4단 해설, 변형 난이도, 실전개념 사전·톤 규칙의 **단일 진실 공급원**.

---

## 6. 외부 접속·협업

- **인터넷 어디서나(이 PC의 앱)**: 이 저장소만 Vercel에 올려도 **한글 COM은 클라우드에서 돌아가지 않음.** 실질적으로는 **본인 Windows PC에서 Next dev + cloudflared** 조합이 “원격에서 이 PC의 localhost:3000” 패턴.
- **GitHub**: 코드 동기화용. 한 PC에서 push해도 다른 PC는 **pull 전까지 자동 반영 안 됨.**

---

## 7. 운영 시 주의

- HWP가 이미 떠 있거나 좀비 프로세스가 있으면 COM이 불안정 → `taskkill`·`killHwpProcesses` 등과 Python `core.py`의 정리 로직이 방어선.
- 터널 URL은 세션/네트워크마다 달라질 수 있음 — “다른 장소에서 안 됨”은 **터널이 꺼졌거나 URL이 바뀐 경우**를 먼저 의심.

---

## 8. 관련 규칙 파일

- **`AGENTS.md`** — 요약·체크리스트·에이전트 공통 진입
- `.cursor/rules/project-context.mdc` — Cursor 전역 컨텍스트
- `.cursor/rules/hwpx-generation.mdc` — HWPX·수식 상세
- `.cursor/rules/prompt-style.mdc` 등 — 문체·UI 철학
