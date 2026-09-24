// 관리자 — 기능 플래그 탭: 통계 신뢰도 고도화 기능들을 관리자 전용 미리보기로 먼저 켜고,
// 안정화되면 여기서 전체 공개로 전환한다(admin/content.js 의 CRUD 패턴을 그대로 따름).
import { restRequest, rpcRequest } from "../../../auth/api.js";
import { getSession } from "../../../auth/session.js";
import { esc, toast } from "../../util.js";
import { refresh } from "../../router.js";
import { icon } from "../../icons.js";
import { featureStatus } from "../../../admin/feature-status.js";
import { _resetForTest as resetFlagsCache } from "../../../admin/flags-client.js";

// example: 관리자가 실제로 데이터를 올리지 않아도 어떤 모습인지 바로 알 수 있도록 넣는 정적 예시(가짜 숫자, 실제 자료 아님)
const LABELS = {
  operationalUsageStats: { title: "관리자 운영 사용 통계", desc: "운영 KPI·행동 퍼널·오류 모니터링을 관리자 미리보기로 검증합니다.", where: "관리자 사용 통계 화면", example: "" },
  guidedKpiSetup: { title: "성과지표 간편 설정", desc: "목적 선택·카드 입력·목표 근거를 관리자 검증합니다.", where: "③ 성과지표", example: "" },
  smallSampleWarning: {
    title: "소표본·검정력 주의 문구",
    desc: "표본 수가 적을 때(사전·사후 n<30, 집단비교 n<10) 해석 주의 문구를 표시합니다.",
    where: "④ 분석 결과 화면 — 상단 핵심 지표 카드(‘응답자’·‘사전→사후’)",
    example: `<div class="cards" style="margin:0"><div class="kcard t-mid" style="min-width:150px"><span>응답자</span><b>18명</b><small>단일시점조사 · ⚠ 소표본 주의</small></div></div>`,
  },
  kpiTargetAdequacy: {
    title: "KPI 목표 적정성 점검",
    desc: "전년 실적 대비 목표가 지나치게 낮게 잡혔을 때 경고를 표시합니다.",
    where: "③ 성과지표 화면 — 성과지표 표에 ‘전년 실적’ 입력 열 추가",
    example: `<table class="tbl mini" style="margin:0"><tr><th>목표</th><th>전년 실적</th></tr><tr><td>82</td><td>81<div class="small warn-text">${icon("alert", 12)} 목표 검토</div></td></tr></table>`,
  },
  kpiTrendChart: {
    title: "KPI 전년·목표·실적 추이 막대",
    desc: "성과지표 표에 전년 실적 → 목표 → 실적을 가로 막대로 나란히 비교해 보여줍니다.",
    where: "③ 성과지표 화면 — 성과지표 표에 ‘추이’ 열 추가",
    example: `<div class="kpi-trend">
      <div class="kpi-trend-row"><span class="small muted">전년</span><span class="kpi-trend-bar"><span style="width:60%;background:var(--border-strong)"></span></span><span class="small">78</span></div>
      <div class="kpi-trend-row"><span class="small muted">목표</span><span class="kpi-trend-bar"><span style="width:75%;background:var(--info)"></span></span><span class="small">85</span></div>
      <div class="kpi-trend-row"><span class="small muted">실적</span><span class="kpi-trend-bar"><span style="width:82%;background:var(--brand)"></span></span><span class="small">92</span></div>
    </div>`,
  },
  respondentRepresentativeness: {
    title: "응답자 대표성 체크",
    desc: "모집단 비율을 입력하면 응답자 분포와의 편차를 보여줍니다.",
    where: "② 데이터 설정 화면(모집단 비율 입력) → ④ 분석 결과 화면 ‘자료 품질·상관’ 탭(결과 표시)",
    example: `<table class="tbl mini" style="margin:0"><tr><th>구분</th><th>응답자</th><th>모집단</th><th>차이</th></tr><tr><td>여</td><td>72.0</td><td>50.0</td><td class="warn-text">+22.0</td></tr></table>`,
  },
  representativenessInReport: {
    title: "응답자 대표성 — 보고서 반영",
    desc: "응답자 대표성 체크 결과를 한글(HWPX) 보고서 부록에도 표로 추가합니다.",
    where: "⑤ 보고서 화면 → 한글(HWPX) 다운로드 — [부록] 세부 분석표",
    example: `<p class="small muted" style="margin:0">부록에 <b>‘응답자 대표성(모집단 비율 대비)’</b> 표가 자동으로 추가됩니다(위 응답자 대표성 체크와 같은 내용).</p>`,
  },
  measurementQuality: {
    title: "설문 측정 품질 점검",
    desc: "사전·사후 문항 짝, 척도 범위, 영역별 문항 수, 소표본을 점검합니다.",
    where: "③ 성과지표 화면 — 설문 측정 품질 점검 카드",
    example: `<p class="small muted" style="margin:0">사전·사후 문항 일치·척도·문항 수·표본 규모를 분석 전에 확인합니다.</p>`,
  },
  surveyVersioning: {
    title: "설문 문항 버전 관리",
    desc: "표준 문항 세트의 개정일·버전과 사전·사후 일치 여부를 관리합니다.",
    where: "② 데이터 설정·③ 성과지표 화면 — 문항 세트 품질 정보",
    example: "",
  },
  ageSurveyTemplates: {
    title: "연령별 표준 설문 템플릿",
    desc: "초기 청소년용과 중·후기 청소년용 표준 설문 템플릿을 구분합니다.",
    where: "② 데이터 설정 화면 — 표준 설문 템플릿",
    example: "",
  },
  competencyProfile: {
    title: "청소년 핵심역량 프로파일",
    desc: "역량별 점수와 사전·사후 변화 프로파일을 제공합니다.",
    where: "④ 분석 결과 화면 — 역량 프로파일",
    example: "",
  },
  standardComparisons: {
    title: "표준 문항 비교 분석",
    desc: "동일 문항·척도·대상일 때만 연도·사업·집단 비교를 허용합니다.",
    where: "④ 분석 결과 화면 — 표준 비교",
    example: "",
  },
  statsTrustBadge: {
    title: "통계 방법 신뢰 배지",
    desc: "검증된 통계 방법(R 기준값·다중비교 보정·효과크기)을 요약해 보여줍니다.",
    where: "④ 분석 결과 화면 — 맨 위 페이지 제목 바로 아래",
    example: `<p class="small muted row gap" style="align-items:center;margin:0">${icon("shield", 13)} 통계 방법: R 기준값 대비 검증 · 다중비교 Holm/BH 보정 · 효과크기(95% 신뢰구간) 병기</p>`,
  },
};

