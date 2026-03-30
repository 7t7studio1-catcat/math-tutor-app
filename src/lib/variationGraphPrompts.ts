/**
 * 변형문제 + 그래프 자동 생성 프롬프트
 *
 * Gemini가 변형문제를 생성할 때, 그래프가 필요한 경우
 * ```language-graph JSON 코드블록을 함께 출력하도록 유도합니다.
 *
 * 이 JSON은 기존 GraphRenderer.tsx (mafs) 와 완벽히 동일한 GraphSpec 형식이며,
 * 한글 문서 내보내기 시 hwpx_generator_v2.py → graph_generator.py 파이프라인으로
 * matplotlib 수능 스타일 이미지로 변환됩니다.
 */

import { buildVariationPrompt, type VariationQuestionType } from "./prompts";

// ═══════════════════════════════════════════════════════════════════════════════
// 그래프 출력 지시 (시스템 프롬프트에 추가)
// ═══════════════════════════════════════════════════════════════════════════════

const GRAPH_SPEC_INSTRUCTIONS = `

[★ 그래프 출력 규칙 — 함수·좌표 문제에서 반드시 준수]

변형문제에 함수 그래프, 좌표, 도형, 영역 등이 관련된 경우, 반드시 아래 형식의 JSON 코드블록을 문제 텍스트 바로 아래에 삽입하세요.

\`\`\`language-graph
{
  "xRange": [최소x, 최대x],
  "yRange": [최소y, 최대y],
  "noAxes": false,
  "functions": [
    {"fn": "수식", "label": "y=f(x)"},
    {"fn": "수식2", "label": "y=g(x)", "dashed": true}
  ],
  "circles": [
    {"cx": 0, "cy": 0, "r": 1, "label": "x^2+y^2=1"}
  ],
  "arcs": [
    {"cx": 0, "cy": 0, "r": 2, "startAngle": 0, "endAngle": 180}
  ],
  "points": [
    {"x": 1, "y": 2, "label": "A_1", "labelPos": "tr"}
  ],
  "hollowPoints": [
    {"x": 3, "y": 0, "label": "", "labelPos": "br"}
  ],
  "segments": [
    {"x1": 1, "y1": 2, "x2": 3, "y2": 2, "dashed": true},
    {"x1": 0, "y1": 0, "x2": 1, "y2": 2, "solid": true}
  ],
  "angles": [
    {"cx": 0, "cy": 0, "startAngle": 0, "endAngle": 45, "r": 0.3, "label": "θ"}
  ],
  "rightAngles": [
    {"x": 3, "y": 0, "angle": 90}
  ],
  "texts": [
    {"x": 1.5, "y": 1, "text": "S(t)"}
  ],
  "vLines": [{"x": 2, "label": "x=2"}],
  "hLines": [{"y": 3, "label": "y=3"}],
  "regions": [{"fn": "x^2", "x1": 0, "x2": 2}]
}
\`\`\`

[각 필드 설명 — 문제 유형에 맞는 필드만 사용]

■ 좌표계
- xRange, yRange: 좌표 범위
- noAxes: true이면 좌표축 숨김 (순수 기하 도형에 사용)

■ 곡선
- functions: y=f(x) 함수 곡선. fn은 수식, label은 "y=f(x)"
- circles: 원. cx, cy는 중심, r은 반지름. 단위원: {"cx":0,"cy":0,"r":1}
- arcs: 호. 반원 등. startAngle/endAngle은 도(°) 단위

■ 점
- points: 채움 점 ●. label은 "A_1" (아래첨자는 _숫자)
- hollowPoints: 빈 원 ○. 극한에서 정의되지 않는 점 등
- labelPos: 라벨 위치 지정. "tr"(우상, 기본), "tl"(좌상), "br"(우하), "bl"(좌하), "t"(상), "b"(하), "l"(좌), "r"(우)
- ★ 점이 밀집된 영역에서는 반드시 labelPos를 지정하여 라벨이 겹치지 않도록 해야 합니다

■ 선분·보조선
- segments: 두 점 사이의 선분. dashed=true(기본)이면 점선, solid=true이면 실선
- vLines: x=상수 수직 참조선 (축 전체 관통). 점근선에만 사용
- hLines: y=상수 수평 참조선 (축 전체 관통)

■ 각도·직각
- angles: 꼭짓점에서 두 방향 사이의 각도 호. startAngle/endAngle은 도(°), r은 호의 반지름
- rightAngles: 직각 표시 □. angle은 두 변 중 한 변의 방향(°)

■ 텍스트·영역
- texts: 임의 위치의 텍스트 라벨. 영역 이름 S(t), 길이 "8" 등에 사용
- regions: 함수 아래 음영 영역

[★ 핵심 규칙]
1. segments vs vLines: 구성선(대칭이동, 수선, 삼각형 변)은 반드시 segments. vLines는 점근선에만.
2. 삼각형·사각형 등 기하 도형: noAxes=true + segments(solid=true) + points로 표현.
3. 원: circles 필드. 단위원은 {"cx":0,"cy":0,"r":1}.
4. 각도 θ: angles 필드. 꼭짓점(cx,cy), 시작·끝 각도(°), 반지름 r.
5. 직각 □: rightAngles 필드.
6. 영역 내 라벨 S(t), f(θ): texts 필드.
7. 빈 원 ○ (불연속/극한): hollowPoints 필드.
8. ★ 라벨 겹침 방지: 점이 3개 이상 가까이 있으면 각 점의 labelPos를 서로 다르게 지정. 예: A_1은 "tr", A_2는 "br", A_3은 "tl" 등. 원점 O 근처의 점은 "br" 또는 "bl"로 배치.

[수식(fn) 작성 규칙]
- ^ 는 거듭제곱: x^2, x^3, (x-1)^2
- 곱셈은 반드시 * 표기: 2*x, 3*sin(x), x*(x+1)
- 사용 가능 함수: sin, cos, tan, log (자연로그), exp, sqrt, abs
- 상수: pi, e
- 나눗셈: 1/x, (x+1)/(x-2)

[★★★ 문제 영역(## 문제)의 그래프 규칙 — 매우 중요]
원본 문제 이미지를 먼저 확인하세요.
- 원본 문제에 그래프/그림/좌표평면이 **있는 경우에만** 변형문제에도 그래프를 포함하세요.
- 원본 문제가 **순수 텍스트(수식만)** 인 경우, 변형문제에도 그래프를 절대 넣지 마세요.
- 원본에 없는 그래프를 변형문제에 임의로 추가하는 것은 금지입니다.

[풀이 영역(## 정답 및 풀이)의 그래프 규칙]
- 풀이에서는 학생의 이해를 돕기 위해 필요하다면 그래프를 자유롭게 포함할 수 있습니다.
- 원본 문제에 그래프가 없더라도, 풀이 설명에 그래프가 도움이 되면 넣으세요.

[그래프를 생략할 경우]
1. 순수 계산 문제 (방정식, 수열 합) — 문제에는 절대 안 넣음, 풀이에는 필요 시 가능
2. 확률·통계 문제
3. 식 정리·변환만 하는 문제

[필수 디테일]
- 수능 시험지에 실릴 수 있는 수준으로 정확하게 작성
- 함수 곡선은 정확한 수식 기반
- 주요 점(극값, 교점, 절편)은 반드시 points로 표시
- 대칭이동·수선 등 기하 구성은 반드시 segments로 표현 (vLines/hLines 금지)
- 라벨: "A_1", "B_2" (아래첨자), "y=f(x)" (함수명)
- xRange, yRange는 모든 요소가 보이도록 충분히 넓게 설정하되, 빈 공간이 너무 많지 않게

[★ 그래프 품질 규칙]
- 문제에서 직선(예: y = (1/2n)x + 1/4n)과 함수의 교점을 구하는 문제라면, 반드시 그 직선도 functions에 포함하세요.
- 점근선이 있는 함수(유리함수 등)는 vLines로 점근선을 표시하세요.
- 빈 원(hollowPoints)은 불연속점·극한점에만 사용하고, 일반 교점은 points를 사용하세요.
- 구간별 정의 함수는 꺾이는 점의 좌표를 반드시 points로 표시하세요.
- y=x 같은 기준선이 있으면 반드시 functions에 포함하고 label을 붙이세요.

[★★ 라벨/텍스트 배치 규칙 — 매우 중요]
- texts 라벨의 좌표는 반드시 **실제 수학적 의미에 맞는 위치**에 배치하세요.
  - α_n이 "교점의 x좌표"이면 → x축 위, 해당 x 위치에 배치: {"x": 교점x좌표, "y": -0.3, "text": "α_n"}
  - P_n이 "교점"이면 → 교점 좌표에 points로 표시하고 label을 붙이세요. texts가 아닌 points의 label을 사용하세요.
- texts는 영역 이름(S, T), 길이("8"), 좌표값("-2") 등에만 사용하세요.
- 점의 이름(P_n, A_1, B 등)은 반드시 **points의 label 속성**으로 표시하세요. texts로 점 이름을 쓰지 마세요.
- 라벨이 곡선이나 축과 겹치지 않도록 labelPos를 반드시 지정하세요.
`;

