// 척도 응답 라벨 사전 — 구글폼·네이버폼·타입폼·탈리폼 등 문자 응답을 점수로 변환
// 각 세트: levels[i] = 점수 (min + i) 에 해당하는 동의어 목록 (normLabel 로 정규화된 형태)
// family: 같은 계열(예: 동의 4점/5점/7점)은 문항 간 척도 통일 대상

export const LABEL_SETS = [
  {
    id: "agree5", family: "agree", name: "동의(5점)", min: 1, max: 5, levels: [
      ["전혀그렇지않다", "전혀아니다", "전혀그렇지않음", "매우그렇지않다", "전혀동의하지않는다", "전혀동의하지않음", "전혀동의안함", "매우아니다", "매우반대", "전혀아님"],
      ["그렇지않다", "아니다", "그렇지않음", "그렇지않은편이다", "동의하지않는다", "동의하지않음", "동의안함", "별로그렇지않다", "반대", "아님", "그렇지않은편"],
      ["보통이다", "보통", "그저그렇다", "중간", "잘모르겠다", "보통임", "중립", "잘모르겠음", "중간이다"],
      ["그렇다", "그런편이다", "그렇음", "동의한다", "대체로그렇다", "동의함", "동의", "그런편"],
      ["매우그렇다", "매우그렇음", "아주그렇다", "매우동의한다", "정말그렇다", "매우동의함", "매우동의", "적극동의", "전적으로동의"],
    ],
  },
  {
    id: "agree4", family: "agree", name: "동의(4점)", min: 1, max: 4, levels: [
      ["전혀그렇지않다", "전혀아니다", "전혀그렇지않음", "전혀동의하지않음"],
      ["그렇지않은편이다", "그렇지않다", "별로그렇지않다", "아니다", "그렇지않음", "동의하지않음"],
      ["그런편이다", "그렇다", "대체로그렇다", "그렇음", "동의함"],
      ["매우그렇다", "아주그렇다", "매우그렇음", "매우동의함"],
    ],
  },
  {
    id: "agree7", family: "agree", name: "동의(7점)", min: 1, max: 7, levels: [
      ["전혀그렇지않다"], ["그렇지않다"], ["약간그렇지않다", "조금그렇지않다"], ["보통이다", "보통"],
      ["약간그렇다", "조금그렇다"], ["그렇다"], ["매우그렇다"],
    ],
  },
  {
    id: "satis5", family: "satis", name: "만족(5점)", min: 1, max: 5, levels: [
      ["매우불만족", "매우불만족한다", "매우불만", "전혀만족하지않는다", "전혀만족하지않음", "매우불만족함"],
      ["불만족", "불만족한다", "불만", "만족하지않는다", "불만족스럽다", "불만족함", "만족하지않음"],
      ["보통", "보통이다", "그저그렇다", "중립", "보통임"],
      ["만족", "만족한다", "만족스럽다", "대체로만족", "만족함"],
      ["매우만족", "매우만족한다", "아주만족", "매우만족스럽다", "매우만족함"],
    ],
  },
  {
    id: "satis4", family: "satis", name: "만족(4점)", min: 1, max: 4, levels: [
      ["매우불만족", "매우불만"], ["불만족", "불만"], ["만족"], ["매우만족"],
    ],
  },
  {
    id: "help5", family: "help", name: "도움(5점)", min: 1, max: 5, levels: [
      ["전혀도움이되지않았다", "전혀도움안됨", "전혀도움이안되었다"],
      ["도움이되지않았다", "도움안됨", "별로도움이되지않았다"],
      ["보통이다", "보통"],
      ["도움이되었다", "도움됨", "도움이되었음"],
      ["매우도움이되었다", "매우도움됨", "많은도움이되었다"],
    ],
  },
  {
    id: "quality5", family: "quality", name: "평가(5점: 매우 미흡~매우 우수)", min: 1, max: 5, levels: [
      ["매우나쁘다", "매우나쁨", "매우미흡"], ["나쁘다", "나쁨", "미흡"], ["보통", "보통이다"], ["좋다", "좋음", "우수"], ["매우좋다", "매우좋음", "매우우수"],
    ],
  },
  {
    id: "freq5", family: "freq", name: "빈도(5점)", min: 1, max: 5, levels: [
      ["전혀없다", "전혀안한다", "한번도없다"], ["거의없다", "거의안한다"], ["가끔", "가끔있다", "가끔한다"],
      ["자주", "자주있다", "자주한다"], ["항상", "매우자주", "항상한다", "늘"],
    ],
  },
  // ── 영문 (타입폼·탈리폼 등 영문 보기) ──
  {
    id: "agree5_en", family: "agree_en", name: "동의(5점, 영문)", min: 1, max: 5, levels: [
      ["stronglydisagree", "totallydisagree", "completelydisagree"],
      ["disagree", "somewhatdisagree", "tendtodisagree"],
      ["neitheragreenordisagree", "neitheragreeordisagree", "neutral", "undecided", "notsure"],
      ["agree", "somewhatagree", "tendtoagree"],
      ["stronglyagree", "totallyagree", "completelyagree"],
    ],
  },
  { id: "agree4_en", family: "agree_en", name: "동의(4점, 영문)", min: 1, max: 4, levels: [["stronglydisagree"], ["disagree"], ["agree"], ["stronglyagree"]] },
  {
    id: "satis5_en", family: "satis_en", name: "만족(5점, 영문)", min: 1, max: 5, levels: [
      ["verydissatisfied", "extremelydissatisfied", "veryunsatisfied"], ["dissatisfied", "somewhatdissatisfied", "unsatisfied"],
      ["neutral", "neithersatisfiednordissatisfied", "neithersatisfiedordissatisfied"], ["satisfied", "somewhatsatisfied"], ["verysatisfied", "extremelysatisfied"],
    ],
  },
  {
    id: "likely5_en", family: "likely_en", name: "가능성(5점, 영문)", min: 1, max: 5, levels: [
      ["veryunlikely", "extremelyunlikely"], ["unlikely", "somewhatunlikely"], ["neutral", "neitherlikelynorunlikely"], ["likely", "somewhatlikely"], ["verylikely", "extremelylikely"],
    ],
  },
  {
    id: "quality5_en", family: "quality_en", name: "평가(5점, 영문)", min: 1, max: 5, levels: [
      ["verypoor", "terrible"], ["poor", "bad"], ["fair", "average", "ok", "okay"], ["good"], ["excellent", "verygood"],
    ],
  },
];

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

