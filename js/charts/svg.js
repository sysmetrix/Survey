// 순수 SVG 차트 생성기 (DOM 비의존) — 대시보드·발표 모드 인라인 표시와 보고서(HWPX/인쇄) 이미지에 공통 사용
// dataviz 규격: 막대 ≤24px·데이터 끝 4px 둥글림, 실선 헤어라인 격자, 채움 사이 2px 표면 간격,
//   점 2px 표면 링, 글자는 잉크색(계열색 금지), 2계열 이상 범례, 상태색은 아이콘·글자 병기,
//   모든 표시 요소에 data-tip(툴팁) — 이미지(HWPX)에서는 무시됨
// 문항명은 자르지 않는다: 긴 문항은 줄 수만큼 행 높이를 늘리고, 라벨 영역도 필요하면 넓힌다.
import { themeOf, inkOn, divergingFor, THEMES } from "./theme.js";

export const FONT = "'Pretendard GOV Variable','Pretendard GOV','Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
// 하위 호환(라이트 테마 값)
const L = THEMES.light;
export const COLORS = { primary: L.accent, primaryLight: L.accentSoft, accent: L.emphasis, gray: L.deemph, text: L.ink, sub: L.sub, grid: L.grid, axis: L.axis };
export const DIVERGING = L.div;
export const SERIES = L.series;

const x = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#10;");
const r1 = v => Math.round(v * 10) / 10;

/** 대략적 글자 폭 (px) */
export function textWidth(s, fs) {
  let w = 0;
  for (const ch of String(s ?? "")) w += /[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/.test(ch) ? fs * 0.95 : /[A-Z0-9%]/.test(ch) ? fs * 0.62 : fs * 0.52;
  return w;
}
/** 폭에 맞춰 최대 maxLines 줄로 나눔 (넘치면 마지막 줄 말줄임) */
export function wrap(s, maxW, fs, maxLines = 2) {
  const words = String(s ?? "").split(/(\s+)/).filter(Boolean);
  const lines = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (textWidth(cur + w, fs) <= maxW || !cur.trim()) lines[lines.length - 1] = cur + w;
    else lines.push(w.trimStart());
  }
  const out = [];
  lines.forEach(l => {
    let buf = "";
    for (const ch of l) { if (textWidth(buf + ch, fs) > maxW && buf) { out.push(buf); buf = ch; } else buf += ch; }
    out.push(buf);
  });
  if (out.length > maxLines) { const cut = out.slice(0, maxLines); let last = cut[maxLines - 1]; while (textWidth(last + "…", fs) > maxW && last.length) last = last.slice(0, -1); cut[maxLines - 1] = last + "…"; return cut.map(s2 => s2.trim()); }
  return out.map(s2 => s2.trim());
}

const LABEL_MAX_LINES = 6;
/** 라벨 영역 폭: 기본값보다 긴 문항이 있으면 차트 폭의 42%까지 넓힘 */
export function fitLabelWidth(labels, base, width, fs) {
  const need = Math.max(0, ...labels.map(l => textWidth(l, fs)));
  return Math.round(Math.max(base, Math.min(need, width * 0.42)));
}
/** 행 배치: 문항 줄 수에 맞춘 행 높이·위치 */
export function rowLayout(labels, maxW, fs, minH, maxLines = LABEL_MAX_LINES) {
  const lines = labels.map(l => wrap(l, maxW, fs, maxLines));
  const hs = lines.map(ls => Math.max(minH, Math.ceil(ls.length * fs * 1.2 + 14)));
  const ys = [];
  let y = 0;
  hs.forEach(h => { ys.push(y); y += h; });
  return { lines, hs, ys, total: y };
}

const text = (tx, ty, s, { fs = 12, anchor = "start", weight = 400, fill = "#0b0b0b", baseline = "middle" } = {}) =>
  `<text x="${r1(tx)}" y="${r1(ty)}" font-size="${fs}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}">${x(s)}</text>`;
