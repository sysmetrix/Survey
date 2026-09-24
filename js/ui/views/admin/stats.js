// 관리자 — 사용 통계 탭.
// 순서(섹션마다 admin-h3 구분선): 기간 선택 → 핵심 지표(전 기간 대비 증감) → 일별 추이 →
// 내보내기 형식별(HWPX·PPTX·HTML·PDF×2화면) → 단계별 도달(퍼널, 단계 간 전환율) →
// 시간대·접속 경로·기기·브라우저(2열 그리드, 짧은 라벨만 — 같은 폭이라 스케일이 맞아 보임) →
// 기관·샘플 인기도(전체 폭 — 라벨이 길어 그리드에 넣으면 줄바꿈이 막대와 겹침) → 버전 분포 →
// 원본 표(접이식, 코드에 한글 뜻 병기·페이지 단위로만 그림). "로그가 아니라 무엇을 결정할 수 있는가"가 먼저 보이게.
// 위젯마다 따로 불러온다(Promise.all + loadOne) — 하나가 실패(예: 새 뷰 마이그레이션 미적용)해도 나머지는 그대로 보임.
import { restRequest, rpcRequest } from "../../../auth/api.js";
import { getSession } from "../../../auth/session.js";
import { esc, toast } from "../../util.js";
import { refresh } from "../../router.js";
import { icon } from "../../icons.js";
import { hbar, trendLine, vbar } from "../../../charts/svg.js";
import { resolvedTheme } from "../../theme.js";
import { isMissingTableError } from "./flags.js";
import { operationalKpis, operationalFunnel, distributionKpis, csvForStats } from "./stats-advanced.js";
import { isAdminPreview } from "../../../admin/flags-client.js";

