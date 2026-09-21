// 자유배치 캔버스 인터랙션: 요소 선택·이동·크기조절·회전 + 키보드(방향키 이동·복사/붙여넣기·Tab 순환 등)
// 이 저장소에 드래그·리사이즈 전례가 없어 새로 작성. 포인터무브마다 상태를 갱신·재렌더하면 느리므로, 드래그 중에는
// DOM 스타일만 직접 바꾸고(라이브 미리보기) pointerup 에서 한 번만 상태에 커밋해 되돌리기 한 단계로 남긴다
// (format-toolbar.js 의 위치 계산과 같은 원칙: 렌더 주기 밖에서 style 을 직접 조작).
// 계산 자체(스냅·크기조절·회전)는 present-edit-model.js 의 순수 함수 — 여기서는 DOM 연결만 한다.
import { clamp, snapMove, resizeBox, rotationFromPoint, cycleId } from "./present-edit-model.js";

export { snapMove };

// 헤드리스·일부 입력 장치 조합에서 setPointerCapture 가 InvalidStateError 를 던지는 경우가 있어(포인터가
// "활성" 상태가 아니라고 판단될 때) — 실패해도 드래그 자체는 계속 동작해야 하므로 무시하고 넘어감
const safeCapture = (el, pointerId) => { try { el.setPointerCapture?.(pointerId); } catch { /* 캡처 없이도 계속 진행 */ } };

function applyLiveStyle(elDiv, next) {
  elDiv.style.left = `${next.x}%`;
  elDiv.style.top = `${next.y}%`;
  elDiv.style.width = `${next.w}%`;
  elDiv.style.height = `${next.h}%`;
  elDiv.style.transform = `rotate(${next.rot || 0}deg)`;
}

function ensureGuides(slide) {
  let wrap = slide.querySelector(":scope > .s-guides");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "s-guides";
    wrap.innerHTML = `<i class="s-guide-v"></i><i class="s-guide-h"></i>`;
    slide.appendChild(wrap);
  }
  return wrap;
}
function showGuides(slide, guides) {
  const wrap = ensureGuides(slide);
  const v = wrap.querySelector(".s-guide-v"), h = wrap.querySelector(".s-guide-h");
  v.style.display = guides.v == null ? "none" : "block";
  if (guides.v != null) v.style.left = `${guides.v}%`;
  h.style.display = guides.h == null ? "none" : "block";
  if (guides.h != null) h.style.top = `${guides.h}%`;
}
function hideGuides(slide) { slide.querySelector(":scope > .s-guides")?.remove(); }

/**
 * @param {HTMLElement} root 편집 화면의 캔버스 컨테이너(.pe-stage 등) — 이 안의 .s-el 만 반응
 * @param {{getElements: () => any[], onChange: (id:string, patch:object) => void, onSelect: (id:string|null) => void, getSelected?: () => string|null}} hooks
 * @returns {() => void} 해제 함수
 */
export function installCanvasInteractions(root, { getElements, onChange, onSelect, getSelected }) {
  let drag = null;

  const down = e => {
    const handle = e.target.closest(".s-el-handle")?.dataset.handle || null;
    const elDiv = e.target.closest(".s-el");
    // onSelect 는 보통 다시 그리기(refresh)를 부르는데, 여기서 바로 부르면 지금 잡고 있는 elDiv·slide 가
    // 재렌더로 통째로 갈아끼워져(사라져) 이후 pointermove/up 이 죽은 DOM을 붙들게 된다. 그래서 선택 알림은
    // 이 제스처가 끝난 뒤(up)로 미루고, 여기서는 드래그에 필요한 정보만 먼저 다 읽어 둔다.
    if (!elDiv || !root.contains(elDiv)) { if (e.target === root || e.target.classList.contains("s-free")) onSelect?.(null); return; }
    const id = elDiv.dataset.elId;
    const editableTarget = e.target.closest("[contenteditable]");
    // 이미 편집 중인 텍스트 안에서 커서를 옮기는 클릭은 드래그로 가로채지 않음. 아직 포커스 전이면
    // "클릭(=편집 진입)"과 "드래그(=이동)"를 구분해야 하므로, 일정 거리 넘게 움직였을 때만 드래그로 확정한다.
    if (!handle && editableTarget && document.activeElement === editableTarget) { if (getSelected?.() !== id) onSelect?.(id); return; }
    const slide = elDiv.closest(".slide");
    const cur = slide && getElements().find(x => x.id === id);
    if (!cur) { onSelect?.(id); return; }
    const rect = slide.getBoundingClientRect();
    drag = { id, elDiv, slide, mode: handle || "move", startX: e.clientX, startY: e.clientY, rect, start: { ...cur }, pending: null, moved: false, editableTarget: handle ? null : editableTarget };
    if (handle) { safeCapture(elDiv, e.pointerId); e.preventDefault(); }
  };

  const move = e => {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return; // 아직 클릭인지 드래그인지 애매함 — 텍스트면 편집 진입 여지를 둠
      drag.moved = true;
      drag.editableTarget?.blur();
      window.getSelection?.()?.removeAllRanges?.();
      safeCapture(drag.elDiv, e.pointerId);
    }
    e.preventDefault();
    const dxPct = (e.clientX - drag.startX) / drag.rect.width * 100;
    const dyPct = (e.clientY - drag.startY) / drag.rect.height * 100;
    const s = drag.start;
    let next = { ...s };
    if (drag.mode === "move") {
      next.x = clamp(s.x + dxPct, 0, Math.max(0, 100 - s.w));
      next.y = clamp(s.y + dyPct, 0, Math.max(0, 100 - s.h));
      const others = getElements().filter(x => x.id !== drag.id);
      const guides = snapMove(next, s.w, s.h, others);
      next.x = clamp(next.x, 0, Math.max(0, 100 - s.w));
      next.y = clamp(next.y, 0, Math.max(0, 100 - s.h));
      showGuides(drag.slide, guides);
    } else if (drag.mode === "rotate") {
      const cx = drag.rect.left + (s.x + s.w / 2) / 100 * drag.rect.width;
      const cy = drag.rect.top + (s.y + s.h / 2) / 100 * drag.rect.height;
      next.rot = rotationFromPoint(cx, cy, e.clientX, e.clientY, { snap: e.shiftKey }); // Shift = 15° 단위
    } else {
      next = resizeBox(s, drag.mode, dxPct, dyPct, { keepAspect: e.shiftKey }); // Shift = 가로세로비 유지
    }
    applyLiveStyle(drag.elDiv, next);
    drag.pending = next;
  };

  const up = () => {
    if (!drag) return;
    const { id, pending, moved, slide } = drag;
    hideGuides(slide);
    drag = null;
    // 이동·크기조절이 있었으면 onChange 가 알아서 다시 그려주므로 선택 알림을 따로 부를 필요 없음(중복 렌더 방지).
    // 이미 선택된 요소를 그냥 다시 누른 것이면 다시 그릴 필요가 없음 — 오히려 다시 그리면 방금 들어간 글자 편집 상태가 끊김
    if (moved && pending) onChange(id, pending);
    else if (getSelected?.() !== id) onSelect?.(id);
  };

  root.addEventListener("pointerdown", down);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  return () => {
    root.removeEventListener("pointerdown", down);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
  };
}

