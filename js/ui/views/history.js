// 작업 내역 화면: 프로젝트별 버전 타임라인 · 변경 내용 비교 · 복원 · 고정 · 백업 · 보관 규칙 · 저장 공간
import { state } from "../store.js";
import {
  cache, prefs, savePrefs, listSnapshots, saveSnapshot, restoreSnapshot, resumeProject, deleteSnapshots, updateSnapshot, renameProject, deleteProject,
  diffFor, exportBackup, importBackup, clearAllHistory, requestPersist, canUndo, canRedo, relTime, fmtDateTime, fmtBytes, v4Legacy, v4Export, v4Delete,
} from "../history/manager.js";
import { projectIdOf, KIND_LABEL, diffCount } from "../../history/snapshot.js";
import { MIN_PASSPHRASE } from "../../history/crypto.js";
import { esc, toast, download, readFileText, busy, option } from "../util.js";
import { go, refresh } from "../router.js";
import { icon } from "../icons.js";

const view = { selected: null, loadedFor: null, snaps: [], loading: false, query: "", diffs: new Map(), askPass: null };

export function selectProject(id) { view.selected = id; view.loadedFor = null; view.diffs.clear(); view.askPass = null; }

async function loadSelected() {
  if (!view.selected || view.loading) return;
  view.loading = true;
  try { view.snaps = await listSnapshots(view.selected); view.loadedFor = view.selected; }
  catch (e) { toast(`내역을 읽지 못했습니다: ${e.message}`, "bad"); }
  finally { view.loading = false; refresh(); }
}

const KIND_CLS = { auto: "muted", manual: "ok", load: "info", export: "info", restore: "warn" };

function summaryLine(sm = {}) {
  return [sm.n !== null && sm.n !== undefined ? `응답 ${sm.n}명` : "", sm.kpi ? `성과지표 ${sm.kpi} 달성${sm.grade ? `(${sm.grade})` : ""}` : "", Number.isFinite(sm.sat) ? `만족도 ${sm.sat}점` : "", sm.edits ? `문장 수정 ${sm.edits}건` : ""].filter(Boolean).join(" · ");
}

function storageCard() {
  const st = cache.storage;
  const pct = st?.quota ? Math.min(100, st.usage / st.quota * 100) : 0;
  const legacy = v4Legacy();
  return `<section class="card">
    <div class="hist-status">
      <div><span class="small muted">저장 위치</span><b>이 브라우저 (서버 전송 없음)</b></div>
      <div><span class="small muted">사용 중</span><b>${st ? `${fmtBytes(st.usage)} / ${fmtBytes(st.quota)}` : "-"}</b>${st ? `<div class="meter" role="meter" aria-valuenow="${pct.toFixed(1)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct.toFixed(1)}%"></i></div>` : ""}</div>
      <div><span class="small muted">보관 상태</span><b>${cache.persisted ? `<span class="badge ok">영구 보관</span>` : `<span class="badge warn">공간 부족 시 삭제될 수 있음</span>`}</b>${cache.persisted ? "" : `<button class="btn sm ghost" data-act="hist-persist">영구 보관 요청</button>`}</div>
      <div><span class="small muted">자동 저장</span><label class="check"><input type="checkbox" ${prefs.autosave ? "checked" : ""} data-change="hist-autosave"> 변경 후 2~3초 뒤 자동 저장</label></div>
      <div><span class="small muted">자동 저장 보관</span><div class="row gap"><select class="in" data-change="hist-max">${[10, 30, 100].map(v => option(v, `최근 ${v}개`, prefs.maxAuto === v)).join("")}</select><select class="in" data-change="hist-age">${[30, 90, 365].map(v => option(v, `${v}일`, prefs.maxAgeDays === v)).join("")}</select></div></div>
    </div>
    <div class="row gap wrap end">
      <button class="btn sm" data-act="hist-export">${icon("download", 15)}백업 파일 받기</button>
      <label class="btn sm">${icon("upload", 15)}백업 가져오기<input type="file" accept=".json" data-change="hist-import" hidden></label>
      <button class="btn sm ghost danger" data-act="hist-clear">모든 내역 삭제</button>
    </div>
    <p class="small muted">원자료는 서버로 전송하지 않고 이 브라우저 전용 키로 암호화(AES-256)해 보관합니다. 브라우저 데이터나 암호화 키를 지우면 복원할 수 없습니다. 직접 저장한 비밀번호 보호 버전은 별도로 유지됩니다. 공용 PC에서는 작업 후 내역을 삭제하세요.</p>
    ${legacy ? `<div class="hint warn-hint"><b>이전 버전(v4.3) 분석 이력 ${legacy.count}건</b>이 이 브라우저에 남아 있습니다. 원자료가 들어 있을 수 있으니 필요하면 내려받은 뒤 삭제하세요.
      <div class="row gap wrap"><button class="btn sm" data-act="hist-v4-export">내려받기</button><button class="btn sm ghost danger" data-act="hist-v4-delete">이전 이력 삭제</button></div></div>` : ""}
  </section>`;
}

