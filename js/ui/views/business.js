// ③ 성과지표(선택)·사업정보·논리모형(선택) 입력 화면
// 처음 쓰는 직원도 부담 없도록: 성과지표는 '빠른 추가'로 시작, 사업정보·논리모형은 항상 펼쳐서 바로 보여줌
import { state, compute, invalidate } from "../store.js";
import { LOGIC_STAGES, KPI_STAGES, normalizeLogicModel, hasLogicModel, hasProgramInfo } from "../../evaluation/logic-model.js";
import { METRICS, newKpi } from "../../evaluation/kpi.js";
import { readBusinessFromHwpx, mergeIntoLogicModel, tagDraftKpis } from "../../evaluation/business-doc.js";
import { readHwpxText } from "../../report/hwpx/read.js";
import { pairsOf } from "../../model/codebook.js";
import { f1, f2 } from "../../narrative/vocab.js";
import { esc, option, levelBadge, toast, download, readFileText, readFileBytes, busy, nextFrame } from "../util.js";
import { refresh } from "../router.js";
import { icon } from "../icons.js";

const MAX_PLAN_DOC_MB = 20;

const FIELDS = [["programName", "사업명"], ["period", "사업기간"], ["target", "참여대상"], ["budget", "사업예산"], ["department", "추진부서"]];

function targetOptions() {
  const cb = state.codebook;
  const labels = new Set(["전체"]);
  cb.domains.forEach(d => labels.add(d.name));
  cb.columns.filter(c => ["likert", "nps"].includes(c.role) && c.time !== "pre").forEach(c => labels.add(c.label));
  pairsOf(cb).forEach(p => labels.add(p.label));
  return [...labels];
}

/** 데이터에 맞는 빠른 추가 지표 */
function quickKpis(r) {
  const A = r.analysis, P = A.prepost;
  const overall = A.overallItem?.label;
  return [
    A.items.length && { id: "sat", label: "만족도 80점 이상", kpi: { name: overall ? `${overall}(100점 환산)` : "만족도(100점 환산)", stage: "단기성과", metric: "score100", targetRef: overall || "전체", target: 80, unit: "점" } },
    A.items.length && { id: "top2", label: "긍정응답률 80% 이상", kpi: { name: "긍정응답률", stage: "단기성과", metric: "top2", targetRef: overall || "전체", target: 80, unit: "%" } },
    A.nps.length && { id: "nps", label: "추천지수(NPS) 30점 이상", kpi: { name: "순추천지수(NPS)", stage: "단기성과", metric: "nps", targetRef: A.nps[0].label, target: 30, unit: "점" } },
    P && { id: "diff", label: "사전·사후 0.3점 향상", kpi: { name: "참여 전후 향상도", stage: "단기성과", metric: "prepostDiff", targetRef: "전체", target: 0.3, unit: "점" } },
    P && { id: "improved", label: "향상자 비율 60% 이상", kpi: { name: "향상자 비율", stage: "중기성과", metric: "improvedRate", targetRef: "전체", target: 60, unit: "%" } },
    { id: "count", label: "참여 인원 (직접 입력)", kpi: { name: "참여 인원(실인원)", stage: "산출", metric: "manual", target: null, unit: "명" } },
    { id: "sessions", label: "운영 횟수 (직접 입력)", kpi: { name: "프로그램 운영 횟수", stage: "산출", metric: "manual", target: null, unit: "회" } },
  ].filter(Boolean);
}

