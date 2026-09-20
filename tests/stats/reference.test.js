// R 공식 문서/예제 출력값과 대조 (R 4.x): t.test, wilcox.test, aov, oneway.test, kruskal.test,
// TukeyHSD, cor, lm, shapiro.test, chisq.test, fisher.test, pt/qt/qnorm/pf/ptukey
import test from "node:test";
import assert from "node:assert/strict";
import * as D from "../../js/stats/distributions.js";
import { welchT, pairedT } from "../../js/stats/ttest.js";
import { oneWayAnova, welchAnova } from "../../js/stats/anova.js";
import { tukeyHSD, gamesHowell } from "../../js/stats/posthoc.js";
import { wilcoxonSignedRank, kruskalWallis, mannWhitney } from "../../js/stats/nonparametric.js";
import { shapiroWilk } from "../../js/stats/normality.js";
import { chiSquare, fisherExact2x2 } from "../../js/stats/categorical.js";
import { pearson, spearman } from "../../js/stats/correlation.js";
import { ols } from "../../js/stats/regression.js";
import { holm, benjaminiHochberg } from "../../js/stats/adjust.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b}`);

const sleep1 = [0.7, -1.6, -0.2, -1.2, -0.1, 3.4, 3.7, 0.8, 0.0, 2.0];
const sleep2 = [1.9, 0.8, 1.1, 0.1, -0.1, 4.4, 5.5, 1.6, 4.6, 3.4];
const ctrl = [4.17, 5.58, 5.18, 6.11, 4.50, 4.61, 5.17, 4.53, 5.33, 5.14];
const trt1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69];
const trt2 = [6.31, 5.12, 5.54, 5.50, 5.37, 5.29, 4.92, 6.15, 5.80, 5.26];
const mpg = [21.0, 21.0, 22.8, 21.4, 18.7, 18.1, 14.3, 24.4, 22.8, 19.2, 17.8, 16.4, 17.3, 15.2, 10.4, 10.4, 14.7, 32.4, 30.4, 33.9, 21.5, 15.5, 15.2, 13.3, 19.2, 27.3, 26.0, 30.4, 15.8, 19.7, 15.0, 21.4];
const wt = [2.620, 2.875, 2.320, 3.215, 3.440, 3.460, 3.570, 3.190, 3.150, 3.440, 3.440, 4.070, 3.730, 3.780, 5.250, 5.424, 5.345, 2.200, 1.615, 1.835, 2.465, 3.520, 3.435, 3.840, 3.845, 1.935, 2.140, 1.513, 3.170, 2.770, 3.570, 2.780];

test("분포 함수", () => {
  near(D.pt(2, 10), 0.9633062, 1e-6, "pt(2,10)");
  near(D.qt(0.975, 10), 2.228139, 1e-5, "qt(.975,10)");
  near(D.qnorm(0.975), 1.959964, 1e-6, "qnorm(.975)");
  near(D.pnorm(-1.959964), 0.025, 1e-6, "pnorm");
  near(D.pchisqUpper(3.841459, 1), 0.05, 1e-6, "pchisq");
  near(D.pfUpper(3, 2, 10), Math.pow(1.6, -5), 1e-9, "pf(3;2,10)");
  near(Math.exp(D.lgamma(6)), 120, 1e-9, "gamma(6)");
});

test("ptukey: k=2 는 t분포 항등식, qtukey(.95,3,10)=3.877", () => {
  for (const [q, df] of [[3, 10], [2, 30], [4.5, 5]]) {
    near(D.ptukey(q, 2, df), 1 - 2 * D.pt(-q / Math.SQRT2, df), 2e-6, `ptukey(${q},2,${df})`);
  }
  near(D.qtukey(0.95, 3, 10), 3.877676, 2e-3, "qtukey(.95,3,10)");
});

