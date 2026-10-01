import test from "node:test";
import assert from "node:assert/strict";
import { buildCodebook } from "../../js/model/codebook.js";
import { buildSurvey } from "../../js/model/survey.js";
import { analyzeSurvey } from "../../js/analysis/run.js";
import { buildReport } from "../../js/report/build-report.js";
import { buildDeck } from "../../js/present/deck.js";
import { emptyLogicModel } from "../../js/evaluation/logic-model.js";
import { holm } from "../../js/stats/adjust.js";
import { sigP, isSig } from "../../js/narrative/vocab.js";

// n=40(대응표본 t) · 문항 5쌍: 강한 향상 1, 약한 향상 1(보정 전 p≈.02 → Holm 보정 후 .05 초과), 변화 없음 3
function makeData(n = 40) {
  const names = ["강한향상", "약한향상", "변화없음1", "변화없음2", "변화없음3"];
  const headers = ["번호", ...names.map(s => `사전_${s}`), ...names.map(s => `사후_${s}`)];
  const rows = [];
  for (let i = 0; i < n; i++) {
    const pre = 2 + (i % 3);
    const diffs = [i < 30 ? 1 : 0, i < 5 ? 1 : 0, i % 2 ? 1 : -1, i % 2 ? -1 : 1, i % 4 < 2 ? 1 : -1];
    rows.push([i + 1, ...names.map(() => pre), ...diffs.map(d => pre + d)]);
  }
  return { fileName: "holm.xlsx", source: "file", sheets: [{ name: "응답", headers, rows }] };
}

function analyze() {
  const ds = makeData();
  const cb = buildCodebook(ds);
  cb.columns.filter(c => c.role === "likert").forEach(c => { c.scale = { min: 1, max: 5 }; });
  const res = analyzeSurvey(buildSurvey(ds, cb));
  return { cb, res };
}

test("사전·사후: 문항별 Holm 보정 p(primary.pAdj)를 붙이고, 전체 합성점수는 단일 검정이라 p 그대로", () => {
  const { res } = analyze();
  const P = res.prepost;
  assert.equal(P.items.length, 5);
  const ps = P.items.map(i => i.primary.p);
  const expected = holm(ps);
  P.items.forEach((it, k) => {
    assert.ok(Number.isFinite(it.primary.pAdj), `${it.label} pAdj`);
    assert.ok(Math.abs(it.primary.pAdj - expected[k]) < 1e-12, `${it.label} Holm 값`);
    assert.ok(it.primary.pAdj >= it.primary.p);
  });
  const weak = P.items.find(i => i.label === "약한향상");
  assert.ok(weak.primary.p < 0.05, `보정 전에는 유의(p=${weak.primary.p})`);
  assert.ok(weak.primary.pAdj >= 0.05, `Holm 보정 후에는 유의하지 않음(pAdj=${weak.primary.pAdj})`);
  assert.equal(P.significantItems, 1, "유의한 향상 문항 수는 Holm 보정 기준");
  const all = P.domains.find(d => d.id === "ALL");
  assert.equal(all.primary.pAdj, all.primary.p);
  assert.equal(P.items[0].unused, undefined, "죽은 필드 제거");
});

test("sigP/isSig: 보정값(pAdj·pHolm)이 있으면 그것을, 없으면 원래 p 사용", () => {
  assert.equal(sigP({ p: 0.02, pAdj: 0.08 }), 0.08);
  assert.equal(sigP({ test: { p: 0.02 }, pHolm: 0.07 }), 0.07);
  assert.equal(sigP({ test: { p: 0.02 }, pHolm: null }), 0.02);
  assert.equal(sigP({ p: 0.03 }), 0.03);
  assert.equal(isSig({ p: 0.02, pAdj: 0.08 }), false);
  assert.equal(isSig({ p: 0.02 }), true);
  assert.equal(isSig(null), false);
});

test("보고서·슬라이드: 보정 전에만 유의한 문항은 유의한 향상으로 쓰지 않음", () => {
  const { cb, res } = analyze();
  const blocks = buildReport({ analysis: res, codebook: cb, logicModel: emptyLogicModel(), settings: {} });
  const lines = blocks.filter(b => b.type === "bullets").flatMap(b => b.items);
  const up = lines.find(l => l.key === "pp.sigup"), non = lines.find(l => l.key === "pp.nonsig");
  assert.ok(up.text.includes("강한향상") && !up.text.includes("약한향상"), up.text);
  assert.ok(non.text.includes("약한향상"), non.text);
  const table = blocks.find(b => b.caption === "사전·사후 점수 변화");
  assert.ok(table.rows[0].some(c => c.text === "보정 p"), "보정 p 열");
  const weakRow = table.rows.find(r => r[0].text === "약한향상");
  assert.ok(!weakRow[7].text.includes("*"), "별표는 Holm 보정 p 기준");
  assert.ok(!weakRow[6].text.includes("*"));
  assert.ok(table.notes.some(n => n.includes("Holm 보정 유의확률 기준")));
  assert.ok(lines.some(l => l.key === "c.multi" && l.text.includes("Holm 보정 유의확률 기준임")));
  const deck = buildDeck({ analysis: res, codebook: cb, settings: {} });
  const pp = deck.find(s => s.id === "prepost");
  assert.deepEqual(pp.chart.data.filter(d => d.sig).map(d => d.label), ["강한향상"]);
});
