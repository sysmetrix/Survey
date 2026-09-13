// HWPX 문서 작성기 (순수 모듈 — DOM 비의존)
// 한글이 저장한 빈 문서의 header.xml 을 기반으로, 필요한 글자모양(charPr)·문단모양(paraPr)·
// 테두리/배경(borderFill)을 레지스트리로 추가하고 itemCnt 를 갱신한다.
// 본문 XML 패턴(hp:tbl, hp:pic, hh:bold)은 한글 2024 저장본에서 추출한 구조를 따른다.
import { escText } from "./xml.js";
import { toHwpText } from "./symbols.js";
import { resolveFonts, applyFontsToHeader } from "./fonts.js";

export const HWPUNIT_PER_MM = 7200 / 25.4;
export const mm = v => Math.round(v * HWPUNIT_PER_MM);

const HNC_UNIT_NS = "http://www.hancom.co.kr/hwpml/2016/HwpUnitChar";
// 글꼴 id 약속 (fonts.js applyFontsToHeader 와 동일)
const FONT_ID = { dotum: 0, batang: 1, bold: 2 };

// ─────────────────────────── 헤더 레지스트리 ───────────────────────────
function createRegistry(headerXml, { boldFace = false } = {}) {
  const count = tag => +headerXml.match(new RegExp(`<hh:${tag} itemCnt="(\\d+)"`))[1];
  const state = {
    borderFill: { next: count("borderFills") + 1, xml: [], map: new Map() }, // borderFill id 는 1부터
    charPr: { next: count("charProperties"), xml: [], map: new Map() },
    paraPr: { next: count("paraProperties"), xml: [], map: new Map() },
  };
  // 새 항목은 템플릿 마지막 id 다음부터 오름차순으로 붙인다 (한글은 목록의 등장 순서를 따르므로 순서 유지 필수)
  const intern = (kind, spec, build) => {
    const key = JSON.stringify(spec);
    const s = state[kind];
    if (s.map.has(key)) return s.map.get(key);
    const id = s.next++;
    s.xml.push(build(id, spec));
    s.map.set(key, id);
    return id;
  };

  const charPr = ({ font = "batang", size = 11, bold = false, color = "#000000", spacing = 0 }) =>
    intern("charPr", { font, size, bold, color, spacing }, (id, s) => {
      // 별도 Bold 글꼴(KoPub 등)이 있으면 굵게는 그 글꼴로, 없으면 <hh:bold/>
      const useBoldFace = s.bold && boldFace;
      const f = useBoldFace ? FONT_ID.bold : FONT_ID[s.font] ?? FONT_ID.batang;
      const all = v => `hangul="${v}" latin="${v}" hanja="${v}" japanese="${v}" other="${v}" symbol="${v}" user="${v}"`;
      return `<hh:charPr id="${id}" height="${Math.round(s.size * 100)}" textColor="${s.color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">` +
        `<hh:fontRef ${all(f)}/><hh:ratio ${all(100)}/><hh:spacing ${all(s.spacing)}/><hh:relSz ${all(100)}/><hh:offset ${all(0)}/>` +
        (s.bold && !useBoldFace ? "<hh:bold/>" : "") +
        `<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>`;
    });

  /** 단위: HWPUNIT (1pt = 100) */
  const paraPr = ({ align = "JUSTIFY", left = 0, intent = 0, before = 0, after = 0, line = 160, keepNext = false }) =>
    intern("paraPr", { align, left, intent, before, after, line, keepNext }, (id, s) => {
      const margin = h => `<hh:margin><hc:intent value="${Math.round(s.intent * h)}" unit="HWPUNIT"/><hc:left value="${Math.round(s.left * h)}" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="${Math.round(s.before * h)}" unit="HWPUNIT"/><hc:next value="${Math.round(s.after * h)}" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="${s.line}" unit="HWPUNIT"/>`;
      return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR">` +
        `<hh:align horizontal="${s.align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>` +
        `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="${s.keepNext ? 1 : 0}" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
        `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` +
        `<hp:switch><hp:case hp:required-namespace="${HNC_UNIT_NS}">${margin(0.5)}</hp:case><hp:default>${margin(1)}</hp:default></hp:switch>` +
        `<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`;
    });

  /** 테두리: sides 각 {type:'SOLID'|'NONE', width:'0.12 mm', color} , fill: '#RRGGBB'|null */
  const borderFill = ({ left, right, top, bottom, fill = null }) =>
    intern("borderFill", { left, right, top, bottom, fill }, (id, s) => {
      const side = (tag, b) => `<hh:${tag} type="${b.type}" width="${b.width}" color="${b.color}"/>`;
      return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
        `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
        side("leftBorder", s.left) + side("rightBorder", s.right) + side("topBorder", s.top) + side("bottomBorder", s.bottom) +
        `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>` +
        (s.fill ? `<hc:fillBrush><hc:winBrush faceColor="${s.fill}" hatchColor="#999999" alpha="0"/></hc:fillBrush>` : "") +
        `</hh:borderFill>`;
    });

  const buildHeader = baseHeader => {
    let h = baseHeader;
    const inject = (listTag, s) => {
      if (!s.xml.length) return;
      h = h.replace(new RegExp(`<hh:${listTag} itemCnt="\\d+"`), `<hh:${listTag} itemCnt="${(listTag === "borderFills" ? s.next - 1 : s.next)}"`);
      h = h.replace(`</hh:${listTag}>`, s.xml.join("") + `</hh:${listTag}>`);
    };
    inject("borderFills", state.borderFill);
    inject("charProperties", state.charPr);
    inject("paraProperties", state.paraPr);
    return h;
  };
  return { charPr, paraPr, borderFill, buildHeader };
}