const FUNNEL = [
  { view: "load", label: "1 불러오기" },
  { view: "setup", label: "2 데이터 설정" },
  { view: "business", label: "3 성과지표" },
  { view: "dash", label: "4 분석 결과" },
  { view: "report", label: "5 보고서" },
  { view: "present", label: "6 발표" },
];
const PERIODS = [7, 30, 90];
const DETAIL_PAGE = 50; // "원본 일별 데이터" 한 번에 보여주는 행 수 — 기간을 넓게 고르면 수백 행도 나올 수 있어 처음부터 다 그리지 않음
const DAY_MS = 86400000;
const fmtDay = d => d.toISOString().slice(0, 10);
const parseDay = s => new Date(`${s}T00:00:00Z`);
export function customPeriodWindow(from, to) {
  const start = parseDay(from), end = parseDay(to);
  if (!from || !to || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null;
  const days = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  return { curStart: from, prevStart: fmtDay(new Date(start.getTime() - days * DAY_MS)), fetchFrom: fmtDay(new Date(start.getTime() - days * DAY_MS)), curEnd: to };
}

// 원본 표의 view·event 코드는 개발자에게는 익숙해도 처음 보는 관리자에게는 뜻을 알기 어렵다 —
// track_events() SQL(allowed_views·allowed_events)에 있는 코드를 전부 담아 코드와 뜻을 나란히 보여준다.
const VIEW_LABELS = {
  load: "불러오기", setup: "데이터 설정", business: "성과지표", dash: "분석 결과", report: "보고서",
  present: "발표 모드", presentEdit: "슬라이드 편집", history: "작업 내역", settings: "로컬 설정",
  updates: "업데이트 내역", login: "로그인", admin: "관리자",
};
const EVENT_LABELS = {
  view_enter: "화면 진입", export_hwpx: "한글 보고서 내보내기", export_pptx: "발표자료 PPTX 내보내기",
  export_html: "발표자료 HTML 내보내기", export_pdf: "인쇄·PDF 저장",
  sample_load: "샘플 파일 불러오기", js_error: "오류 발생",
};
// 보고서·발표 내보내기는 4가지 형식이 있다 — exportBreakdown()·exportHtml() 이 함께 씀
const EXPORT_FORMATS = [
  { view: "report", event: "export_hwpx", label: "HWPX(보고서)" },
  { view: "present", event: "export_pptx", label: "PPTX(발표자료)" },
  { view: "present", event: "export_html", label: "HTML(발표자료)" },
  { view: "report", event: "export_pdf", label: "PDF(보고서 인쇄)" },
  { view: "present", event: "export_pdf", label: "PDF(발표자료 인쇄)" },
];
/** "load (불러오기)" 처럼 코드와 뜻을 함께 — 모르는 코드가 새로 생겨도(마이그레이션 지연 등) 코드 자체는 항상 보이게 */
const withLabel = (code, map) => (map[code] ? `${esc(code)} (${esc(map[code])})` : esc(code));

// ─────────────────────────── 순수 계산 (테스트 대상) ───────────────────────────

/** 오늘(UTC) 기준 이번 기간·직전 동일 길이 기간의 시작일(포함) — 직전 기간과 비교해 증감을 보여주기 위함 */
export function periodWindow(days, today = new Date()) {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const curStart = new Date(end.getTime() - (days - 1) * DAY_MS);
  const prevStart = new Date(curStart.getTime() - days * DAY_MS);
  return { curStart: fmtDay(curStart), prevStart: fmtDay(prevStart), fetchFrom: fmtDay(prevStart) };
}

/** day 문자열 기준으로 이번 기간·직전 기간 행을 나눔 */
export function splitByPeriod(rows, curStartDay) {
  const cutoff = parseDay(curStartDay).getTime();
  const cur = [], prev = [];
  for (const r of rows) (parseDay(r.day).getTime() >= cutoff ? cur : prev).push(r);
  return { cur, prev };
}

/** 화면(view)·이벤트(event) 기준으로 일별 집계를 합계로 접음 — 세션 수는 일별 순 세션의 합이라 근사치 */
export function totalsBy(rows) {
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

/** 증감률(%) — 직전 기간이 0이면 비교가 의미 없어 null(표시하지 않음) */
export function deltaPct(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** 보고서·발표 내보내기 5종(HWPX·PPTX·HTML·PDF×2화면)별 건수 — kpiTiles() 합계·exportHtml() 그래프가 함께 씀 */
export function exportBreakdown(totals) {
  const cntOf = (view, event) => totals[`${view}·${event}`]?.count || 0;
  return EXPORT_FORMATS.map(f => ({ label: f.label, value: cntOf(f.view, f.event) }));
}

/** 핵심 지표 4개 — 각각 { n, l, delta, kind } (kind: good=녹색이 좋음, bad=녹색이 나쁨(오류처럼 낮을수록 좋음)) */
export function kpiTiles(curTotals, prevTotals) {
  const of = (t, view, event) => t[`${view}·${event}`]?.sessions || 0;
  const rate = t => { const e = of(t, "load", "view_enter"); return e ? Math.round((of(t, "report", "view_enter") / e) * 100) : 0; };
  const exportsOf = t => exportBreakdown(t).reduce((s, x) => s + x.value, 0);
  const errRateOf = t => { const e = of(t, "load", "view_enter"); const err = Object.values(t).filter(v => v.event === "js_error").reduce((s, v) => s + v.count, 0); return e ? Math.round((err / e) * 1000) / 10 : 0; };
  const sessions = of(curTotals, "load", "view_enter"), prevSessions = of(prevTotals, "load", "view_enter");
  const reach = rate(curTotals), prevReach = rate(prevTotals);
  const exp = exportsOf(curTotals), prevExp = exportsOf(prevTotals);
  const errRate = errRateOf(curTotals), prevErrRate = errRateOf(prevTotals);
  return [
    { n: sessions.toLocaleString(), l: "방문 세션(근사)", delta: deltaPct(sessions, prevSessions), kind: "good" },
    { n: `${reach}%`, l: "불러오기 → 보고서 도달률", delta: reach - prevReach, deltaUnit: "%p", kind: "good" },
    { n: exp.toLocaleString(), l: "보고서·발표 내보내기(5종 합)", delta: deltaPct(exp, prevExp), kind: "good", sub: "형식별 내역은 아래 그래프 참고" },
    // errRate 는 나눗셈을 한 번 더 거쳐(÷1000÷10) 부동소수점 오차가 남을 수 있어(예: 2.1-1.9=0.20000000000000018) 소수 첫째 자리로 한 번 더 반올림
    { n: `${errRate}%`, l: "오류 발생률(방문 대비)", delta: Math.round((errRate - prevErrRate) * 10) / 10, deltaUnit: "%p", kind: "bad" },
  ];
}

/** 퍼널 — 단계별 세션 수 + 전 단계 대비 전환율(첫 단계는 100%) */
export function funnelSteps(totals) {
  const sessOf = view => totals[`${view}·view_enter`]?.sessions || 0;
  return FUNNEL.map((f, i) => {
    const value = sessOf(f.view);
    const prevValue = i > 0 ? sessOf(FUNNEL[i - 1].view) : null;
    const pct = i === 0 ? null : prevValue ? Math.round((value / prevValue) * 100) : 0;
    return { label: f.label, value, pct };
  });
}

/** 가장 많이 새는 단계(전환율이 가장 낮은 구간) — 없으면 null.
 *  이 앱은 '건너뛰고 분석 결과 보기' 버튼으로 성과지표(3)를 거치지 않고 바로 분석 결과(4)로 갈 수 있어,
 *  뒤 단계 세션 수가 앞 단계보다 많을(전환율 100% 초과) 수 있다 — 그런 구간은 새는 게 아니라 정상이므로 후보에서 뺀다. */
export function biggestDropStep(steps) {
  let worst = null;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].pct === null || steps[i].pct > 100 || steps[i - 1].value === 0) continue;
    if (!worst || steps[i].pct < worst.pct) worst = { from: steps[i - 1].label, to: steps[i].label, pct: steps[i].pct };
  }
  return worst;
}

