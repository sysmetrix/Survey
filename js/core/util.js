// 공통 유틸리티 (DOM 비의존 — Node 테스트 가능)

/** 결측 판정: null/undefined/빈 문자열/공백 */
export const isBlank = v => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * 셀 값을 숫자로 변환. 결측은 null, 숫자가 아니면 NaN.
 * "4", 4, "4점", "5 (매우 그렇다)", "  3 " → 숫자
 */
export function toNum(v) {
  if (isBlank(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return NaN;
  const s = String(v).trim().replace(/,/g, "");
  if (/^[-+]?\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^([-+]?\d+(?:\.\d+)?)\s*(?:점|\(|\.|\)|$|\s)/);
  return m ? Number(m[1]) : NaN;
}

/** 유효 숫자만 추출 */
export const nums = arr => arr.map(toNum).filter(v => v !== null && !Number.isNaN(v));

/** HTML 텍스트/속성 이스케이프 */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 반올림 (부동소수 보정) */
export function round(x, d = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return x;
  const f = 10 ** d;
  return Math.round((x + Number.EPSILON * Math.sign(x)) * f) / f;
}

/** 고정 소수 문자열 (결측은 "-") */
export const fmt = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x)) ? "-" : round(x, d).toFixed(d);

/** 백분율 문자열 */
export const pct = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x)) ? "-" : round(x, d).toFixed(d) + "%";

/** p값 표기 (p<.001 형식) */
export function fmtP(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return "-";
  if (p < 0.001) return "<.001";
  return p.toFixed(3).replace(/^0/, "");
}

/** 유의성 별표 */
export const stars = p => p === null || !Number.isFinite(p) ? "" : p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "";

/** 문자열 해시 (FNV-1a 32bit, 16진) */
export function hash(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** 시드 고정 난수 (mulberry32) — 데모·샘플 재현용 */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 배열 그룹핑 */
export function groupBy(arr, keyFn) {
  const m = new Map();
  arr.forEach((x, i) => { const k = keyFn(x, i); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return m;
}

/** 중복 제거 (등장 순서 유지) */
export const uniq = arr => [...new Set(arr)];

/** 편집거리 (Levenshtein) */
export function editDistance(a, b) {
  a = String(a); b = String(b);
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 날짜 → "2026. 9. 13.(금)" 형식 (공문서 표기) */
export function koDate(d = new Date()) {
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.(${WEEKDAY[d.getDay()]})`;
}

/** 직접 입력한 작성일에 "(요일)" 붙이기 (이미 있거나 날짜로 읽히지 않으면 그대로) */
export function withWeekday(text) {
  const s = String(text ?? "").trim();
  if (!s || /\([일월화수목금토]\)/.test(s)) return s;
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return s;
  const [y, mo, day] = [+m[1], +m[2], +m[3]];
  const d = new Date(y, mo - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return s;
  return `${s}(${WEEKDAY[d.getDay()]})`;
}

/** 개인정보 마스킹 (전화·이메일·주민번호 형태) */
export function maskPII(text) {
  return String(text ?? "")
    .replace(/\b\d{6}\s*-\s*[1-4]\d{6}\b/g, "******-*******")
    .replace(/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "010-****-****")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "***@***");
}
