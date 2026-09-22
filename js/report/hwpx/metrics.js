// HWPX 글머리 폭 실측표 (순수 모듈 — DOM 비의존)
//
// 개조식 둘째 줄을 글머리(□ ○ - · ※ 등) 다음 첫 글자에 정확히 맞추려면
// "글머리 + 뒤따르는 공백"이 한글에서 실제로 차지하는 폭을 알아야 한다.
// 아래 값은 공식으로 어림잡은 것이 아니라 실측값이다 — 글꼴마다 시험 문서를 만들어
// 한글 2024 로 PDF 저장한 뒤, PDF 에 찍힌 글자 좌표를 직접 재서 얻었다.
// 재현·갱신: node tools/hwpx-glyph-widths.mjs --gen <폴더> → tools/hwp-verify.ps1 → --read <폴더>
//
// 단위는 em(글자 크기 대비 비율) — 12pt 에서 1.0em = 12pt 이므로 글자 크기를 바꿔도 그대로 비례한다.

/** 공백 폭: 한글은 글꼴의 space 값을 쓰지 않고 언제나 0.5em 으로 놓는다(위 글꼴 전부 실측 동일) */
export const SPACE_EM = 0.5;

/** 글꼴 조합(FONT_PRESETS 의 id)별 글자 폭(em) — hangul/latin/digit/other 는 표에 없는 글자의 갈래별 값 */
export const GLYPH_EM = {
  gov:        { "□": 1.00, "○": 1.00, "·": 1.00, "-": 0.50, "※": 1.00, ":": 0.27, ".": 0.27, ",": 0.27, "(": 0.32, hangul: 1.00, latin: 0.66, digit: 0.50, other: 0.50 },
  hancom:     { "□": 0.97, "○": 0.97, "·": 0.32, "-": 0.55, "※": 0.77, ":": 0.32, ".": 0.32, ",": 0.32, "(": 0.32, hangul: 0.97, latin: 0.70, digit: 0.55, other: 0.50 },
  malgun:     { "□": 1.00, "○": 1.00, "·": 0.22, "-": 0.41, "※": 0.80, ":": 0.22, ".": 0.22, ",": 0.22, "(": 0.31, hangul: 1.00, latin: 0.65, digit: 0.55, other: 0.50 },
  nanum:      { "□": 0.94, "○": 0.94, "·": 0.29, "-": 0.37, "※": 0.94, ":": 0.31, ".": 0.31, ",": 0.31, "(": 0.37, hangul: 0.94, latin: 0.72, digit: 0.60, other: 0.50 },
  kopub:      { "□": 0.90, "○": 0.90, "·": 0.45, "-": 0.57, "※": 0.90, ":": 0.31, ".": 0.30, ",": 0.30, "(": 0.31, hangul: 0.88, latin: 0.67, digit: 0.57, other: 0.50 },
  noto:       { "□": 1.00, "○": 1.00, "·": 0.56, "-": 0.34, "※": 1.00, ":": 0.27, ".": 0.27, ",": 0.27, "(": 0.33, hangul: 0.92, latin: 0.60, digit: 0.55, other: 0.50 },
  pretendard: { "□": 0.87, "○": 0.87, "·": 0.26, "-": 0.57, "※": 0.87, ":": 0.28, ".": 0.28, ",": 0.28, "(": 0.28, hangul: 0.87, latin: 0.64, digit: 0.57, other: 0.50 },
};

/** 직접 입력한 글꼴은 폭을 알 수 없으므로, 대체 글꼴로 쓰는 함초롬 값으로 잰다 */
const FALLBACK = "hancom";

/** @returns {typeof GLYPH_EM.gov} 글꼴 조합 id 에 맞는 글자 폭표 */
export const glyphEm = presetId => GLYPH_EM[presetId] || GLYPH_EM[FALLBACK];

const HANJA_HANGUL = /[가-힣ㄱ-ㆎ㐀-鿿豈-﫿]/;
// 전각으로 놓이는 기호들(도형 ■-◿, 기타 기호 ☀-⛿, CJK 문장부호, 원문자, 전각 영숫자)
const FULLWIDTH_SYMBOL = /[①-⓿■-◿☀-⛿　-〿！-｠]/;

/** 글자 하나의 폭(em) */
export function charEm(ch, table) {
  if (ch === " ") return SPACE_EM;
  if (table[ch] != null) return table[ch];
  if (HANJA_HANGUL.test(ch)) return table.hangul;
  if (FULLWIDTH_SYMBOL.test(ch)) return table["□"];
  if (/[0-9]/.test(ch)) return table.digit;
  if (/[A-Za-z]/.test(ch)) return table.latin;
  return table.other;
}

/** 글머리 문자열(예: "□ ", "주: ")의 폭(em) */
export const leadEm = (prefix, table) => [...String(prefix)].reduce((sum, ch) => sum + charEm(ch, table), 0);
