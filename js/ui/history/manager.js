// 작업 내역 관리: 자동 저장(내용 해시로 중복 방지·5분 단위 합치기), 직접 버전 저장, 되돌리기/다시 실행,
// 버전 비교·복원(복원 직전 상태 자동 보관), 원자료 암호화 보관(선택), 백업 내보내기/가져오기, 탭 간 동기화, v4 기록 정리
import { historyDb, idbAvailable } from "./db.js";
import { state, compute, applyEditable, applyProject } from "../store.js";
import { captureEditable, stableStringify, contentHash, projectIdOf, summarize, planRetention, diffEditable } from "../../history/snapshot.js";
import { createUndoStack } from "../../history/undo.js";
import { encryptJson, decryptJson, encryptLocalJson, decryptLocalJson } from "../../history/crypto.js";
import { APP_VERSION_HISTORY } from "./version.js";

const PREF_KEY = "survey-v5-history-prefs";
export const prefs = (() => {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { /* 저장소 없음 */ }
  return { autosave: p.autosave !== false, maxAuto: [10, 30, 100].includes(p.maxAuto) ? p.maxAuto : 30, maxAgeDays: [30, 90, 365].includes(p.maxAgeDays) ? p.maxAgeDays : 90 };
})();
export function savePrefs(patch) {
  Object.assign(prefs, patch);
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* 무시 */ }
}

export const cache = { available: idbAvailable(), ready: false, projects: [], storage: null, persisted: null, error: null, saving: false, lastSavedAt: 0 };
const undo = createUndoStack({ limit: 80 });
let timer = 0, lastSavedHash = null, lastAuto = { id: null, at: 0, project: null }, applying = false, channel = null;
let notify = () => {};

export async function initHistory({ onUpdate }) {
  notify = onUpdate || (() => {});
  if (!cache.available) return;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("survey-v5-history");
    channel.onmessage = () => refreshCache().then(() => notify());
  }
  await refreshCache();
  notify();
}

export async function refreshCache() {
  if (!cache.available) return;
  try {
    cache.projects = await historyDb.listProjects();
    cache.storage = (await navigator.storage?.estimate?.()) || null;
    cache.persisted = (await navigator.storage?.persisted?.()) ?? null;
    cache.ready = true;
  } catch (e) {
    cache.error = e.message;
    cache.available = false;
  }
}
const broadcast = () => channel?.postMessage({ type: "changed", at: Date.now() });

// ───────────── 되돌리기 / 다시 실행 ─────────────
const serialize = () => stableStringify(captureEditable(state));
/** 사용자 조작 뒤 호출: 바뀐 내용이 있으면 되돌리기 목록에 쌓고 자동 저장 예약 */
export function trackChange() {
  if (!state.codebook || applying) return false;
  const changed = undo.record(serialize());
  if (changed) scheduleAutosave();
  return changed;
}
export function resetTracking() { undo.reset(state.codebook ? serialize() : null); lastSavedHash = null; lastAuto = { id: null, at: 0, project: null }; }
export const canUndo = () => undo.canUndo;
export const canRedo = () => undo.canRedo;
function applySerialized(s) {
  applying = true;
  try { applyEditable(JSON.parse(s)); } finally { applying = false; }
  scheduleAutosave();
}
export function undoChange() { const s = undo.undo(); if (s === null) return false; applySerialized(s); return true; }
export function redoChange() { const s = undo.redo(); if (s === null) return false; applySerialized(s); return true; }

// ───────────── 저장 ─────────────
export function scheduleAutosave() {
  if (!prefs.autosave || !cache.available || !state.codebook) return;
  clearTimeout(timer);
  timer = setTimeout(() => { saveSnapshot("auto").catch(e => console.warn("자동 저장 실패:", e)); }, 2500);
}
export const hasPendingSave = () => !!timer && cache.saving;

const withLock = fn => (navigator.locks?.request ? navigator.locks.request("survey-v5-history", fn) : fn());
const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * @param {'auto'|'manual'|'load'|'export'|'restore'} kind
 * @param {{label?:string, includeData?:boolean, passphrase?:string, localData?:boolean}} opts
 */
