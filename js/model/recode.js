// 원자료 → 분석값 변환 (결측 null 통일, 라벨→숫자, 범위 밖 값 제거, 역문항, 복수응답 분해)
import { toNum, isBlank } from "../core/util.js";
import { leadingNumber } from "./label-sets.js";

/**
 * 척도/NPS/숫자 열 재코딩
 * @returns {{values:(number|null)[], raw:(number|null)[], invalid:number, missing:number}}
 *   values: 역코딩 반영, raw: 역코딩 전
 */
export function recodeNumeric(col, rawValues) {
  const miss = new Set((col.missingCodes || []).map(s => String(s).trim()));
  const map = col.labelMap || {};
  const min = col.scale?.min, max = col.scale?.max;
  let invalid = 0, missing = 0;
  const raw = rawValues.map(v => {
    if (isBlank(v)) { missing++; return null; }
    const s = String(v).trim();
    if (miss.has(s)) { missing++; return null; }
    let x = Object.prototype.hasOwnProperty.call(map, s) ? map[s] : toNum(v);
    if (x === null || Number.isNaN(x)) x = leadingNumber(s);
    if (x === null || !Number.isFinite(x)) { invalid++; return null; }
    if (col.role !== "numeric" && min !== undefined && (x < min || x > max)) { invalid++; return null; }
    return x;
  });
  const values = col.reverse && min !== undefined ? raw.map(x => (x === null ? null : min + max - x)) : raw;
  return { values, raw, invalid, missing };
}

/** 범주 열: 문자열 또는 null (valueLabels 로 코드→라벨 치환) */
export function recodeCategory(col, rawValues) {
  const miss = new Set((col.missingCodes || []).map(s => String(s).trim()));
  const labels = col.valueLabels || {};
  let missing = 0;
  const values = rawValues.map(v => {
    if (isBlank(v)) { missing++; return null; }
    let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
    if (miss.has(s)) { missing++; return null; }
    if (Object.prototype.hasOwnProperty.call(labels, s)) s = labels[s];
    return s;
  });
  return { values, missing, invalid: 0 };
}

/** 복수응답: 선택지별 0/1 (무응답 행은 null) */
export function recodeMulti(col, rawValues) {
  const delimRe = col.delimiter === ";" ? /;\s*/ : col.delimiter === "|" ? /\|\s*/ : col.delimiter === "\n" ? /\n/ : /,\s*|;\s*|\n/;
  const options = col.options?.length ? col.options : [];
  const known = new Set(options);
  const found = new Set();
  const split = rawValues.map(v => {
    if (isBlank(v)) return null;
    let s = String(v);
    // 쉼표가 들어간 선택지를 먼저 통째로 인식
    const hits = [];
    [...known].filter(o => /,/.test(o)).forEach(o => { if (s.includes(o)) { hits.push(o); s = s.split(o).join(""); } });
    s.split(delimRe).map(t => t.trim()).filter(Boolean).forEach(t => hits.push(t));
    hits.forEach(t => found.add(t));
    return hits;
  });
  const opts = options.length ? [...options, ...[...found].filter(t => !known.has(t)).sort()] : [...found];
  const matrix = opts.map(o => split.map(h => (h === null ? null : h.includes(o) ? 1 : 0)));
  return { options: opts, matrix, answered: split.filter(h => h !== null).length, missing: split.filter(h => h === null).length };
}

/** 열 역할에 따라 재코딩 */
export function recodeColumn(col, rawValues) {
  if (["likert", "nps", "numeric"].includes(col.role)) return { kind: "number", ...recodeNumeric(col, rawValues) };
  if (col.role === "multi") return { kind: "multi", ...recodeMulti(col, rawValues) };
  if (["demographic", "text", "id", "timestamp"].includes(col.role)) return { kind: "string", ...recodeCategory(col, rawValues) };
  return { kind: "none", values: rawValues.map(() => null), missing: rawValues.length, invalid: 0 };
}
