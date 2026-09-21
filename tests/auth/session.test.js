// 로그인 세션: 서버 응답 → 세션 변환, 유휴 타임아웃 계산, "기기 기억하기" 저장소 분기
// Node 에는 기본 localStorage/sessionStorage 가 없어 이 파일에서만 최소 메모리 폴리필을 둔다.
import test from "node:test";
import assert from "node:assert/strict";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
  };
}
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();

const { buildSession, touchActivity, isIdleTimedOut, IDLE_MS, getSession, clearSession } = await import("../../js/auth/session.js");

test("buildSession: 서버 응답을 로컬 세션 형태로 변환", () => {
  const res = { access_token: "at", refresh_token: "rt", expires_in: 3600, user: { id: "u1", email: "a@b.com" } };
  const before = Date.now();
  const s = buildSession(res, true);
  assert.equal(s.access_token, "at");
  assert.equal(s.refresh_token, "rt");
  assert.equal(s.remember, true);
  assert.deepEqual(s.user, { id: "u1", email: "a@b.com" });
  assert.ok(s.expires_at >= before + 3600 * 1000);
});

test("buildSession: expires_in 이 없으면 1시간 기본값", () => {
  const s = buildSession({ access_token: "at", refresh_token: "rt", user: {} }, false);
  assert.ok(s.expires_at - Date.now() > 3500 * 1000);
  assert.equal(s.remember, false);
});

test("isIdleTimedOut: 방금 활동했으면 false, 시간을 앞으로 돌리면 true", () => {
  touchActivity();
  assert.equal(isIdleTimedOut(), false);
  const realNow = Date.now;
  Date.now = () => realNow() + IDLE_MS + 1000;
  try { assert.equal(isIdleTimedOut(), true); }
  finally { Date.now = realNow; }
});

test("getSession: 세션이 없으면 null", () => {
  clearSession();
  assert.equal(getSession(), null);
});
