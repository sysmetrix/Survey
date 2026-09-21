// 자유배치(custom) 슬라이드 렌더러 — 무대·개요 썸네일·인쇄·내보내기·편집 화면이 모두 이 함수 하나를 씀
// (인터랙션은 여기서 다루지 않음: 편집 화면에서만 canvas-interactions.js 가 드래그·크기조절 핸들을 붙임)
// 요소 필드(모두 선택 사항 — 예전에 저장한 요소는 필드가 없어도 그대로 그려짐)는 css 인라인 스타일로만 표현해서,
// 앱 화면·발표 모드·개요·인쇄·HTML 내보내기가 같은 마크업을 씀(css/present.css 는 내보내기에도 그대로 들어감).
import { esc } from "../../core/util.js";
import { inlineHtml } from "../../report/render-html.js";
import { chartSvg } from "../../report/model.js";
import { cleanFontName } from "../../report/hwpx/fonts.js";
import { elKey, blockKey, cellKey } from "./keys.js";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** 도형 종류(그 밖의 값은 rect 로 그림) */
export const SHAPE_TYPES = ["rect", "roundRect", "ellipse", "triangle", "line", "arrow"];
export const DEFAULT_ROUND_RADIUS = 12; // px — roundRect 에 radius 가 없을 때
export const DEFAULT_TABLE_FONT = 1.35; // cqw — 표 글자 크기 기본값
const DEFAULT_LINE_WIDTH = 2; // px — 선·화살표 굵기가 없거나 0일 때(굵기 0 선은 보이지 않으므로)
const TEXT_PAD = "0.6cqw"; // 배경색·테두리가 있는 글상자의 안쪽 여백(PPTX 내보내기의 inset 과 같은 값)