const multiline = (tx, ty, lines, opts = {}) => {
  const fs = opts.fs || 12, lh = fs * 1.2, y0 = ty - (lines.length - 1) * lh / 2;
  return lines.map((l, i) => text(tx, y0 + i * lh, l, opts)).join("");
};
const rect = (rx, ry, w, h, fill, extra = "") => `<rect x="${r1(rx)}" y="${r1(ry)}" width="${r1(Math.max(0, w))}" height="${r1(Math.max(0, h))}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, sw = 1, dash = "") => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
/** 왼쪽 기준선에서 자라는 가로 막대 (데이터 끝만 둥글게) */
function hBarPath(x0, y, w, h, fill, rad = 4) {
  if (w <= 0) return "";
  const r = Math.min(rad, w, h / 2);
  const x1 = x0 + w;
  return `<path class="m" d="M${r1(x0)} ${r1(y)}H${r1(x1 - r)}Q${r1(x1)} ${r1(y)} ${r1(x1)} ${r1(y + r)}V${r1(y + h - r)}Q${r1(x1)} ${r1(y + h)} ${r1(x1 - r)} ${r1(y + h)}H${r1(x0)}Z" fill="${fill}"/>`;
}
/** 툴팁 그룹 (값 줄 먼저 굵게 표시되도록 "이름\n값") */
const tip = (label, value, inner, hit) => `<g class="viz-mark" data-tip="${x(`${label}\n${value}`)}">${hit || ""}${inner}</g>`;
const hitRect = (hx, hy, w, h) => rect(hx, hy, w, h, "transparent", `pointer-events="all"`);

function wrapSvg(T, w, h, body, ariaLabel = "") {
  return {
    width: w, height: Math.round(h),
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round(h)}" viewBox="0 0 ${w} ${Math.round(h)}" font-family="${x(FONT)}" role="img"${ariaLabel ? ` aria-label="${x(ariaLabel)}"` : ""}><rect width="100%" height="100%" fill="${T.surface}"/>${body}</svg>`,
  };
}

function legend(T, entries, lx, ly, maxW, fs = 11, shape = "rect") {
  let cx = lx, cy = ly, out = "";
  entries.forEach(([label, color]) => {
    const w = 12 + 6 + textWidth(label, fs) + 18;
    if (cx + w > lx + maxW && cx > lx) { cx = lx; cy += fs + 10; }
    const sw = shape === "dot"
      ? `<circle cx="${r1(cx + 6)}" cy="${r1(cy)}" r="5" fill="${color}" stroke="${T.surface}" stroke-width="2"/>`
      : rect(cx, cy - 6, 12, 12, color, `rx="2"${color === T.surface || color === T.div[3]?.[1] ? ` stroke="${T.axis}" stroke-width="1"` : ""}`);
    out += sw + text(cx + 18, cy, label, { fs, fill: T.sub });
    cx += w;
  });
  return { svg: out, bottom: cy + fs };
}

const ticksFor = (min, max, n = 5) => Array.from({ length: n + 1 }, (_, i) => min + (max - min) * i / n);
const niceStep = raw => { const p = 10 ** Math.floor(Math.log10(raw || 1)); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
const tickLabel = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * 가로 막대 (문항 순위, 응답자 특성, 키워드 등) — 단일 계열: 한 가지 색
 * @param {{label:string, value:number, sub?:string, color?:string}[]} data
 */
export function hbar(data, { width = 720, max = null, min = 0, refValue = null, refLabel = "", valueFmt = v => v.toFixed(1), unit = "", barColor = null, labelWidth = 220, title = "", theme = "light" } = {}) {
  const T = themeOf(theme);
  const fs = 13, barH = 20;
  const hasRef = refValue !== null && Number.isFinite(refValue);
  const top = (title ? 34 : 12) + (hasRef ? 18 : 0), bottom = 30;
  // 최댓값을 지정하지 않으면 1·2·5 단위의 보기 좋은 눈금으로 축 결정
  const auto = max === null || max === undefined;
  const dataMax = Math.max(1, ...data.map(d => (Number.isFinite(d.value) ? d.value : 0)));
  const step = auto ? niceStep((dataMax - min) / 5) : 0;
  const mx = auto ? min + Math.ceil((dataMax * 1.08 - min) / step) * step : max;
  const ticks = auto ? Array.from({ length: Math.round((mx - min) / step) + 1 }, (_, i) => min + i * step) : ticksFor(min, mx);
  const lw = fitLabelWidth(data.map(d => d.label), labelWidth, width, fs);
  const Lay = rowLayout(data.map(d => d.label), lw, fs, 34);
  const plotX = lw + 12, plotW = width - plotX - 76;
  const sx = v => plotX + (Math.max(min, Math.min(mx, v)) - min) / (mx - min) * plotW;
  const plotH = Lay.total;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700, fill: T.ink }) : "";
  ticks.forEach(v => { const gx = sx(v); b += line(gx, top, gx, top + plotH, T.grid) + text(gx, top + plotH + 14, tickLabel(v), { fs: 11, anchor: "middle", fill: T.muted }); });
  data.forEach((d, i) => {
    const cy = top + Lay.ys[i] + Lay.hs[i] / 2;
    const w = sx(d.value) - plotX;
    const val = `${Number.isFinite(d.value) ? valueFmt(d.value) : "-"}${unit}`;
    const inner = multiline(lw, cy, Lay.lines[i], { fs, anchor: "end", fill: T.ink }) +
      hBarPath(plotX, cy - barH / 2, w, barH, d.color || barColor || T.accent) +
      text(plotX + w + 6, cy, `${val}${d.sub ? ` ${d.sub}` : ""}`, { fs: 12, weight: 600, fill: T.ink });
    b += tip(d.label, val, inner, hitRect(0, top + Lay.ys[i], width, Lay.hs[i]));
  });
  b += line(plotX, top, plotX, top + plotH, T.axis);
  if (hasRef) {
    const rx = sx(refValue);
    b += line(rx, top - 6, rx, top + plotH, T.ink, 1.5, "5,4") + text(rx, top - 12, `${refLabel} ${valueFmt(refValue)}`, { fs: 11, anchor: "middle", weight: 600, fill: T.ink });
  }
  return wrapSvg(T, width, top + plotH + bottom, b, title);
}

