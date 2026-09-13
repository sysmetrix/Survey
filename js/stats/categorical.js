// 범주형 분석: 교차표, χ² 독립성 검정, Fisher 정확검정(2×2)
import { lgamma, pchisqUpper } from "./distributions.js";

/** 두 범주 배열 → 교차표 (null 제외). rowLevels/colLevels 지정 가능 */
export function crosstab(rowVals, colVals, rowLevels, colLevels) {
  const pairs = [];
  for (let i = 0; i < rowVals.length; i++) {
    const r = rowVals[i], c = colVals[i];
    if (r !== null && r !== undefined && r !== "" && c !== null && c !== undefined && c !== "") pairs.push([String(r), String(c)]);
  }
  const rows = rowLevels || [...new Set(pairs.map(p => p[0]))];
  const cols = colLevels || [...new Set(pairs.map(p => p[1]))];
  const table = rows.map(() => cols.map(() => 0));
  pairs.forEach(([r, c]) => { const i = rows.indexOf(r), j = cols.indexOf(c); if (i >= 0 && j >= 0) table[i][j]++; });
  return { rows, cols, table };
}

/** Pearson χ² (연속성 보정 없음) */
export function chiSquare(table) {
  // 합계가 0인 행/열 제거
  let t = table.filter(r => r.some(v => v > 0));
  const keepCols = t[0] ? t[0].map((_, j) => t.some(r => r[j] > 0)) : [];
  t = t.map(r => r.filter((_, j) => keepCols[j]));
  const R = t.length, C = t[0]?.length || 0;
  if (R < 2 || C < 2) return null;
  const rowT = t.map(r => r.reduce((s, v) => s + v, 0));
  const colT = t[0].map((_, j) => t.reduce((s, r) => s + r[j], 0));
  const N = rowT.reduce((s, v) => s + v, 0);
  let chi2 = 0, low = 0;
  const expected = t.map((r, i) => r.map((o, j) => {
    const e = rowT[i] * colT[j] / N;
    if (e < 5) low++;
    chi2 += (o - e) ** 2 / e;
    return e;
  }));
  const df = (R - 1) * (C - 1);
  const V = Math.sqrt(chi2 / (N * (Math.min(R, C) - 1)));
  const out = { test: "χ²", chi2, df, p: pchisqUpper(chi2, df), N, expected, V, lowExpected: low, lowExpectedPct: low / (R * C) * 100 };
  if (R === 2 && C === 2) out.fisher = fisherExact2x2(t[0][0], t[0][1], t[1][0], t[1][1]);
  return out;
}

const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

/** Fisher 정확검정 (2×2, 양측 — R fisher.test 와 동일 규칙) */
export function fisherExact2x2(a, b, c, d) {
  const r1 = a + b, r2 = c + d, c1 = a + c, N = r1 + r2;
  const lo = Math.max(0, c1 - r2), hi = Math.min(r1, c1);
  const dens = x => Math.exp(lchoose(r1, x) + lchoose(r2, c1 - x) - lchoose(N, c1));
  const pObs = dens(a);
  let p = 0;
  for (let x = lo; x <= hi; x++) { const px = dens(x); if (px <= pObs * (1 + 1e-7)) p += px; }
  return { test: "Fisher", p: Math.min(1, p) };
}
