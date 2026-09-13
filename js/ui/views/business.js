// ③ 사업정보(논리모형)·성과지표 입력 화면
import { state, compute, invalidate } from "../store.js";
import { LOGIC_STAGES, KPI_STAGES, normalizeLogicModel } from "../../evaluation/logic-model.js";
import { METRICS, newKpi } from "../../evaluation/kpi.js";
import { pairsOf } from "../../model/codebook.js";
import { f1, f2 } from "../../narrative/vocab.js";
import { esc, option, levelBadge, toast, download, readFileText } from "../util.js";
import { refresh } from "../router.js";

const FIELDS = [["programName", "사업명"], ["period", "사업기간"], ["target", "참여대상"], ["budget", "사업예산"], ["department", "추진부서"]];

function targetOptions() {
  const cb = state.codebook;
  const labels = new Set(["전체"]);
  cb.domains.forEach(d => labels.add(d.name));
  cb.columns.filter(c => ["likert", "nps"].includes(c.role) && c.time !== "pre").forEach(c => labels.add(c.label));
  pairsOf(cb).forEach(p => labels.add(p.label));
  return [...labels];
}

export function render() {
  const lm = state.logicModel, r = compute();
  const results = new Map((r.evaluation?.results || []).map(x => [x.id, x]));
  const goals = lm.goals || [];
  const kpiRows = state.kpis.map((k, i) => {
    const res = results.get(k.id);
    const m = METRICS[k.metric] || METRICS.manual;
    const judgeCls = res?.judgment === "달성" ? "ok" : res?.judgment === "대체로 달성" ? "info" : res?.judgment === "미달성" ? "bad" : "muted";
    const val = v => (Number.isFinite(v) ? (["mean", "prepostDiff", "effectSize"].includes(k.metric) ? f2(v) : Number.isInteger(v) ? String(v) : f1(v)) : "-");
    return `<tr>
      <td><input class="in xs" value="${esc(k.id)}" data-change="kpi" data-i="${i}" data-field="id"></td>
      <td><input class="in" value="${esc(k.name)}" placeholder="예: 진로 관심 향상도" data-change="kpi" data-i="${i}" data-field="name"></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="stage">${KPI_STAGES.map(s => option(s, s, k.stage === s)).join("")}</select></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="goalId">${option("", "-", !k.goalId)}${goals.map((g, gi) => option(g.id, `목표${gi + 1}`, k.goalId === g.id)).join("")}</select></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="metric">${Object.entries(METRICS).map(([key, mm]) => option(key, mm.label, k.metric === key)).join("")}</select></td>
      <td>${m.kind === "manual" || k.metric === "responseCount" ? `<span class="muted small">-</span>` : `<input class="in" list="targetList" value="${esc(k.targetRef)}" placeholder="전체 / 영역 / 문항" data-change="kpi" data-i="${i}" data-field="targetRef">`}</td>
      <td><input class="in num" type="number" step="any" value="${k.target ?? ""}" data-change="kpi" data-i="${i}" data-field="target"></td>
      <td>${m.kind === "manual" ? `<input class="in num" type="number" step="any" value="${k.actual ?? ""}" data-change="kpi" data-i="${i}" data-field="actual">` : `<span class="calc">${val(res?.actualValue)}</span>`}</td>
      <td><input class="in xs" value="${esc(k.unit || "")}" placeholder="${esc(m.unit)}" data-change="kpi" data-i="${i}" data-field="unit"></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="direction">${option("up", "상향", k.direction !== "down")}${option("down", "하향", k.direction === "down")}</select></td>
      <td class="nowrap c"><b>${res && Number.isFinite(res.rate) ? f1(res.rate) + "%" : "-"}</b></td>
      <td class="c"><span class="badge ${judgeCls}" title="${esc(res?.error || res?.facts || "")}">${esc(res?.judgment || "-")}</span></td>
      <td class="nowrap"><button class="btn sm ghost" data-act="kpi-del" data-i="${i}" title="삭제">✕</button></td>
    </tr>`;
  }).join("");

  return `
  <section class="card">
    <div class="row between wrap">
      <div><h2>사업정보 · 논리모형</h2><p class="muted">보고서 '사업 개요'와 '논리모형' 표, 종합평가(목표별 달성)에 사용됩니다. 비워 두면 해당 장은 생략됩니다.
      ${state.businessFound?.business ? `<span class="badge ok">엑셀 사업정보 시트 반영됨</span>` : ""}</p></div>
      <div class="row gap"><button class="btn ghost" data-act="save-preset">사업정보·지표 저장</button><label class="btn ghost">불러오기<input type="file" accept=".json" data-change="load-preset" hidden></label></div>
    </div>
    <div class="grid3">
      ${FIELDS.map(([k, l]) => `<label class="field">${l}<input class="in" value="${esc(lm[k] || "")}" data-change="lm" data-field="${k}"></label>`).join("")}
    </div>
    <div class="grid2">
      <label class="field">추진배경<textarea class="in" rows="2" data-change="lm" data-field="background">${esc(lm.background)}</textarea></label>
      <label class="field">사업목적<textarea class="in" rows="2" data-change="lm" data-field="purpose">${esc(lm.purpose)}</textarea></label>
    </div>
    <label class="field">추진목표 <span class="muted small">(한 줄에 하나씩 · 성과지표와 연결됩니다)</span>
      <textarea class="in" rows="3" data-change="lm" data-field="goals">${esc(goals.map(g => g.text).join("\n"))}</textarea></label>
    <h3>논리모형 <span class="muted small">(각 칸에 한 줄에 하나씩)</span></h3>
    <div class="logic">
      ${LOGIC_STAGES.map((s, i) => `<label class="logic-col"><b>${s.label}</b><span class="muted small">${esc(s.hint)}</span>
        <textarea class="in" rows="5" data-change="lm-stage" data-stage="${s.key}">${esc((lm[s.key] || []).join("\n"))}</textarea></label>${i < LOGIC_STAGES.length - 1 ? `<span class="arrow">→</span>` : ""}`).join("")}
    </div>
  </section>

  <section class="card">
    <div class="row between wrap">
      <div><h2>성과지표</h2><p class="muted">목표값과 측정 방법을 정하면 실적·달성률·판정(100% 이상 달성, 90% 이상 대체로 달성)이 자동 계산됩니다.
      ${state.businessFound?.kpi ? `<span class="badge ok">엑셀 성과지표 시트 반영됨</span>` : ""}</p></div>
      <button class="btn" data-act="kpi-add">+ 지표 추가</button>
    </div>
    <datalist id="targetList">${targetOptions().map(t => `<option value="${esc(t)}">`).join("")}</datalist>
    <div class="tblwrap"><table class="tbl kpi">
      <thead><tr><th>ID</th><th>지표명</th><th>단계</th><th>연계목표</th><th>측정 방법</th><th>대상</th><th>목표</th><th>실적</th><th>단위</th><th>방향</th><th>달성률</th><th>판정</th><th></th></tr></thead>
      <tbody>${kpiRows || `<tr><td colspan="13" class="c muted">성과지표가 없습니다. ‘+ 지표 추가’를 누르세요.</td></tr>`}</tbody>
    </table></div>
    ${r.evaluation ? `<p class="summary">종합: 측정 ${r.evaluation.summary.measured}개 중 <b>${r.evaluation.summary.achieved}개 달성</b>, ${r.evaluation.summary.mostly}개 대체로 달성, ${r.evaluation.summary.notAchieved}개 미달성 → 종합 <b>${esc(r.evaluation.summary.grade)}</b></p>` : ""}
    ${r.lint.length ? `<h3>연계 점검</h3><ul class="warnings">${r.lint.map(w => `<li>${levelBadge(w.level)} ${esc(w.msg)}</li>`).join("")}</ul>` : ""}
    <details class="help"><summary>측정 방법 안내</summary>
      <ul>${Object.values(METRICS).map(mm => `<li><b>${esc(mm.label)}</b>${mm.formula ? ` — ${esc(mm.formula)}` : ""}</li>`).join("")}</ul>
      <p class="small muted">만족도는 반응(1단계) 지표입니다. 중기성과·영향은 사전·사후 변화, 향상자 비율 등 변화 지표나 행정 실적(직접 입력)을 권장합니다.</p>
    </details>
    <div class="row end gap"><button class="btn" data-act="goto" data-to="dash">다음: 분석 결과 →</button></div>
  </section>`;
}

