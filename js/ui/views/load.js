// ① 불러오기 화면
import { state, loadDataset, applyProject } from "../store.js";
import { parseFile } from "../../io/parse.js";
import { makeTemplate } from "../../io/template-xlsx.js";
import { parseProject } from "../../io/project.js";
import { toast, busy, download, readFileBytes, readFileText, nextFrame, esc } from "../util.js";
import { go } from "../router.js";
import { icon } from "../icons.js";
import { cache as historyCache, relTime, resumeProject } from "../history/manager.js";
import { selectProject } from "./history.js";

export const MAX_FILE_MB = 50;

export const SAMPLES = [
  { file: "2026_진로탐색_사전사후.xlsx", title: "사전·사후 + 성과지표", desc: "사전/사후 시트 ID 매칭, 사업정보·성과지표 시트 포함" },
  { file: "2026_문화의집_만족도_구글폼.csv", title: "구글폼 만족도", desc: "텍스트 응답(매우 그렇다…), 복수응답, 추천의향" },
  { file: "2026_진로체험_네이버폼.csv", title: "네이버폼 원본", desc: "제목 행·긴 문항·‘매우 만족’ 문자 응답·이모지 의견" },
  { file: "2026_참여위원회_회고식.xlsx", title: "회고식 사전·사후", desc: "소표본(24명), 이전/현재 응답" },
  { file: "2026_리더십캠프_사전사후_한시트.xlsx", title: "한 시트 사전·사후", desc: "사전_/사후_ 접두어 문항, 동일 응답자" },
  { file: "2026_생태탐험_7점척도_NPS.xlsx", title: "7점 척도 + 역문항 + NPS", desc: "7점 척도, 역채점 문항 자동 인식, 0~10 추천의향" },
];

function recentCard() {
  const list = historyCache.projects.slice(0, 2);
  if (!list.length) return "";
  return `<section class="card recent">
    <div class="row between wrap"><h2 class="flush">최근 작업</h2><button class="btn sm ghost" data-act="goto" data-to="history">${icon("history", 15)}전체 작업 내역</button></div>
    <div class="recent-list">${list.map(p => `<article class="recent-item">
      <div class="recent-copy"><b class="recent-name">${esc(p.name)}</b><span class="small muted recent-meta">${relTime(p.updatedAt)} · 버전 ${p.snapshotCount ?? "-"}개${p.summary?.n ? ` · 응답 ${p.summary.n}명` : ""} · ${p.hasData ? "원자료 보관됨" : "파일 연결 필요"}</span></div>
      <div class="recent-actions"><button class="btn sm" data-act="resume-project" data-id="${esc(p.id)}">분석 계속</button><button class="btn sm primary" data-act="present-project" data-id="${esc(p.id)}" ${p.hasData ? "" : "disabled"}>${icon("play", 14)}발표</button><button class="icon-btn sm" data-act="open-project" data-id="${esc(p.id)}" aria-label="작업 이력">${icon("history", 15)}</button></div>
    </article>`).join("")}</div>
  </section>`;
}

