// 관리자 사용 통계 고도화용 순수 계산/내보내기 함수
export const ACTION_EVENTS = new Set([
  "file_load", "file_load_error", "analysis_complete", "report_started", "report_complete",
  "present_started", "present_complete", "export_error", "js_error",
]);

export function filterUsageRows(rows, filters = {}) {
  return rows.filter(r => (!filters.org || r.org === filters.org) && (!filters.src || r.src === filters.src)
    && (!filters.version || r.app_version === filters.version) && (!filters.device || r.device === filters.device)
    && (!filters.browser || r.browser === filters.browser) && (!filters.event || r.event === filters.event));
}

export function operationalKpis(rows, previousRows = []) {
  const sessions = (rs, view = "load", event = "view_enter") => rs.filter(r => r.view === view && r.event === event).reduce((n, r) => n + (+r.distinct_sessions || 0), 0);
  const count = (rs, event) => rs.filter(r => r.event === event).reduce((n, r) => n + (+r.count || 0), 0);
  const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
  const curVisit = sessions(rows), prevVisit = sessions(previousRows);
  const curAnalysis = sessions(rows, "dash", "analysis_complete"), prevAnalysis = sessions(previousRows, "dash", "analysis_complete");
  const curExport = count(rows, "export_hwpx") + count(rows, "export_pptx") + count(rows, "export_html") + count(rows, "export_pdf");
  const prevExport = count(previousRows, "export_hwpx") + count(previousRows, "export_pptx") + count(previousRows, "export_html") + count(previousRows, "export_pdf");
  const curErrors = count(rows, "js_error") + count(rows, "file_load_error") + count(rows, "export_error");
  const prevErrors = count(previousRows, "js_error") + count(previousRows, "file_load_error") + count(previousRows, "export_error");
  const delta = (a, b) => b ? Math.round((a - b) / b * 1000) / 10 : null;
  return [
    { key: "visits", label: "방문 세션", value: curVisit, delta: delta(curVisit, prevVisit), kind: "good" },
    { key: "analysis", label: "분석 완료 세션", value: curAnalysis, delta: delta(curAnalysis, prevAnalysis), kind: "good" },
    { key: "completion", label: "분석 완료율", value: pct(curAnalysis, curVisit), delta: pct(curAnalysis, curVisit) === null || pct(prevAnalysis, prevVisit) === null ? null : Math.round((pct(curAnalysis, curVisit) - pct(prevAnalysis, prevVisit)) * 10) / 10, unit: "%", kind: "good" },
    { key: "exports", label: "내보내기", value: curExport, delta: delta(curExport, prevExport), kind: "good" },
    { key: "errors", label: "오류 발생", value: curErrors, delta: delta(curErrors, prevErrors), kind: "bad" },
    { key: "errorRate", label: "오류율", value: pct(curErrors, curVisit), delta: pct(curErrors, curVisit) === null || pct(prevErrors, prevVisit) === null ? null : Math.round((pct(curErrors, curVisit) - pct(prevErrors, prevVisit)) * 10) / 10, unit: "%", kind: "bad" },
  ];
}

export function distributionKpis(orgRows = [], versionRows = [], currentVersion = "") {
  const orgs = orgRows.filter(r => r.org && r.org !== "(미상)").length;
  const total = versionRows.reduce((n, r) => n + (+r.distinct_sessions || 0), 0);
  const latest = versionRows.find(r => r.version === currentVersion);
  return [
    { key: "activeOrgs", label: "활성 기관", value: orgs, unit: "곳" },
    { key: "latestVersion", label: "최신 버전 비율", value: total ? Math.round((+latest?.distinct_sessions || 0) / total * 1000) / 10 : null, unit: "%" },
  ];
}

export function operationalFunnel(rows) {
  const steps = [
    ["방문", "load", "view_enter"], ["파일 불러오기", "load", "file_load"],
    ["분석 결과", "dash", "analysis_complete"], ["보고서/발표자료 생성", "report", "report_complete"],
  ];
  const out = [];
  for (let i = 0; i < steps.length; i++) {
    const [label, view, event] = steps[i];
    const value = rows.filter(r => r.view === view && r.event === event).reduce((n, r) => n + (+r.distinct_sessions || 0), 0);
    const prev = i ? out[i - 1].value : null;
    out.push({ label, value, rate: prev ? Math.round(value / prev * 1000) / 10 : null });
  }
  return out;
}

export function csvForStats(rows, filters = {}) {
  const esc = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const head = ["day", "view", "event", "count", "distinct_sessions", "org", "src", "app_version", "device", "browser"];
  return [head, ...filterUsageRows(rows, filters).map(r => head.map(k => r[k] ?? ""))].map(row => row.map(esc).join(",")).join("\r\n") + "\r\n";
}
