// 자유배치 캔버스 인터랙션: 요소 선택·이동·크기조절·회전 — 이 저장소에 드래그·리사이즈 전례가 없어 새로 작성.
// 포인터무브마다 상태를 갱신·재렌더하면 느리므로, 드래그 중에는 DOM 스타일만 직접 바꾸고(라이브 미리보기)
// pointerup 에서 한 번만 상태에 커밋해 되돌리기 한 단계로 남긴다(format-toolbar.js 의 위치 계산과 같은 원칙:
// 렌더 주기 밖에서 style 을 직접 조작).
const MIN_PCT = 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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

/**
 * @param {HTMLElement} root 편집 화면의 캔버스 컨테이너(.pe-stage 등) — 이 안의 .s-el 만 반응
 * @param {{getElements: () => any[], onChange: (id:string, patch:object) => void, onSelect: (id:string|null) => void}} hooks
 * @returns {() => void} 해제 함수
 */
export function installCanvasInteractions(root, { getElements, onChange, onSelect }) {
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
    if (!handle && editableTarget && document.activeElement === editableTarget) { onSelect?.(id); return; }
    const slide = elDiv.closest(".slide");
    const cur = slide && getElements().find(x => x.id === id);
    if (!cur) { onSelect?.(id); return; }
    const rect = slide.getBoundingClientRect();
    drag = { id, elDiv, mode: handle || "move", startX: e.clientX, startY: e.clientY, rect, start: { ...cur }, pending: null, moved: false, editableTarget: handle ? null : editableTarget };
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
    const next = { ...s };
    if (drag.mode === "move") {
      next.x = clamp(s.x + dxPct, 0, Math.max(0, 100 - s.w));
      next.y = clamp(s.y + dyPct, 0, Math.max(0, 100 - s.h));
    } else if (drag.mode === "rotate") {
      const cx = drag.rect.left + (s.x + s.w / 2) / 100 * drag.rect.width;
      const cy = drag.rect.top + (s.y + s.h / 2) / 100 * drag.rect.height;
      next.rot = Math.round(Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90);
    } else {
      if (drag.mode.includes("e")) next.w = clamp(s.w + dxPct, MIN_PCT, 100 - s.x);
      if (drag.mode.includes("s")) next.h = clamp(s.h + dyPct, MIN_PCT, 100 - s.y);
      if (drag.mode.includes("w")) { const w = clamp(s.w - dxPct, MIN_PCT, s.x + s.w); next.x = s.x + s.w - w; next.w = w; }
      if (drag.mode.includes("n")) { const h = clamp(s.h - dyPct, MIN_PCT, s.y + s.h); next.y = s.y + s.h - h; next.h = h; }
    }
    applyLiveStyle(drag.elDiv, next);
    drag.pending = next;
  };

  const up = () => {
    if (!drag) return;
    const { id, pending, moved } = drag;
    drag = null;
    // 이동·크기조절이 있었으면 onChange 가 알아서 다시 그려주므로 선택 알림을 따로 부를 필요 없음(중복 렌더 방지)
    if (moved && pending) onChange(id, pending); else onSelect?.(id);
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

/** 선택된 요소를 방향키로 미세 이동(Shift=5%, 기본 0.5%), Delete 로 제거 */
export function installKeyboardNudge(root, { getSelected, getElements, onChange, onDelete }) {
  const onKey = e => {
    const id = getSelected();
    if (!id) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
    const cur = getElements().find(x => x.id === id);
    if (!cur) return;
    const step = e.shiftKey ? 5 : 0.5;
    if (e.key === "ArrowLeft") { onChange(id, { x: clamp(cur.x - step, 0, 100 - cur.w) }); e.preventDefault(); }
    else if (e.key === "ArrowRight") { onChange(id, { x: clamp(cur.x + step, 0, 100 - cur.w) }); e.preventDefault(); }
    else if (e.key === "ArrowUp") { onChange(id, { y: clamp(cur.y - step, 0, 100 - cur.h) }); e.preventDefault(); }
    else if (e.key === "ArrowDown") { onChange(id, { y: clamp(cur.y + step, 0, 100 - cur.h) }); e.preventDefault(); }
    else if (e.key === "Delete" || e.key === "Backspace") { onDelete(id); e.preventDefault(); }
  };
  root.addEventListener("keydown", onKey);
  return () => root.removeEventListener("keydown", onKey);
}
