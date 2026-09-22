// 관리자 — 기능 플래그 탭: 통계 신뢰도 고도화 4종을 관리자 전용 미리보기로 먼저 켜고,
// 안정화되면 여기서 전체 공개로 전환한다(admin/content.js 의 CRUD 패턴을 그대로 따름).
import { restRequest, rpcRequest } from "../../../auth/api.js";
import { getSession } from "../../../auth/session.js";
import { esc, toast } from "../../util.js";
import { refresh } from "../../router.js";
import { _resetForTest as resetFlagsCache } from "../../../admin/flags-client.js";

const LABELS = {
  smallSampleWarning: { title: "소표본·검정력 주의 문구", desc: "표본 수가 적을 때(사전·사후 n<30, 집단비교 n<10) 해석 주의 문구를 화면·보고서에 표시합니다." },
  kpiTargetAdequacy: { title: "KPI 목표 적정성 점검", desc: "전년 실적 대비 목표가 지나치게 낮게 잡혔을 때 성과지표 표에 경고를 표시합니다." },
  respondentRepresentativeness: { title: "응답자 대표성 체크", desc: "모집단 비율을 입력하면 응답자 분포와의 편차를 자료 품질 항목에 표시합니다." },
  statsTrustBadge: { title: "통계 방법 신뢰 배지", desc: "분석 결과 화면에 검증된 통계 방법(R 기준값·다중비교 보정·효과크기)을 요약해 보여줍니다." },
};

let loading = false, error = "", rows = null, loaded = false;

async function load() {
  const s = getSession();
  if (!s) return;
  loading = true; error = ""; refresh();
  try { rows = await restRequest("/feature_flags?select=key,enabled,updated_at&order=key.asc", { token: s.access_token }); }
  catch (e) { error = e.message || "불러오지 못했습니다"; }
  finally { loading = false; refresh(); }
}

export function mount() { if (!loaded) { loaded = true; load(); } }

export function render() {
  if (error) return `<p class="hint bad" role="alert">${esc(error)}</p><button class="btn sm" data-act="admin-flags-reload">다시 시도</button>`;
  if (!rows) return `<p class="muted">${loading ? "불러오는 중…" : ""}</p>`;
  return `
    <p class="small muted">꺼진(비공개) 기능은 관리자로 로그인한 이 브라우저에서만 미리 보이고, 일반 이용자 화면에는 나타나지 않습니다. 충분히 확인한 뒤 켜면 모든 이용자에게 순차 공개됩니다.</p>
    <div class="tblwrap"><table class="tbl">
      <tr><th>기능</th><th>설명</th><th>공개 상태</th><th></th></tr>
      ${rows.map(r => {
        const meta = LABELS[r.key] || { title: r.key, desc: "" };
        return `<tr><td>${esc(meta.title)}</td><td class="small muted">${esc(meta.desc)}</td>
          <td>${r.enabled ? '<span class="badge ok">전체 공개</span>' : '<span class="badge muted">관리자 전용</span>'}</td>
          <td><button class="btn sm ${r.enabled ? "" : "primary"}" data-act="admin-flags-toggle" data-key="${esc(r.key)}" data-enabled="${r.enabled ? "0" : "1"}">${r.enabled ? "관리자 전용으로 되돌리기" : "전체 공개로 전환"}</button></td></tr>`;
      }).join("")}
    </table></div>`;
}

export const actions = {
  "admin-flags-reload": () => { loaded = false; rows = null; load(); },
  "admin-flags-toggle": async el => {
    const s = getSession();
    if (!s) return;
    const key = el.dataset.key;
    const enabled = el.dataset.enabled === "1";
    if (enabled && !confirm(`"${LABELS[key]?.title || key}" 기능을 모든 이용자에게 공개할까요?`)) return;
    try {
      await rpcRequest("set_feature_flag", { p_key: key, p_enabled: enabled }, { token: s.access_token });
      resetFlagsCache(); // 이 브라우저(관리자)는 항상 미리보기 상태라 영향 없지만, 다음 조회 시 최신값을 받도록 캐시만 비움
      toast(enabled ? "전체 공개로 전환했습니다" : "관리자 전용으로 되돌렸습니다", "ok");
      loaded = false; await load();
    } catch (e) { toast(e.message || "변경하지 못했습니다", "bad"); }
  },
};