/** 선택한 기간의 일별 방문(=load 화면 view_enter 세션) 추이 — trendLine 입력 형태로 정렬 */
export function dailyVisitTrend(curRows, curStartDay) {
  const byDay = {};
  for (const r of curRows) {
    if (r.view !== "load" || r.event !== "view_enter") continue;
    byDay[r.day] = (byDay[r.day] || 0) + (Number(r.distinct_sessions) || 0);
  }
  const start = parseDay(curStartDay);
  const end = new Date();
  const out = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY_MS)) {
    const day = fmtDay(d);
    out.push({ label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, value: byDay[day] || 0, day });
  }
  return out;
}

// ─────────────────────────── 상태 · 불러오기 ───────────────────────────

let loading = false, error = "", period = 30, customFrom = "", customTo = "", loaded = false, statsTab = "overview";
let curRows = null, prevRows = null; // usage_daily_counts, 기간별로 나눔
let orgRows = null, srcRows = null, hourRows = null, logins = null;
let sampleRows = null, sampleMissing = false;
let versionRows = null, versionMissing = false;
let deviceRows = null, browserRows = null, deviceBrowserMissing = false;
let actionRows = [];
let detailShown = DETAIL_PAGE; // "원본 일별 데이터" 접이식이 한 번에 그리는 행 수(무한정 길어지지 않도록) — "더 보기"로 늘어남
let detailOpen = false; // 원본 표를 펼쳤는지 — render()가 매번 <details>를 새로 찍어내므로(다른 조작으로 refresh될 때) 이 상태로 열림을 기억해 두지 않으면 "더 보기"를 눌러도 표가 도로 접힘
if (typeof document !== "undefined") {
  document.addEventListener("toggle", e => { if (e.target instanceof Element && e.target.matches(".admin-raw")) detailOpen = e.target.open; }, true);
}

/** 실패해도 던지지 않고 {ok,v} 또는 {ok:false,e}로 감쌈 — 위젯 하나가 깨져도 Promise.all 전체가 죽지 않게 */
async function loadOne(fn) { try { return { ok: true, v: await fn() }; } catch (e) { return { ok: false, e }; } }

