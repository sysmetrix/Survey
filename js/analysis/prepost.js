// 사전·사후 성과 변화 분석
import { mean, describe } from "../stats/descriptive.js";
import { pairedT, welchT } from "../stats/ttest.js";
import { wilcoxonSignedRank, mannWhitney } from "../stats/nonparametric.js";
import { shapiroWilk } from "../stats/normality.js";
import { dLabel, rLabel } from "../stats/effectsize.js";
import { rawColumn } from "../model/codebook.js";
import { recodeColumn } from "../model/recode.js";

/**
 * 대응 자료 검정 자동 선택
 *  n ≥ 30 → 대응표본 t / n < 30 → 차이점수 Shapiro-Wilk p<.05 이면 Wilcoxon, 아니면 대응표본 t
 */
export function pairedComparison(pre, post, { min, max }) {
  const pt = pairedT(pre, post);
  const wx = wilcoxonSignedRank(pre, post);
  if (!pt) return null;
  const n = pt.n;
  const sw = n >= 3 && n < 30 ? shapiroWilk(pt.diffs) : null;
  const useW = n < 30 && sw && sw.p < 0.05;
  const improved = pt.diffs.filter(d => d > 0).length, same = pt.diffs.filter(d => d === 0).length, worse = pt.diffs.filter(d => d < 0).length;
  const range = max - min;
  const hake = mean(pt.diffs.map((d, i) => { return null; }).filter(Boolean)); // placeholder 제거용
  const pairsArr = [];
  for (let i = 0; i < pre.length; i++) if (pre[i] !== null && post[i] !== null) pairsArr.push([pre[i], post[i]]);
  const gains = pairsArr.filter(([a]) => max - a > 0).map(([a, b]) => (b - a) / (max - a));
  const primary = useW
    ? { name: "Wilcoxon 부호순위", stat: wx.V, statLabel: "V", z: wx.z, p: wx.p, effect: wx.r, effectName: "r", effectLabel: rLabel(wx.r) }
    : { name: "대응표본 t", stat: pt.t, statLabel: "t", df: pt.df, p: pt.p, effect: pt.dz, effectName: "d", effectLabel: dLabel(pt.dz) };
  return {
    n, mPre: pt.mPre, mPost: pt.mPost, sdPre: pt.sdPre, sdPost: pt.sdPost, diff: pt.diff, ci: pt.ci,
    score100Pre: (pt.mPre - min) / range * 100, score100Post: (pt.mPost - min) / range * 100, diff100: pt.diff / range * 100,
    changePct: pt.mPre ? pt.diff / pt.mPre * 100 : NaN,
    dz: pt.dz, dav: pt.dav, primary, rule: useW ? "n<30 & 차이점수 비정규(Shapiro-Wilk p<.05)" : n < 30 ? "n<30 & 정규성 기각 안 됨" : "n≥30",
    pairedT: { t: pt.t, df: pt.df, p: pt.p }, wilcoxon: { V: wx.V, z: wx.z, p: wx.p, r: wx.r },
    shapiro: sw ? { W: sw.W, p: sw.p } : null,
    improved, same, worse, improvedPct: improved / n * 100, worsePct: worse / n * 100,
    hakeG: gains.length ? mean(gains) : NaN,
    unused: hake,
  };
}

/** 비매칭(독립) 사전·사후 비교 — 동일인 비교 아님 */
export function unpairedComparison(pre, post, { min, max }) {
  const a = pre.filter(x => x !== null), b = post.filter(x => x !== null);
  const t = welchT(b, a), mw = mannWhitney(b, a);
  if (!t) return null;
  const range = max - min;
  return {
    unpaired: true, nPre: a.length, nPost: b.length, n: Math.min(a.length, b.length),
    mPre: t.m2, mPost: t.m1, sdPre: t.sd2, sdPost: t.sd1, diff: t.diff, ci: t.ci,
    score100Pre: (t.m2 - min) / range * 100, score100Post: (t.m1 - min) / range * 100, diff100: t.diff / range * 100,
    changePct: t.m2 ? t.diff / t.m2 * 100 : NaN,
    primary: { name: "Welch t (비매칭)", stat: t.t, statLabel: "t", df: t.df, p: t.p, effect: t.g, effectName: "g", effectLabel: dLabel(t.g) },
    mannWhitney: mw && { W: mw.W, p: mw.p },
  };
}

/** 사전·사후 전체 분석: 문항 짝 + 영역(짝 문항 평균) */
export function prepostAnalysis(survey) {
  if (survey.design === "single" || !survey.pairs.length) return null;
  const cb = survey.codebook;
  const colOf = k => cb.columns.find(c => c.key === k);
  const matchedN = survey.design === "prepost-sheets" ? survey.matching.pairs.length : survey.n;
  const useUnpaired = survey.design === "prepost-sheets" && matchedN < 5;

  // 비매칭용 원자료 전체 (사전 시트 전체 응답)
  const fullValues = key => { const col = colOf(key); return recodeColumn(col, rawColumn(survey.dataset, col)).values; };

  const items = survey.pairs.map(p => {
    const col = colOf(p.post);
    const scale = col.scale || { min: 0, max: 10 };
    const res = useUnpaired ? unpairedComparison(fullValues(p.pre), fullValues(p.post), scale) : pairedComparison(p.preValues, p.postValues, scale);
    return res && { pairKey: p.pairKey, label: p.label, domain: p.domain, pre: p.pre, post: p.post, scale, ...res };
  }).filter(Boolean);

  // 영역 점수 (짝 문항의 응답자별 평균, 원척도)
  const domains = [];
  const domainIds = [...new Set(survey.pairs.map(p => p.domain).filter(Boolean))];
  const groupDefs = domainIds.map(id => ({ id, name: cb.domains.find(d => d.id === id)?.name || id, pairs: survey.pairs.filter(p => p.domain === id) }));
  if (survey.pairs.length >= 2) groupDefs.push({ id: "ALL", name: "전체", pairs: survey.pairs });
  for (const g of groupDefs) {
    if (useUnpaired || g.pairs.length < 1) continue;
    const scale = colOf(g.pairs[0].post).scale || { min: 0, max: 10 };
    const avgOf = side => Array.from({ length: survey.n }, (_, i) => {
      const v = g.pairs.map(p => p[side][i]).filter(x => x !== null);
      return v.length >= Math.ceil(g.pairs.length / 2) ? mean(v) : null;
    });
    const res = pairedComparison(avgOf("preValues"), avgOf("postValues"), scale);
    if (res) domains.push({ id: g.id, name: g.name, nItems: g.pairs.length, scale, ...res });
  }

  return {
    design: survey.design, matchedN, unpaired: useUnpaired,
    retrospective: survey.design === "retrospective",
    matching: survey.matching && {
      pairs: survey.matching.pairs.length, preOnly: survey.matching.preOnly.length, postOnly: survey.matching.postOnly.length,
      dupPre: survey.matching.dupPre, dupPost: survey.matching.dupPost, candidates: survey.matching.candidates.length, keyDesc: survey.matching.keyDesc,
    },
    items, domains,
    significantItems: items.filter(it => it.primary.p < 0.05 && it.diff > 0).length,
  };
}

export { describe };
