// 청소년 활동·사업 평가 레퍼런스와 단계별 작성 가이드
import { icon } from "../icons.js";

const SOURCES = [
  { title: "OECD — Monitoring and Evaluation of Child and Youth Policies and Outcomes in Ireland (2024)", type: "평가모형", text: "사업의 목표와 결과를 results framework로 연결하고, 모니터링(진행 확인)과 평가(성과 판단)를 구분합니다.", url: "https://www.oecd.org/en/publications/monitoring-and-evaluation-of-child-and-youth-policies-and-outcomes-in-ireland_2bd86a9d-en/full-report/component-7.html" },
  { title: "OECD — Youth Policy Toolkit (2024)", type: "청소년 정책", text: "청소년 참여, 비형식 교육, 지원·상담, 기관 간 협력 등 청소년 정책의 평가 영역과 지표 사례를 제시합니다.", url: "https://www.oecd.org/content/dam/oecd/en/publications/reports/2024/11/oecd-youth-policy-toolkit_3de4a9f0/74b6f8f3-en.pdf" },
  { title: "OECD — Mid-Term Evaluation of Spain’s Youth Guarantee Plus Plan", type: "평가 설계", text: "평가 질문을 먼저 만들고, 각 질문에 지표와 자료원을 연결하는 평가 매트릭스 접근을 사용합니다.", url: "https://www.oecd.org/en/publications/mid-term-evaluation-of-spain-s-youth-guarantee-plus-plan-2021-2027_1197d87d-en/full-report/evaluation-approach-and-methodology_86854b18.html" },
  { title: "역량기반 청소년활동 자료", type: "국내 청소년활동", text: "선행연구 문항을 바탕으로 청소년활동 전후의 핵심역량 변화를 측정하는 국내 적용 사례입니다.", url: "https://www.gjcenter.kr/data/file/library/1028678779_4KQXTVFl_3f741c391e7a6070e2b4805e9d8ab0dc29d3493d.pdf" },
];

const STEPS = [
  ["1", "사업 목적 확인", "무엇을 바꾸려는 사업인지 한 문장으로 씁니다. 만족도만으로 사업 효과를 판단하지 않습니다."],
  ["2", "논리모형 작성", "투입 → 활동 → 산출 → 단기성과 → 중기성과·영향의 흐름을 연결합니다."],
  ["3", "평가 질문 정하기", "참여했는가, 잘 운영됐는가, 무엇이 달라졌는가처럼 답이 필요한 질문을 정합니다."],
  ["4", "문항·지표 선택", "만족도는 반응, 사전·사후 문항은 변화, 참여 인원·횟수는 산출 지표로 구분합니다."],
  ["5", "자료 수집·비교", "사전·사후 조사, 참여자 특성, 응답률을 함께 확인하고 소수 집단은 보호합니다."],
  ["6", "해석·개선", "통계 결과와 자유응답을 함께 읽고 다음 운영에서 바꿀 점과 확인할 지표를 정합니다."],
];

export function render() {
  return `<div class="page-head"><div><h1>평가 레퍼런스</h1><p class="small muted">청소년 활동·사업의 성과지표를 설계하고 결과를 해석할 때 참고할 수 있는 근거와 실무 흐름입니다.</p></div><div class="row gap wrap"><button class="btn" data-act="back">성과지표로 돌아가기${icon("left", 16)}</button></div></div>
    <section class="card"><div class="eyebrow">권장 평가 흐름</div><h2>사업 목적에서 개선안까지</h2><div class="reference-steps">${STEPS.map(([n,t,d]) => `<article class="reference-step"><span class="step-number">${n}</span><div><h3>${t}</h3><p>${d}</p></div></article>`).join("")}</div></section>
    <section class="card"><div class="row between wrap"><div><div class="eyebrow">근거 자료</div><h2>확인 가능한 레퍼런스</h2></div><span class="badge muted">외부 원문 링크</span></div><div class="reference-sources">${SOURCES.map(s => `<article class="reference-source"><div class="row between gap"><span class="badge info">${s.type}</span><a href="${s.url}" target="_blank" rel="noopener noreferrer">원문 열기 ${icon("external", 14)}</a></div><h3>${s.title}</h3><p>${s.text}</p></article>`).join("")}</div></section>
    <section class="card"><div class="eyebrow">작성 전 점검</div><h2>지표 품질 체크리스트</h2><div class="checklist"><label><input type="checkbox"> 사업 목적과 지표가 연결되어 있나요?</label><label><input type="checkbox"> 산출(운영 실적)과 성과(변화)를 구분했나요?</label><label><input type="checkbox"> 목표값·단위·측정시점이 명확한가요?</label><label><input type="checkbox"> 만족도만으로 효과를 단정하지 않았나요?</label><label><input type="checkbox"> 응답자 수와 소수 집단 보호를 확인했나요?</label><label><input type="checkbox"> 결과를 다음 사업 개선안으로 연결했나요?</label></div><p class="small muted">체크 상태는 저장되지 않으며, 실제 평가 결과와 판단을 대신하지 않습니다.</p></section>`;
}