const TYPING = "input, textarea, select, [contenteditable='true'], [contenteditable='']";
const hasTextSelection = () => typeof window !== "undefined" && !!window.getSelection?.()?.toString();

/**
 * 편집 화면 키보드 단축키(이벤트 → 훅 호출). 입력칸·글자 편집 중에는 아무것도 가로채지 않음(Esc 로 편집만 끝냄).
 *  방향키 이동(Shift=5%, 기본 0.5%) · Delete/Backspace 삭제 · Esc 선택 해제 · Tab/Shift+Tab 요소 순환 ·
 *  Enter/F2 글자 편집 시작 · Ctrl+C/X/V/D 복사·잘라내기·붙여넣기·복제
 * @returns {boolean} 처리했으면 true
 */
export function handleEditorKey(e, root, hooks) {
  const t = e.target;
  const typing = t?.closest?.(TYPING);
  if (typing) {
    if (e.key === "Escape" && t.closest?.("[contenteditable]")) { t.blur?.(); return true; } // 글자 편집만 끝냄(저장은 focusout 이 처리)
    return false;
  }
  const inStage = !!(t && (t === root || root?.contains?.(t)));
  const onBody = !t || t === document.body || t === document.documentElement;
  const id = hooks.getSelected();
  const els = hooks.getElements();
  const cur = id ? els.find(x => x.id === id) : null;
  const mod = e.ctrlKey || e.metaKey;

  if (mod && !e.altKey) {
    if (hasTextSelection()) return false;
    const act = { KeyC: "onCopy", KeyX: "onCut", KeyD: "onDuplicate" }[e.code];
    if (act) { if (!cur || !hooks[act]) return false; hooks[act](id); e.preventDefault(); return true; }
    if (e.code === "KeyV" && !e.shiftKey) { if (!hooks.onPaste) return false; hooks.onPaste(); e.preventDefault(); return true; }
    return false;
  }
  if (e.altKey) return false;

  if (e.key === "Escape") { if (!id) return false; hooks.onSelect?.(null); e.preventDefault(); return true; }
  if (e.key === "Tab") {
    if (!inStage) return false; // 다른 곳의 Tab 은 브라우저 기본(도구 모음 이동)
    const next = cycleId(els, id, e.shiftKey ? -1 : 1);
    if (!next) return false;
    hooks.onSelect?.(next); e.preventDefault(); return true;
  }
  if (!cur || !(inStage || onBody)) return false;
  const step = e.shiftKey ? 5 : 0.5;
  if (e.key === "ArrowLeft") hooks.onChange(id, { x: clamp(cur.x - step, 0, 100 - cur.w) });
  else if (e.key === "ArrowRight") hooks.onChange(id, { x: clamp(cur.x + step, 0, 100 - cur.w) });
  else if (e.key === "ArrowUp") hooks.onChange(id, { y: clamp(cur.y - step, 0, 100 - cur.h) });
  else if (e.key === "ArrowDown") hooks.onChange(id, { y: clamp(cur.y + step, 0, 100 - cur.h) });
  else if (e.key === "Delete" || e.key === "Backspace") hooks.onDelete(id);
  else if ((e.key === "Enter" || e.key === "F2") && hooks.onEdit) hooks.onEdit(id);
  else return false;
  e.preventDefault();
  return true;
}

/** 편집 화면 키보드 연결. 재렌더로 포커스가 body 로 떨어져도 계속 동작하도록 document 에 한 번 연결(해제 함수 반환) */
export function installKeyboardNudge(root, hooks) {
  const onKey = e => { handleEditorKey(e, root, hooks); };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}
