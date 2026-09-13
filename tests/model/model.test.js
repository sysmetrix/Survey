import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { toNum } from "../../js/core/util.js";
import { detectColumn, parseTime, shortLabel } from "../../js/model/detect.js";
import { matchLabelSet } from "../../js/model/label-sets.js";
import { buildCodebook, pairsOf, lintCodebook } from "../../js/model/codebook.js";
import { recodeNumeric, recodeMulti } from "../../js/model/recode.js";
import { buildSurvey } from "../../js/model/survey.js";
import { matrixToSheet, parseWorkbook, parseCsv, decodeText } from "../../js/io/parse.js";
const require = createRequire(import.meta.url);
const XLSX = require("../../vendor/xlsx-0.20.3.full.min.js");
const Papa = require("../../vendor/papaparse-5.4.1.min.js");

test("toNum: 빈칸은 null, 라벨 숫자 추출", () => {
  assert.equal(toNum(""), null); assert.equal(toNum("  "), null); assert.equal(toNum(null), null);
  assert.equal(toNum("4"), 4); assert.equal(toNum("5점"), 5); assert.equal(toNum("5 (매우 그렇다)"), 5);
  assert.ok(Number.isNaN(toNum("매우 그렇다")));
});

test("라벨 세트: 구글폼 텍스트 응답", () => {
  const m = matchLabelSet(["매우 그렇다", "그렇다", "보통이다", "그렇다", "전혀 그렇지 않다"]);
  assert.equal(m.set.id, "agree5"); assert.equal(m.map.get("매우 그렇다"), 5); assert.equal(m.map.get("전혀 그렇지 않다"), 1);
  const s = matchLabelSet(["매우 만족", "만족", "불만족", "보통"]);
  assert.equal(s.set.id, "satis5");
});

test("열 역할 판별", () => {
  assert.equal(detectColumn("타임스탬프", ["2026/05/01 10:00:00", "2026/05/01 11:00:00"]).role, "timestamp");
  assert.equal(detectColumn("성별", ["남", "여", "여", "남", "여", "남", "여"]).role, "demographic");
  const lk = detectColumn("프로그램 내용", [4, 5, 3, 4, "", 5, 2]);
  assert.equal(lk.role, "likert"); assert.deepEqual(lk.scale, { min: 1, max: 5 });
  assert.equal(detectColumn("친구에게 추천할 의향", [9, 10, 7, 3, 8, 10, 0]).role, "nps");
  assert.equal(detectColumn("이름", ["홍길동", "김철수"]).pii, true);
  assert.equal(detectColumn("좋았던 점", ["강사님이 친절하고 설명이 좋았어요", "재미있었습니다 다음에도 참여", "없음", "체험활동이 알찼어요"]).role, "text");
  const mu = detectColumn("참여 동기(복수선택)", ["친구 권유, 흥미", "흥미", "진로 탐색, 흥미", "부모님 권유", "흥미, 친구 권유", "진로 탐색"]);
  assert.equal(mu.role, "multi");
  assert.equal(detectColumn("5. 강사가 친절했다", ["5. 매우 그렇다", "4. 그렇다", "3. 보통"]).role, "likert");
});

test("사전·사후 표기 파싱과 문항명", () => {
  assert.deepEqual(parseTime("사전_자기효능감1"), { time: "pre", retrospective: false, pairKey: "자기효능감1" });
  assert.equal(parseTime("[사후] 자기효능감1").time, "post");
  assert.equal(parseTime("자기효능감1(사후)").time, "post");
  assert.equal(parseTime("이전_진로에 대한 관심").retrospective, true);
  assert.equal(parseTime("사회적 관계"), null);
  assert.equal(shortLabel("3. 프로그램 내용에 만족하십니까?"), "프로그램 내용에 만족하십니까");
  assert.equal(shortLabel("다음 항목에 응답해 주세요 [강사 전문성]"), "강사 전문성");
});

