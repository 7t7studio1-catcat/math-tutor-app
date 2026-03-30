# AGENTS.md — 스마트풀이 (math-tutor-app) 시스템 컨텍스트

> **이 파일은 어떤 AI(Cursor, Claude, Copilot, ChatGPT 등)든 이 프로젝트를 열면 반드시 읽어야 하는 전체 시스템 문서입니다.**
> 100억 규모, 메가스터디·대성·시대인재 납품, EBS 변형문제집 베스트셀러 목표.

---

## 1. 프로젝트 개요

| 항목 | 값 |
|------|-----|
| 이름 | 스마트풀이 (SmartPuli) |
| 목적 | 수능 수학 문제 AI 해설 + 변형문제 생성 + 출판사급 HWPX 납품 |
| 스택 | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4 · Zustand |
| AI | Gemini 3.1 Pro (풀이 스트리밍) · Gemini 2.5 Flash (메타분석, 수식 변환) |
| 출력 | HWPX (한글 파일) · PDF (KaTeX 벡터) · 웹 실시간 렌더링 |
| 대상 출판사 | 메가스터디, 대성, 시대인재, EBS (각각 고유 레이아웃 스타일) |

---

## 2. 디렉토리 구조 및 각 파일의 역할

```
math-tutor-app/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 메인 라우터 — image/pdf/history 모드 전환
│   │   ├── layout.tsx            # 전역 셸: 메타데이터, Pretendard 폰트, 다크모드
│   │   └── api/
│   │       ├── analyze/route.ts          # [SSE] 이미지→4단계 해설 (Gemini 3.1 Pro)
│   │       ├── analyze-meta/route.ts     # 문제 메타데이터 분석 (단원/정답률/난이도)
│   │       ├── pdf-solve/route.ts        # [SSE] PDF 모드 문제별 풀이 스트리밍
│   │       ├── pdf-identify/route.ts     # PDF 페이지에서 문제 영역 식별
│   │       ├── convert-hwpeqn/route.ts   # LaTeX→HwpEqn 변환 (Gemini)
│   │       ├── export-ts/route.ts        # [핵심] 순수 TS HWPX 생성 (비동기 job 지원)
│   │       ├── export-ts/status/route.ts # 비동기 HWPX job 폴링 엔드포인트
│   │       ├── export/route.ts           # 레거시: Python COM HWPX (로컬 전용)
│   │       ├── export-hwpx-v2/route.ts   # 레거시: Python HWPX v2
│   │       ├── export-workbook/route.ts  # 레거시: 문제집 내보내기
│   │       ├── export-hwpx/route.ts      # 레거시: 초기 HWPX
│   │       ├── render-graph/route.ts     # 서버사이드 그래프 SVG→PNG
│   │       └── generate-diagram/route.ts # AI 기하 다이어그램 생성
│   ├── features/
│   │   ├── image/ImageMode.tsx   # 이미지 모드 (카메라/갤러리 → 해설)
│   │   ├── pdf/PdfMode.tsx       # PDF 모드 (시험지 업로드 → 일괄 풀이)
│   │   └── history/HistoryMode.tsx # 히스토리 (IndexedDB 기반)
│   ├── components/
│   │   ├── Header.tsx            # 앱 헤더 (모드 탭, 내보내기 버튼)
│   │   ├── SolutionViewer.tsx    # 풀이 렌더링 (KaTeX + 그래프)
│   │   ├── SolutionCard.tsx      # 풀이 카드 UI
│   │   ├── GraphRenderer.tsx     # 클라이언트 그래프 (mafs 라이브러리)
│   │   ├── DiagramRenderer.tsx   # AI 기하 다이어그램 표시
│   │   ├── ExportButtons.tsx     # PDF/한글 다운로드 버튼
│   │   ├── PdfUploader.tsx       # PDF 업로드 컴포넌트
│   │   ├── ImageUploader.tsx     # 이미지 업로드 컴포넌트
│   │   ├── PdfBatchViewer.tsx    # PDF 일괄 풀이 뷰어
│   │   ├── OptionsPanel.tsx      # 풀이 옵션 (모드, 난이도 등)
│   │   ├── SubjectSelector.tsx   # 과목 선택기
│   │   └── HistoryView.tsx       # 히스토리 목록/상세
│   ├── stores/
│   │   ├── index.ts              # 배럴 (useUiStore, useImageStore, usePdfStore)
│   │   ├── uiStore.ts            # 앱 모드(image/pdf/history), 과목 선택
│   │   ├── imageStore.ts         # 이미지 모드 상태 (사진, 4섹션, 내보내기)
│   │   └── pdfStore.ts           # PDF 모드 상태 (페이지, 문제목록, 변형)
│   ├── services/
│   │   ├── index.ts              # 배럴
│   │   ├── analyzeService.ts     # SSE 스트리밍 + 재시도 + abort
│   │   ├── exportService.ts      # HWPX 내보내기 (COM→TS 폴백, 터널 비동기)
│   │   ├── pdfIdentifyService.ts # PDF 문제 식별 + 이미지 크롭
│   │   └── graphService.ts       # 그래프 프리렌더링
│   ├── lib/
│   │   ├── prompts.ts            # [핵심] 4단 해설 프롬프트 (910줄 프롬프트 엔지니어링)
│   │   ├── variationGraphPrompts.ts # 변형문제+그래프 프롬프트
│   │   ├── pdfBatchPrompts.ts    # PDF 배치 풀이 프롬프트
│   │   ├── subjects.ts           # 수능 과목/단원 체계, 빈출 유형
│   │   ├── techniquesDB.ts       # 실전개념 데이터베이스
│   │   ├── graphSvg.ts           # 순수 SVG 그래프 생성기 (mathjs 기반)
│   │   ├── graphCapture.tsx      # 그래프 캡처/프리렌더
│   │   ├── mathPreprocess.ts     # 수식 전처리 (displaystyle 주입, 분수 변환 등)
│   │   ├── markdownToHTML.ts     # 마크다운→HTML (placeholder 방식 KaTeX)
│   │   ├── pdfGenerator.ts       # 클라이언트 PDF 생성
│   │   ├── pdfExport.ts          # KaTeX 벡터 PDF 내보내기
│   │   ├── downloadPdf.ts        # PDF 다운로드 유틸
│   │   ├── solutionStore.ts      # IndexedDB 풀이 저장소 v2
│   │   ├── exportTsJobs.ts       # 비동기 HWPX job 큐 (in-memory)
│   │   ├── utils.ts              # 공용 유틸
│   │   └── hwpx/                 # [핵심] 순수 TS HWPX 생성 파이프라인
│   │       ├── index.ts          # generateHwpx() 메인 API
│   │       ├── types.ts          # OWPML 문서 모델 (HwpxDocument 등)
│   │       ├── markdown-to-hwpx.ts # 마크다운→HWPX 문서 변환
│   │       ├── packager.ts       # HWPX ZIP 패키징 (archiver)
│   │       ├── styles.ts         # 출판사별 스타일 프리셋
│   │       └── xml/              # OWPML XML 생성
│   │           ├── section.ts    # section0.xml
│   │           ├── header.ts     # header.xml (글꼴/스타일)
│   │           ├── container.ts  # META-INF/container.xml 등
│   │           └── contentHpf.ts # Contents/content.hpf
│   └── types/
│       ├── index.ts              # 배럴
│       ├── solution.ts           # SectionState, SectionTuple, SEC_META
│       ├── export.ts             # ExportFormat, ExportRequest
│       └── problem.ts            # ProblemState, ProblemInfo
├── .env.local                    # ⚠️ API 키 (절대 커밋 금지)
├── next.config.ts                # 서버 외부 패키지, 50MB body 제한
├── package.json                  # Next 16, React 19, Zustand, KaTeX, mafs 등
└── tsconfig.json
```

