// 자유배치 슬라이드 HTML 렌더러 — 요소별 스타일 필드가 인라인 스타일·마크업으로 옮겨지는지, 예전 요소는 그대로 그려지는지
import test from "node:test";
import assert from "node:assert/strict";
import { freeElementsHtml, slideHtmlCustom } from "../../js/present/edit/render-custom.js";

const base = { x: 10, y: 20, w: 30, h: 15, rot: 0, z: 1 };
const html = (el, opts) => freeElementsHtml("s1", [{ id: "e1", ...base, ...el }], "light", opts);
const inner = h => h.replace(/^<div class="s-el [^>]*>/, "").replace(/<\/div>$/, "");

test("text 요소: 새 필드가 없으면 예전과 똑같은 마크업", () => {
  const h = html({ kind: "text", markup: "안녕", fontSize: 2, align: "center", weight: "bold", color: "#112233" });
  assert.equal(h, `<div class="s-el s-el-text" data-el-id="e1" style="left:10%;top:20%;width:30%;height:15%;transform:rotate(0deg);z-index:1;font-size:2cqw;text-align:center;"><div class="s-el-text" style="color:#112233;font-weight:750">안녕</div></div>`);
  const plain = html({ kind: "text", markup: "안녕" });
  assert.match(plain, /<div class="s-el-text" style="">안녕<\/div>/);
});

test("text 요소: 글꼴·기울임·밑줄+취소선·줄간격·세로정렬·배경·테두리·모서리·투명도가 안쪽 상자 스타일로", () => {
  const h = html({ kind: "text", markup: "본문", fontFamily: "맑은 고딕", italic: true, underline: true, strike: true, lineHeight: 1.6, valign: "middle", fill: "#FFEE00", borderColor: "#333", borderWidth: 2, radius: 8, opacity: 0.5 });
  const style = /class="s-el-text" style="([^"]*)"/.exec(h)[1];
  assert.match(style, /font-family:'맑은 고딕',var\(--font\)/);
  assert.match(style, /font-style:italic/);
  assert.match(style, /text-decoration:underline line-through/);
  assert.match(style, /line-height:1\.6/);
  assert.match(style, /display:flex;flex-direction:column;justify-content:center/);
  assert.match(style, /background:#FFEE00/);
  assert.match(style, /border:2px solid #333/);
  assert.match(style, /border-radius:8px/);
  assert.match(style, /padding:0\.6cqw/);
  assert.match(style, /opacity:0\.5/);
  // 바깥 .s-el 에는 투명도·배경이 없음(핸들이 함께 흐려지지 않게)
  assert.equal(/class="s-el s-el-text"[^>]*opacity/.test(h), false);
});

test("text 요소: valign 위/아래/가운데, 기본 글꼴('기본')은 font-family 없음", () => {
  assert.equal(/flex-direction/.test(html({ kind: "text", markup: "a", valign: "top" })), false);
  assert.match(html({ kind: "text", markup: "a", valign: "bottom" }), /justify-content:flex-end/);
  assert.equal(/font-family/.test(html({ kind: "text", markup: "a", fontFamily: "기본" })), false);
  assert.equal(/font-family/.test(html({ kind: "text", markup: "a", fontFamily: "" })), false);
});

test("richtext 요소: 같은 필드를 적용하고 글머리·문단 구조 유지, 스타일 없으면 style 속성 없음", () => {
  const blocks = [{ type: "paragraph", text: "문단" }, { type: "bullet", text: "항목" }];
  const plain = html({ kind: "richtext", blocks });
  assert.match(plain, /<div class="s-el-richtext"><div class="s-el-para">/);
  assert.match(plain, /<div class="s-el-bullet"><span class="s-el-bullet-dot" aria-hidden="true">•<\/span>항목<\/div>/);
  const h = html({ kind: "richtext", blocks, color: "#123456", weight: "bold", italic: true, lineHeight: 1.8, valign: "bottom", fontFamily: "함초롬바탕", fill: "#eee", opacity: 0.9 });
  const style = /class="s-el-richtext" style="([^"]*)"/.exec(h)[1];
  assert.match(style, /color:#123456;font-weight:750;font-family:'함초롬바탕',var\(--font\);font-style:italic/);
  assert.match(style, /line-height:1\.8/);
  assert.match(style, /justify-content:flex-end/);
  assert.match(style, /background:#eee/);
  assert.match(style, /opacity:0\.9/);
});

test("표: fontSize(cqw)를 .s-el 에 적용하고 없으면 1.35cqw", () => {
  const rows = [["가", "나"], ["1", "2"]];
  assert.match(html({ kind: "table", rows, fontSize: 2.4 }), /class="s-el s-el-table"[^>]*style="[^"]*font-size:2\.4cqw;/);
  assert.match(html({ kind: "table", rows }), /style="[^"]*font-size:1\.35cqw;/);
  assert.match(html({ kind: "table", rows, headerRow: true }), /<table class="s-el-table"><tr><th>가<\/th><th>나<\/th><\/tr><tr><td>1<\/td><td>2<\/td><\/tr><\/table>/);
});

