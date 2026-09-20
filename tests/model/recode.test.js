import test from "node:test";
import assert from "node:assert/strict";
import { recodeCategory } from "../../js/model/recode.js";

test("recodeCategory: yearKind 있는 열은 연도값을 구간 라벨로 변환", () => {
  const col = { detected: { yearKind: "birth" }, yearScheme: "age10", yearRefYear: 2026, missingCodes: [], valueLabels: null };
  const res = recodeCategory(col, [2006, 1996, "", 2016]);
  assert.deepEqual(res.values, ["20대", "30대", null, "10대"]);
  assert.equal(res.missing, 1);
});

test("recodeCategory: yearScheme이 raw면 값을 그대로 문자열로 반환", () => {
  const col = { detected: { yearKind: "birth" }, yearScheme: "raw", missingCodes: [], valueLabels: null };
  const res = recodeCategory(col, [2001, 2002]);
  assert.deepEqual(res.values, ["2001", "2002"]);
});

test("recodeCategory: yearKind 없는 기존 특성 열은 이전과 동일하게 valueLabels 치환", () => {
  const col = { detected: { yearKind: null }, missingCodes: ["999"], valueLabels: { "1": "남", "2": "여" } };
  const res = recodeCategory(col, ["1", "2", "999", ""]);
  assert.deepEqual(res.values, ["남", "여", null, null]);
  assert.equal(res.missing, 2);
});
