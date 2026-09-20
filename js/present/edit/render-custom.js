// 자유배치(custom) 슬라이드 렌더러 — 무대·개요 썸네일·인쇄·내보내기·편집 화면이 모두 이 함수 하나를 씀
// (인터랙션은 여기서 다루지 않음: 편집 화면에서만 canvas-interactions.js 가 드래그·크기조절 핸들을 붙임)
import { esc } from "../../core/util.js";
import { inlineHtml } from "../../report/render-html.js";
import { chartSvg } from "../../report/model.js";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function chartInner(el, theme) {
  if (!el.chart) return "";
  try { return chartSvg({ ...el.chart, opts: { ...(el.chart.opts || {}), theme } }).svg; } catch (e) { return `<p class="s-err">차트를 그리지 못했습니다: ${esc(e.message)}</p>`; }
}

function elInner(el, theme, editable, editKeyPrefix) {
  switch (el.kind) {
    case "text": {
      const style = [el.color ? `color:${el.color}` : "", el.weight === "bold" ? "font-weight:750" : ""].filter(Boolean).join(";");
      if (!editable) return `<div class="s-el-text" style="${style}">${inlineHtml(el.markup)}</div>`;
      return `<div class="s-el-text" style="${style}"><span class="r-txt" contenteditable="true" spellcheck="false" data-edit="${esc(editKeyPrefix)}el:${esc(el.id)}" data-raw="${esc(el.markup)}" data-auto="${esc(el.markup)}" data-multiline="1">${inlineHtml(el.markup)}</span></div>`;
    }
    case "image":
      return `<img class="s-el-img" src="${esc(el.src)}" alt="" style="object-fit:${esc(el.fit || "cover")};border-radius:${Number(el.radius) || 0}px;opacity:${el.opacity ?? 1}">`;
    case "shape":
      return `<div class="s-el-shape s-el-shape-${esc(el.shapeType || "rect")}" style="background:${el.fill || "transparent"};border:${el.strokeWidth || 0}px solid ${el.stroke || "transparent"}"></div>`;
    case "chart":
    default:
      return `<div class="s-el-chart">${chartInner(el, theme)}</div>`;
  }
}

/** @param {{id:string,kind:string,x:number,y:number,w:number,h:number,rot?:number,z?:number}[]} elements */
export function freeElementsHtml(elements, theme, { editable = false, editKeyPrefix = "" } = {}) {
  return (elements || []).map(el => {
    const style = `left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;transform:rotate(${el.rot || 0}deg);z-index:${el.z || 1};${el.kind === "text" && el.fontSize ? `font-size:${el.fontSize}cqw;` : ""}${el.kind === "text" ? `text-align:${el.align || "left"};` : ""}`;
    const handles = editable ? HANDLES.map(h => `<i class="s-el-handle h-${h}" data-handle="${h}"></i>`).join("") + `<i class="s-el-handle h-rot" data-handle="rotate"></i>` : "";
    return `<div class="s-el s-el-${esc(el.kind)}" data-el-id="${esc(el.id)}" style="${style}">${elInner(el, theme, editable, editKeyPrefix)}${handles}</div>`;
  }).join("");
}

/** 자유배치 슬라이드 1장(자동 슬라이드를 디태치했거나, 처음부터 빈 슬라이드로 만든 것) */
export function slideHtmlCustom(s, entry, i, total, theme, { editable = false } = {}) {
  const elements = entry?.elements || [];
  const free = `<div class="s-free">${freeElementsHtml(elements, theme, { editable, editKeyPrefix: `deck:${s.id}.` })}</div>`;
  return `<article class="slide t-custom ${theme}${editable ? " editing" : ""}" aria-roledescription="슬라이드" aria-label="${i + 1} / ${total}. ${esc(s.title)}" data-slide-id="${esc(s.id)}">${free}</article>`;
}