async function load() {
  const s = getSession();
  if (!s) return;
  loading = true; error = ""; refresh();
  const { fetchFrom, curStart } = customPeriodWindow(customFrom, customTo) || periodWindow(period);
  const tok = { token: s.access_token };
  const [daily, orgs, srcs, hours, logRows, profileRows, samples, versions, devices, browsers, actions] = await Promise.all([
    loadOne(() => restRequest(`/usage_daily_counts?day=gte.${fetchFrom}&order=day.asc&limit=5000`, tok)),
    loadOne(() => restRequest("/usage_org_counts?limit=10", tok)),
    loadOne(() => restRequest("/usage_src_counts?limit=10", tok)),
    loadOne(() => restRequest("/usage_hourly_counts", tok)),
    loadOne(() => restRequest("/access_log?select=user_id,event,created_at&order=created_at.desc&limit=20", tok)),
    loadOne(() => restRequest("/profiles?select=id,display_name", tok)),
    loadOne(() => restRequest("/usage_sample_counts?limit=10", tok)),
    loadOne(() => restRequest("/usage_version_counts?limit=10", tok)),
    loadOne(() => restRequest("/usage_device_counts?limit=10", tok)),
    loadOne(() => restRequest("/usage_browser_counts?limit=10", tok)),
    loadOne(() => restRequest(`/usage_action_counts?day=gte.${fetchFrom}&order=day.asc&limit=5000`, tok)),
  ]);
  const val = (r, fallback = []) => (r.ok ? r.v ?? fallback : fallback);
  if (!daily.ok) { error = daily.e?.message || "불러오지 못했습니다"; loading = false; refresh(); return; }
  const split = splitByPeriod(val(daily), curStart);
  curRows = split.cur; prevRows = split.prev;
  orgRows = val(orgs); srcRows = val(srcs); hourRows = val(hours);
  const nameOf = Object.fromEntries(val(profileRows).map(p => [p.id, p.display_name]));
  logins = val(logRows).map(r => ({ ...r, name: nameOf[r.user_id] || "(알 수 없음)" }));
  sampleRows = samples.ok ? samples.v || [] : null;
  sampleMissing = !samples.ok && isMissingTableError(samples.e?.message);
  versionRows = versions.ok ? versions.v || [] : null;
  versionMissing = !versions.ok && isMissingTableError(versions.e?.message);
  deviceRows = devices.ok ? devices.v || [] : null;
  browserRows = browsers.ok ? browsers.v || [] : null;
  actionRows = actions.ok ? actions.v || [] : [];
  deviceBrowserMissing = (!devices.ok && isMissingTableError(devices.e?.message)) || (!browsers.ok && isMissingTableError(browsers.e?.message));
  detailShown = DETAIL_PAGE;
  loading = false; refresh();
}

export function mount() { if (!loaded) { loaded = true; load(); } }

// ─────────────────────────── 렌더 ───────────────────────────

function deltaHtml(delta, unit = "%", kind = "good") {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return `<span class="kpi-delta muted">직전 ${period}일 기록 없음</span>`;
  if (delta === 0) return `<span class="kpi-delta muted">직전 기간과 같음</span>`;
  const up = delta > 0;
  const good = kind === "good" ? up : !up; // bad 지표(오류율 등)는 내려가는 게 좋음
  return `<span class="kpi-delta ${good ? "up" : "down"}"><span class="kpi-delta-num">${icon(up ? "arrowUp" : "arrowDown", 12)}${Math.abs(delta)}${unit}</span> <span class="muted">· 직전 ${period}일 대비</span></span>`;
}

function tilesHtml(tiles) {
  return `<div class="stat-tiles">${tiles.map(t => `<div class="stat-tile">
    <div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div>
    ${t.sub ? `<div class="stat-tile-sub small muted">${esc(t.sub)}</div>` : ""}
    ${deltaHtml(t.delta, t.deltaUnit || "%", t.kind)}
  </div>`).join("")}</div>`;
}

function trendHtml(curRows, curStart) {
  const data = dailyVisitTrend(curRows, curStart);
  if (!data.some(d => d.value > 0)) return `<p class="small muted">아직 이 기간의 방문 기록이 없습니다.</p>`;
  const avg = data.reduce((s, d) => s + d.value, 0) / data.length;
  const chart = trendLine(data, { title: `일별 방문 세션 추이 — 최근 ${period}일`, unit: "회", refValue: avg, refLabel: "평균", theme: resolvedTheme(), width: 640 });
  return `<div class="chart-wrap">${chart.svg}</div>`;
}

