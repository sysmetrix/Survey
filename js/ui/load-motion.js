// 불러오기 화면의 움직임(작은 바닐라 모듈): 헤드라인 글자별 굵기 웨이브 → 정지, 강조어 롤링, 커서 근접 굵기.
// 그림·CSS 애니메이션(진행선·끌어놓기 링·그래프 자람)은 css/app.css 가 맡고, 여기서는 JS 로만 되는 것만 한다.
//  · 움직임 줄이기(prefers-reduced-motion: reduce)이면 아무 효과도 켜지 않는다 → 마지막 상태 그대로(강조어는 '분석부터').
//  · 화면이 다시 그려질 때마다 mount 가 다시 호출되므로 idempotent: 이전 타이머·리스너를 모두 정리하고 새 DOM 에 다시 건다.
//  · 진입 연출은 '이번 방문 첫 표시'에서만 — 다시 그릴 때는 elapsed(첫 표시 이후 경과 ms)만큼 뒤로 감아(음수 지연) 이어 붙이거나 생략한다.
//  · 반환한 dispose() 가 타이머·rAF·리스너·클래스를 모두 되돌린다.

/** 진입 연출이 끝나는 시각(ms) — CSS 의 .ld-enter 지연·길이와 맞춘다(css/app.css) */
export const ENTRANCE_MS = 3700;
const WAVE_SETTLE_MS = 2600;  // 글자 웨이브가 끝나 커서 반응·롤링을 시작해도 되는 시각
const ROLL_START_MS = 2500;   // 강조어 롤링 시작
const ROLL_STEP_MS = 1050;

const REDUCE = "(prefers-reduced-motion: reduce)";
const mql = q => (typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(q) : null);
export const motionAllowed = () => !mql(REDUCE)?.matches;

/** 제목을 단어(.w, 줄바꿈 금지) 안의 글자(.k)로 쪼갠다. 숨은 롤링 단어(data-alt)는 첫 단어와 같은 지연 번호를 쓴다. */
function splitLetters(h1) {
  if (h1.dataset.split) return [...h1.querySelectorAll(".k")].filter(k => !k.closest("[data-alt]"));
  const letters = [];
  let idx = 0;
  const visit = (node, hidden, base) => {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        let j = 0;
        for (const part of n.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); continue; }
          const w = document.createElement("span"); w.className = "w";
          for (const ch of part) {
            const k = document.createElement("span"); k.className = "k"; k.textContent = ch;
            k.style.setProperty("--i", String(hidden ? base + j : idx++)); j++;
            if (!hidden) letters.push(k);
            w.appendChild(k);
          }
          frag.appendChild(w);
        }
        node.replaceChild(frag, n);
      } else if (n.nodeType === 1) visit(n, hidden || n.hasAttribute("data-alt"), base);
    }
  };
  // 화면낭독기에는 완성된 문장을 읽어 주고(aria-label) 글자 조각은 숨긴다
  const full = [...h1.querySelectorAll(".ln")].map(ln => { const c = ln.cloneNode(true); c.querySelectorAll("[data-alt]").forEach(x => x.remove()); return c.textContent.replace(/\s+/g, " ").trim(); }).join(" ");
  visit(h1, false, 0);
  const roll = h1.querySelector("[data-roll]"), first = roll?.querySelector(".rw:not([data-alt]) .k");
  if (roll && first) {
    const baseI = parseInt(first.style.getPropertyValue("--i"), 10);
    roll.querySelectorAll(".rw[data-alt] .k").forEach((k, n) => k.style.setProperty("--i", String(baseI + (n % 4))));
  }
  h1.setAttribute("aria-label", full);
  h1.querySelectorAll(".ln").forEach(l => l.setAttribute("aria-hidden", "true"));
  h1.dataset.split = "1";
  return letters;
}

/**
 * @param {HTMLElement|null} main  #main (렌더된 화면이 들어 있는 요소)
 * @param {{elapsed?: number, entranceMs?: number}} opt  elapsed = 이번 방문 첫 표시 이후 경과 ms
 * @returns {() => void} dispose
 */
