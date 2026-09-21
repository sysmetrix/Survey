// 표 제목행(고정 고정): 가로로도 스크롤되는 .tblwrap(overflow-x:auto) 안에서는 CSS position:sticky 만으로
// 페이지 스크롤 기준 제목행 고정이 안 됨(overflow-x:auto 가 있으면 스펙상 그 요소 자신이 스크롤 컨테이너가 되어
// 버려 sticky 의 기준이 페이지가 아니라 그 요소가 됨). 그래서 실제 <thead>는 표 레이아웃 기준으로 그대로 두고,
// 페이지를 내려 제목행이 화면 위로 넘어가면 똑같이 생긴 복제본을 상단바 바로 아래 살짝 띄워 그 자리를 대신한다.
// 가로 스크롤 위치도 함께 맞춰 따라가며, 표가 화면에서 사라지면(다른 화면으로 이동·재렌더) 정리한다.
const REGISTRY = new Map(); // .tblwrap → { ghost, gTable, gThead, table, thead, wrap }

const topbarH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 64;

function ensureGhost(wrap, table, thead) {
  let entry = REGISTRY.get(wrap);
  if (entry && entry.table === table && entry.thead === thead) return entry;
  entry?.ghost.remove();
  const ghost = document.createElement("div");
  ghost.className = "sticky-thead-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.hidden = true;
  const gTable = document.createElement("table");
  gTable.className = table.className;
  const gThead = thead.cloneNode(true);
  gTable.appendChild(gThead);
  ghost.appendChild(gTable);
  document.body.appendChild(ghost);
  entry = { ghost, gTable, gThead, table, thead, wrap };
  REGISTRY.set(wrap, entry);
  return entry;
}

/** 실제 제목 칸 너비를 복제본에 그대로 반영(내용이 바뀌어도 열 경계가 같은 자리에 오도록) */
function syncWidths(entry) {
  const real = entry.thead.querySelectorAll(":scope > tr > th");
  const ghost = entry.gThead.querySelectorAll(":scope > tr > th");
  real.forEach((c, i) => { if (ghost[i]) ghost[i].style.width = `${c.getBoundingClientRect().width}px`; });
}

// 상단바가 두 줄로 바뀌는 좁은 화면(모바일)에서는 칸 너비가 극단적으로 좁아져 복제본이 여러 줄로 깨지므로
// 고정을 켜지 않음 — 이 화면은 세로로 길게 내려보는 것으로 충분함(css/app.css 의 좁은 화면 분기점과 동일)
const NARROW = 760;

function update(wrap) {
  const table = wrap.querySelector(":scope > table.tbl");
  const thead = table?.querySelector(":scope > thead");
  if (!thead) { REGISTRY.get(wrap)?.ghost.remove(); REGISTRY.delete(wrap); return; }
  const entry = ensureGhost(wrap, table, thead);
  if (window.innerWidth <= NARROW) { entry.ghost.hidden = true; return; }
  const th = topbarH();
  const theadRect = thead.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const pin = theadRect.top < th && wrapRect.bottom > th + theadRect.height;
  if (!pin) { entry.ghost.hidden = true; return; }
  entry.ghost.hidden = false;
  syncWidths(entry);
  entry.ghost.style.top = `${th}px`;
  entry.ghost.style.left = `${wrapRect.left}px`;
  entry.ghost.style.width = `${wrap.clientWidth}px`;
  entry.gTable.style.transform = `translateX(${-wrap.scrollLeft}px)`;
}

function updateAll() {
  for (const [wrap, entry] of REGISTRY) { if (!wrap.isConnected) { entry.ghost.remove(); REGISTRY.delete(wrap); } }
  document.querySelectorAll(".tblwrap").forEach(update);
}

let queued = false;
const queueUpdate = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; updateAll(); });
};

export function installStickyThead() {
  window.addEventListener("scroll", queueUpdate, { passive: true });
  document.addEventListener("scroll", e => { if (e.target instanceof Element && e.target.matches(".tblwrap")) queueUpdate(); }, true);
  window.addEventListener("resize", queueUpdate);
  const main = document.getElementById("main");
  if (main) new MutationObserver(queueUpdate).observe(main, { childList: true, subtree: true });
  queueUpdate();
}
