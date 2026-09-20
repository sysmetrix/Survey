// 확률분포 함수 (순수 JS). 알고리즘 출처:
//  - lgamma: Lanczos 근사 (g=7, n=9)
//  - 불완전 베타: Numerical Recipes 연분수(Lentz) + 대칭 변환
//  - 불완전 감마: 급수(x<a+1) / 연분수(x≥a+1)
//  - qnorm: Acklam 근사 + Halley 1회 보정
//  - ptukey: Copenhaver & Holland (1988) 가우스-르장드르 적분

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const FPMIN = 1e-300;

function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** 정규화 불완전 베타 I_x(a,b) */
export function ibeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  if (x < (a + 1) / (a + b + 2)) return Math.exp(lbt) * betacf(a, b, x) / a;
  return 1 - Math.exp(lbt) * betacf(b, a, 1 - x) / b;
}

/** 정규화 불완전 감마 — {p: P(a,x), q: Q(a,x)} */
export function gammaPQ(a, x) {
  if (x <= 0) return { p: 0, q: 1 };
  const lpre = -x + a * Math.log(x) - lgamma(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 2000; n++) {
      ap++; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    const p = Math.min(1, sum * Math.exp(lpre));
    return { p, q: 1 - p };
  }
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 2000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  const q = Math.min(1, Math.exp(lpre) * h);
  return { p: 1 - q, q };
}

// ── 정규분포 ──
/** 표준정규 CDF (lower=true면 P(Z≤z)) */
export function pnorm(z, lower = true) {
  if (!Number.isFinite(z)) return (z > 0) === lower ? 1 : 0;
  const { q } = gammaPQ(0.5, z * z / 2); // P(|Z|>|z|)
  const upper = z >= 0 ? q / 2 : 1 - q / 2;
  return lower ? 1 - upper : upper;
}

const AQ = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const BQ = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
const CQ = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const DQ = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

/** 표준정규 분위수 */
export function qnorm(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const plow = 0.02425;
  let x;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((CQ[0] * q + CQ[1]) * q + CQ[2]) * q + CQ[3]) * q + CQ[4]) * q + CQ[5]) / ((((DQ[0] * q + DQ[1]) * q + DQ[2]) * q + DQ[3]) * q + 1);
  } else if (p <= 1 - plow) {
    const q = p - 0.5, r = q * q;
    x = (((((AQ[0] * r + AQ[1]) * r + AQ[2]) * r + AQ[3]) * r + AQ[4]) * r + AQ[5]) * q / (((((BQ[0] * r + BQ[1]) * r + BQ[2]) * r + BQ[3]) * r + BQ[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((CQ[0] * q + CQ[1]) * q + CQ[2]) * q + CQ[3]) * q + CQ[4]) * q + CQ[5]) / ((((DQ[0] * q + DQ[1]) * q + DQ[2]) * q + DQ[3]) * q + 1);
  }
  // Halley 보정
  for (let k = 0; k < 2; k++) {
    const e = pnorm(x) - p;
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
    x = x - u / (1 + x * u / 2);
  }
  return x;
}

// ── t, F, χ² ──
/** t분포 CDF */
export function pt(t, df, lower = true) {
  if (!Number.isFinite(t)) return (t > 0) === lower ? 1 : 0;
  if (df === Infinity) return pnorm(t, lower);
  const tail = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5); // P(T > |t|)
  const upper = t >= 0 ? tail : 1 - tail;
  return lower ? 1 - upper : upper;
}
/** 양측 p값 */
export const pt2 = (t, df) => Math.min(1, 2 * pt(-Math.abs(t), df));

/** F분포 상측확률 P(F > f) */
export function pfUpper(f, df1, df2) {
  if (!(f > 0)) return 1;
  if (!Number.isFinite(f)) return 0;
  return ibeta(df2 / (df2 + df1 * f), df2 / 2, df1 / 2);
}

/** χ² 상측확률 P(X > x) */
export function pchisqUpper(x, df) {
  if (!(x > 0)) return 1;
  return gammaPQ(df / 2, x / 2).q;
}

/** F분포 CDF P(F ≤ f) */
export function pf(f, df1, df2) {
  if (!(f > 0)) return 0;
  if (!Number.isFinite(f)) return 1;
  return 1 - pfUpper(f, df1, df2);
}

/** 단조증가 CDF의 역함수 (이분법) */
function invert(cdf, p, lo, hi) {
  if (!(p > 0 && p < 1)) return NaN;
  for (let k = 0; k < 60 && cdf(lo) > p; k++) lo = lo * 2 - 1;
  for (let k = 0; k < 60 && cdf(hi) < p; k++) hi = hi * 2 + 1;
  if (!(cdf(lo) <= p && cdf(hi) >= p)) return NaN; // 수렴 불가 (자유도 극단값 등)
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-12 * Math.max(1, Math.abs(mid))) break;
  }
  return (lo + hi) / 2;
}

/** t분포 분위수 */
export const qt = (p, df) => df === Infinity ? qnorm(p) : invert(t => pt(t, df), p, -10, 10);

