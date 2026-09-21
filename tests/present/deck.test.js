import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { DOMParser } from "@xmldom/xmldom";
import { parseFile } from "../../js/io/parse.js";
import { buildCodebook } from "../../js/model/codebook.js";
import { buildSurvey } from "../../js/model/survey.js";
import { analyzeSurvey } from "../../js/analysis/run.js";
import { readBusinessFromDataset } from "../../js/evaluation/business-sheet.js";
import { evaluateKpis } from "../../js/evaluation/kpi.js";
import { buildDeck } from "../../js/present/deck.js";
import { chartSvg } from "../../js/report/model.js";
const require = createRequire(import.meta.url);
const XLSX = require("../../vendor/xlsx-0.20.3.full.min.js"), Papa = require("../../vendor/papaparse-5.4.1.min.js");

async function deckFor(file) {
  const ds = parseFile(new Uint8Array(await readFile(`samples/${file}`)), file, { XLSX, Papa });
  const codebook = buildCodebook(ds);
  const analysis = analyzeSurvey(buildSurvey(ds, codebook));
  const { logicModel, kpis } = readBusinessFromDataset(ds, codebook);
  const evaluation = kpis?.length ? evaluateKpis(kpis, analysis, codebook) : null;
  return buildDeck({ analysis, evaluation, logicModel, codebook, settings: { orgName: "부천여성청소년재단", date: "2026. 9. 14." } });
}
const wellFormed = svg => { let err = null; new DOMParser({ onError: (l, m) => { if (l !== "warning") err = m; } }).parseFromString(svg, "image/svg+xml"); return err; };

for (const f of ["2026_진로탐색_사전사후.xlsx", "2026_청소년센터_만족도_구글폼.csv", "2026_참여위원회_회고식.xlsx"]) {
  test(`발표 슬라이드: ${f}`, async () => {
    const deck = await deckFor(f);
    assert.equal(deck[0].type, "cover"); assert.equal(deck.at(-1).type, "end");
    assert.ok(deck.length >= 5, `슬라이드 ${deck.length}장`);
    assert.equal(new Set(deck.map(s => s.id)).size, deck.length);
    for (const s of deck) {
      assert.ok(s.title && !/undefined|NaN/.test(s.title + (s.subtitle || "")), `${s.id} 제목: ${s.title}`);
      if (s.chart) for (const theme of ["light", "dark"]) {
        const out = chartSvg({ ...s.chart, opts: { ...(s.chart.opts || {}), theme } });
        assert.equal(wellFormed(out.svg), null, `${s.id} ${s.chart.kind} ${theme}`);
        assert.ok(out.svg.includes("data-tip="), `${s.id} 툴팁`);
        assert.ok(!/NaN/.test(out.svg), `${s.id} NaN 없음`);
      }
      if (s.type === "stats") assert.ok(s.stats.length >= 2 && s.stats.length <= 5);
    }
    if (f.includes("사전사후")) {
      assert.ok(deck.some(s => s.section === "성과지표"), "성과지표 슬라이드");
      assert.ok(deck.some(s => s.type === "hero"), "사전·사후 핵심 수치 슬라이드");
    }
  });
}
