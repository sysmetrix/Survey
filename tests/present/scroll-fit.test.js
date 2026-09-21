// 슬라이드 편집 화면의 스크롤 기억·높이 계산 (순수 함수)
import test from "node:test";
import assert from "node:assert/strict";
import { clampScroll, revealScrollTop, fitLayoutHeight, createScrollMemory } from "../../js/present/edit/scroll-fit.js";

test("clampScroll: 0 ~ (내용 − 보이는 높이) 안으로", () => {
  assert.equal(clampScroll(-5, 1000, 400), 0);
  assert.equal(clampScroll(300, 1000, 400), 300);
  assert.equal(clampScroll(900, 1000, 400), 600);
  assert.equal(clampScroll(50, 300, 400), 0, "내용이 더 짧으면 0");
  assert.equal(clampScroll("x", 1000, 400), 0, "숫자가 아니면 0");
});

test("revealScrollTop: 이미 보이는 칸이면 scrollTop 을 그대로 둔다(맨 위로 튀지 않음)", () => {
  const base = { scrollTop: 600, viewH: 500, contentH: 2000, itemH: 120 };
  assert.equal(revealScrollTop({ ...base, itemTop: 700 }), 600);
  assert.equal(revealScrollTop({ ...base, itemTop: 608 }), 600, "여백(8)에 딱 맞으면 그대로");
  assert.equal(revealScrollTop({ ...base, itemTop: 1100 - 120 - 8 }), 600, "아래 여백에 딱 맞으면 그대로");
});

test("revealScrollTop: 벗어난 칸만 가장 적게 굴려 보이게", () => {
  const base = { scrollTop: 600, viewH: 500, contentH: 2000, itemH: 120 };
  assert.equal(revealScrollTop({ ...base, itemTop: 500 }), 492, "위로 벗어남 → 칸 윗머리(−여백)");
  assert.equal(revealScrollTop({ ...base, itemTop: 1200 }), 1200 + 120 + 8 - 500, "아래로 벗어남 → 칸 아랫단(+여백)");
  assert.equal(revealScrollTop({ ...base, itemTop: 1990, itemH: 60 }), 1500, "맨 끝은 내용 끝에서 멈춤");
  assert.equal(revealScrollTop({ ...base, scrollTop: 0, itemTop: 2 }), 0, "맨 위 칸은 0 을 넘어 내려가지 않음");
});

test("revealScrollTop: 칸이 목록보다 크거나 보이는 높이가 0 이면 안전하게", () => {
  assert.equal(revealScrollTop({ scrollTop: 0, viewH: 100, contentH: 1000, itemTop: 300, itemH: 400 }), 292);
  assert.equal(revealScrollTop({ scrollTop: 40, viewH: 0, contentH: 1000, itemTop: 300, itemH: 100 }), 40);
  assert.equal(revealScrollTop({ scrollTop: 250, viewH: 400, itemTop: 900, itemH: 100 }), 900 + 100 + 8 - 400, "contentH 를 모르면 위쪽만 0 으로 자름");
});

test("fitLayoutHeight: 창 높이에서 위·아래를 뺀 값, 너무 작으면 최소값", () => {
  assert.equal(fitLayoutHeight({ innerH: 1032, top: 290, below: 16 }), 726);
  assert.equal(fitLayoutHeight({ innerH: 720, top: 275, below: 16 }), 429);
  assert.equal(fitLayoutHeight({ innerH: 500, top: 275, below: 16 }), 320, "최소 320");
  assert.equal(fitLayoutHeight({ innerH: 500, top: 275, below: 16, min: 200 }), 209);
  assert.equal(fitLayoutHeight({ innerH: 1000.7, top: 300.2 }), 700, "소수는 내림");
  assert.equal(fitLayoutHeight({ innerH: NaN, top: 0 }), 320);
});

test("createScrollMemory: 같은 대상은 위치를 기억하고, 대상이 바뀌면 0 부터", () => {
  const mem = createScrollMemory();
  assert.equal(mem.recall("props", "a|"), 0, "처음엔 0");
  mem.save("props", 130);
  assert.equal(mem.recall("props", "a|"), 130, "같은 슬라이드·요소를 다시 그리면 복원");
  assert.equal(mem.recall("props", "a|el1"), 0, "다른 요소를 고르면 맨 위부터");
  mem.save("props", 40);
  assert.equal(mem.recall("props", "a|el1"), 40);
  // 목록 스크롤은 key 가 없어 화면을 다시 그려도 계속 유지
  mem.save("thumbs", 603);
  assert.equal(mem.recall("thumbs"), 0, "첫 recall 은 key 를 등록하며 0");
  mem.save("thumbs", 603);
  assert.equal(mem.recall("thumbs"), 603);
  assert.equal(mem.recall("thumbs"), 603);
  mem.save("thumbs", -20);
  assert.equal(mem.recall("thumbs"), 0, "음수는 0");
  mem.reset("thumbs");
  assert.equal(mem.recall("thumbs"), 0);
});
