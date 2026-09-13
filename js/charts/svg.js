// 순수 SVG 차트 생성기 (DOM 비의존) — 대시보드 인라인 표시와 보고서(HWPX/인쇄) 이미지에 공통 사용
// 원칙: 흑백 인쇄에서도 명도로 구분되는 색, 모든 막대에 값 표시, n 표기, 한글 글꼴

export const FONT = "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
export const COLORS = {
  primary: "#2E75B6", primaryLight: "#9DC3E6", accent: "#C55A11", accentLight: "#F4B183",
  gray: "#A6A6A6", grayLight: "#D9D9D9", text: "#222222", sub: "#595959", grid: "#E3E3E3", axis: "#7F7F7F",
  good: "#2E75B6", bad: "#C55A11",
};
/** 5단계 발산 (부정 → 긍정) — 명도 차이 확보 */
export const DIVERGING = {
  2: ["#C55A11", "#2E75B6"],
  3: ["#C55A11", "#D9D9D9", "#2E75B6"],
  4: ["#C55A11", "#F4B183", "#9DC3E6", "#2E75B6"],
  5: ["#A0400C", "#F4B183", "#D9D9D9", "#9DC3E6", "#1F4E79"],
  7: ["#843C0C", "#C55A11", "#F4B183", "#D9D9D9", "#9DC3E6", "#2E75B6", "#1F4E79"],
};
export const SERIES = ["#1F4E79", "#9DC3E6", "#C55A11", "#7F7F7F", "#F4B183", "#2E75B6", "#404040", "#BDD7EE"];

const x = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r1 = v => Math.round(v * 10) / 10;

/** 대략적 글자 폭 (px) */
export function textWidth(s, fs) {
  let w = 0;
  for (const ch of String(s ?? "")) w += /[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/.test(ch) ? fs * 0.95 : /[A-Z0-9%]/.test(ch) ? fs * 0.62 : fs * 0.52;
  return w;
}
/** 폭에 맞춰 최대 maxLines 줄로 나눔 */
export function wrap(s, maxW, fs, maxLines = 2) {
  const words = String(s ?? "").split(/(\s+)/).filter(Boolean);
  const lines = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (textWidth(cur + w, fs) <= maxW || !cur.trim()) lines[lines.length - 1] = cur + w;
    else lines.push(w.trimStart());
  }
  // 한 단어가 너무 긴 경우 글자 단위 분할
  const out = [];
  lines.forEach(l => {
    let buf = "";
    for (const ch of l) { if (textWidth(buf + ch, fs) > maxW && buf) { out.push(buf); buf = ch; } else buf += ch; }
    out.push(buf);
  });
  if (out.length > maxLines) { const cut = out.slice(0, maxLines); let last = cut[maxLines - 1]; while (textWidth(last + "…", fs) > maxW && last.length) last = last.slice(0, -1); cut[maxLines - 1] = last + "…"; return cut.map(s2 => s2.trim()); }
  return out.map(s2 => s2.trim());
}

const text = (tx, ty, s, { fs = 12, anchor = "start", weight = 400, fill = COLORS.text, baseline = "middle" } = {}) =>
  `<text x="${r1(tx)}" y="${r1(ty)}" font-size="${fs}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}">${x(s)}</text>`;
const multiline = (tx, ty, lines, opts = {}) => {
  const fs = opts.fs || 12, lh = fs * 1.2, y0 = ty - (lines.length - 1) * lh / 2;
  return lines.map((l, i) => text(tx, y0 + i * lh, l, opts)).join("");
};
const rect = (rx, ry, w, h, fill, extra = "") => `<rect x="${r1(rx)}" y="${r1(ry)}" width="${r1(Math.max(0, w))}" height="${r1(Math.max(0, h))}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, sw = 1, dash = "") => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
const wrapSvg = (w, h, body) => ({
  width: w, height: Math.round(h),
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round(h)}" viewBox="0 0 ${w} ${Math.round(h)}" font-family="${FONT}"><rect width="100%" height="100%" fill="#FFFFFF"/>${body}</svg>`,
});

