// ⑥b 슬라이드 편집 — 파워포인트·구글 슬라이드 같은 구조:
//   위: 얇은 도구 모음 두 줄(삽입 / 선택한 요소의 서식) · 왼쪽: 슬라이드 목록(끌어서 순서 변경) ·
//   가운데: 슬라이드 · 오른쪽: 도구 모음에 못 넣는 것만(위치·크기·회전, 종류별 상세, 선택 없음=슬라이드 속성)
// 계산은 present-edit-model.js(순수 함수), 드래그·키보드 연결은 present-canvas.js, 여기서는 화면·상태 연결만.
import { state, allDeckSlides, deckSlides, blankCustomSlide, effectiveDeckOrder } from "../store.js";
import { slideHtml, isCustomSlide } from "./present.js";
import { elementsFromAutoSlide } from "../../present/edit/detach.js";
import { revealScrollTop, fitLayoutHeight, createScrollMemory } from "../../present/edit/scroll-fit.js";
import { installCanvasInteractions, installKeyboardNudge } from "../present-canvas.js";
import * as M from "../present-edit-model.js";
import { trackChange } from "../history/manager.js";
import { esc, toast } from "../util.js";
import { go, refresh, prevView, viewLabel } from "../router.js";
import { icon } from "../icons.js";
import { resolvedTheme } from "../theme.js";
import { cleanFontName } from "../../report/hwpx/fonts.js";

let selectedId = null;
let selectedElId = null;
let cleanupFns = [];
let seq = 0;
let openMenu = null; // 열려 있는 도구 모음 메뉴 이름(shape·chart·align·order·keys)
let clipboard = null; // Ctrl+C/X 로 담아 둔 요소 사본(슬라이드를 옮겨 다니며 붙여넣기 가능)
let pointerDown = false, pendingRefresh = false;
let dragSlideId = null;
// 다시 그릴 때마다 main.innerHTML 이 통째로 바뀌므로 칸별(슬라이드 목록·속성·가운데) 스크롤 위치를 따로 기억했다가 되돌림
const scrollMem = createScrollMemory();
let revealSelected = true; // 슬라이드를 고르거나 넣거나 옮긴 직후에만: 선택한 썸네일이 목록 밖이면 가장 적게 굴려서 보이게
const newElId = () => `el${Date.now().toString(36)}${(seq++).toString(36)}`;

/** 상태를 고친 뒤: 되돌리기 기록 + 다시 그리기. 마우스를 누르고 있는 중(입력칸을 벗어나며 change 가 먼저 터진 경우)에는
 *  다시 그리기를 손을 뗀 뒤로 미룸 — 안 그러면 방금 누른 버튼이 사라져 첫 클릭이 먹통이 됨 */
const commit = () => {
  openMenu = null;
  trackChange();
  if (pointerDown) pendingRefresh = true; else refresh();
};

function currentSlide() {
  const all = allDeckSlides();
  if (!selectedId || !all.some(s => s.id === selectedId)) selectedId = all[0]?.id || null;
  return all.find(s => s.id === selectedId) || null;
}
const entryOf = slideId => state.deckOverrides.bySlide[slideId];
const elementsOf = slideId => entryOf(slideId)?.elements || [];
const nextZ = slideId => Math.max(0, ...elementsOf(slideId).map(x => x.z || 1)) + 1;
const titleOf = s => entryOf(s.id)?.text?.title ?? s.title;
const stripUndef = o => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };

function patchEntry(slideId, patch) {
  const bySlide = { ...state.deckOverrides.bySlide };
  // 항목이 아직 없을 때의 기본 모드: 사용자가 만든 슬라이드는 자유배치, 자동 슬라이드는 자동(배경·노트만 고쳐도 자유배치로 바뀌면 안 됨)
  const entry = bySlide[slideId] || { mode: state.deckOverrides.customSlides[slideId] ? "custom" : "auto", elements: [], text: {}, textBase: {} };
  bySlide[slideId] = stripUndef({ ...entry, ...patch });
  state.deckOverrides = { ...state.deckOverrides, bySlide };
}
function updateElement(slideId, elId, patch) {
  patchEntry(slideId, { elements: elementsOf(slideId).map(it => (it.id === elId ? stripUndef({ ...it, ...patch }) : it)) });
}
function addElement(slideId, el) { patchEntry(slideId, { elements: [...elementsOf(slideId), el] }); }
function removeElement(slideId, elId) { patchEntry(slideId, { elements: elementsOf(slideId).filter(x => x.id !== elId) }); }
const findEl = (slideId, elId) => elementsOf(slideId).find(x => x.id === elId);
/** 지금 슬라이드와 선택된 요소(없으면 null) */
function selection() {
  const slide = currentSlide();
  const cur = slide && selectedElId ? findEl(slide.id, selectedElId) : null;
  return [slide, cur];
}

function teardownInteractions() { cleanupFns.forEach(fn => fn()); cleanupFns = []; }

// ───────────── 요소 복사·붙여넣기·복제 ─────────────
function copyEl(slideId, id) {
  const cur = findEl(slideId, id);
  if (!cur) return false;
  clipboard = M.cloneEl(cur);
  return true;
}
function pasteEl(slideId) {
  if (!clipboard) return null;
  const copy = M.pasteCopy(clipboard, newElId(), nextZ(slideId));
  addElement(slideId, copy);
  clipboard = M.cloneEl(copy); // 연속 붙여넣기는 계단식으로 밀려 나가게
  selectedElId = copy.id;
  return copy;
}

