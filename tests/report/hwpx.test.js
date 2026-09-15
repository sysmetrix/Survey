// HWPX 작성기: 여러 쪽 표, 이모지 대체, 글꼴 설정, 넓은 표 나누기, 구조 검증
import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { createHwpxDoc } from "../../js/report/hwpx/writer.js";
import { validateHwpx } from "../../js/report/hwpx/validate.js";
import { TEMPLATE_PARTS } from "../../js/report/hwpx/template-parts.js";
import { toHwpText, hasEmoji } from "../../js/report/hwpx/symbols.js";
import { resolveFonts, FONT_PRESETS, FONT_SIZES } from "../../js/report/hwpx/fonts.js";
import { splitWideTable } from "../../js/report/render-hwpx.js";

const dec = new TextDecoder();
const part = (entries, p) => dec.decode(entries.find(e => e.path === p).data);
const charPrOf = (header, id) => header.match(new RegExp(`<hh:charPr id="${id}"[\\s\\S]*?</hh:charPr>`))[0];
const runIdFor = (sec, textStart) => sec.match(new RegExp(`<hp:run charPrIDRef="(\\d+)"><hp:t>${textStart}`))[1];

test("표는 글자처럼 취급하지 않고 쪽 경계에서 나눔(여러 쪽 지원)·제목 줄 반복", () => {
  const doc = createHwpxDoc({ parts: TEMPLATE_PARTS, title: "t" });
  const rows = [["문항", "평균"].map(t => ({ text: t })), ...Array.from({ length: 120 }, (_, i) => [`문항 ${i + 1}`, "4.00"])];
  doc.heading(1, "Ⅰ. 표").table({ columns: [{ weight: 3, align: "LEFT" }, { weight: 1 }], rows }).box(["□ 요약"]);
  doc.figure({ png: new Uint8Array([137, 80, 78, 71]), wPx: 100, hPx: 50 });
  const entries = doc.finish();
  const sec = part(entries, "Contents/section0.xml");
  const tbls = [...sec.matchAll(/<hp:tbl [^>]*>[\s\S]*?<hp:pos ([^>]*)\/>/g)];
  assert.equal(tbls.length, 2);
  for (const [whole, pos] of tbls) {
    assert.match(whole, /pageBreak="TABLE"/);
    assert.match(pos, /treatAsChar="0"/);
    assert.match(pos, /flowWithText="1"/);
  }
  assert.match(tbls[0][0], /repeatHeader="1"/);
  assert.match(sec, /<hp:pic [\s\S]*?treatAsChar="1"/, "그림은 한 덩어리(글자처럼)");
  assert.deepEqual(validateHwpx(entries, DOMParser), []);
});

test("이모지 → 한글에서 표시되는 기호·글자", () => {
  assert.equal(toHwpText("좋았어요 😊👍"), "좋았어요 ^^(최고)");
  assert.equal(toHwpText("✅ 달성 ❌ 미달성 ⚠️ 주의"), "√ 달성 × 미달성 ※ 주의");
  assert.equal(toHwpText("1️⃣ 첫째 🔟"), "① 첫째 ⑩");
  assert.equal(toHwpText("사랑해요❤️ 👨‍👩‍👧 가족 🇰🇷"), "사랑해요♥ 가족");
  assert.equal(toHwpText("★ ☆ ♥ → ※ 그대로"), "★ ☆ ♥ → ※ 그대로");
  assert.equal(toHwpText("일반 문장"), "일반 문장");
  const doc = createHwpxDoc({ parts: TEMPLATE_PARTS, title: "보고서 📊" });
  doc.bullet(1, "만족도 **높음** 😍").table({ columns: [{ weight: 1 }], rows: [["🔥 의견"], ["좋아요👍"]] });
  const entries = doc.finish();
  const sec = part(entries, "Contents/section0.xml");
  assert.equal(hasEmoji(sec), false, "section0 에 이모지 없음");
  assert.equal(hasEmoji(part(entries, "Preview/PrvText.txt")), false);
  assert.ok(sec.includes("^^") && sec.includes("(최고)"));
  assert.ok(doc.emojiReplaced >= 3);
  assert.deepEqual(validateHwpx(entries, DOMParser), []);
});

