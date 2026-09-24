// ③ 성과지표(선택)·사업정보·논리모형(선택) 입력 화면
// 처음 쓰는 직원도 부담 없도록: 성과지표는 '빠른 추가'로 시작, 사업정보·논리모형은 항상 펼쳐서 바로 보여줌
import { state, compute, invalidate } from "../store.js";
import { LOGIC_STAGES, KPI_STAGES, normalizeLogicModel, hasLogicModel, hasProgramInfo, emptyLogicModel } from "../../evaluation/logic-model.js";
import { METRICS, newKpi } from "../../evaluation/kpi.js";
import { readBusinessFromHwpx, tagDraftKpis, previewPlanDocDraft } from "../../evaluation/business-doc.js";
import { readHwpxText } from "../../report/hwpx/read.js";
import { loadJSZip } from "../jszip-loader.js";
import { pairsOf } from "../../model/codebook.js";
import { f1, f2 } from "../../narrative/vocab.js";
import { esc, option, levelBadge, toast, download, readFileText, readFileBytes, busy, nextFrame } from "../util.js";
import { refresh } from "../router.js";
import { icon } from "../icons.js";
import { isFeatureOn, isAdminPreview } from "../../admin/flags-client.js";
import { PROGRAM_FIELD_EXAMPLES, LOGIC_STAGE_EXAMPLES, BACKGROUND_EXAMPLE, PURPOSE_EXAMPLE, GOALS_EXAMPLE } from "../examples.js";
import { measurementQuality, measurementQualityLabel } from "../../evaluation/measurement-quality.js";
import { kpiCards, PURPOSES } from "../kpi-cards.js";
import { normalizeEvidenceRef } from "../../evaluation/reference-evidence.js";
import { renderMeasurement, measurementActions, clearMeasurementDrafts } from "../measurement-workbench.js";
export function unmount() { clearMeasurementDrafts(); }

const MAX_PLAN_DOC_MB = 20;
let kpiTab = "quick";

const FIELDS = [["programName", "사업명"], ["period", "사업기간"], ["target", "참여대상"], ["budget", "사업예산"], ["department", "추진부서"]];

let planDocHelpOpen = false; // "문서에서 채우기" 사용법 팝오버

// 팝오버 밖을 클릭하면 닫음(테스트는 DOM 없이 이 파일을 불러오므로 가드) — report.js와 같은 패턴
if (typeof document !== "undefined") {
  document.addEventListener("click", e => {
    if (!planDocHelpOpen) return;
    if (e.target.closest?.("[data-act='toggle-plan-doc-help'], .rt-pop")) return;
    planDocHelpOpen = false; refresh();
  });
}

function planDocHelpPanel() {
  return `
    <p><b>찾는 곳</b> — 항목/내용 두 칸짜리 표(엑셀 사업정보 시트와 같은 모양), 또는 Ⅰ./□/1. 같은 제목줄이 있는 문단.</p>
    <p><b>채우는 것</b> — 사업명·기간·예산·대상·부서·목적·배경과 투입→활동→산출→단기성과→중기성과→영향 논리모형 6단계, 추진목표. 이미 입력한 칸은 절대 덮어쓰지 않고 빈 칸만 채웁니다.</p>
    <p><b>성과지표</b> — 문서에서 찾은 지표는 항상 표에 새로 추가되며(기존 지표는 그대로), ‘문서에서 자동 추출 — 확인 필요’ 메모가 자동으로 붙습니다.</p>
    <p><b>하지 않는 것</b> — 문서를 서버로 보내지 않습니다(브라우저 안에서만 처리). AI가 아닌 규칙 기반 인식이라 서식에 따라 틀리거나 못 찾을 수 있습니다. PDF는 아직 지원하지 않습니다(HWPX만 가능).</p>
    <p class="small muted">적용 전에 찾은 내용을 보여 드리니, 확인한 뒤 적용하세요.</p>`;
}

function targetOptions() {
  const cb = state.codebook;
  const labels = new Set(["전체"]);
  cb.domains.forEach(d => labels.add(d.name));
  cb.columns.filter(c => ["likert", "nps"].includes(c.role) && c.time !== "pre").forEach(c => labels.add(c.label));
  pairsOf(cb).forEach(p => labels.add(p.label));
  return [...labels];
}

/**
 * 문항·영역 이름에서 키워드로 실제 맞는 대상을 찾음(없으면 "").
 * '지역사회 소속감 향상' 같은 특정 주제 지표는 그 주제를 실제로 묻는 문항이 있을 때만
 * 추천한다 — 관련 문항이 없는데 "전체로 계산"하며 추천하면 재지 않은 것을 잰 것처럼 보일 수 있어서다.
 */
