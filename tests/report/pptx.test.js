// PPTX 작성기: EMU 좌표 변환, XML 이스케이프, 실제 슬라이드 데이터로 만든 파일의 구조 검증
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
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
import { buildSlideXml, imageSize } from "../../js/report/pptx/writer.js";
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
  return buildDeck({ analysis, logicModel: null, evaluation: null, codebook, settings: { orgName: "소속 기관" } });
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

// ── 요소 스타일(슬라이드 편집기의 글꼴·도형·표·배경 필드)이 PPTX 에 옮겨지는지 ──
const sldXml = async (elements, extra = {}) => (await buildSlideXml({ elements, ...extra }, { fontName: "Pretendard", rasterizeChart: async () => null })).xml;
const base = { x: 10, y: 10, w: 20, h: 10, rot: 0, z: 1 };
const wellFormed = xml => assert.equal(new DOMParser().parseFromString(xml, "application/xml").getElementsByTagName("parsererror").length, 0);

test("도형: rect/roundRect/ellipse/triangle 은 prst, 모르는 종류는 rect, 색·투명도(alpha)·모서리(adj) 반영", async () => {
  const xml = await sldXml([
    { ...base, id: "a", kind: "shape", shapeType: "roundRect", fill: "#336699", stroke: "#ff0000", strokeWidth: 2, radius: 24, opacity: 0.5 },
    { ...base, id: "b", kind: "shape", shapeType: "triangle", fill: "#00FF00" },
    { ...base, id: "c", kind: "shape", shapeType: "ellipse", fill: "#0000FF" },
    { ...base, id: "d", kind: "shape", shapeType: "hexagon-nope", fill: "#000000" },
    { ...base, id: "e", kind: "shape", shapeType: "toString", fill: "#000000" },
    { ...base, id: "f", kind: "shape", shapeType: "rect", fill: "rgb(255, 0, 0)" },
    { ...base, id: "g", kind: "shape", shapeType: "rect", fill: "not-a-color" },
  ]);
  wellFormed(xml);
  assert.match(xml, /<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 44444"\/><\/a:avLst><\/a:prstGeom>/, "24px 모서리 = 짧은 변(685800 EMU) 대비 304800 → adj 44444");
  assert.match(xml, /<a:solidFill><a:srgbClr val="336699"><a:alpha val="50000"\/><\/a:srgbClr><\/a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="FF0000"><a:alpha val="50000"\/>/, "채우기·윤곽선 모두 알파");
  assert.match(xml, /prst="triangle"/);
  assert.match(xml, /prst="ellipse"/);
  assert.equal((xml.match(/prst="rect"/g) || []).length, 4, "hexagon-nope·toString·rgb()·not-a-color 도형은 rect");
  assert.match(xml, /<a:srgbClr val="FF0000"\/>/, "rgb() 색은 16진수로");
  assert.equal(xml.includes("not-a-color"), false, "읽을 수 없는 색은 XML 에 넣지 않음(noFill)");
  assert.equal(/undefined|NaN/.test(xml), false);
});

test("선·화살표: <p:cxnSp> prst=line, 세로 가운데를 지나는 높이 0 상자, 화살표는 tailEnd triangle", async () => {
  const xml = await sldXml([
    { id: "l", kind: "shape", shapeType: "line", x: 10, y: 20, w: 30, h: 10, rot: 30, z: 1, stroke: "#112233", strokeWidth: 3 },
    { id: "r", kind: "shape", shapeType: "arrow", x: 10, y: 50, w: 30, h: 0, rot: 0, z: 2, stroke: "#112233", strokeWidth: 4, opacity: 0.5 },
  ]);
  wellFormed(xml);
  assert.equal((xml.match(/<p:cxnSp>/g) || []).length, 2);
  assert.equal((xml.match(/<a:prstGeom prst="line">/g) || []).length, 2);
  // y=20%, h=10% → 세로 가운데 25%, 높이 0
  assert.match(xml, new RegExp(`<a:xfrm rot="1800000"><a:off x="${pctToEmuX(10)}" y="${pctToEmuY(25)}"/><a:ext cx="${pctToEmuX(30)}" cy="0"/>`));
  assert.match(xml, /<a:ln w="38100"><a:solidFill><a:srgbClr val="112233"\/><\/a:solidFill><\/a:ln>/, "선(3px)에는 화살촉 없음");
  assert.equal((xml.match(/<a:tailEnd type="triangle"/g) || []).length, 1, "화살표만 tailEnd");
  assert.match(xml, /<a:ln w="50800"><a:solidFill><a:srgbClr val="112233"><a:alpha val="50000"\/><\/a:srgbClr><\/a:solidFill><a:tailEnd type="triangle" w="med" len="med"\/><\/a:ln>/, "채움 다음에 tailEnd(스키마 순서)·알파");
  assert.equal(/undefined|NaN/.test(xml), false);
});

test("text 요소: 글꼴·기울임·밑줄·취소선·줄간격·세로정렬·배경·테두리·모서리·투명도", async () => {
  const xml = await sldXml([{ ...base, id: "t", kind: "text", markup: "**굵게** 본문", fontSize: 2, align: "center", weight: null, color: "#333333",
    fontFamily: "맑은 고딕", italic: true, underline: true, strike: true, lineHeight: 1.95, valign: "middle",
    fill: "#FFEE00", borderColor: "#000000", borderWidth: 2, radius: 8, opacity: 0.8 }]);
  wellFormed(xml);
  assert.match(xml, /anchor="ctr"/, "세로 가운데");
  assert.match(xml, /<a:lnSpc><a:spcPct val="150000"\/><\/a:lnSpc>/, "1.95 / 1.3 = 150%");
  assert.match(xml, /<a:latin typeface="맑은 고딕"\/><a:ea typeface="맑은 고딕"\/>/);
  assert.equal(xml.includes('typeface="Pretendard"'), false, "요소 글꼴이 발표 기본 글꼴보다 우선");
  assert.match(xml, /<a:rPr [^>]*\bi="1"[^>]*\bu="sng"[^>]*strike="sngStrike"/);
  assert.match(xml, /<a:rPr [^>]*\bb="1"[^>]*>/, "인라인 굵게는 그대로");
  assert.match(xml, /<a:srgbClr val="333333"><a:alpha val="80000"\/><\/a:srgbClr>/, "글자색에도 투명도");
  assert.match(xml, /<a:prstGeom prst="roundRect">/, "배경이 있고 모서리 8px");
  assert.match(xml, /<a:solidFill><a:srgbClr val="FFEE00"><a:alpha val="80000"\/>/, "배경 채우기");
  assert.match(xml, /<a:ln w="25400">/, "테두리 2px");
  assert.match(xml, /lIns="73152" tIns="73152"/, "배경·테두리가 있으면 안쪽 여백(슬라이드 폭 0.6%)");
  assert.match(xml, /<a:pPr algn="ctr">/);
});

test("text 요소: 새 필드가 없으면 예전과 같은 출력(anchor=t, 여백 0, lnSpc 없음, 배경 없음)", async () => {
  const xml = await sldXml([{ ...base, id: "t", kind: "text", markup: "그냥 글", fontSize: 1.8 }]);
  assert.match(xml, /<a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t">/);
  assert.match(xml, /<a:pPr algn="l"><a:buNone\/><\/a:pPr>/);
  assert.match(xml, /<a:prstGeom prst="rect"><a:avLst\/><\/a:prstGeom><a:noFill\/><a:ln><a:noFill\/><\/a:ln>/);
  assert.equal(xml.includes("lnSpc"), false);
  assert.equal(xml.includes("<p:bg>"), false);
});

test("richtext 요소: 색·굵게·기울임·줄간격·세로정렬(아래)·글꼴이 문단 서식으로 들어가고 글머리·문단 간격 유지", async () => {
  const xml = await sldXml([{ ...base, id: "rt", kind: "richtext", fontSize: 1.4, color: "#123456", weight: "bold", italic: true, fontFamily: "함초롬바탕", lineHeight: 1.35, valign: "bottom",
    blocks: [{ type: "paragraph", text: "문단" }, { type: "bullet", text: "항목" }] }]);
  wellFormed(xml);
  assert.match(xml, /anchor="b"/);
  assert.match(xml, /<a:rPr [^>]*\bb="1"[^>]*\bi="1"[^>]*><a:solidFill><a:srgbClr val="123456"\/><\/a:solidFill><a:latin typeface="함초롬바탕"\/>/);
  assert.match(xml, /<a:lnSpc><a:spcPct val="100000"\/><\/a:lnSpc><a:spcAft><a:spcPts val="672"\/><\/a:spcAft>/, "기본 줄간격(1.35)=100%, 문단 아래 간격 0.5em");
  assert.match(xml, /<a:buChar char="•"\/>/);
  assert.match(xml, /<a:lnSpc>[^]*?<\/a:lnSpc><a:spcAft>[^]*?<\/a:spcAft><a:buFont/, "pPr 자식 순서: lnSpc, spcAft, 글머리");
});

test("표: 글자 크기는 fontSize(cqw) → sz, 없으면 1.35cqw(고정 14pt 아님)", async () => {
  const rows = [["가", "나"], ["1", "2"]];
  const big = await sldXml([{ ...base, id: "t1", kind: "table", headerRow: true, rows, fontSize: 2 }]);
  assert.match(big, /sz="1920"/);
  assert.equal(big.includes('sz="1400"'), false);
  const dflt = await sldXml([{ ...base, id: "t2", kind: "table", rows }]);
  assert.match(dflt, new RegExp(`sz="${cqwToHundredthPt(1.35)}"`));
});

test("슬라이드 배경색: <p:bg><p:bgPr> 를 spTree 앞에, 색을 못 읽으면 생략", async () => {
  const xml = await sldXml([{ ...base, id: "t", kind: "text", markup: "x" }], { bg: "#112233" });
  wellFormed(xml);
  assert.match(xml, /<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="112233"\/><\/a:solidFill><a:effectLst\/><\/p:bgPr><\/p:bg><p:spTree>/);
  assert.equal((await sldXml([], { bg: "javascript:alert(1)" })).includes("<p:bg>"), false);
  assert.equal((await sldXml([], { bg: "" })).includes("<p:bg>"), false);
});

const b64 = bytes => Buffer.from(bytes).toString("base64");
/** 헤더만 있는 PNG/JPEG 흉내(크기 읽기 검사용) */
const pngHeader = (w, h) => { const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };
const jpegHeader = (w, h) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);

test("이미지 크기 읽기(PNG IHDR·JPEG SOF), 못 읽으면 null", () => {
  assert.deepEqual(imageSize(pngHeader(200, 100)), { w: 200, h: 100 });
  assert.deepEqual(imageSize(jpegHeader(640, 480)), { w: 640, h: 480 });
  assert.equal(imageSize(new Uint8Array(40)), null);
  assert.equal(imageSize(new Uint8Array(3)), null);
});

test("이미지: 불투명도(alphaModFix)·모서리(roundRect)·cover 잘라내기(srcRect)·contain 비율 유지", async () => {
  const src = `data:image/png;base64,${b64(pngHeader(200, 100))}`; // 2:1
  const box = { id: "i", kind: "image", x: 10, y: 10, w: 20, h: 20, rot: 0, z: 1, src }; // 상자 비율 16:9 = 1.7778
  const cover = await sldXml([{ ...box, fit: "cover", opacity: 0.5, radius: 10 }]);
  wellFormed(cover);
  assert.match(cover, /<a:blip r:embed="rId2"><a:alphaModFix amt="50000"\/><\/a:blip><a:srcRect l="5556" r="5556"\/><a:stretch>/, "좌우로 넘치는 부분 잘라냄");
  assert.match(cover, /<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val \d+"\/>/);
  const tall = await sldXml([{ ...box, src: `data:image/png;base64,${b64(pngHeader(100, 200))}`, fit: "cover" }]);
  assert.match(tall, /<a:srcRect t="\d+" b="\d+"\/>/, "세로로 긴 그림은 위아래를 잘라냄");
  const contain = await sldXml([{ ...box, fit: "contain" }]);
  const w = pctToEmuX(20), h = pctToEmuY(20);
  const ch = Math.round(w / 2);
  assert.match(contain, new RegExp(`<a:off x="${pctToEmuX(10)}" y="${pctToEmuY(10) + Math.round((h - ch) / 2)}"/><a:ext cx="${w}" cy="${ch}"/>`), "가로가 꽉 차고 세로는 가운데 정렬");
  assert.equal(contain.includes("srcRect"), false);
  const plain = await sldXml([{ ...box, src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", fit: "cover" }]);
  assert.match(plain, /<a:blip r:embed="rId2"\/>/, "불투명도 1 이면 alphaModFix 없음");
  assert.equal(plain.includes("roundRect"), false);
});

test("모든 스타일을 쓴 슬라이드로 만든 PPTX 가 구조 검증을 통과함(PPTX_OUT=경로 를 주면 그 파일로도 저장)", async () => {
  const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const slides = [{ bg: "#F4F1EA", elements: [
    { ...base, id: "1", kind: "text", markup: "제목 & <태그>", fontSize: 3, fontFamily: "Noto Sans KR", italic: true, underline: true, strike: true, lineHeight: 1.6, valign: "bottom", fill: "#FFFFFF", borderColor: "#333", borderWidth: 1, radius: 6, opacity: 0.9 },
    { ...base, id: "2", kind: "richtext", y: 25, fontSize: 1.4, valign: "middle", blocks: [{ type: "paragraph", text: "문단" }, { type: "bullet", text: "항목" }] },
    { ...base, id: "3", kind: "table", y: 40, headerRow: true, rows: [["a", "b"], ["c", "d"]], fontSize: 1.6 },
    ...["rect", "roundRect", "ellipse", "triangle", "line", "arrow"].map((t, i) => ({ ...base, id: `s${i}`, kind: "shape", shapeType: t, x: 5 + i * 15, y: 60, w: 12, h: t === "line" || t === "arrow" ? 0 : 12, fill: "#3B5A7A", stroke: "#000000", strokeWidth: 2, radius: 16, opacity: 0.7 })),
    { ...base, id: "img", kind: "image", y: 80, w: 10, h: 10, fit: "cover", radius: 4, opacity: 0.6, src: `data:image/png;base64,${tinyPng}` },
  ] }, { elements: [{ ...base, id: "x", kind: "text", markup: "두 번째" }] }];
  const bytes = await buildPptx({ slides, title: "스타일", creator: "테스트", fontName: "Pretendard", rasterizeChart: async () => null, JSZip });
  const zip = await JSZip.loadAsync(bytes);
  const entries = await Promise.all(Object.values(zip.files).filter(e => !e.dir).map(async e => ({ path: e.name, data: await e.async("uint8array") })));
  assert.deepEqual(validatePptx(entries, DOMParser), []);
  const slide1 = new TextDecoder().decode(entries.find(e => e.path === "ppt/slides/slide1.xml").data);
  assert.equal(/undefined|NaN/.test(slide1), false);
  assert.match(slide1, /제목 &amp; &lt;태그&gt;/, "텍스트 이스케이프");
  if (process.env.PPTX_OUT) await writeFile(process.env.PPTX_OUT, bytes); // 수동 확인용(tools/validate-pptx.mjs·PowerPoint 로 열어 보기)
});

// ── 발표자 노트(notesMaster·notesSlide) ──
const zipEntries = async bytes => {
  const zip = await JSZip.loadAsync(bytes);
  return Promise.all(Object.values(zip.files).filter(e => !e.dir).map(async e => ({ path: e.name, data: await e.async("uint8array") })));
};
const partText = (entries, path) => { const e = entries.find(x => x.path === path); return e ? new TextDecoder().decode(e.data) : null; };
const textEl = { ...base, id: "t", kind: "text", markup: "본문" };
/** 노트 문단 텍스트 목록(빈 문단은 "") — notesSlide 의 body 자리 안 <a:p> 들 */
const notesParas = xml => [...xml.split('<p:ph type="body" idx="1"/>')[1].matchAll(/<a:p>(.*?)<\/a:p>/g)].map(m => [...m[1].matchAll(/<a:t>(.*?)<\/a:t>/g)].map(t => t[1]).join(""));

test("발표자 노트: 노트가 있는 슬라이드에만 notesSlide 가 생기고 본문 문단·이스케이프·빈 줄·관계·콘텐츠 타입·presentation.xml 이 맞음", async () => {
  const slides = [
    { elements: [textEl], notes: ["첫 줄 & 둘째 <b> \"인용\" >", "", "세 번째 줄(위 빈 줄 유지)"] },
    { elements: [textEl] }, // 노트 필드 없음
    { elements: [textEl], notes: [] }, // 빈 배열
    { elements: [textEl], notes: ["", "  "] }, // 공백뿐 — 노트 없음으로 봄
    { elements: [textEl], notes: ["마지막 슬라이드 노트", "여러\n줄이 든 항목"] },
  ];
  const entries = await zipEntries(await buildPptx({ slides, title: "노트", rasterizeChart: async () => null, JSZip }));
  assert.deepEqual(validatePptx(entries, DOMParser), []);
  const paths = entries.map(e => e.path);
  assert.deepEqual(paths.filter(p => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)).sort(), ["ppt/notesSlides/notesSlide1.xml", "ppt/notesSlides/notesSlide5.xml"], "노트가 있는 1·5번 슬라이드에만");
  assert.ok(paths.includes("ppt/notesMasters/notesMaster1.xml") && paths.includes("ppt/notesMasters/_rels/notesMaster1.xml.rels") && paths.includes("ppt/theme/theme2.xml"));
  assert.match(partText(entries, "ppt/notesMasters/_rels/notesMaster1.xml.rels"), /relationships\/theme" Target="\.\.\/theme\/theme2\.xml"/);
  // 노트 슬라이드: 슬라이드 그림 자리 + 본문 자리, 한 줄 = 한 문단, 빈 줄은 빈 문단
  const n1 = partText(entries, "ppt/notesSlides/notesSlide1.xml");
  wellFormed(n1);
  assert.match(n1, /<p:ph type="sldImg"\/>/);
  assert.match(n1, /<p:ph type="body" idx="1"\/>/);
  assert.match(n1, /<a:t>첫 줄 &amp; 둘째 &lt;b&gt; "인용" &gt;<\/a:t>/, "& < > 이스케이프, 따옴표·한글은 그대로");
  assert.deepEqual(notesParas(n1), ["첫 줄 &amp; 둘째 &lt;b&gt; \"인용\" &gt;", "", "세 번째 줄(위 빈 줄 유지)"]);
  assert.match(n1, /<a:p><a:endParaRPr lang="ko-KR" dirty="0"\/><\/a:p>/, "빈 줄은 빈 문단");
  assert.match(n1, /<a:rPr lang="ko-KR" dirty="0"\/>/);
  assert.deepEqual(notesParas(partText(entries, "ppt/notesSlides/notesSlide5.xml")), ["마지막 슬라이드 노트", "여러", "줄이 든 항목"], "항목 안의 줄바꿈도 문단으로 나뉨");
  // 관계: 노트 → 마스터 + 슬라이드, 슬라이드 → 노트(1·5번만)
  assert.equal(partText(entries, "ppt/notesSlides/_rels/notesSlide5.xml.rels").includes('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"'), true);
  assert.equal(partText(entries, "ppt/notesSlides/_rels/notesSlide5.xml.rels").includes('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide5.xml"'), true);
  for (const i of [1, 2, 3, 4, 5]) {
    const rels = partText(entries, `ppt/slides/_rels/slide${i}.xml.rels`);
    assert.equal(rels.includes(`relationships/notesSlide" Target="../notesSlides/notesSlide${i}.xml"`), i === 1 || i === 5, `슬라이드 ${i} 의 notesSlide 관계`);
  }
  // [Content_Types].xml 과 presentation.xml
  const ctx = partText(entries, "[Content_Types].xml");
  assert.match(ctx, /<Override PartName="\/ppt\/notesMasters\/notesMaster1\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.presentationml\.notesMaster\+xml"\/>/);
  assert.match(ctx, /<Override PartName="\/ppt\/theme\/theme2\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.theme\+xml"\/>/);
  assert.equal((ctx.match(/presentationml\.notesSlide\+xml/g) || []).length, 2);
  const pres = partText(entries, "ppt/presentation.xml");
  assert.match(pres, /<\/p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rIdNotesMaster1"\/><\/p:notesMasterIdLst><p:sldIdLst>/, "스키마 순서: sldMasterIdLst → notesMasterIdLst → sldIdLst");
  assert.match(partText(entries, "ppt/_rels/presentation.xml.rels"), /Id="rIdNotesMaster1" Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/notesMaster" Target="notesMasters\/notesMaster1\.xml"/);
});

test("발표자 노트: 노트가 하나도 없으면 노트 파트·notesMasterIdLst 없이 예전과 같은 구조(하위 호환)", async () => {
  for (const notesField of [undefined, [], [""]]) {
    const slides = [{ elements: [textEl], ...(notesField ? { notes: notesField } : {}) }, { elements: [textEl] }];
    const entries = await zipEntries(await buildPptx({ slides, title: "노트 없음", rasterizeChart: async () => null, JSZip }));
    assert.deepEqual(validatePptx(entries, DOMParser), []);
    assert.equal(entries.some(e => /notesMaster|notesSlide|theme2/.test(e.path)), false);
    assert.equal(partText(entries, "ppt/presentation.xml").includes("notesMasterIdLst"), false);
    assert.equal(/notes/i.test(partText(entries, "[Content_Types].xml").replace("notesSz", "")), false, "콘텐츠 타입에 노트 항목 없음");
    assert.equal(/notes/i.test(partText(entries, "ppt/_rels/presentation.xml.rels")), false);
    assert.equal(/notesSlide/.test(partText(entries, "ppt/slides/_rels/slide1.xml.rels")), false);
    assert.match(partText(entries, "ppt/presentation.xml"), /<p:notesSz cx="6858000" cy="9144000"\/>/);
  }
});

test("발표자 노트: 자유배치(custom) 슬라이드의 사용자 노트 — render-pptx 가 조립된 slide.notes 를 그대로 넘기고 자동 슬라이드의 자동 노트·사용자 덮어쓴 노트(빈 배열 포함)를 따름", async () => {
  const { renderPptx } = await import("../../js/report/render-pptx.js");
  const auto = { id: "a1", type: "title", title: "표지", subtitle: "부제", notes: ["자동 노트 A"] };
  const autoOverridden = { id: "a2", type: "title", title: "둘째", subtitle: "", notes: ["사용자가 고친 노트", "", "둘째 줄"] }; // store.js assembledDeckSlides 가 이미 얹은 결과
  const autoCleared = { id: "a3", type: "title", title: "셋째", subtitle: "", notes: [] }; // 사용자가 노트를 모두 지움
  const custom = { id: "c1", type: "custom", section: "사용자 슬라이드", title: "새 슬라이드", notes: ["직접 만든 슬라이드 노트 & 메모"], elements: [] };
  const deckOverrides = { bySlide: { c1: { mode: "custom", elements: [{ ...base, id: "e1", kind: "text", markup: "직접 배치" }], notes: ["직접 만든 슬라이드 노트 & 메모"] } } };
  const bytes = await renderPptx([auto, autoOverridden, autoCleared, custom], deckOverrides, { rasterizeChart: async () => null, JSZip, title: "혼합", settings: {} });
  const entries = await zipEntries(bytes);
  assert.deepEqual(validatePptx(entries, DOMParser), []);
  assert.equal(entries.filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.path)).length, 4);
  assert.deepEqual(entries.map(e => e.path).filter(p => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)).sort(), ["ppt/notesSlides/notesSlide1.xml", "ppt/notesSlides/notesSlide2.xml", "ppt/notesSlides/notesSlide4.xml"], "노트를 모두 지운 3번 슬라이드는 노트 파트 없음");
  assert.deepEqual(notesParas(partText(entries, "ppt/notesSlides/notesSlide1.xml")), ["자동 노트 A"]);
  assert.deepEqual(notesParas(partText(entries, "ppt/notesSlides/notesSlide2.xml")), ["사용자가 고친 노트", "", "둘째 줄"]);
  assert.deepEqual(notesParas(partText(entries, "ppt/notesSlides/notesSlide4.xml")), ["직접 만든 슬라이드 노트 &amp; 메모"]);
  assert.match(partText(entries, "ppt/slides/slide4.xml"), /<a:t>직접 배치<\/a:t>/, "자유배치 요소도 그대로");
});

test("발표자 노트: validatePptx 가 노트 연결 오류(짝·콘텐츠 타입·notesMasterIdLst 불일치)를 잡아냄", async () => {
  const good = await zipEntries(await buildPptx({ slides: [{ elements: [textEl], notes: ["노트"] }], title: "n", rasterizeChart: async () => null, JSZip }));
  const mutate = (fn) => good.map(e => ({ path: e.path, data: fn(e.path, new TextDecoder().decode(e.data)) })).filter(e => e.data !== null);
  const errs = fn => validatePptx(mutate(fn), DOMParser);
  assert.deepEqual(errs((p, t) => t), []);
  assert.ok(errs((p, t) => (p === "ppt/slides/_rels/slide1.xml.rels" ? t.replace(/<Relationship Id="rIdNotes1"[^>]*\/>/, "") : t)).some(e => /되돌아가는 notesSlide 관계 없음/.test(e)), "슬라이드→노트 관계 누락");
  assert.ok(errs((p, t) => (p === "ppt/notesSlides/_rels/notesSlide1.xml.rels" ? t.replace(/slides\/slide1\.xml/, "slides/slide9.xml") : t)).some(e => /슬라이드 대상 없음|Target 없음/.test(e)), "노트→슬라이드 대상 없음");
  assert.ok(errs((p, t) => (p === "[Content_Types].xml" ? t.replace(/<Override PartName="\/ppt\/notesSlides\/notesSlide1\.xml"[^>]*\/>/, "") : t)).some(e => /notesSlide Override 없음/.test(e)), "콘텐츠 타입 누락");
  assert.ok(errs((p, t) => (p === "[Content_Types].xml" ? t.replace(/<Override PartName="\/ppt\/theme\/theme2\.xml"[^>]*\/>/, "") : t)).some(e => /theme Override 없음/.test(e)), "theme2 콘텐츠 타입 누락");
  assert.ok(errs((p, t) => (p === "ppt/presentation.xml" ? t.replace(/<p:notesMasterIdLst>.*<\/p:notesMasterIdLst>/, "") : t)).some(e => /notesMasterIdLst 가 없음/.test(e)), "notesMasterIdLst 누락");
  assert.ok(errs((p, t) => (p.startsWith("ppt/notes") || p === "ppt/theme/theme2.xml" ? null : t)).some(e => /notesMasterIdLst 가 있는데 노트 파트가 없음|notesMaster 대상 없음|Target 없음/.test(e)), "notesMasterIdLst 만 남음");
});
