// 교차분석: 응답자 특성 집단별 척도 점수 차이 (Welch t / Welch ANOVA 기본, 비모수 병기)
import { describe } from "../stats/descriptive.js";
import { welchT } from "../stats/ttest.js";
import { welchAnova, oneWayAnova } from "../stats/anova.js";
import { gamesHowell } from "../stats/posthoc.js";
import { mannWhitney, kruskalWallis } from "../stats/nonparametric.js";
import { chiSquare, crosstab } from "../stats/categorical.js";
import { holm, benjaminiHochberg } from "../stats/adjust.js";
import { dLabel, etaLabel, vLabel } from "../stats/effectsize.js";
import { DEFAULT_THRESHOLDS } from "../narrative/vocab.js";
import { compositeScores, naturalOrder, score100 } from "./items.js";

/**
 * 집단 비교 1회.
 * @param {number} minN 이 인원 미만인 집단은 비교에서 제외
 * @param {number} smallN 비교는 하되, 집단 중 이 인원 미만이 있으면 결과에 smallGroupN 플래그를 붙여
 *   해석에 주의가 필요함을 표시(BMJ/Cochrane 소집단 분석 관행: 최소 10명 권장)
 */
export function compareGroups(groupVals, groupNames, { minN = 2, smallN = DEFAULT_THRESHOLDS.minGroupN } = {}) {
  const idx = groupVals.map((g, i) => i).filter(i => groupVals[i].length >= minN);
  const gs = idx.map(i => groupVals[i]), names = idx.map(i => groupNames[i]);
  const stats = groupNames.map((name, i) => ({ group: name, ...describe(groupVals[i]) }));
  if (gs.length < 2) return { stats, test: null };
  const smallGroupN = gs.some(g => g.length < smallN);
  if (gs.length === 2) {
    const t = welchT(gs[0], gs[1]);
    const mw = mannWhitney(gs[0], gs[1]);
    if (!t) return { stats, test: null, nonparam: mw, smallGroupN };
    return {
      stats, smallGroupN,
      test: { name: "Welch t", stat: t.t, statLabel: "t", df: t.df, p: t.p, ci: t.ci, effect: t.g, effectName: "g", effectLabel: dLabel(t.g) },
      nonparam: mw && { name: "Mann-Whitney", p: mw.p, stat: mw.W, effect: mw.rb, effectName: "r" },
    };
  }
  const w = welchAnova(gs), a = oneWayAnova(gs), kw = kruskalWallis(gs);
  const main = w || a;
  if (!main) return { stats, test: null, nonparam: kw, smallGroupN };
  const omega = a ? a.omegaSq : NaN;
  const res = {
    stats, smallGroupN,
    test: { name: w ? "Welch F" : "F", stat: main.F, statLabel: "F", df: [main.df1, main.df2], p: main.p, effect: omega, effectName: "ω²", effectLabel: etaLabel(omega) },
    classic: a && { F: a.F, df1: a.df1, df2: a.df2, p: a.p, etaSq: a.etaSq },
    nonparam: kw && { name: "Kruskal-Wallis", stat: kw.H, df: kw.df, p: kw.p },
  };
  if (main.p < 0.05) {
    const gh = gamesHowell(gs, names);
    res.posthocExcluded = gh.excluded;
    res.posthoc = gh.filter(x => x.p < 0.05);
  }
  return res;
}

/**
 * 응답자 특성 × 척도 문항/영역 교차분석
 * @param items  itemStats 결과
 * @param domainsRes domainStats 결과
 */
export function crossAnalysis(survey, items, domainsRes, { maxGroups = 12, minGroupN = 2, scoreBasis = "exact" } = {}) {
  const out = [];
  const totalComp = domainsRes?.total ? compositeScores(survey, survey.scales.filter(c => domainsRes.total.keys.includes(c.key))) : null;
  for (const demo of survey.demographics) {
    const g = survey.values(demo.key);
    const names = [...new Set(g.filter(x => x !== null))].sort(naturalOrder);
    if (names.length < 2 || names.length > maxGroups) continue;
    const groupsOf = values => names.map(nm => values.filter((v, i) => g[i] === nm && v !== null));
    const counts = names.map(nm => g.filter(x => x === nm).length);
    const rows = items.map(it => {
      const col = survey.scales.find(c => c.key === it.key);
      const vals = survey.values(it.key);
      const cmp = compareGroups(groupsOf(vals), names, { minN: minGroupN });
      const { min, max } = col.scale;
      cmp.stats.forEach(s => { s.score100 = score100(s.mean, min, max, scoreBasis); });
      return { key: it.key, label: it.label, ...cmp };
    });
    let total = null;
    if (totalComp) {
      const cmp = compareGroups(groupsOf(totalComp.map(x => (x === null ? null : x * 100))), names, { minN: minGroupN });
      total = { key: "ALL", label: "전체 만족도(100점)", ...cmp };
    }
    const ps = rows.map(r => r.test?.p ?? 1);
    const adj = holm(ps), adjBH = benjaminiHochberg(ps);
    rows.forEach((r, i) => { r.pHolm = r.test ? adj[i] : null; r.pBH = r.test ? adjBH[i] : null; });
    out.push({
      key: demo.key, label: demo.label, groups: names.map((nm, i) => ({ name: nm, n: counts[i] })),
      rows, total, significant: rows.filter(r => r.test && r.test.p < 0.05).map(r => r.key),
    });
  }
  return out;
}

/** 응답자 특성 간 χ² (예: 성별 × 학교급) */
export function demographicAssociations(survey) {
  const demos = survey.demographics;
  const res = [];
  for (let i = 0; i < demos.length; i++) for (let j = i + 1; j < demos.length; j++) {
    const ct = crosstab(survey.values(demos[i].key), survey.values(demos[j].key));
    if (ct.rows.length < 2 || ct.cols.length < 2 || ct.rows.length > 10 || ct.cols.length > 10) continue;
    const chi = chiSquare(ct.table);
    if (!chi) continue;
    res.push({ a: demos[i].label, b: demos[j].label, ...ct, ...chi, vLabel: vLabel(chi.V, Math.min(ct.rows.length, ct.cols.length) - 1) });
  }
  return res;
}
