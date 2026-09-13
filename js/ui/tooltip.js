// 차트 툴팁 레이어: [data-tip] 요소에 포인터를 올리면 값(굵게)·이름 순으로 표시
// 라벨은 설문 데이터(신뢰할 수 없는 문자열)이므로 textContent 로만 삽입
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
  const [label, value] = String(raw).split("\n");
  const v = document.createElement("strong");
  v.textContent = value ?? "";
  const l = document.createElement("span");
  l.textContent = label ?? "";
  el.replaceChildren(v, l);
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
}
