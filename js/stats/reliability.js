// 신뢰도: Cronbach α (목록별 완전 사례), 문항 제거 시 α, 수정 문항-총점 상관
import { variance, sum } from "./descriptive.js";
import { pearson } from "./correlation.js";
import { qf } from "./distributions.js";

/**
 * Cronbach α의 95% 신뢰구간 (Feldt, Woodruff & Salih 1987 — F분포 기반 정확식).
 * LL = 1 − (1−α)·F(0.975; n−1, (n−1)(k−1)), UL = 1 − (1−α)·F(0.025; n−1, (n−1)(k−1))
 */
export function alphaCi(alpha, n, k) {
  if (!Number.isFinite(alpha) || n < 2 || k < 2) return [NaN, NaN];
  const df1 = n - 1, df2 = (n - 1) * (k - 1);
  const lo = 1 - (1 - alpha) * qf(0.975, df1, df2);
  const hi = 1 - (1 - alpha) * qf(0.025, df1, df2);
  return [lo, hi];
}

/** items: [{name, values}] (values는 역코딩 반영된 숫자|null) */
export function cronbachAlpha(items) {
  const k = items.length;
  if (k < 2) return null;
  const n0 = items[0].values.length;
  const rows = [];
  for (let i = 0; i < n0; i++) {
    const r = items.map(it => it.values[i]);
    if (r.every(v => v !== null && Number.isFinite(v))) rows.push(r);
  }
  const n = rows.length;
  if (n < 3) return null;
  const alphaOf = cols => {
    const kk = cols.length;
    if (kk < 2) return NaN;
    const iv = sum(cols.map(j => variance(rows.map(r => r[j]))));
    const tv = variance(rows.map(r => sum(cols.map(j => r[j]))));
    return tv > 0 ? (kk / (kk - 1)) * (1 - iv / tv) : NaN;
  };
  const all = items.map((_, j) => j);
  const alpha = alphaOf(all);
  const itemStats = items.map((it, j) => {
    const rest = all.filter(x => x !== j);
    const restTotal = rows.map(r => sum(rest.map(x => r[x])));
    const rc = pearson(rows.map(r => r[j]), restTotal);
    return { name: it.name, rCorrected: rc ? rc.r : NaN, alphaIfDeleted: alphaOf(rest) };
  });
  return { alpha, alphaCi: alphaCi(alpha, n, k), n, k, items: itemStats };
}