/**
 * 발산형 누적 막대 (척도 응답 분포) — 부정(왼쪽)·중립·긍정(오른쪽)
 * @param {{label:string, pct:number[], n?:number}[]} rows  pct: 낮은 점수→높은 점수
 */
export function likertDiverging(rows, levelLabels, { width = 720, labelWidth = 200, title = "", theme = "light" } = {}) {
  const T = themeOf(theme);
  const k = levelLabels.length, pal = divergingFor(k, T);
  const fs = 13, barH = 24, top = title ? 40 : 16;
  const mid = (k - 1) / 2;
  const negOf = p => p.reduce((s, v, i) => s + (i < mid ? v : i === mid ? v / 2 : 0), 0);
  const maxNeg = Math.max(50, ...rows.map(r => negOf(r.pct)));
  const maxPos = Math.max(50, ...rows.map(r => 100 - negOf(r.pct)));
  const lw = fitLabelWidth(rows.map(r => r.label), labelWidth, width, fs);
  const Lay = rowLayout(rows.map(r => r.label), lw, fs, 36);
  const plotX = lw + 12, plotW = width - plotX - 56;
  const scale = plotW / (maxNeg + maxPos), zero = plotX + maxNeg * scale;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700, fill: T.ink }) : "";
  b += line(zero, top - 6, zero, top + Lay.total + 6, T.axis, 1);
  rows.forEach((r, i) => {
    const cy = top + Lay.ys[i] + Lay.hs[i] / 2;
    b += multiline(lw, cy, Lay.lines[i], { fs, anchor: "end", fill: T.ink });
    let cx = zero - negOf(r.pct) * scale;
    r.pct.forEach((p, j) => {
      const w = p * scale;
      if (w > 0.5) {
        const segW = Math.max(0.5, w - 2); // 2px 표면 간격
        const lbl = `${Math.round(p)}`;
        const fits = textWidth(lbl, 11) + 8 <= segW;
        const inner = rect(cx + 1, cy - barH / 2, segW, barH, pal[j], `class="m"`) + (fits && p >= 5 ? text(cx + 1 + segW / 2, cy, lbl, { fs: 11, anchor: "middle", fill: inkOn(pal[j]), weight: 600 }) : "");
        b += tip(`${r.label} · ${levelLabels[j]}`, `${p.toFixed(1)}%`, inner);
      }
      cx += w;
    });
    if (r.n !== undefined) b += text(width - 4, cy, `n=${r.n}`, { fs: 10, anchor: "end", fill: T.muted });
  });
  const bottomY = top + Lay.total;
  const lg = legend(T, levelLabels.map((l, i) => [l, pal[i]]), plotX, bottomY + 20, width - plotX);
  return wrapSvg(T, width, lg.bottom + 12, b + lg.svg, title);
}

