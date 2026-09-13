// 문항·영역·신뢰도·NPS·복수응답·응답자 특성 분석
import { describe, frequency, mean } from "../stats/descriptive.js";
import { cronbachAlpha } from "../stats/reliability.js";

export const score100 = (m, min, max) => (Number.isFinite(m) && max > min ? (m - min) / (max - min) * 100 : NaN);

/** 척도 문항 1개 요약 */
export function itemStats(survey, col) {
  const { values, missing, invalid } = survey.column(col.key);
  const v = values.filter(x => x !== null);
  const { min, max } = col.scale;
  const d = describe(v);
  const levels = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const freq = frequency(v, levels);
  const topMin = max - 1, bottomMax = min + 1; // Top2 / Bottom2
  const top2 = v.length ? v.filter(x => x >= topMin).length / v.length * 100 : NaN;
  const bottom2 = v.length ? v.filter(x => x <= bottomMax).length / v.length * 100 : NaN;
  const mid = (min + max) / 2;
  return {
    key: col.key, label: col.label, header: col.header, domain: col.domain, reverse: col.reverse, isOverall: col.isOverall,
    ...d, obsMin: d.min, obsMax: d.max, min, max, // min/max = 척도 범위 (관측값은 obsMin/obsMax)
    score100: score100(d.mean, min, max), top2, bottom2,
    neutral: Number.isInteger(mid) && v.length ? v.filter(x => x === mid).length / v.length * 100 : 0,
    freq, missing, invalid, nTotal: survey.n,
  };
}

/** 응답자별 영역(또는 전체) 점수: 응답 문항 비율 minAnswered 이상일 때 평균 */
export function compositeScores(survey, cols, minAnswered = 0.5) {
  const mats = cols.map(c => {
    const { values } = survey.column(c.key);
    const { min, max } = c.scale;
    return values.map(x => (x === null ? null : (x - min) / (max - min))); // 0~1 정규화 후 평균 (척도 혼합 대비)
  });
  const need = Math.max(1, Math.ceil(cols.length * minAnswered));
  const out = [];
  for (let i = 0; i < survey.n; i++) {
    const v = mats.map(m => m[i]).filter(x => x !== null);
    out.push(v.length >= need ? mean(v) : null);
  }
  return out; // 0~1
}

/** 영역별 요약 (영역 미지정 문항은 "전체"로만 집계) */
export function domainStats(survey, items) {
  const scaleCols = survey.scales;
  const groups = [];
  (survey.domains || []).forEach(d => {
    const cols = scaleCols.filter(c => c.domain === d.id);
    if (cols.length) groups.push({ id: d.id, name: d.name, cols });
  });
  const summarize = (id, name, cols) => {
    const comp = compositeScores(survey, cols).filter(x => x !== null);
    const its = items.filter(it => cols.some(c => c.key === it.key));
    const rel = cols.length >= 2 ? cronbachAlpha(cols.map(c => ({ name: c.label, values: survey.values(c.key) }))) : null;
    const d = describe(comp.map(x => x * 100));
    return {
      id, name, keys: cols.map(c => c.key), nItems: cols.length, n: d.n,
      score100: d.mean, sd100: d.sd,
      mean: mean(its.map(it => it.mean)), // 문항 평균의 평균 (원척도)
      top2: mean(its.map(it => it.top2)),
      alpha: rel?.alpha ?? null, reliability: rel,
    };
  };
  const out = groups.map(g => summarize(g.id, g.name, g.cols));
  const all = scaleCols.filter(c => !c.isOverall);
  const total = all.length ? summarize("ALL", "전체 문항", all.length >= 1 ? all : scaleCols) : null;
  return { domains: out, total };
}

/** NPS (0~10) */
export function npsStats(survey, col) {
  const v = survey.values(col.key).filter(x => x !== null);
  const n = v.length;
  const pro = v.filter(x => x >= 9).length, pas = v.filter(x => x >= 7 && x <= 8).length, det = v.filter(x => x <= 6).length;
  return {
    key: col.key, label: col.label, n, mean: mean(v),
    promoters: n ? pro / n * 100 : NaN, passives: n ? pas / n * 100 : NaN, detractors: n ? det / n * 100 : NaN,
    nps: n ? (pro - det) / n * 100 : NaN,
    freq: frequency(v, Array.from({ length: 11 }, (_, i) => i)),
  };
}

/** 복수응답 (분모: 해당 문항 응답자) */
export function multiStats(survey, col) {
  const { options, matrix, answered } = survey.column(col.key);
  const opts = options.map((o, i) => {
    const cnt = matrix[i].filter(x => x === 1).length;
    return { option: o, n: cnt, pct: answered ? cnt / answered * 100 : 0 };
  }).sort((a, b) => b.n - a.n);
  return { key: col.key, label: col.label, answered, options: opts, totalSelections: opts.reduce((s, o) => s + o.n, 0) };
}

/** 응답자 특성 빈도 */
export function respondentProfile(survey, col) {
  const v = survey.values(col.key);
  const valid = v.filter(x => x !== null);
  const counts = new Map();
  valid.forEach(x => counts.set(x, (counts.get(x) || 0) + 1));
  const levels = [...counts.entries()].map(([value, n]) => ({ value, n, pct: n / survey.n * 100 }));
  levels.sort((a, b) => naturalOrder(a.value, b.value));
  return { key: col.key, label: col.label, n: survey.n, valid: valid.length, missing: survey.n - valid.length, levels };
}

const ORDER_HINTS = ["초", "중", "고", "대", "남", "여"];
/** "중1 < 중2 < 고1", "초등 < 중등 < 고등", "10대 < 20대" 등 자연 정렬 */
export function naturalOrder(a, b) {
  const sa = String(a), sb = String(b);
  const ia = ORDER_HINTS.findIndex(h => sa.startsWith(h)), ib = ORDER_HINTS.findIndex(h => sb.startsWith(h));
  if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
  const na = sa.match(/\d+/), nb = sb.match(/\d+/);
  if (na && nb && +na[0] !== +nb[0]) return +na[0] - +nb[0];
  return sa.localeCompare(sb, "ko");
}