---

## 3. 핵심 데이터 흐름

### 3-A. 이미지 모드 (ImageMode)

```
사용자가 수학 문제 사진 촬영/업로드
  → imageStore.setImage(base64)
  → STEP 2 (정석 풀이) 먼저 생성: POST /api/analyze (SSE, Gemini 3.1 Pro)
    → streamSSE()가 청크 수신 → imageStore.updateSection(1, {content})
  → STEP 2 완료 후 STEP 1, 3, 4 병렬 생성
    → 각각 POST /api/analyze (다른 section 파라미터)
  → 동시에 POST /api/analyze-meta (Gemini 2.5 Flash)로 메타분석
  → 완료 시 IndexedDB에 저장 (solutionStore.saveSolution)
```

### 3-B. PDF 모드 (PdfMode)

```
시험지 PDF 업로드
  → pdfjs-dist로 페이지별 렌더링 → pdfStore.setPages()
  → POST /api/pdf-identify로 문제 영역 식별
  → 각 문제별 크롭 이미지 생성 (cropProblemImage)
  → 문제별 SSE 스트리밍: POST /api/pdf-solve
  → 변형문제 생성: POST /api/analyze (variation 파라미터)
```

### 3-C. HWPX 내보내기 (Export Pipeline)

```
사용자가 "한글 파일 다운로드" 클릭
  → exportService.exportHwpx()
    → 로컬(localhost): /api/export (Python COM) 시도 → 실패 시 /api/export-ts
    → 터널(trycloudflare): /api/export-ts 비동기 (202 + job 폴링)
  → /api/export-ts 내부:
    1. LaTeX→HwpEqn 변환 (Gemini, 섹션 4개 병렬)
    2. 그래프 JSON→SVG→PNG (resvg)
    3. markdownToHwpx() — 마크다운→HWPX 문서 모델
    4. packageHwpx() — OWPML ZIP 패키징
  → Blob → downloadBlob() → 사용자 다운로드
```

