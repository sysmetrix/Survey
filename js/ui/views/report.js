// ⑤ 보고서 화면: 편집 가능한 미리보기 + 한글 문서 서식(글꼴·크기·줄 간격) + HWPX/인쇄/복사/프로젝트 저장
import { state, compute, reportBlocks, invalidate, persistSettings } from "../store.js";
import { finalizeBlocks, blocksToText, chartSvg } from "../../report/model.js";
import { blocksToHtml, splitChapters, titleBlockHtml } from "../../report/render-html.js";
import { renderHwpx } from "../../report/render-hwpx.js";
import { FONT_PRESETS, FONT_SIZES, LINE_SPACINGS, DEFAULT_FONT_PRESET, DEFAULT_BASE_SIZE, DEFAULT_LINE_SPACING, resolveFonts, cleanFontName } from "../../report/hwpx/fonts.js";
import { svgToPng } from "../../charts/rasterize.js";
import { projectToJson } from "../../io/project.js";
import { esc, toast, busy, download, safeFileName, nextFrame, option } from "../util.js";
import { withWeekday } from "../../core/util.js";
import { refresh } from "../router.js";
import { icon } from "../icons.js";
import { isFontInstalled, fontNameCandidates } from "../fontcheck.js";
import { stripInlineMarks } from "../../report/inline-marks.js";
import { ORG_EXAMPLE, AUTHOR_EXAMPLE } from "../examples.js";

let includeData = false;
let fontStatus = {}; // 글꼴 이름 → true/false/null (설치 확인 결과)
let checkingFonts = false;
let saveOpen = false;
// 상단 도구모음 상태(설정이 아니라 화면 표시 전용 — 저장하지 않음)
let zoomPct = 100; // 미리보기 확대율. 100%는 baseSize 그대로, 내보내기(HWPX·인쇄)에는 영향 없음
let helpOpen = false; // "?" 도움말 팝오버
let formatOpen = false; // 한글 문서 서식 팝오버(도구모음)
let jumpOpen = false; // 장 이동 팝오버(도구모음)

// 팝오버 밖을 클릭하면 닫음 — 토글 버튼 자체·팝오버 안쪽 클릭은 제외 (테스트는 DOM 없이 이 파일을 불러오므로 가드)
if (typeof document !== "undefined") {
  document.addEventListener("click", e => {
    if (!helpOpen && !formatOpen && !jumpOpen) return;
    if (e.target.closest?.("[data-act='toggle-help'], [data-act='format-toggle'], [data-act='toggle-jump'], .rt-pop")) return;
    let changed = false;
    if (helpOpen) { helpOpen = false; changed = true; }
    if (formatOpen) { formatOpen = false; changed = true; }
    if (jumpOpen) { jumpOpen = false; changed = true; }
    if (changed) refresh();
  });
}

const docOptions = () => {
  const s = state.settings;
  return { fontPreset: s.fontPreset, fontBody: s.fontBody, fontHeading: s.fontHeading, baseSize: s.baseSize, lineSpacing: s.lineSpacing, headerBlock: s.headerBlock };
};

/** 미리보기 용지에 서식 반영 (CSS 변수) */
/**
 * 화면(CSS)에서 쓸 글꼴 스택 — 실제 설치된 글꼴은 이름 표기가 조금씩 다를 수 있어(예:
 * "KoPub돋움체 Medium" vs "KoPub Dotum Medium"), 설치 확인(fontcheck.js)과 같은 별칭 목록을
 * 그대로 후보로 나열해야 브라우저가 실제 설치된 이름을 찾아 화면에도 적용함(HWPX는 한글 자체
 * 별칭 처리가 있어 이 문제가 없었음).
 */
function fontStack(name) {
  return fontNameCandidates(name).map(n => `"${cleanFontName(n)}"`).join(", ");
}

