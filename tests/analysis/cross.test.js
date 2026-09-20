// 교차분석 소표본 경고·rank-biserial 효과크기 연결(js/analysis/cross.js)
import test from "node:test";
import assert from "node:assert/strict";
import { compareGroups } from "../../js/analysis/cross.js";

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