function exportHtml(totals) {
  const data = exportBreakdown(totals);
  if (!data.some(d => d.value > 0)) return `<p class="small muted">아직 내보내기 기록이 없습니다.</p>`;
  const chart = hbar(data, { title: "내보내기 형식별 — 보고서(HWPX·PDF)·발표자료(PPTX·HTML·PDF)", unit: "건", theme: resolvedTheme(), width: 640, labelWidth: 170 });
  return `<div class="chart-wrap">${chart.svg}</div>`;
}

function funnelHtml(totals) {
  const steps = funnelSteps(totals);
  if (!steps.some(d => d.value > 0)) return `<p class="small muted">아직 단계별 방문 기록이 없습니다.</p>`;
  // '건너뛰고 분석 결과 보기' 버튼으로 3단계를 안 거치고 4단계로 바로 갈 수 있어 전환율이 100%를 넘을 수 있다(정상) —
  // 그 경우는 "전 단계의 X%"라고 하면 새는 것처럼 오해할 수 있어 다르게 표현한다
  const data = steps.map(s => ({ label: s.label, value: s.value, sub: s.pct === null ? "" : s.pct > 100 ? "(건너뛰어 바로 온 방문 포함)" : `(전 단계의 ${s.pct}%)` }));
  const chart = hbar(data, { title: "단계별 도달 세션(근사치) — 어디서 이탈하는지", unit: "회", theme: resolvedTheme(), width: 640 });
  const drop = biggestDropStep(steps);
  return `<div class="chart-wrap">${chart.svg}</div>${drop ? `<p class="small warn-text">${icon("alert", 13)} 가장 많이 이탈하는 구간: ‘${esc(drop.from)}’ → ‘${esc(drop.to)}’(${drop.pct}%만 이어감)</p>` : ""}`;
}

// 아래 "시간대·접속 경로·기기·브라우저" 묶음은 전부 2열 그리드에 나란히 들어간다 — 같은 폭(GRID_W)으로 그려야
// 칸마다 막대 눈금 간격(스케일)이 시각적으로 맞아 보인다(하나는 넓고 하나는 좁으면 눈대중 비교가 어려워짐).
// 기관명·샘플 파일명처럼 길어질 수 있는 라벨은 이 폭에 넣으면 줄바꿈이 막대와 겹쳐 보여 따로(전체 폭) 그린다.
const GRID_W = 320;
const gridCell = html => `<div class="chart-grid-cell">${html}</div>`;

function orgHtml(rows) {
  if (!rows.length) return "";
  const data = rows.map(r => ({ label: r.org, value: Number(r.distinct_sessions) || 0 }));
  const chart = hbar(data, { title: "기관별 방문 세션 — 상위 10", unit: "회", theme: resolvedTheme(), width: 640, labelWidth: 200 });
  return `<div class="chart-wrap">${chart.svg}</div><p class="small muted">기관·부서명을 입력하지 않으면 "(미상)"으로 묶입니다.</p>`;
}

function srcHtml(rows) {
  if (!rows.length) return "";
  const data = rows.map(r => ({ label: r.src, value: Number(r.distinct_sessions) || 0 }));
  const chart = hbar(data, { title: "접속 경로(?src= 태그)별 방문 — 상위 10", unit: "회", theme: resolvedTheme(), width: GRID_W, labelWidth: 110 });
  return gridCell(`<div class="chart-wrap">${chart.svg}</div>`);
}

function hourHtml(rows) {
  const byHour = Object.fromEntries((rows || []).map(r => [Number(r.hour_kst), Number(r.distinct_sessions) || 0]));
  const data = Array.from({ length: 24 }, (_, h) => ({ label: `${h}`, value: byHour[h] || 0 }));
  if (!data.some(d => d.value > 0)) return gridCell(`<p class="small muted">아직 시간대 기록이 없습니다.</p>`);
  const chart = vbar(data, { title: "시간대별 사용(한국 시간) — 굵은 막대가 가장 붐비는 시간", unit: "회", theme: resolvedTheme(), width: GRID_W });
  return gridCell(`<div class="chart-wrap">${chart.svg}</div>`);
}

