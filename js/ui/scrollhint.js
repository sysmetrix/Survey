// 가로 스크롤 가능한 표·탭·단계 표시(.tblwrap, .tabs, .stepper)에 좌우 그림자 힌트를 붙임 —
// 중요한 열·탭·단계가 화면 밖에 있다는 단서가 네이티브 스크롤바뿐이라 놓치기 쉬운 문제 대응
// (Notion·Airtable식 스크롤 그림자). .stepper 는 scrollbar-width:none 이라 힌트가 유일한 단서.
const SEL = ".tblwrap, .tabs, .stepper";
function update(el) {
  const scrollable = el.scrollWidth > el.clientWidth + 1;
  const atStart = el.scrollLeft <= 1;
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
  el.classList.toggle("can-scroll-left", scrollable && !atStart);
  el.classList.toggle("can-scroll-right", scrollable && !atEnd);
}
const updateAll = () => document.querySelectorAll(SEL).forEach(update);

let queued = false;
const queueUpdate = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; updateAll(); });
};

export function installScrollHints() {
  document.addEventListener("scroll", e => {
    if (e.target instanceof Element && e.target.matches(SEL)) update(e.target);
  }, true);
  window.addEventListener("resize", queueUpdate);
  const main = document.getElementById("main");
  if (main) new MutationObserver(queueUpdate).observe(main, { childList: true, subtree: true });
  queueUpdate();
}
