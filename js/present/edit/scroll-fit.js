// 슬라이드 편집 화면의 스크롤·높이 계산 — 순수 함수(DOM 없음, Node 에서 단위 테스트).
// 화면 코드(views/present-edit.js)가 요소 크기를 재서 넘기고 결과만 CSS 변수·scrollTop 에 쓴다.

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** scrollTop 을 [0, 내용 높이 − 보이는 높이] 안으로 */
export function clampScroll(top, contentH, viewH) {
  const max = Math.max(0, num(contentH) - num(viewH));
  return Math.min(max, Math.max(0, num(top)));
}

/** 목록 안의 한 칸(itemTop~itemTop+itemH)이 보이는 영역을 벗어났을 때만, 가장 적게 굴려서 보이게 한 새 scrollTop.
 *  이미 보이면 scrollTop 그대로(맨 위로 튀지 않음). itemTop 은 스크롤 내용 안에서의 위치, pad 는 가장자리 여백 */
export function revealScrollTop({ scrollTop, viewH, contentH, itemTop, itemH, pad = 8 }) {
  const view = num(viewH), cur = num(scrollTop), top = num(itemTop), h = num(itemH);
  if (view <= 0 || h < 0) return clampScroll(cur, contentH, view);
  let next = cur;
  if (h + pad * 2 >= view) next = top - pad;             // 칸이 목록보다 크면 윗머리를 맞춤
  else if (top - pad < cur) next = top - pad;            // 위로 벗어남
  else if (top + h + pad > cur + view) next = top + h + pad - view; // 아래로 벗어남
  return contentH === undefined ? Math.max(0, next) : clampScroll(next, contentH, view);
}

/** 세 칸(목록·슬라이드·속성)이 창 높이 안에 들어가도록 편집 영역(.pe-layout) 높이를 계산.
 *  innerH: 창 높이, top: 문서 맨 위에서 편집 영역까지의 거리, below: 편집 영역 아래로 남는 여백·바닥글, min: 이보다는 줄이지 않음 */
export function fitLayoutHeight({ innerH, top, below = 0, min = 320 }) {
  return Math.max(num(min, 320), Math.floor(num(innerH) - num(top) - num(below)));
}

/** 다시 그리기 전후로 칸별 스크롤 위치를 기억. 같은 대상(key)을 다시 그릴 때만 복원하고, 대상이 바뀌면 0 부터 */
export function createScrollMemory() {
  const pos = new Map(), keys = new Map();
  return {
    save(name, top) { pos.set(name, Math.max(0, num(top))); },
    /** 복원할 위치. key 가 지난번과 다르면 0 으로 되돌리고 새 key 를 기억 */
    recall(name, key = "") {
      if (keys.get(name) !== key) { keys.set(name, key); pos.set(name, 0); }
      return pos.get(name) || 0;
    },
    reset(name) { pos.delete(name); keys.delete(name); },
  };
}