function deviceHtml() {
  if (deviceBrowserMissing) return gridCell(`<b>접속 기기</b>${migrationHint("0008_device_browser.sql")}`);
  if (!deviceRows?.length) return "";
  const data = deviceRows.map(r => ({ label: r.device, value: Number(r.distinct_sessions) || 0 }));
  const chart = hbar(data, { title: "접속 기기별 방문", unit: "회", theme: resolvedTheme(), width: GRID_W, labelWidth: 90 });
  return gridCell(`<div class="chart-wrap">${chart.svg}</div>`);
}

function browserHtml() {
  if (deviceBrowserMissing) return gridCell(`<b>브라우저별 방문</b>${migrationHint("0008_device_browser.sql")}`);
  if (!browserRows?.length) return "";
  const data = browserRows.map(r => ({ label: r.browser, value: Number(r.distinct_sessions) || 0 }));
  const chart = hbar(data, { title: "브라우저별 방문", unit: "회", theme: resolvedTheme(), width: GRID_W, labelWidth: 90 });
  return gridCell(`<div class="chart-wrap">${chart.svg}</div>`);
}

/** 마이그레이션이 아직 안 된 새 뷰(usage_sample_counts 등) 안내 — flags.js 의 setupHelp()와 같은 자리·문구 패턴 */
function migrationHint(migration) {
  return `<p class="small muted">이 항목은 <code>supabase/migrations/${migration}</code>이 아직 적용되지 않아 비어 있습니다 — Supabase 대시보드 SQL Editor에서 실행하거나 <code>supabase db push</code> 후 새로고침하세요.</p>`;
}

function sampleHtml() {
  if (sampleMissing) return `<b>샘플 인기도</b>${migrationHint("0007_stats_v2.sql")}`;
  if (!sampleRows?.length) return "";
  const data = sampleRows.map(r => ({ label: r.file, value: Number(r.distinct_sessions) || 0 }));
  const chart = hbar(data, { title: "‘샘플로 체험하기’ 클릭 순위", unit: "회", theme: resolvedTheme(), width: 640, labelWidth: 260 });
  return `<div class="chart-wrap">${chart.svg}</div>`;
}

function versionHtml() {
  if (versionMissing) return `<h3 class="admin-h3">앱 버전 분포</h3>${migrationHint("0007_stats_v2.sql")}`;
  if (!versionRows?.length) return "";
  const total = versionRows.reduce((s, r) => s + (Number(r.distinct_sessions) || 0), 0) || 1;
  const rows = versionRows.slice(0, 8).map(r => {
    const sessions = Number(r.distinct_sessions) || 0;
    const pct = Math.round((sessions / total) * 1000) / 10;
    return `<tr><td>${esc(r.version)}</td><td class="c">${sessions.toLocaleString()}</td><td class="c">${pct}%</td><td>${esc(new Date(r.last_seen).toLocaleString("ko-KR"))}</td></tr>`;
  }).join("");
  return `<h3 class="admin-h3">앱 버전 분포 <span class="small muted">— 배포 직후 이전 버전 캐시가 남아 있는지 확인(최근 8개)</span></h3>
    <div class="tblwrap"><table class="tbl nowrap-cells"><tr><th>버전</th><th class="c">방문 세션</th><th class="c">비율</th><th>마지막 접속</th></tr>${rows}</table></div>`;
}

/** 코드(view·event)만으로는 뜻을 알기 어려워 한글 뜻을 괄호로 병기. 기간을 넓게 고르면 수백 행도 나올 수
 *  있어 한 번에 DETAIL_PAGE 행만 그리고, "더 보기"를 눌러야 이어서 그림(표가 무한정 길어지지 않게) */
