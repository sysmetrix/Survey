// 로그인 세션 관리 — 비밀번호 해시·토큰 서명은 전부 서버(Supabase Auth/GoTrue)가 담당, 여기선 세션만 다룬다
import { authRequest, restRequest, rpcRequest, isConfigured, setUnauthorizedHandler } from "./api.js";
import { refresh } from "../ui/router.js";
import { toast } from "../ui/util.js";

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

// 여러 요청이 동시에 401을 만나면(관리자 화면은 위젯마다 따로 요청을 보냄) 각자 갱신을 시도하지 않도록
// 진행 중인 갱신 하나를 공유한다 — 아니면 같은 refresh_token 으로 동시에 여러 번 교환을 시도하게 되어
// (Supabase 는 refresh_token 을 1회용으로 교체하기도 한다) 먼저 끝난 쪽이 다음 것들을 실패시킬 수 있다.
let refreshInFlight = null;

/** 만료가 임박했을 때만 갱신, 아니면 있는 그대로 반환. 갱신 실패 시 세션을 지우고 null */
export async function refreshIfNeeded() {
  const s = read();
  if (!s) return null;
  if (s.expires_at - Date.now() > REFRESH_SKEW_MS) return s;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await authRequest("/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token } });
      // buildSession() 은 role 을 모른다(로그인 때 별도 조회로 붙이는 값) — 갱신할 때 잃어버리면
      // 관리자가 새 토큰을 받자마자 "관리자만 접근할 수 있습니다"로 튕겨나가는 것처럼 보인다.
      const next = { ...buildSession(res, s.remember), role: s.role };
      write(next);
      return next;
    } catch { clearSession(); return null; }
    finally { refreshInFlight = null; }
  })();
  return refreshInFlight;
}

// 관리자 화면에 오래 머물러도 Supabase JWT(기본 1시간)가 요청 중간에 만료되지 않도록 미리 갱신해 둔다.
// 그래도 놓친 요청(만료 직후 그 사이)은 js/auth/api.js 의 setUnauthorizedHandler 가 한 번 더 받아 자동 재시도한다.
let expiredNotified = false;
export function installTokenRefresh() {
  setUnauthorizedHandler(async () => {
    const s = await refreshIfNeeded();
    if (s) { expiredNotified = false; return s.access_token; }
    if (!expiredNotified) { // 여러 요청이 동시에 401을 만나도 안내는 한 번만
      expiredNotified = true;
      toast("로그인이 만료되었습니다. 다시 로그인해 주세요.", "info", 6000);
      refresh();
    }
    return null;
  });
  if (typeof document === "undefined") return;
  setInterval(() => { if (mem) refreshIfNeeded(); }, 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && mem) refreshIfNeeded(); });
}

/** 포인터·키보드 조작을 감시해 유휴 타이머를 갱신하고, 12시간 초과 시 세션을 지운 뒤 콜백 호출 */
export function installIdleWatch(onTimeout) {
  if (typeof document === "undefined") return;
  ["pointerdown", "keydown", "scroll"].forEach(evt => document.addEventListener(evt, touchActivity, { passive: true }));
  setInterval(() => { if (mem && isIdleTimedOut()) { clearSession(); onTimeout?.(); } }, 60 * 1000);
}

export { isConfigured };
