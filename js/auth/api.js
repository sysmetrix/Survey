// Supabase Auth/REST/RPC 얇은 래퍼 — SDK를 벤더링하지 않고 fetch만 사용(CSP script-src 'self' 유지)
// 아래 두 값은 Supabase 프로젝트를 만든 뒤 채운다. 비밀이 아니다 — 실제 보호는 서버 쪽 Row Level Security.
export const SUPABASE_URL = "https://unrtgdymimluqxkvzucp.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_QV53VY2tJp_3Re_Y5UzGcA_prLrKWGy";

export const isConfigured = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

function headers(token) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

// 로그인 세션(JWT)이 요청 중간에 만료됐을 때 딱 한 번 자동으로 갱신하기 위한 늦은 바인딩(순환 참조 방지) —
// session.js 의 installTokenRefresh() 가 부트스트랩에서 채워 넣는다. 안 채워져 있으면(=아직 로그인 기능을
// 안 쓰는 화면 등) 그냥 원래 오류를 그대로 던진다.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(path, { method = "GET", token, body, extraHeaders, _retried } = {}) {
  if (!isConfigured()) throw new Error("백엔드가 아직 설정되지 않았습니다");
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { ...headers(token), ...extraHeaders },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // 관리자 화면에 몇 시간 머물러 있으면 Supabase JWT(기본 1시간)가 요청 중간에 만료될 수 있다 —
    // 매번 "JWT expired" 오류를 그대로 보여주는 대신, 인증이 걸린 요청(token 있음)에 한해 한 번만
    // 갱신을 시도하고 새 토큰으로 재시도한다. 갱신도 실패하면(재로그인 필요) 그때만 원래 오류로 넘어간다.
    if (res.status === 401 && token && !_retried && onUnauthorized) {
      const fresh = await onUnauthorized();
      if (fresh) return request(path, { method, token: fresh, body, extraHeaders, _retried: true });
    }
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error_description || detail?.msg || detail?.message || `요청 실패 (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

export const authRequest = (path, opts) => request(`/auth/v1${path}`, opts);
export const restRequest = (path, opts) => request(`/rest/v1${path}`, opts);
export const rpcRequest = (name, args, opts = {}) => request(`/rest/v1/rpc/${name}`, { method: "POST", body: args, ...opts });
export const functionRequest = (name, opts) => request(`/functions/v1/${name}`, opts);