/**
 * 덤벨 차트 (사전 → 사후) — 한 색상 두 단계
 * @param {{label:string, pre:number, post:number, sig?:boolean}[]} rows
 */
export function dumbbell(rows, { width = 720, min = 1, max = 5, labelWidth = 200, title = "", valueFmt = v => v.toFixed(2), theme = "light" } = {}) {
  const T = themeOf(theme);
  const fs = 13, top = title ? 40 : 18;
  const lw = fitLabelWidth(rows.map(r => r.label), labelWidth, width, fs);
  const Lay = rowLayout(rows.map(r => r.label), lw, fs, 38);
  const plotX = lw + 16, plotW = width - plotX - 70;
  const sx = v => plotX + (v - min) / (max - min) * plotW;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700, fill: T.ink }) : "";
  const steps = max - min <= 10 ? max - min : 5;
  ticksFor(min, max, steps).forEach(v => { const gx = sx(v); b += line(gx, top, gx, top + Lay.total, T.grid) + text(gx, top + Lay.total + 14, tickLabel(v), { fs: 11, anchor: "middle", fill: T.muted }); });
  rows.forEach((r, i) => {
    const cy = top + Lay.ys[i] + Lay.hs[i] / 2;
    const a = sx(r.pre), c = sx(r.post);
    const up = r.post >= r.pre;
    const inner = multiline(lw, cy, Lay.lines[i], { fs, anchor: "end", fill: T.ink }) +
      line(a, cy, c, cy, T.axis, 3) +
      `<circle class="m" cx="${r1(a)}" cy="${r1(cy)}" r="6" fill="${T.accentSoft}" stroke="${T.surface}" stroke-width="2"/>` +
      `<circle class="m" cx="${r1(c)}" cy="${r1(cy)}" r="7" fill="${T.accent}" stroke="${T.surface}" stroke-width="2"/>` +
      text(Math.min(a, c) - 12, cy, valueFmt(up ? r.pre : r.post), { fs: 11, anchor: "end", fill: T.muted }) +
      text(Math.max(a, c) + 12, cy, valueFmt(up ? r.post : r.pre) + (r.sig ? " *" : ""), { fs: 12, weight: 700, fill: T.ink });
    b += tip(r.label, `사전 ${valueFmt(r.pre)} → 사후 ${valueFmt(r.post)} (${r.post - r.pre >= 0 ? "+" : ""}${(r.post - r.pre).toFixed(2)})${r.sig ? " · 유의함" : ""}`, inner, hitRect(0, top + Lay.ys[i], width, Lay.hs[i]));
  });
  const bottomY = top + Lay.total + 22;
  const lg = legend(T, [["사전", T.accentSoft], ["사후", T.accent]], plotX, bottomY + 12, plotW, 11, "dot");
  return wrapSvg(T, width, lg.bottom + 12, b + lg.svg, title);
}

const STATUS_ICON = { good: "✓", warning: "△", critical: "✕" };

/**
 * 성과지표 불릿 차트 (달성률) — 상태색 + 아이콘·글자
 * @param {{label:string, rate:number}[]} rows
 */
