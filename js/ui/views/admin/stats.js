// 관리자 — 사용 통계 탭: 단계별 도달(퍼널)·핵심 지표 요약·추세를 먼저 보여주고,
// 원본 일별 표는 아래 접이식에 둔다(로그가 아니라 "무엇을 결정할 수 있는가"가 먼저 보이게).
import { restRequest, rpcRequest } from "../../../auth/api.js";
import { getSession } from "../../../auth/session.js";
import { esc, toast } from "../../util.js";
import { refresh } from "../../router.js";
import { icon } from "../../icons.js";
import { hbar } from "../../../charts/svg.js";
import { resolvedTheme } from "../../theme.js";

const FUNNEL = [
  { view: "load", label: "1 불러오기" },
  { view: "setup", label: "2 데이터 설정" },
  { view: "business", label: "3 성과지표" },
  { view: "dash", label: "4 분석 결과" },
  { view: "report", label: "5 보고서" },
  { view: "present", label: "6 발표" },
];

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

/** 화면(view)·이벤트(event) 기준으로 일별 집계를 전체 기간 합계로 접음 — 세션 수는 일별 순 세션의 합이라 근사치 */
function totalsBy(rows) {
  const t = {};
  for (const r of rows) {
    const k = `${r.view}·${r.event}`;
    const cur = t[k] || { view: r.view, event: r.event, count: 0, sessions: 0 };
    cur.count += Number(r.count) || 0;
    cur.sessions += Number(r.distinct_sessions) || 0;
    t[k] = cur;
  }
  return t;
}

function summaryHtml(rows) {
  const t = totalsBy(rows);
  const sessionsOf = view => t[`${view}·view_enter`]?.sessions || 0;
  const countOf = (view, event) => t[`${view}·${event}`]?.count || 0;
  const entrySessions = sessionsOf("load");
  const reportSessions = sessionsOf("report");
  const reachRate = entrySessions ? Math.round((reportSessions / entrySessions) * 100) : 0;
  const exports = countOf("report", "export_hwpx") + countOf("present", "export_pptx");
  const errorCount = Object.values(t).filter(v => v.event === "js_error").reduce((s, v) => s + v.count, 0);
  const tile = (n, l) => `<div class="stat-tile"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`;
  return `<div class="stat-tiles">
    ${tile(entrySessions.toLocaleString(), "방문 세션(근사)")}
    ${tile(`${reachRate}%`, "불러오기 → 보고서 도달률")}
    ${tile(exports.toLocaleString(), "보고서·발표 내보내기")}
    ${tile(errorCount.toLocaleString(), "오류 발생")}
  </div>`;
}

function funnelHtml(rows) {
  const t = totalsBy(rows);
  const data = FUNNEL.map(f => ({ label: f.label, value: t[`${f.view}·view_enter`]?.sessions || 0 }));
  if (!data.some(d => d.value > 0)) return `<p class="small muted">아직 단계별 방문 기록이 없습니다.</p>`;
  const chart = hbar(data, { title: "단계별 도달 세션(근사치) — 어디서 이탈하는지", unit: "회", theme: resolvedTheme(), width: 640 });
  return `<div class="chart-wrap">${chart.svg}</div>`;
}

function detailHtml(rows) {
  return `<details class="admin-raw">
    <summary>원본 일별 데이터 보기(${rows.length}행)</summary>
    <div class="tblwrap"><table class="tbl">
      <tr><th>날짜</th><th>화면</th><th>이벤트</th><th class="c">횟수</th><th class="c">순 세션</th></tr>
      ${rows.length ? rows.map(r => `<tr><td>${esc(r.day)}</td><td>${esc(r.view)}</td><td>${esc(r.event)}</td><td class="c">${esc(r.count)}</td><td class="c">${esc(r.distinct_sessions)}</td></tr>`).join("") : `<tr><td colspan="5" class="muted">기록 없음</td></tr>`}
    </table></div>
  </details>`;
}

export function render() {
  if (error) return `<p class="hint bad" role="alert">${esc(error)}</p><button class="btn sm" data-act="admin-stats-reload">다시 시도</button>`;
  if (!rows) return `<p class="muted">${loading ? "불러오는 중…" : ""}</p>`;
  return `
    <div class="row gap wrap" style="justify-content:space-between;align-items:center;margin-bottom:8px">
      <p class="small muted">최근 ${rows.length ? esc(rows[rows.length - 1].day) : "-"} ~ ${rows[0] ? esc(rows[0].day) : "-"} · 설문 데이터는 포함되지 않음</p>
      <button class="btn sm" data-act="admin-stats-reload">${icon("history", 14)}새로고침</button>
    </div>
    ${summaryHtml(rows)}
    ${funnelHtml(rows)}
    <div class="row gap" style="margin:14px 0">
      <button class="btn sm danger" data-act="admin-stats-cleanup">90일 지난 원본 이벤트 정리</button>
    </div>
    ${detailHtml(rows)}
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
    if (!confirm("90일보다 오래된 원본 이벤트를 정리할까요? 해당 기간의 통계도 함께 사라집니다.")) return;
    try {
      await rpcRequest("cleanup_old_events", {}, { token: s.access_token });
      toast("정리했습니다", "ok");
      loaded = false; rows = null; await load();
    } catch (e) { toast(e.message || "정리하지 못했습니다", "bad"); }
  },
};
