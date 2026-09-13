// 한국어 척도 응답 라벨 사전 — 구글폼/네이버폼 텍스트 응답을 숫자로 변환
// 각 세트: levels[i] = 점수 (min + i) 에 해당하는 동의어 목록

export const LABEL_SETS = [
  {
    id: "agree5", name: "동의(5점)", min: 1, max: 5, levels: [
      ["전혀그렇지않다", "전혀아니다", "전혀그렇지않음", "매우그렇지않다", "전혀동의하지않는다", "매우아니다"],
      ["그렇지않다", "아니다", "그렇지않음", "그렇지않은편이다", "동의하지않는다", "별로그렇지않다"],
      ["보통이다", "보통", "그저그렇다", "중간", "잘모르겠다", "보통임"],
      ["그렇다", "그런편이다", "그렇음", "동의한다", "대체로그렇다"],
      ["매우그렇다", "매우그렇음", "아주그렇다", "매우동의한다", "정말그렇다"],
    ],
  },
  {
    id: "satis5", name: "만족(5점)", min: 1, max: 5, levels: [
      ["매우불만족", "매우불만족한다", "매우불만", "전혀만족하지않는다", "전혀만족하지않음"],
      ["불만족", "불만족한다", "불만", "만족하지않는다", "불만족스럽다"],
      ["보통", "보통이다", "그저그렇다"],
      ["만족", "만족한다", "만족스럽다", "대체로만족"],
      ["매우만족", "매우만족한다", "아주만족", "매우만족스럽다"],
    ],
  },
  {
    id: "help5", name: "도움(5점)", min: 1, max: 5, levels: [
      ["전혀도움이되지않았다", "전혀도움안됨", "전혀도움이안되었다"],
      ["도움이되지않았다", "도움안됨", "별로도움이되지않았다"],
      ["보통이다", "보통"],
      ["도움이되었다", "도움됨", "도움이되었음"],
      ["매우도움이되었다", "매우도움됨", "많은도움이되었다"],
    ],
  },
  {
    id: "agree4", name: "동의(4점)", min: 1, max: 4, levels: [
      ["전혀그렇지않다", "전혀아니다"],
      ["그렇지않은편이다", "그렇지않다", "별로그렇지않다"],
      ["그런편이다", "그렇다", "대체로그렇다"],
      ["매우그렇다", "아주그렇다"],
    ],
  },
  {
    id: "agree7", name: "동의(7점)", min: 1, max: 7, levels: [
      ["전혀그렇지않다"], ["그렇지않다"], ["약간그렇지않다", "조금그렇지않다"], ["보통이다", "보통"],
      ["약간그렇다", "조금그렇다"], ["그렇다"], ["매우그렇다"],
    ],
  },
  {
    id: "freq5", name: "빈도(5점)", min: 1, max: 5, levels: [
      ["전혀없다", "전혀안한다", "한번도없다"], ["거의없다", "거의안한다"], ["가끔", "가끔있다", "가끔한다", "보통"],
      ["자주", "자주있다", "자주한다"], ["항상", "매우자주", "항상한다", "늘"],
    ],
  },
];

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

/** 라벨 정규화: 공백·구두점·앞 번호 제거 */
export function normLabel(v) {
  return String(v ?? "")
    .replace(/^\s*[(\[]?\s*\d{1,2}\s*[)\].:점]\s*/, "")
    .replace(/^[①-⑩]\s*/, "")
    .replace(/[\s.,·~!?"'()（）\[\]]/g, "")
    .toLowerCase();
}

/** 문자열 앞 번호/원문자에서 숫자 추출 ("5. 매우 그렇다", "(4) 그렇다", "③") */
export function leadingNumber(v) {
  const s = String(v ?? "").trim();
  const c = CIRCLED.indexOf(s[0]);
  if (c >= 0) return c + 1;
  const m = s.match(/^[(\[]?\s*(\d{1,2})\s*(?:[)\].:점]|$|\s)/);
  return m ? Number(m[1]) : null;
}

/**
 * 값 목록에 가장 잘 맞는 라벨 세트 탐색
 * @returns {{set, map: Map<string, number>, coverage: number} | null}
 */
export function matchLabelSet(values, minCoverage = 0.8) {
  const vals = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "").map(String);
  if (!vals.length) return null;
  let best = null;
  for (const set of LABEL_SETS) {
    const lookup = new Map();
    set.levels.forEach((syns, i) => syns.forEach(s => { if (!lookup.has(s)) lookup.set(s, set.min + i); }));
    let hit = 0;
    const map = new Map();
    for (const v of new Set(vals)) {
      const n = lookup.get(normLabel(v));
      if (n !== undefined) map.set(v, n);
    }
    vals.forEach(v => { if (map.has(v)) hit++; });
    const coverage = hit / vals.length;
    const distinctLevels = new Set(map.values()).size;
    if (coverage >= minCoverage && (!best || coverage > best.coverage || (coverage === best.coverage && distinctLevels > best.distinct))) {
      best = { set, map, coverage, distinct: distinctLevels };
    }
  }
  return best;
}
