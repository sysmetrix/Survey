// 불러오기 화면 샘플 타일의 미니 그래프 — 샘플 파일마다 '성격'을 보여 주는 장식용 SVG.
// 순수 모듈(DOM 비의존): 서술자 → 마크업 문자열. 막대·점 위치는 그 샘플의 실제 측정 척도(scale)에 비례한다.
//   막대(bars·hbars)  높이·길이 = 값 / 척도 최대값   (0에서 시작)
//   점·선(dumbbell·lines)  위치 = (값 - 최소) / (최대 - 최소)  (척도 전체 구간에 놓임)
// 값은 samples/ 의 실제 파일에서 계산한 평균·비율이다. tests/ui/load-view.test.js 가 원본 파일에서 다시 계산해 대조한다.

const W = 100, H = 40;
const clamp01 = v => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const n2 = v => String(Math.round(v * 100) / 100);
const frac = (v, sc) => clamp01((v - sc.min) / (sc.max - sc.min));

export const GLYPHS = {
  // 사전·사후 시트(각 88명·90명): 진로 관심·자기 이해·진로 준비의 사전/사후 평균(5점 척도).
  // 목표선 = 사전 평균 + 0.5점 (성과지표 K3·K4 '사전사후 변화량 0.5점 이상'). 진로 준비(K5)는 향상자 비율 지표라 목표선 없음.
  "2026_진로탐색_사전사후.xlsx": {
    kind: "pairs", scale: { min: 1, max: 5 }, cap: "5점 척도",
    groups: [{ pre: 3.18, post: 3.86, goal: 3.68 }, { pre: 3.11, post: 3.66, goal: 3.61 }, { pre: 2.96, post: 3.28 }],
  },
  // '전반적으로 프로그램에 만족하십니까?' 응답 분포(142명): 그렇지 않다 2 · 보통이다 34 · 그렇다 66 · 매우 그렇다 40 → 1~5점 5칸의 비율(축 최대 50%).
  "2026_청소년센터_만족도_구글폼.csv": {
    kind: "dist", scale: { min: 1, max: 5 }, cap: "5점 척도", axisMax: 0.5,
    values: [0, 0.014, 0.239, 0.465, 0.282],
  },
  // 문자 응답(‘매우 만족’…‘매우 불만족’, 90명)을 1~5점으로 바꾼 문항 1~5 평균(5점 척도, 문항마다 한 줄).
  "2026_진로체험_네이버폼.csv": {
    kind: "hbars", scale: { min: 1, max: 5 }, cap: "5점 척도",
    values: [4.27, 3.69, 4.28, 3.32, 3.91],
  },
  // 이전_/현재_ 4개 문항 평균(24명, 5점 척도): 이전 → 현재.
  "2026_참여위원회_회고식.xlsx": {
    kind: "dumbbell", scale: { min: 1, max: 5 }, cap: "5점 척도",
    from: [3.25, 3.29, 3.21, 3.08], to: [3.79, 3.83, 3.96, 3.38],
  },
  // 사전_/사후_ 4개 문항 평균(64명, 5점 척도). 사후 향상폭이 작은 문항부터 큰 문항 순으로 놓았다.
  "2026_리더십캠프_사전사후_한시트.xlsx": {
    kind: "lines", scale: { min: 1, max: 5 }, cap: "5점 척도",
    pre: [3.13, 3.17, 3.13, 3.22], post: [3.31, 3.55, 3.64, 3.91],
  },
  // 7점 척도 5문항(역문항 반전, 400개 응답)의 1~7점 비율(축 최대 40%) + 추천의향(0~10) 평균 7.8.
  "2026_생태탐험_7점척도_NPS.xlsx": {
    kind: "dist", scale: { min: 1, max: 7 }, cap: "7점 · NPS", axisMax: 0.4,
    values: [0, 0, 0.05, 0.17, 0.3, 0.31, 0.18],
    marker: { value: 7.8, scale: { min: 0, max: 10 } },
  },
};

const rect = (cls, k, x, y, w, h, extra = "", rx = 2.5) =>
  `<rect class="${cls}" style="--k:${k}" x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="${rx}"${extra}/>`;

function distBars(d) {
  const n = d.scale.max - d.scale.min + 1;
  const base = d.marker ? 29 : 38, plot = d.marker ? 26 : 34, gap = n > 5 ? 3 : 4;
  const bw = (W - 4 - gap * (n - 1)) / n;
  const top = Math.max(...d.values);
  let out = `<path class="g-base" d="M2 ${base + .5}H${W - 2}"/>`;
  d.values.forEach((v, i) => {
    const f = clamp01(v / d.axisMax);
    const h = Math.max(f * plot, 1.2);
    out += rect(`${v === top ? "g-post" : "g-pre"} bar${v > 0 ? "" : " zero"}`, i, 2 + i * (bw + gap), base - h, bw, h, ` data-v="${n2(v)}" data-f="${n2(f)}"`, Math.min(3, bw / 2.4));
  });
  if (d.marker) {
    const mx = 2 + (W - 4) * frac(d.marker.value, d.marker.scale);
    out += `<path class="g-rail" d="M2 36H${W - 2}"/><path class="g-rail" d="M2 33.5V38.5M${W - 2} 33.5V38.5"/>`
      + `<circle class="g-dot pop" style="--k:${d.values.length}" cx="${n2(mx)}" cy="36" r="3.1" data-v="${n2(d.marker.value)}" data-f="${n2(frac(d.marker.value, d.marker.scale))}"/>`;
  }
  return out;
}

