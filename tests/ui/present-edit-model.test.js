// 슬라이드 편집기 순수 계산(DOM 없이): 정렬·스냅·크기조절·회전·글자 크기(pt↔cqw)·복제·붙여넣기·순서 이동·키보드 처리
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../../js/ui/present-edit-model.js";
import { handleEditorKey } from "../../js/ui/present-canvas.js";
import { cqwToPt, ptToCqw } from "../../js/report/pptx/emu.js";

const box = (o = {}) => ({ id: "a", kind: "shape", x: 10, y: 20, w: 30, h: 10, z: 1, ...o });

test("글자 크기: cqw ↔ pt 변환, 하한·빈 입력·NaN 처리", () => {
  assert.equal(cqwToPt(1.8), 17.3);
  assert.equal(M.fontPtOf({ kind: "text" }), cqwToPt(1.8), "저장값이 없으면 종류별 기본값");
  assert.equal(M.fontPtOf({ kind: "table" }), cqwToPt(1.35));
  assert.equal(M.fontPtOf({ kind: "text", fontSize: 4 }), 38.4, "cqw 4 는 38.4pt 로 보임");
  assert.equal(M.fontCqwFromPt("18"), ptToCqw(18));
  for (const bad of ["", "abc", 0, "0", NaN, undefined, null, -5]) {
    const v = M.fontCqwFromPt(bad);
    assert.ok(Number.isFinite(v) && v >= M.FONT_MIN_CQW, `${String(bad)} → ${v}`);
  }
  assert.equal(M.fontCqwFromPt(1e6), M.FONT_MAX_CQW);
  assert.equal(M.fmtPt(18), "18");
  assert.equal(M.fmtPt(17.34), "17.3");
});

test("글자 크기 −/+: 표준 크기 목록을 따라 움직이고 하한을 넘지 않음", () => {
  const at = pt => ptToCqw(pt);
  assert.equal(cqwToPt(M.stepFontCqw(at(12), 1)), 14);
  assert.equal(cqwToPt(M.stepFontCqw(at(12), -1)), 11);
  assert.equal(cqwToPt(M.stepFontCqw(at(13), 1)), 14, "목록 사이 값은 다음 표준 크기로");
  assert.equal(cqwToPt(M.stepFontCqw(at(96), 1)), 96, "상한(10cqw=96pt)에서 멈춤");
  for (let i = 0, v = at(30); i < 40; i++) { v = M.stepFontCqw(v, -1); assert.ok(v >= M.FONT_MIN_CQW); }
  assert.ok(Number.isFinite(M.stepFontCqw(NaN, 1)));
});

test("속성 값 정리: 숫자 범위, 잘못된 입력은 null, 색 검증", () => {
  assert.equal(M.cleanNumber("opacity", "2"), 1);
  assert.equal(M.cleanNumber("opacity", "-1"), 0);
  assert.equal(M.cleanNumber("x", "42"), 42);
  assert.equal(M.cleanNumber("w", "0"), M.MIN_PCT);
  assert.equal(M.cleanNumber("x", ""), null);
  assert.equal(M.cleanNumber("x", "abc"), null);
  assert.equal(M.cleanNumber("lineHeight", "9"), 3);
  assert.equal(M.safeCssColor("#3B5A7A"), "#3B5A7A");
  assert.equal(M.safeCssColor("rgba(0, 0, 0, .5)"), "rgba(0, 0, 0, .5)");
  assert.equal(M.safeCssColor("red"), "red");
  assert.equal(M.safeCssColor('red;background:url(x)'), "");
  assert.equal(M.safeCssColor('"><script>'), "");
  assert.equal(M.safeCssColor(42), "");
});

test("발표자 노트: 줄마다 하나, 빈 줄 제거", () => {
  assert.deepEqual(M.notesFromText("첫째\n\n  둘째  \r\n셋째"), ["첫째", "  둘째", "셋째"]);
  assert.deepEqual(M.notesFromText(""), []);
  assert.equal(M.notesToText(["가", "나"]), "가\n나");
  assert.equal(M.notesToText(undefined), "");
});

