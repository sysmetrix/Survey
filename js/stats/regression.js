// 다중회귀 (OLS) — 목록별 완전 사례
import { mean, sd } from "./descriptive.js";
import { pt2, pfUpper } from "./distributions.js";

function invert(M) {
  const k = M.length;
  const A = M.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c];
    if (Math.abs(d) < 1e-12) return null;
    for (let j = 0; j < 2 * k; j++) A[c][j] /= d;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f !== 0) for (let j = 0; j < 2 * k; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map(row => row.slice(k));
}

/**
 * y: 숫자|null 배열, xs: [{name, values}] — 결측 행 제외 후 추정
 * 반환: coef [{name, b, se, t, p, beta, vif}], r2, adjR2, F, df1, df2, pF, n
 */
export function ols(y, xs) {
  const rows = [];
  for (let i = 0; i < y.length; i++) {
    if (y[i] === null || !Number.isFinite(y[i])) continue;
    const xv = xs.map(x => x.values[i]);
    if (xv.some(v => v === null || !Number.isFinite(v))) continue;
    rows.push([y[i], ...xv]);
  }
  const n = rows.length, p = xs.length, k = p + 1;
  if (n <= k + 1) return null;
  const Y = rows.map(r => r[0]);
  const X = rows.map(r => [1, ...r.slice(1)]);
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, row) => s + row[i] * row[j], 0)));
  const XtY = Array.from({ length: k }, (_, i) => X.reduce((s, row, r) => s + row[i] * Y[r], 0));
  const inv = invert(XtX);
  if (!inv) return null;
  const b = inv.map(row => row.reduce((s, v, j) => s + v * XtY[j], 0));
  const yhat = X.map(row => row.reduce((s, v, j) => s + v * b[j], 0));
  const my = mean(Y);
  const ssr = Y.reduce((s, v, i) => s + (v - yhat[i]) ** 2, 0);
  const sst = Y.reduce((s, v) => s + (v - my) ** 2, 0);
  const df2 = n - k, mse = ssr / df2;
  const r2 = sst > 0 ? 1 - ssr / sst : 0;
  const F = p > 0 && r2 < 1 ? (r2 / p) / ((1 - r2) / df2) : NaN;
  const sdY = sd(Y);
  const xCols = xs.map((_, j) => rows.map(r => r[j + 1]));
  const coef = b.map((bj, j) => {
    const se = Math.sqrt(Math.abs(inv[j][j]) * mse);
    const t = se > 0 ? bj / se : NaN;
    const c = { name: j === 0 ? "(상수)" : xs[j - 1].name, b: bj, se, t, p: Number.isFinite(t) ? pt2(t, df2) : NaN };
    if (j > 0) {
      c.beta = sdY > 0 ? bj * sd(xCols[j - 1]) / sdY : NaN;
      c.vif = p > 1 ? vif(xCols, j - 1) : 1;
    }
    return c;
  });
  return { coef, r2, adjR2: 1 - (1 - r2) * (n - 1) / df2, F, df1: p, df2, pF: Number.isFinite(F) ? pfUpper(F, p, df2) : NaN, n };
}

function vif(xCols, j) {
  const others = xCols.filter((_, i) => i !== j).map((values, i) => ({ name: String(i), values }));
  const res = ols(xCols[j], others);
  return res && res.r2 < 1 ? 1 / (1 - res.r2) : Infinity;
}