export async function saveSnapshot(kind = "auto", { label = "", includeData = false, passphrase = "", localData = false } = {}) {
  if (!cache.available || !state.codebook) return null;
  clearTimeout(timer); timer = 0;
  const editable = captureEditable(state);
  const hash = contentHash(stableStringify(editable));
  const pid = projectIdOf(state.codebook);
  if (!pid || (kind === "auto" && hash === lastSavedHash)) return null;
  const dataEnc = includeData && state.dataset ? (localData ? await encryptLocalJson(state.dataset) : await encryptJson(state.dataset, passphrase)) : null;
  const summary = summarize(state, compute());
  cache.saving = true;
  try {
    return await withLock(async () => {
      const now = Date.now();
      const project = (await historyDb.getProject(pid)) || { id: pid, createdAt: now, pinned: false, customName: "" };
      Object.assign(project, {
        updatedAt: now, headersHash: state.codebook.headersHash, summary,
        hasData: !!dataEnc || !!project.hasData,
        name: project.customName || summary.programName || summary.reportTitle || summary.fileName.replace(/\.[^.]+$/, "") || "이름 없는 작업",
      });
      const coalesce = kind === "auto" && lastAuto.project === pid && lastAuto.id && now - lastAuto.at < 5 * 60000;
      const snap = {
        id: coalesce ? lastAuto.id : newId(), projectId: pid, kind, label: String(label || "").slice(0, 80),
        createdAt: now, hash, summary, data: editable, pinned: false, appVersion: APP_VERSION_HISTORY,
        ...(dataEnc ? { dataEnc, hasData: true } : {}),
      };
      await historyDb.putSnapshotAndProject(snap, project);
      if (kind === "auto") lastAuto = { id: lastAuto.project === pid && coalesce ? lastAuto.id : snap.id, at: coalesce ? lastAuto.at : now, project: pid };
      else lastAuto = { id: null, at: 0, project: pid };
      lastSavedHash = hash;
      const snaps = await historyDb.listSnapshots(pid);
      const remove = planRetention(snaps, prefs);
      if (remove.length) await historyDb.deleteSnapshots(remove);
      const removed = new Set(remove);
      const remaining = snaps.filter(s => !removed.has(s.id));
      project.snapshotCount = remaining.length;
      project.hasData = remaining.some(s => s.hasData && s.dataEnc);
      await historyDb.putProject(project);
      cache.lastSavedAt = now;
      await refreshCache();
      broadcast();
      notify();
      return snap;
    });
  } finally { cache.saving = false; }
}

export const listSnapshots = id => historyDb.listSnapshots(id);

/** 프로젝트의 최신 편집 상태와 보관된 원자료를 함께 복원한다. */
export async function resumeProject(projectId) {
  const snaps = await historyDb.listSnapshots(projectId);
  const latest = snaps.find(s => s.data);
  if (!latest) throw new Error("복원할 작업 버전이 없습니다");
  if (state.codebook?.headersHash === latest.data.codebook?.headersHash && state.dataset) {
    applying = true;
    try { applyEditable(latest.data); } finally { applying = false; }
    resetTracking();
    return { mode: "ready" };
  }
  const raw = snaps.find(s => s.hasData && s.dataEnc);
  if (!raw) {
    applyProject(toProject(latest));
    return { mode: "needFile", fileName: latest.summary?.fileName || "" };
  }
  if (raw.dataEnc.v !== 2) return { mode: "needPassword", snapshotId: raw.id };
  const dataset = await decryptLocalJson(raw.dataEnc);
  applyProject({ ...toProject(latest), dataset });
  applying = true;
  try { applyEditable(latest.data); } finally { applying = false; }
  resetTracking();
  return { mode: "ready" };
}
export async function updateSnapshot(id, patch) {
  const s = await historyDb.getSnapshot(id);
  if (!s) return;
  Object.assign(s, patch);
  await historyDb.putSnapshot(s);
  broadcast();
}
export async function deleteSnapshots(ids) { await historyDb.deleteSnapshots(ids); await refreshCache(); broadcast(); }
export async function renameProject(id, name) {
  const p = await historyDb.getProject(id);
  if (!p) return;
  p.customName = String(name || "").trim().slice(0, 60);
  p.name = p.customName || p.name;
  await historyDb.putProject(p);
  await refreshCache(); broadcast();
}
export async function deleteProject(id) { await historyDb.deleteProject(id); await refreshCache(); broadcast(); }
export async function clearAllHistory() { await historyDb.clearAll(); resetTracking(); await refreshCache(); broadcast(); }

