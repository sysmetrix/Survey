// 교차분석 소표본 경고·rank-biserial 효과크기 연결(js/analysis/cross.js)
import test from "node:test";
import assert from "node:assert/strict";
import { compareGroups, crossAnalysis, numericCrossAnalysis } from "../../js/analysis/cross.js";
import { yearToBucket } from "../../js/model/year-bucket.js";

test("compareGroups: 집단 인원이 10명 미만이면 smallGroupN 플래그가 붙음(배제는 아님)", () => {
  const small = compareGroups([[4, 5, 4, 5, 5], [3, 3, 4, 3, 4]], ["A", "B"]);
  assert.equal(small.smallGroupN, true);
  assert.ok(small.test, "인원 부족으로 배제되지 않고 검정은 수행됨");

  const big = compareGroups(
    [Array.from({ length: 20 }, (_, i) => 3 + (i % 2)), Array.from({ length: 20 }, (_, i) => 4 + (i % 2))],
    ["A", "B"],
  );
  assert.equal(big.smallGroupN, false);
});

test("compareGroups: 2집단 비교 시 Mann-Whitney 효과크기(rank-biserial)가 nonparam에 실림", () => {
  const res = compareGroups([[1, 2, 3, 4, 5], [3, 4, 5, 6, 7]], ["A", "B"]);
  assert.equal(res.nonparam.effectName, "r");
  assert.ok(Number.isFinite(res.nonparam.effect));
});

test("compareGroups: Welch t 결과에 신뢰구간(ci)이 포함됨", () => {
  const res = compareGroups([[1, 2, 3, 4, 5], [3, 4, 5, 6, 7]], ["A", "B"]);
  assert.ok(Array.isArray(res.test.ci) && res.test.ci.length === 2);
});

test("crossAnalysis: 넓은 출생연도 범위를 구간화하면 특성별 비교 상한(12개)을 넘지 않음", () => {
  const n = 60;
  const birthYears = Array.from({ length: n }, (_, i) => 1966 + i); // 1966~2025, 서로 다른 값 60개
  const birthBuckets = birthYears.map(y => yearToBucket(y, "birth", "age10", 2026));
  const itemVals = Array.from({ length: n }, (_, i) => 1 + (i % 5));
  const survey = {
    demographics: [{ key: "birth", label: "출생연도" }],
    scales: [{ key: "item1", scale: { min: 1, max: 5 } }],
    values: key => (key === "birth" ? birthBuckets : itemVals),
  };
  const items = [{ key: "item1", label: "만족도" }];
  const out = crossAnalysis(survey, items, null);
  assert.equal(out.length, 1);
  assert.ok(out[0].groups.length <= 12, `구간 수 ${out[0].groups.length}는 12 이하여야 함`);
});

test("numericCrossAnalysis: 연속형 수치는 원점수 평균으로 응답자 특성별 비교한다", () => {
  const survey = {
    demographics: [{ key: "sex", label: "성별" }],
    values: key => key === "sex" ? ["여", "여", "여", "남", "남", "남"] : [2, 3, 4, 7, 8, 9],
  };
  const out = numericCrossAnalysis(survey, [{ key: "count", label: "참여 인원" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].rows[0].stats.find(s => s.group === "여").mean, 3);
  assert.equal(out[0].rows[0].stats.find(s => s.group === "남").mean, 8);
  assert.equal("score100" in out[0].rows[0].stats[0], false, "연속형 수치는 100점 환산하지 않음");
  assert.ok(out[0].rows[0].test, "집단 차이 검정을 계산함");
});