// ─────────────────────────── 보고서 서식 프리셋 ───────────────────────────
const LINE = (width = "0.12 mm", color = "#000000") => ({ type: "SOLID", width, color });
const NOLINE = { type: "NONE", width: "0.1 mm", color: "#000000" };

export const SHADES = {
  header: "#D9D9D9", sub: "#F2F2F2", total: "#EDEDED", box: "#F2F2F2",
  good: "#DDEBF7", mid: "#FFFFFF", bad: "#FCE4D6",
  heat1: "#F8CBAD", heat2: "#FCE4D6", heat3: "#FFFFFF", heat4: "#DDEBF7", heat5: "#BDD7EE",
};

const BULLET_SYMBOL = { 1: "□", 2: "○", 3: "-", 4: "·" };

/** 굵게 마크업: **텍스트** (앞뒤 공백 없음, 인접 별표 없음) */
export const BOLD_SPLIT = /((?<!\*)\*\*(?![\s*])[^*]*?[^\s*]\*\*(?!\*)|(?<!\*)\*\*[^\s*]\*\*(?!\*))/g;
export const BOLD_WHOLE = /^\*\*[^\s*]([^*]*[^\s*])?\*\*$/;
export const stripBold = t => String(t ?? "").split(BOLD_SPLIT).map(s => (BOLD_WHOLE.test(s) ? s.slice(2, -2) : s)).join("");

// ─────────────────────────── 문서 작성기 ───────────────────────────
/**
 * @param {object} o
 * @param {object} o.parts   template-parts.js 의 TEMPLATE_PARTS
 * @param {string} o.title   문서 제목(메타데이터)
 * @param {object} [o.margins] mm 단위 {left,right,top,bottom,header,footer}
 * @param {number} [o.baseSize] 본문 글자 크기(pt)
 * @param {number} [o.lineSpacing] 본문 줄 간격(%)
 * @param {object} [o.fontSettings] {fontPreset, fontBody, fontHeading} — fonts.js resolveFonts
 */