export function kpiBullet(rows, { width = 720, labelWidth = 230, title = "", maxRate = 150, mostly = 90, theme = "light" } = {}) {
  const T = themeOf(theme);
  const fs = 13, top = title ? 44 : 24;
  const lw = fitLabelWidth(rows.map(r => r.label), labelWidth, width, fs);
  const Lay = rowLayout(rows.map(r => r.label), lw, fs, 38);
  const plotX = lw + 12, plotW = width - plotX - 92;
  const sx = v => plotX + Math.max(0, Math.min(maxRate, v)) / maxRate * plotW;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700, fill: T.ink }) : "";
  rows.forEach((r, i) => {
    const cy = top + Lay.ys[i] + Lay.hs[i] / 2;
    const ok = Number.isFinite(r.rate);
    const st = !ok ? null : r.rate >= 100 ? "good" : r.rate >= mostly ? "warning" : "critical";
    const judge = !ok ? "측정 불가" : st === "good" ? "달성" : st === "warning" ? "대체로 달성" : "미달성";
    const inner = multiline(lw, cy, Lay.lines[i], { fs, anchor: "end", fill: T.ink }) +
      rect(plotX, cy - 13, sx(mostly) - plotX, 26, T.bands[0]) + rect(sx(mostly), cy - 13, sx(100) - sx(mostly), 26, T.bands[1]) + rect(sx(100), cy - 13, sx(maxRate) - sx(100), 26, T.bands[2]) +
      (ok ? hBarPath(plotX, cy - 6, sx(r.rate) - plotX, 12, T.status[st]) : "") +
      text(sx(maxRate) + 8, cy, ok ? `${STATUS_ICON[st]} ${r.rate.toFixed(1)}%${r.rate > maxRate ? "▶" : ""}` : "측정 불가", { fs: 12, weight: 700, fill: ok ? T.ink : T.muted });
    b += tip(r.label, ok ? `달성률 ${r.rate.toFixed(1)}% · ${judge}` : "측정 불가", inner, hitRect(0, top + Lay.ys[i], width, Lay.hs[i]));
  });
  const bottomY = top + Lay.total;
  b += line(sx(100), top - 6, sx(100), bottomY + 4, T.ink, 2) + text(sx(100), top - 13, "목표 100%", { fs: 11, anchor: "middle", weight: 700, fill: T.ink });
  b += line(sx(mostly), top, sx(mostly), bottomY, T.muted, 1) + text(sx(mostly), bottomY + 14, `${mostly}%`, { fs: 10, anchor: "middle", fill: T.muted });
  const lg = legend(T, [[`${STATUS_ICON.good} 달성(100% 이상)`, T.status.good], [`${STATUS_ICON.warning} 대체로 달성(${mostly}~99%)`, T.status.warning], [`${STATUS_ICON.critical} 미달성`, T.status.critical]], plotX, bottomY + 34, width - plotX);
  return wrapSvg(T, width, lg.bottom + 12, b + lg.svg, title);
}

/**
 * IPA 사분면 산점도 (x: 중요도, y: 만족도) — 집중 개선 영역만 강조색
 * 점에는 번호만 적고, 전체 문항명은 그림 아래 번호표로 제시(문항명이 잘리거나 겹치지 않도록)
 * @param {{label:string, importance:number, performance:number}[]} points
 */
