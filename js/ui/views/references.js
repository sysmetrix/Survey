// 청소년 활동·사업 평가 레퍼런스와 단계별 작성 가이드
import { icon } from "../icons.js";
import { esc } from "../util.js";
import { refresh } from "../router.js";
import { state } from "../store.js";
import { isFeatureOn } from "../../admin/flags-client.js";
import { referenceEvidenceById } from "../../evaluation/reference-evidence.js";

const SOURCES = [
  { title: "OECD — Monitoring and Evaluation of Child and Youth Policies and Outcomes in Ireland (2024) · 아일랜드 아동·청소년 정책 및 성과 모니터링·평가", type: "평가모형", text: "사업의 목표와 결과를 results framework로 연결하고, 모니터링(진행 확인)과 평가(성과 판단)를 구분합니다.", url: "https://www.oecd.org/en/publications/monitoring-and-evaluation-of-child-and-youth-policies-and-outcomes-in-ireland_2bd86a9d-en/full-report/component-7.html" },
  { title: "OECD — Youth Policy Toolkit (2024) · 청소년 정책 툴킷", type: "청소년 정책", text: "청소년 참여, 비형식 교육, 지원·상담, 기관 간 협력 등 청소년 정책의 평가 영역과 지표 사례를 제시합니다.", url: "https://www.oecd.org/content/dam/oecd/en/publications/reports/2024/11/oecd-youth-policy-toolkit_3de4a9f0/74b6f8f3-en.pdf" },
  { title: "OECD — Mid-Term Evaluation of Spain’s Youth Guarantee Plus Plan · 스페인 청년보장 플러스 계획 중간평가", type: "평가 설계", text: "평가 질문을 먼저 만들고, 각 질문에 지표와 자료원을 연결하는 평가 매트릭스 접근을 사용합니다.", url: "https://www.oecd.org/en/publications/mid-term-evaluation-of-spain-s-youth-guarantee-plus-plan-2021-2027_1197d87d-en/full-report/evaluation-approach-and-methodology_86854b18.html" },
  { title: "한국청소년활동진흥원 — 2026년 역량기반 청소년활동 가이드북 · Competency-Based Youth Activities Guidebook", type: "국내 청소년활동", text: "한국청소년활동진흥원이 발간한 공식 가이드북으로, 역량기반 청소년활동의 설계·운영과 측정 도구를 안내합니다.", url: "https://www.kywa.or.kr/pressinfo/data_view.jsp?no=35892" },
  { title: "한국청소년활동진흥원 — 2026년 역량기반 청소년활동 설문측정 도구 안내 · 2026 Survey Measurement Tools for Competency-Based Youth Activities", type: "국내 측정도구", text: "기존 디지털 문해력을 디지털 시민성으로 개선하고, 7개 핵심역량·78개 문항의 변경사항과 초기·중·후기 청소년용 설문양식을 안내합니다.", url: "https://www.kywa.or.kr/pressinfo/data_view.jsp?code=null&no=35893" },
];

const STEPS = [
  ["1", "사업 목적 확인", "무엇을 바꾸려는 사업인지 한 문장으로 씁니다. 만족도만으로 사업 효과를 판단하지 않습니다."],
  ["2", "논리모형 작성", "투입 → 활동 → 산출 → 단기성과 → 중기성과·영향의 흐름을 연결합니다."],
  ["3", "평가 질문 정하기", "참여했는가, 잘 운영됐는가, 무엇이 달라졌는가처럼 답이 필요한 질문을 정합니다."],
  ["4", "문항·지표 선택", "만족도는 반응, 사전·사후 문항은 변화, 참여 인원·횟수는 산출 지표로 구분합니다."],
  ["5", "자료 수집·비교", "사전·사후 조사, 참여자 특성, 응답률을 함께 확인하고 소수 집단은 보호합니다."],
  ["6", "해석·개선", "통계 결과와 자유응답을 함께 읽고 다음 운영에서 바꿀 점과 확인할 지표를 정합니다."],
];