function pairBars(d) {
  const G = d.groups.length, gw = (W - 4) / G, bw = 9, base = 38, plot = 34;
  let out = `<path class="g-base" d="M2 ${base + .5}H${W - 2}"/>`, k = 0;
  d.groups.forEach((g, i) => {
    const cx = 2 + gw * i + gw / 2;
    const xPre = cx - bw - 1, xPost = cx + 1;
    const hPre = clamp01(g.pre / d.scale.max) * plot, hPost = clamp01(g.post / d.scale.max) * plot;
    out += rect("g-pre bar", k, xPre, base - hPre, bw, hPre, ` data-v="${n2(g.pre)}" data-f="${n2(g.pre / d.scale.max)}"`);
    out += rect("g-post bar", k + 1, xPost, base - hPost, bw, hPost, ` data-v="${n2(g.post)}" data-f="${n2(g.post / d.scale.max)}"`);
    if (Number.isFinite(g.goal)) {
      const gy = base - clamp01(g.goal / d.scale.max) * plot;
      out += `<path class="g-goal" d="M${n2(xPre - 2)} ${n2(gy)}H${n2(xPost + bw + 2)}"/>`;
      if (g.post >= g.goal) out += `<circle class="g-dot pop" style="--k:${k + 2}" cx="${n2(xPost + bw / 2)}" cy="${n2(base - hPost - 3.6)}" r="2.6"/>`;
    }
    k += 2;
  });
  return out;
}

function hBars(d) {
  const n = d.values.length, pitch = (H - 4) / n, bh = Math.min(5, pitch - 2), x0 = 8;
  let out = "";
  d.values.forEach((v, i) => {
    const y = 2 + i * pitch + (pitch - bh) / 2, f = clamp01(v / d.scale.max);
    out += `<circle class="g-face pop" style="--k:${i}" cx="3.2" cy="${n2(y + bh / 2)}" r="2.4"/>`;
    out += rect(`${i === n - 1 ? "g-post" : "g-l3"} hbar`, i, x0, y, (W - x0 - 2) * f, bh, ` data-v="${n2(v)}" data-f="${n2(f)}"`, bh / 2);
  });
  return out;
}

function dumbbell(d) {
  const n = d.from.length, pitch = (H - 4) / n, x0 = 6, x1 = W - 6;
  const px = v => x0 + (x1 - x0) * frac(v, d.scale);
  let out = "";
  d.from.forEach((a, i) => {
    const y = 2 + pitch * (i + .5), b = d.to[i];
    out += `<path class="g-rail" d="M${x0} ${n2(y)}H${x1}"/>`;
    out += `<path class="g-tie line" pathLength="1" style="--k:${i}" d="M${n2(px(a))} ${n2(y)}H${n2(px(b))}"/>`;
    out += `<circle class="g-hollow pop" style="--k:${i}" cx="${n2(px(a))}" cy="${n2(y)}" r="3" data-v="${n2(a)}" data-f="${n2(frac(a, d.scale))}"/>`;
    out += `<circle class="g-fill pop" style="--k:${i + 1}" cx="${n2(px(b))}" cy="${n2(y)}" r="3" data-v="${n2(b)}" data-f="${n2(frac(b, d.scale))}"/>`;
  });
  return out;
}

function lines(d) {
  const n = d.post.length, x0 = 6, x1 = W - 6, base = 37, plot = 33;
  const X = i => x0 + ((x1 - x0) * i) / (n - 1), Y = v => base - plot * frac(v, d.scale);
  const path = a => a.map((v, i) => `${i ? "L" : "M"}${n2(X(i))} ${n2(Y(v))}`).join(" ");
  const area = `${path(d.post)} L${n2(X(n - 1))} ${base + 2} L${n2(X(0))} ${base + 2}Z`;
  return `<path class="g-area" d="${area}"/>`
    + `<path class="g-l-pre line" pathLength="1" d="${path(d.pre)}"/>`
    + `<path class="g-l-post line" pathLength="1" style="--k:2" d="${path(d.post)}"/>`
    + `<circle class="g-dot pop" style="--k:6" cx="${n2(X(n - 1))}" cy="${n2(Y(d.post[n - 1]))}" r="3.1" data-v="${n2(d.post[n - 1])}" data-f="${n2(frac(d.post[n - 1], d.scale))}"/>`;
}

const DRAW = { dist: distBars, pairs: pairBars, hbars: hBars, dumbbell, lines };

/** 서술자 → <svg> 문자열 */
export function glyphSvg(d) {
  const draw = DRAW[d?.kind];
  if (!draw) return "";
  return `<svg class="gl gl-${d.kind}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet" focusable="false" data-kind="${d.kind}" data-scale="${d.scale.min}-${d.scale.max}">${draw(d)}</svg>`;
}

/** 샘플 파일명 → 장식 래퍼(aria-hidden) 마크업. 알 수 없는 파일이면 빈 문자열 */
export function glyphMarkup(file) {
  const d = GLYPHS[file];
  const svg = glyphSvg(d);
  return svg ? `<span class="ld-gl" aria-hidden="true">${svg}<span class="ld-gl-cap">${d.cap}</span></span>` : "";
}

/** 막대(rect.bar / rect.hbar)의 개수 — 척도 칸 수와 일치해야 한다 */
export function barCount(d) {
  if (d.kind === "dist") return d.scale.max - d.scale.min + 1;
  if (d.kind === "pairs") return d.groups.length * 2;
  if (d.kind === "hbars") return d.values.length;
  return 0;
}
