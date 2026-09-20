// 문장 안 서식(굵게·기울임·밑줄·취소선·글자색) — 순수 문자열 파싱/생성 (DOM 비의존)
// 저장 형식(겹쳐 쓸 수 있음, 항상 이 순서로 바깥→안): {c:#RRGGBB}...{/c} → **...** → ++...++ → ~~...~~ → _..._
// 예전부터 있던 "**굵게**"만 쓰는 문장도 그대로 읽힘(하위 호환) — build-report.js 규칙기반 문장이 이 표기를 씀

const PLAIN_DELIMS = { bold: "**", underline: "++", strike: "~~", italic: "_" };
const MARK_ORDER = ["color", "bold", "underline", "strike", "italic"];
const COLOR_OPEN = /^\{c:(#[0-9a-fA-F]{6})\}/;
const COLOR_CLOSE = "{/c}";

function matchOpen(s, i, mark) {
  if (mark === "color") { const m = COLOR_OPEN.exec(s.slice(i)); return m ? { len: m[0].length, value: m[1] } : null; }
  const tok = PLAIN_DELIMS[mark];
  if (!s.startsWith(tok, i)) return null;
  const after = s[i + tok.length];
  if (!after || /\s/.test(after) || after === tok[0]) return null; // 뒤가 공백·같은 기호면 서식 아님(예: "* 목록", "***")
  return { len: tok.length };
}

/** from 위치부터 짝이 맞는 닫는 표시를 찾음(바로 다음 자리=빈 내용, 앞이 공백이면 그 자리는 서식으로 안 침) */
function findClose(s, from, mark) {
  const tok = mark === "color" ? COLOR_CLOSE : PLAIN_DELIMS[mark];
  let i = s.indexOf(tok, from);
  while (i >= 0) {
    if (i === from) return -1; // 빈 내용
    const before = s[i - 1];
    if (mark === "color" || (!/\s/.test(before) && before !== tok[0])) return i;
    i = s.indexOf(tok, i + 1);
  }
  return -1;
}

/**
 * @param {string} text
 * @returns {{text:string, bold?:1, italic?:1, underline?:1, strike?:1, color?:string}[]}
 */
export function parseInline(text, marks = {}) {
  const s = String(text ?? "");
  const runs = [];
  let plain = "";
  let i = 0;
  const flushPlain = () => { if (plain) { runs.push({ text: plain, ...marks }); plain = ""; } };
  outer: while (i < s.length) {
    if (s[i] === "\\" && i + 1 < s.length) { plain += s[i + 1]; i += 2; continue; } // \* \_ \+ \~ \{ \\ → 있는 그대로
    for (const mark of MARK_ORDER) {
      if (marks[mark]) continue; // 같은 서식을 중첩해서 다시 여는 건 지원 안 함(무한 재귀 방지)
      const open = matchOpen(s, i, mark);
      if (!open) continue;
      const contentStart = i + open.len;
      const closeAt = findClose(s, contentStart, mark);
      if (closeAt < 0) continue; // 짝이 없으면 기호 그대로 글자 취급
      flushPlain();
      const closeLen = mark === "color" ? COLOR_CLOSE.length : PLAIN_DELIMS[mark].length;
      const innerMarks = mark === "color" ? { ...marks, color: open.value } : { ...marks, [mark]: 1 };
      runs.push(...parseInline(s.slice(contentStart, closeAt), innerMarks));
      i = closeAt + closeLen;
      continue outer;
    }
    plain += s[i++];
  }
  flushPlain();
  return runs;
}

/** 문장에 그대로 있던 *_+~{\\ 같은 글자가 서식 표시로 잘못 읽히지 않게 이스케이프(리치 텍스트 편집기 저장용) */
export const escapeLiteral = s => String(s ?? "").replace(/[\\*_+~{]/g, m => `\\${m}`);

/** 서식 표시를 지운 순수 글자만 (일반 텍스트로 내보낼 때) */
export const stripInlineMarks = text => parseInline(text).map(r => r.text).join("");

/** 굵게만 있는지(색·밑줄 등 없이) — 기존 "굵은 글씨 전체" 판별과 같은 의미로 씀 */
export const isWholeBold = text => {
  const runs = parseInline(text);
  return runs.length === 1 && !!runs[0].bold && Object.keys(runs[0]).length === 2;
};

/** 표식 집합으로 감싸기(항상 정해진 순서: 색 → 굵게 → 밑줄 → 취소선 → 기울임) */
export function wrapMarks(text, marks = {}) {
  let t = text;
  if (marks.italic) t = `_${t}_`;
  if (marks.strike) t = `~~${t}~~`;
  if (marks.underline) t = `++${t}++`;
  if (marks.bold) t = `**${t}**`;
  if (marks.color) t = `{c:${marks.color}}${t}{/c}`;
  return t;
}