function legend(entries, lx, ly, maxW, fs = 11) {
  let cx = lx, cy = ly, out = "";
  entries.forEach(([label, color]) => {
    const w = 14 + 6 + textWidth(label, fs) + 16;
    if (cx + w > lx + maxW && cx > lx) { cx = lx; cy += fs + 8; }
    out += rect(cx, cy - 6, 12, 12, color, `stroke="#7F7F7F" stroke-width="0.5"`) + text(cx + 18, cy, label, { fs, fill: COLORS.sub });
    cx += w;
  });
  return { svg: out, bottom: cy + fs };
}

/**
 * 가로 막대 (문항 순위, 응답자 특성, 키워드 등)
 * @param {{label:string, value:number, sub?:string, color?:string}[]} data
 */
export function hbar(data, { width = 720, max = null, min = 0, refValue = null, refLabel = "", valueFmt = v => v.toFixed(1), unit = "", barColor = COLORS.primary, labelWidth = 220, title = "" } = {}) {
  const fs = 13, rowH = 34, top = (title ? 34 : 14) + (refValue !== null && Number.isFinite(refValue) ? 16 : 0), bottom = 34;
  const mx = max ?? Math.max(1, ...data.map(d => d.value)) * 1.1;
  const plotX = labelWidth + 12, plotW = width - plotX - 70;
  const sx = v => plotX + (Math.max(min, Math.min(mx, v)) - min) / (mx - min) * plotW;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700 }) : "";
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = min + (mx - min) * i / ticks, gx = sx(v);
    b += line(gx, top, gx, top + data.length * rowH, COLORS.grid) + text(gx, top + data.length * rowH + 14, Number.isInteger(v) ? v : v.toFixed(1), { fs: 11, anchor: "middle", fill: COLORS.sub });
  }
  data.forEach((d, i) => {
    const cy = top + i * rowH + rowH / 2;
    b += multiline(labelWidth, cy, wrap(d.label, labelWidth, fs), { fs, anchor: "end" });
    const w = sx(d.value) - plotX;
    b += rect(plotX, cy - 11, w, 22, d.color || barColor);
    b += text(plotX + w + 6, cy, `${Number.isFinite(d.value) ? valueFmt(d.value) : "-"}${unit}${d.sub ? ` ${d.sub}` : ""}`, { fs: 12, weight: 600 });
  });
  b += line(plotX, top, plotX, top + data.length * rowH, COLORS.axis);
  if (refValue !== null && Number.isFinite(refValue)) {
    const rx = sx(refValue);
    b += line(rx, top - 6, rx, top + data.length * rowH, "#000000", 1.5, "5,3") + text(rx, top - 10, `${refLabel} ${valueFmt(refValue)}`, { fs: 11, anchor: "middle", weight: 600 });
  }
  return wrapSvg(width, top + data.length * rowH + bottom, b);
}

/**
 * 발산형 누적 막대 (척도 응답 분포)
 * @param {{label:string, pct:number[], n?:number}[]} rows  pct: 낮은 점수→높은 점수
 * @param {string[]} levelLabels
 */
