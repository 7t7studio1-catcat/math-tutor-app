# 📐 스마트 수학 해설 앱

GPT-4o Vision을 활용한 고등학교 수학 문제 AI 해설 생성기

## ✨ 기능

- **이미지 업로드**: 드래그&드롭 / 파일 선택 / 클립보드 붙여넣기 (Ctrl+V)
- **AI 스트리밍 해설**: GPT-4o Vision이 실시간으로 3단계 해설 생성
  - 📐 Section 1: 정확하게 풀기 (교과서 표준 풀이)
  - 💡 Section 2: 정확한 풀이해설 (개념 및 오류 주의사항)
  - ⚡ Section 3: 숏컷해설 (전문가 방식)
- **LaTeX 렌더링**: KaTeX로 수식 완벽 표시
- **PDF 저장**: 브라우저 인쇄 → PDF 저장으로 고품질 PDF 생성

## 🚀 시작하기

### 1. API 키 설정

프로젝트 루트에 `.env.local` 파일 생성:

```
OPENAI_API_KEY=sk-여기에_실제_API_키_입력
```

> API 키 발급: https://platform.openai.com/api-keys

### 2. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속

### 3. 빌드 & 배포

```bash
npm run build
npm start
```

## 📄 PDF 저장 방법

1. 해설 생성 완료 후 우측 상단 **PDF 저장** 버튼 클릭
2. 브라우저 인쇄 창에서 **"PDF로 저장"** 선택
3. 저장 위치 선택 후 저장

## 🛠 기술 스택

- **프레임워크**: Next.js 16 (App Router) + TypeScript
- **AI**: OpenAI GPT-4o Vision (스트리밍)
- **수식 렌더링**: KaTeX + react-markdown + remark-math
- **스타일**: Tailwind CSS v4
