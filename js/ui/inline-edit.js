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
const hasMarks = m => m.bold || m.italic || m.underline || m.strike || m.color;

/**
 * 서식 표시(** ++ 등)는 앞뒤에 공백이 붙으면 서식으로 인식되지 않는다(inline-marks.js).
 * 선택 영역이 단어 경계의 공백을 함께 물고 오는 일이 흔해서, 앞뒤 공백은 표시 밖에 두고
 * 알맹이만 감싼다 — 안 그러면 "**글자 **"처럼 저장돼 다음에 열 때 별표가 그대로 보인다.
 */
export function wrapRun(text, marks) {
  if (!hasMarks(marks)) return text;
  const lead = text.match(/^\s+/)?.[0] ?? "";
  const trail = lead.length < text.length ? (text.slice(lead.length).match(/\s+$/)?.[0] ?? "") : "";
  const core = text.slice(lead.length, text.length - trail.length);
  return core ? lead + wrapMarks(escapeLiteral(core), marks) + trail : text;
}

/** 편집 끝(blur): contenteditable 안 실제 서식 → 저장 표식 문자열로 되돌림.
 *  multiline=true(자유배치 텍스트 박스)면 줄바꿈(<br>)을 \n 으로 보존, 기본(문장 한 줄)은 공백으로 뭉갬 */
export function htmlToMarkup(root, { multiline = false } = {}) {
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
    if (node.tagName === "BR") {
      const br = multiline ? "\n" : " ";
      const last = runs[runs.length - 1];
      if (last && !hasMarks(last.marks)) last.text += br; else runs.push({ text: br, marks: {} });
      return;
    }
    node.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  const joined = runs.map(r => (hasMarks(r.marks) ? wrapRun(r.text, r.marks) : escapeLiteral(r.text))).join("");
  return multiline ? joined.replace(/[ \t]+/g, " ").replace(/[ \t]*\n[ \t]*/g, "\n").trim() : joined.replace(/\s+/g, " ").trim();
}