const toProject = snap => ({
  app: "survey-v5", schema: 1,
  settings: snap.data.settings, codebook: snap.data.codebook, logicModel: snap.data.logicModel, kpis: snap.data.kpis,
  report: { overrides: snap.data.overrides, hidden: snap.data.hidden, hiddenChapters: snap.data.hiddenChapters },
  present: { hidden: snap.data.deckHidden }, excludeStraight: snap.data.excludeStraight,
});

/**
 * 버전 복원
 * @returns {Promise<{mode:'applied'|'full'|'needFile', fileName?:string}>}
 */
export async function restoreSnapshot(id, { passphrase = "" } = {}) {
  const snap = await historyDb.getSnapshot(id);
  if (!snap?.data) throw new Error("복원할 수 없는 기록입니다");
  const sameData = !!state.codebook && state.codebook.headersHash === snap.data.codebook?.headersHash;
  if (sameData) {
    if (state.codebook) await saveSnapshot("restore", { label: "복원 직전 상태" });
    applying = true;
    try { applyEditable(snap.data); } finally { applying = false; }
    undo.record(serialize());
    await saveSnapshot("auto");
    return { mode: "applied" };
  }
  if (snap.hasData) {
    const dataset = snap.dataEnc?.v === 2 ? await decryptLocalJson(snap.dataEnc) : await decryptJson(snap.dataEnc, passphrase);
    applyProject({ ...toProject(snap), dataset });
    applying = true;
    try { applyEditable(snap.data); } finally { applying = false; }
    resetTracking();
    return { mode: "full" };
  }
  applyProject(toProject(snap));
  return { mode: "needFile", fileName: snap.summary?.fileName || "" };
}

/** 스냅샷과 현재 작업(같은 설문일 때) 또는 직전 버전 비교 */
export async function diffFor(id) {
  const snap = await historyDb.getSnapshot(id);
  if (!snap?.data) return { base: "none", groups: [] };
  if (state.codebook && projectIdOf(state.codebook) === snap.projectId) return { base: "current", groups: diffEditable(snap.data, captureEditable(state)) };
  const list = await historyDb.listSnapshots(snap.projectId);
  const older = list.find(s => s.createdAt < snap.createdAt && s.data);
  return older ? { base: "previous", groups: diffEditable(older.data, snap.data) } : { base: "first", groups: [] };
}

// ───────────── 백업 ─────────────
export async function exportBackup() {
  const all = await historyDb.exportAll();
  return JSON.stringify({ app: "survey-v5-history", v: 1, exportedAt: new Date().toISOString(), ...all });
}
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
export async function importBackup(text) {
  if (text.length > 200 * 1024 * 1024) throw new Error("백업 파일이 너무 큽니다");
  const obj = JSON.parse(text, (k, v) => (BAD_KEYS.has(k) ? undefined : v));
  if (obj?.app !== "survey-v5-history" || !Array.isArray(obj.projects) || !Array.isArray(obj.snapshots)) throw new Error("작업 내역 백업 파일이 아닙니다");
  const projects = obj.projects.filter(p => p && typeof p.id === "string" && /^p-/.test(p.id) && Number.isFinite(p.updatedAt));
  const ids = new Set(projects.map(p => p.id));
  const snapshots = obj.snapshots.filter(s => s && typeof s.id === "string" && ids.has(s.projectId) && Number.isFinite(s.createdAt) && s.data && typeof s.data === "object");
  await historyDb.importAll({ projects, snapshots });
  await refreshCache(); broadcast();
  return { projects: projects.length, snapshots: snapshots.length };
}

export async function requestPersist() {
  const ok = (await navigator.storage?.persist?.()) ?? false;
  await refreshCache();
  return ok;
}

// ───────────── 이전 버전(v4) 기록 ─────────────
export function v4Legacy() {
  try {
    const raw = localStorage.getItem("surveyHistory");
    if (!raw) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? { count: list.length, bytes: raw.length } : null;
  } catch { return null; }
}
/** v4 기록은 원자료가 들어 있을 수 있어 브라우저에서 지움 (필요하면 먼저 파일로 내려받기) */
export function v4Export() { try { return localStorage.getItem("surveyHistory") || "[]"; } catch { return "[]"; } }
export function v4Delete() { try { localStorage.removeItem("surveyHistory"); return true; } catch { return false; } }

export function relTime(t, now = Date.now()) {
  const s = Math.round((now - t) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  const d = new Date(t);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}
export const fmtDateTime = t => { const d = new Date(t); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const fmtBytes = b => (!Number.isFinite(b) ? "-" : b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(0)}KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)}MB` : `${(b / 1073741824).toFixed(1)}GB`);
