// 보고서 블록 → HWPX 바이트
import { createHwpxDoc } from "./hwpx/writer.js";
import { packHwpx } from "./hwpx/package.js";
import { chartSvg } from "./model.js";
import { DEFAULT_BASE_SIZE, DEFAULT_LINE_SPACING } from "./hwpx/fonts.js";

export const MAX_TABLE_COLS = 12;

/**
 * 열이 너무 많은 표를 첫 열(구분)을 유지한 채 여러 표로 나눔 (병합 셀이 있으면 나누지 않음)
 * @returns {object[]} 표 블록 배열
 */
export function splitWideTable(b, maxCols = MAX_TABLE_COLS) {
  const nCols = b.columns.length;
  const merged = b.rows.some(r => r.some(c => c && typeof c === "object" && ((c.colSpan || 1) > 1 || (c.rowSpan || 1) > 1)));
  if (nCols <= maxCols || merged || b.rows.some(r => r.length !== nCols)) return [b];
  const per = maxCols - 1, chunks = [];
  for (let s = 1; s < nCols; s += per) chunks.push([0, ...Array.from({ length: Math.min(per, nCols - s) }, (_, i) => s + i)]);
  return chunks.map((idx, k) => ({
    ...b,
    display: `${b.display} (${k + 1}/${chunks.length})`,
    columns: idx.map(i => b.columns[i]),
    rows: b.rows.map(r => idx.map(i => r[i])),
    notes: k === chunks.length - 1 ? b.notes : [],
    unit: k === 0 ? b.unit : "",
  }));
}

/**
 * @param {object[]} blocks  finalizeBlocks() 결과
 * @param {{parts:object, JSZip:any, rasterize:(svg:string,w:number,h:number)=>Promise<{png,wPx,hPx}>, title?:string, creator?:string, onProgress?:Function,
 *   doc?:{fontPreset?:string, fontBody?:string, fontHeading?:string, baseSize?:number, lineSpacing?:number}}} env
 */
export async function renderHwpx(blocks, env) {
  const d = env.doc || {};
  const baseSize = Number(d.baseSize) || DEFAULT_BASE_SIZE;
  const doc = createHwpxDoc({
    parts: env.parts, title: env.title || "", creator: env.creator || "",
    baseSize, lineSpacing: Number(d.lineSpacing) || DEFAULT_LINE_SPACING,
    fontSettings: { fontPreset: d.fontPreset, fontBody: d.fontBody, fontHeading: d.fontHeading },
  });
  if (d.headerBlock) doc.titleBlock(env.title || "");
  const tableSize = compact => Math.max(7, baseSize - (compact ? 3 : 2));
  const nFig = blocks.filter(b => b.type === "figure").length;
  let figDone = 0;
  for (const b of blocks) {
    switch (b.type) {
      case "title": doc.title(b.text, b.subtitle); break;
      case "heading":
        if (b.level <= 1) doc.blank();
        doc.heading(b.level, b.display);
        break;
      case "bullets": b.items.forEach(it => doc.bullet(it.level, it.text)); break;
      case "paragraph":
        if (b.style === "note") doc.note(b.text); else doc.paragraph(b.text);
        break;
      case "box": doc.box(b.lines.map(l => l.text)); break;
      case "pageBreak": doc.pageBreak(); break;
      case "table":
        for (const part of splitWideTable(b)) {
          doc.caption(part.display, { before: 400, after: 100 });
          if (part.unit) doc.note(part.unit, { align: "RIGHT", keepNext: true, before: 0, after: 40 });
          try {
            doc.table({ columns: part.columns, rows: part.rows, headerRows: part.headerRows ?? 1, fontSize: tableSize(part.compact || part.columns.length > 8) });
          } catch (e) { throw new Error(`${part.display}: ${e.message}`); }
          (part.notes || []).forEach(n => doc.note(n));
        }
        break;
      case "figure": {
        const { svg, width, height } = chartSvg(b.chart);
        const img = await env.rasterize(svg, width, height);
        // 차트는 보고서 여백에 맞춰 본문 폭 그대로 키움(비율은 그대로, 좌우 빈 여백만 최소화) — 블록에서 폭을 따로 지정했으면 그 값 사용
        doc.figure({ png: img.png, wPx: img.wPx, hPx: img.hPx, widthMm: b.widthMm || doc.bodyWidthMm });
        doc.caption(b.display, { before: 60, after: 120, keepNext: !!(b.notes || []).length });
        (b.notes || []).forEach(n => doc.note(n, { align: "CENTER" }));
        env.onProgress?.(++figDone, nFig);
        break;
      }
      default: break;
    }
  }
  const bytes = await packHwpx(doc.finish(), env.JSZip);
  env.onStats?.({ emojiReplaced: doc.emojiReplaced, fonts: doc.fonts });
  return bytes;
}
