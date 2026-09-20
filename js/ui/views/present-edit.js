// ⑥b 슬라이드 편집: 발표 슬라이드 문구 직접 편집 + 자유배치(요소 위치·크기·회전·이미지·도형) + 슬라이드 추가·삭제·순서변경
import { state, allDeckSlides, blankCustomSlide, effectiveDeckOrder } from "../store.js";
import { slideHtml, isCustomSlide } from "./present.js";
import { elementsFromAutoSlide } from "../../present/edit/detach.js";
import { installCanvasInteractions, installKeyboardNudge } from "../present-canvas.js";
import { trackChange } from "../history/manager.js";
import { esc, toast } from "../util.js";
import { go, refresh } from "../router.js";
import { icon } from "../icons.js";
import { resolvedTheme } from "../theme.js";

let selectedId = null;
let selectedElId = null;
let cleanupFns = [];
let seq = 0;
const newElId = () => `el${Date.now().toString(36)}${(seq++).toString(36)}`;

const commit = () => { trackChange(); refresh(); };

function currentSlide() {
  const all = allDeckSlides();
  if (!selectedId || !all.some(s => s.id === selectedId)) selectedId = all[0]?.id || null;
  return all.find(s => s.id === selectedId) || null;
}
const entryOf = slideId => state.deckOverrides.bySlide[slideId];
const elementsOf = slideId => entryOf(slideId)?.elements || [];
const nextZ = slideId => Math.max(0, ...elementsOf(slideId).map(x => x.z || 1)) + 1;

function patchEntry(slideId, patch) {
  const bySlide = { ...state.deckOverrides.bySlide };
  const entry = bySlide[slideId] || { mode: "custom", elements: [], text: {}, textBase: {} };
  bySlide[slideId] = { ...entry, ...patch };
  state.deckOverrides = { ...state.deckOverrides, bySlide };
}
function updateElement(slideId, elId, patch) {
  patchEntry(slideId, { elements: elementsOf(slideId).map(it => (it.id === elId ? { ...it, ...patch } : it)) });
}
function addElement(slideId, el) { patchEntry(slideId, { elements: [...elementsOf(slideId), el] }); }
function removeElement(slideId, elId) { patchEntry(slideId, { elements: elementsOf(slideId).filter(x => x.id !== elId) }); }

function teardownInteractions() { cleanupFns.forEach(fn => fn()); cleanupFns = []; }

export function mount() {
  teardownInteractions();
  const root = document.querySelector(".pe-stage");
  const slide = currentSlide();
  if (!root || !slide || !isCustomSlide(slide)) return;
  root.tabIndex = -1;
  const hooks = {
    getElements: () => elementsOf(slide.id),
    onChange: (id, patch) => { selectedElId = id; updateElement(slide.id, id, patch); commit(); },
    onSelect: id => { selectedElId = id; refresh(); },
  };
  cleanupFns.push(installCanvasInteractions(root, hooks));
  cleanupFns.push(installKeyboardNudge(root, {
    getSelected: () => selectedElId,
    getElements: hooks.getElements,
    onChange: hooks.onChange,
    onDelete: id => { removeElement(slide.id, id); selectedElId = null; commit(); },
  }));
}
export function unmount() { teardownInteractions(); }

function slideListHtml() {
  const all = allDeckSlides();
  const hidden = new Set(state.deckHidden);
  return all.map((s, i) => {
    const off = hidden.has(s.id);
    const title = state.deckOverrides.bySlide[s.id]?.text?.title ?? s.title;
    return `<button class="pe-thumb${s.id === selectedId ? " on" : ""}${off ? " off" : ""}" data-act="pe-select" data-id="${esc(s.id)}">
      <span class="pe-thumb-n">${i + 1}</span><span class="pe-thumb-title">${esc(title)}</span>
      ${off ? `<span class="badge muted">숨김</span>` : ""}
    </button>`;
  }).join("");
}