export function likertDiverging(rows, levelLabels, { width = 720, labelWidth = 200, title = "" } = {}) {
  const k = levelLabels.length, pal = DIVERGING[k] || SERIES.slice(0, k);
  const fs = 13, rowH = 34, top = title ? 40 : 18;
  const mid = (k - 1) / 2;
  const negOf = p => p.reduce((s, v, i) => s + (i < mid ? v : i === mid ? v / 2 : 0), 0);
  const maxNeg = Math.max(50, ...rows.map(r => negOf(r.pct)));
  const maxPos = Math.max(50, ...rows.map(r => 100 - negOf(r.pct)));
  const plotX = labelWidth + 12, plotW = width - plotX - 50;
  const scale = plotW / (maxNeg + maxPos), zero = plotX + maxNeg * scale;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700 }) : "";
  b += line(zero, top - 6, zero, top + rows.length * rowH + 6, "#000000", 1.2); // 기준선은 막대 뒤
  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    b += multiline(labelWidth, cy, wrap(r.label, labelWidth, fs), { fs, anchor: "end" });
    let cx = zero - negOf(r.pct) * scale;
    r.pct.forEach((p, j) => {
      const w = p * scale;
      b += rect(cx, cy - 12, w, 24, pal[j]);
      if (p >= 7) b += text(cx + w / 2, cy, Math.round(p), { fs: 11, anchor: "middle", fill: j === 0 || j === k - 1 || (k === 7 && (j === 1 || j === 5)) ? "#FFFFFF" : COLORS.text, weight: 600 });
      cx += w;
    });
    if (r.n !== undefined) b += text(width - 4, cy, `n=${r.n}`, { fs: 10, anchor: "end", fill: COLORS.sub });
  });
  const bottomY = top + rows.length * rowH;
  const lg = legend(levelLabels.map((l, i) => [l, pal[i]]), plotX, bottomY + 20, width - plotX);
  b += lg.svg;
  return wrapSvg(width, lg.bottom + 12, b);
}

/**
 * 덤벨 차트 (사전 → 사후)
 * @param {{label:string, pre:number, post:number, sig?:boolean}[]} rows
 */
export function dumbbell(rows, { width = 720, min = 1, max = 5, labelWidth = 200, title = "", valueFmt = v => v.toFixed(2) } = {}) {
  const fs = 13, rowH = 36, top = title ? 40 : 20;
  const plotX = labelWidth + 16, plotW = width - plotX - 60;
  const sx = v => plotX + (v - min) / (max - min) * plotW;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700 }) : "";
  const steps = max - min <= 10 ? max - min : 5;
  for (let i = 0; i <= steps; i++) {
    const v = min + (max - min) * i / steps, gx = sx(v);
    b += line(gx, top, gx, top + rows.length * rowH, COLORS.grid) + text(gx, top + rows.length * rowH + 14, Number.isInteger(v) ? v : v.toFixed(1), { fs: 11, anchor: "middle", fill: COLORS.sub });
  }
  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    b += multiline(labelWidth, cy, wrap(r.label, labelWidth, fs), { fs, anchor: "end" });
    const a = sx(r.pre), c = sx(r.post);
    b += line(a, cy, c, cy, r.post >= r.pre ? COLORS.primary : COLORS.accent, 4);
    b += `<circle cx="${r1(a)}" cy="${r1(cy)}" r="7" fill="#FFFFFF" stroke="${COLORS.axis}" stroke-width="2.5"/>`;
    b += `<circle cx="${r1(c)}" cy="${r1(cy)}" r="7" fill="${r.post >= r.pre ? COLORS.primary : COLORS.accent}"/>`;
    const left = Math.min(a, c), right = Math.max(a, c);
    b += text(left - 12, cy, valueFmt(r.post >= r.pre ? r.pre : r.post), { fs: 11, anchor: "end", fill: COLORS.sub });
    b += text(right + 12, cy, valueFmt(r.post >= r.pre ? r.post : r.pre) + (r.sig ? " *" : ""), { fs: 12, weight: 700 });
  });
  const bottomY = top + rows.length * rowH + 22;
  const lg = legend([["사전", "#FFFFFF"], ["사후", COLORS.primary]], plotX, bottomY + 12, plotW);
  return wrapSvg(width, lg.bottom + 12, b + lg.svg);
}

/**
 * 성과지표 불릿 차트 (달성률)
 * @param {{label:string, rate:number, judgment?:string}[]} rows
 */
