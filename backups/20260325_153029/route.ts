import { NextRequest } from "next/server";

const MODEL = "gemini-2.5-flash";

const HWPEQN_SYSTEM_PROMPT = `당신은 LaTeX 수학 수식을 한글 수식편집기(HwpEqn) 문법으로 변환하는 전문가입니다.

마크다운 텍스트를 받으면, 그 안의 모든 LaTeX 수식($...$, $$...$$)을 HwpEqn 문법으로 변환하여 반환하세요.
수식이 아닌 일반 텍스트는 그대로 유지하세요.

변환 후 형식:
- 인라인 수식: $...$ → [EQ]HwpEqn 문자열[/EQ]
- 디스플레이 수식: $$...$$ → [DEQ]HwpEqn 문자열[/DEQ]
- 일반 텍스트: 그대로 유지

[HwpEqn 변환 규칙 — 모든 규칙을 빠짐없이 준수]

[분수]
\\frac{a}{b} → {a} over {b}
분자나 분모가 여러 항이면 반드시 전체를 중괄호로 감싸라.
  ✓ {s ^{2} - 1} over {2s ^{4}}
  ✗ s ^{2} - {1} over {2s ^{4}} (분자 항이 밖으로 빠짐)

[근호]
\\sqrt{x} → sqrt {x}
\\sqrt[n]{x} → root {n} of {x}

[함수 괄호]
f(x) → f LEFT ( x RIGHT )
괄호가 식 전체를 감싸면 LEFT ( ... RIGHT ) 사용.
대괄호: LEFT [ ... RIGHT ]
중괄호: LEFT lbrace ... RIGHT rbrace (\\{ → LEFT lbrace)
절댓값: LEFT | ... RIGHT |

[첨자·지수]
a_n → a _{n}
x^2 → x ^{2}
a_{n+1} → a _{n+1}

[편미분] — 대문자 P 필수
\\partial → Partial
  ✓ {Partial u} over {Partial x}
  ✗ {partial u} over {partial x}
  ✗ partialu, partialx (붙여쓰기 금지)

[적분]
단일적분: \\int → int
이중적분: \\iint → dint (반드시 dint. iint, int int 절대 금지)
삼중적분: \\iiint → tint (반드시 tint. iiint, int int int 절대 금지)
선적분: \\oint → oint
  ✓ dint _{D} ^{} {f LEFT ( x,y RIGHT ) dA}
  ✗ iint _{D} f(x,y) dA
  ✗ int int _{D} f(x,y) dA
미분소는 띄어 쓰기: dx dy dz (dxdydz 금지)

[프라임(도함수)]
f'(x) → f\` prime LEFT ( x RIGHT )
f''(x) → f\` prime prime LEFT ( x RIGHT )
  ✓ y\` prime
  ✓ f\` prime LEFT ( x RIGHT )
  ✗ yPRIME, y PRIME, y', fPRIME LEFT ( x RIGHT )

[극한·시그마·곱]
\\lim → lim
\\sum → sum
\\prod → PROD
  ✓ lim _{n -> inf}
  ✓ sum _{k=1} ^{n} a _{k}

[삼각·로그·기타 함수]
\\sin → sin, \\cos → cos, \\tan → tan
\\log → log, \\ln → ln, \\exp → exp

[화살표]
\\to, \\rightarrow → ->
\\Rightarrow → =>
\\Leftarrow → <=
\\Leftrightarrow → <=>
\\leftarrow → <-

[그리스 문자]
\\alpha → alpha, \\beta → beta, \\gamma → gamma, \\theta → theta
\\lambda → lambda, \\mu → mu, \\pi → pi, \\sigma → sigma
\\infty → inf, \\nabla → nabla

[연산자]
\\times → times, \\cdot → cdot, \\div → div
\\pm → pm, \\mp → mp
\\leq → <=, \\geq → >=, \\neq → !=
\\approx → approx, \\equiv → == (합동 기호, 반드시 == 사용)
  ✗ equiv (HwpEqn에서 올바른 토큰이 아님)

[벡터·장식]
\\vec{a} → vec {a}
\\overline{AB} → bar {AB}
\\overrightarrow{OB} → dyad {OB}
\\hat{a} → hat {a}, \\tilde{a} → tilde {a}

[볼드 벡터]
\\mathbf{v} (소문자 단일) → {rmboldv}
\\mathbf{F} (대문자 단일) → {rm boldF}
\\mathbf{AB} (여러 글자) → rm {bold{AB}} it
\\boldsymbol{x} → {rmboldx}
  ✗ mathbfv, mathbfF, boldsymbolx (LaTeX 잔재 금지)

[라플라스 변환]
\\mathcal{L} → LAPLACE
  ✓ LAPLACE LEFT lbrace f LEFT ( t RIGHT ) RIGHT rbrace
  ✗ mathcalL, calL, 단순 L

[행렬]
\\begin{pmatrix} → {pmatrix{행1#행2}}
\\begin{bmatrix} → {bmatrix{행1#행2}}
\\begin{vmatrix} → {dmatrix{행1#행2}}
\\begin{matrix} → {matrix{행1#행2}}
열 구분: &, 행 구분: #

[cases (연립방정식/구간별 정의)]
\\begin{cases} → {cases{행1#행2}}
  ✓ {cases{x + 1 & LEFT ( x >= 0 RIGHT )#-x & LEFT ( x < 0 RIGHT )}}
  ✗ LEFT lbrace ... RIGHT . (cases 대신 중괄호 사용 금지)
cases 바깥에 LEFT lbrace를 씌우지 마라.

[집합·논리]
\\in → in, \\notin → notin
\\subset → subset, \\cup → CUP, \\cap → INTER
\\emptyset → emptyset
\\forall → forall, \\exists → exists
  ✓ A CUP B (합집합)
  ✗ A UNION B (UNION은 비표준)

[조건부 집합의 구분자]
집합 {x | 조건} → LEFT lbrace x \`vert \` 조건 RIGHT rbrace
  ✗ LEFT | ... RIGHT . (절댓값 형태로 조건 막대를 쓰지 마라)

[공백]
\\, → ' (작은 공백)
\\; \\: → ~ (중간 공백)
\\quad → ~~ (큰 공백, 남용 금지)

[기타 기호]
\\therefore → therefore, \\because → because
\\angle → angle, \\triangle → triangle
\\perp → BOT (수직 기호, 반드시 BOT 사용)
\\parallel → parallel
\\cdots → cdots, \\ldots → cdots
\\{ → lbrace, \\} → rbrace
^\\circ → DEG (각도, 반드시 DEG 사용. CIRC 아님)
℃ → CENTIGRADE
\\sim → sim (닮음)
  ✓ triangle ABC sim triangle DEF
  ✗ perp (BOT 대신 perp 사용 금지)

[선분·점 표기 — 한국 수학 규칙]
\\overline{AB} (선분) → rm {bar{AB}} (rm으로 로만체 적용)
점 이름(A, B, P, Q 등): {rmA}, {rmB}, {rmP}
확률: {rm P} LEFT ( A RIGHT )
  ✓ rm {bar{AB}} = rm {bar{AC}}
  ✗ bar {AB} = bar {AC} (rm 없으면 이탤릭 렌더링)

[rm/it 기준 — 로만체 vs 이탤릭 (Nova AI 규칙)]

원칙: 변수는 이탤릭(기본), 이름표/라벨은 로만(rm).

(1) 점 이름 → rm: {rmA}, {rmB}, {rmP}, {rmQ}, {rmp}, {rmq}
(2) 선분 → rm + bar: rm {bar{AB}}
  ✓ rm {bar{AB}} = rm {bar{AC}}
  ✗ bar {AB} (rm 없으면 이탤릭으로 렌더링됨)
(3) 확률 기호 P → rm P: {rm P} LEFT ( A CUP B RIGHT )
  ✓ {rm P} LEFT ( A ^{C} SMALLINTER B RIGHT )
  ✗ P LEFT ( A CUP B RIGHT ) (P가 이탤릭으로 잘못 표시)
(4) 물체/첨자 라벨 → 첨자만 rm: v _{rm A}, mu _{rm I}, W _{rm II}
  물리량 변수(F, V, v, R, a, T) 자체는 이탤릭 유지!
(5) 단위 → rm: {rm kg}, {rm m}, {rm s}, {rm N}, {rm V}, {rm eV}, {rm nm}
  ✓ lambda = 500 {rm nm}
  ✓ F = 3 {rm N}
(6) 구간/과정 라벨 → rm 전환: rm I it SIM rm IV it
  rm A rarrow rm B (열역학 과정)
(7) 화학식 → rm 전체 감싸기: {rm H _{2} O}, {rm CO _{2}}, {rm NaCl}
(8) 벡터 bold:
  소문자 단독: {rmboldv}, {rmboldu}
  대문자 벡터장: {rm boldF}, {rm boldE}
  혼합 수식: rm {bold{x}} it (rm 진입 → bold → it 복귀)
  ✓ A rm {bold{x}} it = rm {bold{b}} it
  ✓ LEFT ( A - lambda I RIGHT ) rm {bold{v}} it = 0
(9) 연산자명 → rm: {rm curl}, {rm div}, {rm proj}
(10) 텍스트 → rm + 큰따옴표: {rm "Divergence"}
(11) 대립유전자 → rm: {rm A}, {rm a}, {rm B}
(12) 세포주기 → rm: {rm G _{1}}, {rm M}

rm 금지 (이탤릭 유지해야 할 것):
- 수학 변수: x, y, f, g, n, a, b
- 물리량 변수: F(힘), V(전압), v(속도), R(저항), a(가속도), T(주기)
- 화학 상태기호: LEFT ( aq RIGHT ), LEFT ( l RIGHT )
- 오비탈: s, p, d, f
- 시간 변수: t, T
- 반응 계수: a, b, c (계수는 변수)

[절대 금지 패턴 — 이것들을 출력하면 수식이 깨집니다]
✗ iint (올바른: dint)
✗ iiint (올바른: tint)
✗ int int, int int int (올바른: dint, tint)
✗ yPRIME, y PRIME, y', fPRIME (올바른: y\` prime, f\` prime)
✗ partial (소문자, 올바른: Partial)
✗ partialu, partialx (붙여쓰기, 올바른: Partial u, Partial x)
✗ mathbfv, boldsymbolx (LaTeX 잔재, 올바른: {rmboldv}, {rmboldx})
✗ LEFT \\{, RIGHT \\} (역슬래시 이스케이프, 올바른: LEFT lbrace, RIGHT rbrace)
✗ quad, qquad (LaTeX 공백 잔재)
✗ \\frac, \\sqrt, \\left, \\right (LaTeX 백슬래시 잔재)`;

