import test from "node:test";
import assert from "node:assert/strict";
import { pairQuality } from "../../js/evaluation/pair-quality.js";
import { kpiActual, evaluateKpis, achievementRate, resolveTarget } from "../../js/evaluation/kpi.js";
import { compositeComparison } from "../../js/analysis/prepost.js";
const pre = { key: "a", role: "likert", pairKey: "q", time: "pre", scale: { min: 1, max: 5 } };
const post = { ...pre, key: "b", time: "post" };
test("안정적인 문항 참조와 모호한 기존 문항명 구분", () => {
  const cb={domains:[],columns:[{...pre,pairKey:null,label:"협업",header:"협업"},{...post,pairKey:null,label:"협업",header:"협업"}]};
  assert.deepEqual(resolveTarget("@item:a",cb).ids,["a"]);
  assert.ok(resolveTarget("협업",cb).missing.length);
  const analysis={prepost:{qualityIssues:[{keys:["a"],msg:"척도 불일치"}],items:[]}};
  assert.match(kpiActual({metric:"prepostDiff",targetRef:"@item:a"},analysis,cb).error,/계산 불가/);
});
test("문항 연결은 양방향 누락·중복·척도 불일치를 구분한다", () => {
  assert.deepEqual(pairQuality([pre, post]), []);
  assert.equal(pairQuality([post])[0].code, "pair-missing");
  assert.equal(pairQuality([pre, post, { ...post, key: "c" }])[0].code, "pair-duplicate");
  assert.equal(pairQuality([pre, { ...post, scale: { min: 1, max: 7 } }])[0].code, "scale-mismatch");
});
test("간편 설정에서 미선택 문항을 전체 문항으로 계산하지 않는다", () => {
  assert.match(kpiActual({ metric: "score100", requireTarget: true, targetRef: "" }, {}, {}).error, /선택/);
});
test("0·음수 목표는 비율 대신 방향별 기준 충족으로 판정", () => {
  assert.ok(Number.isNaN(achievementRate(-1, -2)));
  const result = evaluateKpis([{ name: "기준", metric: "manual", actual: -1, target: -2, direction: "up" }], {}, {});
  assert.equal(result.results[0].judgment, "달성");
  assert.ok(Number.isNaN(result.results[0].rate));
  assert.equal(result.summary.measured, 1);
  assert.equal(result.summary.achieved, 1);
});
test("복수 문항은 개인별 합성점수로 향상자를 계산하고 혼합 척도는 거부", () => {
  const pairs = [
    { pre: "a", post: "b", preValues: [1, 2, 3, 4], postValues: [5, 3, 2, 5] },
    { pre: "c", post: "d", preValues: [4, 4, 4, 4], postValues: [2, 3, 5, 3] },
  ];
  const survey = { n: 4, codebook: { columns: ["a", "b", "c", "d"].map(key => ({ key, scale: { min: 1, max: 5 } })) } };
  assert.equal(compositeComparison(survey, pairs).improvedPct, 25);
  survey.codebook.columns[3].scale.max = 7;
  assert.equal(compositeComparison(survey, pairs), null);
});
