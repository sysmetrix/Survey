// 서술 어휘·수치 표기 규칙 (보고서 전체에서 일관되게 사용)
import { round } from "../core/util.js";

export const DEFAULT_THRESHOLDS = {
  level: [85, 75, 60, 50],       // 100점 환산 구간 경계
  kpiAchieved: 100, kpiMostly: 90, // 달성률 판정
  overallGood: 80, overallFair: 60, // 지표 달성 비율(%)로 종합 등급
  minN: 30, lowAlpha: 0.6, highMissing: 20,
  minGroupN: 10, // 교차분석에서 이 인원 미만인 집단이 있으면 소표본 경고(BMJ/Cochrane 소집단 분석 관행)
};

/** 100점 환산 점수 → 수준 표현 */
export function levelWord(score, t = DEFAULT_THRESHOLDS) {
  if (!Number.isFinite(score)) return "산출 불가";
  const [a, b, c, d] = t.level;
  return score >= a ? "매우 높은 수준" : score >= b ? "높은 수준" : score >= c ? "보통 이상 수준" : score >= d ? "보통 수준" : "낮은 수준";
}

/**
 * 100점 환산 기준 — 분석 엔진이 환산 점수를 계산할 때 쓰는 평균을 정한다.
 *  exact   : 원자료의 평균(반올림 전)으로 환산
 *  rounded : 표에 적힌 평균(소수 둘째 자리로 반올림한 값)으로 환산
 * 환산 점수가 정해지면 정렬·수준 판정·성과지표 판정·차트가 모두 그 값을 따른다.
 */
export const SCORE_BASES = [
  { id: "exact", label: "반올림 전 평균으로 환산", short: "반올림 전 평균", tag: "기본" },
  { id: "rounded", label: "반올림 후 평균으로 환산 (표에 적힌 소수 둘째 자리 평균 기준)", short: "반올림 후 평균", tag: "경영평가" },
];
export const cleanScoreBasis = v => (v === "rounded" ? "rounded" : "exact");

/** 두 기준의 차이를 보여줄 예시 계산 (평균 → 환산) */
export function scoreBasisExample(mean, min, max) {
  const conv = m => (m - min) / (max - min) * 100;
  const shown = round(mean, 2);
  return { mean, shown, min, max, exact: conv(mean), rounded: conv(shown) };
}

/** 수치 표기 */
export const f2 = x => (Number.isFinite(x) ? round(x, 2).toFixed(2) : "-");
export const f1 = x => (Number.isFinite(x) ? round(x, 1).toFixed(1) : "-");
export const f0 = x => (Number.isFinite(x) ? String(Math.round(x)) : "-");
export const signed = (x, d = 2) => (Number.isFinite(x) ? (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(round(x, d)).toFixed(d) : "-");
export const pText = p => (!Number.isFinite(p) ? "-" : p < 0.001 ? "p<.001" : `p=${round(p, 3).toFixed(3).replace(/^0/, "")}`);
export const sigStar = p => (!Number.isFinite(p) ? "" : p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "");

/** 검정통계량 숫자 (순위합 V·W 는 정수 표기) */
export const statNum = test => (["V", "W", "U"].includes(test.statLabel) && Number.isFinite(test.stat) ? String(Math.round(test.stat * 2) / 2) : round(test.stat, 2).toFixed(2));

/** 검정 결과 괄호 표기: (t=4.12, p<.001, d=0.71, 95%CI[0.32, 1.10]) */
export function statParen(test) {
  if (!test) return "";
  const parts = [];
  if (Number.isFinite(test.stat)) parts.push(`${test.statLabel}=${statNum(test)}`);
  parts.push(pText(test.p));
  if (Number.isFinite(test.effect)) parts.push(`${test.effectName}=${round(test.effect, 2).toFixed(2)}`);
  if (Array.isArray(test.ci) && test.ci.every(Number.isFinite)) parts.push(`95%CI[${round(test.ci[0], 2).toFixed(2)}, ${round(test.ci[1], 2).toFixed(2)}]`);
  return `(${parts.join(", ")})`;
}

export const sigPhrase = p => (Number.isFinite(p) && p < 0.05 ? "통계적으로 유의함" : "통계적으로 유의한 차이는 확인되지 않음");

/** 판정 라벨 */
export function judgeWord(rate, t = DEFAULT_THRESHOLDS) {
  if (!Number.isFinite(rate)) return "측정 불가";
  return rate >= t.kpiAchieved ? "달성" : rate >= t.kpiMostly ? "대체로 달성" : "미달성";
}
