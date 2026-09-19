// ⑤ 보고서 화면: 편집 가능한 미리보기 + 한글 문서 서식(글꼴·크기·줄 간격) + HWPX/인쇄/복사/프로젝트 저장
import { state, compute, reportBlocks, invalidate, persistSettings } from "../store.js";
import { finalizeBlocks, blocksToText, chartSvg } from "../../report/model.js";
import { blocksToHtml, splitChapters } from "../../report/render-html.js";
import { renderHwpx } from "../../report/render-hwpx.js";
import { FONT_PRESETS, FONT_SIZES, LINE_SPACINGS, DEFAULT_FONT_PRESET, DEFAULT_BASE_SIZE, DEFAULT_LINE_SPACING, resolveFonts, cleanFontName } from "../../report/hwpx/fonts.js";
import { svgToPng } from "../../charts/rasterize.js";
import { projectToJson } from "../../io/project.js";
import { esc, toast, busy, download, safeFileName, nextFrame, option } from "../util.js";
import { withWeekday } from "../../core/util.js";
import { refresh } from "../router.js";
import { icon } from "../icons.js";
import { isFontInstalled } from "../fontcheck.js";

let includeData = false;
let fontStatus = {}; // 글꼴 이름 → true/false/null (설치 확인 결과)
let checkingFonts = false;
// 사이드바 각 패널의 펼침 여부(기본은 접힘) — 근본적으로 사이드바가 길어지는 건 여러 설정이
// 한 화면에 다 펼쳐져 있기 때문이므로, 자주 안 바꾸는 항목은 접어 자기 요약 한 줄만 보여준다.
let formatOpen = false;
let chaptersOpen = null; // null = 아직 안 건드림 → 장을 하나라도 뺐으면 기본으로 펼침
let saveOpen = false;

const docOptions = () => {
  const s = state.settings;
  return { fontPreset: s.fontPreset, fontBody: s.fontBody, fontHeading: s.fontHeading, baseSize: s.baseSize, lineSpacing: s.lineSpacing };
};

/** 미리보기 용지에 서식 반영 (CSS 변수) */
function paperStyle() {
  const f = resolveFonts(state.settings);
  const q = n => `"${cleanFontName(n)}"`;
  const baseSize = Number(state.settings.baseSize) || DEFAULT_BASE_SIZE;
  const size = baseSize * 1.36;
  const lh = ((Number(state.settings.lineSpacing) || DEFAULT_LINE_SPACING) / 100 * 1.09).toFixed(2);
  const scaled = px => `${(px * baseSize / 11).toFixed(1)}px`; // 11pt 기준으로 그려둔 제목·표 크기 배율(고정값, 기본 글자 크기와 무관)
  // 공문서형처럼 제목 글꼴을 큰 제목에만 쓰는 조합에서는 표·캡션·요약상자를 본문 글꼴로
  const sub = f.headingOnly ? f.body : f.heading;
  return `--paper-body:${q(f.body)}, "함초롬바탕", "Batang", serif; --paper-heading:${q(f.heading)}, "함초롬돋움", "Malgun Gothic", sans-serif; --paper-sub-font:${q(sub)}, "함초롬돋움", "Malgun Gothic", sans-serif; --paper-size:${size.toFixed(1)}px; --paper-size-print:${baseSize}pt; --paper-title-size:${scaled(26)}; --paper-h1-size:${scaled(20)}; --paper-h2-size:${scaled(17)}; --paper-small-size:${scaled(14)}; --paper-table-size:${scaled(12.5)}; --paper-compact-size:${scaled(11.5)}; --paper-note-size:${scaled(12)}; --paper-lh:${lh}`;
}

function fontBadge(name) {
  const st = fontStatus[name];
  if (st === undefined) return "";
  return st ? `<span class="badge ok">이 PC에 설치됨</span>` : st === false ? `<span class="badge warn">이 PC에 없음</span>` : `<span class="badge muted">확인 불가</span>`;
}

/** 글꼴 조합 선택 — 이름 글자 자체를 그 글꼴로 보여주는 칩(드롭다운 대신) */
function fontPicker(p) {
  return `<div class="fontpick" role="listbox" aria-label="글꼴 조합">
    ${FONT_PRESETS.map(x => `<button type="button" class="chip-btn fontpick-chip${x.id === p.id ? " on" : ""}" data-act="doc-preset" data-id="${x.id}" style="font-family:'${esc(x.body || "inherit")}', var(--font)" role="option" aria-selected="${x.id === p.id}">${x.id === p.id ? icon("check", 13) : ""}${esc(x.name)}</button>`).join("")}
  </div>`;
}