function timelineHtml(project) {
  if (view.loading || view.loadedFor !== project.id) return `<p class="muted">불러오는 중…</p>`;
  if (!view.snaps.length) return `<p class="muted">저장된 버전이 없습니다.</p>`;
  const current = state.codebook && projectIdOf(state.codebook) === project.id;
  return `<ol class="timeline">${view.snaps.map((s, i) => {
    const d = view.diffs.get(s.id);
    return `<li class="tl-item${s.pinned ? " pinned" : ""}">
      <span class="tl-dot ${KIND_CLS[s.kind] || ""}" aria-hidden="true"></span>
      <div class="tl-main">
        <div class="row between wrap gap">
          <div class="row gap wrap"><b>${esc(s.label || KIND_LABEL[s.kind] || "버전")}</b><span class="badge ${KIND_CLS[s.kind] || "muted"}">${esc(KIND_LABEL[s.kind] || s.kind)}</span>${i === 0 ? `<span class="badge info">최신</span>` : ""}${s.pinned ? `<span class="badge ok">고정</span>` : ""}${s.hasData ? `<span class="badge info">원자료 암호화 보관</span>` : ""}</div>
          <time class="small muted" datetime="${new Date(s.createdAt).toISOString()}" title="${fmtDateTime(s.createdAt)}">${fmtDateTime(s.createdAt)} · ${relTime(s.createdAt)}</time>
        </div>
        <div class="small muted">${esc(summaryLine(s.summary))}</div>
        <div class="row gap wrap tl-actions">
          <button class="btn sm ghost" data-act="hist-diff" data-id="${esc(s.id)}" aria-expanded="${!!d}">${current ? "지금과 비교" : "직전 버전과 비교"}</button>
          <button class="btn sm" data-act="hist-restore" data-id="${esc(s.id)}">이 버전으로 복원</button>
          <button class="btn sm ghost" data-act="hist-pin" data-id="${esc(s.id)}">${s.pinned ? "고정 해제" : "고정(자동 삭제 안 함)"}</button>
          <button class="btn sm ghost" data-act="hist-label" data-id="${esc(s.id)}">이름 붙이기</button>
          <button class="btn sm ghost danger" data-act="hist-del" data-id="${esc(s.id)}" aria-label="버전 삭제">삭제</button>
        </div>
        ${d ? `<div class="diff">${d.groups.length ? d.groups.map(g => `<div><b>${esc(g.area)}</b><ul>${g.items.slice(0, 30).map(x => `<li>${esc(x)}</li>`).join("")}${g.items.length > 30 ? `<li class="muted">외 ${g.items.length - 30}건</li>` : ""}</ul></div>`).join("") : `<p class="small muted">${d.base === "current" ? "지금 작업과 차이가 없습니다." : d.base === "first" ? "첫 버전입니다." : "차이가 없습니다."}</p>`}</div>` : ""}
        ${view.askPass === s.id ? `<div class="pass-form"><label class="field">원자료 비밀번호<input class="in" type="password" id="restorePass" autocomplete="current-password" minlength="${MIN_PASSPHRASE}"></label><div class="row gap"><button class="btn sm primary" data-act="hist-restore-pass" data-id="${esc(s.id)}">복원</button><button class="btn sm ghost" data-act="hist-pass-cancel">취소</button></div></div>` : ""}
      </div>
    </li>`;
  }).join("")}</ol>`;
}

