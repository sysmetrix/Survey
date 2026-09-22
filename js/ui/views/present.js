// ⑥ 발표 모드: 분석 결과를 16:9 슬라이드로 — 키보드·전체화면·개요·발표자 노트·슬라이드 숨기기·PDF 인쇄
import { state, assembledDeckSlides, allDeckSlides } from "../store.js";
import { chartSvg } from "../../report/model.js";
import { inlineHtml } from "../../report/render-html.js";
import { slideHtmlCustom } from "../../present/edit/render-custom.js";
import { maskPII } from "../../core/util.js";
import { buildPresentHtml, EXPORT_ICONS } from "../../present/export-html.js";
import { renderPptx } from "../../report/render-pptx.js";
import { loadJSZip } from "../jszip-loader.js";
import { svgToPng } from "../../charts/rasterize.js";
import { esc, busy, download, safeFileName, toast, nextFrame } from "../util.js";
import { go, refresh, parseHash } from "../router.js";
import { icon } from "../icons.js";
import { resolvedTheme } from "../theme.js";

const PREF_KEY = "survey-v5-present";
const ui = (() => {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { /* 저장소 사용 불가 */ }
  return { stage: ["auto", "light", "dark"].includes(p.stage) ? p.stage : "auto", notes: !!p.notes };
})();
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(ui)); } catch { /* 무시 */ } };
const view = { overview: false, blank: false, help: false, save: false, printing: false, digits: "", startedAt: 0 };

const TONE = { good: ["✓", "양호"], warning: ["△", "주의"], critical: ["✕", "보완 필요"] };
const STAGE_LABEL = { auto: "화면 테마 따름", light: "밝은 무대", dark: "어두운 무대" };
const KEYS = [["→  Space  PgDn", "다음"], ["←  PgUp", "이전"], ["Home / End", "처음 / 마지막"], ["숫자 + Enter", "해당 번호로 이동"], ["O", "슬라이드 개요"], ["N", "발표자 노트"], ["F", "전체화면"], ["B", "화면 가리기"], ["T", "무대 밝기"], ["P", "발표 자료 내려받기"], ["Esc", "닫기 · 발표 끝내기"]];

export const visibleSlides = () => assembledDeckSlides();
const stageTheme = () => (ui.stage === "auto" ? resolvedTheme() : ui.stage);

