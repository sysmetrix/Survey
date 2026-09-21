// 슬라이드 편집기의 순수 계산(DOM·상태 미사용): 정렬·스냅·크기조절·회전·글자 크기(pt↔cqw)·복제·붙여넣기·순서 이동.
// 화면 코드(present-edit.js·present-canvas.js)는 이 함수들로 값을 만들고 상태에 쓰기만 함 → Node 에서 그대로 단위 테스트.
// 좌표는 모두 슬라이드 폭/높이에 대한 백분율(0~100).
import { cqwToPt, ptToCqw } from "../report/pptx/emu.js";

export const MIN_PCT = 2;
export const SNAP_TOL = 1.2; // % 단위
export const PASTE_OFFSET = 3; // % — 복제·붙여넣기 때 원본에서 비껴 놓는 거리
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = v => Math.round(v * 100) / 100;

// ───────────── 글자 크기 (저장 cqw ↔ 표시 pt) ─────────────
export const FONT_MIN_CQW = 0.6; // ≈ 5.8pt — 0·NaN 이 저장되면 글자가 사라지므로 하한을 둠
export const FONT_MAX_CQW = 10;
export const FONT_PT_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
/** 요소 종류별 기본 글자 크기(cqw) — 값이 저장돼 있지 않을 때 화면에 보여 줄 값 */
export const DEFAULT_FONT_CQW = { text: 1.8, richtext: 1.4, table: 1.35 };
/** 글자 크기를 가진 요소 종류 */
export const FONT_KINDS = new Set(["text", "richtext", "table"]);

/** 저장용 cqw 값으로 정리: 비어 있거나 숫자가 아니면 하한 */
export function clampFontCqw(cqw) {
  const n = Number(cqw);
  if (!Number.isFinite(n)) return FONT_MIN_CQW;
  return round3(clamp(n, FONT_MIN_CQW, FONT_MAX_CQW));
}
const round3 = v => Math.round(v * 1000) / 1000;
/** 사용자가 입력한 pt(문자열·숫자) → 저장용 cqw. 빈 입력·NaN·0 은 하한(≈6pt) */
export const fontCqwFromPt = pt => clampFontCqw(ptToCqw(pt));
/** 요소의 지금 글자 크기(pt) — 저장된 값이 없으면 종류별 기본값 */
export const fontPtOf = el => cqwToPt(Number.isFinite(Number(el?.fontSize)) && Number(el?.fontSize) > 0 ? Number(el.fontSize) : (DEFAULT_FONT_CQW[el?.kind] ?? 1.8));
/** 화면에 보일 pt 문자열(불필요한 소수 0 제거) */
export const fmtPt = pt => String(+Number(pt).toFixed(1));
/** −/+ 버튼: 다음·이전 표준 크기(8, 9, 10, 11, 12, 14 …)로. 목록 밖이면 ±2pt */
export function stepFontCqw(cqw, dir) {
  const pt = cqwToPt(clampFontCqw(cqw));
  let next;
  if (dir > 0) next = FONT_PT_STEPS.find(s => s > pt + 0.05) ?? pt + 2;
  else next = [...FONT_PT_STEPS].reverse().find(s => s < pt - 0.05) ?? pt - 2;
  return clampFontCqw(ptToCqw(next));
}

// ───────────── 속성 값 정리 ─────────────
const NUM_LIMITS = {
  x: [0, 100], y: [0, 100], w: [MIN_PCT, 100], h: [MIN_PCT, 100], rot: [-360, 360],
  opacity: [0, 1], strokeWidth: [0, 40], borderWidth: [0, 40], radius: [0, 200], lineHeight: [0.8, 3],
  fontSize: [FONT_MIN_CQW, FONT_MAX_CQW],
};
export const NUMERIC_PROPS = new Set(Object.keys(NUM_LIMITS));
/** 입력값 → 저장할 숫자. 숫자가 아니면 null(변경하지 않음). fontSize 는 cqw 기준 */
export function cleanNumber(prop, raw) {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const [lo, hi] = NUM_LIMITS[prop] || [-Infinity, Infinity];
  return clamp(n, lo, hi);
}

/** CSS 색 문자열 검증(프로젝트 파일 등 외부에서 온 값이 style 속성에 그대로 들어가지 않도록). 아니면 "" */
export function safeCssColor(v) {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (/^(rgb|hsl)a?\(\s*[\d.\s,%/-]+\)$/i.test(s)) return s;
  if (/^[a-z]{3,20}$/i.test(s)) return s;
  return "";
}