export function kpiBullet(rows, { width = 720, labelWidth = 230, title = "", maxRate = 150, mostly = 90 } = {}) {
  const fs = 13, rowH = 36, top = title ? 42 : 22;
  const plotX = labelWidth + 12, plotW = width - plotX - 80;
  const sx = v => plotX + Math.max(0, Math.min(maxRate, v)) / maxRate * plotW;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700 }) : "";
  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    b += multiline(labelWidth, cy, wrap(r.label, labelWidth, fs), { fs, anchor: "end" });
    b += rect(plotX, cy - 13, sx(mostly) - plotX, 26, "#EDEDED") + rect(sx(mostly), cy - 13, sx(100) - sx(mostly), 26, "#DADADA") + rect(sx(100), cy - 13, sx(maxRate) - sx(100), 26, "#F5F5F5");
    const ok = Number.isFinite(r.rate);
    if (ok) b += rect(plotX, cy - 6, sx(r.rate) - plotX, 12, r.rate >= 100 ? COLORS.primary : r.rate >= mostly ? COLORS.primaryLight : COLORS.accent);
    b += text(sx(maxRate) + 8, cy, ok ? `${r.rate.toFixed(1)}%${r.rate > maxRate ? "▶" : ""}` : "측정 불가", { fs: 12, weight: 700, fill: ok ? COLORS.text : COLORS.sub });
  });
  const bottomY = top + rows.length * rowH;
  b += line(sx(100), top - 6, sx(100), bottomY + 4, "#000000", 2) + text(sx(100), top - 12, "목표 100%", { fs: 11, anchor: "middle", weight: 700 });
  b += line(sx(mostly), top, sx(mostly), bottomY, "#7F7F7F", 1, "3,3") + text(sx(mostly), bottomY + 14, `${mostly}%`, { fs: 10, anchor: "middle", fill: COLORS.sub });
  const lg = legend([["달성(100% 이상)", COLORS.primary], [`대체로 달성(${mostly}~99%)`, COLORS.primaryLight], ["미달성", COLORS.accent]], plotX, bottomY + 34, width - plotX);
  return wrapSvg(width, lg.bottom + 12, b + lg.svg);
}

/**
 * IPA 사분면 산점도 (x: 중요도, y: 만족도)
 * @param {{label:string, importance:number, performance:number}[]} points
 */
export function ipaScatter(points, { width = 720, height = 460, meanI, meanP, title = "" } = {}) {
  const pad = { l: 64, r: 30, t: title ? 44 : 24, b: 50 };
  const xs = points.map(p => p.importance), ys = points.map(p => p.performance);
  const xmin = Math.min(...xs, meanI) - 0.05, xmax = Math.max(...xs, meanI) + 0.05;
  const ymin = Math.max(0, Math.min(...ys, meanP) - 5), ymax = Math.min(100, Math.max(...ys, meanP) + 5);
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const sx = v => pad.l + (v - xmin) / (xmax - xmin) * W, sy = v => pad.t + H - (v - ymin) / (ymax - ymin) * H;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700 }) : "";
  b += rect(pad.l, pad.t, W, H, "#FFFFFF", `stroke="${COLORS.axis}"`);
  b += rect(sx(meanI), sy(meanP), pad.l + W - sx(meanI), pad.t + H - sy(meanP), "#FCE4D6");
  b += line(sx(meanI), pad.t, sx(meanI), pad.t + H, "#000", 1, "5,3") + line(pad.l, sy(meanP), pad.l + W, sy(meanP), "#000", 1, "5,3");
  const q = (tx, ty, s, anchor) => text(tx, ty, s, { fs: 12, weight: 700, fill: COLORS.sub, anchor });
  b += q(pad.l + W - 6, pad.t + 14, "유지·강화", "end") + q(pad.l + W - 6, pad.t + H - 10, "집중 개선", "end") + q(pad.l + 6, pad.t + 14, "과잉 투자 점검", "start") + q(pad.l + 6, pad.t + H - 10, "점진 개선", "start");
  points.forEach(p => {
    const px = sx(p.importance), py = sy(p.performance);
    b += `<circle cx="${r1(px)}" cy="${r1(py)}" r="6" fill="${p.importance >= meanI && p.performance < meanP ? COLORS.accent : COLORS.primary}"/>`;
    const lbl = p.label.length > 16 ? p.label.slice(0, 15) + "…" : p.label;
    const nearRight = px + 9 + textWidth(lbl, 11) > pad.l + W - 4;
    b += text(nearRight ? px - 9 : px + 9, py - 9, lbl, { fs: 11, anchor: nearRight ? "end" : "start" });
  });
  b += text(pad.l + W / 2, height - 12, "중요도 (전반 만족도와의 상관계수)", { fs: 12, anchor: "middle", fill: COLORS.sub });
  b += `<text transform="translate(16 ${pad.t + H / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${COLORS.sub}">만족도 (100점 환산)</text>`;
  [xmin, (xmin + xmax) / 2, xmax].forEach(v => { b += text(sx(v), pad.t + H + 14, v.toFixed(2), { fs: 10, anchor: "middle", fill: COLORS.sub }); });
  [ymin, (ymin + ymax) / 2, ymax].forEach(v => { b += text(pad.l - 6, sy(v), v.toFixed(0), { fs: 10, anchor: "end", fill: COLORS.sub }); });
  return wrapSvg(width, height, b);
}

