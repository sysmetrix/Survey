// 자유배치(custom) 슬라이드 렌더러 — 무대·개요 썸네일·인쇄·내보내기·편집 화면이 모두 이 함수 하나를 씀
// (인터랙션은 여기서 다루지 않음: 편집 화면에서만 canvas-interactions.js 가 드래그·크기조절 핸들을 붙임)
import { esc } from "../../core/util.js";
import { inlineHtml } from "../../report/render-html.js";
import { chartSvg } from "../../report/model.js";
import { elKey, blockKey, cellKey } from "./keys.js";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

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

function elInner(slideId, el, theme, editable) {
  switch (el.kind) {
    case "text": {
      const style = [el.color ? `color:${el.color}` : "", el.weight === "bold" ? "font-weight:750" : ""].filter(Boolean).join(";");
      return `<div class="s-el-text" style="${style}">${editableSpan(elKey(slideId, el.id), el.markup, editable)}</div>`;
    }
    case "richtext":
      return `<div class="s-el-richtext">${richtextInner(slideId, el, editable)}</div>`;
    case "table":
      return tableInner(slideId, el, editable);
    case "image":
      return `<img class="s-el-img" src="${esc(el.src)}" alt="" style="object-fit:${esc(el.fit || "cover")};border-radius:${Number(el.radius) || 0}px;opacity:${el.opacity ?? 1}">`;
    case "shape":
      return `<div class="s-el-shape s-el-shape-${esc(el.shapeType || "rect")}" style="background:${el.fill || "transparent"};border:${el.strokeWidth || 0}px solid ${el.stroke || "transparent"}"></div>`;
    case "chart":
    default:
      return `<div class="s-el-chart">${chartInner(el, theme)}</div>`;
  }
}

const TEXTUAL = new Set(["text", "richtext"]);

/** @param {{id:string,kind:string,x:number,y:number,w:number,h:number,rot?:number,z?:number}[]} elements */
export function freeElementsHtml(slideId, elements, theme, { editable = false } = {}) {
  return (elements || []).map(el => {
    const style = `left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;transform:rotate(${el.rot || 0}deg);z-index:${el.z || 1};${TEXTUAL.has(el.kind) && el.fontSize ? `font-size:${el.fontSize}cqw;` : ""}${TEXTUAL.has(el.kind) ? `text-align:${el.align || "left"};` : ""}`;
    const handles = editable ? HANDLES.map(h => `<i class="s-el-handle h-${h}" data-handle="${h}"></i>`).join("") + `<i class="s-el-handle h-rot" data-handle="rotate"></i>` : "";
    return `<div class="s-el s-el-${esc(el.kind)}" data-el-id="${esc(el.id)}" style="${style}">${elInner(slideId, el, theme, editable)}${handles}</div>`;
  }).join("");
}

/** 자유배치 슬라이드 1장(자동 슬라이드를 디태치했거나, 처음부터 빈 슬라이드로 만든 것) */
export function slideHtmlCustom(s, entry, i, total, theme, { editable = false } = {}) {
  const elements = entry?.elements || [];
  const free = `<div class="s-free">${freeElementsHtml(s.id, elements, theme, { editable })}</div>`;
  return `<article class="slide t-custom ${theme}${editable ? " editing" : ""}" aria-roledescription="슬라이드" aria-label="${i + 1} / ${total}. ${esc(s.title)}" data-slide-id="${esc(s.id)}">${free}</article>`;
}
