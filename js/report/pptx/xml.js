// PPTX(OOXML) XML 문자열 이스케이프 — js/report/hwpx/xml.js 와 같은 원칙(순수 문자열, DOM 비의존)
const INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g; // XML 1.0에서 쓸 수 없는 제어문자
export const escText = s => String(s ?? "").replace(INVALID, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escAttr = s => escText(s).replace(/"/g, "&quot;");
