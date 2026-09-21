// PPTX 작성기: EMU 좌표 변환, XML 이스케이프, 실제 슬라이드 데이터로 만든 파일의 구조 검증
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { DOMParser } from "@xmldom/xmldom";
import { parseFile } from "../../js/io/parse.js";
import { buildCodebook } from "../../js/model/codebook.js";
import { buildSurvey } from "../../js/model/survey.js";
import { analyzeSurvey } from "../../js/analysis/run.js";
import { buildDeck } from "../../js/present/deck.js";
import { elementsFromAutoSlide } from "../../js/present/edit/detach.js";
import { buildPptx } from "../../js/report/pptx/package.js";
import { validatePptx } from "../../js/report/pptx/validate.js";
import { escText, escAttr } from "../../js/report/pptx/xml.js";
import { pctToEmuX, pctToEmuY, cqwToHundredthPt, degToRot60000, SLIDE_W_EMU, SLIDE_H_EMU } from "../../js/report/pptx/emu.js";
const require = createRequire(import.meta.url);
const XLSX = require("../../vendor/xlsx-0.20.3.full.min.js"), Papa = require("../../vendor/papaparse-5.4.1.min.js");
const JSZip = require("../../vendor/jszip-3.10.1.min.js");

test("EMU 좌표 변환: 슬라이드 폭/높이 백분율 -> EMU, cqw -> 포인트, 각도 -> 60000분의 1도", () => {
  assert.equal(pctToEmuX(0), 0);
  assert.equal(pctToEmuX(100), SLIDE_W_EMU);
  assert.equal(pctToEmuY(100), SLIDE_H_EMU);
  assert.equal(pctToEmuX(50), Math.round(SLIDE_W_EMU / 2));
  assert.equal(cqwToHundredthPt(100), 96000); // 슬라이드 폭 전체 크기 글자 = 960pt
  assert.equal(degToRot60000(90), 90 * 60000);
  assert.equal(degToRot60000(-45), -45 * 60000);
});

test("XML 이스케이프: 제어문자 제거, 특수문자 치환", () => {
  assert.equal(escText("<a>&\"'"), "&lt;a&gt;&amp;\"'");
  assert.equal(escAttr('말"풍선'), "말&quot;풍선");
  assert.equal(escText("줄1\u0000줄2"), "줄1줄2");
});

async function deckFor(file) {
  const ds = parseFile(new Uint8Array(await readFile(`samples/${file}`)), file, { XLSX, Papa });
  const codebook = buildCodebook(ds);
  const analysis = analyzeSurvey(buildSurvey(ds, codebook));
  return buildDeck({ analysis, logicModel: null, evaluation: null, codebook, settings: { orgName: "부천여성청소년재단" } });
}

test("실제 슬라이드 데이터로 만든 PPTX가 구조 검증을 통과함(차트는 래스터화 없이 건너뜀)", async () => {
  const deck = await deckFor("2026_진로탐색_사전사후.xlsx");
  const slides = deck.map(s => ({ elements: elementsFromAutoSlide(s) }));
  // 이미지 요소 하나 추가해 <p:pic> 경로도 같이 검증(1x1 투명 PNG)
  const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  slides[0].elements.push({ id: "img1", kind: "image", x: 10, y: 10, w: 20, h: 20, rot: 15, z: 9, src: `data:image/png;base64,${tinyPng}`, fit: "cover" });
  const bytes = await buildPptx({
    slides, title: "테스트 발표자료", creator: "테스트",
    fontName: "Pretendard",
    rasterizeChart: async () => null, // Node 에는 canvas 가 없어 차트는 건너뜀 — 텍스트·도형·이미지 경로만 검증
    JSZip,
  });
  assert.ok(bytes.length > 1000, "빈 파일이 아님");
  const zip = await JSZip.loadAsync(bytes);
  const entries = await Promise.all(Object.values(zip.files).filter(e => !e.dir).map(async e => ({ path: e.name, data: await e.async("uint8array") })));
  const errors = validatePptx(entries, DOMParser);
  assert.deepEqual(errors, []);
  const slideCount = entries.filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.path)).length;
  assert.equal(slideCount, slides.length);
  assert.ok(entries.some(e => e.path === "ppt/media/image1.png"), "이미지가 media 파트로 들어감");
  // 회전값이 도(deg) 단위 그대로가 아니라 60000분의 1도로 변환됐는지
  const dec = new TextDecoder();
  const slide1 = dec.decode(entries.find(e => e.path === "ppt/slides/slide1.xml").data);
  assert.match(slide1, /rot="900000"/, "15도 회전이 900000(=15×60000)로 들어감");
});

test("richtext(문단·글머리)·표 요소가 구조 검증을 통과하고 서식이 옳게 들어감", async () => {
  const slides = [{
    elements: [
      { id: "rt1", kind: "richtext", x: 5, y: 5, w: 40, h: 30, rot: 0, z: 1, fontSize: 1.4, align: "left", blocks: [
        { type: "paragraph", text: "**굵은** 문단" },
        { type: "bullet", text: "목록 항목 1" },
        { type: "bullet", text: "목록 항목 2" },
      ] },
      { id: "tb1", kind: "table", x: 50, y: 5, w: 40, h: 20, rot: 0, z: 1, headerRow: true, rows: [["열1", "열2"], ["a", "b"], ["c", "d"]] },
    ],
  }];
  const bytes = await buildPptx({ slides, title: "표·목록 테스트", rasterizeChart: async () => null, JSZip });
  const zip = await JSZip.loadAsync(bytes);
  const entries = await Promise.all(Object.values(zip.files).filter(e => !e.dir).map(async e => ({ path: e.name, data: await e.async("uint8array") })));
  assert.deepEqual(validatePptx(entries, DOMParser), []);
  const dec = new TextDecoder();
  const slide1 = dec.decode(entries.find(e => e.path === "ppt/slides/slide1.xml").data);
  assert.match(slide1, /<a:t>굵은<\/a:t>/, "굵게 표식이 별도 런으로 분리됨");
  assert.match(slide1, /<a:rPr[^>]*\bb="1"[^>]*>[^<]*<\/a:rPr><a:t>굵은<\/a:t>/, "굵은 텍스트 런에 b=\"1\" 적용");
  assert.match(slide1, /<a:buChar char="•"\/>/, "글머리 기호 적용");
  assert.match(slide1, /<a:t>목록 항목 1<\/a:t>/);
  assert.match(slide1, /<p:graphicFrame>/, "표는 graphicFrame으로 들어감");
  assert.match(slide1, /<a:t>열1<\/a:t>/);
  assert.match(slide1, /<a:t>c<\/a:t>/);
  // XML 파서로도 잘 구성된 문서인지 최종 확인
  const doc = new DOMParser().parseFromString(slide1, "application/xml");
  assert.equal(doc.getElementsByTagName("parsererror").length, 0);
});

test("빈 슬라이드 배열이면 명확한 오류를 던짐(조용히 깨진 파일을 만들지 않음)", async () => {
  await assert.rejects(() => buildPptx({ slides: [], JSZip, rasterizeChart: async () => null }), /슬라이드가 없습니다/);
});
