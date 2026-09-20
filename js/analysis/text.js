// 주관식 분석: 키워드·연어·감성/건의 분류·주제 코딩·대표 인용문 (규칙 기반)
import { maskPII } from "../core/util.js";

const STOP = new Set("것 수 등 및 또 그리고 하지만 그러나 따라서 또한 즉 그래서 이 그 저 좀 너무 정말 진짜 매우 아주 조금 많이 더 잘 안 못 없음 없다 없습니다 있음 있다 특별히 특히 모든 이런 그런 저런 어떤 무엇 이번 다음 우리 저희 제가 제 나 내 때 중 위 후 전 통해 위해 대해 대한 관련 경우 때문 같은 같아요 같습니다 생각 생각합니다 합니다 했습니다 하는 해서 하고 하면 되는 되었다 되어 있어서 있었습니다 좋겠습니다 좋겠다 해주세요 주세요 프로그램에서 내가 제가 나는 저는 것이 것을 무엇인지 생각해 좋아 너무 있어서 되어 해서 하면서 수있 있고 없고 좀더 조금더 이번에 다음에".split(" "));
const ENDINGS = /(었습니다|았습니다|였습니다|했습니다|습니다|입니다|이에요|예요|었어요|았어요|했어요|해요|어요|아요|네요|군요|는데|지만|어서|아서|해서|으면|에서|에게|께서|까지|부터|처럼|보다|이랑|하고|으로|이나|라서|이라|이다|였다|했다|한다|하는|하게|했던|적인|스러운|스럽다|은|는|이|가|을|를|에|의|와|과|도|로|만|요|고|며|게|음|함)$/;

// 용언 활용형(키워드로 부적합) — 어간만 남은 짧은 형태 포함
const VERBAL = /(어요|아요|여요|니다|습니|겠|었|았|였|했|됐|면서|는데|해서|하면|싶|같아|좋겠|있는|없는|하는|되는|주세요|주셨|줬)$|^(되었|생겼|좋았|있었|없었|했으|하고|해주|되어)/;

export function tokenize(text) {
  return String(text ?? "")
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map(w => { let t = w.trim().toLowerCase(); for (let k = 0; k < 2 && t.length > 2; k++) { const s = t.replace(ENDINGS, ""); if (s === t || s.length < 2) break; t = s; } return t; })
    .filter(w => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w) && !VERBAL.test(w));
}

const POS = ["좋", "만족", "도움", "유익", "최고", "친절", "재미", "재밌", "즐거", "즐겁", "감사", "편리", "유용", "알차", "보람", "뿌듯", "행복", "기쁘", "흥미", "신기", "훌륭", "멋지", "배울", "배웠", "알게", "성장", "자신감", "소중", "추천", "유쾌", "편안", "따뜻"];
const NEG = ["불편", "어렵", "어려웠", "부족", "아쉽", "아쉬웠", "힘들", "불만", "실망", "복잡", "지루", "미흡", "짧았", "짧아", "길었", "덥", "더웠", "춥", "추웠", "시끄", "비좁", "좁았", "좁고", "약해", "늦", "별로", "싫", "귀찮", "힘든", "피곤", "산만", "적었", "더러", "냄새"];
const NEGATION = /(안\s*좋|좋지\s*않|좋지\s*못|만족하지\s*않|도움이?\s*(안|되지\s*않)|재미\s*없|재미가\s*없|유익하지\s*않)/;
const SUGGEST = /(했으면|하면\s*좋겠|주셨으면|줬으면|주세요|바랍니다|바래요|필요합니다|필요해요|필요할\s*것|늘려|늘었으면|개선|추가(해|되|했)|더\s*많|더\s*길|확대|다양했으면|있었으면|생겼으면|좋겠습니다|좋겠어요)/;

/** 감성/유형 분류: positive | negative | suggestion | neutral */
export function classify(text) {
  const s = String(text ?? "");
  if (/^(없음|없습니다|없어요|딱히\s*없|특별히\s*없|x|X|-|\.|무)$/.test(s.trim())) return "none";
  if (SUGGEST.test(s)) return "suggestion";
  if (NEGATION.test(s)) return "negative";
  const p = POS.filter(k => s.includes(k)).length, n = NEG.filter(k => s.includes(k)).length;
  return p > n ? "positive" : n > p ? "negative" : "neutral";
}

