// PPTX 슬라이드 XML 생성 — HWPX 작성기(js/report/hwpx/writer.js)와 같은 손글씨 문자열 템플릿 방식.
// 요소(state.deckOverrides 의 elements[])를 그대로 <p:sp>(텍스트·도형)·<p:pic>(이미지·차트 래스터)로 옮김.
import { escText, escAttr } from "./xml.js";
import { pctToEmuX, pctToEmuY, cqwToHundredthPt, degToRot60000, SLIDE_W_EMU, SLIDE_H_EMU } from "./emu.js";
import { parseInline } from "../inline-marks.js";

const ALIGN = { left: "l", center: "ctr", right: "r" };
const hex = c => String(c || "").replace("#", "").toUpperCase();

function runXml(text, marks, sz, fontName) {
  const attrs = [`lang="ko-KR"`, `dirty="0"`, `sz="${sz}"`];
  if (marks.bold) attrs.push('b="1"');
  if (marks.italic) attrs.push('i="1"');
  if (marks.underline) attrs.push('u="sng"');
  if (marks.strike) attrs.push('strike="sngStrike"');
  const fill = marks.color ? `<a:solidFill><a:srgbClr val="${hex(marks.color)}"/></a:solidFill>` : "";
  const font = fontName ? `<a:latin typeface="${escAttr(fontName)}"/><a:ea typeface="${escAttr(fontName)}"/><a:cs typeface="${escAttr(fontName)}"/>` : "";
  return `<a:r><a:rPr ${attrs.join(" ")}>${fill}${font}</a:rPr><a:t>${escText(text)}</a:t></a:r>`;
}

const BULLET_PPR = `<a:buFont typeface="Arial"/><a:buChar char="•"/>`;

/** 한 문단(줄) → <a:p> — 보고서와 같은 표식 문자열의 굵게·색 등을 <a:r> 런으로 옮김 */
function lineParagraphXml(line, { sz, algn, weight, color, fontName, bullet }) {
  const runs = parseInline(line);
  const body = runs.length
    ? runs.map(r => runXml(r.text, { bold: r.bold || weight === "bold", italic: r.italic, underline: r.underline, strike: r.strike, color: r.color || color }, sz, fontName)).join("")
    : `<a:endParaRPr lang="ko-KR" sz="${sz}" dirty="0"/>`;
  const pPr = bullet ? `<a:pPr algn="${algn}" marL="228600" indent="-228600">${BULLET_PPR}</a:pPr>` : `<a:pPr algn="${algn}"><a:buNone/></a:pPr>`;
  return `<a:p>${pPr}${body}</a:p>`;
}

/** 텍스트 요소 하나 → <a:p> 문단들(줄바꿈마다 한 문단) */
function paragraphsXml(markup, { fontSize = 1.8, align = "left", weight = null, color = null, fontName = null } = {}) {
  const sz = cqwToHundredthPt(fontSize);
  const algn = ALIGN[align] || "l";
  return String(markup ?? "").split("\n").map(line => lineParagraphXml(line, { sz, algn, weight, color, fontName, bullet: false })).join("");
}

/** richtext 요소(문단·글머리 블록 배열) → <a:p> 문단들 — 블록 하나가 줄바꿈을 담고 있으면 같은 종류로 이어서 나눔 */
function richtextParagraphsXml(blocks, { fontSize = 1.4, align = "left", fontName = null } = {}) {
  const sz = cqwToHundredthPt(fontSize);
  const algn = ALIGN[align] || "l";
  return (blocks || []).flatMap(b => String(b.text ?? "").split("\n").map(line => lineParagraphXml(line, { sz, algn, weight: null, color: null, fontName, bullet: b.type === "bullet" }))).join("");
}

function xfrmXml(el) {
  const rot = degToRot60000(el.rot);
  return `<a:xfrm${rot ? ` rot="${rot}"` : ""}><a:off x="${pctToEmuX(el.x)}" y="${pctToEmuY(el.y)}"/><a:ext cx="${Math.max(1, pctToEmuX(el.w))}" cy="${Math.max(1, pctToEmuY(el.h))}"/></a:xfrm>`;
}

let shapeSeq = 1;
const nextShapeId = () => ++shapeSeq;

const TEXTUAL_KINDS = new Set(["text", "richtext"]);

/** 텍스트·richtext·도형 요소 → <p:sp> */
function spXml(el, opts) {
  const id = nextShapeId();
  const isTextual = TEXTUAL_KINDS.has(el.kind);
  const prst = el.kind === "shape" ? (el.shapeType === "ellipse" ? "ellipse" : "rect") : "rect";
  const fill = el.kind === "shape" ? (el.fill ? `<a:solidFill><a:srgbClr val="${hex(el.fill)}"/></a:solidFill>` : `<a:noFill/>`) : "<a:noFill/>";
  const line = el.kind === "shape" && el.strokeWidth ? `<a:ln w="${Math.round(el.strokeWidth * 12700)}"><a:solidFill><a:srgbClr val="${hex(el.stroke || "#000000")}"/></a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>";
  const paragraphs = el.kind === "richtext"
    ? richtextParagraphsXml(el.blocks, { fontSize: el.fontSize, align: el.align, fontName: opts?.fontName })
    : paragraphsXml(el.markup, { fontSize: el.fontSize, align: el.align, weight: el.weight, color: el.color, fontName: opts?.fontName });
  const body = isTextual
    ? `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody>`
    : `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${isTextual ? "TextBox" : "Shape"} ${id}"/><p:cNvSpPr${isTextual ? ' txBox="1"' : ""}/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(el)}<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr>${body}</p:sp>`;
}