---

## 4. 4단계 해설 시스템

| STEP | 이름 | 생성 순서 | 프롬프트 파일 | 의존 |
|------|------|-----------|---------------|------|
| 2 | 정석 풀이 | **1번째** (가장 먼저) | `prompts.ts` SECTION2_SYSTEM | 이미지만 |
| 1 | 문제 읽기 | 2번째 (STEP 2 역추적) | `prompts.ts` buildSection1Prompt | STEP 2 결과 |
| 3 | 숏컷 | 2번째 (병렬) | `prompts.ts` buildSection3Prompt | STEP 2 결과 |
| 4 | 변형 대비 | 2번째 (병렬) | `prompts.ts` buildSection4Prompt | STEP 2 결과 |

### 해설 모드 (사용자 선택)
- `simple` (실전풀이): 사고 흐름을 이끄는 간결한 풀이
- `detailed` (해체분석): "왜 이렇게 접근하는지" 완벽 해설
- `shortcut` (숏컷): 정석과 완전히 다른 우아한 빠른 풀이

---

## 5. 출판사별 HWPX 스타일 (styles.ts)

| 출판사 | id | 판형 | 단 | 여백 | 행간 | 제목색 |
|--------|-----|------|-----|------|------|--------|
| 기본 | `default` | A4 (210×297) | 1단 | 15mm | 160% | #1a1a1a |
| 메가스터디 | `megastudy` | A4 | 2단 | 18mm | 170% | #1B3A6B |
| 대성 | `daesung` | A4 | 2단 | 16mm | 165% | #2C2C2C |
| 시대인재 | `sidaein` | A4 | 2단 | 17mm | 165% | #7B2D8E |
| EBS | `ebs` | B5 (188×257) | 2단 | 14mm | 160% | #00598A |

---

## 6. AI 모델 사용 현황

| 용도 | 모델 | 엔드포인트 | 특징 |
|------|------|-----------|------|
| 풀이 스트리밍 | `gemini-3.1-pro-preview` | /api/analyze, /api/pdf-solve | SSE, thinkingBudget 16384 |
| 메타 분석 | `gemini-2.5-flash` | /api/analyze-meta | JSON 반환, 재시도 5회 |
| LaTeX→HwpEqn | `gemini-2.5-flash` | /api/export-ts 내부 | 섹션별 병렬 4개 |
| 변형문제 | `gemini-3.1-pro-preview` | /api/analyze (variation 파라미터) | SSE |

---

## 7. 수식 표기 규칙 (가장 중요)

이 프로젝트의 모든 수식은 **수능 시험지 실물 표기법**을 완벽 준수해야 합니다:

- `$...$` 인라인, `$$...$$` 디스플레이
- `\displaystyle` 필수: `\lim`, `\sum`, `\prod`, `\int`, `\frac`, `\binom`이 인라인에 올 때
- 분수는 항상 `\frac{}{}` (a/b 절대 금지)
- 도함수: `f'(x)` (아포스트로피, `\prime` 금지)
- 이중적분: `\iint` (`\int\int` 금지)
- 집합: `\{`, `\}`, `\mid` 사용
- 점 이름: `\mathrm{P}` (로만 대문자)
- 조합: `\,_{n}\mathrm{C}_{r}`

---

## 8. 그래프 시스템 (GraphSpec)

그래프는 `language-graph` 코드블록의 JSON으로 정의되며, `graphSvg.ts`가 순수 SVG로 변환:

- `functions`: mathjs 수식 (`^` 거듭제곱, `*` 곱셈)
- `points`, `hollowPoints`: 점 (채움/빈)
- `segments`: 선분 (dashed/solid)
- `circles`, `arcs`: 원/호
- `angles`, `rightAngles`: 각도/직각
- `vLines`, `hLines`: 수직/수평 참조선
- `regions`: 음영 영역
- `texts`: 임의 위치 텍스트
- `size`: small/medium/large/xlarge

---

## 9. 상태 관리 (Zustand Stores)

