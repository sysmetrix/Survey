// 리치 텍스트 편집기: 서식 있는 구간에 앞뒤 공백이 섞여도 저장 표식이 다시 파싱 가능해야 함
// (버그: "**글자 **"처럼 저장되면 다음에 열 때 별표가 그대로 보임 — 안쪽 알맹이만 감싸서 방지)
import test from "node:test";
import assert from "node:assert/strict";
import { wrapRun, markupToHtml } from "../../js/ui/inline-edit.js";
import { parseInline } from "../../js/report/inline-marks.js";

test("굵게 선택 영역에 앞뒤 공백이 섞여도 다시 파싱 가능한 표식을 만듦", () => {
  const wrapped = wrapRun("요인분석 ", { bold: 1 });
  assert.equal(wrapped, "**요인분석** ", "닫는 표시 앞에 공백이 오면 안 됨");
  assert.deepEqual(parseInline(wrapped), [{ text: "요인분석", bold: 1 }, { text: " " }]);
});

test("앞뒤 공백만 있는 경우 표식을 씌우지 않음(빈 알맹이)", () => {
  assert.equal(wrapRun("   ", { bold: 1 }), "   ");
});

test("서식이 없으면 원문 그대로(공백 트림 없음)", () => {
  assert.equal(wrapRun(" 그대로 ", {}), " 그대로 ");
});

test("markupToHtml: 저장된 표식을 실제 서식 HTML로(별표가 글자로 보이지 않음)", () => {
  const html = markupToHtml("**굵게** 일반 _기울임_");
  assert.ok(!html.includes("*"), "별표가 글자로 남으면 안 됨");
  assert.ok(html.includes("<strong>굵게</strong>"));
});