const BENCHMARKS = [
  ["표준 문항 버전 관리", "KYWA처럼 문항 개정일·역량명·문항 수를 표시하고, 사전·사후 문항 버전이 다르면 비교 불가 경고를 제공"],
  ["연령별 설문 분기", "초기 청소년용과 중·후기 청소년용 문항 세트를 구분 선택하고, 연령에 맞지 않는 템플릿을 추천하지 않도록 구성"],
  ["역량 프로파일", "실제로 측정한 역량의 점수·사전·사후 변화·응답자 수를 제공. 전체 합산은 도구가 허용할 때만 산출하며 미측정 역량을 0점으로 표시하지 않음"],
  ["표준 비교 기준", "기관 내부 변화뿐 아니라 동일 문항·동일 척도일 때만 연도·사업·집단 간 비교를 허용하고 문항 버전을 결과에 기록"],
  ["측정 품질 안내", "문항 누락, 응답 수 부족, 사전·사후 불일치, 역문항 처리 여부를 분석 전 점검 결과로 보여줌"],
];

let activeTab = "guide";
const BENCHMARK_MATRIX = `<div class="reference-matrix"><h3>비교 기준 한눈에 보기</h3><div class="tblwrap"><table class="tbl"><thead><tr><th>비교 항목</th><th>참고 사례의 방식</th><th>우리 서비스 적용</th><th>판단</th></tr></thead><tbody><tr><td>초기 설정</td><td>단계별 안내</td><td>목적 선택 → 추천 지표 → 상세 설정</td><td><span class="badge ok">유지</span></td></tr><tr><td>근거 자료</td><td>원문 중심 제공</td><td>한국어 핵심 요약 후 원문 링크</td><td><span class="badge info">개선</span></td></tr><tr><td>상세 옵션</td><td>필요할 때 확장</td><td>기본 화면은 단순화, 상세 편집은 탭으로 분리</td><td><span class="badge info">적용</span></td></tr><tr><td>운영 점검</td><td>품질·오류를 별도 관리</td><td>관리자 통계의 운영·상세 데이터 탭</td><td><span class="badge info">적용</span></td></tr></tbody></table></div></div>`;
const SOURCE_DECISIONS = [
  ["목표·활동·결과를 분리해 성과지표의 위치를 설명하는 데 사용합니다.", "아일랜드 정책의 행정 체계와 평가 주기를 우리 기관 운영에 그대로 이식하지 않습니다."],
  ["청소년 정책을 참여·형평성·지원체계 관점에서 점검하는 분류 틀로 사용합니다.", "정책 권고를 개별 프로그램의 효과로 해석하거나 단일 점수로 축약하지 않습니다."],
  ["평가 질문과 근거 자료를 연결하는 매트릭스 설계의 참고로 사용합니다.", "스페인의 제도·대상·기간을 우리 사업의 평가 설계와 동일시하지 않습니다."],
  ["역량 기반 활동에서 산출·변화·후속 실천을 구분하는 국내 용어와 구조를 참고합니다.", "가이드북의 권장 문항을 모든 기관과 대상에게 일괄 적용하지 않습니다."],
  ["사전·사후 측정, 척도, 문항 수를 확인하는 측정 품질 점검의 근거로 사용합니다.", "표준 도구의 점수나 문항을 임의로 변형해 기관 간 결과를 직접 비교하지 않습니다."],
];
const REFERENCE_TABS = [["guide", "핵심 흐름"], ["sources", "근거 자료"], ["benchmark", "벤치마킹 검토"], ["checklist", "적용 체크리스트"]];
const sectionTabs = () => `<nav class="tabs reference-tabs" aria-label="레퍼런스 영역">${REFERENCE_TABS.map(([key, label]) => `<button type="button" class="tab${activeTab === key ? " on" : ""}" ${activeTab === key ? 'aria-current="page"' : ""} data-act="reference-tab" data-tab="${key}">${label}</button>`).join("")}</nav>`;
function renderContent() {
  return `<div class="page-head"><div><h1>평가 레퍼런스</h1><p class="small muted">청소년 활동·사업의 성과지표를 설계하고 결과를 해석할 때 참고할 수 있는 근거와 실무 흐름입니다.</p></div><div class="row gap wrap"><button class="btn" data-act="back">성과지표로 돌아가기${icon("left", 16)}</button></div></div>
    <section class="card"><div class="eyebrow">권장 평가 흐름</div><h2>사업 목적에서 개선안까지</h2><div class="reference-steps">${STEPS.map(([n,t,d]) => `<article class="reference-step"><span class="step-number">${n}</span><div><h3>${t}</h3><p>${d}</p></div></article>`).join("")}</div></section>
    <section class="card"><div class="row between wrap"><div><div class="eyebrow">근거 자료</div><h2>확인 가능한 레퍼런스</h2></div><span class="badge muted">외부 원문 링크</span></div><div class="reference-sources">${SOURCES.map(s => `<article class="reference-source"><div class="row between gap"><span class="badge info">${s.type}</span><a href="${s.url}" target="_blank" rel="noopener noreferrer">원문 열기 ${icon("external", 14)}</a></div><h3>${s.title}</h3><p>${s.text}</p></article>`).join("")}</div></section>
    <section class="card"><div class="eyebrow">벤치마킹 검토</div><h2>이 통계 시스템에 반영할 제안</h2><div class="benchmark-grid">${BENCHMARKS.map(([t,d]) => `<article class="benchmark-item"><h3>${t}</h3><p>${d}</p></article>`).join("")}</div><p class="small muted">우선순위는 ① 문항 버전·사전·사후 일치 검증 ② 연령별 표준 설문 템플릿 ③ 역량 프로파일·변화 보고서 순서가 적절합니다.</p></section>
    <section class="card"><div class="eyebrow">작성 전 점검</div><h2>지표 품질 체크리스트</h2><div class="checklist"><label><input type="checkbox"> 사업 목적과 지표가 연결되어 있나요?</label><label><input type="checkbox"> 산출(운영 실적)과 성과(변화)를 구분했나요?</label><label><input type="checkbox"> 목표값·단위·측정시점이 명확한가요?</label><label><input type="checkbox"> 만족도만으로 효과를 단정하지 않았나요?</label><label><input type="checkbox"> 응답자 수와 소수 집단 보호를 확인했나요?</label><label><input type="checkbox"> 결과를 다음 사업 개선안으로 연결했나요?</label></div><p class="small muted">체크 상태는 저장되지 않으며, 실제 평가 결과와 판단을 대신하지 않습니다.</p></section>`;
}

