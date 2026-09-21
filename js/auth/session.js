// 로그인 세션 관리 — 비밀번호 해시·토큰 서명은 전부 서버(Supabase Auth/GoTrue)가 담당, 여기선 세션만 다룬다
import { authRequest, restRequest, rpcRequest, isConfigured } from "./api.js";

const KEY = "survey-v5-session";
export const IDLE_MS = 12 * 60 * 60 * 1000; // 12시간 미조작 시 재로그인 요구
const REFRESH_SKEW_MS = 60 * 1000; // 만료 1분 전부터 미리 갱신

let mem = null; // { access_token, refresh_token, expires_at, user:{id,email}, remember }
let lastActivity = Date.now();

function write(session) {
  mem = session;
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
    if (session) (session.remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session));
  } catch { /* 저장 불가 — 이번 화면에서만 로그인 유지 */ }
}

function read() {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
    if (raw) mem = JSON.parse(raw);
  } catch { /* 손상된 값은 무시 */ }
  return mem;
}

/** 서버 응답(access_token·refresh_token·expires_in·user)을 로컬 세션 형태로 변환(저장 없이 순수 변환 — 테스트용으로도 export) */
export function buildSession(authRes, remember) {
  return {
    access_token: authRes.access_token,
    refresh_token: authRes.refresh_token,
    expires_at: Date.now() + (Number(authRes.expires_in) || 3600) * 1000,
    user: { id: authRes.user?.id || "", email: authRes.user?.email || "" },
    remember: !!remember,
  };
}

export const touchActivity = () => { lastActivity = Date.now(); };
export const isIdleTimedOut = () => Date.now() - lastActivity > IDLE_MS;

export function getSession() {
  const s = read();
  if (!s) return null;
  if (isIdleTimedOut()) { clearSession(); return null; }
  return s;
}
export const currentUser = () => getSession()?.user || null;
export const isAdmin = () => getSession()?.role === "admin";
export const clearSession = () => write(null);

export async function login(email, password, remember = false) {
  const res = await authRequest("/token?grant_type=password", { method: "POST", body: { email, password } });
  let session = buildSession(res, remember);
  write(session);
  touchActivity();
  try {
    const rows = await restRequest(`/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=role,is_active`, { token: session.access_token });
    const p = rows?.[0];
    session = { ...session, role: p?.is_active ? p.role : "staff" };
    write(session);
  } catch { /* 역할 조회 실패 — role 없이 진행(관리자 화면은 role 검사에서 자연히 막힘) */ }
  try { await rpcRequest("log_login", { p_event: "login" }, { token: session.access_token }); }
  catch { /* 감사 로그 기록 실패는 로그인 자체를 막지 않음 */ }
  return session;
}

export async function logout() {
  const s = read();
  try {
    if (s?.access_token) {
      await rpcRequest("log_login", { p_event: "logout" }, { token: s.access_token });
      await authRequest("/logout", { method: "POST", token: s.access_token });
    }
  } catch { /* 서버 세션이 이미 만료됐어도 로컬 세션은 지운다 */ }
  clearSession();
}

/** 만료가 임박했을 때만 갱신, 아니면 있는 그대로 반환. 갱신 실패 시 세션을 지우고 null */
export async function refreshIfNeeded() {
  const s = read();
  if (!s) return null;
  if (s.expires_at - Date.now() > REFRESH_SKEW_MS) return s;
  try {
    const res = await authRequest("/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token } });
    const next = buildSession(res, s.remember);
    write(next);
    return next;
  } catch { clearSession(); return null; }
}

/** 포인터·키보드 조작을 감시해 유휴 타이머를 갱신하고, 12시간 초과 시 세션을 지운 뒤 콜백 호출 */
export function installIdleWatch(onTimeout) {
  if (typeof document === "undefined") return;
  ["pointerdown", "keydown", "scroll"].forEach(evt => document.addEventListener(evt, touchActivity, { passive: true }));
  setInterval(() => { if (mem && isIdleTimedOut()) { clearSession(); onTimeout?.(); } }, 60 * 1000);
}

export { isConfigured };
