// 앱 상태 저장소 + 분석 파이프라인 (브라우저 전용 계층이지만 DOM 미사용)
import { buildCodebook, applySavedCodebook, lintCodebook } from "../model/codebook.js";
import { buildSurvey } from "../model/survey.js";
import { analyzeSurvey } from "../analysis/run.js";
import { readBusinessFromDataset } from "../evaluation/business-sheet.js";
import { emptyLogicModel, normalizeLogicModel } from "../evaluation/logic-model.js";
import { evaluateKpis } from "../evaluation/kpi.js";
import { lintEvaluation } from "../evaluation/linkage.js";
import { buildReport } from "../report/build-report.js";
import { finalizeBlocks } from "../report/model.js";
import { buildDeck } from "../present/deck.js";
import { DEFAULT_THRESHOLDS } from "../narrative/vocab.js";
import { koDate } from "../core/util.js";

const LS_KEY = "survey-v5-settings";
function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { /* 비공개 모드 등 */ }
  return { orgName: saved.orgName || "부천여성청소년재단", reportTitle: "", date: koDate(), thresholds: { ...DEFAULT_THRESHOLDS, ...(saved.thresholds || {}) } };
}
export function persistSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ orgName: state.settings.orgName, thresholds: state.settings.thresholds })); return true; } catch { return false; }
}

export const state = {
  dataset: null, codebook: null,
  logicModel: emptyLogicModel(), kpis: [],
  settings: loadSettings(),
  overrides: {}, hidden: [], hiddenChapters: [],
  deckHidden: [],
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
  let note = null;
  if (project?.codebook) {
    const r = applySavedCodebook(project.codebook, dataset);
    state.codebook = r.codebook;
    note = `저장된 설정 적용: ${r.matched}/${r.total}개 열 연결`;
  } else {
    state.codebook = buildCodebook(dataset);
  }
  const biz = readBusinessFromDataset(dataset, state.codebook);
  state.businessFound = biz.found;
  if (!project) {
    state.logicModel = biz.logicModel || emptyLogicModel();
    state.kpis = biz.kpis || [];
    state.overrides = {}; state.hidden = []; state.hiddenChapters = []; state.deckHidden = [];
    state.settings.reportTitle = "";
  }
  invalidate();
  return note;
}

/** 프로젝트 적용 (원자료 포함 시 데이터도 복원) */
export function applyProject(p) {
  state.logicModel = normalizeLogicModel(p.logicModel || {});
  state.kpis = p.kpis || [];
  state.overrides = p.report?.overrides || {};
  state.hidden = p.report?.hidden || [];
  state.hiddenChapters = p.report?.hiddenChapters || [];
  state.deckHidden = p.present?.hidden || [];
  state.excludeStraight = !!p.excludeStraight;
  Object.assign(state.settings, p.settings || {});
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
  const analysis = analyzeSurvey(survey);
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
  const settingsKey = JSON.stringify([state.settings.orgName, state.settings.reportTitle, state.settings.date]);
  if (deckCache.results !== r || deckCache.settingsKey !== settingsKey) {
    deckCache = { results: r, settingsKey, slides: buildDeck({ analysis: r.analysis, evaluation: r.evaluation, logicModel: state.logicModel, codebook: state.codebook, settings: state.settings }) };
  }
  return deckCache.slides;
}

export function reportBlocks() {
  const r = compute();
  if (!r) return [];
  return finalizeBlocks(r.blocksRaw, { overrides: state.overrides, hidden: new Set(state.hidden), hiddenChapters: new Set(state.hiddenChapters) });
}
