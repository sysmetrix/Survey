// 해시 라우터: #/load, #/setup, #/business, #/dash/<tab>, #/report
export const STEPS = [
  { id: "load", label: "불러오기", n: 1 },
  { id: "setup", label: "데이터 설정", n: 2 },
  { id: "business", label: "사업정보·성과지표", n: 3 },
  { id: "dash", label: "분석 결과", n: 4 },
  { id: "report", label: "보고서", n: 5 },
];

export function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const view = STEPS.some(s => s.id === parts[0]) ? parts[0] : "load";
  return { view, sub: parts[1] || "" };
}

let renderer = null;
export const setRenderer = fn => { renderer = fn; };
/** 현재 화면 다시 그리기 (스크롤 유지) */
export const refresh = () => renderer && renderer({ keepScroll: true });

export function go(view, sub = "") {
  const h = `#/${view}${sub ? `/${encodeURIComponent(sub)}` : ""}`;
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = h;
}
