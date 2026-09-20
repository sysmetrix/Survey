// 보고서 문장 리치 텍스트 편집: 저장 표식(inline-marks.js) ↔ 편집 중 실제 서식(HTML) 변환
// 편집 중에는 **처럼 표식이 그대로 보이지 않고 굵게·기울임 등으로 곧장 보이게(WYSIWYG) 한다.
import { wrapMarks, escapeLiteral } from "../report/inline-marks.js";
import { inlineHtml } from "../report/render-html.js";

/** 편집 시작: 저장된 표식 문자열 → 서식이 적용된 HTML (contenteditable 내용으로 씀) */
export const markupToHtml = text => inlineHtml(text) || "";

function toHex(c) {
  if (!c) return null;
  const s = String(c).trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(s);
  if (!m) return null;
  return "#" + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** node 부터 root 까지 조상을 훑어 굵게·기울임·밑줄·취소선·색을 판정 */
function marksAt(node, root) {
  const marks = {};
  for (let n = node; n && n !== root; n = n.parentNode) {
    if (n.nodeType !== 1) continue;
    const tag = n.tagName;
    const style = n.style;
    const weight = style?.fontWeight;
    if (tag === "B" || tag === "STRONG" || weight === "bold" || weight === "bolder" || (weight && +weight >= 600)) marks.bold = 1;
    if (tag === "I" || tag === "EM" || /italic|oblique/.test(style?.fontStyle || "")) marks.italic = 1;
    const deco = `${style?.textDecorationLine || ""} ${style?.textDecoration || ""}`;
    if (tag === "U" || tag === "INS" || /underline/.test(deco)) marks.underline = 1;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL" || /line-through/.test(deco)) marks.strike = 1;
    if (!marks.color) {
      const raw = (tag === "FONT" && n.getAttribute("color")) || style?.color;
      const hex = toHex(raw);
      if (hex && hex !== "#000000") marks.color = hex;
    }
  }
  return marks;
}

const sameMarks = (a, b) => a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike && a.color === b.color;

/** 편집 끝(blur): contenteditable 안 실제 서식 → 저장 표식 문자열로 되돌림 */
export function htmlToMarkup(root) {
  const runs = [];
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.nodeValue) return;
      const marks = marksAt(node.parentNode, root);
      const last = runs[runs.length - 1];
      if (last && sameMarks(last.marks, marks)) last.text += node.nodeValue;
      else runs.push({ text: node.nodeValue, marks });
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.tagName === "BR") { const last = runs[runs.length - 1]; if (last) last.text += " "; return; } // 편집 필드는 한 줄(Enter=blur)
    node.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return runs.map(r => wrapMarks(escapeLiteral(r.text), r.marks)).join("").replace(/\s+/g, " ").trim();
}
