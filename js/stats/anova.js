// 일원분산분석 (고전 F, Welch)
import { mean, variance, sum } from "./descriptive.js";
import { pfUpper } from "./distributions.js";

/** groups: 숫자 배열의 배열 (크기 < 1 인 집단은 호출 측에서 제외) */
export function oneWayAnova(groups) {
  const gs = groups.filter(g => g.length > 0);
  const k = gs.length, N = sum(gs.map(g => g.length));
  if (k < 2 || N - k < 1) return null;
  const grand = mean(gs.flat());
  const means = gs.map(mean), ns = gs.map(g => g.length);
  const ssb = sum(gs.map((g, i) => ns[i] * (means[i] - grand) ** 2));
  const ssw = sum(gs.map((g, i) => sum(g.map(v => (v - means[i]) ** 2))));
  const df1 = k - 1, df2 = N - k;
  const msb = ssb / df1, msw = ssw / df2;
  if (!(msw > 0)) return null;
  const F = msb / msw;
  const sst = ssb + ssw;
  return {
    test: "ANOVA", F, df1, df2, p: pfUpper(F, df1, df2), ssb, ssw, msb, msw, k, N, means, ns,
    etaSq: sst > 0 ? ssb / sst : 0,
    omegaSq: Math.max(0, (ssb - df1 * msw) / (sst + msw)),
  };
}

/** Welch 일원분산분석 (등분산 가정 없음) */
export function welchAnova(groups) {
  const gs = groups.filter(g => g.length > 1);
  const k = gs.length;
  if (k < 2) return null;
  const ns = gs.map(g => g.length), means = gs.map(mean), vars = gs.map(variance);
  if (vars.some(v => !(v > 0))) return null;
  const w = ns.map((n, i) => n / vars[i]);
  const W = sum(w);
  const mw = sum(w.map((wi, i) => wi * means[i])) / W;
  const A = sum(w.map((wi, i) => wi * (means[i] - mw) ** 2)) / (k - 1);
  const tmp = sum(w.map((wi, i) => (1 - wi / W) ** 2 / (ns[i] - 1)));
  const B = 1 + 2 * (k - 2) / (k * k - 1) * tmp;
  const F = A / B, df1 = k - 1, df2 = (k * k - 1) / (3 * tmp);
  return { test: "Welch ANOVA", F, df1, df2, p: pfUpper(F, df1, df2), k, means, ns };
}
