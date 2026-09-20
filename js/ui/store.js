// 앱 상태 저장소 + 분석 파이프라인 (브라우저 전용 계층이지만 DOM 미사용)
import { buildCodebook, applySavedCodebook, lintCodebook, dataSheetCandidates } from "../model/codebook.js";
import { buildSurvey } from "../model/survey.js";
import { analyzeSurvey } from "../analysis/run.js";
import { readBusinessFromDataset } from "../evaluation/business-sheet.js";
import { emptyLogicModel, normalizeLogicModel } from "../evaluation/logic-model.js";
import { evaluateKpis } from "../evaluation/kpi.js";
import { lintEvaluation } from "../evaluation/linkage.js";
import { buildReport } from "../report/build-report.js";
import { finalizeBlocks } from "../report/model.js";
import { buildDeck } from "../present/deck.js";
import { DEFAULT_THRESHOLDS, cleanScoreBasis } from "../narrative/vocab.js";
import { koDate } from "../core/util.js";
import { FONT_PRESETS, FONT_SIZES, LINE_SPACINGS, DEFAULT_FONT_PRESET, DEFAULT_BASE_SIZE, DEFAULT_LINE_SPACING, cleanFontName } from "../report/hwpx/fonts.js";

const LS_KEY = "survey-v5-settings";
function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { /* 비공개 모드 등 */ }
  return {
    orgName: saved.orgName ?? "부천여성청소년재단", author: saved.author || "",
    reportTitle: "", date: koDate(), thresholds: { ...DEFAULT_THRESHOLDS, ...(saved.thresholds || {}) },
    scoreBasis: cleanScoreBasis(saved.scoreBasis),
    ...pickDocSettings(saved),
  };
}
/** 한글 문서 서식 설정 (글꼴·크기·줄 간격) — 값 검증 후 기본값 */
export function pickDocSettings(o = {}) {
  const num = (v, ok, d) => (ok.includes(Number(v)) ? Number(v) : d);
  return {
    fontPreset: FONT_PRESETS.some(p => p.id === o.fontPreset) ? o.fontPreset : DEFAULT_FONT_PRESET,
    fontBody: cleanFontName(o.fontBody), fontHeading: cleanFontName(o.fontHeading),
    baseSize: num(o.baseSize, FONT_SIZES, DEFAULT_BASE_SIZE), lineSpacing: num(o.lineSpacing, LINE_SPACINGS, DEFAULT_LINE_SPACING),
  };
}
const DOC_KEYS = ["fontPreset", "fontBody", "fontHeading", "baseSize", "lineSpacing"];
export function persistSettings() {
  const s = state.settings;
  try { localStorage.setItem(LS_KEY, JSON.stringify({ orgName: s.orgName, author: s.author, thresholds: s.thresholds, scoreBasis: s.scoreBasis, ...Object.fromEntries(DOC_KEYS.map(k => [k, s[k]])) })); return true; } catch { return false; }
}

export const state = {
  dataset: null, codebook: null, dataSheetIndex: null,
  logicModel: emptyLogicModel(), kpis: [],
  settings: loadSettings(),
  overrides: {}, hidden: [], hiddenChapters: [],
  deckHidden: [], overrideBase: {},
  excludeStraight: false,
  businessFound: null,
  results: null, dirty: true,
};

const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = () => listeners.forEach(fn => fn(state));
export const invalidate = () => { state.dirty = true; };

/** 새 데이터셋 적용 (프로젝트의 코드북이 있으면 재연결) */
export function loadDataset(dataset, project = null) {
  state.dataset = dataset;
  state.dataSheetIndex = null;
  let note = null;
  if (project?.codebook) {
    const r = applySavedCodebook(project.codebook, dataset);
    state.codebook = r.codebook;
    note = `저장된 설정 적용: ${r.matched}/${r.total}개 열 연결`;
  } else {
    // 사전·사후 짝이 없는데 '응답' 후보 시트가 여럿이면 일단 첫 시트로 시작 — 데이터 설정 화면에서 고를 수 있음
    state.codebook = buildCodebook(dataset);
  }
  const biz = readBusinessFromDataset(dataset, state.codebook);
  state.businessFound = biz.found;
  if (!project) {
    state.logicModel = biz.logicModel || emptyLogicModel();
    state.kpis = biz.kpis || [];
    state.overrides = {}; state.hidden = []; state.hiddenChapters = []; state.deckHidden = []; state.overrideBase = {};
    state.settings.reportTitle = "";
  }
  invalidate();
  return note;
}

/** 사전·사후 짝이 없을 때, 응답으로 쓸 시트를 사용자가 다시 고름(다른 열 설정은 처음부터 다시 판별) */
export function chooseDataSheet(index) {
  if (!state.dataset || !dataSheetCandidates(state.dataset).some(c => c.index === index)) return;
  state.dataSheetIndex = index;
  state.codebook = buildCodebook(state.dataset, { dataSheetIndex: index });
  const biz = readBusinessFromDataset(state.dataset, state.codebook);
  state.businessFound = biz.found;
  state.logicModel = biz.logicModel || emptyLogicModel();
  state.kpis = biz.kpis || [];
  state.overrides = {}; state.hidden = []; state.hiddenChapters = []; state.deckHidden = []; state.overrideBase = {};
  invalidate();
}

