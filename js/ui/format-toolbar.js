// 보고서 문장 편집 중 떠 있는 서식 도구모음(굵게·기울임·밑줄·취소선·글자색) — 워드·한글·구글 문서처럼
// 선택 영역 위에 나타남. 버튼 클릭이 contenteditable 의 포커스·선택 영역을 뺏지 않도록 mousedown 을 막는다.
import { icon } from "./icons.js";

const BTNS = [
  { cmd: "bold", ico: "bold", title: "굵게 (Ctrl+B)" },
  { cmd: "italic", ico: "italic", title: "기울임 (Ctrl+I)" },
  { cmd: "underline", ico: "underline", title: "밑줄 (Ctrl+U)" },
  { cmd: "strikeThrough", ico: "strike", title: "취소선 (Ctrl+Shift+X)" },
];
const COLORS = ["#C00000", "#B45309", "#1A7F37", "#1F6FEB", "#6B21A8", "#000000"];

let bar = null;
let target = null;

function ensure() {
  if (bar) return bar;
  bar = document.createElement("div");
  bar.className = "fmt-bar";
  bar.hidden = true;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "글자 서식");
  bar.innerHTML =
    BTNS.map(b => `<button type="button" class="fmt-btn" data-cmd="${b.cmd}" title="${b.title}" aria-pressed="false">${icon(b.ico, 15)}</button>`).join("") +
    `<span class="fmt-sep" aria-hidden="true"></span>` +
    COLORS.map(c => `<button type="button" class="fmt-btn fmt-color" data-color="${c}" style="--fmt-c:${c}" title="글자색"></button>`).join("") +
    `<button type="button" class="fmt-btn fmt-clear" data-color="#000000" title="글자색 지우기(검정)">${icon("x", 13)}</button>`;
  document.body.appendChild(bar);
  bar.addEventListener("mousedown", e => e.preventDefault());
  bar.addEventListener("click", e => {
    const btn = e.target.closest(".fmt-btn");
    if (!btn || !target) return;
    document.execCommand("styleWithCSS", false, true);
    if (btn.dataset.cmd) document.execCommand(btn.dataset.cmd, false, null);
    else document.execCommand("foreColor", false, btn.dataset.color);
    sync();
  });
  return bar;
}

function position(el) {
  const b = ensure();
  const r = el.getBoundingClientRect();
  const bw = b.offsetWidth || 260, bh = b.offsetHeight || 34;
  let top = r.top - bh - 8;
  if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - bh - 8);
  const left = Math.min(Math.max(8, r.left), window.innerWidth - bw - 8);
  b.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function sync() {
  if (!bar) return;
  for (const b of BTNS) {
    const btn = bar.querySelector(`[data-cmd="${b.cmd}"]`);
    let on = false;
    try { on = document.queryCommandState(b.cmd); } catch { /* 지원 안 하면 무시 */ }
    btn?.classList.toggle("on", on);
    btn?.setAttribute("aria-pressed", String(on));
  }
}

/** 앱 시작 시 한 번 호출 — [data-edit] 문장 편집 필드에 포커스가 있을 때만 도구모음을 띄움 */
export function installFormatToolbar() {
  document.addEventListener("focusin", e => {
    const el = e.target.closest?.("[data-edit]");
    if (!el) return;
    target = el;
    ensure().hidden = false;
    position(el);
    sync();
  });
  document.addEventListener("focusout", e => {
    if (!e.target.closest?.("[data-edit]")) return;
    setTimeout(() => { if (document.activeElement !== target) { if (bar) bar.hidden = true; target = null; } }, 0);
  });
  document.addEventListener("input", e => { if (target && e.target === target) position(target); });
  document.addEventListener("keyup", e => { if (target && e.target === target) sync(); });
  document.addEventListener("selectionchange", () => { if (target && document.activeElement === target && bar && !bar.hidden) sync(); });
  window.addEventListener("scroll", () => { if (target && bar && !bar.hidden) position(target); }, true);
  window.addEventListener("resize", () => { if (target && bar && !bar.hidden) position(target); });
}
