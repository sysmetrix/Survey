// 보고서 블록 → HTML (편집 미리보기·대시보드·인쇄·클립보드 공용, 순수 문자열 생성)
import { esc } from "../core/util.js";
import { chartSvg } from "./model.js";
import { BOLD_SPLIT, BOLD_WHOLE } from "./hwpx/writer.js";

const SYM = { 1: "□", 2: "○", 3: "-", 4: "·" };
export const inlineHtml = t => String(t ?? "").split(BOLD_SPLIT).map(s => (BOLD_WHOLE.test(s) ? `<strong>${esc(s.slice(2, -2))}</strong>` : esc(s))).join("").replace(/\n/g, "<br>");

function editableText(it, editable) {
  const { key, text, edited, stale, auto } = it;
  if (!editable || !key) return `<span class="r-txt">${inlineHtml(text)}</span>`;
  return `<span class="r-txt" contenteditable="true" spellcheck="false" data-edit="${esc(key)}" data-raw="${esc(text)}" data-auto="${esc(auto ?? text)}">${inlineHtml(text)}</span>` +
    (stale ? `<span class="r-stale no-print" title="직접 고친 뒤 분석 결과(근거 수치)가 바뀌었습니다. 새 자동 문장: ${esc(auto)}">근거 변경</span>` : "") +
    `<span class="r-tools">${edited ? `<button class="r-tool" data-act="reset-item" data-key="${esc(key)}" title="자동 문장으로 되돌리기">↺</button>` : ""}<button class="r-tool" data-act="hide-item" data-key="${esc(key)}" title="이 문장 빼기">✕</button></span>`;
}

function cellHtml(cell, tag, columns, c) {
  const o = typeof cell === "object" && cell !== null ? cell : { text: cell };
  const cls = [o.shade ? `sh-${o.shade}` : "", o.bold ? "b" : "", `al-${(o.align || (tag === "th" ? "CENTER" : columns[c]?.align || "CENTER")).toLowerCase()}`].filter(Boolean).join(" ");
  return `<${tag}${o.colSpan > 1 ? ` colspan="${o.colSpan}"` : ""}${o.rowSpan > 1 ? ` rowspan="${o.rowSpan}"` : ""} class="${cls}">${inlineHtml(o.text)}</${tag}>`;
}

function tableHtml(b) {
  const hr = b.headerRows ?? 1;
  const occupied = [];
  const body = b.rows.map((row, r) => {
    let c = 0;
    const cells = row.map(cell => {
      occupied[r] ||= [];
      while (occupied[r][c]) c++;
      const o = typeof cell === "object" && cell !== null ? cell : {};
      for (let i = r; i < r + (o.rowSpan || 1); i++) { occupied[i] ||= []; for (let j = c; j < c + (o.colSpan || 1); j++) occupied[i][j] = true; }
      const html = cellHtml(cell, r < hr ? "th" : "td", b.columns, c);
      c += o.colSpan || 1;
      return html;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  const wsum = b.columns.reduce((s, c) => s + (c.weight || 1), 0);
  const cols = b.columns.map(c => `<col style="width:${((c.weight || 1) / wsum * 100).toFixed(2)}%">`).join("");
  return `<div class="r-cap">${esc(b.display)}</div>${b.unit ? `<div class="r-unit">${esc(b.unit)}</div>` : ""}` +
    `<div class="r-tblwrap"><table class="r-tbl${b.compact ? " compact" : ""}"><colgroup>${cols}</colgroup>${body}</table></div>` +
    (b.notes || []).map(n => `<div class="r-note">${inlineHtml(n)}</div>`).join("");
}

/**
 * @param {object[]} blocks  finalizeBlocks 결과
 * @param {{editable?:boolean, figureHtml?:(b)=>string, theme?:'light'|'dark'}} opts  theme: 화면 표시용 차트 테마(보고서·HWPX는 항상 light)
 */
export function blocksToHtml(blocks, { editable = false, figureHtml = null, theme = "light" } = {}) {
  let chIdx = 0; // 장(레벨1 제목) 순번 — 보고서 화면 도구모음의 "장 이동"이 같은 순번의 id로 이동
  return blocks.map(b => {
    switch (b.type) {
      case "title": return `<h1 class="r-title">${esc(b.text)}</h1>${b.subtitle ? `<p class="r-sub">${esc(b.subtitle)}</p>` : ""}`;
      case "heading": return b.level === 1 ? `<h2 class="r-h1" id="r-ch-${chIdx++}">${esc(b.display)}</h2>` : `<h3 class="r-h2">${esc(b.display)}</h3>`;
      case "bullets": return b.items.map(it => `<p class="r-b r-b${it.level}${it.edited ? " edited" : ""}"><span class="r-sym">${SYM[it.level]}</span>${editableText(it, editable)}</p>`).join("");
      case "box": return `<div class="r-box">${b.lines.map(l => `<p class="r-boxline${l.edited ? " edited" : ""}">${editableText(l, editable)}</p>`).join("")}</div>`;
      case "paragraph": return `<p class="r-p${b.style === "note" ? " r-note" : ""}">${editableText(b, editable)}</p>`;
      case "table": return tableHtml(b);
      case "figure": {
        let inner;
        try { inner = figureHtml ? figureHtml(b) : chartSvg(theme === "light" ? b.chart : { ...b.chart, opts: { ...(b.chart.opts || {}), theme } }).svg; } catch (e) { inner = `<div class="r-err">차트 오류: ${esc(e.message)}</div>`; }
        return `<figure class="r-fig">${inner}<figcaption>${esc(b.display)}</figcaption>${(b.notes || []).map(n => `<div class="r-note c">${inlineHtml(n)}</div>`).join("")}</figure>`;
      }
      case "pageBreak": return `<div class="r-pb" aria-hidden="true"></div>`;
      default: return "";
    }
  }).join("\n");
}

/** 장(Ⅰ, Ⅱ …) 단위로 블록 나누기 */
export function splitChapters(blocks) {
  const chapters = [];
  let cur = { title: "요약", key: "summary", blocks: [] };
  blocks.forEach(b => {
    if (b.type === "heading" && b.level === 1) { chapters.push(cur); cur = { title: b.text, display: b.display, key: b.text, blocks: [b] }; }
    else cur.blocks.push(b);
  });
  chapters.push(cur);
  return chapters.filter(c => c.blocks.length);
}
