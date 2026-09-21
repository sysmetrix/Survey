// 관리자 — 사용 통계 탭: 화면·기능별 익명 이용 횟수(일별) + 최근 관리자 접속 기록
import { restRequest, rpcRequest } from "../../../auth/api.js";
import { getSession } from "../../../auth/session.js";
import { esc, toast } from "../../util.js";
import { refresh } from "../../router.js";
import { icon } from "../../icons.js";

let loading = false, error = "", rows = null, logins = null, loaded = false;

async function load() {
  const s = getSession();
  if (!s) return;
  loading = true; error = ""; refresh();
  try {
    const [countRows, logRows, profileRows] = await Promise.all([
      restRequest("/usage_daily_counts?order=day.desc&limit=400", { token: s.access_token }),
      restRequest("/access_log?select=user_id,event,created_at&order=created_at.desc&limit=20", { token: s.access_token }),
      restRequest("/profiles?select=id,display_name", { token: s.access_token }),
    ]);
    rows = countRows || [];
    const nameOf = Object.fromEntries((profileRows || []).map(p => [p.id, p.display_name]));
    logins = (logRows || []).map(r => ({ ...r, name: nameOf[r.user_id] || "(알 수 없음)" }));
  } catch (e) {
    error = e.message || "불러오지 못했습니다";
  } finally {
    loading = false; refresh();
  }
}

export function mount() { if (!loaded) { loaded = true; load(); } }

export function render() {
  if (error) return `<p class="hint bad" role="alert">${esc(error)}</p><button class="btn sm" data-act="admin-stats-reload">다시 시도</button>`;
  if (!rows) return `<p class="muted">${loading ? "불러오는 중…" : ""}</p>`;
  const totalEvents = rows.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
  return `
    <div class="row gap wrap" style="justify-content:space-between;align-items:center">
      <p class="small muted">최근 ${rows.length ? esc(rows[rows.length - 1].day) : "-"} ~ ${rows[0] ? esc(rows[0].day) : "-"} · 이벤트 총 ${totalEvents.toLocaleString()}건 · 설문 데이터는 포함되지 않음</p>
      <button class="btn sm" data-act="admin-stats-reload">${icon("history", 14)}새로고침</button>
    </div>
    <div class="tblwrap"><table class="tbl">
      <tr><th>날짜</th><th>화면</th><th>이벤트</th><th class="c">횟수</th><th class="c">순 세션</th></tr>
      ${rows.length ? rows.map(r => `<tr><td>${esc(r.day)}</td><td>${esc(r.view)}</td><td>${esc(r.event)}</td><td class="c">${esc(r.count)}</td><td class="c">${esc(r.distinct_sessions)}</td></tr>`).join("") : `<tr><td colspan="5" class="muted">아직 기록이 없습니다</td></tr>`}
    </table></div>
    <div class="row gap" style="margin-top:14px">
      <button class="btn sm danger" data-act="admin-stats-cleanup">90일 지난 원본 이벤트 정리</button>
    </div>
    <h3 style="margin-top:22px">최근 관리자 접속</h3>
    <div class="tblwrap"><table class="tbl">
      <tr><th>계정</th><th>동작</th><th>시각</th></tr>
      ${(logins || []).length ? logins.map(l => `<tr><td>${esc(l.name)}</td><td>${l.event === "login" ? "로그인" : "로그아웃"}</td><td>${esc(new Date(l.created_at).toLocaleString("ko-KR"))}</td></tr>`).join("") : `<tr><td colspan="3" class="muted">기록 없음</td></tr>`}
    </table></div>`;
}

export const actions = {
  "admin-stats-reload": () => { loaded = false; rows = null; logins = null; load(); },
  "admin-stats-cleanup": async () => {
    const s = getSession();
    if (!s) return;
    if (!confirm("90일보다 오래된 원본 이벤트를 정리할까요? 해당 기간의 일별 통계도 함께 사라집니다.")) return;
    try {
      await rpcRequest("cleanup_old_events", {}, { token: s.access_token });
      toast("정리했습니다", "ok");
      loaded = false; rows = null; await load();
    } catch (e) { toast(e.message || "정리하지 못했습니다", "bad"); }
  },
};
