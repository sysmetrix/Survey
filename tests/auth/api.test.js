// Supabase REST 래퍼: 로그인 세션(JWT)이 요청 중간에 만료됐을 때 한 번만 자동 갱신·재시도하는지 확인.
// (js/auth/session.js 의 installTokenRefresh() 가 setUnauthorizedHandler() 로 실제 갱신 로직을 꽂아 넣는다 —
// 여기서는 api.js 만 떼어 내 핸들러를 목(mock)으로 넣고 재시도 규칙만 검증한다.)
import test from "node:test";
import assert from "node:assert/strict";
import { restRequest, setUnauthorizedHandler } from "../../js/auth/api.js";

test("restRequest: 401을 만나면 handler 로 한 번 갱신해 새 토큰으로 재시도함", async () => {
  const realFetch = globalThis.fetch;
  const tokensUsed = [];
  globalThis.fetch = async (_url, opts) => {
    tokensUsed.push(opts.headers.Authorization);
    if (opts.headers.Authorization === "Bearer old") return { ok: false, status: 401, json: async () => ({ message: "JWT expired" }) };
    return { ok: true, status: 200, json: async () => ({ done: true }) };
  };
  setUnauthorizedHandler(async () => "new");
  try {
    const res = await restRequest("/some_view", { token: "old" });
    assert.deepEqual(res, { done: true });
    assert.deepEqual(tokensUsed, ["Bearer old", "Bearer new"]);
  } finally { globalThis.fetch = realFetch; setUnauthorizedHandler(null); }
});

test("restRequest: 갱신도 실패하면(재로그인 필요) 원래 오류를 그대로 던지고, 두 번 재시도하지 않음", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 401, json: async () => ({ message: "JWT expired" }) }; };
  setUnauthorizedHandler(async () => null);
  try {
    await assert.rejects(() => restRequest("/some_view", { token: "old" }), /JWT expired/);
    assert.equal(calls, 1, "갱신 핸들러가 실패를 알려주면(null) 재시도하지 않아야 함");
  } finally { globalThis.fetch = realFetch; setUnauthorizedHandler(null); }
});

test("restRequest: token 없이 보낸 요청(비로그인용 anon 키)은 401 이어도 갱신을 시도하지 않음", async () => {
  const realFetch = globalThis.fetch;
  let handlerCalls = 0;
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: "권한 없음" }) });
  setUnauthorizedHandler(async () => { handlerCalls++; return "x"; });
  try {
    await assert.rejects(() => restRequest("/some_view"), /권한 없음/);
    assert.equal(handlerCalls, 0, "인증 토큰 없는 요청은 세션 갱신 대상이 아님");
  } finally { globalThis.fetch = realFetch; setUnauthorizedHandler(null); }
});
