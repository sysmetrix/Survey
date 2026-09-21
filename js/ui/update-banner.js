// 업데이트 안내 띠(화면 위쪽)와 '지금 다시 불러와도 안전한가' 를 재는 화면 상태 감지 (브라우저 전용)
// 판단 규칙은 update-policy.js(순수), 서비스워커 배선은 pwa.js. 여기는 DOM 만 다룬다.
import { icon } from "./icons.js";

/**
 * 사용자 조작 시각·끌기 여부와 화면의 현재 상태를 읽는 감지기.
 * 글 입력 칸(입력·글상자·선택·편집 가능 영역)에 커서가 있거나, 누르고 있거나 끄는 중이거나, 처리 중 오버레이·안내 창이 떠 있으면 '안전하지 않음'.
 */
export function createEnvSensor(doc = document, now = () => Date.now()) {
  let last = now(), downAt = 0, dragging = false;
  const bump = () => { last = now(); };
  const opt = { capture: true, passive: true };
  for (const t of ["keydown", "wheel", "touchstart", "input", "pointermove"]) doc.addEventListener(t, t === "pointermove" ? (e => { if (e.buttons) bump(); }) : bump, opt);
  doc.addEventListener("pointerdown", () => { downAt = now(); bump(); }, opt);
  for (const t of ["pointerup", "pointercancel"]) doc.addEventListener(t, () => { downAt = 0; bump(); }, opt);
  doc.addEventListener("dragstart", () => { dragging = true; bump(); }, opt);
  for (const t of ["dragend", "drop"]) doc.addEventListener(t, () => { dragging = false; bump(); }, opt);
  const TEXTLIKE = 'textarea, select, [contenteditable]:not([contenteditable="false"]), [data-edit], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]):not([type="file"])';
  return {
    lastInteractionAt: () => last,
    read() {
      const a = doc.activeElement;
      const shown = id => { const el = doc.getElementById(id); return !!el && !el.hidden; };
      return {
        typing: !!a && a !== doc.body && (a.isContentEditable || a.matches?.(TEXTLIKE) || false),
        // 손을 뗀 이벤트를 놓쳐도 영원히 '누르는 중' 으로 남지 않도록 30초 상한
        dragging: dragging || (downAt > 0 && now() - downAt < 30_000),
        busy: shown("busy"),
        tutorial: shown("tutorialBar"),
        presenting: doc.body.classList.contains("presenting"),
      };
    },
  };
}

/**
 * 화면 위쪽에 뜨는 안내 띠. #main 바깥(topbar 바로 뒤)에 붙여 화면을 다시 그려도 유지된다.
 * @param {{onNow:()=>void, onLater:()=>void}} h
 */
export function createUpdateBanner({ onNow, onLater }) {
  const el = document.createElement("div");
  el.className = "update-banner no-print";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", "앱 업데이트");
  el.hidden = true;
  el.innerHTML = `<div class="update-body"><span class="update-ico" aria-hidden="true">${icon("sparkle", 20)}</span>
    <div class="update-text"><span class="update-msg" role="status" aria-live="polite"></span> <span class="update-hint" aria-hidden="true"></span></div>
    <div class="update-actions"><button type="button" class="btn sm update-now">지금 업데이트</button><button type="button" class="btn sm update-later">나중에</button></div></div>
    <div class="update-bar" aria-hidden="true"><i></i></div>`;
  const $ = s => el.querySelector(s);
  const msg = $(".update-msg"), hint = $(".update-hint"), bar = $(".update-bar i"), now = $(".update-now"), later = $(".update-later");
  now.addEventListener("click", () => onNow());
  later.addEventListener("click", () => onLater());
  el.addEventListener("keydown", e => { if (e.key === "Escape" && !later.hidden) { e.stopPropagation(); onLater(); } });
  const top = document.querySelector(".topbar");
  if (top) top.after(el); else document.body.append(el);
  return {
    el,
    /** @param {{visible:boolean, phase:"available"|"applying"|"failed", text:string, hint:string, progress:number}} v progress: 0~1 (자동 적용까지 진행) */
    render({ visible, phase, text, hint: hintText, progress }) {
      el.hidden = !visible;
      el.dataset.phase = phase;
      if (msg.textContent !== text) msg.textContent = text; // 상태가 바뀔 때만 바꿔 스크린리더가 초마다 읽지 않게 함
      if (hint.textContent !== hintText) hint.textContent = hintText;
      bar.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`;
      const applying = phase === "applying";
      now.disabled = applying; later.hidden = applying; now.textContent = applying ? "업데이트 중…" : "지금 업데이트";
    },
  };
}