test("sleep: Welch t, 대응 t, Wilcoxon 대응", () => {
  const w = welchT(sleep1, sleep2);
  near(w.t, -1.8608, 1e-4, "welch t"); near(w.df, 17.776, 1e-3, "welch df"); near(w.p, 0.07939, 1e-5, "welch p");
  const p = pairedT(sleep2, sleep1); // post=sleep1 − pre=sleep2 → R t.test(x=g1,y=g2,paired)
  near(p.t, -4.0621, 1e-4, "paired t"); near(p.p, 0.002833, 1e-6, "paired p");
  const wx = wilcoxonSignedRank(sleep2, sleep1); // d = g1 − g2
  assert.equal(wx.V, 0); near(wx.p, 0.009091, 1e-6, "wilcoxon p");
});

test("PlantGrowth: ANOVA, Welch, Kruskal, Tukey", () => {
  const a = oneWayAnova([ctrl, trt1, trt2]);
  near(a.F, 4.846, 1e-3, "F"); near(a.p, 0.01591, 1e-5, "p");
  const w = welchAnova([ctrl, trt1, trt2]);
  near(w.F, 5.181, 1e-3, "Welch F"); near(w.df2, 17.128, 1e-3, "Welch df2"); near(w.p, 0.01739, 1e-5, "Welch p");
  const k = kruskalWallis([ctrl, trt1, trt2]);
  near(k.H, 7.9882, 1e-4, "H"); near(k.p, 0.01842, 1e-5, "KW p");
  const t = tukeyHSD([ctrl, trt1, trt2], ["ctrl", "trt1", "trt2"]);
  near(t[0].diff, -0.371, 1e-9, "trt1-ctrl diff"); near(t[0].p, 0.3908711, 1e-4, "trt1-ctrl p");
  near(t[0].lwr, -1.0622161, 1e-3, "lwr");
  near(t[1].p, 0.1979960, 1e-4, "trt2-ctrl p"); near(t[2].p, 0.0120064, 1e-4, "trt2-trt1 p");
});

test("mtcars: 상관, 회귀, Shapiro-Wilk", () => {
  near(pearson(mpg, wt).r, -0.8676594, 1e-7, "r");
  const m = ols(mpg, [{ name: "wt", values: wt }]);
  near(m.coef[0].b, 37.2851, 1e-4, "b0"); near(m.coef[1].b, -5.3445, 1e-4, "b1"); near(m.r2, 0.7528, 1e-4, "R2");
  const s = shapiroWilk(mpg);
  near(s.W, 0.94756, 1e-5, "W"); near(s.p, 0.1229, 1e-4, "SW p");
});

test("χ², Fisher", () => {
  const c = chiSquare([[762, 327, 468], [484, 239, 477]]);
  near(c.chi2, 30.07, 5e-3, "chi2"); assert.equal(c.df, 2); near(c.p, 2.954e-07, 2e-9, "chi p");
  near(fisherExact2x2(3, 1, 1, 3).p, 0.4857, 1e-4, "fisher tea");
});

test("Mann-Whitney 정확분포는 순열 전수와 일치", () => {
  const x = [1.1, 2.3, 3.7], y = [0.5, 2.9, 4.4, 5.0];
  const all = [...x, ...y];
  const combos = [];
  const choose = (start, cur) => { if (cur.length === 3) { combos.push(cur); return; } for (let i = start; i < 7; i++) choose(i + 1, [...cur, i]); };
  choose(0, []);
  const Wof = idx => { const r = all.map((v) => all.filter(u => u < v).length + 1); return idx.reduce((s, i) => s + r[i], 0) - 6; };
  const Wobs = mannWhitney(x, y).W;
  const le = combos.filter(c => Wof(c) <= Wobs).length / combos.length, ge = combos.filter(c => Wof(c) >= Wobs).length / combos.length;
  near(mannWhitney(x, y).p, Math.min(1, 2 * Math.min(le, ge)), 1e-12, "MW exact");
});

test("Holm 보정", () => {
  const r = holm([0.01, 0.04, 0.03]);
  near(r[0], 0.03, 1e-12, "h1"); near(r[1], 0.06, 1e-12, "h2"); near(r[2], 0.06, 1e-12, "h3");
});