export function startLoadMotion(main, { elapsed = 0, entranceMs = ENTRANCE_MS } = {}) {
  const h1 = main?.querySelector?.("[data-kinetic]");
  if (!main || !h1 || !motionAllowed()) return () => {};

  const timers = new Set();
  const cleanups = [];
  let raf = 0, disposed = false;
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, Math.max(0, ms)); timers.add(t); return t; };

  // 1) 진입 연출: .ld-enter 동안만 CSS 애니메이션이 돈다. 다시 그린 경우 경과한 만큼 감아서(--ld-skip) 이어 붙인다.
  const inEntrance = elapsed < entranceMs;
  if (inEntrance) {
    main.style.setProperty("--ld-skip", `${(-elapsed / 1000).toFixed(3)}s`);
    main.classList.add("ld-enter");
    later(() => main.classList.remove("ld-enter"), entranceMs - elapsed);
  }
  cleanups.push(() => { main.classList.remove("ld-enter"); main.style.removeProperty("--ld-skip"); });

  // 2) 글자 쪼개기 (커서 근접 굵기의 대상)
  const letters = splitLetters(h1);

  // 3) 강조어 롤링: 분석부터 → 보고서까지 → 발표까지 → 분석부터(정지). 강조어에 마우스를 올리거나 누르면 다시 재생.
  const roll = h1.querySelector("[data-roll]");
  const track = roll?.querySelector(".roll-track");
  const words = roll ? [...roll.querySelectorAll(".rw")] : [];
  let rollIdx = 0, rolling = false;
  const wordW = i => words[i].getBoundingClientRect().width;
  const lineH = () => words[0].getBoundingClientRect().height;
  const stepTo = i => {
    rollIdx = i;
    track.style.transform = `translateY(${-lineH() * i}px)`;
    roll.style.width = `${Math.ceil(wordW(i))}px`;
  };
  const goLive = () => { // 다른 단어를 보이게 하기 전에 지금 폭을 고정해 두어야 자리가 튀지 않는다
    if (roll.classList.contains("live")) return;
    roll.style.width = `${Math.ceil(wordW(0))}px`;
    roll.classList.add("live");
  };
  const playRoll = () => {
    if (!roll || !track || rolling) return;
    goLive();
    rolling = true;
    [1, 2, 3].forEach((i, n) => later(() => stepTo(i), ROLL_STEP_MS * (n + 1)));
    later(() => { // 마지막 '분석부터'는 첫 항목 자리로 순간 이동(전환 없이) → 다시 볼 준비
      track.style.transition = "none"; roll.style.transition = "none";
      stepTo(0); void track.offsetWidth;
      track.style.transition = ""; roll.style.transition = "";
      rolling = false;
    }, ROLL_STEP_MS * 3 + 720);
  };
  if (roll && track && words.length) {
    if (elapsed < ROLL_START_MS) later(playRoll, ROLL_START_MS - elapsed);
    let ready = elapsed >= WAVE_SETTLE_MS; // 진입 웨이브가 끝나기 전에는 마우스를 올려도 다시 재생하지 않는다
    later(() => { ready = true; }, WAVE_SETTLE_MS - elapsed);
    const again = () => { if (ready) playRoll(); };
    roll.title = "다시 보기";
    roll.addEventListener("mouseenter", again); roll.addEventListener("click", again);
    cleanups.push(() => {
      roll.removeEventListener("mouseenter", again); roll.removeEventListener("click", again);
      roll.classList.remove("live"); roll.style.width = ""; roll.style.transition = ""; roll.removeAttribute("title");
      if (track) { track.style.transform = ""; track.style.transition = ""; }
    });
    // 글꼴이 늦게 도착해 글자 폭이 바뀌면 고정 폭도 다시 맞춘다
    const refit = () => { if (roll.classList.contains("live") && !rolling) stepTo(rollIdx); };
    globalThis.document?.fonts?.ready?.then(refit).catch(() => {});
    window.addEventListener("resize", refit);
    cleanups.push(() => window.removeEventListener("resize", refit));
  }

  // 4) 커서 근접: 가까운 글자는 굵어지고(→920) 멀수록 살짝 가늘어진다(→740). 진입 웨이브가 끝난 뒤에만.
  const fine = mql("(pointer: fine)")?.matches;
  const zone = h1.closest(".ld-hero-top");
  if (fine && zone && letters.length) {
    let on = elapsed >= WAVE_SETTLE_MS, pointer = null, rects = [];
    const cur = letters.map(() => 800);
    const measure = () => { rects = letters.map(k => { const r = k.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); };
    const frame = () => {
      raf = 0; let moving = false;
      letters.forEach((k, i) => {
        let t = 800;
        if (pointer && rects[i]) {
          const dx = pointer.x - rects[i].x, dy = (pointer.y - rects[i].y) * 1.5, d = Math.sqrt(dx * dx + dy * dy);
          const infl = Math.max(0, 1 - d / 190) ** 2;
          t = 740 + 180 * infl;
        }
        const diff = t - cur[i];
        if (Math.abs(diff) > .6) { cur[i] += diff * .2; moving = true; k.style.setProperty("--w", cur[i].toFixed(1)); }
        else if (cur[i] !== t) { cur[i] = t; k.style.setProperty("--w", String(t)); }
      });
      if (moving) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const move = e => { if (!on) return; if (!rects.length) measure(); pointer = { x: e.clientX, y: e.clientY }; kick(); };
    const leave = () => { pointer = null; kick(); };
    const remeasure = () => { rects = []; };
    later(() => { on = true; measure(); }, WAVE_SETTLE_MS - elapsed);
    zone.addEventListener("pointermove", move); zone.addEventListener("pointerleave", leave);
    window.addEventListener("resize", remeasure); window.addEventListener("scroll", remeasure, { passive: true });
    cleanups.push(() => {
      zone.removeEventListener("pointermove", move); zone.removeEventListener("pointerleave", leave);
      window.removeEventListener("resize", remeasure); window.removeEventListener("scroll", remeasure);
      letters.forEach(k => k.style.removeProperty("--w"));
    });
  }

  // 5) 실행 중에 '움직임 줄이기'가 켜지면 즉시 정적 상태로
  const q = mql(REDUCE);
  const onPref = () => { if (q.matches) dispose(); };
  q?.addEventListener?.("change", onPref);
  cleanups.push(() => q?.removeEventListener?.("change", onPref));

  function dispose() {
    if (disposed) return;
    disposed = true;
    timers.forEach(clearTimeout); timers.clear();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    cleanups.forEach(fn => fn());
  }
  return dispose;
}