function formatPanel() {
  const s = state.settings;
  const p = FONT_PRESETS.find(x => x.id === s.fontPreset) || FONT_PRESETS[0];
  const f = resolveFonts(s);
  const names = [...new Set([f.body, f.heading, f.boldFace].filter(Boolean))];
  // 어느 글꼴이 어디에 쓰이는지 표시 (공문서형은 제목 글꼴을 큰 제목에만 사용)
  const roleOf = n => n === f.boldFace ? "굵게" : n !== f.body && n === f.heading ? (f.headingOnly ? "제목" : "제목·표") : "본문";
  return `
      ${fontPicker(p)}
      ${p.id === "custom" ? `<div class="grid-2in">
        <label class="field">본문 글꼴<input class="in" value="${esc(s.fontBody)}" placeholder="예: 휴먼명조" maxlength="40" data-change="doc" data-field="fontBody"></label>
        <label class="field">제목 글꼴<input class="in" value="${esc(s.fontHeading)}" placeholder="비우면 본문과 같음" maxlength="40" data-change="doc" data-field="fontHeading"></label></div>` : ""}
      <p class="small muted">${esc(p.note)}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">내려받기 안내</a>` : ""}</p>
      <div class="row gap wrap">
        <label class="field compact">글자 크기<select class="in" data-change="doc" data-field="baseSize">${FONT_SIZES.map(v => option(v, `${v}pt`, Number(s.baseSize) === v)).join("")}</select></label>
        <label class="field compact">줄 간격<select class="in" data-change="doc" data-field="lineSpacing">${LINE_SPACINGS.map(v => option(v, `${v}%`, Number(s.lineSpacing) === v)).join("")}</select></label>
      </div>
      <div class="font-preview" style="font-family:'${esc(f.body)}', var(--font); font-size:${s.baseSize}pt">가나다 ABC 123 — <b>이렇게 보입니다</b></div>
      <div class="font-names">${names.map(n => `<div class="row gap wrap small"><span>${esc(n)} <span class="muted">${esc(roleOf(n))}</span></span>${fontBadge(n)}</div>`).join("")}</div>
      <div class="row gap wrap format-actions">
        <button class="btn sm sub" data-act="font-check" ${checkingFonts ? "disabled aria-busy=\"true\"" : ""}>${icon("check", 15)}${checkingFonts ? "글꼴 확인 중…" : "이 PC의 글꼴 확인"}</button>
        <button class="btn sm sub" data-act="reset-doc">기본 서식으로</button>
      </div>
      <p class="small muted format-help">선택 즉시 오른쪽 미리보기에 반영됩니다. 글꼴 확인 시 브라우저가 로컬 글꼴 접근 권한을 물을 수 있습니다.</p>
      <p class="small muted">한글 파일에는 글꼴 이름만 들어갑니다. 받는 PC에 글꼴이 없으면 함초롬 글꼴로 대신 표시됩니다. 웹 이모지는 한글에서 보이는 기호로 바뀝니다(예: ✅→√, 😊→^^).</p>`;
}

export function render() {
  const r = compute();
  const blocks = reportBlocks();
  const allChapters = splitChapters(finalizeBlocks(r.blocksRaw)).filter(c => c.key !== "summary");
  const title = blocks.find(b => b.type === "title")?.text || "";
  const nEdited = Object.keys(state.overrides).length, nHidden = state.hidden.length;
  const docPreset = FONT_PRESETS.find(x => x.id === state.settings.fontPreset) || FONT_PRESETS[0];
  const docFonts = resolveFonts(state.settings);
  const nChIncluded = allChapters.filter(c => !state.hiddenChapters.includes(c.key)).length;
  const chSummary = nChIncluded === allChapters.length ? `${allChapters.length}개 장 모두 포함` : `${nChIncluded}/${allChapters.length}개 장 포함`;
  const chOpen = chaptersOpen ?? (nChIncluded !== allChapters.length);
  return `
  <div class="report-layout">
    <aside class="card side no-print">
      <h2>보고서 설정</h2>
      <div class="grid-2in">
        <label class="field">기관·부서명<input class="in" value="${esc(state.settings.orgName)}" data-change="setting" data-field="orgName"></label>
        <label class="field">담당자명<input class="in" value="${esc(state.settings.author)}" placeholder="예: 홍길동" data-change="setting" data-field="author"></label>
      </div>
      <p class="small muted">이 브라우저에 저장되어 다음 보고서에도 그대로 쓰입니다.</p>
      <label class="field">보고서 제목<input class="in" value="${esc(state.settings.reportTitle)}" placeholder="${esc(title)}" data-change="setting" data-field="reportTitle"></label>
      <label class="field">작성일<input class="in" value="${esc(state.settings.date)}" data-change="setting" data-field="date"></label>

      <h3>내보내기</h3>
      <button class="btn primary block" data-act="export-hwpx">${icon("download", 17)}한글(HWPX) 내려받기</button>
      <button class="btn block" data-act="print">${icon("printer", 17)}인쇄 / PDF 저장</button>
      <button class="btn block" data-act="copy">보고서 복사(워드·구글문서 붙여넣기)</button>
      <button class="btn block" data-act="goto" data-to="present" data-sub="1">${icon("play", 16)}발표 모드로 보기</button>

      <button class="side-toggle group" data-act="chapters-toggle" aria-expanded="${chOpen}" aria-controls="chaptersBody"><b>포함할 장</b><span class="row gap"><span class="small muted">${chSummary}</span>${icon(chOpen ? "left" : "right", 16, "chev")}</span></button>
      ${chOpen ? `<div id="chaptersBody">${allChapters.map(c => `<label class="check"><input type="checkbox" ${state.hiddenChapters.includes(c.key) ? "" : "checked"} data-change="chapter" data-key="${esc(c.key)}"> ${esc(c.display || c.title)}</label>`).join("")}</div>` : ""}

      <button class="side-toggle group fmt-toggle" data-act="format-toggle" aria-expanded="${formatOpen}" aria-controls="formatBody">
        <span class="fmt-toggle-text">
          <b>한글 문서 서식</b>
          <span class="fmt-toggle-sub" style="font-family:'${esc(docFonts.body)}', var(--font)">가나다 · ${esc(docPreset.name)} · ${state.settings.baseSize}pt</span>
        </span>
        ${icon(formatOpen ? "left" : "right", 16, "chev")}
      </button>
      ${formatOpen ? `<div id="formatBody">${formatPanel()}</div>` : ""}

      <h3>문장 편집</h3>
      <details class="help"><summary>사용법 보기</summary>
        <p class="small muted">미리보기의 문장을 클릭해 직접 고칠 수 있습니다(Enter로 확정). 굵게는 <code>**텍스트**</code>. ✕로 문장 빼기, ↺로 자동 문장 복원.</p>
      </details>
      <div class="row gap wrap edit-stats"><span class="badge ${nEdited ? "info" : "muted"}">수정 ${nEdited}건</span><span class="badge ${nHidden ? "warn" : "muted"}">숨김 ${nHidden}건</span></div>
      ${nEdited || nHidden ? `<div class="row gap wrap">${nEdited ? `<button class="btn sm sub" data-act="reset-all">수정 모두 되돌리기</button>` : ""}${nHidden ? `<button class="btn sm sub" data-act="unhide-all">숨긴 문장 복원</button>` : ""}</div>` : ""}

      <button class="side-toggle group" data-act="save-toggle" aria-expanded="${saveOpen}" aria-controls="saveBody"><b>프로젝트 파일 저장</b><span class="row gap"><span class="small muted">${includeData ? "원자료 포함" : "설정만"}</span>${icon(saveOpen ? "left" : "right", 16, "chev")}</span></button>
      ${saveOpen ? `<div id="saveBody">
        <label class="check small"><input type="checkbox" ${includeData ? "checked" : ""} data-change="include-data"> 원자료 포함 (개인정보 주의)</label>
        <button class="btn block sub" data-act="save-project">프로젝트 파일 저장</button>
        <p class="small muted">프로젝트 파일에는 문항 설정·사업정보·성과지표·문장 수정·문서 서식이 저장되어 다음에 같은 설문을 올리면 그대로 적용됩니다.</p>
      </div>` : ""}
    </aside>
    <div class="paper edit" id="reportPaper" style="${esc(paperStyle())}">${blocksToHtml(blocks, { editable: true })}</div>
  </div>`;
}

async function figureImages(blocks) {
  const map = new Map();
  for (const b of blocks.filter(x => x.type === "figure")) {
    const { svg, width, height } = chartSvg(b.chart);
    const { png } = await svgToPng(svg, width, height, 2);
    let bin = "";
    for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode.apply(null, png.subarray(i, i + 0x8000));
    map.set(b, `<img src="data:image/png;base64,${btoa(bin)}" width="${Math.min(640, width)}" alt="${esc(b.display)}">`);
  }
  return map;
}

export const actions = {
  setting: el => {
    const f = el.dataset.field;
    state.settings[f] = f === "date" ? withWeekday(el.value) : el.value.trim();
    persistSettings(); invalidate(); refresh();
  },
  doc: el => {
    const f = el.dataset.field;
    state.settings[f] = ["baseSize", "lineSpacing"].includes(f) ? Number(el.value) : f === "fontPreset" ? el.value : cleanFontName(el.value);
    fontStatus = {};
    persistSettings(); refresh();
  },
  "doc-preset": el => {
    state.settings.fontPreset = el.dataset.id;
    fontStatus = {};
    persistSettings(); refresh();
  },
  "font-check": async () => {
    if (checkingFonts) return;
    checkingFonts = true;
    refresh();
    const f = resolveFonts(state.settings);
    const names = [...new Set([f.body, f.heading, f.boldFace].filter(Boolean))];
    try {
      for (const n of names) fontStatus[n] = await isFontInstalled(n, { allowPermissionPrompt: true });
      const missing = names.filter(n => fontStatus[n] === false);
      const unknown = names.filter(n => fontStatus[n] == null);
      const message = missing.length
        ? `확인되지 않은 글꼴: ${missing.join(", ")} — 한글에서는 함초롬 글꼴로 대체됩니다`
        : unknown.length ? "브라우저 권한 제한으로 설치 여부를 확인할 수 없습니다" : "선택한 글꼴이 이 PC에 설치돼 있습니다";
      toast(message, missing.length ? "bad" : unknown.length ? "info" : "ok", 6000);
    } finally {
      checkingFonts = false;
      refresh();
    }
  },
  "format-toggle": () => { formatOpen = !formatOpen; refresh(); },
  "chapters-toggle": () => { chaptersOpen = !(chaptersOpen ?? state.hiddenChapters.length > 0); refresh(); },
  "save-toggle": () => { saveOpen = !saveOpen; refresh(); },
  "reset-doc": () => {
    Object.assign(state.settings, { fontPreset: DEFAULT_FONT_PRESET, fontBody: "", fontHeading: "", baseSize: DEFAULT_BASE_SIZE, lineSpacing: DEFAULT_LINE_SPACING });
    fontStatus = {};
    persistSettings();
    toast("한글 문서 서식을 기본값으로 되돌렸습니다", "ok");
    refresh();
  },
  chapter: el => {
    const k = el.dataset.key;
    state.hiddenChapters = el.checked ? state.hiddenChapters.filter(x => x !== k) : [...new Set([...state.hiddenChapters, k])];
    refresh();
  },
  "hide-item": el => { state.hidden = [...new Set([...state.hidden, el.dataset.key])]; refresh(); },
  "reset-item": el => { delete state.overrides[el.dataset.key]; delete state.overrideBase[el.dataset.key]; refresh(); },
  "reset-all": () => { state.overrides = {}; state.overrideBase = {}; refresh(); },
  "unhide-all": () => { state.hidden = []; refresh(); },
  "include-data": el => { includeData = el.checked; },
  print: () => window.print(),
  "export-hwpx": async () => {
    const blocks = reportBlocks();
    const title = blocks.find(b => b.type === "title")?.text || "보고서";
    busy(true, "HWPX 생성 준비 중…");
    await nextFrame();
    let stats = null;
    try {
      const { TEMPLATE_PARTS } = await import("../../report/hwpx/template-parts.js");
      const bytes = await renderHwpx(blocks, {
        parts: TEMPLATE_PARTS, JSZip: window.JSZip, title, creator: state.settings.author || state.settings.orgName, doc: docOptions(),
        rasterize: (svg, w, h) => svgToPng(svg, w, h, 2.5),
        onProgress: (i, n) => busy(true, `그래프 변환 ${i}/${n}`),
        onStats: s => { stats = s; },
      });
      download(new Blob([bytes], { type: "application/hwp+zip" }), `${safeFileName(title)}.hwpx`);
      const extra = [stats?.emojiReplaced ? `이모지 ${stats.emojiReplaced}곳을 한글 기호로 바꿈` : "", stats?.fonts?.id !== "hancom" ? `글꼴: ${stats.fonts.body}` : ""].filter(Boolean).join(" · ");
      toast(`HWPX 파일을 내려받았습니다.${extra ? ` (${extra})` : ""}`, "ok", 6000);
      document.dispatchEvent(new CustomEvent("survey:exported", { detail: { kind: "hwpx", title } }));
    } catch (e) {
      console.error(e);
      toast(`HWPX 생성 실패: ${e.message}`, "bad", 7000);
    } finally { busy(false); }
  },
  copy: async () => {
    const blocks = reportBlocks();
    busy(true, "복사 준비 중…");
    try {
      const imgs = await figureImages(blocks);
      const html = `<meta charset="utf-8"><div style="font-family:'맑은 고딕',sans-serif">${blocksToHtml(blocks, { figureHtml: b => imgs.get(b) || "" })}</div>`;
      const text = blocksToText(blocks);
      if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      else await navigator.clipboard.writeText(text);
      toast("보고서를 복사했습니다. 워드·구글문서에 붙여넣으세요.", "ok");
    } catch (e) { toast(`복사 실패: ${e.message}`, "bad"); } finally { busy(false); }
  },
  "save-project": () => {
    const name = safeFileName(state.logicModel.programName || state.dataset?.fileName?.replace(/\.[^.]+$/, "") || "설문분석");
    download(projectToJson(state, { includeData }), `${name}.survey.json`, "application/json");
    toast(includeData ? "원자료를 포함해 저장했습니다. 파일 보관에 주의하세요." : "프로젝트 설정을 저장했습니다.", "ok");
  },
};