function findTarget(r, keywords) {
  const labels = [
    ...r.analysis.items.map(i => i.label),
    ...state.codebook.domains.map(d => d.name),
    ...(r.analysis.prepost?.domains || []).filter(d => d.id !== "ALL").map(d => d.name),
  ];
  return labels.find(l => keywords.some(k => l.includes(k))) || "";
}

/** 데이터에 맞는 빠른 추가 지표 */
function quickKpis(r) {
  const A = r.analysis, P = A.prepost;
  const overall = A.overallItem?.label;
  // 특정 주제를 직접 묻는 문항·영역이 실제로 있을 때만 추천(없으면 이 지표 자체를 제안하지 않음)
  const topic = (id, name, keywords, metric, target, unit, stage) => {
    const t = findTarget(r, keywords);
    if (!t) return null;
    return { id, label: `${name} (${t.length > 12 ? t.slice(0, 12) + "…" : t})`, kpi: { name: `${name}${metric === "prepostDiff100" ? "" : "(100점 환산)"}`, stage, metric, targetRef: t, target, unit } };
  };
  return [
    A.items.length && { id: "sat", label: "만족도 92점 이상", kpi: { name: overall ? `${overall}(100점 환산)` : "만족도(100점 환산)", stage: "단기성과", metric: "score100", targetRef: overall || "전체", target: 92, unit: "점" } },
    A.items.length && { id: "top2", label: "긍정응답률 80% 이상", kpi: { name: "긍정응답률", stage: "단기성과", metric: "top2", targetRef: overall || "전체", target: 80, unit: "%" } },
    A.nps.length && { id: "nps", label: "추천지수(NPS) 30점 이상", kpi: { name: "순추천지수(NPS)", stage: "단기성과", metric: "nps", targetRef: A.nps[0].label, target: 30, unit: "점" } },
    P && { id: "diff", label: "사전·사후 0.3점 향상", kpi: { name: "참여 전후 향상도", stage: "단기성과", metric: "prepostDiff", targetRef: "전체", target: 0.3, unit: "점" } },
    P && { id: "improved", label: "향상자 비율 60% 이상", kpi: { name: "향상자 비율", stage: "중기성과", metric: "improvedRate", targetRef: "전체", target: 60, unit: "%" } },
    { id: "count", label: "참여 인원 (직접 입력)", kpi: { name: "참여 인원(실인원)", stage: "산출", metric: "manual", target: null, unit: "명" } },
    { id: "sessions", label: "운영 횟수 (직접 입력)", kpi: { name: "프로그램 운영 횟수", stage: "산출", metric: "manual", target: null, unit: "회" } },
    // 청소년 사업 성과지표(여성가족부·한국청소년정책연구원 「인구감소지역 청소년 성장지원 성과지표 개발」 2024.12.23 참고)
    // 업로드된 설문에 그 주제를 실제로 묻는 문항·영역이 있을 때만 추천(문항 파악 기반 추천 — 없으면 목록에 안 나타남)
    A.items.length && topic("belonging", "지역사회 소속감 향상", ["소속감", "소속"], "score100", 80, "점", "단기성과"),
    A.items.length && topic("lifeSat", "삶의 만족도 향상", ["삶의 만족", "삶 만족", "행복"], "score100", 80, "점", "단기성과"),
    P && topic("socialConn", "사회연결성 향상", ["관계", "연결", "또래", "네트워크"], "prepostDiff100", 10, "점", "중기성과"),
    A.items.length && topic("regionView", "지역에 대한 인식 개선", ["지역", "동네", "마을"], "score100", 80, "점", "단기성과"),
    { id: "activityExp", label: "활동 참여 경험(연 참여 횟수)", kpi: { name: "활동 참여 경험(연 참여 횟수)", stage: "산출", metric: "manual", target: null, unit: "회" } },
  ].filter(Boolean);
}

function quickKpiHelp(qk) {
  const id = qk.id;
  if (["sat", "top2", "nps"].includes(id)) return "참여자의 반응·만족을 확인하는 지표입니다.";
  if (["diff", "improved"].includes(id)) return "참여 전후 변화가 있는지 확인하는 지표입니다.";
  if (["count", "sessions", "activityExp"].includes(id)) return "운영 실적을 직접 입력하는 산출 지표입니다.";
  return "설문 문항과 연결해 자동으로 계산합니다.";
}

/** 전년 실적 → 목표 → 실적을 가로 막대 3개로 비교(관리자 전용 미리보기: kpiTrendChart) */
function trendBars(prev, target, actual) {
  const vals = [prev, target, actual].filter(Number.isFinite);
  if (vals.length < 2) return `<span class="muted small">비교할 값 부족</span>`;
  const max = Math.max(...vals) * 1.15 || 1;
  const bar = (label, v, color) => (!Number.isFinite(v) ? "" : `<div class="kpi-trend-row"><span class="small muted">${label}</span><span class="kpi-trend-bar"><span style="width:${Math.max(4, v / max * 100)}%;background:${color}"></span></span><span class="small">${f1(v)}</span></div>`);
  return `<div class="kpi-trend">${bar("전년", prev, "var(--border-strong)")}${bar("목표", target, "var(--info)")}${bar("실적", actual, "var(--brand)")}</div>`;
}

