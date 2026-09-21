// 입력칸 예시(placeholder) 문구 — 화면마다 따로 적지 않고 한 곳에서 같은 '예: …' 형식으로 관리한다.
// 화면 표시용일 뿐이며 저장값·기본값에는 쓰이지 않는다(기본값은 store.js).
export const ORG_EXAMPLE = "예: 부천여성청소년재단 청소년팀";
export const AUTHOR_EXAMPLE = "예: 홍길동";
export const PROGRAM_EXAMPLE = "예: 2026 청소년 진로탐색 캠프";
export const PERIOD_EXAMPLE = "예: 2026.3.~2026.11.";
export const TARGET_EXAMPLE = "예: 관내 중학생 120명";
export const BUDGET_EXAMPLE = "예: 30,000천원";
export const DEPARTMENT_EXAMPLE = "예: 청소년팀";
export const BACKGROUND_EXAMPLE = "예: 코로나19 이후 청소년의 대면 교류 기회가 줄며 또래 관계 형성과 지역사회 소속감 저하가 지속적으로 제기됨";
export const PURPOSE_EXAMPLE = "예: 지역사회 기반 또래 활동을 통해 청소년의 소속감과 사회적 관계망을 강화한다";
export const GOALS_EXAMPLE = "예:\n청소년 100명 이상 참여\n프로그램 만족도 90점 이상 달성\n참여 전후 소속감 점수 10% 이상 향상";

/** 사업정보 칸(logicModel 필드 키 → 예시) */
export const PROGRAM_FIELD_EXAMPLES = {
  programName: PROGRAM_EXAMPLE,
  period: PERIOD_EXAMPLE,
  target: TARGET_EXAMPLE,
  budget: BUDGET_EXAMPLE,
  department: DEPARTMENT_EXAMPLE,
  background: BACKGROUND_EXAMPLE,
  purpose: PURPOSE_EXAMPLE,
  goals: GOALS_EXAMPLE,
};

/** 논리모형 단계(LOGIC_STAGES 의 key) → 예시 */
export const LOGIC_STAGE_EXAMPLES = {
  inputs: "예:\n사업비 3천만원\n전담 인력 2명\n지역 청소년센터 시설\n인근 학교 협력",
  activities: "예:\n월 2회 또래 소모임 운영(회당 2시간)\n분기별 캠프 1회",
  outputs: "예:\n연 20회 운영\n누적 참여 150명\n수료자 120명",
  outcomesShort: "예:\n프로그램 만족도 90점\n참여 직후 소속감 점수 향상",
  outcomesMid: "예:\n참여 3개월 후 또래 관계 지속 비율 70%\n삶의 만족도 향상",
  impact: "예:\n지역 청소년 사회연결성 지표 개선\n지역사회에 대한 인식 향상",
};
