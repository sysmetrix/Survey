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

const factorial = n => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };

/** Heap's algorithm: arr(0..n-1)의 모든 순열을 생성(제자리 교환, 매 회 복사본을 내어줌) */
function* permutations(arr) {
  const n = arr.length, c = new Array(n).fill(0);
  yield arr.slice();
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      if (i % 2 === 0) [arr[0], arr[i]] = [arr[i], arr[0]];
      else [arr[c[i]], arr[i]] = [arr[i], arr[c[i]]];
      yield arr.slice();
      c[i]++; i = 0;
    } else { c[i] = 0; i++; }
  }
}

/** n<10·동점 없음 전용 Spearman 정확 양측 p값 — 전수 순열(n!)로 |rho| ≥ |관측 rho| 비율 계산 */
function spearmanExactP(rObs, n) {
  const base = Array.from({ length: n }, (_, i) => i);
  const denom = n * (n * n - 1);
  const target = Math.abs(rObs) - 1e-9;
  let count = 0;
  for (const perm of permutations(base)) {
    let D = 0;
    for (let i = 0; i < n; i++) { const d = i - perm[i]; D += d * d; }
    const rho = 1 - 6 * D / denom;
    if (Math.abs(rho) >= target) count++;
  }
  return count / factorial(n);
}

/**
 * Spearman 순위상관. n<10·동점 없음이면 전수 순열로 정확 양측 p값 산출(계산량이 작아 안전),
 * 그 외(동점 있음 또는 n≥10)는 t근사 유지. R은 10≤n<1290 에서 AS89(Best & Roberts 1975) 근사를
 * 쓰지만, 이 저장소는 R 대조 검증 환경이 없어 특수 수치 알고리즘을 검증 없이 이식하지 않기로 함
 * — t근사도 여러 통계 소프트웨어(SPSS 등)가 함께 쓰는 표준적인 방법임.
 */
export function spearman(x, y) {
  const [a, b] = completePairs(x, y);
  const n = a.length;
  if (n < 3) return null;
  const ra = rank(a), rb = rank(b);
  const res = rawPearson(ra.ranks, rb.ranks);
  if (!res) return null;
  const exact = ra.ties.length === 0 && rb.ties.length === 0 && n < 10 && Number.isFinite(res.r);
  return { method: "Spearman", ...res, p: exact ? spearmanExactP(res.r, n) : res.p, exact };
}

/** 상관행렬: cols = [{key, values}] */
export function corrMatrix(cols, method = "pearson") {
  const f = method === "spearman" ? spearman : pearson;
  return cols.map((ci, i) => cols.map((cj, j) => i === j ? { r: 1, n: ci.values.filter(v => v !== null).length, p: 0 } : (j < i ? null : f(ci.values, cj.values))))
    .map((row, i, M) => row.map((cell, j) => cell === null ? M[j][i] : cell));
}
