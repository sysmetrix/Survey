// 사후검정: Tukey HSD (등분산), Games-Howell (이분산)
import { mean, variance, sum } from "./descriptive.js";
import { ptukey, qtukey } from "./distributions.js";

/** R TukeyHSD 와 동일한 쌍 순서/부호: (j − i), i<j */
export function tukeyHSD(groups, labels) {
  const k = groups.length, ns = groups.map(g => g.length), means = groups.map(mean);
  const N = sum(ns), df = N - k;
  if (k < 2 || df < 1) return [];
  const msw = sum(groups.map((g, i) => sum(g.map(v => (v - means[i]) ** 2)))) / df;
  if (!(msw > 0)) return [];
  const qc = qtukey(0.95, k, df);
  const out = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    const diff = means[j] - means[i];
    const se = Math.sqrt(msw / 2 * (1 / ns[i] + 1 / ns[j]));
    const q = Math.abs(diff) / se;
    out.push({ g1: labels[j], g2: labels[i], diff, lwr: diff - qc * se, upr: diff + qc * se, q, p: Math.max(0, 1 - ptukey(q, k, df)) });
  }
  return out;
}

export function gamesHowell(groups, labels) {
  const k = groups.length, ns = groups.map(g => g.length), means = groups.map(mean), vars = groups.map(variance);
  const out = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    const a = vars[i] / ns[i], b = vars[j] / ns[j];
    if (!(a + b > 0) || ns[i] < 2 || ns[j] < 2) continue;
    const diff = means[j] - means[i];
    const se = Math.sqrt((a + b) / 2);
    const df = (a + b) ** 2 / (a * a / (ns[i] - 1) + b * b / (ns[j] - 1));
    if (!(df >= 2)) continue;
    const q = Math.abs(diff) / se;
    const qc = qtukey(0.95, k, df);
    out.push({ g1: labels[j], g2: labels[i], diff, lwr: diff - qc * se, upr: diff + qc * se, q, df, p: Math.max(0, 1 - ptukey(q, k, df)) });
  }
  return out;
}
