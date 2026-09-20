// 프로젝트 파일(*.survey.json): 코드북·사업정보·성과지표·보고서 수정사항 (원자료는 선택)
export const PROJECT_APP = "survey-v5";
export const PROJECT_SCHEMA = 1;

export function projectToJson(state, { includeData = false } = {}) {
  const obj = {
    app: PROJECT_APP, schema: PROJECT_SCHEMA, savedAt: new Date().toISOString(),
    settings: {
      orgName: state.settings.orgName, author: state.settings.author, reportTitle: state.settings.reportTitle, date: state.settings.date, thresholds: state.settings.thresholds, scoreBasis: state.settings.scoreBasis,
      fontPreset: state.settings.fontPreset, fontBody: state.settings.fontBody, fontHeading: state.settings.fontHeading, baseSize: state.settings.baseSize, lineSpacing: state.settings.lineSpacing,
    },
    codebook: state.codebook, logicModel: state.logicModel, kpis: state.kpis,
    report: { overrides: state.overrides, overrideBase: state.overrideBase || {}, hidden: state.hidden, hiddenChapters: state.hiddenChapters },
    present: { hidden: state.deckHidden || [] },
    excludeStraight: state.excludeStraight,
    dataFingerprint: state.dataset ? { fileName: state.dataset.fileName, headersHash: state.codebook?.headersHash, rows: state.dataset.sheets.map(s => s.rows.length) } : null,
  };
  if (includeData && state.dataset) obj.dataset = state.dataset;
  return JSON.stringify(obj, null, 1);
}

const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
export const MAX_PROJECT_CHARS = 80 * 1024 * 1024;

/** 신뢰할 수 없는 JSON 읽기: 크기 제한 + 프로토타입 오염 키 제거 */
export function safeJsonParse(text, maxChars = MAX_PROJECT_CHARS) {
  if (typeof text !== "string") throw new Error("파일 내용을 읽을 수 없습니다");
  if (text.length > maxChars) throw new Error("파일이 너무 큽니다");
  return JSON.parse(text, (k, v) => (BAD_KEYS.has(k) ? undefined : v));
}

export function parseProject(text) {
  const obj = safeJsonParse(text);
  if (!obj || typeof obj !== "object" || obj.app !== PROJECT_APP) throw new Error("설문 분석 도구 v5 프로젝트 파일이 아닙니다");
  if (obj.schema > PROJECT_SCHEMA) throw new Error("더 최신 버전에서 저장된 파일입니다");
  // 구조 점검 (잘못된 형식이 화면 오류로 번지지 않도록)
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  if (obj.settings !== undefined && !isObj(obj.settings)) throw new Error("프로젝트 파일 형식 오류(settings)");
  if (obj.codebook !== undefined && obj.codebook !== null && !(isObj(obj.codebook) && Array.isArray(obj.codebook.columns))) throw new Error("프로젝트 파일 형식 오류(codebook)");
  if (obj.kpis !== undefined && !Array.isArray(obj.kpis)) throw new Error("프로젝트 파일 형식 오류(kpis)");
  if (obj.report !== undefined && !isObj(obj.report)) throw new Error("프로젝트 파일 형식 오류(report)");
  if (obj.dataset !== undefined && !(isObj(obj.dataset) && Array.isArray(obj.dataset.sheets))) throw new Error("프로젝트 파일 형식 오류(dataset)");
  // 원자료의 날짜 문자열 복원은 불필요 (분석은 문자열/숫자 기반)
  return obj;
}
