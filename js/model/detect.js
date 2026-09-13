// 열 역할 자동 판별 — 직원이 "데이터 설정" 화면에서 검토·수정하는 초안을 만든다
import { toNum, isBlank } from "../core/util.js";
import { matchLabelSet, leadingNumber } from "./label-sets.js";

export const ROLES = {
  id: "응답자 ID", demographic: "응답자 특성", likert: "척도 문항", nps: "추천의향(NPS)",
  multi: "복수응답", text: "주관식", numeric: "숫자(연속형)", timestamp: "응답일시", ignore: "분석 제외",
};

const TIMESTAMP_RE = /타임스탬프|timestamp|응답\s*일시|제출\s*일시|응답\s*시간|작성\s*일시|제출\s*시간|제출\s*시각|시작\s*시간|완료\s*시간|submitted\s*at|submit\s*date|date\s*submitted|start\s*date|end\s*date|completed\s*at|created\s*at/i;
const ID_RE = /^\s*(id|#|no\.?|번호|순번|연번|학번|참여자\s*(번호|코드|id)|응답자\s*(번호|id)|고유\s*번호|식별\s*번호|관리\s*번호|submission\s*id|respondent\s*id|response\s*id|network\s*id|token|response\s*type)\s*$/i;
const PII_RE = /이름|성명|연락처|전화|휴대|핸드폰|이메일|e-?mail|메일\s*주소|주소|생년월일|카카오/i;
const NPS_RE = /추천/;
const DEMOG_RE = /^\s*(\d+[.)]\s*)?(성별|학년|연령(대)?|나이|지역|거주\s*지역|학교(급|명)?|소속|신분|구분|참여자\s*유형|유형|참여\s*(횟수|경로|기간|회차)|직업|가구\s*형태|학급|반|기수|회차|프로그램(명)?|참여\s*프로그램)\s*$/;
const TEXT_RE = /의견|건의|바라는|좋았던|아쉬운|개선|자유|하고\s*싶은|이유|소감|제안|느낀\s*점|기타/;
const OVERALL_RE = /전반적|전체적|종합\s*만족|총체적|전체\s*만족|전반\s*만족/;
const DATE_VALUE_RE = /^\d{4}[./-]\s?\d{1,2}[./-]\s?\d{1,2}/;

const TIME_WORDS = [
  [/^(사전|참여\s*전|pre)$/i, "pre", false],
  [/^(사후|참여\s*후|post)$/i, "post", false],
  [/^(이전|과거|참여\s*이전)$/i, "pre", true],
  [/^(현재|지금|참여\s*이후)$/i, "post", true],
];
const PREFIX_RE = /^\s*[\[(<【]?\s*(사전|사후|이전|현재|참여\s*전|참여\s*후|pre|post)\s*[\])>】]?\s*[_\-.:·)\s]+(.+)$/i;
const SUFFIX_RE = /^(.+?)\s*(?:[_\-]\s*|\s*[\[(<【]\s*)(사전|사후|이전|현재|pre|post)\s*[\])>】]?\s*$/i;

/** 사전/사후 표기 파싱 */
export function parseTime(header) {
  const h = String(header);
  let m = h.match(PREFIX_RE), word, rest;
  if (m) { word = m[1]; rest = m[2]; }
  else if ((m = h.match(SUFFIX_RE))) { word = m[2]; rest = m[1]; }
  if (!word) return null;
  const w = word.replace(/\s+/g, " ").trim();
  for (const [re, time, retro] of TIME_WORDS) {
    if (re.test(w)) return { time, retrospective: retro, pairKey: normKey(rest) };
  }
  return null;
}

/** 문항 짝 비교용 키 */
export const normKey = s => String(s ?? "").replace(/^\s*(Q|문항|문)?\s*\d+(-\d+)?\s*[.)\]:]\s*/i, "").replace(/[\s?？.,·*]/g, "").toLowerCase();

/** 표시용 짧은 문항명 */
export function shortLabel(header) {
  let h = String(header ?? "").trim();
  const grid = h.match(/^(.*?)\s*\[([^\]]+)\]\s*$/); // 구글폼 그리드 "질문 [행]"
  if (grid && grid[2].trim()) h = grid[2];
  const t = parseTime(h);
  if (t) h = h.match(PREFIX_RE)?.[2] ?? h.match(SUFFIX_RE)?.[1] ?? h;
  h = h.replace(/^\s*(\[필수\]|\*|※)\s*/, "")
    .replace(/^\s*(Q|문항|문)?\s*\d+(-\d+)?\s*[.)\]:]\s*/i, "")
    .replace(/\s*[?？]\s*$/, "")
    .replace(/\s*\*\s*$/, "")
    .trim();
  return h.length > 30 ? h.slice(0, 29) + "…" : h;
}

/** 구글폼 그리드 헤더의 상위 질문 (영역 후보) */
export function gridParent(header) {
  const g = String(header ?? "").match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  return g && g[1].trim() ? g[1].trim().replace(/^\s*(Q|문항|문)?\s*\d+\s*[.)]\s*/i, "") : null;
}

const SCALE_CANDIDATES = [[1, 4], [1, 5], [1, 7], [0, 10], [1, 10]];
function inferScale(min, max) {
  for (const [a, b] of SCALE_CANDIDATES) if (min >= a && max <= b) return { min: a, max: b };
  return { min, max };
}

/**
 * 단일 열 판별
 * @returns {{role, scale?, labelMap?, options?, pii?, confidence:number, reason:string}}
 */