/** NPS 100% 누적 막대 */
export function npsBar({ detractors, passives, promoters, nps, n }, { width = 720, title = "" } = {}) {
  const top = title ? 40 : 16, plotX = 20, plotW = width - 40, h = 40;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700 }) : "";
  const parts = [["비추천(0~6)", detractors, COLORS.accent], ["중립(7~8)", passives, COLORS.grayLight], ["추천(9~10)", promoters, COLORS.primary]];
  let cx = plotX;
  parts.forEach(([, p, c], i) => {
    const w = p / 100 * plotW;
    b += rect(cx, top, w, h, c);
    if (p >= 6) b += text(cx + w / 2, top + h / 2, `${p.toFixed(1)}%`, { fs: 13, anchor: "middle", weight: 700, fill: i === 1 ? COLORS.text : "#FFFFFF" });
    cx += w;
  });
  b += text(width / 2, top + h + 26, `NPS = ${nps >= 0 ? "+" : ""}${nps.toFixed(1)}  (추천 ${promoters.toFixed(1)}% − 비추천 ${detractors.toFixed(1)}%, n=${n})`, { fs: 13, anchor: "middle", weight: 700 });
  const lg = legend(parts.map(p => [p[0], p[2]]), plotX, top + h + 52, plotW);
  return wrapSvg(width, lg.bottom + 10, b + lg.svg);
}

/**
 * 집단 비교 (묶은 가로 막대): categories × series
 * @param {string[]} categories  예: 문항명
 * @param {{name:string, values:number[]}[]} series  예: 집단
 */
export function groupedHbar(categories, series, { width = 720, max = 100, labelWidth = 180, title = "", valueFmt = v => v.toFixed(1) } = {}) {
  const fs = 12, barH = Math.max(9, Math.min(18, 44 / series.length)), gap = 12;
  const groupH = barH * series.length + gap, top = title ? 40 : 14;
  const plotX = labelWidth + 12, plotW = width - plotX - 56;
  const sx = v => plotX + Math.max(0, Math.min(max, v)) / max * plotW;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700 }) : "";
  for (let i = 0; i <= 5; i++) { const gx = plotX + plotW * i / 5; b += line(gx, top, gx, top + categories.length * groupH, COLORS.grid) + text(gx, top + categories.length * groupH + 12, (max * i / 5).toFixed(0), { fs: 10, anchor: "middle", fill: COLORS.sub }); }
  categories.forEach((c, i) => {
    const gy = top + i * groupH;
    b += multiline(labelWidth, gy + (groupH - gap) / 2, wrap(c, labelWidth, fs), { fs, anchor: "end" });
    series.forEach((s, j) => {
      const v = s.values[i], by = gy + j * barH;
      if (!Number.isFinite(v)) return;
      b += rect(plotX, by + 1, sx(v) - plotX, barH - 2, SERIES[j % SERIES.length]);
      b += text(sx(v) + 4, by + barH / 2, valueFmt(v), { fs: 10, fill: COLORS.sub });
    });
  });
  const lg = legend(series.map((s, j) => [s.name, SERIES[j % SERIES.length]]), plotX, top + categories.length * groupH + 32, width - plotX);
  return wrapSvg(width, lg.bottom + 10, b + lg.svg);
}