export function mount() {
  teardownInteractions();
  document.getElementById("main")?.classList.add("pe-wide"); // 편집 화면은 캔버스를 넓게(css/present.css .pe-wide)
  const root = document.querySelector(".pe-stage");
  const slide = currentSlide();
  if (!root || !slide) return;
  const custom = isCustomSlide(slide);

  // 마우스를 누른 채로 change 가 터지는 경우를 알기 위해(commit 참고). 캔버스 처리보다 먼저 등록해 손 뗄 때 순서가 맞게
  const pd = () => { pointerDown = true; };
  const pu = () => {
    pointerDown = false;
    if (pendingRefresh) { pendingRefresh = false; setTimeout(() => { if (document.querySelector(".pe-stage")) refresh(); }, 40); }
  };
  document.addEventListener("pointerdown", pd, true);
  for (const t of ["pointerup", "pointercancel", "dragend"]) document.addEventListener(t, pu, true);
  cleanupFns.push(() => {
    document.removeEventListener("pointerdown", pd, true);
    for (const t of ["pointerup", "pointercancel", "dragend"]) document.removeEventListener(t, pu, true);
  });

  root.tabIndex = -1;
  if (custom) {
    const hooks = {
      getSelected: () => selectedElId,
      getElements: () => elementsOf(slide.id),
      onChange: (id, patch) => { selectedElId = id; updateElement(slide.id, id, patch); commit(); },
      onSelect: id => { selectedElId = id; openMenu = null; refresh(); },
      onDelete: id => { removeElement(slide.id, id); selectedElId = null; commit(); },
      onCopy: id => { copyEl(slide.id, id); toast("복사했습니다. Ctrl+V 로 붙여 넣으세요.", "info", 1600); },
      onCut: id => { if (copyEl(slide.id, id)) { removeElement(slide.id, id); selectedElId = null; commit(); } },
      onPaste: () => { if (pasteEl(slide.id)) commit(); },
      onDuplicate: id => { if (copyEl(slide.id, id) && pasteEl(slide.id)) commit(); },
      onEdit: id => {
        const editable = root.querySelector(`.s-el[data-el-id="${CSS.escape(id)}"] [contenteditable]`);
        if (!editable) return;
        editable.focus();
        const sel = window.getSelection?.();
        if (sel && editable.childNodes.length) { const r = document.createRange(); r.selectNodeContents(editable); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
      },
    };
    cleanupFns.push(installCanvasInteractions(root, hooks));
    cleanupFns.push(installKeyboardNudge(root, hooks));
  }

  // 슬라이드 목록: 끌어서 순서 바꾸기 + 키보드로 선택
  const thumbs = document.querySelector(".pe-thumbs");
  if (thumbs) cleanupFns.push(installSlideDnD(thumbs));
  const onThumbKey = e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".pe-thumb")) { e.preventDefault(); e.target.click(); }
  };
  document.addEventListener("keydown", onThumbKey);
  cleanupFns.push(() => document.removeEventListener("keydown", onThumbKey));

  // 열린 메뉴 닫기: 바깥을 누르거나 Esc
  const onDocClick = e => {
    if (!openMenu || e.target.closest?.(".pe-menu-wrap, [data-act]")) return;
    openMenu = null; refresh();
  };
  const onMenuEsc = e => { if (e.key === "Escape" && openMenu && !selectedElId) { openMenu = null; refresh(); } };
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onMenuEsc);
  cleanupFns.push(() => { document.removeEventListener("click", onDocClick); document.removeEventListener("keydown", onMenuEsc); });

  // 도구 모음이 좁은 화면에서 여러 줄로 접히면 그 높이만큼 편집 영역이 아래로 내려감 → 세 칸(목록·슬라이드·속성)이
  // 창 높이 안에 들어가도록 편집 영역 높이를 다시 재고, 칸마다 안에서 스크롤(문서 전체에는 세로 스크롤이 생기지 않게)
  const syncLayout = () => {
    const tools = document.querySelector(".pe-tools"), layout = document.querySelector(".pe-layout"), host = document.getElementById("main");
    if (!tools || !layout) return;
    layout.style.setProperty("--pe-tools-h", `${Math.round(tools.getBoundingClientRect().height)}px`);
    const top = layout.getBoundingClientRect().top + window.scrollY;
    const below = (parseFloat(getComputedStyle(host).paddingBottom) || 0) + (document.querySelector(".foot")?.offsetHeight || 0) + 2;
    layout.style.setProperty("--pe-layout-h", `${fitLayoutHeight({ innerH: window.innerHeight, top, below })}px`);
  };
  syncLayout();
  window.addEventListener("resize", syncLayout);
  cleanupFns.push(() => window.removeEventListener("resize", syncLayout));
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(syncLayout);
    const tools = document.querySelector(".pe-tools");
    if (tools) ro.observe(tools);
    cleanupFns.push(() => ro.disconnect());
  }
  restoreScroll(slide);

  // 다시 그린 뒤에도 방향키·Delete 등이 계속 먹도록 포커스를 캔버스로 돌려 놓음(main.innerHTML 이 통째로 바뀌면 포커스가 body 로 떨어짐)
  if (custom && selectedElId && findEl(slide.id, selectedElId) && (!document.activeElement || document.activeElement === document.body)) {
    root.focus({ preventScroll: true });
  }
}
export function unmount() { teardownInteractions(); document.getElementById("main")?.classList.remove("pe-wide"); openMenu = null; pointerDown = false; pendingRefresh = false; dragSlideId = null; revealSelected = true; }

/** 다시 그린 뒤 칸별 스크롤 위치를 되돌리고 이후 스크롤을 계속 기억. 속성 칸은 같은 슬라이드·요소를 다시 그릴 때만 유지(다른 것을 고르면 맨 위부터) */
function restoreScroll(slide) {
  const regions = [["thumbs", ".pe-thumbs", ""], ["props", ".pe-props", `${slide.id}|${selectedElId || ""}`], ["stage", ".pe-main", slide.id]];
  for (const [name, sel, key] of regions) {
    const node = document.querySelector(sel);
    if (!node) continue;
    node.scrollTop = scrollMem.recall(name, key);
    scrollMem.save(name, node.scrollTop);
    const onScroll = () => scrollMem.save(name, node.scrollTop);
    node.addEventListener("scroll", onScroll, { passive: true });
    cleanupFns.push(() => node.removeEventListener("scroll", onScroll));
  }
  if (!revealSelected) return;
  revealSelected = false;
  const list = document.querySelector(".pe-thumbs"), thumb = list?.querySelector(".pe-thumb.on");
  if (!list || !thumb) return;
  const itemTop = thumb.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
  list.scrollTop = revealScrollTop({ scrollTop: list.scrollTop, viewH: list.clientHeight, contentH: list.scrollHeight, itemTop, itemH: thumb.offsetHeight });
  scrollMem.save("thumbs", list.scrollTop);
}

/** 슬라이드 목록 HTML5 끌어놓기 — 손 뗀 곳의 앞/뒤(가로 배치면 좌/우)로 순서 변경 */
function installSlideDnD(list) {
  const clearMarks = () => list.querySelectorAll(".drop-before, .drop-after, .dragging").forEach(n => n.classList.remove("drop-before", "drop-after", "dragging"));
  const afterOf = (t, e) => {
    const r = t.getBoundingClientRect();
    return getComputedStyle(list).flexDirection === "row" ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
  };
  const onStart = e => {
    const t = e.target.closest?.(".pe-thumb");
    if (!t) return;
    dragSlideId = t.dataset.id;
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragSlideId); } catch { /* 일부 브라우저 */ } }
    t.classList.add("dragging");
  };
  const onOver = e => {
    if (!dragSlideId) return;
    const t = e.target.closest?.(".pe-thumb");
    if (!t) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    list.querySelectorAll(".drop-before, .drop-after").forEach(n => n.classList.remove("drop-before", "drop-after"));
    if (t.dataset.id !== dragSlideId) t.classList.add(afterOf(t, e) ? "drop-after" : "drop-before");
  };
  const onDrop = e => {
    if (!dragSlideId) return;
    e.preventDefault();
    const from = dragSlideId, t = e.target.closest?.(".pe-thumb");
    dragSlideId = null;
    const after = t ? afterOf(t, e) : false;
    clearMarks();
    if (t && reorderSlides(from, t.dataset.id, after)) commit();
  };
  const onEnd = () => { dragSlideId = null; clearMarks(); };
  list.addEventListener("dragstart", onStart);
  list.addEventListener("dragover", onOver);
  list.addEventListener("drop", onDrop);
  list.addEventListener("dragend", onEnd);
  return () => {
    list.removeEventListener("dragstart", onStart);
    list.removeEventListener("dragover", onOver);
    list.removeEventListener("drop", onDrop);
    list.removeEventListener("dragend", onEnd);
  };
}

