// 앱 진입점: 화면 전환·이벤트 위임 (인라인 핸들러 없음 — CSP script-src 'self')
import { state } from "./ui/store.js";
import { STEPS, NO_DATA_VIEWS, parseHash, go, setRenderer, setPrevView, prevView, refresh } from "./ui/router.js";
import { toast, esc } from "./ui/util.js";
import { icon } from "./ui/icons.js";
import { cycleTheme, themePref, THEME_LABEL, watchSystemTheme } from "./ui/theme.js";
import { initPwa, installApp } from "./ui/pwa.js";
import { installTooltips } from "./ui/tooltip.js";
import { installFormatToolbar } from "./ui/format-toolbar.js";
import { markupToHtml, htmlToMarkup } from "./ui/inline-edit.js";
import { installScrollHints } from "./ui/scrollhint.js";
import { initHistory, trackChange, resetTracking, saveSnapshot, undoChange, redoChange, canUndo, canRedo } from "./ui/history/manager.js";
import * as load from "./ui/views/load.js";
import * as setup from "./ui/views/setup.js";
import * as business from "./ui/views/business.js";
import * as dash from "./ui/views/dash.js";
import * as report from "./ui/views/report.js";
import * as present from "./ui/views/present.js";
import * as presentEdit from "./ui/views/present-edit.js";
import * as history from "./ui/views/history.js";
import * as settings from "./ui/views/settings.js";
import * as updates from "./ui/views/updates.js";
import { RELEASE_TAP_COUNT, hasReleaseAccess, grantReleaseAccess } from "./admin/access.js";
import { startGuide, syncGuide, offerFirstRun } from "./ui/tutorial.js";

export const APP_VERSION = "5.23.0";
const VIEWS = { load, setup, business, dash, report, present, presentEdit, history, settings, updates };
let current = load, currentId = "";
let versionTaps = 0, versionTapTimer = 0;

function renderChrome(id) {
  const curIdx = STEPS.findIndex(s => s.id === id);
  document.getElementById("steps").innerHTML = STEPS.map((s, i) => {
    const disabled = s.id !== "load" && !state.dataset;
    const on = s.id === id, done = !!state.dataset && i < curIdx;
    return `<button class="step${on ? " on" : ""}${done ? " done" : ""}" ${disabled ? "disabled" : ""} ${on ? 'aria-current="step"' : ""} data-act="goto" data-to="${s.id}" title="${esc(s.label)}"><i>${done ? icon("check", 14) : s.n}</i><span>${esc(s.label)}</span></button>`;
  }).join(`<span class="step-sep" aria-hidden="true"></span>`);
  const pb = document.getElementById("presentBtn");
  pb.disabled = !state.dataset;
  pb.classList.toggle("primary", !!state.dataset); // 발표 가능(데이터 있음)해지면 강조
  document.getElementById("undoBtn").disabled = !canUndo();
  document.getElementById("redoBtn").disabled = !canRedo();
  const hb = document.getElementById("historyBtn");
  if (id === "history") hb.setAttribute("aria-current", "page"); else hb.removeAttribute("aria-current");
  const sb = document.getElementById("settingsBtn");
  if (id === "settings") sb.setAttribute("aria-current", "page"); else sb.removeAttribute("aria-current");
  const pref = themePref(), tb = document.getElementById("themeBtn");
  tb.innerHTML = icon(pref === "dark" ? "moon" : pref === "light" ? "sun" : "monitor", 18);
  tb.title = `화면 테마: ${THEME_LABEL[pref]} (눌러서 바꾸기)`;
  tb.setAttribute("aria-label", tb.title);
}

function render({ keepScroll = false } = {}) {
  const { view, sub } = parseHash();
  const allowedView = view === "updates" && !hasReleaseAccess() ? "load" : view;
  const id = !NO_DATA_VIEWS.includes(allowedView) && !state.dataset ? "load" : allowedView;
  const changed = id !== currentId;
  if (changed && currentId && currentId !== id) setPrevView(currentId);
  if (changed) current.unmount?.();
  current = VIEWS[id]; currentId = id;
  document.body.classList.toggle("presenting", id === "present");
  const y = window.scrollY;
  renderChrome(id);
  const main = document.getElementById("main");
  try {
    main.innerHTML = current.render({ sub });
    current.mount?.();
  } catch (e) {
    console.error(e);
    main.innerHTML = `<section class="card"><h2>화면을 표시하지 못했습니다</h2><p class="bad-text">${esc(e.message)}</p><p class="muted small">데이터 설정(열 역할·척도)을 확인하거나 파일을 다시 불러오세요. 직전 상태로 돌아가려면 <b>되돌리기(Ctrl+Z)</b> 또는 <b>작업 내역</b>을 이용하세요.</p><div class="row gap"><button class="btn" data-act="goto" data-to="setup">데이터 설정으로</button><button class="btn" data-act="goto" data-to="history">작업 내역</button></div></section>`;
  }
  syncGuide();
  if (keepScroll && !changed) window.scrollTo(0, y);
  else if (changed) window.scrollTo(0, 0);
}
setRenderer(render);
window.addEventListener("hashchange", () => render());

