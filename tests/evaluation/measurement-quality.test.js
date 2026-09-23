import test from "node:test";
import assert from "node:assert/strict";
import { measurementQuality } from "../../js/evaluation/measurement-quality.js";

const cb = (overrides = {}) => ({ design: "prepost-wide", columns: [
  { key: "pre-a", label: "협업", role: "likert", time: "pre", pairKey: "a", scale: { min: 1, max: 5 }, domain: "D1" },
  { key: "post-a", label: "협업", role: "likert", time: "post", pairKey: "a", scale: { min: 1, max: 5 }, domain: "D1" },
], ...overrides });

test("측정 품질: 동일 문항의 사전·사후 열은 한 문항으로 계산", () => {
  assert.ok(measurementQuality(cb()).some(w => w.code === "domain-small"));
  assert.ok(!measurementQuality(cb()).some(w => w.level === "error"));
});
test("측정 품질: 척도·역채점·버전 불일치와 중복 연결 검출", () => {
  const model = cb();
  Object.assign(model.columns[1], { scale: { min: 1, max: 7 }, reverse: true, instrumentVersion: "2026" });
  const issues = measurementQuality(model);
  for (const code of ["scale-mismatch", "reverse-mismatch", "version-mismatch"]) assert.ok(issues.some(w => w.code === code));
  model.columns.push({ ...model.columns[1], key: "duplicate" });
  assert.ok(measurementQuality(model).some(w => w.code === "pair-duplicate"));
});
test("측정 품질: 사후에만 존재하는 문항도 검출", () => {
  assert.ok(measurementQuality(cb({ columns: [cb().columns[1]] })).some(w => w.code === "pair-missing"));
});
test("측정 품질: 사전 문항 짝·척도 범위를 점검", () => {
  const warnings = measurementQuality(cb({ columns: [{ key: "pre", label: "협업", role: "likert", time: "pre", pairKey: "x" }] }));
  assert.ok(warnings.some(w => w.code === "prepost-missing"));
  assert.ok(warnings.some(w => w.code === "scale-invalid"));
});