export function detectColumn(header, values) {
  const h = String(header ?? "");
  const nonBlank = values.filter(v => !isBlank(v));
  const n = nonBlank.length;
  if (!n) return { role: "ignore", confidence: 1, reason: "응답 없음" };
  const distinct = new Set(nonBlank.map(v => String(v).trim()));

  if (TIMESTAMP_RE.test(h) || nonBlank.filter(v => v instanceof Date || DATE_VALUE_RE.test(String(v))).length / n >= 0.9) {
    return { role: "timestamp", confidence: 0.95, reason: "응답일시 형식" };
  }
  if (ID_RE.test(h) && distinct.size >= n * 0.9) return { role: "id", confidence: 0.95, reason: "ID 열 이름·고유값" };
  if (PII_RE.test(h)) return { role: "ignore", pii: true, confidence: 0.9, reason: "개인정보 추정 열 (매칭키로 사용 가능)" };

  // 숫자형
  const numsAll = nonBlank.map(toNum);
  const finite = numsAll.filter(v => v !== null && Number.isFinite(v));
  if (finite.length / n >= 0.9) {
    const ints = finite.every(Number.isInteger);
    const min = Math.min(...finite), max = Math.max(...finite);
    const d = new Set(finite).size;
    if (DEMOG_RE.test(h) && d <= 20) return { role: "demographic", confidence: 0.7, reason: "응답자 특성 열 이름(숫자 코드)" };
    if (ints && d <= 11 && min >= 0 && max <= 10) {
      if (NPS_RE.test(h) && (max >= 7 || min === 0)) return { role: "nps", scale: { min: 0, max: 10 }, confidence: 0.85, reason: "추천의향 0~10점" };
      if (d >= 2 || n < 5) return { role: "likert", scale: inferScale(min, max), confidence: 0.8, reason: `정수 ${min}~${max}` };
    }
    if (ID_RE.test(h) || (ints && distinct.size === n && n > 10 && max - min + 1 === n)) return { role: "id", confidence: 0.6, reason: "연속 고유 번호" };
    return { role: "numeric", confidence: 0.6, reason: "연속형 숫자" };
  }

  // 텍스트 라벨 척도
  const ls = matchLabelSet(nonBlank);
  if (ls) {
    const labelMap = Object.fromEntries(ls.map);
    return { role: "likert", scale: { min: ls.set.min, max: ls.set.max }, labelSetId: ls.set.id, labelMap, labelAmbiguous: ls.ambiguous, confidence: ls.ambiguous ? 0.7 : 0.85, reason: `라벨(${ls.set.name}) ${Math.round(ls.coverage * 100)}% 일치${ls.ambiguous ? " · '보통' 응답 없음(4점/5점 확인 필요)" : ""}` };
  }
  const lead = nonBlank.map(leadingNumber);
  if (lead.filter(v => v !== null).length / n >= 0.9 && new Set(lead).size <= 11 && !TEXT_RE.test(h)) {
    const ln = lead.filter(v => v !== null);
    const labelMap = {};
    nonBlank.forEach((v, i) => { if (lead[i] !== null) labelMap[String(v).trim()] = lead[i]; });
    if (NPS_RE.test(h) && Math.max(...ln) >= 7) return { role: "nps", scale: { min: 0, max: 10 }, labelMap, confidence: 0.75, reason: "번호 붙은 추천의향" };
    return { role: "likert", scale: inferScale(Math.min(...ln), Math.max(...ln)), labelMap, confidence: 0.75, reason: "번호가 붙은 보기" };
  }

  // 복수응답
  const withDelim = nonBlank.filter(v => /,\s*|;|\n/.test(String(v))).length;
  if (withDelim / n >= 0.15 && !TEXT_RE.test(h)) {
    const tokens = nonBlank.flatMap(v => String(v).split(/,\s*|;\s*|\n/).map(s => s.trim()).filter(Boolean));
    const tset = new Set(tokens);
    if (tset.size <= 30 && tset.size <= tokens.length * 0.5) {
      return { role: "multi", options: [...tset], delimiter: ",", confidence: 0.7, reason: `구분자 포함 응답 ${Math.round(withDelim / n * 100)}%` };
    }
  }

  const avgLen = nonBlank.reduce((s, v) => s + String(v).length, 0) / n;
  const catLimit = n < 20 ? Math.max(2, Math.ceil(n * 0.6)) : Math.min(20, n * 0.5);
  if (!TEXT_RE.test(h) && distinct.size >= 1 && distinct.size <= catLimit && avgLen <= 20) {
    return { role: "demographic", confidence: DEMOG_RE.test(h) ? 0.9 : 0.7, reason: `범주 ${distinct.size}개` };
  }
  if (avgLen > 5 || TEXT_RE.test(h)) return { role: "text", confidence: 0.8, reason: `평균 ${Math.round(avgLen)}자` };
  return { role: distinct.size <= 20 ? "demographic" : "ignore", confidence: 0.4, reason: "판별 불확실" };
}

/** 척도 범위 조화: 같은 시트 척도 문항 중 가장 흔한 범위로 맞춤 (예: 1~4만 관측된 5점 문항) */
export function harmonizeScales(columns) {
  const likert = columns.filter(c => c.role === "likert" && c.scale && !c.labelSetId);
  const counts = new Map();
  likert.forEach(c => { const k = `${c.scale.min}-${c.scale.max}`; counts.set(k, (counts.get(k) || 0) + 1); });
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!common) return;
  const [cmin, cmax] = common[0].split("-").map(Number);
  likert.forEach(c => {
    if (c.scale.min === cmin && c.scale.max < cmax && c.observedMax !== undefined && c.observedMax <= cmax) c.scale = { min: cmin, max: cmax };
  });
}

export const isOverallHeader = h => OVERALL_RE.test(String(h ?? ""));
