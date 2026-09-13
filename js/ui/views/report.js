// ⑤ 보고서 화면: 편집 가능한 미리보기 + HWPX/인쇄/복사/프로젝트 저장
import { state, compute, reportBlocks, invalidate, persistSettings } from "../store.js";
import { finalizeBlocks, blocksToText, chartSvg } from "../../report/model.js";
import { blocksToHtml, splitChapters } from "../../report/render-html.js";
import { renderHwpx } from "../../report/render-hwpx.js";
import { svgToPng } from "../../charts/rasterize.js";
import { projectToJson } from "../../io/project.js";
import { esc, toast, busy, download, safeFileName, nextFrame } from "../util.js";
import { refresh } from "../router.js";
import { icon } from "../icons.js";

let includeData = false;

export function render() {
  const r = compute();
  const blocks = reportBlocks();
  const allChapters = splitChapters(finalizeBlocks(r.blocksRaw)).filter(c => c.key !== "summary");
  const title = blocks.find(b => b.type === "title")?.text || "";
  const nEdited = Object.keys(state.overrides).length, nHidden = state.hidden.length;
  return `
  <div class="report-layout">
    <aside class="card side no-print">
      <h2>보고서 설정</h2>
      <label class="field">기관·부서명<input class="in" value="${esc(state.settings.orgName)}" data-change="setting" data-field="orgName"></label>
      <label class="field">보고서 제목<input class="in" value="${esc(state.settings.reportTitle)}" placeholder="${esc(title)}" data-change="setting" data-field="reportTitle"></label>
      <label class="field">작성일<input class="in" value="${esc(state.settings.date)}" data-change="setting" data-field="date"></label>
      <h3>포함할 장</h3>
      ${allChapters.map(c => `<label class="check"><input type="checkbox" ${state.hiddenChapters.includes(c.key) ? "" : "checked"} data-change="chapter" data-key="${esc(c.key)}"> ${esc(c.display || c.title)}</label>`).join("")}
      <h3>문장 편집</h3>
      <p class="small muted">미리보기의 문장을 클릭해 직접 고칠 수 있습니다(Enter로 확정). 굵게는 <code>**텍스트**</code>. ✕로 문장 빼기, ↺로 자동 문장 복원.</p>
      <p class="small">수정 ${nEdited}건 · 숨김 ${nHidden}건</p>
      <div class="row gap wrap">${nEdited ? `<button class="btn sm ghost" data-act="reset-all">수정 모두 되돌리기</button>` : ""}${nHidden ? `<button class="btn sm ghost" data-act="unhide-all">숨긴 문장 복원</button>` : ""}</div>
      <h3>내보내기</h3>
      <button class="btn primary block" data-act="export-hwpx">${icon("download", 17)}한글(HWPX) 내려받기</button>
      <button class="btn block" data-act="print">${icon("printer", 17)}인쇄 / PDF 저장</button>
      <button class="btn block" data-act="copy">보고서 복사(워드·구글문서 붙여넣기)</button>
      <button class="btn block" data-act="goto" data-to="present" data-sub="1">${icon("play", 16)}발표 모드로 보기</button>
      <hr>
      <label class="check small"><input type="checkbox" ${includeData ? "checked" : ""} data-change="include-data"> 원자료 포함 (개인정보 주의)</label>
      <button class="btn block ghost" data-act="save-project">프로젝트 파일 저장</button>
      <p class="small muted">프로젝트 파일에는 문항 설정·사업정보·성과지표·문장 수정이 저장되어 다음에 같은 설문을 올리면 그대로 적용됩니다.</p>
    </aside>
    <div class="paper edit" id="reportPaper">${blocksToHtml(blocks, { editable: true })}</div>
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
  setting: el => { state.settings[el.dataset.field] = el.value.trim(); persistSettings(); invalidate(); refresh(); },
  chapter: el => {
    const k = el.dataset.key;
    state.hiddenChapters = el.checked ? state.hiddenChapters.filter(x => x !== k) : [...new Set([...state.hiddenChapters, k])];
    refresh();
  },
  "hide-item": el => { state.hidden = [...new Set([...state.hidden, el.dataset.key])]; refresh(); },
  "reset-item": el => { delete state.overrides[el.dataset.key]; refresh(); },
  "reset-all": () => { state.overrides = {}; refresh(); },
  "unhide-all": () => { state.hidden = []; refresh(); },
  "include-data": el => { includeData = el.checked; },
  print: () => window.print(),
  "export-hwpx": async () => {
    const blocks = reportBlocks();
    const title = blocks.find(b => b.type === "title")?.text || "보고서";
    busy(true, "HWPX 생성 준비 중…");
    await nextFrame();
    try {
      const { TEMPLATE_PARTS } = await import("../../report/hwpx/template-parts.js");
      const bytes = await renderHwpx(blocks, {
        parts: TEMPLATE_PARTS, JSZip: window.JSZip, title, creator: state.settings.orgName,
        rasterize: (svg, w, h) => svgToPng(svg, w, h, 2.5),
        onProgress: (i, n) => busy(true, `그래프 변환 ${i}/${n}`),
      });
      download(new Blob([bytes], { type: "application/hwp+zip" }), `${safeFileName(title)}.hwpx`);
      toast("HWPX 파일을 내려받았습니다. 한글에서 열어 붙임 문서로 사용하세요.", "ok", 5000);
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