function paperStyle() {
  const f = resolveFonts(state.settings);
  const qAll = fontStack;
  const baseSize = Number(state.settings.baseSize) || DEFAULT_BASE_SIZE;
  const zoom = zoomPct / 100; // 화면 미리보기 전용 배율 — 내보내기(HWPX·인쇄)는 항상 baseSize 그대로
  const size = baseSize * 1.36 * zoom;
  const lh = ((Number(state.settings.lineSpacing) || DEFAULT_LINE_SPACING) / 100 * 1.09).toFixed(2);
  const scaled = px => `${(px * baseSize * zoom / 11).toFixed(1)}px`; // 11pt 기준으로 그려둔 제목·표 크기 배율(고정값, 기본 글자 크기와 무관)
  // 공문서형처럼 제목 글꼴을 큰 제목에만 쓰는 조합에서는 표·캡션·요약상자를 본문 글꼴로
  const sub = f.headingOnly ? f.body : f.heading;
  return `--paper-body:${qAll(f.body)}, "함초롬바탕", "Batang", serif; --paper-heading:${qAll(f.heading)}, "함초롬돋움", "Malgun Gothic", sans-serif; --paper-sub-font:${qAll(sub)}, "함초롬돋움", "Malgun Gothic", sans-serif; --paper-size:${size.toFixed(1)}px; --paper-size-print:${baseSize}pt; --paper-title-size:${scaled(26)}; --paper-h1-size:${scaled(20)}; --paper-h2-size:${scaled(17)}; --paper-small-size:${scaled(14)}; --paper-table-size:${scaled(12.5)}; --paper-compact-size:${scaled(11.5)}; --paper-note-size:${scaled(12)}; --paper-lh:${lh}; --paper-maxw:${(900 * zoom).toFixed(0)}px; --paper-pad-y:${(56 * zoom).toFixed(0)}px; --paper-pad-x:${(64 * zoom).toFixed(0)}px`;
}

function fontBadge(name) {
  const st = fontStatus[name];
  if (st === undefined) return "";
  return st ? `<span class="badge ok">이 PC에 설치됨</span>` : st === false ? `<span class="badge warn">이 PC에 없음</span>` : `<span class="badge muted">확인 불가</span>`;
}

/** 글꼴 조합 선택 — 이름 글자 자체를 그 글꼴로 보여주는 칩(드롭다운 대신) */
function fontPicker(p) {
  return `<div class="fontpick" role="listbox" aria-label="글꼴 조합">
    ${FONT_PRESETS.filter(x => !x.hidden || x.id === p.id).map(x => `<button type="button" class="chip-btn fontpick-chip${x.id === p.id ? " on" : ""}" data-act="doc-preset" data-id="${x.id}" style="${esc(`font-family:${x.body ? fontStack(x.body) : "inherit"}, var(--font)`)}" role="option" aria-selected="${x.id === p.id}">${x.id === p.id ? icon("check", 13) : ""}${esc(x.name)}</button>`).join("")}
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
      <label class="check" data-tip="${esc("문서 맨 위에 공문서 붙임 서식(왼쪽 '붙임' 남색 칸 + 오른쪽 제목 칸)을 넣습니다. 제목 칸에는 보고서 제목이 그대로 들어갑니다.")}"><input type="checkbox" ${s.headerBlock ? "checked" : ""} data-change="doc" data-field="headerBlock"> 상단 표제부 넣기(붙임 서식)</label>
      <div class="font-names">${names.map(n => `<div class="row gap wrap small"><span>${esc(n)} <span class="muted">${esc(roleOf(n))}</span></span>${fontBadge(n)}</div>`).join("")}</div>
      <div class="row gap wrap format-actions">
        <button class="btn sm sub" data-act="font-check" ${checkingFonts ? "disabled aria-busy=\"true\"" : ""}>${icon("check", 15)}${checkingFonts ? "글꼴 확인 중…" : "이 PC의 글꼴 확인"}</button>
        <button class="btn sm sub" data-act="reset-doc">기본 서식으로</button>
      </div>
      <p class="small muted format-help">선택 즉시 오른쪽 미리보기에 반영됩니다. 글꼴 확인 시 브라우저가 로컬 글꼴 접근 권한을 물을 수 있습니다.</p>`;
}