test("슬라이드 기준 정렬 6종", () => {
  const el = box({ x: 10, y: 20, w: 30, h: 10 });
  assert.deepEqual(M.alignBox(el, "left"), { x: 0 });
  assert.deepEqual(M.alignBox(el, "center-h"), { x: 35 });
  assert.deepEqual(M.alignBox(el, "right"), { x: 70 });
  assert.deepEqual(M.alignBox(el, "top"), { y: 0 });
  assert.deepEqual(M.alignBox(el, "center-v"), { y: 45 });
  assert.deepEqual(M.alignBox(el, "bottom"), { y: 90 });
  assert.deepEqual(M.alignBox(el, "nope"), {});
  assert.deepEqual(M.alignBox(box({ w: 33.3333 }), "center-h"), { x: 33.33 }, "소수 둘째 자리로 정리");
});

test("쌓임 순서: 맨 앞·앞으로·뒤로·맨 뒤 (z 를 1..n 으로 다시 매김)", () => {
  const els = [box({ id: "a", z: 1 }), box({ id: "b", z: 2 }), box({ id: "c", z: 3 })];
  const zOf = (list, id) => list.find(e => e.id === id).z;
  assert.equal(zOf(M.reorderZ(els, "a", "front"), "a"), 3);
  assert.equal(zOf(M.reorderZ(els, "a", "front"), "c"), 2);
  assert.equal(zOf(M.reorderZ(els, "c", "back"), "c"), 1);
  const fwd = M.reorderZ(els, "a", "forward");
  assert.deepEqual([zOf(fwd, "b"), zOf(fwd, "a"), zOf(fwd, "c")], [1, 2, 3]);
  const bwd = M.reorderZ(els, "c", "backward");
  assert.deepEqual([zOf(bwd, "a"), zOf(bwd, "c"), zOf(bwd, "b")], [1, 2, 3]);
  assert.equal(zOf(M.reorderZ(els, "c", "front"), "c"), 3, "이미 맨 앞이면 그대로");
  assert.equal(M.reorderZ(els, "zz", "front"), els, "없는 id 는 그대로");
  // z 가 겹치거나 비어 있어도 안정적으로 정리
  const messy = [box({ id: "a", z: undefined }), box({ id: "b", z: 1 }), box({ id: "c", z: 5 })];
  assert.deepEqual(M.reorderZ(messy, "a", "front").map(e => e.z), [3, 1, 2]);
  assert.equal(els[0].z, 1, "원본은 바뀌지 않음");
});

test("붙여넣기·복제: 새 id, +3% 오프셋, 슬라이드 밖으로 나가지 않음, 참조 비공유", () => {
  const src = { id: "a", kind: "richtext", x: 10, y: 20, w: 30, h: 10, z: 1, blocks: [{ type: "paragraph", text: "가" }] };
  const c = M.pasteCopy(src, "b", 5);
  assert.deepEqual([c.id, c.x, c.y, c.z], ["b", 13, 23, 5]);
  c.blocks[0].text = "나";
  assert.equal(src.blocks[0].text, "가", "문단 배열을 공유하지 않음");
  const edge = M.pasteCopy(box({ x: 70, y: 90, w: 30, h: 10 }), "c", 2);
  assert.deepEqual([edge.x, edge.y], [70, 90], "이미 구석이면 더 밀리지 않음");
  const t = M.pasteCopy({ id: "t", kind: "table", x: 0, y: 0, w: 50, h: 20, rows: [["a", "b"]] }, "u", 1);
  t.rows[0][0] = "z";
});

test("슬라이드 복제: 요소마다 새 id, 나머지는 그대로", () => {
  let n = 0;
  const els = [box({ id: "a" }), box({ id: "b", kind: "table", rows: [["1"]] })];
  const dup = M.duplicateElements(els, () => `n${n++}`);
  assert.deepEqual(dup.map(e => e.id), ["n0", "n1"]);
  assert.deepEqual(dup.map(e => [e.x, e.y, e.w, e.h, e.z]), els.map(e => [e.x, e.y, e.w, e.h, e.z]));
  dup[1].rows[0][0] = "X";
  assert.equal(els[1].rows[0][0], "1");
  assert.deepEqual(M.duplicateElements(undefined, () => "x"), []);
});

