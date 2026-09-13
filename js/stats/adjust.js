// 다중비교 보정 (R p.adjust 와 동일)

export function holm(ps) {
  const n = ps.length;
  const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(n);
  let run = 0;
  idx.forEach(([p, i], r) => { run = Math.max(run, Math.min(1, (n - r) * p)); out[i] = run; });
  return out;
}

export function benjaminiHochberg(ps) {
  const n = ps.length;
  const idx = ps.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
  const out = new Array(n);
  let run = 1;
  idx.forEach(([p, i], r) => { const rank = n - r; run = Math.min(run, Math.min(1, p * n / rank)); out[i] = run; });
  return out;
}