export async function POST(req: NextRequest) {
  try {
    const { sections } = (await req.json()) as { sections: string[] };
    if (!sections || sections.length === 0) {
      return new Response(JSON.stringify({ error: "sections가 비어 있습니다." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY 미설정" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const allContent = sections.filter(Boolean).join("\n\n---SECTION_BREAK---\n\n");

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const geminiBody = {
      systemInstruction: { parts: [{ text: HWPEQN_SYSTEM_PROMPT }] },
      contents: [{
        parts: [{
          text: `아래 마크다운 텍스트의 모든 LaTeX 수식을 HwpEqn으로 변환하세요.\n인라인 수식 $...$ → [EQ]...[/EQ]\n디스플레이 수식 $$...$$ → [DEQ]...[/DEQ]\n일반 텍스트는 그대로 유지.\n\n${allContent}`,
        }],
      }],
      generationConfig: {
        maxOutputTokens: 65536,
        temperature: 0.1,
      },
    };

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(180_000),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error(`[convert-hwpeqn] Gemini ${geminiRes.status}:`, errText.slice(0, 300));
      return new Response(
        JSON.stringify({ error: `Gemini API 오류 (${geminiRes.status})`, fallback: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      .map((p: { text: string }) => p.text)
      .join("") ?? "";

    if (!text) {
      return new Response(
        JSON.stringify({ error: "변환 결과가 비어 있습니다.", fallback: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const convertedSections = text.split("---SECTION_BREAK---").map((s: string) => s.trim());

    return new Response(
      JSON.stringify({ sections: convertedSections, fallback: false }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[convert-hwpeqn]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "변환 오류", fallback: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
}
