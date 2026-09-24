// 화면을 다시 그릴 때 현재 위치를 잃지 않기 위한 공통 스크롤 보존 도구.
// 화면 전환은 새 화면의 처음에서 시작하고, 같은 화면 안의 선택·필터·설정만 위치를 되돌린다.

const TRANSIENT_CLASSES = new Set(["on", "open", "active", "selected", "dim", "hidden", "loading"]);

export function shouldRestoreViewport({ viewChanged, keepScroll = false }) {
  return keepScroll || !viewChanged;
}

function signature(node) {
  const classes = [...(node.classList || [])]
    .filter(name => !TRANSIENT_CLASSES.has(name))
    .sort()
    .join(".");
  return `${node.tagName || "node"}${classes ? `.${classes}` : ""}`;
}

// id가 없는 반복 영역도 새 DOM에서 같은 위치를 찾도록, 안정적인 조상 경로를 만든다.
function scrollKey(root, node) {
  if (node.id) return `#${node.id}`;
  const parts = [];
  let current = node;
  while (current && current !== root) {
    const sig = signature(current);
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter(child => signature(child) === sig)
      : [current];
    parts.unshift(`${sig}:${Math.max(0, siblings.indexOf(current))}`);
    current = current.parentElement;
  }
  return parts.join(">");
}

export function captureScrollState(root) {
  if (!root?.querySelectorAll) return [];
  return [...root.querySelectorAll("*")]
    .filter(node => node.scrollTop || node.scrollLeft)
    .map(node => ({ key: scrollKey(root, node), top: node.scrollTop, left: node.scrollLeft }));
}

export function restoreScrollState(root, positions) {
  if (!root?.querySelectorAll || !positions?.length) return;
  const nodes = [...root.querySelectorAll("*")];
  const byKey = new Map(nodes.map(node => [scrollKey(root, node), node]));
  positions.forEach(({ key, top, left }) => {
    const node = byKey.get(key);
    if (node) { node.scrollTop = top; node.scrollLeft = left; }
  });
}

export function restoreViewport({ top = 0, left = 0, root, nested = [], schedule = requestAnimationFrame } = {}) {
  const apply = () => {
    window.scrollTo(left, top);
    restoreScrollState(root, nested);
  };
  apply();
  // DOM 교체 직후의 높이 보정·이미지 레이아웃 뒤에도 한 번 더 적용한다.
  schedule(apply);
}