function kpiTable(r) {
  const results = new Map((r.evaluation?.results || []).map(x => [x.id, x]));
  const goals = state.logicModel.goals || [];
  const adeqOn = isFeatureOn("kpiTargetAdequacy"); // 관리자 전용 미리보기 — 전년 실적 입력·목표 적정성 경고
  const trendOn = isFeatureOn("kpiTrendChart"); // 관리자 전용 미리보기 — 전년·목표·실적 추이 막대
  const prevColOn = adeqOn || trendOn; // 두 기능이 '전년 실적' 입력칸을 공유
  const rows = state.kpis.map((k, i) => {
    const res = results.get(k.id);
    const m = METRICS[k.metric] || METRICS.manual;
    const judgeCls = res?.judgment === "달성" ? "ok" : res?.judgment === "대체로 달성" ? "info" : res?.judgment === "미달성" ? "bad" : "muted";
    const val = v => (Number.isFinite(v) ? (["mean", "prepostDiff", "effectSize", "score100", "postScore100", "prepostDiff100"].includes(k.metric) ? f2(v) : Number.isInteger(v) ? String(v) : f1(v)) : "-");
    // 행마다 붙는 이름표: 이름을 아직 안 정한 새 행은 "N번째 지표"로 구분(빈 이름이면 화면 낭독기로 어느 행인지 알 수 없음)
    const rowTag = esc(k.name || `${i + 1}번째 지표`);
    return `<tr>
      <td><input class="in xs" value="${esc(k.id)}" data-change="kpi" data-i="${i}" data-field="id" aria-label="'${rowTag}' ID"></td>
      <td><input class="in" value="${esc(k.name)}" placeholder="예: 진로 관심 향상도" data-change="kpi" data-i="${i}" data-field="name" aria-label="'${rowTag}' 지표명"></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="stage" aria-label="'${rowTag}' 단계">${KPI_STAGES.map(s => option(s, s, k.stage === s)).join("")}</select></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="goalId" aria-label="'${rowTag}' 연계목표">${option("", "-", !k.goalId)}${goals.map((g, gi) => option(g.id, `목표${gi + 1}`, k.goalId === g.id)).join("")}</select></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="metric" aria-label="'${rowTag}' 측정 방법">${Object.entries(METRICS).map(([key, mm]) => option(key, mm.label, k.metric === key)).join("")}</select></td>
      <td>${m.kind === "manual" || k.metric === "responseCount" ? `<span class="muted small">-</span>` : `<input class="in" list="targetList" value="${esc(k.targetRef)}" placeholder="전체 / 영역 / 문항" data-change="kpi" data-i="${i}" data-field="targetRef" aria-label="'${rowTag}' 대상">`}</td>
      <td><input class="in num" type="number" step="any" value="${k.target ?? ""}" data-change="kpi" data-i="${i}" data-field="target" aria-label="'${rowTag}' 목표"></td>
      <td>${m.kind === "manual" ? `<input class="in num" type="number" step="any" value="${k.actual ?? ""}" data-change="kpi" data-i="${i}" data-field="actual" aria-label="'${rowTag}' 실적">` : `<span class="calc">${val(res?.actualValue)}</span>`}</td>
      ${prevColOn ? `<td><input class="in num" type="number" step="any" value="${k.prevActual ?? ""}" placeholder="선택" data-change="kpi" data-i="${i}" data-field="prevActual" aria-label="'${rowTag}' 전년 실적">${adeqOn && res?.targetCaution ? `<div class="small warn-text" title="${esc(res.targetCaution)}">${icon("alert", 12)} 목표 검토</div>` : ""}</td>` : ""}
      ${trendOn ? `<td>${trendBars(Number(k.prevActual), res?.targetValue, res?.actualValue)}</td>` : ""}
      <td><input class="in xs" value="${esc(k.unit || "")}" placeholder="${esc(m.unit)}" data-change="kpi" data-i="${i}" data-field="unit" aria-label="'${rowTag}' 단위"></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="direction" aria-label="'${rowTag}' 방향">${option("up", "상향", k.direction !== "down")}${option("down", "하향", k.direction === "down")}</select></td>
      <td class="nowrap c"><b>${res && Number.isFinite(res.rate) ? f1(res.rate) + "%" : "-"}</b></td>
      <td class="c"><span class="badge ${judgeCls}" title="${esc(res?.error || res?.facts || "")}">${esc(res?.judgment || "-")}</span></td>
      <td class="nowrap"><button class="btn sm ghost" data-act="kpi-del" data-i="${i}" title="삭제" aria-label="'${rowTag}' 삭제">✕</button></td>
    </tr>`;
  }).join("");
  const prevPreview = (adeqOn && isAdminPreview("kpiTargetAdequacy")) || (trendOn && isAdminPreview("kpiTrendChart"));
  const trendPreview = trendOn && isAdminPreview("kpiTrendChart");
  return `<div class="tblwrap"><table class="tbl kpi">
      <thead><tr><th>ID</th><th>지표명</th><th>단계</th><th>연계목표</th><th>측정 방법</th><th>대상</th><th>목표</th><th>실적</th>${prevColOn ? `<th>전년 실적${prevPreview ? ' <span class="badge muted">관리자 미리보기</span>' : ""}</th>` : ""}${trendOn ? `<th>추이${trendPreview ? ' <span class="badge muted">관리자 미리보기</span>' : ""}</th>` : ""}<th>단위</th><th>방향</th><th>달성률</th><th>판정</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

export function render() {
  const lm = state.logicModel, r = compute();
  const goals = lm.goals || [];
  const hasLm = hasProgramInfo(lm) || hasLogicModel(lm);
  const guided = isFeatureOn("guidedKpiSetup");
  const selected = state.codebook.evaluationPurposes || [];
  const purposeOf = q => q.kpi.metric === "manual" ? "output" : METRICS[q.kpi.metric]?.kind === "prepost" ? "change" : "experience";
  const quick = quickKpis(r).filter(q => !guided || !selected.length || selected.includes(purposeOf(q))).map(q => guided ? { ...q, label: q.kpi.metric === "manual" ? q.label : `${METRICS[q.kpi.metric].label} · 측정 문항 선택 필요` } : q);
  const used = new Set(state.kpis.map(k => k.metric + "|" + k.name));
  const quality = isFeatureOn("measurementQuality") ? measurementQuality(state.codebook, r.analysis) : [];
  const adminTabOn = isAdminPreview("measurementQuality") || isAdminPreview("surveyVersioning") || isAdminPreview("competencyProfile") || isAdminPreview("standardComparisons");
  const validTabs = new Set(["quick", "table", "guide", ...(adminTabOn ? ["admin"] : [])]);
  if (!validTabs.has(kpiTab)) kpiTab = "quick";
  const targetChoices = [...state.codebook.domains.map(d => ({value:`@domain:${d.id}`,label:`영역: ${d.name}`})), ...state.codebook.columns.filter(c=>["likert","nps"].includes(c.role)).map(c=>({value:`@item:${c.key}`,label:`${c.label} ${c.time ? `(${c.time === "pre" ? "사전" : "사후"})` : ""}`}))];
  const emptyKpi = `<div class="empty-inline">${icon("chart", 22)}<div><b>아직 성과지표가 없습니다</b><p class="small muted">평가할 지표를 추가한 뒤 측정 대상과 목표를 확인하세요. 목표 없이도 실적을 확인할 수 있습니다.</p></div></div>`;
  const kpiTabs = guided ? `<nav class="tabs kpi-workspace-tabs" aria-label="성과지표 작업 영역"><button class="tab${kpiTab === "quick" ? " on" : ""}" ${kpiTab === "quick" ? 'aria-current="page"' : ""} data-act="kpi-tab" data-tab="quick">빠른 설정</button><button class="tab${kpiTab === "table" ? " on" : ""}" ${kpiTab === "table" ? 'aria-current="page"' : ""} data-act="kpi-tab" data-tab="table">전체 표 편집</button><button class="tab${kpiTab === "guide" ? " on" : ""}" ${kpiTab === "guide" ? 'aria-current="page"' : ""} data-act="kpi-tab" data-tab="guide">측정 가이드</button>${adminTabOn ? `<button class="tab${kpiTab === "admin" ? " on" : ""}" ${kpiTab === "admin" ? 'aria-current="page"' : ""} data-act="kpi-tab" data-tab="admin">관리자 검증</button>` : ""}</nav>` : "";

  return `
  <div class="page-head">
    <div><h1>성과지표 <span class="badge muted">선택</span></h1><p class="small muted">목표값을 정하면 달성률·판정이 자동 계산되어 보고서에 ‘성과지표 달성 현황’ 장이 추가됩니다. 지표가 없어도 분석·보고서는 그대로 만들어집니다.</p></div>
    <div class="row gap wrap"><button class="btn ghost" data-act="goto" data-to="references">평가 레퍼런스 보기${icon("right", 16)}</button><button class="btn" data-act="goto" data-to="dash">건너뛰고 분석 결과 보기${icon("right", 16)}</button></div>
  </div>

  <section class="card kpi-workspace">
    ${kpiTabs}
    ${state.codebook.calculationNotice ? `<p class="hint">${esc(state.codebook.calculationNotice)}</p>` : ""}
    ${!guided || kpiTab === "quick" ? `<div class="kpi-tab-panel" data-panel="quick"><div class="row between wrap"><div><div class="eyebrow">빠른 설정</div><h2>성과지표 추가·확인</h2></div><div class="row gap">${state.businessFound?.kpi ? `<span class="badge ok">엑셀 성과지표 시트 반영됨</span>` : ""}<button class="btn sm" data-act="kpi-add">+ 빈 지표 추가</button></div></div>${guided ? `<h3>이번 사업에서 무엇을 확인하려 하나요?</h3><div class="row gap wrap kpi-purpose-list">${Object.entries(PURPOSES).map(([id,label]) => `<label><input type="checkbox" data-change="kpi-purpose" data-id="${id}" ${selected.includes(id) ? "checked" : ""}> ${label}</label>`).join("")}</div>${selected.includes("followup") ? '<p class="small muted">후속 실천은 활동 종료 뒤 별도 조사·관찰 기록이 필요합니다. 측정 시점과 실적 근거를 고급 설정에 기록하세요.</p>' : ""}` : ""}<div class="quick-kpis">${quick.map(qk => `<div class="quick-kpi-option"><button class="chip-btn" data-act="kpi-quick" data-id="${qk.id}" ${used.has(qk.kpi.metric + "|" + qk.kpi.name) ? "disabled" : ""}>+ ${esc(qk.label)}</button><span class="quick-kpi-help">${esc(quickKpiHelp(qk))}</span></div>`).join("")}</div><datalist id="targetList">${targetOptions().map(t => `<option value="${esc(t)}">`).join("")}</datalist>${state.kpis.length ? guided ? kpiCards(state.kpis, r.evaluation?.results || [], targetChoices, { evidenceOn: isFeatureOn("referenceEvidence") }) : kpiTable(r) : emptyKpi}${r.evaluation ? `<p class="summary">설정한 목표의 달성 요약: 판정 가능한 ${r.evaluation.summary.measured}개 중 <b>${r.evaluation.summary.achieved}개 달성</b>, ${r.evaluation.summary.mostly}개 대체로 달성, ${r.evaluation.summary.notAchieved}개 미달성 · 목표 없이 측정 ${r.evaluation.summary.unsetTarget}개</p>` : ""}${r.lint.length ? `<h3>연계 점검</h3><ul class="warnings">${r.lint.map(w => `<li>${levelBadge(w.level)} ${esc(w.msg)}</li>`).join("")}</ul>` : ""}</div>` : ""}
    ${guided && kpiTab === "table" ? `<div class="kpi-tab-panel" data-panel="table"><div class="row between wrap"><div><div class="eyebrow">전체 표 편집</div><h2>모든 설정을 한눈에 수정</h2></div><button class="btn sm" data-act="kpi-add">+ 빈 지표 추가</button></div>${state.kpis.length ? kpiTable(r) : emptyKpi}</div>` : ""}
    ${guided && kpiTab === "guide" ? `<div class="kpi-tab-panel" data-panel="guide"><div class="eyebrow">측정 가이드</div><h2>성과지표는 3단계로 설정합니다</h2><div class="kpi-guide-steps"><div><span>1</span><b>평가 목적을 고릅니다</b><p>만족도인지, 참여 전후 변화인지 먼저 정합니다.</p></div><div><span>2</span><b>추천 지표를 추가합니다</b><p>설문에 맞는 버튼을 누르면 자동 계산 지표가 들어갑니다.</p></div><div><span>3</span><b>측정 대상과 목표를 확인합니다</b><p>문항·단위·시점을 확인하고 목표를 입력하거나 비워 둡니다.</p></div></div><p class="small muted">단순 만족도 분석만 필요하면 성과지표를 추가하지 않고 바로 분석 결과로 이동해도 됩니다.</p><div class="metric-guide"><div class="metric-guide-head">${icon("help", 15)}측정 방법 안내</div><div class="metric-guide-grid">${Object.values(METRICS).map(mm => `<div class="metric-guide-item"><b>${esc(mm.label)}</b>${mm.formula ? `<span class="muted">${esc(mm.formula)}</span>` : ""}</div>`).join("")}</div><p class="format-help small muted"><b>입력 우선순위:</b> 측정할 문항 → 단위·시점 → 목표(선택). 만족도는 참여 경험입니다. 사전·사후라는 측정 방법만으로 중기성과가 되지는 않습니다.</p><p class="format-help small"><button class="link-btn" data-act="goto" data-to="references">근거와 단계별 가이드 보기 →</button></p></div></div>` : ""}
    ${guided && kpiTab === "admin" && adminTabOn ? `<div class="kpi-tab-panel" data-panel="admin"><div class="row between wrap"><div><div class="eyebrow">관리자 전용</div><h2>측정 품질·고급 기능 검증</h2></div><span class="badge muted">관리자 미리보기</span></div>${isFeatureOn("measurementQuality") ? `<div class="measurement-quality"><h3>설문 측정 품질 점검</h3>${quality.length ? `<ul class="warnings">${quality.map(w => `<li>${levelBadge(w.level)} <b>${measurementQualityLabel[w.level]}</b> ${esc(w.msg)}</li>`).join("")}</ul>` : `<p class="small good-text">현재 설문에서 우선 확인할 측정 품질 경고가 없습니다.</p>`}<p class="small muted">문항 버전, 사전·사후 일치, 척도 범위, 영역별 문항 수와 표본 규모를 점검합니다.</p></div>` : ""}${renderMeasurement()}</div>` : ""}
  </section>

  <section class="card">
    ${guided ? '<details><summary>사업정보 · 논리모형 (선택) 펼치기</summary>' : ''}
    <div class="row between wrap">
      <h2 class="flush">사업정보 · 논리모형 <span class="badge muted">선택 · 고급</span>${hasLm ? ` <span class="badge ok">입력됨</span>` : ""}${state.businessFound?.business ? ` <span class="badge ok">엑셀 시트 반영</span>` : ""}${state.businessFound?.doc ? ` <span class="badge ok">문서에서 초안 반영 · 확인 필요</span>` : ""}</h2>
      <div class="rt-io-group" role="group" aria-label="사업정보·성과지표 저장·불러오기">
        <button class="rt-btn" data-act="save-preset" title="사업정보·지표 파일로 저장">${icon("download", 16)}사업정보·지표 파일로 저장</button>
        <div class="rt-sep" aria-hidden="true"></div>
        <label class="rt-btn" title="파일 불러오기">${icon("upload", 16)}파일 불러오기<input type="file" accept=".json" data-change="load-preset" hidden></label>
        <div class="rt-sep" aria-hidden="true"></div>
        <label class="rt-btn" title="문서에서 채우기(.hwpx)">${icon("doc", 16)}문서에서 채우기(.hwpx)<input type="file" accept=".hwpx" data-change="load-plan-doc" hidden></label>
        <div class="rt-sep" aria-hidden="true"></div>
        <div class="rt-pop-wrap">
          <button class="rt-btn" data-act="toggle-plan-doc-help" aria-expanded="${planDocHelpOpen}" aria-haspopup="true" aria-label="문서에서 채우기 사용법" title="문서에서 채우기 사용법">${icon("help", 16)}</button>
          ${planDocHelpOpen ? `<div class="rt-pop wide right" role="dialog" aria-label="문서에서 채우기 사용법">${planDocHelpPanel()}</div>` : ""}
        </div>
        ${hasLm ? `<div class="rt-sep" aria-hidden="true"></div><button class="rt-btn" data-act="clear-business" title="사업정보·논리모형 입력 내용 지우기">${icon("trash", 16)}지우기</button>` : ""}
      </div>
    </div>
    <p class="small muted">입력하면 보고서에 ‘사업 개요’와 ‘논리모형’ 표, 목표별 달성 평가가 추가됩니다. 몰라도 보고서 작성에는 문제없습니다.</p>
    <div class="grid3">
      ${FIELDS.map(([k, l]) => `<label class="field">${l}<input class="in" value="${esc(lm[k] || "")}" placeholder="${PROGRAM_FIELD_EXAMPLES[k] || ""}" data-change="lm" data-field="${k}"></label>`).join("")}
    </div>
    <div class="grid2">
      <label class="field">추진배경<textarea class="in" rows="2" placeholder="${esc(BACKGROUND_EXAMPLE)}" data-change="lm" data-field="background">${esc(lm.background)}</textarea></label>
      <label class="field">사업목적<textarea class="in" rows="2" placeholder="${esc(PURPOSE_EXAMPLE)}" data-change="lm" data-field="purpose">${esc(lm.purpose)}</textarea></label>
    </div>
    <label class="field">추진목표 <span class="muted small">(한 줄에 하나씩 · 성과지표의 ‘연계목표’로 선택할 수 있습니다)</span>
      <textarea class="in" rows="3" placeholder="${esc(GOALS_EXAMPLE)}" data-change="lm" data-field="goals">${esc(goals.map(g => g.text).join("\n"))}</textarea></label>
    <h3>논리모형 <span class="muted small">(각 칸에 한 줄에 하나씩 · 비워 둔 칸은 표에서 빠집니다)</span></h3>
    <div class="logic">
      ${LOGIC_STAGES.map((s, i) => `<label class="logic-col"><b>${s.label}</b><span class="muted small">${esc(s.hint)}</span>
        <textarea class="in" rows="5" placeholder="${esc(LOGIC_STAGE_EXAMPLES[s.key] || "")}" data-change="lm-stage" data-stage="${s.key}">${esc((lm[s.key] || []).join("\n"))}</textarea></label>${i < LOGIC_STAGES.length - 1 ? `<span class="arrow">→</span>` : ""}`).join("")}
    </div>
    ${guided ? '</details>' : ''}
  </section>

  ${!guided ? renderMeasurement() : ""}
  <div class="row end gap"><button class="btn primary" data-act="goto" data-to="dash">다음: 분석 결과${icon("right", 16)}</button></div>`;
}

export const actions = {
  ...measurementActions,
  "kpi-tab": el => { if (["quick", "table", "guide", "admin"].includes(el.dataset.tab)) kpiTab = el.dataset.tab; refresh(); },
  "kpi-purpose": el => {
    if (!isFeatureOn("guidedKpiSetup") || !PURPOSES[el.dataset.id]) return;
    const values = new Set(state.codebook.evaluationPurposes || []);
    if (el.checked) values.add(el.dataset.id); else values.delete(el.dataset.id);
    state.codebook.evaluationPurposes = [...values]; invalidate(); refresh();
  },
  lm: el => {
    const lm = state.logicModel, f = el.dataset.field;
    if (f === "goals") {
      const lines = el.value.split(/\n+/).map(s => s.trim()).filter(Boolean);
      lm.goals = lines.map((text, i) => ({ id: lm.goals[i]?.id || `G${i + 1}`, text }));
    } else lm[f] = el.value.trim();
    invalidate(); refresh();
  },
  "lm-stage": el => { state.logicModel[el.dataset.stage] = el.value.split(/\n+/).map(s => s.trim()).filter(Boolean); invalidate(); refresh(); },
  "clear-business": () => {
    if (!confirm("사업정보·논리모형에 입력한 내용을 모두 지울까요? 성과지표 표는 그대로 유지됩니다.")) return;
    state.logicModel = emptyLogicModel();
    state.businessFound = { ...(state.businessFound || {}), business: false, doc: false };
    invalidate();
    toast("사업정보·논리모형을 지웠습니다", "ok");
    refresh();
  },
  kpi: el => {
    const k = state.kpis[+el.dataset.i], f = el.dataset.field;
    if (!k) return;
    if (f === "target" || f === "actual" || f === "prevActual") k[f] = el.value === "" ? null : Number(el.value);
    else if (f === "evidenceReviewed") k[f] = !!el.checked;
    else k[f] = f === "evidenceRef" ? normalizeEvidenceRef(el.value) : el.value;
    if (f === "metric" && !k.unit) k.unit = METRICS[k.metric]?.unit || "";
    invalidate(); refresh();
  },
  "kpi-add": () => { state.kpis.push({ ...newKpi(nextKpiNo()), ...(isFeatureOn("guidedKpiSetup") ? { target:null,targetRef:"",requireTarget:true } : {}) }); invalidate(); refresh(); },
  "kpi-quick": el => {
    const qk = quickKpis(compute()).find(x => x.id === el.dataset.id);
    if (!qk) return;
    state.kpis.push({ ...newKpi(nextKpiNo()), ...qk.kpi, ...(isFeatureOn("guidedKpiSetup") ? { evaluationPurpose: (state.codebook.evaluationPurposes || []).join(","), name: qk.kpi.metric === "manual" ? qk.kpi.name : METRICS[qk.kpi.metric].label, target: null, targetRef: "", requireTarget: qk.kpi.metric !== "manual", stage: qk.kpi.metric === "manual" ? "산출" : "단기성과" } : {}) });
    invalidate();
    toast("지표를 추가했습니다 — 측정 대상과 단위를 확인하세요. 목표는 선택 사항입니다.", "ok");
    refresh();
  },
  "kpi-del": el => { state.kpis.splice(+el.dataset.i, 1); invalidate(); refresh(); },
  "save-preset": () => {
    const json = JSON.stringify({ app: "survey-v5-business", logicModel: state.logicModel, kpis: state.kpis }, null, 1);
    download(json, `사업정보_${state.logicModel.programName || "성과지표"}.json`, "application/json");
  },
  "load-preset": async el => {
    const f = el.files?.[0]; if (!f) return;
    try {
      if (f.size > 2 * 1024 * 1024) throw new Error("파일이 너무 큽니다(2MB 초과)");
      const obj = JSON.parse(await readFileText(f));
      if (!obj || typeof obj !== "object" || (!obj.logicModel && !Array.isArray(obj.kpis))) throw new Error("사업정보 파일이 아닙니다");
      if (obj.logicModel) state.logicModel = normalizeLogicModel(obj.logicModel);
      if (Array.isArray(obj.kpis)) state.kpis = obj.kpis.filter(k => k && typeof k === "object").map((k, i) => ({ ...newKpi(i + 1), ...pickKpi(k) }));
      invalidate(); toast("사업정보·성과지표를 불러왔습니다", "ok"); refresh();
    } catch (e) { toast(`불러오기 실패: ${e.message}`, "bad"); }
    el.value = "";
  },
  "toggle-plan-doc-help": () => { planDocHelpOpen = !planDocHelpOpen; refresh(); },
  "load-plan-doc": async el => {
    const f = el.files?.[0];
    el.value = "";
    if (!f) return;
    if (!/\.hwpx$/i.test(f.name)) { toast("HWPX(.hwpx) 파일만 지원합니다 — PDF는 추후 지원 예정", "bad"); return; }
    if (f.size > MAX_PLAN_DOC_MB * 1024 * 1024) { toast(`파일이 너무 큽니다(${MAX_PLAN_DOC_MB}MB 초과)`, "bad"); return; }
    busy(true, "문서에서 정보를 찾는 중…");
    await nextFrame();
    let draft;
    try {
      const bytes = await readFileBytes(f);
      const { paragraphs, tables } = await readHwpxText(bytes, { JSZip: await loadJSZip(), DOMParser: window.DOMParser });
      draft = readBusinessFromHwpx({ paragraphs, tables });
    } catch (e) {
      console.error(e);
      busy(false);
      toast(e.message === "NOT_HWPX" ? "올바른 HWPX 파일이 아닙니다" : `문서를 읽지 못했습니다: ${e.message}`, "bad", 6000);
      return;
    }
    busy(false);
    if (!draft.logicModel && !draft.kpis?.length) {
      toast("문서에서 사업정보를 찾지 못했습니다 — 항목/내용 표나 Ⅰ./□/1. 같은 제목줄이 있는지 확인해 주세요", "bad", 6000);
      return;
    }
    const preview = previewPlanDocDraft(state.logicModel, draft);
    if (!preview.fields.length && !preview.kpis.length) {
      toast("문서 내용을 확인했지만 이미 입력한 내용과 겹쳐 새로 채울 내용이 없습니다", "info", 6000);
      return;
    }
    if (!confirm(formatPlanDocConfirm(preview))) return;
    state.logicModel = preview.merged;
    let addedKpis = 0;
    if (preview.kpis.length) {
      const base = nextKpiNo();
      const tagged = tagDraftKpis(draft.kpis).map((k, i) => ({ ...k, id: `K${base + i}` }));
      state.kpis.push(...tagged);
      addedKpis = tagged.length;
    }
    state.businessFound = { business: false, kpi: false, ...state.businessFound, doc: true };
    invalidate();
    toast(`문서에서 초안을 채웠습니다(사업정보 ${preview.fields.length}항목, 지표 ${addedKpis}개) — 자동 추출은 틀릴 수 있으니 꼭 확인하세요`, "ok", 6000);
    refresh();
  },
};

const truncate = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);

function formatPlanDocConfirm(preview) {
  const lines = ["문서에서 아래 내용을 찾았습니다. 적용할까요?", ""];
  if (preview.fields.length) {
    lines.push(`[사업정보·논리모형 ${preview.fields.length}항목]`);
    preview.fields.slice(0, 10).forEach(f => lines.push(`- ${f.label}: ${truncate(f.value, 40)}`));
    if (preview.fields.length > 10) lines.push(`  … 외 ${preview.fields.length - 10}항목`);
    lines.push("");
  }
  if (preview.kpis.length) {
    lines.push(`[성과지표 ${preview.kpis.length}개 추가]`);
    preview.kpis.slice(0, 8).forEach(k => lines.push(`- ${k.name}`));
    if (preview.kpis.length > 8) lines.push(`  … 외 ${preview.kpis.length - 8}개`);
    lines.push("");
  }
  lines.push("기존에 입력한 내용은 바뀌지 않고, 지표는 표에 추가만 됩니다.");
  lines.push("자동 추출은 틀릴 수 있으니 적용 후 꼭 확인하세요.");
  return lines.join("\n");
}

const KPI_FIELDS = ["id", "name", "stage", "goalId", "metric", "targetRef", "target", "actual", "prevActual", "direction", "unit", "note", "targetBasis", "measurementTime", "requireTarget", "evaluationPurpose", "evidenceRef", "evidenceRationale", "evidenceReviewed"];
function pickKpi(k) {
  const o = {};
  for (const f of KPI_FIELDS) {
    if (k[f] === undefined) continue;
    o[f] = f === "requireTarget" ? k[f] === true : ["target", "actual", "prevActual"].includes(f) ? (k[f] === null || k[f] === "" ? null : Number(k[f])) : String(k[f]).slice(0, 200);
  }
  if (o.metric && !METRICS[o.metric]) o.metric = "manual";
  return o;
}
function nextKpiNo() {
  const nums = state.kpis.map(k => Number(String(k.id).replace(/\D/g, ""))).filter(Number.isFinite);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}
