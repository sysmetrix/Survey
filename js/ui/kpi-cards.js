import { esc, option } from "./util.js";
import { METRICS } from "../evaluation/kpi.js";
export const PURPOSES = { output: "운영 규모", experience: "참여 경험·만족", change: "역량·태도 변화", followup: "후속 실천" };
export function kpiCards(kpis, results, targets, { evidenceOn = false } = {}) {
  return kpis.map((k, i) => {
    const r = results.find(x => x.id === k.id), metric = METRICS[k.metric] || METRICS.manual;
    const choices = targets.map(t => typeof t === "string" ? { value:t, label:t } : t);
    if (k.targetRef && !choices.some(t => t.value === k.targetRef)) choices.unshift({value:k.targetRef,label:`기존 연결: ${k.targetRef}`});
    const input = (field, label, numeric = false) => `<label class="field">${label}<input class="in" ${numeric ? 'type="number" step="any"' : ''} value="${esc(k[field] ?? '')}" data-change="kpi" data-i="${i}" data-field="${field}"></label>`;
    return `<article class="card"><div class="grid2">${input("name", "지표 이름")}${metric.kind === "manual" ? input("actual", "운영 기록의 실적", true) : `<label class="field">측정할 문항·영역<select class="in" data-change="kpi" data-i="${i}" data-field="targetRef">${option("", "선택해 주세요", !k.targetRef)}${choices.map(t => option(t.value, t.label, t.value === k.targetRef)).join("")}</select></label>`}${input("target", "목표값 (비우면 목표 없이 측정)", true)}${input("targetBasis", "목표 설정 근거 (선택)")}</div>
      ${evidenceOn ? `<label class="field"><span>근거 레퍼런스</span><input class="in" value="${esc(k.evidenceRef || "")}" placeholder="예: OECD results framework" data-change="kpi" data-i="${i}" data-field="evidenceRef"></label>` : ""}
      <p>실적: <b>${Number.isFinite(r?.actualValue) ? r.actualValue.toFixed(2) : "아직 계산할 수 없음"}</b> ${esc(k.unit || metric.unit)} · ${esc(r?.judgment || "입력 중")}</p>
      ${r?.error ? `<p class="warn-text">${esc(r.error)}</p>` : ""}
      <p class="small muted">${esc(metric.formula || "담당자가 확인한 운영 기록을 입력합니다.")} ${r?.facts ? `· ${esc(r.facts)}` : ""}</p>
      <details><summary>자세히 설정</summary><div class="grid2">${input("id", "지표 ID")}${input("unit", "단위")}${input("measurementTime", "측정 시점")}${input("note", "해석·자료 메모")}<label class="field">측정 방법<select class="in" data-change="kpi" data-i="${i}" data-field="metric">${Object.entries(METRICS).map(([id,m]) => option(id,m.label,k.metric===id)).join("")}</select></label><label class="field">좋아지는 방향<select class="in" data-change="kpi" data-i="${i}" data-field="direction">${option("up","높을수록 좋음",k.direction!=="down")}${option("down","낮을수록 좋음",k.direction==="down")}</select></label></div></details>
      <button class="btn sm" data-act="kpi-del" data-i="${i}" aria-label="${esc(k.name)} 삭제">지표 삭제</button></article>`;
  }).join("");
}