export const actions = {
  lm: el => {
    const lm = state.logicModel, f = el.dataset.field;
    if (f === "goals") {
      const lines = el.value.split(/\n+/).map(s => s.trim()).filter(Boolean);
      lm.goals = lines.map((text, i) => ({ id: lm.goals[i]?.id || `G${i + 1}`, text }));
    } else lm[f] = el.value.trim();
    invalidate(); refresh();
  },
  "lm-stage": el => { state.logicModel[el.dataset.stage] = el.value.split(/\n+/).map(s => s.trim()).filter(Boolean); invalidate(); refresh(); },
  kpi: el => {
    const k = state.kpis[+el.dataset.i], f = el.dataset.field;
    if (!k) return;
    if (f === "target" || f === "actual") k[f] = el.value === "" ? null : Number(el.value);
    else k[f] = el.value;
    if (f === "metric" && !k.unit) k.unit = METRICS[k.metric]?.unit || "";
    invalidate(); refresh();
  },
  "kpi-add": () => { state.kpis.push(newKpi(state.kpis.length + 1)); invalidate(); refresh(); },
  "kpi-del": el => { state.kpis.splice(+el.dataset.i, 1); invalidate(); refresh(); },
  "save-preset": () => {
    const json = JSON.stringify({ app: "survey-v5-business", logicModel: state.logicModel, kpis: state.kpis }, null, 1);
    download(json, `사업정보_${state.logicModel.programName || "성과지표"}.json`, "application/json");
  },
  "load-preset": async el => {
    const f = el.files?.[0]; if (!f) return;
    try {
      const obj = JSON.parse(await readFileText(f));
      const lm = obj.logicModel || obj.codebook && null;
      if (!obj.logicModel && !obj.kpis) throw new Error("사업정보 파일이 아닙니다");
      if (lm) state.logicModel = normalizeLogicModel(lm);
      if (obj.kpis) state.kpis = obj.kpis;
      invalidate(); toast("사업정보·성과지표를 불러왔습니다", "ok"); refresh();
    } catch (e) { toast(`불러오기 실패: ${e.message}`, "bad"); }
    el.value = "";
  },
};