test("슬라이드 순서 이동(끌어놓기): 앞·뒤로, 자기 자신·없는 id 는 그대로", () => {
  const order = ["a", "b", "c", "d"];
  assert.deepEqual(M.moveId(order, "a", "c", false), ["b", "a", "c", "d"]);
  assert.deepEqual(M.moveId(order, "a", "c", true), ["b", "c", "a", "d"]);
  assert.deepEqual(M.moveId(order, "d", "a", false), ["d", "a", "b", "c"]);
  assert.deepEqual(M.moveId(order, "b", "b", true), order);
  assert.deepEqual(M.moveId(order, "x", "b", true), order);
  assert.deepEqual(order, ["a", "b", "c", "d"], "원본 배열 불변");
});

test("Tab 순환: 끝에서 처음으로, Shift+Tab 은 거꾸로, 선택 없으면 처음/마지막", () => {
  const els = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(M.cycleId(els, null, 1), "a");
  assert.equal(M.cycleId(els, null, -1), "c");
  assert.equal(M.cycleId(els, "c", 1), "a");
  assert.equal(M.cycleId(els, "a", -1), "c");
  assert.equal(M.cycleId(els, "a", 1), "b");
  assert.equal(M.cycleId([], "a", 1), null);
});

test("차트 삽입 목록: chart 가 있는 슬라이드만", () => {
  const slides = [{ id: "s1", title: "표지" }, { id: "s2", title: "만족도", chart: { kind: "hbar" } }, { id: "s3", section: "분포", chart: { kind: "npsBar" } }, { id: "s4", chart: null }];
  const out = M.chartChoices(slides);
  assert.deepEqual(out.map(c => [c.slideId, c.title]), [["s2", "만족도"], ["s3", "분포"]]);
  assert.deepEqual(M.chartChoices(undefined), []);
});

test("스냅: 슬라이드 가운데·가장자리, 다른 요소의 가장자리·가운데, 허용오차 밖은 그대로", () => {
  // 슬라이드 가운데
  let n = { x: 34.5, y: 10 };
  let g = M.snapMove(n, 30, 10, []);
  assert.equal(n.x, 35); assert.equal(g.v, 50);
  // 슬라이드 왼쪽·오른쪽 가장자리
  n = { x: 0.8, y: 10 }; g = M.snapMove(n, 30, 10, []);
  assert.equal(n.x, 0); assert.equal(g.v, 0);
  n = { x: 69.5, y: 10 }; g = M.snapMove(n, 30, 10, []);
  assert.equal(n.x, 70); assert.equal(g.v, 100);
  // 다른 요소의 왼쪽 가장자리(x=10)에 맞춤
  const other = { id: "o", x: 10, y: 60, w: 20, h: 10 };
  n = { x: 11, y: 5 }; g = M.snapMove(n, 15, 10, [other]);
  assert.equal(n.x, 10); assert.equal(g.v, 10);
  // 다른 요소의 오른쪽 가장자리(30)에 내 왼쪽을 맞춤
  n = { x: 30.9, y: 5 }; g = M.snapMove(n, 15, 10, [other]);
  assert.equal(n.x, 30); assert.equal(g.v, 30);
  // 다른 요소의 세로 가운데(y=65)에 내 가운데를 맞춤
  n = { x: 5, y: 60.5 }; g = M.snapMove(n, 15, 10, [other]);
  assert.equal(n.y, 60); assert.equal(g.h, 65);
  // 허용오차(1.2) 밖
  n = { x: 17, y: 5.1 }; g = M.snapMove(n, 15, 10, [other]);
  assert.equal(n.x, 17); assert.equal(g.v, null);
  assert.equal(n.y, 5.1); assert.equal(g.h, null);
});

