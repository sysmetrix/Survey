// 프로젝트 파일(*.survey.json): 코드북·사업정보·성과지표·보고서 수정사항 (원자료는 선택)
export const PROJECT_APP = "survey-v5";
export const PROJECT_SCHEMA = 1;

export function projectToJson(state, { includeData = false } = {}) {
  const obj = {
    app: PROJECT_APP, schema: PROJECT_SCHEMA, savedAt: new Date().toISOString(),
    settings: { orgName: state.settings.orgName, reportTitle: state.settings.reportTitle, date: state.settings.date, thresholds: state.settings.thresholds },
    codebook: state.codebook, logicModel: state.logicModel, kpis: state.kpis,
    report: { overrides: state.overrides, hidden: state.hidden, hiddenChapters: state.hiddenChapters },
    excludeStraight: state.excludeStraight,
    dataFingerprint: state.dataset ? { fileName: state.dataset.fileName, headersHash: state.codebook?.headersHash, rows: state.dataset.sheets.map(s => s.rows.length) } : null,
  };
  if (includeData && state.dataset) obj.dataset = state.dataset;
  return JSON.stringify(obj, null, 1);
}

export function parseProject(text) {
  const obj = JSON.parse(text);
  if (obj.app !== PROJECT_APP) throw new Error("설문 분석 도구 v5 프로젝트 파일이 아닙니다");
  if (obj.schema > PROJECT_SCHEMA) throw new Error("더 최신 버전에서 저장된 파일입니다");
  // 원자료의 날짜 문자열 복원은 불필요 (분석은 문자열/숫자 기반)
  return obj;
}