test("Benjamini-Hochberg 보정 (표준 step-up 정의식으로 손 계산 대조)", () => {
  const r = benjaminiHochberg([0.01, 0.04, 0.03]);
  near(r[0], 0.03, 1e-12, "bh1"); near(r[1], 0.04, 1e-12, "bh2"); near(r[2], 0.04, 1e-12, "bh3");
  const r2 = benjaminiHochberg([0.001, 0.02, 0.03, 0.04, 0.5]);
  near(r2[0], 0.005, 1e-9, "bh2-1"); near(r2[1], 0.05, 1e-9, "bh2-2"); near(r2[4], 0.5, 1e-12, "bh2-5");
});

test("F분포 qf/pf — t분포와의 수학적 항등식으로 검증 (F(1,df)=T(df)², F(df1,df2,p)=1/F(df2,df1,1-p))", () => {
  near(D.qf(0.95, 1, 10), D.qt(0.975, 10) ** 2, 1e-4, "qf(.95,1,10)=qt(.975,10)^2");
  near(D.pf(D.qt(0.975, 10) ** 2, 1, 10), 0.95, 1e-6, "pf 항등식");
  const f = D.qf(0.9, 5, 12);
  near(f, 1 / D.qf(0.1, 12, 5), 1e-4, "F 역수 항등식");
});

test("Yates 연속성 보정 — 2×2 는 정의식 Σ(|O−E|−0.5)²/E 대로 계산되고(R chisq.test 기본값과 동일 공식), 보정 전 값도 별도 보존", () => {
  // 정의식을 소스와 별도로 직접 재계산(테이블 합=70): 보정 전 χ²=0.129630, Yates 보정 χ²=0.011667
  const c = chiSquare([[10, 15], [20, 25]]);
  near(c.chi2Uncorrected, 0.1296296296296296, 1e-9, "uncorrected chi2");
  near(c.chi2, 0.011666666666666653, 1e-9, "yates chi2");
  near(c.pUncorrected, 0.7188163610152827, 1e-9, "uncorrected p");
  near(c.p, 0.9139858996305869, 1e-9, "yates p");
});

test("Games-Howell — PlantGrowth, 정의식(Welch-Satterthwaite df·studentized range)으로 독립 재계산한 값과 대조", () => {
  const gh = gamesHowell([ctrl, trt1, trt2], ["ctrl", "trt1", "trt2"]);
  // diff는 방법과 무관하게 평균 차이이므로 위 TukeyHSD 참조값(R)과 그대로 일치해야 함
  const byPair = Object.fromEntries(gh.map(x => [`${x.g1}-${x.g2}`, x]));
  near(byPair["trt1-ctrl"].diff, -0.371, 1e-9, "gh diff trt1-ctrl");
  near(byPair["trt1-ctrl"].q, 1.6846965883281886, 1e-6, "gh q trt1-ctrl");
  near(byPair["trt1-ctrl"].df, 16.523585056859297, 1e-6, "gh df trt1-ctrl");
  near(byPair["trt1-ctrl"].p, 0.4745549221939831, 1e-6, "gh p trt1-ctrl");
  near(byPair["trt2-trt1"].q, 4.256922182351753, 1e-6, "gh q trt2-trt1");
  near(byPair["trt2-trt1"].p, 0.02370345473920976, 1e-6, "gh p trt2-trt1");
  assert.deepEqual(gh.excluded, [], "표본이 충분해 제외되는 쌍이 없어야 함");
});

test("Spearman n<10 정확법 — 완전 단조 자료는 |rho|=1을 만드는 순열이 정확히 2개(항등·완전반전)이므로 p=2/n!", () => {
  const x = [1, 2, 3, 4, 5], y = [1, 2, 3, 4, 5];
  const r = spearman(x, y);
  assert.equal(r.exact, true);
  near(r.r, 1, 1e-12, "rho=1");
  near(r.p, 2 / 120, 1e-12, "exact p = 2/5!");
});