function kpiTable(r) {
  const results = new Map((r.evaluation?.results || []).map(x => [x.id, x]));
  const goals = state.logicModel.goals || [];
  const rows = state.kpis.map((k, i) => {
    const res = results.get(k.id);
    const m = METRICS[k.metric] || METRICS.manual;
    const judgeCls = res?.judgment === "달성" ? "ok" : res?.judgment === "대체로 달성" ? "info" : res?.judgment === "미달성" ? "bad" : "muted";
    const val = v => (Number.isFinite(v) ? (["mean", "prepostDiff", "effectSize"].includes(k.metric) ? f2(v) : Number.isInteger(v) ? String(v) : f1(v)) : "-");
    return `<tr>
      <td><input class="in xs" value="${esc(k.id)}" data-change="kpi" data-i="${i}" data-field="id" aria-label="지표 ID"></td>
      <td><input class="in" value="${esc(k.name)}" placeholder="예: 진로 관심 향상도" data-change="kpi" data-i="${i}" data-field="name" aria-label="지표명"></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="stage">${KPI_STAGES.map(s => option(s, s, k.stage === s)).join("")}</select></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="goalId">${option("", "-", !k.goalId)}${goals.map((g, gi) => option(g.id, `목표${gi + 1}`, k.goalId === g.id)).join("")}</select></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="metric">${Object.entries(METRICS).map(([key, mm]) => option(key, mm.label, k.metric === key)).join("")}</select></td>
      <td>${m.kind === "manual" || k.metric === "responseCount" ? `<span class="muted small">-</span>` : `<input class="in" list="targetList" value="${esc(k.targetRef)}" placeholder="전체 / 영역 / 문항" data-change="kpi" data-i="${i}" data-field="targetRef">`}</td>
      <td><input class="in num" type="number" step="any" value="${k.target ?? ""}" data-change="kpi" data-i="${i}" data-field="target" aria-label="목표"></td>
      <td>${m.kind === "manual" ? `<input class="in num" type="number" step="any" value="${k.actual ?? ""}" data-change="kpi" data-i="${i}" data-field="actual" aria-label="실적">` : `<span class="calc">${val(res?.actualValue)}</span>`}</td>
      <td><input class="in xs" value="${esc(k.unit || "")}" placeholder="${esc(m.unit)}" data-change="kpi" data-i="${i}" data-field="unit" aria-label="단위"></td>
      <td><select class="in" data-change="kpi" data-i="${i}" data-field="direction">${option("up", "상향", k.direction !== "down")}${option("down", "하향", k.direction === "down")}</select></td>
      <td class="nowrap c"><b>${res && Number.isFinite(res.rate) ? f1(res.rate) + "%" : "-"}</b></td>
      <td class="c"><span class="badge ${judgeCls}" title="${esc(res?.error || res?.facts || "")}">${esc(res?.judgment || "-")}</span></td>
      <td class="nowrap"><button class="btn sm ghost" data-act="kpi-del" data-i="${i}" title="삭제" aria-label="지표 삭제">✕</button></td>
    </tr>`;
  }).join("");
  return `<div class="tblwrap"><table class="tbl kpi">
      <thead><tr><th>ID</th><th>지표명</th><th>단계</th><th>연계목표</th><th>측정 방법</th><th>대상</th><th>목표</th><th>실적</th><th>단위</th><th>방향</th><th>달성률</th><th>판정</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

export function render() {
  const lm = state.logicModel, r = compute();
  const goals = lm.goals || [];
  const hasLm = hasProgramInfo(lm) || hasLogicModel(lm);
  const quick = quickKpis(r);
  const used = new Set(state.kpis.map(k => k.metric + "|" + k.name));

  return `
  <div class="page-head">
    <div><h2>성과지표 <span class="badge muted">선택</span></h2><p class="small muted">목표값을 정하면 달성률·판정이 자동 계산되어 보고서에 ‘성과지표 달성 현황’ 장이 추가됩니다. 지표가 없어도 분석·보고서는 그대로 만들어집니다.</p></div>
    <div class="row gap wrap"><button class="btn" data-act="goto" data-to="dash">건너뛰고 분석 결과 보기${icon("right", 16)}</button></div>
  </div>

  <section class="card">
    <div class="row between wrap">
      <h3 class="flush">빠른 추가</h3>
      <div class="row gap">${state.businessFound?.kpi ? `<span class="badge ok">엑셀 성과지표 시트 반영됨</span>` : ""}<button class="btn sm" data-act="kpi-add">+ 빈 지표 추가</button></div>
    </div>
    <div class="quick-kpis">${quick.map(qk => `<button class="chip-btn" data-act="kpi-quick" data-id="${qk.id}" ${used.has(qk.kpi.metric + "|" + qk.kpi.name) ? "disabled" : ""}>+ ${esc(qk.label)}</button>`).join("")}</div>
    <datalist id="targetList">${targetOptions().map(t => `<option value="${esc(t)}">`).join("")}</datalist>
    ${state.kpis.length ? kpiTable(r) : `<div class="empty-inline">${icon("chart", 22)}<div><b>아직 성과지표가 없습니다</b><p class="small muted">위의 ‘빠른 추가’를 누르면 이 설문 데이터로 바로 계산되는 지표가 들어갑니다. 목표값만 사업계획서에 맞게 고치면 됩니다.</p></div></div>`}
    ${r.evaluation ? `<p class="summary">종합: 측정 ${r.evaluation.summary.measured}개 중 <b>${r.evaluation.summary.achieved}개 달성</b>, ${r.evaluation.summary.mostly}개 대체로 달성, ${r.evaluation.summary.notAchieved}개 미달성 → 종합 <b>${esc(r.evaluation.summary.grade)}</b></p>` : ""}
    ${r.lint.length ? `<h3>연계 점검</h3><ul class="warnings">${r.lint.map(w => `<li>${levelBadge(w.level)} ${esc(w.msg)}</li>`).join("")}</ul>` : ""}
    <div class="metric-guide">
      <div class="metric-guide-head">${icon("help", 15)}측정 방법 안내</div>
      <div class="metric-guide-grid">${Object.values(METRICS).map(mm => `<div class="metric-guide-item"><b>${esc(mm.label)}</b>${mm.formula ? `<span class="muted">${esc(mm.formula)}</span>` : ""}</div>`).join("")}</div>
      <p class="format-help small muted">만족도는 반응(1단계) 지표입니다. 중기성과·영향은 사전·사후 변화, 향상자 비율 등 변화 지표나 행정 실적(직접 입력)을 권장합니다.</p>
    </div>
  </section>

  <section class="card">
    <div class="row between wrap">
      <h3 class="flush">사업정보 · 논리모형 <span class="badge muted">선택 · 고급</span>${hasLm ? ` <span class="badge ok">입력됨</span>` : ""}${state.businessFound?.business ? ` <span class="badge ok">엑셀 시트 반영</span>` : ""}${state.businessFound?.doc ? ` <span class="badge ok">문서에서 초안 반영 · 확인 필요</span>` : ""}</h3>
      <div class="rt-io-group" role="group" aria-label="사업정보·성과지표 저장·불러오기">
        <button class="rt-btn" data-act="save-preset" title="사업정보·지표 파일로 저장">${icon("download", 16)}사업정보·지표 파일로 저장</button>
        <div class="rt-sep" aria-hidden="true"></div>
        <label class="rt-btn" title="파일 불러오기">${icon("upload", 16)}파일 불러오기<input type="file" accept=".json" data-change="load-preset" hidden></label>
        <div class="rt-sep" aria-hidden="true"></div>
        <label class="rt-btn" title="문서에서 채우기(.hwpx)">${icon("doc", 16)}문서에서 채우기(.hwpx)<input type="file" accept=".hwpx" data-change="load-plan-doc" hidden></label>
      </div>
    </div>
    <p class="small muted">입력하면 보고서에 ‘사업 개요’와 ‘논리모형’ 표, 목표별 달성 평가가 추가됩니다. 몰라도 보고서 작성에는 문제없습니다.</p>
    <div class="grid3">
      ${FIELDS.map(([k, l]) => `<label class="field">${l}<input class="in" value="${esc(lm[k] || "")}" data-change="lm" data-field="${k}"></label>`).join("")}
    </div>
    <div class="grid2">
      <label class="field">추진배경<textarea class="in" rows="2" data-change="lm" data-field="background">${esc(lm.background)}</textarea></label>
      <label class="field">사업목적<textarea class="in" rows="2" data-change="lm" data-field="purpose">${esc(lm.purpose)}</textarea></label>
    </div>
    <label class="field">추진목표 <span class="muted small">(한 줄에 하나씩 · 성과지표의 ‘연계목표’로 선택할 수 있습니다)</span>
      <textarea class="in" rows="3" data-change="lm" data-field="goals">${esc(goals.map(g => g.text).join("\n"))}</textarea></label>
    <h3>논리모형 <span class="muted small">(각 칸에 한 줄에 하나씩 · 비워 둔 칸은 표에서 빠집니다)</span></h3>
    <div class="logic">
      ${LOGIC_STAGES.map((s, i) => `<label class="logic-col"><b>${s.label}</b><span class="muted small">${esc(s.hint)}</span>
        <textarea class="in" rows="5" data-change="lm-stage" data-stage="${s.key}">${esc((lm[s.key] || []).join("\n"))}</textarea></label>${i < LOGIC_STAGES.length - 1 ? `<span class="arrow">→</span>` : ""}`).join("")}
    </div>
  </section>

  <div class="row end gap"><button class="btn primary" data-act="goto" data-to="dash">다음: 분석 결과${icon("right", 16)}</button></div>`;
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
  "kpi-add": () => { state.kpis.push(newKpi(nextKpiNo())); invalidate(); refresh(); },
  "kpi-quick": el => {
    const qk = quickKpis(compute()).find(x => x.id === el.dataset.id);
    if (!qk) return;
    state.kpis.push({ ...newKpi(nextKpiNo()), ...qk.kpi });
    invalidate();
    toast(`‘${qk.kpi.name}’ 지표를 추가했습니다${qk.kpi.metric === "manual" ? " — 목표와 실적을 입력하세요" : " — 목표값을 사업계획에 맞게 고치세요"}`, "ok");
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
  "load-plan-doc": async el => {
    const f = el.files?.[0];
    el.value = "";
    if (!f) return;
    if (!/\.hwpx$/i.test(f.name)) { toast("HWPX(.hwpx) 파일만 지원합니다 — PDF는 추후 지원 예정", "bad"); return; }
    if (f.size > MAX_PLAN_DOC_MB * 1024 * 1024) { toast(`파일이 너무 큽니다(${MAX_PLAN_DOC_MB}MB 초과)`, "bad"); return; }
    busy(true, "문서에서 정보를 찾는 중…");
    await nextFrame();
    try {
      const bytes = await readFileBytes(f);
      const { paragraphs, tables } = await readHwpxText(bytes, { JSZip: window.JSZip, DOMParser: window.DOMParser });
      const draft = readBusinessFromHwpx({ paragraphs, tables });
      if (!draft.logicModel && !draft.kpis?.length) {
        toast("문서에서 사업정보를 찾지 못했습니다 — 직접 입력해 주세요", "bad", 5000);
        return;
      }
      const before = state.logicModel;
      state.logicModel = mergeIntoLogicModel(before, draft.logicModel);
      const filledFields = [...SCALAR_LM_KEYS, ...LOGIC_STAGES.map(s => s.key), "goals"].filter(k => !fieldFilled(before, k) && fieldFilled(state.logicModel, k)).length;
      let addedKpis = 0;
      if (draft.kpis?.length) {
        const base = nextKpiNo();
        const tagged = tagDraftKpis(draft.kpis).map((k, i) => ({ ...k, id: `K${base + i}` }));
        state.kpis.push(...tagged);
        addedKpis = tagged.length;
      }
      state.businessFound = { business: false, kpi: false, ...state.businessFound, doc: true };
      invalidate();
      toast(`문서에서 초안을 채웠습니다(사업정보 ${filledFields}항목, 지표 ${addedKpis}개) — 자동 추출은 틀릴 수 있으니 꼭 확인하세요`, "ok", 6000);
      refresh();
    } catch (e) {
      console.error(e);
      toast(e.message === "NOT_HWPX" ? "올바른 HWPX 파일이 아닙니다" : `문서를 읽지 못했습니다: ${e.message}`, "bad", 6000);
    } finally { busy(false); }
  },
};

const SCALAR_LM_KEYS = ["programName", "period", "budget", "target", "department", "purpose", "background"];
const fieldFilled = (lm, k) => (Array.isArray(lm[k]) ? lm[k].length > 0 : !!lm[k]);

const KPI_FIELDS = ["id", "name", "stage", "goalId", "metric", "targetRef", "target", "actual", "direction", "unit", "note"];
function pickKpi(k) {
  const o = {};
  for (const f of KPI_FIELDS) {
    if (k[f] === undefined) continue;
    o[f] = ["target", "actual"].includes(f) ? (k[f] === null || k[f] === "" ? null : Number(k[f])) : String(k[f]).slice(0, 200);
  }
  if (o.metric && !METRICS[o.metric]) o.metric = "manual";
  return o;
}
function nextKpiNo() {
  const nums = state.kpis.map(k => Number(String(k.id).replace(/\D/g, ""))).filter(Number.isFinite);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}
