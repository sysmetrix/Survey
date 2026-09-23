// 익명 사용 이벤트 계측: allow-list 정화 · 배치 전송 · 등록 안 된 이벤트 드롭 · 기기·브라우저 분류
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeExtra, initTelemetry, trackEvent, flush, classifyUserAgent } from "../../js/telemetry/track.js";

const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  edgeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  firefoxWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  chromeAndroidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  chromeAndroidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  safariIpadOld: "Mozilla/5.0 (iPad; CPU OS 13_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Mobile/15E148 Safari/604.1",
  samsungPhone: "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
};

test("classifyUserAgent: 데스크톱 3대 브라우저(Chrome·Edge·Firefox)는 PC로, 정확한 이름으로 분류", () => {
  assert.deepEqual(classifyUserAgent(UA.chromeWin), { device: "PC", browser: "Chrome" });
  assert.deepEqual(classifyUserAgent(UA.edgeWin), { device: "PC", browser: "Edge" }); // Chrome/ 토큰도 있지만 Edg/ 를 먼저 확인
  assert.deepEqual(classifyUserAgent(UA.firefoxWin), { device: "PC", browser: "Firefox" });
});

test("classifyUserAgent: 진짜 Safari(Version/ 토큰 있음)만 Safari로, 나머지는 Safari/ 토큰이 있어도 아님", () => {
  assert.deepEqual(classifyUserAgent(UA.safariMac), { device: "PC", browser: "Safari" });
  assert.equal(classifyUserAgent(UA.chromeWin).browser, "Chrome"); // Safari/537.36 토큰이 있어도 Version/ 이 없어 Chrome으로 남음
});

test("classifyUserAgent: 폰은 모바일, Android 인데 Mobile 토큰이 없으면 태블릿, iPad는 명시돼 있으면 태블릿", () => {
  assert.deepEqual(classifyUserAgent(UA.chromeAndroidPhone), { device: "모바일", browser: "Chrome" });
  assert.deepEqual(classifyUserAgent(UA.chromeAndroidTablet), { device: "태블릿", browser: "Chrome" });
  assert.deepEqual(classifyUserAgent(UA.safariIphone), { device: "모바일", browser: "Safari" });
  assert.deepEqual(classifyUserAgent(UA.safariIpadOld), { device: "태블릿", browser: "Safari" });
});

test("classifyUserAgent: 삼성 인터넷은 Chrome/ 토큰을 같이 갖고 있어도 삼성 인터넷으로 분류", () => {
  assert.deepEqual(classifyUserAgent(UA.samsungPhone), { device: "모바일", browser: "삼성 인터넷" });
});

test("classifyUserAgent: 빈 값·낯선 UA 는 예외 없이 PC·기타로", () => {
  assert.deepEqual(classifyUserAgent(""), { device: "PC", browser: "기타" });
  assert.deepEqual(classifyUserAgent(undefined), { device: "PC", browser: "기타" });
});

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
