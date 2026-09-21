// ① 불러오기 화면 — 분할 무대(왼쪽 키네틱 헤드라인·진행 순서 / 오른쪽 끌어놓기 영역) + 샘플 6타일 + 최근 작업 한 줄
import { state, loadDataset, applyProject } from "../store.js";
import { parseFile } from "../../io/parse.js";
import { makeTemplate } from "../../io/template-xlsx.js";
import { parseProject } from "../../io/project.js";
import { toast, busy, download, readFileBytes, readFileText, nextFrame, esc } from "../util.js";
import { go } from "../router.js";
import { icon } from "../icons.js";
import { cache as historyCache, relTime, resumeProject } from "../history/manager.js";
import { selectProject } from "./history.js";
import { glyphMarkup } from "../sample-glyphs.js";
import { startLoadMotion, ENTRANCE_MS } from "../load-motion.js";
import { trackEvent } from "../../telemetry/track.js";

export const MAX_FILE_MB = 50;

export const SAMPLES = [
  { file: "2026_진로탐색_사전사후.xlsx", title: "사전·사후 + 성과지표", desc: "사전/사후 시트 ID 매칭, 사업정보·성과지표 시트 포함" },
  { file: "2026_청소년센터_만족도_구글폼.csv", title: "구글폼 만족도", desc: "텍스트 응답(매우 그렇다…), 복수응답, 추천의향" },
  { file: "2026_진로체험_네이버폼.csv", title: "네이버폼 원본", desc: "제목 행·긴 문항·‘매우 만족’ 문자 응답·이모지 의견" },
  { file: "2026_참여위원회_회고식.xlsx", title: "회고식 사전·사후", desc: "소표본(24명), 이전/현재 응답, 사업정보·성과지표 포함" },
  { file: "2026_리더십캠프_사전사후_한시트.xlsx", title: "한 시트 사전·사후", desc: "사전_/사후_ 접두어 문항, 동일 응답자, 사업정보·성과지표 포함" },
  { file: "2026_생태탐험_7점척도_NPS.xlsx", title: "7점 척도 + 역문항 + NPS", desc: "7점 척도, 역채점 문항 자동 인식, 0~10 추천의향, 성과지표 포함" },
];

/** 진행 순서 — desc 는 단계 위에 올리면 보이는 전체 설명, short 는 화면에 바로 보이는 한 줄 */
export const FLOW = [
  { name: "데이터 설정", short: "문항 역할·척도·짝 판별", desc: "자동 판별된 문항 역할·척도 범위·역문항·영역·사전·사후 짝을 확인합니다." },
  { name: "성과지표 (선택)", short: "지표 추가 또는 건너뛰기", desc: "빠른 추가로 지표를 넣거나 건너뜁니다. 사업정보·논리모형은 필요할 때만 입력합니다." },
  { name: "분석 결과", short: "달성 판정·사전사후·주관식", desc: "성과지표 달성, 사전·사후 변화, 만족도, 집단 비교, 주관식을 확인합니다." },
  { name: "보고서", short: "문장 편집 → HWPX·PDF", desc: "자동 작성된 개조식 문장을 고치고 글꼴을 골라 HWPX로 내려받거나 PDF로 인쇄합니다." },
  { name: "발표", short: "슬라이드 발표·PDF/HTML", desc: "핵심 결과를 슬라이드로 바로 발표하고, 발표 자료를 PDF나 HTML 파일로 내려받습니다." },
];

/** 끌어놓기 영역 아래에서 살짝 올라온 스프레드시트 그림(장식, 큰 화면에서만 보임) */
function sheetArt() {
  const cols = [24, 112, 200, 288, 376, 464], head = [52, 64, 44, 60, 48, 58], ys = [58, 92, 126, 160, 194];
  const cells = [[30, 44, 22, 38, 26, 34], [44, 22, 38, 26, 34, 30], [22, 38, 26, 34, 30, 44], [38, 26, 34, 30, 44, 22], [26, 34, 30, 44, 22, 38]];
  const hot = new Set(["0-2", "2-3", "3-0", "4-4"]);
  return `<svg class="ld-sheet" aria-hidden="true" viewBox="0 0 560 210" preserveAspectRatio="xMidYMin slice"><rect class="sh-page" x="1" y="1" width="558" height="300" rx="18"/><rect class="sh-head" x="2" y="2" width="556" height="40" rx="17"/>`
    + cols.map((x, i) => `<rect class="sh-hd" x="${x}" y="16" width="${head[i]}" height="9" rx="4.5"/>`).join("")
    + cells.map((row, r) => row.map((w, c) => `<rect class="sh-c${hot.has(`${r}-${c}`) ? " hot" : ""}" x="${cols[c]}" y="${ys[r]}" width="${w}" height="8" rx="4"/>`).join("")).join("")
    + `<path class="sh-grid" d="M0 42H560M0 76H560M0 110H560M0 144H560M0 178H560M84 0V300M172 0V300M260 0V300M348 0V300M436 0V300"/></svg>`;
}

