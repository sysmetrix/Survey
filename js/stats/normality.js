// Shapiro-Wilk 정규성 검정 — Royston (1995) Algorithm AS R94 (n = 3..5000)
import { qnorm, pnorm } from "./distributions.js";

const poly = (cc, x) => { let r = cc[0]; if (cc.length > 1) { let p = x * cc[cc.length - 1]; for (let j = cc.length - 2; j > 0; j--) p = (p + cc[j]) * x; r += p; } return r; };
const G = [-2.273, 0.459];
const C1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
const C2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
const C3 = [0.544, -0.39978, 0.025054, -6.714e-4];
const C4 = [1.3822, -0.77857, 0.062767, -0.0020322];
const C5 = [-1.5861, -0.31082, -0.083751, 0.0038915];
const C6 = [-0.4803, -0.082676, 0.0030302];

export function shapiroWilk(values) {
  const x = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = x.length;
  if (n < 3 || n > 5000) return null;
  const range = x[n - 1] - x[0];
  if (range < 1e-19) return null; // 모든 값 동일
  const nn2 = Math.floor(n / 2);
  const a = new Array(nn2 + 1).fill(0); // 1-based
  if (n === 3) {
    a[1] = Math.SQRT1_2;
  } else {
    const an25 = n + 0.25;
    const m = new Array(nn2 + 1).fill(0);
    let summ2 = 0;
    for (let i = 1; i <= nn2; i++) { m[i] = qnorm((i - 0.375) / an25); summ2 += m[i] * m[i]; }
    summ2 *= 2;
    const ssumm2 = Math.sqrt(summ2), rsn = 1 / Math.sqrt(n);
    const a1 = poly(C1, rsn) - m[1] / ssumm2;
    let i1, fac;
    if (n > 5) {
      i1 = 3;
      const a2 = -m[2] / ssumm2 + poly(C2, rsn);
      fac = Math.sqrt((summ2 - 2 * m[1] ** 2 - 2 * m[2] ** 2) / (1 - 2 * a1 ** 2 - 2 * a2 ** 2));
      a[2] = a2;
    } else {
      i1 = 2;
      fac = Math.sqrt((summ2 - 2 * m[1] ** 2) / (1 - 2 * a1 ** 2));
    }
    a[1] = a1;
    for (let i = i1; i <= nn2; i++) a[i] = -m[i] / fac;
  }
  // W 계산 (계수 벡터와 정렬값의 상관 제곱)
  let sa = 0, sx = 0;
  const coef = new Array(n).fill(0);
  for (let i = 0, j = n - 1; i < n; i++, j--) {
    if (i !== j) coef[i] = Math.sign(i - j) * a[1 + Math.min(i, j)];
  }
  for (let i = 0; i < n; i++) { sa += coef[i]; sx += x[i] / range; }
  sa /= n; sx /= n;
  let ssa = 0, ssx = 0, sax = 0;
  for (let i = 0; i < n; i++) {
    const asa = coef[i] - sa, xsx = x[i] / range - sx;
    ssa += asa * asa; ssx += xsx * xsx; sax += asa * xsx;
  }
  const ssassx = Math.sqrt(ssa * ssx);
  const w1 = (ssassx - sax) * (ssassx + sax) / (ssa * ssx);
  const W = 1 - w1;
  let p;
  if (n === 3) {
    p = Math.max(0, 1.90985931710274 * (Math.asin(Math.sqrt(W)) - 1.04719755119660));
  } else {
    let y = Math.log(w1);
    const xx = Math.log(n);
    let mu, s;
    if (n <= 11) {
      const gamma = poly(G, n);
      if (y >= gamma) return { W, p: 1e-99, n };
      y = -Math.log(gamma - y);
      mu = poly(C3, n); s = Math.exp(poly(C4, n));
    } else {
      mu = poly(C5, xx); s = Math.exp(poly(C6, xx));
    }
    p = pnorm((y - mu) / s, false);
  }
  return { test: "Shapiro-Wilk", W, p, n };
}