function propPanelHtml(slide) {
  const el = elementsOf(slide.id).find(x => x.id === selectedElId);
  if (!el) return `<p class="muted small">슬라이드의 빈 곳을 눌러 새 요소를 추가하거나, 기존 요소를 눌러 고치세요.</p>`;
  const num = (label, prop, step = 1) => `<label class="field compact"><span>${label}</span><input class="in num" type="number" step="${step}" value="${Number(el[prop] ?? 0).toFixed(1)}" data-change="pe-el-prop" data-prop="${prop}"></label>`;
  let kindFields = "";
  if (el.kind === "text") {
    kindFields = `
      <label class="field compact"><span>글자 크기</span><input class="in num" type="number" step="0.1" min="0.6" max="10" value="${el.fontSize ?? 1.8}" data-change="pe-el-prop" data-prop="fontSize"></label>
      <label class="field compact"><span>정렬</span><select class="in" data-change="pe-el-prop" data-prop="align">${["left", "center", "right"].map(a => `<option value="${a}"${el.align === a ? " selected" : ""}>${{ left: "왼쪽", center: "가운데", right: "오른쪽" }[a]}</option>`).join("")}</select></label>
      <label class="field compact"><span>굵게</span><input type="checkbox" data-change="pe-el-weight" ${el.weight === "bold" ? "checked" : ""}></label>
      <label class="field compact"><span>글자색</span><input class="in" type="color" value="${el.color || "#000000"}" data-change="pe-el-prop" data-prop="color"></label>`;
  } else if (el.kind === "image") {
    kindFields = `
      <label class="field compact"><span>채우기</span><select class="in" data-change="pe-el-prop" data-prop="fit">${["cover", "contain"].map(f => `<option value="${f}"${el.fit === f ? " selected" : ""}>${f === "cover" ? "꽉 채움" : "전체 보임"}</option>`).join("")}</select></label>
      <label class="field compact"><span>모서리 둥글기</span><input class="in num" type="number" min="0" value="${el.radius || 0}" data-change="pe-el-prop" data-prop="radius"></label>
      <label class="field compact"><span>불투명도</span><input class="in num" type="number" step="0.1" min="0" max="1" value="${el.opacity ?? 1}" data-change="pe-el-prop" data-prop="opacity"></label>
      <label class="btn sm block">이미지 바꾸기<input type="file" accept="image/*" hidden data-change="pe-el-image"></label>`;
  } else if (el.kind === "shape") {
    kindFields = `
      <label class="field compact"><span>모양</span><select class="in" data-change="pe-el-prop" data-prop="shapeType">${["rect", "ellipse"].map(t => `<option value="${t}"${el.shapeType === t ? " selected" : ""}>${t === "rect" ? "사각형" : "원·타원"}</option>`).join("")}</select></label>
      <label class="field compact"><span>채우기색</span><input class="in" type="color" value="${el.fill || "#3B5A7A"}" data-change="pe-el-prop" data-prop="fill"></label>
      <label class="field compact"><span>테두리색</span><input class="in" type="color" value="${el.stroke || "#000000"}" data-change="pe-el-prop" data-prop="stroke"></label>
      <label class="field compact"><span>테두리 두께</span><input class="in num" type="number" min="0" value="${el.strokeWidth || 0}" data-change="pe-el-prop" data-prop="strokeWidth"></label>`;
  }
  return `<div class="pe-prop-grid">${num("X%", "x", 0.5)}${num("Y%", "y", 0.5)}${num("너비%", "w", 0.5)}${num("높이%", "h", 0.5)}${num("회전°", "rot", 1)}</div>
    <div class="pe-prop-grid">${kindFields}</div>
    <div class="row gap end">
      <button class="btn sm" data-act="pe-el-back" title="맨 뒤로">${icon("shrink", 14)}맨 뒤로</button>
      <button class="btn sm" data-act="pe-el-front" title="맨 앞으로">${icon("expand", 14)}맨 앞으로</button>
      <button class="btn sm" data-act="pe-el-duplicate">${icon("copy", 14)}복제</button>
      <button class="btn sm danger" data-act="pe-el-delete">${icon("x", 14)}삭제</button>
    </div>`;
}

