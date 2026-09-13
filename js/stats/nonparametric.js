// 비모수 검정: Mann-Whitney U, Wilcoxon 부호순위, Kruskal-Wallis (R wilcox.test/kruskal.test 규칙 준수)
import { rank, sum } from "./descriptive.js";
import { pnorm, pchisqUpper } from "./distributions.js";

/** 정확분포 누적확률: counts[k] 경우의 수 배열 → P(X ≤ q) */
function cdfFromCounts(counts, q) {
  const total = sum(counts);
  let c = 0;
  for (let k = 0; k <= Math.min(q, counts.length - 1); k++) c += counts[k];
  return q < 0 ? 0 : c / total;
}

/** Mann-Whitney U 통계량 분포 (m, n): ∏(1−q^{n+i})/(1−q^i) */
function wilcoxCounts(m, n) {
  const maxU = m * n;
  let poly = new Float64Array(maxU + 1); poly[0] = 1;
  for (let i = 1; i <= m; i++) {
    const shift = n + i;
    for (let k = maxU; k >= shift; k--) poly[k] -= poly[k - shift];
    for (let k = i; k <= maxU; k++) poly[k] += poly[k - i];
  }
  return Array.from(poly, v => Math.round(v));
}

/** 부호순위 통계량 분포: ∏(1+q^i) */
function signrankCounts(n) {
  const maxV = n * (n + 1) / 2;
  const poly = new Float64Array(maxV + 1); poly[0] = 1;
  for (let i = 1; i <= n; i++) for (let k = maxV; k >= i; k--) poly[k] += poly[k - i];
  return Array.from(poly);
}

/** 독립 2집단 (x vs y). W = x 순위합 − n1(n1+1)/2 */
export function mannWhitney(x, y) {
  const n1 = x.length, n2 = y.length;
  if (n1 < 1 || n2 < 1) return null;
  const { ranks, ties } = rank([...x, ...y]);
  const W = sum(ranks.slice(0, n1)) - n1 * (n1 + 1) / 2;
  const N = n1 + n2;
  let p, z, exact = false;
  if (n1 < 50 && n2 < 50 && ties.length === 0) {
    exact = true;
    const counts = wilcoxCounts(n1, n2);
    const pl = cdfFromCounts(counts, W), pu = 1 - cdfFromCounts(counts, W - 1);
    p = Math.min(1, 2 * Math.min(pl, pu));
    z = (W - n1 * n2 / 2) / Math.sqrt(n1 * n2 * (N + 1) / 12);
  } else {
    const tieAdj = sum(ties.map(t => t ** 3 - t)) / (N * (N - 1));
    const sigma = Math.sqrt((n1 * n2 / 12) * ((N + 1) - tieAdj));
    const zc = W - n1 * n2 / 2;
    if (sigma === 0) return { test: "Mann-Whitney U", W, U: W, p: 1, z: 0, r: 0, exact, n1, n2 };
    z = (zc - Math.sign(zc) * 0.5) / sigma;
    p = Math.min(1, 2 * Math.min(pnorm(z), pnorm(z, false)));
  }
  return { test: "Mann-Whitney U", W, U: W, p, z, r: Math.abs(z) / Math.sqrt(N), exact, n1, n2 };
}

/** 대응 2시점 Wilcoxon 부호순위 (d = post − pre). 0 차이는 제외 */
export function wilcoxonSignedRank(pre, post) {
  const d = [];
  for (let i = 0; i < pre.length; i++) {
    const a = pre[i], b = post[i];
    if (a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b)) d.push(b - a);
  }
  const nAll = d.length;
  const nz = d.filter(v => v !== 0);
  const n = nz.length;
  if (n < 1) return { test: "Wilcoxon 부호순위", V: 0, p: 1, z: 0, r: 0, n: nAll, nNonZero: 0, exact: false };
  const { ranks, ties } = rank(nz.map(Math.abs));
  const V = sum(ranks.filter((_, i) => nz[i] > 0));
  let p, z, exact = false;
  if (n < 50 && ties.length === 0 && n === nAll) {
    exact = true;
    const counts = signrankCounts(n);
    const pl = cdfFromCounts(counts, V), pu = 1 - cdfFromCounts(counts, V - 1);
    p = Math.min(1, 2 * Math.min(pl, pu));
    z = (V - n * (n + 1) / 4) / Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);
  } else {
    const zc = V - n * (n + 1) / 4;
    const sigma = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - sum(ties.map(t => t ** 3 - t)) / 48);
    if (sigma === 0) return { test: "Wilcoxon 부호순위", V, p: 1, z: 0, r: 0, n: nAll, nNonZero: n, exact };
    z = (zc - Math.sign(zc) * 0.5) / sigma;
    p = Math.min(1, 2 * Math.min(pnorm(z), pnorm(z, false)));
  }
  return { test: "Wilcoxon 부호순위", V, p, z, r: Math.abs(z) / Math.sqrt(n), n: nAll, nNonZero: n, exact };
}

/** Kruskal-Wallis (동점 보정) */
export function kruskalWallis(groups) {
  const gs = groups.filter(g => g.length > 0);
  const k = gs.length;
  if (k < 2) return null;
  const all = gs.flat(), N = all.length;
  const { ranks, ties } = rank(all);
  let off = 0, s = 0;
  gs.forEach(g => { const R = sum(ranks.slice(off, off + g.length)); s += R * R / g.length; off += g.length; });
  let H = 12 / (N * (N + 1)) * s - 3 * (N + 1);
  const corr = 1 - sum(ties.map(t => t ** 3 - t)) / (N ** 3 - N);
  if (corr > 0) H /= corr;
  const df = k - 1;
  return { test: "Kruskal-Wallis", H, df, p: pchisqUpper(H, df), N, epsSq: N > 1 ? H / (N - 1) : NaN };
}
