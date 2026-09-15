// 발표 자료 → 혼자 열리는 HTML 한 파일 (순수 모듈 — DOM 비의존)
// 이 도구의 발표 모드와 같은 화면·같은 조작으로 발표할 수 있도록 슬라이드·스타일·조작 스크립트를 모두 담는다.
import { esc } from "../core/util.js";

/** 내보낸 파일 안에서 도는 조작 스크립트 (앱의 발표 모드와 같은 단축키) */
const RUNTIME = `
(function () {
  var D = self.document, W = self;
  var S = DECK.slides, IC = DECK.icons;
  var idx = 0, dark = DECK.dark, notesOn = false, ovOn = false, helpOn = false, blankOn = false;
  var digits = "", startedAt = 0, idleT = 0, jumpT = 0;
  var $ = function (id) { return D.getElementById(id); };
  var present, stage;

  var slideOf = function (i) { return dark ? S[i].d : S[i].l; };
  var two = function (n) { return ("0" + n).slice(-2); };
  var clock = function () {
    var sec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    return two(Math.floor(sec / 60)) + ":" + two(sec % 60);
  };

  function renderNotes() {
    var s = S[idx], next = S[idx + 1];
    var h = '<div class="p-notes-head"><b>발표자 노트</b><span class="p-clock">' + IC.clock + '<span id="pClock">' + clock() + '</span></span></div>';
    h += '<p class="p-notes-title">' + (idx + 1) + '. ' + s.title + '</p>';
    h += s.notes.length ? '<ul class="p-notes-list"><li>' + s.notes.join('</li><li>') + '</li></ul>' : '<p class="muted small">메모가 없습니다.</p>';
    h += '<div class="p-notes-next"><span>다음</span><p>' + (next ? next.title : '마지막 슬라이드입니다') + '</p></div>';
    $("notes").innerHTML = h;
  }

  function renderOverview() {
    var g = "", i;
    for (i = 0; i < S.length; i++) {
      g += '<div class="p-thumb' + (i === idx ? " on" : "") + '">' +
           '<div class="p-thumb-go" role="button" tabindex="0" data-p="goto" data-n="' + i + '" aria-label="' + (i + 1) + '번 슬라이드로 이동">' + slideOf(i) + '</div>' +
           '<div class="p-thumb-foot"><span class="p-thumb-n">' + (i + 1) + '</span><span class="p-thumb-title">' + (S[i].section || S[i].title) + '</span></div></div>';
    }
    $("ovGrid").innerHTML = g;
  }

  function render() {
    stage.innerHTML = slideOf(idx);
    present.className = "present st-" + (dark ? "dark" : "light") + (notesOn ? " notes-on" : "");
    $("prog").style.width = ((idx + 1) / S.length * 100).toFixed(2) + "%";
    $("count").innerHTML = "<b>" + (idx + 1) + "</b> / " + S.length;
    $("prev").disabled = idx === 0;
    $("next").disabled = idx === S.length - 1;
    $("stageBtn").innerHTML = dark ? IC.moon : IC.sun;
    $("fsBtn").innerHTML = D.fullscreenElement ? IC.shrink : IC.expand;
    $("notes").hidden = !notesOn;
    $("help").hidden = !helpOn;
    $("blank").hidden = !blankOn;
    $("overview").hidden = !ovOn;
    $("ovBtn").setAttribute("aria-pressed", ovOn);
    $("notesBtn").setAttribute("aria-pressed", notesOn);
    $("helpBtn").setAttribute("aria-pressed", helpOn);
    if (notesOn) renderNotes();
    if (ovOn) renderOverview();
    poke();
  }

  function go(n, fromOverview) {
    var v = Math.min(S.length - 1, Math.max(0, n));
    if (fromOverview) ovOn = false;
    if (v === idx && !fromOverview) return;
    idx = v;
    render();
  }

  function fullscreen() {
    if (D.fullscreenElement) { if (D.exitFullscreen) D.exitFullscreen(); }
    else if (D.documentElement.requestFullscreen) D.documentElement.requestFullscreen();
  }

  function showJump() {
    var el = $("pJump");
    el.hidden = !digits;
    el.textContent = digits ? digits + "번으로 → Enter" : "";
  }

  function poke() {
    present.classList.remove("idle");
    clearTimeout(idleT);
    idleT = setTimeout(function () { if (!ovOn && !helpOn) present.classList.add("idle"); }, 2800);
  }

  function act(name, el) {
    if (name === "prev") go(idx - 1);
    else if (name === "next") go(idx + 1);
    else if (name === "goto") go(Number(el.getAttribute("data-n")), true);
    else if (name === "overview") { ovOn = !ovOn; helpOn = false; render(); }
    else if (name === "notes") { notesOn = !notesOn; render(); }
    else if (name === "stage") { dark = !dark; render(); }
    else if (name === "print") W.print();
    else if (name === "fullscreen") fullscreen();
    else if (name === "help") { helpOn = !helpOn; render(); }
    else if (name === "blank") { blankOn = !blankOn; render(); }
  }

  var CODE_ACT = { KeyB: "blank", Period: "blank", KeyO: "overview", KeyG: "overview", KeyN: "notes", KeyT: "stage", KeyF: "fullscreen", KeyP: "print" };

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, digit = /^(Digit|Numpad)([0-9])$/.exec(e.code), handled = true;
    if (e.key === "Enter" && t && t.matches && t.matches("[role='button'][data-p]")) { e.preventDefault(); t.click(); return; }
    if ((e.key === " " || e.key === "Enter") && t && t.matches && t.matches("button") && !digits) return;
    if (digit) { digits = (digits + digit[2]).slice(-3); showJump(); clearTimeout(jumpT); jumpT = setTimeout(function () { digits = ""; showJump(); }, 2500); }
    else if (e.key === "Enter" && digits) { var n = Number(digits); digits = ""; showJump(); go(n - 1, true); }
    else if (["ArrowRight", "ArrowDown", "PageDown", " "].indexOf(e.key) >= 0) go(idx + 1);
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].indexOf(e.key) >= 0) go(idx - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(S.length - 1);
    else if (e.key === "?") act("help");
    else if (CODE_ACT[e.code]) act(CODE_ACT[e.code]);
    else if (e.key === "Escape") {
      if (digits) { digits = ""; showJump(); }
      else if (ovOn || helpOn || blankOn) { ovOn = helpOn = blankOn = false; render(); }
    } else handled = false;
    if (handled) e.preventDefault();
  }

  function start() {
    present = $("present");
    stage = $("stage");
    startedAt = Date.now();
    D.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest("[data-p]") : null;
      if (el && !el.disabled) act(el.getAttribute("data-p"), el);
    });
    D.addEventListener("keydown", onKey);
    D.addEventListener("pointermove", poke, { passive: true });
    D.addEventListener("fullscreenchange", render);
    W.addEventListener("beforeprint", function () {
      var h = "", i;
      for (i = 0; i < S.length; i++) h += S[i].l;
      $("print").innerHTML = h;
    });
    var sx = null;
    D.addEventListener("pointerdown", function (e) { sx = e.pointerType !== "mouse" && e.target.closest && e.target.closest(".p-stage") ? e.clientX : null; }, { passive: true });
    D.addEventListener("pointerup", function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) > 60) go(idx + (dx < 0 ? 1 : -1));
    }, { passive: true });
    setInterval(function () { var c = $("pClock"); if (c) c.textContent = clock(); }, 1000);
    render();
    present.focus();
  }

  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
})();
`;