/** 발표자 노트: 줄마다 하나(빈 줄 제외) ↔ 문자열 배열 */
export const notesFromText = text => String(text ?? "").split(/\r?\n/).map(l => l.replace(/\s+$/, "")).filter(l => l.trim());
export const notesToText = notes => (Array.isArray(notes) ? notes : []).join("\n");

// ───────────── 슬라이드 기준 정렬 ─────────────
export const ALIGN_HOW = ["left", "center-h", "right", "top", "center-v", "bottom"];
/** 요소를 슬라이드 가장자리·가운데에 맞추는 위치 패치(회전은 무시하고 상자 기준). 알 수 없는 how 는 빈 객체 */
export function alignBox(el, how) {
  const w = Number(el.w) || 0, h = Number(el.h) || 0;
  switch (how) {
    case "left": return { x: 0 };
    case "center-h": return { x: round2((100 - w) / 2) };
    case "right": return { x: round2(100 - w) };
    case "top": return { y: 0 };
    case "center-v": return { y: round2((100 - h) / 2) };
    case "bottom": return { y: round2(100 - h) };
    default: return {};
  }
}

// ───────────── 쌓임 순서 ─────────────
export const Z_HOW = ["front", "forward", "backward", "back"];
/** 요소의 쌓임 순서를 바꾼 새 배열(모든 z 를 1..n 으로 다시 매김). how: front(맨 앞)·forward(앞으로)·backward(뒤로)·back(맨 뒤) */
export function reorderZ(elements, id, how) {
  const list = elements || [];
  const sorted = list.map((e, i) => ({ e, i })).sort((a, b) => ((a.e.z || 1) - (b.e.z || 1)) || (a.i - b.i)).map(x => x.e);
  const from = sorted.findIndex(e => e.id === id);
  if (from < 0) return list;
  const [it] = sorted.splice(from, 1);
  const to = how === "front" ? sorted.length : how === "back" ? 0 : how === "forward" ? Math.min(sorted.length, from + 1) : Math.max(0, from - 1);
  sorted.splice(to, 0, it);
  const z = new Map(sorted.map((e, i) => [e.id, i + 1]));
  return list.map(e => ({ ...e, z: z.get(e.id) }));
}

// ───────────── 복제·붙여넣기 ─────────────
/** 요소 복사(문단·표 칸은 새 배열로 — 원본과 참조를 공유하지 않게) */
export function cloneEl(el) {
  const c = { ...el };
  if (Array.isArray(el.blocks)) c.blocks = el.blocks.map(b => ({ ...b }));
  if (Array.isArray(el.rows)) c.rows = el.rows.map(r => [...r]);
  return c;
}
/** 붙여넣기·복제용 사본: 새 id, +3% 비껴 놓되 슬라이드 밖으로 나가지 않게, 맨 앞 z */
export function pasteCopy(el, id, z, offset = PASTE_OFFSET) {
  const c = cloneEl(el);
  c.id = id;
  c.x = round2(Math.max(0, Math.min(100 - (Number(el.w) || 0), (Number(el.x) || 0) + offset)));
  c.y = round2(Math.max(0, Math.min(100 - (Number(el.h) || 0), (Number(el.y) || 0) + offset)));
  c.z = z;
  return c;
}
/** 슬라이드 복제: 모든 요소에 새 id(원본 위치·쌓임 순서 그대로). idFn 은 호출마다 새 id */
export const duplicateElements = (elements, idFn) => (elements || []).map(el => ({ ...cloneEl(el), id: idFn() }));

// ───────────── 슬라이드 목록 순서 ─────────────
/** id 를 toId 앞(after=false) 또는 뒤(after=true)로 옮긴 새 순서. 옮길 게 없으면 같은 배열 값 */
export function moveId(order, id, toId, after = false) {
  const list = [...order];
  if (id === toId || !list.includes(id) || !list.includes(toId)) return list;
  list.splice(list.indexOf(id), 1);
  const at = list.indexOf(toId) + (after ? 1 : 0);
  list.splice(at, 0, id);
  return list;
}

/** Tab / Shift+Tab 으로 다음(dir=1)·이전(dir=-1) 요소 id — 선택이 없으면 처음(또는 마지막), 끝에서 처음으로 순환 */
export function cycleId(elements, selectedId, dir = 1) {
  const list = elements || [];
  if (!list.length) return null;
  const i = list.findIndex(e => e.id === selectedId);
  if (i < 0) return (dir < 0 ? list[list.length - 1] : list[0]).id;
  return list[(i + dir + list.length) % list.length].id;
}

