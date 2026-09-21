// 로그인 화면 — 관리자 전용(#/login 을 직접 입력해야만 열리는 별도 경로). 일반 이용에는 로그인이 필요 없다.
// 실제 자격 검증은 서버(Supabase Auth)가 함
import { esc } from "../util.js";
import { icon } from "../icons.js";
import { login, isConfigured } from "../../auth/session.js";
import { refresh, go } from "../router.js";

let busy = false;
let errorMsg = "";

// Supabase Auth 가 돌려주는 영어 오류 문구 중 자주 보일 것만 한국어로 다듬음(그 밖엔 원문 그대로 표시)
const KOREAN_ERR = {
  "Invalid login credentials": "이메일 또는 비밀번호가 올바르지 않습니다",
  "Email not confirmed": "이메일 인증이 끝나지 않은 계정입니다. 관리자에게 문의하세요",
  "User not found": "등록되지 않은 계정입니다. 관리자에게 문의하세요",
};

export function render() {
  return `<div class="login-stage">
    <section class="login-card card">
      <div class="login-brand">${icon("lock", 24)}<h1>관리자 로그인</h1></div>
      <p class="small muted">일반 이용에는 로그인이 필요 없습니다. 이 화면은 관리자 전용입니다.</p>
      ${!isConfigured() ? `<p class="hint bad">백엔드가 아직 설정되지 않았습니다.</p>` : ""}
      ${errorMsg ? `<p class="hint bad" role="alert">${esc(errorMsg)}</p>` : ""}
      <label class="field">이메일<input class="in" type="email" id="loginEmail" autocomplete="username" ${busy ? "disabled" : ""}></label>
      <label class="field">비밀번호<input class="in" type="password" id="loginPassword" autocomplete="current-password" ${busy ? "disabled" : ""}></label>
      <label class="check"><input type="checkbox" id="loginRemember" ${busy ? "disabled" : ""}> 이 기기 기억하기(최대 30일)</label>
      <button class="btn primary block" data-act="login-submit" ${busy ? "disabled" : ""}>${busy ? "로그인 중…" : "로그인"}</button>
    </section>
  </div>`;
}

export function onKey(e) {
  if (e.key === "Enter" && (e.target.id === "loginEmail" || e.target.id === "loginPassword")) {
    e.preventDefault();
    submit();
  }
}

async function submit() {
  if (busy) return;
  const email = document.getElementById("loginEmail")?.value.trim() || "";
  const password = document.getElementById("loginPassword")?.value || "";
  const remember = !!document.getElementById("loginRemember")?.checked;
  if (!email || !password) { errorMsg = "이메일과 비밀번호를 입력하세요"; refresh(); return; }
  busy = true; errorMsg = ""; refresh();
  try {
    await login(email, password, remember);
    busy = false;
    go("load");
  } catch (e) {
    busy = false; errorMsg = KOREAN_ERR[e.message] || e.message || "로그인에 실패했습니다"; refresh();
  }
}

export const actions = { "login-submit": submit };
