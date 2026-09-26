// HWPX 작성기 스모크 테스트 문서 생성 → out/smoke.hwpx
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { DOMParser } from "@xmldom/xmldom";
import { TEMPLATE_PARTS } from "../js/report/hwpx/template-parts.js";
import { createHwpxDoc } from "../js/report/hwpx/writer.js";
import { packHwpx } from "../js/report/hwpx/package.js";
import { validateHwpx } from "../js/report/hwpx/validate.js";
const require = createRequire(import.meta.url);
const JSZip = require("../vendor/jszip-3.10.1.min.js");

import { testBarsPng } from "./lib/png.mjs";
const wPx = 600, hPx = 300;
const png = testBarsPng(wPx, hPx);

const doc = createHwpxDoc({ parts: TEMPLATE_PARTS, title: "스모크 테스트 & <검증>", creator: "설문분석도구" });
doc.title("2026년 청소년 진로탐색 프로그램 결과보고", "소속 기관 · 2026. 9. 13.");
doc.box(["□ 성과지표 6개 중 **4개 달성**(달성률 97.3%)", "□ 전반적 만족도 4.32점(100점 환산 83.0점)"]);
doc.heading(1, "Ⅰ. 사업 개요");
doc.bullet(1, "사업목적: 청소년의 **진로 탐색 역량** 강화 및 자기주도성 향상을 위한 체험 중심 프로그램 운영으로, 줄이 길어질 때 내어쓰기가 올바르게 정렬되는지 확인하기 위한 긴 문장입니다.");
doc.bullet(2, "운영기간: 2026. 3. ~ 2026. 8. (총 12회기)");
doc.bullet(3, "특수문자 이스케이프 확인: R&D <테스트> \"따옴표\"");
doc.bullet(4, "4수준 항목");
doc.heading(2, "1. 성과지표 달성 현황");
doc.caption("<표 1> 성과지표 달성 현황");
doc.note("(단위: 명, %)", { align: "RIGHT", keepNext: true });
doc.table({
  columns: [{ weight: 3, align: "LEFT" }, { weight: 1.2 }, { weight: 1 }, { weight: 1 }, { weight: 1 }, { weight: 1.2 }],
  rows: [
    [{ text: "지표", rowSpan: 2 }, { text: "단계", rowSpan: 2 }, { text: "목표 대비 실적", colSpan: 3 }, { text: "판정", rowSpan: 2 }],
    ["목표", "실적", "달성률"],
    ["참여 인원", "산출", "200", "230", "115.0", { text: "달성", shade: "good", bold: true }],
    ["진로탐색 역량 향상(사후−사전)", "단기성과", "0.30", "0.25", "83.3", { text: "미달성", shade: "bad", bold: true }],
    [{ text: "합계", shade: "total", bold: true }, { text: "-", shade: "total" }, { text: "", colSpan: 3, shade: "total" }, { text: "1/2", shade: "total" }],
  ],
  headerRows: 2,
});
doc.note("주: 달성률 = 실적 ÷ 목표 × 100");
doc.figure({ png, wPx, hPx, widthMm: 120 });
doc.caption("<그림 1> 견본 그림", { before: 60, after: 400 });
doc.pageBreak();
doc.heading(1, "Ⅱ. 둘째 쪽");
doc.paragraph("쪽 나눔 확인용 문단");

const entries = doc.finish();
const errors = validateHwpx(entries, DOMParser);
if (errors.length) { console.error("검증 실패:\n" + errors.join("\n")); process.exit(1); }
await mkdir("out", { recursive: true });
await writeFile("out/smoke.hwpx", await packHwpx(entries, JSZip));
console.log("out/smoke.hwpx 생성 · 검증 통과 · 본문폭(mm)=", doc.bodyWidthMm.toFixed(1));
