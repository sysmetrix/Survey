// 앱 진입점: 화면 전환·이벤트 위임 (인라인 핸들러 없음 — CSP script-src 'self')
import { state } from "./ui/store.js";
import { STEPS, NO_DATA_VIEWS, parseHash, go, setRenderer, setPrevView, prevView, refresh } from "./ui/router.js";
import { toast, esc, busy } from "./ui/util.js";
import { icon } from "./ui/icons.js";
import { cycleTheme, themePref, THEME_LABEL, watchSystemTheme } from "./ui/theme.js";
import { initPwa, installApp, isUpdateReloading, takeUpdateResume } from "./ui/pwa.js";
import { projectIdOf } from "./history/snapshot.js";
import { installTooltips } from "./ui/tooltip.js";
import { installFormatToolbar } from "./ui/format-toolbar.js";
import { markupToHtml, htmlToMarkup } from "./ui/inline-edit.js";
import { installScrollHints } from "./ui/scrollhint.js";
import { installStickyThead } from "./ui/sticky-thead.js";
import { createPressGuard } from "./ui/press-guard.js";
import { parseDeckKey } from "./present/edit/keys.js";
import { initHistory, trackChange, resetTracking, saveSnapshot, undoChange, redoChange, canUndo, canRedo, resumeProject, cache as historyCache } from "./ui/history/manager.js";
import * as load from "./ui/views/load.js";
import { RELEASE_TAP_COUNT, hasReleaseAccess, grantReleaseAccess } from "./admin/access.js";
import { startGuide, syncGuide, offerFirstRun } from "./ui/tutorial.js";
import { getSession, installIdleWatch, installTokenRefresh } from "./auth/session.js";
import { initTelemetry, trackEvent, installAutoFlush } from "./telemetry/track.js";
import { loadFeatureFlags } from "./admin/flags-client.js";

export const APP_VERSION = "5.45.0";
// 첫 화면(load)만 곧바로 받아오고, 나머지 화면은 실제로 들어갈 때 받아옴 — 무거운 보고서·발표 편집기 코드가
// 서비스워커 캐시도 없는 첫 접속에서부터 앱 시작을 늦추지 않도록(모션·기능은 그대로, 첫 로딩만 가벼워짐)
const VIEW_LOADERS = {
  load: () => Promise.resolve(load),
  setup: () => import("./ui/views/setup.js"),
  business: () => import("./ui/views/business.js"),
  dash: () => import("./ui/views/dash.js"),
  report: () => import("./ui/views/report.js"),
  present: () => import("./ui/views/present.js"),
  presentEdit: () => import("./ui/views/present-edit.js"),
  history: () => import("./ui/views/history.js"),
  settings: () => import("./ui/views/settings.js"),
  updates: () => import("./ui/views/updates.js"),
  references: () => import("./ui/views/references.js"),
  login: () => import("./ui/views/login.js"),
  admin: () => import("./ui/views/admin.js"),
};
const VIEWS = { load }; // 받아온 화면 모듈 캐시(한 번 받으면 다시 안 받음)
let current = load, currentId = "";
let versionTaps = 0, versionTapTimer = 0;
let adminTaps = 0, adminTapTimer = 0;
const ADMIN_TAP_COUNT = 5;

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

let renderToken = 0;

// css/present.css(발표 화면 전용)는 발표·발표 편집 화면에 처음 들어갈 때만 받아옴(그 외 화면에서는 안 씀)
const PRESENT_CSS_VIEWS = new Set(["present", "presentEdit"]);
let presentCssLoaded = false;
function ensurePresentCss() {
  if (presentCssLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `css/present.css?v=${APP_VERSION}`;
    link.onload = () => { presentCssLoaded = true; resolve(); };
    link.onerror = () => reject(new Error("발표 화면 스타일을 불러오지 못했습니다"));
    document.head.appendChild(link);
  });
}