const shapeTypeOf = t => (SHAPE_TYPES.includes(t) ? t : "rect");
/** 숫자로 읽히면 그 값, 아니면 fallback */
const numOr = (v, fallback = null) => { if (v === "" || v == null || typeof v === "boolean") return fallback; const n = Number(v); return Number.isFinite(n) ? n : fallback; };
/** css 색 문자열 검사 — 스타일 속성을 깨뜨릴 수 있는 문자(따옴표·세미콜론·꺾쇠 등)가 있으면 버림 */
const cssColor = v => { const s = String(v ?? "").trim(); return s && /^[#\w(),.%\s/+-]{1,64}$/.test(s) ? s : ""; };
const opacityStyle = v => { const n = numOr(v); return n != null && n >= 0 && n < 1 ? `opacity:${Math.round(n * 1000) / 1000}` : ""; };
/** 글꼴 이름 → font-family 값(없거나 '기본' 이면 슬라이드 기본 글꼴 그대로) */
const fontStack = name => { const n = cleanFontName(name); return n && n !== "기본" ? `'${n}',var(--font)` : ""; };

function chartInner(el, theme) {
  if (!el.chart) return "";
  try { return chartSvg({ ...el.chart, opts: { ...(el.chart.opts || {}), theme } }).svg; } catch (e) { return `<p class="s-err">차트를 그리지 못했습니다: ${esc(e.message)}</p>`; }
}

/** contenteditable 로 감싼(또는 안 감싼) 표식 문자열 한 조각 — 텍스트·richtext 문단·표 칸이 모두 이 모양을 씀 */
function editableSpan(key, text, editable, multiline = true) {
  if (!editable) return inlineHtml(text);
  return `<span class="r-txt" contenteditable="true" spellcheck="false"${multiline ? ' data-multiline="1"' : ""} data-edit="${esc(key)}" data-raw="${esc(text)}" data-auto="${esc(text)}">${inlineHtml(text)}</span>`;
}

function richtextInner(slideId, el, editable) {
  return (el.blocks || []).map((b, bi) => {
    const key = blockKey(slideId, el.id, bi);
    const cls = b.type === "bullet" ? "s-el-bullet" : "s-el-para";
    return `<div class="${cls}">${b.type === "bullet" ? `<span class="s-el-bullet-dot" aria-hidden="true">•</span>` : ""}${editableSpan(key, b.text, editable)}</div>`;
  }).join("");
}

function tableInner(slideId, el, editable) {
  const rows = el.rows || [];
  return `<table class="s-el-table">${rows.map((row, r) => `<tr>${row.map((cell, c) => {
    const tag = el.headerRow && r === 0 ? "th" : "td";
    return `<${tag}>${editableSpan(cellKey(slideId, el.id, r, c), cell, editable, false)}</${tag}>`;
  }).join("")}</tr>`).join("")}</table>`;
}

const VALIGN = { middle: "center", bottom: "flex-end" };
/** text·richtext 안쪽 상자(.s-el-text / .s-el-richtext)에 붙는 스타일 — 글꼴·색·줄간격·세로정렬·배경·테두리·모서리·투명도 */
function textBoxStyle(el) {
  const p = [];
  const color = cssColor(el.color);
  if (color) p.push(`color:${color}`);
  if (el.weight === "bold") p.push("font-weight:750");
  const ff = fontStack(el.fontFamily);
  if (ff) p.push(`font-family:${ff}`);
  if (el.italic) p.push("font-style:italic");
  const deco = [el.underline ? "underline" : "", el.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (deco) p.push(`text-decoration:${deco}`);
  const lh = numOr(el.lineHeight);
  if (lh != null && lh >= 0.8 && lh <= 4) p.push(`line-height:${lh}`);
  const va = VALIGN[el.valign];
  // safe: 내용이 상자보다 길 때 위쪽이 잘려 스크롤로도 못 보는 일이 없게 함(지원 안 하는 브라우저는 앞의 center 값)
  if (va) p.push(`display:flex;flex-direction:column;justify-content:${va};justify-content:safe ${va}`);
  const fill = cssColor(el.fill);
  if (fill) p.push(`background:${fill}`);
  const bw = numOr(el.borderWidth, 0);
  if (bw > 0) p.push(`border:${bw}px solid ${cssColor(el.borderColor) || "currentColor"}`);
  const radius = numOr(el.radius, 0);
  if (radius > 0) p.push(`border-radius:${radius}px`);
  if (fill || bw > 0) p.push(`padding:${TEXT_PAD}`);
  const op = opacityStyle(el.opacity);
  if (op) p.push(op);
  return p.join(";");
}

/** 도형 → 마크업. rect·roundRect·ellipse 는 css 상자, triangle 은 인라인 svg, line·arrow 는 가운데를 가로지르는 선(높이 0 상자에서도 보이도록 css 로 그림) */
function shapeInner(el) {
  const type = shapeTypeOf(el.shapeType);
  const fill = cssColor(el.fill), stroke = cssColor(el.stroke);
  const sw = Math.max(0, numOr(el.strokeWidth, 0));
  const op = opacityStyle(el.opacity);
  if (type === "triangle") {
    return `<svg class="s-el-shape s-el-shape-triangle" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"${op ? ` style="${op}"` : ""}><polygon points="50,0 100,100 0,100" fill="${fill || "none"}" stroke="${stroke && sw ? stroke : "none"}" stroke-width="${sw}" stroke-linejoin="miter" vector-effect="non-scaling-stroke"/></svg>`;
  }
  if (type === "line" || type === "arrow") {
    const w = sw || DEFAULT_LINE_WIDTH;
    const color = stroke || fill || "currentColor";
    const line = `<i class="s-el-line" style="border-top:${w}px solid ${color}"></i>`;
    // 화살촉: 길이·너비가 선 굵기의 3배(PowerPoint 의 기본 화살촉 크기와 같은 비율)
    const hl = Math.max(6, w * 3);
    const head = type === "arrow" ? `<i class="s-el-arrowhead" style="border-left:${hl}px solid ${color};border-top:${hl / 2}px solid transparent;border-bottom:${hl / 2}px solid transparent"></i>` : "";
    return `<div class="s-el-shape s-el-shape-${type}"${op ? ` style="${op}"` : ""}>${line}${head}</div>`;
  }
  const p = [`background:${fill || "transparent"}`, `border:${sw}px solid ${stroke || "transparent"}`];
  if (type === "roundRect") p.push(`border-radius:${Math.max(0, numOr(el.radius, DEFAULT_ROUND_RADIUS))}px`);
  if (op) p.push(op);
  return `<div class="s-el-shape s-el-shape-${type}" style="${p.join(";")}"></div>`;
}

function elInner(slideId, el, theme, editable) {
  switch (el.kind) {
    case "text":
      return `<div class="s-el-text" style="${textBoxStyle(el)}">${editableSpan(elKey(slideId, el.id), el.markup, editable)}</div>`;
    case "richtext": {
      const style = textBoxStyle(el);
      return `<div class="s-el-richtext"${style ? ` style="${style}"` : ""}>${richtextInner(slideId, el, editable)}</div>`;
    }
    case "table":
      return tableInner(slideId, el, editable);
    case "image": {
      const opacity = Math.min(1, Math.max(0, numOr(el.opacity, 1)));
      return `<img class="s-el-img" src="${esc(el.src)}" alt="" style="object-fit:${esc(el.fit || "cover")};border-radius:${numOr(el.radius, 0)}px;opacity:${opacity}">`;
    }
    case "shape":
      return shapeInner(el);
    case "chart":
    default:
      return `<div class="s-el-chart">${chartInner(el, theme)}</div>`;
  }
}

const TEXTUAL = new Set(["text", "richtext"]);

/** 글자 크기는 슬라이드 폭에 비례(cqw) — 화면 크기·썸네일·인쇄·내보내기에서 같은 비율로 보임 */
function fontSizeStyle(el) {
  if (TEXTUAL.has(el.kind)) { const n = numOr(el.fontSize); return n ? `font-size:${n}cqw;` : ""; }
  if (el.kind === "table") return `font-size:${numOr(el.fontSize) || DEFAULT_TABLE_FONT}cqw;`;
  return "";
}

/** @param {{id:string,kind:string,x:number,y:number,w:number,h:number,rot?:number,z?:number}[]} elements */
export function freeElementsHtml(slideId, elements, theme, { editable = false, selectedElId = null } = {}) {
  return (elements || []).map(el => {
    const style = `left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;transform:rotate(${el.rot || 0}deg);z-index:${el.z || 1};${fontSizeStyle(el)}${TEXTUAL.has(el.kind) ? `text-align:${el.align || "left"};` : ""}`;
    const selected = editable && el.id === selectedElId;
    const handles = editable ? HANDLES.map(h => `<i class="s-el-handle h-${h}" data-handle="${h}"></i>`).join("") + `<i class="s-el-handle h-rot" data-handle="rotate"></i>` : "";
    return `<div class="s-el s-el-${esc(el.kind)}${selected ? " selected" : ""}" data-el-id="${esc(el.id)}" style="${style}">${elInner(slideId, el, theme, editable)}${handles}</div>`;
  }).join("");
}

/** 자유배치 슬라이드 1장(자동 슬라이드를 디태치했거나, 처음부터 빈 슬라이드로 만든 것). s.bg(슬라이드 배경색)가 있으면 배경으로 씀 */
export function slideHtmlCustom(s, entry, i, total, theme, { editable = false, selectedElId = null } = {}) {
  const elements = entry?.elements || [];
  const free = `<div class="s-free">${freeElementsHtml(s.id, elements, theme, { editable, selectedElId })}</div>`;
  const bg = cssColor(s.bg ?? entry?.bg);
  return `<article class="slide t-custom ${theme}${editable ? " editing" : ""}" aria-roledescription="슬라이드" aria-label="${i + 1} / ${total}. ${esc(s.title)}" data-slide-id="${esc(s.id)}"${bg ? ` style="background:${bg}"` : ""}>${free}</article>`;
}