const KEYS = [
  ["→  Space  PgDn", "다음"], ["←  PgUp", "이전"], ["Home / End", "처음 / 마지막"],
  ["숫자 + Enter", "해당 번호로 이동"], ["O", "슬라이드 개요"], ["N", "발표자 노트"],
  ["F", "전체화면"], ["B", "화면 가리기"], ["T", "무대 밝기"], ["P", "PDF 인쇄"], ["Esc", "패널 닫기"],
];

/** 아이콘 이름: 내보내기에 필요한 것만 */
export const EXPORT_ICONS = ["left", "right", "grid", "notes", "sun", "moon", "printer", "expand", "shrink", "clock"];

/**
 * @param {object} o
 * @param {string} o.title   문서 제목(탭 이름)
 * @param {string} o.css     app.css + present.css 원문
 * @param {Record<string,string>} o.icons  EXPORT_ICONS 이름 → SVG 문자열
 * @param {boolean} o.dark   어두운 무대로 시작할지
 * @param {{light:string, dark:string, title:string, section:string, notes:string[]}[]} o.slides
 * @returns {string} 그대로 저장하면 열리는 HTML 한 파일
 */
export function buildPresentHtml({ title = "발표 자료", css = "", icons = {}, dark = false, slides = [] } = {}) {
  const deck = {
    dark: !!dark,
    icons,
    slides: slides.map(s => ({
      l: s.light, d: s.dark,
      title: esc(s.title || ""), section: esc(s.section || ""),
      notes: (s.notes || []).map(n => esc(n)),
    })),
  };
  // </script> 가 문자열 안에서 스크립트를 끊지 않도록
  const data = JSON.stringify(deck).replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
  const btn = (id, act, label, inner, cls = "p-btn") =>
    `<button class="${cls}" id="${id}" data-p="${act}" aria-label="${esc(label)}" title="${esc(label)}">${inner}</button>`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
${css}
/* 내보낸 파일 전용 */
body { margin: 0; }
.p-exp-tip { position: absolute; left: 50%; bottom: 74px; transform: translateX(-50%); z-index: 4; background: var(--p-chrome); color: #fff; font-size: 12.5px; padding: 6px 14px; border-radius: 999px; opacity: .92; animation: p-exp-fade .4s 6s both; }
@keyframes p-exp-fade { to { opacity: 0; visibility: hidden; } }
.present.idle .p-exp-tip { opacity: 0; }
</style>
</head>
<body class="presenting">
<div class="present st-${dark ? "dark" : "light"}" id="present" tabindex="-1">
  <div class="p-main">
    <div class="p-progress" aria-hidden="true"><i id="prog"></i></div>
    <div class="p-stage" id="stage"></div>
    <button class="p-blank" id="blank" data-p="blank" aria-label="화면 가림 해제 (B)" hidden></button>
    <output class="p-jump" id="pJump" hidden></output>
    <p class="p-exp-tip">← → 로 넘기고 <b>F</b> 전체화면 · <b>?</b> 단축키</p>
    <nav class="p-bar" aria-label="발표 제어">
      ${btn("prev", "prev", "이전 (←)", icons.left || "‹")}
      <button class="p-count" id="count" data-p="overview" title="슬라이드 개요 (O)"></button>
      ${btn("next", "next", "다음 (→)", icons.right || "›")}
      <span class="p-div" aria-hidden="true"></span>
      ${btn("ovBtn", "overview", "슬라이드 개요 (O)", icons.grid || "▦")}
      ${btn("notesBtn", "notes", "발표자 노트 (N)", icons.notes || "≡")}
      ${btn("stageBtn", "stage", "무대 밝기 (T)", icons.sun || "☀")}
      ${btn("printBtn", "print", "PDF로 인쇄 (P)", icons.printer || "🖨")}
      ${btn("fsBtn", "fullscreen", "전체화면 (F)", icons.expand || "⤢")}
      ${btn("helpBtn", "help", "단축키 (?)", "?", "p-btn p-key")}
    </nav>
    <div class="p-help" id="help" role="dialog" aria-label="단축키" hidden>
      <b>단축키</b>
      <dl>${KEYS.map(([k, v]) => `<dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd>`).join("")}</dl>
    </div>
  </div>
  <aside class="p-notes" id="notes" aria-label="발표자 노트" hidden></aside>
  <div class="p-overview" id="overview" role="dialog" aria-label="슬라이드 개요" hidden>
    <div class="p-ov-head">
      <div><h2>슬라이드 개요</h2><p class="small muted">${slides.length}장 · 눌러서 이동</p></div>
      <button class="btn" data-p="overview">닫기 <kbd>Esc</kbd></button>
    </div>
    <div class="p-ov-grid" id="ovGrid"></div>
  </div>
</div>
<div class="p-print" id="print"></div>
<script>var DECK = ${data};${RUNTIME}</script>
</body>
</html>`;
}
