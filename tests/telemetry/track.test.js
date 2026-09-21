// 익명 사용 이벤트 계측: allow-list 정화 · 배치 전송 · 등록 안 된 이벤트 드롭
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeExtra, initTelemetry, trackEvent, flush } from "../../js/telemetry/track.js";

test("sanitizeExtra: 허용된 키는 그대로 남는다", () => {
  assert.deepEqual(sanitizeExtra("sample_load", { file: "a.csv" }), { file: "a.csv" });
});

test("sanitizeExtra: extra 가 없는 이벤트(view_enter 등)는 항상 undefined", () => {
  assert.equal(sanitizeExtra("view_enter", { view: "load" }), undefined);
});

test("sanitizeExtra: 등록 안 된 이벤트는 무조건 undefined", () => {
  assert.equal(sanitizeExtra("not_registered", { file: "a.csv" }), undefined);
});

test("sanitizeExtra: 허용 키라도 40자 넘는 문자열은 버림(빈 결과면 undefined)", () => {
  const long = "x".repeat(41);
  assert.equal(sanitizeExtra("sample_load", { file: long }), undefined);
  assert.deepEqual(sanitizeExtra("sample_load", { file: "x".repeat(40) }), { file: "x".repeat(40) });
});

test("sanitizeExtra: 허용 목록에 없는 키는 섞여 들어가지 않는다(설문 내용 유출 방지 장치)", () => {
  const out = sanitizeExtra("sample_load", { file: "a.csv", surveyAnswer: "응답 내용" });
  assert.deepEqual(out, { file: "a.csv" });
  assert.equal("surveyAnswer" in out, false);
});

test("trackEvent + flush: 등록된 이벤트만 배치로 전송된다", async () => {
  const sent = [];
  initTelemetry({ version: "test-1", send: events => { sent.push(...events); } });
  trackEvent("load", "view_enter");
  trackEvent("load", "sample_load", { file: "구글폼.csv" });
  trackEvent("load", "unknown_event"); // 등록 안 됨 — 큐에 들어가지 않아야 함
  await flush();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].view, "load");
  assert.equal(sent[0].event, "view_enter");
  assert.equal(sent[0].app_version, "test-1");
  assert.equal(typeof sent[0].anon_id, "string");
  assert.equal(sent[1].extra.file, "구글폼.csv");
});

test("flush: 전송 실패해도 예외를 던지지 않고 큐를 비운다(재시도로 무한히 쌓이지 않음)", async () => {
  initTelemetry({ version: "test-2", send: () => { throw new Error("network down"); } });
  trackEvent("report", "export_hwpx");
  await assert.doesNotReject(flush());
});

test("trackEvent: 배치가 20개를 채우면 flush 를 기다리지 않고 자동 전송된다", async () => {
  const sent = [];
  initTelemetry({ version: "test-3", send: events => { sent.push(...events); } });
  for (let i = 0; i < 20; i++) trackEvent("dash", "view_enter");
  // trackEvent 내부에서 MAX_BATCH 도달 시 flush() 를 이미 호출(await 없이) — 다음 microtask 까지 양보
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(sent.length, 20);
});