/** 슬라이드 순서 바꾸기(from 을 to 의 앞/뒤로). 바뀐 게 없으면 false */
function reorderSlides(from, to, after) {
  const order = effectiveDeckOrder();
  const next = M.moveId(order, from, to, after);
  if (next.join("\n") === order.join("\n")) return false;
  state.deckOrder = next;
  return true;
}

// ───────────── 화면 조각 ─────────────
const KIND_LABEL = { text: "텍스트", richtext: "목록", table: "표", image: "이미지", shape: "도형", chart: "차트" };
const SHAPES = [["rect", "사각형"], ["roundRect", "둥근 사각형"], ["ellipse", "타원"], ["triangle", "삼각형"], ["line", "선"], ["arrow", "화살표"]];
const FONT_CHOICES = ["맑은 고딕", "함초롬돋움", "함초롬바탕", "휴먼명조", "Noto Sans KR"];
const LINE_HEIGHTS = [1, 1.15, 1.3, 1.5, 1.8, 2];
const BORDER_WIDTHS = [0, 1, 2, 3, 4, 6, 8];
const OPACITIES = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
const ALIGN_LABEL = { left: "왼쪽 맞춤", "center-h": "가로 가운데", right: "오른쪽 맞춤", top: "위쪽 맞춤", "center-v": "세로 가운데", bottom: "아래쪽 맞춤" };
const ALIGN_ICON = { left: "aLeft", "center-h": "aCenterH", right: "aRight", top: "aTop", "center-v": "aCenterV", bottom: "aBottom" };
const Z_LABEL = { front: "맨 앞으로", forward: "앞으로", backward: "뒤로", back: "맨 뒤로" };
const KEYS = [["방향키 · Shift+방향키", "0.5% · 5% 이동"], ["Ctrl+C · X · V", "복사 · 잘라내기 · 붙여넣기"], ["Ctrl+D", "복제"], ["Delete", "삭제"], ["Tab · Shift+Tab", "다음 · 이전 요소"], ["Enter · F2", "글자 편집"], ["Esc", "선택 해제"], ["Shift+크기 조절", "가로세로 비율 유지"], ["Shift+회전", "15° 단위"]];

/** <input type=color> 는 #rrggbb 만 받으므로 다른 표기·빈 값은 대체색으로 */
function hexOf(v, fallback) {
  const s = M.safeCssColor(v);
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return fallback;
}

const ib = (act, ic, label, { pressed, dis = false, attrs = "", text = "" } = {}) =>
  `<button type="button" class="rt-btn pe-ib${pressed ? " on" : ""}${text ? " has-text" : ""}" data-act="${act}" ${attrs}${dis ? " disabled" : ""} title="${esc(label)}" aria-label="${esc(label)}"${pressed === undefined ? "" : ` aria-pressed="${pressed}"`}>${icon(ic, 16)}${text ? `<span>${esc(text)}</span>` : ""}</button>`;

/** 메뉴를 여는 단추 + 열린 메뉴 본문(바깥 클릭·Esc 로 닫힘) */
const menu = (name, ic, label, body, { dis = false, right = false, text = label } = {}) => `<span class="pe-menu-wrap rt-pop-wrap">
  <button type="button" class="rt-btn pe-ib has-text" data-act="pe-menu" data-menu="${name}" aria-haspopup="true" aria-expanded="${openMenu === name}" title="${esc(label)}" aria-label="${esc(label)}"${dis ? " disabled" : ""}>${icon(ic, 16)}<span>${esc(text)}</span>${icon("chevronDown", 12)}</button>
  ${openMenu === name && !dis ? `<div class="pe-menu${right ? " right" : ""}" role="menu" aria-label="${esc(label)}">${body}</div>` : ""}
</span>`;
const menuItem = (act, ic, label, attrs = "") => `<button type="button" class="pe-menu-item" role="menuitem" data-act="${act}" ${attrs}>${ic ? icon(ic, 16) : ""}<span>${esc(label)}</span></button>`;