// ── 스튜던트화 범위분포 (Tukey HSD) ──
const XLEG = [0.981560634246719250690549090149, 0.904117256370474856678465866119, 0.769902674194304687036893833213,
  0.587317954286617447296702418941, 0.367831498998180193752691536644, 0.125233408511468915472441369464];
const ALEG = [0.047175336386511827194615961485, 0.106939325995318430960254718194, 0.160078328543346226334652529543,
  0.203167426723065921749064455810, 0.233492536538354808760849898925, 0.249147045813402785000562436043];
const XLEGQ = [0.989400934991649932596154173450, 0.944575023073232576077988415535, 0.865631202387831743880467897712,
  0.755404408355003033895101194847, 0.617876244402643748446671764049, 0.458016777657227386342419442984,
  0.281603550779258913230460501460, 0.950125098376374401853193354250e-1];
const ALEGQ = [0.271524594117540948517805724560e-1, 0.622535239386478928628438369944e-1, 0.951585116824927848099251076022e-1,
  0.124628971255533872052476282192, 0.149595988816576732081501730547, 0.169156519395002538189312079030,
  0.182603415044923588866763667969, 0.189450610455068496285396723208];
const SQRT_2PI = Math.sqrt(2 * Math.PI);

function wprob(w, rr, cc) {
  const nleg = 12, ihalf = 6, C1 = -30, C2 = -50, C3 = 60, bb = 8, wlar = 3;
  const qsqz = w * 0.5;
  if (qsqz >= bb) return 1;
  let prW = 2 * pnorm(qsqz) - 1;
  prW = prW >= Math.exp(C2 / cc) ? Math.pow(prW, cc) : 0;
  const wincr = w > wlar ? 2 : 3;
  let blb = qsqz;
  const binc = (bb - qsqz) / wincr;
  let bub = blb + binc, einsum = 0;
  const cc1 = cc - 1;
  for (let wi = 1; wi <= wincr; wi++) {
    let elsum = 0;
    const a = 0.5 * (bub + blb), b = 0.5 * (bub - blb);
    for (let jj = 1; jj <= nleg; jj++) {
      let j, xx;
      if (ihalf < jj) { j = nleg - jj + 1; xx = XLEG[j - 1]; }
      else { j = jj; xx = -XLEG[j - 1]; }
      const ac = a + b * xx;
      const qexpo = ac * ac;
      if (qexpo > C3) break;
      const pplus = 2 * pnorm(ac), pminus = 2 * pnorm(ac - w);
      let rinsum = pplus * 0.5 - pminus * 0.5;
      if (rinsum >= Math.exp(C1 / cc1)) {
        rinsum = ALEG[j - 1] * Math.exp(-0.5 * qexpo) * Math.pow(rinsum, cc1);
        elsum += rinsum;
      }
    }
    elsum *= (2 * b * cc) / SQRT_2PI;
    einsum += elsum;
    blb = bub; bub += binc;
  }
  prW += einsum;
  if (prW <= Math.exp(C1 / rr)) return 0;
  prW = Math.pow(prW, rr);
  return prW >= 1 ? 1 : prW;
}

/** 스튜던트화 범위분포 CDF P(Q ≤ q), k=집단 수(cc), df=자유도 */
export function ptukey(q, cc, df, rr = 1) {
  if (!(q > 0)) return 0;
  if (!Number.isFinite(q)) return 1;
  if (!(df >= 2) || !(cc >= 2)) return NaN;
  if (df > 25000) return wprob(q, rr, cc);
  const f2 = df * 0.5;
  let f2lf = f2 * Math.log(df) - df * Math.LN2 - lgamma(f2);
  const f21 = f2 - 1, ff4 = df * 0.25;
  const ulen = df <= 100 ? 1 : df <= 800 ? 0.5 : df <= 5000 ? 0.25 : 0.125;
  f2lf += Math.log(ulen);
  let ans = 0, otsum = 0;
  for (let i = 1; i <= 50; i++) {
    otsum = 0;
    const twa1 = (2 * i - 1) * ulen;
    for (let jj = 1; jj <= 16; jj++) {
      let j, t1;
      if (8 < jj) {
        j = jj - 8 - 1;
        t1 = f2lf + f21 * Math.log(twa1 + XLEGQ[j] * ulen) - (XLEGQ[j] * ulen + twa1) * ff4;
      } else {
        j = jj - 1;
        t1 = f2lf + f21 * Math.log(twa1 - XLEGQ[j] * ulen) + (XLEGQ[j] * ulen - twa1) * ff4;
      }
      if (t1 >= -30) {
        const qsqz = 8 < jj ? q * Math.sqrt((XLEGQ[j] * ulen + twa1) * 0.5) : q * Math.sqrt((-(XLEGQ[j] * ulen) + twa1) * 0.5);
        otsum += wprob(qsqz, rr, cc) * ALEGQ[j] * Math.exp(t1);
      }
    }
    if (i * ulen >= 1 && otsum <= 1e-14) break;
    ans += otsum;
  }
  return Math.min(1, ans);
}

/** 스튜던트화 범위분포 분위수 */
export const qtukey = (p, cc, df) => invert(q => ptukey(q, cc, df), p, 0.01, 20);

/** F분포 분위수 */
export const qf = (p, df1, df2) => invert(f => pf(f, df1, df2), p, 1e-8, 10);
