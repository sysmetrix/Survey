// PPTX 슬라이드 XML 생성 — HWPX 작성기(js/report/hwpx/writer.js)와 같은 손글씨 문자열 템플릿 방식.
// 요소(state.deckOverrides 의 elements[])를 그대로 <p:sp>(텍스트·도형)·<p:cxnSp>(선·화살표)·<p:pic>(이미지·차트 래스터)·
// <p:graphicFrame>(표)로 옮김. 화면(js/present/edit/render-custom.js)과 같은 요소 필드를 읽음 — 새 필드는 모두 선택 사항.
import { escText, escAttr } from "./xml.js";
import { pctToEmuX, pctToEmuY, cqwToHundredthPt, degToRot60000, SLIDE_W_EMU, SLIDE_H_EMU } from "./emu.js";
import { parseInline } from "../inline-marks.js";
import { cleanFontName } from "../hwpx/fonts.js";

const ALIGN = { left: "l", center: "ctr", right: "r" };
const VALIGN = { top: "t", middle: "ctr", bottom: "b" };
const PX_EMU = 12700; // 화면의 굵기·모서리 px 은 슬라이드 960pt 폭 기준 1px = 1pt = 12700 EMU
const SHAPE_PRST = { rect: "rect", roundRect: "roundRect", ellipse: "ellipse", triangle: "triangle" };
const DEFAULT_LINE_WIDTH = 2, DEFAULT_ROUND_RADIUS = 12, DEFAULT_TABLE_FONT = 1.35; // render-custom.js 와 같은 값
const TEXT_INSET_PCT = 0.6; // 배경색·테두리가 있는 글상자 안쪽 여백(슬라이드 폭의 %, render-custom.js 의 0.6cqw)
const BASE_LINE_HEIGHT = { text: 1.3, richtext: 1.35 }; // 화면 기본 줄간격 — lnSpc 100% 로 대응시키는 기준

