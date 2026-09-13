// HWPX 요소별 진단용 변형 문서 생성 → out/diag/*.hwpx
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { TEMPLATE_PARTS } from "../js/report/hwpx/template-parts.js";
import { createHwpxDoc } from "../js/report/hwpx/writer.js";
import { packHwpx } from "../js/report/hwpx/package.js";
const require = createRequire(import.meta.url);
const JSZip = require("../vendor/jszip-3.10.1.min.js");

const blank = await JSZip.loadAsync(await readFile("templates/hwpx/blank.hwpx"));
const png = await blank.file("Preview/PrvImage.png").async("uint8array");
await mkdir("out/diag", { recursive: true });

const variants = {
  v1_para: { pageNumber: false, build: d => d.paragraph("안녕하세요 문단 하나") },
  v2_pagenum: { pageNumber: true, build: d => d.paragraph("쪽번호 포함") },
  v3_bullets: { pageNumber: false, build: d => { d.title("제목", "부제"); d.heading(1, "Ⅰ. 장"); d.bullet(1, "항목 하나"); d.bullet(2, "항목 둘"); } },
  v4_table: { pageNumber: false, build: d => d.table({ columns: [{ weight: 1 }, { weight: 1 }], rows: [["가", "나"], ["1", "2"]] }) },
  v5_merge: { pageNumber: false, build: d => d.table({ columns: [{ weight: 2 }, { weight: 1 }, { weight: 1 }], rows: [[{ text: "A", rowSpan: 2 }, { text: "B", colSpan: 2 }], ["b1", "b2"], ["x", { text: "좋음", shade: "good" }, "z"]], headerRows: 2 }) },
  v6_figure: { pageNumber: false, build: d => d.figure({ png, wPx: 724, hPx: 1024, widthMm: 40 }) },
  v7_box: { pageNumber: false, build: d => d.box(["□ 요약 1", "□ 요약 2"]) },
};
for (const [name, v] of Object.entries(variants)) {
  const doc = createHwpxDoc({ parts: TEMPLATE_PARTS, title: name, pageNumber: v.pageNumber });
  v.build(doc);
  await writeFile(`out/diag/${name}.hwpx`, await packHwpx(doc.finish(), JSZip));
}
console.log("변형 문서", Object.keys(variants).length, "개 생성");