export function render() {
  const all = allDeckSlides();
  if (!all.length) {
    return `<section class="card empty-state"><h2>편집할 슬라이드가 없습니다</h2><div class="row gap"><button class="btn" data-act="goto" data-to="present" data-sub="1">발표 모드로</button></div></section>`;
  }
  const slide = currentSlide();
  const idx = all.findIndex(s => s.id === slide.id);
  const theme = resolvedTheme();
  const custom = isCustomSlide(slide);
  const canRevertAuto = custom && slide.type !== "custom";
  return `<div class="page-head"><div><h2>슬라이드 편집</h2><p class="muted small">텍스트를 눌러 바로 고치고, 자유배치로 바꾸면 위치·크기·색·이미지까지 원하는 대로 꾸밀 수 있습니다.</p></div>
    <button class="btn primary" data-act="goto" data-to="present" data-sub="${idx + 1}">${icon("play", 16)}발표로 미리 보기</button>
  </div>
  <div class="pe-layout">
    <aside class="pe-list">
      ${slideListHtml()}
      <button class="btn sm block sub" data-act="pe-add-slide">${icon("grid", 14)}빈 슬라이드 추가</button>
    </aside>
    <div class="pe-main">
      <div class="pe-toolbar">
        ${custom
          ? (canRevertAuto ? `<button class="btn sm" data-act="pe-revert-auto">${icon("undo", 14)}자동으로 되돌리기</button>` : `<span class="badge info">자유배치 슬라이드</span>`)
          : `<button class="btn sm primary" data-act="pe-detach">${icon("edit", 14)}자유배치로 바꾸기</button>`}
        ${custom ? `
        <span class="rt-sep" aria-hidden="true"></span>
        <button class="btn sm" data-act="pe-add-text">${icon("doc", 14)}텍스트</button>
        <label class="btn sm">${icon("chart", 14)}이미지<input type="file" accept="image/*" hidden data-change="pe-add-image"></label>
        <button class="btn sm" data-act="pe-add-shape">${icon("grid", 14)}도형</button>` : ""}
        <span class="rt-spacer"></span>
        <button class="btn sm" data-act="pe-move-slide" data-dir="up" ${idx === 0 ? "disabled" : ""} title="위로">${icon("left", 14, "rot90")}</button>
        <button class="btn sm" data-act="pe-move-slide" data-dir="down" ${idx === all.length - 1 ? "disabled" : ""} title="아래로">${icon("right", 14, "rot90")}</button>
        <button class="btn sm danger" data-act="pe-delete-slide">${icon("x", 14)}슬라이드 삭제</button>
      </div>
      <div class="pe-stage-wrap"><div class="pe-stage">${slideHtml(slide, idx, all.length, theme, { editable: true })}</div></div>
    </div>
    <aside class="pe-props"><h3>속성</h3>${custom ? propPanelHtml(slide) : `<p class="muted small">자유배치로 바꾸면 요소를 하나씩 옮기고 꾸밀 수 있습니다.</p>`}</aside>
  </div>`;
}

