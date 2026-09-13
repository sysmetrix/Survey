// 상관분석 (Pearson, Spearman) — 쌍별 완전 사례
import { mean, rank } from "./descriptive.js";
import { pt2 } from "./distributions.js";

function completePairs(x, y) {
  const a = [], b = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== null && y[i] !== null && Number.isFinite(x[i]) && Number.isFinite(y[i])) { a.push(x[i]); b.push(y[i]); }
  }
  return [a, b];
}

function rawPearson(a, b) {
  const n = a.length;
  if (n < 3) return null;
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  if (saa === 0 || sbb === 0) return { r: NaN, n, t: NaN, p: NaN };
  const r = Math.max(-1, Math.min(1, sab / Math.sqrt(saa * sbb)));
  const df = n - 2;
  const t = Math.abs(r) === 1 ? Infinity * Math.sign(r) : r * Math.sqrt(df / (1 - r * r));
  return { r, n, t, df, p: Math.abs(r) === 1 ? 0 : pt2(t, df) };
}

export function pearson(x, y) {
  const [a, b] = completePairs(x, y);
  const res = rawPearson(a, b);
  return res && { method: "Pearson", ...res };
}

export function spearman(x, y) {
  const [a, b] = completePairs(x, y);
  if (a.length < 3) return null;
  const res = rawPearson(rank(a).ranks, rank(b).ranks);
  return res && { method: "Spearman", ...res };
}

/** 상관행렬: cols = [{key, values}] */
export function corrMatrix(cols, method = "pearson") {
  const f = method === "spearman" ? spearman : pearson;
  return cols.map((ci, i) => cols.map((cj, j) => i === j ? { r: 1, n: ci.values.filter(v => v !== null).length, p: 0 } : (j < i ? null : f(ci.values, cj.values))))
    .map((row, i, M) => row.map((cell, j) => cell === null ? M[j][i] : cell));
}
