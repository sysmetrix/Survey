// 안내 툴팁 레이어: [data-tip] 요소에 포인터를 올리거나 키보드로 포커스하면 표시.
// 차트 값은 "이름\n값" 형식(값은 굵게)이고, 그 밖의 설명글은 줄바꿈 없이 그대로 넣으면 화면 폭에 맞춰 자동으로 줄바꿈됨.
// 텍스트는 신뢰할 수 없는 문자열(설문 데이터 등)일 수 있으므로 textContent 로만 삽입
let tipEl = null;

function ensure() {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "viz-tip";
  tipEl.setAttribute("role", "tooltip");
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

function show(raw, px, py) {
  const el = ensure();
  const text = String(raw);
  const nl = text.indexOf("\n");
  if (nl === -1) {
    const l = document.createElement("span");
    l.textContent = text;
    el.replaceChildren(l);
  } else {
    const v = document.createElement("strong");
    v.textContent = text.slice(nl + 1);
    const l = document.createElement("span");
    l.textContent = text.slice(0, nl);
    el.replaceChildren(v, l);
  }
  el.hidden = false;
  const pad = 14, rect = el.getBoundingClientRect();
  let left = px + pad, top = py + pad;
  if (left + rect.width > window.innerWidth - 8) left = px - rect.width - pad;
  if (top + rect.height > window.innerHeight - 8) top = py - rect.height - pad;
  el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
}
const hide = () => { if (tipEl) tipEl.hidden = true; };

let hot = null;
export function installTooltips() {
  document.addEventListener("pointermove", e => {
    const g = e.target instanceof Element ? e.target.closest("[data-tip]") : null;
    if (hot && hot !== g) hot.classList.remove("hot");
    if (!g) { hot = null; hide(); return; }
    g.classList.add("hot");
    hot = g;
    show(g.getAttribute("data-tip"), e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener("pointerleave", hide);
  document.addEventListener("scroll", hide, { passive: true, capture: true });
  // 키보드로 Tab 이동해 포커스했을 때도 같은 설명이 보이도록(마우스 없이도 접근 가능)
  document.addEventListener("focusin", e => {
    const g = e.target instanceof Element ? e.target.closest("[data-tip]") : null;
    if (!g || g === hot) return;
    hot?.classList.remove("hot");
    g.classList.add("hot");
    hot = g;
    const r = g.getBoundingClientRect();
    show(g.getAttribute("data-tip"), r.left, r.bottom);
  });
  document.addEventListener("focusout", e => {
    const g = e.target instanceof Element ? e.target.closest("[data-tip]") : null;
    if (g && g === hot) { g.classList.remove("hot"); hot = null; hide(); }
  });
}