function detailHtml(rows) {
  const sorted = [...rows].sort((a, b) => (a.day < b.day ? 1 : -1));
  const shown = sorted.slice(0, detailShown);
  const more = sorted.length - shown.length;
  return `<details class="admin-raw"${detailOpen ? " open" : ""}>
    <summary>원본 일별 데이터 보기(선택한 기간, ${sorted.length}행) <span class="small muted">— 날짜별 화면·이벤트 집계 원본. 위 그래프들은 전부 이 표를 요약한 것</span></summary>
    <div class="tblwrap"><table class="tbl">
      <tr><th>날짜</th><th>화면</th><th>이벤트</th><th class="c">횟수</th><th class="c">순 세션</th></tr>
      ${shown.length ? shown.map(r => `<tr><td>${esc(r.day)}</td><td>${withLabel(r.view, VIEW_LABELS)}</td><td>${withLabel(r.event, EVENT_LABELS)}</td><td class="c">${esc(r.count)}</td><td class="c">${esc(r.distinct_sessions)}</td></tr>`).join("") : `<tr><td colspan="5" class="muted">기록 없음</td></tr>`}
    </table></div>
    ${more > 0 ? `<button class="btn sm" data-act="admin-stats-detail-more">더 보기(${more}행 남음)</button>` : ""}
  </details>`;
}

