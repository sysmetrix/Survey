// HWPX 읽기(js/report/hwpx/read.js): 문단·표 추출, 병합 셀, 잘못된 파일
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DOMParser } from "@xmldom/xmldom";
import { createHwpxDoc } from "../../../js/report/hwpx/writer.js";
import { packHwpx } from "../../../js/report/hwpx/package.js";
import { TEMPLATE_PARTS } from "../../../js/report/hwpx/template-parts.js";
import { readHwpxText } from "../../../js/report/hwpx/read.js";

const require = createRequire(import.meta.url);
const JSZip = require("../../../vendor/jszip-3.10.1.min.js");

const pack = doc => packHwpx(doc.finish(), JSZip);

test("문단과 표를 순서대로 추출하고, 표 안 문단은 별도 문단으로 세지 않음", async () => {
  const doc = createHwpxDoc({ parts: TEMPLATE_PARTS, title: "t" });
  doc.heading(1, "Ⅰ. 추진배경").paragraph("청소년 진로 고민이 많다.");
  doc.table({ columns: [{ weight: 1 }, { weight: 1 }], rows: [["항목", "내용"], ["사업명", "진로체험 캠프"], ["산출", "캠프 4회 운영"]] });
  doc.paragraph("Ⅱ. 기대효과");
  const bytes = await pack(doc);

  const { paragraphs, tables } = await readHwpxText(bytes, { JSZip, DOMParser });
  assert.ok(paragraphs.includes("Ⅰ. 추진배경"));
  assert.ok(paragraphs.includes("청소년 진로 고민이 많다."));
  assert.ok(paragraphs.includes("Ⅱ. 기대효과"));
  assert.ok(!paragraphs.some(p => /사업명|진로체험 캠프|산출/.test(p)), "표 안 텍스트는 문단 목록에 없어야 함");

  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].headers, ["항목", "내용"]);
  assert.deepEqual(tables[0].rows, [["사업명", "진로체험 캠프"], ["산출", "캠프 4회 운영"]]);
});

test("여러 섹션을 순서대로 병합", async () => {
  const doc = createHwpxDoc({ parts: TEMPLATE_PARTS, title: "t" });
  doc.paragraph("첫 문단");
  const bytes = await pack(doc);
  const { paragraphs } = await readHwpxText(bytes, { JSZip, DOMParser });
  assert.ok(paragraphs.includes("첫 문단"));
});

test("병합 셀(rowSpan)은 모든 칸에 텍스트가 중복 배치됨", async () => {
  const doc = createHwpxDoc({ parts: TEMPLATE_PARTS, title: "t" });
  doc.table({
    columns: [{ weight: 1 }, { weight: 1 }],
    rows: [["항목", "내용"], [{ text: "공통칸", rowSpan: 2 }, "첫줄"], ["둘째줄"]],
  });
  const bytes = await pack(doc);
  const { tables } = await readHwpxText(bytes, { JSZip, DOMParser });
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].rows, [["공통칸", "첫줄"], ["공통칸", "둘째줄"]]);
});

test("mimetype 이 없거나 틀리면 NOT_HWPX 오류", async () => {
  const zip = new JSZip();
  zip.file("mimetype", "text/plain", { binary: true, compression: "STORE" });
  zip.file("Contents/section0.xml", "<hs:sec/>");
  const bytes = await zip.generateAsync({ type: "uint8array" });
  await assert.rejects(() => readHwpxText(bytes, { JSZip, DOMParser }), /NOT_HWPX/);
});

test("HWPX 가 아닌 임의 zip/파일도 오류로 처리", async () => {
  const bytes = new TextEncoder().encode("이건 그냥 텍스트 파일입니다");
  await assert.rejects(() => readHwpxText(bytes, { JSZip, DOMParser }), /NOT_HWPX/);
});
