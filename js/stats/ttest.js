// t 검정 (Welch 독립표본, 대응표본, 단일표본)
import { mean, variance } from "./descriptive.js";
import { pt2, qt } from "./distributions.js";
import { dCiIndependent, dzCiPaired } from "./effectsize.js";

/** Welch 독립표본 t (x − y). 분산이 0(퇴화)이면 null 대신 판정 가능한 결과를 반환(대응표본 t와 동일 원칙) */
export function welchT(x, y) {
  const n1 = x.length, n2 = y.length;
  if (n1 < 2 || n2 < 2) return null;
  const m1 = mean(x), m2 = mean(y), v1 = variance(x), v2 = variance(y);
  const se2 = v1 / n1 + v2 / n2;
  const diff = m1 - m2;
  if (!(se2 > 0)) {
    return { test: "Welch t", t: NaN, df: n1 + n2 - 2, p: diff === 0 ? 1 : 0, n1, n2, m1, m2, sd1: 0, sd2: 0, diff, ci: [diff, diff], d: NaN, g: NaN, dCi: [NaN, NaN], gCi: [NaN, NaN] };
  }
  const se = Math.sqrt(se2);
  const t = diff / se;
  const df = se2 ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  const tc = qt(0.975, df);
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const d = sp > 0 ? diff / sp : 0;
  const J = 1 - 3 / (4 * (n1 + n2) - 9); // Hedges 보정
  return {
    test: "Welch t", t, df, p: pt2(t, df), n1, n2, m1, m2, sd1: Math.sqrt(v1), sd2: Math.sqrt(v2),
    diff, ci: [diff - tc * se, diff + tc * se], d, g: d * J, dCi: dCiIndependent(d, n1, n2), gCi: dCiIndependent(d, n1, n2).map(x => x * J),
  };
}

/**
 * 대응표본 t (post − pre). pre/post 는 같은 길이 배열, null 쌍은 제외.
 * d_z = 평균차/차이 SD, d_av = 평균차/((SD_pre+SD_post)/2)
 */
export function pairedT(pre, post) {
  const pairs = [];
  for (let i = 0; i < pre.length; i++) {
    const a = pre[i], b = post[i];
    if (a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b)) pairs.push([a, b]);
  }
  const n = pairs.length;
  if (n < 2) return null;
  const A = pairs.map(p => p[0]), B = pairs.map(p => p[1]);
  const D = pairs.map(p => p[1] - p[0]);
  const md = mean(D), vd = variance(D);
  const sdPre = Math.sqrt(variance(A)), sdPost = Math.sqrt(variance(B));
  if (!(vd > 0)) {
    return { test: "대응표본 t", n, mPre: mean(A), mPost: mean(B), sdPre, sdPost, diff: md, sdDiff: 0, t: NaN, df: n - 1, p: md === 0 ? 1 : 0, ci: [md, md], dz: NaN, dzCi: [NaN, NaN], dav: sdPre + sdPost > 0 ? md / ((sdPre + sdPost) / 2) : NaN, diffs: D };
  }
  const se = Math.sqrt(vd / n), t = md / se, df = n - 1, tc = qt(0.975, df);
  const sAv = (sdPre + sdPost) / 2;
  const dz = md / Math.sqrt(vd);
  return {
    test: "대응표본 t", n, mPre: mean(A), mPost: mean(B), sdPre, sdPost, diff: md, sdDiff: Math.sqrt(vd),
    t, df, p: pt2(t, df), ci: [md - tc * se, md + tc * se], dz, dzCi: dzCiPaired(dz, n), dav: sAv > 0 ? md / sAv : NaN, diffs: D,
  };
}

/** 단일표본 t. 분산이 0(퇴화)이면 null 대신 판정 가능한 결과를 반환(대응표본 t와 동일 원칙) */
export function oneSampleT(x, mu = 0) {
  const n = x.length;
  if (n < 2) return null;
  const m = mean(x), v = variance(x);
  if (!(v > 0)) return { test: "단일표본 t", n, mean: m, t: NaN, df: n - 1, p: m === mu ? 1 : 0, ci: [m, m], d: NaN };
  const se = Math.sqrt(v / n), t = (m - mu) / se, df = n - 1, tc = qt(0.975, df);
  return { test: "단일표본 t", n, mean: m, t, df, p: pt2(t, df), ci: [m - tc * se, m + tc * se], d: (m - mu) / Math.sqrt(v) };
}
