// 기능 플래그 게이팅: 관리자는 항상 미리보기, 일반 이용자는 서버 값(enabled)에 따름
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

const { clearSession } = await import("../../js/auth/session.js");
const { isFeatureOn, _resetForTest, _setForTest } = await import("../../js/admin/flags-client.js");

test.beforeEach(() => { clearSession(); _resetForTest(); });

test("서버 값을 못 받아왔으면(캐시 없음) 일반 이용자에게는 꺼짐(안전한 기본값)", () => {
  assert.equal(isFeatureOn("smallSampleWarning"), false);
});

test("서버에서 enabled=false로 받아온 기능은 일반 이용자에게 안 보임", () => {
  _setForTest({ smallSampleWarning: false });
  assert.equal(isFeatureOn("smallSampleWarning"), false);
});

test("서버에서 enabled=true(전체 공개)로 받아온 기능은 일반 이용자에게도 보임", () => {
  _setForTest({ smallSampleWarning: true });
  assert.equal(isFeatureOn("smallSampleWarning"), true);
});

test("관리자로 로그인된 브라우저는 서버 값이 꺼져 있어도(캐시 없어도) 항상 미리보기", () => {
  localStorage.setItem("survey-v5-session", JSON.stringify({
    access_token: "at", refresh_token: "rt", expires_at: Date.now() + 3600000,
    user: { id: "u1", email: "a@b.com" }, remember: true, role: "admin",
  }));
  assert.equal(isFeatureOn("kpiTargetAdequacy"), true);
});
