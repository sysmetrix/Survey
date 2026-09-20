// 100점 환산 기준(exact | rounded): 표시값만 바뀌고 판정·정렬·분석 원값은 그대로여야 함
import test from "node:test";
import assert from "node:assert/strict";
import { buildCodebook } from "../../js/model/codebook.js";
import { buildSurvey } from "../../js/model/survey.js";
import { analyzeSurvey } from "../../js/analysis/run.js";
import { buildReport } from "../../js/report/build-report.js";
import { buildDeck } from "../../js/present/deck.js";
import { emptyLogicModel } from "../../js/evaluation/logic-model.js";
import { shown100, f2, cleanScoreBasis } from "../../js/narrative/vocab.js";
import { round, seededRandom } from "../../js/core/util.js";

function makeAnalysis() {
  const rnd = seededRandom(11);
  const headers = ["번호", "성별", "프로그램 내용이 유익했다", "강사가 전문적이었다", "시설 환경이 쾌적했다", "프로그램에 전반적으로 만족하였다"];
  const rows = Array.from({ length: 164 }, (_, i) => {
    const pick = mu => Math.max(1, Math.min(5, Math.round(mu + (rnd() - 0.5) * 2.6)));
    return [i + 1, rnd() < 0.5 ? "남" : "여", pick(4.3), pick(4.6), pick(3.9), pick(4.4)];
  });
  const ds = { fileName: "demo.xlsx", source: "file", sheets: [{ name: "응답", headers, rows }] };
  const cb = buildCodebook(ds);
  return { cb, analysis: analyzeSurvey(buildSurvey(ds, cb)) };
}

const cellsOf = blocks => blocks.flatMap(b => [b.text, ...(b.lines || []).map(l => l.text), ...(b.items || []).map(i => (typeof i === "string" ? i : i.text)), ...(b.rows || []).flat().map(c => (typeof c === "string" ? c : c.text))]).filter(x => typeof x === "string");
const build = (analysis, cb, scoreBasis) => buildReport({ analysis, evaluation: null, lint: [], logicModel: emptyLogicModel(), codebook: cb, settings: { scoreBasis } });

test("shown100: exact 는 원값, rounded 는 표시 평균(소수 둘째 자리)으로 환산", () => {
  const it = { mean: 4.3659, min: 1, max: 5, score100: (4.3659 - 1) / 4 * 100 };
  assert.equal(shown100(it, "exact"), it.score100);
  assert.equal(shown100(it, undefined), it.score100);
  assert.ok(Math.abs(shown100(it, "rounded") - 84.25) < 1e-9); // 4.37 → 84.25 (수기 계산과 동일)
  assert.equal(f2(shown100(it, "exact")), "84.15");
  assert.equal(shown100({ mean: 4.3659, min: null, max: null, score100: 84.1475 }, "rounded"), 84.1475); // 척도 혼합은 원값 유지
  assert.equal(cleanScoreBasis("rounded"), "rounded");
  assert.equal(cleanScoreBasis("x"), "exact");
});

test("보고서: rounded 에서 표의 환산값이 표시 평균으로 검산되고, 정렬·문항 목록은 exact 와 동일", () => {
  const { cb, analysis } = makeAnalysis();
  const exact = build(analysis, cb, "exact"), rounded = build(analysis, cb, "rounded");
  const items = analysis.items;
  assert.ok(items.some(it => f2(it.score100) !== f2((round(it.mean, 2) - it.min) / (it.max - it.min) * 100)), "두 기준의 값이 다른 문항이 있어야 테스트가 의미 있음");
  const rowsOf = blocks => blocks.find(b => b.type === "table" && b.caption === "문항별 만족도").rows.slice(1).map(r => r.map(c => c.text));
  const re = rowsOf(exact), rr = rowsOf(rounded);
  assert.deepEqual(rr.map(r => r[0]), re.map(r => r[0]), "행 순서(정렬)는 원값 기준으로 동일");
  for (const row of rr) {
    const it = items.find(x => x.label === row[0]);
    if (!it) continue; // '세부 문항 전체' 행은 아래에서 별도 검증
    assert.equal(row[4], f2((Number(row[2]) - it.min) / (it.max - it.min) * 100), `${it.label}: 표의 평균으로 환산한 값과 일치`);
  }
  for (const row of re) {
    const it = items.find(x => x.label === row[0]);
    if (it) assert.equal(row[4], f2(it.score100), `${it.label}: exact 는 원값`);
  }
  const totRow = rr.find(r => r[0] === "세부 문항 전체");
  const tot = analysis.total;
  assert.equal(totRow[4], f2((round(tot.mean, 2) - tot.min) / (tot.max - tot.min) * 100));
  // 기준을 안내하는 표 주석
  assert.ok(cellsOf([exact.find(b => b.type === "table" && b.caption === "문항별 만족도")].map(b => ({ text: (b.notes || []).join("|") }))).join("").includes("반올림 전 평균"));
  assert.ok((rounded.find(b => b.type === "table" && b.caption === "문항별 만족도").notes || []).join("|").includes("표시된 평균"));
});

test("발표 자료: rounded 는 표시값만 바뀌고 슬라이드 수·순서는 동일", () => {
  const { cb, analysis } = makeAnalysis();
  const mk = scoreBasis => buildDeck({ analysis, evaluation: null, logicModel: emptyLogicModel(), codebook: cb, settings: { scoreBasis } });
  const a = mk("exact"), b = mk("rounded");
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map(s => s.id), b.map(s => s.id));
});