test("크기 조절: 모서리·가장자리, 최소 크기, 슬라이드 경계", () => {
  const s = { x: 20, y: 20, w: 30, h: 20 };
  assert.deepEqual(M.resizeBox(s, "se", 10, 5), { x: 20, y: 20, w: 40, h: 25 });
  assert.deepEqual(M.resizeBox(s, "nw", 5, 5), { x: 25, y: 25, w: 25, h: 15 });
  assert.deepEqual(M.resizeBox(s, "e", -100, 0), { x: 20, y: 20, w: M.MIN_PCT, h: 20 });
  assert.equal(M.resizeBox(s, "e", 500, 0).w, 80, "오른쪽 끝(100)을 넘지 않음");
});

test("크기 조절 Shift: 가로세로 비율 유지(모서리·가장자리), 경계 안에서", () => {
  const s = { x: 20, y: 20, w: 30, h: 15 }; // 비 2:1
  const r = M.resizeBox(s, "se", 10, 0, { keepAspect: true });
  assert.equal(r.w, 40); assert.equal(r.h, 20); assert.deepEqual([r.x, r.y], [20, 20]);
  const nw = M.resizeBox(s, "nw", -10, 0, { keepAspect: true });
  assert.equal(nw.w, 40); assert.equal(nw.h, 20);
  assert.equal(nw.x + nw.w, 50, "반대편(오른쪽) 가장자리 고정"); assert.equal(nw.y + nw.h, 35, "아래쪽 고정");
  const e = M.resizeBox(s, "e", 10, 0, { keepAspect: true });
  assert.ok(Math.abs(e.w / e.h - 2) < 1e-9);
  const s2 = M.resizeBox(s, "s", 10, 0, { keepAspect: false });
  assert.equal(s2.h, 15, "dy=0 이면 높이 그대로");
  const big = M.resizeBox(s, "se", 500, 500, { keepAspect: true });
  assert.ok(big.x + big.w <= 100 + 1e-9 && big.y + big.h <= 100 + 1e-9, "경계 안");
  assert.ok(Math.abs(big.w / big.h - 2) < 1e-9, "그래도 비율 유지");
  const tiny = M.resizeBox(s, "se", -500, -500, { keepAspect: true });
  assert.ok(tiny.w >= M.MIN_PCT - 1e-9 && tiny.h >= M.MIN_PCT - 1e-9);
});

test("회전: 위쪽이 0°, Shift 는 15° 단위", () => {
  assert.equal(M.rotationFromPoint(50, 50, 50, 0), 0);
  assert.equal(M.rotationFromPoint(50, 50, 100, 50), 90);
  assert.equal(M.rotationFromPoint(50, 50, 50, 100), 180);
  assert.equal(M.rotationFromPoint(50, 50, 0, 50), -90);
  assert.equal(M.rotationFromPoint(50, 50, 88, 3, { snap: true }) % 15, 0);
  assert.equal(M.snapAngle(22), 15);
  assert.equal(M.snapAngle(23), 30);
  assert.equal(M.snapAngle(-8), -15);
  assert.equal(M.snapAngle(-40), -45);
});

// ───────────── 키보드 처리(가짜 이벤트) ─────────────
const fakeRoot = () => { const root = { contains: n => n === root || n?.inStage }; return root; };
const keyEvt = (over = {}) => {
  const e = { key: "", code: "", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target: { closest: () => null, inStage: true }, prevented: false, preventDefault() { this.prevented = true; }, ...over };
  return e;
};
function setup(sel = "a", els = [{ id: "a", x: 10, y: 10, w: 20, h: 10 }, { id: "b", x: 50, y: 50, w: 20, h: 10 }]) {
  const calls = [];
  const rec = name => (...a) => calls.push([name, ...a]);
  return {
    calls, root: fakeRoot(),
    hooks: { getSelected: () => sel, getElements: () => els, onChange: rec("change"), onDelete: rec("delete"), onSelect: rec("select"), onCopy: rec("copy"), onCut: rec("cut"), onPaste: rec("paste"), onDuplicate: rec("dup"), onEdit: rec("edit") },
  };
}
globalThis.document ??= { body: {}, documentElement: {} };

