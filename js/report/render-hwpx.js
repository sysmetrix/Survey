// 보고서 블록 → HWPX 바이트
import { createHwpxDoc } from "./hwpx/writer.js";
import { packHwpx } from "./hwpx/package.js";
import { chartSvg } from "./model.js";

/**
 * @param {object[]} blocks  finalizeBlocks() 결과
 * @param {{parts:object, JSZip:any, rasterize:(svg:string,w:number,h:number)=>Promise<{png,wPx,hPx}>, title?:string, creator?:string, onProgress?:Function}} env
 */
export async function renderHwpx(blocks, env) {
  const doc = createHwpxDoc({ parts: env.parts, title: env.title || "", creator: env.creator || "" });
  const nFig = blocks.filter(b => b.type === "figure").length;
  let figDone = 0;
  for (const b of blocks) {
    switch (b.type) {
      case "title": doc.title(b.text, b.subtitle); break;
      case "heading": doc.heading(b.level, b.display); break;
      case "bullets": b.items.forEach(it => doc.bullet(it.level, it.text)); break;
      case "paragraph":
        if (b.style === "note") doc.note(b.text); else doc.paragraph(b.text);
        break;
      case "box": doc.box(b.lines.map(l => l.text)); break;
      case "pageBreak": doc.pageBreak(); break;
      case "table":
        doc.caption(b.display, { before: 400, after: 100 });
        if (b.unit) doc.note(b.unit, { align: "RIGHT", keepNext: true, before: 0, after: 40 });
        try {
          doc.table({ columns: b.columns, rows: b.rows, headerRows: b.headerRows ?? 1, fontSize: b.compact ? 8 : 9 });
        } catch (e) { throw new Error(`${b.display}: ${e.message}`); }
        (b.notes || []).forEach(n => doc.note(n));
        break;
      case "figure": {
        const { svg, width, height } = chartSvg(b.chart);
        const img = await env.rasterize(svg, width, height);
        doc.figure({ png: img.png, wPx: img.wPx, hPx: img.hPx, widthMm: b.widthMm || Math.min(165, width / 720 * 160) });
        doc.caption(b.display, { before: 60, after: 120 });
        (b.notes || []).forEach(n => doc.note(n, { align: "CENTER" }));
        env.onProgress?.(++figDone, nFig);
        break;
      }
      default: break;
    }
  }
  return packHwpx(doc.finish(), env.JSZip);
}
