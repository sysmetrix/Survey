// 분석용 설문 테이블: 코드북에 따라 재코딩·정렬된 열 값 제공
import { rawColumn, pairsOf, scaleColumns } from "./codebook.js";
import { recodeColumn } from "./recode.js";
import { matchPrePost } from "./prepost.js";

/**
 * @param {object} dataset
 * @param {object} codebook
 * @param {{exclude?: Set<number>}} [opts]  제외할 분석 행 번호(예: 불성실 응답)
 */
export function buildSurvey(dataset, codebook, opts = {}) {
  const design = codebook.design;
  const cols = codebook.columns;
  const byKey = new Map(cols.map(c => [c.key, c]));
  let matching = null;
  let baseSheet, rowMap; // rowMap[k] = {sheetIndex → 원 행 번호}

  if (design === "prepost-sheets") {
    const [preSi, postSi] = codebook.responseSheets;
    matching = matchPrePost(dataset, codebook);
    baseSheet = postSi;
    const preOfPost = new Map(matching.pairs.map(p => [p.post, p.pre]));
    rowMap = dataset.sheets[postSi].rows.map((_, qi) => ({ [postSi]: qi, [preSi]: preOfPost.has(qi) ? preOfPost.get(qi) : null }));
  } else {
    baseSheet = codebook.responseSheets[0];
    rowMap = dataset.sheets[baseSheet].rows.map((_, i) => ({ [baseSheet]: i }));
  }
  const exclude = opts.exclude || new Set();
  const keep = rowMap.map((_, i) => i).filter(i => !exclude.has(i));
  const rows = keep.map(i => rowMap[i]);
  const n = rows.length;

  const cache = new Map();
  /** 열 재코딩 결과 (분석 행 순서로 정렬) */
  function column(key) {
    if (cache.has(key)) return cache.get(key);
    const col = byKey.get(key);
    if (!col) throw new Error(`열 없음: ${key}`);
    const raw = rawColumn(dataset, col);
    const aligned = rows.map(rm => (rm[col.sheet] === null || rm[col.sheet] === undefined ? null : raw[rm[col.sheet]]));
    const res = { col, ...recodeColumn(col, aligned) };
    cache.set(key, res);
    return res;
  }
  const values = key => column(key).values;

  const ofRole = role => cols.filter(c => c.role === role && (design !== "prepost-sheets" || c.sheet === baseSheet || role === "likert"));
  const scales = scaleColumns(codebook).filter(c => design !== "prepost-sheets" || c.sheet === baseSheet);
  const pairs = pairsOf(codebook).map(p => ({ ...p, preValues: values(p.pre), postValues: values(p.post) }));

  // 불성실 응답(모든 척도 문항 동일값, 3문항 이상 응답)
  const straightLiners = [];
  if (scales.length >= 3) {
    const mats = scales.map(c => values(c.key));
    for (let i = 0; i < n; i++) {
      const v = mats.map(m => m[i]).filter(x => x !== null);
      if (v.length >= 3 && new Set(v).size === 1) straightLiners.push(keep[i]);
    }
  }

  return {
    design, n, codebook, dataset, matching, baseSheet,
    rowIds: keep, column, values,
    scales, demographics: ofRole("demographic"), texts: ofRole("text"), multis: ofRole("multi"),
    nps: ofRole("nps"), numerics: ofRole("numeric"), pairs, straightLiners,
    domains: codebook.domains,
    overall: scales.find(c => c.isOverall) || null,
  };
}