export function render() {
  if (!cache.available) {
    return `<section class="card empty-state"><h2>작업 내역을 사용할 수 없습니다</h2><p class="muted">이 브라우저 설정(개인정보 보호 모드 등)에서는 저장소를 쓸 수 없습니다. 보고서 화면의 ‘프로젝트 파일 저장’을 이용하세요.</p>${cache.error ? `<p class="small bad-text">${esc(cache.error)}</p>` : ""}</section>`;
  }
  const currentPid = state.codebook ? projectIdOf(state.codebook) : null;
  if (!view.selected) view.selected = currentPid || cache.projects[0]?.id || null;
  const q = view.query.trim().toLowerCase();
  const projects = cache.projects.filter(p => !q || `${p.name} ${p.summary?.fileName || ""}`.toLowerCase().includes(q));
  const sel = cache.projects.find(p => p.id === view.selected) || null;

  return `
  <div class="page-head">
      <div><h2>작업·발표 보관함</h2><p class="small muted">원자료와 최신 분석 상태가 이 브라우저에 암호화 보관됩니다. 작업을 이어가거나 발표를 바로 시작할 수 있습니다. <kbd>Ctrl</kbd>+<kbd>Z</kbd> 되돌리기 · <kbd>Ctrl</kbd>+<kbd>Y</kbd> 다시 실행</p></div>
    <div class="row gap wrap">
      <button class="btn" data-act="undo" ${canUndo() ? "" : "disabled"}>${icon("undo", 16)}되돌리기</button>
      <button class="btn" data-act="redo" ${canRedo() ? "" : "disabled"}>${icon("redo", 16)}다시 실행</button>
      ${state.dataset ? `<button class="btn" data-act="goto" data-to="dash">분석 결과로</button>` : `<button class="btn" data-act="goto" data-to="load">파일 불러오기</button>`}
    </div>
  </div>
  ${state.codebook ? `<section class="card save-version">
    <h3 class="flush">지금 상태를 버전으로 저장</h3>
    <div class="row gap wrap">
      <input class="in grow" id="versionLabel" maxlength="80" placeholder="버전 이름 (예: 1차 검토 반영, 결재 올린 본)">
      <label class="check"><input type="checkbox" id="versionData" data-change="hist-data-toggle"> 원자료도 암호화해 보관</label>
      <input class="in" id="versionPass" type="password" autocomplete="new-password" minlength="${MIN_PASSPHRASE}" placeholder="비밀번호 ${MIN_PASSPHRASE}자 이상" hidden>
      <button class="btn primary" data-act="hist-save">${icon("check", 16)}버전 저장</button>
    </div>
    <p class="small muted">${cache.lastSavedAt ? `마지막 저장 ${relTime(cache.lastSavedAt)}` : prefs.autosave ? "자동 저장이 켜져 있습니다" : "자동 저장이 꺼져 있습니다"}</p>
  </section>` : ""}
  <div class="history-layout">
    <aside class="card">
      <input class="in" type="search" placeholder="작업 검색 (사업명·파일명)" value="${esc(view.query)}" data-change="hist-query" aria-label="작업 검색">
      <div class="proj-list">${projects.length ? projects.map(p => `<button class="proj${p.id === view.selected ? " on" : ""}" data-act="hist-select" data-id="${esc(p.id)}" aria-current="${p.id === view.selected}">
        <b>${esc(p.name)}</b>${p.id === currentPid ? ` <span class="badge ok">지금 작업</span>` : ""}${p.hasData ? ` <span class="badge info">원자료 보관</span>` : ` <span class="badge warn">파일 필요</span>`}
        <span class="small muted">${esc(p.summary?.fileName || "")}</span>
        <span class="small muted">${relTime(p.updatedAt)} · 버전 ${p.snapshotCount ?? "-"}개</span></button>`).join("") : `<p class="small muted">${cache.projects.length ? "검색 결과가 없습니다." : "아직 저장된 작업이 없습니다. 설문 파일을 불러오면 자동으로 기록됩니다."}</p>`}</div>
    </aside>
    <section class="card">
      ${sel ? `<div class="row between wrap gap">
          <div><h3 class="flush">${esc(sel.name)}</h3><p class="small muted">${esc(summaryLine(sel.summary))}</p></div>
          <div class="row gap wrap"><button class="btn sm" data-act="hist-resume" data-id="${esc(sel.id)}">분석 계속</button><button class="btn sm primary" data-act="hist-present" data-id="${esc(sel.id)}" ${sel.hasData ? "" : "disabled"}>${icon("play", 14)}발표 시작</button><button class="btn sm ghost" data-act="hist-rename" data-id="${esc(sel.id)}">이름 바꾸기</button><button class="btn sm ghost danger" data-act="hist-del-project" data-id="${esc(sel.id)}">작업 삭제</button></div>
        </div>
        ${sel.id !== currentPid ? `<p class="hint small">${state.dataset ? "지금 열린 설문과 다른 작업입니다." : "설문 파일이 열려 있지 않습니다."} ${sel.hasData ? "원자료와 최신 설정을 바로 복원할 수 있습니다." : "같은 설문 파일을 다시 연결하면 저장된 설정이 적용됩니다."}</p>` : ""}
        ${timelineHtml(sel)}` : `<p class="muted">왼쪽에서 작업을 선택하세요.</p>`}
    </section>
  </div>
  ${storageCard()}`;
}

