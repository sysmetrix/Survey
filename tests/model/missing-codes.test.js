// 결측 코드: 자동 판별 후보(99·-1·'잘 모르겠다' 등), 재코딩 반영, 라벨 사전에서 '모름'을 3점으로 채점하지 않음
import test from "node:test";
import assert from "node:assert/strict";
import { detectColumn } from "../../js/model/detect.js";
import { matchLabelSet, isMissingLabel } from "../../js/model/label-sets.js";
import { recodeNumeric, unmappedValues } from "../../js/model/recode.js";
import { buildCodebook } from "../../js/model/codebook.js";

const five = n => Array.from({ length: n }, (_, i) => (i % 5) + 1);

test("자동 판별: 5점 척도에 99가 소수 섞이면 척도 범위에서 빼고 결측 코드 후보로 제시", () => {
  const d = detectColumn("프로그램 내용", [...five(30), 99, 99]);
  assert.equal(d.role, "likert");
  assert.deepEqual(d.scale, { min: 1, max: 5 });
  assert.deepEqual(d.suggestMissing, ["99"]);
  const nps = detectColumn("친구에게 추천할 의향", [0, 3, 7, 8, 9, 10, 10, 9, 8, 6, 5, 7, -1]);
  assert.equal(nps.role, "nps");
  assert.deepEqual(nps.suggestMissing, ["-1"]);
  // 나머지가 5 이하일 때만 9를 결측 후보로 봄
  assert.deepEqual(detectColumn("문항", [...five(20), 9]).suggestMissing, ["9"]);
  assert.equal(detectColumn("문항", [1, 3, 5, 7, 9, 2, 4, 6, 8, 10]).suggestMissing, undefined, "10점 척도의 9는 정상 응답");
  // 10%를 넘으면 결측 코드로 보지 않음(원래 판별 유지)
  assert.equal(detectColumn("문항", [...five(10), 99, 99, 99]).suggestMissing, undefined);
  assert.equal(detectColumn("문항", five(20)).suggestMissing, undefined);
});

test("코드북: 결측 코드 후보는 missingSuggest 로만 전달하고 자동 적용하지 않음", () => {
  const ds = { fileName: "m.xlsx", source: "file", sheets: [{ name: "응답", headers: ["만족도"], rows: [...five(30), 99].map(v => [v]) }] };
  const cb = buildCodebook(ds);
  const col = cb.columns[0];
  assert.deepEqual(col.missingSuggest, ["99"]);
  assert.deepEqual(col.missingCodes, []);
  assert.deepEqual(col.scale, { min: 1, max: 5 });
});

test("재코딩: missingCodes 로 지정한 값은 무응답(null)으로, 미지정이면 범위 밖 응답으로 집계", () => {
  const raw = [1, 5, 99, "99", "-1", 3, ""];
  const before = recodeNumeric({ role: "likert", scale: { min: 1, max: 5 } }, raw);
  assert.equal(before.invalid, 3);
  assert.deepEqual(unmappedValues({ role: "likert", scale: { min: 1, max: 5 } }, raw).map(u => u.reason), ["range", "range"]);
  const col = { role: "likert", scale: { min: 1, max: 5 }, missingCodes: ["99", "-1"] };
  const after = recodeNumeric(col, raw);
  assert.deepEqual(after.values, [1, 5, null, null, null, 3, null]);
  assert.equal(after.invalid, 0); assert.equal(after.missing, 4);
  assert.deepEqual(unmappedValues(col, raw), []);
  // 문자 응답도 결측 코드로 지정 가능
  const lab = { role: "likert", scale: { min: 1, max: 5 }, labelMap: { "그렇다": 4 }, missingCodes: ["잘 모르겠다"] };
  const r = recodeNumeric(lab, ["그렇다", "잘 모르겠다"]);
  assert.deepEqual(r.values, [4, null]); assert.equal(r.missing, 1); assert.equal(r.invalid, 0);
});

test("라벨 사전: '잘 모르겠다'·'해당 없음'은 3점(보통)으로 채점하지 않고 결측 후보로 돌려줌", () => {
  for (const s of ["잘 모르겠다", "모르겠다", "해당없음", "해당 없음", "잘 모르겠음", "Not sure"]) assert.ok(isMissingLabel(s), s);
  const vals = ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다", "잘 모르겠다", "해당 없음"];
  const m = matchLabelSet(vals);
  assert.equal(m.set.id, "agree5");
  assert.equal(m.map.has("잘 모르겠다"), false);
  assert.equal(m.map.has("해당 없음"), false);
  assert.equal(m.coverage, 1, "결측 후보는 일치율 계산에서 제외");
  assert.deepEqual(m.missing, ["잘 모르겠다", "해당 없음"]);
  const d = detectColumn("문항", vals);
  assert.equal(d.role, "likert");
  assert.equal(d.labelMap["잘 모르겠다"], undefined);
  assert.deepEqual(d.suggestMissing, ["잘 모르겠다", "해당 없음"]);
  const r = recodeNumeric({ role: d.role, scale: d.scale, labelMap: d.labelMap }, vals);
  assert.deepEqual(r.values, [1, 2, 3, 4, 5, null, null], "지정 전에도 점수로 바뀌지 않음(미변환 → 무응답)");
});