export function ipaScatter(points, { width = 720, height = 460, meanI, meanP, title = "", theme = "light" } = {}) {
  const T = themeOf(theme);
  const pad = { l: 64, r: 30, t: title ? 44 : 24, b: 50 };
  const xs = points.map(p => p.importance), ys = points.map(p => p.performance);
  const xmin = Math.min(...xs, meanI) - 0.05, xmax = Math.max(...xs, meanI) + 0.05;
  const ymin = Math.max(0, Math.min(...ys, meanP) - 5), ymax = Math.min(100, Math.max(...ys, meanP) + 5);
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const sx = v => pad.l + (v - xmin) / (xmax - xmin) * W, sy = v => pad.t + H - (v - ymin) / (ymax - ymin) * H;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700, fill: T.ink }) : "";
  b += rect(sx(meanI), sy(meanP), pad.l + W - sx(meanI), pad.t + H - sy(meanP), T.wash);
  [xmin, (xmin + xmax) / 2, xmax].forEach(v => { b += line(sx(v), pad.t, sx(v), pad.t + H, T.grid) + text(sx(v), pad.t + H + 14, v.toFixed(2), { fs: 10, anchor: "middle", fill: T.muted }); });
  [ymin, (ymin + ymax) / 2, ymax].forEach(v => { b += line(pad.l, sy(v), pad.l + W, sy(v), T.grid) + text(pad.l - 6, sy(v), v.toFixed(0), { fs: 10, anchor: "end", fill: T.muted }); });
  b += rect(pad.l, pad.t, W, H, "none", `stroke="${T.axis}" stroke-width="1"`);
  b += line(sx(meanI), pad.t, sx(meanI), pad.t + H, T.sub, 1, "5,4") + line(pad.l, sy(meanP), pad.l + W, sy(meanP), T.sub, 1, "5,4");
  const q = (tx, ty, s, anchor) => text(tx, ty, s, { fs: 12, weight: 700, fill: T.sub, anchor });
  b += q(pad.l + W - 8, pad.t + 16, "유지·강화", "end") + q(pad.l + W - 8, pad.t + H - 12, "집중 개선", "end") + q(pad.l + 8, pad.t + 16, "과잉 투자 점검", "start") + q(pad.l + 8, pad.t + H - 12, "점진 개선", "start");
  points.forEach((p, i) => {
    const px = sx(p.importance), py = sy(p.performance);
    const focus = p.importance >= meanI && p.performance < meanP;
    const nearRight = px + 22 > pad.l + W - 4;
    const inner = `<circle class="m" cx="${r1(px)}" cy="${r1(py)}" r="6" fill="${focus ? T.emphasis : T.accent}" stroke="${T.surface}" stroke-width="2"/>` +
      text(nearRight ? px - 9 : px + 9, py - 9, String(i + 1), { fs: 11, anchor: nearRight ? "end" : "start", fill: T.ink, weight: 700 });
    b += tip(`${i + 1}. ${p.label}`, `만족도 ${p.performance.toFixed(2)}점 · 중요도 ${p.importance.toFixed(2)}${focus ? " · 집중 개선" : ""}`, inner, `<circle cx="${r1(px)}" cy="${r1(py)}" r="14" fill="transparent" pointer-events="all"/>`);
  });
  b += text(pad.l + W / 2, height - 12, "중요도 (전반 만족도와의 상관계수)", { fs: 12, anchor: "middle", fill: T.sub });
  b += `<text transform="translate(16 ${pad.t + H / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${T.sub}">만족도 (100점 환산)</text>`;
  // 번호표 (2단)
  const kfs = 11.5, colW = (width - pad.l - 10) / 2, keyTop = height + 4;
  const entries = points.map((p, i) => wrap(`${i + 1}. ${p.label}`, colW - 14, kfs, 4));
  let keyH = 0;
  for (let i = 0; i < entries.length; i += 2) {
    const rowH = Math.max(entries[i].length, entries[i + 1]?.length || 0) * kfs * 1.25 + 6;
    [0, 1].forEach(k => {
      const e = entries[i + k];
      if (!e) return;
      const focus = points[i + k].importance >= meanI && points[i + k].performance < meanP;
      e.forEach((ln, li) => { b += text(pad.l + k * colW, keyTop + keyH + kfs * 0.7 + li * kfs * 1.25, ln, { fs: kfs, fill: T.ink, weight: focus ? 700 : 400 }); });
    });
    keyH += rowH;
  }
  return wrapSvg(T, width, keyTop + keyH + 8, b, title);
}

/** NPS 100% 누적 막대 (비추천·중립·추천 = 발산 3단계) */
export function npsBar({ detractors, passives, promoters, nps, n }, { width = 720, title = "", theme = "light" } = {}) {
  const T = themeOf(theme);
  const pal = T.div[3];
  const top = title ? 40 : 16, plotX = 20, plotW = width - 40, h = 36;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700, fill: T.ink }) : "";
  const parts = [["비추천(0~6)", detractors, pal[0]], ["중립(7~8)", passives, pal[1]], ["추천(9~10)", promoters, pal[2]]];
  let cx = plotX;
  parts.forEach(([label, p, c]) => {
    const w = p / 100 * plotW;
    if (w > 0.5) {
      const segW = Math.max(0.5, w - 2);
      const lbl = `${p.toFixed(1)}%`;
      const inner = rect(cx + 1, top, segW, h, c, `class="m"`) + (textWidth(lbl, 13) + 10 <= segW ? text(cx + 1 + segW / 2, top + h / 2, lbl, { fs: 13, anchor: "middle", weight: 700, fill: inkOn(c) }) : "");
      b += tip(label, `${p.toFixed(1)}%`, inner);
    }
    cx += w;
  });
  b += text(width / 2, top + h + 26, `NPS ${nps >= 0 ? "+" : ""}${nps.toFixed(1)}  (추천 ${promoters.toFixed(1)}% − 비추천 ${detractors.toFixed(1)}%, n=${n})`, { fs: 13, anchor: "middle", weight: 700, fill: T.ink });
  const lg = legend(T, parts.map(p => [p[0], p[2]]), plotX, top + h + 52, plotW);
  return wrapSvg(T, width, lg.bottom + 10, b + lg.svg, title);
}

/**
 * 집단 비교 (묶은 가로 막대): categories × series — 계열색 고정 순서
 * @param {string[]} categories
 * @param {{name:string, values:number[]}[]} series
 */
