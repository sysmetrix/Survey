// 입력칸 예시(placeholder) 문구 — 화면마다 따로 적지 않고 한 곳에서 같은 '예: …' 형식으로 관리한다.
// 화면 표시용일 뿐이며 저장값·기본값에는 쓰이지 않는다(기본값은 store.js).
export const ORG_EXAMPLE = "예: 부천여성청소년재단 청소년팀";
export const AUTHOR_EXAMPLE = "예: 홍길동";
export const PROGRAM_EXAMPLE = "예: 2026 청소년 진로탐색 캠프";
export const PERIOD_EXAMPLE = "예: 2026.3.~2026.11.";
export const TARGET_EXAMPLE = "예: 관내 중학생 120명";
export const BUDGET_EXAMPLE = "예: 30,000천원";
export const DEPARTMENT_EXAMPLE = "예: 청소년팀";

/** 사업정보 칸(logicModel 필드 키 → 예시) */
export const PROGRAM_FIELD_EXAMPLES = {
  programName: PROGRAM_EXAMPLE,
  period: PERIOD_EXAMPLE,
  target: TARGET_EXAMPLE,
  budget: BUDGET_EXAMPLE,
  department: DEPARTMENT_EXAMPLE,
};