/** 사용자 조작 뒤: 변경이 있으면 되돌리기 목록·자동 저장 */
const afterAction = () => { if (trackChange()) renderChrome(currentId); };

const handler = name => current.actions?.[name] || GLOBAL[name];
const GLOBAL = {
  goto: el => go(el.dataset.to, el.dataset.sub || ""),
  back: () => go(prevView() || "load"),
  theme: () => { const p = cycleTheme(); toast(`화면 테마: ${THEME_LABEL[p]}`); refresh(); },
  install: () => installApp(),
  skip: () => document.getElementById("main").focus(),
  undo: () => { if (undoChange()) { toast("되돌렸습니다", "info", 1800); refresh(); } },
  redo: () => { if (redoChange()) { toast("다시 실행했습니다", "info", 1800); refresh(); } },
  "whats-new": () => {
    versionTaps += 1;
    clearTimeout(versionTapTimer);
    if (versionTaps >= RELEASE_TAP_COUNT) {
      versionTaps = 0;
      grantReleaseAccess();
      go("updates");
      return;
    }
    versionTapTimer = setTimeout(() => { versionTaps = 0; }, 1800);
  },
  tutorial: () => startGuide(),
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = handler(el.dataset.act);
  if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).then(afterAction, err => { console.error(err); toast(err.message, "bad"); }); }
});
document.addEventListener("change", e => {
  const el = e.target.closest("[data-change]");
  if (!el) return;
  const fn = handler(el.dataset.change);
  if (fn) Promise.resolve(fn(el, e)).then(afterAction, err => { console.error(err); toast(err.message, "bad"); });
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
// 우클릭(오른쪽 클릭) 메뉴 제한 — 입력창·보고서 문장 편집처럼 실제로 필요한 곳은 예외로 허용
document.addEventListener("contextmenu", e => {
  if (e.target.closest("input, textarea, select, [contenteditable], [data-edit]")) return;
  e.preventDefault();
});
// 보고서 문장 직접 편집: 포커스 중에도 굵게·기울임 등 실제 서식으로 보임(WYSIWYG) → 포커스 해제 시 표식 문자열로 저장
document.addEventListener("focusin", e => {
  const el = e.target.closest("[data-edit]");
  if (el && el.dataset.editing !== "1") { el.dataset.editing = "1"; el.innerHTML = markupToHtml(el.dataset.raw); }
});
document.addEventListener("focusout", e => {
  const el = e.target.closest("[data-edit]");
  if (!el) return;
  el.dataset.editing = "";
  const text = htmlToMarkup(el, { multiline: el.dataset.multiline === "1" });
  const key = el.dataset.edit;
  if (text !== el.dataset.raw) {
    if (key.startsWith("deck:")) {
      // 발표 슬라이드 문구 편집: "deck:<슬라이드id>.<필드>"(자동 문구) 또는 "deck:<슬라이드id>.el:<요소id>"(자유배치 텍스트 박스)
      const [slideId, field] = key.slice(5).split(/\.(.+)/);
      const bySlide = { ...state.deckOverrides.bySlide };
      const entry = bySlide[slideId] || { mode: "auto", text: {}, textBase: {}, elements: [] };
      if (field.startsWith("el:")) {
        const elId = field.slice(3);
        const elements = (entry.elements || []).map(it => (it.id === elId ? { ...it, markup: text } : it));
        bySlide[slideId] = { ...entry, elements };
      } else {
        bySlide[slideId] = { ...entry, text: { ...entry.text, [field]: text }, textBase: { ...entry.textBase, [field]: el.dataset.auto } };
      }
      state.deckOverrides = { ...state.deckOverrides, bySlide };
    } else if (text) {
      state.overrides[key] = text;
      // 고칠 당시의 자동 문장을 기억 → 나중에 근거 수치가 바뀌면 '근거 변경' 표시
      state.overrideBase = { ...state.overrideBase, [key]: el.dataset.auto };
    }
    else state.hidden = [...new Set([...state.hidden, key])];
  }
  refresh();
  afterAction();
});
/** 문장 편집 중 Ctrl+B/I/U·Ctrl+Shift+X: 선택 영역에 실제 서식 적용(워드·한글과 같은 단축키) */
function toggleFormat(cmd) {
  document.execCommand("styleWithCSS", false, true);
  document.execCommand(cmd, false, null);
}
const isTyping = t => !!t?.closest?.("input, textarea, select, [contenteditable='true']");
document.addEventListener("keydown", e => {
  const editEl = e.target.closest?.("[data-edit]");
  if (e.key === "Enter" && editEl?.dataset.multiline === "1") { e.preventDefault(); document.execCommand("insertLineBreak"); return; }
  if (e.key === "Enter" && editEl) { e.preventDefault(); e.target.blur(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.target.closest?.("[data-edit]")) {
    const cmd = !e.shiftKey && e.code === "KeyB" ? "bold" : !e.shiftKey && e.code === "KeyI" ? "italic" : !e.shiftKey && e.code === "KeyU" ? "underline" : e.shiftKey && e.code === "KeyX" ? "strikeThrough" : null;
    if (cmd) { e.preventDefault(); toggleFormat(cmd); return; }
  }
  // 되돌리기 Ctrl+Z · 다시 실행 Ctrl+Y / Ctrl+Shift+Z (입력 중에는 브라우저 기본 동작)
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === "KeyZ" || e.code === "KeyY") && !isTyping(e.target) && currentId !== "present") {
    e.preventDefault();
    (e.code === "KeyY" || e.shiftKey ? GLOBAL.redo : GLOBAL.undo)();
    return;
  }
  // 주요 기능 단축키(Shift+문자, 입력 중에는 동작 안 함) — 로컬 설정 화면에 안내
  if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !isTyping(e.target)) {
    if (e.code === "KeyD") { e.preventDefault(); GLOBAL.theme(); return; }
    if (e.code === "KeyH") { e.preventDefault(); go("history"); return; }
    if (e.code === "KeyP" && state.dataset) { e.preventDefault(); go("present", "1"); return; }
  }
  current.onKey?.(e);
});
window.addEventListener("beforeunload", e => { if (state.dataset && (Object.keys(state.overrides).length || state.kpis.length)) { e.preventDefault(); e.returnValue = ""; } });

