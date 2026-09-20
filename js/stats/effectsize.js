// 효과크기 해석 라벨 (Cohen 1988 관행 기준)

/** d, g, d_z */
export function dLabel(d) {
  const a = Math.abs(d);
  if (!Number.isFinite(a)) return "-";
  return a >= 0.8 ? "큰 효과" : a >= 0.5 ? "중간 효과" : a >= 0.2 ? "작은 효과" : "미미한 효과";
}
/** r (= Z/√N, 상관계수) */
export function rLabel(r) {
  const a = Math.abs(r);
  if (!Number.isFinite(a)) return "-";
  return a >= 0.5 ? "큰 효과" : a >= 0.3 ? "중간 효과" : a >= 0.1 ? "작은 효과" : "미미한 효과";
}
/** η², ω², ε² */
export function etaLabel(e) {
  if (!Number.isFinite(e)) return "-";
  return e >= 0.14 ? "큰 효과" : e >= 0.06 ? "중간 효과" : e >= 0.01 ? "작은 효과" : "미미한 효과";
}
/** Cramér V (자유도 보정: df* = min(R,C)−1) */
export function vLabel(v, dfStar = 1) {
  if (!Number.isFinite(v)) return "-";
  const t = [[0.1, 0.3, 0.5], [0.07, 0.21, 0.35], [0.06, 0.17, 0.29]][Math.min(dfStar, 3) - 1];
  return v >= t[2] ? "큰 관련성" : v >= t[1] ? "중간 관련성" : v >= t[0] ? "작은 관련성" : "미미한 관련성";
}
/** 상관계수 강도 */
export function corrLabel(r) {
  const a = Math.abs(r);
  if (!Number.isFinite(a)) return "-";
  return a >= 0.7 ? "매우 강한" : a >= 0.5 ? "강한" : a >= 0.3 ? "중간 정도의" : a >= 0.1 ? "약한" : "거의 없는";
}
/** Cronbach α */
export function alphaLabel(a) {
  if (!Number.isFinite(a)) return "-";
  return a >= 0.9 ? "매우 우수" : a >= 0.8 ? "양호" : a >= 0.7 ? "수용 가능" : a >= 0.6 ? "다소 낮음" : "낮음";
}

/**
 * 독립 2표본 Cohen's d(또는 g)의 근사 95% 신뢰구간 (Hedges & Olkin 1985 표준오차식).
 * SE_d ≈ √((n1+n2)/(n1·n2) + d²/(2(n1+n2)-4))
 */
export function dCiIndependent(d, n1, n2) {
  if (!Number.isFinite(d) || n1 < 2 || n2 < 2) return [NaN, NaN];
  const se = Math.sqrt((n1 + n2) / (n1 * n2) + (d * d) / (2 * (n1 + n2) - 4));
  return [d - 1.96 * se, d + 1.96 * se];
}

/**
 * 대응(1표본형) d_z의 근사 95% 신뢰구간 (Borenstein, Hedges, Higgins & Rothstein 2009 — 사전·사후
 * 상관을 반영하지 않는 보수적(다소 넓은) 버전). SE_dz ≈ √(1/n + d_z²/(2n))
 */
export function dzCiPaired(dz, n) {
  if (!Number.isFinite(dz) || n < 2) return [NaN, NaN];
  const se = Math.sqrt(1 / n + (dz * dz) / (2 * n));
  return [dz - 1.96 * se, dz + 1.96 * se];
}
