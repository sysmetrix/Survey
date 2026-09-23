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

const { buildSession, touchActivity, isIdleTimedOut, IDLE_MS, getSession, clearSession, login, refreshIfNeeded } = await import("../../js/auth/session.js");

/** login() 이 쓰는 3개 엔드포인트(토큰·프로필·로그인 기록)에 맞춰 응답을 만들어주는 목(mock) fetch */
function mockAuthFetch({ refreshToken = "at2" } = {}) {
  const calls = [];
  const fn = async url => {
    const u = String(url);
    calls.push(u);
    let data;
    if (u.includes("/auth/v1/token?grant_type=password")) data = { access_token: "at1", refresh_token: "rt1", expires_in: 3600, user: { id: "u1", email: "a@b.com" } };
    else if (u.includes("/rest/v1/profiles")) data = [{ role: "admin", is_active: true }];
    else if (u.includes("/rest/v1/rpc/log_login")) data = null;
    else if (u.includes("/auth/v1/token?grant_type=refresh_token")) data = { access_token: refreshToken, refresh_token: "rt2", expires_in: 3600, user: { id: "u1", email: "a@b.com" } };
    return { ok: true, status: 200, json: async () => data };
  };
  fn.calls = calls;
  return fn;
}

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

test("refreshIfNeeded: 만료가 임박했을 때만 갱신하고, 갱신 뒤에도 role 을 잃지 않음", async () => {
  // 실제로 관리자가 몇 시간 관리자 화면에 머물다 JWT(기본 1시간)가 만료되면서 겪은 버그:
  // 토큰 갱신 응답(authRequest)에는 role 이 없다(로그인 때 프로필 조회로 따로 붙이는 값이라) —
  // buildSession() 을 그대로 새 세션으로 썼더니 갱신 직후 "관리자만 접근할 수 있습니다"로 튕겨나갔다.
  const realFetch = globalThis.fetch;
  const mock = mockAuthFetch();
  globalThis.fetch = mock;
  try {
    await login("a@b.com", "pw", false);
    assert.equal(getSession().role, "admin");
    assert.equal(getSession().access_token, "at1");

    // 아직 만료가 임박하지 않았으면 네트워크를 타지 않고 그대로 반환
    const before = mock.calls.length;
    const same = await refreshIfNeeded();
    assert.equal(same.access_token, "at1");
    assert.equal(mock.calls.length, before, "만료 임박 전에는 갱신 요청을 보내지 않아야 함");

    // getSession() 이 내부 상태(mem)를 그대로 참조로 돌려주는 점을 이용해 만료 임박 상태를 흉내냄
    getSession().expires_at = Date.now() - 1000;
    const refreshed = await refreshIfNeeded();
    assert.equal(refreshed.access_token, "at2"); // 새 토큰으로 교체됨
    assert.equal(refreshed.role, "admin"); // role 은 그대로 유지됨(핵심 회귀 확인)
    assert.equal(getSession().access_token, "at2");
  } finally { globalThis.fetch = realFetch; clearSession(); }
});

test("refreshIfNeeded: 동시에 여러 번 불러도 갱신 요청은 한 번만 나감(같은 refresh_token 중복 교환 방지)", async () => {
  const realFetch = globalThis.fetch;
  let refreshCalls = 0;
  let resolveRefresh;
  const gate = new Promise(r => { resolveRefresh = r; });
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.includes("/auth/v1/token?grant_type=password")) return { ok: true, status: 200, json: async () => ({ access_token: "at1", refresh_token: "rt1", expires_in: 3600, user: { id: "u1", email: "a@b.com" } }) };
    if (u.includes("/rest/v1/profiles")) return { ok: true, status: 200, json: async () => [{ role: "admin", is_active: true }] };
    if (u.includes("/rest/v1/rpc/log_login")) return { ok: true, status: 200, json: async () => null };
    if (u.includes("/auth/v1/token?grant_type=refresh_token")) {
      refreshCalls++;
      await gate; // 여러 refreshIfNeeded() 호출이 다 걸릴 때까지 기다렸다가 한꺼번에 풀어줌
      return { ok: true, status: 200, json: async () => ({ access_token: "at2", refresh_token: "rt2", expires_in: 3600, user: { id: "u1", email: "a@b.com" } }) };
    }
    throw new Error("unexpected url: " + u);
  };
  try {
    await login("a@b.com", "pw", false);
    getSession().expires_at = Date.now() - 1000;
    const p1 = refreshIfNeeded(), p2 = refreshIfNeeded(), p3 = refreshIfNeeded();
    resolveRefresh();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    assert.equal(refreshCalls, 1, "동시 호출이어도 실제 refresh_token 교환은 1회만");
    assert.equal(r1.access_token, "at2"); assert.equal(r2.access_token, "at2"); assert.equal(r3.access_token, "at2");
  } finally { globalThis.fetch = realFetch; clearSession(); }
});
