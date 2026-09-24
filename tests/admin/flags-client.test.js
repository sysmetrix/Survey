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
const { isFeatureOn, isAdminPreview, _resetForTest, _setForTest } = await import("../../js/admin/flags-client.js");

test.beforeEach(() => { clearSession(); _resetForTest(); });
test("검증 중 기능은 스위치로 공개할 수 있고 미구현 기능은 관리자도 사용할 수 없다", () => {
  _setForTest({ guidedKpiSetup: true, ageSurveyTemplates: true });
  assert.equal(isFeatureOn("guidedKpiSetup"), true);
  localStorage.setItem("survey-v5-session", JSON.stringify({ access_token:"at",expires_at:Date.now()+3600000,role:"admin",user:{id:"u"} }));
  assert.equal(isFeatureOn("guidedKpiSetup"), true);
  assert.equal(isFeatureOn("ageSurveyTemplates"), false);
  clearSession();
  assert.equal(isFeatureOn("guidedKpiSetup"), true, "전체 공개된 검증 기능은 로그아웃 뒤에도 유지");
});

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

test("isAdminPreview: 일반 이용자에게는 항상 false(관리자 미리보기 표시는 관리자에게만 필요)", () => {
  assert.equal(isAdminPreview("kpiTargetAdequacy"), false);
  _setForTest({ kpiTargetAdequacy: true });
  assert.equal(isAdminPreview("kpiTargetAdequacy"), false);
});

test("isAdminPreview: 관리자는 아직 전체 공개(enabled)가 아닌 기능만 미리보기로 표시", () => {
  localStorage.setItem("survey-v5-session", JSON.stringify({
    access_token: "at", refresh_token: "rt", expires_at: Date.now() + 3600000,
    user: { id: "u1", email: "a@b.com" }, remember: true, role: "admin",
  }));
  assert.equal(isAdminPreview("kpiTargetAdequacy"), true, "캐시가 없으면(서버값 모름) 미리보기로 표시");
  _setForTest({ kpiTargetAdequacy: false });
  assert.equal(isAdminPreview("kpiTargetAdequacy"), true, "명시적으로 꺼져 있으면 미리보기");
  _setForTest({ kpiTargetAdequacy: true });
  assert.equal(isAdminPreview("kpiTargetAdequacy"), false, "이미 전체 공개면 미리보기 표시 불필요");
});

test("preview 상태 기능도 서버 스위치를 켜면 일반 사용자에게 작동한다", () => {
  _setForTest({ referenceEvidence: true, operationalUsageStats: true });
  assert.equal(isFeatureOn("referenceEvidence"), true);
  assert.equal(isFeatureOn("operationalUsageStats"), true);
});
