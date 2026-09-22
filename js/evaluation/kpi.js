// 성과지표(KPI) 정의·실적 산출·달성률·판정
import { mean } from "../stats/descriptive.js";
import { DEFAULT_THRESHOLDS, judgeWord } from "../narrative/vocab.js";
import { normKey } from "../model/detect.js";

export const METRICS = {
  manual: { label: "직접 입력(실적값)", unit: "", kind: "manual" },
  responseCount: { label: "응답자 수", unit: "명", kind: "survey" },
  mean: { label: "평균 점수", unit: "점", kind: "survey", formula: "문항 평균" },
  score100: { label: "만족도(100점 환산)", unit: "점", kind: "survey", formula: "(평균−최소)÷(최대−최소)×100" },
  top2: { label: "긍정응답률(Top2)", unit: "%", kind: "survey", formula: "상위 2개 응답 수÷유효응답×100" },
  nps: { label: "순추천지수(NPS)", unit: "점", kind: "survey", formula: "추천(9~10)%−비추천(0~6)%" },
  prepostDiff: { label: "사전·사후 변화량", unit: "점", kind: "prepost", formula: "사후 평균−사전 평균" },
  prepostDiff100: { label: "사전·사후 변화(100점 환산)", unit: "점", kind: "prepost", formula: "(사후−사전)÷(최대−최소)×100" },
  postScore100: { label: "사후 점수(100점 환산)", unit: "점", kind: "prepost", formula: "(사후 평균−최소)÷(최대−최소)×100" },
  changePct: { label: "사전 대비 향상률", unit: "%", kind: "prepost", formula: "(사후−사전)÷사전×100" },
  effectSize: { label: "효과크기(Cohen d)", unit: "", kind: "prepost", formula: "평균 변화÷차이점수 표준편차" },
  improvedRate: { label: "향상자 비율", unit: "%", kind: "prepost", formula: "사후 점수가 사전보다 높은 응답자÷매칭 응답자×100" },
};

/** 한국어 지표명 → 메트릭 키 (엑셀 성과지표 시트용) */
export function metricFromText(s) {
  const t = String(s ?? "").replace(/\s/g, "").toLowerCase();
  if (!t || /직접|수동|manual|실적/.test(t)) return "manual";
  if (/응답자수|응답수|참여자수/.test(t)) return "responseCount";
  if (/nps|순추천/.test(t)) return "nps";
  if (/top2|긍정응답|긍정비율/.test(t)) return "top2";
  if (/향상자|향상비율|개선자/.test(t)) return "improvedRate";
  if (/효과크기|cohen/.test(t)) return "effectSize";
  if (/향상률|증가율|변화율/.test(t)) return "changePct";
  if (/변화.*100|100.*변화/.test(t)) return "prepostDiff100";
  if (/변화|사전사후|차이/.test(t)) return "prepostDiff";
  if (/사후/.test(t)) return "postScore100";
  if (/100점|환산/.test(t)) return "score100";
  if (/평균/.test(t)) return "mean";
  return "manual";
}

export function newKpi(i = 1) {
  return { id: `K${i}`, name: "", stage: "단기성과", goalId: "", metric: "manual", targetRef: "", target: null, actual: null, prevActual: null, direction: "up", unit: "", note: "" };
}

/** 전년 실적 대비 목표가 지나치게 낮게(하향 지표는 지나치게 느슨하게) 잡혔는지 점검. 전년 실적을 입력하지 않으면 null */
export function targetAdequacy(target, prevActual, direction = "up", { minGrowthPct = 1 } = {}) {
  if (!Number.isFinite(target) || !Number.isFinite(prevActual)) return null;
  if (direction === "down") {
    return target > prevActual ? `목표(${target})가 전년 실적(${prevActual})보다 완화되어 있어 재검토가 필요합니다` : null;
  }
  if (target <= prevActual) return `목표(${target})가 전년 실적(${prevActual}) 이하로 설정되어 있어 재검토가 필요합니다`;
  const growthPct = (target - prevActual) / Math.abs(prevActual || 1) * 100;
  return growthPct < minGrowthPct ? `목표가 전년 실적 대비 ${growthPct.toFixed(1)}%만 상향되어 있어 목표 설정이 소극적인지 검토가 필요합니다` : null;
}

/**
 * 대상 참조 해석: "전체" | 영역명 | 문항명(쉼표 구분)
 * @returns {{type:'all'|'domain'|'items'|'overall', ids:string[], label:string, missing:string[]}}
 */
export function resolveTarget(ref, codebook) {
  const text = String(ref ?? "").trim();
  if (!text || /^(전체|모든|all)/i.test(text)) return { type: "all", ids: [], label: "전체 문항", missing: [] };
  const dom = codebook.domains.find(d => normKey(d.name) === normKey(text));
  if (dom) return { type: "domain", ids: [dom.id], label: dom.name, missing: [] };
  const names = text.split(/[,，;]/).map(s => s.trim()).filter(Boolean);
  const ids = [], missing = [];
  names.forEach(nm => {
    const k = normKey(nm);
    const cand = codebook.columns.filter(c => ["likert", "nps"].includes(c.role));
    let hits = cand.filter(c => normKey(c.label) === k || normKey(c.header) === k || c.pairKey === k);
    if (!hits.length) hits = cand.filter(c => normKey(c.label).includes(k) || c.pairKey?.includes(k));
    if (hits.length) hits.forEach(c => ids.push(c.key)); else missing.push(nm);
  });
  return { type: "items", ids, label: names.join(", "), missing };
}

const unique = a => [...new Set(a)];