/** 라벨 정규화: 앞 번호·원문자·공백·구두점 제거, 소문자 */
export function normLabel(v) {
  return String(v ?? "")
    .replace(/^\s*[(\[]?\s*\d{1,2}\s*[)\].:점]\s*/, "")
    .replace(/^[①-⑩]\s*/, "")
    .replace(/[\s.,·~!?"'()（）\[\]\-_/]/g, "")
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

const lookupOf = set => {
  const lookup = new Map();
  set.levels.forEach((syns, i) => syns.forEach(s => { if (!lookup.has(s)) lookup.set(s, set.min + i); }));
  return lookup;
};

/** 특정 세트로 값 매핑 (일치하는 문구만) → Map(원문 → 점수) */
export function mapWithSet(values, set) {
  const lookup = lookupOf(set);
  const map = new Map();
  for (const v of new Set(values.filter(x => x !== null && x !== undefined && String(x).trim() !== "").map(x => String(x).trim()))) {
    const n = lookup.get(normLabel(v));
    if (n !== undefined) map.set(v, n);
  }
  return map;
}

/**
 * 값 목록에 가장 잘 맞는 라벨 세트
 *  1) 일치율 높은 순 2) 관측 보기 수가 세트 단계 수와 딱 맞는 세트(예: '보통' 없는 4단계 → 4점) 3) 사전 순서(5점 우선)
 * @returns {{set, map: Map<string, number>, coverage: number, distinct: number, ambiguous: boolean} | null}
 *   ambiguous: 5점으로 판정했으나 중간(보통) 응답이 없어 4점일 가능성도 있음
 */
export function matchLabelSet(values, minCoverage = 0.8, sets = LABEL_SETS) {
  const vals = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "").map(v => String(v).trim());
  if (!vals.length) return null;
  const cands = [];
  sets.forEach((set, order) => {
    const map = mapWithSet(vals, set);
    const hit = vals.filter(v => map.has(v)).length;
    const coverage = hit / vals.length;
    if (coverage >= minCoverage && map.size) cands.push({ set, map, coverage, distinct: new Set(map.values()).size, order });
  });
  if (!cands.length) return null;
  const full = c => (c.distinct === c.set.levels.length ? 1 : 0);
  cands.sort((a, b) => b.coverage - a.coverage || full(b) - full(a) || a.order - b.order);
  const best = cands[0];
  const k = best.set.levels.length;
  const mid = Number.isInteger((k - 1) / 2) ? best.set.min + (k - 1) / 2 : null;
  const midSeen = mid !== null && [...best.map.values()].includes(mid);
  best.ambiguous = mid !== null && !midSeen && cands.some(c => c !== best && c.set.family === best.set.family && c.set.levels.length !== k && c.coverage === best.coverage);
  return best;
}