export function mount() {
  if (view.selected && view.loadedFor !== view.selected && !view.loading) loadSelected();
}

const snapById = id => view.snaps.find(s => s.id === id);

async function doRestore(id, passphrase = "") {
  busy(true, "복원 중…");
  try {
    const r = await restoreSnapshot(id, { passphrase });
    view.askPass = null;
    if (r.mode === "applied") toast("선택한 버전으로 복원했습니다. 복원 직전 상태도 내역에 저장했습니다.", "ok", 5000);
    else if (r.mode === "full") { toast("원자료와 설정을 복원했습니다.", "ok", 5000); go("setup"); return; }
    else { toast(`설정을 준비했습니다. ‘${r.fileName || "같은 설문"}’ 파일을 올리면 이 버전이 적용됩니다.`, "ok", 7000); go("load"); return; }
    selectProject(projectIdOf(state.codebook));
  } catch (e) {
    toast(e.message, "bad", 6000);
  } finally { busy(false); refresh(); }
}

export const actions = {
  "hist-select": el => { selectProject(el.dataset.id); refresh(); },
  "hist-resume": async el => openProject(el.dataset.id, "dash"),
  "hist-present": async el => openProject(el.dataset.id, "present"),
  "hist-query": el => { view.query = el.value; refresh(); },
  "hist-data-toggle": el => { const p = document.getElementById("versionPass"); if (p) { p.hidden = !el.checked; if (el.checked) p.focus(); } },
  "hist-save": async () => {
    const label = document.getElementById("versionLabel")?.value || "";
    const includeData = !!document.getElementById("versionData")?.checked;
    const passphrase = document.getElementById("versionPass")?.value || "";
    if (includeData && passphrase.length < MIN_PASSPHRASE) { toast(`원자료를 보관하려면 비밀번호를 ${MIN_PASSPHRASE}자 이상 입력하세요`, "bad"); return; }
    busy(true, includeData ? "원자료 암호화 중…" : "저장 중…");
    try {
      const s = await saveSnapshot("manual", { label, includeData, passphrase });
      selectProject(s.projectId);
      toast(`버전을 저장했습니다${includeData ? " (원자료 암호화 보관)" : ""}`, "ok");
    } catch (e) { toast(`저장 실패: ${e.message}`, "bad"); } finally { busy(false); refresh(); }
  },
  "hist-diff": async el => {
    const id = el.dataset.id;
    if (view.diffs.has(id)) view.diffs.delete(id);
    else view.diffs.set(id, await diffFor(id));
    refresh();
  },
  "hist-restore": async el => {
    const s = snapById(el.dataset.id);
    if (!s) return;
    const sameData = state.codebook && state.codebook.headersHash === s.data?.codebook?.headersHash;
    if (!sameData && s.hasData && s.dataEnc?.v !== 2) { view.askPass = s.id; refresh(); setTimeout(() => document.getElementById("restorePass")?.focus(), 0); return; }
    if (state.dataset && !sameData && !confirm("지금 열린 설문과 다른 작업입니다. 현재 설정을 이 버전으로 바꿀까요? (현재 작업은 자동 저장된 내역에 남아 있습니다)")) return;
    await doRestore(s.id);
  },
  "hist-restore-pass": async el => doRestore(el.dataset.id, document.getElementById("restorePass")?.value || ""),
  "hist-pass-cancel": () => { view.askPass = null; refresh(); },
  "hist-pin": async el => { const s = snapById(el.dataset.id); if (!s) return; await updateSnapshot(s.id, { pinned: !s.pinned }); view.loadedFor = null; refresh(); },
  "hist-label": async el => {
    const s = snapById(el.dataset.id); if (!s) return;
    const name = prompt("버전 이름", s.label || "");
    if (name === null) return;
    await updateSnapshot(s.id, { label: name.trim().slice(0, 80) });
    view.loadedFor = null; refresh();
  },
  "hist-del": async el => {
    if (!confirm("이 버전을 삭제할까요?")) return;
    await deleteSnapshots([el.dataset.id]);
    view.loadedFor = null; refresh();
  },
  "hist-rename": async el => {
    const p = cache.projects.find(x => x.id === el.dataset.id); if (!p) return;
    const name = prompt("작업 이름", p.name);
    if (name === null) return;
    await renameProject(p.id, name);
    refresh();
  },
  "hist-del-project": async el => {
    if (!confirm("이 작업의 모든 버전을 삭제할까요? 되돌릴 수 없습니다.")) return;
    await deleteProject(el.dataset.id);
    selectProject(null); refresh();
  },
  "hist-autosave": el => { savePrefs({ autosave: el.checked }); toast(el.checked ? "자동 저장을 켰습니다" : "자동 저장을 껐습니다"); refresh(); },
  "hist-max": el => { savePrefs({ maxAuto: Number(el.value) }); refresh(); },
  "hist-age": el => { savePrefs({ maxAgeDays: Number(el.value) }); refresh(); },
  "hist-persist": async () => { const ok = await requestPersist(); toast(ok ? "브라우저가 영구 보관을 허용했습니다" : "브라우저가 요청을 거절했습니다(앱으로 설치하면 허용될 가능성이 높습니다)", ok ? "ok" : "bad", 6000); refresh(); },
  "hist-export": async () => {
    const json = await exportBackup();
    const d = new Date();
    download(json, `설문분석_작업내역_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`, "application/json");
    toast("백업 파일을 내려받았습니다. 문장 수정 내용이 들어 있으니 보관에 주의하세요.", "ok", 6000);
  },
  "hist-import": async el => {
    const f = el.files?.[0]; if (!f) return;
    try { const r = await importBackup(await readFileText(f)); toast(`작업 ${r.projects}개, 버전 ${r.snapshots}개를 가져왔습니다`, "ok"); }
    catch (e) { toast(`가져오기 실패: ${e.message}`, "bad"); }
    el.value = ""; view.loadedFor = null; refresh();
  },
  "hist-clear": async () => {
    if (!confirm("이 브라우저에 저장된 모든 작업 내역을 삭제할까요? 되돌릴 수 없습니다.")) return;
    await clearAllHistory(); selectProject(null); toast("모든 작업 내역을 삭제했습니다", "ok"); refresh();
  },
  "hist-v4-export": () => download(v4Export(), "이전버전_v4_분석이력.json", "application/json"),
  "hist-v4-delete": () => { if (confirm("이전 버전(v4.3) 분석 이력을 이 브라우저에서 삭제할까요?")) { v4Delete(); toast("이전 이력을 삭제했습니다", "ok"); refresh(); } },
};

async function openProject(id, target) {
  busy(true, target === "present" ? "발표 자료 준비 중…" : "원자료 복원 중…");
  try {
    const r = await resumeProject(id);
    if (r.mode === "ready") { go(target, target === "present" ? "1" : ""); return; }
    if (r.mode === "needPassword") toast("기존 비밀번호로 보관한 원자료입니다. 아래 버전에서 복원해 주세요.", "info", 6000);
    else { toast(`‘${r.fileName || "같은 설문"}’ 파일을 다시 연결해 주세요.`, "info", 6000); go("load"); }
  } catch (e) { toast(`작업을 열지 못했습니다: ${e.message}`, "bad", 6000); }
  finally { busy(false); refresh(); }
}