function render({ keepScroll = false } = {}) {
  const { view, sub } = parseHash();
  const allowedView = view === "updates" && !hasReleaseAccess() ? "load" : view;
  let id = !NO_DATA_VIEWS.includes(allowedView) && !state.dataset ? "load" : allowedView;
  // 일반 이용에는 로그인이 필요 없음(누구나 링크로 바로 사용) — #/login·#/admin 은 관리자만 아는 별도 경로.
  if (id === "admin") {
    const s = getSession();
    if (!s) id = "login"; // 로그인 안 됐으면 로그인 화면으로
    else if (s.role !== "admin") { id = "load"; toast("관리자만 접근할 수 있습니다", "bad"); }
  } else if (id === "login" && getSession()) id = "load"; // 이미 로그인된 채로 로그인 화면에 다시 오면 첫 화면으로

  const cached = VIEWS[id];
  const needsCss = PRESENT_CSS_VIEWS.has(id) && !presentCssLoaded;
  if (cached && !needsCss) { renderWith(cached, id, sub, keepScroll); return; } // 이미 다 받아온 화면: 지금까지와 똑같이 그 자리에서 바로 그림

  // 이번 세션에서 처음 들어가는 화면(또는 스타일)만 받아옴 — 대부분 눈 깜짝할 새 끝나므로, 조금 걸릴 때만 로딩 표시를 띄움
  const token = ++renderToken;
  const slow = setTimeout(() => { if (token === renderToken) busy(true, "화면을 불러오는 중…"); }, 150);
  Promise.all([cached ? Promise.resolve(cached) : VIEW_LOADERS[id](), needsCss ? ensurePresentCss() : Promise.resolve()]).then(([mod]) => {
    clearTimeout(slow);
    if (token !== renderToken) return; // 그 사이 다른 화면으로 또 이동했으면 이 결과는 버림
    VIEWS[id] = mod;
    busy(false);
    renderWith(mod, id, sub, keepScroll);
  }, e => {
    clearTimeout(slow);
    if (token !== renderToken) return;
    busy(false);
    console.error(e);
    toast(`화면을 불러오지 못했습니다: ${e.message}`, "bad", 6000);
  });
}

