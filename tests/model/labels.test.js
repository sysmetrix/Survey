// 문자 척도 응답(한국어·영문) 인식, 4점/5점 판별, 폼 서비스 CSV 형식
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { matchLabelSet } from "../../js/model/label-sets.js";
import { detectColumn } from "../../js/model/detect.js";
import { buildCodebook, lintCodebook, rawColumn } from "../../js/model/codebook.js";
import { recodeNumeric, unmappedValues } from "../../js/model/recode.js";
import { buildSurvey } from "../../js/model/survey.js";
import { analyzeSurvey } from "../../js/analysis/run.js";
import { parseCsv } from "../../js/io/parse.js";
const require = createRequire(import.meta.url);
const Papa = require("../../vendor/papaparse-5.4.1.min.js");

const scoreOf = vals => { const d = detectColumn("문항", vals); return { d, v: recodeNumeric({ role: d.role, scale: d.scale, labelMap: d.labelMap }, vals).values }; };

test("한국어 5점 표준·변형 문구", () => {
  for (const [vals, expect] of [
    [["전혀 아니다", "아니다", "보통이다", "그렇다", "매우 그렇다"], [1, 2, 3, 4, 5]],
    [["전혀 동의하지 않음", "동의하지 않음", "중립", "동의함", "매우 동의함"], [1, 2, 3, 4, 5]],
    [["매우 불만족", "불만족", "보통", "만족", "매우 만족"], [1, 2, 3, 4, 5]],
    [["매우 미흡", "미흡", "보통", "우수", "매우 우수"], [1, 2, 3, 4, 5]],
  ]) {
    const { d, v } = scoreOf(vals);
    assert.equal(d.role, "likert", vals.join("/")); assert.deepEqual(d.scale, { min: 1, max: 5 }); assert.deepEqual(v, expect);
  }
});

test("'보통' 없는 4단계 응답은 4점 척도로 판정", () => {
  const { d, v } = scoreOf(["전혀 그렇지 않다", "그렇지 않다", "그렇다", "매우 그렇다", "그렇다"]);
  assert.deepEqual(d.scale, { min: 1, max: 4 }); assert.deepEqual(v, [1, 2, 3, 4, 3]);
  const m = matchLabelSet(["그렇다", "매우 그렇다"]);
  assert.equal(m.set.id, "agree5"); assert.equal(m.ambiguous, true, "보기 2개만 관측되면 5점 기본 + 확인 경고");
  assert.equal(matchLabelSet(["보통이다", "그렇다", "매우 그렇다"]).ambiguous, false);
  const seven = scoreOf(["전혀 그렇지 않다", "그렇지 않다", "약간 그렇지 않다", "보통이다", "약간 그렇다", "그렇다", "매우 그렇다"]);
  assert.deepEqual(seven.d.scale, { min: 1, max: 7 });
});

test("영문 보기(타입폼·탈리폼 등)", () => {
  for (const [vals, id] of [
    [["Strongly disagree", "Disagree", "Neither agree nor disagree", "Agree", "Strongly agree"], "agree5_en"],
    [["Very dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very satisfied"], "satis5_en"],
    [["Very unlikely", "Unlikely", "Neutral", "Likely", "Very likely"], "likely5_en"],
    [["Poor", "Fair", "Good", "Excellent", "Very poor"], "quality5_en"],
  ]) {
    const m = matchLabelSet(vals);
    assert.equal(m?.set.id, id, vals.join("/"));
  }
  assert.deepEqual(scoreOf(["Strongly agree", "Agree", "Neutral"]).v, [5, 4, 3]);
});

test("같은 보기를 쓰는 문항들은 전체 응답 기준으로 척도 통일", () => {
  const L = ["전혀 그렇지 않다", "그렇지 않다", "그렇다", "매우 그렇다"];
  const rows = Array.from({ length: 12 }, (_, i) => [L[i % 4], L[2 + (i % 2)]]); // 두 번째 문항은 긍정 2개만 응답
  const cb = buildCodebook({ fileName: "g.csv", sheets: [{ name: "s", headers: ["만족 [내용]", "만족 [시설]"], rows }] });
  assert.deepEqual(cb.columns.map(c => c.scale), [{ min: 1, max: 4 }, { min: 1, max: 4 }]);
  assert.equal(cb.columns[1].labelMap["매우 그렇다"], 4);
});