export function createHwpxDoc({ parts, title = "", creator = "", margins = {}, baseSize = 11, lineSpacing = 160, fontSettings = {}, pageNumber = true } = {}) {
  const M = { left: 20, right: 20, top: 15, bottom: 15, header: 10, footer: 10, ...margins };
  if (parts.FONTS && (parts.FONTS.dotum !== FONT_ID.dotum || parts.FONTS.batang !== FONT_ID.batang)) throw new Error("템플릿 글꼴 순서가 예상과 다릅니다(0=돋움, 1=바탕)");
  const fonts = resolveFonts(fontSettings);
  const reg = createRegistry(parts.HEADER_XML, { boldFace: !!fonts.boldFace });
  const pageW = +parts.SEC_PR.match(/<hp:pagePr[^>]*\bwidth="(\d+)"/)[1];
  const bodyWidth = pageW - mm(M.left) - mm(M.right);
  const B = baseSize;
  const LS = Math.max(100, Math.min(250, Math.round(lineSpacing)));

  const paras = [];          // 본문 문단 XML
  const images = [];         // {id, path, data}
  const preview = [];        // 미리보기 텍스트
  let objId = 1900000000;
  let pendingPageBreak = false;
  let emojiReplaced = 0;

  const cp = spec => reg.charPr(spec);
  const pp = spec => reg.paraPr(spec);
  /** HWPX 로 쓰는 모든 글자: 이모지 → 한글 지원 기호 */
  const hwpText = t => {
    const s = String(t ?? "");
    const r = toHwpText(s);
    if (r !== s) emojiReplaced++;
    return r;
  };

  /** "**굵게**" 마크업 → run 배열 (별표 연속 "***"·"** p" 는 굵게로 해석하지 않음) */
  const runs = (text, charSpec) => {
    const parts2 = hwpText(text).split(BOLD_SPLIT).filter(s => s !== "");
    if (!parts2.length) return `<hp:run charPrIDRef="${cp(charSpec)}"/>`;
    return parts2.map(seg => {
      const bold = BOLD_WHOLE.test(seg);
      const t = bold ? seg.slice(2, -2) : seg;
      return `<hp:run charPrIDRef="${cp({ ...charSpec, bold: charSpec.bold || bold })}"><hp:t>${escText(t)}</hp:t></hp:run>`;
    }).join("");
  };
  const stripMarks = t => stripBold(hwpText(t));

  const pOpen = paraId => {
    const pb = pendingPageBreak ? 1 : 0;
    pendingPageBreak = false;
    return `<hp:p id="0" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="${pb}" columnBreak="0" merged="0">`;
  };

  const addPara = (text, charSpec, paraSpec) => {
    paras.push(pOpen(pp(paraSpec)) + runs(text, charSpec) + `</hp:p>`);
    preview.push(stripMarks(text));
  };

  const api = {
    bodyWidth,
    bodyWidthMm: bodyWidth / HWPUNIT_PER_MM,
    fonts,
    get emojiReplaced() { return emojiReplaced; },

    /** 보고서 제목 */
    title(text, subtitle) {
      const len = [...String(text)].length;
      addPara(text, { font: "dotum", size: len > 34 ? B + 3 : len > 26 ? B + 5 : B + 7, bold: true }, { align: "CENTER", after: 400, line: 150 });
      if (subtitle) addPara(subtitle, { font: "batang", size: B - 1, color: "#404040" }, { align: "CENTER", after: 900, line: 150 });
      return api;
    },
    /** level 1: 장 제목 (예: "Ⅰ. 사업 개요"), level 2: 절 제목 (예: "1. 추진 배경") */
    heading(level, text) {
      if (level <= 1) addPara(text, { font: "dotum", size: B + 4, bold: true }, { align: "LEFT", before: 1400, after: 500, line: 150, keepNext: true });
      else addPara(text, { font: "dotum", size: B + 2, bold: true }, { align: "LEFT", before: 900, after: 300, line: 150, keepNext: true });
      return api;
    },
    /** 개조식 항목: level 1 □, 2 ○, 3 -, 4 · */
    bullet(level, text) {
      const lv = Math.min(4, Math.max(1, level));
      const size = lv === 1 ? B + 1 : B;
      const symbolW = Math.round(size * 100 * (lv >= 3 ? 1.1 : 1.6));
      const left = [0, 0, 1100, 2400, 3500][lv];
      addPara(`${BULLET_SYMBOL[lv]} ${text}`, { font: "batang", size, bold: false }, { align: "JUSTIFY", left: left + symbolW, intent: -symbolW, before: lv === 1 ? 500 : 150, after: 100, line: LS });
      return api;
    },
    paragraph(text, { size = B, align = "JUSTIFY", color = "#000000", bold = false, before = 100, after = 100, font = "batang" } = {}) {
      addPara(text, { font, size, bold, color }, { align, before, after, line: LS });
      return api;
    },
    /** 표/그림 제목, 단위, 주석, 출처 */
    caption(text, { align = "CENTER", before = 500, after = 150, keepNext = true } = {}) {
      addPara(text, { font: "dotum", size: B - 1, bold: true }, { align, before, after, line: 140, keepNext });
      return api;
    },
    note(text, { align = "LEFT", before = 60, after = 60, keepNext = false } = {}) {
      addPara(text, { font: "batang", size: B - 2, color: "#404040" }, { align, before, after, line: 140, keepNext });
      return api;
    },
    pageBreak() { pendingPageBreak = true; return api; },
    blank(size = B) { addPara("", { font: "batang", size }, { line: 100 }); return api; },

    /**
     * 표 — 여러 쪽 지원: 글자처럼 취급하지 않고(treatAsChar=0) 쪽 경계에서 나누며(pageBreak=TABLE),
     * 제목 줄은 쪽마다 반복(repeatHeader=1)
     * @param {object} spec
     * @param {{weight:number, align?:'LEFT'|'CENTER'|'RIGHT'}[]} spec.columns
     * @param {Array<Array<string|{text, colSpan?, rowSpan?, shade?, bold?, align?}>>} spec.rows  (머리행 포함)
     * @param {number} [spec.headerRows=1]
     * @param {number} [spec.fontSize]
     * @param {number} [spec.widthMm]  미지정 시 본문 폭
     */
    table({ columns, rows, headerRows = 1, fontSize = B - 2, widthMm = null, align = "CENTER" }) {
      const nCols = columns.length, nRows = rows.length;
      if (!nCols || !nRows) return api;
      const totalW = widthMm ? Math.min(bodyWidth, mm(widthMm)) : bodyWidth;
      const wsum = columns.reduce((s, c) => s + (c.weight || 1), 0);
      const colW = columns.map(c => Math.floor(totalW * (c.weight || 1) / wsum));
      colW[nCols - 1] += totalW - colW.reduce((s, v) => s + v, 0);

      // 병합 격자 배치
      const occ = Array.from({ length: nRows }, () => new Array(nCols).fill(false));
      const placed = [];
      rows.forEach((row, r) => {
        let c = 0;
        row.forEach(cell => {
          const cellObj = typeof cell === "object" && cell !== null ? cell : { text: cell };
          while (c < nCols && occ[r][c]) c++;
          if (c >= nCols) throw new Error(`표 ${r + 1}행: 열 수 초과`);
          const cs = cellObj.colSpan || 1, rs = cellObj.rowSpan || 1;
          if (c + cs > nCols || r + rs > nRows) throw new Error(`표 ${r + 1}행: 병합 범위 초과`);
          for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) {
            if (occ[i][j]) throw new Error(`표 ${i + 1}행 ${j + 1}열: 병합 겹침`);
            occ[i][j] = true;
          }
          placed.push({ r, c, cs, rs, cell: cellObj });
          c += cs;
        });
      });
      occ.forEach((row, r) => row.forEach((v, c) => { if (!v) throw new Error(`표 ${r + 1}행 ${c + 1}열: 빈 칸 (셀 수 부족)`); }));

      const cellH = Math.round(fontSize * 100 * 1.6 + 282);
      const trs = Array.from({ length: nRows }, () => []);
      placed.forEach(({ r, c, cs, rs, cell }) => {
        const isHeader = r < headerRows;
        const shade = cell.shade || (isHeader ? "header" : null);
        const fill = shade ? (SHADES[shade] || shade) : null;
        const topLine = r === 0 ? LINE("0.4 mm") : isHeader || r === headerRows ? LINE("0.12 mm") : LINE("0.12 mm", "#808080");
        const bottomLine = r + rs === nRows ? LINE("0.4 mm") : r + rs === headerRows ? LINE("0.12 mm") : LINE("0.12 mm", "#808080");
        const bf = reg.borderFill({
          left: c === 0 ? NOLINE : LINE("0.12 mm", "#808080"),
          right: c + cs === nCols ? NOLINE : LINE("0.12 mm", "#808080"),
          top: topLine, bottom: bottomLine, fill,
        });
        const w = colW.slice(c, c + cs).reduce((s, v) => s + v, 0);
        const al = cell.align || (isHeader ? "CENTER" : (columns[c].align || "CENTER"));
        const lines = String(cell.text ?? "").split("\n");
        const cellParas = lines.map(line =>
          `<hp:p id="0" paraPrIDRef="${pp({ align: al, line: 130 })}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
          runs(line, { font: "dotum", size: fontSize, bold: cell.bold ?? isHeader }) + `</hp:p>`).join("");
        trs[r].push(
          `<hp:tc name="" header="${isHeader ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">` +
          `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${cellParas}</hp:subList>` +
          `<hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="${cs}" rowSpan="${rs}"/>` +
          `<hp:cellSz width="${w}" height="${cellH * rs}"/><hp:cellMargin left="340" right="340" top="120" bottom="120"/></hp:tc>`);
        preview.push(stripMarks(cell.text));
      });
      const tblBf = reg.borderFill({ left: NOLINE, right: NOLINE, top: NOLINE, bottom: NOLINE, fill: null });
      const id = objId++;
      const tbl = `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="TABLE" repeatHeader="${headerRows > 0 ? 1 : 0}" rowCnt="${nRows}" colCnt="${nCols}" cellSpacing="0" borderFillIDRef="${tblBf}" noAdjust="0">` +
        `<hp:sz width="${totalW}" widthRelTo="ABSOLUTE" height="${cellH * nRows}" heightRelTo="ABSOLUTE" protect="0"/>` +
        `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="${align === "CENTER" ? "CENTER" : "LEFT"}" vertOffset="0" horzOffset="0"/>` +
        `<hp:outMargin left="0" right="0" top="0" bottom="${mm(1.5)}"/><hp:inMargin left="340" right="340" top="120" bottom="120"/>` +
        trs.map(cells => `<hp:tr>${cells.join("")}</hp:tr>`).join("") + `</hp:tbl>`;
      paras.push(pOpen(pp({ align: "LEFT", line: 100, before: 0, after: 0 })) + `<hp:run charPrIDRef="${cp({ font: "dotum", size: fontSize })}">${tbl}<hp:t/></hp:run></hp:p>`);
      return api;
    },

    /** 요약 상자 (1칸 음영 표) — lines: 문자열 배열 (개조식 기호 포함 가능) */
    box(lines, { shade = "box", fontSize = B } = {}) {
      const text = lines.join("\n");
      api.table({ columns: [{ weight: 1, align: "LEFT" }], rows: [[{ text, shade, bold: false, align: "LEFT" }]], headerRows: 0, fontSize });
      return api;
    },

    /**
     * 그림 (PNG) — 한 덩어리로 옮겨지도록 글자처럼 취급, 가운데 정렬
     * @param {{png: Uint8Array, wPx: number, hPx: number, widthMm?: number}} o
     */
    figure({ png, wPx, hPx, widthMm = 150 }) {
      const n = images.length + 1;
      const itemId = `image${n}`;
      images.push({ id: itemId, path: `BinData/${itemId}.png`, data: png });
      const w = Math.min(bodyWidth, mm(widthMm));
      const h = Math.round(w * hPx / wPx);
      const dimW = Math.round(wPx * 75), dimH = Math.round(hPx * 75);
      const id = objId++;
      const pic = `<hp:pic id="${id}" zOrder="${n}" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id - 1000000000}" reverse="0">` +
        `<hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/>` +
        `<hp:rotationInfo angle="0" centerX="${Math.round(w / 2)}" centerY="${Math.round(h / 2)}" rotateimage="1"/>` +
        `<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>` +
        `<hc:img binaryItemIDRef="${itemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>` +
        `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect>` +
        `<hp:imgClip left="0" right="${dimW}" top="0" bottom="${dimH}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>` +
        `<hp:imgDim dimwidth="${dimW}" dimheight="${dimH}"/><hp:effects/>` +
        `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>` +
        `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
        `<hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`;
      paras.push(pOpen(pp({ align: "CENTER", line: 100, before: 200, after: 60, keepNext: true })) + `<hp:run charPrIDRef="${cp({ font: "batang", size: B })}">${pic}<hp:t/></hp:run></hp:p>`);
      return api;
    },

    /** 패키지 항목 생성 → [{path, data, store}] */
    finish() {
      if (!paras.length) api.paragraph("");
      // 쪽 여백 설정
      const secPr = parts.SEC_PR.replace(/<hp:margin [^>]*\/>/,
        `<hp:margin header="${mm(M.header)}" footer="${mm(M.footer)}" gutter="0" left="${mm(M.left)}" right="${mm(M.right)}" top="${mm(M.top)}" bottom="${mm(M.bottom)}"/>`);
      const pageNum = pageNumber ? `<hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/></hp:ctrl>` : "";
      const secRun = `<hp:run charPrIDRef="${cp({ font: "batang", size: B })}">${secPr}${parts.COL_PR}${pageNum}</hp:run>`;
      const first = paras[0].replace(/^(<hp:p [^>]*>)/, `$1${secRun}`);
      const sectionXml = parts.SECTION_OPEN + first + paras.slice(1).join("") + `</hs:sec>`;
      const headerXml = reg.buildHeader(applyFontsToHeader(parts.HEADER_XML, fonts));

      const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      let hpf = parts.CONTENT_HPF
        .replace(/<opf:title\/>|<opf:title>[\s\S]*?<\/opf:title>/, `<opf:title>${escText(hwpText(title))}</opf:title>`)
        .replace(/(<opf:meta name="(?:creator|lastsaveby)" content="text")(?:\/>|>[\s\S]*?<\/opf:meta>)/g, `$1>${escText(hwpText(creator))}</opf:meta>`)
        .replace(/(<opf:meta name="(?:CreatedDate|ModifiedDate)" content="text")(?:\/>|>[\s\S]*?<\/opf:meta>)/g, `$1>${now}</opf:meta>`)
        .replace(/(<opf:meta name="date" content="text")(?:\/>|>[\s\S]*?<\/opf:meta>)/, `$1>${now}</opf:meta>`)
        .replace(/<opf:item id="image\d+"[^>]*\/>/g, "");
      const imgItems = images.map(im => `<opf:item id="${im.id}" href="${im.path}" media-type="image/png" isEmbeded="1"/>`).join("");
      hpf = hpf.replace(/(<opf:item id="header"[^>]*\/>)/, `$1${imgItems}`);

      const prv = preview.filter(Boolean).join("\r\n").slice(0, 1000);
      const enc = s => new TextEncoder().encode(s);
      return [
        { path: "mimetype", data: enc("application/hwp+zip"), store: true },
        { path: "version.xml", data: enc(parts.VERSION_XML) },
        { path: "Contents/header.xml", data: enc(headerXml) },
        ...images.map(im => ({ path: im.path, data: im.data, store: true })),
        { path: "Contents/section0.xml", data: enc(sectionXml) },
        { path: "Preview/PrvText.txt", data: enc(prv) },
        { path: "settings.xml", data: enc(parts.SETTINGS_XML) },
        { path: "META-INF/container.rdf", data: enc(parts.CONTAINER_RDF) },
        { path: "Contents/content.hpf", data: enc(hpf) },
        { path: "META-INF/container.xml", data: enc(parts.CONTAINER_XML) },
        { path: "META-INF/manifest.xml", data: enc(parts.MANIFEST_XML) },
      ];
    },
  };
  return api;
}
