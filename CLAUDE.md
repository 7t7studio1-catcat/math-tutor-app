# CLAUDE.md — 스마트풀이 프로젝트 Claude 전용 컨텍스트

> Claude Code, Claude API, Anthropic 도구에서 이 프로젝트를 다룰 때 참조.
> 범용 컨텍스트는 `AGENTS.md`를 먼저 읽으세요.

## 작업 원칙

1. **근본적 해결 우선**: 표면적 패치 대신 구조적으로 올바른 방법을 선택하라.
2. **시간·비용 무제한**: 코드가 복잡해지거나, 용량이 커지거나, 시간이 오래 걸려도 무조건 "가장 확실하고 정확한 결과를 낼 수 있는 방법"으로만 진행하라.
3. **한국어 응답**: 모든 대화는 한국어로.
4. **수능 수학 도메인**: 이 앱은 한국 수능 수학 전용이다. 수능 표기법(수식, 단원, 난이도)을 정확히 따르라.
5. **출판 품질**: 메가스터디·대성·시대인재·EBS에 납품할 품질이 목표다. "대충 되는" 수준이 아니라 "교재에 실릴 수 있는" 수준.

## 핵심 파일 우선순위

작업 시 반드시 읽어야 하는 파일 순서:

1. `src/lib/prompts.ts` — 프롬프트 엔지니어링의 핵심 (910줄)
2. `src/lib/hwpx/` — HWPX 생성 파이프라인 전체
3. `src/app/api/export-ts/route.ts` — HWPX API + 비동기 job
4. `src/services/exportService.ts` — 클라이언트 내보내기 로직
5. `src/lib/hwpx/styles.ts` — 출판사별 스타일 (반드시 출판사 요구에 맞출 것)
6. `src/app/api/analyze/route.ts` — SSE 스트리밍 패턴
7. `src/stores/` — 전체 상태 구조

## 절대 하지 말 것

- `.env.local`을 git에 커밋하지 마라
- API 키를 코드에 하드코딩하지 마라
- 수능 수식 표기 규칙(AGENTS.md §7)을 위반하는 프롬프트를 작성하지 마라
- HWPX XML 구조를 임의로 변경하지 마라 (한글 프로그램 호환성이 깨질 수 있음)
- 레거시 라우트(/api/export, /api/export-hwpx 등)를 삭제하지 마라 (로컬 COM 경로)

## 자주 하는 작업 가이드

### 프롬프트 수정
`src/lib/prompts.ts`의 RULES, SECTION2_SYSTEM 등을 수정. 변경 후 반드시 수식 표기 규칙(규칙 A~K)이 유지되는지 확인.

### 새 출판사 스타일 추가
`src/lib/hwpx/styles.ts`의 `PUBLISHER_STYLES`에 새 항목 추가. 필수 필드: settings(판형/여백/행간), fonts, colors, layout.

### HWPX 품질 개선
`src/lib/hwpx/markdown-to-hwpx.ts`가 현재 모든 서식을 플레인 텍스트로 변환함. 볼드/이탤릭/수식 서식 보존이 필요하면 HwpxTextRun의 bold/italic 필드와 HwpxEquationRun을 활용하여 파서를 개선.

### Cloudflare Tunnel 관련
`exportService.ts`의 `preferTsOnlyHwpxExport()`가 호스트를 감지. 새 도메인 추가 시 여기에 조건 추가. 비동기 job은 `exportTsJobs.ts`의 in-memory Map.

### 새 API 라우트 추가
`src/app/api/[name]/route.ts` 형식. SSE가 필요하면 `/api/analyze/route.ts`의 ReadableStream 패턴을 따를 것. 항상 heartbeat ping을 포함.
