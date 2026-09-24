export const REFERENCE_EVIDENCE = Object.freeze([
  { id: "oecd-results-framework", title: "OECD 아동·청소년 정책 모니터링·평가 프레임워크", url: "https://www.oecd.org/en/publications/monitoring-and-evaluation-of-child-and-youth-policies-and-outcomes-in-ireland_2bd86a9d-en/full-report/component-7.html", principle: "목표·활동·산출·성과를 구분하고 모니터링과 성과평가를 분리한다.", caution: "정책 수준의 인과판단을 개별 사업의 단일 지표 결과로 대체하지 않는다." },
  { id: "oecd-youth-policy-toolkit", title: "OECD Youth Policy Toolkit", url: "https://www.oecd.org/content/dam/oecd/en/publications/reports/2024/11/oecd-youth-policy-toolkit_3de4a9f0/74b6f8f3-en.pdf", principle: "참여·형평성·지원체계 등 여러 관점에서 청소년 정책 성과를 점검한다.", caution: "정책 권고를 개별 프로그램 효과나 하나의 종합점수로 축약하지 않는다." },
  { id: "oecd-evaluation-matrix", title: "OECD Spain Youth Guarantee 평가 방법론", url: "https://www.oecd.org/en/publications/mid-term-evaluation-of-spain-s-youth-guarantee-plus-plan-2021-2027_1197d87d-en/full-report/evaluation-approach-and-methodology_86854b18.html", principle: "평가 질문마다 지표와 자료원을 명시해 판단 근거를 추적한다.", caution: "스페인의 제도·대상·평가기간을 국내 개별 사업에 그대로 적용하지 않는다." },
  { id: "kywa-competency-guide", title: "KYWA 역량기반 청소년활동 가이드북", url: "https://www.kywa.or.kr/pressinfo/data_view.jsp?no=35892", principle: "활동 산출과 참여자의 역량 변화를 구분해 성과를 설계한다.", caution: "권장 지표를 기관의 목적과 대상 검토 없이 일괄 적용하지 않는다." },
  { id: "kywa-measurement-tools", title: "KYWA 역량기반 청소년활동 설문측정 도구", url: "https://www.kywa.or.kr/pressinfo/data_view.jsp?code=null&no=35893", principle: "동일 문항·척도·시점 조건을 확인해 사전·사후 결과의 비교 가능성을 확보한다.", caution: "문항이나 척도를 임의 변경한 결과를 표준 도구 결과와 직접 비교하지 않는다." },
]);

export const referenceEvidenceById = id => REFERENCE_EVIDENCE.find(item => item.id === id) || null;
export const normalizeEvidenceRef = value => referenceEvidenceById(String(value || "").trim())?.id || "";