/** 분석 슬라이드들의 차트 목록(차트 삽입 메뉴용): 자동 슬라이드의 chart 만 */
export function chartChoices(slides) {
  const out = [];
  (slides || []).forEach((s, i) => {
    if (s?.chart && typeof s.chart === "object") out.push({ slideId: s.id, index: i, title: s.title || s.section || `슬라이드 ${i + 1}`, chart: s.chart });
  });
  return out;
}

// ───────────── 스냅(이동) ─────────────
/** 다른 요소 가장자리·가운데와 슬라이드 가장자리·가운데 — 스냅할 세로선(xs)·가로선(ys) 후보 */
export function snapLines(others = []) {
  const xs = [0, 50, 100], ys = [0, 50, 100];
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  return { xs, ys };
}
/** 한 축 스냅: 움직이는 상자의 (앞·가운데·뒤) 세 점 중 후보선에 tol 안으로 가장 가까운 것에 맞춤. 거리 같으면 가운데→앞→뒤 우선 */
function snapAxis(pos, size, lines, tol) {
  let best = null;
  for (const [off, name] of [[size / 2, "c"], [0, "s"], [size, "e"]]) {
    for (const line of lines) {
      const d = Math.abs(pos + off - line);
      if (d < tol && (!best || d < best.d - 1e-9)) best = { d, pos: line - off, line, name };
    }
  }
  return best;
}
/** 이동 중 스냅: next.x/y 를 제자리에서 고치고 안내선 위치({v,h}, 없으면 null)를 돌려줌.
 *  others = 자기 자신을 뺀 나머지 요소 목록(없으면 슬라이드 기준선만) */
export function snapMove(next, w, h, others = [], tol = SNAP_TOL) {
  const { xs, ys } = snapLines(others);
  const guides = { v: null, h: null };
  const bx = snapAxis(next.x, w, xs, tol);
  if (bx) { next.x = bx.pos; guides.v = bx.line; }
  const by = snapAxis(next.y, h, ys, tol);
  if (by) { next.y = by.pos; guides.h = by.line; }
  return guides;
}

// ───────────── 크기 조절·회전 ─────────────
/** 핸들 드래그로 새 상자 계산. mode: n/ne/e/se/s/sw/w/nw, dx·dy: 이동량(%). keepAspect(Shift)이면 원래 가로세로비 유지 */
export function resizeBox(s, mode, dx, dy, { keepAspect = false } = {}) {
  const hasE = mode.includes("e"), hasW = mode.includes("w"), hasS = mode.includes("s"), hasN = mode.includes("n");
  let w = s.w, h = s.h;
  if (hasE) w = clamp(s.w + dx, MIN_PCT, 100 - s.x);
  if (hasW) w = clamp(s.w - dx, MIN_PCT, s.x + s.w);
  if (hasS) h = clamp(s.h + dy, MIN_PCT, 100 - s.y);
  if (hasN) h = clamp(s.h - dy, MIN_PCT, s.y + s.h);
  if (keepAspect && s.w > 0 && s.h > 0) {
    // 슬라이드의 가로·세로 픽셀비는 상수이므로 백분율 비(w/h)를 그대로 유지하면 화면 비율도 유지됨
    const fw = hasE || hasW ? w / s.w : null, fh = hasN || hasS ? h / s.h : null;
    let f = fw ?? fh;
    if (fw !== null && fh !== null) f = Math.abs(fw - 1) >= Math.abs(fh - 1) ? fw : fh;
    const roomW = hasW ? s.x + s.w : 100 - s.x, roomH = hasN ? s.y + s.h : 100 - s.y;
    const fMax = Math.min(roomW / s.w, roomH / s.h), fMin = Math.min(fMax, Math.max(MIN_PCT / s.w, MIN_PCT / s.h));
    f = clamp(f, fMin, fMax);
    w = s.w * f; h = s.h * f;
  }
  return {
    ...s,
    x: hasW ? s.x + s.w - w : s.x, y: hasN ? s.y + s.h - h : s.y,
    w, h,
  };
}
/** 각도를 step° 단위로(Shift 회전) */
export const snapAngle = (deg, step = 15) => Math.round(deg / step) * step;
/** 상자 가운데(cx,cy) 기준 포인터(px,py) 방향의 회전각(도, 위쪽이 0°, 정수). snap 이면 15° 단위 */
export function rotationFromPoint(cx, cy, px, py, { snap = false } = {}) {
  const deg = Math.atan2(py - cy, px - cx) * 180 / Math.PI + 90;
  let norm = ((deg % 360) + 360) % 360; if (norm > 180) norm -= 360; // −180 초과 180 이하
  return snap ? snapAngle(norm, 15) : Math.round(norm);
}