export function groupedHbar(categories, series, { width = 720, max = 100, labelWidth = 180, title = "", valueFmt = v => v.toFixed(1), theme = "light" } = {}) {
  const T = themeOf(theme);
  const fs = 12, barH = Math.max(10, Math.min(18, 48 / series.length)), gap = 16;
  const top = title ? 40 : 12;
  const lw = fitLabelWidth(categories, labelWidth, width, fs);
  const Lay = rowLayout(categories, lw, fs, barH * series.length + gap);
  const plotX = lw + 12, plotW = width - plotX - 56;
  const sx = v => plotX + Math.max(0, Math.min(max, v)) / max * plotW;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700, fill: T.ink }) : "";
  ticksFor(0, max).forEach(v => { const gx = sx(v); b += line(gx, top, gx, top + Lay.total, T.grid) + text(gx, top + Lay.total + 12, tickLabel(v), { fs: 10, anchor: "middle", fill: T.muted }); });
  categories.forEach((c, i) => {
    const gh = Lay.hs[i], gy = top + Lay.ys[i];
    const barsTop = gy + (gh - barH * series.length) / 2;
    b += multiline(lw, gy + gh / 2, Lay.lines[i], { fs, anchor: "end", fill: T.ink });
    series.forEach((s, j) => {
      const v = s.values[i], by = barsTop + j * barH;
      if (!Number.isFinite(v)) return;
      const inner = hBarPath(plotX, by + 1, sx(v) - plotX, barH - 2, T.series[j % T.series.length], 3) + text(sx(v) + 4, by + barH / 2, valueFmt(v), { fs: 10, fill: T.sub });
      b += tip(`${c} · ${s.name}`, valueFmt(v), inner, hitRect(plotX - 4, by, plotW + 60, barH));
    });
  });
  b += line(plotX, top, plotX, top + Lay.total, T.axis);
  const lg = legend(T, series.map((s, j) => [s.name, T.series[j % T.series.length]]), plotX, top + Lay.total + 32, width - plotX);
  return wrapSvg(T, width, lg.bottom + 10, b + lg.svg, title);
}

/**
 * 시계열 선 그래프(면적 채움) — 일별 추이(방문·오류 등). 점이 많으면 x축 글자는 겹치지 않게 듬성듬성 표시.
 * @param {{label:string, value:number}[]} rows  시간 순서대로(과거→최근)
 * @param {{refValue?:number, refLabel?:string}} o  refValue: 평균 등 기준선(점선)
 */