// ═══════════════════════════════════════════════════════════════════════════════
// 사용자 프롬프트 보강
// ═══════════════════════════════════════════════════════════════════════════════

const GRAPH_USER_ADDENDUM = `

★ 원본 문제에 그래프/그림이 있는 경우에만 변형문제(## 문제)에 \`\`\`language-graph JSON 코드블록을 포함하세요. 원본이 텍스트만이면 변형문제에 그래프를 넣지 마세요.
★ 풀이(## 정답 및 풀이)에서는 필요하다면 자유롭게 그래프를 포함할 수 있습니다.`;

// ═══════════════════════════════════════════════════════════════════════════════
// 공개 API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 그래프 자동 생성 기능이 추가된 변형문제 프롬프트를 반환합니다.
 *
 * 기존 buildVariationPrompt 의 출력에 GraphSpec 출력 규칙을 덧붙입니다.
 * 프론트엔드에서 기존 buildVariationPrompt 대신 이 함수를 호출하면
 * Gemini가 변형문제에 ```language-graph 블록을 포함하게 됩니다.
 *
 * 사용 예:
 * ```ts
 * import { buildVariationWithGraphPrompt } from "@/lib/variationGraphPrompts";
 * const { system, user } = buildVariationWithGraphPrompt("same", 3);
 * ```
 */
export function buildVariationWithGraphPrompt(
  difficulty: "easier" | "same" | "harder",
  count: number,
  questionType: VariationQuestionType = "multiple-choice",
) {
  const base = buildVariationPrompt(difficulty, count, questionType);
  return {
    system: base.system + GRAPH_SPEC_INSTRUCTIONS,
    user: base.user + GRAPH_USER_ADDENDUM,
  };
}

/**
 * 그래프 지시문만 별도로 가져갈 때 사용합니다.
 * 기존 4단 해설 프롬프트 등에도 덧붙일 수 있습니다.
 */
export const GRAPH_INSTRUCTIONS = GRAPH_SPEC_INSTRUCTIONS;
export const GRAPH_USER_HINT = GRAPH_USER_ADDENDUM;