const numOr = (v, fallback = null) => { if (v === "" || v == null || typeof v === "boolean") return fallback; const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const NAMED_COLORS = { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00", orange: "FFA500", gray: "808080", grey: "808080" };
/** css 색 → {hex, alpha}. #rgb·#rrggbb·rgb()/rgba()·기본 색 이름만 읽고, 그 밖(빈 값·transparent·해석 불가)은 null — 잘못된 색값이 XML 에 들어가 파워포인트가 "복구"하는 일을 막음 */
export function parseColor(c) {
  const s = String(c ?? "").trim().toLowerCase();
  let m;
  if ((m = /^#([0-9a-f]{6})$/.exec(s))) return { hex: m[1].toUpperCase(), alpha: 1 };
  if ((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s))) return { hex: `${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toUpperCase(), alpha: 1 };
  if ((m = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d*\.?\d+)(%?))?\s*\)$/.exec(s))) {
    const h = v => clamp(Math.round(Number(v)), 0, 255).toString(16).padStart(2, "0");
    const a = m[4] == null ? 1 : clamp(Number(m[4]) / (m[5] ? 100 : 1), 0, 1);
    return { hex: `${h(m[1])}${h(m[2])}${h(m[3])}`.toUpperCase(), alpha: a };
  }
  return NAMED_COLORS[s] ? { hex: NAMED_COLORS[s], alpha: 1 } : null;
}
const alphaXml = a => (a < 1 ? `<a:alpha val="${Math.round(clamp(a, 0, 1) * 100000)}"/>` : "");
/** css 색(+요소 투명도) → <a:srgbClr>. 색을 못 읽으면 "" */
function clrXml(c, opacity = 1) {
  const p = parseColor(c);
  if (!p) return "";
  const a = p.alpha * clamp(numOr(opacity, 1), 0, 1);
  return a < 1 ? `<a:srgbClr val="${p.hex}">${alphaXml(a)}</a:srgbClr>` : `<a:srgbClr val="${p.hex}"/>`;
}
const solidFillXml = (c, opacity = 1) => { const x = clrXml(c, opacity); return x ? `<a:solidFill>${x}</a:solidFill>` : ""; };
const lnXml = (widthPx, color, opacity = 1, extra = "") => {
  const fill = widthPx > 0 ? solidFillXml(color, opacity) : "";
  return fill ? `<a:ln w="${Math.round(widthPx * PX_EMU)}">${fill}${extra}</a:ln>` : "<a:ln><a:noFill/></a:ln>";
};
const opacityOf = el => clamp(numOr(el.opacity, 1), 0, 1);

/** 요소별 글꼴 — '기본'·빈 값은 설정에서 고른 발표 글꼴(fallback) */
function elementFont(el, fallback) {
  const n = cleanFontName(el.fontFamily);
  return n && n !== "기본" ? n : fallback || null;
}

function runXml(text, marks, sz, fontName, opacity = 1) {
  const attrs = [`lang="ko-KR"`, `dirty="0"`, `sz="${sz}"`];
  if (marks.bold) attrs.push('b="1"');
  if (marks.italic) attrs.push('i="1"');
  if (marks.underline) attrs.push('u="sng"');
  if (marks.strike) attrs.push('strike="sngStrike"');
  let fill = marks.color ? solidFillXml(marks.color, opacity) : "";
  // 색을 따로 안 정한 글자도 투명도는 적용 — 기본 글자색(tx1)에 알파를 얹음
  if (!fill && opacity < 1) fill = `<a:solidFill><a:schemeClr val="tx1">${alphaXml(opacity)}</a:schemeClr></a:solidFill>`;
  const font = fontName ? `<a:latin typeface="${escAttr(fontName)}"/><a:ea typeface="${escAttr(fontName)}"/><a:cs typeface="${escAttr(fontName)}"/>` : "";
  return `<a:r><a:rPr ${attrs.join(" ")}>${fill}${font}</a:rPr><a:t>${escText(text)}</a:t></a:r>`;
}

const BULLET_PPR = `<a:buFont typeface="Arial"/><a:buChar char="•"/>`;

/** 한 문단(줄) → <a:p> — 보고서와 같은 표식 문자열의 굵게·색 등을 <a:r> 런으로 옮김. 요소 전체 서식(기울임·밑줄·취소선·줄간격·투명도)도 여기서 적용 */
function lineParagraphXml(line, { sz, algn, weight, color, fontName, bullet, italic, underline, strike, lnSpcPct, spcAft, opacity = 1 }) {
  const runs = parseInline(line);
  const body = runs.length
    ? runs.map(r => runXml(r.text, { bold: r.bold || weight === "bold", italic: r.italic || italic, underline: r.underline || underline, strike: r.strike || strike, color: r.color || color }, sz, fontName, opacity)).join("")
    : `<a:endParaRPr lang="ko-KR" sz="${sz}" dirty="0"/>`;
  const spacing = (lnSpcPct ? `<a:lnSpc><a:spcPct val="${lnSpcPct * 1000}"/></a:lnSpc>` : "") + (spcAft ? `<a:spcAft><a:spcPts val="${spcAft}"/></a:spcAft>` : "");
  const pPr = bullet ? `<a:pPr algn="${algn}" marL="228600" indent="-228600">${spacing}${BULLET_PPR}</a:pPr>` : `<a:pPr algn="${algn}">${spacing}<a:buNone/></a:pPr>`;
  return `<a:p>${pPr}${body}</a:p>`;
}

/** 텍스트·richtext 요소 공통 글자 서식 → lineParagraphXml 옵션 */
function textOpts(el, fontName) {
  const rich = el.kind === "richtext";
  const sz = cqwToHundredthPt(numOr(el.fontSize) || (rich ? 1.4 : 1.8));
  const lh = numOr(el.lineHeight);
  const base = BASE_LINE_HEIGHT[rich ? "richtext" : "text"];
  return {
    sz, algn: ALIGN[el.align] || "l", weight: el.weight, color: el.color || null, fontName: elementFont(el, fontName),
    italic: !!el.italic, underline: !!el.underline, strike: !!el.strike,
    lnSpcPct: lh != null && lh >= 0.8 && lh <= 4 ? Math.round((lh / base) * 100) : 0,
    opacity: opacityOf(el),
  };
}

/** 텍스트 요소 하나 → <a:p> 문단들(줄바꿈마다 한 문단) */
function paragraphsXml(el, fontName) {
  const o = textOpts(el, fontName);
  return String(el.markup ?? "").split("\n").map(line => lineParagraphXml(line, { ...o, bullet: false })).join("");
}

/** richtext 요소(문단·글머리 블록 배열) → <a:p> 문단들 — 블록 하나가 줄바꿈을 담고 있으면 같은 종류로 이어서 나눔. 문단 아래 간격은 화면(.5em)과 같게 */
function richtextParagraphsXml(el, fontName) {
  const o = textOpts(el, fontName);
  const spcAft = Math.round(o.sz / 2);
  return (el.blocks || []).flatMap(b => String(b.text ?? "").split("\n").map(line => lineParagraphXml(line, { ...o, bullet: b.type === "bullet", spcAft }))).join("");
}

/** 위치·크기(EMU). box 로 화면 상자 대신 다른 사각형(이미지 contain·선의 가운데 줄)을 줄 수 있음 — 회전 중심은 상자 중심이라 중심이 같으면 회전 결과도 같음 */
function xfrmXml(el, box) {
  const rot = degToRot60000(el.rot);
  const b = box || { x: pctToEmuX(el.x), y: pctToEmuY(el.y), cx: Math.max(1, pctToEmuX(el.w)), cy: Math.max(1, pctToEmuY(el.h)) };
  return `<a:xfrm${rot ? ` rot="${rot}"` : ""}><a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.cx}" cy="${b.cy}"/></a:xfrm>`;
}

/** 도형 종류 → <a:prstGeom>. roundRect 의 모서리(px)는 짧은 변 대비 비율(adj, 최대 50000)로 바꿈 */
function geomXml(prst, radiusPx, cx, cy) {
  if (prst !== "roundRect") return `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>`;
  const adj = clamp(Math.round(((radiusPx * PX_EMU) / Math.max(1, Math.min(cx, cy))) * 100000), 0, 50000);
  return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
}

let shapeSeq = 1;
const nextShapeId = () => ++shapeSeq;

const TEXTUAL_KINDS = new Set(["text", "richtext"]);

/** 선·화살표 → <p:cxnSp>. 화면처럼 상자 세로 가운데를 가로지르게 높이 0 상자로 그림(시작 y 를 절반만큼 내리므로 회전 중심은 그대로) */
function lineXml(el, arrow) {
  const id = nextShapeId();
  const w = Math.max(0, numOr(el.strokeWidth, 0)) || DEFAULT_LINE_WIDTH;
  const color = clrXml(el.stroke, 1) ? el.stroke : clrXml(el.fill, 1) ? el.fill : "#000000";
  const box = { x: pctToEmuX(el.x), y: Math.round(pctToEmuY(el.y) + pctToEmuY(el.h) / 2), cx: Math.max(1, pctToEmuX(el.w)), cy: 0 };
  const ln = lnXml(w, color, opacityOf(el), arrow ? `<a:tailEnd type="triangle" w="med" len="med"/>` : "");
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${arrow ? "Arrow" : "Line"} ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrmXml(el, box)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${ln}</p:spPr></p:cxnSp>`;
}

/** 텍스트·richtext·도형 요소 → <p:sp>(선·화살표는 <p:cxnSp>) */
function spXml(el, opts) {
  const isShape = el.kind === "shape";
  const type = isShape ? (el.shapeType === "line" || el.shapeType === "arrow" ? el.shapeType : Object.hasOwn(SHAPE_PRST, el.shapeType) ? el.shapeType : "rect") : "rect";
  if (type === "line" || type === "arrow") return lineXml(el, type === "arrow");
  const id = nextShapeId();
  const isTextual = TEXTUAL_KINDS.has(el.kind);
  const opacity = opacityOf(el);
  const cx = Math.max(1, pctToEmuX(el.w)), cy = Math.max(1, pctToEmuY(el.h));
  let fill, line, prst = SHAPE_PRST[type], radius;
  if (isShape) {
    fill = solidFillXml(el.fill, opacity) || `<a:noFill/>`;
    line = lnXml(Math.max(0, numOr(el.strokeWidth, 0)), el.stroke || "#000000", opacity);
    radius = numOr(el.radius, DEFAULT_ROUND_RADIUS);
  } else {
    fill = solidFillXml(el.fill, opacity) || `<a:noFill/>`;
    const bw = Math.max(0, numOr(el.borderWidth, 0));
    line = lnXml(bw, el.borderColor || el.color || "#000000", opacity);
    radius = Math.max(0, numOr(el.radius, 0));
    if (radius > 0 && (clrXml(el.fill) || bw > 0)) prst = "roundRect"; // 모서리가 눈에 보이는 배경·테두리가 있을 때만
  }
  const styled = isTextual && (clrXml(el.fill) || numOr(el.borderWidth, 0) > 0);
  const inset = styled ? pctToEmuX(TEXT_INSET_PCT) : 0;
  const anchor = VALIGN[el.valign] || "t";
  const paragraphs = isTextual ? (el.kind === "richtext" ? richtextParagraphsXml(el, opts?.fontName) : paragraphsXml(el, opts?.fontName)) : "";
  const body = isTextual
    ? `<p:txBody><a:bodyPr wrap="square" lIns="${inset}" tIns="${inset}" rIns="${inset}" bIns="${inset}" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody>`
    : `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${isTextual ? "TextBox" : "Shape"} ${id}"/><p:cNvSpPr${isTextual ? ' txBox="1"' : ""}/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(el)}${geomXml(prst, radius, cx, cy)}${fill}${line}</p:spPr>${body}</p:sp>`;
}

/** 표 요소 → <p:graphicFrame><a:tbl> (회전은 표에 적용하지 않음 — OOXML 표 프레임은 회전을 지원하지 않음) */
function tableXml(el) {
  const id = nextShapeId();
  const rows = el.rows || [];
  const nCols = rows[0]?.length || 1;
  const colW = Math.max(1, Math.floor(pctToEmuX(el.w) / nCols));
  const rowH = Math.max(1, Math.floor(pctToEmuY(el.h) / Math.max(1, rows.length)));
  const sz = cqwToHundredthPt(numOr(el.fontSize) || DEFAULT_TABLE_FONT);
  const grid = `<a:tblGrid>${Array.from({ length: nCols }, () => `<a:gridCol w="${colW}"/>`).join("")}</a:tblGrid>`;
  const trs = rows.map((row, r) => {
    const header = el.headerRow && r === 0;
    const tcs = row.map(cell => {
      const runs = parseInline(String(cell ?? ""));
      const body = runs.length ? runs.map(run => runXml(run.text, { bold: run.bold || header, italic: run.italic, underline: run.underline, strike: run.strike, color: run.color }, sz, null)).join("") : `<a:endParaRPr lang="ko-KR" sz="${sz}" dirty="0"/>`;
      return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>${body}</a:p></a:txBody><a:tcPr anchor="ctr"/></a:tc>`;
    }).join("");
    return `<a:tr h="${rowH}">${tcs}</a:tr>`;
  }).join("");
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${pctToEmuX(el.x)}" y="${pctToEmuY(el.y)}"/><a:ext cx="${pctToEmuX(el.w)}" cy="${pctToEmuY(el.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr>${grid}${trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

/** PNG(IHDR)·JPEG(SOFn) 헤더에서 원본 가로·세로 픽셀 — 읽을 수 없으면 null */
export function imageSize(bytes) {
  const b = bytes;
  if (!b || b.length < 24) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
    return w && h ? { w, h } : null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = (b[i + 5] << 8) | b[i + 6], w = (b[i + 7] << 8) | b[i + 8];
        return w && h ? { w, h } : null;
      }
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}

/** 이미지·차트(래스터 PNG) 요소 → <p:pic> + 이 슬라이드의 관계(rels)에 추가할 항목.
 *  이미지: 불투명도(alphaModFix)·모서리(roundRect)·채우기 방식 — cover 는 원본 비율로 넘치는 부분을 잘라냄(srcRect), contain 은 상자 안에 비율 유지로 가운데 배치.
 *  원본 크기를 읽지 못하면 상자에 늘려 맞춤 */
function picXml(el, rId, dims) {
  const id = nextShapeId();
  const isImage = el.kind === "image";
  const box = { x: pctToEmuX(el.x), y: pctToEmuY(el.y), cx: Math.max(1, pctToEmuX(el.w)), cy: Math.max(1, pctToEmuY(el.h)) };
  let srcRect = "";
  if (isImage && dims) {
    const boxAspect = box.cx / box.cy, imgAspect = dims.w / dims.h;
    if (el.fit === "contain") {
      if (imgAspect > boxAspect) { const cy = Math.max(1, Math.round(box.cx / imgAspect)); box.y += Math.round((box.cy - cy) / 2); box.cy = cy; }
      else { const cx = Math.max(1, Math.round(box.cy * imgAspect)); box.x += Math.round((box.cx - cx) / 2); box.cx = cx; }
    } else if (el.fit !== "fill") { // 기본(cover)
      const per = v => Math.max(0, Math.round(v * 100000));
      if (imgAspect > boxAspect) { const side = per((1 - boxAspect / imgAspect) / 2); if (side) srcRect = `<a:srcRect l="${side}" r="${side}"/>`; }
      else { const side = per((1 - imgAspect / boxAspect) / 2); if (side) srcRect = `<a:srcRect t="${side}" b="${side}"/>`; }
    }
  }
  const opacity = isImage ? opacityOf(el) : 1;
  const blip = opacity < 1 ? `<a:blip r:embed="${rId}"><a:alphaModFix amt="${Math.round(opacity * 100000)}"/></a:blip>` : `<a:blip r:embed="${rId}"/>`;
  const radius = isImage ? Math.max(0, numOr(el.radius, 0)) : 0;
  const geom = geomXml(radius > 0 ? "roundRect" : "rect", radius, box.cx, box.cy);
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill>${blip}${srcRect}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrmXml(el, box)}${geom}</p:spPr></p:pic>`;
}

/** 슬라이드 배경색(<p:bg>) — 색을 읽을 수 없으면 생략(기본 배경) */
function bgXml(bg) {
  const fill = solidFillXml(bg);
  return fill ? `<p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>` : "";
}

/**
 * 슬라이드 하나의 XML + 이 슬라이드가 필요로 하는 이미지 목록(레이아웃 관계·미디어 파트는 package.js 가 처리)
 * @param {{elements: object[], bg?: string}} entry state.deckOverrides.bySlide[slideId] 형태 + 슬라이드 배경색(bg, css 색)
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
      parts.push(picXml(el, relId, el.kind === "image" ? imageSize(bytes) : null));
    } else if (el.kind === "table") {
      parts.push(tableXml(el));
    } else {
      parts.push(spXml(el, { fontName }));
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>${bgXml(entry?.bg)}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${parts.join("")}</p:spTree></p:cSld></p:sld>`;
  return { xml, images };
}

/** @param {{relId:string, mediaName:string}[]} images @param {number} [notesSlideNo] 이 슬라이드에 발표자 노트가 있으면 그 notesSlide 번호(ppt/notesSlides/notesSlide{N}.xml) */
export function slideRelsXml(images, notesSlideNo) {
  const rels = [`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`,
    ...images.map(img => `<Relationship Id="${img.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${img.mediaName}"/>`),
    ...(notesSlideNo ? [`<Relationship Id="rIdNotes1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${notesSlideNo}.xml"/>`] : [])];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`;
}

/** @param {number} slideCount @param {boolean} [hasNotes] 발표자 노트가 있으면 notesMasterIdLst 를 sldMasterIdLst 바로 뒤(스키마 순서)에 넣음 */
export function presentationXml(slideCount, hasNotes = false) {
  const ids = Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rIdSlide${i + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster1"/></p:sldMasterIdLst>${hasNotes ? '<p:notesMasterIdLst><p:notesMasterId r:id="rIdNotesMaster1"/></p:notesMasterIdLst>' : ""}<p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="${SLIDE_W_EMU}" cy="${SLIDE_H_EMU}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

export function presentationRelsXml(slideCount, hasNotes = false) {
  const slideRels = Array.from({ length: slideCount }, (_, i) => `<Relationship Id="rIdSlide${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${hasNotes ? '<Relationship Id="rIdNotesMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>' : ""}${slideRels}</Relationships>`;
}

/** @param {number[]} [notesSlideNos] 발표자 노트가 있는 슬라이드 번호(1부터) — 하나라도 있으면 notesMaster·theme2 도 등록 */
export function contentTypesXml(slideCount, head, tail, notesSlideNos = []) {
  const overrides = Array.from({ length: slideCount }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  const notes = notesSlideNos.length
    ? '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
      + notesSlideNos.map(n => `<Override PartName="/ppt/notesSlides/notesSlide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`).join("")
    : "";
  return `${head}${overrides}${notes}${tail}`;
}

export function corePropsXml({ title, creator, iso }) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escText(title)}</dc:title><dc:creator>${escText(creator)}</dc:creator><cp:lastModifiedBy>${escText(creator)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
}

export function appPropsXml({ slideCount }) {
  const titles = [`<vt:lpstr>Survey</vt:lpstr>`, ...Array.from({ length: slideCount }, (_, i) => `<vt:lpstr>Slide ${i + 1}</vt:lpstr>`)].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>설문 분석 · 결과 평가</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slideCount}</Slides><TitlesOfParts><vt:vector size="${slideCount + 1}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>`;
}

/** 슬라이드 항목의 발표자 노트 → 줄 배열. 줄바꿈이 든 항목도 줄로 나누고, 내용이 있는 줄이 하나도 없으면 [](노트 없음) */
export function notesLinesOf(entry) {
  const raw = Array.isArray(entry?.notes) ? entry.notes : typeof entry?.notes === "string" ? [entry.notes] : [];
  const lines = raw.filter(n => typeof n === "string").flatMap(n => n.split(/\r\n|\r|\n/));
  return lines.some(l => l.trim()) ? lines : [];
}

/** 발표자 노트 슬라이드(ppt/notesSlides/notesSlideN.xml) — 슬라이드 그림 자리 + 본문 자리(한 줄 = 한 문단, 빈 줄은 빈 문단) */
export function notesSlideXml(lines) {
  const paras = lines.map(l => (l.trim() ? `<a:p><a:r><a:rPr lang="ko-KR" dirty="0"/><a:t>${escText(l)}</a:t></a:r></a:p>` : `<a:p><a:endParaRPr lang="ko-KR" dirty="0"/></a:p>`)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

/** notesSlideN 의 관계 — 노트 마스터 + 짝이 되는 슬라이드(양방향: 슬라이드 쪽은 slideRelsXml 이 notesSlide 관계를 가짐) */
export function notesSlideRelsXml(slideNo) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${slideNo}.xml"/></Relationships>`;
}
