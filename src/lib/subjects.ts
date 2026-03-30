/**
 * 수능 수학 과목/단원 체계
 * 무개TV 30개 영상 빈출 유형 반영
 */

export const SUBJECTS = [
  { id: "common1", label: "공통수학1" },
  { id: "common2", label: "공통수학2" },
  { id: "algebra", label: "대수" },
  { id: "calculus1", label: "미적분1" },
  { id: "calculus2", label: "미적분2" },
  { id: "probstat", label: "확률과통계" },
  { id: "geometry", label: "기하" },
] as const;

/**
 * 무개TV 30개 영상 분석 기반 빈출 유형 체계
 * 수능·모의고사 실전 출제 패턴 (출현 빈도순)
 */
export const FREQUENT_PATTERNS = [
  { rank: 1, keyword: "합성함수", desc: "f(g(x)) 분석, 합성의 연속·미분, 치역 제한", frequency: "최빈출" },
  { rank: 2, keyword: "등비·등차수열", desc: "일반항, 공비·공차 결정, 등비급수 수렴, 중간항 성질", frequency: "최빈출" },
  { rank: 3, keyword: "극대·극소", desc: "극값 판정, 3차 함수 개형, 이계도함수 부호", frequency: "최빈출" },
  { rank: 4, keyword: "정적분·넓이", desc: "부호 있는 넓이, 구간 분리 적분, 대칭 활용", frequency: "최빈출" },
  { rank: 5, keyword: "연속성", desc: "좌극한=우극한=함수값, 구간별 정의 함수, 불연속점 분석", frequency: "최빈출" },
  { rank: 6, keyword: "대칭성", desc: "짝함수/홀함수, 주기함수, 그래프 대칭", frequency: "최빈출" },
  { rank: 7, keyword: "접선·기울기", desc: "접점에서의 접선 방정식, 미분계수=기울기, 평균변화율", frequency: "빈출" },
  { rank: 8, keyword: "정적분 구간 분석", desc: "구간별 적분, 절댓값 적분, 정적분 함수", frequency: "빈출" },
  { rank: 9, keyword: "미분계수 정의", desc: "극한→미분계수 변환, f'(a) 정의 활용", frequency: "빈출" },
  { rank: 10, keyword: "평균변화율", desc: "이산과 연속의 관계, 차분과 미분", frequency: "빈출" },
  { rank: 11, keyword: "치환", desc: "적절한 치환으로 복잡한 식 단순화", frequency: "빈출" },
  { rank: 12, keyword: "다항함수 분석", desc: "최고차 계수, 인수분해, 근의 위치", frequency: "빈출" },
  { rank: 13, keyword: "이항정리·조합", desc: "이항계수, 조합론, 확률 계산", frequency: "빈출" },
  { rank: 14, keyword: "삼각함수", desc: "삼각함수 합성, 주기, 그래프 변환", frequency: "중빈출" },
  { rank: 15, keyword: "지수·로그", desc: "지수로그함수 그래프, 밑 변환, 역함수 관계", frequency: "중빈출" },
  { rank: 16, keyword: "부분적분", desc: "u·dv 선택, 반복 적분, tabular integration", frequency: "중빈출" },
  { rank: 17, keyword: "곱의 미분법", desc: "(fg)' = f'g + fg', 특정 점에서의 값 계산", frequency: "중빈출" },
  { rank: 18, keyword: "계수비교법", desc: "항등식의 동차항 계수 비교, 미정계수법", frequency: "중빈출" },
  { rank: 19, keyword: "인수분해", desc: "f(a)=0이면 (x-a) 인수, 조립제법", frequency: "중빈출" },
] as const;

export type SubjectId = typeof SUBJECTS[number]["id"];

export function getSubjectLabel(id: SubjectId): string {
  return SUBJECTS.find((s) => s.id === id)?.label ?? id;
}

// AI가 반환하는 메타데이터 타입
export interface ProblemMeta {
  subject: SubjectId;
  unit1: string;         // 대단원 (예: "수열의 극한")
  unit2: string;         // 중단원 (예: "수열의 극한의 성질 및 계산")
  unit3: string;         // 소단원 (예: "부정형의 계산1")
  unit4: string;         // 세부유형 (예: "무한대/무한대2 (분모의 최고차항 기준)")
  // 하위 호환
  chapter: string;
  section: string;
  topic: string;
  isMultipleChoice: boolean;
  estimatedRate: number;
  difficulty: "기본" | "중하" | "중상" | "고난도" | "킬러";
}

export function getDifficultyFromRate(rate: number, isMultipleChoice: boolean): ProblemMeta["difficulty"] {
  if (isMultipleChoice) {
    if (rate >= 90) return "기본";
    if (rate >= 70) return "중하";
    if (rate >= 50) return "중상";
    if (rate >= 30) return "고난도";
    return "킬러";
  }
  // 주관식
  if (rate >= 80) return "기본";
  if (rate >= 60) return "중하";
  if (rate >= 40) return "중상";
  if (rate >= 20) return "고난도";
  return "킬러";
}

export const DIFFICULTY_COLORS: Record<ProblemMeta["difficulty"], string> = {
  "기본": "#10b981",
  "중하": "#3b82f6",
  "중상": "#8b5cf6",
  "고난도": "#f59e0b",
  "킬러": "#ef4444",
};
