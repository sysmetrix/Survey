// 로그인 화면: 인라인 핸들러 없음(CSP) · 이메일/비밀번호 입력 · data-act 훅 보존
import test from "node:test";
import assert from "node:assert/strict";
import * as login from "../../js/ui/views/login.js";

test("로그인 화면: 기본 렌더", () => {
  const html = login.render();
  assert.doesNotMatch(html, /\son(click|change|input|submit|load|error|mouse\w+|key\w+)\s*=|javascript:/i, "인라인 핸들러 금지(CSP)");
  assert.match(html, /<input class="in" type="email" id="loginEmail"/);
  assert.match(html, /<input class="in" type="password" id="loginPassword"/);
  assert.match(html, /data-act="login-submit"/);
  assert.doesNotMatch(html, /undefined|\[object Object\]/);
});

test("로그인 화면: actions 에 login-submit 훅이 있다", () => {
  assert.equal(typeof login.actions["login-submit"], "function");
});
