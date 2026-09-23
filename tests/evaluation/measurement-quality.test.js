import test from "node:test";
import assert from "node:assert/strict";
import { measurementQuality } from "../../js/evaluation/measurement-quality.js";

const cb = (overrides = {}) => ({ design: "prepost-wide", columns: [
  { key: "pre-a", label: "협업", role: "likert", time: "pre", pairKey: "a", scale: { min: 1, max: 5 }, domain: "D1" },
  { key: "post-a", label: "협업", role: "likert", time: "post", pairKey: "a", scale: { min: 1, max: 5 }, domain: "D1" },
], ...overrides });

test("측정 품질: 정상 사전·사후 문항은 경고 없음", () => assert.equal(measurementQuality(cb()).length, 0));
test("측정 품질: 사전 문항 짝·척도 범위를 점검", () => {
  const warnings = measurementQuality(cb({ columns: [{ key: "pre", label: "협업", role: "likert", time: "pre", pairKey: "x" }] }));
  assert.ok(warnings.some(w => w.code === "prepost-missing"));
  assert.ok(warnings.some(w => w.code === "scale-invalid"));
});