function chart(c, theme) {
  if (!c) return "";
  try { return chartSvg({ ...c, opts: { ...(c.opts || {}), theme } }).svg; } catch (e) { return `<p class="s-err">차트를 그리지 못했습니다: ${esc(e.message)}</p>`; }
}
const toneMark = t => (TONE[t] ? `<span class="tone ${t}" role="img" aria-label="${TONE[t][1]}">${TONE[t][0]}</span>` : "");
const quoteText = q => maskPII(typeof q === "string" ? q : q?.text ?? "");
const list = items => `<ul class="s-list">${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
/** 제목을 슬라이드 본문 밖(발표자 노트·개요 라벨·내보내기 파일명 등)에 쓸 때도 직접 고친 문구를 그대로 반영 */
const displayTitle = s => state.deckOverrides.bySlide[s.id]?.text?.title ?? s.title;

/** 슬라이드 문구 편집 필드: 직접 고친 문구가 있으면(무대·개요·인쇄·내보내기 모두) 항상 그 문구를 보여주고,
 *  editable=true(슬라이드 편집 화면)일 때만 contenteditable 표식 문자열 편집(state.deckOverrides.bySlide 에 저장)으로 감쌈 */
function slideField(slideId, field, autoText, editable) {
  const entry = state.deckOverrides.bySlide[slideId];
  const text = entry?.text?.[field] ?? autoText;
  if (!editable) return inlineHtml(text);
  const key = `deck:${slideId}.${field}`;
  return `<span class="r-txt" contenteditable="true" spellcheck="false" data-edit="${esc(key)}" data-raw="${esc(text)}" data-auto="${esc(autoText)}">${inlineHtml(text)}</span>`;
}

/** 슬라이드가 자유배치 모드인지(처음부터 빈 슬라이드로 만들었거나, 자동 슬라이드를 디태치함) */
export const isCustomSlide = s => (state.deckOverrides.bySlide[s.id]?.mode || (s.type === "custom" ? "custom" : "auto")) === "custom";

/** 슬라이드 1장 HTML (무대·개요 썸네일·인쇄·편집 공용). editable=true(슬라이드 편집 화면)일 때만 문구를 직접 고칠 수 있음 */
export function slideHtml(s, i, total, theme, { editable = false, selectedElId = null } = {}) {
  if (isCustomSlide(s)) return slideHtmlCustom(s, state.deckOverrides.bySlide[s.id], i, total, theme, { editable, selectedElId });
  const org = state.settings.orgName || "";
  const head = `<header class="s-head"><p class="s-eyebrow">${esc(s.section)}</p><h2 class="s-title">${slideField(s.id, "title", s.title, editable)}</h2>${s.subtitle ? `<p class="s-sub">${slideField(s.id, "subtitle", s.subtitle, editable)}</p>` : ""}</header>`;
  let inner;
  switch (s.type) {
    case "cover":
      inner = `<div class="s-cover"><p class="s-eyebrow">${esc(s.section)}</p><h1 class="s-cover-title">${slideField(s.id, "title", s.title, editable)}</h1>${s.subtitle ? `<p class="s-sub">${slideField(s.id, "subtitle", s.subtitle, editable)}</p>` : ""}${s.chips?.length ? `<ul class="s-chips">${s.chips.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}</div><div class="s-art" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
      break;
    case "stats":
      inner = head + `<div class="s-stats n${s.stats.length}">${s.stats.map((st, si) => `<div class="s-stat"><p class="s-stat-label">${slideField(s.id, `stats.${si}.label`, st.label, editable)}</p><p class="s-stat-value">${slideField(s.id, `stats.${si}.value`, st.value, editable)}<small>${esc(st.unit || "")}</small></p><p class="s-stat-sub">${toneMark(st.tone)}${slideField(s.id, `stats.${si}.sub`, st.sub || "", editable)}</p></div>`).join("")}</div>`;
      break;
    case "hero":
      inner = head + `<div class="s-body s-hero-body"><div class="s-hero"><p class="s-hero-value">${slideField(s.id, "hero.value", s.hero.value, editable)}<small>${esc(s.hero.unit || "")}</small></p><p class="s-hero-cap">${slideField(s.id, "hero.caption", s.hero.caption, editable)}</p>${list(s.hero.facts)}</div><div class="s-chart">${chart(s.chart, theme)}</div></div>`;
      break;
    case "voice": {
      const group = (title, qs, tone) => (qs?.length ? `<section class="s-qgroup"><h3>${toneMark(tone)}${esc(title)}</h3>${qs.map(q => `<blockquote>${esc(quoteText(q))}</blockquote>`).join("")}</section>` : "");
      inner = head + `<div class="s-body${s.chart ? " s-voice" : ""}">${s.chart ? `<div class="s-chart">${chart(s.chart, theme)}</div>` : ""}<div class="s-quotes">${group("좋았던 점", s.quotes?.positive, "good")}${group("개선이 필요한 점", s.quotes?.improve, "critical")}</div></div>`;
      break;
    }
    case "columns":
      inner = head + `<div class="s-cols">${s.columns.map((c, ci) => `<section class="s-col"><h3>${toneMark(c.tone)}${slideField(s.id, `columns.${ci}.title`, c.title, editable)}</h3>${list(c.items.length ? c.items : ["해당 없음"])}</section>`).join("")}</div>`;
      break;
    case "end":
      inner = `<div class="s-end"><h1>${slideField(s.id, "title", s.title, editable)}</h1>${s.subtitle ? `<p>${slideField(s.id, "subtitle", s.subtitle, editable)}</p>` : ""}</div>`;
      break;
    default:
      inner = head + `<div class="s-body${s.aside ? " s-aside-body" : ""}"><div class="s-chart">${chart(s.chart, theme)}</div>${s.aside ? `<aside class="s-aside"><h3>${esc(s.aside.title)}</h3>${list(s.aside.items)}</aside>` : ""}</div>`;
  }
  const edge = s.type === "cover" || s.type === "end";
  const foot = `<footer class="s-foot"><span>${edge ? "" : esc(s.source || "")}</span><span>${esc(org)}${edge ? "" : `${org ? " · " : ""}${i + 1} / ${total}`}</span></footer>`;
  const bgStyle = s.bg ? ` style="background:${esc(s.bg)}"` : ""; // 사용자가 정한 배경색(store.js 가 bySlide[id].bg 를 slide.bg 로 얹음)
  return `<article class="slide t-${s.type} ${theme}"${bgStyle} aria-roledescription="슬라이드" aria-label="${i + 1} / ${total}. ${esc(displayTitle(s))}">${inner}${foot}</article>`;
}

const btn = (act, ic, label, extra = "") => `<button class="p-btn" data-act="${act}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${icon(ic, 20)}</button>`;

function bar(idx, total, fs) {
  return `<nav class="p-bar" aria-label="발표 제어">
    ${btn("p-prev", "left", "이전 (←)", idx === 0 ? "disabled" : "")}
    <button class="p-count" data-act="p-overview" title="슬라이드 개요 (O)"><b>${idx + 1}</b> / ${total}</button>
    ${btn("p-next", "right", "다음 (→)", idx === total - 1 ? "disabled" : "")}
    <span class="p-div" aria-hidden="true"></span>
    ${btn("p-edit", "edit", "슬라이드 편집")}
    ${btn("p-overview", "grid", "슬라이드 개요 (O)", `aria-pressed="${view.overview}"`)}
    ${btn("p-notes", "notes", "발표자 노트 (N)", `aria-pressed="${ui.notes}"`)}
    ${btn("p-stage", ui.stage === "dark" ? "moon" : ui.stage === "light" ? "sun" : "monitor", `무대: ${STAGE_LABEL[ui.stage]} (T)`)}
    ${btn("p-save", "download", "발표 자료 내려받기 (P)", `aria-pressed="${view.save}"`)}
    ${btn("p-fullscreen", fs ? "shrink" : "expand", fs ? "전체화면 끝내기 (F)" : "전체화면 (F)")}
    <button class="p-btn p-key" data-act="p-help" aria-label="단축키 (?)" title="단축키 (?)" aria-pressed="${view.help}">?</button>
    <span class="p-div" aria-hidden="true"></span>
    ${btn("p-exit", "x", "발표 끝내기 (Esc)")}
  </nav>`;
}

const clock = () => {
  const sec = view.startedAt ? Math.floor((Date.now() - view.startedAt) / 1000) : 0;
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
};

function notesHtml(s, idx, slides) {
  const next = slides[idx + 1];
  return `<aside class="p-notes" aria-label="발표자 노트">
    <div class="p-notes-head"><b>발표자 노트</b><span class="p-clock">${icon("clock", 15)}<span id="pClock">${clock()}</span></span></div>
    <p class="p-notes-title">${idx + 1}. ${esc(displayTitle(s))}</p>
    ${(s.notes || []).length ? `<ul class="p-notes-list">${s.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : `<p class="muted small">메모가 없습니다.</p>`}
    <div class="p-notes-next"><span>다음</span><p>${next ? esc(displayTitle(next)) : "마지막 슬라이드입니다"}</p></div>
  </aside>`;
}

function overviewHtml(idx, theme) {
  const hidden = new Set(state.deckHidden);
  const all = allDeckSlides();
  const total = all.filter(s => !hidden.has(s.id)).length;
  let n = 0;
  return `<div class="p-overview" role="dialog" aria-label="슬라이드 개요">
    <div class="p-ov-head"><div><h2>슬라이드 개요</h2><p class="small muted">${total}장 발표 · 눈 아이콘으로 숨긴 슬라이드는 발표와 인쇄에서 빠집니다</p></div><button class="btn" data-act="p-overview">닫기 <kbd>Esc</kbd></button></div>
    <div class="p-ov-grid">${all.map(s => {
      const off = hidden.has(s.id), num = off ? 0 : ++n;
      return `<div class="p-thumb${off ? " off" : ""}${num === idx + 1 ? " on" : ""}">
        <div class="p-thumb-go" role="button" tabindex="0" data-act="${off ? "p-toggle" : "p-goto"}" data-n="${num}" data-id="${esc(s.id)}" aria-label="${off ? "숨김 해제" : `${num}번 슬라이드로 이동`}: ${esc(displayTitle(s))}">${slideHtml(s, Math.max(0, num - 1), total, theme)}</div>
        <div class="p-thumb-foot"><span class="p-thumb-n">${off ? "숨김" : num}</span><span class="p-thumb-title">${esc(s.section || displayTitle(s))}</span><button class="icon-btn sm" data-act="p-toggle" data-id="${esc(s.id)}" aria-label="${off ? "슬라이드 보이기" : "슬라이드 숨기기"}" title="${off ? "보이기" : "숨기기"}">${icon(off ? "eyeOff" : "eye", 16)}</button></div>
      </div>`;
    }).join("")}</div>
  </div>`;
}

export function render({ sub }) {
  const slides = visibleSlides();
  const total = slides.length;
  if (!total) {
    return `<section class="card empty-state"><h1>발표할 슬라이드가 없습니다</h1><p class="muted">모든 슬라이드를 숨겼습니다.</p><div class="row gap"><button class="btn primary" data-act="p-unhide-all">숨긴 슬라이드 모두 보이기</button><button class="btn" data-act="goto" data-to="dash">분석 결과로</button></div></section>`;
  }
  const idx = Math.min(total, Math.max(1, parseInt(sub, 10) || 1)) - 1;
  const theme = stageTheme();
  const fs = typeof document !== "undefined" && !!document.fullscreenElement;
  return `<div class="present st-${theme}${ui.notes ? " notes-on" : ""}" id="present" tabindex="-1">
    <div class="p-main">
      <div class="p-progress" aria-hidden="true"><i style="width:${((idx + 1) / total * 100).toFixed(2)}%"></i></div>
      <p class="p-rotate-hint" aria-hidden="true">기기를 가로로 돌리면 화면 가득 볼 수 있습니다</p>
      <div class="p-stage">${slideHtml(slides[idx], idx, total, theme)}</div>
      ${view.blank ? `<button class="p-blank" data-act="p-blank" aria-label="화면 가림 해제 (B)"></button>` : ""}
      <output class="p-jump" id="pJump" hidden></output>
      ${bar(idx, total, fs)}
      ${view.help ? `<div class="p-help" role="dialog" aria-label="단축키"><b>단축키</b><dl>${KEYS.map(([k, v]) => `<dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd>`).join("")}</dl></div>` : ""}
      ${view.save ? `<div class="p-help p-save" role="dialog" aria-label="발표 자료 내려받기"><b>발표 자료 내려받기</b>
        <button class="btn block" data-act="p-save-pdf">${icon("printer", 16)}PDF로 저장 (인쇄)</button>
        <button class="btn block" data-act="p-save-html">${icon("doc", 16)}HTML 파일로 저장</button>
        <button class="btn block" data-act="p-save-pptx">${icon("grid", 16)}PPTX로 저장 (편집 가능)</button>
        <p class="p-save-note">PDF는 종이·메일용, HTML은 인터넷 없는 PC에서도 지금 화면 그대로 발표하는 용도, PPTX는 PowerPoint에서 계속 고쳐 쓸 수 있는 편집 가능한 파일입니다.</p></div>` : ""}
    </div>
    ${ui.notes ? notesHtml(slides[idx], idx, slides) : ""}
    ${view.overview ? overviewHtml(idx, theme) : ""}
    ${view.printing ? `<div class="p-print">${slides.map((x, i) => slideHtml(x, i, total, "light")).join("")}</div>` : ""}
  </div>`;
}

const goN = n => go("present", String(n));
function step(d) {
  const total = visibleSlides().length;
  const cur = Math.min(total, Math.max(1, parseInt(parseHash().sub, 10) || 1));
  const n = Math.min(total, Math.max(1, cur + d));
  if (n !== cur) goN(n);
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
function exit() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  go("dash");
}
function showJump() {
  const el = document.getElementById("pJump");
  if (!el) return;
  el.hidden = !view.digits;
  el.textContent = view.digits ? `${view.digits}번으로 → Enter` : "";
}

export const actions = {
  "p-prev": () => step(-1),
  "p-next": () => step(1),
  "p-goto": el => { view.overview = false; goN(el.dataset.n); },
  "p-overview": () => { view.overview = !view.overview; view.help = view.save = false; refresh(); },
  "p-notes": () => { ui.notes = !ui.notes; savePrefs(); refresh(); },
  "p-stage": () => { ui.stage = { auto: "light", light: "dark", dark: "auto" }[ui.stage]; savePrefs(); refresh(); },
  "p-save": () => { view.save = !view.save; view.help = false; refresh(); },
  "p-save-pdf": () => { view.save = false; refresh(); window.print(); },
  "p-save-html": async () => {
    view.save = false;
    refresh();
    busy(true, "발표용 HTML 만드는 중…");
    await nextFrame();
    try {
      const slides = visibleSlides();
      const total = slides.length;
      const css = (await Promise.all(["css/app.css", "css/present.css"].map(async u => {
        const res = await fetch(u);
        if (!res.ok) throw new Error(`${u} (HTTP ${res.status})`);
        return res.text();
      }))).join("\n");
      const title = state.settings.reportTitle || (slides[0] ? displayTitle(slides[0]) : "발표 자료");
      const html = buildPresentHtml({
        title, css, dark: stageTheme() === "dark",
        icons: Object.fromEntries(EXPORT_ICONS.map(n => [n, icon(n, 20)])),
        slides: slides.map((s, i) => ({
          light: slideHtml(s, i, total, "light"),
          dark: slideHtml(s, i, total, "dark"),
          title: displayTitle(s), section: s.section, notes: s.notes || [],
        })),
      });
      download(new Blob([html], { type: "text/html;charset=utf-8" }), `${safeFileName(title)}_발표자료.html`);
      toast("발표용 HTML을 내려받았습니다. 파일을 두 번 눌러 열면 지금 화면 그대로 발표할 수 있습니다.", "ok", 7000);
      document.dispatchEvent(new CustomEvent("survey:exported", { detail: { kind: "present-html", title } }));
    } catch (e) {
      console.error(e);
      toast(`HTML 만들기 실패: ${e.message}`, "bad", 7000);
    } finally { busy(false); }
  },
  "p-save-pptx": async () => {
    view.save = false;
    refresh();
    busy(true, "PPTX 만드는 중…");
    await nextFrame();
    try {
      const slides = visibleSlides();
      const title = state.settings.reportTitle || (slides[0] ? displayTitle(slides[0]) : "발표 자료");
      const rasterizeChart = async el => {
        if (!el.chart) return null;
        const { svg } = chartSvg({ ...el.chart, opts: { ...(el.chart.opts || {}), theme: "light" } });
        const w = Math.max(240, Math.round(el.w / 100 * 1280)), h = Math.max(160, Math.round(el.h / 100 * 720));
        return svgToPng(svg, w, h, 2);
      };
      const bytes = await renderPptx(slides, state.deckOverrides, {
        title, creator: state.settings.author || "", settings: state.settings, rasterizeChart, JSZip: await loadJSZip(),
      });
      download(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), `${safeFileName(title)}_발표자료.pptx`);
      toast("PPTX 파일을 내려받았습니다. PowerPoint에서 계속 고칠 수 있습니다.", "ok", 7000);
      document.dispatchEvent(new CustomEvent("survey:exported", { detail: { kind: "present-pptx", title } }));
    } catch (e) {
      console.error(e);
      toast(`PPTX 만들기 실패: ${e.message}`, "bad", 7000);
    } finally { busy(false); }
  },
  "p-edit": () => go("presentEdit"),
  "p-fullscreen": () => toggleFullscreen(),
  "p-help": () => { view.help = !view.help; view.save = false; refresh(); },
  "p-blank": () => { view.blank = !view.blank; refresh(); },
  "p-exit": () => exit(),
  "p-toggle": el => {
    const id = el.dataset.id;
    state.deckHidden = state.deckHidden.includes(id) ? state.deckHidden.filter(x => x !== id) : [...state.deckHidden, id];
    refresh();
  },
  "p-unhide-all": () => { state.deckHidden = []; refresh(); },
};

// 한글 입력 상태에서도 동작하도록 문자 키는 e.code 로 판별
const CODE_ACT = { KeyB: "p-blank", Period: "p-blank", KeyO: "p-overview", KeyG: "p-overview", KeyN: "p-notes", KeyT: "p-stage" };
export function onKey(e) {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || t?.closest?.("input, textarea, select, [contenteditable='true']")) return;
  if (e.key === "Enter" && t?.matches?.("[role='button'][data-act]")) { e.preventDefault(); t.click(); return; }
  if ((e.key === " " || e.key === "Enter") && t?.matches?.("button") && !view.digits) return; // 포커스된 버튼은 기본 동작
  const total = visibleSlides().length;
  const digit = /^(Digit|Numpad)([0-9])$/.exec(e.code);
  let handled = true;
  if (digit) { view.digits = (view.digits + digit[2]).slice(-3); showJump(); }
  else if (e.key === "Enter" && view.digits) { const n = Math.min(total, Math.max(1, Number(view.digits))); view.digits = ""; showJump(); view.overview = false; goN(n); }
  else if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) step(1);
  else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) step(-1);
  else if (e.key === "Home") goN(1);
  else if (e.key === "End") goN(total);
  else if (CODE_ACT[e.code]) actions[CODE_ACT[e.code]]();
  else if (e.code === "KeyF") toggleFullscreen();
  else if (e.code === "KeyP") actions["p-save"]();
  else if (e.key === "?") actions["p-help"]();
  else if (e.key === "Escape") {
    if (view.digits) { view.digits = ""; showJump(); }
    else if (view.overview || view.help || view.save || view.blank) { view.overview = view.help = view.save = view.blank = false; refresh(); }
    else if (!document.fullscreenElement) exit();
  } else handled = false;
  if (handled) e.preventDefault();
}

let bound = false, clockTimer = 0, idleTimer = 0;
function poke() {
  const root = document.getElementById("present");
  if (!root) return;
  root.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!view.overview && !view.help && !view.save) document.getElementById("present")?.classList.add("idle"); }, 2800);
}

/** 화면에 붙은 뒤 호출: 포커스·타이머·전역 이벤트(한 번만 연결) */
export function mount() {
  const root = document.getElementById("present");
  if (!root) return;
  if (!view.startedAt) view.startedAt = Date.now();
  if (!root.contains(document.activeElement)) root.focus({ preventScroll: true });
  poke();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => { const c = document.getElementById("pClock"); if (c) c.textContent = clock(); }, 1000);
  if (bound) return;
  bound = true;
  const active = () => !!document.getElementById("present");
  document.addEventListener("pointermove", () => { if (active()) poke(); }, { passive: true });
  document.addEventListener("fullscreenchange", () => { if (active()) refresh(); });
  addEventListener("beforeprint", () => { if (active() && !view.printing) { view.printing = true; refresh(); } });
  addEventListener("afterprint", () => { if (view.printing) { view.printing = false; if (active()) refresh(); } });
  // 터치 스와이프
  let sx = null;
  document.addEventListener("pointerdown", e => { sx = e.pointerType !== "mouse" && e.target.closest?.(".p-stage") ? e.clientX : null; }, { passive: true });
  document.addEventListener("pointerup", e => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 60 && active()) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

export function unmount() {
  clearInterval(clockTimer);
  clearTimeout(idleTimer);
  Object.assign(view, { overview: false, blank: false, help: false, save: false, digits: "" });
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