export function render() {
  return `
  <section class="hero">
    <p class="eyebrow">${icon("sparkle", 14)}청소년 사업 결과평가 도구</p>
    <h1>설문 엑셀 하나로 분석부터<br>한글 보고서·발표 자료까지</h1>
    <p class="lead">파일을 올리면 <b>통계 분석 → 성과지표 달성 판정 → 분석글·그래프가 들어간 한글(HWPX) 붙임 보고서</b>와 <b>발표용 슬라이드</b>를 자동으로 만듭니다.</p>
    <ul class="trust">
      <li>${icon("shield", 17)}브라우저 안에서만 처리 · 외부 전송 없음</li>
      <li>${icon("doc", 17)}한글(HWPX) 보고서</li>
      <li>${icon("play", 17)}발표 모드</li>
      <li>${icon("history", 17)}작업 내역 자동 저장</li>
      <li>${icon("install", 17)}앱 설치 · 오프라인 사용</li>
    </ul>
    <div class="hero-actions"><button class="btn primary lg" data-act="tutorial">${icon("play", 17)}3분 화면 가이드</button><span class="small muted">샘플 화면과 자막을 따라 첫 보고서까지 체험합니다.</span></div>
  </section>
  ${recentCard()}
  <div class="grid2">
    <section class="card">
      <h2>설문 데이터 불러오기</h2>
      <label class="drop" data-drop="data" role="button" tabindex="0" aria-label="설문 파일 선택">
        <input type="file" id="fileInput" accept=".xlsx,.xls,.csv,.tsv" data-change="pick-file" hidden>
        <span class="drop-icon">${icon("upload", 28)}</span>
        <span class="drop-main">엑셀·CSV 파일을 끌어다 놓거나 눌러서 선택하세요</span>
        <span class="drop-sub">.xlsx .xls .csv .tsv (최대 ${MAX_FILE_MB}MB) · 여러 시트(사전/사후/사업정보/성과지표) 자동 인식 · 구글폼·네이버폼·타입폼·탈리 원본 그대로 가능</span>
      </label>
      <div class="row gap wrap">
        <label class="btn">${icon("folder", 17)}프로젝트 파일 열기<input type="file" accept=".json" data-change="pick-project" hidden></label>
        ${state.dataset ? `<button class="btn primary" data-act="goto" data-to="setup">현재 데이터 계속 (${esc(state.dataset.fileName)}) ${icon("right", 16)}</button>` : ""}
      </div>
      ${state.pendingProject && !state.dataset ? `<p class="hint ok">저장된 설정을 준비했습니다. 같은 설문 데이터 파일을 올리면 설정이 적용됩니다.</p>` : ""}
    </section>
    <section class="card">
      <h2>샘플로 체험하기</h2>
      <div class="samples">
        ${SAMPLES.map(s => `<button class="sample" data-act="sample" data-file="${esc(s.file)}"><span class="sample-ico">${icon(s.file.endsWith(".csv") ? "file" : "table", 20)}</span><b>${esc(s.title)}${s.file.includes("문화의집") ? ` <span class="badge ok">처음 추천</span>` : ""}</b><span class="desc">${esc(s.desc)}</span>${icon("right", 18, "go")}</button>`).join("")}
      </div>
      <h3>입력 템플릿</h3>
      <p class="muted small">처음이라면 템플릿에 맞춰 입력하세요. 사업정보·성과지표 시트를 채우면 보고서에 논리모형과 달성표가 자동으로 들어갑니다(선택).</p>
      <div class="row gap wrap">
        <button class="btn sm" data-act="template" data-kind="satisfaction">${icon("download", 15)}만족도 조사 템플릿</button>
        <button class="btn sm" data-act="template" data-kind="prepost">${icon("download", 15)}사전·사후 조사 템플릿</button>
      </div>
    </section>
  </div>
  <section class="card">
    <h2>진행 순서</h2>
    <ol class="flow">
      <li><b>데이터 설정</b>자동 판별된 문항 역할·척도 범위·역문항·영역·사전·사후 짝을 확인합니다.</li>
      <li><b>성과지표 (선택)</b>빠른 추가로 지표를 넣거나 건너뜁니다. 사업정보·논리모형은 필요할 때만 입력합니다.</li>
      <li><b>분석 결과</b>성과지표 달성, 사전·사후 변화, 만족도, 집단 비교, 주관식을 확인합니다.</li>
      <li><b>보고서</b>자동 작성된 개조식 문장을 고치고 글꼴을 골라 HWPX로 내려받거나 PDF로 인쇄합니다.</li>
      <li><b>발표</b>핵심 결과를 슬라이드로 바로 발표하고 PDF로 나눠 줍니다.</li>
    </ol>
    <p class="muted small">이전 버전(v4.3) 화면은 <a href="legacy/v4.html">여기</a>에서 계속 사용할 수 있습니다.</p>
  </section>`;
}

/** 파일 선택 영역: Enter·Space 로도 열기 */
export function onKey(e) {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".drop")) {
    e.preventDefault();
    e.target.querySelector("input[type=file]")?.click();
  }
}