/** KPI 실적 계산 → {value, n, facts} 또는 {error} */
export function kpiActual(kpi, analysis, codebook) {
  const m = METRICS[kpi.metric] || METRICS.manual;
  if (m.kind === "manual") {
    const v = kpi.actual === null || kpi.actual === "" ? NaN : Number(kpi.actual);
    return Number.isFinite(v) ? { value: v, facts: "직접 입력한 실적값" } : { error: "실적값 미입력" };
  }
  if (kpi.metric === "responseCount") return { value: analysis.meta.n, n: analysis.meta.n, facts: `유효 응답자 수 n=${analysis.meta.n}` };
  const tgt = resolveTarget(kpi.targetRef, codebook);
  if (tgt.missing.length) return { error: `대상 문항을 찾을 수 없음: ${tgt.missing.join(", ")}` };

  if (m.kind === "survey") {
    if (kpi.metric === "nps") {
      const list = tgt.type === "items" ? analysis.nps.filter(x => tgt.ids.includes(x.key)) : analysis.nps;
      if (!list.length) return { error: "NPS 문항 없음" };
      return { value: mean(list.map(x => x.nps)), n: list[0].n, facts: `${list.map(x => x.label).join(", ")} (n=${list[0].n})` };
    }
    let items;
    if (tgt.type === "all") items = analysis.items.filter(it => !it.isOverall);
    else if (tgt.type === "domain") items = analysis.items.filter(it => it.domain === tgt.ids[0]);
    else items = analysis.items.filter(it => tgt.ids.includes(it.key));
    if (!items.length) return { error: "대상 만족도 문항 없음 (사전·사후 문항은 변화 지표를 사용)" };
    const vals = items.map(it => it[kpi.metric]);
    const n = Math.min(...items.map(it => it.n));
    return { value: mean(vals), n, facts: `${items.length === 1 ? items[0].label : `${tgt.label} ${items.length}개 문항 평균`} (n=${n}, ${m.formula})` };
  }

  // 사전·사후
  const pp = analysis.prepost;
  if (!pp) return { error: "사전·사후 자료 없음" };
  let src;
  if (tgt.type === "all") src = pp.domains.find(d => d.id === "ALL") || (pp.items.length === 1 ? pp.items[0] : null);
  else if (tgt.type === "domain") src = pp.domains.find(d => d.id === tgt.ids[0]);
  else {
    const its = pp.items.filter(it => tgt.ids.includes(it.pre) || tgt.ids.includes(it.post));
    if (its.length === 1) src = its[0];
    else if (its.length > 1) src = { label: tgt.label, n: Math.min(...its.map(x => x.n)), ...Object.fromEntries(["diff", "diff100", "score100Post", "changePct", "dz", "improvedPct"].map(k => [k, mean(its.map(x => x[k]))])) };
  }
  if (!src) return { error: "대상 사전·사후 문항 없음" };
  const map = { prepostDiff: "diff", prepostDiff100: "diff100", postScore100: "score100Post", changePct: "changePct", effectSize: "dz", improvedRate: "improvedPct" };
  const value = src[map[kpi.metric]];
  if (!Number.isFinite(value)) return { error: "산출 불가 (비매칭 자료는 효과크기·향상자 비율 불가)" };
  return { value, n: src.n, facts: `${src.label || src.name} (매칭 n=${src.n}, ${m.formula})`, p: src.primary?.p };
}

/** 달성률 */
export function achievementRate(actual, target, direction = "up") {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return NaN;
  if (direction === "down") {
    if (target === 0) return actual <= 0 ? 100 : 0;
    return 100 - (actual - target) * 100 / Math.abs(target);
  }
  if (target === 0) return actual >= 0 ? 100 : 0;
  return actual * 100 / target;
}

export function evaluateKpis(kpis, analysis, codebook, thresholds = DEFAULT_THRESHOLDS) {
  const results = (kpis || []).map(k => {
    const target = k.target === null || k.target === "" ? NaN : Number(k.target);
    const a = kpiActual(k, analysis, codebook);
    const unit = k.unit || METRICS[k.metric]?.unit || "";
    if (a.error) return { ...k, unit, targetValue: target, actualValue: NaN, rate: NaN, judgment: "측정 불가", error: a.error };
    const rate = achievementRate(a.value, target, k.direction);
    const targetCaution = targetAdequacy(target, k.prevActual === null || k.prevActual === "" ? NaN : Number(k.prevActual), k.direction);
    return { ...k, unit, targetValue: target, actualValue: a.value, n: a.n, p: a.p, facts: a.facts, rate, targetCaution, judgment: Number.isFinite(target) ? judgeWord(rate, thresholds) : "목표 미설정", error: Number.isFinite(target) ? null : "목표값 미입력" };
  });
  const measured = results.filter(r => Number.isFinite(r.rate));
  const achieved = measured.filter(r => r.judgment === "달성").length;
  const mostly = measured.filter(r => r.judgment === "대체로 달성").length;
  // 종합: 달성 1, 대체로 달성 0.5 가중
  const ratio = measured.length ? (achieved + 0.5 * mostly) / measured.length * 100 : NaN;
  const grade = !measured.length ? "평가 불가" : ratio >= thresholds.overallGood ? "우수" : ratio >= thresholds.overallFair ? "보통" : "미흡";
  return {
    results,
    summary: {
      total: results.length, measured: measured.length, achieved, mostly, notAchieved: measured.length - achieved - mostly,
      unmeasured: results.length - measured.length, achievedRatio: ratio,
      avgRate: measured.length ? mean(measured.map(r => Math.min(r.rate, 150))) : NaN, grade,
      byStage: ["산출", "단기성과", "중기성과", "영향"].map(st => ({ stage: st, total: results.filter(r => r.stage === st).length, achieved: results.filter(r => r.stage === st && r.judgment === "달성").length })).filter(s => s.total),
    },
  };
}

export { unique };