function recentRow(list) {
  return `<section class="ld-recent" aria-label="최근 작업">
      <h2 class="ld-lbl">최근 작업</h2>
      <div class="recent-list">${list.map(p => `<article class="recent-item">
        <div class="recent-copy"><b class="recent-name">${esc(p.name)}</b><span class="small muted recent-meta">${relTime(p.updatedAt)} · 버전 ${p.snapshotCount ?? "-"}개${p.summary?.n ? ` · 응답 ${p.summary.n}명` : ""} · ${p.hasData ? "원자료 보관됨" : "파일 연결 필요"}</span></div>
        <div class="recent-actions"><button class="btn sm" data-act="resume-project" data-id="${esc(p.id)}">분석 계속</button><button class="btn sm primary" data-act="present-project" data-id="${esc(p.id)}" ${p.hasData ? "" : "disabled"}>${icon("play", 14)}발표</button><button class="icon-btn sm" data-act="open-project" data-id="${esc(p.id)}" aria-label="작업 이력" title="작업 이력">${icon("history", 15)}</button></div>
      </article>`).join("")}</div>
      <button class="btn sm ghost" data-act="goto" data-to="history">${icon("history", 15)}전체 작업 내역</button>
    </section>`;
}

export function render() {
  const recent = historyCache.projects.slice(0, 2);
  return `<div class="ld-stage${recent.length ? "" : " ld-norecent"}">
    <div class="ld-bg" aria-hidden="true"></div>

    <section class="ld-hero">
      <div class="ld-hero-top">
        <p class="eyebrow ld-in" style="--d:0s">${icon("sparkle", 14)}청소년 사업 평가 도구</p>
        <h1 class="ld-h1" data-kinetic>
          <span class="ln"><span class="tx">설문 엑셀 하나로</span> <span class="roll" data-roll><span class="roll-track"><span class="rw">분석부터</span><span class="rw" data-alt>보고서까지</span><span class="rw" data-alt>발표까지</span><span class="rw" data-alt>분석부터</span></span></span></span>
          <span class="ln"><span class="tx">한글 보고서·발표 자료까지</span></span>
        </h1>
        <p class="lead ld-in" style="--d:.55s">파일을 올리면 <b>통계 분석 → 성과지표 달성 판정 → 분석글·그래프가 들어간 한글(HWPX) 붙임 보고서</b>와 <b>발표용 슬라이드</b>를 자동으로 만듭니다.</p>
        <ul class="trust ld-trust ld-in" style="--d:.7s">
          <li>${icon("shield", 16)}브라우저 안에서만 처리 · 외부 전송 없음</li>
          <li>${icon("doc", 16)}한글(HWPX) 보고서</li>
          <li>${icon("play", 16)}발표 모드</li>
          <li>${icon("history", 16)}작업 내역 자동 저장</li>
          <li>${icon("install", 16)}앱 설치 · 오프라인 사용</li>
        </ul>
        <div class="hero-actions ld-in" style="--d:.85s"><button class="btn primary lg" data-act="tutorial">${icon("play", 17)}3분 화면 가이드</button><span class="small muted">샘플 화면과 자막을 따라 첫 보고서까지 체험합니다.</span></div>
      </div>
      <ol class="ld-flow" aria-label="진행 순서">${FLOW.map((s, i) => `<li style="--i:${i}" title="${esc(s.desc)}"><span class="node">${i + 1}</span><b>${esc(s.name)}</b><span class="fs">${esc(s.short)}</span></li>`).join("")}</ol>
    </section>

    <section class="ld-side" aria-label="설문 데이터 불러오기">
      <label class="drop ld-drop" data-drop="data" role="button" tabindex="0" aria-label="설문 파일 선택">
        <input type="file" id="fileInput" accept=".xlsx,.xls,.csv,.tsv" data-change="pick-file" hidden>
        <span class="corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="ld-drop-cap">설문 데이터 불러오기</span>
        <span class="ld-drop-in">
          <span class="drop-icon">${icon("upload", 34)}</span>
          <span class="drop-msgs"><span class="drop-main">엑셀·CSV 파일을 끌어다 놓거나 눌러서 선택하세요</span><span class="drop-over-msg" aria-hidden="true">놓으면 바로 분석을 시작합니다</span></span>
          <span class="drop-sub"><span class="ds-a">.xlsx .xls .csv .tsv (최대 ${MAX_FILE_MB}MB)</span><span class="ds-b">여러 시트(사전/사후/사업정보/성과지표) 자동 인식</span><span class="ds-c">구글폼·네이버폼·타입폼·탈리 원본 그대로 가능</span></span>
        </span>
        ${sheetArt()}
      </label>
      <div class="ld-side-row">
        <div class="ld-open">
          <label class="btn" data-tip="${esc("지난번 '프로젝트 파일 저장'으로 내려받은 설정 파일(.json)을 열면 문항 설정·성과지표·문장 수정이 이어집니다. 처음 쓰신다면 몰라도 됩니다 — 아래에서 설문 데이터부터 올리세요.")}">${icon("folder", 17)}프로젝트 파일 열기<input type="file" accept=".json" data-change="pick-project" hidden></label>
          ${state.dataset ? `<button class="btn primary" data-act="goto" data-to="setup">현재 데이터 계속 (${esc(state.dataset.fileName)}) ${icon("right", 16)}</button>` : ""}
        </div>
        <div class="ld-tpl"><b>입력 템플릿</b>
          <button class="btn sm" data-act="template" data-kind="satisfaction">${icon("download", 15)}만족도 조사 템플릿</button>
          <button class="btn sm" data-act="template" data-kind="prepost">${icon("download", 15)}사전·사후 조사 템플릿</button>
        </div>
      </div>
      ${state.pendingProject && !state.dataset ? `<p class="hint ok ld-hint">저장된 설정을 준비했습니다. 같은 설문 데이터 파일을 올리면 설정이 적용됩니다.</p>` : ""}
      <p class="ld-tpl-note small muted" data-tip="${esc("처음이라면 템플릿에 맞춰 입력하세요. 사업정보·성과지표 시트를 채우면 보고서에 논리모형과 달성표가 자동으로 들어갑니다(선택).")}">처음이라면 템플릿에 맞춰 입력하세요. 사업정보·성과지표 시트를 채우면 보고서에 논리모형과 달성표가 자동으로 들어갑니다(선택).</p>
    </section>

    <section class="ld-samples" aria-labelledby="ld-samples-h">
      <h2 id="ld-samples-h" class="ld-lbl">샘플로 체험하기</h2>
      <div class="samples ld-sample-row">
        ${SAMPLES.map((s, i) => `<button class="sample" style="--i:${i}" data-act="sample" data-file="${esc(s.file)}" data-tip="${esc(`${s.title} — ${s.desc}`)}">${glyphMarkup(s.file)}<b>${esc(s.title)}${s.file.includes("청소년센터") ? ` <span class="badge info">처음 추천</span>` : ""}</b><span class="desc">${esc(s.desc)}</span>${icon("right", 16, "go")}</button>`).join("")}
      </div>
    </section>
    ${recent.length ? recentRow(recent) : ""}
  </div>
  <div class="ld-foot no-print"><span class="ld-priv">${icon("shield", 14)}모든 분석은 이 브라우저 안에서만 처리되며 파일은 외부로 전송되지 않습니다</span><span class="ld-dot" aria-hidden="true">·</span><span data-act="admin-entry">by Sysmetrix</span><span class="ld-dot" aria-hidden="true">·</span><span class="ld-legacy"><a href="legacy/v4.html">이전 버전(v4.3)</a></span></div>`;
}

