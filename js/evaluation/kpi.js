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
  numericMean: { label: "연속형 수치 평균", unit: "", kind: "survey", formula: "유효 응답값의 산술평균(원점수)" },
  numericMedian: { label: "연속형 수치 중앙값", unit: "", kind: "survey", formula: "유효 응답값을 크기순으로 놓은 가운데 값(원점수)" },
  numericSum: { label: "연속형 수치 합계", unit: "", kind: "survey", formula: "유효 응답값의 합계(원점수)" },
  numericAboveRate: { label: "기준값 이상 비율", unit: "%", kind: "survey", formula: "입력한 기준값 이상 응답자÷유효 응답자×100" },
  numericPrepostDiff: { label: "사전·사후 수치 변화량", unit: "", kind: "prepost", formula: "사후 평균−사전 평균(원점수)" },
};

/** 한국어 지표명 → 메트릭 키 (엑셀 성과지표 시트용) */
export function metricFromText(s) {
  const t = String(s ?? "").replace(/\s/g, "").toLowerCase();
  if (!t || /직접|수동|manual|실적/.test(t)) return "manual";
  if (/응답자수|응답수/.test(t)) return "responseCount";
  if (/연속형.*중앙|수치.*중앙/.test(t)) return "numericMedian";
  if (/연속형.*합계|수치.*합계/.test(t)) return "numericSum";
  if (/기준.*이상.*비율|이상.*비율/.test(t)) return "numericAboveRate";
  if (/연속형.*변화|수치.*변화/.test(t)) return "numericPrepostDiff";
  if (/연속형.*평균|수치.*평균/.test(t)) return "numericMean";
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
  return { id: `K${i}`, name: "", stage: "단기성과", goalId: "", metric: "manual", targetRef: "", sourceThreshold: null, target: null, actual: null, prevActual: null, direction: "up", unit: "", note: "" };
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
  if (text.startsWith("@item:")) {
    const column = codebook.columns.find(c => c.key === text.slice(6));
    return { type:"items", ids:column ? [column.key] : [], label:column?.label || text, missing:column ? [] : [text] };
  }
  if (text.startsWith("@domain:")) {
    const domain = codebook.domains.find(d => d.id === text.slice(8));
    return { type:"domain", ids:domain ? [domain.id] : [], label:domain?.name || text, missing:domain ? [] : [text] };
  }
  if (!text || /^(전체|모든|all)/i.test(text)) return { type: "all", ids: [], label: "전체 문항", missing: [] };
  const dom = codebook.domains.find(d => normKey(d.name) === normKey(text));
  if (dom) return { type: "domain", ids: [dom.id], label: dom.name, missing: [] };
  const names = text.split(/[,，;]/).map(s => s.trim()).filter(Boolean);
  const ids = [], missing = [];
  names.forEach(nm => {
    const k = normKey(nm);
    const cand = codebook.columns.filter(c => ["likert", "nps", "numeric"].includes(c.role));
    let hits = cand.filter(c => normKey(c.label) === k || normKey(c.header) === k || c.pairKey === k);
    if (!hits.length) hits = cand.filter(c => normKey(c.label).includes(k) || c.pairKey?.includes(k));
    const logicalItems = new Set(hits.map(c => c.pairKey || c.key));
    if (logicalItems.size > 1) missing.push(`${nm} (동일·유사 문항명 여러 개: 문항을 직접 선택하세요)`);
    else if (hits.length) hits.forEach(c => ids.push(c.key)); else missing.push(nm);
  });
  return { type: "items", ids, label: names.join(", "), missing };
}

const unique = a => [...new Set(a)];

