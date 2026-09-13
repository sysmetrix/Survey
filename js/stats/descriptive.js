// 기술통계 (입력은 유효 숫자 배열 — 결측 제거는 호출 측 책임)

export const sum = a => a.reduce((s, v) => s + v, 0);
export const mean = a => a.length ? sum(a) / a.length : NaN;

export function variance(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1);
}
export const sd = a => Math.sqrt(variance(a));

export function quantile(a, p) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
}
export const median = a => quantile(a, 0.5);

export function describe(a) {
  const n = a.length;
  const m = mean(a), s = sd(a);
  return {
    n, mean: m, sd: s, se: n > 1 ? s / Math.sqrt(n) : NaN,
    median: median(a), min: n ? Math.min(...a) : NaN, max: n ? Math.max(...a) : NaN,
  };
}

/** 평균 순위 (동점 평균). ties: 동점 그룹 크기 배열 */
export function rank(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const ranks = new Array(a.length);
  const ties = [];
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = r;
    if (j > i) ties.push(j - i + 1);
    i = j + 1;
  }
  return { ranks, ties };
}

/** 척도 문항 빈도: levels = [min..max] */
export function frequency(values, levels) {
  const counts = levels.map(l => values.filter(v => v === l).length);
  const n = values.length;
  return { levels, counts, pct: counts.map(c => n ? c / n * 100 : 0), n };
}
