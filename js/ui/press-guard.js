// 누르는 동안 '다시 그리기'를 미루는 장치.
// 글자를 고치던 칸에서 다른 요소·도구 단추·슬라이드 목록을 누르면 브라우저가 누르는 순간(mousedown) 포커스를 옮기고,
// 그때 터지는 focusout 이 곧바로 화면을 다시 그리면 방금 누른 요소가 DOM 에서 사라져 손을 뗄 때 클릭이 전달되지 않는다
// (그래서 첫 클릭은 저장만 되고 한 번 더 눌러야 했음). 저장은 즉시 하되 다시 그리기만 손 뗀 뒤로 미루면 한 번의 클릭으로 끝난다.

/**
 * @param {() => void} run 미뤄 둔 다시 그리기
 * @param {{ setTimer?: (fn: () => void, ms: number) => any }} [opt] 시험용 타이머 주입
 */
export function createPressGuard(run, { setTimer = (fn, ms) => setTimeout(fn, ms) } = {}) {
  let held = false, pending = false;
  return {
    /** 누르기 시작(pointerdown) */
    press() { held = true; },
    /** 손 뗌(pointerup·pointercancel·dragend): 미뤄 둔 요청이 있으면 클릭 이벤트까지 지나간 뒤에 한 번만 실행 */
    release() {
      held = false;
      if (!pending) return;
      pending = false;
      setTimer(run, 0);
    },
    /** 다시 그리기 요청: 누르는 중이면 미루고, 아니면 바로 실행 */
    request() {
      if (held) pending = true; else run();
    },
    get held() { return held; },
    get pending() { return pending; },
  };
}