export function render() {
  const r = compute();
  const blocks = reportBlocks();
  const allChapters = splitChapters(finalizeBlocks(r.blocksRaw)).filter(c => c.key !== "summary");
  const title = blocks.find(b => b.type === "title")?.text || "";
  const nEdited = Object.keys(state.overrides).length, nHidden = state.hidden.length;
  const docPreset = FONT_PRESETS.find(x => x.id === state.settings.fontPreset) || FONT_PRESETS[0];
  const docFonts = resolveFonts(state.settings);
  const visibleChapters = allChapters.filter(c => !state.hiddenChapters.includes(c.key));
  const editedList = Object.entries(state.overrides);
  return `
  <div class="report-toolbar no-print">
    <div class="rt-pop-wrap">
      <button class="rt-btn" data-act="toggle-help" aria-expanded="${helpOpen}" aria-haspopup="true">${icon("help", 16)}사용법</button>
      ${helpOpen ? `<div class="rt-pop wide" role="dialog" aria-label="보고서 화면 사용법">
        <p><b>이 화면은</b> — 분석 결과로 자동으로 만들어진 문장·표·그래프를 검토·수정해 한글(HWPX) 보고서로 완성하는 곳입니다.</p>
        <p><b>문장 편집</b> — 미리보기의 문장을 클릭해 직접 고칩니다.</p>
        <dl class="rt-keys">
          <dt><kbd>Enter</kbd></dt><dd>고친 내용 확정</dd>
          <dt>✕</dt><dd>이 문장 빼기</dd>
          <dt>↺</dt><dd>자동 문장으로 되돌리기</dd>
        </dl>
        <p><b>${esc(docPreset.name)} · ${state.settings.baseSize}pt 버튼</b> — 글꼴 조합·글자 크기·줄 간격과 상단 표제부(붙임 서식) 여부를 바꿉니다.</p>
        <p><b>장 이동</b> — 지금 포함된 장으로 미리보기를 바로 옮깁니다. 어떤 장을 넣고 뺄지는 왼쪽 사이드바 ‘포함할 장’에서 고릅니다.</p>
        <p><b>확대·축소(－ ％ ＋)</b> — 미리보기가 보이는 크기만 바꾸며, 실제 문서·글자 크기에는 영향이 없습니다.</p>
        <p><b>${icon("download", 13)} ${icon("printer", 13)} ${icon("copy", 13)}</b> — 차례로 한글(HWPX) 내려받기, 인쇄·PDF 저장, 워드·구글문서에 붙여넣을 복사입니다.</p>
        <p class="small muted" style="margin-top:8px">왼쪽 사이드바에서 기관명·제목·작성일을 채우고, 다 쓰면 맨 아래 ‘프로젝트 파일 저장’으로 지금 상태를 남겨 두세요.</p>
      </div>` : ""}
    </div>
    <div class="rt-sep" aria-hidden="true"></div>
    <div class="rt-pop-wrap">
      <button class="rt-btn rt-fmt-trigger" data-act="format-toggle" aria-expanded="${formatOpen}" aria-haspopup="true" style="${esc(`font-family:${fontStack(docFonts.body)}, var(--font)`)}"><span class="glyph">가</span> ${esc(docPreset.name)} · ${state.settings.baseSize}pt</button>
      ${formatOpen ? `<div class="rt-pop wide" role="dialog" aria-label="한글 문서 서식">${formatPanel()}</div>` : ""}
    </div>
    <div class="rt-sep" aria-hidden="true"></div>
    <div class="rt-pop-wrap">
      <button class="rt-btn" data-act="toggle-jump" aria-expanded="${jumpOpen}" aria-haspopup="true">${icon("notes", 16)}장 이동</button>
      ${jumpOpen ? `<div class="rt-pop" role="dialog" aria-label="장 이동">
        <div class="edited-list">${visibleChapters.map((c, i) => `<button type="button" class="edited-item" data-act="jump-chapter-to" data-id="r-ch-${i}">${esc(c.display || c.title)}${icon("right", 14)}</button>`).join("")}</div>
      </div>` : ""}
    </div>
    <div class="rt-sep" aria-hidden="true"></div>
    <div class="rt-group" role="group" aria-label="미리보기 크기">
      <button class="rt-btn" data-act="zoom-out" aria-label="축소" ${zoomPct <= 70 ? "disabled" : ""}>−</button>
      <button class="rt-btn rt-zoom-val" data-act="zoom-reset" title="100%로">${zoomPct}%</button>
      <button class="rt-btn" data-act="zoom-in" aria-label="확대" ${zoomPct >= 150 ? "disabled" : ""}>＋</button>
    </div>
    <div class="rt-spacer"></div>
    <div class="rt-io-group" role="group" aria-label="내보내기">
      <button class="rt-btn primary" data-act="export-hwpx" title="한글(HWPX) 내려받기">${icon("download", 16)}</button>
      <button class="rt-btn" data-act="print" title="인쇄 / PDF 저장">${icon("printer", 16)}</button>
      <button class="rt-btn" data-act="copy" title="보고서 복사(워드·구글문서 붙여넣기)">${icon("copy", 16)}</button>
    </div>
  </div>
  <div class="report-layout">
    <aside class="card side no-print">
      <h2>보고서 설정</h2>
      <div class="grid-2in">
        <label class="field">기관·부서명<input class="in" value="${esc(state.settings.orgName)}" placeholder="${ORG_EXAMPLE}" data-change="setting" data-field="orgName"></label>
        <label class="field">담당자명<input class="in" value="${esc(state.settings.author)}" placeholder="${AUTHOR_EXAMPLE}" data-change="setting" data-field="author"></label>
      </div>
      <p class="small muted">이 브라우저에 저장되어 다음 보고서에도 그대로 쓰입니다.</p>
      <label class="field">보고서 제목<input class="in" value="${esc(state.settings.reportTitle)}" placeholder="${esc(title)}" data-change="setting" data-field="reportTitle"></label>
      <label class="field">작성일<input class="in" value="${esc(state.settings.date)}" data-change="setting" data-field="date"></label>

      <h3>포함할 장</h3>
      <div class="chapter-list">${allChapters.map(c => `<label class="check"><input type="checkbox" ${state.hiddenChapters.includes(c.key) ? "" : "checked"} data-change="chapter" data-key="${esc(c.key)}"> ${esc(c.display || c.title)}</label>`).join("")}</div>

      <h3 class="side-sep">문장 편집</h3>
      ${!nEdited && !nHidden ? `<p class="small muted">아직 고친 문장이 없습니다. 미리보기의 문장을 눌러 바로 고쳐 보세요.</p>` : `
        ${nEdited ? `<div class="edited-list">${editedList.map(([key, text]) => { const plain = stripInlineMarks(text); return `<button type="button" class="edited-item" data-act="jump-edit" data-key="${esc(key)}">${esc(plain.length > 44 ? plain.slice(0, 44) + "…" : plain)}${icon("right", 14)}</button>`; }).join("")}</div>
          <div class="row gap wrap"><button class="btn sm sub" data-act="reset-all">수정 모두 되돌리기</button></div>` : ""}
        ${nHidden ? `<div class="row gap wrap edit-stats"><span class="badge warn">숨김 ${nHidden}건</span><button class="btn sm sub" data-act="unhide-all">숨긴 문장 복원</button></div>` : ""}
      `}

      <button class="side-toggle group" data-act="save-toggle" aria-expanded="${saveOpen}" aria-controls="saveBody"><b>프로젝트 파일 저장</b><span class="row gap"><span class="small muted">${includeData ? "원자료 포함" : "설정만"}</span>${icon(saveOpen ? "left" : "right", 16, "chev")}</span></button>
      ${saveOpen ? `<div id="saveBody">
        <label class="check small"><input type="checkbox" ${includeData ? "checked" : ""} data-change="include-data"> 원자료 포함 (개인정보 주의)</label>
        <button class="btn block sub" data-act="save-project">프로젝트 파일 저장</button>
        <p class="small muted">프로젝트 파일에는 문항 설정·사업정보·성과지표·문장 수정·문서 서식이 저장되어 다음에 같은 설문을 올리면 그대로 적용됩니다.</p>
      </div>` : ""}
    </aside>
    <div class="paper edit" id="reportPaper" style="${esc(paperStyle())}">${state.settings.headerBlock ? titleBlockHtml(title) : ""}${blocksToHtml(blocks, { editable: true })}</div>
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
    if (f === "headerBlock") state.settings.headerBlock = el.checked;
    else state.settings[f] = ["baseSize", "lineSpacing"].includes(f) ? Number(el.value) : f === "fontPreset" ? el.value : cleanFontName(el.value);
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
  "save-toggle": () => { saveOpen = !saveOpen; refresh(); },
  "toggle-help": () => { helpOpen = !helpOpen; refresh(); },
  "jump-edit": el => {
    const key = el.dataset.key;
    const target = [...document.querySelectorAll("[data-edit]")].find(n => n.dataset.edit === key);
    if (!target) return;
    target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    target.classList.add("jump-flash");
    setTimeout(() => target.classList.remove("jump-flash"), 1600);
  },
  "toggle-jump": () => { jumpOpen = !jumpOpen; refresh(); },
  "jump-chapter-to": el => {
    const id = el.dataset.id;
    jumpOpen = false;
    refresh(); // 팝오버부터 닫고, 새로 그려진 뒤(다음 프레임)에 스크롤 — 중간에 DOM이 바뀌어 스크롤이 끊기지 않게
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
  },
  "zoom-out": () => { zoomPct = Math.max(70, zoomPct - 10); refresh(); },
  "zoom-in": () => { zoomPct = Math.min(150, zoomPct + 10); refresh(); },
  "zoom-reset": () => { zoomPct = 100; refresh(); },
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