/** KPI 실적 계산 → {value, n, facts} 또는 {error} */
export function kpiActual(kpi, analysis, codebook) {
  const m = METRICS[kpi.metric] || METRICS.manual;
  if (kpi.requireTarget && m.kind !== "manual" && kpi.metric !== "responseCount" && !kpi.targetRef) return { error: "측정할 문항·영역을 선택하세요." };
  if (m.kind === "manual") {
    const v = kpi.actual === null || kpi.actual === "" ? NaN : Number(kpi.actual);
    return Number.isFinite(v) ? { value: v, facts: "직접 입력한 실적값" } : { error: "실적값 미입력" };
  }
  if (kpi.metric === "responseCount") return { value: analysis.meta.n, n: analysis.meta.n, facts: `유효 응답자 수 n=${analysis.meta.n}` };
  const tgt = resolveTarget(kpi.targetRef, codebook);
  if (tgt.missing.length) return { error: `대상 문항을 찾을 수 없음: ${tgt.missing.join(", ")}` };

  if (m.kind === "survey") {
    if (["numericMean", "numericMedian", "numericSum", "numericAboveRate"].includes(kpi.metric)) {
      if (tgt.type !== "items" || tgt.ids.length !== 1) return { error: "연속형 수치 지표는 숫자 문항 하나를 선택하세요." };
      const item = (analysis.numerics || []).find(x => x.key === tgt.ids[0]);
      if (!item) return { error: "선택한 문항은 연속형 수치 문항이 아닙니다." };
      if (kpi.metric === "numericAboveRate") {
        if (kpi.sourceThreshold === null || kpi.sourceThreshold === undefined || kpi.sourceThreshold === "") return { error: "계산 기준값을 입력하세요." };
        const threshold = Number(kpi.sourceThreshold);
        if (!Number.isFinite(threshold)) return { error: "계산 기준값을 숫자로 입력하세요." };
        return { value: item.n ? item.values.filter(v => v >= threshold).length / item.n * 100 : NaN, n: item.n, facts: `${item.label} (n=${item.n}, ${threshold} 이상)` };
      }
      const map = { numericMean: "mean", numericMedian: "median", numericSum: "total" };
      return { value: item[map[kpi.metric]], n: item.n, facts: `${item.label} (n=${item.n}, ${m.formula})` };
    }
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
  const relevantKeys = new Set(tgt.type === "all" ? (pp.scopeKeys || codebook.columns.map(c => c.key)) : tgt.type === "domain" ? codebook.columns.filter(c => c.domain === tgt.ids[0] && (!pp.scopeKeys || pp.scopeKeys.includes(c.key))).map(c => c.key) : tgt.ids);
  const blocking = (pp.qualityIssues || []).filter(issue => issue.keys?.some(key => relevantKeys.has(key)));
  if (blocking.length) return { error: `계산 불가: ${blocking.map(issue => issue.msg).join(" · ")}` };
  let src;
  if (kpi.metric === "numericPrepostDiff") {
    if (tgt.type !== "items" || tgt.ids.length !== 1) return { error: "사전·사후 수치 변화는 연결된 숫자 문항 하나를 선택하세요." };
    src = (pp.numericItems || []).find(it => tgt.ids.includes(it.pre) || tgt.ids.includes(it.post));
  } else if (tgt.type === "all") src = pp.domains.find(d => d.id === "ALL") || (pp.items.length === 1 ? pp.items[0] : null);
  else if (tgt.type === "domain") src = pp.domains.find(d => d.id === tgt.ids[0]);
  else {
    const its = pp.items.filter(it => tgt.ids.includes(it.pre) || tgt.ids.includes(it.post));
    const count = new Set(codebook.columns.filter(c=>tgt.ids.includes(c.key)).map(c=>c.pairKey || c.key)).size;
    if (count > 1) { const composite = pp.composite?.(tgt.ids); if (composite) src = { ...composite, label: `${count}개 문항 합성점수` }; }
    else if (its.length === 1) src = its[0];
  }
  if (!src) return { error: "대상 사전·사후 문항 없음" };
  const map = { prepostDiff: "diff", prepostDiff100: "diff100", postScore100: "score100Post", changePct: "changePct", effectSize: "dz", improvedRate: "improvedPct", numericPrepostDiff: "diff" };
  const value = src[map[kpi.metric]];
  if (!Number.isFinite(value)) return { error: "산출 불가 (비매칭 자료는 효과크기·향상자 비율 불가)" };
  return { value, n: src.n, facts: `${src.label || src.name} (매칭 n=${src.n}, ${m.formula})`, p: src.primary?.p };
}

/** 달성률 */
export function achievementRate(actual, target, direction = "up") {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return NaN;
  if (target <= 0) return NaN;
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
    const criterion = Number.isFinite(target) && target <= 0;
    const judgment = criterion ? ((k.direction === "down" ? a.value <= target : a.value >= target) ? "달성" : "미달성") : Number.isFinite(target) ? judgeWord(rate, thresholds) : "목표 미설정";
    return { ...k, unit, targetValue: target, actualValue: a.value, n: a.n, p: a.p, facts: a.facts, rate, targetCaution, judgment, calculationVersion: "2", criterion, error: null };
  });
  const measured = results.filter(r => Number.isFinite(r.rate) || r.criterion);
  const achieved = measured.filter(r => r.judgment === "달성").length;
  const mostly = measured.filter(r => r.judgment === "대체로 달성").length;
  // 종합: 달성 1, 대체로 달성 0.5 가중
  const ratio = measured.length ? (achieved + 0.5 * mostly) / measured.length * 100 : NaN;
  const grade = !measured.length ? "평가 불가" : ratio >= thresholds.overallGood ? "우수" : ratio >= thresholds.overallFair ? "보통" : "미흡";
  return {
    results,
    summary: {
      total: results.length, measured: measured.length, achieved, mostly, notAchieved: measured.length - achieved - mostly,
      unmeasured: results.filter(r => r.error).length, unsetTarget: results.filter(r => r.judgment === "목표 미설정").length, achievedRatio: ratio,
      avgRate: mean(measured.filter(r => Number.isFinite(r.rate)).map(r => Math.min(r.rate, 150))), grade,
      byStage: ["산출", "단기성과", "중기성과", "영향"].map(st => ({ stage: st, total: results.filter(r => r.stage === st).length, achieved: results.filter(r => r.stage === st && r.judgment === "달성").length })).filter(s => s.total),
    },
  };
}

export { unique };
