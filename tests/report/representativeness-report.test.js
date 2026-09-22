// 응답자 대표성 결과를 한글(HWPX) 보고서 부록에 반영하는 기능(representativenessInReport, 관리자 전용 미리보기)
import test from "node:test";
import assert from "node:assert/strict";
import { buildCodebook } from "../../js/model/codebook.js";
import { buildSurvey } from "../../js/model/survey.js";
import { analyzeSurvey } from "../../js/analysis/run.js";
import { buildReport } from "../../js/report/build-report.js";
import { emptyLogicModel } from "../../js/evaluation/logic-model.js";
import { seededRandom } from "../../js/core/util.js";
import { _setForTest, _resetForTest } from "../../js/admin/flags-client.js";

function makeDs() {
  const rnd = seededRandom(7);
  const headers = ["번호", "성별", "프로그램에 만족하였다"];
  const rows = Array.from({ length: 40 }, (_, i) => [i + 1, i % 4 === 0 ? "여" : "남", Math.max(1, Math.min(5, Math.round(4 + (rnd() - 0.5) * 2)))]);
  return { fileName: "demo.xlsx", source: "file", sheets: [{ name: "응답", headers, rows }] };
}

test.beforeEach(() => _resetForTest());

function build(popPct) {
  const ds = makeDs();
  const cb = buildCodebook(ds);
  const sexCol = cb.columns.find(c => c.header === "성별");
  if (popPct) sexCol.popPct = popPct;
  const survey = buildSurvey(ds, cb);
  const an = analyzeSurvey(survey);
  return buildReport({ analysis: an, evaluation: null, lint: [], logicModel: emptyLogicModel(), codebook: cb, settings: {}, survey });
}

test("기능이 꺼져 있으면(기본값) 모집단 비율을 입력해도 보고서에 표가 추가되지 않음", () => {
  const blocks = build({ 남: 50, 여: 50 });
  assert.equal(blocks.some(b => b.type === "table" && b.caption === "응답자 대표성(모집단 비율 대비)"), false);
});

test("기능이 켜져 있어도 모집단 비율을 입력하지 않았으면 표가 추가되지 않음", () => {
  _setForTest({ representativenessInReport: true });
  const blocks = build(null);
  assert.equal(blocks.some(b => b.type === "table" && b.caption === "응답자 대표성(모집단 비율 대비)"), false);
});

test("기능이 켜져 있고 모집단 비율을 입력했으면 부록에 표가 추가됨(차이가 크면 굵게 표시)", () => {
  _setForTest({ representativenessInReport: true });
  const blocks = build({ 남: 50, 여: 50 }); // 실제 표본은 25%가 여성(75/25) → 큰 차이
  const table = blocks.find(b => b.type === "table" && b.caption === "응답자 대표성(모집단 비율 대비)");
  assert.ok(table, "표가 있어야 함");
  const femaleRow = table.rows.find(r => r.some(c => (typeof c === "object" ? c.text : c) === "여"));
  assert.ok(femaleRow, "‘여’ 행이 있어야 함");
  const diffCell = femaleRow.at(-1);
  assert.ok(diffCell.bold, "모집단과 차이가 크면 굵게 표시되어야 함");
});
