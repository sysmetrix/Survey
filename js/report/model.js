// 보고서 모델: 블록 배열 (HWPX·HTML 미리보기·인쇄·클립보드 공통)
// 블록: title | heading{level,text} | bullets{items:[{level,text,key}]} | paragraph{text,style,key}
//       box{lines:[{text,key}]} | table{caption,unit,columns,rows,headerRows,notes,compact}
//       figure{caption,chart:{kind,data,opts},widthMm,notes} | pageBreak
import * as C from "../charts/svg.js";
import { stripBold } from "./hwpx/writer.js";

const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ", "Ⅺ", "Ⅻ"];
const GANADA = "가나다라마바사아자차카타파하";

/** 장·절 번호, 표·그림 번호 부여 + 사용자 수정문(overrides) 적용 */
export function finalizeBlocks(blocks, { overrides = {}, hidden = new Set(), hiddenChapters = new Set() } = {}) {
  let ch = 0, sec = 0, tbl = 0, fig = 0;
  const out = [];
  let skipping = false;
  for (const b0 of blocks) {
    const b = { ...b0 };
    if (b.type === "heading" && b.level === 1) skipping = hiddenChapters.has(b.text);
    if (skipping) continue;
    if (b.key && hidden.has(b.key)) continue;
    if (b.type === "heading") {
      if (b.level === 1) { if (!b.appendix) { ch++; sec = 0; b.number = `${ROMAN[ch - 1]}.`; } else b.number = ""; }
      else if (b.level === 2) { sec++; b.number = `${sec}.`; }
      else { b.number = `${GANADA[(b.index ?? 1) - 1] || ""}.`; }
      b.display = b.number ? `${b.number} ${b.text}` : b.text;
    }
    if (b.type === "bullets") b.items = b.items.filter(it => !hidden.has(it.key)).map(it => (it.key && overrides[it.key] !== undefined ? { ...it, text: overrides[it.key], edited: true } : it));
    if (b.type === "box") b.lines = b.lines.filter(it => !hidden.has(it.key)).map(it => (it.key && overrides[it.key] !== undefined ? { ...it, text: overrides[it.key], edited: true } : it));
    if (b.type === "paragraph" && b.key && overrides[b.key] !== undefined) { b.text = overrides[b.key]; b.edited = true; }
    if (b.type === "table") { tbl++; b.number = tbl; b.display = `<표 ${tbl}> ${b.caption}`; }
    if (b.type === "figure") { fig++; b.number = fig; b.display = `<그림 ${fig}> ${b.caption}`; }
    if ((b.type === "bullets" && !b.items.length) || (b.type === "box" && !b.lines.length)) continue;
    out.push(b);
  }
  return out;
}

/** 차트 사양 → SVG */
export function chartSvg(chart) {
  const fn = C[chart.kind];
  if (!fn) throw new Error(`알 수 없는 차트: ${chart.kind}`);
  if (chart.kind === "groupedHbar") return fn(chart.categories, chart.series, chart.opts || {});
  if (chart.kind === "likertDiverging") return fn(chart.rows, chart.levelLabels, chart.opts || {});
  if (chart.kind === "npsBar") return fn(chart.data, chart.opts || {});
  return fn(chart.data, chart.opts || {});
}

/** 보고서 평문 (클립보드 텍스트·미리보기 검색용) */
export function blocksToText(blocks) {
  const sym = { 1: "□", 2: "○", 3: "-", 4: "·" };
  return blocks.map(b => {
    switch (b.type) {
      case "title": return `${b.text}\n${b.subtitle || ""}`;
      case "heading": return `\n${b.display}`;
      case "bullets": return b.items.map(it => `${"  ".repeat(it.level - 1)}${sym[it.level]} ${stripBold(it.text)}`).join("\n");
      case "box": return b.lines.map(l => stripBold(l.text)).join("\n");
      case "paragraph": return stripBold(b.text);
      case "table": return `${b.display}\n` + b.rows.map(r => r.map(c => (typeof c === "object" && c ? c.text : c)).join("\t")).join("\n");
      case "figure": return `[${b.display}]`;
      default: return "";
    }
  }).join("\n");
}
