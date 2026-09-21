// 해시 라우터: #/load, #/setup, #/business, #/dash/<tab>, #/report, #/present/<슬라이드 번호>
export const STEPS = [
  { id: "load", label: "불러오기", n: 1 },
  { id: "setup", label: "데이터 설정", n: 2 },
  { id: "business", label: "성과지표(선택)", n: 3 },
  { id: "dash", label: "분석 결과", n: 4 },
  { id: "report", label: "보고서", n: 5 },
];
/** 단계 표시줄에 없는 화면 */
export const EXTRA_VIEWS = ["present", "presentEdit", "history", "settings", "updates", "login"];
/** 데이터 없이 열 수 있는 화면 */
export const NO_DATA_VIEWS = ["load", "history", "settings", "updates", "login"];

const EXTRA_LABELS = { present: "발표 모드", presentEdit: "슬라이드 편집", history: "작업 내역", settings: "로컬 설정", updates: "업데이트 내역", login: "로그인" };
/** 화면 이름 (돌아가기 버튼 등 안내 문구용) */
export const viewLabel = id => STEPS.find(s => s.id === id)?.label || EXTRA_LABELS[id] || "처음";

export function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const view = STEPS.some(s => s.id === parts[0]) || EXTRA_VIEWS.includes(parts[0]) ? parts[0] : "load";
  return { view, sub: parts[1] || "" };
}

// 직전에 머물던 화면 (설정·작업 내역에서 "돌아가기"에 사용)
let previous = "";
export const setPrevView = id => { if (id) previous = id; };
export const prevView = () => previous;

let renderer = null;
export const setRenderer = fn => { renderer = fn; };
/** 현재 화면 다시 그리기 (스크롤 유지) */
export const refresh = () => renderer && renderer({ keepScroll: true });

export function go(view, sub = "") {
  const h = `#/${view}${sub ? `/${encodeURIComponent(sub)}` : ""}`;
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = h;
}
