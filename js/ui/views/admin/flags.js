// 관리자 — 기능 플래그 탭: 통계 신뢰도 고도화 4종을 관리자 전용 미리보기로 먼저 켜고,
// 안정화되면 여기서 전체 공개로 전환한다(admin/content.js 의 CRUD 패턴을 그대로 따름).
import { restRequest, rpcRequest } from "../../../auth/api.js";
import { getSession } from "../../../auth/session.js";
import { esc, toast } from "../../util.js";
import { refresh } from "../../router.js";
import { icon } from "../../icons.js";
import { _resetForTest as resetFlagsCache } from "../../../admin/flags-client.js";

const LABELS = {
  smallSampleWarning: { title: "소표본·검정력 주의 문구", desc: "표본 수가 적을 때(사전·사후 n<30, 집단비교 n<10) 해석 주의 문구를 화면·보고서에 표시합니다." },
  kpiTargetAdequacy: { title: "KPI 목표 적정성 점검", desc: "전년 실적 대비 목표가 지나치게 낮게 잡혔을 때 성과지표 표에 경고를 표시합니다." },
  respondentRepresentativeness: { title: "응답자 대표성 체크", desc: "모집단 비율을 입력하면 응답자 분포와의 편차를 자료 품질 항목에 표시합니다." },
  statsTrustBadge: { title: "통계 방법 신뢰 배지", desc: "분석 결과 화면에 검증된 통계 방법(R 기준값·다중비교 보정·효과크기)을 요약해 보여줍니다." },
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
    <p class="small muted">코드에는 반영됐지만, Supabase 프로젝트에 <code>supabase/migrations/0005_feature_flags.sql</code>이 아직 적용되지 않았을 때 나타나는 안내입니다(이 저장소는 마이그레이션을 자동으로 배포하지 않고, 아래 방법 중 하나로 한 번 적용해야 합니다).</p>
    <ol class="small">
      <li><b>CLI가 있으면</b>: <code>supabase link --project-ref &lt;프로젝트 참조&gt;</code> 후 <code>supabase db push</code></li>
      <li><b>CLI가 없으면</b>: Supabase 대시보드 → SQL Editor에서 저장소의 <code>supabase/migrations/0005_feature_flags.sql</code> 내용을 그대로 붙여넣고 실행</li>
    </ol>
    <button class="btn sm" data-act="admin-flags-reload">${icon("history", 14)}적용 후 다시 시도</button>
  </div>`;
}

export function render() {
  if (missingTable) return setupHelp();
  if (error) return `<p class="hint bad" role="alert">${esc(error)}</p><button class="btn sm" data-act="admin-flags-reload">다시 시도</button>`;
  if (!rows) return `<p class="muted">${loading ? "불러오는 중…" : ""}</p>`;
  return `
    <p class="small muted">꺼진(비공개) 기능은 관리자로 로그인한 이 브라우저에서만 미리 보이고, 일반 이용자 화면에는 나타나지 않습니다. 충분히 확인한 뒤 켜면 모든 이용자에게 순차 공개됩니다.</p>
    <div class="tblwrap"><table class="tbl">
      <tr><th>기능</th><th>설명</th><th>공개 상태</th><th>전체 공개</th></tr>
      ${rows.map(r => {
        const meta = LABELS[r.key] || { title: r.key, desc: "" };
        return `<tr><td>${esc(meta.title)}</td><td class="small muted">${esc(meta.desc)}</td>
          <td>${r.enabled ? '<span class="badge ok">전체 공개</span>' : '<span class="badge muted">관리자 전용</span>'}</td>
          <td class="c"><label class="check" style="justify-content:center"><input type="checkbox" ${r.enabled ? "checked" : ""} data-change="admin-flags-toggle" data-key="${esc(r.key)}" aria-label="'${esc(meta.title)}' 전체 공개 여부"></label></td></tr>`;
      }).join("")}
    </table></div>`;
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