export function render() {
  let section = -1;
  let html = renderContent();
  const evidenceHtml = isFeatureOn("referenceEvidence") ? `<div class="reference-evidence"><div class="eyebrow">현재 프로젝트 적용 현황</div><h3>성과지표별 근거 연결</h3>${state.kpis?.length ? `<div class="reference-evidence-list">${state.kpis.map(k => { const ref = referenceEvidenceById(k.evidenceRef); return `<div class="reference-evidence-row"><b>${esc(k.name || k.id)}</b><span class="small ${ref ? "" : "muted"}">${esc(ref?.title || "근거 미연결")}</span></div>`; }).join("")}</div>` : `<p class="small muted">성과지표를 먼저 추가하면 지표별 근거 연결 상태가 표시됩니다.</p>`}</div>` : "";
  html = html.replace(/(<div class="reference-sources">)/, `${evidenceHtml}$1`);
  let sourceIndex = 0;
  html = html.replace(/(<article class="reference-source">[\s\S]*?<h3>[\s\S]*?<\/h3>)<p>([\s\S]*?)<\/p><\/article>/g, (_match, head, summary) => {
    const [application, caution] = SOURCE_DECISIONS[sourceIndex++] || SOURCE_DECISIONS[0];
    return `${head}<p><b>핵심 요약</b> ${summary}</p><p class="reference-application"><b>적용 판단</b> ${application}</p><p class="reference-caution"><b>주의점</b> ${caution}</p></article>`;
  });
  html = html.replace(/(<div class="benchmark-grid">[\s\S]*?<\/div>)/, `$1${BENCHMARK_MATRIX}`);
  html = html.replace(/<section class="card">/g, () => `<section class="card"${++section === REFERENCE_TABS.findIndex(([key]) => key === activeTab) ? "" : " hidden"}>`);
  return sectionTabs() + html;
}

export const actions = {
  back: () => { window.history.back(); },
  "reference-tab": el => { activeTab = REFERENCE_TABS.some(([key]) => key === el.dataset.tab) ? el.dataset.tab : "guide"; refresh(); },
};