export const DEFAULT_THEMES = [
  { id: "content", name: "프로그램 내용", keys: ["내용", "체험", "주제", "수업", "교육", "실습", "만들기", "게임", "탐색", "직업", "종류", "다양", "강의", "커리큘럼"] },
  { id: "staff", name: "강사·운영진", keys: ["강사", "선생님", "쌤", "멘토", "진행", "설명", "친절", "운영진", "담당자", "선생"] },
  { id: "facility", name: "시설·환경", keys: ["시설", "장소", "공간", "환경", "교실", "냉방", "난방", "에어컨", "화장실", "주차", "의자", "책상", "넓", "좁"] },
  { id: "time", name: "운영시간·일정", keys: ["시간", "일정", "기간", "회차", "짧", "길", "요일", "방학", "주말", "평일", "늦게", "일찍"] },
  { id: "access", name: "홍보·신청·접근성", keys: ["홍보", "안내", "신청", "접수", "교통", "거리", "위치", "공지", "알림", "문자", "연락"] },
  { id: "peer", name: "참여자·관계", keys: ["친구", "또래", "팀", "모둠", "협력", "소통", "관계", "사람들", "형", "언니", "동생"] },
  { id: "growth", name: "성장·효과", keys: ["도움", "배움", "배웠", "알게", "자신감", "진로", "꿈", "성장", "변화", "경험", "깨달", "생각하게"] },
  { id: "supply", name: "간식·재료·비용", keys: ["간식", "식사", "음식", "재료", "준비물", "비용", "상품", "기념품", "선물", "물품"] },
];

export function themesOf(text, themes = DEFAULT_THEMES) {
  const s = String(text ?? "");
  return themes.filter(t => t.keys.some(k => s.includes(k))).map(t => t.id);
}

/**
 * @param {(string|null)[]} values
 * @param {{groups?: (string|null)[], themes?: any[], maxQuotes?: number}} opts
 */
export function textAnalysis(values, { themes = DEFAULT_THEMES, maxQuotes = 3, groups = null } = {}) {
  const items = values.map((v, i) => ({ i, text: v === null ? null : String(v).trim() })).filter(x => x.text && x.text.length >= 2);
  const responses = items.map(x => ({ ...x, type: classify(x.text), themes: themesOf(x.text, themes), tokens: tokenize(x.text) }));
  const substantive = responses.filter(r => r.type !== "none");
  const freq = new Map(), bigram = new Map();
  substantive.forEach(r => {
    new Set(r.tokens).forEach(t => freq.set(t, (freq.get(t) || 0) + 1)); // 문서 빈도
    for (let k = 0; k + 1 < r.tokens.length; k++) { const b = `${r.tokens[k]} ${r.tokens[k + 1]}`; bigram.set(b, (bigram.get(b) || 0) + 1); }
  });
  const keywords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([word, n]) => ({ word, n, pct: n / Math.max(1, substantive.length) * 100 }));
  const bigrams = [...bigram.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([pair, n]) => ({ pair, n }));
  const types = { positive: 0, negative: 0, suggestion: 0, neutral: 0, none: 0 };
  responses.forEach(r => { types[r.type]++; });
  const themeStats = themes.map(t => {
    const rs = substantive.filter(r => r.themes.includes(t.id));
    return { id: t.id, name: t.name, n: rs.length, pct: rs.length / Math.max(1, substantive.length) * 100, positive: rs.filter(r => r.type === "positive").length, negative: rs.filter(r => r.type === "negative" || r.type === "suggestion").length };
  }).filter(t => t.n > 0).sort((a, b) => b.n - a.n);
  // 미리 정한 8개 주제 키워드에 하나도 걸리지 않은 응답 — 얼마나 놓치고 있는지 그대로 보여줌(분류 신뢰도 투명성)
  const unclassified = substantive.filter(r => r.themes.length === 0).length;

  // 대표 인용문: 15~150자, 키워드 점수 높은 순, 개인정보 마스킹
  const kwScore = new Map(keywords.map((k, idx) => [k.word, 30 - idx]));
  const isImprove = r => r.type === "negative" || r.type === "suggestion";
  const rank = (list, n) => {
    const seen = new Set();
    return list.filter(r => r.text.length >= 10 && r.text.length <= 150)
      .map(r => ({ r, s: r.tokens.reduce((s, t) => s + (kwScore.get(t) || 0), 0) / Math.sqrt(r.tokens.length || 1) }))
      .sort((a, b) => b.s - a.s)
      .filter(x => { const k = x.r.text.replace(/\s+/g, ""); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, n).map(x => maskPII(x.r.text));
  };
  const pick = type => rank(substantive.filter(r => (type === "improve" ? isImprove(r) : r.type === type)), maxQuotes);
  const themeQuotes = Object.fromEntries(themes.map(t => [t.id, rank(substantive.filter(r => isImprove(r) && r.themes.includes(t.id)), 2)]));

  let byGroup = null;
  if (groups) {
    const names = [...new Set(items.map(x => groups[x.i]).filter(g => g !== null))];
    byGroup = names.map(g => {
      const rs = substantive.filter(r => groups[r.i] === g);
      const f = new Map();
      rs.forEach(r => new Set(r.tokens).forEach(t => f.set(t, (f.get(t) || 0) + 1)));
      return { group: g, n: rs.length, keywords: [...f.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, n]) => ({ word, n })) };
    });
  }

  return {
    nTotal: values.length, nAnswered: items.length, nSubstantive: substantive.length,
    avgLength: items.length ? items.reduce((s, x) => s + x.text.length, 0) / items.length : 0,
    types, keywords, bigrams, themes: themeStats, unclassified,
    quotes: { positive: pick("positive"), improve: pick("improve") }, themeQuotes,
    responses: responses.map(r => ({ text: maskPII(r.text), type: r.type, themes: r.themes })),
    byGroup,
  };
}