### uiStore
- `mode`: "image" | "pdf" | "history"
- `selectedSubject`: 과목 선택
- `pdfSubjects`: 문제번호→과목 매핑

### imageStore
- `selectedImage`: base64
- `sections`: `SectionTuple` (4개 섹션 상태)
- `overallStatus`: "idle" | "running" | "done" | "error"
- `taskMode`: "solve" | "variation"
- `solveModes`: ["simple"] | ["detailed"] | ["shortcut"] (중복 선택)
- `isExporting`: { pdf, hwpx }

### pdfStore
- `pages`: PdfPageData[] (base64 + thumbnail)
- `problems`: ProblemState[] (각 문제의 4섹션)
- `phase`: "idle" | "identifying" | "solving" | "done"
- `varPhase`: "idle" | "identifying" | "generating" | "done"
- `isExporting`: { pdf, hwpx, varHwpx }

---

## 10. 주요 아키텍처 결정 이유

### 왜 Next.js App Router인가
- SSE 스트리밍 라우트 핸들러가 내장
- 서버/클라이언트 코드 동일 프로젝트
- Turbopack으로 빠른 개발 경험

### 왜 Gemini인가
- 수능 수학 문제 이미지 + 텍스트 멀티모달 지원
- 스트리밍(SSE) 지원
- thinkingConfig로 추론 품질 제어 가능
- 한국어 수학 해설 품질이 우수

### 왜 HWPX 순수 TS인가 (export-ts)
- Python COM(한글 프로그램 연동)은 Windows + 한글 설치 필수
- 순수 TS는 어디서든(Vercel, Linux, Mac) 실행 가능
- Cloudflare Tunnel 타임아웃(~100s)으로 비동기 job 패턴 도입

### 왜 IndexedDB인가
- 클라이언트 전용 저장 (서버 DB 불필요)
- 이미지 base64 포함 대용량 데이터
- 오프라인 접근 가능

---

## 11. Cloudflare Tunnel 비동기 패턴

Cloudflare Quick Tunnel은 단일 HTTP 요청을 ~100초 안에 완료해야 합니다.
HWPX 생성(Gemini 수식 변환 포함)은 그 이상 걸릴 수 있어:

1. `exportService.ts`에서 `trycloudflare.com` 호스트 감지
2. `POST /api/export-ts`에 `defer: true` + `X-Hwpx-Async: 1`
3. 서버는 즉시 `202 {jobId}` 반환
4. 백그라운드에서 HWPX 생성 → `exportTsJobs.ts` Map에 저장
5. 클라이언트가 `GET /api/export-ts/status?jobId=...` 1.5초 간격 폴링
6. 완료 시 200 + blob 반환

---

## 12. 환경 변수

| 변수 | 용도 | 필수 |
|------|------|------|
| `GEMINI_API_KEY` | Gemini API | ✅ |
| `OPENAI_API_KEY` | OpenAI (현재 미사용) | ❌ |
| `NEXT_PUBLIC_HWPX_USE_TS_ONLY` | "1"이면 COM 경로 건너뜀 | ❌ |

---

## 13. 코딩 규칙

- 언어: TypeScript strict 모드
- 스타일: Tailwind CSS 4, CSS 변수 `var(--bg-base)` 등
- 상태: Zustand (`create<T>((set) => (...))`)
- 수식 렌더링: KaTeX (클라이언트), placeholder 방식 전처리
- 한국어 UI, 한국어 주석 허용
- 모든 API 키는 `.env.local`에만 (절대 하드코딩 금지)
- `"use client"` 디렉티브: 브라우저 전용 컴포넌트/스토어에만

---

## 14. 알려진 한계 및 개선 필요 사항

1. **HWPX 수식 품질**: 현재 LaTeX→HwpEqn은 Gemini에 의존 (규칙 기반 변환기 필요)
2. **markdown-to-hwpx**: 볼드/이탤릭/수식을 모두 플레인 텍스트로 변환 (서식 보존 필요)
3. **job 큐**: in-memory Map (서버 재시작 시 소실, 서버리스 미지원 → Redis 등 필요)
4. **onDownloadPdf**: page.tsx에서 빈 함수 `() => {}` (PDF 다운로드 미연결)
5. **레거시 라우트**: export, export-hwpx, export-hwpx-v2, export-workbook → 정리 필요
6. **ExportRequest 타입**: 포맷별 필수 필드가 타입으로 강제되지 않음
7. **폰트 CDN**: Pretendard를 외부 CDN에서 로드 (next/font 또는 로컬 호스팅 권장)
8. **동시성**: isExporting boolean만으로 중복 클릭/다중 탭 제어 부족
