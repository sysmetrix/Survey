import test from "node:test";
import assert from "node:assert/strict";
import { yearToBucket } from "../../js/model/year-bucket.js";

const REF = 2026;

test("yearToBucket: 출생연도 → 10년 단위 연령대(age10) 경계값", () => {
  assert.equal(yearToBucket(REF - 19, "birth", "age10", REF), "10대");
  assert.equal(yearToBucket(REF - 20, "birth", "age10", REF), "20대");
  assert.equal(yearToBucket(REF - 29, "birth", "age10", REF), "20대");
  assert.equal(yearToBucket(REF - 30, "birth", "age10", REF), "30대");
  assert.equal(yearToBucket(REF - 5, "birth", "age10", REF), "10세 미만");
  assert.equal(yearToBucket(REF - 45, "birth", "age10", REF), "40대 이상");
});

test("yearToBucket: 출생연도 → 법정 기준(ageLaw) 경계값", () => {
  assert.equal(yearToBucket(REF - 24, "birth", "ageLaw", REF), "청소년(24세 이하)");
  assert.equal(yearToBucket(REF - 25, "birth", "ageLaw", REF), "청년(25~34세)");
  assert.equal(yearToBucket(REF - 34, "birth", "ageLaw", REF), "청년(25~34세)");
  assert.equal(yearToBucket(REF - 35, "birth", "ageLaw", REF), "기타(35세 이상)");
});

test("yearToBucket: 출생연도 → 발달 단계(ageStage) 경계값", () => {
  assert.equal(yearToBucket(REF - 9, "birth", "ageStage", REF), "초기 청소년(9~14세)");
  assert.equal(yearToBucket(REF - 14, "birth", "ageStage", REF), "초기 청소년(9~14세)");
  assert.equal(yearToBucket(REF - 15, "birth", "ageStage", REF), "중기 청소년(15~18세)");
  assert.equal(yearToBucket(REF - 18, "birth", "ageStage", REF), "중기 청소년(15~18세)");
  assert.equal(yearToBucket(REF - 19, "birth", "ageStage", REF), "후기 청소년·초기 청년(19~24세)");
  assert.equal(yearToBucket(REF - 24, "birth", "ageStage", REF), "후기 청소년·초기 청년(19~24세)");
  assert.equal(yearToBucket(REF - 25, "birth", "ageStage", REF), "중기 청년(25~29세)");
  assert.equal(yearToBucket(REF - 29, "birth", "ageStage", REF), "중기 청년(25~29세)");
  assert.equal(yearToBucket(REF - 30, "birth", "ageStage", REF), "후기 청년(30~34세)");
  assert.equal(yearToBucket(REF - 34, "birth", "ageStage", REF), "후기 청년(30~34세)");
  assert.equal(yearToBucket(REF - 35, "birth", "ageStage", REF), "기타(35세 이상)");
});

test("yearToBucket: 출생연도 → 학교 연계형(ageSchool) 경계값", () => {
  assert.equal(yearToBucket(REF - 6, "birth", "ageSchool", REF), "기타(7세 미만)");
  assert.equal(yearToBucket(REF - 7, "birth", "ageSchool", REF), "초등(7~12세)");
  assert.equal(yearToBucket(REF - 12, "birth", "ageSchool", REF), "초등(7~12세)");
  assert.equal(yearToBucket(REF - 13, "birth", "ageSchool", REF), "중등(13~15세)");
  assert.equal(yearToBucket(REF - 15, "birth", "ageSchool", REF), "중등(13~15세)");
  assert.equal(yearToBucket(REF - 16, "birth", "ageSchool", REF), "고등(16~18세)");
  assert.equal(yearToBucket(REF - 18, "birth", "ageSchool", REF), "고등(16~18세)");
  assert.equal(yearToBucket(REF - 19, "birth", "ageSchool", REF), "청년(대학생 포함, 19~34세)");
  assert.equal(yearToBucket(REF - 34, "birth", "ageSchool", REF), "청년(대학생 포함, 19~34세)");
  assert.equal(yearToBucket(REF - 35, "birth", "ageSchool", REF), "기타(35세 이상)");
});

test("yearToBucket: 활동 시작연도 → 년차 구간(tenure3, tenure2) 경계값", () => {
  assert.equal(yearToBucket(REF, "tenure", "tenure3", REF), "1년차");
  assert.equal(yearToBucket(REF - 1, "tenure", "tenure3", REF), "2~3년차");
  assert.equal(yearToBucket(REF - 2, "tenure", "tenure3", REF), "2~3년차");
  assert.equal(yearToBucket(REF - 3, "tenure", "tenure3", REF), "4년차 이상");
  assert.equal(yearToBucket(REF, "tenure", "tenure2", REF), "신규(1년 이하)");
  assert.equal(yearToBucket(REF - 1, "tenure", "tenure2", REF), "기존(2년 이상)");
});

test("yearToBucket: raw 스킴은 값을 그대로, 미래연도는 null", () => {
  assert.equal(yearToBucket(2001, "birth", "raw", REF), "2001");
  assert.equal(yearToBucket(REF + 1, "birth", "age10", REF), null);
  assert.equal(yearToBucket("abc", "birth", "age10", REF), null);
});
