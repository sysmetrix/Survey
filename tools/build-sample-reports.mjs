// samples/ 의 모든 데이터로 전체 파이프라인 실행 → out/reports/*.hwpx (+ 구조 검증)
// 사용: node tools/build-sample-reports.mjs [파일명 필터]
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { DOMParser } from "@xmldom/xmldom";
import { parseFile } from "../js/io/parse.js";
import { buildCodebook } from "../js/model/codebook.js";
import { buildSurvey } from "../js/model/survey.js";
import { analyzeSurvey } from "../js/analysis/run.js";
import { readBusinessFromDataset } from "../js/evaluation/business-sheet.js";
import { evaluateKpis } from "../js/evaluation/kpi.js";
import { lintEvaluation } from "../js/evaluation/linkage.js";
import { buildReport } from "../js/report/build-report.js";
import { finalizeBlocks, blocksToText } from "../js/report/model.js";
import { renderHwpx } from "../js/report/render-hwpx.js";
import { validateHwpx } from "../js/report/hwpx/validate.js";
import { TEMPLATE_PARTS } from "../js/report/hwpx/template-parts.js";
import { rasterizeSvg } from "./lib/rasterize.mjs";
const require = createRequire(import.meta.url);
const XLSX = require("../vendor/xlsx-0.20.3.full.min.js");
const Papa = require("../vendor/papaparse-5.4.1.min.js");
const JSZip = require("../vendor/jszip-3.10.1.min.js");

const filter = process.argv[2] || "";
await mkdir("out/reports", { recursive: true });
const files = (await readdir("samples")).filter(f => /\.(xlsx|csv)$/i.test(f) && f.includes(filter));
let failed = 0;
for (const f of files) {
  const t0 = Date.now();
  const dataset = parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa });
  const codebook = buildCodebook(dataset);
  const survey = buildSurvey(dataset, codebook);
  const analysis = analyzeSurvey(survey);
  const { logicModel, kpis } = readBusinessFromDataset(dataset, codebook);
  const evaluation = kpis?.length ? evaluateKpis(kpis, analysis, codebook) : null;
  const lint = kpis?.length ? lintEvaluation(logicModel, kpis, codebook, analysis) : [];
  const blocks = finalizeBlocks(buildReport({ analysis, evaluation, lint, logicModel, codebook, settings: { orgName: "소속 기관", date: "2026. 9. 13." } }));
  const base = f.replace(/\.[^.]+$/, "");
  await writeFile(`out/reports/${base}.txt`, blocksToText(blocks), "utf8");
  const bytes = await renderHwpx(blocks, { parts: TEMPLATE_PARTS, JSZip, rasterize: (svg, w, h) => rasterizeSvg(svg, w, h, 2), title: blocks[0].text, creator: "소속 기관" });
  const zip = await JSZip.loadAsync(bytes);
  const entries = await Promise.all(Object.values(zip.files).filter(e => !e.dir).map(async e => ({ path: e.name, data: await e.async("uint8array") })));
  const errors = validateHwpx(entries, DOMParser);
  await writeFile(`out/reports/${base}.hwpx`, bytes);
  const figs = blocks.filter(b => b.type === "figure").length, tbls = blocks.filter(b => b.type === "table").length;
  console.log(`${errors.length ? "FAIL" : "OK  "} ${base}.hwpx  설계=${codebook.design} n=${analysis.meta.n} 표=${tbls} 그림=${figs} KPI=${kpis?.length || 0} 경고=${lint.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (errors.length) { failed++; console.log("  " + errors.join("\n  ")); }
  lint.filter(w => w.level !== "info").forEach(w => console.log(`  [${w.level}] ${w.msg}`));
}
process.exit(failed);