let loading = false, error = "", missingTable = false, rows = null, loaded = false;

/** PostgREST가 테이블을 못 찾을 때(마이그레이션 미적용) 특유의 오류 문구를 남김 — 그대로 보여주면 관리자가 원인을 알기 어려움 */
export const isMissingTableError = msg => /schema cache|does not exist|42P01|PGRST205/i.test(msg || "");

async function load() {
  const s = getSession();
  if (!s) return;
  loading = true; error = ""; missingTable = false; refresh();
  try { rows = await restRequest("/feature_flags?select=key,enabled,updated_at&order=key.asc", { token: s.access_token }); }
  catch (e) {
    if (isMissingTableError(e.message)) missingTable = true;
    else error = e.message || "불러오지 못했습니다";
  }
  finally { loading = false; refresh(); }
}

export function mount() { if (!loaded) { loaded = true; load(); } }

function setupHelp() {
  return `<div class="card" style="margin-top:12px">
    <h3>${icon("alert", 16)} 기능 플래그 표가 아직 없습니다</h3>
    <p class="small muted">코드에는 반영됐지만, Supabase 프로젝트에 <code>supabase/migrations/</code>의 기능 플래그 마이그레이션이 아직 적용되지 않았을 때 나타나는 안내입니다(이 저장소는 마이그레이션을 자동으로 배포하지 않고, 아래 방법 중 하나로 한 번 적용해야 합니다).</p>
    <ol class="small">
      <li><b>CLI가 있으면</b>: <code>supabase link --project-ref &lt;프로젝트 참조&gt;</code> 후 <code>supabase db push</code></li>
      <li><b>CLI가 없으면</b>: Supabase 대시보드 → SQL Editor에서 저장소의 <code>supabase/migrations/0005_feature_flags.sql</code>, <code>0006_more_feature_flags.sql</code> 내용을 순서대로 붙여넣고 실행</li>
    </ol>
    <button class="btn sm" data-act="admin-flags-reload">${icon("history", 14)}적용 후 다시 시도</button>
  </div>`;
}