const tooBig = f => {
  if (f.size <= MAX_FILE_MB * 1024 * 1024) return false;
  toast(`파일이 너무 큽니다(${(f.size / 1048576).toFixed(0)}MB). ${MAX_FILE_MB}MB 이하로 줄여 주세요 — 불필요한 시트·열을 지우면 됩니다.`, "bad", 7000);
  return true;
};

async function openBytes(bytes, fileName) {
  busy(true, "파일을 읽는 중…");
  await nextFrame();
  try {
    const ds = parseFile(bytes, fileName, { XLSX: window.XLSX, Papa: window.Papa });
    if (!ds.sheets.length || !ds.sheets.some(s => s.rows.length)) throw new Error("응답 데이터가 없습니다");
    const note = loadDataset(ds, state.pendingProject || null);
    state.pendingProject = null;
    const cb = state.codebook;
    toast(`${fileName}: 응답 시트 ${cb.responseSheets.length}개, 열 ${cb.columns.length}개 인식${note ? ` · ${note}` : ""}${state.businessFound?.business || state.businessFound?.kpi ? " · 사업정보/성과지표 시트 반영" : ""}`, "ok", 5000);
    document.dispatchEvent(new CustomEvent("survey:loaded", { detail: { fileName } }));
    go("setup");
  } catch (e) {
    console.error(e);
    toast(`파일을 읽지 못했습니다: ${e.message}`, "bad", 6000);
  } finally { busy(false); }
}

export const actions = {
  "pick-file": async el => { const f = el.files?.[0]; if (f && !tooBig(f)) await openBytes(await readFileBytes(f), f.name); el.value = ""; },
  "drop-data": async file => { if (!tooBig(file)) await openBytes(await readFileBytes(file), file.name); },
  "pick-project": async el => {
    const f = el.files?.[0]; if (!f) return;
    try {
      if (tooBig(f)) return;
      const p = parseProject(await readFileText(f));
      const note = applyProject(p);
      toast(p.dataset ? `프로젝트와 원자료를 불러왔습니다${note ? ` · ${note}` : ""}` : "프로젝트 설정을 불러왔습니다. 설문 데이터 파일을 올려 주세요.", "ok", 5000);
      if (p.dataset) { document.dispatchEvent(new CustomEvent("survey:loaded", { detail: { fileName: f.name } })); go("setup"); }
      else go("load");
    } catch (e) { toast(`프로젝트 파일 오류: ${e.message}`, "bad"); }
    finally { el.value = ""; }
  },
  sample: async el => {
    busy(true, "샘플을 불러오는 중…");
    try {
      const res = await fetch(`samples/${encodeURIComponent(el.dataset.file)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.pendingProject = null;
      await openBytes(new Uint8Array(await res.arrayBuffer()), el.dataset.file);
    } catch (e) { busy(false); toast(`샘플을 불러오지 못했습니다(${e.message}). 웹 주소(https://…)로 접속했는지 확인하세요.`, "bad", 6000); }
  },
  "open-project": el => { selectProject(el.dataset.id); go("history"); },
  "resume-project": async el => openStoredProject(el.dataset.id, "dash"),
  "present-project": async el => openStoredProject(el.dataset.id, "present"),
  template: el => {
    const kind = el.dataset.kind;
    download(makeTemplate(kind, window.XLSX), kind === "prepost" ? "설문입력템플릿_사전사후.xlsx" : "설문입력템플릿_만족도.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  },
};

async function openStoredProject(id, target) {
  busy(true, target === "present" ? "발표 자료 준비 중…" : "원자료 복원 중…");
  try {
    const r = await resumeProject(id);
    if (r.mode === "ready") { go(target, target === "present" ? "1" : ""); return; }
    selectProject(id);
    if (r.mode === "needPassword") toast("비밀번호로 보관한 원자료입니다. 작업 이력에서 복원해 주세요.", "info", 6000);
    else toast(`‘${r.fileName || "같은 설문"}’ 파일을 다시 연결해 주세요.`, "info", 6000);
    go(r.mode === "needPassword" ? "history" : "load");
  } catch (e) { toast(`작업을 열지 못했습니다: ${e.message}`, "bad", 6000); }
  finally { busy(false); }
}
