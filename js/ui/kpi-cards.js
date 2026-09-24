import { esc, option } from "./util.js";
import { METRICS } from "../evaluation/kpi.js";
import { REFERENCE_EVIDENCE, validateKpiEvidence } from "../evaluation/reference-evidence.js";
export const PURPOSES = { output: "운영 규모", experience: "참여 경험·만족", change: "역량·태도 변화", followup: "후속 실천" };
export function kpiCards(kpis, results, targets, { evidenceOn = false } = {}) {
  return kpis.map((k, i) => {
    const r = results.find(x => x.id === k.id), metric = METRICS[k.metric] || METRICS.manual;
    const evidenceValidation = validateKpiEvidence(k, metric.kind);
    const selectedEvidence = REFERENCE_EVIDENCE.find(ref => ref.id === k.evidenceRef);
    const hasEvidenceDraft = !!(k.evidenceRef || k.evidenceRationale || k.evidenceReviewed);
    const choices = targets.map(t => typeof t === "string" ? { value:t, label:t } : t);
    if (k.targetRef && !choices.some(t => t.value === k.targetRef)) choices.unshift({value:k.targetRef,label:`기존 연결: ${k.targetRef}`});
    const input = (field, label, numeric = false) => `<label class="field">${label}<input class="in" ${numeric ? 'type="number" step="any"' : ''} value="${esc(k[field] ?? '')}" data-change="kpi" data-i="${i}" data-field="${field}"></label>`;
    const actual = Number.isFinite(r?.actualValue) ? r.actualValue.toFixed(2).replace(/\.00$/, "") : "—";
    const evidenceChecks = [
      [!!selectedEvidence?.kinds.includes(metric.kind), "현재 측정방법에 맞는 근거"],
      [String(k.evidenceRationale || "").trim().length >= 10, "적용 사유 10자 이상"],
      [!!k.evidenceReviewed, "원문 위치·한계 확인"],
    ];
    return `<article class="kpi-editor-card">
      <header class="kpi-editor-head"><div><span class="kpi-editor-id">${esc(k.id || `K${i + 1}`)} · ${esc(k.stage || "성과지표")}</span><strong>${esc(k.name || "새 성과지표")}</strong></div><div class="row gap"><span class="badge ${r?.judgment === "달성" ? "ok" : "muted"}">${esc(r?.judgment || "설정 중")}</span><button class="icon-btn kpi-delete" data-act="kpi-del" data-i="${i}" title="지표 삭제" aria-label="${esc(k.name || "성과지표")} 삭제">×</button></div></header>
      <div class="kpi-core-grid">${input("name", "지표 이름")}${metric.kind === "manual" ? input("actual", "운영 실적", true) : `<label class="field">측정 문항·영역<select class="in" data-change="kpi" data-i="${i}" data-field="targetRef">${option("", "측정 대상을 선택하세요", !k.targetRef)}${choices.map(t => option(t.value, t.label, t.value === k.targetRef)).join("")}</select></label>`}${input("target", "목표값 · 선택", true)}${input("targetBasis", "목표 설정 근거 · 선택")}</div>
      <div class="kpi-result-strip"><div><span>현재 실적</span><b>${actual}${actual === "—" ? "" : esc(k.unit || metric.unit)}</b></div><div><span>산출 기준</span><b>${esc(metric.formula || "운영 기록 직접 입력")}</b></div>${r?.facts ? `<div class="kpi-result-facts"><span>근거 자료</span><b>${esc(r.facts)}</b></div>` : ""}</div>
      ${r?.error ? `<p class="kpi-inline-error" role="alert">${esc(r.error)}</p>` : ""}
      ${evidenceOn ? `<details class="kpi-evidence-panel" ${hasEvidenceDraft && !evidenceValidation.valid ? "open" : ""}><summary><span><b>분석 해석 근거</b><small>${esc(selectedEvidence?.title || "보고서에 사용할 근거를 연결하세요")}</small></span><span class="badge ${evidenceValidation.valid ? "ok" : hasEvidenceDraft ? "warn" : "muted"}">${evidenceValidation.valid ? "보고서 반영 가능" : hasEvidenceDraft ? esc(evidenceValidation.reason) : "선택"}</span></summary><div class="kpi-evidence-body"><div class="kpi-evidence-inputs"><label class="field"><span>근거 자료</span><select class="in" data-change="kpi" data-i="${i}" data-field="evidenceRef">${option("", "근거를 선택해 주세요", !k.evidenceRef)}${REFERENCE_EVIDENCE.filter(ref => ref.kinds.includes(metric.kind)).map(ref => option(ref.id, ref.title, ref.id === k.evidenceRef)).join("")}</select></label><label class="field"><span>이 지표에 적용하는 이유</span><input class="in" value="${esc(k.evidenceRationale || "")}" minlength="10" placeholder="지표와 출처 원칙의 연결을 10자 이상 입력" data-change="kpi" data-i="${i}" data-field="evidenceRationale"></label></div><label class="check kpi-evidence-review"><input type="checkbox" ${k.evidenceReviewed ? "checked" : ""} data-change="kpi" data-i="${i}" data-field="evidenceReviewed"> 원문 위치와 적용 한계를 직접 확인했습니다</label><div class="kpi-evidence-conditions"><b>보고서 반영 조건</b>${evidenceChecks.map(([ok,label]) => `<span class="${ok ? "done" : ""}">${ok ? "✓" : "○"} ${label}</span>`).join("")}<small>세 조건을 모두 충족한 근거만 분석 결과·보고서·발표자료에 표시됩니다.</small></div></div></details>` : ""}
      <details class="kpi-advanced-panel"><summary>고급 설정</summary><div class="grid2">${input("id", "지표 ID")}${input("unit", "단위")}${input("measurementTime", "측정 시점")}${input("note", "해석·자료 메모")}<label class="field">측정 방법<select class="in" data-change="kpi" data-i="${i}" data-field="metric">${Object.entries(METRICS).map(([id,m]) => option(id,m.label,k.metric===id)).join("")}</select></label><label class="field">좋아지는 방향<select class="in" data-change="kpi" data-i="${i}" data-field="direction">${option("up","높을수록 좋음",k.direction!=="down")}${option("down","낮을수록 좋음",k.direction==="down")}</select></label></div></details>
    </article>`;
  }).join("");
}