export const actions = {
  "pe-select": el => { selectedId = el.dataset.id; selectedElId = null; refresh(); },
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
    selectedId = ns.id; selectedElId = null;
    commit();
  },
  "pe-delete-slide": () => {
    const slide = currentSlide(); if (!slide) return;
    state.deckOrder = effectiveDeckOrder().filter(id => id !== slide.id);
    if (state.deckOverrides.customSlides[slide.id]) {
      const customSlides = { ...state.deckOverrides.customSlides }; delete customSlides[slide.id];
      const bySlide = { ...state.deckOverrides.bySlide }; delete bySlide[slide.id];
      state.deckOverrides = { ...state.deckOverrides, customSlides, bySlide };
    } else if (!state.deckHidden.includes(slide.id)) {
      state.deckHidden = [...state.deckHidden, slide.id];
    }
    selectedId = null; selectedElId = null;
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
    commit();
  },
  "pe-add-text": () => {
    const slide = currentSlide(); if (!slide) return;
    const el = { id: newElId(), kind: "text", x: 30, y: 40, w: 40, h: 12, rot: 0, z: nextZ(slide.id), markup: "새 텍스트", fontSize: 1.8, align: "left", weight: null, color: null };
    addElement(slide.id, el);
    selectedElId = el.id;
    commit();
  },
  "pe-add-shape": () => {
    const slide = currentSlide(); if (!slide) return;
    const el = { id: newElId(), kind: "shape", x: 30, y: 30, w: 30, h: 20, rot: 0, z: nextZ(slide.id), shapeType: "rect", fill: "#3B5A7A", stroke: null, strokeWidth: 0 };
    addElement(slide.id, el);
    selectedElId = el.id;
    commit();
  },
  "pe-add-image": async el => {
    const slide = currentSlide();
    const file = el.files?.[0];
    if (!slide || !file) return;
    if (file.size > 8 * 1024 * 1024) { toast("이미지가 너무 큽니다(8MB 이하)", "bad"); el.value = ""; return; }
    const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const image = { id: newElId(), kind: "image", x: 25, y: 25, w: 50, h: 40, rot: 0, z: nextZ(slide.id), src, fit: "cover", radius: 0, opacity: 1 };
    addElement(slide.id, image);
    selectedElId = image.id;
    commit();
    el.value = "";
  },
  "pe-el-image": async el => {
    const slide = currentSlide();
    const file = el.files?.[0];
    if (!slide || !file || !selectedElId) return;
    if (file.size > 8 * 1024 * 1024) { toast("이미지가 너무 큽니다(8MB 이하)", "bad"); el.value = ""; return; }
    const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    updateElement(slide.id, selectedElId, { src });
    commit();
    el.value = "";
  },
  "pe-el-prop": el => {
    const slide = currentSlide(); if (!slide || !selectedElId) return;
    const prop = el.dataset.prop;
    const numeric = ["x", "y", "w", "h", "rot", "fontSize", "strokeWidth", "radius", "opacity"];
    updateElement(slide.id, selectedElId, { [prop]: numeric.includes(prop) ? Number(el.value) : el.value });
    commit();
  },
  "pe-el-weight": el => {
    const slide = currentSlide(); if (!slide || !selectedElId) return;
    updateElement(slide.id, selectedElId, { weight: el.checked ? "bold" : null });
    commit();
  },
  "pe-el-duplicate": () => {
    const slide = currentSlide(); if (!slide || !selectedElId) return;
    const cur = elementsOf(slide.id).find(x => x.id === selectedElId);
    if (!cur) return;
    const copy = { ...cur, id: newElId(), x: Math.min(100 - cur.w, cur.x + 3), y: Math.min(100 - cur.h, cur.y + 3), z: nextZ(slide.id) };
    addElement(slide.id, copy);
    selectedElId = copy.id;
    commit();
  },
  "pe-el-delete": () => {
    const slide = currentSlide(); if (!slide || !selectedElId) return;
    removeElement(slide.id, selectedElId);
    selectedElId = null;
    commit();
  },
  "pe-el-front": () => {
    const slide = currentSlide(); if (!slide || !selectedElId) return;
    updateElement(slide.id, selectedElId, { z: nextZ(slide.id) });
    commit();
  },
  "pe-el-back": () => {
    const slide = currentSlide(); if (!slide || !selectedElId) return;
    const minZ = Math.min(0, ...elementsOf(slide.id).map(x => x.z || 1));
    updateElement(slide.id, selectedElId, { z: minZ - 1 });
    commit();
  },
};