test("글꼴 설정: 프리셋·직접 입력·대체 글꼴·별도 Bold 글꼴", () => {
  const def = resolveFonts({});
  assert.deepEqual([def.body, def.heading, def.headingOnly], ["휴먼명조", "HY헤드라인M", true], "기본은 공문서형");
  const hancom = resolveFonts({ fontPreset: "hancom" });
  assert.deepEqual([hancom.body, hancom.heading, hancom.substBody, hancom.headingOnly], ["함초롬바탕", "함초롬돋움", null, false]);
  const pre = resolveFonts({ fontPreset: "pretendard" });
  assert.equal(pre.substBody, "Pretendard GOV");
  const custom = resolveFonts({ fontPreset: "custom", fontBody: "나눔명조<script>", fontHeading: "" });
  assert.equal(custom.body, "나눔명조script");
  assert.equal(custom.heading, custom.body);
  assert.equal(custom.substBody, "함초롬바탕");
  assert.ok(FONT_PRESETS.every(p => p.id && p.name));
  assert.equal(Math.max(...FONT_SIZES), 15);

  const doc = createHwpxDoc({ parts: TEMPLATE_PARTS, fontSettings: { fontPreset: "kopub" }, baseSize: 12, lineSpacing: 180 });
  doc.heading(1, "제목").bullet(1, "본문 **굵게**");
  const entries = doc.finish();
  const header = part(entries, "Contents/header.xml");
  for (const lang of ["HANGUL", "LATIN", "SYMBOL"]) {
    const ff = header.match(new RegExp(`<hh:fontface lang="${lang}" fontCnt="(\\d+)">([\\s\\S]*?)</hh:fontface>`));
    assert.ok(ff, lang);
    assert.equal((ff[2].match(/<hh:font /g) || []).length, +ff[1]);
    assert.match(ff[2], /id="0" face="KoPub돋움체 Medium"/);
    assert.match(ff[2], /id="2" face="KoPub돋움체 Bold"/);
    assert.match(ff[2], /<hh:substFont face="함초롬[^"]+"[^>]*\/><hh:typeInfo/, "substFont 는 typeInfo 앞");
  }
  const sec = part(entries, "Contents/section0.xml");
  const headPr = charPrOf(header, runIdFor(sec, "제목"));
  assert.ok(/hangul="2"/.test(headPr) && !headPr.includes("<hh:bold/>"), "굵은 제목은 Bold 글꼴(id 2) 사용");
  assert.match(charPrOf(header, runIdFor(sec, "□ 본문 ")), /hangul="1"/, "본문은 본문 글꼴(id 1)");
  assert.match(header, /<hh:lineSpacing type="PERCENT" value="180"/);
  assert.deepEqual(validateHwpx(entries, DOMParser), []);
});

test("공문서형: 제목 글꼴은 큰 제목에만, 굵은 글씨·표는 본문 글꼴(휴먼명조)", () => {
  const doc = createHwpxDoc({ parts: TEMPLATE_PARTS, fontSettings: { fontPreset: "gov" } });
  doc.heading(1, "제목").bullet(1, "본문 **굵게**").table({ columns: [{ weight: 1 }], rows: [["표머리"], ["표값"]] });
  const entries = doc.finish();
  const header = part(entries, "Contents/header.xml");
  const sec = part(entries, "Contents/section0.xml");
  assert.match(header, /id="0" face="HY헤드라인M"/);
  assert.match(header, /id="1" face="휴먼명조"/);
  assert.match(charPrOf(header, runIdFor(sec, "제목")), /hangul="0"/, "장 제목은 제목 글꼴");
  assert.match(charPrOf(header, runIdFor(sec, "표머리")), /hangul="1"/, "표는 본문 글꼴");
  const boldPr = charPrOf(header, runIdFor(sec, "굵게"));
  assert.ok(/hangul="1"/.test(boldPr) && boldPr.includes("<hh:bold/>"), "굵은 글씨는 본문 글꼴 + 굵게");
  assert.deepEqual(validateHwpx(entries, DOMParser), []);
});

test("문서 기본 위아래 여백은 10mm", () => {
  const doc = createHwpxDoc({ parts: TEMPLATE_PARTS, title: "여백 확인" });
  const sec = part(doc.finish(), "Contents/section0.xml");
  assert.match(sec, /<hp:margin[^>]*top="2835"[^>]*bottom="2835"/);
});

test("열이 12개를 넘는 표는 첫 열을 유지하며 나눔(병합 표는 그대로)", () => {
  const cols = Array.from({ length: 20 }, () => ({ weight: 1 }));
  const b = { type: "table", display: "<표 1> 넓은 표", caption: "넓은 표", unit: "(단위: 명)", columns: cols, rows: [cols.map((_, i) => `H${i}`), cols.map((_, i) => String(i))], notes: ["주"] };
  const parts = splitWideTable(b);
  assert.equal(parts.length, 2);
  assert.ok(parts.every(p => p.columns.length <= 12 && p.rows[0][0] === "H0"));
  assert.equal(parts[0].rows[0].length + parts[1].rows[0].length - 1, 20, "첫 열은 두 표에 반복");
  assert.deepEqual(parts[1].notes, ["주"]);
  const merged = { ...b, rows: [[{ text: "x", colSpan: 20 }], cols.map(() => "1")] };
  assert.equal(splitWideTable(merged).length, 1);
});
