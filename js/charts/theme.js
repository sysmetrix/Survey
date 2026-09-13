// 차트 테마 토큰 (dataviz 스킬 기준 팔레트 — scripts/validate_palette.js 로 검증된 값)
//  categorical: 라이트 8색 모두 밴드·채도·CVD(인접 ΔE 9.1)·일반시력(19.6) 통과, 대비 3:1 미만 3색은 값 라벨·표로 보완
//  diverging: 파랑↔빨강(OKLCH 명도 대칭 0.43/0.58/0.72) + 회색 중앙
//  status: good/warning/critical 고정 — 항상 아이콘·글자와 함께 사용

const LIGHT = {
  name: "light",
  surface: "#FFFFFF", plane: "#f9f9f7",
  ink: "#0b0b0b", sub: "#52514e", muted: "#6f6d68", grid: "#e1e0d9", axis: "#c3c2b7",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  accent: "#2a78d6", accentSoft: "#86b6ef", emphasis: "#eb6834", deemph: "#c3c2b7",
  div: {
    7: ["#892b2a", "#c74845", "#e4857e", "#f0efec", "#6da7ec", "#2a78d6", "#184f95"],
    5: ["#892b2a", "#e4857e", "#f0efec", "#6da7ec", "#184f95"],
    4: ["#892b2a", "#e4857e", "#6da7ec", "#184f95"],
    3: ["#c74845", "#f0efec", "#2a78d6"],
    2: ["#c74845", "#2a78d6"],
  },
  status: { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" },
  bands: ["#f1f0ec", "#e6e5df", "#f7f6f3"],
  wash: "rgba(235,104,52,0.10)",
};

const DARK = {
  name: "dark",
  surface: "#1a1a19", plane: "#0d0d0d",
  ink: "#ffffff", sub: "#c3c2b7", muted: "#a3a19a", grid: "#2c2c2a", axis: "#4a4a47",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  accent: "#3987e5", accentSoft: "#1c5cab", emphasis: "#d95926", deemph: "#4a4a47",
  div: {
    7: ["#ea9a93", "#d75853", "#9e3432", "#383835", "#1c5cab", "#3987e5", "#86b6ef"],
    5: ["#ea9a93", "#9e3432", "#383835", "#1c5cab", "#86b6ef"],
    4: ["#ea9a93", "#9e3432", "#1c5cab", "#86b6ef"],
    3: ["#d75853", "#383835", "#3987e5"],
    2: ["#d75853", "#3987e5"],
  },
  status: { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" },
  bands: ["#242423", "#2f2f2d", "#1f1f1e"],
  wash: "rgba(217,89,38,0.14)",
};

export const THEMES = { light: LIGHT, dark: DARK };
export const themeOf = t => (t && typeof t === "object" ? t : THEMES[t] || LIGHT);

const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function luminance(hex) {
  const h = String(hex).replace("#", "");
  if (h.length !== 6) return 0.5;
  const [r, g, b] = [0, 2, 4].map(i => lin(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** 채움 위 글자색: 대비가 더 큰 쪽 */
export const inkOn = fill => (contrast(fill, "#0b0b0b") >= contrast(fill, "#ffffff") ? "#0b0b0b" : "#ffffff");

/** 척도 단계 수에 맞는 발산 팔레트 (6단계 등은 7단계에서 중앙 제외) */
export function divergingFor(k, T) {
  if (T.div[k]) return T.div[k];
  if (k === 6) { const d = T.div[7]; return [d[0], d[1], d[2], d[4], d[5], d[6]]; }
  return T.series.slice(0, k);
}
