// 화면 테마: system(기본) → light → dark 순환. <html data-theme> 로 표시(초기값은 boot-check.js 가 첫 화면 전에 적용)
const KEY = "survey-v5-theme";
const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

export function themePref() {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "system"; } catch { return "system"; }
}
/** 실제 적용 중인 테마 */
export const resolvedTheme = () => { const p = themePref(); return p === "system" ? (mq?.matches ? "dark" : "light") : p; };

function apply() {
  const p = themePref(), root = document.documentElement;
  if (p === "system") delete root.dataset.theme; else root.dataset.theme = p;
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.content = resolvedTheme() === "dark" ? "#111412" : "#006D3A";
}

export function cycleTheme() {
  const next = { system: "light", light: "dark", dark: "system" }[themePref()];
  try { if (next === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch { /* 저장 불가 — 이번 화면에만 적용 */ document.documentElement.dataset.theme = next === "system" ? "" : next; }
  apply();
  return next;
}

export function setTheme(pref) {
  const next = ["system", "light", "dark"].includes(pref) ? pref : "system";
  try { if (next === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); }
  catch { document.documentElement.dataset.theme = next === "system" ? "" : next; }
  apply();
  return next;
}

export const THEME_LABEL = { system: "시스템 설정", light: "밝은 화면", dark: "어두운 화면" };

/** 시스템 설정 변경 시 다시 그리기 */
export function watchSystemTheme(onChange) {
  apply();
  mq?.addEventListener?.("change", () => { if (themePref() === "system") { apply(); onChange(); } });
}
