// 관리자 '사용 통계' 탭 — 순수 계산 함수(기간 분리·증감률·퍼널 전환율·일별 추이)
import test from "node:test";
import assert from "node:assert/strict";
import { periodWindow, splitByPeriod, totalsBy, deltaPct, kpiTiles, funnelSteps, biggestDropStep, dailyVisitTrend } from "../../js/ui/views/admin/stats.js";

test("periodWindow: 이번 기간·직전 기간 시작일을 오늘 기준으로 계산", () => {
  const today = new Date("2026-09-30T15:00:00Z");
  const w = periodWindow(30, today);
  assert.equal(w.curStart, "2026-09-01"); // 오늘 포함 30일 전
  assert.equal(w.prevStart, "2026-08-02"); // 그 직전 30일
  assert.equal(w.fetchFrom, w.prevStart);
});

test("splitByPeriod: day 기준으로 이번/직전 기간 행을 정확히 나눔(경계 포함)", () => {
  const rows = [{ day: "2026-08-31" }, { day: "2026-09-01" }, { day: "2026-09-15" }];
  const { cur, prev } = splitByPeriod(rows, "2026-09-01");
  assert.deepEqual(cur.map(r => r.day), ["2026-09-01", "2026-09-15"]);
  assert.deepEqual(prev.map(r => r.day), ["2026-08-31"]);
});

test("deltaPct: 직전 값이 0이면 비교 불가(null), 아니면 반올림된 증감률", () => {
  assert.equal(deltaPct(15, 10), 50);
  assert.equal(deltaPct(5, 10), -50);
  assert.equal(deltaPct(10, 0), null);
  assert.equal(deltaPct(0, 0), null);
});

test("kpiTiles: 방문·도달률·내보내기·오류율 네 타일 + 직전 기간 대비 증감", () => {
  const cur = totalsBy([
    { view: "load", event: "view_enter", count: 100, distinct_sessions: 100 },
    { view: "report", event: "view_enter", count: 40, distinct_sessions: 40 },
    { view: "report", event: "export_hwpx", count: 20, distinct_sessions: 20 },
    { view: "present", event: "export_pptx", count: 5, distinct_sessions: 5 },
    { view: "load", event: "js_error", count: 2, distinct_sessions: 2 },
  ]);
  const prev = totalsBy([
    { view: "load", event: "view_enter", count: 80, distinct_sessions: 80 },
    { view: "report", event: "view_enter", count: 20, distinct_sessions: 20 },
    { view: "report", event: "export_hwpx", count: 10, distinct_sessions: 10 },
  ]);
  const tiles = kpiTiles(cur, prev);
  assert.equal(tiles[0].n, "100"); // 방문 세션
  assert.equal(tiles[0].delta, 25); // 80→100
  assert.equal(tiles[1].n, "40%"); // 도달률 40/100
  assert.equal(tiles[1].delta, 15); // 40% - 25%(20/80)
  assert.equal(tiles[2].n, "25"); // 내보내기 20+5
  assert.equal(tiles[2].sub, "HWPX 20 · PPTX 5");
  assert.equal(tiles[3].n, "2%"); // 오류율 2/100
  assert.equal(tiles[3].kind, "bad");
});

test("kpiTiles: 오류 발생률 증감이 나눗셈 부동소수점 오차 없이 깔끔한 값으로 나옴", () => {
  // 21/1000(=2.1%) - 19/1000(=1.9%) 는 JS 로 그대로 빼면 0.20000000000000018 이 나오는 전형적인 부동소수점 함정
  const cur = totalsBy([{ view: "load", event: "view_enter", count: 1000, distinct_sessions: 1000 }, { view: "load", event: "js_error", count: 21, distinct_sessions: 21 }]);
  const prev = totalsBy([{ view: "load", event: "view_enter", count: 1000, distinct_sessions: 1000 }, { view: "load", event: "js_error", count: 19, distinct_sessions: 19 }]);
  const tiles = kpiTiles(cur, prev);
  assert.equal(tiles[3].delta, 0.2, "0.20000000000000018 같은 부동소수점 부스러기 없이 정확히 0.2");
});