// ── 화면 표시·정리 (main.js 가 렌더 뒤 mount, 다른 화면으로 옮길 때 unmount 호출) ──
let enteredAt = 0;   // 이번 방문에서 처음 그린 시각 — 다시 그려도(작업 내역 갱신·테마 변경) 진입 모션을 처음부터 다시 틀지 않는다
let stopMotion = null;

export function mount() {
  document.body.classList.add("view-load"); // 이 화면만 한 줄 푸터·여백 없는 무대(css/app.css .view-load)
  stopMotion?.();
  const now = Date.now();
  if (!enteredAt) enteredAt = now;
  stopMotion = startLoadMotion(document.getElementById("main"), { elapsed: now - enteredAt, entranceMs: ENTRANCE_MS });
}

export function unmount() {
  stopMotion?.(); stopMotion = null;
  enteredAt = 0;
  document.body.classList.remove("view-load");
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
    toast(`${fileName}: 응답 시트 ${cb.responseSheets.length}개, 열 ${cb.columns.length}개 인식${note ? ` · ${note}` : ""}${state.businessFound?.business || state.businessFound?.kpi ? " · 사업정보/성과지표 시트 반영" : ""}`, "ok", 3000);
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
      trackEvent("load", "sample_load", { file: el.dataset.file });
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