/** 외부(프로젝트 파일·내역)에서 온 설정은 알려진 항목만 검증해 반영 */
function applySettingsFrom(s) {
  if (!s || typeof s !== "object") return;
  ["orgName", "author", "reportTitle", "date"].forEach(k => { if (typeof s[k] === "string") state.settings[k] = s[k].slice(0, 200); });
  if (s.thresholds && typeof s.thresholds === "object" && !Array.isArray(s.thresholds)) state.settings.thresholds = { ...DEFAULT_THRESHOLDS, ...s.thresholds };
  if (s.scoreBasis !== undefined) state.settings.scoreBasis = cleanScoreBasis(s.scoreBasis);
  Object.assign(state.settings, pickDocSettings({ ...state.settings, ...s }));
}

/** 편집 가능한 값 적용 (되돌리기·버전 복원) — 같은 설문일 때만 코드북 교체 */
export function applyEditable(e) {
  if (!e || typeof e !== "object") return;
  if (e.codebook && state.codebook && e.codebook.headersHash === state.codebook.headersHash) state.codebook = e.codebook;
  state.logicModel = normalizeLogicModel(e.logicModel || {});
  state.kpis = Array.isArray(e.kpis) ? e.kpis : [];
  state.overrides = e.overrides && typeof e.overrides === "object" ? e.overrides : {};
  state.hidden = Array.isArray(e.hidden) ? e.hidden : [];
  state.hiddenChapters = Array.isArray(e.hiddenChapters) ? e.hiddenChapters : [];
  state.deckHidden = Array.isArray(e.deckHidden) ? e.deckHidden : [];
  state.overrideBase = e.overrideBase && typeof e.overrideBase === "object" ? e.overrideBase : {};
  state.excludeStraight = !!e.excludeStraight;
  applySettingsFrom(e.settings);
  invalidate();
}

/** 프로젝트 적용 (원자료 포함 시 데이터도 복원) */
export function applyProject(p) {
  state.logicModel = normalizeLogicModel(p.logicModel || {});
  state.kpis = p.kpis || [];
  state.overrides = p.report?.overrides || {};
  state.hidden = p.report?.hidden || [];
  state.hiddenChapters = p.report?.hiddenChapters || [];
  state.deckHidden = p.present?.hidden || [];
  state.overrideBase = p.report?.overrideBase || {};
  state.excludeStraight = !!p.excludeStraight;
  applySettingsFrom(p.settings);
  state.pendingProject = p;
  if (p.dataset) return loadDataset(p.dataset, p);
  invalidate();
  return null;
}

/** 분석 파이프라인 (변경 시에만 재계산) */
export function compute() {
  if (!state.dataset || !state.codebook) return null;
  if (!state.dirty && state.results) return state.results;
  const t0 = performance.now();
  const cb = state.codebook;
  let survey = buildSurvey(state.dataset, cb);
  const straight = survey.straightLiners.length;
  let excludedCount = 0;
  if (state.excludeStraight && straight) {
    survey = buildSurvey(state.dataset, cb, { exclude: new Set(survey.straightLiners) });
    excludedCount = straight;
  }
  const analysis = analyzeSurvey(survey, { scoreBasis: state.settings.scoreBasis });
  if (excludedCount) analysis.meta.straightLiners = straight;
  const kpis = state.kpis.filter(k => k.name);
  const evaluation = kpis.length ? evaluateKpis(kpis, analysis, cb, state.settings.thresholds) : null;
  const lint = kpis.length || state.logicModel.goals.length ? lintEvaluation(state.logicModel, kpis, cb, analysis, state.settings.thresholds) : [];
  const blocksRaw = buildReport({ analysis, evaluation, lint, logicModel: state.logicModel, codebook: cb, settings: { ...state.settings, excludedCount } });
  state.results = { survey, analysis, evaluation, lint, blocksRaw, straight, excludedCount, codebookWarnings: lintCodebook(cb), ms: Math.round(performance.now() - t0) };
  state.dirty = false;
  return state.results;
}

/** 발표 슬라이드 (분석 결과가 바뀔 때만 다시 구성) */
let deckCache = { results: null, settingsKey: "", slides: [] };
export function deckSlides() {
  const r = compute();
  if (!r) return [];
  const settingsKey = JSON.stringify([state.settings.orgName, state.settings.author, state.settings.reportTitle, state.settings.date, state.settings.scoreBasis]);
  if (deckCache.results !== r || deckCache.settingsKey !== settingsKey) {
    deckCache = { results: r, settingsKey, slides: buildDeck({ analysis: r.analysis, evaluation: r.evaluation, logicModel: state.logicModel, codebook: state.codebook, settings: state.settings }) };
  }
  return deckCache.slides;
}

export function reportBlocks() {
  const r = compute();
  if (!r) return [];
  return finalizeBlocks(r.blocksRaw, { overrides: state.overrides, hidden: new Set(state.hidden), hiddenChapters: new Set(state.hiddenChapters), overrideBase: state.overrideBase || {} });
}
