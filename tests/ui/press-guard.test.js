// 누르는 동안 다시 그리기 미루기 — 글자 편집 중 다른 요소·단추를 한 번 눌러도 동작하도록(Node — 타이머 주입)
import test from "node:test";
import assert from "node:assert/strict";
import { createPressGuard } from "../../js/ui/press-guard.js";

const setup = () => {
  const timers = [];
  let runs = 0;
  const g = createPressGuard(() => { runs += 1; }, { setTimer: fn => timers.push(fn) });
  return { g, timers, runs: () => runs, flush: () => timers.splice(0).forEach(fn => fn()) };
};

test("누르고 있지 않으면 요청 즉시 실행", () => {
  const { g, runs } = setup();
  g.request();
  assert.equal(runs(), 1);
});

test("누르는 중의 요청은 미뤘다가 손 뗀 뒤(타이머)에 한 번만 실행", () => {
  const { g, timers, runs, flush } = setup();
  g.press();
  g.request(); g.request();
  assert.equal(runs(), 0, "누르는 동안에는 다시 그리지 않음(누른 요소가 사라지면 클릭이 안 됨)");
  assert.equal(g.pending, true);
  g.release();
  assert.equal(runs(), 0, "손 뗀 즉시가 아니라 클릭 이벤트가 지나간 뒤");
  assert.equal(timers.length, 1);
  flush();
  assert.equal(runs(), 1);
  assert.equal(g.pending, false);
});

test("요청이 없었으면 손을 떼도 아무것도 하지 않음", () => {
  const { g, timers, runs } = setup();
  g.press(); g.release();
  assert.equal(timers.length, 0);
  assert.equal(runs(), 0);
});

test("손 뗀 뒤의 새 요청은 다시 즉시 실행", () => {
  const { g, runs, flush } = setup();
  g.press(); g.request(); g.release(); flush();
  assert.equal(runs(), 1);
  g.request();
  assert.equal(runs(), 2);
});
