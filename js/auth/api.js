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

async function request(path, { method = "GET", token, body, extraHeaders } = {}) {
  if (!isConfigured()) throw new Error("백엔드가 아직 설정되지 않았습니다");
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { ...headers(token), ...extraHeaders },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
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
