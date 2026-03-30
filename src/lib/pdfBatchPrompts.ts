/**
 * PDF 일괄 풀이 전용 프롬프트
 * 생성 순서: Section 2 먼저 → Section 1, 3, 4 병렬
 */

import {
  SECTION2_SYSTEM, SECTION2_USER,
  SECTION1_SYSTEM, SECTION1_USER_BASE, SECTION1_SYSTEM_INDEPENDENT, SECTION1_USER_INDEPENDENT,
  SECTION3_SYSTEM, SECTION3_USER_BASE, SECTION3_SYSTEM_INDEPENDENT, SECTION3_USER_INDEPENDENT,
  SECTION4_SYSTEM, SECTION4_USER_BASE, SECTION4_SYSTEM_INDEPENDENT, SECTION4_USER_INDEPENDENT,
} from "@/lib/prompts";

export const IDENTIFY_SYSTEM = `당신은 한국 수능·모의고사 시험지 구조 분석 전문가입니다.
주어진 시험지 이미지들에서 문제 번호, 위치한 페이지, 세로 위치를 파악하세요.

절대 규칙:
- 풀이 금지
- 오직 JSON만 반환
- 반환 형식:
  {"problems":[
    {"num":1,"pages":[0],"yStart":0,"yEnd":28},
    {"num":2,"pages":[0],"yStart":28,"yEnd":55},
    {"num":3,"pages":[0,1],"yStart":55,"yEnd":100}
  ]}
- num: 문제 번호
- pages: 문제가 위치한 페이지 인덱스 (0부터 시작)
- yStart: 해당 문제가 시작되는 세로 위치 (페이지 전체 높이 대비 백분율 0~100, 첫 번째 페이지 기준)
- yEnd: 해당 문제가 끝나는 세로 위치 (백분율 0~100, 첫 번째 페이지 기준)
- 한 페이지에 여러 문제가 있으면 yStart/yEnd로 각 문제의 영역을 구분
- 문제가 여러 페이지에 걸치면: yStart는 첫 페이지에서의 시작 위치, yEnd는 100 (페이지 끝까지)
- 객관식(5지선다)과 주관식(단답형)을 모두 포함
- 문제 번호가 연속이 아닌 경우(예: 23~30은 선택과목)에도 빠짐없이 파악
- yStart/yEnd는 문제 번호 텍스트부터 다음 문제 시작 직전까지의 영역`;

export const IDENTIFY_USER = `이 수학 시험지의 모든 문제 번호, 페이지 위치, 세로 위치(yStart/yEnd 백분율)를 파악하여 JSON으로만 반환하세요.`;

export function buildPdfSection2Prompt(num: number) {
  return { system: SECTION2_SYSTEM, user: `이 시험지에서 **${num}번 문제만** 찾아서 풀어라. 다른 문제는 무시하고, ${num}번 문제의 조건·보기·선택지를 정확히 읽은 뒤 풀이를 시작하라.\n\n${SECTION2_USER}` };
}

export function buildPdfSection1Prompt(num: number, s2: string) {
  if (s2) return { system: SECTION1_SYSTEM, user: `**${num}번 문제** 풀이:\n\n---\n${s2}\n---\n\n${SECTION1_USER_BASE}` };
  return { system: SECTION1_SYSTEM_INDEPENDENT, user: `**${num}번 문제만** 분석.\n\n${SECTION1_USER_INDEPENDENT}` };
}

export function buildPdfSection3Prompt(num: number, s2: string) {
  if (s2) return { system: SECTION3_SYSTEM, user: `**${num}번 문제** 풀이:\n\n---\n${s2}\n---\n\n${SECTION3_USER_BASE}` };
  return { system: SECTION3_SYSTEM_INDEPENDENT, user: `**${num}번 문제만** 숏컷.\n\n${SECTION3_USER_INDEPENDENT}` };
}

export function buildPdfSection4Prompt(num: number, s2: string) {
  if (s2) return { system: SECTION4_SYSTEM, user: `**${num}번 문제** 풀이:\n\n---\n${s2}\n---\n\n${SECTION4_USER_BASE}` };
  return { system: SECTION4_SYSTEM_INDEPENDENT, user: `**${num}번 문제만** 변형 대비.\n\n${SECTION4_USER_INDEPENDENT}` };
}
