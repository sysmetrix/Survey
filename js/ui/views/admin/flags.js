// 관리자 — 기능 플래그 탭: 통계 신뢰도 고도화 기능들을 관리자 전용 미리보기로 먼저 켜고,
// 안정화되면 여기서 전체 공개로 전환한다(admin/content.js 의 CRUD 패턴을 그대로 따름).
import { restRequest, rpcRequest } from "../../../auth/api.js";
import { getSession } from "../../../auth/session.js";
import { esc, toast } from "../../util.js";
import { refresh } from "../../router.js";
import { icon } from "../../icons.js";
import { _resetForTest as resetFlagsCache } from "../../../admin/flags-client.js";

// example: 관리자가 실제로 데이터를 올리지 않아도 어떤 모습인지 바로 알 수 있도록 넣는 정적 예시(가짜 숫자, 실제 자료 아님)
const LABELS = {
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
    코드에 새 기능(${missingKeys.map(k => esc(LABELS[k]?.title || k)).join(", ")})이 추가됐지만, 아직 최신 마이그레이션이 적용되지 않아 여기 목록에 없습니다.
    <code>supabase/migrations/0006_more_feature_flags.sql</code>을 적용한 뒤 새로고침하세요.
  </div>`;
}

function flagCard(r) {
  const meta = LABELS[r.key] || { title: r.key, desc: "", where: "", example: "" };
  return `<div class="flag-row">
    <div class="row between" style="align-items:flex-start">
      <div class="row gap" style="align-items:center;flex-wrap:wrap">
        <b>${esc(meta.title)}</b>
        ${r.enabled ? '<span class="badge ok">전체 공개</span>' : '<span class="badge muted">관리자 전용</span>'}
      </div>
      <label class="switch" title="전체 공개 여부">
        <input type="checkbox" ${r.enabled ? "checked" : ""} data-change="admin-flags-toggle" data-key="${esc(r.key)}" aria-label="'${esc(meta.title)}' 전체 공개 여부">
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
  const missingKeys = Object.keys(LABELS).filter(k => !rows.some(r => r.key === k));
  return `
    <p class="small muted">꺼진(비공개) 기능은 관리자로 로그인한 이 브라우저에서만 미리 보이고, 일반 이용자 화면에는 나타나지 않습니다. 충분히 확인한 뒤 켜면 모든 이용자에게 순차 공개됩니다.</p>
    ${missingKeys.length ? missingKeysHelp(missingKeys) : ""}
    <div class="flag-list">${rows.map(flagCard).join("")}</div>`;
}

export const actions = {
  "admin-flags-reload": () => { loaded = false; rows = null; load(); },
  "admin-flags-toggle": async el => {
    const s = getSession();
    if (!s) return;
    const key = el.dataset.key;
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