test("재코딩: 결측·범위밖·역문항·복수응답", () => {
  const col = { role: "likert", scale: { min: 1, max: 5 }, reverse: true, missingCodes: ["9"] };
  const r = recodeNumeric(col, [1, "", "9", 6, "5", null]);
  assert.deepEqual(r.values, [5, null, null, null, 1, null]); assert.equal(r.invalid, 1); assert.equal(r.missing, 3);
  const m = recodeMulti({ options: [] }, ["A, B", "", "B", "C; A"]);
  assert.deepEqual(m.options, ["A", "B", "C"]);
  assert.deepEqual(m.matrix[0], [1, null, 0, 1]);
});

test("시트 헤더 행 탐지(네이버폼 제목행)", () => {
  const s = matrixToSheet("응답", [["2026 만족도 조사 결과", null, null], [null, null, null], ["응답일시", "성별", "만족도"], ["2026-05-01", "남", 5], ["2026-05-02", "여", 4], [null, null, null]]);
  assert.deepEqual(s.headers, ["응답일시", "성별", "만족도"]); assert.equal(s.rows.length, 2);
});

test("코드북: 한 시트 사전·사후(wide) + 설문 테이블", () => {
  const headers = ["번호", "성별", "사전_관계1", "사전_관계2", "사후_관계1", "사후_관계2", "전반적 만족도"];
  const rows = [[1, "남", 2, 3, 4, 4, 5], [2, "여", 3, 3, 3, 4, 4], [3, "여", 1, 2, 3, 3, ""], [4, "남", 2, 2, 4, 5, 5], [5, "여", 3, 4, 4, 4, 4], [6, "남", 2, 3, 3, 4, 3]];
  const ds = { fileName: "t.xlsx", sheets: [{ name: "응답", headers, rows }] };
  const cb = buildCodebook(ds);
  assert.equal(cb.design, "prepost-wide");
  assert.equal(pairsOf(cb).length, 2);
  const sv = buildSurvey(ds, cb);
  assert.equal(sv.n, 6);
  assert.equal(sv.overall.label, "전반적 만족도");
  assert.deepEqual(sv.values(sv.overall.key), [5, 4, null, 5, 4, 3]);
  assert.deepEqual(sv.pairs[0].preValues, [2, 3, 1, 2, 3, 2]);
  assert.ok(!lintCodebook(cb).some(w => w.level === "error"));
});

test("코드북: 사전/사후 시트 분리 + ID 매칭", () => {
  const ds = { fileName: "p.xlsx", sheets: [
    { name: "사전", headers: ["ID", "자기효능감1", "자기효능감2"], rows: [["A01", 2, 3], ["A02", 3, 3], ["A03", 1, 2], ["A04", 4, 4]] },
    { name: "사후", headers: ["ID", "자기효능감1", "자기효능감2", "만족도"], rows: [["A01", 4, 4, 5], ["a 03", 3, 3, 4], ["A05", 5, 5, 5], ["A04", 4, 5, 4]] },
  ] };
  const cb = buildCodebook(ds);
  assert.equal(cb.design, "prepost-sheets");
  const sv = buildSurvey(ds, cb);
  assert.equal(sv.matching.pairs.length, 3);
  assert.deepEqual(sv.matching.postOnly, [2]);
  const p = sv.pairs.find(x => x.label === "자기효능감1");
  assert.deepEqual(p.preValues, [2, 1, null, 4]); assert.deepEqual(p.postValues, [4, 3, 5, 4]);
});

test("파일 파싱: XLSX 다중 시트, CSV EUC-KR", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["안내 문구"], ["아래 작성"]]), "안내");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["성별", "만족도"], ["남", 5], ["여", 4]]), "응답데이터");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const ds = parseWorkbook(new Uint8Array(buf), "a.xlsx", XLSX);
  assert.equal(ds.sheets.length, 2); assert.deepEqual(ds.sheets[1].headers, ["성별", "만족도"]);
  const cb = buildCodebook(ds);
  assert.equal(cb.responseSheets[0], 1);
  const csv = parseCsv(new TextEncoder().encode("\uFEFF성별,만족도\n남,5\n여,\n"), "b.csv", Papa);
  assert.deepEqual(csv.sheets[0].rows, [["남", "5"], ["여", null]]);
  assert.equal(decodeText(new Uint8Array([0xC7, 0xD1])), "한"); // EUC-KR
});
