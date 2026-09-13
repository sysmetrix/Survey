// ① 불러오기 화면
import { state, loadDataset, applyProject } from "../store.js";
import { parseFile } from "../../io/parse.js";
import { makeTemplate } from "../../io/template-xlsx.js";
import { parseProject } from "../../io/project.js";
import { toast, busy, download, readFileBytes, readFileText, nextFrame, esc } from "../util.js";
import { go } from "../router.js";

export const SAMPLES = [
  { file: "2026_진로탐색_사전사후.xlsx", title: "사전·사후 + 성과지표", desc: "사전/사후 시트 ID 매칭, 사업정보·성과지표 시트 포함" },
  { file: "2026_문화의집_만족도_구글폼.csv", title: "구글폼 만족도", desc: "텍스트 응답(매우 그렇다…), 복수응답, 추천의향" },
  { file: "2026_참여위원회_회고식.xlsx", title: "회고식 사전·사후", desc: "소표본(24명), 이전/현재 응답" },
];

export function render() {
  return `
  <section class="hero">
    <h1>청소년 사업 설문 분석 · 결과평가 보고서</h1>
    <p>설문 엑셀을 올리면 <b>통계 분석 → 성과지표 달성 판정 → 개조식 분석글·그래프가 들어간 한글(HWPX) 붙임 보고서</b>까지 만들어 줍니다.
    모든 처리는 이 브라우저 안에서만 이루어지며 파일은 외부로 전송되지 않습니다.</p>
  </section>
  <div class="grid2">
    <section class="card">
      <h2>설문 데이터 불러오기</h2>
      <label class="drop" data-drop="data">
        <input type="file" id="fileInput" accept=".xlsx,.xls,.csv,.tsv" data-change="pick-file" hidden>
        <span class="drop-icon">📂</span>
        <span class="drop-main">엑셀·CSV 파일을 끌어다 놓거나 클릭하세요</span>
        <span class="drop-sub">.xlsx .xls .csv .tsv · 여러 시트(사전/사후/사업정보/성과지표) 자동 인식 · 구글폼·네이버폼 원본 가능</span>
      </label>
      <div class="row gap">
        <label class="btn ghost">프로젝트 파일 열기<input type="file" accept=".json" data-change="pick-project" hidden></label>
        ${state.dataset ? `<button class="btn" data-act="goto" data-to="setup">현재 데이터 계속 (${esc(state.dataset.fileName)})</button>` : ""}
      </div>
      ${state.pendingProject && !state.dataset ? `<p class="hint ok">프로젝트 설정을 불러왔습니다. 같은 설문 데이터 파일을 올리면 설정이 적용됩니다.</p>` : ""}
    </section>
    <section class="card">
      <h2>입력 템플릿</h2>
      <p class="muted">처음이라면 템플릿에 맞춰 입력하세요. 사업정보·성과지표 시트를 채우면 보고서에 논리모형과 달성표가 자동으로 들어갑니다.</p>
      <div class="row gap">
        <button class="btn" data-act="template" data-kind="satisfaction">만족도 조사 템플릿</button>
        <button class="btn" data-act="template" data-kind="prepost">사전·사후 조사 템플릿</button>
      </div>
      <h3>샘플로 체험하기</h3>
      <div class="samples">
        ${SAMPLES.map(s => `<button class="sample" data-act="sample" data-file="${esc(s.file)}"><b>${esc(s.title)}</b><span>${esc(s.desc)}</span></button>`).join("")}
      </div>
    </section>
  </div>
  <section class="card steps">
    <h2>진행 순서</h2>
    <ol>
      <li><b>데이터 설정</b> — 자동 판별된 문항 역할(척도·응답자 특성·주관식 등), 척도 범위, 역문항, 영역, 사전·사후 짝을 확인합니다.</li>
      <li><b>사업정보·성과지표</b> — 사업 목적·추진목표·논리모형과 성과지표(목표값·측정방법)를 입력하거나 엑셀 시트에서 불러옵니다.</li>
      <li><b>분석 결과</b> — 성과지표 달성, 사전·사후 변화, 만족도, 집단 비교, 주관식을 확인합니다.</li>
      <li><b>보고서</b> — 자동 작성된 개조식 문장을 고치고, <b>HWPX</b>로 내려받거나 PDF로 인쇄합니다.</li>
    </ol>
    <p class="muted small">이전 버전(v4.3) 화면은 <a href="legacy/v4.html">여기</a>에서 계속 사용할 수 있습니다.</p>
  </section>`;
}

async function openBytes(bytes, fileName) {
  busy(true, "파일을 읽는 중…");
  await nextFrame();
  try {
    const ds = parseFile(bytes, fileName, { XLSX: window.XLSX, Papa: window.Papa });
    if (!ds.sheets.length || !ds.sheets.some(s => s.rows.length)) throw new Error("응답 데이터가 없습니다");
    const note = loadDataset(ds, state.pendingProject || null);
    const cb = state.codebook;
    toast(`${fileName}: 응답 시트 ${cb.responseSheets.length}개, 열 ${cb.columns.length}개 인식${note ? ` · ${note}` : ""}${state.businessFound?.business || state.businessFound?.kpi ? " · 사업정보/성과지표 시트 반영" : ""}`, "ok", 5000);
    go("setup");
  } catch (e) {
    console.error(e);
    toast(`파일을 읽지 못했습니다: ${e.message}`, "bad", 6000);
  } finally { busy(false); }
}

export const actions = {
  "pick-file": async el => { const f = el.files?.[0]; if (f) await openBytes(await readFileBytes(f), f.name); el.value = ""; },
  "drop-data": async file => openBytes(await readFileBytes(file), file.name),
  "pick-project": async el => {
    const f = el.files?.[0]; if (!f) return;
    try {
      const p = parseProject(await readFileText(f));
      const note = applyProject(p);
      toast(p.dataset ? `프로젝트와 원자료를 불러왔습니다${note ? ` · ${note}` : ""}` : "프로젝트 설정을 불러왔습니다. 설문 데이터 파일을 올려 주세요.", "ok", 5000);
      go(p.dataset ? "setup" : "load");
    } catch (e) { toast(`프로젝트 파일 오류: ${e.message}`, "bad"); }
    el.value = "";
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
  template: el => {
    const kind = el.dataset.kind;
    download(makeTemplate(kind, window.XLSX), kind === "prepost" ? "설문입력템플릿_사전사후.xlsx" : "설문입력템플릿_만족도.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  },
};