// 작업 내역 연동
document.addEventListener("survey:loaded", () => {
  resetTracking();
  saveSnapshot("load", { includeData: true, localData: true }).catch(err => console.warn("원자료 로컬 저장 실패:", err));
  renderChrome(currentId);
});
document.addEventListener("survey:exported", e => {
  saveSnapshot("export", { label: e.detail?.title ? `내보냄: ${e.detail.title}` : "" }).catch(err => console.warn("내역 저장 실패:", err));
});

// 예상하지 못한 오류도 사용자에게 알림 (화면이 조용히 멈추지 않도록)
window.addEventListener("error", e => {
  if (!e.message || /ResizeObserver/.test(e.message)) return;
  toast(`오류가 발생했습니다: ${e.message}`, "bad", 6000);
});
window.addEventListener("unhandledrejection", e => {
  const msg = e.reason?.message || String(e.reason || "");
  if (/AbortError|The user aborted/.test(msg)) return;
  toast(`처리 중 오류: ${msg}`, "bad", 6000);
});

if (!window.XLSX || !window.Papa || !window.JSZip) toast("일부 라이브러리를 불러오지 못했습니다. 새로고침하세요.", "bad", 8000);
document.getElementById("ver").textContent = `v${APP_VERSION}`;
document.getElementById("presentBtn").innerHTML = `${icon("play", 15)}<span>발표</span>`;
document.getElementById("installBtn").innerHTML = `${icon("install", 16)}<span>앱 설치</span>`;
document.getElementById("net").innerHTML = `${icon("offline", 14)}<span>오프라인</span>`;
document.getElementById("undoBtn").innerHTML = icon("undo", 18);
document.getElementById("redoBtn").innerHTML = icon("redo", 18);
document.getElementById("historyBtn").innerHTML = icon("history", 18);
document.getElementById("settingsBtn").innerHTML = icon("settings", 18);
watchSystemTheme(() => refresh());
installTooltips();
installFormatToolbar();
installScrollHints();
initPwa({ onFile: f => load.actions["drop-data"](f), hasUnsavedWork: () => !!state.dataset });
initHistory({ onUpdate: () => { if (currentId === "history" || currentId === "load") refresh(); else renderChrome(currentId); } });
render();
offerFirstRun();