function renderWith(mod, id, sub, keepScroll) {
  const changed = id !== currentId;
  if (changed && currentId && currentId !== id) setPrevView(currentId);
  if (changed) current.unmount?.();
  current = mod; currentId = id;
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
  if (changed) trackEvent(id, "view_enter");
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
  // 하단 'by Sysmetrix'를 5번 연달아 누르면 관리자 화면으로(주소를 직접 입력하기 어려운 경우를 위한 조용한 진입점)
  "admin-entry": () => {
    adminTaps += 1;
    clearTimeout(adminTapTimer);
    if (adminTaps >= ADMIN_TAP_COUNT) {
      adminTaps = 0;
      go(getSession() ? "admin" : "login");
      return;
    }
    adminTapTimer = setTimeout(() => { adminTaps = 0; }, 1800);
  },
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
// 글자를 고치던 칸에서 다른 곳을 누르면 mousedown 에서 포커스가 빠지며 focusout 이 터지는데, 그때 바로 다시 그리면 누른 요소가
// 사라져 클릭이 전달되지 않음(첫 클릭은 저장만 되고 한 번 더 눌러야 함) → 누르고 있는 동안에는 저장만 하고 다시 그리기는 손 뗀 뒤로 미룸.
// 미룬 뒤 이미 다른 편집 칸에 포커스가 가 있으면(문장·문구 사이를 바로 옮겨 다니는 경우) 그 칸을 살리려고 다시 그리지 않음(그 칸의 focusout 에서 그려짐)
const pressGuard = createPressGuard(() => { if (!document.activeElement?.closest?.("[data-edit]")) refresh(); });
document.addEventListener("pointerdown", () => pressGuard.press(), true);
for (const t of ["pointerup", "pointercancel", "dragend"]) document.addEventListener(t, () => pressGuard.release(), true);
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
      // 발표 슬라이드 문구 편집 — deck-key.js 의 형식 참고(자동 문구·요소 전체·richtext 문단·표 칸)
      const parsed = parseDeckKey(key);
      const { slideId } = parsed;
      const bySlide = { ...state.deckOverrides.bySlide };
      const entry = bySlide[slideId] || { mode: "auto", text: {}, textBase: {}, elements: [] };
      if (parsed.scope === "element") {
        const elements = (entry.elements || []).map(it => (it.id === parsed.elId ? { ...it, markup: text } : it));
        bySlide[slideId] = { ...entry, elements };
      } else if (parsed.scope === "block") {
        const elements = (entry.elements || []).map(it => (it.id === parsed.elId
          ? { ...it, blocks: (it.blocks || []).map((b, i) => (i === parsed.blockIdx ? { ...b, text } : b)) }
          : it));
        bySlide[slideId] = { ...entry, elements };
      } else if (parsed.scope === "cell") {
        const elements = (entry.elements || []).map(it => (it.id === parsed.elId
          ? { ...it, rows: (it.rows || []).map((row, r) => (r === parsed.row ? row.map((c, ci) => (ci === parsed.col ? text : c)) : row)) }
          : it));
        bySlide[slideId] = { ...entry, elements };
      } else {
        const field = parsed.field;
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
  pressGuard.request();
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
window.addEventListener("beforeunload", e => { if (!isUpdateReloading() && state.dataset &&(Object.keys(state.overrides).length || state.kpis.length)) { e.preventDefault(); e.returnValue = ""; } });

// 작업 내역 연동
document.addEventListener("survey:loaded", () => {
  resetTracking();
  saveSnapshot("load", { includeData: true, localData: true }).catch(err => console.warn("원자료 로컬 저장 실패:", err));
  renderChrome(currentId);
});
document.addEventListener("survey:exported", e => {
  saveSnapshot("export", { label: e.detail?.title ? `내보냄: ${e.detail.title}` : "" }).catch(err => console.warn("내역 저장 실패:", err));
  const kind = e.detail?.kind;
  if (kind === "hwpx") trackEvent("report", "export_hwpx");
  else if (kind === "present-pptx") trackEvent("present", "export_pptx");
  else if (kind === "present-html") trackEvent("present", "export_html");
  else if (kind === "pdf") trackEvent("report", "export_pdf");
  else if (kind === "present-pdf") trackEvent("present", "export_pdf");
});

// 예상하지 못한 오류도 사용자에게 알림 (화면이 조용히 멈추지 않도록)
window.addEventListener("error", e => {
  if (!e.message || /ResizeObserver/.test(e.message)) return;
  toast(`오류가 발생했습니다: ${e.message}`, "bad", 6000);
  trackEvent(currentId, "js_error"); // 화면 이름만 — 메시지·스택트레이스는 보내지 않음
});
window.addEventListener("unhandledrejection", e => {
  const msg = e.reason?.message || String(e.reason || "");
  if (/AbortError|The user aborted/.test(msg)) return;
  toast(`처리 중 오류: ${msg}`, "bad", 6000);
});

// XLSX(SheetJS)·JSZip 은 실제로 필요할 때만 따로 받아오므로 여기서는 확인하지 않음(js/ui/xlsx-loader.js·jszip-loader.js)
if (!window.Papa) toast("일부 라이브러리를 불러오지 못했습니다. 새로고침하세요.", "bad", 8000);
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
installStickyThead();
// 업데이트 적용(js/ui/pwa.js): 다시 불러오기 직전에 작업을 저장하고, 새로고침 뒤 같은 작업·화면을 이어서 연다
const updateResume = takeUpdateResume();
const localProject = () => (state.codebook ? historyCache.projects.find(p => p.id === projectIdOf(state.codebook)) : null);
/** 작업 저장(진행 중인 저장까지 기다림) → 복원 표식. 원자료가 이 브라우저에 보관되지 않았다면 표식 없음 */
async function prepareUpdateReload() {
  if (!state.dataset || !state.codebook) return null;
  const settle = async () => { for (let i = 0; i < 50 && historyCache.saving; i++) await new Promise(r => setTimeout(r, 100)); };
  await settle();
  await saveSnapshot("auto");
  await settle();
  return localProject()?.hasData ? { projectId: projectIdOf(state.codebook), hash: location.hash, at: Date.now() } : null;
}
async function resumeAfterUpdate(token) {
  if (!token || state.dataset || !historyCache.projects.find(p => p.id === token.projectId)?.hasData) return;
  try {
    if ((await resumeProject(token.projectId)).mode !== "ready") return;
    if (token.hash && location.hash !== token.hash) location.hash = token.hash; // hashchange 로 다시 그려짐
    else refresh();
    toast("새 버전으로 업데이트했습니다. 작업하던 내용을 이어서 열었습니다.", "ok", 5000);
  } catch (e) { console.warn("업데이트 뒤 작업 복원 실패:", e); }
}
initPwa({
  onFile: f => load.actions["drop-data"](f), appVersion: APP_VERSION, hasUnsavedWork: () => !!state.dataset,
  isPersistent: () => !!localProject()?.hasData, isSaving: () => historyCache.saving, prepareReload: prepareUpdateReload,
});
initHistory({ onUpdate: () => { if (currentId === "history" || currentId === "load") refresh(); else renderChrome(currentId); } }).then(() => resumeAfterUpdate(updateResume));
initTelemetry({ version: APP_VERSION, getOrg: () => state.settings.orgName });
installAutoFlush();
// 관리자 미리보기 기능 플래그 — 실패해도 조용히 넘어가고(기본값 꺼짐), 늦게 도착하면 다시 그려 반영
loadFeatureFlags().then(() => refresh());
installIdleWatch(() => { toast("자리를 비운 동안 자동으로 로그아웃되었습니다", "info", 6000); refresh(); });
installTokenRefresh(); // 관리자 화면에 오래 머물러도 로그인 세션(JWT)이 조용히 갱신되도록
render();
if (currentId !== "login" && currentId !== "admin") offerFirstRun(); // 관리자 화면에서는 일반 이용자용 가이드를 띄우지 않음
