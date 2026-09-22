import test from "node:test";
import assert from "node:assert/strict";
import { representativenessCheck, REP_DIFF_CAUTION } from "../../js/analysis/representativeness.js";

const fakeSurvey = values => ({ values: () => values });

test("모집단 비율 입력이 없으면 계산하지 않음", () => {
  const cols = [{ key: "sex", role: "demographic", label: "성별" }];
  assert.deepEqual(representativenessCheck(fakeSurvey(["남", "여", "남"]), cols), []);
});

test("응답자 분포와 모집단 비율의 차이(%p) 계산", () => {
  const cols = [{ key: "sex", role: "demographic", label: "성별", popPct: { 남: 50, 여: 50 } }];
  const vals = ["남", "남", "남", "여"]; // 남 75% · 여 25%
  const [rep] = representativenessCheck(fakeSurvey(vals), cols);
  assert.equal(rep.n, 4);
  const male = rep.rows.find(r => r.category === "남");
  assert.ok(Math.abs(male.observedPct - 75) < 1e-9);
  assert.ok(Math.abs(male.diffPts - 25) < 1e-9);
  assert.ok(rep.maxDiff >= REP_DIFF_CAUTION, "25%p 차이는 참고 기준(10%p)을 넘어야 함");
});

test("모집단 비율을 입력하지 않은 카테고리는 diffPts 없이 관측값만 표시", () => {
  const cols = [{ key: "grade", role: "demographic", label: "학년", popPct: { "중1": 40 } }];
  const vals = ["중1", "중2", "중1"];
  const [rep] = representativenessCheck(fakeSurvey(vals), cols);
  const g2 = rep.rows.find(r => r.category === "중2");
  assert.equal(g2.popPct, null);
  assert.equal(g2.diffPts, null);
});