/** 표 요소 → <p:graphicFrame><a:tbl> (회전은 표에 적용하지 않음 — OOXML 표 프레임은 회전을 지원하지 않음) */
function tableXml(el) {
  const id = nextShapeId();
  const rows = el.rows || [];
  const nCols = rows[0]?.length || 1;
  const colW = Math.max(1, Math.floor(pctToEmuX(el.w) / nCols));
  const rowH = Math.max(1, Math.floor(pctToEmuY(el.h) / Math.max(1, rows.length)));
  const grid = `<a:tblGrid>${Array.from({ length: nCols }, () => `<a:gridCol w="${colW}"/>`).join("")}</a:tblGrid>`;
  const trs = rows.map((row, r) => {
    const header = el.headerRow && r === 0;
    const tcs = row.map(cell => {
      const runs = parseInline(String(cell ?? ""));
      const body = runs.length ? runs.map(run => runXml(run.text, { bold: run.bold || header, italic: run.italic, underline: run.underline, strike: run.strike, color: run.color }, 1400, null)).join("") : `<a:endParaRPr lang="ko-KR" sz="1400" dirty="0"/>`;
      return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>${body}</a:p></a:txBody><a:tcPr anchor="ctr"/></a:tc>`;
    }).join("");
    return `<a:tr h="${rowH}">${tcs}</a:tr>`;
  }).join("");
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${pctToEmuX(el.x)}" y="${pctToEmuY(el.y)}"/><a:ext cx="${pctToEmuX(el.w)}" cy="${pctToEmuY(el.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr>${grid}${trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

/** 이미지·차트(래스터 PNG) 요소 → <p:pic> + 이 슬라이드의 관계(rels)에 추가할 항목 */
function picXml(el, rId) {
  const id = nextShapeId();
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrmXml(el)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

/**
 * 슬라이드 하나의 XML + 이 슬라이드가 필요로 하는 이미지 목록(레이아웃 관계·미디어 파트는 package.js 가 처리)
 * @param {{elements: object[]}} entry state.deckOverrides.bySlide[slideId] 형태
 * @param {(el:object) => Promise<{png:Uint8Array}>} rasterize 차트(SVG) → PNG 콜백(js/charts/rasterize.js 의 svgToPng 를 호출측이 연결)
 */
export async function buildSlideXml(entry, { fontName, rasterizeChart } = {}) {
  shapeSeq = 1;
  const elements = [...(entry?.elements || [])].sort((a, b) => (a.z || 1) - (b.z || 1));
  const images = []; // { relId, bytes, ext }
  const parts = [];
  let relSeq = 1; // rId1 은 레이아웃 관계로 예약
  for (const el of elements) {
    if (el.kind === "image" || el.kind === "chart") {
      let bytes;
      if (el.kind === "image") {
        const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(el.src || "");
        if (!m) continue; // 알 수 없는 이미지 형식은 건너뜀(깨진 슬라이드보다 낫음)
        bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
        var ext = m[1] === "jpeg" ? "jpeg" : "png";
      } else {
        const r = await rasterizeChart(el);
        if (!r) continue;
        bytes = r.png;
        ext = "png";
      }
      relSeq += 1;
      const relId = `rId${relSeq}`;
      images.push({ relId, bytes, ext });
      parts.push(picXml(el, relId));
    } else if (el.kind === "table") {
      parts.push(tableXml(el));
    } else {
      parts.push(spXml(el, { fontName }));
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${parts.join("")}</p:spTree></p:cSld></p:sld>`;
  return { xml, images };
}

export function slideRelsXml(images) {
  const rels = [`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`,
    ...images.map(img => `<Relationship Id="${img.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${img.mediaName}"/>`)];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`;
}

export function presentationXml(slideCount) {
  const ids = Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rIdSlide${i + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster1"/></p:sldMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="${SLIDE_W_EMU}" cy="${SLIDE_H_EMU}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

export function presentationRelsXml(slideCount) {
  const slideRels = Array.from({ length: slideCount }, (_, i) => `<Relationship Id="rIdSlide${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRels}</Relationships>`;
}

export function contentTypesXml(slideCount, head, tail) {
  const overrides = Array.from({ length: slideCount }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  return `${head}${overrides}${tail}`;
}

export function corePropsXml({ title, creator, iso }) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escText(title)}</dc:title><dc:creator>${escText(creator)}</dc:creator><cp:lastModifiedBy>${escText(creator)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
}

export function appPropsXml({ slideCount }) {
  const titles = [`<vt:lpstr>Survey</vt:lpstr>`, ...Array.from({ length: slideCount }, (_, i) => `<vt:lpstr>Slide ${i + 1}</vt:lpstr>`)].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>설문 분석 · 결과 평가</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slideCount}</Slides><TitlesOfParts><vt:vector size="${slideCount + 1}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>`;
}
