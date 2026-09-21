// 관리자 — 이용자 관리 탭: 계정 자체는 Supabase 대시보드에서 만들고(이메일·비밀번호),
// 여기서는 그 계정을 profiles 에 등록해 표시 이름·역할(staff/admin)·활성 여부를 관리한다.
import { restRequest, rpcRequest, SUPABASE_URL } from "../../../auth/api.js";
import { getSession } from "../../../auth/session.js";
import { esc, toast } from "../../util.js";
import { refresh } from "../../router.js";
import { icon } from "../../icons.js";

let loading = false, error = "", items = null, loaded = false;
let showForm = false;

const projectRef = () => { try { return new URL(SUPABASE_URL).hostname.split(".")[0]; } catch { return ""; } };

async function load() {
  const s = getSession();
  if (!s) return;
  loading = true; error = ""; refresh();
  try { items = await restRequest("/profiles?select=id,display_name,role,is_active,last_login_at&order=display_name.asc", { token: s.access_token }); }
  catch (e) { error = e.message || "불러오지 못했습니다"; }
  finally { loading = false; refresh(); }
}

export function mount() { if (!loaded) { loaded = true; load(); } }

export function render() {
  const myId = getSession()?.user?.id;
  const dashUrl = `https://supabase.com/dashboard/project/${projectRef()}/auth/users`;
  if (error) return `<p class="hint bad" role="alert">${esc(error)}</p>`;
  if (!items) return `<p class="muted">${loading ? "불러오는 중…" : ""}</p>`;
  return `
    <p class="small muted">새 이용자는 먼저 <a href="${esc(dashUrl)}" target="_blank" rel="noopener noreferrer">Supabase 대시보드 Authentication</a>에서 이메일·비밀번호 계정을 만든 뒤, 그 이메일로 아래에서 등록하세요.</p>
    <div class="row gap wrap" style="justify-content:space-between;align-items:center">
      <p class="small muted">${items.length}명</p>
      <button class="btn sm primary" data-act="admin-users-new">${icon("plus", 14)}이메일로 등록</button>
    </div>
    ${showForm ? `<div class="card" style="margin-top:8px"><h3>이용자 등록</h3>
      <label class="field">이메일(Supabase에서 이미 만든 계정)<input class="in" id="regEmail" type="email"></label>
      <label class="field">표시 이름<input class="in" id="regName"></label>
      <label class="field">역할<select class="in" id="regRole"><option value="staff">일반(staff)</option><option value="admin">관리자(admin)</option></select></label>
      <div class="row gap"><button class="btn sm primary" data-act="admin-users-register">등록</button><button class="btn sm" data-act="admin-users-cancel">취소</button></div>
    </div>` : ""}
    <div class="tblwrap" style="margin-top:12px"><table class="tbl">
      <tr><th>이름</th><th>역할</th><th>상태</th><th>최근 로그인</th><th></th></tr>
      ${items.length ? items.map(p => {
        const self = p.id === myId;
        const dis = self ? `disabled title="본인 계정은 여기서 바꿀 수 없습니다"` : "";
        return `<tr><td>${esc(p.display_name)}${self ? " <span class=\"badge info\">나</span>" : ""}</td><td>${p.role === "admin" ? "관리자" : "일반"}</td><td>${p.is_active ? "활성" : "비활성"}</td><td>${p.last_login_at ? esc(new Date(p.last_login_at).toLocaleString("ko-KR")) : "-"}</td>
          <td class="row gap"><button class="btn sm" ${dis} data-act="admin-users-toggle-role" data-id="${p.id}" data-role="${p.role}">${p.role === "admin" ? "일반으로" : "관리자로"}</button><button class="btn sm ${p.is_active ? "danger" : ""}" ${dis} data-act="admin-users-toggle-active" data-id="${p.id}" data-active="${p.is_active}">${p.is_active ? "비활성화" : "활성화"}</button></td></tr>`;
      }).join("") : `<tr><td colspan="5" class="muted">등록된 이용자 없음</td></tr>`}
    </table></div>`;
}

export const actions = {
  "admin-users-new": () => { showForm = true; refresh(); },
  "admin-users-cancel": () => { showForm = false; refresh(); },
  "admin-users-register": async () => {
    const s = getSession();
    if (!s) return;
    const email = document.getElementById("regEmail").value.trim();
    const name = document.getElementById("regName").value.trim();
    const role = document.getElementById("regRole").value;
    if (!email || !name) { toast("이메일과 표시 이름을 입력하세요", "bad"); return; }
    try {
      await rpcRequest("register_profile", { p_email: email, p_display_name: name, p_role: role }, { token: s.access_token });
      toast("등록했습니다", "ok"); showForm = false; loaded = false; await load();
    } catch (e) { toast(e.message || "등록하지 못했습니다", "bad"); }
  },
  "admin-users-toggle-role": async el => {
    const s = getSession();
    if (!s) return;
    const next = el.dataset.role === "admin" ? "staff" : "admin";
    try {
      await restRequest(`/profiles?id=eq.${el.dataset.id}`, { method: "PATCH", token: s.access_token, body: { role: next }, extraHeaders: { Prefer: "return=minimal" } });
      toast("역할을 바꿨습니다", "ok"); loaded = false; await load();
    } catch (e) { toast(e.message || "바꾸지 못했습니다", "bad"); }
  },
  "admin-users-toggle-active": async el => {
    const s = getSession();
    if (!s) return;
    const next = el.dataset.active !== "true";
    try {
      await restRequest(`/profiles?id=eq.${el.dataset.id}`, { method: "PATCH", token: s.access_token, body: { is_active: next }, extraHeaders: { Prefer: "return=minimal" } });
      toast(next ? "활성화했습니다" : "비활성화했습니다", "ok"); loaded = false; await load();
    } catch (e) { toast(e.message || "바꾸지 못했습니다", "bad"); }
  },
};