export function trendLine(rows, { width = 720, height = 220, valueFmt = v => v.toFixed(0), unit = "", title = "", refValue = null, refLabel = "", theme = "light" } = {}) {
  const T = themeOf(theme);
  const pad = { l: 40, r: 16, t: title ? 36 : 14, b: 30 };
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const vals = rows.map(r => (Number.isFinite(r.value) ? r.value : 0));
  const dataMax = Math.max(1, ...vals);
  const step = niceStep(dataMax / 4);
  const ymax = Math.ceil((dataMax * 1.1) / step) * step;
  const n = Math.max(1, rows.length - 1);
  const sx = i => pad.l + (n ? i / n * W : 0);
  const sy = v => pad.t + H - Math.max(0, Math.min(ymax, v)) / ymax * H;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700, fill: T.ink }) : "";
  ticksFor(0, ymax, 4).forEach(v => { const gy = sy(v); b += line(pad.l, gy, pad.l + W, gy, T.grid) + text(pad.l - 8, gy, tickLabel(v), { fs: 10, anchor: "end", fill: T.muted }); });
  // x축 글자: 8개 안팎으로만(라벨이 많으면 겹침) — 처음·마지막은 항상, 중간은 균등 간격으로 골라냄
  const labelEvery = Math.max(1, Math.ceil(rows.length / 7));
  rows.forEach((r, i) => { if (i % labelEvery === 0 || i === rows.length - 1) b += text(sx(i), pad.t + H + 16, r.label, { fs: 10, anchor: "middle", fill: T.muted }); });
  if (rows.length > 1) {
    const pts = rows.map((r, i) => [sx(i), sy(r.value)]);
    const areaD = `M${r1(pts[0][0])} ${r1(pad.t + H)} ` + pts.map(p => `L${r1(p[0])} ${r1(p[1])}`).join(" ") + ` L${r1(pts[pts.length - 1][0])} ${r1(pad.t + H)} Z`;
    b += `<path d="${areaD}" fill="${T.accentSoft}" opacity=".22"/>`;
    b += `<path d="M${pts.map(p => `${r1(p[0])} ${r1(p[1])}`).join(" L")}" fill="none" stroke="${T.accent}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  if (refValue !== null && Number.isFinite(refValue)) {
    const ry = sy(refValue);
    b += line(pad.l, ry, pad.l + W, ry, T.sub, 1, "4,3") + text(pad.l + W, ry - 6, `${refLabel} ${valueFmt(refValue)}${unit}`, { fs: 10, anchor: "end", weight: 600, fill: T.sub });
  }
  // 점(마커)은 항상 그리되, 점이 너무 많으면(>40) 툴팁 히트 영역만 남기고 원은 마지막 점만 강조
  const showDot = rows.length <= 40;
  rows.forEach((r, i) => {
    const [px, py] = [sx(i), sy(r.value)];
    const dot = (showDot || i === rows.length - 1) ? `<circle class="m" cx="${r1(px)}" cy="${r1(py)}" r="${i === rows.length - 1 ? 4 : 2.5}" fill="${T.accent}" stroke="${T.surface}" stroke-width="1.5"/>` : "";
    b += tip(r.label, `${valueFmt(r.value)}${unit}`, dot, `<rect x="${r1(px - (W / n) / 2)}" y="${pad.t}" width="${r1(Math.max(4, W / n))}" height="${H}" fill="transparent" pointer-events="all"/>`);
  });
  b += line(pad.l, pad.t, pad.l, pad.t + H, T.axis);
  return wrapSvg(T, width, height, b, title);
}

/**
 * 세로 막대(간격 규칙적인 범주 — 시간대 등) — 막대 위쪽만 4px 둥글림
 * @param {{label:string, value:number}[]} data
 */
export function vbar(data, { width = 720, height = 160, valueFmt = v => v.toFixed(0), unit = "", title = "", theme = "light", barColor = null } = {}) {
  const T = themeOf(theme);
  const pad = { l: 34, r: 8, t: title ? 32 : 10, b: 26 };
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const dataMax = Math.max(1, ...data.map(d => (Number.isFinite(d.value) ? d.value : 0)));
  const step = niceStep(dataMax / 3);
  const ymax = Math.ceil((dataMax * 1.15) / step) * step;
  const n = data.length, gap = Math.min(6, W / n * 0.25), barW = W / n - gap;
  const sy = v => pad.t + H - Math.max(0, Math.min(ymax, v)) / ymax * H;
  let b = title ? text(0, 14, title, { fs: 14, weight: 700, fill: T.ink }) : "";
  ticksFor(0, ymax, 3).forEach(v => { const gy = sy(v); b += line(pad.l, gy, pad.l + W, gy, T.grid) + text(pad.l - 6, gy, tickLabel(v), { fs: 10, anchor: "end", fill: T.muted }); });
  const peak = Math.max(...data.map(d => d.value || 0));
  data.forEach((d, i) => {
    const bx = pad.l + i * (barW + gap) + gap / 2, by = sy(d.value), bh = pad.t + H - by;
    const isPeak = d.value === peak && peak > 0;
    const r = Math.min(3, barW / 2, bh);
    const path = bh > 0 ? `<path class="m" d="M${r1(bx)} ${r1(pad.t + H)}V${r1(by + r)}Q${r1(bx)} ${r1(by)} ${r1(bx + r)} ${r1(by)}H${r1(bx + barW - r)}Q${r1(bx + barW)} ${r1(by)} ${r1(bx + barW)} ${r1(by + r)}V${r1(pad.t + H)}Z" fill="${isPeak ? T.emphasis : (barColor || T.accent)}"/>` : "";
    b += tip(d.label, `${valueFmt(d.value)}${unit}`, path, `<rect x="${r1(bx - gap / 2)}" y="${pad.t}" width="${r1(barW + gap)}" height="${H}" fill="transparent" pointer-events="all"/>`);
    if (n <= 24) b += text(bx + barW / 2, pad.t + H + 14, d.label, { fs: n > 12 ? 8.5 : 10, anchor: "middle", fill: T.muted });
  });
  b += line(pad.l, pad.t, pad.l, pad.t + H, T.axis) + line(pad.l, pad.t + H, pad.l + W, pad.t + H, T.axis);
  return wrapSvg(T, width, height, b, title);
}