test("funnelSteps: 단계별 세션 + 전 단계 대비 전환율(첫 단계는 null)", () => {
  const totals = totalsBy([
    { view: "load", event: "view_enter", count: 100, distinct_sessions: 100 },
    { view: "setup", event: "view_enter", count: 80, distinct_sessions: 80 },
    { view: "business", event: "view_enter", count: 40, distinct_sessions: 40 },
  ]);
  const steps = funnelSteps(totals);
  assert.equal(steps[0].pct, null);
  assert.equal(steps[1].value, 80);
  assert.equal(steps[1].pct, 80); // 80/100
  assert.equal(steps[2].pct, 50); // 40/80
  assert.equal(steps[3].value, 0); // 방문 기록 없는 단계는 0(에러 아님)
});

test("biggestDropStep: 전환율이 가장 낮은 구간을 찾고, 값이 0인 구간은 건너뜀(0으로 나누기 방지)", () => {
  const totals = totalsBy([
    { view: "load", event: "view_enter", count: 100, distinct_sessions: 100 },
    { view: "setup", event: "view_enter", count: 90, distinct_sessions: 90 },
    { view: "business", event: "view_enter", count: 20, distinct_sessions: 20 }, // 여기서 가장 많이 샘
    { view: "dash", event: "view_enter", count: 18, distinct_sessions: 18 },
    { view: "report", event: "view_enter", count: 17, distinct_sessions: 17 },
    { view: "present", event: "view_enter", count: 16, distinct_sessions: 16 },
  ]);
  const drop = biggestDropStep(funnelSteps(totals));
  assert.equal(drop.from, "2 데이터 설정");
  assert.equal(drop.to, "3 성과지표");
  assert.equal(drop.pct, 22); // 20/90 반올림
});

test("biggestDropStep: 도달 기록이 전혀 없으면 null", () => {
  assert.equal(biggestDropStep(funnelSteps({})), null);
});

test("funnelSteps·biggestDropStep: '건너뛰고 분석 결과 보기'로 전환율이 100%를 넘어도 새는 구간으로 취급하지 않음", () => {
  const totals = totalsBy([
    { view: "load", event: "view_enter", count: 100, distinct_sessions: 100 },
    { view: "setup", event: "view_enter", count: 90, distinct_sessions: 90 },
    { view: "business", event: "view_enter", count: 20, distinct_sessions: 20 }, // 진짜 이탈 구간
    { view: "dash", event: "view_enter", count: 60, distinct_sessions: 60 }, // 성과지표 건너뛰고 바로 옴 → 전 단계보다 많음
    { view: "report", event: "view_enter", count: 30, distinct_sessions: 30 },
    { view: "present", event: "view_enter", count: 20, distinct_sessions: 20 },
  ]);
  const steps = funnelSteps(totals);
  assert.equal(steps[3].pct, 300); // 60/20 — raw 값은 그대로 정확히 계산(화면 문구만 다르게 표현)
  const drop = biggestDropStep(steps);
  assert.equal(drop.from, "2 데이터 설정"); // 300%짜리(4단계)가 아니라 진짜 이탈 구간(3단계)을 가리켜야 함
  assert.equal(drop.to, "3 성과지표");
});

test("dailyVisitTrend: 선택 기간의 모든 날짜를 빠짐없이 0으로 채우고, load·view_enter만 집계", () => {
  const rows = [
    { day: "2026-09-01", view: "load", event: "view_enter", distinct_sessions: 5 },
    { day: "2026-09-03", view: "load", event: "view_enter", distinct_sessions: 3 },
    { day: "2026-09-01", view: "load", event: "sample_load", distinct_sessions: 99 }, // 다른 이벤트는 제외
  ];
  const trend = dailyVisitTrend(rows, "2026-09-01");
  const byDay = Object.fromEntries(trend.map(t => [t.day, t.value]));
  assert.equal(byDay["2026-09-01"], 5);
  assert.equal(byDay["2026-09-02"], 0); // 빈 날짜도 0으로 채워짐(그래프가 끊기지 않게)
  assert.equal(byDay["2026-09-03"], 3);
});
