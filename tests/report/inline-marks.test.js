import test from "node:test";
import assert from "node:assert/strict";
import { parseInline, stripInlineMarks, wrapMarks, escapeLiteral } from "../../js/report/inline-marks.js";

test("굵게만 있는 예전 표기(하위 호환)", () => {
  assert.deepEqual(parseInline("성과지표 **5개 달성** 임"), [
    { text: "성과지표 " }, { text: "5개 달성", bold: 1 }, { text: " 임" },
  ]);
  assert.equal(stripInlineMarks("**굵게**만"), "굵게만");
});

test("공백이 표시 안쪽에 붙어 있으면 서식으로 인식 안 함", () => {
  assert.deepEqual(parseInline("** 안됨 **"), [{ text: "** 안됨 **" }]);
  assert.deepEqual(parseInline("****"), [{ text: "****" }]);
});

test("기울임·밑줄·취소선", () => {
  assert.deepEqual(parseInline("_기울임_"), [{ text: "기울임", italic: 1 }]);
  assert.deepEqual(parseInline("++밑줄++"), [{ text: "밑줄", underline: 1 }]);
  assert.deepEqual(parseInline("~~취소선~~"), [{ text: "취소선", strike: 1 }]);
});

test("글자색", () => {
  assert.deepEqual(parseInline("{c:#FF0000}빨강{/c}"), [{ text: "빨강", color: "#FF0000" }]);
});

test("겹친 서식(중첩)", () => {
  assert.deepEqual(parseInline("{c:#ff0000}**굵고 빨강**{/c}"), [{ text: "굵고 빨강", color: "#ff0000", bold: 1 }]);
  assert.deepEqual(parseInline("**_굵고 기울임_**"), [{ text: "굵고 기울임", bold: 1, italic: 1 }]);
});

test("짝이 없는 표시는 그냥 글자로 남음", () => {
  assert.deepEqual(parseInline("가격은 **비쌈 (별표 하나 * 남음)"), [{ text: "가격은 **비쌈 (별표 하나 * 남음)" }]);
});

test("wrapMarks 왕복(parse → wrap → 다시 parse해도 같은 결과)", () => {
  const marks = { color: "#112233", bold: 1, underline: 1, strike: 1, italic: 1 };
  const wrapped = wrapMarks("본문", marks);
  assert.deepEqual(parseInline(wrapped), [{ text: "본문", ...marks }]);
});

test("이스케이프: 문장 속 별표 등이 서식으로 오인되지 않게 이스케이프하고 다시 원래 글자로 복원", () => {
  const raw = "가격은 5*3=15, 강조는 **진짜** 굵게, 파일명은 a_b_c.txt, 중괄호 {c:x}";
  const escaped = escapeLiteral(raw);
  assert.equal(stripInlineMarks(escaped), raw);
  assert.deepEqual(parseInline(`${escapeLiteral("5*3")} **굵게**`), [{ text: "5*3 " }, { text: "굵게", bold: 1 }]);
});

test("여러 구간이 섞인 문장", () => {
  const runs = parseInline("신뢰도는 _다소 낮은_ 수준이며(Cronbach α=**.67**), {c:#c00000}주의가 필요함{/c}.");
  assert.equal(runs.map(r => r.text).join(""), "신뢰도는 다소 낮은 수준이며(Cronbach α=.67), 주의가 필요함.");
  assert.ok(runs.find(r => r.italic && r.text === "다소 낮은"));
  assert.ok(runs.find(r => r.bold && r.text === ".67"));
  assert.ok(runs.find(r => r.color === "#c00000" && r.text === "주의가 필요함"));
});
