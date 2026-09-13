// 한국어 조사 자동 선택 (받침 유무)

const DIGIT_BATCHIM = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };
const DIGIT_RIEUL = { 1: true, 7: true, 8: true };

/** 조사가 붙을 기준 문자 (끝의 괄호·따옴표 제거) */
function baseTail(word) {
  let w = String(word ?? "").trim();
  for (let k = 0; k < 3; k++) {
    const s = w.replace(/\s*[(\[][^)\]]*[)\]]\s*$/, "").replace(/['"’”」』>》]+$/, "");
    if (s === w) break;
    w = s;
  }
  return w;
}

/** @returns {{batchim:boolean, rieul:boolean}} */
export function tailInfo(word) {
  const w = baseTail(word);
  const ch = w.slice(-1);
  if (!ch) return { batchim: false, rieul: false };
  const code = ch.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    const jong = (code - 0xAC00) % 28;
    return { batchim: jong !== 0, rieul: jong === 8 };
  }
  if (/\d/.test(ch)) return { batchim: DIGIT_BATCHIM[ch], rieul: !!DIGIT_RIEUL[ch] };
  if (ch === "%") return { batchim: false, rieul: false }; // 퍼센트
  if (/[lmnr]/i.test(ch)) return { batchim: true, rieul: /[lr]/i.test(ch) };
  return { batchim: false, rieul: false };
}

const PAIRS = {
  "은": ["은", "는"], "는": ["은", "는"], "이": ["이", "가"], "가": ["이", "가"],
  "을": ["을", "를"], "를": ["을", "를"], "과": ["과", "와"], "와": ["과", "와"],
  "이다": ["이다", "다"], "이며": ["이며", "며"], "이고": ["이고", "고"], "이나": ["이나", "나"],
  "으로": ["으로", "로"], "로": ["으로", "로"],
};

/** word + 조사 ("만족도","은" → "만족도는") */
export function josa(word, particle) {
  const pair = PAIRS[particle];
  if (!pair) return `${word}${particle}`;
  const { batchim, rieul } = tailInfo(word);
  if (pair[0] === "으로") return `${word}${batchim && !rieul ? "으로" : "로"}`;
  return `${word}${batchim ? pair[0] : pair[1]}`;
}
export const J = josa;
