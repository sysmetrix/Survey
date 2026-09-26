// 자동 슬라이드 → 자유배치 요소 변환 — css/present.css 의 그리드 비율을 손으로 옮겨 적은 값이라,
// 대표 슬라이드 하나는 좌표를 못박아 두어 CSS 쪽이 바뀌면 이 테스트가 먼저 깨지게 함(계획 문서 참고)
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseFile } from "../../js/io/parse.js";
import { buildCodebook } from "../../js/model/codebook.js";
import { buildSurvey } from "../../js/model/survey.js";
import { analyzeSurvey } from "../../js/analysis/run.js";
import { readBusinessFromDataset } from "../../js/evaluation/business-sheet.js";
import { evaluateKpis } from "../../js/evaluation/kpi.js";
import { buildDeck } from "../../js/present/deck.js";
import { elementsFromAutoSlide } from "../../js/present/edit/detach.js";
const require = createRequire(import.meta.url);
const XLSX = require("../../vendor/xlsx-0.20.3.full.min.js"), Papa = require("../../vendor/papaparse-5.4.1.min.js");

async function deckFor(file) {
  const ds = parseFile(new Uint8Array(await readFile(`samples/${file}`)), file, { XLSX, Papa });
  const codebook = buildCodebook(ds);
  const analysis = analyzeSurvey(buildSurvey(ds, codebook));
  const { logicModel, kpis } = readBusinessFromDataset(ds, codebook);
  const evaluation = kpis?.length ? evaluateKpis(kpis, analysis, codebook) : null;
  return buildDeck({ analysis, evaluation, logicModel, codebook, settings: { orgName: "소속 기관", date: "2026. 9. 14." } });
}

test("elementsFromAutoSlide: 모든 슬라이드 타입이 화면 안 요소로 변환됨", async () => {
  const deck = await deckFor("2026_진로탐색_사전사후.xlsx");
  const types = new Set();
  for (const s of deck) {
    types.add(s.type);
    const els = elementsFromAutoSlide(s);
    assert.ok(els.length > 0, `${s.id}(${s.type}): 요소 없음`);
    assert.equal(new Set(els.map(e => e.id)).size, els.length, `${s.id}: 요소 id 중복`);
    for (const el of els) {
      assert.ok(el.x >= 0 && el.x <= 100, `${s.id} ${el.id} x=${el.x}`);
      assert.ok(el.y >= 0 && el.y <= 100, `${s.id} ${el.id} y=${el.y}`);
      assert.ok(el.w > 0 && el.x + el.w <= 100.01, `${s.id} ${el.id} x+w=${el.x + el.w}`);
      assert.ok(el.h > 0 && el.y + el.h <= 100.01, `${s.id} ${el.id} y+h=${el.y + el.h}`);
      assert.ok(["text", "chart", "image", "shape"].includes(el.kind));
      if (el.kind === "text") assert.equal(typeof el.markup, "string");
      if (el.kind === "chart") assert.ok(el.chart && el.chart.kind);
    }
  }
  // 사전·사후 데이터라 hero·stats·voice·columns 등 여러 타입이 실제로 나와야 이 테스트가 의미 있음
  assert.ok(types.has("hero"), "hero 타입 슬라이드 있어야 함");
  assert.ok(types.has("stats"), "stats 타입 슬라이드 있어야 함");
});

test("elementsFromAutoSlide: hero 타입의 33/67 분할 좌표 고정값(css/present.css .s-hero-body 와 짝)", async () => {
  const deck = await deckFor("2026_진로탐색_사전사후.xlsx");
  const hero = deck.find(s => s.type === "hero");
  assert.ok(hero, "hero 슬라이드가 있어야 함");
  const els = elementsFromAutoSlide(hero);
  const PAD_X = 5.2, FULL_W = 100 - PAD_X * 2;
  const rightX = PAD_X + FULL_W * 0.33 + 1.3;
  const chartEl = els.find(e => e.kind === "chart");
  assert.ok(chartEl, "hero 에 차트 요소가 있어야 함");
  assert.equal(Math.round(chartEl.x * 100) / 100, Math.round(rightX * 100) / 100, "차트는 33% 지점 오른쪽에서 시작");
  const valueEl = els.find(e => e.kind === "text" && String(e.markup).includes(String(hero.hero.value)));
  assert.ok(valueEl, "핵심 수치 텍스트 요소가 있어야 함");
  assert.equal(valueEl.x, PAD_X, "핵심 수치는 왼쪽 여백에서 시작");
});
