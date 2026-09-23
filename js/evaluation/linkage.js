// 논리모형–성과지표 연계 검증 (목표·지표 정합성, 측정 타당성)
import { METRICS, resolveTarget } from "./kpi.js";
import { DEFAULT_THRESHOLDS } from "../narrative/vocab.js";

const SATISFACTION = new Set(["mean", "score100", "top2", "nps"]);

/**
 * @returns {{level:'error'|'warn'|'info', msg:string, kpiId?:string}[]}
 */
export function lintEvaluation(logicModel, kpis, codebook, analysis = null, t = DEFAULT_THRESHOLDS) {
  const out = [];
  const goals = logicModel?.goals || [];
  kpis = kpis || [];
  goals.forEach(g => { if (!kpis.some(k => k.goalId === g.id)) out.push({ level: "warn", msg: `추진목표 '${g.text}'에 연결된 성과지표가 없습니다.` }); });
  if (logicModel?.activities?.length && !kpis.some(k => k.stage === "산출")) out.push({ level: "info", msg: "활동은 있으나 산출 지표(운영 횟수·참여 인원 등)가 없습니다." });
  if (kpis.length && !kpis.some(k => k.stage !== "산출")) out.push({ level: "warn", msg: "성과(단기·중기) 지표가 없어 사업 효과를 판단하기 어렵습니다." });

  kpis.forEach(k => {
    const nm = k.name || k.id;
    if (!k.name) out.push({ level: "error", kpiId: k.id, msg: `${k.id}: 지표명이 없습니다.` });
    if (goals.length && !k.goalId) out.push({ level: "info", kpiId: k.id, msg: `'${nm}': 연계 목표가 지정되지 않았습니다.` });
    if (k.goalId && goals.length && !goals.some(g => g.id === k.goalId)) out.push({ level: "warn", kpiId: k.id, msg: `'${nm}': 연계 목표 ${k.goalId}가 논리모형에 없습니다.` });
    if (k.target != null && k.target !== "" && !Number.isFinite(Number(k.target))) out.push({ level: "error", kpiId: k.id, msg: `'${nm}': 목표값은 유효한 숫자여야 합니다.` });
    const m = METRICS[k.metric];
    if (!m) { out.push({ level: "error", kpiId: k.id, msg: `'${nm}': 알 수 없는 측정 방식입니다.` }); return; }
    if (k.metric === "manual" && (k.actual === null || k.actual === "")) out.push({ level: "warn", kpiId: k.id, msg: `'${nm}': 실적값을 입력해야 합니다.` });
    if (["중기성과", "영향"].includes(k.stage) && SATISFACTION.has(k.metric)) out.push({ level: "warn", kpiId: k.id, msg: `'${nm}': 만족도는 반응(Kirkpatrick 1단계) 지표로, ${k.stage} 측정에는 사전·사후 변화 등 성과 지표가 적합합니다.` });
    if (k.stage === "단기성과" && SATISFACTION.has(k.metric)) out.push({ level: "info", kpiId: k.id, msg: `'${nm}': 만족도를 성과지표로 사용 중입니다. 역량·태도 변화(사전·사후) 지표를 함께 두면 성과 입증력이 높아집니다.` });
    if (m.kind === "prepost" && codebook && codebook.design === "single") out.push({ level: "error", kpiId: k.id, msg: `'${nm}': 사전·사후 지표이나 단일 시점 자료입니다.` });
    if (m.kind !== "manual" && codebook && k.metric !== "responseCount") {
      const r = resolveTarget(k.targetRef, codebook);
      if (r.missing.length) out.push({ level: "error", kpiId: k.id, msg: `'${nm}': 대상 문항을 찾을 수 없습니다 (${r.missing.join(", ")}).` });
    }
    if (m.kind === "prepost" && analysis?.prepost) {
      if (analysis.prepost.unpaired) out.push({ level: "warn", kpiId: k.id, msg: `'${nm}': 사전·사후 응답자가 매칭되지 않아 동일인 변화로 해석할 수 없습니다.` });
      else if (analysis.prepost.matchedN < t.minN) out.push({ level: "info", kpiId: k.id, msg: `'${nm}': 매칭 응답자 ${analysis.prepost.matchedN}명으로 표본이 작습니다.` });
    }
  });
  if (analysis) {
    analysis.domains.filter(d => d.alpha !== null && d.alpha < t.lowAlpha).forEach(d => out.push({ level: "info", msg: `영역 '${d.name}'의 신뢰도(α=${d.alpha.toFixed(2)})가 낮아 영역 점수 해석에 주의가 필요합니다.` }));
  }
  return out;
}