function advancedHtml(rows, prevRows) {
  const tiles = [...operationalKpis([...rows, ...actionRows], prevRows || []), ...distributionKpis(orgRows || [], versionRows || [], "5.47.13")];
  const funnel = operationalFunnel([...rows, ...actionRows]);
  const fmt = t => `${Number(t.value || 0).toLocaleString()}${t.unit || ""}`;
  return `<h3 class="admin-h3">운영 KPI ${isAdminPreview("operationalUsageStats") ? '<span class="badge info">관리자 미리보기</span>' : ""} <span class="small muted">현재 기간 · 익명 세션/이벤트 기준</span></h3>
    <div class="stat-tiles">${tiles.map(t => `<div class="stat-tile"><div class="n">${esc(fmt(t))}</div><div class="l">${esc(t.label)}</div><div class="small muted">${t.delta === null ? "비교 데이터 없음" : `전기 대비 ${t.delta > 0 ? "+" : ""}${t.delta}%`}</div></div>`).join("")}</div>
    <h4>운영 행동 퍼널</h4><div class="tblwrap"><table class="tbl"><tr><th>단계</th><th class="c">세션</th><th class="c">전 단계 전환율</th></tr>${funnel.map(x => `<tr><td>${esc(x.label)}</td><td class="c">${x.value.toLocaleString()}</td><td class="c">${x.rate === null ? "—" : `${x.rate}%`}</td></tr>`).join("")}</table></div>
    <h4>오류 상세</h4><div class="tblwrap"><table class="tbl"><tr><th>화면</th><th>이벤트</th><th class="c">건수</th></tr>${actionRows.filter(r => ["js_error", "file_load_error", "export_error"].includes(r.event)).slice(0, 20).map(r => `<tr><td>${esc(r.view)}</td><td>${esc(r.event)}</td><td class="c">${Number(r.count || 0).toLocaleString()}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">오류 기록 없음</td></tr>'}</table></div>
    <div class="row gap" style="margin:14px 0"><button class="btn sm" data-act="admin-stats-csv">현재 통계 CSV 다운로드</button></div>`;
}

export function render() {
  if (error) return `<p class="hint bad" role="alert">${esc(error)}</p><button class="btn sm" data-act="admin-stats-reload">다시 시도</button>`;
  if (!curRows) return `<p class="muted">${loading ? "불러오는 중…" : ""}</p>`;
  const totals = totalsBy(curRows), prevTotals = totalsBy(prevRows || []);
  const { curStart } = customPeriodWindow(customFrom, customTo) || periodWindow(period);
  return `
    <div class="row gap wrap" style="justify-content:space-between;align-items:center;margin-bottom:10px">
      <div class="seg-filter" role="group" aria-label="기간 선택" style="margin:0">
        ${PERIODS.map(d => `<button type="button" class="seg-btn${d === period ? " on" : ""}" data-act="admin-stats-period" data-days="${d}">최근 ${d}일</button>`).join("")}
      </div>
      <label class="small">시작일 <input type="date" data-change="admin-stats-custom-date" data-date="from" value="${esc(customFrom)}"></label>
      <label class="small">종료일 <input type="date" data-change="admin-stats-custom-date" data-date="to" value="${esc(customTo)}"></label>
      <button class="btn sm" data-act="admin-stats-reload">${icon("history", 14)}새로고침${loading ? " · 불러오는 중" : ""}</button>
    </div>
    <p class="small muted" style="margin:0 0 12px">설문 데이터·IP·리퍼러는 포함되지 않음 · 기준 시각 ${esc(new Date().toLocaleString("ko-KR"))}</p>
    ${tilesHtml(kpiTiles(totals, prevTotals))}
    <nav class="tabs admin-stats-tabs" aria-label="관리자 통계 영역">
      ${[["overview","요약"],["operations","운영"],["data","상세 데이터"]].map(([key,label]) => `<button class="tab${statsTab === key ? " on" : ""}" ${statsTab === key ? 'aria-current="page"' : ""} data-act="admin-stats-tab" data-tab="${key}">${label}</button>`).join("")}
    </nav>
    ${statsTab === "operations" ? advancedHtml(curRows, prevRows) : ""}
    ${trendHtml(curRows, curStart)}
    <h3 class="admin-h3">내보내기 형식별 <span class="small muted">— HWPX·PPTX·HTML·PDF 중 실제로 무엇을 받아가는지</span></h3>
    ${exportHtml(totals)}
    <h3 class="admin-h3">단계별 도달</h3>
    ${funnelHtml(totals)}
    <h3 class="admin-h3">시간대·접속 경로·기기·브라우저</h3>
    <div class="chart-grid-2col">
      ${hourHtml(hourRows || [])}
      ${srcHtml(srcRows || [])}
      ${deviceHtml()}
      ${browserHtml()}
    </div>
    <h3 class="admin-h3">기관·콘텐츠 인기도</h3>
    ${orgHtml(orgRows || [])}
    ${sampleHtml()}
    ${versionHtml()}
    <div class="row gap" style="margin:14px 0">
      <button class="btn sm danger" data-act="admin-stats-cleanup">90일 지난 원본 이벤트 정리</button>
    </div>
    ${detailHtml(curRows)}
    <h3 class="admin-h3">최근 관리자 접속 <span class="small muted">— 최근 20건</span></h3>
    <div class="tblwrap"><table class="tbl">
      <tr><th>계정</th><th>동작</th><th>시각</th></tr>
      ${(logins || []).length ? logins.map(l => `<tr><td>${esc(l.name)}</td><td>${l.event === "login" ? "로그인" : "로그아웃"}</td><td>${esc(new Date(l.created_at).toLocaleString("ko-KR"))}</td></tr>`).join("") : `<tr><td colspan="3" class="muted">기록 없음</td></tr>`}
    </table></div>`;
}

export const actions = {
  "admin-stats-reload": () => { loaded = false; curRows = null; load(); },
  "admin-stats-period": el => { period = Number(el.dataset.days) || 30; loaded = false; curRows = null; load(); },
  "admin-stats-custom-date": el => { if (el.dataset.date === "from") customFrom = el.value; else customTo = el.value; if (customPeriodWindow(customFrom, customTo)) { loaded = false; curRows = null; load(); } },
  "admin-stats-tab": el => { statsTab = el.dataset.tab || "overview"; refresh(); },
  "admin-stats-detail-more": () => { detailShown += DETAIL_PAGE; detailOpen = true; refresh(); },
  "admin-stats-csv": () => {
    const csv = csvForStats(curRows || []);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `usage-stats-${period}d.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  "admin-stats-cleanup": async () => {
    const s = getSession();
    if (!s) return;
    if (!confirm("90일보다 오래된 원본 이벤트를 정리할까요? 해당 기간의 통계도 함께 사라집니다.")) return;
    try {
      await rpcRequest("cleanup_old_events", {}, { token: s.access_token });
      toast("정리했습니다", "ok");
      loaded = false; curRows = null; await load();
    } catch (e) { toast(e.message || "정리하지 못했습니다", "bad"); }
  },
};
