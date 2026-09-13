// 앱 진입점: 화면 전환·이벤트 위임 (인라인 핸들러 없음 — CSP script-src 'self')
import { state } from "./ui/store.js";
import { STEPS, parseHash, go, setRenderer, refresh } from "./ui/router.js";
import { toast, esc } from "./ui/util.js";
import * as load from "./ui/views/load.js";
import * as setup from "./ui/views/setup.js";
import * as business from "./ui/views/business.js";
import * as dash from "./ui/views/dash.js";
import * as report from "./ui/views/report.js";

export const APP_VERSION = "5.1.0";
const VIEWS = { load, setup, business, dash, report };
let current = load, currentId = "";

function render({ keepScroll = false } = {}) {
  const { view, sub } = parseHash();
  const id = view !== "load" && !state.dataset ? "load" : view;
  const changed = id !== currentId;
  current = VIEWS[id]; currentId = id;
  const y = window.scrollY;
  document.getElementById("steps").innerHTML = STEPS.map(s => {
    const disabled = s.id !== "load" && !state.dataset;
    return `<button class="step${s.id === id ? " on" : ""}" ${disabled ? "disabled" : ""} data-act="goto" data-to="${s.id}"><i>${s.n}</i>${esc(s.label)}</button>`;
  }).join("");
  const main = document.getElementById("main");
  try {
    main.innerHTML = current.render({ sub });
  } catch (e) {
    console.error(e);
    main.innerHTML = `<section class="card"><h2>화면을 표시하지 못했습니다</h2><p class="bad-text">${esc(e.message)}</p><p class="muted small">데이터 설정(열 역할·척도)을 확인하거나 파일을 다시 불러오세요.</p><button class="btn" data-act="goto" data-to="setup">데이터 설정으로</button></section>`;
  }
  if (keepScroll && !changed) window.scrollTo(0, y);
  else if (changed) window.scrollTo(0, 0);
}
setRenderer(render);
window.addEventListener("hashchange", () => render());

const handler = name => current.actions?.[name] || GLOBAL[name];
const GLOBAL = {
  goto: el => go(el.dataset.to, el.dataset.sub || ""),
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = handler(el.dataset.act);
  if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch(err => { console.error(err); toast(err.message, "bad"); }); }
});
document.addEventListener("change", e => {
  const el = e.target.closest("[data-change]");
  if (!el) return;
  const fn = handler(el.dataset.change);
  if (fn) Promise.resolve(fn(el, e)).catch(err => { console.error(err); toast(err.message, "bad"); });
});
// 드래그 앤 드롭
document.addEventListener("dragover", e => { const z = e.target.closest("[data-drop]"); if (z) { e.preventDefault(); z.classList.add("over"); } });
document.addEventListener("dragleave", e => { const z = e.target.closest("[data-drop]"); if (z) z.classList.remove("over"); });
document.addEventListener("drop", e => {
  const z = e.target.closest("[data-drop]");
  if (!z) return;
  e.preventDefault(); z.classList.remove("over");
  const f = e.dataTransfer.files?.[0];
  const fn = handler(`drop-${z.dataset.drop}`);
  if (f && fn) fn(f);
});
// 보고서 문장 직접 편집: 포커스 시 원문(**굵게** 표기 포함) 표시 → 포커스 해제 시 저장
document.addEventListener("focusin", e => {
  const el = e.target.closest("[data-edit]");
  if (el && el.dataset.editing !== "1") { el.dataset.editing = "1"; el.textContent = el.dataset.raw; }
});
document.addEventListener("focusout", e => {
  const el = e.target.closest("[data-edit]");
  if (!el) return;
  el.dataset.editing = "";
  const text = el.textContent.replace(/\s+/g, " ").trim();
  if (text !== el.dataset.raw) {
    if (text) state.overrides[el.dataset.edit] = text;
    else state.hidden = [...new Set([...state.hidden, el.dataset.edit])];
  }
  refresh();
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.closest?.("[data-edit]")) { e.preventDefault(); e.target.blur(); }
});
window.addEventListener("beforeunload", e => { if (state.dataset && (Object.keys(state.overrides).length || state.kpis.length)) { e.preventDefault(); e.returnValue = ""; } });

if (!window.XLSX || !window.Papa || !window.JSZip) toast("일부 라이브러리를 불러오지 못했습니다. 새로고침하세요.", "bad", 8000);
document.getElementById("ver").textContent = `v${APP_VERSION}`;
render();