function missingKeysHelp(missingKeys) {
  return `<div class="hint" role="status" style="margin-bottom:14px">
    새 기능(${missingKeys.map(k => esc(LABELS[k]?.title || k)).join(", ")})의 서버 설정이 없어 기본 비공개로 표시합니다. 구현된 기능은 스위치 변경 시 저장됩니다.
  </div>`;
}

function flagCard(r) {
  const meta = LABELS[r.key] || { title: r.key, desc: "", where: "", example: "" };
  const planned = featureStatus(r.key) === "planned";
  // preview 는 관리자 검증 상태이므로 전체 공개 스위치를 조작할 수 있어야 한다.
  // 실제 잠금은 아직 구현되지 않은 planned 기능에만 적용한다.
  const locked = planned;
  return `<div class="flag-row">
    <div class="row between" style="align-items:flex-start">
      <div class="row gap" style="align-items:center;flex-wrap:wrap">
        <b>${esc(meta.title)}</b>
        ${planned ? '<span class="badge muted">개발 예정 · 아직 사용할 수 없음</span>' : locked ? '<span class="badge muted">관리자 검증 · 공개 조건 미충족</span>' : r.enabled ? '<span class="badge ok">전체 공개</span>' : '<span class="badge muted">관리자 검증</span>'}
      </div>
      <label class="switch" title="전체 공개 여부">
        <input type="checkbox" ${locked ? "disabled" : r.enabled ? "checked" : ""} data-change="admin-flags-toggle" data-key="${esc(r.key)}" aria-label="'${esc(meta.title)}' 전체 공개 여부">
        <span class="track"><span class="thumb"></span></span>
      </label>
    </div>
    <p class="small muted flag-desc">${esc(meta.desc)}</p>
    ${meta.where ? `<p class="small flag-where">${icon("eye", 13)}${esc(meta.where)}</p>` : ""}
    ${meta.example ? `<div class="flag-example"><div class="flag-example-label">예시</div>${meta.example}</div>` : ""}
  </div>`;
}

export function render() {
  if (missingTable) return setupHelp();
  if (error) return `<p class="hint bad" role="alert">${esc(error)}</p><button class="btn sm" data-act="admin-flags-reload">다시 시도</button>`;
  if (!rows) return `<p class="muted">${loading ? "불러오는 중…" : ""}</p>`;
  // DB 시드(0006)가 아직 적용되지 않은 환경에서도 관리자가 스위치를 보고 켤 수 있게
  // 코드에 등록된 플래그를 기본 비공개 행으로 합친다. 켜기는 RPC upsert가 처리한다.
  const known = Object.keys(LABELS).map(key => ({ key, enabled: false, updated_at: null, _virtual: true }));
  const byKey = new Map((rows || []).map(r => [r.key, r]));
  known.forEach(r => { if (!byKey.has(r.key)) byKey.set(r.key, r); });
  const visibleRows = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  const missingKeys = visibleRows.filter(r => r._virtual).map(r => r.key);
  return `
    <p class="small muted">꺼진(비공개) 기능은 관리자로 로그인한 이 브라우저에서만 미리 보이고, 일반 이용자 화면에는 나타나지 않습니다. 충분히 확인한 뒤 켜면 모든 이용자에게 순차 공개됩니다.</p>
    ${missingKeys.length ? missingKeysHelp(missingKeys) : ""}
    <div class="flag-list">${visibleRows.map(flagCard).join("")}</div>`;
}

export const actions = {
  "admin-flags-reload": () => { loaded = false; rows = null; load(); },
  "admin-flags-toggle": async el => {
    const s = getSession();
    if (!s) return;
    const key = el.dataset.key;
    if (featureStatus(key) !== "ready") { el.checked = false; return; }
    const enabled = el.checked;
    if (enabled && !confirm(`"${LABELS[key]?.title || key}" 기능을 모든 이용자에게 공개할까요?`)) { el.checked = false; return; }
    try {
      await rpcRequest("set_feature_flag", { p_key: key, p_enabled: enabled }, { token: s.access_token });
      resetFlagsCache(); // 이 브라우저(관리자)는 항상 미리보기 상태라 영향 없지만, 다음 조회 시 최신값을 받도록 캐시만 비움
      toast(enabled ? "전체 공개로 전환했습니다" : "관리자 전용으로 되돌렸습니다", "ok");
      loaded = false; await load();
    } catch (e) { el.checked = !enabled; toast(e.message || "변경하지 못했습니다", "bad"); }
  },
};