test("키보드: 방향키 이동(0.5% / Shift 5%), 경계 클램프, Delete", () => {
  const { calls, root, hooks } = setup();
  assert.ok(handleEditorKey(keyEvt({ key: "ArrowRight" }), root, hooks));
  assert.deepEqual(calls.pop(), ["change", "a", { x: 10.5 }]);
  handleEditorKey(keyEvt({ key: "ArrowDown", shiftKey: true }), root, hooks);
  assert.deepEqual(calls.pop(), ["change", "a", { y: 15 }]);
  handleEditorKey(keyEvt({ key: "ArrowLeft", shiftKey: true }), root, hooks);
  assert.deepEqual(calls.pop(), ["change", "a", { x: 5 }]);
  handleEditorKey(keyEvt({ key: "Delete" }), root, hooks);
  assert.deepEqual(calls.pop(), ["delete", "a"]);
});

test("키보드: Ctrl+C/X/V/D 는 조합키·IME 상관없이 e.code 로, 입력칸 안에서는 가로채지 않음", () => {
  const { calls, root, hooks } = setup();
  const ctrl = code => keyEvt({ ctrlKey: true, code, key: "ㅊ" });
  for (const [code, name] of [["KeyC", "copy"], ["KeyX", "cut"], ["KeyD", "dup"]]) {
    const e = ctrl(code);
    assert.ok(handleEditorKey(e, root, hooks)); assert.ok(e.prevented);
    assert.deepEqual(calls.pop(), [name, "a"]);
  }
  handleEditorKey(ctrl("KeyV"), root, hooks);
  assert.deepEqual(calls.pop(), ["paste"]);
  const typing = { closest: sel => (/input/.test(sel) ? {} : null), inStage: false };
  const e = keyEvt({ ctrlKey: true, code: "KeyC", target: typing });
  assert.equal(handleEditorKey(e, root, hooks), false);
  assert.equal(e.prevented, false);
  assert.equal(calls.length, 0);
  const arrow = keyEvt({ key: "ArrowLeft", target: typing });
  assert.equal(handleEditorKey(arrow, root, hooks), false, "입력칸 안에서는 방향키도 그대로");
  // 선택이 없으면 복사·복제는 무시, 붙여넣기는 가능
  const none = setup(null);
  assert.equal(handleEditorKey(ctrl("KeyC"), none.root, none.hooks), false);
  assert.ok(handleEditorKey(ctrl("KeyV"), none.root, none.hooks));
});

test("키보드: Esc 선택 해제, Tab/Shift+Tab 순환(캔버스 안에서만), Enter 로 글자 편집", () => {
  const { calls, root, hooks } = setup("a");
  handleEditorKey(keyEvt({ key: "Escape" }), root, hooks);
  assert.deepEqual(calls.pop(), ["select", null]);
  handleEditorKey(keyEvt({ key: "Tab" }), root, hooks);
  assert.deepEqual(calls.pop(), ["select", "b"]);
  handleEditorKey(keyEvt({ key: "Tab", shiftKey: true }), root, hooks);
  assert.deepEqual(calls.pop(), ["select", "b"], "a 에서 Shift+Tab 은 마지막(b)으로");
  const outside = keyEvt({ key: "Tab", target: { closest: () => null, inStage: false } });
  assert.equal(handleEditorKey(outside, root, hooks), false, "캔버스 밖 Tab 은 브라우저 기본 동작");
  assert.equal(outside.prevented, false);
  handleEditorKey(keyEvt({ key: "Enter" }), root, hooks);
  assert.deepEqual(calls.pop(), ["edit", "a"]);
  const noSel = setup(null);
  assert.equal(handleEditorKey(keyEvt({ key: "Escape" }), noSel.root, noSel.hooks), false);
});