const colorCtl = (prop, label, ic, value, fallback) => {
  const shown = M.safeCssColor(value);
  return `<label class="rt-btn pe-ib pe-color" title="${esc(label)}"><span class="pe-color-ico">${icon(ic, 16)}<i class="pe-swatch${shown ? "" : " none"}" style="background:${esc(shown || "transparent")}"></i></span><input type="color" value="${hexOf(value, fallback)}" data-change="pe-el-prop" data-prop="${prop}" aria-label="${esc(label)}"></label>`;
};
const selCtl = (prop, label, ic, options, cur) => {
  const list = options.some(([v]) => String(v) === String(cur)) || cur === undefined || cur === "" ? options : [...options, [cur, String(cur)]];
  return `<label class="pe-sel" title="${esc(label)}">${icon(ic, 15)}<select class="rt-select" data-change="pe-el-prop" data-prop="${prop}" aria-label="${esc(label)}">${list.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur ?? "") ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
};

/** 위 줄: 삽입 */
function insertBarHtml(slide, custom, canRevertAuto, charts) {
  const dis = !custom;
  const shapeBody = SHAPES.map(([t, label]) => menuItem("pe-add-shape", t, label, `data-shape="${t}"`)).join("");
  const chartBody = charts.length
    ? `<p class="pe-menu-hint">분석 결과 차트를 골라 이 슬라이드에 넣습니다.</p>${charts.map((c, i) => `<button type="button" class="pe-menu-item chart" role="menuitem" data-act="pe-add-chart" data-slide="${esc(c.slideId)}">${icon("chart", 16)}<span><b>${esc(c.title)}</b></span></button>`).join("")}`
    : `<p class="pe-menu-hint">이 발표에는 넣을 수 있는 분석 차트가 없습니다.</p>`;
  return `<div class="pe-toolbar" role="toolbar" aria-label="삽입">
    <span class="pe-tb-label">삽입</span>
    ${ib("pe-add-text", "text", "텍스트 상자 넣기", { dis, text: "텍스트" })}
    ${ib("pe-add-richtext", "list", "글머리 목록 상자 넣기", { dis, text: "목록" })}
    ${ib("pe-add-table", "table", "표 넣기", { dis, text: "표" })}
    <label class="rt-btn pe-ib has-text${dis ? " is-disabled" : ""}" title="이미지 넣기">${icon("image", 16)}<span>이미지</span><input type="file" accept="image/*" hidden data-change="pe-add-image"${dis ? " disabled" : ""}></label>
    ${menu("shape", "shapes", "도형 넣기", shapeBody, { dis, text: "도형" })}
    ${menu("chart", "chart", "분석 차트 넣기", chartBody, { dis, text: "차트" })}
    <span class="rt-sep" aria-hidden="true"></span>
    ${custom
      ? (canRevertAuto ? `<button type="button" class="rt-btn pe-ib has-text" data-act="pe-revert-auto" data-tip="자유배치를 버리고 자동 구성으로 되돌립니다">${icon("undo", 16)}<span>자동으로 되돌리기</span></button>` : `<span class="badge info">자유배치 슬라이드</span>`)
      : `<button type="button" class="btn sm primary" data-act="pe-detach" data-tip="이 슬라이드를 요소별로 옮기고 꾸밀 수 있게 바꿉니다">${icon("edit", 14)}자유배치로 바꾸기</button>`}
    <span class="rt-spacer"></span>
    ${menu("keys", "help", "단축키 안내", `<b class="pe-menu-title">편집 단축키</b><dl class="rt-keys">${KEYS.map(([k, v]) => `<dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd>`).join("")}</dl>`, { right: true, text: "단축키" })}
  </div>`;
}

/** 아래 줄: 선택한 요소의 서식(요소 종류에 따라 달라짐) */
function formatBarHtml(custom, el) {
  const hint = msg => `<div class="pe-toolbar pe-fmt" role="toolbar" aria-label="서식"><span class="pe-tb-label">서식</span><span class="pe-hint">${esc(msg)}</span></div>`;
  if (!custom) return hint("자유배치로 바꾸면 요소를 골라 글꼴·색·정렬을 바꿀 수 있습니다.");
  if (!el) return hint("슬라이드에서 요소를 누르면 서식 도구가 나타납니다. (Tab: 다음 요소)");
  const textual = el.kind === "text" || el.kind === "richtext";
  const groups = [];
  if (M.FONT_KINDS.has(el.kind)) {
    const size = `<span class="pe-size" role="group" aria-label="글자 크기">
      ${ib("pe-font-step", "minus", "글자 작게", { attrs: 'data-dir="-1"' })}
      <input class="pe-size-in" type="number" min="6" max="96" step="any" inputmode="decimal" value="${M.fmtPt(M.fontPtOf(el))}" data-change="pe-font-pt" aria-label="글자 크기(pt)" title="글자 크기(pt)"><span class="pe-unit">pt</span>
      ${ib("pe-font-step", "plus", "글자 크게", { attrs: 'data-dir="1"' })}</span>`;
    if (textual) {
      const fam = el.fontFamily || "";
      const fonts = FONT_CHOICES.includes(fam) || !fam ? FONT_CHOICES : [...FONT_CHOICES, fam];
      groups.push(`<select class="rt-select pe-font" data-change="pe-el-prop" data-prop="fontFamily" aria-label="글꼴" data-tip="글꼴 — 받는 PC에 설치된 글꼴만 보입니다"><option value=""${fam ? "" : " selected"}>기본 글꼴</option>${fonts.map(f => `<option value="${esc(f)}"${f === fam ? " selected" : ""}>${esc(f)}</option>`).join("")}</select>${size}`);
      groups.push([
        ib("pe-toggle", "bold", "굵게", { pressed: el.weight === "bold", attrs: 'data-prop="weight"' }),
        ib("pe-toggle", "italic", "기울임", { pressed: !!el.italic, attrs: 'data-prop="italic"' }),
        ib("pe-toggle", "underline", "밑줄", { pressed: !!el.underline, attrs: 'data-prop="underline"' }),
        ib("pe-toggle", "strike", "취소선", { pressed: !!el.strike, attrs: 'data-prop="strike"' }),
        colorCtl("color", "글자색", "fontColor", el.color, "#222222"),
      ].join(""));
      const al = el.align || "left", va = el.valign || "top";
      groups.push([
        ...[["left", "alignLeft", "왼쪽 정렬"], ["center", "alignCenter", "가운데 정렬"], ["right", "alignRight", "오른쪽 정렬"]].map(([v, ic, t]) => ib("pe-set", ic, t, { pressed: al === v, attrs: `data-prop="align" data-value="${v}"` })),
        `<span class="rt-sep thin" aria-hidden="true"></span>`,
        ...[["top", "vTop", "위쪽 정렬"], ["middle", "vMiddle", "세로 가운데 정렬"], ["bottom", "vBottom", "아래쪽 정렬"]].map(([v, ic, t]) => ib("pe-set", ic, t, { pressed: va === v, attrs: `data-prop="valign" data-value="${v}"` })),
        selCtl("lineHeight", "줄 간격", "lineHeight", [["", "줄 간격"], ...LINE_HEIGHTS.map(v => [v, v.toFixed(2).replace(/0$/, "").replace(/\.0$/, ".0")])], el.lineHeight),
      ].join(""));
    } else {
      groups.push(size);
    }
  }
  const isLine = el.kind === "shape" && (el.shapeType === "line" || el.shapeType === "arrow");
  if (textual || el.kind === "shape") {
    const borderProp = el.kind === "shape" ? "stroke" : "borderColor", widthProp = el.kind === "shape" ? "strokeWidth" : "borderWidth";
    const bw = Number(el[widthProp]) || 0;
    const parts = [];
    if (!isLine) parts.push(colorCtl("fill", "채우기 색", "fill", el.fill, "#3B5A7A"), ib("pe-clear", "x", "채우기 없음", { attrs: 'data-prop="fill"' }));
    parts.push(colorCtl(borderProp, isLine ? "선 색" : "테두리 색", "border", el[borderProp], "#3B5A7A"));
    parts.push(selCtl(widthProp, isLine ? "선 두께(px)" : "테두리 두께(px)", "line", BORDER_WIDTHS.map(v => [v, v ? `${v}px` : "없음"]), bw));
    groups.push(parts.join(""));
  }
  if (textual || el.kind === "shape" || el.kind === "image") {
    const op = Number.isFinite(Number(el.opacity)) && el.opacity !== undefined && el.opacity !== null ? Number(el.opacity) : 1;
    groups.push(selCtl("opacity", "불투명도", "opacity", OPACITIES.map(v => [v, `${Math.round(v * 100)}%`]), op));
  }
  const alignBody = M.ALIGN_HOW.map(h => menuItem("pe-align-el", ALIGN_ICON[h], ALIGN_LABEL[h], `data-how="${h}"`)).join("");
  const orderBody = M.Z_HOW.map(h => menuItem("pe-z", "layers", Z_LABEL[h], `data-how="${h}"`)).join("");
  groups.push([
    menu("align", "alignElem", "슬라이드 기준으로 맞추기", alignBody, { text: "배치" }),
    menu("order", "layers", "겹치는 순서", orderBody, { text: "순서" }),
    ib("pe-el-duplicate", "copy", "복제 (Ctrl+D)"),
    ib("pe-el-delete", "trash", "삭제 (Delete)"),
  ].join(""));
  return `<div class="pe-toolbar pe-fmt" role="toolbar" aria-label="서식"><span class="pe-tb-label pe-kind">${esc(KIND_LABEL[el.kind] || "요소")}</span>${groups.join(`<span class="rt-sep" aria-hidden="true"></span>`)}</div>`;
}

function slideListHtml(all, theme) {
  const hidden = new Set(state.deckHidden);
  return all.map((s, i) => {
    const off = hidden.has(s.id);
    const title = titleOf(s);
    return `<div class="pe-thumb${s.id === selectedId ? " on" : ""}${off ? " off" : ""}" role="button" tabindex="0" draggable="true" data-act="pe-select" data-id="${esc(s.id)}" ${s.id === selectedId ? 'aria-current="true"' : ""} title="끌어서 순서를 바꿀 수 있습니다" aria-label="${esc(i + 1)}번 슬라이드: ${esc(title)}">
      <span class="pe-thumb-preview">${slideHtml(s, i, all.length, theme)}</span>
      <span class="pe-thumb-foot"><span class="pe-thumb-n">${i + 1}</span><span class="pe-thumb-title">${esc(title)}</span>${off ? `<span class="badge muted">숨김</span>` : ""}</span>
    </div>`;
  }).join("");
}

const numField = (el, label, prop, step = 0.5) => `<label class="field compact"><span>${label}</span><input class="in num" type="number" step="${step}" value="${(Number(el[prop]) || 0).toFixed(1)}" data-change="pe-el-prop" data-prop="${prop}"></label>`;
const optField = (label, prop, value, opts) => `<label class="field compact"><span>${label}</span><select class="in" data-change="pe-el-prop" data-prop="${prop}">${opts.map(([v, t]) => `<option value="${v}"${v === value ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;

/** 오른쪽: 요소를 선택했을 때 — 도구 모음에 못 넣은 것만(위치·크기·회전, 종류별 상세) */
function propPanelHtml(el) {
  let extra = "";
  if (el.kind === "text" || el.kind === "richtext") {
    extra = `<label class="field compact"><span>모서리 둥글기(px)</span><input class="in num" type="number" min="0" step="1" value="${Number(el.radius) || 0}" data-change="pe-el-prop" data-prop="radius"></label>`;
    if (el.kind === "richtext") {
      extra += `<div class="pe-prop-wide row gap wrap"><button class="btn sm" data-act="pe-block-add" data-type="paragraph">${icon("doc", 14)}문단 추가</button><button class="btn sm" data-act="pe-block-add" data-type="bullet">${icon("list", 14)}글머리 추가</button>${(el.blocks || []).length ? `<button class="btn sm danger" data-act="pe-block-remove-last">${icon("x", 14)}마지막 삭제</button>` : ""}</div>`;
    }
  } else if (el.kind === "image") {
    extra = `${optField("채우기", "fit", el.fit || "cover", [["cover", "꽉 채움"], ["contain", "전체 보임"]])}
      <label class="field compact"><span>모서리(px)</span><input class="in num" type="number" min="0" step="1" value="${Number(el.radius) || 0}" data-change="pe-el-prop" data-prop="radius"></label>
      <label class="field compact"><span>불투명도(0~1)</span><input class="in num" type="number" step="0.1" min="0" max="1" value="${el.opacity ?? 1}" data-change="pe-el-prop" data-prop="opacity"></label>
      <label class="btn sm block pe-prop-wide">이미지 바꾸기<input type="file" accept="image/*" hidden data-change="pe-el-image"></label>`;
  } else if (el.kind === "shape") {
    extra = optField("모양", "shapeType", el.shapeType || "rect", SHAPES.map(([v, t]) => [v, t]));
    if (el.shapeType === "roundRect") extra += `<label class="field compact"><span>모서리(px)</span><input class="in num" type="number" min="0" step="1" value="${Number(el.radius) || 0}" data-change="pe-el-prop" data-prop="radius"></label>`;
  } else if (el.kind === "table") {
    extra = `<label class="field compact"><span>표 글자 크기(pt)</span><input class="in num" type="number" step="any" min="6" value="${M.fmtPt(M.fontPtOf(el))}" data-change="pe-font-pt"></label>
      <label class="check pe-prop-wide"><input type="checkbox" data-change="pe-table-header" ${el.headerRow ? "checked" : ""}> 첫 행을 머리글로</label>
      <div class="pe-prop-wide row gap wrap">
        <button class="btn sm" data-act="pe-table-row-add">${icon("plus", 14)}행 추가</button>
        <button class="btn sm" data-act="pe-table-row-remove">행 삭제</button>
        <button class="btn sm" data-act="pe-table-col-add">${icon("plus", 14)}열 추가</button>
        <button class="btn sm" data-act="pe-table-col-remove">열 삭제</button>
      </div>`;
  } else if (el.kind === "chart") {
    extra = `<p class="muted small pe-prop-wide">차트는 위치와 크기만 바꿀 수 있습니다.</p>`;
  }
  return `<h3>${esc(KIND_LABEL[el.kind] || "요소")} 속성</h3>
    <div class="pe-prop-grid">${numField(el, "X(%)", "x")}${numField(el, "Y(%)", "y")}${numField(el, "너비(%)", "w")}${numField(el, "높이(%)", "h")}${numField(el, "회전(°)", "rot", 1)}</div>
    ${extra ? `<div class="pe-prop-grid pe-prop-extra">${extra}</div>` : ""}`;
}

/** 오른쪽: 선택한 요소가 없을 때 — 슬라이드 속성(배경색·발표자 노트·숨기기) */
function slidePanelHtml(slide, custom) {
  const entry = entryOf(slide.id);
  const hasNotesOverride = Array.isArray(entry?.notes);
  const hidden = state.deckHidden.includes(slide.id);
  return `<h3>슬라이드 속성</h3>
    ${custom ? `<p class="muted small">요소를 눌러 고르면 여기에 위치·크기 같은 상세 속성이 나타납니다.</p>` : `<p class="muted small">위쪽의 <b>자유배치로 바꾸기</b>를 누르면 요소를 하나씩 옮기고 꾸밀 수 있습니다. 배경색과 발표자 노트는 지금도 바꿀 수 있습니다.</p>`}
    <div class="pe-slide-field"><span class="pe-slide-label">배경색</span>
      <span class="row gap"><input class="pe-bg-in" type="color" value="${hexOf(slide.bg, "#ffffff")}" data-change="pe-slide-bg" aria-label="슬라이드 배경색"><button class="btn sm" data-act="pe-slide-bg-clear"${slide.bg ? "" : " disabled"}>지우기</button></span>
    </div>
    <label class="field pe-slide-field"><span class="pe-slide-label">발표자 노트 <small class="muted">(한 줄에 하나)</small></span>
      <textarea class="in" rows="7" data-change="pe-slide-notes" placeholder="발표할 때 볼 메모를 적으세요.">${esc(M.notesToText(slide.notes))}</textarea></label>
    ${hasNotesOverride && !custom ? `<button class="btn sm ghost" data-act="pe-slide-notes-reset">${icon("undo", 14)}자동 노트로 되돌리기</button>` : ""}
    <label class="check"><input type="checkbox" data-change="pe-slide-hide" ${hidden ? "checked" : ""}> 발표·인쇄에서 이 슬라이드 숨기기</label>`;
}

export function render() {
  const all = allDeckSlides();
  if (!all.length) {
    return `<section class="card empty-state"><h1>편집할 슬라이드가 없습니다</h1><div class="row gap"><button class="btn" data-act="goto" data-to="present" data-sub="1">발표 모드로</button></div></section>`;
  }
  const slide = currentSlide();
  const idx = all.findIndex(s => s.id === slide.id);
  const theme = resolvedTheme();
  const custom = isCustomSlide(slide);
  const canRevertAuto = custom && slide.type !== "custom";
  if (!custom || (selectedElId && !findEl(slide.id, selectedElId))) selectedElId = null;
  const el = selectedElId ? findEl(slide.id, selectedElId) : null;
  return `<div class="page-head pe-head"><div><button class="btn ghost sm pe-back" data-act="back">${icon("left", 15)}${esc(viewLabel(prevView()))} 화면으로</button><h1>슬라이드 편집</h1></div>
    <button class="btn primary" data-act="goto" data-to="present" data-sub="${idx + 1}">${icon("play", 16)}발표로 미리 보기</button>
  </div>
  <div class="pe-tools">${insertBarHtml(slide, custom, canRevertAuto, M.chartChoices(all))}${formatBarHtml(custom, el)}</div>
  <div class="pe-layout">
    <aside class="pe-list" aria-label="슬라이드 목록">
      <div class="pe-list-head">
        <button class="btn sm block sub" data-act="pe-add-slide">${icon("slideAdd", 15)}새 슬라이드</button>
        <div class="pe-list-tools">
          <button class="icon-btn sm" data-act="pe-dup-slide" title="슬라이드 복제" aria-label="슬라이드 복제">${icon("copy", 16)}</button>
          <button class="icon-btn sm" data-act="pe-move-slide" data-dir="up" ${idx === 0 ? "disabled" : ""} title="위로" aria-label="슬라이드를 위로">${icon("arrowUp", 16)}</button>
          <button class="icon-btn sm" data-act="pe-move-slide" data-dir="down" ${idx === all.length - 1 ? "disabled" : ""} title="아래로" aria-label="슬라이드를 아래로">${icon("arrowDown", 16)}</button>
          <button class="icon-btn sm danger" data-act="pe-delete-slide" title="슬라이드 삭제" aria-label="슬라이드 삭제">${icon("trash", 16)}</button>
        </div>
      </div>
      <div class="pe-thumbs">${slideListHtml(all, theme)}</div>
    </aside>
    <div class="pe-main">
      <div class="pe-stage-wrap"><div class="pe-stage">${slideHtml(slide, idx, all.length, theme, { editable: true, selectedElId })}</div></div>
    </div>
    <aside class="pe-props" aria-label="속성">${custom && el ? propPanelHtml(el) : slidePanelHtml(slide, custom)}</aside>
  </div>`;
}

// ───────────── 동작 ─────────────
const ENUMS = { align: ["left", "center", "right"], valign: ["top", "middle", "bottom"], fit: ["cover", "contain"], shapeType: SHAPES.map(([v]) => v) };
const COLOR_PROPS = new Set(["color", "fill", "stroke", "borderColor"]);
/** 빈 값을 넣으면 '기본값으로'(속성 삭제)를 뜻하는 것들 */
const CLEARABLE = new Set(["fontFamily", "lineHeight", "fill", "borderColor", "color", "stroke", "opacity"]);

/** 새 요소가 겹쳐 쌓이지 않도록 이미 있는 요소 수만큼 살짝 비껴 놓음 */
const cascade = slideId => (elementsOf(slideId).length % 6) * 2.5;
function insert(slide, el) {
  addElement(slide.id, el);
  selectedElId = el.id;
  commit();
}

export const actions = {
  "pe-select": el => { selectedId = el.dataset.id; selectedElId = null; openMenu = null; revealSelected = true; refresh(); },
  "pe-el-select": el => { selectedElId = el.dataset.id || null; openMenu = null; refresh(); },
  "pe-menu": el => { openMenu = openMenu === el.dataset.menu ? null : el.dataset.menu; refresh(); },
  "pe-detach": () => {
    const slide = currentSlide(); if (!slide) return;
    patchEntry(slide.id, { mode: "custom", elements: elementsFromAutoSlide(slide) });
    selectedElId = null;
    commit();
  },
  "pe-revert-auto": () => {
    const slide = currentSlide(); if (!slide) return;
    patchEntry(slide.id, { mode: "auto", elements: [] });
    selectedElId = null;
    commit();
  },
  "pe-add-slide": () => {
    const cur = currentSlide();
    const order = effectiveDeckOrder(); // 새 슬라이드를 customSlides 에 넣기 전에 지금 순서를 먼저 굳혀 둠(안 그러면 뒤에 한 번 더 끼어들어감)
    const ns = blankCustomSlide();
    const customSlides = { ...state.deckOverrides.customSlides, [ns.id]: ns };
    const bySlide = { ...state.deckOverrides.bySlide, [ns.id]: { mode: "custom", elements: [] } };
    state.deckOverrides = { ...state.deckOverrides, customSlides, bySlide };
    const at = cur ? order.indexOf(cur.id) : -1;
    order.splice(at >= 0 ? at + 1 : order.length, 0, ns.id);
    state.deckOrder = order;
    selectedId = ns.id; selectedElId = null; revealSelected = true;
    commit();
  },
  "pe-dup-slide": () => {
    const cur = currentSlide(); if (!cur) return;
    const order = effectiveDeckOrder(); // pe-add-slide 와 같은 이유로 새 슬라이드를 넣기 전에 순서를 굳힘
    const ns = blankCustomSlide();
    // 자유배치 슬라이드는 요소를 그대로, 자동 슬라이드는 자유배치로 바꾼 것과 같은 요소로 — 어느 쪽이든 새 id 를 발급한 사용자 슬라이드가 됨
    const src = isCustomSlide(cur) ? elementsOf(cur.id) : elementsFromAutoSlide(cur);
    ns.title = `${titleOf(cur)} (복사)`;
    const notes = Array.isArray(cur.notes) ? [...cur.notes] : [];
    const customSlides = { ...state.deckOverrides.customSlides, [ns.id]: { ...ns, notes } };
    const bySlide = { ...state.deckOverrides.bySlide, [ns.id]: stripUndef({ mode: "custom", elements: M.duplicateElements(src, newElId), text: {}, textBase: {}, bg: cur.bg, notes: notes.length ? notes : undefined }) };
    state.deckOverrides = { ...state.deckOverrides, customSlides, bySlide };
    const at = order.indexOf(cur.id);
    order.splice(at >= 0 ? at + 1 : order.length, 0, ns.id);
    state.deckOrder = order;
    selectedId = ns.id; selectedElId = null; revealSelected = true;
    commit();
  },
  "pe-delete-slide": () => {
    const slide = currentSlide(); if (!slide) return;
    const before = effectiveDeckOrder(), at = before.indexOf(slide.id);
    const neighbor = before[at + 1] ?? before[at - 1] ?? null; // 지운 뒤에는 그 자리를 이은 슬라이드를 고름(목록이 맨 위로 튀지 않게)
    state.deckOrder = before.filter(id => id !== slide.id);
    if (state.deckOverrides.customSlides[slide.id]) {
      const customSlides = { ...state.deckOverrides.customSlides }; delete customSlides[slide.id];
      const bySlide = { ...state.deckOverrides.bySlide }; delete bySlide[slide.id];
      state.deckOverrides = { ...state.deckOverrides, customSlides, bySlide };
    } else if (!state.deckHidden.includes(slide.id)) {
      state.deckHidden = [...state.deckHidden, slide.id];
    }
    selectedId = neighbor; selectedElId = null; revealSelected = true;
    commit();
    toast("슬라이드를 지웠습니다. 되돌리려면 Ctrl+Z를 누르세요.", "info");
  },
  "pe-move-slide": el => {
    const slide = currentSlide(); if (!slide) return;
    const order = effectiveDeckOrder();
    const idx = order.indexOf(slide.id);
    const to = idx + (el.dataset.dir === "up" ? -1 : 1);
    if (to < 0 || to >= order.length) return;
    [order[idx], order[to]] = [order[to], order[idx]];
    state.deckOrder = order;
    revealSelected = true;
    commit();
  },
  /** 끌어놓기와 같은 동작: data-from 을 data-to 의 앞(data-after 가 "1" 이면 뒤)으로 */
  "pe-reorder": el => {
    if (reorderSlides(el.dataset.from, el.dataset.to, el.dataset.after === "1")) commit();
  },
  "pe-add-text": () => {
    const slide = currentSlide(); if (!slide) return;
    const c = cascade(slide.id);
    insert(slide, { id: newElId(), kind: "text", x: 30 + c, y: 40 + c, w: 40, h: 12, rot: 0, z: nextZ(slide.id), markup: "새 텍스트", fontSize: 1.8, align: "left", weight: null, color: null });
  },
  "pe-add-shape": el => {
    const slide = currentSlide(); if (!slide) return;
    const type = SHAPES.some(([v]) => v === el?.dataset?.shape) ? el.dataset.shape : "rect";
    const c = cascade(slide.id);
    const linear = type === "line" || type === "arrow";
    const shape = linear
      ? { id: newElId(), kind: "shape", x: 30 + c, y: 48 + c, w: 30, h: 4, rot: 0, z: nextZ(slide.id), shapeType: type, fill: null, stroke: "#3B5A7A", strokeWidth: 3 }
      : { id: newElId(), kind: "shape", x: 30 + c, y: 30 + c, w: 30, h: 20, rot: 0, z: nextZ(slide.id), shapeType: type, fill: "#3B5A7A", stroke: null, strokeWidth: 0 };
    if (type === "roundRect") shape.radius = 16;
    insert(slide, shape);
  },
  "pe-add-chart": el => {
    const slide = currentSlide(); if (!slide) return;
    const choices = M.chartChoices(allDeckSlides());
    const pick = choices.find(c => c.slideId === el?.dataset?.slide) || choices[Number(el?.dataset?.idx)] || (el?.dataset?.slide ? null : choices[0]);
    if (!pick) { toast("넣을 수 있는 분석 차트가 없습니다.", "info"); return; }
    const c = cascade(slide.id);
    insert(slide, { id: newElId(), kind: "chart", x: 15 + c, y: 18 + c, w: 60, h: 62, rot: 0, z: nextZ(slide.id), chart: pick.chart });
  },
  "pe-add-richtext": () => {
    const slide = currentSlide(); if (!slide) return;
    const c = cascade(slide.id);
    insert(slide, { id: newElId(), kind: "richtext", x: 25 + c, y: 25 + c, w: 50, h: 40, rot: 0, z: nextZ(slide.id), fontSize: 1.4, align: "left", blocks: [{ type: "paragraph", text: "새 문단" }] });
  },
  "pe-add-table": () => {
    const slide = currentSlide(); if (!slide) return;
    const c = cascade(slide.id);
    insert(slide, { id: newElId(), kind: "table", x: 20 + c, y: 20 + c, w: 60, h: 30, rot: 0, z: nextZ(slide.id), fontSize: 1.35, headerRow: true, rows: [["제목1", "제목2"], ["내용1", "내용2"]] });
  },
  "pe-block-add": el => {
    const [slide, cur] = selection(); if (!cur) return;
    const type = el.dataset.type === "bullet" ? "bullet" : "paragraph";
    updateElement(slide.id, cur.id, { blocks: [...(cur.blocks || []), { type, text: type === "bullet" ? "새 항목" : "새 문단" }] });
    commit();
  },
  "pe-block-remove-last": () => {
    const [slide, cur] = selection();
    if (!cur?.blocks?.length) return;
    updateElement(slide.id, cur.id, { blocks: cur.blocks.slice(0, -1) });
    commit();
  },
  "pe-table-header": el => {
    const [slide, cur] = selection(); if (!cur) return;
    updateElement(slide.id, cur.id, { headerRow: el.checked });
    commit();
  },
  "pe-table-row-add": () => {
    const [slide, cur] = selection(); if (!cur) return;
    const cols = cur.rows[0]?.length || 2;
    updateElement(slide.id, cur.id, { rows: [...cur.rows, Array(cols).fill("")] });
    commit();
  },
  "pe-table-row-remove": () => {
    const [slide, cur] = selection();
    if (!cur || cur.rows.length <= 1) return;
    updateElement(slide.id, cur.id, { rows: cur.rows.slice(0, -1) });
    commit();
  },
  "pe-table-col-add": () => {
    const [slide, cur] = selection(); if (!cur) return;
    updateElement(slide.id, cur.id, { rows: cur.rows.map(r => [...r, ""]) });
    commit();
  },
  "pe-table-col-remove": () => {
    const [slide, cur] = selection();
    if (!cur || (cur.rows[0]?.length || 0) <= 1) return;
    updateElement(slide.id, cur.id, { rows: cur.rows.map(r => r.slice(0, -1)) });
    commit();
  },
  "pe-add-image": async el => {
    const slide = currentSlide();
    const file = el.files?.[0];
    if (!slide || !file) return;
    if (file.size > 8 * 1024 * 1024) { toast("이미지가 너무 큽니다(8MB 이하)", "bad"); el.value = ""; return; }
    const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const c = cascade(slide.id);
    insert(slide, { id: newElId(), kind: "image", x: 25 + c, y: 25 + c, w: 50, h: 40, rot: 0, z: nextZ(slide.id), src, fit: "cover", radius: 0, opacity: 1 });
    el.value = "";
  },
  "pe-el-image": async el => {
    const [slide, cur] = selection();
    const file = el.files?.[0];
    if (!cur || !file) return;
    if (file.size > 8 * 1024 * 1024) { toast("이미지가 너무 큽니다(8MB 이하)", "bad"); el.value = ""; return; }
    const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    updateElement(slide.id, cur.id, { src });
    commit();
    el.value = "";
  },
  /** 속성 한 개 고치기(입력칸·선택칸·색 선택). 숫자가 아니거나 범위를 벗어나면 다듬어 저장 — 0·NaN 이 저장돼 요소가 사라지는 일이 없게 */
  "pe-el-prop": el => {
    const [slide, cur] = selection(); if (!cur) return;
    const prop = el.dataset.prop, raw = el.value;
    let value;
    if (prop === "fontSize") value = M.clampFontCqw(raw);
    else if (M.NUMERIC_PROPS.has(prop)) {
      value = M.cleanNumber(prop, raw);
      if (value === null) {
        if (raw === "" && CLEARABLE.has(prop)) value = undefined;
        else { refresh(); return; } // 잘못된 입력: 저장하지 않고 원래 값을 다시 보여 줌
      }
    } else if (COLOR_PROPS.has(prop)) value = M.safeCssColor(raw) || undefined;
    else if (prop === "fontFamily") value = cleanFontName(raw) || undefined;
    else if (ENUMS[prop]) { if (!ENUMS[prop].includes(raw)) return; value = raw; }
    else return;
    const patch = { [prop]: value };
    // 위치·크기를 손으로 입력해도 슬라이드 밖으로 나가지 않게
    if (prop === "x" && value !== undefined) patch.x = Math.min(value, Math.max(0, 100 - cur.w));
    if (prop === "y" && value !== undefined) patch.y = Math.min(value, Math.max(0, 100 - cur.h));
    if (prop === "w" && value !== undefined) patch.w = Math.min(value, Math.max(M.MIN_PCT, 100 - cur.x));
    if (prop === "h" && value !== undefined) patch.h = Math.min(value, Math.max(M.MIN_PCT, 100 - cur.y));
    updateElement(slide.id, cur.id, patch);
    commit();
  },
  /** 글자 크기 입력(pt) → 저장은 cqw. 비었거나 숫자가 아니면 최솟값(≈6pt) */
  "pe-font-pt": el => {
    const [slide, cur] = selection();
    if (!cur || !M.FONT_KINDS.has(cur.kind)) return;
    updateElement(slide.id, cur.id, { fontSize: M.fontCqwFromPt(el.value) });
    commit();
  },
  "pe-font-step": el => {
    const [slide, cur] = selection();
    if (!cur || !M.FONT_KINDS.has(cur.kind)) return;
    const from = Number.isFinite(Number(cur.fontSize)) && Number(cur.fontSize) > 0 ? Number(cur.fontSize) : M.DEFAULT_FONT_CQW[cur.kind];
    updateElement(slide.id, cur.id, { fontSize: M.stepFontCqw(from, Number(el.dataset.dir) < 0 ? -1 : 1) });
    commit();
  },
  /** 굵게·기울임·밑줄·취소선 켜고 끄기 */
  "pe-toggle": el => {
    const [slide, cur] = selection(); if (!cur) return;
    const prop = el.dataset.prop;
    if (prop === "weight") updateElement(slide.id, cur.id, { weight: cur.weight === "bold" ? null : "bold" });
    else if (["italic", "underline", "strike"].includes(prop)) updateElement(slide.id, cur.id, { [prop]: !cur[prop] });
    else return;
    commit();
  },
  /** 버튼으로 고르는 문자열 값(정렬·세로정렬) */
  "pe-set": el => {
    const [slide, cur] = selection(); if (!cur) return;
    const { prop, value } = el.dataset;
    if (!ENUMS[prop]?.includes(value)) return;
    updateElement(slide.id, cur.id, { [prop]: value });
    commit();
  },
  /** 채우기 없음 등 — 속성을 지워 기본으로 */
  "pe-clear": el => {
    const [slide, cur] = selection(); if (!cur) return;
    if (!CLEARABLE.has(el.dataset.prop)) return;
    updateElement(slide.id, cur.id, { [el.dataset.prop]: undefined });
    commit();
  },
  "pe-align-el": el => {
    const [slide, cur] = selection(); if (!cur) return;
    const patch = M.alignBox(cur, el.dataset.how);
    if (!Object.keys(patch).length) return;
    updateElement(slide.id, cur.id, patch);
    commit();
  },
  "pe-z": el => {
    const [slide, cur] = selection(); if (!cur || !M.Z_HOW.includes(el.dataset.how)) return;
    patchEntry(slide.id, { elements: M.reorderZ(elementsOf(slide.id), cur.id, el.dataset.how) });
    commit();
  },
  "pe-el-front": () => { actions["pe-z"]({ dataset: { how: "front" } }); },
  "pe-el-back": () => { actions["pe-z"]({ dataset: { how: "back" } }); },
  "pe-el-weight": el => {
    const [slide, cur] = selection(); if (!cur) return;
    updateElement(slide.id, cur.id, { weight: el.checked ? "bold" : null });
    commit();
  },
  "pe-el-duplicate": () => {
    const [slide, cur] = selection(); if (!cur) return;
    copyEl(slide.id, cur.id);
    if (pasteEl(slide.id)) commit();
  },
  "pe-el-copy": () => { const [slide, cur] = selection(); if (cur) copyEl(slide.id, cur.id); },
  "pe-el-cut": () => {
    const [slide, cur] = selection(); if (!cur) return;
    copyEl(slide.id, cur.id); removeElement(slide.id, cur.id); selectedElId = null; commit();
  },
  "pe-el-paste": () => { const slide = currentSlide(); if (slide && isCustomSlide(slide) && pasteEl(slide.id)) commit(); },
  "pe-el-delete": () => {
    const [slide, cur] = selection(); if (!cur) return;
    removeElement(slide.id, cur.id);
    selectedElId = null;
    commit();
  },
  // 슬라이드 속성(선택한 요소가 없을 때의 오른쪽 패널)
  "pe-slide-bg": el => {
    const slide = currentSlide(); if (!slide) return;
    patchEntry(slide.id, { bg: M.safeCssColor(el.value) || undefined });
    commit();
  },
  "pe-slide-bg-clear": () => {
    const slide = currentSlide(); if (!slide) return;
    patchEntry(slide.id, { bg: undefined });
    commit();
  },
  /** 발표자 노트: 줄마다 하나. 자동 노트와 똑같으면 직접 고친 값으로 치지 않고 지움(자동 노트가 나중에 바뀌어도 따라가도록) */
  "pe-slide-notes": el => {
    const slide = currentSlide(); if (!slide) return;
    const lines = M.notesFromText(el.value);
    const base = (state.deckOverrides.customSlides[slide.id] || deckSlides().find(x => x.id === slide.id))?.notes || [];
    patchEntry(slide.id, { notes: JSON.stringify(lines) === JSON.stringify(base) ? undefined : lines });
    commit();
  },
  "pe-slide-notes-reset": () => {
    const slide = currentSlide(); if (!slide) return;
    patchEntry(slide.id, { notes: undefined });
    commit();
  },
  "pe-slide-hide": el => {
    const slide = currentSlide(); if (!slide) return;
    const has = state.deckHidden.includes(slide.id);
    if (el.checked === has) return;
    state.deckHidden = has ? state.deckHidden.filter(x => x !== slide.id) : [...state.deckHidden, slide.id];
    commit();
  },
};