test("사전에 없는 문구 → 미변환 목록 → 점수 지정 후 분석", () => {
  const vals = ["완전 별로", "별로", "그냥 그래요", "좋아요", "완전 좋아요", "좋아요", "그냥 그래요", "완전 좋아요"];
  const ds = { fileName: "x.csv", sheets: [{ name: "s", headers: ["성별", "만족"], rows: vals.map((v, i) => [i % 2 ? "남" : "여", v]) }] };
  const cb = buildCodebook(ds);
  const col = cb.columns[1];
  col.role = "likert"; col.scale = { min: 1, max: 5 };
  const unm = unmappedValues(col, rawColumn(ds, col));
  assert.equal(unm.reduce((s, u) => s + u.n, 0), 8);
  col.labelMap = { "완전 별로": 1, "별로": 2, "그냥 그래요": 3, "좋아요": 4, "완전 좋아요": 5 };
  assert.equal(unmappedValues(col, rawColumn(ds, col)).length, 0);
  const an = analyzeSurvey(buildSurvey(ds, cb));
  assert.equal(an.items[0].n, 8); assert.equal(an.items[0].mean, (1 + 2 + 3 + 4 + 5 + 4 + 3 + 5) / 8);
});

test("타입폼·탈리폼 형식 CSV (메타 열 제외, 숫자 배율·영문 보기 인식)", () => {
  const typeform = "#,How satisfied were you with the program?,The instructor was helpful,What did you like?,Start Date (UTC),Submit Date (UTC),Network ID\n" +
    ["a1,5,Strongly agree,Fun activities with friends,2026-05-01 10:00:00,2026-05-01 10:05:00,n1", "a2,4,Agree,Good teacher and useful content,2026-05-01 11:00:00,2026-05-01 11:04:00,n2",
     "a3,3,Neutral,,2026-05-02 09:00:00,2026-05-02 09:03:00,n3", "a4,5,Agree,Loved the hands-on sessions,2026-05-02 10:00:00,2026-05-02 10:06:00,n4",
     "a5,2,Disagree,Too short,2026-05-03 10:00:00,2026-05-03 10:02:00,n5", "a6,4,Strongly agree,Interesting topics every week,2026-05-03 11:00:00,2026-05-03 11:05:00,n6"].join("\n");
  const cbT = buildCodebook(parseCsv(new TextEncoder().encode(typeform), "typeform.csv", Papa));
  const roleT = Object.fromEntries(cbT.columns.map(c => [c.header, c.role]));
  assert.equal(roleT["#"], "id"); assert.equal(roleT["Submit Date (UTC)"], "timestamp"); assert.equal(roleT["Network ID"], "id");
  assert.equal(roleT["How satisfied were you with the program?"], "likert");
  assert.equal(roleT["The instructor was helpful"], "likert");

  const tally = "Submission ID,Respondent ID,Submitted at,성별,프로그램 만족도,강사 친절도,기타 의견\n" +
    ["s1,r1,2026-05-01 10:00:00,여,매우 그렇다,5,좋았어요 다음에도 참여하고 싶어요", "s2,r2,2026-05-01 11:00:00,남,그렇다,4,", "s3,r3,2026-05-02 10:00:00,여,보통이다,3,시간이 조금 짧았어요",
     "s4,r4,2026-05-02 12:00:00,남,그렇다,4,재미있었습니다", "s5,r5,2026-05-03 10:00:00,여,아니다,2,"].join("\n");
  const cbL = buildCodebook(parseCsv(new TextEncoder().encode(tally), "tally.csv", Papa));
  const roleL = Object.fromEntries(cbL.columns.map(c => [c.header, c.role]));
  assert.equal(roleL["Submission ID"], "id"); assert.equal(roleL["Respondent ID"], "id"); assert.equal(roleL["Submitted at"], "timestamp");
  assert.equal(roleL["프로그램 만족도"], "likert"); assert.equal(roleL["강사 친절도"], "likert");
  assert.ok(!lintCodebook(cbL).some(w => w.level === "error"));
});