test("shape: rect·ellipse 는 예전 마크업 그대로, roundRect 는 border-radius(기본 12px)", () => {
  assert.equal(inner(html({ kind: "shape", shapeType: "rect", fill: "#3B5A7A", stroke: "#000", strokeWidth: 2 })), `<div class="s-el-shape s-el-shape-rect" style="background:#3B5A7A;border:2px solid #000"></div>`);
  assert.equal(inner(html({ kind: "shape", shapeType: "ellipse", fill: "#fff" })), `<div class="s-el-shape s-el-shape-ellipse" style="background:#fff;border:0px solid transparent"></div>`);
  assert.match(html({ kind: "shape", shapeType: "roundRect", fill: "#fff", radius: 20 }), /s-el-shape-roundRect" style="[^"]*border-radius:20px/);
  assert.match(html({ kind: "shape", shapeType: "roundRect", fill: "#fff" }), /border-radius:12px/);
  assert.match(html({ kind: "shape", shapeType: "rect", fill: "#fff", opacity: 0.4 }), /opacity:0\.4/);
  assert.equal(/opacity/.test(html({ kind: "shape", shapeType: "rect", fill: "#fff", opacity: 1 })), false);
});

test("shape: 모르는 종류(또는 없음)는 rect", () => {
  for (const shapeType of ["star", "constructor", "", undefined, null, 3]) {
    const h = html({ kind: "shape", shapeType, fill: "#fff" });
    assert.match(h, /class="s-el-shape s-el-shape-rect"/, String(shapeType));
    assert.equal(/undefined|NaN|\[object/.test(h), false, String(shapeType));
  }
});

test("shape: 삼각형은 인라인 svg(preserveAspectRatio none, 비례 안 하는 선, 채우기·선·투명도)", () => {
  const h = inner(html({ kind: "shape", shapeType: "triangle", fill: "#0f0", stroke: "#f00", strokeWidth: 3, opacity: 0.5 }));
  assert.match(h, /^<svg class="s-el-shape s-el-shape-triangle" viewBox="0 0 100 100" preserveAspectRatio="none"/);
  assert.match(h, /<polygon points="50,0 100,100 0,100" fill="#0f0" stroke="#f00" stroke-width="3"[^>]*vector-effect="non-scaling-stroke"/);
  assert.match(h, /style="opacity:0\.5"/);
  assert.match(inner(html({ kind: "shape", shapeType: "triangle" })), /fill="none" stroke="none"/);
});

test("shape: 선·화살표는 가운데를 가로지르는 선(굵기·색·투명도), 화살촉은 굵기 3배, 굵기 0 이면 기본 굵기", () => {
  const line = inner(html({ kind: "shape", shapeType: "line", stroke: "#123", strokeWidth: 4, opacity: 0.5 }));
  assert.match(line, /^<div class="s-el-shape s-el-shape-line" style="opacity:0\.5"><i class="s-el-line" style="border-top:4px solid #123"><\/i><\/div>$/);
  const arrow = inner(html({ kind: "shape", shapeType: "arrow", stroke: "#123", strokeWidth: 4 }));
  assert.match(arrow, /s-el-shape-arrow/);
  assert.match(arrow, /<i class="s-el-arrowhead" style="border-left:12px solid #123;border-top:6px solid transparent;border-bottom:6px solid transparent">/);
  assert.match(inner(html({ kind: "shape", shapeType: "line", stroke: "#123", strokeWidth: 0 })), /border-top:2px solid #123/);
  assert.match(inner(html({ kind: "shape", shapeType: "line", h: 0 })), /border-top:2px solid currentColor/, "색이 없으면 글자색");
});

test("이미지: 예전과 같은 스타일(fit·radius·opacity), 잘못된 값은 안전한 값으로", () => {
  assert.match(html({ kind: "image", src: "data:image/png;base64,AAAA", fit: "contain", radius: 10, opacity: 0.5 }), /style="object-fit:contain;border-radius:10px;opacity:0\.5"/);
  assert.match(html({ kind: "image", src: "data:image/png;base64,AAAA" }), /style="object-fit:cover;border-radius:0px;opacity:1"/);
  assert.equal(/NaN/.test(html({ kind: "image", src: "x", radius: "abc", opacity: "zzz" })), false);
});

test("어떤 요소에서도 'undefined'·'NaN'·'null' 이 마크업에 나오지 않음", () => {
  const els = [
    { id: "a", kind: "text", ...base, markup: undefined, fontSize: undefined, lineHeight: "x", opacity: "y", borderWidth: "z", radius: NaN },
    { id: "b", kind: "richtext", ...base, blocks: undefined },
    { id: "c", kind: "table", ...base, rows: undefined, fontSize: "abc" },
    { id: "d", kind: "shape", ...base, shapeType: "arrow", strokeWidth: "x", opacity: NaN },
    { id: "e", kind: "shape", ...base, shapeType: "roundRect", radius: "x" },
  ];
  const h = freeElementsHtml("s1", els, "light");
  assert.equal(/undefined|NaN|null/.test(h), false, h);
});

test("XSS: 색·글꼴·문구·이미지 주소에 속성/태그를 깨는 값이 있어도 이스케이프·제거", () => {
  const evil = `red"><script>alert(1)</script>`;
  const els = [
    { id: 'e"1', kind: "text", ...base, markup: "<img src=x onerror=alert(1)>", color: evil, fill: evil, borderColor: evil, borderWidth: 1, fontFamily: `Arial"><b>` },
    { id: "e2", kind: "shape", ...base, shapeType: "triangle", fill: evil, stroke: evil, strokeWidth: 1 },
    { id: "e3", kind: "shape", ...base, shapeType: "arrow", stroke: evil },
    { id: "e4", kind: "shape", ...base, shapeType: `"><script>`, fill: evil },
    { id: "e5", kind: "image", ...base, src: `x" onerror="alert(1)`, fit: `cover" onload="x` },
    { id: "e6", kind: "richtext", ...base, blocks: [{ type: "bullet", text: "<script>alert(1)</script>" }], color: evil },
    { id: "e7", kind: "table", ...base, rows: [["<b>x</b>"]] },
  ];
  const h = freeElementsHtml("s1", els, "light", { editable: true });
  assert.equal(/<script/i.test(h), false, "script 태그 없음");
  assert.equal(/<img src=x/i.test(h), false);
  assert.equal(/<b>/.test(h), false);
  assert.equal(/"\s*onerror=|"\s*onload=/i.test(h), false, "이벤트 속성 주입 없음");
});

test("슬라이드 배경: s.bg 가 article 스타일로, 없거나 위험한 값이면 없음", () => {
  const entry = { elements: [] };
  assert.match(slideHtmlCustom({ id: "s1", title: "제목", bg: "#112233" }, entry, 0, 1, "light"), /<article class="slide t-custom light"[^>]*data-slide-id="s1" style="background:#112233">/);
  assert.equal(/style=/.test(slideHtmlCustom({ id: "s1", title: "t" }, entry, 0, 1, "light")), false);
  assert.equal(/style=/.test(slideHtmlCustom({ id: "s1", title: "t", bg: `red"><script>` }, entry, 0, 1, "light")), false);
  assert.match(slideHtmlCustom({ id: "s1", title: "t" }, { elements: [], bg: "rgb(1, 2, 3)" }, 0, 1, "dark"), /style="background:rgb\(1, 2, 3\)"/, "저장된 항목의 bg 도 인정");
});

test("편집 모드: contenteditable·핸들·선택 표시 유지, 서식 필드와 함께 써도 그대로", () => {
  const h = html({ kind: "text", markup: "고치기", valign: "middle", fill: "#fff" }, { editable: true, selectedElId: "e1" });
  assert.match(h, /class="s-el s-el-text selected"/);
  assert.match(h, /<span class="r-txt" contenteditable="true" spellcheck="false" data-multiline="1" data-edit="/);
  assert.equal((h.match(/class="s-el-handle /g) || []).length, 9, "크기 핸들 8 + 회전 1");
  const tbl = html({ kind: "table", rows: [["a"]], fontSize: 2 }, { editable: true });
  assert.match(tbl, /<td><span class="r-txt" contenteditable="true"/);
});
